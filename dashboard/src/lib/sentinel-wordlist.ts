export const ACTION_POOLS = {
    keysReset: [
        'aurora', 'cascade', 'drift', 'eclipse', 'frost', 'glacier', 'halo', 'iris', 'jade', 'krypton',
        'lunar', 'meteor', 'nova', 'oasis', 'pulsar', 'quasar', 'rift', 'stellar', 'tidal', 'umbra'
    ],
    claimsChanged: [
        'beacon', 'compass', 'delta', 'ember', 'gale', 'harbor', 'ignite', 'javelin', 'kinetic', 'lantern',
        'magnet', 'nexus', 'omega', 'pivot', 'quantum', 'radar', 'sonar', 'tracer', 'vector', 'wave'
    ],
    inventoryUpdated: [
        'anchor', 'bridge', 'crest', 'dagger', 'falcon', 'griffin', 'hawk', 'ivory', 'jackal', 'knight',
        'lance', 'mantis', 'nomad', 'onyx', 'panther', 'raven', 'shield', 'talon', 'viper', 'wolf'
    ],
    sessionRevoked: [
        'cipher', 'dusk', 'flare', 'granite', 'herald', 'iron', 'jester', 'karma', 'lotus', 'mirage',
        'neon', 'orchid', 'phantom', 'quartz', 'relic', 'sphinx', 'titan', 'urn', 'vortex', 'wraith'
    ],
    sentinelRotated: [
        'axiom', 'blaze', 'core', 'dawn', 'epoch', 'forge', 'genesis', 'helix', 'icon', 'jewel',
        'key', 'logic', 'matrix', 'node', 'origin', 'pulse', 'quest', 'rune', 'spark', 'token'
    ],
};

export type SentinelAction = keyof typeof ACTION_POOLS;

export interface Codebook {
    version: number;
    mapping: Record<string, SentinelAction>; // e.g., { "aurora": "keysReset" }
    reverseMapping: Record<SentinelAction, string>; // e.g., { "keysReset": "aurora" }
    rotatedAt: number;
    previousHash?: string;
}

/**
 * Generates a completely new codebook by picking a random word from each pool.
 */
export function generateCodebook(currentVersion: number = 0, previousHash?: string): Codebook {
    const mapping: Record<string, SentinelAction> = {};
    const reverseMapping: Partial<Record<SentinelAction, string>> = {};

    for (const [actionStr, pool] of Object.entries(ACTION_POOLS)) {
        const action = actionStr as SentinelAction;
        const randomWord = pool[Math.floor(Math.random() * pool.length)];
        mapping[randomWord] = action;
        reverseMapping[action] = randomWord;
    }

    return {
        version: currentVersion + 1,
        mapping,
        reverseMapping: reverseMapping as Record<SentinelAction, string>,
        rotatedAt: Date.now(),
        previousHash
    };
}

export function encodeAction(action: SentinelAction, codebook: Codebook): string {
    const word = codebook.reverseMapping[action];
    if (!word) throw new Error(`Action ${action} not found in current codebook.`);
    return word;
}

export function decodeAction(codeWord: string, codebook: Codebook): SentinelAction | null {
    return codebook.mapping[codeWord] || null;
}
