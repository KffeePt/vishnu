import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import process from 'process';
import { Colors, getRainbowColor, clearScreen, sleep } from './core/utils';
import { initDocsStructure } from './core/docs-init';
import { runOrganizerCycle } from './core/organizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { ProcessRegistryManager } from '../../managers/process-registry-manager';

interface LogMessage {
    id: string; // Unique ID to track messages
    text: string;
    expiresAt: number;
}

// Global state for simple TUI
let recentLogs: LogMessage[] = [];
let offset = 0.0; // For rainbow animation

function printSeparator(width: number): string {
    const line = "━".repeat(width);
    let buffer = '';
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const color = getRainbowColor(0, i, 0.5);
        buffer += `${color}${char}`;
    }
    buffer += `${Colors.ENDC}\n`;
    return buffer;
}

// Replaces printBannerAnimated with a full frame render
function renderDashboard(monitorPath: string, docsRoot: string) {
    const columns = process.stdout.columns || 80;

    // Buffer output to avoid flickering
    let output = '\x1b[H'; // Move cursor to Home (0,0)

    // --- ARTWORK ---
    const asciiArt = [
        "  █████████  █████       ███                       ",
        " ███▒▒▒▒▒███▒▒███       ▒▒▒                        ",
        "▒███    ▒▒▒  ▒███████   ████  █████ █████  ██████  ",
        "▒▒█████████  ▒███▒▒███ ▒▒███ ▒▒███ ▒▒███  ▒▒▒▒▒███ ",
        " ▒▒▒▒▒▒▒▒███ ▒███ ▒███  ▒███  ▒███  ▒███   ███████ ",
        " ███    ▒███ ▒███ ▒███  ▒███  ▒▒███ ███   ███▒▒███ ",
        "▒▒█████████  ████ █████ █████  ▒▒█████   ▒▒████████",
        " ▒▒▒▒▒▒▒▒▒  ▒▒▒▒ ▒▒▒▒▒ ▒▒▒▒▒    ▒▒▒▒▒     ▒▒▒▒▒▒▒▒ ",
        "                                                   "
    ];

    const artWidth = asciiArt[0].length;
    const paddingLen = Math.max(0, Math.floor((columns - artWidth) / 2));
    const padding = " ".repeat(paddingLen);

    output += "\n";
    output += printSeparator(columns);
    output += "\n";

    // Draw Art
    for (const line of asciiArt) {
        output += padding;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            // Calculate Color Inline
            const freq = 0.3;
            // Intensity check from original loop logic
            const intensity = char === '▒' ? 0.4 : 1.0;
            const width = 127 * intensity;
            const center = 128 * intensity;

            const r = Math.floor(Math.sin(freq * i + offset) * width + center);
            const g = Math.floor(Math.sin(freq * i + offset + 2 * Math.PI / 3) * width + center);
            const b = Math.floor(Math.sin(freq * i + offset + 4 * Math.PI / 3) * width + center);

            if (char === ' ') {
                output += `${Colors.ENDC} `;
            }
            else if (char === '█') {
                // Set BOTH FG and BG to same color to fix thin line artifacts
                output += `\x1b[38;2;${r};${g};${b}m\x1b[48;2;${r};${g};${b}m${char}`;
            }
            else {
                // For ▒ or others, just FG, keep BG default (likely black)
                output += `\x1b[38;2;${r};${g};${b}m\x1b[49m${char}`;
            }
        }
        output += `${Colors.ENDC}\n`;
    }

    output += "\n";

    // --- HEADER ---
    const C_BUILDS = Colors.YELLOW;
    const C_FIXES = Colors.MAGENTA;
    const C_TASKS = Colors.CYAN;
    const RESET = Colors.ENDC;

    // Rainbow header
    const headerText = ">>> SHIVA PROTOCOL ACTIVE: ORGANIZING CHAOS...";
    output += "  ";
    for (let i = 0; i < headerText.length; i++) {
        const color = getRainbowColor(offset + 2.0, i, 1.0);
        output += `${color}${headerText[i]}`;
    }
    output += `${RESET}\n`;

    // Status line
    const statusText = ">>> STATUS: ";
    output += "  ";
    for (let i = 0; i < statusText.length; i++) {
        const color = getRainbowColor(offset + 2.5, i, 1.0);
        output += `${color}${statusText[i]}`;
    }
    output += `${Colors.GREEN}MONITORING...${RESET}\n`;

    // Monitoring path
    const folderName = path.basename(monitorPath);
    const monitoredPath = `MONITORING: ${folderName}`;
    const pPadding = Math.max(0, Math.floor((columns - monitoredPath.length) / 2));
    output += `${Colors.CYAN}${" ".repeat(pPadding)}${monitoredPath}${Colors.ENDC}\n\n`;

    // --- FOLDER STATS ---
    const buildPath = path.join(docsRoot, 'builds');
    const fixesPath = path.join(docsRoot, 'fixes');
    const tasksPath = path.join(docsRoot, 'archived_tasks');

    const getStatus = (p: string) => fs.existsSync(p) ? `${Colors.GREEN}[FOUND]${RESET}` : `${Colors.RED}[MISSING]${RESET}`;

    const buildsLabel = "Builds: ";
    const fixesLabel = "   Fixes: ";
    const tasksLabel = "   Tasks: ";
    // We strip ansi for length calc
    const visibleLength = buildsLabel.length + 7 + fixesLabel.length + 7 + tasksLabel.length + 7; // [FOUND] is 7 chars
    const statusPadding = Math.max(0, Math.floor((columns - visibleLength) / 2));

    const statusLine = `${C_BUILDS}${buildsLabel}${getStatus(buildPath)}${C_FIXES}${fixesLabel}${getStatus(fixesPath)}${C_TASKS}${tasksLabel}${getStatus(tasksPath)}`;
    output += " ".repeat(statusPadding) + statusLine + "\n\n";

    output += printSeparator(columns);
    output += "\n";

    // --- LOGS AREA ---
    if (recentLogs.length === 0) {
        const noActivity = "No recent activity...";
        const naPadding = Math.max(0, Math.floor((columns - noActivity.length) / 2));
        output += `${Colors.WHITE}${" ".repeat(naPadding)}${noActivity}${Colors.ENDC}\n`;
    } else {
        for (const log of recentLogs) {
            const timeLeft = Math.ceil((log.expiresAt - Date.now()) / 1000);
            // Optional: Show timer? User just said "disappear after 60s"
            // Let's just show the text.
            output += ` ${log.text} ${Colors.WHITE}(${timeLeft}s)${Colors.ENDC}\n`;
        }
    }

    // Clear everything below
    output += '\x1b[J';

    process.stdout.write(output);
}

async function main() {
    const rawTarget = process.argv[2] || process.cwd();
    const targetRoot = path.resolve(rawTarget);

    try {
        process.chdir(targetRoot);
    } catch (e) {
        console.error(Colors.RED + `Failed to switch to target directory: ${targetRoot}` + Colors.ENDC);
    }

    ProcessRegistryManager.killConflicting('shiva', targetRoot, process.pid);
    ProcessRegistryManager.register('shiva', process.pid, targetRoot);

    const cleanup = () => {
        process.stdout.write('\x1b[?25h'); // Show cursor
        ProcessRegistryManager.unregister('shiva', targetRoot);
    };

    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });

    const docsRoot = path.join(targetRoot, 'docs');
    initDocsStructure(docsRoot);

    // Initial clear and hide cursor
    process.stdout.write('\x1b[?25l');
    clearScreen();

    let lastLogicRun = 0;
    const LOGIC_INTERVAL = 1000;
    const TARGET_FPS = 60;
    const FRAME_TIME = Math.floor(1000 / TARGET_FPS);

    // Loop
    while (true) {
        try {
            const now = Date.now();

            // 1. Run Logic (Throttled)
            if (now - lastLogicRun > LOGIC_INTERVAL) {
                lastLogicRun = now;
                const logs = runOrganizerCycle(docsRoot);

                // Add new logs
                for (const text of logs) {
                    recentLogs.push({
                        id: Math.random().toString(36).substring(7),
                        text: text,
                        expiresAt: now + 60000 // 60s TTL
                    });
                }

                // Prune expired
                recentLogs = recentLogs.filter(l => l.expiresAt > Date.now());
            }

            // 2. Render (Every Frame)
            renderDashboard(targetRoot, docsRoot);

            // 3. Update animation state (Smoother increment)
            offset += 0.05;

            // 4. Wait
            await sleep(FRAME_TIME);
        } catch (e: any) {
            // If crash, print and retry
            recentLogs.push({
                id: "error-" + Date.now(),
                text: `${Colors.RED}[CRITICAL ERROR] ${e.message}${Colors.ENDC}`,
                expiresAt: Date.now() + 10000
            });
            await sleep(1000);
        }
    }
}

(async () => {
    try {
        await main();
    } catch (err) {
        console.error('CRITICAL SHIVA BOOT ERROR:', err);
        process.exit(1);
    }
})();
