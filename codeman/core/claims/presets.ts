export type ClaimPresetSource = 'first-party' | 'custom';
export type ClaimPresetApplyMode = 'managed-merge' | 'replace-all';

export interface ClaimPreset {
    id: string;
    name: string;
    description: string;
    source: ClaimPresetSource;
    applyMode: ClaimPresetApplyMode;
    claims: Record<string, unknown>;
    role?: string;
    owner?: boolean | string;
    opRole?: string[];
    readonly?: boolean;
    theme?: 'default' | 'info' | 'warning' | 'danger' | 'owner';
    updatedAt?: number;
}

const MANAGED_CLAIM_KEYS = new Set([
    'role',
    'roleCategory',
    'owner',
    'oprole',
    'oproles',
    'admin',
    'staff',
    'user',
    'partner',
    'dev',
    'test',
    'dispatcher',
    'driver',
    'rider',
    'customer',
    'service',
    'rep',
    'manager',
    'supervisor',
    'supervisors'
]);

export const FIRST_PARTY_CLAIM_PRESETS: ClaimPreset[] = [
    buildFirstPartyPreset({
        id: 'owner_admin',
        name: 'Owner admin',
        description: 'Owner whitelist + admin manager access',
        claims: { role: 'admin', owner: true, oprole: ['manager'] },
        theme: 'owner'
    }),
    buildFirstPartyPreset({
        id: 'admin_manager',
        name: 'Admin manager',
        description: 'Admin manager access',
        claims: { role: 'admin', owner: false, oprole: ['manager'] }
    }),
    buildFirstPartyPreset({
        id: 'admin_supervisor',
        name: 'Admin supervisor',
        description: 'Admin supervisor access',
        claims: { role: 'admin', owner: false, oprole: ['supervisor'] }
    }),
    buildFirstPartyPreset({
        id: 'staff_dispatcher',
        name: 'Staff dispatcher',
        description: 'Staff dispatcher access',
        claims: { role: 'staff', owner: false, oprole: ['dispatcher'] }
    }),
    buildFirstPartyPreset({
        id: 'staff_driver',
        name: 'Staff driver',
        description: 'Staff driver access',
        claims: { role: 'staff', owner: false, oprole: ['driver'] }
    }),
    buildFirstPartyPreset({
        id: 'user_rider',
        name: 'User rider',
        description: 'Standard rider access',
        claims: { role: 'user', owner: false, oprole: ['rider'] },
        theme: 'info'
    }),
    buildFirstPartyPreset({
        id: 'user_customer',
        name: 'User customer',
        description: 'Standard customer access',
        claims: { role: 'user', owner: false, oprole: ['customer'] },
        theme: 'info'
    }),
    buildFirstPartyPreset({
        id: 'partner_service',
        name: 'Partner service',
        description: 'Partner service access',
        claims: { role: 'partner', owner: false, oprole: ['service'] }
    }),
    buildFirstPartyPreset({
        id: 'partner_rep',
        name: 'Partner rep',
        description: 'Partner representative access',
        claims: { role: 'partner', owner: false, oprole: ['rep'] }
    }),
    buildFirstPartyPreset({
        id: 'vishnu_owner',
        name: 'Vishnu owner',
        description: 'Owner + admin Vishnu access',
        claims: { role: 'owner', owner: true, admin: true, user: true },
        theme: 'owner'
    }),
    buildFirstPartyPreset({
        id: 'vishnu_admin',
        name: 'Vishnu admin',
        description: 'Admin Vishnu access',
        claims: { role: 'admin', admin: true, user: true }
    }),
    buildFirstPartyPreset({
        id: 'vishnu_staff',
        name: 'Vishnu staff',
        description: 'Staff Vishnu access',
        claims: { role: 'staff', staff: true, user: true }
    }),
    buildFirstPartyPreset({
        id: 'vishnu_dev',
        name: 'Vishnu developer',
        description: 'Developer Vishnu access',
        claims: { role: 'dev', dev: true, user: true }
    }),
    buildFirstPartyPreset({
        id: 'reset_user_rider',
        name: 'Reset to rider',
        description: 'Keep only basic rider access',
        applyMode: 'replace-all',
        claims: { role: 'user', oprole: ['rider'] },
        theme: 'warning'
    }),
    buildFirstPartyPreset({
        id: 'nuke_all',
        name: 'Nuke all claims',
        description: 'Delete every custom claim',
        applyMode: 'replace-all',
        claims: {},
        theme: 'danger'
    })
];

function buildFirstPartyPreset(input: {
    id: string;
    name: string;
    description: string;
    claims: Record<string, unknown>;
    applyMode?: ClaimPresetApplyMode;
    theme?: ClaimPreset['theme'];
}): ClaimPreset {
    const normalizedClaims = normalizeClaimsShape(input.claims);
    return {
        id: input.id,
        name: input.name,
        description: input.description,
        source: 'first-party',
        applyMode: input.applyMode ?? 'managed-merge',
        claims: normalizedClaims,
        role: typeof normalizedClaims.role === 'string' ? normalizedClaims.role : undefined,
        owner: typeof normalizedClaims.owner === 'boolean' || typeof normalizedClaims.owner === 'string'
            ? normalizedClaims.owner as boolean | string
            : undefined,
        opRole: Array.isArray(normalizedClaims.oprole)
            ? normalizedClaims.oprole.map((value) => String(value))
            : undefined,
        readonly: true,
        theme: input.theme ?? 'default'
    };
}

export function parseLooseClaimValue(rawValue: unknown): unknown {
    const text = String(rawValue ?? '').trim();
    if (text === '') return '';

    const lower = text.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;

    if (!Number.isNaN(Number(text)) && text === String(Number(text))) {
        return Number(text);
    }

    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }

    return text;
}

function normalizeCategoryRole(value: unknown): string | null {
    const normalized = String(value ?? '').trim().toLowerCase();
    switch (normalized) {
        case 'owner':
        case 'admin':
        case 'staff':
        case 'user':
        case 'partner':
        case 'dev':
            return normalized;
        case 'dispatcher':
        case 'driver':
            return 'staff';
        case 'rider':
        case 'customer':
            return 'user';
        default:
            return null;
    }
}

function normalizeOpRole(value: unknown): string | null {
    const normalized = String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/-/g, '_')
        .replace(/\s+/g, '_');

    switch (normalized) {
        case 'dispatcher':
        case 'driver':
        case 'rider':
        case 'customer':
        case 'service':
        case 'rep':
        case 'manager':
        case 'supervisor':
            return normalized;
        case 'representative':
            return 'rep';
        case 'supervisors':
            return 'supervisor';
        default:
            return null;
    }
}

export function parseOpRoles(value: unknown): string[] {
    if (value == null) return [];
    const items = Array.isArray(value)
        ? value
        : String(value)
            .split(/[;,]/)
            .map((item) => item.trim())
            .filter(Boolean);

    return [...new Set(items.map(normalizeOpRole).filter((item): item is string => !!item))];
}

export function normalizeClaimsShape(input: Record<string, unknown>): Record<string, unknown> {
    const nextClaims = { ...input };
    const opRoles = new Set([
        ...parseOpRoles(nextClaims.oprole),
        ...parseOpRoles(nextClaims.oproles)
    ]);

    for (const key of ['dispatcher', 'driver', 'rider', 'customer', 'service', 'rep', 'manager', 'supervisor']) {
        if (nextClaims[key] === true) {
            opRoles.add(key);
        }
    }

    const categoryRole =
        normalizeCategoryRole(nextClaims.roleCategory) ??
        normalizeCategoryRole(nextClaims.role);

    if (categoryRole) {
        nextClaims.role = categoryRole;
    }

    delete nextClaims.roleCategory;
    delete nextClaims.oproles;

    if (opRoles.size > 0) {
        nextClaims.oprole = [...opRoles];
    } else if ('oprole' in nextClaims) {
        delete nextClaims.oprole;
    }

    if ('owner' in nextClaims) {
        nextClaims.owner = parseLooseClaimValue(nextClaims.owner);
    }

    return nextClaims;
}

export function stripManagedClaims(input: Record<string, unknown>): Record<string, unknown> {
    const nextClaims = { ...input };
    for (const key of MANAGED_CLAIM_KEYS) {
        delete nextClaims[key];
    }
    return nextClaims;
}

export function buildPresetClaims(params: {
    role?: string;
    owner?: string;
    opRole?: string;
    extraClaims?: Record<string, unknown>;
}): Record<string, unknown> {
    const payload: Record<string, unknown> = { ...(params.extraClaims || {}) };

    const role = String(params.role || '').trim();
    if (role) {
        payload.role = role;
    }

    const owner = String(params.owner || '').trim();
    if (owner) {
        payload.owner = parseLooseClaimValue(owner);
    }

    const opRoles = parseOpRoles(params.opRole || '');
    if (opRoles.length > 0) {
        payload.oprole = opRoles;
    }

    return normalizeClaimsShape(payload);
}

export function applyClaimPreset(existingClaims: Record<string, unknown>, preset: ClaimPreset): Record<string, unknown> {
    if (preset.applyMode === 'replace-all') {
        return normalizeClaimsShape({ ...preset.claims });
    }

    return normalizeClaimsShape({
        ...stripManagedClaims(existingClaims),
        ...preset.claims
    });
}

export function normalizeImportedPreset(input: Record<string, unknown>, source: ClaimPresetSource = 'custom'): ClaimPreset | null {
    const id = String(input.id ?? '').trim();
    const name = String(input.name ?? '').trim();
    if (!id || !name) return null;

    const claims = normalizeClaimsShape(
        typeof input.claims === 'object' && input.claims !== null && !Array.isArray(input.claims)
            ? input.claims as Record<string, unknown>
            : {}
    );

    return {
        id,
        name,
        description: String(input.description ?? '').trim() || 'Imported claim preset',
        source,
        applyMode: input.applyMode === 'replace-all' ? 'replace-all' : 'managed-merge',
        claims,
        role: typeof claims.role === 'string' ? claims.role : undefined,
        owner: typeof claims.owner === 'boolean' || typeof claims.owner === 'string'
            ? claims.owner as boolean | string
            : undefined,
        opRole: Array.isArray(claims.oprole) ? claims.oprole.map((value) => String(value)) : undefined,
        readonly: source === 'first-party',
        theme: typeof input.theme === 'string' ? input.theme as ClaimPreset['theme'] : 'default',
        updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : Date.now()
    };
}
