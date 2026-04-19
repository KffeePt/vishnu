import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/config/firebase-admin';

export async function POST(request: Request) {
  try {
    // Clear session cookie
    (await cookies()).delete('session');

    // If there's a session token in the request, also clear it from Firestore
    const body = await request.json().catch(() => ({}));
    const sessionToken = body.sessionToken;

    if (sessionToken) {
      // Delete the session from Firestore
      const sessionRef = db.collection('sessions').doc(sessionToken);
      await sessionRef.delete().catch((err) => {
        console.warn('Failed to delete session from Firestore:', err.message);
      });
    }

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: 'Failed to clear session cookie', details: errorMessage }, { status: 500 });
  }
}
