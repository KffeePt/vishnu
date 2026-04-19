import { NextRequest, NextResponse } from 'next/server';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { db } from '@/config/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    // Fetch access attempts
    const accessAttemptsRef = db.collection('access-attempts');
    const snapshot = await accessAttemptsRef.orderBy('timestamp', 'desc').limit(100).get();

    const attempts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ attempts });

  } catch (error: any) {
    console.error('Error fetching access attempts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch access attempts' },
      { status: 500 }
    );
  }
}
