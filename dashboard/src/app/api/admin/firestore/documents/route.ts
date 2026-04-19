import { NextResponse } from 'next/server';
import admin from '@/config/firebase-admin';
import { DecodedIdToken } from 'firebase-admin/auth';
import { cookies } from 'next/headers';

const firestoreAdmin = admin.firestore();
const authAdmin = admin.auth();

async function verifyAdminPrivileges(sessionCookie: string | undefined): Promise<boolean> {
  if (!sessionCookie) {
    return false;
  }
  try {
    const decodedClaims: DecodedIdToken = await authAdmin.verifySessionCookie(sessionCookie, true);
    return decodedClaims.admin === true || decodedClaims.owner === true;
  } catch (error) {
    console.error('Error verifying admin privileges:', error);
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const collectionPath = searchParams.get('collectionPath');
  const docId = searchParams.get('docId');

  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;
  const isAdmin = await verifyAdminPrivileges(session);

  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized: Admin privileges required.' }, { status: 403 });
  }

  if (!collectionPath) {
    return NextResponse.json({ error: 'collectionPath is a required parameter.' }, { status: 400 });
  }

  try {
    if (docId) {
      const docRef = firestoreAdmin.collection(collectionPath).doc(docId as string);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
      }
      return NextResponse.json(docSnap.data(), { status: 200 });
    } else {
      const collectionRef = firestoreAdmin.collection(collectionPath);
      const snapshot = await collectionRef.limit(10).get();
      
      if (snapshot.empty) {
        return NextResponse.json([], { status: 200 });
      }

      const documents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      
      return NextResponse.json(documents, { status: 200 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: 'Failed to fetch from Firestore', details: errorMessage }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const collectionPath = searchParams.get('collectionPath');
  const docId = searchParams.get('docId');
  
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;
  const isAdmin = await verifyAdminPrivileges(session);

  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized: Admin privileges required.' }, { status: 403 });
  }

  if (!collectionPath || !docId) {
    return NextResponse.json({ error: 'collectionPath and docId are required parameters.' }, { status: 400 });
  }

  try {
    const updatedData = await request.json();
    const docRef = firestoreAdmin.collection(collectionPath).doc(docId as string);
    
    await docRef.set(updatedData, { merge: true });

    return NextResponse.json({ message: 'Document updated successfully.' }, { status: 200 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: 'Failed to update document', details: errorMessage }, { status: 500 });
  }
}