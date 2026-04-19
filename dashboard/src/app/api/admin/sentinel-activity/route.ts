import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';

// Require Admin/Owner
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await require('firebase-admin').auth().verifyIdToken(token);
        } catch (e) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const customClaims = decodedToken;
        if (customClaims.admin !== true && customClaims.owner !== true) {
            return NextResponse.json({ error: 'User does not have required permissions' }, { status: 403 });
        }

        // Fetch recent login sessions
        const sessionsSnapshot = await db.collection('sessions')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        // Fetch recent finances (sales)
        const financesSnapshot = await db.collection('finances')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        const activities: Array<{
            id: string;
            type: 'login' | 'sale' | 'action';
            userId: string;
            timestamp: string;
            details: Record<string, any>;
        }> = [];

        sessionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (!data.createdAt) return;

            activities.push({
                id: doc.id,
                type: 'login',
                userId: data.userId,
                timestamp: data.createdAt.toDate().toISOString(),
                details: {
                    authenticatedVia: data.authenticatedVia || 'unknown',
                    type: data.type || 'standard'
                }
            });
        });

        financesSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (!data.createdAt || data.type !== 'sale') return; // only track sales

            activities.push({
                id: doc.id,
                type: 'sale',
                userId: data.staffId,
                timestamp: data.createdAt.toDate().toISOString(),
                details: {
                    encryptedGross: data.encryptedGross,
                    encryptedItemsJson: data.encryptedItemsJson,
                    encryptedProfit: data.encryptedProfit,
                    nonce: data.nonce
                }
            });
        });

        // Sort combined activities by timestamp desc
        activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // Return top 50 combined
        return NextResponse.json({ activities: activities.slice(0, 50) });

    } catch (error: any) {
        console.error('Error fetching sentinel activity:', error);
        return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
    }
}
