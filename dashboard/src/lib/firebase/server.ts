import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (credPath) {
    // GOOGLE_APPLICATION_CREDENTIALS is set — SDK reads the JSON file automatically
    try {
      admin.initializeApp();
    } catch (error) {
      console.error("Firebase Admin init failed using GOOGLE_APPLICATION_CREDENTIALS:", error);
    }
  } else if (serviceAccountEnv) {
    // Production: parse inline JSON from env var
    try {
      // Clean up potential surrounding quotes from Next.js env loader
      let cleanedEnv = serviceAccountEnv.trim();
      if ((cleanedEnv.startsWith("'") && cleanedEnv.endsWith("'")) || 
          (cleanedEnv.startsWith('"') && cleanedEnv.endsWith('"'))) {
        cleanedEnv = cleanedEnv.slice(1, -1);
      }
      
      // Handle literal \\n that might come from escaped strings in .env
      cleanedEnv = cleanedEnv.replace(/\\n/g, '\n');
      
      const serviceAccount = JSON.parse(cleanedEnv);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (error) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY. Ensure it is a valid JSON string.", error);
    }
  } else {
    console.warn("No Firebase credentials found. Trying default (works in GCP/Firebase environments).");
    try {
      admin.initializeApp();
    } catch (error) {
      console.error("Firebase Admin initialization failed.", error);
    }
  }
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
