import { NextResponse } from 'next/server';
import admin from '@/config/firebase-admin';
import { cookies } from 'next/headers';

const firestoreAdmin = admin.firestore();
const authAdmin = admin.auth();

async function verifyAdminPrivileges(sessionCookie: string | undefined): Promise<boolean> {
    if (!sessionCookie) return false;
    try {
        const decodedClaims = await authAdmin.verifySessionCookie(sessionCookie, true);
        return decodedClaims.admin === true || decodedClaims.owner === true;
    } catch (error) {
        return false;
    }
}

export async function POST(request: Request) {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value;

    const isAdmin = await verifyAdminPrivileges(sessionCookie);

    if (!isAdmin) {
        return NextResponse.json({ error: 'Unauthorized: Admin privileges required.' }, { status: 403 });
    }

    try {
        const payload = await request.json();
        const threadId = payload?.threadId;

        const messagesRef = firestoreAdmin.collection('messages');
        let query: admin.firestore.Query = messagesRef;

        if (threadId) {
            query = query.where('threadId', '==', threadId);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            return NextResponse.json({ success: true, deleted: 0 }, { status: 200 });
        }

        let batch = firestoreAdmin.batch();
        let deletedCount = 0;

        for (const doc of snapshot.docs) {
            batch.delete(doc.ref);
            deletedCount++;

            // Firestore batch limit is 500
            if (deletedCount % 400 === 0) {
                await batch.commit();
                batch = firestoreAdmin.batch();
            }
        }

        // Commit any remaining deletes
        if (deletedCount % 400 !== 0) {
            await batch.commit();
        }

        return NextResponse.json({ success: true, deleted: deletedCount }, { status: 200 });

    } catch (error) {
        console.error('Failed to clear messages endpoint:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
