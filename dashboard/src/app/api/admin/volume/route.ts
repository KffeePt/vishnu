import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { db } from "@/config/firebase-admin";
import { encryptData, decryptData, sha256Hash } from "@/lib/encryption";
import admin from '@/config/firebase-admin';
import { getAuthDocCached } from "@/lib/sessionAuth";

export async function GET(request: NextRequest) {
  try {
    // Check authentication and owner access
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    // Check if user has owner claim
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (!decodedToken.owner) {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const peekDocId = searchParams.get('peek');
    const masterPassword = searchParams.get('password');

    if (peekDocId && masterPassword) {
      // Peek into specific document
      const docRef = db.collection('udhhmbtc').doc(peekDocId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      const docData = docSnap.data();
      if (!docData) {
        return NextResponse.json({ error: "Document has no data" }, { status: 404 });
      }

      try {
        let decryptedContent;

        if (docData.encryptedData) {
          // For meta-data and auth documents
          decryptedContent = decryptData(docData.encryptedData, masterPassword);
        } else if (docData.chunk) {
          // For chunk documents - show that they contain encrypted chunks
          return NextResponse.json({
            id: docSnap.id,
            decryptedContent: {
              message: "This document contains an encrypted data chunk. Individual chunks cannot be decrypted in isolation - they must be decrypted as part of the complete volume.",
              chunkInfo: {
                chunkLength: docData.chunk.length,
                updatedAt: docData.updatedAt?.toDate?.() || docData.updatedAt
              }
            },
            metadata: {
              type: "data-chunk",
              createdAt: docData.updatedAt?.toDate?.() || docData.updatedAt
            }
          });
        } else {
          return NextResponse.json({
            error: "Document does not contain decryptable data"
          }, { status: 400 });
        }

        return NextResponse.json({
          id: docSnap.id,
          decryptedContent,
          metadata: {
            type: docData.type,
            createdAt: docData.createdAt?.toDate?.() || docData.createdAt,
            dataHash: docData.dataHash
          }
        });
      } catch (decryptError) {
        return NextResponse.json({
          error: "Failed to decrypt - invalid password or corrupted data"
        }, { status: 400 });
      }
    }

    // Field-masked listing: only fetch lightweight metadata fields, not the encrypted blobs.
    // This avoids transferring 90+ large encrypted chunk payloads on every load (quota fix).
    const snapshot = await db.collection('udhhmbtc')
      .select('type', 'createdAt', 'dataHash')
      .get();
    const documents = [];
    let totalDataSize = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      // Approximate size not available with select() — use a fixed estimate per doc
      const docSize = 512; // conservative estimate per metadata-only doc
      totalDataSize += docSize;

      documents.push({
        id: doc.id,
        type: data.type,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        dataHash: data.dataHash,
        size: docSize,
      });
    }

    // Separate metadata from data chunks
    const metadataDocs = documents.filter(doc => doc.id === 'meta-data' || doc.id === 'auth');
    const dataChunks = documents.filter(doc => !metadataDocs.find(m => m.id === doc.id));

    // Convert bytes to appropriate units
    const formatDataSize = (bytes: number) => {
      const units = ['B', 'KiB', 'MiB', 'GiB'];
      let size = bytes;
      let unitIndex = 0;

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }

      return {
        value: Math.round(size * 100) / 100,
        unit: units[unitIndex]
      };
    };

    const dataSize = formatDataSize(totalDataSize);

    return NextResponse.json({
      totalChunks: dataChunks.length,
      metadataDocs: metadataDocs.length,
      documents: documents,
      dataUsage: dataSize,
      summary: {
        totalDocuments: documents.length,
        dataChunks: dataChunks.length,
        metadataDocuments: metadataDocs.length,
        totalDataSize: totalDataSize
      }
    });
  } catch (error) {
    console.error("Error fetching volume data:", error);
    return NextResponse.json({ error: "Failed to fetch volume data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication and owner access
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    // Check if user has owner claim
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (!decodedToken.owner) {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }

    const { action, masterPassword, newMasterPassword, confirmNewMasterPassword } = await request.json();

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    switch (action) {
      case 'reset-volume-data':
        return await handleResetVolumeData(masterPassword);
      case 'reset-collections':
        return await handleResetCollections();
      case 'change-master-password':
        return await handleChangeMasterPassword(masterPassword, newMasterPassword, confirmNewMasterPassword);
      case 'decrypt-all':
        return await handleDecryptAll(masterPassword);
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error in volume POST:", error);
    return NextResponse.json({ error: "Failed to process volume operation" }, { status: 500 });
  }
}

async function handleResetVolumeData(masterPassword?: string) {
  try {
    if (!masterPassword) {
      return NextResponse.json({ error: "Master password is required" }, { status: 400 });
    }

    // Verify master password (cached — avoids quota hit during volume tests)
    const authDoc = await getAuthDocCached();
    if (!authDoc.exists) {
      return NextResponse.json({ error: "Master password not set" }, { status: 400 });
    }
    const authData = authDoc.data();
    try {
      const decryptedTest = decryptData(authData!.encryptedData, masterPassword);
      if (decryptedTest !== 'master_password_valid') {
        throw new Error('Invalid');
      }
    } catch (error) {
      return NextResponse.json({ error: 'Invalid master password' }, { status: 401 });
    }

    // Get all documents except auth
    const snapshot = await db.collection('udhhmbtc').get();
    const batch = db.batch();

    snapshot.docs.forEach(doc => {
      if (doc.id !== 'auth') {
        batch.delete(doc.ref);
      }
    });

    await batch.commit();

    // Delete additional collections for full wipe data
    for (const col of ['users', 'staff', 'staff-data']) {
      const colSnapshot = await db.collection(col).get();
      if (!colSnapshot.empty) {
        // recursiveDelete safely chunks >500 limits and handles subcollections
        await db.recursiveDelete(db.collection(col));
      }
    }

    return NextResponse.json({
      message: "Volume data, users, and staff reset successfully. Auth document preserved."
    });
  } catch (error) {
    console.error("Error resetting volume data:", error);
    return NextResponse.json({ error: "Failed to reset volume data" }, { status: 500 });
  }
}

async function handleResetCollections() {
  try {
    const allCollections = await db.listCollections();
    const protectedCollections = ['app-config', 'assistant-config', 'public', 'whitelist'];
    const collectionsToProcess = allCollections.filter(col => !protectedCollections.includes(col.id));

    for (const collectionRef of collectionsToProcess) {
      try {
        const snapshot = await collectionRef.get();
        if (!snapshot.empty) {
          // recursiveDelete safely chunks >500 limits and handles subcollections
          await db.recursiveDelete(collectionRef);
        }
      } catch (colError) {
        console.error(`Error clearing ${collectionRef.id}:`, colError);
      }
    }

    return NextResponse.json({
      message: "Database nuked completely. Only core configurations remain."
    });
  } catch (error) {
    console.error("Error resetting collections:", error);
    return NextResponse.json({ error: "Failed to reset collections" }, { status: 500 });
  }
}

async function handleChangeMasterPassword(masterPassword?: string, newMasterPassword?: string, confirmNewMasterPassword?: string) {
  try {
    if (!masterPassword || !newMasterPassword || !confirmNewMasterPassword) {
      return NextResponse.json({ error: "Current password, new password, and confirmation are required" }, { status: 400 });
    }

    if (newMasterPassword !== confirmNewMasterPassword) {
      return NextResponse.json({ error: "New master password confirmation does not match" }, { status: 400 });
    }

    if (newMasterPassword.length < 12) {
      return NextResponse.json({ error: "New master password must be at least 12 characters long" }, { status: 400 });
    }

    if (masterPassword === newMasterPassword) {
      return NextResponse.json({ error: "New password must be different from current password" }, { status: 400 });
    }

    // Verify current master password and decrypt all data (cached)
    const authDoc = await getAuthDocCached();
    if (!authDoc.exists) {
      return NextResponse.json({ error: "Master password not set" }, { status: 400 });
    }
    const authData = authDoc.data();

    let currentData: { sales: any[]; products: any[] } = { sales: [], products: [] };
    let hasExistingData = false;

    try {
      const decryptedTest = decryptData(authData!.encryptedData, masterPassword);
      if (decryptedTest !== 'master_password_valid') {
        throw new Error('Invalid');
      }

      // Try to get existing data
      const metaDoc = await db.collection('udhhmbtc').doc('meta-data').get();
      if (metaDoc.exists) {
        const meta = metaDoc.data();
        const decryptedMeta = decryptData({ encryptedData: meta!.encryptedData, salt: meta!.salt, iv: meta!.iv, authTag: meta!.authTag }, masterPassword);
        const chunkIds = decryptedMeta.chunkIds;

        // Get all chunks
        const chunks = [];
        for (const chunkId of chunkIds) {
          const chunkDoc = await db.collection('udhhmbtc').doc(chunkId).get();
          if (chunkDoc.exists) {
            chunks.push(chunkDoc.data()!.chunk);
          }
        }

        const encryptedDataStr = chunks.join('');
        currentData = decryptData({ encryptedData: encryptedDataStr, salt: decryptedMeta.salt, iv: decryptedMeta.iv, authTag: decryptedMeta.authTag }, masterPassword);
        hasExistingData = true;
      }
    } catch (error) {
      return NextResponse.json({ error: 'Invalid current master password' }, { status: 401 });
    }

    // Re-encrypt everything with new password
    const batch = db.batch();

    // Update auth document with new password
    const newAuthData = encryptData('master_password_valid', newMasterPassword);
    batch.set(db.collection('udhhmbtc').doc('auth'), {
      encryptedData: newAuthData.encryptedData,
      updatedAt: new Date(),
    });

    if (hasExistingData) {
      // Re-encrypt existing data with new password
      const crypto = await import('crypto');
      const encryptedObj = encryptData(currentData, newMasterPassword);
      const dataHash = sha256Hash(JSON.stringify(currentData));

      // Split encryptedData into chunks of ~1MB
      const chunkSize = 1024 * 1024; // 1MB
      const encryptedDataStr = encryptedObj.encryptedData;
      const chunks = [];
      for (let i = 0; i < encryptedDataStr.length; i += chunkSize) {
        chunks.push(encryptedDataStr.slice(i, i + chunkSize));
      }

      // Create new meta
      const newMeta = {
        chunkCount: chunks.length,
        salt: encryptedObj.salt,
        iv: encryptedObj.iv,
        authTag: encryptedObj.authTag,
        chunkIds: chunks.map(() => crypto.randomUUID()),
        dataHash,
      };
      const newEncryptedMeta = encryptData(newMeta, newMasterPassword);

      // Store new meta-data
      batch.set(db.collection('udhhmbtc').doc('meta-data'), {
        encryptedData: newEncryptedMeta.encryptedData,
        salt: newEncryptedMeta.salt,
        iv: newEncryptedMeta.iv,
        authTag: newEncryptedMeta.authTag,
        updatedAt: new Date(),
      });

      // Store new chunks
      for (let i = 0; i < chunks.length; i++) {
        batch.set(db.collection('udhhmbtc').doc(newMeta.chunkIds[i]), {
          chunk: chunks[i],
          updatedAt: new Date(),
        });
      }

      // Delete old chunks (except meta-data and auth which we overwrite)
      const oldSnapshot = await db.collection('udhhmbtc').get();
      oldSnapshot.docs.forEach(doc => {
        if (doc.id !== 'auth' && doc.id !== 'meta-data' && !newMeta.chunkIds.includes(doc.id as any)) {
          batch.delete(doc.ref);
        }
      });
    }

    await batch.commit();

    return NextResponse.json({
      message: hasExistingData
        ? "Master password changed successfully. All data re-encrypted with new password."
        : "Master password changed successfully. No existing data to re-encrypt."
    });
  } catch (error) {
    console.error("Error changing master password:", error);
    return NextResponse.json({ error: "Failed to change master password" }, { status: 500 });
  }
}

async function handleDecryptAll(masterPassword?: string) {
  try {
    if (!masterPassword) {
      return NextResponse.json({ error: "Master password is required" }, { status: 400 });
    }

    // Verify master password and decrypt all data (cached)
    const authDoc = await getAuthDocCached();
    if (!authDoc.exists) {
      return NextResponse.json({ error: "Master password not set" }, { status: 400 });
    }
    const authData = authDoc.data();

    // Try to get existing data
    const metaDoc = await db.collection('udhhmbtc').doc('meta-data').get();
    if (!metaDoc.exists) {
      return NextResponse.json({ data: {} });
    }

    const decryptedTest = decryptData(authData!.encryptedData, masterPassword);
    if (decryptedTest !== 'master_password_valid') {
      throw new Error('Invalid');
    }

    const meta = metaDoc.data();
    const decryptedMeta = decryptData({ encryptedData: meta!.encryptedData, salt: meta!.salt, iv: meta!.iv, authTag: meta!.authTag }, masterPassword);
    const chunkIds = decryptedMeta.chunkIds;

    // Get all chunks
    const chunks = [];
    for (const chunkId of chunkIds) {
      const chunkDoc = await db.collection('udhhmbtc').doc(chunkId).get();
      if (chunkDoc.exists) {
        chunks.push(chunkDoc.data()!.chunk);
      }
    }

    const encryptedDataStr = chunks.join('');
    const currentData = decryptData({ encryptedData: encryptedDataStr, salt: decryptedMeta.salt, iv: decryptedMeta.iv, authTag: decryptedMeta.authTag }, masterPassword);

    return NextResponse.json({ data: currentData });
  } catch (error) {
    console.error("Error decrypting all volume data:", error);
    return NextResponse.json({ error: "Failed to decrypt volume data" }, { status: 401 });
  }
}