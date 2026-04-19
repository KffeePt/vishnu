import admin, { db, auth } from '@/config/firebase-admin';
import { decryptData, encryptData, sha256Hash } from '@/lib/encryption';
import crypto from 'crypto';

const MATCHING_ID_FIELDS = new Set(['employeeId', 'staffId', 'userId', 'senderId', 'threadId']);
const REMOVE_NODE = Symbol('REMOVE_NODE');

async function deleteQueryInBatches(query: FirebaseFirestore.Query) {
  const snapshot = await query.get();
  if (snapshot.empty) return 0;

  let batch = db.batch();
  let opCount = 0;
  let deleted = 0;

  for (const docSnap of snapshot.docs) {
    batch.delete(docSnap.ref);
    deleted += 1;
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

  return deleted;
}

function scrubVolumeNode(node: any, targetUid: string): any {
  if (Array.isArray(node)) {
    return node
      .map((entry) => scrubVolumeNode(entry, targetUid))
      .filter((entry) => entry !== REMOVE_NODE);
  }

  if (!node || typeof node !== 'object') {
    return node;
  }

  for (const field of MATCHING_ID_FIELDS) {
    if (node[field] === targetUid) {
      return REMOVE_NODE;
    }
  }

  const next: Record<string, any> = {};

  for (const [key, value] of Object.entries(node)) {
    if (key === 'allowedStaffIds' && Array.isArray(value)) {
      next[key] = value.filter((entry) => entry !== targetUid);
      continue;
    }

    if (key === 'assignments' && Array.isArray(value)) {
      next[key] = value
        .map((entry) => scrubVolumeNode(entry, targetUid))
        .filter((entry) => entry !== REMOVE_NODE);
      continue;
    }

    const scrubbed = scrubVolumeNode(value, targetUid);
    if (scrubbed !== REMOVE_NODE) {
      next[key] = scrubbed;
    }
  }

  return next;
}

async function rewriteVolumeWithoutStaff(targetUid: string, masterPassword: string) {
  const metaDoc = await db.collection('udhhmbtc').doc('meta-data').get();
  if (!metaDoc.exists) {
    return false;
  }

  const meta = metaDoc.data();
  if (!meta?.encryptedData || !meta?.salt || !meta?.iv || !meta?.authTag) {
    return false;
  }

  const decryptedMeta = decryptData(
    {
      encryptedData: meta.encryptedData,
      salt: meta.salt,
      iv: meta.iv,
      authTag: meta.authTag,
    },
    masterPassword
  );

  const chunks: string[] = [];
  for (const chunkId of decryptedMeta.chunkIds || []) {
    const chunkDoc = await db.collection('udhhmbtc').doc(chunkId).get();
    if (chunkDoc.exists) {
      chunks.push(chunkDoc.data()?.chunk || '');
    }
  }

  const decryptedVolume = decryptData(
    {
      encryptedData: chunks.join(''),
      salt: decryptedMeta.salt,
      iv: decryptedMeta.iv,
      authTag: decryptedMeta.authTag,
    },
    masterPassword
  );

  const scrubbedVolume = scrubVolumeNode(decryptedVolume, targetUid);
  if (scrubbedVolume === REMOVE_NODE) {
    return false;
  }

  const encryptedObj = encryptData(scrubbedVolume, masterPassword);
  const dataHash = sha256Hash(JSON.stringify(scrubbedVolume));
  const chunkSize = 1024 * 1024;
  const encryptedChunks: string[] = [];

  for (let i = 0; i < encryptedObj.encryptedData.length; i += chunkSize) {
    encryptedChunks.push(encryptedObj.encryptedData.slice(i, i + chunkSize));
  }

  const newMeta = {
    chunkCount: encryptedChunks.length,
    salt: encryptedObj.salt,
    iv: encryptedObj.iv,
    authTag: encryptedObj.authTag,
    chunkIds: encryptedChunks.map(() => crypto.randomUUID()),
    dataHash,
  };

  const encryptedMeta = encryptData(newMeta, masterPassword);
  const batch = db.batch();

  for (const oldChunkId of decryptedMeta.chunkIds || []) {
    batch.delete(db.collection('udhhmbtc').doc(oldChunkId));
  }

  batch.set(db.collection('udhhmbtc').doc('meta-data'), {
    encryptedData: encryptedMeta.encryptedData,
    salt: encryptedMeta.salt,
    iv: encryptedMeta.iv,
    authTag: encryptedMeta.authTag,
    updatedAt: admin.firestore.Timestamp.now(),
  });

  for (let index = 0; index < encryptedChunks.length; index += 1) {
    batch.set(db.collection('udhhmbtc').doc(newMeta.chunkIds[index]), {
      chunk: encryptedChunks[index],
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }

  await batch.commit();
  return true;
}

export async function purgeStaffMemberCompletely(
  targetUid: string,
  masterPassword?: string,
  options?: { deleteAuthUser?: boolean }
) {
  const deleted = {
    staffData: false,
    staffProfile: false,
    publicKey: false,
    totp: false,
    webauthnChallenge: false,
    usersProfile: false,
    employeesShadow: false,
    firebaseAuthUser: false,
    passkeys: 0,
    inventoryAssignments: 0,
    sessions: 0,
    messagesByThread: 0,
    messagesBySender: 0,
    accessLogs: 0,
    volumeRewritten: false,
  };

  const docRefs = [
    db.collection('staff-data').doc(targetUid),
    db.collection('staff').doc(targetUid),
    db.collection('public').doc(targetUid),
    db.collection('totp-secrets').doc(targetUid),
    db.collection('webauthn-challenges').doc(targetUid),
    db.collection('users').doc(targetUid),
  ];

  const existing = await Promise.all(docRefs.map((ref) => ref.get()));

  if (existing[0].exists) {
    await db.recursiveDelete(docRefs[0]);
    deleted.staffData = true;
  }
  if (existing[1].exists) {
    await docRefs[1].delete();
    deleted.staffProfile = true;
  }
  if (existing[2].exists) {
    await docRefs[2].delete();
    deleted.publicKey = true;
  }
  if (existing[3].exists) {
    await docRefs[3].delete();
    deleted.totp = true;
  }
  if (existing[4].exists) {
    await docRefs[4].delete();
    deleted.webauthnChallenge = true;
  }
  if (existing[5].exists) {
    await docRefs[5].delete();
    deleted.usersProfile = true;
  }

  const employeesRef = db.collection('employees').doc(targetUid);
  const employeesDoc = await employeesRef.get();
  if (employeesDoc.exists) {
    await db.recursiveDelete(employeesRef);
    deleted.employeesShadow = true;
  }

  deleted.passkeys = await deleteQueryInBatches(db.collection('passkeys').where('userId', '==', targetUid));
  deleted.inventoryAssignments = await deleteQueryInBatches(db.collection('inventory').where('staffId', '==', targetUid));
  deleted.sessions = await deleteQueryInBatches(db.collection('sessions').where('userId', '==', targetUid));
  deleted.messagesByThread = await deleteQueryInBatches(db.collection('messages').where('threadId', '==', targetUid));
  deleted.messagesBySender = await deleteQueryInBatches(db.collection('messages').where('senderId', '==', targetUid));
  deleted.accessLogs = await deleteQueryInBatches(db.collection('access-attempts').where('userId', '==', targetUid));

  if (masterPassword) {
    deleted.volumeRewritten = await rewriteVolumeWithoutStaff(targetUid, masterPassword);
  }

  if (options?.deleteAuthUser !== false) {
    try {
      await auth.getUser(targetUid);
      await auth.deleteUser(targetUid);
      deleted.firebaseAuthUser = true;
    } catch (error: any) {
      if (error?.code !== 'auth/user-not-found') {
        throw error;
      }
    }
  }

  return deleted;
}
