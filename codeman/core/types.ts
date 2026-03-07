import { z } from 'zod';
import { GlobalState } from './state';

export type MenuId = string;

export interface MenuNode<T = any, R = any> {
    id: MenuId;
    parentId?: MenuId;
    description?: string; // For debugging or listing

    // The schema for the props this menu might need (often void/empty for top-level menus)
    propsSchema: z.ZodSchema<T>;

    // Render function:
    // - Displays UI to stdout
    // - Handles input (interactively)
    // - Returns a result promise
    render: (props: T, state: GlobalState) => Promise<R>;

    // Navigation function:
    // - Takes the result of render
    // - Returns the ID of the next menu node to jump to
    // - Returns null to exit the loop (or strictly handle as 'back' if we implement a stack)
    next: (result: R) => MenuId | null;
}
