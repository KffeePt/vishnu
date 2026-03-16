import chalk from 'chalk';
import inquirer from 'inquirer';
import { state } from '../core/state';
import { AuthTokenStore } from '../core/auth/token-store';

const API_BASE = 'http://localhost:3000/api/v1'; // Could be env var

export class JobsManager {

    private static async getAuthHeaders(): Promise<Record<string, string> | null> {
        // Here we need to retrieve the Firebase ID token for the current user.
        // Assuming we stored it in state, or we fetch it from the saved session.
        // For the stub, we will check if there's a user logged in.
        if (!state.user) {
            console.log(chalk.red('\n🚫 You must be logged in to use Cloud Jobs.'));
            console.log(chalk.gray('Go to Authentication -> Login in the main menu.\n'));
            return null;
        }

        // Ideally, we'd have the raw ID token saved in state after login.
        // Since we didn't save the raw token during auth in `auth.ts`, we'll pass a mock token 
        // to testing/stubs, or warn the user.
        // For a production app, the frontend holds the token. 
        // We'll mimic sending a Bearer token by looking it up if we had saved it.
        const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
        const storedToken = await AuthTokenStore.getValidIdToken(apiKey);
        const token = storedToken || state.rawIdToken;
        if (!token) {
            console.log(chalk.red('\n🚫 No valid ID token found. Please run vishnu login.\n'));
            return null;
        }

        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    }

    public static async triggerBuild(): Promise<string> {
        console.clear();
        console.log(chalk.magenta('🏗️ Trigger API Build Job'));

        const headers = await this.getAuthHeaders();
        if (!headers) {
            await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
            return 'jobs';
        }

        const projectId = state.project.id || 'default-project';

        console.log(chalk.gray(`Sending request to API for project: ${projectId}...`));

        try {
            const res = await fetch(`${API_BASE}/projects/${projectId}/jobs`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    type: 'build',
                    payload: { target: state.project.type }
                })
            });

            if (!res.ok) {
                const err = await res.json();
                console.log(chalk.red(`\n❌ API Error: ${err.error || res.statusText}`));
            } else {
                const data = await res.json();
                console.log(chalk.green(`\n✅ Build Job Created successfully!`));
                console.log(chalk.cyan(`Job ID: ${data.jobId}`));
                console.log(chalk.dim(`Status: ${data.status}`));
            }
        } catch (error: any) {
            console.log(chalk.red(`\n❌ Failed to connect to API: ${error.message}`));
        }

        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
        return 'jobs';
    }

    public static async triggerScaffold(): Promise<string> {
        console.clear();
        console.log(chalk.magenta('✨ Trigger API Scaffold Job'));
        
        const headers = await this.getAuthHeaders();
        if (!headers) {
            await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
            return 'jobs';
        }

        const projectId = state.project.id || 'default-project';

        try {
            const res = await fetch(`${API_BASE}/projects/${projectId}/jobs`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    type: 'scaffold',
                    payload: { target: state.project.type, name: 'New Feature' }
                })
            });

            if (!res.ok) {
                const err = await res.json();
                console.log(chalk.red(`\n❌ API Error: ${err.error || res.statusText}`));
            } else {
                const data = await res.json();
                console.log(chalk.green(`\n✅ Scaffold Job Created successfully!`));
                console.log(chalk.cyan(`Job ID: ${data.jobId}`));
            }
        } catch (error: any) {
            console.log(chalk.red(`\n❌ Failed to connect to API: ${error.message}`));
        }

        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
        return 'jobs';
    }

    public static async listJobs(): Promise<string> {
        console.clear();
        console.log(chalk.magenta('📋 Active Cloud Jobs'));
        console.log(chalk.gray('Use the Firebase Console or Firestore directly to list jobs. API endpoint pending.'));
        
        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
        return 'jobs';
    }
}
