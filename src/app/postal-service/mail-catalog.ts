import {
    auditTime,
    bufferCount,
    bufferTime,
    catchError,
    concatMap,
    concatWith,
    debounceTime,
    defer,
    delay,
    distinct,
    distinctUntilChanged,
    elementAt,
    exhaustMap,
    filter,
    finalize,
    first,
    from,
    ignoreElements,
    interval,
    last,
    map,
    mergeMap,
    Observable,
    of,
    OperatorFunction,
    SchedulerLike,
    pairwise,
    range,
    reduce,
    repeat,
    retry,
    sampleTime,
    scan,
    share,
    shareReplay,
    skip,
    skipLast,
    skipWhile,
    startWith,
    switchMap,
    take,
    takeLast,
    takeWhile,
    tap,
    throttleTime,
    throwError,
    timeInterval,
    timeout,
    timer,
    timestamp,
    toArray,
    withLatestFrom,
} from 'rxjs';

/** A piece of mail travelling through the pipeline: always a letter when posted. */
export interface Mail {
    id: number;
    stamped?: boolean;
    /** Part index when a courier delivers the mail in several parts (0 = a, 1 = b...). */
    part?: number;
}

export const toMail = (id: number): Mail => ({ id });

export const isMail = (value: unknown): value is Mail =>
    typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'number';

/** A button press on a manual mailbox: post one mail, fail, or close the mailbox. */
export type Press = 'send' | 'error' | 'complete';

/** Mailbox (source) options: every creation operator emits numbers that are turned into mail. */
export interface CreationOption {
    name: string;
    /** Shown in the select when it differs from the name. */
    label?: string;
    code: string;
    /** Posting is driven by the Send / Error / Complete buttons (and the [s] / [e] / [c] keys). */
    manual?: boolean;
    create: (clock: SchedulerLike, presses: Observable<Press>) => Observable<number>;
}

export const CREATION_OPTIONS: CreationOption[] = [
    { name: 'interval', code: 'interval(1000)', create: (c) => interval(1000, c).pipe(map((n) => n + 1)) },
    { name: 'timer', code: 'timer(500, 1500)', create: (c) => timer(500, 1500, c).pipe(map((n) => n + 1)) },
    {
        // of() and throwError() merged: the user decides when mail is posted, fails or ends.
        name: 'manual',
        label: 'of / throwError (buttons)',
        manual: true,
        code: "new Observable(post => { let n = 0; return press$.subscribe(key => key === 's' ? post.next(++n) : key === 'e' ? post.error('lost mail') : post.complete()); })",
        create: (_, presses) =>
            new Observable<number>((post) => {
                let n = 0;
                return presses.subscribe((press) =>
                    press === 'send' ? post.next(++n) : press === 'error' ? post.error('lost mail') : post.complete(),
                );
            }),
    },
    { name: 'from', code: 'from([1, 2, 2, 3, 3, 3])', create: () => from([1, 2, 2, 3, 3, 3]) },
    { name: 'range', code: 'range(1, 10)', create: () => range(1, 10) },
    { name: 'defer', code: 'defer(() => of(Date.now() % 10))', create: () => defer(() => of((Date.now() % 10) + 1)) },
];

/** Sorting center options: one pipeable operator with a runnable preset. */
export interface SortingOperator {
    name: string;
    category: OperatorCategory;
    code: string;
    operator: (clock: SchedulerLike) => OperatorFunction<any, any>;
    /** Set on higher-order operators: their inner observables (couriers) are shown in a depot. */
    flattening?: Flattening;
}

export type OperatorCategory = 'transform' | 'filter' | 'utility' | 'combination' | 'multicasting';

export const OPERATOR_CATEGORIES: OperatorCategory[] = ['transform', 'filter', 'utility', 'combination', 'multicasting'];

/** Flattening strategy of a higher-order operator: what it does with couriers when new mail arrives. */
export type Flattening = 'merge' | 'switch' | 'concat' | 'exhaust';

type Project = (mail: Mail) => Observable<Mail>;

/**
 * Courier dispatch options: the inner observable a flattening operator creates for each letter.
 * A courier delivers the letter in parts (#1a #1b...).
 */
export interface CourierOption {
    name: string;
    /** Body of `courier = (mail) => ...`. */
    code: string;
    /** Parts a courier delivers when it goes all the way. */
    parts: number;
    create: (clock: SchedulerLike) => Project;
}

const inParts = (mail: Mail) => map((part: number): Mail => ({ ...mail, part }));

export const COURIER_OPTIONS: CourierOption[] = [
    {
        name: 'interval',
        code: 'interval(400).pipe(take(3), map(part => ({ ...mail, part })))',
        parts: 3,
        create: (c) => (mail) => interval(400, c).pipe(take(3), inParts(mail)),
    },
    {
        name: 'timer',
        code: 'timer(800).pipe(map(() => ({ ...mail, part: 0 })))',
        parts: 1,
        create: (c) => (mail) => timer(800, c).pipe(map(() => 0), inParts(mail)),
    },
    {
        name: 'of',
        code: 'of(0, 1, 2).pipe(map(part => ({ ...mail, part })))  // synchronous',
        parts: 3,
        create: () => (mail) => of(0, 1, 2).pipe(inParts(mail)),
    },
    {
        name: 'throwError',
        code: "interval(400).pipe(take(2), map(part => ({ ...mail, part })), concatWith(throwError(() => 'courier lost')))",
        parts: 3,
        create: (c) => (mail) => interval(400, c).pipe(take(2), inParts(mail), concatWith(throwError(() => 'courier lost'))),
    },
];

/** The default courier, used by flattening operators outside the postal service. */
const courier = COURIER_OPTIONS[0].create;

const FLATTEN: Record<Flattening, (project: Project) => OperatorFunction<Mail, Mail>> = {
    merge: (project) => mergeMap(project),
    switch: (project) => switchMap(project),
    concat: (project) => concatMap(project),
    exhaust: (project) => exhaustMap(project),
};

/** Applies a flattening strategy with any project function (the postal service instruments it). */
export const flatten = (kind: Flattening, project: Project): OperatorFunction<Mail, Mail> => FLATTEN[kind](project);

export const FLATTENING_HINTS: Record<Flattening, string> = {
    merge: 'every letter gets its own courier, all running at once',
    switch: 'a new letter cancels the running courier',
    concat: 'one courier at a time, letters wait in line',
    exhaust: 'letters arriving while a courier runs are turned away',
};

const flattening = (name: string, kind: Flattening): SortingOperator => ({
    name,
    category: 'transform',
    code: `${name}(mail => courier(mail))`,
    flattening: kind,
    operator: (c) => flatten(kind, courier(c)),
});

export const SORTING_OPERATORS: SortingOperator[] = [
    // transform
    { name: 'map', category: 'transform', code: 'map(mail => ({ ...mail, stamped: true }))', operator: () => map((m: Mail) => ({ ...m, stamped: true })) },
    flattening('mergeMap', 'merge'),
    flattening('switchMap', 'switch'),
    flattening('concatMap', 'concat'),
    flattening('exhaustMap', 'exhaust'),
    { name: 'scan', category: 'transform', code: 'scan((count, mail) => count + 1, 0)', operator: () => scan((count: number) => count + 1, 0) },
    { name: 'reduce', category: 'transform', code: 'reduce((count, mail) => count + 1, 0)', operator: () => reduce((count: number) => count + 1, 0) },
    { name: 'pairwise', category: 'transform', code: 'pairwise()', operator: () => pairwise() },
    { name: 'bufferCount', category: 'transform', code: 'bufferCount(3)', operator: () => bufferCount(3) },
    { name: 'bufferTime', category: 'transform', code: 'bufferTime(3000)', operator: (c) => bufferTime(3000, c) },
    // filter
    { name: 'filter', category: 'filter', code: 'filter(mail => mail.id % 2 === 0)', operator: () => filter((m: Mail) => m.id % 2 === 0) },
    { name: 'take', category: 'filter', code: 'take(3)', operator: () => take(3) },
    { name: 'takeLast', category: 'filter', code: 'takeLast(2)', operator: () => takeLast(2) },
    { name: 'takeWhile', category: 'filter', code: 'takeWhile(mail => mail.id < 5)', operator: () => takeWhile((m: Mail) => m.id < 5) },
    { name: 'skip', category: 'filter', code: 'skip(2)', operator: () => skip(2) },
    { name: 'skipLast', category: 'filter', code: 'skipLast(2)', operator: () => skipLast(2) },
    { name: 'skipWhile', category: 'filter', code: 'skipWhile(mail => mail.id < 3)', operator: () => skipWhile((m: Mail) => m.id < 3) },
    { name: 'first', category: 'filter', code: 'first(mail => mail.id > 2)', operator: () => first((m: Mail) => m.id > 2) },
    { name: 'last', category: 'filter', code: 'last()', operator: () => last() },
    { name: 'elementAt', category: 'filter', code: 'elementAt(2)', operator: () => elementAt(2) },
    { name: 'distinct', category: 'filter', code: 'distinct(mail => mail.id)', operator: () => distinct((m: Mail) => m.id) },
    { name: 'distinctUntilChanged', category: 'filter', code: 'distinctUntilChanged((a, b) => a.id === b.id)', operator: () => distinctUntilChanged((a: Mail, b: Mail) => a.id === b.id) },
    { name: 'debounceTime', category: 'filter', code: 'debounceTime(1200)', operator: (c) => debounceTime(1200, c) },
    { name: 'throttleTime', category: 'filter', code: 'throttleTime(2500)', operator: (c) => throttleTime(2500, c) },
    { name: 'auditTime', category: 'filter', code: 'auditTime(2500)', operator: (c) => auditTime(2500, c) },
    { name: 'sampleTime', category: 'filter', code: 'sampleTime(2500)', operator: (c) => sampleTime(2500, c) },
    { name: 'ignoreElements', category: 'filter', code: 'ignoreElements()', operator: () => ignoreElements() },
    // utility
    { name: 'tap', category: 'utility', code: "tap(mail => console.log('sorting', mail))", operator: () => tap((m) => console.log('sorting', m)) },
    { name: 'delay', category: 'utility', code: 'delay(2000)', operator: (c) => delay(2000, c) },
    { name: 'timeout', category: 'utility', code: 'timeout(1200)', operator: (c) => timeout(1200, c) },
    { name: 'timeInterval', category: 'utility', code: 'timeInterval()', operator: (c) => timeInterval(c) },
    { name: 'timestamp', category: 'utility', code: 'timestamp()', operator: (c) => timestamp(c) },
    { name: 'toArray', category: 'utility', code: 'toArray()', operator: () => toArray() },
    { name: 'finalize', category: 'utility', code: "finalize(() => console.log('center closed'))", operator: () => finalize(() => console.log('center closed')) },
    { name: 'repeat', category: 'utility', code: 'repeat(2)', operator: () => repeat(2) },
    { name: 'catchError', category: 'utility', code: 'catchError(() => of(returnToSender))', operator: () => catchError(() => of<Mail>({ id: 0 })) },
    { name: 'retry', category: 'utility', code: 'retry(1)', operator: () => retry(1) },
    // combination (pipeable ones)
    { name: 'startWith', category: 'combination', code: 'startWith(welcomeLetter)', operator: () => startWith<Mail>({ id: 0 }) },
    { name: 'withLatestFrom', category: 'combination', code: 'withLatestFrom(interval(700))', operator: (c) => withLatestFrom(interval(700, c)) },
    // multicasting
    { name: 'share', category: 'multicasting', code: 'share()', operator: () => share() },
    { name: 'shareReplay', category: 'multicasting', code: 'shareReplay(2)', operator: () => shareReplay(2) },
];

/** How a value is carried: a letter, a package (bundle of letters) or a mail car (bundle of bundles). */
export type MailShape = 'letter' | 'package' | 'car' | 'other';

/** What a stage or a house displays for an emitted value. */
export interface MailItem {
    shape: MailShape;
    label: string;
}

export const toItem = (value: unknown): MailItem => ({ shape: shapeOf(value), label: describe(value) });

/** timestamp() / timeInterval() results carry the mail in `value`. */
const isWrapped = (value: unknown): value is { value: unknown } =>
    typeof value === 'object' && value !== null && !Array.isArray(value) && 'value' in value;

/** 0 for a letter, 1 for an array of letters, 2+ for arrays of arrays, -1 when no mail is involved. */
function bundleDepth(value: unknown): number {
    if (isMail(value)) {
        return 0;
    }
    if (isWrapped(value)) {
        return bundleDepth(value.value);
    }
    if (Array.isArray(value)) {
        return 1 + Math.max(0, ...value.map(bundleDepth));
    }
    return -1;
}

export function shapeOf(value: unknown): MailShape {
    const depth = bundleDepth(value);
    return depth < 0 ? 'other' : depth === 0 ? 'letter' : depth === 1 ? 'package' : 'car';
}

/** Human readable label for anything a stage may emit (mail, arrays, numbers, timestamps...). */
export function describe(value: unknown): string {
    if (isMail(value)) {
        const part = value.part === undefined ? '' : String.fromCharCode(97 + value.part);
        return `#${value.id}${part}${value.stamped ? '✔' : ''}`;
    }
    if (Array.isArray(value)) {
        return `[${value.map(describe).join(' ')}]`;
    }
    if (isWrapped(value)) {
        const extra = 'interval' in value ? `+${value.interval}ms` : 'timestamp' in value ? `@${((value.timestamp as number) / 1000).toFixed(1)}s` : '';
        return `${describe(value.value)} ${extra}`.trim();
    }
    return String(value);
}
