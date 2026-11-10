import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
    afterEveryRender,
    Component,
    computed,
    DestroyRef,
    effect,
    EffectRef,
    ElementRef,
    inject,
    Injector,
    PLATFORM_ID,
    signal,
    untracked,
    viewChild,
    WritableSignal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { connectable, defer, map, Observable, OperatorFunction, Subject, Subscription, tap } from 'rxjs';
import {
    COURIER_OPTIONS,
    CREATION_OPTIONS,
    Press,
    FLATTENING_HINTS,
    MailItem,
    OPERATOR_CATEGORIES,
    SORTING_OPERATORS,
    toItem,
    toMail,
} from './mail-catalog';
import { MailClock } from './mail-clock';
import { CourierDepot, CourierRun } from './mail-depot';
import { inLane, Lane, laneTap, MailTransit, Traveller } from './mail-transit';

/** A sorting center sits between the mailbox and the houses and applies one operator. */
interface SortingCenter {
    id: number;
    operator: string;
}

/** What went through a stage (mailbox or sorting center), all subscribers combined. */
interface StageActivity {
    count: number;
    last: MailItem | null;
    status: 'open' | 'complete' | 'error';
}

type HouseStatus = 'off' | 'waiting' | 'complete' | 'error';

/** A delivered mail, with a unique sequence number for tracking in the template. */
type ReceivedMail = MailItem & { seq: number };

/** A house is a subscriber of the pipeline. */
class House {
    readonly subscribed = signal(true);
    /** Latest mail received (most recent first, capped for display). */
    readonly received = signal<ReceivedMail[]>([]);
    /** Total mail received since the pipeline was (re)built, kept across unsubscribes. */
    readonly count = signal(0);
    readonly status = signal<HouseStatus>('off');
    readonly error = signal<string | null>(null);
    /** The effect that keeps this house subscribed; destroyed when the house is removed. */
    watcher?: EffectRef;

    constructor(
        readonly id: number,
        readonly name: string,
        readonly img: string,
    ) { }
}

const MAILBOX = 'mailbox';
const MAX_RECEIVED = 6;
const HOUSE_MODELS = [
    { name: 'Rose cottage', img: 'mailman/house-1.svg' },
    { name: 'Blue manor', img: 'mailman/house-2.svg' },
    { name: 'Oak house', img: 'mailman/house-3.svg' },
];

/** Space between two parallel lanes, in px. */
const LANE_GAP_PX = 16;
/** Length of the last road's end where lanes turn towards their house, in px. */
const SPLIT_PX = 64;
/** How far mail goes into a house before landing, in px. */
const ENTER_PX = 24;

/** A stream line drawn on a road: a house's lane, or the single shared one. */
interface LaneLine {
    key: number | 'shared';
    offset: number;
    off: boolean;
    shared: boolean;
}

/** Layout of the last road: half the previous stage width, road width, house centers (px from the line). */
interface SplitLayout {
    from: number;
    width: number;
    houseY: Record<number, number>;
}

/**
 * The courier lane of a flattening center: from its depot in the courier dispatch to the bottom
 * of its card, as an SVG path in journey coordinates (px from the journey's padding box).
 */
interface CourierRoute {
    id: number;
    d: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
}

/** Radius of the courier lane's turn up towards its center, in px. */
const ROUTE_TURN_PX = 20;

/** Activity key of what enters a sorting center (its output uses the bare id). */
const inputKey = (id: number | string) => `${id}:in`;

@Component({
    imports: [
        NgTemplateOutlet,
        MatButtonModule,
        MatFormFieldModule,
        MatIconModule,
        MatSelectModule,
        MatSlideToggleModule,
        MatSliderModule,
        MatTooltipModule,
    ],
    selector: 'app-postal-service',
    host: { '(document:keydown)': 'onKeydown($event)' },
    styleUrls: [
        './postal-service.css',
        './postal-service.journey.css',
        './postal-service.road.css',
        './postal-service.mail.css',
        './postal-service.couriers.css',
        './postal-service.depot.css',
    ],
    templateUrl: './postal-service.html',
})
export class PostalService {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly injector = inject(Injector);
    private nextCenterId = 1;
    private nextHouseId = 1;
    private nextMailSeq = 1;

    readonly creationOptions = CREATION_OPTIONS;
    readonly operatorGroups = OPERATOR_CATEGORIES.map((category) => ({
        category,
        operators: SORTING_OPERATORS.filter((op) => op.category === category),
    }));

    // --- pipeline configuration -------------------------------------------------
    readonly creation = signal(CREATION_OPTIONS[0].name);
    /** Hot mailbox (shared, late subscribers miss past mail) or cold (one run per house). */
    readonly hot = signal(true);
    readonly centers = signal<SortingCenter[]>([this.newCenter('map')]);
    readonly houses = signal<House[]>([]);
    /** Bumped by "Restart" to rebuild the pipeline (and resubscribe every house). */
    private readonly run = signal(0);

    // --- transit controls ----------------------------------------------------------
    /** Scheduler used by every timed operator, so pause and speed apply everywhere. */
    private readonly clock = new MailClock();
    readonly paused = signal(false);
    /** Transit speed multiplier (1 = real time). */
    readonly speed = signal(1);
    readonly speedSteps = [0.25, 0.5, 1, 2, 4];
    readonly speedIndex = computed(() => this.speedSteps.indexOf(this.speed()));
    readonly formatSpeed = (index: number): string => `${this.speedSteps[index]}×`;

    readonly creationCode = computed(() => this.findCreation(this.creation()).code);
    /** The mailbox posts when the user presses Send / Error / Complete (of and throwError, merged). */
    readonly manual = computed(() => !!this.findCreation(this.creation()).manual);
    /** Presses of the Send / Error / Complete buttons (or [s] / [e] / [c] keys), fed to a manual mailbox. */
    private readonly presses = new Subject<Press>();
    /** The button that was just pressed, briefly highlighted (also when using the keyboard). */
    readonly pressed = signal<Press | null>(null);
    private pressTimer?: ReturnType<typeof setTimeout>;

    // --- courier dispatch: the inner observable of flattening operators -------------
    readonly courierOptions = COURIER_OPTIONS;
    readonly courierCreation = signal(COURIER_OPTIONS[0].name);
    readonly courierOption = computed(() => COURIER_OPTIONS.find((o) => o.name === this.courierCreation()) ?? COURIER_OPTIONS[0]);
    /** Sorting centers whose operator creates couriers (mergeMap, switchMap, concatMap, exhaustMap). */
    readonly flatteningCenters = computed(() =>
        this.centers()
            .map((center, index) => ({ center, index }))
            .filter(({ center }) => this.findOperator(center.operator).flattening),
    );
    readonly partSlots = computed(() =>
        Array.from({ length: this.courierOption().parts }, (_, i) => ({ index: i, label: String.fromCharCode(97 + i) })),
    );

    /** The source code equivalent to the configured pipeline. */
    readonly pipelineCode = computed(() => {
        const ops = this.centers().map((c) => `  ${this.findOperator(c.operator).code},`);
        const source = this.hot()
            ? [`const mailbox$ = connectable(${this.creationCode()}.pipe(map(toMail)));`, 'mailbox$.connect(); // posting starts now, listeners or not']
            : [`const mailbox$ = ${this.creationCode()}.pipe(map(toMail)); // cold: each subscribe starts a new run`];
        const delivery = ops.length ? `const delivery$ = mailbox$.pipe(\n${ops.join('\n')}\n);` : 'const delivery$ = mailbox$;';
        const subscriptions = this.houses()
            .filter((house) => house.subscribed())
            .map((house) => `delivery$.subscribe(house${house.id}); // ${house.name}`);
        const idle = this.hot() ? '// nobody is subscribed: mail is posted but lost' : '// nobody is subscribed: no mail is posted';
        const clockNote = '// timed operators run on mailClock, e.g. interval(1000, mailClock): pause & speed control it';
        const courierDef = this.flatteningCenters().length ? [`const courier = (mail) => ${this.courierOption().code};`] : [];
        const pressNote = this.manual() ? ["const press$ = new Subject<'s' | 'e' | 'c'>(); // the Send [s], Error [e] and Complete [c] buttons"] : [];
        return [clockNote, ...pressNote, ...courierDef, ...source, delivery, '', ...(subscriptions.length ? subscriptions : [idle])].join('\n');
    });

    /**
     * The observable built from the configuration. Each config change creates a new
     * observable (and a fresh activity board), so every house effect resubscribes.
     */
    readonly pipeline = computed(() => {
        this.run();
        const activity = signal<Record<string, StageActivity>>({});
        const transit = new MailTransit(this.clock);
        const show = (stage: string, change: Parameters<PostalService['updateStage']>[2]) => this.updateStage(activity, stage, change);
        const centers = this.centers();

        // Roads are numbered from the mailbox: road 0 leaves it, road i + 1 leaves center i.
        // Every house has its own lane (subscription), except on the roads before a
        // multicasting center, which carry a single stream shared by everyone.
        const split = centers.reduce((at, c, i) => (this.findOperator(c.operator).category === 'multicasting' ? i + 1 : at), 0);
        const laneOn = (road: number, lane: Lane): Lane => (road < split ? null : lane);

        // What a stage shows is delayed until the mail has travelled the road to it.
        const arrive = (stage: string, road: number) =>
            laneTap((captured) => {
                const lane = laneOn(road, captured);
                const later = (change: Parameters<typeof show>[1]) => transit.at(transit.arrival(road, lane), () => show(stage, change));
                return {
                    next: (value) => later({ last: toItem(value), bump: true }),
                    complete: () => later({ status: 'complete' }),
                    error: () => later({ status: 'error' }),
                };
            });
        /**
         * Sends mail on `road`, once it reached the stage (by `fromRoad`, or posted at the mailbox)
         * and, for a flattening center, once its courier delivered it.
         */
        const leave = (stage: string | null, road: number, fromRoad?: number, depot?: CourierDepot) =>
            laneTap((captured) => {
                const lane = laneOn(road, captured);
                const reached = () =>
                    fromRoad === undefined
                        ? transit.posted()
                        : Math.max(transit.arrival(fromRoad, laneOn(fromRoad, captured)), depot?.delivered(laneOn(fromRoad, captured)) ?? -Infinity);
                const settle = (status: StageActivity['status']) =>
                    stage && transit.at(Math.max(transit.lastDeparture(road, lane), reached()), () => show(stage, { status }));
                return {
                    next: (value) => {
                        const item = toItem(value);
                        transit.depart(road, lane, item, reached(), stage ? () => show(stage, { last: item, bump: true }) : undefined);
                    },
                    complete: () => settle('complete'),
                    error: () => settle('error'),
                };
            });
        const post = tap({
            next: (value: unknown) => {
                const item = toItem(value);
                transit.post(() => show(MAILBOX, { last: item, bump: true }));
            },
            complete: () => transit.at(transit.posted(), () => show(MAILBOX, { status: 'complete' })),
            error: () => transit.at(transit.posted(), () => show(MAILBOX, { status: 'error' })),
        });

        const create = this.findCreation(this.creation()).create;
        const source$ = defer(() => create(this.clock, this.presses)).pipe(map(toMail), post);
        const courierOption = this.courierOption();
        // Hot: one shared mailbox run, houses only get mail posted after they subscribe.
        // Cold: every subscription (house) triggers its own run from the start.
        // Either way, each house's lane leaves the mailbox on its own.
        const mailbox = this.hot() ? connectable(source$, { connector: () => new Subject<unknown>(), resetOnDisconnect: false }) : null;
        let mail$: Observable<unknown> = (mailbox ?? source$).pipe(leave(null, 0));
        // Flattening centers get a depot showing their couriers (inner subscriptions).
        const depots = new Map<number, CourierDepot>();
        centers.forEach((center, i) => {
            const op = this.findOperator(center.operator);
            let depot: CourierDepot | undefined;
            let operator: OperatorFunction<any, unknown>;
            if (op.flattening) {
                depot = new CourierDepot(transit);
                depots.set(center.id, depot);
                operator = depot.operator(op.flattening, courierOption.create(this.clock), i, (captured) => laneOn(i, captured));
            } else {
                operator = op.operator(this.clock);
            }
            mail$ = mail$.pipe(arrive(inputKey(center.id), i), operator, leave(String(center.id), i + 1, i, depot));
        });
        /** The road leading to the houses. */
        const lastRoad = centers.length;
        return { mail$, mailbox, transit, depots, lastRoad, split, activity: activity.asReadonly() };
    });

    readonly activity = computed(() => this.pipeline().activity());
    readonly travellers = computed(() => this.pipeline().transit.travellers());

    // --- lanes: one stream line per house ---------------------------------------
    /** Vertical offset (px) of each house's lane from the road's center line, top house on top. */
    private readonly laneOffsets = computed(() => {
        const houses = this.houses();
        return new Map(houses.map((house, k) => [house.id, (k - (houses.length - 1) / 2) * LANE_GAP_PX]));
    });
    /** Docks are tall enough to hold every lane. */
    /** Journey columns: sources, then a road + card per center, the last (stretching) road and the houses. */
    readonly journeyColumns = computed(() =>
        [
            'var(--stage-width)',
            ...this.centers().map(() => 'var(--road-width) var(--stage-width)'),
            'minmax(var(--road-width), 1fr)',
            'var(--houses-width)',
        ].join(' '),
    );
    readonly dockHeight = computed(() => Math.max(32, (this.houses().length - 1) * LANE_GAP_PX + 20));
    private readonly journey = viewChild<ElementRef<HTMLElement>>('journey');
    /** Measured layout of the last road, where lanes split towards each house. */
    private readonly splitLayout = signal<SplitLayout | null>(null);
    /** Measured courier lanes, joining the courier dispatch to each flattening center. */
    readonly courierRoutes = signal<CourierRoute[]>([]);

    constructor() {
        if (this.isBrowser) {
            inject(DestroyRef).onDestroy(this.clock.start());
        }
        effect(() => {
            this.clock.paused = this.paused();
            this.clock.speed = this.speed();
        });

        // A hot mailbox starts posting once per pipeline, whoever is listening.
        // Connecting on the next macrotask lets houses subscribe first, so synchronous
        // sources (of, from, range) are not lost to nobody.
        effect((onCleanup) => {
            const { mailbox } = this.pipeline();
            if (!mailbox || !this.isBrowser) {
                return;
            }
            let connection: Subscription | undefined;
            const timer = setTimeout(() => (connection = mailbox.connect()));
            onCleanup(() => {
                clearTimeout(timer);
                connection?.unsubscribe();
            });
        });

        // Houses move as they are built, demolished or fill up with mail: keep the split in sync.
        afterEveryRender(() => {
            this.measureSplit();
            this.measureCourierRoutes();
        });

        this.addHouse();
    }

    // --- actions -----------------------------------------------------------------
    addCenter(index: number): void {
        this.centers.update((list) => [...list.slice(0, index), this.newCenter('filter'), ...list.slice(index)]);
    }

    removeCenter(id: number): void {
        this.centers.update((list) => list.filter((c) => c.id !== id));
    }

    assignOperator(id: number, operator: string): void {
        this.centers.update((list) => list.map((c) => (c.id === id ? { ...c, operator } : c)));
    }

    addHouse(): void {
        const id = this.nextHouseId++;
        const model = HOUSE_MODELS[(id - 1) % HOUSE_MODELS.length];
        const round = Math.floor((id - 1) / HOUSE_MODELS.length);
        const house = new House(id, round ? `${model.name} ${round + 1}` : model.name, model.img);
        house.watcher = this.watchHouse(house);
        this.houses.update((list) => [...list, house]);
    }

    removeHouse(house: House): void {
        house.watcher?.destroy();
        this.houses.update((list) => list.filter((h) => h !== house));
    }

    togglePause(): void {
        this.paused.update((paused) => !paused);
    }

    setSpeedIndex(index: number): void {
        this.speed.set(this.speedSteps[index] ?? 1);
    }

    /** Posts a mail (send), fails (error) or closes (complete) the mailbox, when it is manual. */
    press(kind: Press): void {
        if (!this.manual()) {
            return;
        }
        this.presses.next(kind);
        this.pressed.set(kind);
        clearTimeout(this.pressTimer);
        this.pressTimer = setTimeout(() => this.pressed.set(null), 180);
    }

    /** [s] sends, [e] fails and [c] completes a manual mailbox, unless the user is typing or choosing in a field. */
    onKeydown(event: KeyboardEvent): void {
        const kind = ({ s: 'send', e: 'error', c: 'complete' } as const)[event.key.toLowerCase() as 's' | 'e' | 'c'];
        if (!kind || event.repeat || event.ctrlKey || event.metaKey || event.altKey || !this.manual()) {
            return;
        }
        const target = event.target as HTMLElement | null;
        if (target?.closest('input, textarea, select, [contenteditable], mat-select, [role="listbox"], [role="combobox"]')) {
            return;
        }
        event.preventDefault();
        this.press(kind);
    }

    restart(): void {
        this.run.update((n) => n + 1);
    }

    // --- template helpers --------------------------------------------------------
    stage(id: number | string): StageActivity | undefined {
        return this.activity()[String(id)];
    }

    stageInput(id: number): StageActivity | undefined {
        return this.activity()[inputKey(id)];
    }

    travellersOn(road: number): Traveller[] {
        return this.travellers().filter((t) => t.road === road);
    }

    /** The lanes drawn on a road: a single shared one before a multicast, else one per house. */
    lanesOn(road: number | null): LaneLine[] {
        if (road === null) {
            return [];
        }
        if (road < this.pipeline().split) {
            return [{ key: 'shared', offset: 0, off: false, shared: true }];
        }
        return this.houses().map((house) => ({ key: house.id, offset: this.laneOffset(house.id), off: !house.subscribed(), shared: false }));
    }

    laneOffset(lane: Lane): number {
        return lane === null ? 0 : (this.laneOffsets().get(lane) ?? 0);
    }

    /** SVG path of a lane leaving the road's line to reach its house. */
    splitPath(lane: LaneLine): string {
        const y0 = lane.offset;
        const y1 = typeof lane.key === 'number' ? (this.splitLayout()?.houseY[lane.key] ?? y0) : y0;
        const s = SPLIT_PX;
        return `M0 ${y0} C${s / 2} ${y0} ${s / 2} ${y1} ${s} ${y1} L${s + ENTER_PX} ${y1}`;
    }

    /** Where a traveller on the last road turns towards its house (vertical move and timing). */
    splitOf(traveller: Traveller): { dy: number; at: number; len: number } | null {
        const layout = this.splitLayout();
        if (!layout || traveller.lane === null) {
            return null;
        }
        const offset = this.laneOffset(traveller.lane);
        const distance = layout.from + layout.width + ENTER_PX;
        return {
            dy: (layout.houseY[traveller.lane] ?? offset) - offset,
            at: (layout.from + layout.width - SPLIT_PX) / distance,
            len: SPLIT_PX / distance,
        };
    }

    operatorCode(name: string): string {
        return this.findOperator(name).code;
    }

    operatorCategory(name: string): string {
        return this.findOperator(name).category;
    }

    /** The courier depot of a flattening center (mergeMap, switchMap...), if any. */
    depot(centerId: number): CourierDepot | undefined {
        return this.pipeline().depots.get(centerId);
    }

    flatteningHint(name: string): string {
        const kind = this.findOperator(name).flattening;
        return kind ? FLATTENING_HINTS[kind] : '';
    }

    readonly courierStates: Record<CourierRun['state'], string> = {
        error: 'lost',
        queued: 'waiting',
        running: 'on the way',
        done: 'delivered',
        cancelled: 'cancelled',
        dropped: 'turned away',
    };

    /** Tooltip of a courier run: which house's subscription it belongs to. */
    runTitle(run: CourierRun): string {
        const house = run.lane === null ? null : this.houses().find((h) => h.id === run.lane);
        return `${run.letter.label}: ${this.courierStates[run.state]}${house ? ` (${house.name})` : ''}`;
    }

    // --- internals ---------------------------------------------------------------
    /** Measures where each house sits relative to the last road (offsets ignore hover transforms). */
    private measureSplit(): void {
        const journey = this.journey()?.nativeElement;
        const road = journey?.querySelector<HTMLElement>('.road--last');
        const stage = road?.previousElementSibling as HTMLElement | null;
        if (!road || !stage) {
            return;
        }
        const centerY = road.offsetTop + road.offsetHeight / 2;
        const houseY: Record<number, number> = {};
        road.parentElement!.querySelectorAll<HTMLElement>('[data-house]').forEach((el) => {
            houseY[Number(el.dataset['house'])] = Math.round(el.offsetTop + el.offsetHeight / 2 - centerY);
        });
        const layout: SplitLayout = { from: stage.offsetWidth / 2, width: road.offsetWidth, houseY };
        if (JSON.stringify(layout) !== JSON.stringify(this.splitLayout())) {
            this.splitLayout.set(layout);
        }
    }

    /**
     * Measures the courier lane of every flattening center: it leaves the courier dispatch
     * level with that center's depot, runs under the cards and turns up into the center.
     */
    private measureCourierRoutes(): void {
        const journey = this.journey()?.nativeElement;
        const box = journey?.querySelector<HTMLElement>('.courier-box');
        const routes: CourierRoute[] = [];
        if (journey && box) {
            const origin = journey.getBoundingClientRect();
            const dx = journey.scrollLeft - origin.left - journey.clientLeft;
            const dy = journey.scrollTop - origin.top - journey.clientTop;
            const boxRight = box.getBoundingClientRect().right + dx;
            for (const { center } of this.flatteningCenters()) {
                const depot = box.querySelector<HTMLElement>(`[data-depot="${center.id}"]`);
                const card = journey.querySelector<HTMLElement>(`[data-center="${center.id}"]`);
                if (!depot || !card) {
                    continue;
                }
                const from = depot.getBoundingClientRect();
                const to = card.getBoundingClientRect();
                const start = { x: Math.round(boxRight), y: Math.round(from.top + Math.min(from.height / 2, 16) + dy) };
                const end = { x: Math.round(to.left + to.width / 2 + dx), y: Math.round(to.bottom + dy) };
                const r = Math.max(0, Math.min(ROUTE_TURN_PX, (end.x - start.x) / 2, (start.y - end.y) / 2));
                const d = `M${start.x} ${start.y} L${end.x - r} ${start.y} Q${end.x} ${start.y} ${end.x} ${start.y - r} L${end.x} ${end.y}`;
                routes.push({ id: center.id, d, start, end });
            }
        }
        if (JSON.stringify(routes) !== JSON.stringify(this.courierRoutes())) {
            this.courierRoutes.set(routes);
        }
    }

    private newCenter(operator: string): SortingCenter {
        const id = this.nextCenterId++;
        return { id, operator };
    }

    /**
     * Keeps a house subscribed to the current pipeline while its toggle is on.
     * Received mail survives an unsubscribe; it is only cleared when the pipeline is rebuilt.
     */
    private watchHouse(house: House): EffectRef {
        let lastPipeline: unknown = null;
        return effect(
            (onCleanup) => {
                const pipeline = this.pipeline();
                const subscribed = house.subscribed();
                untracked(() => {
                    if (pipeline !== lastPipeline) {
                        lastPipeline = pipeline;
                        house.received.set([]);
                        house.count.set(0);
                    }
                    house.error.set(null);
                    house.status.set(subscribed ? 'waiting' : 'off');
                });
                if (!subscribed || !this.isBrowser) {
                    return;
                }
                // Mail is shown once it has travelled the last road, on this house's lane. In-flight
                // mail still lands after an unsubscribe (it was received), but not after a rebuild.
                let live = true;
                const { transit, lastRoad, split } = pipeline;
                const lane = lastRoad < split ? null : house.id;
                const onArrival = (work: () => void) => transit.at(transit.arrival(lastRoad, lane), () => lastPipeline === pipeline && work());
                const subscription = untracked(() =>
                    inLane(house.id, () => pipeline.mail$.subscribe({
                        next: (value) => {
                            const item = toItem(value);
                            onArrival(() => {
                                const mail = { ...item, seq: this.nextMailSeq++ };
                                house.received.update((list) => [mail, ...list].slice(0, MAX_RECEIVED));
                                house.count.update((n) => n + 1);
                            });
                        },
                        complete: () => onArrival(() => live && house.status.set('complete')),
                        error: (err) =>
                            onArrival(() => {
                                if (live) {
                                    house.status.set('error');
                                    house.error.set(String(err?.message ?? err));
                                }
                            }),
                    })),
                );
                onCleanup(() => {
                    live = false;
                    subscription.unsubscribe();
                });
            },
            { injector: this.injector },
        );
    }

    private findCreation(name: string) {
        return CREATION_OPTIONS.find((c) => c.name === name) ?? CREATION_OPTIONS[0];
    }

    private findOperator(name: string) {
        return SORTING_OPERATORS.find((op) => op.name === name) ?? SORTING_OPERATORS[0];
    }

    private updateStage(
        board: WritableSignal<Record<string, StageActivity>>,
        stage: string,
        change: { last?: MailItem; bump?: boolean; status?: StageActivity['status'] },
    ): void {
        board.update((all) => {
            const current = all[stage] ?? { count: 0, last: null, status: 'open' as const };
            return {
                ...all,
                [stage]: {
                    count: current.count + (change.bump ? 1 : 0),
                    last: change.last ?? current.last,
                    status: change.status ?? current.status,
                },
            };
        });
    }
}
