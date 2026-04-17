import chalk from 'chalk';
import { printCodemanHeader } from '../../components/header';

export const loadingRoute = {
    id: 'loading',
    render: async () => {
        await printCodemanHeader('welcome');
        console.log(chalk.cyan('\nLoading Codeman...'));
    }
};

