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

export async function GET(request: NextRequest) {
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

    // 1. Try Session Authentication (Preferred)
    let masterPassword = '';
    const sessionToken = request.headers.get('x-master-password-session');

    if (sessionToken) {
      const sessionData = await validateSession(sessionToken, decodedToken.uid);
      if (sessionData && sessionData.encryptedMasterPassword) {
        try {
          // Decrypt master password using the session token as key
          masterPassword = decryptData(sessionData.encryptedMasterPassword, sessionToken);
        } catch (e) {
          console.error("Failed to decrypt master password from session", e);
        }
      }
    }



    if (!masterPassword) {
      return NextResponse.json({ error: 'Master password required (via session or header)' }, { status: 400 });
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

    // Return expenses
    return NextResponse.json({
      expenses: content.expenses || []
    });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
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

    // 1. Try Session Authentication (Preferred)
    let masterPassword = '';
    const sessionToken = request.headers.get('x-master-password-session');

    if (sessionToken) {
      const sessionData = await validateSession(sessionToken, decodedToken.uid);
      if (sessionData && sessionData.encryptedMasterPassword) {
        try {
          // Decrypt master password using the session token as key
          masterPassword = decryptData(sessionData.encryptedMasterPassword, sessionToken);
        } catch (e) {
          console.error("Failed to decrypt master password from session", e);
        }
      }
    }



    if (!masterPassword) {
      return NextResponse.json({ error: 'Master password required' }, { status: 400 });
    }

    const { description, amount, category, date } = await request.json();

    if (!description || !amount || !category) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get auth document to verify master password
    const authDoc = await db.collection('udhhmbtc').doc('auth').get();
    if (!authDoc.exists) {
      return NextResponse.json({ error: "Master password not set" }, { status: 400 });
    }

    const authData = authDoc.data()!;

    // Verify the password by decrypting the auth data
    try {
      const decryptedTest = decryptData(authData.encryptedData, masterPassword);
      if (decryptedTest !== 'master_password_valid') {
        return NextResponse.json({ error: "Invalid master password" }, { status: 401 });
      }
    } catch (error) {
      return NextResponse.json({ error: "Invalid master password" }, { status: 401 });
    }

    // Decrypt current volume
    const content = await decryptVolume(masterPassword);

    // Add new expense
    const newExpense = {
      id: Date.now().toString(),
      description,
      amount: parseFloat(amount),
      category,
      date: date ? new Date(date) : new Date(),
      recordedBy: decodedToken.uid,
      createdAt: new Date(),
    };

    content.expenses = content.expenses || [];
    content.expenses.push(newExpense);

    // Save the updated volume
    await saveVolume(content, masterPassword);

    return NextResponse.json({
      message: "Expense recorded successfully",
      expense: newExpense,
    });
  } catch (error) {
    console.error("Error saving expense:", error);
    return NextResponse.json({ error: "Failed to save expense" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Check for owner access
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (!decodedToken.owner || decodedToken.owner !== true) {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    // 1. Try Session Authentication (Preferred)
    let masterPassword = '';
    const sessionToken = request.headers.get('x-master-password-session');

    if (sessionToken) {
      const sessionData = await validateSession(sessionToken, decodedToken.uid);
      if (sessionData && sessionData.encryptedMasterPassword) {
        try {
          // Decrypt master password using the session token as key
          masterPassword = decryptData(sessionData.encryptedMasterPassword, sessionToken);
        } catch (e) {
          console.error("Failed to decrypt master password from session", e);
        }
      }
    }



    if (!masterPassword) {
      return NextResponse.json({ error: 'Master password required' }, { status: 400 });
    }

    const url = new URL(request.url);
    const expenseId = url.searchParams.get('id');
    if (!expenseId) {
      return NextResponse.json({ error: 'Expense ID required' }, { status: 400 });
    }

    const { description, amount, category, date } = await request.json();

    // Verify master password
    const authDoc = await db.collection('udhhmbtc').doc('auth').get();
    if (!authDoc.exists) {
      return NextResponse.json({ error: "Master password not set" }, { status: 400 });
    }

    const authData = authDoc.data()!;
    try {
      const decryptedTest = decryptData(authData.encryptedData, masterPassword);
      if (decryptedTest !== 'master_password_valid') {
        return NextResponse.json({ error: "Invalid master password" }, { status: 401 });
      }
    } catch (error) {
      return NextResponse.json({ error: "Invalid master password" }, { status: 401 });
    }

    // Decrypt current volume
    const content = await decryptVolume(masterPassword);

    // Find and update the expense
    if (!content.expenses || !Array.isArray(content.expenses)) {
      return NextResponse.json({ error: 'No expenses data found' }, { status: 404 });
    }

    const expenseIndex = content.expenses.findIndex((expense: any) => expense.id === expenseId);
    if (expenseIndex === -1) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    // Update the expense
    content.expenses[expenseIndex] = {
      ...content.expenses[expenseIndex],
      description: description || content.expenses[expenseIndex].description,
      amount: amount ? parseFloat(amount) : content.expenses[expenseIndex].amount,
      category: category || content.expenses[expenseIndex].category,
      date: date ? new Date(date) : content.expenses[expenseIndex].date,
    };

    // Save the updated volume
    await saveVolume(content, masterPassword);

    return NextResponse.json({
      message: "Expense updated successfully",
      expense: content.expenses[expenseIndex],
    });
  } catch (error) {
    console.error("Error updating expense:", error);
    return NextResponse.json({ error: "Failed to update expense" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check for owner access
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (!decodedToken.owner || decodedToken.owner !== true) {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    // 1. Try Session Authentication (Preferred)
    let masterPassword = '';
    const sessionToken = request.headers.get('x-master-password-session');

    if (sessionToken) {
      const sessionData = await validateSession(sessionToken, decodedToken.uid);
      if (sessionData && sessionData.encryptedMasterPassword) {
        try {
          // Decrypt master password using the session token as key
          masterPassword = decryptData(sessionData.encryptedMasterPassword, sessionToken);
        } catch (e) {
          console.error("Failed to decrypt master password from session", e);
        }
      }
    }



    if (!masterPassword) {
      return NextResponse.json({ error: 'Master password required' }, { status: 400 });
    }

    // Get expense ID from URL
    const url = new URL(request.url);
    const expenseId = url.searchParams.get('id');
    if (!expenseId) {
      return NextResponse.json({ error: 'Expense ID required' }, { status: 400 });
    }

    // Verify master password
    const authDoc = await db.collection('udhhmbtc').doc('auth').get();
    if (!authDoc.exists) {
      return NextResponse.json({ error: "Master password not set" }, { status: 400 });
    }

    const authData = authDoc.data()!;
    try {
      const decryptedTest = decryptData(authData.encryptedData, masterPassword);
      if (decryptedTest !== 'master_password_valid') {
        return NextResponse.json({ error: "Invalid master password" }, { status: 401 });
      }
    } catch (error) {
      return NextResponse.json({ error: "Invalid master password" }, { status: 401 });
    }

    // Decrypt current volume
    const content = await decryptVolume(masterPassword);

    // Find and remove the expense
    if (!content.expenses || !Array.isArray(content.expenses)) {
      return NextResponse.json({ error: 'No expenses data found' }, { status: 404 });
    }

    const expenseIndex = content.expenses.findIndex((expense: any) => expense.id === expenseId);
    if (expenseIndex === -1) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    // Remove the expense
    content.expenses.splice(expenseIndex, 1);

    // Save the updated volume
    await saveVolume(content, masterPassword);

    return NextResponse.json({
      message: "Expense deleted successfully",
      deletedExpenseId: expenseId,
    });
  } catch (error) {
    console.error("Error deleting expense:", error);
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}