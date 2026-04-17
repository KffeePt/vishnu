import { printCodemanHeader } from '../../components/header';

export const welcomeRoute = {
    id: 'welcome',
    render: async () => {
        await printCodemanHeader('welcome');
    }
};

