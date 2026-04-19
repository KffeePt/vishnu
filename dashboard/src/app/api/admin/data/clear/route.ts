import { db } from "@/config/firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";

export async function POST(request: NextRequest) {
  try {
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    const snapshot = await db.collection("udhhmbtc").get();

    if (snapshot.empty) {
      return NextResponse.json({ message: "Collection is already empty" });
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    return NextResponse.json({ message: "Collection cleared successfully" });
  } catch (error) {
    console.error("Error clearing collection:", error);
    return NextResponse.json({ error: "Failed to clear collection" }, { status: 500 });
  }
}
