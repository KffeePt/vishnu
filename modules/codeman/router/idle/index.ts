import chalk from 'chalk';
import { printCodemanHeader } from '../../components/header';

export const idleRoute = {
    id: 'idle',
    render: async () => {
        await printCodemanHeader('custom');
        console.log(chalk.gray('\nCodeman is idle.'));
    }
};

