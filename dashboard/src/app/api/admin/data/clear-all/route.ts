import { NextResponse } from 'next/server';
import admin from '@/config/firebase-admin';
import { cookies } from 'next/headers';

// Derive Firestore and Auth from the imported admin instance
const firestoreAdmin = admin.firestore();
const authAdmin = admin.auth();

async function verifyAdminPrivileges(sessionCookie: string | undefined): Promise<boolean> {
  console.log('Verifying admin privileges...');
  if (!sessionCookie) {
    console.log('No session cookie found.');
    return false;
  }
  try {
    console.log('Session cookie found, verifying...');
    const decodedClaims = await authAdmin.verifySessionCookie(sessionCookie, true /** checkRevoked */);
    console.log('Decoded claims:', decodedClaims);
    if (decodedClaims.admin === true || decodedClaims.owner === true) {
      console.log('Admin or owner role verified.');
      return true;
    }
    console.log('User does not have admin or owner role.');
    return false;
  } catch (error) {
    console.error('Error verifying session cookie:', error);
    return false;
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value || undefined;
  const isAdmin = await verifyAdminPrivileges(session);

  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized: Admin privileges required.' }, { status: 403 });
  }

  try {
    // Get all collections
    const allCollections = await firestoreAdmin.listCollections();

    let totalCleared = 0;

    const protectedCollections = [
      'users', 'app-config', 'collection-configs', 'firestore-registry',
      'master-password', 'sessions', 'passkeys', 'totp-secrets',
      'webauthn-challenges', 'public', 'assistant-config', 'udhhmbtc',
      'staff-data', 'staff'
    ];

    // Delete all dynamic collections except core system infrastructure
    const collectionsToProcess = allCollections
      .filter(col => !protectedCollections.includes(col.id));

    console.log(`Processing ${collectionsToProcess.length} collections:`, collectionsToProcess.map(c => c.id));

    // Process collections in batches to avoid overwhelming Firestore
    for (const collectionRef of collectionsToProcess) {
      try {
        const snapshot = await collectionRef.get();

        if (!snapshot.empty) {
          const batchSize = 10; // Firestore batch limit is 500, but we'll use smaller batches
          const docs = snapshot.docs;

          for (let i = 0; i < docs.length; i += batchSize) {
            const batch = firestoreAdmin.batch();
            const batchEnd = Math.min(i + batchSize, docs.length);

            for (let j = i; j < batchEnd; j++) {
              batch.delete(docs[j].ref);
            }

            await batch.commit();
            totalCleared += (batchEnd - i);
            console.log(`Cleared ${batchEnd - i} documents from ${collectionRef.id}`);
          }
        }
      } catch (error) {
        console.error(`Error clearing collection ${collectionRef.id}:`, error);
        // Continue with other collections even if one fails
      }
    }

    return NextResponse.json({
      message: `Successfully cleared ${totalCleared} documents from ${collectionsToProcess.length} collections.`,
      collectionsProcessed: collectionsToProcess.length,
      documentsCleared: totalCleared
    }, { status: 200 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    console.error('Error clearing all data:', error);
    return NextResponse.json({ error: 'Failed to clear all data', details: errorMessage }, { status: 500 });
  }
}
