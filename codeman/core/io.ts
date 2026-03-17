
import { EventEmitter } from 'events';

export type KeyHandler = (key: Buffer, str: string) => void;

class IOManager {
    private activeConsumer: KeyHandler | null = null;
    private masterHandlerBound: (key: Buffer) => void;
    private _lastActivity: number = Date.now();
    private lastFocusTime: number = 0;

    constructor() {
        this.masterHandlerBound = this.masterHandler.bind(this);
    }

    get lastActivity(): number {
        return this._lastActivity;
    }

    /**
     * Starts listening to stdin in raw mode.
     * Should be called when the app starts.
     */
    start() {
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.setEncoding('utf8');
        process.stdin.resume();

        // Ensure we don't attach multiple times
        process.stdin.off('data', this.masterHandlerBound);
        process.stdin.on('data', this.masterHandlerBound);
    }

    /**
     * Completely detaches from stdin.
     * Use this before restarting the CLI or exiting.
     */
    destroy() {
        this.activeConsumer = null;
        process.stdin.off('data', this.masterHandlerBound);
        process.stdin.pause();
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }
    }

    /**
     * Registers a consumer for input events.
     * Only ONE consumer can be active at a time.
     * New consumers override previous ones (LIFO effectively, but manual management).
     */
    consume(handler: KeyHandler) {
        this.activeConsumer = handler;
    }

    /**
     * Releases the current consumer if it matches the provided handler.
     */
    release(handler: KeyHandler) {
        if (this.activeConsumer === handler) {
            this.activeConsumer = null;
        }
    }

    /**
     * Force clears the active consumer.
     */
    reset() {
        this.activeConsumer = null;
    }

    /**
     * The single actual listener attached to process.stdin.
     * Routes events to the active consumer.
     */
    private masterHandler(key: Buffer) {
        this._lastActivity = Date.now();
        const str = key.toString();

        // 1. Handle Focus Events (\x1b[I = Focus In, \x1b[O = Focus Out)
        // These can be embedded anywhere in the stream
        if (str.includes('\x1b[I')) {
            this.lastFocusTime = Date.now();
        }
        // Focus Out (\x1b[O) is just consumed/ignored for now

        // 2. Handle Mouse Sequences (SGR Mode: \x1b[<b;x;yM or m)
        // We use a global regex to catch ALL mouse events in a single packet (common during scrolling)
        const mouseRegex = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
        let match;
        let handledMouse = false;

        while ((match = mouseRegex.exec(str)) !== null) {
            handledMouse = true;
            const button = parseInt(match[1], 10);
            const type = match[4]; // M = Press, m = Release

            if (type === 'M') {
                // Click Handling: Middle (1) only -> Enter
                if (button === 1) {
                    // Ignore click if it happened immediately after gaining focus (within 100ms)
                    if (Date.now() - this.lastFocusTime > 100) {
                        const enterKey = '\r';
                        if (this.activeConsumer) this.activeConsumer(Buffer.from(enterKey), enterKey);
                    }
                }
                // Scroll Up (64) -> Up Arrow
                else if (button === 64) {
                    const upKey = '\u001B[A';
                    if (this.activeConsumer) this.activeConsumer(Buffer.from(upKey), upKey);
                }
                // Scroll Down (65) -> Down Arrow
                else if (button === 65) {
                    const downKey = '\u001B[B';
                    if (this.activeConsumer) this.activeConsumer(Buffer.from(downKey), downKey);
                }
            }
        }

        // 3. Fallback for non-mouse, non-focus keys
        // If we didn't handle any mouse events, and it's not a pure focus sequence, 
        // treat it as standard keyboard input.
        const isPureFocus = str === '\x1b[I' || str === '\x1b[O';

        if (!handledMouse && !isPureFocus) {
            if (this.activeConsumer) {
                this.activeConsumer(key, str);
            } else {
                // Default safety net: Ctrl+C exits if no one is listening
                if (str === '\u0003') {
                    process.exit(0);
                }
            }
        }
    }

    /**
     * Switches the terminal to the Alternate Screen Buffer.
     * Use this for full-screen TUI apps to preserve the user's scrollback history.
     */
    enableAlternateScreen() {
        process.stdout.write('\x1b[?1049h');
    }

    /**
     * Returns the terminal to the Main Screen Buffer.
     * Restores the user's previous terminal state and scrollback.
     */
    disableAlternateScreen() {
        process.stdout.write('\x1b[?1049l');
    }

    /**
     * Clears the current screen buffer (Alt or Main) and moves cursor to Home.
     * Does NOT clear the scrollback history (\x1b[3J) to preserve context if in Main buffer,
     * or just to be standard in Alt buffer.
     */
    clear() {
        process.stdout.write('\x1b[H\x1b[2J');
    }

    /**
     * Enables Mouse Reporting (SGR Extended Mode).
     * Tracks clicks and scrolling.
     */
    enableMouse() {
        // \x1b[?1000h = Enable Mouse Press/Release reporting
        // \x1b[?1006h = Enable SGR Mouse mode (better coordinate support)
        // \x1b[?1015h = Enable Urxvt Mouse mode (alternative)
        // \x1b[?1004h = Enable Window Focus reporting (\x1b[I and \x1b[O)
        process.stdout.write('\x1b[?1000h\x1b[?1006h\x1b[?1015h\x1b[?1004h');
    }

    /**
     * Disables Mouse Reporting.
     */
    disableMouse() {
        process.stdout.write('\x1b[?1000l\x1b[?1006l\x1b[?1015l\x1b[?1004l');
    }
}

export const io = new IOManager();
