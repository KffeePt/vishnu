import { NextRequest, NextResponse } from 'next/server';
import admin from '@/config/firebase-admin';
import { getMasterPassword } from '@/lib/sessionAuth';
import { runFullDbInit } from '@/lib/db-init';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken;
    let masterPassword = '';

    try {
      const idToken = authHeader.substring(7);
      decodedToken = await admin.auth().verifyIdToken(idToken);

      // Enforce strictly that the user holds the owner claim to initialize
      if (decodedToken.owner !== true) {
        return NextResponse.json({ error: 'Forbidden. Only the owner can initialize the database.' }, { status: 403 });
      }

      masterPassword = await getMasterPassword(request, decodedToken.uid);
    } catch (authError) {
      console.error('Auth verification failed during intialization', authError);
      return NextResponse.json({ error: 'Unauthorized. Invalid or expired token.' }, { status: 401 });
    }

    const report = await runFullDbInit(masterPassword || undefined);

    return NextResponse.json({
      message: 'Initialization complete.',
      report,
      ownersMissingKeys: report.ownersMissingKeys,
    });
  } catch (error: any) {
    console.error('Error initializing app configuration:', error);
    if (error.code === 14 || (error.details && error.details.includes('Name resolution failed'))) {
      return NextResponse.json({ error: 'Network error: Could not connect to Firestore. Please check your internet connection.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Failed to initialize app configuration.' }, { status: 500 });
  }
}
