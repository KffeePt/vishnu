import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { encryptData, decryptData } from '@/lib/encryption';
import crypto from 'crypto';
import { MasterPasswordSchema } from '@/zod_schemas/user-related';
import { Timestamp } from 'firebase-admin/firestore';
import { getAuthDocCached, clearAuthDocCache } from '@/lib/sessionAuth';

export async function POST(request: NextRequest) {
  try {
    // Check authentication and owner access
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult; // Return error response if authentication fails
    }

    // Get the authorization header to verify token for owner access
    const authHeader = request.headers.get('authorization');
    const token = authHeader!.split('Bearer ')[1];
    const decodedToken = await require('firebase-admin').auth().verifyIdToken(token);

    // Only owner can set master password
    if (!decodedToken.owner || decodedToken.owner !== true) {
      return NextResponse.json(
        { error: 'Forbidden - Only owner can set master password' },
        { status: 403 }
      );
    }

    const { password, confirmPassword } = await request.json();

    // Validate inputs
    if (!password || !confirmPassword) {
      return NextResponse.json(
        { error: 'Master password and confirmation are required' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Master password confirmation does not match' },
        { status: 400 }
      );
    }

    if (password.length < 12) {
      return NextResponse.json(
        { error: 'Master password must be at least 12 characters long' },
        { status: 400 }
      );
    }

    // Encrypt the test data
    const testData = encryptData('master_password_valid', password);

    // Initialize encrypted volume
    const initialData = { sales: [], products: [] };
    const encryptedObj = encryptData(initialData, password);

    // Create encrypted metadata
    const metaData = {
      chunkCount: 1,
      salt: encryptedObj.salt,
      iv: encryptedObj.iv,
      authTag: encryptedObj.authTag,
      chunkIds: [crypto.randomUUID()], // random UUID for the chunk
    };
    const encryptedMeta = encryptData(metaData, password);

    // Store in udhhmbtc collection
    const batch = db.batch();
    batch.set(db.collection('udhhmbtc').doc('auth'), {
      encryptedData: testData,
      setBy: decodedToken.uid,
      setAt: Timestamp.fromDate(new Date()),
      isValid: true,
    });
    batch.set(db.collection('udhhmbtc').doc('meta-data'), {
      encryptedData: encryptedMeta.encryptedData,
      salt: encryptedMeta.salt,
      iv: encryptedMeta.iv,
      authTag: encryptedMeta.authTag,
      createdAt: Timestamp.fromDate(new Date()),
    });
    batch.set(db.collection('udhhmbtc').doc(metaData.chunkIds[0]), {
      chunk: encryptedObj.encryptedData,
      createdAt: Timestamp.fromDate(new Date()),
    });
    await batch.commit();
    clearAuthDocCache();

    return NextResponse.json({
      message: 'Master password set successfully',
      setAt: new Date().toISOString(),
      setBy: decodedToken.uid,
    });

  } catch (error: any) {
    console.error('Error setting master password:', error);
    return NextResponse.json(
      { error: 'Failed to set master password' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Check authentication and owner access
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult; // Return error response if authentication fails
    }

    // Get the authorization header to verify token for owner access
    const authHeader = request.headers.get('authorization');
    const token = authHeader!.split('Bearer ')[1];
    const decodedToken = await require('firebase-admin').auth().verifyIdToken(token);

    // Only owner can change master password
    if (!decodedToken.owner || decodedToken.owner !== true) {
      return NextResponse.json(
        { error: 'Forbidden - Only owner can change master password' },
        { status: 403 }
      );
    }

    const { currentPassword, newPassword, confirmNewPassword } = await request.json();

    // Validate inputs
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return NextResponse.json(
        { error: 'Current password, new password, and confirmation are required' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmNewPassword) {
      return NextResponse.json(
        { error: 'New master password confirmation does not match' },
        { status: 400 }
      );
    }

    if (newPassword.length < 12) {
      return NextResponse.json(
        { error: 'New master password must be at least 12 characters long' },
        { status: 400 }
      );
    }

    // Get current auth data from udhhmbtc collection (cached)
    const currentMasterPasswordDoc = await getAuthDocCached();

    if (!currentMasterPasswordDoc.exists) {
      return NextResponse.json(
        { error: 'Master password not set - use POST to set initial password' },
        { status: 404 }
      );
    }

    const currentMasterPassword = currentMasterPasswordDoc.data();

    // Verify current password by decrypting the test data
    try {
      const decryptedTest = decryptData(currentMasterPassword!.encryptedData, currentPassword);
      if (decryptedTest !== 'master_password_valid') {
        throw new Error('Invalid');
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Current master password is incorrect' },
        { status: 401 }
      );
    }

    console.log('Starting password change process for udhhmbtc collection...');

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
    // Update auth with new password
    const newEncryptedTest = encryptData('master_password_valid', newPassword);
    batch.set(db.collection('udhhmbtc').doc('auth'), {
      encryptedData: newEncryptedTest,
      setBy: decodedToken.uid,
      setAt: Timestamp.fromDate(new Date()),
      isValid: true,
    });

    // Commit all changes and clear cache
    await batch.commit();
    clearAuthDocCache();

    console.log(`Successfully re-encrypted volume with ${newChunks.length} chunks`);

    // Option 3: Device-Bound Key Wrapping
    // Re-wrap the new MP for all passkeys and TOTP so they remain valid
    try {
      const { wrapForAllPasskeys, wrapForTotp } = require('@/lib/mp-wrap');
      await Promise.all([
        wrapForAllPasskeys(newPassword, decodedToken.uid),
        wrapForTotp(newPassword, decodedToken.uid)
      ]);
    } catch (wrapErr) {
      console.error('Failed to re-wrap MP blobs after password change:', wrapErr);
      // Non-fatal, admin can just log in manually again to backfill
    }

    return NextResponse.json({
      message: 'Master password changed successfully. All data has been re-encrypted.',
      newChunkCount: newChunks.length,
      oldChunkCount: chunkIds.length
    });

  } catch (error: any) {
    console.error('Error changing master password:', error);
    return NextResponse.json(
      { error: 'Failed to change master password' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication and admin/owner access
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult; // Return error response if authentication fails
    }

    // Check if master password is set in udhhmbtc collection (cached)
    const masterPasswordDoc = await getAuthDocCached();

    if (!masterPasswordDoc.exists) {
      return NextResponse.json({
        isSet: false,
        message: 'Master password not set',
      });
    }

    const masterPassword = masterPasswordDoc.data();
    return NextResponse.json({
      isSet: true,
      setAt: masterPassword!.setAt?.toDate?.()?.toISOString() || masterPassword!.setAt,
      setBy: masterPassword!.setBy,
      isValid: masterPassword!.isValid,
    });

  } catch (error: any) {
    console.error('Error checking master password:', error);
    return NextResponse.json(
      { error: 'Failed to check master password status' },
      { status: 500 }
    );
  }
}
