
import { MenuNode } from './types';
import { MenuDefinition, MenuOption } from '../schemas/menu-schema';
import { List } from '../components/list';
import { state } from './state';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { z } from 'zod';
import { io } from './io';
import { registry } from './registry';

export function registerScript(name: string, handler: (args?: any) => Promise<string | void>) {
    registry.registerScript(name, handler);
}

export function createSchemaMenu(def: MenuDefinition): MenuNode {
    return {
        id: def.id,
        // Schema-based menus usually don't need external props passed in render, 
        // relying on GlobalState instead.
        propsSchema: z.any(),
        render: async (_props: any, _state: typeof state) => {
            while (true) {
                // REMOVED: 2. Resolve Options & 3. Map (MOVED INSIDE)

                // 1. Resolve Title (Dynamic?) - Some titles depend on state too.
                // Re-calculating title every loop is safer for dynamic menus.
                let title = typeof def.title === 'function' ? await def.title(_state) : def.title;

                // Temp message is now passed as an overlay to the List component


                // 2. Resolve Options (INSIDE LOOP to support state changes)
                let options: MenuOption[] = [];
                if (typeof def.options === 'function') {
                    options = await def.options(_state);
                } else {
                    options = def.options;
                }

                // 3. Map to List choices
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

                // 4. Render List
                // io.clear() and console.log(title) were removed to prevent flicker.
                // List component now handles the full frame refresh using buffering.

                const choiceValue = await List(title, choices as any, { overlay: _state.tempMessage, overlayTTL: 2000 });

                // Clear temp message after interaction
                if (_state.tempMessage) {
                    _state.tempMessage = undefined;
                }

                if (!choiceValue) return choiceValue;

                // 5. Handle Disabled Select
                if (typeof choiceValue === 'string' && choiceValue.endsWith('__DISABLED')) {
                    continue; // Re-render
                }

                // 6. Find Selected Option & Action
                const selected = options.find(o => o.value === choiceValue);
                if (!selected) return choiceValue; // Should not happen

                // 7. Execute Action
                const action = selected.action;

                // Fallback: If no action, assume value IS the target ID (simple nav)
                if (!action) {
                    // Special Back handling
                    if (choiceValue === 'back') return '__BACK__'; // Use engine convention
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
                        // Await the handler, which might return a navigation target (e.g. 'ROOT')
                        io.disableAlternateScreen();
                        io.disableMouse();
                        try {
                            nextTarget = ((await handler(action.args)) as unknown) as string | void;
                        } finally {
                            // Re-initialize IO to reattach stdin handlers after inquirer/other libs may have disrupted them
                            io.start();
                            io.enableAlternateScreen();
                            io.enableMouse();
                        }
                    } else {
                        console.log(chalk.red(`Script handler '${action.handler}' not found.`));
                        await new Promise(r => setTimeout(r, 1000));
                    }

                    if (state.shouldRestart) {
                        return ''; // Return empty to signal Engine to stop and handle restart
                    }

                    // If handler returned a target, navigate to it.
                    if (typeof nextTarget === 'string' && nextTarget) {
                        return nextTarget;
                    }

                    // Otherwise, repaint current menu
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
                            // Re-initialize IO to reattach stdin handlers
                            io.start();
                            io.enableAlternateScreen();
                            io.enableMouse();
                        }
                    }
                    continue; // Repaint
                }
            }
        },
        next: (result: string) => result // The result from render is now the Next ID
    };
}
