import fs from 'fs';
import path from 'path';
import { Colors } from './utils';

function processDatedFolder(
    docsRoot: string,
    folderName: string,
    label: string,
    labelColor: string
): string[] {
    const targetRoot = path.join(docsRoot, folderName);
    if (!fs.existsSync(targetRoot)) {
        return [];
    }

    // Pattern: slug_YYYYMMDDTHHMMSS.md
    const pattern = /^(.*)_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.md$/;
    const results: string[] = [];

    try {
        const entries = fs.readdirSync(targetRoot, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

            const match = entry.name.match(pattern);
            if (!match) continue;

            const [, slug, year, month, day, hour, minute, second] = match;
            const folderDate = `${year}-${month}-${day}`;
            const folderPath = path.join(targetRoot, folderDate);

            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }

            const newFilename = `${slug}_${hour}-${minute}-${second}.md`;
            const destPath = path.join(folderPath, newFilename);

            try {
                fs.renameSync(path.join(targetRoot, entry.name), destPath);
                const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
                results.push(
                    `[${timeStr}] ${labelColor}[${label}]${Colors.ENDC} Sorted: ${Colors.CYAN}${entry.name}${Colors.ENDC} -> ${Colors.GREEN}${folderName}\\${folderDate}\\${newFilename}${Colors.ENDC}`
                );
            } catch (e) {
                results.push(`${Colors.RED}[ERROR]${Colors.ENDC} Failed to move ${entry.name}: ${e}`);
            }
        }
    } catch (e) {
        results.push(`${Colors.RED}[ERROR]${Colors.ENDC} Scan ${folderName} failed: ${e}`);
    }

    return results;
}

export function runOrganizerCycle(docsRoot: string): string[] {
    const logs: string[] = [];
    logs.push(...processDatedFolder(docsRoot, 'tasks', 'TASK', Colors.CYAN));
    logs.push(...processDatedFolder(docsRoot, 'git', 'GIT', Colors.YELLOW));
    logs.push(...processDatedFolder(docsRoot, 'audits', 'AUDIT', Colors.MAGENTA));
    return logs;
}
