import { db } from "@/config/firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { requireSessionAuth } from "@/lib/sessionAuth";

export async function DELETE(request: NextRequest) {
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

    // Get count of sales records before deletion for logging
    const salesSnapshot = await db.collection("udhhmbtc")
      .where("type", "==", "sale")
      .get();

    const recordsToDelete = salesSnapshot.docs.length;

    // Log the data operation
    try {
      await fetch(`${request.nextUrl.origin}/api/admin/logging-service`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': request.headers.get('authorization')!,
          'x-master-password-session': request.headers.get('x-master-password-session') || '',
        },
        body: JSON.stringify({
          logType: 'data-operation',
          data: {
            operation: 'RESET_ENCRYPTED_VOLUME',
            collection: 'udhhmbtc',
            dataType: 'encrypted-sales-data',
            encrypted: true,
            totalRecords: recordsToDelete,
            affectedRecords: recordsToDelete,
            operationDetails: 'Reset encrypted volume by deleting all sales records',
          },
        }),
      });
    } catch (logError) {
      console.error('Failed to log reset operation:', logError);
    }

    // Delete all sales records from udhhmbtc collection
    const batch = db.batch();

    salesSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`Deleted ${recordsToDelete} sales records`);

    return NextResponse.json({
      message: "All encrypted sales data has been reset",
      deletedCount: recordsToDelete
    });
  } catch (error) {
    console.error("Error resetting encrypted volume:", error);
    return NextResponse.json({ error: "Failed to reset encrypted volume" }, { status: 500 });
  }
}
