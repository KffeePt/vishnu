import fs from 'fs';
import path from 'path';

/**
 * Parses firestore.rules to extract all explicitly defined collections.
 * This establishes the rules file as the single source of truth for whitelisted collections.
 */
export function getWhitelistedCollections(): string[] {
    try {
        const rulesPath = path.join(process.cwd(), 'firestore.rules');
        const rulesContent = fs.readFileSync(rulesPath, 'utf8');

        const collections = new Set<string>();
        // Match patterns like: match /users/{userId} or match /app-config/{document=**}
        const regex = /match\s+\/([a-zA-Z0-9_-]+)\//g;

        let match;
        while ((match = regex.exec(rulesContent)) !== null) {
            collections.add(match[1]);
        }

        // 'databases' is the root namespace in Firestore rules, not a collection
        collections.delete('databases');

        return Array.from(collections);
    } catch (error) {
        console.error('Failed to parse firestore.rules for whitelist:', error);
        // Fallback or empty if totally missing
        return [];
    }
}
