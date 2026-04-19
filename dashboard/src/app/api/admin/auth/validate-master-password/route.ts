import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { decryptData } from '@/lib/encryption';
import crypto from 'crypto';
import admin from '@/config/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    // Note: Removed adminAuthMiddleware because this endpoint is used by BOTH admin and staff.
    // Downstream logic handles the specific role verifications.

    const { masterPassword } = await request.json();

    // Validate input
    if (!masterPassword) {
      return NextResponse.json(
        { error: 'Master password is required' },
        { status: 400 }
      );
    }

    // Get current user ID for session tracking and role determination
    const authHeader = request.headers.get('authorization')!;
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Verify the password is correct
    let isPasswordValid = false;

    // 1. If user is owner/admin, they use the global master password
    if (decodedToken.owner || decodedToken.admin) {
      try {
        const masterPasswordRef = db.collection('udhhmbtc').doc('auth');
        const masterPasswordDoc = await masterPasswordRef.get();

        if (masterPasswordDoc.exists) {
          const storedMasterPassword = masterPasswordDoc.data();
          const decryptedTest = decryptData(storedMasterPassword!.encryptedData, masterPassword);
          if (decryptedTest === 'master_password_valid' && storedMasterPassword!.isValid) {
            isPasswordValid = true;
          } else if (!storedMasterPassword!.isValid) {
            return NextResponse.json(
              { error: 'Master password has been revoked' },
              { status: 401 }
            );
          }
        } else {
          return NextResponse.json(
            { error: 'Master password not set' },
            { status: 404 }
          );
        }
      } catch (error) {
        // Invalid decryption password for admin
      }
    } else {
      // 2. If normal staff, they use their own password hash stored in staff-data
      try {
        const staffDoc = await db.collection('staff-data').doc(decodedToken.uid).get();
        if (staffDoc.exists && staffDoc.data()?.passwordHash) {
          const { verifyMasterPassword } = require('@/lib/encryption');
          const isValid = await verifyMasterPassword(masterPassword, staffDoc.data()!.passwordHash);
          if (isValid) isPasswordValid = true;
        }
      } catch (error) {
        // Invalid decryption password for staff
      }
    }

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid master password' },
        { status: 401 }
      );
    }

    // Generate a temporary session token for this validation (valid for 24 hours max)
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = admin.firestore.Timestamp.fromMillis(admin.firestore.Timestamp.now().toMillis() + 30 * 60 * 1000);

    // Encrypt the session data with the master password so we can retrieve it later
    // This allows us to have the master password available in the session context without storing it in plain text
    const sessionPayload = {
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toDate().toISOString(),
      userId: decodedToken.uid,
      role: decodedToken.owner ? 'owner' : (decodedToken.admin ? 'admin' : 'staff'),
      type: 'master-password-session'
    };

    // We encrypt the payload using the master password itself
    // This serves two purposes:
    // 1. Secure storage of session metadata
    // 2. Verification that the server can decrypt it later implies we found the right session/password combo
    // Note: We don't store the password itself in the payload, but we can verify it by successfully decrypting
    const { encryptData } = require('@/lib/encryption');
    const encryptedSession = encryptData(sessionPayload, masterPassword);

    // Encrypt the Master Password using the Session Token as the key
    // This allows the session token (which the client has) to act as the decryption key for the master password
    // The server can then use the master password to access encrypted volume data
    const EncryptedMasterPassword = encryptData(masterPassword, sessionToken);

    // Store the session for validation in other endpoints
    const sessionRef = db.collection('sessions').doc(sessionToken);
    await sessionRef.set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAt,
      userId: decodedToken.uid,
      encryptedData: encryptedSession, // General session metadata
      encryptedMasterPassword: EncryptedMasterPassword // The actual MP, encrypted with session token
    });

    // Option 3: Device-Bound Key Wrapping
    // Backfill the wrapped MP blobs for all passkeys and TOTP so future logins are seamless
    try {
      const { wrapForAllPasskeys, wrapForTotp } = require('@/lib/mp-wrap');
      await Promise.all([
        wrapForAllPasskeys(masterPassword, decodedToken.uid),
        wrapForTotp(masterPassword, decodedToken.uid)
      ]);
    } catch (wrapErr) {
      console.error('Failed to backfill wrapped MP blobs:', wrapErr);
      // Non-fatal, session was still created
    }

    return NextResponse.json({
      valid: true,
      message: 'Master password validated successfully',
      sessionToken,
      expiresAt: expiresAt.toDate().toISOString(),
    });

  } catch (error: any) {
    console.error('Error validating master password:', error);
    return NextResponse.json(
      { error: 'Failed to validate master password' },
      { status: 500 }
    );
  }
}
