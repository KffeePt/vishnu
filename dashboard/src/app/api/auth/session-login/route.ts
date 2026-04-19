import { NextResponse } from 'next/server';
import admin from '@/config/firebase-admin';
import { cookies } from 'next/headers';

const authAdmin = admin.auth();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const idToken = body.idToken;

    if (!idToken) {
      return NextResponse.json({ error: 'ID token is required.' }, { status: 400 });
    }

    // Verify token to get UID, then ensure user:true claim is set
    const decodedToken = await authAdmin.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const currentUser = await authAdmin.getUser(uid);
    const existingClaims = currentUser.customClaims || {};
    if (!existingClaims.user) {
      await authAdmin.setCustomUserClaims(uid, { ...existingClaims, user: true });
    }

    const expiresIn = 60 * 5 * 1000; // 5 minutes
    const sessionCookie = await authAdmin.createSessionCookie(idToken, { expiresIn });

    const options = { name: 'session', value: sessionCookie, maxAge: expiresIn, httpOnly: true, secure: true };
    (await cookies()).set(options);

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: 'Failed to create session cookie', details: errorMessage }, { status: 500 });
  }
}
