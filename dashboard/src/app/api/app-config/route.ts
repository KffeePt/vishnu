import { NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { getAuthDocCached } from '@/lib/sessionAuth';

export async function GET() {
  try {
    // Check for the existence of all critical collections. Staff portal only requires udhhmbtc/auth
    const usersRef = db.collection('users').limit(1);
    const appConfigRef = db.collection('app-config').doc('main');

    const [usersSnap, appConfigSnap, authSnap] = await Promise.all([
      usersRef.get(),
      appConfigRef.get(),
      getAuthDocCached()
    ]);

    const isInitialized = !usersSnap.empty && appConfigSnap.exists && authSnap.exists;

    if (!appConfigSnap.exists) {
      return NextResponse.json({ error: 'App configuration not found.', isInitialized }, { status: 404 });
    }

    return NextResponse.json({ ...appConfigSnap.data(), isInitialized });
  } catch (error) {
    console.error('Error fetching app configuration:', error);
    return NextResponse.json({ error: 'Failed to fetch app configuration.', isInitialized: false }, { status: 500 });
  }
}