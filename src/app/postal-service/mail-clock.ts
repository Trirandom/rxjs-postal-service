import { VirtualTimeScheduler } from 'rxjs';

/**
 * The mail clock: an RxJS scheduler whose time can be paused and sped up.
 *
 * Every timed operator of the pipeline (interval, delay, debounceTime, bufferTime...)
 * runs on this scheduler instead of the default `asyncScheduler`. A real-time ticker
 * advances the virtual time by `elapsed * speed`, or not at all while paused, so the
 * whole mail journey freezes or accelerates consistently.
 */
export class MailClock extends VirtualTimeScheduler {
    speed = 1;
    paused = false;
    private time = 0;

    constructor() {
        // Nothing runs until the ticker advances time (default maxFrames is Infinity).
        super(undefined, 0);
    }

    /** Starts the real-time ticker; returns a function that stops it. */
    start(tickMs = 16): () => void {
        let last = performance.now();
        const id = setInterval(() => {
            const now = performance.now();
            const elapsed = now - last;
            last = now;
            if (!this.paused) {
                this.advance(elapsed * this.speed);
            }
        }, tickMs);
        return () => clearInterval(id);
    }

    /** Moves virtual time forward, running every action that falls due on the way. */
    advance(ms: number): void {
        this.time += ms;
        this.maxFrames = this.time;
        try {
            this.flush();
        } finally {
            // flush() leaves `frame` on the last executed action; new work must be
            // scheduled relative to "now".
            this.frame = this.time;
        }
    }
}
