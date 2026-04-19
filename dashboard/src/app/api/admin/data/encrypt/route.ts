import { db } from "@/config/firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { requireSessionAuth } from "@/lib/sessionAuth";
import { encryptData } from "@/lib/encryption";

export async function POST(request: NextRequest) {
  let password: string = '';
  let collectionName: string = '';

  try {
    // Check authentication and owner access only
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    // Check master password session
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

    console.log(`Started ${collectionName} re-encryption...`);

    // Get all documents from the specified collection
    const snapshot = await db.collection(collectionName).get();

    console.log(`Found ${snapshot.docs.length} documents to re-encrypt in ${collectionName}`);

    const batch = db.batch();
    let reEncryptedCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // Skip documents that are already encrypted
      if (data.encryptedData) {
        console.log(`Document ${doc.id} is already encrypted, skipping`);
        continue;
      }

      try {
        // Prepare data to encrypt (exclude metadata fields)
        const { id, type, createdAt, updatedAt, encryptedData, ...docData } = data;

        // Encrypt the document data
        const encryptedDocData = encryptData(docData, password);

        // Update the document with encrypted data
        batch.update(doc.ref, {
          encryptedData: encryptedDocData,
          updatedAt: new Date(),
        });

        reEncryptedCount++;
      } catch (error) {
        console.error(`Failed to encrypt document ${doc.id}:`, error);
        // Skip this document if encryption fails
      }
    }

    // Commit all changes
    await batch.commit();

    console.log(`Successfully re-encrypted ${reEncryptedCount} documents in ${collectionName}`);

    return NextResponse.json({
      message: `Documents in ${collectionName} encrypted successfully`,
      encryptedCount: reEncryptedCount,
      totalDocuments: snapshot.docs.length
    });
  } catch (error) {
    console.error(`Error encrypting documents in ${collectionName || 'unknown'}:`, error);
    return NextResponse.json({ error: `Failed to encrypt documents in ${collectionName || 'unknown'}` }, { status: 500 });
  }
}
