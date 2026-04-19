import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/config/firebase-admin';
import admin from '@/config/firebase-admin';

interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  content?: string;
  userId: string;
}

async function getFileTree(userId: string): Promise<FileNode[]> {
  const projectsRef = db.collection('assistantProjects');
  const userProjectsSnapshot = await projectsRef.where('userId', '==', userId).get();
  const globalProjectsSnapshot = await projectsRef.where('userId', '==', 'global').get();

  let projects: FileNode[] = [];
  userProjectsSnapshot.forEach(doc => projects.push({ id: doc.id, ...doc.data() } as FileNode));
  globalProjectsSnapshot.forEach(doc => projects.push({ id: doc.id, ...doc.data() } as FileNode));

  if (projects.length === 0) {
    const defaultProject: Omit<FileNode, 'id'> = {
      name: 'default-project',
      path: 'default-project',
      type: 'directory',
      children: [{
        id: 'welcome.txt',
        name: 'welcome.txt',
        path: 'default-project/welcome.txt',
        type: 'file',
        content: 'Welcome to your new project!',
        userId: userId,
      }],
      userId: userId,
    };
    const docRef = await projectsRef.add(defaultProject);
    projects.push({ id: docRef.id, ...defaultProject });
  }

  return projects;
}

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

  try {
    const fileTree = await getFileTree(userId);
    return NextResponse.json(fileTree);
  } catch (error) {
    console.error('Failed to get file tree:', error);
    return NextResponse.json({ error: 'Failed to retrieve file structure.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = await verifyToken(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name, path, type, content, children } = await request.json();
    const newProject: Omit<FileNode, 'id'> = {
      name,
      path,
      type,
      content: content || '',
      children: children || [],
      userId: userId,
    };
    const docRef = await db.collection('assistantProjects').add(newProject);
    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error) {
    console.error('Failed to create item:', error);
    return NextResponse.json({ error: 'Failed to create item.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const userId = await verifyToken(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, newPath, newName } = await request.json();
    const projectRef = db.collection('assistantProjects').doc(id);
    const doc = await projectRef.get();

    if (!doc.exists || doc.data()?.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await projectRef.update({ path: newPath, name: newName });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to rename item:', error);
    return NextResponse.json({ error: 'Failed to rename item.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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

    if (!doc.exists || doc.data()?.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await projectRef.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete item:', error);
    return NextResponse.json({ error: 'Failed to delete item.' }, { status: 500 });
  }
}