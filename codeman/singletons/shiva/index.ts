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
    const rows = process.stdout.rows || 24;

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
    const C_TASKS = Colors.CYAN;
    const C_PENDING = Colors.YELLOW;
    const C_GIT = Colors.GREEN;
    const C_AUDITS = Colors.MAGENTA;
    const C_SPECS = Colors.BLUE;
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
    const tasksPath = path.join(docsRoot, 'tasks');
    const pendingPath = path.join(docsRoot, 'pending');
    const gitPath = path.join(docsRoot, 'git');
    const auditsPath = path.join(docsRoot, 'audits');
    const specsPath = path.join(docsRoot, 'specs');

    const getStatus = (p: string) => fs.existsSync(p) ? `${Colors.GREEN}[FOUND]${RESET}` : `${Colors.RED}[MISSING]${RESET}`;

    const tasksLabel = "Tasks: ";
    const pendingLabel = "   Pending: ";
    const gitLabel = "   Git: ";
    const auditsLabel = "   Audits: ";
    const specsLabel = "   Specs: ";
    // We strip ansi for length calc
    const visibleLength =
        tasksLabel.length + 7 +
        pendingLabel.length + 7 +
        gitLabel.length + 7 +
        auditsLabel.length + 7 +
        specsLabel.length + 7; // [FOUND] is 7 chars
    const statusPadding = Math.max(0, Math.floor((columns - visibleLength) / 2));

    const statusLine =
        `${C_TASKS}${tasksLabel}${getStatus(tasksPath)}` +
        `${C_PENDING}${pendingLabel}${getStatus(pendingPath)}` +
        `${C_GIT}${gitLabel}${getStatus(gitPath)}` +
        `${C_AUDITS}${auditsLabel}${getStatus(auditsPath)}` +
        `${C_SPECS}${specsLabel}${getStatus(specsPath)}`;
    output += " ".repeat(statusPadding) + statusLine + "\n\n";

    output += printSeparator(columns);
    output += "\n";

    // --- LOGS AREA ---
    const preLogLines =
        1 + // initial blank
        1 + // separator
        1 + // blank after separator
        asciiArt.length +
        1 + // blank after art
        1 + // header
        1 + // status
        2 + // monitoring path + blank line
        2 + // status line + blank line
        1 + // separator
        1; // blank after separator

    const maxLogs = Math.max(1, rows - preLogLines - 1);
    const logsToShow = recentLogs.slice(-maxLogs);

    if (logsToShow.length === 0) {
        const noActivity = "No recent activity...";
        const naPadding = Math.max(0, Math.floor((columns - noActivity.length) / 2));
        output += `${Colors.WHITE}${" ".repeat(naPadding)}${noActivity}${Colors.ENDC}\n`;
    } else {
        for (const log of logsToShow) {
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

    ProcessRegistryManager.killConflicting('shiva', targetRoot, process.pid, true);
    ProcessRegistryManager.register('shiva', process.pid, targetRoot);

    const cleanup = () => {
        process.stdout.write('\x1b[?25h'); // Show cursor
        ProcessRegistryManager.unregister('shiva', targetRoot);
    };

    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });

    const docsRoot = path.join(targetRoot, 'docs');
    const initLogs = initDocsStructure(docsRoot);

    // Initial clear and hide cursor
    process.stdout.write('\x1b[?25l');
    clearScreen();

    let lastLogicRun = 0;
    const LOGIC_INTERVAL = 1000;
    const TARGET_FPS = 60;
    const FRAME_TIME = Math.floor(1000 / TARGET_FPS);
    let hasRenderedOnce = false;

    const appendLogs = (logs: string[], ttlMs: number = 60000, now: number = Date.now()) => {
        for (const text of logs) {
            recentLogs.push({
                id: Math.random().toString(36).substring(7),
                text,
                expiresAt: now + ttlMs
            });
        }
    };

    // Loop
    while (true) {
        try {
            const now = Date.now();

            // 1. Render first frame immediately to avoid startup flicker
            if (!hasRenderedOnce) {
                renderDashboard(targetRoot, docsRoot);
                hasRenderedOnce = true;
                appendLogs(initLogs);
                await sleep(FRAME_TIME);
                continue;
            }

            // 2. Run Logic (Throttled)
            if (now - lastLogicRun > LOGIC_INTERVAL) {
                lastLogicRun = now;
                const logs = runOrganizerCycle(docsRoot);
                appendLogs(logs, 60000, now);

                // Prune expired
                recentLogs = recentLogs.filter(l => l.expiresAt > Date.now());
            }

            // 3. Render (Every Frame)
            renderDashboard(targetRoot, docsRoot);

            // 4. Update animation state (Smoother increment)
            offset += 0.05;

            // 5. Wait
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
