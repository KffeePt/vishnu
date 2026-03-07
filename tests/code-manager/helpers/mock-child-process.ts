
import { vi } from 'vitest';
import EventEmitter from 'events';

export const mockSpawn = vi.fn();

// Mock ChildProcess
export class MockChildProcess extends EventEmitter {
    pid = 12345;
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    stdin = { write: vi.fn(), end: vi.fn() };
    kill = vi.fn();
    unref = vi.fn();
}

mockSpawn.mockImplementation(() => {
    return new MockChildProcess();
});
