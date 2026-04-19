import * as admin from 'firebase-admin';

function hasInlineServiceAccount() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
}

export const initAdmin = () => {
  if (admin.apps.length) {
    return admin;
  }

  if (hasInlineServiceAccount()) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
    return admin;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
    return admin;
  }

  // Keep builds and local previews from crashing when credentials are injected later.
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  return admin;
};

const adminApp = initAdmin();
const db = adminApp.firestore();
const auth = adminApp.auth();
let rtdb: admin.database.Database | null = null;

if (process.env.FIREBASE_DATABASE_URL) {
  try {
    rtdb = adminApp.database();
  } catch (error) {
    console.warn('Firebase RTDB admin client is unavailable.', error);
  }
}

export { admin, auth, db, rtdb };
export default admin;
