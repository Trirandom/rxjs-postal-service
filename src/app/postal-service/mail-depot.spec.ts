import { interval, map, take } from 'rxjs';
import { COURIER_OPTIONS, describe as label, Flattening, Mail, toMail } from './mail-catalog';
import { MailClock } from './mail-clock';
import { CourierDepot } from './mail-depot';
import { MailTransit } from './mail-transit';

/** Letters #1, #2, #3 reach the center at 1s, 2s, 3s; each courier delivers 3 parts, 400ms apart. */
function run(kind: Flattening, courier = COURIER_OPTIONS[0]) {
    const clock = new MailClock();
    const depot = new CourierDepot(new MailTransit(clock));
    const delivered: string[] = [];
    interval(1000, clock)
        .pipe(
            take(3),
            map((n) => toMail(n + 1)),
            depot.operator(kind, courier.create(clock), 0, (lane) => lane),
        )
        .subscribe({ next: (mail: Mail) => delivered.push(label(mail)), error: (err) => (failure = err) });
    let failure: unknown = null;
    /** Moves to the given time and returns the depot as `#id:state:parts`. */
    const at = (time: number) => {
        clock.advance(time - clock.now());
        return depot.shown().map((r) => `${r.letter.label}:${r.state}:${r.parts}`);
    };
    return { at, delivered, failure: () => failure };
}

describe('CourierDepot', () => {
    it('mergeMap runs couriers side by side', () => {
        const { at, delivered } = run('merge');
        expect(at(2100)).toEqual(['#1:running:2', '#2:running:0']);
        at(10_000);
        expect(delivered).toEqual(['#1a', '#1b', '#1c', '#2a', '#2b', '#2c', '#3a', '#3b', '#3c']);
    });

    it('switchMap cancels the running courier', () => {
        const { at, delivered } = run('switch');
        expect(at(2100)).toEqual(['#1:cancelled:2', '#2:running:0']);
        at(10_000);
        expect(delivered).toEqual(['#1a', '#1b', '#2a', '#2b', '#3a', '#3b', '#3c']);
    });

    it('concatMap makes letters wait in line', () => {
        const { at } = run('concat');
        expect(at(2100)).toEqual(['#1:running:2', '#2:queued:0']);
        expect(at(2300)).toEqual(['#1:done:3', '#2:running:0']);
    });

    it('exhaustMap turns letters away while a courier runs', () => {
        const { at, delivered } = run('exhaust');
        expect(at(2100)).toEqual(['#1:running:2', '#2:dropped:0']);
        at(10_000);
        expect(delivered).toEqual(['#1a', '#1b', '#1c', '#3a', '#3b', '#3c']);
    });
});

describe('CourierDepot with other couriers', () => {
    const courierNamed = (name: string) => COURIER_OPTIONS.find((o) => o.name === name)!;

    it('a synchronous courier (of) delivers every part at once, so concatMap never queues', () => {
        const { at, delivered } = run('concat', courierNamed('of'));
        expect(at(2100)).toEqual(['#1:done:3', '#2:done:3']);
        expect(delivered).toEqual(['#1a', '#1b', '#1c', '#2a', '#2b', '#2c']);
    });

    it('a failing courier (throwError) is lost and fails the delivery', () => {
        const { at, delivered, failure } = run('merge', courierNamed('throwError'));
        // #1 fails right after its 2nd part (1.8s): the outer stream fails before #2 is posted
        expect(at(1900)).toEqual(['#1:error:2']);
        expect(at(2100)).toEqual(['#1:error:2']);
        expect(delivered).toEqual(['#1a', '#1b']);
        expect(failure()).toBe('courier lost');
    });
});
