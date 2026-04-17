import { runBuild } from '../../../backend/intents/index';

export const command = {
    name: 'build',
    description: 'Run workspace build',
    action: async () => {
        await runBuild();
    }
};
