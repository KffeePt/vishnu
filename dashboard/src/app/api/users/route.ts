import { NextResponse } from 'next/server';
import admin from '@/config/firebase-admin';

export async function GET() {
  try {
    const listUsersResult = await admin.auth().listUsers(1000);
    const users = listUsersResult.users.map((user) => ({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
    }));
    return NextResponse.json({ users });
  } catch (error: any) {
    console.error('Error listing users:', error);
    return NextResponse.json({ message: 'Internal Server Error', error: error.message }, { status: 500 });
  }
}