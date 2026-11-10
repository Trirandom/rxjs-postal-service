import { computed, signal } from '@angular/core';
import { defer, finalize, Observable, OperatorFunction, tap } from 'rxjs';
import { Flattening, flatten, Mail, MailItem, toItem } from './mail-catalog';
import { DEPARTURE_GAP_MS, Lane, laneNow, MailTransit, TRANSIT_MS } from './mail-transit';

/**
 * What became of a letter handed to a flattening operator:
 * - queued: waiting for the running courier to finish (concatMap)
 * - running: its courier (inner subscription) is delivering parts
 * - done: the courier completed
 * - cancelled: the courier was unsubscribed before completing (switchMap)
 * - dropped: no courier was ever sent (exhaustMap)
 * - error: the courier failed, which fails the whole delivery
 */
export type CourierState = 'queued' | 'running' | 'done' | 'cancelled' | 'dropped' | 'error';

/** One letter and its courier, as displayed in the depot. */
export interface CourierRun {
    id: number;
    lane: Lane;
    letter: MailItem;
    state: CourierState;
    /** Parts delivered so far. */
    parts: number;
}

/** A letter tracked from its arrival, with the delay between the pipeline and what is displayed. */
interface Track {
    id: number;
    lane: Lane;
    letter: MailItem;
    /** Display time minus pipeline time, fixed when the letter reaches the center. */
    lag: number;
}

/** A part on its way from the courier dispatch to the flattening center, on the courier lane. */
export interface Parcel {
    id: number;
    item: MailItem;
    /** Real-time duration of the trip, in ms (the clock speed at departure applied). */
    duration: number;
}

/** How long a finished run stays in the depot, in clock ms. */
const LINGER_MS = 1600;
/** Runs shown at once (the oldest ones are hidden). */
const SHOWN_RUNS = 4;

/**
 * The courier depot of a flattening sorting center (mergeMap, switchMap, concatMap, exhaustMap).
 *
 * Each letter that reaches the center becomes a run. The project function is instrumented so
 * every inner subscription (a courier) reports when it starts, delivers a part, completes or
 * is cancelled. Letters the operator does not project right away are queued (concatMap) or
 * dropped (exhaustMap).
 *
 * Like the rest of the journey, the pipeline itself is never delayed: events are displayed
 * with the lag of their letter (time spent travelling to the center), in order per lane.
 */
export class CourierDepot {
    private readonly runs = signal<CourierRun[]>([]);
    readonly shown = computed(() => this.runs().slice(-SHOWN_RUNS));
    readonly hidden = computed(() => Math.max(0, this.runs().length - SHOWN_RUNS));
    /** Parts travelling on the courier lane, from the courier dispatch to the center. */
    readonly parcels = signal<Parcel[]>([]);
    private nextId = 1;
    private nextParcelId = 1;
    /** Display time of the latest parcel departure, per lane, so parts don't overlap on the courier lane. */
    private readonly parcelAt = new Map<Lane, number>();
    /** Display time of the latest event, per lane, so events never show out of order. */
    private readonly shownAt = new Map<Lane, number>();
    /** Display time of the latest part delivered, per lane: it leaves the center no earlier. */
    private readonly deliveredAt = new Map<Lane, number>();

    constructor(private readonly transit: MailTransit) { }

    /** Clock time at which the latest part on `lane` shows as delivered by its courier. */
    delivered(lane: Lane): number {
        return this.deliveredAt.get(lane) ?? -Infinity;
    }

    /**
     * The flattening operator, instrumented. `road` is the road leading to the center and
     * `laneOf` maps the subscription's house to the lane drawn on that road.
     */
    operator(kind: Flattening, project: (mail: Mail) => Observable<Mail>, road: number, laneOf: (captured: Lane) => Lane): OperatorFunction<Mail, Mail> {
        return (source) =>
            defer(() => {
                // One operator instance per subscription (house): its lane is known at subscribe time.
                const lane = laneOf(laneNow());
                /** Letters waiting for a courier, oldest first (concatMap buffers them). */
                const queue: Track[] = [];
                /** The letter being handed to the operator right now. */
                let pending: Track | null = null;

                const letters = new Observable<Mail>((subscriber) =>
                    source.subscribe({
                        next: (mail) => {
                            const arrival = Math.max(this.transit.arrival(road, lane), this.transit.now());
                            const track: Track = { id: this.nextId++, lane, letter: toItem(mail), lag: arrival - this.transit.now() };
                            this.shownAt.set(lane, Math.max(arrival, this.shownAt.get(lane) ?? -Infinity));
                            pending = track;
                            subscriber.next(mail);
                            // Not projected synchronously: the operator kept the letter for later or ignored it.
                            if (pending === track) {
                                pending = null;
                                if (kind === 'exhaust') {
                                    this.show(track, { state: 'dropped' });
                                } else {
                                    queue.push(track);
                                    this.show(track, { state: 'queued' });
                                }
                            }
                        },
                        error: (err) => subscriber.error(err),
                        complete: () => subscriber.complete(),
                    }),
                );

                const instrumented = (mail: Mail): Observable<Mail> => {
                    const track = pending ?? queue.shift();
                    pending = null;
                    if (!track) {
                        return project(mail);
                    }
                    this.show(track, { state: 'running' });
                    let ended = false;
                    return project(mail).pipe(
                        tap({
                            next: (part) => this.deliveredAt.set(lane, this.ship(lane, part, this.show(track, { part: true }))),
                            complete: () => {
                                ended = true;
                                this.show(track, { state: 'done' });
                            },
                            error: () => {
                                ended = true;
                                this.show(track, { state: 'error' });
                            },
                        }),
                        finalize(() => ended || this.show(track, { state: 'cancelled' })),
                    );
                };

                return letters.pipe(flatten(kind, instrumented));
            });
    }

    /**
     * Sends a delivered part on the courier lane, no earlier than `sentAt` and spaced from the
     * previous part. Returns when it reaches the center (it can only leave the center from then).
     */
    private ship(lane: Lane, part: Mail, sentAt: number): number {
        const departAt = Math.max(sentAt, (this.parcelAt.get(lane) ?? -Infinity) + DEPARTURE_GAP_MS);
        this.parcelAt.set(lane, departAt);
        this.transit.at(departAt, () => {
            const parcel: Parcel = { id: this.nextParcelId++, item: toItem(part), duration: this.transit.realTime(TRANSIT_MS) };
            this.parcels.update((list) => [...list, parcel]);
            this.transit.at(this.transit.now() + TRANSIT_MS, () => this.parcels.update((list) => list.filter((p) => p !== parcel)));
        });
        return departAt + TRANSIT_MS;
    }

    /** Displays a change of a run, after its previous events and with its letter's lag. Returns when. */
    private show(track: Track, change: { state?: CourierState; part?: boolean }): number {
        const at = Math.max(this.transit.now() + track.lag, this.shownAt.get(track.lane) ?? -Infinity);
        this.shownAt.set(track.lane, at);
        this.transit.at(at, () =>
            this.runs.update((runs) => {
                const run = runs.find((r) => r.id === track.id) ?? { id: track.id, lane: track.lane, letter: track.letter, state: 'running' as const, parts: 0 };
                const next: CourierRun = { ...run, state: change.state ?? run.state, parts: run.parts + (change.part ? 1 : 0) };
                const others = runs.filter((r) => r.id !== track.id);
                return [...others, next].sort((a, b) => a.id - b.id);
            }),
        );
        if (change.state === 'done' || change.state === 'cancelled' || change.state === 'dropped' || change.state === 'error') {
            this.transit.at(at + LINGER_MS, () => this.runs.update((runs) => runs.filter((r) => r.id !== track.id)));
        }
        return at;
    }
}
