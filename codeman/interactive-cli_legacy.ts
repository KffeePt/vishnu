#!/usr/bin/env node

import chalk from 'chalk';
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { MenuSystem, MenuConfig, ScreenFactory } from './utils/menu-system';
import {
  handleCreateComponent,
  createPage,
  createApiRoute,
  createUnitTest,
  createE2ETest,
  DeleteSelectionScreen,
  AdminRouteSelectionScreen,
  createAdminApiRoute,
  createAdminPageRoute,
  createFullStackAdminFeature,
  createFullStackStandardFeature,
  createComponent
} from './commands/boilerplate';
import { RefactorSelectionScreen, performRefactor } from './commands/refactor';
// Helper to generate timestamp for tests
function generateSharedTimestamp(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-') + '_' + [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('-');
}

// Helper to run Playwright with consistent timestamp and TUI
async function runPlaywrightWithTimestamp(args: string[] = [], timestamp?: string, workers: number = 2): Promise<void> {
  const { spawn } = await import('child_process');
  const { default: readline } = await import('readline');
  const ts = timestamp || generateSharedTimestamp();

  // Setup logging paths
  const runDir = path.join(process.cwd(), `tests/results/playwright/${ts}`);
  if (!fs.existsSync(runDir)) fs.mkdirSync(runDir, { recursive: true });
  const logPath = path.join(runDir, 'run.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  // TUI State
  const workerState = new Map<number, string>();
  let totalTests = 0;
  let completedTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let startTime = Date.now();

  // Initialize Ora for sticky UI
  const { default: ora } = await import('ora');
  const spinner = ora('🚀 Initializing Playwright...').start();

  const updateUI = () => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const progress = totalTests > 0 ? Math.round((completedTests / totalTests) * 100) : 0;
    const barLength = 20;
    const filled = Math.round((progress / 100) * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

    let output = `\n  ${chalk.bold('🎭 Test Execution Progress')}  [${ts}]\n`;
    output += `  ${chalk.cyan(bar)} ${progress}%  (${chalk.yellow(elapsed + 's')})\n\n`;
    output += `  ${chalk.green('✔ Passed:')} ${passedTests}   ${chalk.red('✘ Failed:')} ${failedTests}   ${chalk.gray('Total:')} ${totalTests}\n`;
    output += `  ${chalk.gray('────────────────────────────────────────')}\n`;

    // Worker Status
    if (workerState.size > 0) {
      output += `  ${chalk.bold('👷 Active Workers:')}\n`;
      Array.from(workerState.entries()).sort((a, b) => a[0] - b[0]).forEach(([id, task]) => {
        output += `   • Worker ${id + 1}: ${chalk.blue(task)}\n`;
      });
    } else {
      output += `   ${chalk.dim('Waiting for workers...')}\n`;
    }

    spinner.text = output;
  };

  try {
    await new Promise<void>((resolve) => {
      // Use our custom reporter
      const child = spawn('npx', ['playwright', 'test', `--workers=${workers}`, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout/stderr
        shell: true,
        env: { ...process.env, PLAYWRIGHT_TIMESTAMP: ts, FORCE_COLOR: '1', TUI_MODE: 'true' }
      });

      // Handle Stdout (JSON Stream)
      const rl = readline.createInterface({ input: child.stdout! });

      // Render Loop (Throttle UI updates to ~10fps to prevent flickering)
      const uiInterval = setInterval(updateUI, 100);

      rl.on('line', (line) => {
        // Log raw always
        logStream.write(line + '\n');

        try {
          if (!line.trim().startsWith('{')) return;
          const event = JSON.parse(line);

          if (event.type === 'begin') {
            totalTests = event.total;
            startTime = Date.now();
          } else if (event.type === 'start') {
            let title = event.title;
            const file = path.basename(event.path || '');
            workerState.set(event.workerIndex, `${file} › ${title}`);
          } else if (event.type === 'end') {
            completedTests++;
            if (event.status === 'passed') passedTests++;
            else failedTests++;

            // Remove worker from state so it "despawns" from UI list
            workerState.delete(event.workerIndex);

            // Write errors to log immediately
            if (event.errors && event.errors.length > 0) {
              logStream.write(`\n[ERROR] ${event.title}\n`);
              event.errors.forEach((e: any) => logStream.write((e.message || JSON.stringify(e)) + '\n'));
            }
          } else if (event.type === 'global_error') {
            logStream.write(`[GLOBAL ERROR] ${event.error}\n`);
          }
        } catch (e) {
          logStream.write(`[PARSE ERROR] ${line}\n`);
        }
      });

      // Handle Stderr
      child.stderr?.on('data', (data) => {
        logStream.write(data.toString());
      });

      child.on('error', (err) => {
        const msg = `Failed to start Playwright: ${err}`;
        console.error(chalk.red(msg));
        logStream.write(msg + '\n');
        clearInterval(uiInterval);
        resolve();
      });

      child.on('close', () => {
        clearInterval(uiInterval);
        updateUI(); // Final frame
        spinner.stop();
        console.log(chalk.green(`\n\n✅ Test Run Complete! Results saved to ${runDir}`));
        logStream.end();
        resolve();
      });
    });
  } catch (e) {
    console.error(chalk.red('Error running tests:'), e);
  } finally {
    // Generate Report (Standard HTML)
    // ... (Existing report generation logic)
    console.log(chalk.gray('\n📝 Generating E2E test report...'));
    try {
      await new Promise<void>((resolve) => {
        const child = spawn('npm', ['run', 'test:e2e:report'], {
          stdio: 'inherit',
          shell: true,
          env: { ...process.env, PLAYWRIGHT_TIMESTAMP: ts }
        });
        child.on('close', () => resolve());
      });
    } catch (e) { console.error(chalk.red('Report Gen Error'), e); }

    // Prompt open report
    try {
      const { default: inquirer } = await import('inquirer');
      const { openReport } = await inquirer.prompt([{
        type: 'confirm',
        name: 'openReport',
        message: '📄 Would you like to view the detailed HTML report?',
        default: false
      }]);

      if (openReport) {
        console.log(chalk.blue('\n🌐 Opening HTML report... (CTRL+C to exit)'));
        await new Promise<void>((resolve) => {
          const reportPath = `tests/results/playwright/${ts}/html-report`;
          const child = spawn('npx', ['playwright', 'show-report', reportPath], { stdio: 'inherit', shell: true });
          child.on('close', () => resolve());
        });
      }
    } catch (e) { }
  }
}

// Helper to run tests and generate report
async function runTestsWithReport(command: string[], args: string[], message: string): Promise<void> {
  console.log(chalk.blue(`\n${message}\n`));
  const { spawn } = await import('child_process');

  try {
    // Run the tests
    await new Promise<void>((resolve) => {
      const child = spawn(command[0], [...command.slice(1), ...args], { stdio: 'inherit', shell: true });
      child.on('error', (err) => {
        console.error(chalk.red('Failed to start test runner:'), err);
        resolve();
      });
      child.on('close', () => resolve());
    });
  } catch (e) {
    console.error(chalk.red('Error running tests:'), e);
  } finally {
    // Generate the report
    console.log(chalk.gray('\n📝 Generating test report...'));
    try {
      await new Promise<void>((resolve) => {
        const child = spawn('npm', ['run', 'test:report'], { stdio: 'inherit', shell: true });
        child.on('error', (err) => {
          console.error(chalk.red('Failed to generate report:'), err);
          resolve();
        });
        child.on('close', () => resolve());
      });
    } catch (e) {
      console.error(chalk.red('Error generating report:'), e);
    }
  }
}

// Helper to run Vitest with consistent timestamp
async function runVitestWithTimestamp(args: string[] = [], message: string = '', timestamp?: string): Promise<void> {
  if (message) console.log(chalk.blue(`\n${message}\n`));
  const { spawn } = await import('child_process');

  // Reuse same timestamp format
  const ts = timestamp || generateSharedTimestamp();
  const resultsDir = `./tests/results/vitest/${ts}`;

  console.log(chalk.gray(`\n🕒 Timestamp: ${ts}`));
  console.log(chalk.gray(`📂 Results Dir: ${resultsDir}`));

  try {
    // Run Vitest
    await new Promise<void>((resolve) => {
      if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
      const logPath = path.join(resultsDir, 'run.log');
      const logStream = fs.createWriteStream(logPath, { flags: 'a' });

      const child = spawn('npx', ['vitest', 'run', ...args], {
        stdio: 'pipe',
        shell: true,
        env: {
          ...process.env,
          VITEST_APP_RESULTS_DIR: resultsDir
        }
      });

      child.stdout?.on('data', (data) => {
        process.stdout.write(data);
        logStream.write(data);
      });
      child.stderr?.on('data', (data) => {
        process.stderr.write(data);
        logStream.write(data);
      });

      child.on('error', (err) => {
        const msg = chalk.red('Failed to start Vitest: ') + err;
        console.error(msg);
        logStream.write(msg + '\n');
        resolve();
      });
      child.on('close', () => {
        logStream.end();
        resolve();
      });
    });
  } catch (e) {
    console.error(chalk.red('Error running tests:'), e);
  } finally {
    // Generate report (relying on find-latest logic in generate-report.ts which will find the dir we just made)
    console.log(chalk.gray('\n📝 Generating unit test report...'));
    try {
      await new Promise<void>((resolve) => {
        const child = spawn('npm', ['run', 'test:report'], { stdio: 'inherit', shell: true });
        child.on('error', (err) => {
          console.error(chalk.red('Failed to generate report:'), err);
          resolve();
        });
        child.on('close', () => resolve());
      });
    } catch (e) {
      console.error(chalk.red('Error generating report:'), e);
    }
  }
}

export const TestRunnerScreen: ScreenFactory = async (_props, system) => {
  return {
    title: '🧪 Test Runner',
    subtitle: 'Execute tests for the Triada Culinaria project.',
    options: [
      {
        name: '🚀 Run All Tests (Unit + E2E)',
        value: 'all',
        action: async () => {
          const timestamp = generateSharedTimestamp();

          const { default: inquirer } = await import('inquirer');
          const { workers } = await inquirer.prompt([{
            type: 'number',
            name: 'workers',
            message: '👷 Workers:',
            default: 2
          }]);

          // Run Vitest unit tests
          await runVitestWithTimestamp([], '📦 Running all unit tests (Vitest)...', timestamp);

          // Run Playwright E2E tests
          console.log(chalk.blue('\n🎭 Running all E2E tests (Playwright)...\n'));
          await runPlaywrightWithTimestamp([], timestamp, workers);

          console.log(chalk.green('\n✅ All tests completed!\n'));
        }
      },
      {
        name: '🗑️  Delete Test Results...',
        value: 'delete-results',
        action: async () => system.push(DeleteTestResultsScreen, {}),
        internal: true
      },


      {
        name: '⚡ Unit Tests (Vitest - Watch Mode)',
        value: 'unit-watch',
        action: async () => {
          console.log(chalk.blue('\n🔄 Starting Vitest in watch mode...\n'));
          const { spawn } = await import('child_process');
          await new Promise<void>(resolve => {
            const child = spawn('npm', ['test'], { stdio: 'inherit', shell: true });
            child.on('close', () => resolve());
          });
        }
      },
      {
        name: '🖥️  E2E Tests (Playwright)',
        value: 'e2e',
        action: async () => system.push(E2ETestsScreen, {}),
        internal: true
      },
      {
        name: '📂 Tests by Category',
        value: 'category',
        action: async () => system.push(TestCategoryScreen, {}),
        internal: true
      },
      {
        name: '📊 Run with Coverage',
        value: 'coverage',
        action: async () => {
          await runVitestWithTimestamp(['--coverage'], '📊 Running tests with coverage...');
        }
      }
    ]
  };
};


export const E2ETestsScreen: ScreenFactory = async (_props, system) => {
  return {
    title: '🖥️  E2E Tests (Playwright)',
    subtitle: 'Browser-based end-to-end testing.',
    options: [
      {
        name: '▶️  Run All E2E Tests',
        value: 'e2e-all',
        action: async () => {
          console.log(chalk.blue('\n🎭 Running all Playwright E2E tests...\n'));
          const { default: inquirer } = await import('inquirer');
          const { workers } = await inquirer.prompt([{
            type: 'number',
            name: 'workers',
            message: '👷 Workers:',
            default: 2
          }]);

          await runPlaywrightWithTimestamp([], undefined, workers);
        }
      },
      {
        name: '🎨 Run E2E with UI Mode',
        value: 'e2e-ui',
        action: async () => {
          console.log(chalk.blue('\n🎨 Opening Playwright UI...\n'));
          const { spawn } = await import('child_process');
          await new Promise<void>(resolve => {
            const child = spawn('npm', ['run', 'test:e2e:ui'], { stdio: 'inherit', shell: true });
            child.on('close', () => resolve());
          });
        }
      },
      {
        name: '🏠 Homepage Tests',
        value: 'e2e-home',
        action: async () => {
          console.log(chalk.blue('\n🏠 Running homepage E2E tests...\n'));
          await runPlaywrightWithTimestamp(['tests/e2e/home.spec.ts'], undefined, 2);
        }
      },
      {
        name: '🛒 Order Flow Tests',
        value: 'e2e-order',
        action: async () => {
          console.log(chalk.blue('\n🛒 Running order flow E2E tests...\n'));
          await runPlaywrightWithTimestamp(['tests/e2e/order-flow.spec.ts'], undefined, 2);
        }
      },
      {
        name: '🔐 Auth Tests',
        value: 'e2e-auth',
        action: async () => {
          console.log(chalk.blue('\n🔐 Running auth E2E tests...\n'));
          await runPlaywrightWithTimestamp(['tests/e2e/auth.spec.ts'], undefined, 2);
        }
      },
      {
        name: '⚙️ Admin Tests',
        value: 'e2e-admin',
        action: async () => {
          console.log(chalk.blue('\n⚙️ Running admin panel E2E tests...\n'));
          await runPlaywrightWithTimestamp(['tests/e2e/admin.spec.ts'], undefined, 2);
        }
      }
    ]
  };
};

export const TestCategoryScreen: ScreenFactory = async (_props, system) => {
  return {
    title: '📂 Tests by Category',
    subtitle: 'Run specific test suites.',
    options: [
      {
        name: '🛠️  Code Manager Tests',
        value: 'code-manager',
        action: async () => {
          await runVitestWithTimestamp(['tests/code-manager/'], '🛠️ Running Code Manager tests...');
        }
      },
      {
        name: '🌐 Webapp Tests (Schemas/Hooks/Utils)',
        value: 'webapp',
        action: async () => {
          await runVitestWithTimestamp(['tests/webapp/'], '🌐 Running Webapp tests...');
        }
      },
      {
        name: '🔥 Firebase Tests',
        value: 'firebase',
        action: async () => {
          await runVitestWithTimestamp(['tests/firebase/'], '🔥 Running Firebase tests...');
        }
      },
      {
        name: '📋 Schema Validation Tests',
        value: 'schemas',
        action: async () => {
          await runVitestWithTimestamp(['tests/webapp/schemas/'], '📋 Running Schema tests...');
        }
      },
      {
        name: '🪝 Hook Tests',
        value: 'hooks',
        action: async () => {
          await runVitestWithTimestamp(['tests/webapp/hooks/'], '🪝 Running Hook tests...');
        }
      },
      {
        name: '🔧 Utility Tests',
        value: 'utils',
        action: async () => {
          await runVitestWithTimestamp(['tests/webapp/lib/'], '🔧 Running Utility tests...');
        }
      }
    ]

  };
};

export const DeleteTestResultsScreen: ScreenFactory = async (_props, system) => {
  return {
    title: '🗑️  Delete Test Results',
    subtitle: 'Manage and clean up test result folders.',
    options: [
      {
        name: '🔥 Delete ALL Results',
        value: 'delete-all',
        action: async () => {
          const { default: inquirer } = await import('inquirer');
          const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: '⚠️  Are you sure you want to delete ALL test results? This cannot be undone.',
            default: false
          }]);

          if (confirm) {
            const vDir = path.join(process.cwd(), 'tests/results/vitest');
            const pDir = path.join(process.cwd(), 'tests/results/playwright');

            console.log(chalk.gray(`\nCleaning ${vDir}...`));
            if (fs.existsSync(vDir)) fs.rmSync(vDir, { recursive: true, force: true });

            console.log(chalk.gray(`Cleaning ${pDir}...`));
            if (fs.existsSync(pDir)) fs.rmSync(pDir, { recursive: true, force: true });

            console.log(chalk.green('\n✅ All test results deleted!\n'));
          }
        }
      },
      {
        name: '📅 Delete Specific Run',
        value: 'delete-run',
        action: async () => {
          const vDir = path.join(process.cwd(), 'tests/results/vitest');
          const pDir = path.join(process.cwd(), 'tests/results/playwright');

          const getDirs = (d: string) => {
            if (!fs.existsSync(d)) return [];
            return fs.readdirSync(d).filter(f => fs.statSync(path.join(d, f)).isDirectory());
          };

          const vDirs = getDirs(vDir);
          const pDirs = getDirs(pDir);
          const allTimestamps = Array.from(new Set([...vDirs, ...pDirs])).sort().reverse();

          if (allTimestamps.length === 0) {
            console.log(chalk.yellow('\n⚠️  No test results found.\n'));
            return;
          }

          const { default: inquirer } = await import('inquirer');
          const { selectedTimestamp } = await inquirer.prompt([{
            type: 'list',
            name: 'selectedTimestamp',
            message: 'Select a timestamp to delete:',
            choices: allTimestamps
          }]);

          if (selectedTimestamp) {
            const targetV = path.join(vDir, selectedTimestamp);
            const targetP = path.join(pDir, selectedTimestamp);

            let deleted = false;
            if (fs.existsSync(targetV)) {
              fs.rmSync(targetV, { recursive: true, force: true });
              console.log(chalk.gray(`Deleted: ${targetV}`));
              deleted = true;
            }
            if (fs.existsSync(targetP)) {
              fs.rmSync(targetP, { recursive: true, force: true });
              console.log(chalk.gray(`Deleted: ${targetP}`));
              deleted = true;
            }

            if (deleted) {
              console.log(chalk.green(`\n✅ Deleted results for ${selectedTimestamp}\n`));
            } else {
              console.log(chalk.yellow(`\n⚠️  Could not find folders for ${selectedTimestamp} (already deleted?)\n`));
            }
          }
        }
      }
    ]
  };
};

export const GeneratorsScreen: ScreenFactory = async (_props, system) => {
  return {
    title: '✨ Generate New',
    subtitle: 'Select a boilerplate to generate.',
    options: [
      { name: '🧩 UI Component (Standard)', value: 'component', action: handleCreateComponent },
      { name: '📄 Next.js Page (Wrapper + Link)', value: 'page', action: createPage },
      { name: '🚀 Full Stack Feature (Standard/Public)', value: 'full-stack-std', action: async () => await createFullStackStandardFeature(system) },
      { name: '🔒 Admin Protected Route', value: 'protected-route', action: async () => system.push(AdminRouteSelectionScreen, { system }), internal: true },
      { name: '⚡ API Route', value: 'api-route', action: createApiRoute },
      { name: '🧪 Unit Test (Boilerplate)', value: 'unit-test-gen', action: async () => await createUnitTest(system) },
      { name: '🖥️  E2E Test (Boilerplate)', value: 'e2e-test-gen', action: async () => await createE2ETest(system) },
    ]
  };
};

export const BoilerplatesScreen: ScreenFactory = async (_props, system) => {
  return {
    title: '📦 Boilerplates & Components',
    subtitle: 'Generate new code or manage existing components.',
    options: [
      {
        name: '✨ Generate New...',
        value: 'generate-menu',
        action: async () => system.push(GeneratorsScreen, {}),
        internal: true
      },
      {
        name: '🔧 Refactor Component',
        value: 'refactor-comp',
        action: async () => system.push(RefactorSelectionScreen, {}),
        internal: true
      },
      {
        name: '🗑️  Delete Boilerplate...',
        value: 'delete',
        action: async () => system.push(DeleteSelectionScreen, {}),
        internal: true
      }
    ]
  };
};

export const DevCaveScreen: ScreenFactory = async (_props, system) => {
  return {
    title: '🥷  Dev Dojo',
    subtitle: 'Advanced development tools and environment controls.',
    options: [
      {
        name: '🔮 Invoke Shiva',
        value: 'shiva',
        action: async () => {
          const { runShivaScript } = await import('./commands/shiva');
          await runShivaScript();
        }
      },
      {
        name: '🌐 Run Dev Server',
        value: 'dev-server',
        action: async () => {
          const { runDevServer } = await import('./commands/dev-server');
          await runDevServer(system);
        }
      },
      {
        name: '🥷  Start Custom Environment (All)',
        value: 'custom-env',
        action: async () => {
          console.log(chalk.blue('\n🥷  Starting Custom Dev Environment...\n'));

          const { spawn } = await import('child_process');

          // 1. Run Shiva (Cleanup/Organize)
          console.log(chalk.gray('🔮 Invoking Shiva...'));
          const { runShivaScript } = await import('./commands/shiva');
          await runShivaScript();

          // 2. Start Dev Server
          console.log(chalk.gray('🌐 Starting Dev Server...'));
          const { runDevServer } = await import('./commands/dev-server');
          await runDevServer(system);
        }
      }
    ]
  };
};

export const MainScreen: ScreenFactory = async (_props, system) => {
  return {
    title: '🚀 Codebase Manager',
    subtitle: 'Triada Culinaria Development Tool',
    backOption: false, // Root exit
    options: [
      {
        name: '📦 Boilerplates & Components',
        value: 'boilerplates',
        action: async () => system.push(BoilerplatesScreen, {}),
        internal: true
      },
      {
        name: '🥷  Dev Dojo',
        value: 'dev-cave',
        action: async () => system.push(DevCaveScreen, {}),
        internal: true
      },
      {
        name: '🧪 Run Tests',
        value: 'tests',
        action: async () => system.push(TestRunnerScreen, {}),
        internal: true
      },
      {
        name: '🔍 Code Analysis (Coming Soon)',
        value: 'analysis',
        action: async () => console.log(chalk.yellow('Not implemented yet.'))
      },
      {
        name: '⚙️  Configuration (Coming Soon)',
        value: 'config',
        action: async () => console.log(chalk.yellow('Not implemented yet.'))
      },
      {
        name: '🔄 Restart CLI',
        value: 'restart',
        action: async () => {
          const { spawn } = await import('child_process');
          console.log(chalk.yellow('\n🔄 Reloading CLI...\n'));

          // Release input control to prevent conflicts with child process
          if (process.stdin.setRawMode) process.stdin.setRawMode(false);
          process.stdin.pause();

          await new Promise<void>((resolve) => {
            // Run tsx directly to minimize npm script wrapping issues
            const child = spawn('npx', ['tsx', 'tools/code-manager/interactive-cli.ts'], {
              stdio: 'inherit',
              shell: true,
              cwd: process.cwd(),
              env: { ...process.env, FORCE_COLOR: '1' }
            });

            child.on('close', () => resolve());
            child.on('error', (err) => {
              console.error(chalk.red('Failed to restart:'), err);
              // Resume input if restart fails
              process.stdin.resume();
              resolve();
            });
          });

          process.exit(0);
        },
        internal: true
      },
      {
        name: '🚪 Exit',
        value: 'exit',
        action: async () => process.exit(0),
        internal: true
      }
    ]
  };
};

async function runInteractive() {
  const system = new MenuSystem();
  await system.start(MainScreen, {});
}

const program = new Command();

program
  .name('codeman')
  .description('Triada Culinaria Code Manager CLI')
  .version('1.0.0');

// Default action: Interactive Mode
if (process.argv.length < 3) {
  runInteractive().catch(err => console.error(chalk.red('Fatal Error:'), err));
} else {

  // --- GENERATE COMMANDS ---
  const generate = program.command('generate')
    .alias('g')
    .description('Generate boilerplates');

  generate.command('component <name>')
    .description('Generate a UI component')
    .action(async (name) => {
      console.log(chalk.blue(`Generating components/${name}...`));
      await createComponent(name);
    });

  generate.command('page <routeName>')
    .description('Generate a Next.js Page')
    .option('-c, --component <compName>', 'Linked component name')
    .action(async (routeName, options) => {
      await createPage({ routeName, componentName: options.component });
    });

  generate.command('api <endpoint>')
    .description('Generate an API Route')
    .action(async (endpoint) => {
      await createApiRoute({ routeEndpoint: endpoint });
    });

  // Admin Generators
  const admin = generate.command('admin')
    .description('Generate Admin Protected Features');

  admin.command('api <endpoint>')
    .description('Generate Protected API Route')
    .action(async (endpoint) => {
      await createAdminApiRoute(null, { routeEndpoint: endpoint });
    });

  admin.command('page <route>')
    .description('Generate Protected Page')
    .action(async (route) => {
      await createAdminPageRoute(null, { routeName: route });
    });

  admin.command('full <featureName> <baseRoute>')
    .description('Generate Full Stack Protected Feature')
    .action(async (featureName, baseRoute) => {
      await createFullStackAdminFeature(null, { featureName, routeBasePath: baseRoute });
    });

  // --- REFACTOR COMMANDS ---
  const refactor = program.command('refactor')
    .alias('r')
    .description('Refactor tools');

  refactor.command('rename <target> <newName>')
    .description('Rename a file/folder and update imports')
    .action(async (target, newName) => {
      const targetPath = path.resolve(process.cwd(), target);
      const parentDir = path.dirname(targetPath);
      const newPath = path.join(parentDir, newName);

      console.log(chalk.blue(`Renaming ${target} -> ${newName}`));
      await performRefactor(targetPath, newPath);
    });

  refactor.command('move <target> <destDir>')
    .description('Move a file/folder to a new destination folder')
    .action(async (target, destDir) => {
      const targetPath = path.resolve(process.cwd(), target);
      const oldName = path.basename(targetPath);
      const destPath = path.resolve(process.cwd(), destDir, oldName);

      console.log(chalk.blue(`Moving ${target} -> ${destDir}`));
      await performRefactor(targetPath, destPath);
    });

  // --- Parse ---
  program.parse(process.argv);
}
