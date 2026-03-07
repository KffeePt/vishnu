/**
 * Minimal Inquirer test to verify it works in isolation.
 * Run with: npx tsx tools/code-manager/test-inquirer.ts
 */
import inquirer from 'inquirer';
import chalk from 'chalk';

async function main() {
    console.log(chalk.blue('📍 stdin state before Inquirer:'));
    console.log(`  isTTY: ${process.stdin.isTTY}`);
    console.log(`  isRaw: ${(process.stdin as any).isRaw}`);
    console.log(`  isPaused: ${process.stdin.isPaused && process.stdin.isPaused()}`);
    console.log(`  readableFlowing: ${process.stdin.readableFlowing}`);

    console.log(chalk.yellow('\n▶ Launching Inquirer prompt...\n'));

    try {
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Test Menu - Select an option:',
                choices: [
                    { name: '🔵 Option A', value: 'a' },
                    { name: '🟢 Option B', value: 'b' },
                    { name: '🔴 Cancel', value: 'cancel' }
                ]
            }
        ]);

        console.log(chalk.green(`\n✅ You chose: ${action}`));
    } catch (err) {
        console.error(chalk.red('❌ Inquirer error:'), err);
    }
}

main();
