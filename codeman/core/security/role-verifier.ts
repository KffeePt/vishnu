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
    const isOwner = claims.owner === true;
    const isDeveloper = claims.dev === true || claims.role === 'dev';

    if (isOwner) {
        return { role: 'owner', isOwner: true, isDeveloper: true };
    }

    if (claims.role) {
        return { role: claims.role, isOwner: false, isDeveloper };
    }

    if (claims.dev === true) {
        return { role: 'dev', isOwner: false, isDeveloper: true };
    }

    return { role: null, isOwner: false, isDeveloper: false };
}
