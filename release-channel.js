import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const STABLE_BRANCH_NAME = 'stable';
export const INSTALL_CONFIG_PATH = path.join(os.homedir(), '.vishnu', 'install.json');
export const STABLE_RELEASE_DOWNLOADS = {
    windows: 'https://github.com/KffeePt/vishnu/releases/latest/download/vishnu-installer.exe',
    unix: 'https://github.com/KffeePt/vishnu/releases/latest/download/vishnu-installer.sh'
};

const STABLE_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;

function normalizeVersion(version) {
    return String(version || '').trim().replace(/^v/i, '');
}

export function parseVersion(version) {
    const normalized = normalizeVersion(version);
    const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) {
        return null;
    }

    return match.slice(1).map((part) => Number(part));
}

export function compareVersions(left, right) {
    const leftParts = parseVersion(left);
    const rightParts = parseVersion(right);

    if (!leftParts || !rightParts) {
        throw new Error(`Unable to compare versions "${left}" and "${right}".`);
    }

    for (let index = 0; index < leftParts.length; index += 1) {
        if (leftParts[index] > rightParts[index]) {
            return 1;
        }

        if (leftParts[index] < rightParts[index]) {
            return -1;
        }
    }

    return 0;
}

export function isStableReleaseTag(tag) {
    return STABLE_TAG_PATTERN.test(String(tag || '').trim());
}

export function resolveLatestStableTag(tags) {
    const stableTags = [...tags]
        .map((tag) => String(tag || '').trim())
        .filter((tag) => isStableReleaseTag(tag))
        .sort((left, right) => compareVersions(left, right));

    return stableTags.at(-1) ?? null;
}

export function isInstallerVersionCompatible(installerVersion, minInstallerVersion) {
    if (!minInstallerVersion) {
        return true;
    }

    return compareVersions(installerVersion, minInstallerVersion) >= 0;
}

export function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function readJsonIfExists(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }

        return readJsonFile(filePath);
    } catch {
        return null;
    }
}

export function readManagedInstall() {
    return readJsonIfExists(INSTALL_CONFIG_PATH);
}

export function writeManagedInstall(data) {
    fs.mkdirSync(path.dirname(INSTALL_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(INSTALL_CONFIG_PATH, JSON.stringify(data, null, 2));
}

export function isManagedRepo(repoRoot, installInfo = readManagedInstall()) {
    if (!installInfo?.rootPath || installInfo.channel !== 'stable') {
        return false;
    }

    return path.resolve(installInfo.rootPath) === path.resolve(repoRoot);
}

function runGit(repoRoot, args, options = {}) {
    const { stdio = 'pipe' } = options;
    const output = execFileSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio
    });

    return typeof output === 'string' ? output.trim() : '';
}

export function getCurrentBranch(repoRoot) {
    try {
        return runGit(repoRoot, ['branch', '--show-current']);
    } catch {
        return '';
    }
}

export function fetchReleaseTags(repoRoot, options = {}) {
    const { stdio = 'pipe' } = options;
    runGit(repoRoot, ['fetch', 'origin', '--tags', '--force'], { stdio });
}

export function listReleaseTags(repoRoot) {
    const output = runGit(repoRoot, ['tag', '-l', 'v*']);
    if (!output) {
        return [];
    }

    return output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

export function readVersionMetadata(repoRoot) {
    return readJsonIfExists(path.join(repoRoot, 'version.json'));
}

export function readVersionMetadataAtTag(repoRoot, tag) {
    const raw = runGit(repoRoot, ['show', `${tag}:version.json`]);
    return JSON.parse(raw);
}

export function resolveStableRelease(repoRoot, options = {}) {
    fetchReleaseTags(repoRoot, options);
    const targetTag = resolveLatestStableTag(listReleaseTags(repoRoot));

    if (!targetTag) {
        throw new Error('No stable release tags were found on origin.');
    }

    return {
        tag: targetTag,
        metadata: readVersionMetadataAtTag(repoRoot, targetTag)
    };
}

export function syncRepoToStableTag(repoRoot, tag, options = {}) {
    const { stdio = 'inherit' } = options;
    runGit(repoRoot, ['reset', '--hard'], { stdio });
    runGit(repoRoot, ['checkout', '-B', STABLE_BRANCH_NAME, tag], { stdio });
    runGit(repoRoot, ['reset', '--hard', tag], { stdio });
}

export function npmCommand() {
    return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function installRootDependencies(repoRoot, options = {}) {
    const { stdio = 'inherit' } = options;
    execFileSync(npmCommand(), ['install'], {
        cwd: repoRoot,
        stdio
    });
}
