import { NextResponse, NextRequest } from 'next/server';
import admin from '@/config/firebase-admin'; // Import initialized admin SDK
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';

type UserStatus = 'active' | 'inactive' | 'pending' | 'suspended';
const VALID_STATUSES: UserStatus[] = ['active', 'inactive', 'pending', 'suspended'];

interface StatusUpdatePayload {
  userId: string; // Add userId here
  status: UserStatus;
}

// Remove the context parameter as userId will come from the body
export async function PATCH(
  request: NextRequest
) {
  let userId: string | undefined; // Keep for catch block, but assign later

  try {
    // --- Admin Verification (Before reading body) ---
    const authResult = await adminAuthMiddleware(request);
    if (authResult) return authResult;
    // --- End Admin Verification ---

    // Await the request body AFTER admin check
    const payload: StatusUpdatePayload = await request.json();
    const { userId: extractedUserId, status: newStatus } = payload; // Extract userId and status from body
    userId = extractedUserId; // Assign userId for use in the handler and catch block

    // Validate userId from body
    if (!userId) {
      return NextResponse.json({ message: 'User ID is required in the request body' }, { status: 400 });
    }

    // Validate the new status
    if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json({ message: 'Invalid status provided' }, { status: 400 });
    }

    // --- Perform Updates ---
    const auth = admin.auth();
    const firestore = admin.firestore();

    // 1. Update Auth Disabled Flag
    const isDisabled = newStatus === 'suspended' || newStatus === 'inactive';
    await auth.updateUser(userId, { disabled: isDisabled });

    // 2. Update Custom Claim for Status
    // Fetch existing claims first to merge
    const { customClaims: existingClaims } = await auth.getUser(userId);
    await auth.setCustomUserClaims(userId, { ...existingClaims, status: newStatus });

    // 3. Optional: Update Firestore Profile Status Field
    try {
      const userProfileRef = firestore.collection('users').doc(userId); // Adjust collection name
      await userProfileRef.set({ status: newStatus }, { merge: true });
    } catch (firestoreError) {
      console.warn(`Firestore profile update for user ${userId} failed (non-critical):`, firestoreError);
      // Decide if this should be a critical error or just logged
    }


    return NextResponse.json({ message: `User ${userId} status updated to ${newStatus}` });

  } catch (error: any) {
    // Use userId safely in the catch block (it might be undefined if body parsing failed)
    console.error(`Error updating status for user ${userId || 'unknown (body parsing may have failed)'}:`, error);
    // Handle specific errors like 'user-not-found'
    if (error.code === 'auth/user-not-found') {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }
    // Handle potential JSON parsing errors if request body is invalid
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Internal Server Error', error: error.message }, { status: 500 });
  }
}