import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { encryptWithSystemKey, decryptWithSystemKey } from '@/lib/encryption';

export async function PUT(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const body = await request.json();
        const { recipeId, allowedStaffIds } = body;

        if (!recipeId || !Array.isArray(allowedStaffIds)) {
            return NextResponse.json({ error: 'recipeId and allowedStaffIds array are required' }, { status: 400 });
        }

        const docRef = db.collection('recipes').doc('private').collection('items').doc(recipeId);
        const snapshot = await docRef.get();

        if (!snapshot.exists) {
            return NextResponse.json({ error: 'Private recipe not found' }, { status: 404 });
        }

        // Decrypt the recipe to update the whitelist
        const encryptedData = snapshot.data();
        let recipe;
        try {
            recipe = decryptWithSystemKey(encryptedData as any);
        } catch (e) {
            console.error("Failed to decrypt private recipe during whitelist update", e);
            return NextResponse.json({ error: 'Failed to decrypt recipe data' }, { status: 500 });
        }

        // Update whitelist
        recipe.allowedStaffIds = allowedStaffIds;

        // Re-encrypt and save
        const newEncryptedData = encryptWithSystemKey(recipe);
        await docRef.set(newEncryptedData);

        return NextResponse.json({ success: true, allowedStaffIds: recipe.allowedStaffIds }, { status: 200 });

    } catch (error) {
        console.error('Error updating recipe whitelist:', error);
        return NextResponse.json({ error: 'Failed to update whitelist' }, { status: 500 });
    }
}
