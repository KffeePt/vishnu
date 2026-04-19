import { db } from "@/config/firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { requireSessionAuth } from "@/lib/sessionAuth";
import { decryptData } from "@/lib/encryption";

export async function POST(request: NextRequest) {
  let password: string = '';
  let collectionName: string = '';

  try {
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    const sessionResult = await requireSessionAuth(request);
    if (sessionResult) {
      return sessionResult;
    }

    const body = await request.json();
    password = body.password;
    collectionName = body.collectionName;

    if (!password || !collectionName) {
      return NextResponse.json({ error: "Password and collection name are required" }, { status: 400 });
    }

    console.log(`Started ${collectionName} decryption...`);

    const snapshot = await db.collection(collectionName).get();

    console.log(`Found ${snapshot.docs.length} documents to decrypt in ${collectionName}`);

    const batch = db.batch();
    let decryptedCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();

      if (!data.encryptedData) {
        console.log(`Document ${doc.id} is not encrypted, skipping`);
        continue;
      }

      try {
        const decryptedDocData = decryptData(data.encryptedData, password);

        batch.update(doc.ref, { ...decryptedDocData, encryptedData: null, updatedAt: new Date() });

        decryptedCount++;
      } catch (error) {
        console.error(`Failed to decrypt document ${doc.id}:`, error);
      }
    }

    await batch.commit();

    console.log(`Successfully decrypted ${decryptedCount} documents in ${collectionName}`);

    return NextResponse.json({
      message: `Documents in ${collectionName} decrypted successfully`,
      decryptedCount: decryptedCount,
      totalDocuments: snapshot.docs.length
    });
  } catch (error) {
    console.error(`Error decrypting documents in ${collectionName || 'unknown'}:`, error);
    return NextResponse.json({ error: `Failed to decrypt documents in ${collectionName || 'unknown'}` }, { status: 500 });
  }
}
