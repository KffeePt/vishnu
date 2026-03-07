import inquirer from 'inquirer';
import chalk from 'chalk';
import * as readline from 'readline';
import { GlobalKeyManager } from '../../managers/global-key-manager';
import clipboardy from 'clipboardy';

export async function manageGeminiKeys() {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    let keys = GlobalKeyManager.getKeys();
    let selectedIndex = 0;
    let showHelp = false;
    let visibleKeyIndex = -1; // -1 means none visible

    // Helper to redraw interface
    const render = () => {
        console.clear();
        console.log(chalk.bold.blue('\n🔑 Gemini API Key Manager'));
        console.log(chalk.dim('   Use keys to store/rotate API tokens globally.\n'));

        // List Header
        console.log(`   ${chalk.bold('Alias'.padEnd(20))} | ${chalk.bold('Key Status')} | ${chalk.bold('Active')}`);
        console.log('   ' + '─'.repeat(60));

        const activeKey = GlobalKeyManager.getActive();

        if (keys.length === 0) {
            console.log(chalk.gray('   (No keys found. Press Shift+A to add one.)'));
        }

        keys.forEach((k, idx) => {
            const isSelected = idx === selectedIndex;
            const isActive = k.key === activeKey;

            // Selection Indicator
            const prefix = isSelected ? chalk.blue(' > ') : '   ';

            // Active Indicator
            const activeBadge = isActive ? chalk.green('● Active') : chalk.dim('○');

            // Key masking
            let displayKey = '••••••••••••••••';
            if (visibleKeyIndex === idx) {
                displayKey = k.key;
            } else {
                displayKey = '•••• •••• ' + k.key.slice(-4);
            }

            const aliasStr = k.alias.padEnd(20);
            const line = `${aliasStr} | ${displayKey.padEnd(20)} | ${activeBadge}`;

            if (isSelected) {
                console.log(chalk.bgGray.white(prefix + line));
            } else {
                console.log(prefix + line);
            }
        });

        console.log('\n' + chalk.dim('─'.repeat(60)));

        // Help / Status Line
        if (showHelp) {
            console.log(chalk.yellow('\nControls:'));
            console.log(`   ${chalk.bold('Shift+A')} : Add New Key`);
            console.log(`   ${chalk.bold('Shift+U')} : Update Selected`);
            console.log(`   ${chalk.bold('Shift+D')} : Delete Selected`);
            console.log(`   ${chalk.bold('Shift+C')} : Copy to Clipboard`);
            console.log(`   ${chalk.bold('Shift+S')} : Toggle Visibility`);
            console.log(`   ${chalk.bold('Enter')}   : Set Active`);
            console.log(`   ${chalk.bold('Q')}       : Quit`);
        } else {
            console.log(chalk.gray(`Select key `) + chalk.white('↑/↓') + chalk.gray(` • Hold `) + chalk.white('TAB') + chalk.gray(` for help • `) + chalk.white('Q') + chalk.gray(` to quit`));
        }
    };

    // Input Loop
    return new Promise<void>((resolve) => {
        const keyHandler = async (ch: string, key: any) => {
            if (key.name === 'q') {
                cleanup();
                resolve();
                return;
            }

            if (key.name === 'up' || key.name === 'k') {
                selectedIndex = Math.max(0, selectedIndex - 1);
                render();
            }

            if (key.name === 'down' || key.name === 'j') {
                selectedIndex = Math.min(keys.length - 1, selectedIndex + 1);
                render();
            }

            if (key.name === 'tab') {
                // Tab doesn't fire 'keypress' continuously easily in all environments, 
                // but we can toggle. Or use 'shift' detection if possible?
                // Node keypress logic is basic. Let's just Toggle on Tab press.
                showHelp = !showHelp;
                render();
            }

            // Shift+A (Add)
            if (key.name === 'a' && key.shift) {
                cleanup(); // Pause raw mode
                const { alias, newKey } = await inquirer.prompt([
                    { type: 'input', name: 'alias', message: 'Enter Alias for key (e.g. Personal, Work):' },
                    { type: 'password', name: 'newKey', message: 'Enter Gemini API Key:' }
                ]);
                if (alias && newKey) {
                    GlobalKeyManager.pushKey(alias, newKey);
                    keys = GlobalKeyManager.getKeys();
                    selectedIndex = keys.length - 1;
                }
                resume();
            }

            // Shift+U (Update)
            if (key.name === 'u' && key.shift && keys.length > 0) {
                cleanup();
                const { newKey } = await inquirer.prompt([
                    { type: 'password', name: 'newKey', message: `Update key for ${keys[selectedIndex].alias}:` }
                ]);
                if (newKey) {
                    GlobalKeyManager.updateKey(selectedIndex, newKey);
                    keys = GlobalKeyManager.getKeys();
                }
                resume();
            }

            // Shift+D (Delete) or Delete Key
            if ((key.name === 'd' && key.shift) || key.name === 'delete') {
                if (keys.length > 0) {
                    cleanup();
                    const { confirm } = await inquirer.prompt([
                        { type: 'confirm', name: 'confirm', message: `Delete key "${keys[selectedIndex].alias}"?`, default: false }
                    ]);
                    if (confirm) {
                        GlobalKeyManager.deleteKey(selectedIndex);
                        keys = GlobalKeyManager.getKeys();
                        selectedIndex = Math.max(0, selectedIndex - 1);
                    }
                    resume();
                }
            }

            // Shift+S (Show/View)
            if (key.name === 's' && key.shift) {
                visibleKeyIndex = visibleKeyIndex === selectedIndex ? -1 : selectedIndex;
                render();
            }

            // Shift+C (Copy)
            if (key.name === 'c' && key.shift) {
                if (keys[selectedIndex]) {
                    try {
                        clipboardy.writeSync(keys[selectedIndex].key);
                        // Flash message?
                    } catch (e) { }
                }
            }

            // Enter (Set Active)
            if (key.name === 'return') {
                if (keys[selectedIndex]) {
                    GlobalKeyManager.setActive(keys[selectedIndex].key);
                    render();
                }
            }
        };

        const cleanup = () => {
            process.stdin.removeListener('keypress', keyHandler);
            process.stdin.setRawMode(false);
            process.stdin.pause();
        };

        const resume = () => {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.addListener('keypress', keyHandler);
            render();
        };

        // Initial Render
        // We need 'keypress' events
        readline.emitKeypressEvents(process.stdin);
        process.stdin.addListener('keypress', keyHandler);
        render();
    });
}
