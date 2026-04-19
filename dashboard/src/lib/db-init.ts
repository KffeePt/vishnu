import { db } from '@/config/firebase-admin';
import admin from '@/config/firebase-admin';
import { encryptData } from '@/lib/encryption';
import { getWhitelistedCollections } from '@/lib/rules-whitelist';

export interface DbInitReport {
    deleted: string[];
    created: string[];
    missing: string[];
    skipped: string[];
    ownersMissingKeys: string[];
}

/**
 * Runs a full database initialization / repair.
 * This is the single source of truth for what the database should look like.
 * Called by both /api/admin/system/initialize and /api/admin/data/fix-db.
 *
 * @param masterPassword Optional master password for encrypting sensitive collections.
 *                       If not provided, encrypted collections (udhhmbtc) will be skipped.
 */
export async function runFullDbInit(masterPassword?: string): Promise<DbInitReport> {
    const expectedCollections = Array.from(new Set(getWhitelistedCollections()));

    // 1. Find dynamic dead collections (camelCase or kebab-case NOT in expected set)
    const allCollections = await db.listCollections();

    // This regex matches a dash OR a lowercase letter immediately followed by an uppercase letter
    const namingPattern = /-|[a-z][A-Z]/;

    const collectionsToDelete = allCollections
        .map(c => c.id)
        .filter(id => namingPattern.test(id) && !expectedCollections.includes(id) && id !== 'sessions');

    const report: DbInitReport = {
        deleted: [],
        created: [],
        missing: [],
        skipped: [],
        ownersMissingKeys: [],
    };

    // 2. Delete dead collections
    for (const coll of collectionsToDelete) {
        const snapshot = await db.collection(coll).get();
        if (!snapshot.empty) {
            const batch = db.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            report.deleted.push(coll);
        }
    }

    // 2.5 Force-delete legacy collections: collection-configs, master-password
    const legacyCollections = ['collection-configs', 'master-password'];
    for (const legacy of legacyCollections) {
        const snapshot = await db.collection(legacy).get();
        if (!snapshot.empty) {
            const batch = db.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            report.deleted.push(legacy + ' (legacy)');
        }
    }

    // 3. Verify/Create expected collections
    for (const coll of expectedCollections) {
        const timestamp = new Date().toISOString();
        const initData = { initialized: true, timestamp };

        if (coll === 'app-config') {
            const mainDoc = await db.collection(coll).doc('main').get();
            if (!mainDoc.exists) {
                report.missing.push(coll + '/main');
                await mainDoc.ref.set({ initialized: true, appName: 'Candyland', createdAt: timestamp });
                report.created.push(coll + '/main');
            } else {
                report.skipped.push(coll + '/main');
            }

            const shutdownDoc = await db.collection(coll).doc('shutdown').get();
            if (!shutdownDoc.exists) {
                report.missing.push(coll + '/shutdown');
                await shutdownDoc.ref.set({ isShutdown: false, message: '' });
                report.created.push(coll + '/shutdown');
            } else {
                report.skipped.push(coll + '/shutdown');
            }

            const themeDoc = await db.collection(coll).doc('theme').get();
            if (!themeDoc.exists) {
                report.missing.push(coll + '/theme');
                await themeDoc.ref.set({ primaryColor: '#7c3aed', darkMode: false });
                report.created.push(coll + '/theme');
            } else {
                report.skipped.push(coll + '/theme');
            }
            continue;
        }
        if (coll === 'assistant-config') {
            const mainDoc = await db.collection(coll).doc('main').get();
            if (!mainDoc.exists) {
                report.missing.push(coll);
                await mainDoc.ref.set({ enabled: false, model: '', systemPrompt: '' });
                report.created.push(coll);
            } else {
                report.skipped.push(coll);
            }
            continue;
        }
        if (coll === 'udhhmbtc') {
            if (!masterPassword) {
                console.warn(`Skipping init of udhhmbtc because master password is missing`);
                continue;
            }
            const authDoc = await db.collection(coll).doc('auth').get();
            if (!authDoc.exists) {
                report.missing.push(coll + '/auth');
                await authDoc.ref.set({ encryptedData: encryptData('master_password_valid', masterPassword) });
                report.created.push(coll + '/auth');
            } else {
                report.skipped.push(coll + '/auth');
            }

            const metaDoc = await db.collection(coll).doc('meta-data').get();
            if (!metaDoc.exists) {
                report.missing.push(coll + '/meta-data');
                await metaDoc.ref.set({
                    encryptedData: encryptData(JSON.stringify({
                        registry: {
                            'udhhmbtc': 'Encrypted sales volume — chunked AES-256 storage',
                            'app-config': 'Application configuration — theme, shutdown, main',
                            'staff-data': 'Unified staff employee metadata + auth/key data',
                            'sentinel': 'Sentinel codebook for real-time encrypted broadcasts',
                            'users': 'Public user profiles for customers',
                            'passkeys': 'WebAuthn passkeys for passwordless login',
                            'whitelist': 'Encrypted array of approved dynamically created collections',
                            'collection-configs': 'Encrypted schema configurations for collections',
                            'totp-secrets': '2FA secrets for staff/admin users',
                            'public': 'Public cryptographic keys (e.g., RSA pub keys)'
                        }
                    }), masterPassword)
                });
                report.created.push(coll + '/meta-data');
            } else {
                report.skipped.push(coll + '/meta-data');
            }
            continue;
        }

        // Fallback for other expected collections if empty
        const snapshot = await db.collection(coll).limit(1).get();
        if (snapshot.empty) {
            report.missing.push(coll);
            if (coll !== 'whitelist') {
                await db.collection(coll).doc('_init').set(initData);
            }
            report.created.push(coll);
        } else {
            report.skipped.push(coll);
        }
    }

    // 4. Verify admin/owner public key exists in 'public' collection
    try {
        const listUsersResult = await admin.auth().listUsers(100);
        const ownerUsers = listUsersResult.users.filter(u => u.customClaims?.owner === true);
        for (const ownerUser of ownerUsers) {
            const pubDoc = await db.collection('public').doc(ownerUser.uid).get();
            if (!pubDoc.exists || !pubDoc.data()?.publicKey) {
                report.ownersMissingKeys.push(ownerUser.uid);
            }
        }
    } catch (e) {
        console.error("Error checking admin public keys:", e);
    }

    return report;
}
