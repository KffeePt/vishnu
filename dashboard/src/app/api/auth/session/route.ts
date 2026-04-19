import { NextResponse } from 'next/server';
import { admin } from '@/config/firebase-admin';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const { idToken } = await request.json();

  if (!idToken) {
    return NextResponse.json({ error: 'ID token is required.' }, { status: 400 });
  }

  const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days

  try {
    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });
    const response = NextResponse.json({ status: 'success' });
    response.cookies.set('session', sessionCookie, { maxAge: expiresIn, httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/' });
    return response;
  } catch (error: any) {
    console.error('Error creating session cookie:', error);
    const errorMessage = error.message || 'An unknown error occurred.';
    const errorCode = error.code || 'UNKNOWN_ERROR';
    return NextResponse.json({ error: `Failed to create session. Reason: ${errorMessage} (Code: ${errorCode})` }, { status: 401 });
  }
}