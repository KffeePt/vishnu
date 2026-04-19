import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import chalk from 'chalk';

const INSTALL_CONFIG_PATH = path.join(os.homedir(), '.vishnu', 'install.json');
const DASHBOARD_URL = 'https://vishnu-ruddy-tau.vercel.app';

export interface IntegrityAssetStatus {
    installersPresent: boolean;
    checksumsPresent: boolean;
    signaturesPresent: boolean;
    missingAssets: string[];
}

export function inspectReleaseAssetIntegrity(assetNames: string[]): IntegrityAssetStatus {
    const requiredAssets = [
        'vishnu-installer.exe',
        'vishnu-installer.sh'
    ];
    const requiredChecksums = requiredAssets.map((name) => `${name}.sha256`);
    const requiredSignatures = requiredAssets.map((name) => `${name}.asc`);

    const allAssets = new Set(assetNames.map((name) => String(name || '').trim()).filter(Boolean));
    const missingInstallers = requiredAssets.filter((name) => !allAssets.has(name));
    const missingChecksums = requiredChecksums.filter((name) => !allAssets.has(name));
    const missingSignatures = requiredSignatures.filter((name) => !allAssets.has(name));

    return {
        installersPresent: missingInstallers.length === 0,
        checksumsPresent: missingChecksums.length === 0,
        signaturesPresent: missingSignatures.length === 0,
        missingAssets: [
            ...missingInstallers,
            ...missingChecksums,
            ...missingSignatures
        ]
    };
}

function runCommand(command: string, args: string[], cwd: string): string {
    return execFileSync(command, args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
}

function tryRunCommand(command: string, args: string[], cwd: string): string | null {
    try {
        return runCommand(command, args, cwd);
    } catch {
        return null;
    }
}

function readManagedInstall(): any | null {
    try {
        if (!fs.existsSync(INSTALL_CONFIG_PATH)) {
            return null;
        }
        return JSON.parse(fs.readFileSync(INSTALL_CONFIG_PATH, 'utf8'));
    } catch {
        return null;
    }
}

function resolveIntegrityRoot(): string {
    if (process.env.VISHNU_ROOT?.trim()) {
        return path.resolve(process.env.VISHNU_ROOT);
    }

    const managed = readManagedInstall();
    if (managed?.rootPath && fs.existsSync(managed.rootPath)) {
        return path.resolve(managed.rootPath);
    }

    return process.cwd();
}

export async function runIntegrityViewer(repoRoot = resolveIntegrityRoot()): Promise<void> {
    console.clear();
    console.log(chalk.bold.cyan('\n🛡️  Vishnu Integrity Check'));
    console.log(chalk.gray('------------------------------------------------------------'));
    console.log(chalk.gray(`Repo root: ${repoRoot}`));
    console.log(chalk.gray(`Dashboard: ${DASHBOARD_URL}`));

    const managedInstall = readManagedInstall();
    const gitStatus = tryRunCommand('git', ['status', '--porcelain'], repoRoot);
    const branch = tryRunCommand('git', ['branch', '--show-current'], repoRoot) || 'unknown';
    const currentTag = tryRunCommand('git', ['tag', '--points-at', 'HEAD'], repoRoot)
        ?.split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) || '';

    const cleanWorktree = gitStatus !== null && gitStatus === '';
    console.log(`${chalk.bold('Managed install:')} ${managedInstall?.rootPath ? chalk.green('yes') : chalk.yellow('no install marker found')}`);
    if (managedInstall?.tag) {
        console.log(`${chalk.bold('Installed release tag:')} ${managedInstall.tag}`);
    }
    console.log(`${chalk.bold('Current branch:')} ${branch}`);
    console.log(`${chalk.bold('Exact tag on HEAD:')} ${currentTag || chalk.yellow('none')}`);
    console.log(`${chalk.bold('Local worktree:')} ${cleanWorktree ? chalk.green('clean / unaltered') : chalk.red('modified')}`);

    let releaseAssetStatus: IntegrityAssetStatus | null = null;
    if (currentTag) {
        const releaseJson = tryRunCommand('gh', ['release', 'view', currentTag, '--json', 'assets'], repoRoot);
        if (releaseJson) {
            try {
                const parsed = JSON.parse(releaseJson);
                const assetNames = Array.isArray(parsed.assets)
                    ? parsed.assets.map((asset: any) => asset?.name).filter(Boolean)
                    : [];
                releaseAssetStatus = inspectReleaseAssetIntegrity(assetNames);
            } catch {
                releaseAssetStatus = null;
            }
        }
    }

    console.log(chalk.gray('------------------------------------------------------------'));
    if (!currentTag) {
        console.log(chalk.yellow('No exact release tag is checked out on this copy, so release-signature verification is not available.'));
    } else if (!releaseAssetStatus) {
        console.log(chalk.yellow(`GitHub release metadata for ${currentTag} could not be loaded. Make sure gh is installed and authenticated.`));
    } else {
        console.log(`${chalk.bold('Release installers:')} ${releaseAssetStatus.installersPresent ? chalk.green('present') : chalk.red('missing assets')}`);
        console.log(`${chalk.bold('SHA-256 files:')} ${releaseAssetStatus.checksumsPresent ? chalk.green('present') : chalk.red('missing checksums')}`);
        console.log(`${chalk.bold('GPG .asc signatures:')} ${releaseAssetStatus.signaturesPresent ? chalk.green('present') : chalk.red('missing signatures')}`);
        if (releaseAssetStatus.missingAssets.length > 0) {
            console.log(chalk.yellow('Missing release assets:'));
            for (const assetName of releaseAssetStatus.missingAssets) {
                console.log(chalk.gray(`  - ${assetName}`));
            }
        }
    }

    const overallIntegrityOk = cleanWorktree && !!releaseAssetStatus?.checksumsPresent && !!releaseAssetStatus?.signaturesPresent;
    console.log(chalk.gray('------------------------------------------------------------'));
    console.log(`${chalk.bold('Overall integrity:')} ${overallIntegrityOk ? chalk.green('signed and unaltered') : chalk.yellow('needs attention')}`);
}
