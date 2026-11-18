/** What the "?" dialog of a card explains about the selected operator. */
export interface OperatorGuide {
    /** Plain explanation of what the operator does (one paragraph per entry). */
    about: string[];
    /** Official documentation pages (rxjs.dev). */
    docs: { label: string; url: string }[];
    /** Steps to try in the postal service to see the operator at work. */
    scenario: string[];
}

const api = (name: string) => ({ label: `${name} on rxjs.dev`, url: `https://rxjs.dev/api/index/function/${name}` });

const FLATTENING_ABOUT =
    'A higher-order operator: for each letter it receives, it calls a project function that returns an inner observable (a courier), subscribes to it and forwards what the courier delivers.';

const flatteningScenario = (name: string, watch: string): string[] => [
    `Pick ${name} in a sorting center: the Couriers card appears under the mailbox.`,
    'Keep "interval" as courier creation: each courier delivers its letter in 3 parts (#1a #1b #1c), 400ms apart.',
    'Use the "of / throwError (buttons)" mailbox and press S several times quickly, then slowly.',
    watch,
];

/** Mailbox (creation operators), keyed by option name. */
export const CREATION_GUIDES: Record<string, OperatorGuide> = {
    interval: {
        about: [
            'Creates an observable that emits an increasing number (0, 1, 2…) every period, forever.',
            'It never completes on its own: pair it with take, takeWhile or an unsubscribe to stop it.',
        ],
        docs: [api('interval')],
        scenario: [
            'Pick interval in the mailbox: a letter is posted every second (#1, #2, #3…).',
            'Keep the mailbox cold (Hot off), then switch a house off and on: it restarts at #1, it got a brand new run.',
            'Add a take sorting center to see the never-ending stream complete.',
        ],
    },
    timer: {
        about: [
            'timer(due) emits 0 once after a delay, then completes.',
            'timer(due, period) waits for the first delay, then emits every period, like a delayed interval.',
        ],
        docs: [api('timer')],
        scenario: [
            'Pick timer in the mailbox and press Restart: the first letter comes after 500ms, then one every 1.5s.',
            'Compare with interval: slower, and with a shorter wait before the first letter.',
        ],
    },
    manual: {
        about: [
            'new Observable(subscriber => …) is the most basic way to create an observable: you decide when to call next, error and complete.',
            'The observable contract: after error or complete, nothing else can be emitted. of() emits values then completes; throwError() errors right away.',
        ],
        docs: [
            { label: 'Observable on rxjs.dev', url: 'https://rxjs.dev/api/index/class/Observable' },
            api('of'),
            api('throwError'),
        ],
        scenario: [
            'Pick "of / throwError (buttons)" in the mailbox.',
            'Press Send (or S) to post letters one by one.',
            'Press Error (E): a torn letter travels down the roads and every house ends in error.',
            'Press Restart, then Complete (C): a complete marker closes the lanes and the mailbox refuses new mail.',
        ],
    },
    from: {
        about: [
            'Turns an array, a promise, an iterable or another observable into an observable.',
            'With an array, it emits every item synchronously, one after the other, then completes.',
        ],
        docs: [api('from')],
        scenario: [
            'Pick from in the mailbox: #1 #2 #2 #3 #3 #3 are posted at once, then the mailbox completes.',
            'Add distinct or distinctUntilChanged as a sorting center to see the duplicates removed.',
        ],
    },
    range: {
        about: ['Emits a sequence of numbers within a range (start, count), synchronously, then completes.'],
        docs: [api('range')],
        scenario: [
            'Pick range in the mailbox: #1 to #10 are posted immediately, then the mailbox completes.',
            'Add a bufferCount or toArray sorting center to bundle them into packages.',
        ],
    },
    defer: {
        about: [
            'Waits for a subscription to call a factory that creates the observable.',
            'Every subscriber gets a fresh observable, created at the moment it subscribes.',
        ],
        docs: [api('defer')],
        scenario: [
            'Pick defer in the mailbox and keep it cold (Hot off).',
            'Build a few houses and press Restart: each house may receive a different letter, the factory ran once per house.',
        ],
    },
};

/** Courier dispatch (inner observables of flattening operators), keyed by option name. */
export const COURIER_GUIDES: Record<string, OperatorGuide> = {
    interval: {
        about: [
            'The courier is the inner observable a flattening operator (mergeMap, switchMap, concatMap, exhaustMap) creates for each letter.',
            'Here interval(400) with take(3): the courier delivers the letter in 3 parts, 400ms apart, then completes.',
        ],
        docs: [api('interval'), api('take')],
        scenario: [
            'Pick a flattening operator (mergeMap…) in a sorting center, keep "interval" here.',
            'Post letters: each courier shows its parts a, b, c being sent, then turns complete.',
            'Try the same with switchMap and concatMap to see how they treat running couriers.',
        ],
    },
    timer: {
        about: [
            'The courier is the inner observable a flattening operator creates for each letter.',
            'Here timer(800): the courier waits 800ms, delivers the letter in a single part, then completes.',
        ],
        docs: [api('timer')],
        scenario: [
            'Pick switchMap in a sorting center and "timer" here.',
            'Post letters faster than every 800ms: each new letter cancels the waiting courier, nothing comes through until you pause.',
        ],
    },
    of: {
        about: [
            'The courier is the inner observable a flattening operator creates for each letter.',
            'Here of(0, 1, 2): all three parts are delivered synchronously, the courier completes instantly.',
        ],
        docs: [api('of')],
        scenario: [
            'Pick any flattening operator in a sorting center and "of" here.',
            'Post letters: every courier completes at once, so mergeMap, switchMap, concatMap and exhaustMap all behave the same.',
        ],
    },
    throwError: {
        about: [
            'The courier is the inner observable a flattening operator creates for each letter.',
            'Here the courier delivers 2 parts then fails with throwError: an inner error is forwarded and errors the whole stream.',
        ],
        docs: [api('throwError'), api('concatWith')],
        scenario: [
            'Pick mergeMap in a sorting center and "throwError" here.',
            'Post a letter: after #1a #1b the courier fails, and the error travels to every house.',
            'Add a catchError sorting center after it to recover with a returned letter (#0).',
        ],
    },
};

/** Sorting centers (pipeable operators), keyed by operator name. */
export const OPERATOR_GUIDES: Record<string, OperatorGuide> = {
    // transform
    map: {
        about: ['Applies a function to each value and emits the result.'],
        docs: [api('map')],
        scenario: ['Keep map in a sorting center: every letter that goes through gets stamped (#1✔).'],
    },
    mergeMap: {
        about: [FLATTENING_ABOUT, 'mergeMap runs every courier at the same time and merges their deliveries.'],
        docs: [api('mergeMap')],
        scenario: flatteningScenario('mergeMap', 'Several couriers run in parallel and their parts interleave (#1b #2a #1c…).'),
    },
    switchMap: {
        about: [FLATTENING_ABOUT, 'switchMap unsubscribes from the running courier as soon as a new letter arrives: only the latest one matters.'],
        docs: [api('switchMap')],
        scenario: flatteningScenario('switchMap', 'Pressing quickly cancels the running courier: only the last letter is delivered in full.'),
    },
    concatMap: {
        about: [FLATTENING_ABOUT, 'concatMap runs one courier at a time: new letters wait in line until the previous courier completes.'],
        docs: [api('concatMap')],
        scenario: flatteningScenario('concatMap', 'Letters queue up: #1a #1b #1c, then #2a #2b #2c… nothing is lost, order is kept.'),
    },
    exhaustMap: {
        about: [FLATTENING_ABOUT, 'exhaustMap ignores letters arriving while a courier is still running.'],
        docs: [api('exhaustMap')],
        scenario: flatteningScenario('exhaustMap', 'Letters posted while a courier runs are turned away: only the first one of each burst is delivered.'),
    },
    scan: {
        about: ['Applies an accumulator to each value and emits every intermediate result, like a running reduce.'],
        docs: [api('scan')],
        scenario: ['Pick scan in a sorting center: houses receive 1, 2, 3… the number of letters counted so far.'],
    },
    reduce: {
        about: ['Applies an accumulator to each value and emits only the final result, when the source completes.'],
        docs: [api('reduce')],
        scenario: [
            'Pick reduce in a sorting center with the interval mailbox: nothing is delivered, the source never completes.',
            'Switch the mailbox to range (or press Complete with the buttons mailbox): the final count arrives.',
        ],
    },
    pairwise: {
        about: ['Emits the previous and the current value together, as a pair, starting from the second value.'],
        docs: [api('pairwise')],
        scenario: ['Pick pairwise: houses receive packages [#1 #2], [#2 #3]… nothing comes for the very first letter.'],
    },
    bufferCount: {
        about: ['Collects values into an array and emits it once it holds the given number of values.'],
        docs: [api('bufferCount')],
        scenario: ['Pick bufferCount: letters are held until three are collected, then delivered as a package [#1 #2 #3].'],
    },
    bufferTime: {
        about: ['Collects values into an array and emits it at a regular time interval, even when it is empty.'],
        docs: [api('bufferTime')],
        scenario: [
            'Pick bufferTime: every 3 seconds a package with the letters posted meanwhile is delivered.',
            'With the buttons mailbox, post nothing for a while: empty packages [] still go out.',
        ],
    },
    // filter
    filter: {
        about: ['Emits only the values that pass the predicate.'],
        docs: [api('filter')],
        scenario: ['Pick filter: only the even letters (#2, #4…) reach the houses.'],
    },
    take: {
        about: ['Emits only the first n values, then completes and unsubscribes from the source.'],
        docs: [api('take')],
        scenario: ['Pick take with the interval mailbox: #1 #2 #3 are delivered, then a complete marker closes the lanes.'],
    },
    takeLast: {
        about: ['Waits for the source to complete, then emits its last n values.'],
        docs: [api('takeLast')],
        scenario: [
            'Pick takeLast with the range mailbox: only #9 and #10 are delivered, once range completes.',
            'With interval nothing ever comes through: the source never completes.',
        ],
    },
    takeWhile: {
        about: ['Emits values while the predicate is true, and completes as soon as it is false.'],
        docs: [api('takeWhile')],
        scenario: ['Pick takeWhile: #1 to #4 are delivered, #5 fails the test and the stream completes.'],
    },
    skip: {
        about: ['Ignores the first n values, then emits everything else.'],
        docs: [api('skip')],
        scenario: ['Pick skip: #1 and #2 stop at the sorting center, deliveries start at #3.'],
    },
    skipLast: {
        about: ['Delays values so it can drop the last n when the source completes.'],
        docs: [api('skipLast')],
        scenario: ['Pick skipLast: each letter is delivered only once two more have arrived; with range, #9 and #10 are never delivered.'],
    },
    skipWhile: {
        about: ['Ignores values while the predicate is true, then emits everything from the first one that fails it.'],
        docs: [api('skipWhile')],
        scenario: ['Pick skipWhile: #1 and #2 are skipped, from #3 on every letter goes through.'],
    },
    first: {
        about: ['Emits the first value (or the first one that passes the predicate), then completes. Errors if the source completes before.'],
        docs: [api('first')],
        scenario: [
            'Pick first: #3 is the first letter above 2, it is delivered and the stream completes.',
            'With the buttons mailbox, send one letter then press Complete: an EmptyError reaches the houses.',
        ],
    },
    last: {
        about: ['Waits for the source to complete and emits its last value. Errors if the source was empty.'],
        docs: [api('last')],
        scenario: ['Pick last with the range mailbox: only #10 is delivered.'],
    },
    elementAt: {
        about: ['Emits only the value at the given index (zero-based), then completes.'],
        docs: [api('elementAt')],
        scenario: ['Pick elementAt: only #3 (index 2) is delivered, then the stream completes.'],
    },
    distinct: {
        about: ['Emits only values that were never seen before, compared by the key selector.'],
        docs: [api('distinct')],
        scenario: ['Pick distinct with the from mailbox (#1 #2 #2 #3 #3 #3): houses receive #1 #2 #3.'],
    },
    distinctUntilChanged: {
        about: ['Drops a value when it is equal to the previous one; the same value can come back later.'],
        docs: [api('distinctUntilChanged')],
        scenario: [
            'Pick distinctUntilChanged with the from mailbox: consecutive duplicates are dropped, houses receive #1 #2 #3.',
        ],
    },
    debounceTime: {
        about: ['Emits a value only after a silence of the given duration; every new value restarts the wait.'],
        docs: [api('debounceTime')],
        scenario: [
            'Use the buttons mailbox and pick debounceTime.',
            'Press S rapidly: nothing is delivered until you stop for 1.2s, then only the last letter goes through.',
        ],
    },
    throttleTime: {
        about: ['Emits a value, then ignores the following ones for the given duration.'],
        docs: [api('throttleTime')],
        scenario: ['Pick throttleTime with the interval mailbox: one letter out of three goes through (#1, #4, #7…).'],
    },
    auditTime: {
        about: ['When a value arrives, waits for the given duration and then emits the most recent value.'],
        docs: [api('auditTime')],
        scenario: ['Pick auditTime with the interval mailbox: every 2.5s the latest letter is delivered (#3, #6…).'],
    },
    sampleTime: {
        about: ['Emits the most recent value at regular intervals, if a new one arrived since the last sample.'],
        docs: [api('sampleTime')],
        scenario: [
            'Pick sampleTime: every 2.5s the latest letter is delivered.',
            'With the buttons mailbox, stop posting: no sample is sent while nothing new arrives.',
        ],
    },
    ignoreElements: {
        about: ['Ignores every value and only lets the complete or error notification through.'],
        docs: [api('ignoreElements')],
        scenario: [
            'Pick ignoreElements with the buttons mailbox: sent letters never leave the sorting center.',
            'Press Complete or Error: the end marker still travels to the houses.',
        ],
    },
    // utility
    tap: {
        about: ['Runs a side effect for each notification (next, error, complete) without changing the stream.'],
        docs: [api('tap')],
        scenario: ['Pick tap and open the browser console: each letter is logged, and the houses receive them unchanged.'],
    },
    delay: {
        about: ['Shifts every value in time by the given duration.'],
        docs: [api('delay')],
        scenario: ['Pick delay: letters wait 2 seconds in the sorting center before leaving, the rhythm is unchanged.'],
    },
    timeout: {
        about: ['Errors if no value arrives within the given duration (first value and between values).'],
        docs: [api('timeout')],
        scenario: [
            'Pick timeout with the interval mailbox: letters come every 1s, under the 1.2s limit, all is fine.',
            'Switch to timer (1.5s period) or the buttons mailbox and wait: a TimeoutError reaches the houses.',
        ],
    },
    timeInterval: {
        about: ['Wraps each value with the time elapsed since the previous one: { value, interval }.'],
        docs: [api('timeInterval')],
        scenario: ['Pick timeInterval: houses receive #1 +1000ms, #2 +1000ms… try the buttons mailbox for irregular gaps.'],
    },
    timestamp: {
        about: ['Wraps each value with the time it was emitted: { value, timestamp }.'],
        docs: [api('timestamp')],
        scenario: ['Pick timestamp: houses receive #1 @1.0s, #2 @2.0s… the time each letter went through.'],
    },
    toArray: {
        about: ['Collects every value and emits them all as one array when the source completes.'],
        docs: [api('toArray')],
        scenario: [
            'Pick toArray with the range mailbox: one package [#1 … #10] is delivered.',
            'Add a second toArray after it to wrap the package into a mail car.',
        ],
    },
    finalize: {
        about: ['Runs a callback when the stream ends: on complete, on error or on unsubscribe.'],
        docs: [api('finalize')],
        scenario: ['Pick finalize, open the browser console and switch a house off: "center closed" is logged.'],
    },
    repeat: {
        about: ['Resubscribes to the source when it completes, the given number of times in total.'],
        docs: [api('repeat')],
        scenario: ['Pick repeat with the range mailbox: houses receive #1 to #10 twice, then complete.'],
    },
    catchError: {
        about: ['Catches an error and replaces the failed stream with the observable returned by the handler.'],
        docs: [api('catchError')],
        scenario: [
            'Use the buttons mailbox and pick catchError.',
            'Press Error: instead of the torn letter, the houses receive a returned letter (#0) and complete normally.',
        ],
    },
    retry: {
        about: ['Resubscribes to the source when it errors, up to the given number of times.'],
        docs: [api('retry')],
        scenario: [
            'Use the buttons mailbox and pick retry.',
            'Press Error once: the mailbox is resubscribed and you can keep sending. Press Error again: this time it reaches the houses.',
        ],
    },
    // combination
    startWith: {
        about: ['Emits the given values first, before anything from the source.'],
        docs: [api('startWith')],
        scenario: ['Pick startWith and press Restart: each house first receives a welcome letter (#0).'],
    },
    withLatestFrom: {
        about: ['Combines each value with the latest value of another observable; emits only when the source emits.'],
        docs: [api('withLatestFrom')],
        scenario: [
            'Pick withLatestFrom: each letter goes out paired with the latest tick of interval(700), like [#2 1].',
            'Letters arriving before the first tick are dropped.',
        ],
    },
    // multicasting
    share: {
        about: ['Shares one subscription to the source between every subscriber, turning a cold stream hot.'],
        docs: [api('share')],
        scenario: [
            'Keep the mailbox cold (Hot off) and build a second house: without share, each house has its own lane and its own mailbox run.',
            'Pick share: the road before the center now carries a single shared stream, the mailbox runs once for everyone.',
            'Switch a house off and on: it joins the shared run and misses the letters posted meanwhile.',
        ],
    },
    shareReplay: {
        about: ['Shares one subscription between every subscriber and replays the last n values to late ones.'],
        docs: [api('shareReplay')],
        scenario: [
            'Pick shareReplay, then build a new house a few seconds later.',
            'The new house immediately receives the last two letters before catching up with the live ones.',
        ],
    },
};
