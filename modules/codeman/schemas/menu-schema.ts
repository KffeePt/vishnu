import { type GlobalState } from '@vishnu/platform';

export type MenuActionType = 'navigate' | 'run' | 'script' | 'back';

export interface MenuAction {
    type: MenuActionType;
    target?: string;
    command?: string;
    handler?: string;
    args?: any;
}

export interface MenuOption {
    label: string;
    value: string;
    action?: MenuAction;
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
