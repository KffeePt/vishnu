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

    // Get count of records before deletion for logging
    const allRecordsSnapshot = await db.collection("udhhmbtc").get();
    const recordsToDelete = allRecordsSnapshot.docs.length;

    // Log the data operation start
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
            operation: 'DELETE_ALL_SALES',
            collection: 'udhhmbtc',
            dataType: 'encrypted-sales-data',
            encrypted: true,
            totalRecords: recordsToDelete,
            affectedRecords: recordsToDelete,
            operationDetails: 'Permanently delete all sales and product data from encrypted volume',
          },
        }),
      });
    } catch (logError) {
      console.error('Failed to log delete operation:', logError);
    }

    // Delete all records from udhhmbtc collection (both sales and products)
    const batch = db.batch();

    allRecordsSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`Deleted ${recordsToDelete} total records`);

    return NextResponse.json({
      message: "All data has been permanently deleted",
      deletedCount: recordsToDelete
    });
  } catch (error) {
    console.error("Error deleting all data:", error);
    return NextResponse.json({ error: "Failed to delete all data" }, { status: 500 });
  }
}
