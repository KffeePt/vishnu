import { db } from "@/config/firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";

export async function GET(request: NextRequest) {
  try {
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    const { searchParams } = new URL(request.url);
    const collectionName = searchParams.get("collectionName");

    if (!collectionName) {
      return NextResponse.json({ error: "Collection name is required" }, { status: 400 });
    }

    const snapshot = await db.collection(collectionName).limit(1).get();

    if (snapshot.empty) {
      return NextResponse.json({ isEncrypted: false });
    }

    const docData = snapshot.docs[0].data();
    const isEncrypted = !!docData.encryptedData;

    return NextResponse.json({ isEncrypted });
  } catch (error) {
    console.error("Error checking collection status:", error);
    return NextResponse.json({ error: "Failed to check collection status" }, { status: 500 });
  }
}
