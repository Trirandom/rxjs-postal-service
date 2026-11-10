import { delay, interval, of } from 'rxjs';
import { MailClock } from './mail-clock';

describe('MailClock', () => {
    it('only runs timed work when virtual time advances', () => {
        const clock = new MailClock();
        const ticks: number[] = [];
        interval(1000, clock).subscribe((n) => ticks.push(n));

        clock.advance(999);
        expect(ticks).toEqual([]);
        clock.advance(1);
        expect(ticks).toEqual([0]);
        // a big jump (high speed) runs every tick that fell due, in order
        clock.advance(3000);
        expect(ticks).toEqual([0, 1, 2, 3]);
    });

    it('schedules new work relative to the current virtual time', () => {
        const clock = new MailClock();
        clock.advance(5000);
        const received: string[] = [];
        of('mail').pipe(delay(1000, clock)).subscribe((m) => received.push(m));

        clock.advance(999);
        expect(received).toEqual([]);
        clock.advance(1);
        expect(received).toEqual(['mail']);
    });

    it('scales real time by speed and freezes while paused', () => {
        vi.useFakeTimers();
        try {
            const clock = new MailClock();
            const ticks: number[] = [];
            interval(1000, clock).subscribe((n) => ticks.push(n));
            const stop = clock.start(10);

            clock.speed = 4;
            vi.advanceTimersByTime(260); // ~1040ms of mail time
            expect(ticks).toEqual([0]);

            clock.paused = true;
            vi.advanceTimersByTime(5000);
            expect(ticks).toEqual([0]);

            stop();
        } finally {
            vi.useRealTimers();
        }
    });
});
