import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n🔄 Vishnu Update System');
console.log('=======================');

const vishnuDir = __dirname;

if (!fs.existsSync(path.join(vishnuDir, '.git'))) {
    console.log('❌ This Vishnu installation is not a Git repository.');
    console.log('   Please re-install using the installer to enable updates.');
    process.exit(1);
}

try {
    let currentVersion = 'unknown';
    const versionPath = path.join(vishnuDir, 'version.json');
    if (fs.existsSync(versionPath)) {
        const localMeta = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
        currentVersion = localMeta.version;
    }

    console.log(`📡 Current version: ${currentVersion}`);
    console.log('⬇️  Fetching updates...');
    
    // Fetch latest tags/commits
    execSync('git fetch origin main', { cwd: vishnuDir, stdio: 'inherit' });
    
    // Try to read remote version
    let remoteVersion = 'unknown';
    try {
        const remoteMetaRaw = execSync('git show origin/main:version.json', { cwd: vishnuDir, stdio: 'pipe' }).toString();
        const remoteMeta = JSON.parse(remoteMetaRaw);
        remoteVersion = remoteMeta.version;
    } catch(e) { /* ignore if fails */ }

    if (remoteVersion !== 'unknown' && currentVersion !== remoteVersion) {
        console.log(`\n✨ Update available! (${currentVersion} -> ${remoteVersion})`);
    }

    console.log('\n⬇️  Pulling changes...');
    execSync('git pull origin main', { cwd: vishnuDir, stdio: 'inherit' });
    
    if (remoteVersion !== 'unknown' && currentVersion !== remoteVersion) {
        console.log(`\n✅ Successfully updated to v${remoteVersion}.`);
        console.log(`👉 Check out the changelog: https://github.com/KffeePt/vishnu/releases/latest`);
    } else {
        console.log('\n✅ Already up to date.');
    }
    
    console.log('👉 Ensure you run `npm install` if dependencies changed.');
} catch (e) {
    console.error('❌ Update failed.', e.message);
    process.exit(1);
}
