import { z } from 'zod';
import { GlobalState } from '../state/global-state';

export type MenuId = string;

export interface MenuNode<T = any, R = any> {
    id: MenuId;
    parentId?: MenuId;
    description?: string;
    propsSchema: z.ZodSchema<T>;
    render: (props: T, state: GlobalState) => Promise<R>;
    next: (result: R) => MenuId | null;
}
