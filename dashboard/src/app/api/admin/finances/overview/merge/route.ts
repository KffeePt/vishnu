import { db, admin } from "@/config/firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { decryptData, encryptData, sha256Hash } from "@/lib/encryption";
import { validateSession } from '@/lib/sessionAuth';
import crypto from 'crypto';

async function decryptVolume(masterPassword: string) {
  // Get metadata
  const metaDoc = await db.collection('udhhmbtc').doc('meta-data').get();
  if (!metaDoc.exists) {
    throw new Error('Volume not found');
  }

  const meta = metaDoc.data()!;
  const decryptedMeta = decryptData({
    encryptedData: meta.encryptedData,
    salt: meta.salt,
    iv: meta.iv,
    authTag: meta.authTag
  }, masterPassword);

  const { chunkIds } = decryptedMeta;

  // Get all chunks
  const chunks: string[] = [];
  for (const chunkId of chunkIds) {
    const chunkDoc = await db.collection('udhhmbtc').doc(chunkId).get();
    if (!chunkDoc.exists) {
      throw new Error(`Missing chunk: ${chunkId}`);
    }
    chunks.push(chunkDoc.data()!.chunk);
  }

  // Combine chunks
  const encryptedDataStr = chunks.join('');

  // Decrypt the content
  const content = decryptData({
    encryptedData: encryptedDataStr,
    salt: decryptedMeta.salt,
    iv: decryptedMeta.iv,
    authTag: decryptedMeta.authTag
  }, masterPassword);

  return content;
}

async function saveVolume(content: any, masterPassword: string) {
  // Encrypt the content
  const encryptedObj = encryptData(content, masterPassword);
  const dataHash = sha256Hash(JSON.stringify(content));

  // Split into chunks (1MB each)
  const chunkSize = 1024 * 1024;
  const chunks: string[] = [];
  for (let i = 0; i < encryptedObj.encryptedData.length; i += chunkSize) {
    chunks.push(encryptedObj.encryptedData.slice(i, i + chunkSize));
  }

  // Get current metadata to get old chunk IDs
  const metaDoc = await db.collection('udhhmbtc').doc('meta-data').get();
  let oldChunkIds: string[] = [];
  if (metaDoc.exists) {
    const meta = metaDoc.data()!;
    const decryptedMeta = decryptData({
      encryptedData: meta.encryptedData,
      salt: meta.salt,
      iv: meta.iv,
      authTag: meta.authTag
    }, masterPassword);
    oldChunkIds = decryptedMeta.chunkIds || [];
  }

  // Create new metadata
  const newMeta = {
    chunkCount: chunks.length,
    salt: encryptedObj.salt,
    iv: encryptedObj.iv,
    authTag: encryptedObj.authTag,
    chunkIds: chunks.map(() => crypto.randomUUID()),
    dataHash,
  };
  const encryptedMeta = encryptData(newMeta, masterPassword);

  // Batch update
  const batch = db.batch();

  // Delete old chunks
  for (const chunkId of oldChunkIds) {
    batch.delete(db.collection('udhhmbtc').doc(chunkId));
  }

  // Set new chunks
  for (let i = 0; i < chunks.length; i++) {
    batch.set(db.collection('udhhmbtc').doc(newMeta.chunkIds[i]), {
      chunk: chunks[i],
      createdAt: new Date(),
    });
  }

  // Update metadata
  batch.set(db.collection('udhhmbtc').doc('meta-data'), {
    encryptedData: encryptedMeta.encryptedData,
    salt: encryptedMeta.salt,
    iv: encryptedMeta.iv,
    authTag: encryptedMeta.authTag,
    updatedAt: new Date(),
  });

  await batch.commit();
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication and admin/owner access
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    // Check for owner access specifically
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (!decodedToken.owner || decodedToken.owner !== true) {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    const sessionToken = request.headers.get('x-master-password-session') || '';

    const sessionValidation = await validateSession(sessionToken);
    if (!sessionValidation.isValid) {
      return NextResponse.json({ error: sessionValidation.error }, { status: sessionValidation.status });
    }
    const masterPassword = sessionValidation.masterPassword;

    const { sourceBranch, targetBranch } = await request.json();

    if (!sourceBranch || !targetBranch) {
      return NextResponse.json({ error: 'Source and target branches required' }, { status: 400 });
    }

    if (sourceBranch !== 'preview' || targetBranch !== 'main') {
      return NextResponse.json({ error: 'Only preview to main merge is supported' }, { status: 400 });
    }

    // Verify master password by decrypting auth data
    const authDoc = await db.collection('udhhmbtc').doc('auth').get();
    if (!authDoc.exists) {
      return NextResponse.json({ error: 'Master password not set' }, { status: 400 });
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

    // Decrypt volume
    const content = await decryptVolume(masterPassword);

    // Migrate old structure to new branch structure if needed
    if (!content.branches) {
      content.branches = {
        main: {
          sales: content.sales || [],
          expenses: content.expenses || []
        },
        preview: {
          sales: [],
          expenses: []
        }
      };
      delete content.sales;
      delete content.expenses;
    }

    // Merge preview data to main
    const previewSales = content.branches.preview.sales || [];
    const previewExpenses = content.branches.preview.expenses || [];

    // Add all preview data to main
    content.branches.main.sales = content.branches.main.sales || [];
    content.branches.main.expenses = content.branches.main.expenses || [];

    // Add preview sales to main (avoiding duplicates by ID)
    for (const sale of previewSales) {
      const existingIndex = content.branches.main.sales.findIndex((s: any) => s.id === sale.id);
      if (existingIndex === -1) {
        content.branches.main.sales.push(sale);
      }
    }

    // Add preview expenses to main (avoiding duplicates by ID)
    for (const expense of previewExpenses) {
      const existingIndex = content.branches.main.expenses.findIndex((e: any) => e.id === expense.id);
      if (existingIndex === -1) {
        content.branches.main.expenses.push(expense);
      }
    }

    // Clear preview branch
    content.branches.preview.sales = [];
    content.branches.preview.expenses = [];

    // Save the updated volume
    await saveVolume(content, masterPassword);

    return NextResponse.json({
      message: `Successfully merged ${previewSales.length} sales and ${previewExpenses.length} expenses from preview to main`,
      mergedCounts: {
        sales: previewSales.length,
        expenses: previewExpenses.length
      }
    });
  } catch (error) {
    console.error("Error merging branches:", error);
    return NextResponse.json({ error: "Failed to merge branches" }, { status: 500 });
  }
}