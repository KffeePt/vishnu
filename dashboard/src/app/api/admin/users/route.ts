import { NextResponse, NextRequest } from 'next/server';
import { admin } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';

export async function GET(request: NextRequest) {
  try {
    // --- Admin Verification ---
    const authResult = await adminAuthMiddleware(request);
    if (authResult) return authResult;
    // --- End Admin Verification ---

    const listUsersResult = await admin.auth().listUsers(1000); // Adjust limit as needed

    // Map users directly from Auth data
    const authUsers = listUsersResult.users.map((user: admin.auth.UserRecord) => { // Use admin.auth.UserRecord type
      // Note: Fields like phone, location, bio, detailed role/status
      // might only exist in Firestore or custom claims.
      // Only return data directly available from Auth here.
      return {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        disabled: user.disabled,
        metadata: user.metadata, // Includes creationTime, lastSignInTime
        customClaims: user.customClaims, // Role/status might be here
      };
    });

    return NextResponse.json({ users: authUsers });

  } catch (error: any) {
    console.error('Error listing users:', error);
    return NextResponse.json({ message: 'Internal Server Error', error: error.message }, { status: 500 });
  }
}
