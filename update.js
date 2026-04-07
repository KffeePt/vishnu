import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    STABLE_BRANCH_NAME,
    STABLE_RELEASE_DOWNLOADS,
    compareVersions,
    getCurrentBranch,
    installRootDependencies,
    isInstallerVersionCompatible,
    isManagedRepo,
    readManagedInstall,
    readVersionMetadata,
    resolveStableRelease,
    syncRepoToStableTag,
    writeManagedInstall
} from './release-channel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const launchMode = process.argv.includes('--launch');
const verbose = !launchMode || process.argv.includes('--verbose');

function log(message) {
    if (verbose) {
        console.log(message);
    }
}

function stableDownloadHint() {
    return process.platform === 'win32'
        ? STABLE_RELEASE_DOWNLOADS.windows
        : STABLE_RELEASE_DOWNLOADS.unix;
}

if (!fs.existsSync(path.join(__dirname, '.git'))) {
    console.error('This Vishnu installation is not a Git repository.');
    process.exit(1);
}

const installInfo = readManagedInstall();

if (!isManagedRepo(__dirname, installInfo)) {
    log('Skipping release-channel update because this repo is not the managed stable install.');
    process.exit(0);
}

try {
    const currentMetadata = readVersionMetadata(__dirname) ?? {};
    const currentVersion = currentMetadata.version ?? 'unknown';
    const currentBranch = getCurrentBranch(__dirname) || '(detached)';

    log('\nVishnu Stable Release Updater');
    log('=============================');
    log(`Current version: ${currentVersion}`);
    log(`Current branch: ${currentBranch}`);

    const { tag: targetTag, metadata: targetMetadata } = resolveStableRelease(__dirname);
    const targetVersion = targetMetadata.version ?? targetTag.replace(/^v/i, '');
    const installerVersion = installInfo?.installerVersion ?? currentMetadata.min_installer_version ?? '0.0.0';
    const minInstallerVersion = targetMetadata.min_installer_version ?? '0.0.0';

    if (!isInstallerVersionCompatible(installerVersion, minInstallerVersion)) {
        console.error(`This installation was created with installer ${installerVersion}, but release ${targetTag} requires installer ${minInstallerVersion} or newer.`);
        console.error(`Download the latest stable installer here: ${stableDownloadHint()}`);
        process.exit(1);
    }

    const isUpToDate = currentVersion === targetVersion && currentBranch === STABLE_BRANCH_NAME;
    if (isUpToDate) {
        log('Already on the latest stable release.');
        process.exit(0);
    }

    console.log(`Updating Vishnu to stable release ${targetTag}...`);
    syncRepoToStableTag(__dirname, targetTag);
    installRootDependencies(__dirname);

    writeManagedInstall({
        ...installInfo,
        channel: 'stable',
        installerVersion,
        installedAt: new Date().toISOString(),
        installedVersion: targetVersion,
        rootPath: __dirname,
        tag: targetTag
    });

    if (compareVersions(targetVersion, currentVersion === 'unknown' ? targetVersion : currentVersion) > 0) {
        console.log(`Updated Vishnu from ${currentVersion} to ${targetVersion}.`);
    } else {
        console.log(`Aligned Vishnu to the managed stable branch at ${targetTag}.`);
    }
} catch (error) {
    console.error('Stable update failed.', error instanceof Error ? error.message : error);
    process.exit(1);
}
