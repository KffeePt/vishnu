import { NextRequest, NextResponse } from 'next/server';

import { admin } from '@/config/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const sessionCookie = url.searchParams.get('session') || '';

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login?bridge=missing-session', request.url));
  }

  try {
    await admin.auth().verifySessionCookie(sessionCookie, true);
  } catch {
    return NextResponse.redirect(new URL('/login?bridge=invalid-session', request.url));
  }

  const response = NextResponse.redirect(new URL('/admin', request.url));
  response.cookies.set('__session', sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax',
  });
  response.cookies.set('session', sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax',
  });
  return response;
}
