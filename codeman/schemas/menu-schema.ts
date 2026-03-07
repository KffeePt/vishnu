
import { GlobalState } from '../core/state';

export type MenuActionType = 'navigate' | 'run' | 'script' | 'back';

export interface MenuAction {
    type: MenuActionType;
    target?: string; // For navigate
    command?: string; // For run
    handler?: string; // For script
    args?: any;
}

export interface MenuOption {
    label: string;
    value: string;
    action?: MenuAction; // If missing, assumes value is target ID or simple return
    description?: string;
    disabled?: boolean | ((state: GlobalState) => boolean);
    type?: 'option' | 'separator';
}

export interface MenuDefinition {
    id: string;
    title: string | ((state: GlobalState) => string | Promise<string>);
    type: 'static' | 'dynamic';
    options: MenuOption[] | ((state: GlobalState) => Promise<MenuOption[]>);
}
