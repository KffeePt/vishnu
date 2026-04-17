import { runTests } from '../../../backend/intents/index';

export const command = {
    name: 'test',
    description: 'Run workspace tests',
    action: async () => {
        await runTests();
    }
};
