import { startDashboardDev } from '../../../backend/intents/index';

export const command = {
    name: 'dev',
    description: 'Start dashboard dev server',
    action: async () => {
        await startDashboardDev();
    }
};
