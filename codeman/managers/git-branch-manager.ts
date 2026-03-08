import { exec } from 'child_process';
import chalk from 'chalk';
import * as path from 'path';
import { ProcessUtils } from '../utils/process-utils';

export interface BranchStatusInfo {
    currentBranch: string;
    commitsAhead: number;
    commitsBehind: number;
    changedFiles: number;
    insertions: number;
    deletions: number;
    activePRs: any[];
    repoUrl: string;
}

export class GitBranchManager {
    static async getCurrentBranch(cwd: string): Promise<string> {
        try {
            return (await this.execPromise('git branch --show-current', cwd)).trim();
        } catch {
            return 'unknown';
        }
    }

    static async listBranches(cwd: string): Promise<string[]> {
        try {
            const out = await this.execPromise('git branch -a --format="%(refname:short)"', cwd);
            return out.split('\n')
                .map(b => b.trim())
                .filter(b => b.length > 0 && !b.includes('HEAD ->'));
        } catch {
            return [];
        }
    }

    static async openBranch(cwd: string, name: string, base?: string): Promise<boolean> {
        try {
            const cmd = base ? `git checkout -b ${name} ${base}` : `git checkout -b ${name}`;
            await this.execPromise(cmd, cwd);
            return true;
        } catch (e: any) {
            console.log(chalk.red(`Failed to open branch: ${e.message}`));
            return false;
        }
    }

    static async switchBranch(cwd: string, name: string): Promise<boolean> {
        try {
            await this.execPromise(`git checkout ${name}`, cwd);
            return true;
        } catch (e: any) {
            console.log(chalk.red(`Failed to switch branch: ${e.message}`));
            return false;
        }
    }

    static async removeBranch(cwd: string, name: string, deleteRemote: boolean = false): Promise<boolean> {
        try {
            await this.execPromise(`git branch -D ${name}`, cwd);
            console.log(chalk.green(`Deleted local branch ${name}`));

            if (deleteRemote) {
                console.log(chalk.cyan(`Deleting remote branch origin/${name}...`));
                try {
                    await this.execPromise(`git push origin --delete ${name}`, cwd);
                    console.log(chalk.green(`Deleted remote branch origin/${name}`));
                } catch (e: any) {
                    console.log(chalk.yellow(`Could not delete remote branch (may not exist): ${e.message}`));
                }
            }
            return true;
        } catch (e: any) {
            console.log(chalk.red(`Failed to remove branch: ${e.message}`));
            return false;
        }
    }

    static async hasGraphite(): Promise<boolean> {
        return await ProcessUtils.checkCommand('gt');
    }

    static async hasGhCli(): Promise<boolean> {
        return await ProcessUtils.checkCommand('gh');
    }

    static async getStatus(cwd: string): Promise<BranchStatusInfo> {
        const status: BranchStatusInfo = {
            currentBranch: await this.getCurrentBranch(cwd),
            commitsAhead: 0,
            commitsBehind: 0,
            changedFiles: 0,
            insertions: 0,
            deletions: 0,
            activePRs: [],
            repoUrl: 'unknown'
        };

        try {
            // Uncommitted changes
            const diffStat = await this.execPromise('git diff --shortstat', cwd);
            if (diffStat.trim()) {
                // e.g., " 3 files changed, 50 insertions(+), 10 deletions(-)"
                const filesMatch = diffStat.match(/(\d+) file/);
                const insMatch = diffStat.match(/(\d+) insertion/);
                const delMatch = diffStat.match(/(\d+) deletion/);
                
                if (filesMatch) status.changedFiles = parseInt(filesMatch[1], 10);
                if (insMatch) status.insertions = parseInt(insMatch[1], 10);
                if (delMatch) status.deletions = parseInt(delMatch[1], 10);
            }

            // Commits ahead/behind origin/currentBranch
            try {
                // Determine upstream branch
                const upstream = (await this.execPromise(`git rev-parse --abbrev-ref ${status.currentBranch}@{upstream}`, cwd)).trim();
                const branchStat = await this.execPromise(`git rev-list --left-right --count ${status.currentBranch}...${upstream}`, cwd);
                const [ahead, behind] = branchStat.trim().split(/\s+/).map(Number);
                status.commitsAhead = ahead || 0;
                status.commitsBehind = behind || 0;
            } catch {
                // No upstream branch typically
                const numCommits = await this.execPromise(`git rev-list --count HEAD ^main`, cwd).catch(() => '0');
                status.commitsAhead = parseInt(numCommits.trim()) || 0;
            }

            // GH PRs
            if (await this.hasGhCli()) {
                try {
                    const prsOut = await this.execPromise(`gh pr list --head ${status.currentBranch} --json number,title,state,url`, cwd);
                    status.activePRs = JSON.parse(prsOut);
                } catch { /* ignore GH errors */ }

                try {
                    const repoOut = await this.execPromise(`gh repo view --json url -q .url`, cwd);
                    status.repoUrl = repoOut.trim();
                } catch { /* ignore */ }
            }

        } catch (e: any) {
            console.log(chalk.red(`Error getting branch status: ${e.message}`));
        }

        return status;
    }

    static async submitPR(cwd: string, title?: string, body?: string, draft: boolean = false): Promise<boolean> {
        const chalk = (await import('chalk')).default;
        
        let targetTool = 'gh';
        if (await this.hasGraphite()) {
            targetTool = 'gt';
        } else if (!(await this.hasGhCli())) {
            console.log(chalk.red('❌ Neither Graphite (gt) nor GitHub CLI (gh) found. Please install one.'));
            return false;
        }

        console.log(chalk.cyan(`\n📤 Submitting PR using ${targetTool.toUpperCase()}...`));

        try {
            if (targetTool === 'gt') {
                const titleArg = title ? `-m "${title}"` : '';
                console.log(chalk.blue('> gt create'));
                await this.execPromise(`gt create ${titleArg}`, cwd);
                
                let submitCmd = 'gt submit --no-edit';
                if (draft) submitCmd += ' --draft';
                if (body) submitCmd += ` --body "${body}"`;
                
                console.log(chalk.blue(`> ${submitCmd}`));
                await this.execPromise(submitCmd, cwd, true); // Inherit stdio for interactive parts if any
                return true;
            } else {
                let cmd = 'gh pr create';
                if (title) cmd += ` --title "${title}"`;
                else cmd += ' --fill'; // Auto-fill if no title provided
                
                if (body) cmd += ` --body "${body}"`;
                if (draft) cmd += ' --draft';

                console.log(chalk.blue(`> ${cmd}`));
                await this.execPromise(cmd, cwd, true); // Inherit stdio so user sees output/prompts if --fill fails
                return true;
            }
        } catch (e: any) {
            console.log(chalk.red(`\n❌ PR submission failed: ${e.message}`));
            return false;
        }
    }

    private static execPromise(cmd: string, cwd: string, inheritStdio: boolean = false): Promise<string> {
        return new Promise((resolve, reject) => {
            const options: any = { cwd };
            if (inheritStdio) {
                // We use process spawn directly to pipe correctly if needed
                const child = exec(cmd, options);
                if (child.stdout) child.stdout.pipe(process.stdout);
                if (child.stderr) child.stderr.pipe(process.stderr);
                
                child.on('close', (code) => {
                    if (code === 0) resolve('');
                    else reject(new Error(`Command exited with code ${code}`));
                });
            } else {
                exec(cmd, options, (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(stdout as unknown as string);
                    }
                });
            }
        });
    }
}
