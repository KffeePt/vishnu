import { db } from "@/config/firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { requireSessionAuth } from "@/lib/sessionAuth";
import { encryptData, decryptData } from "@/lib/encryption";
import crypto from 'crypto';
import { clearAuthDocCache } from "@/lib/sessionAuth";

export async function POST(request: NextRequest) {
  try {
    // Check authentication and owner access only
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    // Check if user is owner (not admin)
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.split(' ')[1];

    const decodedToken = await require('firebase-admin').auth().verifyIdToken(idToken);
    if (!decodedToken.owner) {
      return NextResponse.json({ error: "Only owners can perform this operation" }, { status: 403 });
    }

    // Check master password session
    const sessionResult = await requireSessionAuth(request);
    if (sessionResult) {
      return sessionResult;
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current password and new password are required" }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({ error: "New password must be different from current password" }, { status: 400 });
    }

    // Get current auth data - since they have a valid master password session,
    // we can trust their provided currentPassword. The real validation will happen during decryption.
    const masterPasswordDoc = await db.collection('udhhmbtc').doc('auth').get();
    if (!masterPasswordDoc.exists) {
      return NextResponse.json({ error: "Master password not set" }, { status: 400 });
    }

    console.log('Starting password change process...');

    // Get current meta-data
    const metaDoc = await db.collection('udhhmbtc').doc('meta-data').get();
    if (!metaDoc.exists) {
      return NextResponse.json({ error: "No meta-data found" }, { status: 400 });
    }
    const meta = metaDoc.data();
    const decryptedMeta = decryptData({ encryptedData: meta!.encryptedData, salt: meta!.salt, iv: meta!.iv, authTag: meta!.authTag }, currentPassword);
    const chunkIds = decryptedMeta.chunkIds;

    // Get all chunks
    const chunks = [];
    for (const chunkId of chunkIds) {
      const chunkDoc = await db.collection('udhhmbtc').doc(chunkId).get();
      if (chunkDoc.exists) {
        chunks.push(chunkDoc.data()!.chunk);
      }
    }

    // Decrypt the data
    const encryptedDataStr = chunks.join('');
    const data = decryptData({ encryptedData: encryptedDataStr, salt: decryptedMeta.salt, iv: decryptedMeta.iv, authTag: decryptedMeta.authTag }, currentPassword);

    // Encrypt with new password
    const newEncryptedObj = encryptData(data, newPassword);

    // Split into new chunks
    const chunkSize = 1024 * 1024; // 1MB
    const newChunks = [];
    for (let i = 0; i < newEncryptedObj.encryptedData.length; i += chunkSize) {
      newChunks.push(newEncryptedObj.encryptedData.slice(i, i + chunkSize));
    }

    // Create new meta
    const newMeta = {
      chunkCount: newChunks.length,
      salt: newEncryptedObj.salt,
      iv: newEncryptedObj.iv,
      authTag: newEncryptedObj.authTag,
      chunkIds: newChunks.map(() => crypto.randomUUID()),
    };
    const newEncryptedMeta = encryptData(newMeta, newPassword);

    // Update documents
    const batch = db.batch();
    // Delete old chunks
    for (const chunkId of chunkIds) {
      batch.delete(db.collection('udhhmbtc').doc(chunkId));
    }
    // Set new chunks
    for (let i = 0; i < newChunks.length; i++) {
      batch.set(db.collection('udhhmbtc').doc(newMeta.chunkIds[i]), {
        chunk: newChunks[i],
        updatedAt: new Date(),
      });
    }
    // Update meta-data
    batch.set(db.collection('udhhmbtc').doc('meta-data'), {
      encryptedData: newEncryptedMeta.encryptedData,
      salt: newEncryptedMeta.salt,
      iv: newEncryptedMeta.iv,
      authTag: newEncryptedMeta.authTag,
      updatedAt: new Date(),
    });
    // Update auth
    const newEncryptedTest = encryptData('master_password_valid', newPassword);
    batch.set(db.collection('udhhmbtc').doc('auth'), {
      encryptedData: newEncryptedTest,
      setBy: decodedToken.uid,
      setAt: new Date(),
      isValid: true,
    });

    // Commit all changes and clear the cache
    await batch.commit();
    clearAuthDocCache();

    console.log(`Successfully re-encrypted volume with ${newChunks.length} chunks`);

    return NextResponse.json({
      message: "Master password changed successfully. All data has been re-encrypted.",
      newChunkCount: newChunks.length,
      oldChunkCount: chunkIds.length
    });
  } catch (error) {
    console.error("Error changing master password:", error);
    return NextResponse.json({ error: "Failed to change master password" }, { status: 500 });
  }
}
