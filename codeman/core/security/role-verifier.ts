export interface RoleVerdict {
    role: string | null;
    isOwner: boolean;
    isDeveloper: boolean;
}

export function inferRoleFromClaims(params: {
    claims: Record<string, any>;
    email?: string | null;
}): RoleVerdict {
    const { claims } = params;
    const isOwner = claims.owner === true || claims.role === 'owner';
    const isAdmin = claims.admin === true || claims.role === 'admin';
    const isStaff = claims.staff === true || claims.role === 'staff';
    const isDeveloper = claims.dev === true || claims.role === 'dev';

    if (isOwner) {
        return { role: 'owner', isOwner: true, isDeveloper: true };
    }

    if (isAdmin) {
        return { role: 'admin', isOwner: false, isDeveloper };
    }

    if (isStaff) {
        return { role: 'staff', isOwner: false, isDeveloper };
    }

    if (claims.role) {
        return { role: claims.role, isOwner: false, isDeveloper };
    }

    if (claims.dev === true) {
        return { role: 'dev', isOwner: false, isDeveloper: true };
    }

    return { role: null, isOwner: false, isDeveloper: false };
}
