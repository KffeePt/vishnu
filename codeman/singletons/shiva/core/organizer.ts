import fs from 'fs';
import path from 'path';
import { Colors } from './utils';


function processArchivedTasks(docsRoot: string, silent: boolean = false): string[] {
    const targetRoot = path.join(docsRoot, 'archived_tasks');
    if (!fs.existsSync(targetRoot)) {
        return [];
    }

    // Regex: slug_YYYYMMDDTHHMMSS.md
    const pattern = /^(.*)_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.md$/;
    let filesProcessed = 0;
    const results: string[] = [];

    try {
        const entries = fs.readdirSync(targetRoot, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.md')) {
                const match = entry.name.match(pattern);
                if (match) {
                    const [, slug, year, month, day, hour, minute, second] = match;
                    const folderName = `${year}-${month}-${day}`;
                    const folderPath = path.join(targetRoot, folderName);

                    if (!fs.existsSync(folderPath)) {
                        fs.mkdirSync(folderPath, { recursive: true });
                        if (!silent) {
                            results.push(`${Colors.CYAN}[CREATED]${Colors.ENDC} Folder: ${folderName}`);
                        }
                    }

                    const newFilename = `${slug}_${hour}-${minute}-${second}.md`;
                    const destPath = path.join(folderPath, newFilename);

                    try {
                        const oldPath = path.join(targetRoot, entry.name);
                        fs.renameSync(oldPath, destPath);

                        const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
                        results.push(
                            `[${timeStr}] ${Colors.MAGENTA}[TASK]${Colors.ENDC} Sorted: ${Colors.CYAN}${entry.name}${Colors.ENDC} -> ${Colors.GREEN}archived_tasks\\${folderName}\\${newFilename}${Colors.ENDC}`
                        );
                        filesProcessed++;
                    } catch (e) {
                        results.push(`${Colors.RED}[ERROR]${Colors.ENDC} Failed to move ${entry.name}: ${e}`);
                    }
                }
            }
        }
    } catch (e) {
        results.push(`${Colors.RED}[ERROR]${Colors.ENDC} Scan archived_tasks failed: ${e}`);
    }

    return results;
}

function processFixes(docsRoot: string, silent: boolean = false): string[] {
    const targetRoot = path.join(docsRoot, 'fixes');
    if (!fs.existsSync(targetRoot)) return [];

    // pattern: fix_slug_YYYYMMDDTHHMMSS.md
    // Note: slug might contain underscores, so we use greedy match for slug up to timestamp
    // Assuming standard format as requested: fix_[slug]_[timestamp].md
    const pattern = /^fix_(.*)_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.md$/;
    const results: string[] = [];

    try {
        const entries = fs.readdirSync(targetRoot, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.md')) {
                const match = entry.name.match(pattern);
                if (match) {
                    const [, slug, year, month, day, hour, minute, second] = match;
                    const folderName = `${year}-${month}-${day}`;
                    const folderPath = path.join(targetRoot, folderName);

                    if (!fs.existsSync(folderPath)) {
                        fs.mkdirSync(folderPath, { recursive: true });
                    }

                    const newFilename = `fix_${slug}_${hour}-${minute}-${second}.md`;
                    const destPath = path.join(folderPath, newFilename);

                    try {
                        fs.renameSync(path.join(targetRoot, entry.name), destPath);
                        const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
                        results.push(
                            `[${timeStr}] ${Colors.BLUE}[FIX]${Colors.ENDC} Sorted: ${Colors.CYAN}${entry.name}${Colors.ENDC} -> ${Colors.GREEN}fixes\\${folderName}\\${newFilename}${Colors.ENDC}`
                        );
                    } catch (e) {
                        results.push(`${Colors.RED}[ERROR]${Colors.ENDC} Fix move failed: ${e}`);
                    }
                }
            }
        }
    } catch (e) {
        results.push(`${Colors.RED}[ERROR]${Colors.ENDC} Scan fixes failed: ${e}`);
    }
    return results;
}

function processBuilds(docsRoot: string, silent: boolean = false): string[] {
    const targetRoot = path.join(docsRoot, 'builds');
    if (!fs.existsSync(targetRoot)) return [];

    // pattern: build_[status]_[YYYYMMDDTHHMMSS].md
    // status is typically 'success' or 'failure', but could be 'timeout' etc.
    // The previous part (slug) is now just 'status'. 
    // Wait, naming convention: build_[status]_[timestamp].md
    // Regex: build_([^_]+)_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.md
    const pattern = /^build_([^_]+)_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.md$/;
    const results: string[] = [];

    try {
        const entries = fs.readdirSync(targetRoot, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.md')) {
                const match = entry.name.match(pattern);
                if (match) {
                    const [, status, year, month, day, hour, minute, second] = match;

                    // Folder: builds/(success|failure)/YYYY-MM-DD
                    // Status might be non-standard, but we map it or use as is. 
                    // Requirement: "success and failure sub folder"
                    // If status is 'success', goes to builds/success/...
                    // If status is 'failure', goes to builds/failure/...
                    // If other? Maybe just builds/other/... or default to status name.

                    const dateFolder = `${year}-${month}-${day}`;
                    // Normalize status folder?
                    const statusFolder = status.toLowerCase();

                    const finalFolderPath = path.join(targetRoot, statusFolder, dateFolder);

                    if (!fs.existsSync(finalFolderPath)) {
                        fs.mkdirSync(finalFolderPath, { recursive: true });
                    }

                    // New: build_[status]_[HH-MM-SS].md ? 
                    // Or keep full name? User said "storing the the tiemstamped fodlers like the archived_tasks".
                    // Archived tasks renames to [slug]_[H-M-S].md inside the date folder.
                    // Here slug is 'status'. 
                    // So: build_success_HH-MM-SS.md
                    const newFilename = `build_${status}_${hour}-${minute}-${second}.md`;
                    const destPath = path.join(finalFolderPath, newFilename);

                    try {
                        fs.renameSync(path.join(targetRoot, entry.name), destPath);
                        const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
                        results.push(
                            `[${timeStr}] ${Colors.YELLOW}[BUILD]${Colors.ENDC} Sorted: ${Colors.CYAN}${entry.name}${Colors.ENDC} -> ${Colors.GREEN}builds\\${statusFolder}\\${dateFolder}\\${newFilename}${Colors.ENDC}`
                        );
                    } catch (e) {
                        results.push(`${Colors.RED}[ERROR]${Colors.ENDC} Build move failed: ${e}`);
                    }
                }
            }
        }
    } catch (e) {
        results.push(`${Colors.RED}[ERROR]${Colors.ENDC} Scan builds failed: ${e}`);
    }
    return results;
}

export function runOrganizerCycle(docsRoot: string): string[] {
    const logs: string[] = [];
    logs.push(...processArchivedTasks(docsRoot));
    logs.push(...processFixes(docsRoot));
    logs.push(...processBuilds(docsRoot));
    return logs;
}
