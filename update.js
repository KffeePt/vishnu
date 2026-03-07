const { execSync } = require('child_process');
const fs = require('fs');

console.log('\n🔄 Vishnu Update System');
console.log('=======================');

const vishnuDir = __dirname;
// This script assumes it's inside `vishnu/`

// Check if Git Repo
if (!fs.existsSync('.git')) {
    console.log('❌ This Vishnu installation is not a Git repository.');
    console.log('   Please re-install using setup.bat to enable updates.');
    process.exit(1);
}

try {
    console.log('⬇️  Pulling latest changes...');
    execSync('git pull origin main', { cwd: vishnuDir, stdio: 'inherit' });
    console.log('✅ Update/Pull complete.');
    console.log('👉 Ensure you run `node install.js` if dependencies changed.');
} catch (e) {
    console.log('❌ Update failed.', e.message);
}
