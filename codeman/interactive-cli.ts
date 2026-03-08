import 'dotenv/config';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import path from 'path';
import * as os from 'os';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

import { registry } from './core/registry';
import { Engine } from './core/engine';
// Cleaned Imports
import { DocsManagerMenu } from './menus/docs/manager';
import { AuthMenu } from './core/auth-menu';
import { UserManager, UserActionMenu } from './core/users-manager';
import { FirebaseManagerMenu } from './core/firebase-manager';
import { LinkProjectMenu } from './menus/firebase/link-project';
import { ProcessRegistryManager } from './managers/process-registry-manager';


// New Schema System Imports
import { createSchemaMenu } from './core/schema-factory';
import {
  MainMenuDef, ConfigMenuDef, CreateProjectMenuDef,
  AIMenuDef, BoilerplateMenuDef, DevDojoMenuDef,
  DevOpsMenuDef, BuildMenuDef, SettingsMenuDef, UpdateMenuDef
} from './config/menu-map';

// Register Legacy Menus
registry.register(AuthMenu);
registry.register(DocsManagerMenu);
registry.register(UserActionMenu);
registry.register(FirebaseManagerMenu);
registry.register(LinkProjectMenu);

// Register New Schema Menus
registry.register(createSchemaMenu(MainMenuDef));
registry.register(createSchemaMenu(ConfigMenuDef));
registry.register(createSchemaMenu(CreateProjectMenuDef));
registry.register(createSchemaMenu(AIMenuDef));
registry.register(createSchemaMenu(BoilerplateMenuDef));
registry.register(createSchemaMenu(DevDojoMenuDef));
registry.register(createSchemaMenu(DevOpsMenuDef));
registry.register(createSchemaMenu(BuildMenuDef));
registry.register(createSchemaMenu(SettingsMenuDef));
registry.register(createSchemaMenu(UpdateMenuDef));


async function checkEnvAndSetup(forceLauncher: boolean = false): Promise<boolean> {
  const fs = await import('fs');
  const path = await import('path');
  const inquirer = await import('inquirer');
  const { spawn } = await import('child_process');

  const localConfigPath = path.join(process.cwd(), '.codeman.json');
  const envPath = path.join(process.cwd(), '.env');

  // 1. Determine Intent
  let cloudEnabled = false; // Use a temporary variable for determination
  const { state } = await import('./core/state');

  // Check for explicit "cloud_features" flag if configuration exists
  if (fs.existsSync(localConfigPath)) {
    try {
      const conf = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8'));
      if (conf.cloud_features === true) cloudEnabled = true;
    } catch (e) { }
  } else {
    // If .env ALREADY exists, we assume they want cloud features
    if (fs.existsSync(path.join(process.cwd(), '.env'))) {
      cloudEnabled = true;
    }
  }

  // Update Global State
  state.cloudFeaturesEnabled = cloudEnabled;

  // 2b. Force Launcher Mode (Override)
  if (forceLauncher) {
    state.cloudFeaturesEnabled = false;
    return false;
  }

  // 2. If Cloud Features are NOT enabled, we SKIP validation.
  // This enables "Custom Mode" / "Unknown Project" to work without setup.
  if (!cloudEnabled) {
    return false;
  }

  // 3. Validation Logic (Only runs if Cloud Enabled)
  if (!fs.existsSync(envPath)) {
    console.clear();
    console.log(chalk.bold.yellow('\n⚠️  Environment Not Configured (Cloud Features Enabled)'));
    console.log(chalk.gray('   This project is configured to use Cloud/Firebase features but is missing .env.'));
    console.log(chalk.cyan('\n   To configure it automatically, please drop the following files into this folder:'));
    console.log(chalk.white('   - ') + chalk.bold('admin-sdk.json') + chalk.dim(' (Firebase Admin SDK)'));
    console.log(chalk.white('   - ') + chalk.bold('firebase-sdk.js') + chalk.dim(' (Firebase Client SDK)'));
    console.log(chalk.dim('\n   Waiting for files... (Press Ctrl+C to cancel)'));

    // Poll for files
    const adminSdkPath = path.join(process.cwd(), 'admin-sdk.json');
    const clientSdkPath = path.join(process.cwd(), 'firebase-sdk.js');

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const hasAdmin = fs.existsSync(adminSdkPath) && fs.statSync(adminSdkPath).size > 0;
        const hasClient = fs.existsSync(clientSdkPath) && fs.statSync(clientSdkPath).size > 0;

        if (hasAdmin && hasClient) {
          clearInterval(interval);
          console.log(chalk.green('\n✅ Configuration files detected!'));
          setTimeout(resolve, 1000);
        }
      }, 1000);
    });

    // Files found, start interactive setup
    console.log(chalk.blue('\n📝 Configuring Environment...'));

    const { email, geminiKey } = await inquirer.default.prompt([
      {
        type: 'input',
        name: 'email',
        message: 'Enter Owner Email:',
        validate: (input) => input.includes('@') ? true : 'Invalid email'
      },
      {
        type: 'input',
        name: 'geminiKey',
        message: 'Enter Gemini API Key (Optional):',
        default: ''
      }
    ]);

    // Parse files
    const adminConfig = JSON.parse(fs.readFileSync(adminSdkPath, 'utf-8'));
    const clientContent = fs.readFileSync(clientSdkPath, 'utf-8');
    const apiKey = clientContent.match(/apiKey: "(.*)"/)?.[1] || '';
    const authDomain = clientContent.match(/authDomain: "(.*)"/)?.[1] || '';
    const projectId = clientContent.match(/projectId: "(.*)"/)?.[1] || '';
    const storageBucket = clientContent.match(/storageBucket: "(.*)"/)?.[1] || '';
    const messagingSenderId = clientContent.match(/messagingSenderId: "(.*)"/)?.[1] || '';
    const appId = clientContent.match(/appId: "(.*)"/)?.[1] || '';
    const measurementId = clientContent.match(/measurementId: "(.*)"/)?.[1] || '';

    // Generate .env
    const envContent = `
# Admin Setup
OWNER_EMAIL=${email}
GOOGLE_APPLICATION_CREDENTIALS=admin-sdk.json

# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=${apiKey}
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${authDomain}
NEXT_PUBLIC_FIREBASE_PROJECT_ID=${projectId}
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${storageBucket}
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${messagingSenderId}
NEXT_PUBLIC_FIREBASE_APP_ID=${appId}
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=${measurementId}
FIREBASE_PROJECT_ID=${projectId}

# AI
GEMINI_API_KEY=${geminiKey}
`.trim();

    fs.writeFileSync(envPath, envContent);
    console.log(chalk.green('✅ .env file generated successfully.'));

    // Run firebase init ONLY if firebase.json doesn't exist yet
    const firebaseJsonPath = path.join(process.cwd(), 'firebase.json');
    if (!fs.existsSync(firebaseJsonPath)) {
      console.log(chalk.blue('\n🔥 Running Firebase Init...'));
      await new Promise<void>((resolve) => {
        const child = spawn('firebase', ['init'], { stdio: 'inherit', shell: true });
        child.on('close', () => resolve());
      });
    } else {
      console.log(chalk.green('✅ Firebase already initialized (firebase.json found). Skipping firebase init.'));
    }

    // Reload dotenv
    const dotenv = await import('dotenv');
    dotenv.config({ path: envPath, override: true });

    // Cloud enabled and configured
    state.cloudFeaturesEnabled = true;

    return false; // Valid, proceed
  }

  // Existing check logic for when .env exists (and cloud is enabled)
  const isFlutterProject = fs.existsSync(path.join(process.cwd(), 'pubspec.yaml'));

  const missing = [];
  if (!isFlutterProject) {
    // These are required for Next.js but optional for Flutter
    if (!process.env.OWNER_EMAIL) missing.push('OWNER_EMAIL');
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_SERVICE_ACCOUNT) missing.push('GOOGLE_APPLICATION_CREDENTIALS');
  }

  if (missing.length > 0) {
    console.log(chalk.yellow(`\n⚠️  Missing Environment Configuration: ${missing.join(', ')}`));
    return true; // Setup required
  }

  return false;
}









async function handleCLIArgs(): Promise<boolean> {
  const { program } = await import('commander');
  const args = process.argv.slice(2);
  
  // Only parse if we have flags/commands, otherwise skip to interactive TUI
  if (args.length === 0 || (!args[0].startsWith('-') && args[0] !== 'run')) {
      return false; 
  }

  program
    .name('codeman')
    .description('CodeMan CLI — Vishnu Preserver System')
    .version('1.0.0');

  program
    .option('--run-tests', 'Run the project test suite')
    .option('--run-build', 'Run a debug build')
    .option('--run-deploy', 'Deploy the project')
    .option('--run-e2e', 'Run Playwright E2E tests')
    .option('--emulator', 'Start Firebase emulators');

  // Legacy command support "codeman run flutter test"
  program
    .command('run <platform> <action>')
    .description('Run specific platform commands (e.g. run flutter test)')
    .action(async (platform, action) => {
        if (platform === 'flutter' && action === 'test') {
            console.log(chalk.cyan('🚀 Starting Comprehensive Test Suite via CLI...'));
            const { BuildManager } = await import('./managers/build-manager');
            await BuildManager.runTests(process.cwd());
            process.exit(0);
        }
    });

  // Note: Commander by default handles --help and -h automatically, 
  // printing the generated usage and exiting.

  // Parse the arguments
  program.parse(process.argv);
  const options = program.opts();

  // If we get here and there are options invoked (we didn't exit on --help)
  if (Object.keys(options).length > 0) {
      if (options.runTests) {
          const { BuildManager } = await import('./managers/build-manager');
          await BuildManager.runTests(process.cwd());
          process.exit(0);
      }
      if (options.runBuild) {
          const { BuildManager } = await import('./managers/build-manager');
          await BuildManager.buildAll(process.cwd(), 'debug');
          process.exit(0);
      }
      if (options.runDeploy) {
          const { ReleaseManager } = await import('./managers/release-manager');
          await ReleaseManager.deployAll(process.cwd());
          process.exit(0);
      }
      if (options.runE2e) {
          const { spawn } = await import('child_process');
          const p = await import('path');
          const dashDir = p.join(process.cwd(), 'dashboard');
          await new Promise<void>(resolve => {
              const child = spawn('npx', ['playwright', 'test'], {
                  stdio: 'inherit', shell: true, cwd: dashDir
              });
              child.on('close', () => resolve());
          });
          process.exit(0);
      }
      if (options.emulator) {
          const { spawn } = await import('child_process');
          await new Promise<void>(resolve => {
              const child = spawn('firebase', ['emulators:start'], {
                  stdio: 'inherit', shell: true, cwd: process.cwd()
              });
              child.on('close', () => resolve());
          });
          process.exit(0);
      }
  }

  // If no specific options were matched that exit, but an unknown flag was passed:
  if (program.args.length > 0 && program.args[0].startsWith('-')) {
     console.error(`Unknown option. Use \`codeman --help\` for usage info.`);
     process.exit(1);
  }

  return false;
}

async function bootstrap() {
  const handled = await handleCLIArgs();
  if (handled) return;

  // Clear terminal completely (screen + scrollback) for a clean restart experience
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H');

  // Preserve initial CWD across restarts
  if (!process.env.CODEMAN_INITIAL_CWD) {
    process.env.CODEMAN_INITIAL_CWD = process.cwd();
  }

  const isRestart = process.env.CODEMAN_RESTART_FROM_MENU === 'true';
  let targetPath: string | null = null;

  const { GlobalStateManager } = await import('./managers/global-state-manager');
  const manager = new GlobalStateManager();

  // Import State inside bootstrap to avoid circular deps if any, or ensures it's fresh
  const { state } = await import('./core/state');

  // Check for explicit start node passed via args
  const explicitNode = (process.argv[2] && process.argv[2] !== '--') ? process.argv[2] : null;

  if (isRestart && explicitNode !== 'ROOT') {
    // Auto-resume from last known good state ONLY if we aren't explicitly going to ROOT (Launcher)
    const lastProject = manager.getLastActive();
    if (lastProject && lastProject.path) {
      targetPath = lastProject.path;
    }
  } else {
    // Universal Mode or Clean Restart: We default to current directory.
    targetPath = process.cwd();
  }

  if (targetPath) {
    console.log(chalk.green(`\n📂 Switching context to: ${targetPath}`));
    try {
      process.chdir(targetPath);
      // Reload .env from the new directory
      const dotenv = await import('dotenv');
      dotenv.config({ path: path.join(targetPath, '.env'), override: true });

      // Register Codeman Process
      ProcessRegistryManager.register('codeman', process.pid, targetPath);

      // --- CLI Command Interception ---
      // (Moved to Commander routing above)

    } catch (e) {
      console.error(chalk.red(`Failed to change directoryOr run command: ${e}`));
    }
  }

  // console.clear(); // Removed aggressive clear. Let the next UI component handle it or keep history.

  // Check for clean launcher force flag
  const forceLauncher = process.env.CODEMAN_FORCE_LAUNCHER === 'true';
  if (forceLauncher) {
    delete process.env.CODEMAN_FORCE_LAUNCHER; // Cleanup for subsequent runs
  }

  const needsSetup = await checkEnvAndSetup(forceLauncher);
  const engine = new Engine();

  if (needsSetup) {
    const inquirer = await import('inquirer');
    const { startSetup } = await inquirer.default.prompt([{
      type: 'confirm',
      name: 'startSetup',
      message: 'Environment not ready. Launch Link Project Wizard?',
      default: true
    }]);

    if (startSetup) {
      await engine.start('link-project');
      return;
    } else {
      console.log(chalk.yellow("⚠️  Skipping setup. Proceeding without cloud features."));
      state.cloudFeaturesEnabled = false;
      // Fall through → engine.start(startNode) below
    }
  }

  // If cloud features are enabled, we might want to check context or auth
  // SKIP for Flutter projects to avoid browser popup as requested
  const fs = await import('fs');
  const isFlutter = fs.existsSync(path.join(process.cwd(), 'pubspec.yaml'));

  // Set project type in global state (used by menus & link-project wizard)
  if (isFlutter) {
    state.setProjectType('flutter');
  } else if (fs.existsSync(path.join(process.cwd(), 'next.config.js')) ||
    fs.existsSync(path.join(process.cwd(), 'next.config.mjs')) ||
    fs.existsSync(path.join(process.cwd(), 'next.config.ts'))) {
    state.setProjectType('nextjs');
  }

  // Defer Context Check until project load (via checkAndSetupAuth)
  // if (state.cloudFeaturesEnabled && !isRestart && !isFlutter) {
  //   const { FirebaseContextManager } = await import('./managers/firebase-context');
  //   await FirebaseContextManager.checkContext();
  // }

  // Determine Start Node
  // If Custom Mode (Cloud Disabled) -> ROOT
  // If Cloud Mode -> AUTH (which leads to ROOT/ModeSelector)
  let startNode = 'ROOT';

  if (state.cloudFeaturesEnabled) {
    // We start at AUTH out of the gate for all cloud projects (NextJS, Flutter, etc.)
    startNode = 'AUTH';
  } else {
    startNode = 'ROOT';
  }

  // Allow override via args (e.g. for testing)
  if (process.argv[2] && process.argv[2] !== '--') {
    startNode = process.argv[2];
  }

  await engine.start(startNode);
}

// Add Process Registry Cleanup ensuring it runs on exit
process.on('exit', () => {
  try {
    // We use process.cwd() because we likely chdir'd into the target root
    ProcessRegistryManager.unregister('codeman', process.cwd());
  } catch (e) { }
});

process.on('uncaughtException', async (err) => {
  console.clear();
  console.error(chalk.bgRed.white(' UNCAUGHT EXCEPTION '));
  console.error(chalk.red(err.message));
  if (err.stack) console.error(chalk.gray(err.stack));
  
  try {
    const clipboardy = (await import('clipboardy')).default;
    clipboardy.writeSync(err.stack || err.message);
    console.log(chalk.cyan('\n📋 Error copied to clipboard.'));
  } catch (e) {
    console.log(chalk.yellow('\n⚠️ Could not copy to clipboard.'));
  }
  
  console.log(chalk.white('Press any key to exit...'));
  
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => process.exit(1));
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', async (reason, promise) => {
  console.clear();
  console.error(chalk.bgRed.white(' UNHANDLED REJECTION '));
  console.error(chalk.red(String(reason)));
  
  try {
    const clipboardy = (await import('clipboardy')).default;
    clipboardy.writeSync(String(reason));
    console.log(chalk.cyan('\n📋 Error copied to clipboard.'));
  } catch (e) {
    console.log(chalk.yellow('\n⚠️ Could not copy to clipboard.'));
  }
  
  console.log(chalk.white('Press any key to exit...'));
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => process.exit(1));
  } else {
    process.exit(1);
  }
});

bootstrap().catch(async (err) => {
  console.clear();
  console.error(chalk.bgRed.white(' FATAL CLI ERROR '));
  console.error(chalk.red(err));
  
  try {
    const clipboardy = (await import('clipboardy')).default;
    clipboardy.writeSync(String(err));
  } catch (e) {}
  
  console.log(chalk.white('\nPress any key to exit...'));
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => process.exit(1));
  } else {
    process.exit(1);
  }
});
