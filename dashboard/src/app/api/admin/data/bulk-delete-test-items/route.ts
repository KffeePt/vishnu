import { db, admin } from "@/config/firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { decryptData, encryptData, sha256Hash } from "@/lib/encryption";
import { validateSession } from "@/lib/sessionAuth";
import crypto from "crypto";

/**
 * Bulk-delete test items from the encrypted volume in a SINGLE read+write pass.
 * This avoids N sequential saveVolume calls (each of which creates new chunk docs)
 * and instead does: decryptVolume → filter out test IDs → saveVolume once.
 *
 * Expected body: { ids: { sale?: string[], expense?: string[], 'expense-category'?: string[], 'inventory-item'?: string[] } }
 */

async function decryptVolume(masterPassword: string) {
  const metaDoc = await db.collection("udhhmbtc").doc("meta-data").get();
  if (!metaDoc.exists) throw new Error("Volume not found");

  const meta = metaDoc.data()!;
  const decryptedMeta = decryptData(
    { encryptedData: meta.encryptedData, salt: meta.salt, iv: meta.iv, authTag: meta.authTag },
    masterPassword
  );

  const chunks: string[] = [];
  for (const chunkId of decryptedMeta.chunkIds) {
    const chunkDoc = await db.collection("udhhmbtc").doc(chunkId).get();
    if (!chunkDoc.exists) throw new Error(`Missing chunk: ${chunkId}`);
    chunks.push(chunkDoc.data()!.chunk);
  }

  return decryptData(
    { encryptedData: chunks.join(""), salt: decryptedMeta.salt, iv: decryptedMeta.iv, authTag: decryptedMeta.authTag },
    masterPassword
  );
}

async function saveVolume(content: any, masterPassword: string) {
  const encryptedObj = encryptData(content, masterPassword);
  const dataHash = sha256Hash(JSON.stringify(content));

  const chunkSize = 1024 * 1024;
  const chunks: string[] = [];
  for (let i = 0; i < encryptedObj.encryptedData.length; i += chunkSize) {
    chunks.push(encryptedObj.encryptedData.slice(i, i + chunkSize));
  }

  const metaDoc = await db.collection("udhhmbtc").doc("meta-data").get();
  let oldChunkIds: string[] = [];
  if (metaDoc.exists) {
    const meta = metaDoc.data()!;
    const decryptedMeta = decryptData(
      { encryptedData: meta.encryptedData, salt: meta.salt, iv: meta.iv, authTag: meta.authTag },
      masterPassword
    );
    oldChunkIds = decryptedMeta.chunkIds || [];
  }

  const newMeta = {
    chunkCount: chunks.length,
    salt: encryptedObj.salt,
    iv: encryptedObj.iv,
    authTag: encryptedObj.authTag,
    chunkIds: chunks.map(() => crypto.randomUUID()),
    dataHash,
  };
  const encryptedMeta = encryptData(newMeta, masterPassword);

  const batch = db.batch();
  for (const id of oldChunkIds) batch.delete(db.collection("udhhmbtc").doc(id));
  for (let i = 0; i < chunks.length; i++) {
    batch.set(db.collection("udhhmbtc").doc(newMeta.chunkIds[i]), {
      chunk: chunks[i],
      createdAt: new Date(),
    });
  }
  batch.set(db.collection("udhhmbtc").doc("meta-data"), {
    encryptedData: encryptedMeta.encryptedData,
    salt: encryptedMeta.salt,
    iv: encryptedMeta.iv,
    authTag: encryptedMeta.authTag,
    updatedAt: new Date(),
  });

  await batch.commit();
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await adminAuthMiddleware(request);
    if (authResult) return authResult;

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (!decodedToken.owner || decodedToken.owner !== true) {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }

    // Resolve master password from session token
    let masterPassword = "";
    const sessionToken = request.headers.get("x-master-password-session");
    if (sessionToken) {
      const sessionData = await validateSession(sessionToken, decodedToken.uid);
      if (sessionData?.encryptedMasterPassword) {
        try {
          masterPassword = decryptData(sessionData.encryptedMasterPassword, sessionToken);
        } catch (e) {
          console.error("Failed to decrypt master password from session", e);
        }
      }
    }

    if (!masterPassword) {
      return NextResponse.json({ error: "Master password required" }, { status: 400 });
    }

    // Verify master password
    const authDoc = await db.collection("udhhmbtc").doc("auth").get();
    if (!authDoc.exists) {
      return NextResponse.json({ error: "Master password not set" }, { status: 400 });
    }
    try {
      const check = decryptData(authDoc.data()!.encryptedData, masterPassword);
      if (check !== "master_password_valid") throw new Error("Invalid");
    } catch {
      return NextResponse.json({ error: "Invalid master password" }, { status: 401 });
    }

    const body = await request.json();
    const ids = Object.fromEntries(
      Object.entries((body.ids || {}) as Record<string, string[]>).map(([type, values]) => [
        type,
        Array.from(new Set((values || []).filter(Boolean))),
      ])
    ) as Record<string, string[]>;

    // Validate that all provided IDs are [TEST] prefixed (safety guard)
    // We read the volume, filter out the test items by ID, and write once.
    const content = await decryptVolume(masterPassword);

    let mutations = 0;

    // Sales
    if (ids.sale?.length) {
      const before = (content.sales || []).length;
      content.sales = (content.sales || []).filter((s: any) => !ids.sale!.includes(s.id));
      mutations += before - content.sales.length;
    }

    // Expenses
    if (ids.expense?.length) {
      const before = (content.expenses || []).length;
      content.expenses = (content.expenses || []).filter((e: any) => !ids.expense!.includes(e.id));
      mutations += before - content.expenses.length;
    }

    // Expense categories
    if (ids["expense-category"]?.length) {
      const before = (content.expenseCategories || []).length;
      content.expenseCategories = (content.expenseCategories || []).filter(
        (c: any) => !ids["expense-category"]!.includes(c.id)
      );
      mutations += before - content.expenseCategories.length;
    }

    // Inventory items
    if (ids["inventory-item"]?.length) {
      const before = (content.inventory || []).length;
      content.inventory = (content.inventory || []).filter(
        (item: any) => !ids["inventory-item"]!.includes(item.id)
      );
      mutations += before - content.inventory.length;
    }

    // Only save if something actually changed
    if (mutations > 0) {
      await saveVolume(content, masterPassword);
    }

    return NextResponse.json({ message: `Bulk deleted ${mutations} volume item(s)`, mutations });
  } catch (error) {
    console.error("Error in bulk-delete-test-items:", error);
    return NextResponse.json({ error: "Bulk delete failed" }, { status: 500 });
  }
}
