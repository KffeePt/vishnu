import { spawn } from 'child_process';
import chalk from 'chalk';
import { z } from 'zod';
import { io, registry, state, type MenuNode } from '@vishnu/platform';
import type { MenuDefinition, MenuOption } from '../../../../codeman/schemas/menu-schema';
import { List } from '../../../../modules/codeman/components/list';

export function registerScript(name: string, handler: (args?: any) => Promise<string | void>) {
    registry.registerScript(name, handler);
}

export function createSchemaMenu(def: MenuDefinition): MenuNode {
    return {
        id: def.id,
        propsSchema: z.any(),
        render: async (_props: any, _state: typeof state) => {
            while (true) {
                const title = typeof def.title === 'function' ? await def.title(_state) : def.title;

                let options: MenuOption[] = [];
                if (typeof def.options === 'function') {
                    options = await def.options(_state);
                } else {
                    options = def.options;
                }

                const choices = options.map(opt => {
                    if (opt.type === 'separator') {
                        return { type: 'separator' as const, line: opt.label ? chalk.dim(opt.label) : '' };
                    }

                    let isDisabled = false;
                    if (typeof opt.disabled === 'function') isDisabled = opt.disabled(_state);
                    else if (opt.disabled) isDisabled = opt.disabled;

                    if (isDisabled) {
                        return {
                            name: chalk.gray(opt.label + ' (Disabled)'),
                            value: opt.value + '__DISABLED'
                        };
                    }

                    return {
                        name: opt.label + (opt.description ? chalk.gray(` - ${opt.description}`) : ''),
                        value: opt.value
                    };
                });

                const choiceValue = await List(title, choices as any, { overlay: _state.tempMessage, overlayTTL: 2000 });

                if (_state.tempMessage) {
                    _state.tempMessage = undefined;
                }

                if (!choiceValue) return choiceValue;

                if (typeof choiceValue === 'string' && choiceValue.endsWith('__DISABLED')) {
                    continue;
                }

                const selected = options.find(option => option.value === choiceValue);
                if (!selected) return choiceValue;

                const action = selected.action;
                if (!action) {
                    if (choiceValue === 'back') return '__BACK__';
                    return choiceValue;
                }

                if (action.type === 'navigate') {
                    return action.target || 'ROOT';
                }

                if (action.type === 'back') {
                    return '__BACK__';
                }

                if (action.type === 'script') {
                    let nextTarget: string | void | undefined = undefined;
                    const handler = action.handler ? registry.getScript(action.handler) : undefined;
                    if (handler) {
                        io.disableAlternateScreen();
                        io.disableMouse();
                        try {
                            nextTarget = ((await handler(action.args)) as unknown) as string | void;
                        } finally {
                            io.start();
                            io.enableAlternateScreen();
                            io.enableMouse();
                        }
                    } else {
                        console.log(chalk.red(`Script handler '${action.handler}' not found.`));
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    if (state.shouldRestart) {
                        return '';
                    }

                    if (typeof nextTarget === 'string' && nextTarget) {
                        return nextTarget;
                    }

                    continue;
                }

                if (action.type === 'run') {
                    if (action.command) {
                        io.disableAlternateScreen();
                        io.disableMouse();
                        try {
                            const [cmd, ...args] = action.command.split(' ');
                            const child = spawn(cmd, args, { stdio: 'inherit', shell: true });
                            await new Promise<void>(resolve => child.on('close', () => resolve()));
                        } finally {
                            io.start();
                            io.enableAlternateScreen();
                            io.enableMouse();
                        }
                    }
                    continue;
                }
            }
        },
        next: (result: string) => result
    };
}
