import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { adminAuth } from '@/lib/firebase/server';
import { SHARED_SERVER_SESSION_MAX_AGE_MS } from '@/lib/shared-session-policy';
import {
  createOrRefreshDashboardSession,
  resolveDashboardSessionFromCookie,
  revokeDashboardSession,
  touchDashboardSession,
} from '@/lib/access-control';

export const dynamic = 'force-dynamic';

function clearSessionCookies(response: NextResponse) {
  response.cookies.delete('__session');
  response.cookies.delete('session');
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('__session')?.value || cookieStore.get('session')?.value;

    if (!sessionCookie) {
      return NextResponse.json({ valid: false, reason: 'missing-cookie' }, { status: 401 });
    }

    const resolved = await resolveDashboardSessionFromCookie(sessionCookie);
    if (!resolved.validation.valid) {
      const response = NextResponse.json({
        valid: false,
        reason: resolved.validation.reason,
        sessionId: resolved.sessionId,
      }, { status: 401 });
      clearSessionCookies(response);
      return response;
    }

    return NextResponse.json({
      valid: true,
      uid: resolved.decoded.uid,
      email: resolved.decoded.email || '',
      role: resolved.validation.session?.role || 'none',
      sessionId: resolved.sessionId,
      expiresAt: resolved.validation.session?.expiresAt || 0,
      lastActivity: resolved.validation.session?.lastActivity || 0,
      timers: resolved.validation.timers,
      remainingMs: Math.max(0, (resolved.validation.session?.expiresAt || 0) - resolved.validation.now),
    });
  } catch (error) {
    return NextResponse.json({
      valid: false,
      reason: 'server-error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { idToken, sessionId } = await request.json();
    if (!idToken) {
      return NextResponse.json({ error: 'Missing ID token' }, { status: 400 });
    }

    const accessSession = await createOrRefreshDashboardSession({
      idToken,
      sessionId,
      clientLabel: request.headers.get('user-agent') || 'dashboard-browser',
    });

    const expiresIn = SHARED_SERVER_SESSION_MAX_AGE_MS;
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });
    const response = NextResponse.json({
      status: 'success',
      sessionId: accessSession.session.sessionId,
      expiresAt: accessSession.session.expiresAt,
      timers: accessSession.timers,
    });
    response.cookies.set('__session', sessionCookie, {
      maxAge: Math.floor(expiresIn / 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    });
    response.cookies.set('session', sessionCookie, {
      maxAge: Math.floor(expiresIn / 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    });

    return response;
  } catch (error) {
    console.error('Error creating dashboard session:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('__session')?.value || cookieStore.get('session')?.value;
    if (!sessionCookie) {
      return NextResponse.json({ valid: false, reason: 'missing-cookie' }, { status: 401 });
    }

    const resolved = await resolveDashboardSessionFromCookie(sessionCookie);
    if (!resolved.validation.valid || !resolved.sessionId) {
      const response = NextResponse.json({ valid: false, reason: resolved.validation.reason }, { status: 401 });
      clearSessionCookies(response);
      return response;
    }

    const touched = await touchDashboardSession(resolved.decoded.uid, resolved.sessionId);
    if (!touched.valid || !touched.session) {
      const response = NextResponse.json({ valid: false, reason: touched.reason }, { status: 401 });
      clearSessionCookies(response);
      return response;
    }

    return NextResponse.json({
      valid: true,
      sessionId: touched.session.sessionId,
      expiresAt: touched.session.expiresAt,
      lastActivity: touched.session.lastActivity,
      timers: touched.timers,
      remainingMs: Math.max(0, touched.session.expiresAt - touched.now),
    });
  } catch (error) {
    console.error('Error touching dashboard session:', error);
    return NextResponse.json({ valid: false, reason: 'server-error' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('__session')?.value || cookieStore.get('session')?.value;

    if (sessionCookie) {
      const resolved = await resolveDashboardSessionFromCookie(sessionCookie).catch(() => null);
      if (resolved?.sessionId) {
        await revokeDashboardSession(resolved.decoded.uid, resolved.sessionId, 'dashboard-logout');
      }
    }

    const response = NextResponse.json({ status: 'success' });
    clearSessionCookies(response);
    return response;
  } catch (error) {
    console.error('Error deleting dashboard session:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
