import ora, { Ora } from 'ora';
import chalk from 'chalk';

/**
 * Standardized Spinner Wrapper to ensure consistent look and feel across the CLI.
 */
export class Spinner {
    private instance: Ora;

    constructor(text?: string) {
        this.instance = ora({
            text: text,
            color: 'cyan',
            spinner: 'dots'
        });
    }

    start(text?: string) {
        if (text) this.instance.text = text;
        this.instance.start();
        return this;
    }

    stop() {
        this.instance.stop();
        return this;
    }

    succeed(text?: string) {
        this.instance.succeed(text ? chalk.green(text) : undefined);
        return this;
    }

    fail(text?: string) {
        this.instance.fail(text ? chalk.red(text) : undefined);
        return this;
    }

    info(text?: string) {
        this.instance.info(text ? chalk.blue(text) : undefined);
        return this;
    }

    warn(text?: string) {
        this.instance.warn(text ? chalk.yellow(text) : undefined);
        return this;
    }

    set text(value: string) {
        this.instance.text = value;
    }
}

export function createSpinner(text?: string) {
    return new Spinner(text);
}
