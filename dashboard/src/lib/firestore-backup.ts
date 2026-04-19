import { DocumentReference, GeoPoint, Timestamp } from 'firebase-admin/firestore';

type FirestoreAdmin = typeof import('@/config/firebase-admin').db;

export interface EncodedPrimitiveMap {
  [key: string]: EncodedValue;
}

export type EncodedValue =
  | null
  | string
  | number
  | boolean
  | EncodedPrimitiveMap
  | EncodedValue[]
  | { __type: 'timestamp'; value: string }
  | { __type: 'bytes'; value: string }
  | { __type: 'geopoint'; latitude: number; longitude: number }
  | { __type: 'reference'; path: string };

export interface FirestoreBackupDocument {
  id: string;
  path: string;
  data: EncodedPrimitiveMap;
  subcollections: FirestoreBackupCollection[];
}

export interface FirestoreBackupCollection {
  id: string;
  path: string;
  documents: FirestoreBackupDocument[];
}

export interface FirestoreBackupSnapshotV2 {
  format: 'candyland.firestore.snapshot';
  version: 2;
  exportedAt: string;
  sourceProjectId: string | null;
  rootCollections: FirestoreBackupCollection[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function serializeValue(value: unknown): EncodedValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry));
  }

  if (value instanceof Timestamp) {
    return { __type: 'timestamp', value: value.toDate().toISOString() };
  }

  if (value instanceof GeoPoint) {
    return {
      __type: 'geopoint',
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (value instanceof DocumentReference) {
    return { __type: 'reference', path: value.path };
  }

  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    return { __type: 'bytes', value: Buffer.from(value).toString('base64') };
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeValue(entry)])
    );
  }

  return JSON.parse(JSON.stringify(value)) as EncodedValue;
}

function deserializeValue(value: EncodedValue, db: FirestoreAdmin): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => deserializeValue(entry, db));
  }

  if ('__type' in value) {
    switch (value.__type) {
      case 'timestamp':
        return Timestamp.fromDate(new Date((value as { __type: 'timestamp'; value: string }).value));
      case 'bytes':
        return Buffer.from((value as { __type: 'bytes'; value: string }).value, 'base64');
      case 'geopoint':
        return new GeoPoint(
          (value as { __type: 'geopoint'; latitude: number; longitude: number }).latitude,
          (value as { __type: 'geopoint'; latitude: number; longitude: number }).longitude
        );
      case 'reference':
        return db.doc((value as { __type: 'reference'; path: string }).path);
      default:
        return value;
    }
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, deserializeValue(entry, db)])
  );
}

async function exportCollectionRecursive(
  collectionRef: FirebaseFirestore.CollectionReference
): Promise<FirestoreBackupCollection> {
  const snapshot = await collectionRef.get();
  const documents: FirestoreBackupDocument[] = [];

  for (const docSnap of snapshot.docs) {
    const subcollections = await docSnap.ref.listCollections();
    const exportedSubcollections: FirestoreBackupCollection[] = [];

    for (const subcollectionRef of subcollections) {
      exportedSubcollections.push(await exportCollectionRecursive(subcollectionRef));
    }

    documents.push({
      id: docSnap.id,
      path: docSnap.ref.path,
      data: serializeValue(docSnap.data()) as EncodedPrimitiveMap,
      subcollections: exportedSubcollections,
    });
  }

  return {
    id: collectionRef.id,
    path: collectionRef.path,
    documents,
  };
}

async function restoreCollectionRecursive(
  db: FirestoreAdmin,
  collection: FirestoreBackupCollection,
  metrics: { totalDocs: number; totalCollections: number }
) {
  metrics.totalCollections += 1;

  let batch = db.batch();
  let opCount = 0;

  for (const document of collection.documents) {
    const docRef = db.doc(document.path);
    batch.set(docRef, deserializeValue(document.data, db) as FirebaseFirestore.DocumentData, {
      merge: false,
    });
    metrics.totalDocs += 1;
    opCount += 1;

    if (opCount >= 400) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  for (const document of collection.documents) {
    for (const subcollection of document.subcollections) {
      await restoreCollectionRecursive(db, subcollection, metrics);
    }
  }
}

export async function exportFirestoreBackupSnapshot(
  db: FirestoreAdmin,
  projectId: string | null
): Promise<FirestoreBackupSnapshotV2> {
  const collections = await db.listCollections();
  const rootCollections: FirestoreBackupCollection[] = [];

  for (const collectionRef of collections) {
    rootCollections.push(await exportCollectionRecursive(collectionRef));
  }

  return {
    format: 'candyland.firestore.snapshot',
    version: 2,
    exportedAt: new Date().toISOString(),
    sourceProjectId: projectId,
    rootCollections,
  };
}

export async function restoreFirestoreBackupSnapshot(
  db: FirestoreAdmin,
  snapshot: FirestoreBackupSnapshotV2
) {
  const metrics = {
    totalDocs: 0,
    totalCollections: 0,
    details: [] as Array<{ collection: string; documents: number; subcollections: number }>,
  };

  for (const rootCollection of snapshot.rootCollections) {
    const beforeDocs = metrics.totalDocs;
    const beforeCollections = metrics.totalCollections;

    await restoreCollectionRecursive(db, rootCollection, metrics);

    metrics.details.push({
      collection: rootCollection.id,
      documents: metrics.totalDocs - beforeDocs,
      subcollections: Math.max(0, metrics.totalCollections - beforeCollections - 1),
    });
  }

  return metrics;
}
