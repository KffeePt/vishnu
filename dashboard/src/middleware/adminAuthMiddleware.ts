import { NextRequest, NextResponse } from 'next/server';
// import { isAdminEmail } from '@/utils/adminCheck'; // No longer needed
import { admin } from '@/config/firebase-admin';
import { consoleDebug } from '@/utils/console-debug';

// Role hierarchy definition (same as in the API route)
const ROLE_HIERARCHY: Record<string, { priority: number; permissions: { canAccessAdminPanel: boolean } }> = {
  owner: {
    priority: 1,
    permissions: { canAccessAdminPanel: true },
  },
  admin: {
    priority: 2,
    permissions: { canAccessAdminPanel: true },
  },
  manager: {
    priority: 3,
    permissions: { canAccessAdminPanel: false },
  },
};

export async function adminAuthMiddleware(req: NextRequest) {
  try {
    // Only allow BYPASS_AUTH in development environment
    if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
      return null; // Allow the request to proceed
    }

    // Special handling for owner UID
    const authHeader = req.headers.get('authorization');
    consoleDebug.debug('Authorization header check', {
      hasAuthHeader: !!authHeader,
      startsWithBearer: authHeader?.startsWith('Bearer ') || false
    });

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        // consoleDebug.debug('Token decoded successfully', { // Removed to prevent leaking sensitive data
        //   uid: decodedToken.uid,
        //   isOwner: decodedToken.uid === process.env.OWNER_UID
        // });

        // Bootstrap-only owner access: only grant UID-based bypass when
        // the owner has no custom claims yet AND the bootstrap gate is open.
        const { isBootstrapOwner } = require('@/lib/ownerBootstrap');
        if (await isBootstrapOwner(decodedToken)) {
          consoleDebug.debug('Bootstrap owner detected (gate open), granting setup access');
          return null;
        }
      } catch (firebaseError) {
        consoleDebug.error('Firebase authentication error for owner check', {
          error: firebaseError instanceof Error ? firebaseError.message : String(firebaseError),
          // stack: firebaseError instanceof Error ? firebaseError.stack : undefined
        });
        return NextResponse.json(
          { error: 'Authentication failed' },
          { status: 401 }
        );
      }
    } else {
      consoleDebug.warn('No authorization header found or invalid format');
    }

    // Get the authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - No valid token provided' },
        { status: 401 }
      );
    }

    // Extract the token
    const token = authHeader.split('Bearer ')[1];

    try {
      // Verify the token with Firebase
      const decodedToken = await admin.auth().verifyIdToken(token);
      // console.log('Decoded token:', decodedToken); // Removed log

      // Extract role claims from the token
      const roleClaims = Object.keys(decodedToken)
        .filter(key => ['owner', 'admin', 'manager'].includes(key) && decodedToken[key] === true)
        .map(role => ROLE_HIERARCHY[role]);

      if (roleClaims.length === 0) {
        console.log('No valid role claims found. User does not have required permissions.');
        return NextResponse.json(
          { error: 'Forbidden - Admin, owner, or manager access required' },
          { status: 403 }
        );
      }

      // Apply hierarchy (lowest priority number wins)
      const effectiveRole = roleClaims.length === 1
        ? roleClaims[0]
        : roleClaims.reduce((highest, current) =>
          current.priority < highest.priority ? current : highest
        );

      // Check if the effective role has admin panel access
      if (!effectiveRole.permissions.canAccessAdminPanel) {
        console.log('Effective role does not have admin panel access. User does not have required permissions.');
        return NextResponse.json(
          { error: 'Forbidden - Admin panel access required' },
          { status: 403 }
        );
      }

      // User is authenticated and is an admin
      return null; // Allow the request to proceed
    } catch (firebaseError) {
      console.error('Firebase authentication error:', firebaseError);

      // Handle the error message safely
      const errorMessage = firebaseError instanceof Error
        ? firebaseError.message
        : 'Unknown Firebase authentication error';

      return NextResponse.json(
        { error: 'Authentication failed: ' + errorMessage },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return NextResponse.json(
      { error: 'Authentication system error' },
      { status: 500 }
    );
  }
}