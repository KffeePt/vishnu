import { NextRequest, NextResponse } from 'next/server';
import admin from '@/config/firebase-admin'; // Import default export
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { toKebabCase } from '@/utils/string-formatters';
import { getMasterPassword } from '@/lib/sessionAuth';
import { encryptData, decryptData, EncryptedContent } from '@/lib/encryption';

const firestoreAdmin = admin.firestore();

export async function GET(request: NextRequest) {
  const authResult = await adminAuthMiddleware(request);
  if (authResult) return authResult;

  const { searchParams } = new URL(request.url);
  const collectionName = searchParams.get('name');

  try {
    const authHeader = request.headers.get('authorization');
    const idToken = authHeader?.substring(7) || '';
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const masterPassword = await getMasterPassword(request, decodedToken.uid);

    if (collectionName) {
      // Fetch a single collection's configuration
      const configRef = firestoreAdmin.collection('collection-configs').doc(collectionName as string);
      const configDoc = await configRef.get();

      if (!configDoc.exists) {
        return NextResponse.json({ error: 'Collection configuration not found.' }, { status: 404 });
      }

      const docData = configDoc.data()!;
      if (docData.encryptedData) {
        try {
          const decrypted = decryptData(docData as EncryptedContent, masterPassword);
          return NextResponse.json(decrypted, { status: 200 });
        } catch (e) {
          return NextResponse.json({ error: 'Failed to decrypt collection config' }, { status: 500 });
        }
      }

      return NextResponse.json(docData, { status: 200 });
    } else {
      // Fetch all collection configurations and all collection IDs, then merge them
      const allCollectionsSnapshot = await firestoreAdmin.listCollections();
      const allCollectionIds = allCollectionsSnapshot.map(col => col.id);

      const configsRef = firestoreAdmin.collection('collection-configs');
      const configsSnapshot = await configsRef.get();
      const configsMap = new Map();

      for (const doc of configsSnapshot.docs) {
        if (doc.id === '_init') continue;
        const docData = doc.data()!;
        if (docData.encryptedData) {
          try {
            const decrypted = decryptData(docData as EncryptedContent, masterPassword);
            configsMap.set(doc.id, decrypted);
          } catch (e) {
            console.error('Failed to decrypt config', doc.id);
          }
        } else {
          configsMap.set(doc.id, docData);
        }
      }

      const combinedData: Array<{ id: string, docIdSegments: any, fields: any, isUnconfigured?: boolean, isOrphaned?: boolean }> = allCollectionIds
        .filter(id => id !== 'collection-configs') // Exclude the config collection itself
        .map(id => {
          const config = configsMap.get(id);
          return {
            id: id,
            docIdSegments: config?.docIdSegments || [],
            fields: config?.fields || [],
            isUnconfigured: !config
          };
        });

      // Also add orphaned configs that exist in collection-configs but have no actual collection
      for (const [id, config] of configsMap.entries()) {
        if (!allCollectionIds.includes(id) && id !== '_init') {
          combinedData.push({
            id: id,
            docIdSegments: config?.docIdSegments || [],
            fields: config?.fields || [],
            isOrphaned: true
          });
        }
      }

      return NextResponse.json(combinedData, { status: 200 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: 'Failed to fetch Firestore collection data', details: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await adminAuthMiddleware(request);
  if (authResult) return authResult;

  try {
    const authHeader = request.headers.get('authorization');
    const idToken = authHeader?.substring(7) || '';
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const masterPassword = await getMasterPassword(request, decodedToken.uid);

    const { collectionName, docIdSegments, fields } = await request.json();

    if (!collectionName || typeof collectionName !== 'string' || collectionName.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid collection name provided.' }, { status: 400 });
    }

    const kebabCollectionName = toKebabCase(collectionName.trim());

    const configData = {
      docIdSegments: docIdSegments || [],
      fields: fields || [],
    };

    const encryptedContent = encryptData(configData, masterPassword);

    const configRef = firestoreAdmin.collection('collection-configs').doc(kebabCollectionName);
    await configRef.set({
      ...encryptedContent,
      createdAt: new Date().toISOString(),
    });

    const collectionRef = firestoreAdmin.collection(kebabCollectionName);
    await collectionRef.doc('_placeholder').set({ createdAt: new Date().toISOString() });

    return NextResponse.json({ message: `Collection '${kebabCollectionName}' and its configuration created successfully.` }, { status: 201 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: 'Failed to create Firestore collection', details: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await adminAuthMiddleware(request);
  if (authResult) return authResult;

  try {
    const { collectionName, deleteCollection } = await request.json();

    if (!collectionName || typeof collectionName !== 'string' || collectionName.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid collection name provided.' }, { status: 400 });
    }

    const collectionRef = firestoreAdmin.collection(collectionName);
    const snapshot = await collectionRef.get();

    if (!snapshot.empty) {
      const batch = firestoreAdmin.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    }

    if (!deleteCollection) {
      // Logic for not deleting everything is handled identically in the original code, but we just clear docs.
    }

    const configRef = firestoreAdmin.collection('collection-configs').doc(collectionName);
    await configRef.delete();

    return NextResponse.json({ message: `Collection '${collectionName}' and its configuration deleted successfully.` }, { status: 200 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: 'Failed to delete Firestore collection', details: errorMessage }, { status: 500 });
  }
}
