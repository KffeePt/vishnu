#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'setup', 'output');
const RELEASE_DIR = path.join(ROOT_DIR, 'bin', 'release');
const INSTALLER_FILES = ['vishnu-installer.exe', 'vishnu-installer.sh'];
const CHECKSUM_FILES = INSTALLER_FILES.map((name) => `${name}.sha256`);
const REQUIRED_FILES = [...INSTALLER_FILES, ...CHECKSUM_FILES];
const OPTIONAL_FILES = ['release-manifest.json', ...INSTALLER_FILES.map((name) => `${name}.asc`)];

function log(message) {
    process.stdout.write(`${message}\n`);
}

function fail(message) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}

function safeUnlink(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch {
        // best effort cleanup
    }
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function resolveGpg() {
    const candidates = process.platform === 'win32'
        ? ['gpg.exe', 'gpg']
        : ['gpg'];

    for (const candidate of candidates) {
        const result = spawnSync(candidate, ['--version'], {
            cwd: ROOT_DIR,
            encoding: 'utf8',
            stdio: 'ignore'
        });
        if (!result.error && result.status === 0) {
            return candidate;
        }
    }
    return null;
}

function runGpg(command, args) {
    return spawnSync(command, args, {
        cwd: ROOT_DIR,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
}

function resolveSigningKey(gpgCommand) {
    const envKey = (process.env.VISHNU_GPG_KEY_ID || '').trim();
    if (envKey) {
        return envKey;
    }

    const result = runGpg(gpgCommand, ['--batch', '--with-colons', '--fingerprint', '--list-secret-keys']);
    if (result.status !== 0) {
        return '';
    }

    const lines = String(result.stdout || '').split(/\r?\n/);
    let sawSecretKey = false;
    for (const line of lines) {
        const parts = line.split(':');
        const recordType = parts[0] || '';
        if (recordType === 'sec') {
            sawSecretKey = true;
            continue;
        }
        if (sawSecretKey && recordType === 'fpr') {
            return (parts[9] || '').trim();
        }
    }

    return '';
}

function stageRequiredFiles() {
    ensureDir(RELEASE_DIR);
    for (const fileName of [...REQUIRED_FILES, ...OPTIONAL_FILES]) {
        safeUnlink(path.join(RELEASE_DIR, fileName));
    }

    for (const fileName of REQUIRED_FILES) {
        const sourcePath = path.join(OUTPUT_DIR, fileName);
        const destPath = path.join(RELEASE_DIR, fileName);
        if (!fs.existsSync(sourcePath)) {
            fail(`[FAIL] Missing required release asset: ${sourcePath}`);
        }
        fs.copyFileSync(sourcePath, destPath);
    }
}

function signInstallersIfPossible() {
    const requireSignatures = /^(1|true|yes)$/i.test(process.env.VISHNU_REQUIRE_SIGNATURES || '');
    const gpgCommand = resolveGpg();
    const passphrase = process.env.VISHNU_GPG_PASSPHRASE || '';
    const signatureFiles = [];

    if (!gpgCommand) {
        if (requireSignatures) {
            fail('[FAIL] GPG was not found. Install GPG or set VISHNU_REQUIRE_SIGNATURES=0 before releasing.');
        }
        log('[WARN] GPG was not found. Skipping .asc signature generation.');
        return signatureFiles;
    }

    const keyId = resolveSigningKey(gpgCommand);
    if (!keyId) {
        if (requireSignatures) {
            fail('[FAIL] No GPG secret signing key was found. Import a Gpg4win signing certificate or set VISHNU_GPG_KEY_ID.');
        }
        log('[WARN] No GPG secret signing key was found. Skipping .asc signature generation.');
        return signatureFiles;
    }

    log(`[INFO] Signing release assets with GPG key: ${keyId}`);

    for (const fileName of INSTALLER_FILES) {
        const targetPath = path.join(RELEASE_DIR, fileName);
        const signaturePath = path.join(RELEASE_DIR, `${fileName}.asc`);
        safeUnlink(signaturePath);

        const args = ['--batch', '--yes', '--armor'];
        if (passphrase) {
            args.push('--pinentry-mode', 'loopback', '--passphrase', passphrase);
        }
        args.push('--local-user', keyId);
        args.push('--output', signaturePath, '--detach-sign', targetPath);

        const result = runGpg(gpgCommand, args);
        if (result.status !== 0) {
            safeUnlink(signaturePath);
            const details = String(result.stderr || result.stdout || '').trim();
            if (requireSignatures) {
                fail(`[FAIL] Failed to sign ${fileName}.${details ? ` ${details}` : ''}`);
            }
            log(`[WARN] Failed to sign ${fileName}. Skipping signature.${details ? ` ${details}` : ''}`);
            continue;
        }
        signatureFiles.push(`${fileName}.asc`);
    }

    if (requireSignatures && signatureFiles.length !== INSTALLER_FILES.length) {
        fail('[FAIL] Required signatures were not created for every installer asset.');
    }

    return signatureFiles;
}

function writeManifest(signatureFiles) {
    const manifest = {
        tag: (process.env.VISHNU_RELEASE_TAG || '').trim(),
        version: (process.env.VISHNU_RELEASE_VERSION || '').trim(),
        builtAt: new Date().toISOString(),
        assets: [...REQUIRED_FILES, ...signatureFiles],
        signaturesPresent: signatureFiles.length === INSTALLER_FILES.length
    };

    const manifestPath = path.join(RELEASE_DIR, 'release-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

stageRequiredFiles();
const signatureFiles = signInstallersIfPossible();
writeManifest(signatureFiles);

log('[SUCCESS] Release assets staged in bin/release:');
for (const fileName of fs.readdirSync(RELEASE_DIR).sort()) {
    log(`  - bin/release/${fileName}`);
}
