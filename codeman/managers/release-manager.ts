
import { spawn, exec } from 'child_process';
import chalk from 'chalk';
import * as path from 'path';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import { ProcessUtils } from '../utils/process-utils';

export class ReleaseManager {

    /**
     * Bump version in pubspec.yaml
     */
    static async bumpVersion(projectRoot: string, type: 'major' | 'minor' | 'patch'): Promise<string | null> {
        const pubspecPath = path.join(projectRoot, 'pubspec.yaml');
        try {
            const content = await fs.readFile(pubspecPath, 'utf-8');
            const lines = content.split('\n');
            let newVersion = '';

            const newLines = lines.map(line => {
                if (line.trim().startsWith('version:')) {
                    const parts = line.split(':')[1].trim().split('+');
                    const version = parts[0];
                    const buildNumber = parts[1] ? parseInt(parts[1]) + 1 : 1;

                    const vParts = version.split('.').map(Number);
                    if (type === 'major') { vParts[0]++; vParts[1] = 0; vParts[2] = 0; }
                    else if (type === 'minor') { vParts[1]++; vParts[2] = 0; }
                    else { vParts[2]++; }

                    newVersion = `${vParts.join('.')}+${buildNumber}`;
                    return `version: ${newVersion}`;
                }
                return line;
            });

            if (newVersion) {
                await fs.writeFile(pubspecPath, newLines.join('\n'), 'utf-8');
                console.log(chalk.green(`\n✅ Version bumped to ${newVersion} in pubspec.yaml`));
                return newVersion;
            }
        } catch (e: any) {
            console.log(chalk.red(`Failed to bump version: ${e.message}`));
        }
        return null;
    }

    /**
     * Set explicit version in pubspec.yaml
     */
    static async setVersion(projectRoot: string, version: string): Promise<void> {
        const pubspecPath = path.join(projectRoot, 'pubspec.yaml');
        try {
            const content = await fs.readFile(pubspecPath, 'utf-8');
            const lines = content.split('\n');

            const newLines = lines.map(line => {
                if (line.trim().startsWith('version:')) {
                    return `version: ${version}`;
                }
                return line;
            });

            await fs.writeFile(pubspecPath, newLines.join('\n'), 'utf-8');
            console.log(chalk.green(`\n✅ Version updated to ${version} in pubspec.yaml`));
        } catch (e: any) {
            console.log(chalk.red(`Failed to set version: ${e.message}`));
        }
    }

    static async checkTagExists(projectRoot: string, version: string): Promise<boolean> {
        try {
            const existingTag = await this.execPromise(`git tag -l ${version}`, projectRoot);
            return existingTag.trim() === version;
        } catch {
            return false;
        }
    }

    static async deleteTag(projectRoot: string, version: string): Promise<void> {
        console.log(chalk.yellow(`Deleting existing tag ${version}...`));
        try {
            await this.execPromise(`git tag -d ${version}`, projectRoot);
        } catch (e) { /* ignore */ }

        try {
            await this.execPromise(`git push --delete origin ${version}`, projectRoot);
        } catch (e) {
            console.log(chalk.gray(`(Remote tag delete failed or not found: ${e})`));
        }

        try {
            // Also delete release if exists
            await this.execPromise(`gh release delete ${version} -y`, projectRoot);
        } catch (e) {
            console.log(chalk.gray(`(GitHub release delete failed or not found: ${e})`));
        }
        console.log(chalk.green('Existing tag/release cleared.'));
    }

    static async gitCommitAndTag(projectRoot: string, version: string, skipCheck: boolean = false): Promise<boolean> {
        console.log(chalk.cyan('\n📦 Committing and Tagging...'));
        try {
            await this.execPromise('git add .', projectRoot);

            if (!skipCheck) {
                // Check if tag exists
                const exists = await this.checkTagExists(projectRoot, version);
                if (exists) {
                    console.log(chalk.yellow(`Tag ${version} already exists.`));
                    const { overwrite } = await inquirer.prompt([{
                        type: 'confirm',
                        name: 'overwrite',
                        message: `Tag ${version} already exists. Do you want to delete it and overwrite?`,
                        default: false
                    }]);

                    if (!overwrite) {
                        console.log(chalk.red('Aborted by user.'));
                        return false;
                    }

                    await this.deleteTag(projectRoot, version);
                }
            }

            await this.execPromise(`git commit -m "chore: bump version to ${version}"`, projectRoot);
            await this.execPromise(`git tag ${version}`, projectRoot);
            console.log(chalk.green(`Tagged ${version}`));

            console.log(chalk.cyan('Pushing to origin...'));
            await this.execPromise('git push origin main', projectRoot);
            await this.execPromise(`git push origin ${version}`, projectRoot); // Push tag triggers actions if configured
            return true;
        } catch (e: any) {
            console.log(chalk.red(`Git operations failed: ${e.message}`));
            return false;
        }
    }

    static async createGhRelease(projectRoot: string, version: string): Promise<boolean> {
        console.log(chalk.cyan('\n🚀 Creating GitHub Release...'));
        if (!await ProcessUtils.checkCommand('gh')) {
            console.log(chalk.red('GitHub CLI (gh) Not Found. Skipping release creation.'));
            return false;
        }

        try {
            // We assume cleanup happened earlier if needed.
            // Just create.
            await this.execPromise(`gh release create ${version} --generate-notes --title "Release ${version}"`, projectRoot);
            console.log(chalk.green('GitHub Release created successfully.'));
            return true;
        } catch (e: any) {
            console.log(chalk.red(`GitHub Release failed: ${e.message}`));
            return false;
        }
    }

    static async uploadArtifacts(projectRoot: string, version: string): Promise<void> {
        console.log(chalk.cyan('\n📤 Uploading Artifacts to Release...'));

        const artifacts = [
            'build/app/outputs/flutter-apk/app-release.apk',
            'build/windows/installer/setup.exe',
            'build/macos/Build/Products/Release/Consultorio.dmg',
            'build/ios/ipa/Consultorio.ipa'
        ];

        for (const relativePath of artifacts) {
            const fullPath = path.join(projectRoot, relativePath);
            // We use fs-extra pathExists via import in a real scenario, but for now assuming build passed
            // For robustness, we could check existence.
            if (!await fs.pathExists(fullPath)) {
                console.log(chalk.yellow(`⏭️  Skipped ${path.basename(relativePath)} (not found: ${relativePath})`));
                continue;
            }
            try {
                await this.execPromise(`gh release upload ${version} "${relativePath}" --clobber`, projectRoot);
                console.log(chalk.green(`Uploaded ${path.basename(relativePath)}`));
            } catch (e) {
                console.log(chalk.yellow(`Skipped ${path.basename(relativePath)} (Upload failed)`));
            }
        }
    }

    // --- Viewers for Tag/Release Menu ---

    static async listTags(projectRoot: string): Promise<void> {
        console.log(chalk.cyan('\n🏷️  Local Tags (Last 10):'));
        try {
            const out = await this.execPromise('git tag -l --sort=-v:refname | head -n 10', projectRoot); // "head" might not work on pure Windows cmd, so we use JS slice if needed?
            // Windows git bash usually has head, but let's be safe and just split JS side if we want cross-platform safety.
            // But let's try raw command first. If it fails, we catch.
            // Actually, best to just get all and slice in JS.
            const allTags = await this.execPromise('git tag -l --sort=-v:refname', projectRoot);
            const lines = allTags.split('\n').filter(l => l.trim()).slice(0, 10);
            if (lines.length === 0) console.log(chalk.gray('(No tags found)'));
            else lines.forEach(t => console.log(` - ${t}`));
        } catch (e: any) {
            console.log(chalk.red(`Error listing tags: ${e.message}`));
        }
    }

    static async listReleases(projectRoot: string): Promise<void> {
        console.log(chalk.cyan('\n📦 Recent GitHub Releases:'));
        if (!await ProcessUtils.checkCommand('gh')) {
            console.log(chalk.red('GitHub CLI (gh) not found.'));
            return;
        }
        try {
            const out = await this.execPromise('gh release list --limit 5', projectRoot);
            console.log(out || chalk.gray('(No releases found)'));
        } catch (e: any) {
            console.log(chalk.red(`Error listing releases: ${e.message}`));
        }
    }

    // --- Viewers for GitHub Actions Menu ---

    static async viewGhRunningWorkflows(projectRoot: string): Promise<void> {
        console.log(chalk.cyan('\n🔄 Running Workflows:'));
        try {
            const out = await this.execPromise('gh run list --status in_progress', projectRoot);
            console.log(out || chalk.gray('(No running workflows)'));
        } catch (e: any) {
            console.log(chalk.red(`Error: ${e.message}`));
        }
    }

    static async viewGhFailedWorkflows(projectRoot: string): Promise<void> {
        console.log(chalk.cyan('\n❌ Recent Failed Workflows:'));
        try {
            const out = await this.execPromise('gh run list --status failure --limit 10', projectRoot);
            console.log(out || chalk.gray('(No failed workflows recently)'));
        } catch (e: any) {
            console.log(chalk.red(`Error: ${e.message}`));
        }
    }

    static async viewGhWorkflowOutput(projectRoot: string): Promise<void> {
        const inquirer = (await import('inquirer')).default; // Dynamic import if not at top, but we have it at top in this file

        console.log(chalk.cyan('Fetching recent runs...'));
        try {
            // Get raw JSON for parsing
            const jsonOut = await this.execPromise('gh run list --limit 10 --json databaseId,workflowName,status,conclusion,createdAt', projectRoot);
            const runs = JSON.parse(jsonOut);

            if (runs.length === 0) {
                console.log(chalk.yellow('No runs found.'));
                return;
            }

            const choices = runs.map((r: any) => ({
                name: `${r.workflowName} (#${r.databaseId}) - ${r.status}/${r.conclusion} (${r.createdAt})`,
                value: r.databaseId
            }));

            const { runId } = await inquirer.prompt([{
                type: 'list',
                name: 'runId',
                message: 'Select Workflow Run to view logs:',
                choices: [...choices, { name: 'Cancel', value: 'cancel' }]
            }]);

            if (runId !== 'cancel') {
                console.log(chalk.cyan(`\n📄 Fetching logs for run ${runId}...`));
                // We'll spawn this to let it pipe to stdout with interaction if needed (usually view --log is just text)
                // But `gh run view --log` might be long.
                const logOut = await this.execPromise(`gh run view ${runId} --log`, projectRoot);
                console.log(logOut);
            }

        } catch (e: any) {
            console.log(chalk.red(`Error: ${e.message}`));
        }
    }

    static async deployRules(projectRoot: string): Promise<void> {
        console.log(chalk.cyan('\n🔒 Deploying Firebase Security Rules & Indexes...'));
        if (!await ProcessUtils.checkCommand('firebase')) {
            console.log(chalk.red('Firebase CLI Not Found. Skipping deploy.'));
            return;
        }
        try {
            const { ProcessManager } = await import('../core/process-manager');
            await ProcessManager.spawnElevatedDetachedWindow('Deploy Firebase Rules', 'firebase deploy --only firestore:rules,firestore:indexes,storage,database', projectRoot);
            console.log(chalk.green('✅ Deployment started in elevated window.'));
        } catch (e: any) {
            console.log(chalk.red(`Deploy failed: ${e.message}`));
        }
    }

    static async deployFunctionsAPI(projectRoot: string): Promise<void> {
        console.log(chalk.cyan('\n☁️  Deploying Cloud Functions to Firebase...'));
        console.log(chalk.gray('  (Dashboard is deployed automatically by Vercel on git push)'));
        if (!await ProcessUtils.checkCommand('firebase')) {
            console.log(chalk.red('Firebase CLI Not Found. Skipping deploy.'));
            return;
        }
        try {
            const { ProcessManager } = await import('../core/process-manager');
            await ProcessManager.spawnElevatedDetachedWindow('Deploy Cloud Functions', 'firebase deploy --only functions', projectRoot);
            console.log(chalk.green('✅ Deployment started in elevated window.'));
        } catch (e: any) {
            console.log(chalk.red(`Deploy failed: ${e.message}`));
        }
    }

    static async deployAllFirebase(projectRoot: string): Promise<void> {
        console.log(chalk.cyan('\n🌟 Deploying Everything to Firebase (excl. hosting)...'));
        console.log(chalk.gray('  (Dashboard is deployed automatically by Vercel on git push)'));
        if (!await ProcessUtils.checkCommand('firebase')) {
            console.log(chalk.red('Firebase CLI Not Found. Skipping deploy.'));
            return;
        }
        try {
            const { ProcessManager } = await import('../core/process-manager');
            await ProcessManager.spawnElevatedDetachedWindow('Deploy All Firebase', 'firebase deploy --only functions,firestore,storage', projectRoot);
            console.log(chalk.green('✅ Deployment started in elevated window.'));
        } catch (e: any) {
            console.log(chalk.red(`Deploy failed: ${e.message}`));
        }
    }

    static async deployAll(projectRoot: string): Promise<void> {
        // Keeping original method as alias for FunctionsAPI
        await this.deployFunctionsAPI(projectRoot);
    }

    private static execPromise(cmd: string, cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(cmd, { cwd }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });
    }
}
