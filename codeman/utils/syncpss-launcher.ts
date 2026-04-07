import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import chalk from 'chalk';

import { ProcessManager } from '../core/process-manager';

export const SYNC_PSS_SHORTCUT_PATH = path.join(
    os.homedir(),
    'AppData',
    'Roaming',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'syncpss.lnk'
);

export async function launchSyncPssFromShortcut(): Promise<boolean> {
    if (process.platform !== 'win32') {
        console.log(chalk.red('\n❌ SyncPss is only available through the Windows shortcut on this machine.'));
        return false;
    }

    if (!fs.existsSync(SYNC_PSS_SHORTCUT_PATH)) {
        console.log(chalk.red('\n❌ The SyncPss Start Menu shortcut was not found.'));
        console.log(chalk.gray(`   Expected: ${SYNC_PSS_SHORTCUT_PATH}`));
        return false;
    }

    console.log(chalk.blue('\n🚀 Opening SyncPss from the Start Menu shortcut...'));
    await ProcessManager.spawnDetachedWindow(
        'Open SyncPss',
        `powershell.exe -NoProfile -Command "Start-Process -LiteralPath '${SYNC_PSS_SHORTCUT_PATH}'"`,
        process.cwd()
    );
    return true;
}
