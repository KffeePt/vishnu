import { NextRequest, NextResponse } from 'next/server';
import { RoleResolutionRequestSchema, RoleResolutionResponseSchema, UserEffectiveRole } from '@/zod_schemas/user-related';

// Role hierarchy definition with permissions
const ROLE_HIERARCHY: Record<string, UserEffectiveRole> = {
  owner: {
    role: 'owner',
    priority: 1,
    permissions: {
      canAccessAdminPanel: true,
      canManageUsers: true,
      canDeleteData: true,
      canViewVolume: true,
      canManageMasterPassword: true,
    },
    allClaims: {},
  },
  admin: {
    role: 'admin',
    priority: 2,
    permissions: {
      canAccessAdminPanel: true,
      canManageUsers: false,
      canDeleteData: false,
      canViewVolume: false,
      canManageMasterPassword: false,
    },
    allClaims: {},
  },
  manager: {
    role: 'manager',
    priority: 3,
    permissions: {
      canAccessAdminPanel: false,
      canManageUsers: false,
      canDeleteData: false,
      canViewVolume: false,
      canManageMasterPassword: false,
    },
    allClaims: {},
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = RoleResolutionRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request format', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { claims } = validationResult.data;

    // Extract role claims from Firebase ID token claims
    const roleClaims = Object.keys(claims)
      .filter(key => ['owner', 'admin', 'manager'].includes(key) && claims[key] === true)
      .map(role => ROLE_HIERARCHY[role]);

    if (roleClaims.length === 0) {
      // No valid role claims found
      return NextResponse.json({
        effectiveRole: null,
        resolutionMethod: 'no_valid_claims',
      } as const);
    }

    if (roleClaims.length === 1) {
      // Single role claim - use it directly
      const effectiveRole = { ...roleClaims[0], allClaims: claims };
      return NextResponse.json({
        effectiveRole,
        resolutionMethod: 'single_claim',
      } as const);
    }

    // Multiple role claims - apply hierarchy (lowest priority number wins)
    const highestPriorityRole = roleClaims.reduce((highest, current) =>
      current.priority < highest.priority ? current : highest
    );

    const effectiveRole = { ...highestPriorityRole, allClaims: claims };

    const response = {
      effectiveRole,
      resolutionMethod: 'hierarchy_resolution' as const,
    };

    // Validate response against schema
    const responseValidation = RoleResolutionResponseSchema.safeParse(response);
    if (!responseValidation.success) {
      console.error('Response validation failed:', responseValidation.error);
      return NextResponse.json(
        { error: 'Internal server error during role resolution' },
        { status: 500 }
      );
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in role resolution:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}