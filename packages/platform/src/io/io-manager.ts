export type KeyHandler = (key: Buffer, str: string) => void;

class IOManager {
    private activeConsumer: KeyHandler | null = null;
    private masterHandlerBound: (key: Buffer) => void;
    private _lastActivity: number = Date.now();
    private lastFocusTime: number = 0;
    private pointerMode: 'unknown' | 'mouse' | 'touchpad' = 'unknown';
    private pointerDetectStarted: boolean = false;
    private lastPointerActivation = {
        button: -1,
        timestamp: 0,
    };

    constructor() {
        this.masterHandlerBound = this.masterHandler.bind(this);
    }

    get lastActivity(): number {
        return this._lastActivity;
    }

    start() {
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.setEncoding('utf8');
        process.stdin.resume();

        this.startPointerDetection();

        process.stdin.off('data', this.masterHandlerBound);
        process.stdin.on('data', this.masterHandlerBound);
    }

    destroy() {
        this.activeConsumer = null;
        process.stdin.off('data', this.masterHandlerBound);
        process.stdin.pause();
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }
    }

    consume(handler: KeyHandler) {
        this.activeConsumer = handler;
    }

    release(handler: KeyHandler) {
        if (this.activeConsumer === handler) {
            this.activeConsumer = null;
        }
    }

    reset() {
        this.activeConsumer = null;
    }

    private masterHandler(key: Buffer) {
        this._lastActivity = Date.now();
        const str = key.toString();

        if (str.includes('\x1b[I')) {
            this.lastFocusTime = Date.now();
        }

        const mouseRegex = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
        let match: RegExpExecArray | null;
        let handledMouse = false;

        while ((match = mouseRegex.exec(str)) !== null) {
            handledMouse = true;
            const button = parseInt(match[1], 10);
            const type = match[4];

            if (button === 64 && type === 'M') {
                const upKey = '\u001B[A';
                if (this.activeConsumer) this.activeConsumer(Buffer.from(upKey), upKey);
                continue;
            }

            if (button === 65 && type === 'M') {
                const downKey = '\u001B[B';
                if (this.activeConsumer) this.activeConsumer(Buffer.from(downKey), downKey);
                continue;
            }

            const normalized = button & 3;
            if (normalized === 1 && this.pointerMode !== 'mouse') {
                this.pointerMode = 'mouse';
            }

            const isTouchLikePointer = this.pointerMode === 'touchpad' || this.pointerMode === 'unknown';

            if (normalized === 1 && type === 'M') {
                this.emitEnterForPointer(normalized);
            } else if (
                isTouchLikePointer &&
                (normalized === 0 || normalized === 2) &&
                (type === 'M' || type === 'm')
            ) {
                this.emitEnterForPointer(normalized);
            }
        }

        const isPureFocus = str === '\x1b[I' || str === '\x1b[O';

        if (!handledMouse && !isPureFocus) {
            if (this.activeConsumer) {
                this.activeConsumer(key, str);
            } else if (str === '\u0003') {
                process.exit(0);
            }
        }
    }

    enableAlternateScreen() {
        process.stdout.write('\x1b[?1049h');
    }

    disableAlternateScreen() {
        process.stdout.write('\x1b[?1049l');
    }

    clear() {
        process.stdout.write('\x1b[H\x1b[2J');
    }

    enableMouse() {
        process.stdout.write('\x1b[?1000h\x1b[?1006h\x1b[?1015h\x1b[?1004h');
    }

    disableMouse() {
        process.stdout.write('\x1b[?1000l\x1b[?1006l\x1b[?1015l\x1b[?1004l');
    }

    private startPointerDetection() {
        if (this.pointerDetectStarted) return;
        this.pointerDetectStarted = true;

        const forced = (process.env.VISHNU_POINTER_DEVICE || '').toLowerCase();
        if (forced === 'mouse' || forced === 'touchpad') {
            this.pointerMode = forced as 'mouse' | 'touchpad';
            return;
        }

        if (process.platform !== 'win32') {
            this.pointerMode = 'mouse';
            return;
        }

        void import('child_process')
            .then(({ exec }) => {
                const cmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_PointingDevice | Select-Object -ExpandProperty Name"';
                exec(cmd, (err, stdout) => {
                    if (err || !stdout) {
                        this.pointerMode = 'unknown';
                        return;
                    }

                    const names = stdout
                        .split(/\r?\n/)
                        .map(line => line.trim())
                        .filter(Boolean);

                    const touchpadKeywords = ['touchpad', 'trackpad', 'precision', 'synaptics', 'elan', 'alps', 'clickpad'];
                    const mouseKeywords = ['mouse', 'trackball', 'trackpoint'];

                    let touchpadFound = false;
                    let mouseFound = false;

                    for (const name of names) {
                        const lowered = name.toLowerCase();
                        if (touchpadKeywords.some(keyword => lowered.includes(keyword))) touchpadFound = true;
                        if (mouseKeywords.some(keyword => lowered.includes(keyword)) && !lowered.includes('touchpad')) {
                            mouseFound = true;
                        }
                    }

                    if (touchpadFound && !mouseFound) {
                        this.pointerMode = 'touchpad';
                    } else if (touchpadFound && mouseFound) {
                        this.pointerMode = 'unknown';
                    } else if (mouseFound) {
                        this.pointerMode = 'mouse';
                    } else {
                        this.pointerMode = 'unknown';
                    }
                });
            })
            .catch(() => {
                this.pointerMode = 'unknown';
            });
    }

    private emitEnterForPointer(button: number) {
        const now = Date.now();
        if (now - this.lastFocusTime <= 100) {
            return;
        }

        if (this.lastPointerActivation.button === button && now - this.lastPointerActivation.timestamp <= 150) {
            return;
        }

        this.lastPointerActivation = {
            button,
            timestamp: now,
        };

        const enterKey = '\r';
        if (this.activeConsumer) {
            this.activeConsumer(Buffer.from(enterKey), enterKey);
        }
    }
}

export const io = new IOManager();
