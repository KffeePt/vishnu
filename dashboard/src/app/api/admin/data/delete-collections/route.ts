import { NextRequest, NextResponse } from 'next/server';
import admin from '@/config/firebase-admin';
import { firestore } from 'firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';

// Derive Firestore from the imported admin instance
const firestoreAdmin = admin.firestore();

export async function POST(request: NextRequest) {
  const authResult = await adminAuthMiddleware(request);
  if (authResult) return authResult;

  try {
    // Get all collections
    const allCollections = await firestoreAdmin.listCollections();

    let totalDeleted = 0;
    let collectionsDeleted = 0;

    // Delete all collections except 'users' and 'app-config' and 'sessions'
    const collectionsToProcess = allCollections
      .filter(col => !['users', 'app-config', 'collection-configs', 'sessions'].includes(col.id));

    console.log(`Processing ${collectionsToProcess.length} collections:`, collectionsToProcess.map(c => c.id));

    // Note: Firestore doesn't allow recursive deletion of collections in the client SDK
    // We'll delete all documents in each collection and then the collection itself
    for (const collectionRef of collectionsToProcess) {
      try {
        console.log(`Deleting collection: ${collectionRef.id}`);

        // Get all documents in the collection
        const snapshot = await collectionRef.get();

        if (!snapshot.empty) {
          // Delete all documents in batches
          const batchSize = 10;
          const docs = snapshot.docs;

          for (let i = 0; i < docs.length; i += batchSize) {
            const batch = firestoreAdmin.batch();
            const batchEnd = Math.min(i + batchSize, docs.length);

            for (let j = i; j < batchEnd; j++) {
              batch.delete(docs[j].ref);
            }

            await batch.commit();
            totalDeleted += (batchEnd - i);
            console.log(`Deleted ${batchEnd - i} documents from ${collectionRef.id}`);
          }
        }

        // Also delete any subcollections recursively
        await deleteSubcollections(collectionRef);

        collectionsDeleted++;
        console.log(`Successfully deleted collection: ${collectionRef.id}`);

      } catch (error) {
        console.error(`Error deleting collection ${collectionRef.id}:`, error);
        // Continue with other collections even if one fails
      }
    }

    return NextResponse.json({
      message: `Successfully deleted ${collectionsDeleted} collections and ${totalDeleted} documents.`,
      collectionsDeleted,
      documentsDeleted: totalDeleted
    }, { status: 200 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    console.error('Error deleting all collections:', error);
    return NextResponse.json({ error: 'Failed to delete all collections', details: errorMessage }, { status: 500 });
  }
}

// Helper function to delete subcollections recursively
async function deleteSubcollections(collectionRef: firestore.CollectionReference) {
  const docsSnapshot = await collectionRef.get();

  for (const doc of docsSnapshot.docs) {
    // Get all subcollections for this document
    const subcollections = await doc.ref.listCollections();

    for (const subcollection of subcollections) {
      await deleteSubcollections(subcollection);
      // Delete all documents in the subcollection
      await deleteCollectionDocuments(subcollection);
    }
  }
}

async function deleteCollectionDocuments(collectionRef: firestore.CollectionReference) {
  const snapshot = await collectionRef.get();

  if (!snapshot.empty) {
    const batchSize = 10;
    const docs = snapshot.docs;

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = firestoreAdmin.batch();
      const batchEnd = Math.min(i + batchSize, docs.length);

      for (let j = i; j < batchEnd; j++) {
        batch.delete(docs[j].ref);
      }

      await batch.commit();
    }
  }
}
