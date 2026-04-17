import chalk from 'chalk';

export const errorRoute = {
    id: 'debug-error',
    render: async (error?: unknown) => {
        console.error(chalk.red('\nCodeman error screen'));
        if (error) {
            console.error(error);
        }
    }
};

