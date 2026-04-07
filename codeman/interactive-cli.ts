import 'dotenv/config';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import path from 'path';
import * as os from 'os';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

import {
  detectFramework,
  ensureRootCredentialGitignore,
  inspectFlutterFirebaseOptions,
  normalizeCredentialFiles,
  syncProjectCredentialsFromSecrets
} from './core/project/firebase-credentials';
import { registry } from './core/registry';
import { Engine } from './core/engine';
// Cleaned Imports
import { DocsManagerMenu } from './menus/docs/manager';
import { AuthMenu } from './core/auth-menu';
import { UserManager, UserActionMenu } from './core/users-manager';
import { FirebaseManagerMenu } from './core/firebase-manager';
import { LinkProjectMenu } from './menus/firebase/link-project';
import { ProcessRegistryManager } from './managers/process-registry-manager';
import { APP_VERSION } from './utils/app-version';


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
  const framework = detectFramework(process.cwd());
  const isFlutterProject = framework === 'flutter';
  const isNextProject = framework === 'nextjs';
  const isNextOrFlutter = isFlutterProject || isNextProject;

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

  // 2. If Cloud Features are NOT enabled and not a Next.js/Flutter project, we SKIP validation.
  // This enables "Custom Mode" / "Unknown Project" to work without setup.
  if (!cloudEnabled && !isNextOrFlutter) {
    return false;
  }

  // 3. Validation Logic (Only runs if Cloud Enabled)
  if (!fs.existsSync(envPath)) {
    // If WE ARE FORCING THE LAUNCHER, do NOT force setup.
    // The user should select a project first.
    if (forceLauncher || process.env.VISHNU_ROOT === process.cwd()) {
        state.cloudFeaturesEnabled = false;
        return false;
    }

    console.clear();
    console.log(chalk.bold.yellow('\n⚠️  Environment Not Configured (Cloud Features Enabled)'));
    console.log(chalk.gray('   This project is configured to use Cloud/Firebase features but is missing .env.'));
    console.log(chalk.cyan('\n   To configure it automatically, please drop the following files into the .secrets folder:'));
    console.log(chalk.white('   - ') + chalk.bold('.secrets/admin-sdk.json') + chalk.dim(' (Firebase Admin SDK)'));
    console.log(chalk.white('   - ') + chalk.bold('.secrets/firebase-sdk.js') + chalk.dim(' (Firebase Client SDK)'));
    console.log(chalk.white('   - ') + chalk.bold('.secrets/client_secret_oauth.json') + chalk.dim(' (Google OAuth client export)'));
    console.log(chalk.dim('\n   Waiting for files... (Press Ctrl+C to cancel)'));

    // Poll for files
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const normalized = normalizeCredentialFiles(process.cwd());
        const hasAdmin = Boolean(normalized.adminSdkPath);
        const hasClient = Boolean(normalized.clientSdkPath);
        const hasOauth = Boolean(normalized.oauthClientPath);

        if (hasAdmin && hasClient && hasOauth) {
          clearInterval(interval);
          console.log(chalk.green('\n✅ Configuration files detected!'));
          setTimeout(resolve, 1000);
        }
      }, 1000);
    });

    // Files found, start interactive setup
    console.log(chalk.blue('\n📝 Configuring Environment...'));

    const { geminiKey } = await inquirer.default.prompt([
      {
        type: 'input',
        name: 'geminiKey',
        message: 'Enter Gemini API Key (Optional):',
        default: ''
      }
    ]);

    const syncResult = syncProjectCredentialsFromSecrets({
      projectPath: process.cwd(),
      framework,
      geminiKey
    });

    if (!syncResult.performed) {
      console.log(chalk.red('Error parsing credential files. Make sure admin-sdk.json, firebase-sdk.js, and client_secret_oauth.json are valid.'));
      return true;
    }

    console.log(chalk.green('✅ Environment files generated successfully.'));

    ensureRootCredentialGitignore(process.cwd());
    console.log(chalk.green('✅ .gitignore protects local credential files.'));

    if (syncResult.movedFiles.length > 0) {
      console.log(chalk.cyan('\n📦 Sorted credential files'));
      for (const moved of syncResult.movedFiles) {
        console.log(chalk.gray(`   ${moved}`));
      }
    }

    if (syncResult.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Credential warnings'));
      for (const warning of syncResult.warnings) {
        console.log(chalk.gray(`   ${warning}`));
      }
    }

    if (isFlutterProject) {
      const projectId = syncResult.projectId ?? '';
      if (projectId) {
        const flutterStatus = inspectFlutterFirebaseOptions(process.cwd(), projectId);
        console.log(chalk.cyan('\n🪄 Flutter Firebase Status'));
        console.log(chalk.gray(`   ${flutterStatus.message}`));
        if (!flutterStatus.aligned) {
          console.log(chalk.yellow(`   Website/web env is ready, but native targets still need FlutterFire for ${projectId}.`));
        }
      }
    }

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

  const missing: string[] = [];
  if (!isFlutterProject) {
    // These are required for Next.js but optional for Flutter
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
  const hasRunFlag = args.some(arg => arg.startsWith('--run') || arg.startsWith('--maint') || arg === 'run' || arg === '--emulator' || arg === '-h' || arg === '--help');
  if (!hasRunFlag) {
      return false; 
  }

  program
    .name('codeman')
    .description('CodeMan CLI — Vishnu Preserver System')
    .version(APP_VERSION)
    .exitOverride()
    .allowUnknownOption(true); // Allow unknown options to pass through if needed

  program
    .option('--run-tests', 'Run the project test suite (Auto-detect Flutter/Next.js)')
    .option('--run-build', 'Run a debug build (Auto-detect Flutter/Next.js)')
    .option('--run-deploy', 'Deploy the project (Auto-detect Flutter/Next.js)')
    .option('--run-e2e', 'Run Playwright E2E tests')
    .option('--run-unit-tests-flutter', 'Run Flutter Unit Tests')
    .option('--run-widget-tests-flutter', 'Run Flutter Widget Tests')
    .option('--run-patrol-tests', 'Run Patrol Tests')
    .option('--run-maestro-tests', 'Run Maestro Tests')
    .option('--run-build-all', 'Run Build All (Release Prep)')
    .option('--run-release-flow', 'Run the interactive release/tagging flow')
    .option('--run-maint-deploy-prep', 'Run TUI & Dashboard local build verification')
    .option('--run-release', 'Run the project release pipeline')
    .option('--emulator', 'Start Firebase emulators')
    .option('--maint-test', 'Run Vishnu repo tests (Maintenance)')
    .option('--maint-build', 'Run Vishnu repo build (Maintenance)')
    .option('--maint-deploy-all', 'Deploy Vishnu System (TUI + Dash + Rules)')
    .option('--maint-tui-release', 'Run Vishnu TUI Release pipeline')
    .option('--maint-rules-deploy', 'Deploy Vishnu Firebase rules')
    .option('--maint-functions-deploy', 'Deploy Vishnu Cloud Functions')
    .option('--maint-dash-dev', 'Start Vishnu Dashboard dev server')
    .option('--maint-set-claims', 'Launch claims management TUI')
    .option('--maint-setup-firebase', 'Run Vishnu Firebase setup wizard');

  // Legacy command support "codeman run flutter test"

  // Parse the arguments asynchronously
  try {
    await program.parseAsync(process.argv);
  } catch (err: any) {
    if (err.code !== 'commander.helpDisplayed') {
      throw err;
    }
  }
  const options = program.opts();
  const { state } = await import('./core/state');
  const fs = await import('fs');
  const path = await import('path');

  // Perform project detection for CLI mode as well
  const isFlutter = fs.existsSync(path.join(process.cwd(), 'pubspec.yaml'));
  if (isFlutter) {
    state.setProjectType('flutter');
  } else if (fs.existsSync(path.join(process.cwd(), 'next.config.js')) ||
    fs.existsSync(path.join(process.cwd(), 'next.config.mjs')) ||
    fs.existsSync(path.join(process.cwd(), 'next.config.ts'))) {
    state.setProjectType('nextjs');
  }

  // If we get here and there are options invoked
  if (Object.keys(options).length > 0) {
      const runWithPause = async (task: string, fn: () => Promise<any>) => {
          const chalk = (await import('chalk')).default;
          const inquirer = (await import('inquirer')).default;
          try {
              const result = await fn();
              if (result === false) {
                  throw new Error(`${task} reported failure.`);
              }
              console.log(chalk.green(`\n✅ ${task} finished successfully.`));
          } catch (e: any) {
              const message = e?.message || String(e);
              console.error(chalk.red(`\n❌ ${task} failed: ${message}`));
              if (e?.stack) console.error(chalk.gray(e.stack));
          }
          console.log(chalk.gray('\n=== COMMAND COMPLETED ==='));
          await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to exit...' }]);
          process.exit(0);
      };

      if (options.runTests) {
          await runWithPause('Full Test Suite', async () => {
              const { registry } = await import('./core/registry');
              
              if (state.project.type === 'flutter') {
                const { BuildManager } = await import('./managers/build-manager');
                await BuildManager.runTests(process.cwd());
              } else if (state.project.type === 'nextjs') {
                const handler = registry.getScript('runUnitTests');
                if (handler) await handler();
                else console.log(chalk.yellow('No test handler registered for Next.js project.'));
              } else {
                console.log(chalk.yellow('Unknown project type or no project found. Cannot run tests.'));
              }
          });
          return true;
      }
      if (options.runUnitTestsFlutter) {
          await runWithPause('Unit Tests', async () => {
              const { BuildManager } = await import('./managers/build-manager');
              await BuildManager.runUnitTests(process.cwd());
          });
          return true;
      }
      if (options.runWidgetTestsFlutter) {
          await runWithPause('Widget Tests', async () => {
              const { BuildManager } = await import('./managers/build-manager');
              await BuildManager.runWidgetTests(process.cwd());
          });
          return true;
      }
      if (options.runPatrolTests) {
          await runWithPause('Patrol Tests', async () => {
              const { BuildManager } = await import('./managers/build-manager');
              await BuildManager.runPatrolTests(process.cwd());
          });
          return true;
      }
      if (options.runMaestroTests) {
          await runWithPause('Maestro Tests', async () => {
              const { BuildManager } = await import('./managers/build-manager');
              await BuildManager.runMaestroTests(process.cwd());
          });
          return true;
      }
      if (options.runBuildAll || options.runBuild) {
          await runWithPause('Build Project', async () => {
              const { registry } = await import('./core/registry');
              const mode = options.runBuildAll ? 'release' : 'debug';

              if (state.project.type === 'flutter') {
                const { BuildManager } = await import('./managers/build-manager');
                await BuildManager.buildAll(process.cwd(), mode);
              } else if (state.project.type === 'nextjs') {
                const handler = registry.getScript('runBuild');
                if (handler) await handler();
                else console.log(chalk.yellow('No build handler registered for Next.js project.'));
              } else {
                console.log(chalk.yellow('Unknown project type or no project found. Cannot build.'));
              }
          });
          return true;
      }
      if (options.runDeploy) {
          await runWithPause('Project Deployment', async () => {
              const { registry } = await import('./core/registry');

              if (state.project.type === 'flutter' || state.project.type === 'nextjs') {
                const handler = registry.getScript('runRelease');
                if (handler) await handler();
                else console.log(chalk.yellow('No release handler registered for this project.'));
              } else {
                console.log(chalk.yellow('Unknown project type or no project found. Cannot deploy.'));
              }
          });
          return true;
      }
      if (options.runReleaseFlow) {
          await runWithPause('Interactive Release Flow', async () => {
              const { ReleaseManager } = await import('./managers/release-manager');
              const inquirer = (await import('inquirer')).default;
              console.log(chalk.magenta('\n🚀 Starting Release Flow...'));
              const { version } = await inquirer.prompt([{
                  type: 'input',
                  name: 'version',
                  message: 'Tag Version (e.g. v1.0.1):',
                  validate: (v: string) => v.startsWith('v') ? true : 'Must start with v'
              }]);
              await ReleaseManager.gitCommitAndTag(process.cwd(), version);
              const { createRel } = await inquirer.prompt([{ type: 'confirm', name: 'createRel', message: 'Create GH Release now?', default: true }]);
              if (createRel) {
                  await ReleaseManager.createGhRelease(process.cwd(), version);
              }
          });
          return true;
      }
      if (options.runMaintDeployPrep) {
          await runWithPause('Maint Deploy Prep', async () => {
              const { runDeployPrepCore } = await import('./config/menu-map');
              return await runDeployPrepCore();
          });
          return true;
      }
      if (options.runRelease) {
          await runWithPause('CI/CD Release Deploy', async () => {
              const { SessionLoader } = await import('./managers/session-loader');
              const { runReleasePipeline } = await import('./config/menu-map');

              // Load project session context
              await SessionLoader.load(process.cwd());
              
              // Run the release logic
              return await runReleasePipeline();
          });
          return true;
      }
      if (options.runE2e) {
          await runWithPause('Playwright E2E Tests', async () => {
              const { spawn } = await import('child_process');
              const p = await import('path');
              const dashDir = p.join(process.cwd(), 'dashboard');
              await new Promise<void>((resolve, reject) => {
                  const child = spawn('npx', ['playwright', 'test'], {
                      stdio: 'inherit', shell: true, cwd: dashDir
                  });
                  child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Exit ${code}`)));
              });
          });
          return true;
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

      // --- Maintenance Options ---
      if (options.maintTest) {
          await runWithPause('Vishnu Native Tests', async () => {
              const { registry } = await import('./core/registry');
              const handler = registry.getScript('maintRunTests');
              if (handler) await handler();
              else console.log(chalk.red('Maintenance handler "maintRunTests" not found.'));
          });
          return true;
      }
      if (options.maintBuild) {
          await runWithPause('Vishnu Native Build', async () => {
              const { registry } = await import('./core/registry');
              const handler = registry.getScript('maintRunBuild');
              if (handler) await handler();
              else console.log(chalk.red('Maintenance handler "maintRunBuild" not found.'));
          });
          return true;
      }
      if (options.maintDeployAll) {
          await runWithPause('Vishnu Full Deployment', async () => {
              const { registry } = await import('./core/registry');
              const handler = registry.getScript('maintDeployAll');
              if (handler) await handler();
              else console.log(chalk.red('Maintenance handler "maintDeployAll" not found.'));
          });
          return true;
      }
      if (options.maintTuiRelease) {
          await runWithPause('Vishnu TUI Release', async () => {
              const { registry } = await import('./core/registry');
              const handler = registry.getScript('maintDeployRelease');
              if (handler) await handler();
              else console.log(chalk.red('Maintenance handler "maintDeployRelease" not found.'));
          });
          return true;
      }
      if (options.maintRulesDeploy) {
          await runWithPause('Vishnu Rules Deploy', async () => {
              const { registry } = await import('./core/registry');
              const handler = registry.getScript('maintDeployRules');
              if (handler) await handler();
              else console.log(chalk.red('Maintenance handler "maintDeployRules" not found.'));
          });
          return true;
      }
      if (options.maintFunctionsDeploy) {
          await runWithPause('Vishnu Functions Deploy', async () => {
              const { registry } = await import('./core/registry');
              const handler = registry.getScript('maintDeployDash'); // Maps to deployFunctionsAPI in menu-map
              if (handler) await handler();
              else console.log(chalk.red('Maintenance handler "maintDeployDash" (Functions) not found.'));
          });
          return true;
      }
      if (options.maintDashDev) {
          await runWithPause('Vishnu Dashboard Dev', async () => {
              const { registry } = await import('./core/registry');
              const handler = registry.getScript('maintDashboardDev');
              if (handler) await handler();
              else console.log(chalk.red('Maintenance handler "maintDashboardDev" not found.'));
          });
          return true;
      }
      if (options.maintSetClaims) {
          await runWithPause('Vishnu Set Claims', async () => {
              const { registry } = await import('./core/registry');
              const handler = registry.getScript('maintSetClaims');
              if (handler) await handler();
              else console.log(chalk.red('Maintenance handler "maintSetClaims" not found.'));
          });
          return true;
      }
      if (options.maintSetupFirebase) {
          await runWithPause('Vishnu Firebase Setup', async () => {
              const { registry } = await import('./core/registry');
              const handler = registry.getScript('maintSetupFirebase');
              if (handler) await handler();
              else console.log(chalk.red('Maintenance handler "maintSetupFirebase" not found.'));
          });
          return true;
      }
  }

  // If a help flag was passed, commander already handled it and exited or showed help.
  // We return true to signal it was handled.
  if (args.includes('-h') || args.includes('--help')) {
      return true;
  }

  return false;
}

async function bootstrap() {
  try {
    const handled = await handleCLIArgs();
    if (handled) return;

    const fs = await import('fs');
    const windir = path.resolve(process.env.WINDIR || 'C:\\Windows').toLowerCase();
    const currentCwd = path.resolve(process.cwd()).toLowerCase();
    const safeLauncherRoot = path.resolve(__dirname, '..');

    if (currentCwd.startsWith(windir)) {
      try {
        process.chdir(process.env.VISHNU_ROOT ? path.resolve(process.env.VISHNU_ROOT) : safeLauncherRoot);
      } catch {
        process.chdir(safeLauncherRoot);
      }
    }

    // Clear terminal completely (screen + scrollback) for a clean restart experience
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');

    // Preserve initial CWD across restarts
    if (!process.env.CODEMAN_INITIAL_CWD) {
      process.env.CODEMAN_INITIAL_CWD = process.cwd();
    }

    const isRestart = process.env.CODEMAN_RESTART_FROM_MENU === 'true';
    const forceLauncher = process.env.CODEMAN_FORCE_LAUNCHER === 'true';
    let targetPath: string | null = null;

    const { GlobalStateManager } = await import('./managers/global-state-manager');
    const manager = new GlobalStateManager();

    // Import State inside bootstrap to avoid circular deps if any, or ensures it's fresh
    const { state } = await import('./core/state');

    // Check for explicit start node passed via args
    const explicitNode = (process.argv[2] && process.argv[2] !== '--') ? process.argv[2] : null;
    const launcherRoot = process.env.VISHNU_ROOT ? path.resolve(process.env.VISHNU_ROOT) : safeLauncherRoot;

    if (isRestart && explicitNode !== 'ROOT' && !forceLauncher) {
      // Auto-resume from last known good state ONLY if we aren't explicitly going to ROOT (Launcher)
      const lastProject = manager.getLastActive();
      if (lastProject && lastProject.path) {
        targetPath = lastProject.path;
      }
    } else if (forceLauncher || explicitNode === 'ROOT') {
      targetPath = launcherRoot;
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
    // We ALWAYS start at ROOT (Launcher) so users select a project 
    // before being forced to authenticate.
    let startNode = 'ROOT';

    // Allow override via args (e.g. for testing)
    if (process.argv[2] && process.argv[2] !== '--') {
      startNode = process.argv[2];
    }

    await engine.start(startNode);
  } catch (err: any) {
    console.error(chalk.bgRed.white(' CRITICAL ERROR '));
    console.error(chalk.red(err.message));
    if (err.stack) console.error(chalk.gray(err.stack));
    
    console.log(chalk.white('\nPress Enter to exit...'));
    const inquirer = (await import('inquirer')).default;
    await inquirer.prompt([{ type: 'input', name: 'c', message: '' }]);
    process.exit(1);
  }
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
