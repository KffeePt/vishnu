import { NextRequest, NextResponse } from 'next/server';
import { clearRateLimits } from '@/lib/rate-limiter';
import { clearAuthDocCache, clearAuthPasswordCache } from '@/lib/sessionAuth';
import { clearAllPasskeyCaches } from '@/lib/passkeyCache';
import { clearAllTotpCaches } from '@/lib/totpCache';

/**
 * Endpoint to clear the in-memory rate limit store.
 * Primarily used for testing/development to reset "Too many requests" states
 * without needing a full server restart.
 */
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await require('firebase-admin').auth().verifyIdToken(token);

        if (decodedToken.owner !== true) {
            return NextResponse.json({ error: 'Forbidden: Owner access required' }, { status: 403 });
        }
        clearRateLimits();
        clearAuthDocCache();
        clearAuthPasswordCache();
        clearAllPasskeyCaches();
        clearAllTotpCaches();
        console.log('[CACHE RESET] All in-memory stores and auth caches cleared via API request.');

        return NextResponse.json({
            success: true,
            message: 'Rate limits have been successfully reset.'
        });
    } catch (error) {
        return NextResponse.json({
            error: 'Failed to reset rate limits',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
