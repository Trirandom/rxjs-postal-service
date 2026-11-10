import { signal } from '@angular/core';
import { MonoTypeOperatorFunction, Observable } from 'rxjs';
import { MailItem } from './mail-catalog';
import { MailClock } from './mail-clock';

/** Clock time a mail takes to travel one road (from one stage's dock to the next). */
export const TRANSIT_MS = 900;
/** Minimum clock time between two mails leaving on the same lane, so bursts stay readable. */
export const DEPARTURE_GAP_MS = 300;

/**
 * A lane is the stream line of one subscription: the id of the house it delivers to, or
 * `null` where the stream is shared by every house (before a hot mailbox or a share()).
 */
export type Lane = number | null;

/** A mail currently travelling on a lane of a road. */
export interface Traveller {
    id: number;
    /** Road index: 0 leaves the mailbox, i + 1 leaves sorting center i. */
    road: number;
    lane: Lane;
    item: MailItem;
    /** Real-time duration of the trip, in ms (the clock speed at departure applied). */
    duration: number;
}

/**
 * The visual timeline of the journey.
 *
 * RxJS moves mail through synchronous operators instantly, which leaves nothing to see.
 * This timeline delays what the stages *display* (never the pipeline itself): mail leaves a
 * stage on a road, travels for TRANSIT_MS, and only then shows up at the next stage. Every
 * lane keeps its own timeline. Everything is scheduled on the mail clock, so pause and speed
 * apply to the trips too.
 */
export class MailTransit {
    readonly travellers = signal<Traveller[]>([]);
    /** Clock time of the latest departure, per road and lane. */
    private readonly departures = new Map<string, number>();
    /** Clock time at which the mailbox showed its latest post. */
    private lastPost = -Infinity;
    private nextId = 1;

    constructor(private readonly clock: MailClock) { }

    /** Shows a newly posted mail at the mailbox, spaced from the previous post. Returns when. */
    post(onPost: () => void): number {
        this.lastPost = Math.max(this.clock.now(), this.lastPost + DEPARTURE_GAP_MS);
        this.at(this.lastPost, onPost);
        return this.lastPost;
    }

    /** Clock time at which the latest post is shown at the mailbox. */
    posted(): number {
        return this.lastPost;
    }

    /** Current clock time. */
    now(): number {
        return this.clock.now();
    }

    /** Real-time duration (ms) of `ms` of clock time, at the current speed. */
    realTime(ms: number): number {
        return ms / this.clock.speed;
    }

    /** Clock time at which the latest mail sent on `road` / `lane` reaches the next stage. */
    arrival(road: number, lane: Lane): number {
        return this.lastDeparture(road, lane) + TRANSIT_MS;
    }

    /** Sends a mail on a lane, no earlier than `notBefore` and spaced from the previous one. */
    depart(road: number, lane: Lane, item: MailItem, notBefore: number, onDepart?: () => void): void {
        const at = Math.max(this.clock.now(), notBefore, this.lastDeparture(road, lane) + DEPARTURE_GAP_MS);
        this.departures.set(key(road, lane), at);
        this.at(at, () => {
            onDepart?.();
            const traveller: Traveller = { id: this.nextId++, road, lane, item, duration: TRANSIT_MS / this.clock.speed };
            this.travellers.update((list) => [...list, traveller]);
            this.at(this.clock.now() + TRANSIT_MS, () => this.travellers.update((list) => list.filter((t) => t !== traveller)));
        });
    }

    /** Clock time of the latest departure on a lane (-Infinity if none). */
    lastDeparture(road: number, lane: Lane): number {
        return this.departures.get(key(road, lane)) ?? -Infinity;
    }

    /** Runs `work` at the given clock time (right away if it is already past). */
    at(time: number, work: () => void): void {
        this.clock.schedule(() => work(), Math.max(0, time - this.clock.now()));
    }
}

const key = (road: number, lane: Lane) => `${road}/${lane ?? 'shared'}`;

// --- lanes of subscriptions ----------------------------------------------------------

/** Lane of the subscription being set up or notified right now (subscribe chains are synchronous). */
let currentLane: Lane = null;

/** Lane of the subscription being set up right now. */
export const laneNow = (): Lane => currentLane;

/** Runs `work` as part of the given lane: subscriptions made meanwhile belong to it. */
export function inLane<T>(lane: Lane, work: () => T): T {
    const previous = currentLane;
    currentLane = lane;
    try {
        return work();
    } finally {
        currentLane = previous;
    }
}

export interface LaneHooks {
    next?: (value: unknown) => void;
    error?: () => void;
    complete?: () => void;
}

/**
 * Like tap(), but the hooks know the lane (house) of the subscription they observe.
 *
 * The lane is captured when the subscription is made (inside `inLane`), and re-entered while
 * notifying downstream, so operators that resubscribe on complete/error (repeat, retry)
 * resubscribe in the same lane.
 */
export function laneTap<T>(hooks: (lane: Lane) => LaneHooks): MonoTypeOperatorFunction<T> {
    return (source) =>
        new Observable<T>((subscriber) => {
            const lane = currentLane;
            const { next, error, complete } = hooks(lane);
            return inLane(lane, () =>
                source.subscribe({
                    next: (value) => {
                        next?.(value);
                        inLane(lane, () => subscriber.next(value));
                    },
                    error: (err) => {
                        error?.();
                        inLane(lane, () => subscriber.error(err));
                    },
                    complete: () => {
                        complete?.();
                        inLane(lane, () => subscriber.complete());
                    },
                }),
            );
        });
}
