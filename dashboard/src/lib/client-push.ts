import { envelopeEncrypt, type EnvelopeEncryptedPayload } from './crypto-client';

export async function autoPushStaffInventory(
    staffId: string,
    token: string,
    inventoryData: any
): Promise<{ success: boolean; reason?: string }> {
    try {
        // 1. Fetch staff member's public key
        const staffKeyRes = await fetch(`/api/staff/master-password?uid=${staffId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const staffKeyData = await staffKeyRes.json();

        if (!staffKeyRes.ok || !staffKeyData.hasKeys || !staffKeyData.publicKey) {
            const reason = `Staff member (${staffId}) has not set up their secure vault yet. They must log into the Candyman Panel and complete the Master Password setup first.`;
            console.warn(`Auto-push skipped for ${staffId}: hasKeys=${staffKeyData?.hasKeys}, publicKey=${!!staffKeyData?.publicKey}, status=${staffKeyRes.status}`);
            return { success: false, reason };
        }

        // 2. Fetch admin's RSA public key for dual-key envelope encryption
        const adminKeyRes = await fetch('/api/staff/admin-key', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!adminKeyRes.ok) {
            const reason = 'Admin has not set up E2E encryption keys. Owner must complete the Master Password setup in the Candyman Panel first.';
            console.error(`Auto-push failed: admin key endpoint returned ${adminKeyRes.status}`);
            return { success: false, reason };
        }
        const adminKeyData = await adminKeyRes.json();

        // 3. Envelope encrypt the payload
        console.log(`[Push Debug] Staff Key Length: ${staffKeyData.publicKey?.length}, Admin Key Length: ${adminKeyData.publicKey?.length}`);
        if (!staffKeyData.publicKey || !adminKeyData.publicKey) {
            console.error('[Push Debug] ERROR: Missing a public key:', { staffKey: !!staffKeyData.publicKey, adminKey: !!adminKeyData.publicKey });
        }
        const envelopePayload = await envelopeEncrypt(
            JSON.stringify(inventoryData),
            staffKeyData.publicKey,
            adminKeyData.publicKey
        );

        // 4. Push to the server
        const res = await fetch('/api/admin/inventory/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                staffUid: staffId,
                ...envelopePayload,
            }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Push failed');
        }

        console.log(`Auto-pushed inventory updates to ${staffId}`);
        return { success: true };
    } catch (error) {
        console.error(`Failed to auto-push inventory to ${staffId}:`, error);
        return { success: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function pushSaleRecord(
    saleData: object,
    staffPubKey: string,
    adminPubKey: string,
    token: string | null,
    staffUidOverride?: string,
    validationParams?: {
        baseValue: number;
        flexibilityPercent: number;
        finalValue: number;
    }
): Promise<{ success: boolean; error?: string }> {
    console.log('[client-push.ts] pushSaleRecord invoked with args:', {
        hasSaleData: !!saleData,
        hasStaffKey: !!staffPubKey,
        hasAdminKey: !!adminPubKey,
        hasToken: !!token,
        hasStaffUidOverride: !!staffUidOverride
    });
    try {
        if (!staffPubKey || !adminPubKey || !token) {
            console.error('[client-push.ts] pushSaleRecord aborted: Missing required keys or token');
            return { success: false, error: "Missing keys or authentication" };
        }

        const payloadJSON = JSON.stringify(saleData);
        // Dual-key envelope encryption (staff can decrypt themselves, admin can decrypt)
        console.log('[client-push.ts] Encrypting sale record payload...');
        const encryptedPayload = await envelopeEncrypt(payloadJSON, staffPubKey, adminPubKey);
        console.log('[client-push.ts] Encryption successful. Posting to /api/staff/finances/push-sale...');

        const res = await fetch('/api/staff/finances/push-sale', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...encryptedPayload,
                staffUidOverride,
                validationParams
            })
        });

        console.log(`[client-push.ts] push-sale API responded: ${res.status} ${res.statusText}`);
        if (!res.ok) {
            const errText = await res.text();
            console.error('[client-push.ts] push-sale internal error response:', errText);
            let errorMessage = 'Failed to push sale record';
            try {
                const errObj = JSON.parse(errText);
                errorMessage = errObj.error || errorMessage;
            } catch (e) {
                // Ignore parse error
            }
            throw new Error(errorMessage);
        }

        return { success: true };
    } catch (error) {
        console.error("[client-push.ts] Error pushing E2E sale:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}
