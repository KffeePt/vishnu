import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/config/firebase-admin';
import admin from '@/config/firebase-admin';

async function verifyToken(request: NextRequest): Promise<string | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }
  const token = authorization.substring(7);
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken.uid;
  } catch (error) {
    console.error('Failed to verify token:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const userId = await verifyToken(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  try {
    const projectRef = db.collection('assistantProjects').doc(id);
    const doc = await projectRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const data = doc.data();
    if (data?.userId !== userId && data?.userId !== 'global') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return new Response(data?.content || '', {
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error) {
    console.error('Failed to get file content:', error);
    return NextResponse.json({ error: 'Failed to retrieve file content.' }, { status: 500 });
  }
}