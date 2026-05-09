import { NextResponse } from 'next/server';
import admin from '@/config/firebase-admin';
import { cookies } from 'next/headers';
import { SHARED_SERVER_SESSION_MAX_AGE_MS } from '@/lib/shared-session-policy';
import { createOrRefreshDashboardSession } from '@/lib/access-control';

const authAdmin = admin.auth();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const idToken = body.idToken;
    const requestedSessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;

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

    const accessSession = await createOrRefreshDashboardSession({
      idToken,
      sessionId: requestedSessionId,
      clientLabel: request.headers.get('user-agent') || 'dashboard-browser',
    });

    const expiresIn = SHARED_SERVER_SESSION_MAX_AGE_MS;
    const sessionCookie = await authAdmin.createSessionCookie(idToken, { expiresIn });

    const options = { name: 'session', value: sessionCookie, maxAge: Math.floor(expiresIn / 1000), httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/', sameSite: 'lax' as const };
    (await cookies()).set(options);
    (await cookies()).set({
      name: '__session',
      value: sessionCookie,
      maxAge: Math.floor(expiresIn / 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    });

    return NextResponse.json({
      status: 'success',
      sessionId: accessSession.session.sessionId,
      expiresAt: accessSession.session.expiresAt,
      timers: accessSession.timers,
    }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: 'Failed to create session cookie', details: errorMessage }, { status: 500 });
  }
}
