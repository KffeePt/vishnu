import { NextResponse, NextRequest } from 'next/server';
import admin from '@/config/firebase-admin'; // Import the default admin app
import { getAuth } from 'firebase-admin/auth';        // Import getAuth
import { getFirestore } from 'firebase-admin/firestore';  // Import getFirestore
import { manageAdminClaim } from '@/utils/manage-user-claims'; // Import the new utility function
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';

// Interface for Location (coordinates)
interface LocationCoords {
  latitude: number | null;
  longitude: number | null;
}

// Define the expected structure of the client's payload
interface ClientRequestPayload {
  userId: string;
  updates: {
    displayName?: string;
    role?: 'user' | 'manager' | 'admin' | 'chef' | 'repartidor'; // Comprehensive roles
    status?: 'active' | 'inactive' | 'pending' | 'suspended';
    firestoreData?: {
      phone?: string | null;            // From client, for Firestore's mobileNumber
      deliveryAddress?: string | null;  // Textual address from client, for Firestore's deliveryAddress
      bio?: string | null;
      location?: LocationCoords | null; // Coordinate object from client, for Firestore's location (GeoPoint)
      theme?: 'dark' | 'light'; // Add theme property
      // mobileNumber is derived from phone internally by the API if needed, but client sends phone.
    };
  };
}

export async function PUT( // Restore async
  request: NextRequest
  // Removed context parameter
) {
  try {
    // --- Admin Verification ---
    const authResult = await adminAuthMiddleware(request);
    if (authResult) return authResult;
    // --- End Admin Verification ---

    const body: ClientRequestPayload = await request.json();
    const { userId, updates: updateData } = body; // Destructure userId and the nested 'updates' object

    if (!userId) {
      return NextResponse.json({ message: 'User ID is required in the request body' }, { status: 400 });
    }
    if (!updateData) {
      return NextResponse.json({ message: 'Updates object is required in the request body' }, { status: 400 });
    }

    const authUpdates: { displayName?: string; disabled?: boolean } = {};
    const firestoreUpdates: { [key: string]: any } = {};

    if (updateData.displayName !== undefined) {
      authUpdates.displayName = updateData.displayName;
      firestoreUpdates.displayName = updateData.displayName;
    }
    // Access phone, location, bio from updateData.firestoreData
    // Map form's 'phone' to 'mobileNumber' and form's 'location' to 'deliveryAddress'
    if (updateData.firestoreData?.phone !== undefined) {
      firestoreUpdates.mobileNumber = updateData.firestoreData.phone;
    }
    // Process textual delivery address from client
    if (updateData.firestoreData?.deliveryAddress !== undefined) {
      firestoreUpdates.deliveryAddress = updateData.firestoreData.deliveryAddress;
    }
    if (updateData.firestoreData?.bio !== undefined) {
      firestoreUpdates.bio = updateData.firestoreData.bio;
    }
    if (updateData.firestoreData?.theme !== undefined) {
      firestoreUpdates.theme = updateData.firestoreData.theme;
    }
    // Process coordinate object from client (which client sends as 'location')
    // and save it to Firestore's 'location' field as a GeoPoint.
    if (updateData.firestoreData?.location !== undefined && updateData.firestoreData.location !== null) {
      // Ensure it's a valid LocationCoords object before destructuring
      const clientLocationData = updateData.firestoreData.location as LocationCoords;
      const lat = clientLocationData.latitude;
      const lon = clientLocationData.longitude;
      firestoreUpdates.location = { // Save GeoPoint to Firestore 'location' field
        latitude: typeof lat === 'number' ? lat : null,
        longitude: typeof lon === 'number' ? lon : null,
      };
    } else if (updateData.firestoreData?.location === null) { // If client explicitly sends null for coordinates
      firestoreUpdates.location = null; // Set Firestore's GeoPoint 'location' to null
    }

    if (updateData.role !== undefined) firestoreUpdates.role = updateData.role;
    if (updateData.status !== undefined) {
      firestoreUpdates.status = updateData.status;
      authUpdates.disabled = updateData.status === 'suspended' || updateData.status === 'inactive';
    }

    const auth = getAuth(); // Use default app
    const firestore = getFirestore(); // Use default app

    // Apply Firestore updates first
    if (Object.keys(firestoreUpdates).length > 0) {
      console.log(`Attempting to update Firestore for user ${userId} with:`, firestoreUpdates);
      const userProfileRef = firestore.collection('users').doc(userId);
      await userProfileRef.set(firestoreUpdates, { merge: true });
      console.log(`Successfully updated Firestore for user ${userId}.`);
    } else {
      console.log(`No Firestore updates to apply for user ${userId}.`);
    }

    // Handle custom claims and Auth updates
    let claimsNeedUpdate = false;
    let claimsToSet: Record<string, any> = {};

    // Fetch existing claims *before* potentially updating role/status
    const userRecordBeforeUpdates = await auth.getUser(userId);
    claimsToSet = { ...userRecordBeforeUpdates.customClaims };

    if (updateData.role !== undefined) {
      await manageAdminClaim(userId, updateData.role === 'admin'); // Update admin claim if necessary
      // Re-fetch user after potential admin claim change to get latest claims
      const userAfterAdminClaim = await auth.getUser(userId);
      claimsToSet = { ...userAfterAdminClaim.customClaims }; // Use potentially updated claims
      claimsToSet.role = updateData.role; // Set the role claim
      claimsNeedUpdate = true;
    }

    if (updateData.status !== undefined) {
      claimsToSet.status = updateData.status; // Set the status claim
      claimsNeedUpdate = true;
    }

    // Apply Auth profile updates (displayName, disabled)
    if (Object.keys(authUpdates).length > 0) {
      console.log(`Attempting to update Firebase Auth profile for user ${userId} with:`, authUpdates);
      await auth.updateUser(userId, authUpdates);
      console.log(`Successfully updated Firebase Auth profile for user ${userId}.`);
    } else {
      console.log(`No Firebase Auth profile updates to apply for user ${userId}.`);
    }

    // Apply custom claims if needed
    if (claimsNeedUpdate) {
      console.log(`Attempting to set custom claims for user ${userId} with:`, claimsToSet);
      await auth.setCustomUserClaims(userId, claimsToSet);
      console.log(`Successfully set custom claims for user ${userId}.`);
    } else {
      console.log(`No custom claims to update for user ${userId}.`);
    }

    // Fetch final updated user data
    const updatedUserRecord = await auth.getUser(userId);
    const updatedProfileDoc = await firestore.collection('users').doc(userId).get();
    const updatedProfileData = updatedProfileDoc.data() || {};

    const combinedUpdatedUser = {
      uid: updatedUserRecord.uid,
      email: updatedUserRecord.email,
      displayName: updatedUserRecord.displayName,
      photoURL: updatedUserRecord.photoURL,
      disabled: updatedUserRecord.disabled,
      metadata: updatedUserRecord.metadata,
      customClaims: updatedUserRecord.customClaims,
      firestoreData: updatedProfileData,
    };

    return NextResponse.json(combinedUpdatedUser);

  } catch (error: any) {
    console.error(`Error updating user:`, error); // Removed userId from log as it might not be available here
    if (error.code === 'auth/user-not-found') {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Internal Server Error', error: error.message }, { status: 500 });
  }
}

// --- DELETE Handler ---
export async function DELETE(
  request: NextRequest
  // Removed context parameter
) {
  try {
    // --- Admin Verification ---
    const authResult = await adminAuthMiddleware(request);
    if (authResult) return authResult;
    // --- End Admin Verification ---

    // Extract userId from request body
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ message: 'User ID is required in the request body' }, { status: 400 });
    }

    const auth = getAuth(); // Use default app
    const firestore = getFirestore(); // Use default app

    // 1. Delete user from Firebase Authentication
    console.log(`Attempting to delete Firebase Auth user: ${userId}`);
    await auth.deleteUser(userId);
    console.log(`Successfully deleted Firebase Auth user: ${userId}`);

    // 2. Delete user profile from Firestore (optional, but recommended)
    try {
      const userProfileRef = firestore.collection('users').doc(userId); // Adjust collection name if different
      console.log(`Attempting to delete Firestore profile for user: ${userId}`);
      await userProfileRef.delete();
      console.log(`Successfully deleted Firestore profile for user: ${userId}`);
    } catch (firestoreError: any) {
      // Log Firestore deletion error but don't necessarily fail the whole request
      // if the Auth user was deleted successfully. The profile might not exist.
      console.warn(`Could not delete Firestore profile for user ${userId} (might not exist):`, firestoreError.message);
    }

    return NextResponse.json({ message: 'User deleted successfully' }, { status: 200 });

  } catch (error: any) {
    // Note: userId might not be available here if request.json() failed
    console.error(`Error deleting user:`, error);
    // Handle specific errors
    if (error.code === 'auth/user-not-found') {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }
    // Handle other potential errors (e.g., permission errors if the service account lacks rights)
    return NextResponse.json({ message: 'Internal Server Error', error: error.message }, { status: 500 });
  }
}
