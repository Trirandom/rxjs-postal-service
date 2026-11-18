import { MailClock } from './mail-clock';
import { MailTransit, TRANSIT_MS } from './mail-transit';

describe('MailTransit', () => {
    it('sends a terminal marker that closes its lane once it has arrived', () => {
        const clock = new MailClock();
        const transit = new MailTransit(clock);
        transit.end(0, 1, 'error', 0);
        clock.advance(1);
        expect(transit.travellers().map((t) => t.end)).toEqual(['error']);
        expect(transit.isClosed(0, 1)).toBe(false);
        clock.advance(TRANSIT_MS);
        expect(transit.travellers()).toEqual([]);
        expect(transit.isClosed(0, 1)).toBe(true);
        expect(transit.isClosed(0, 2)).toBe(false);
    });

    it('reopens a lane on resubscribe, after its pending marker has arrived', () => {
        const clock = new MailClock();
        const transit = new MailTransit(clock);
        transit.end(0, null, 'complete', 0);
        transit.reopen(0, null);
        clock.advance(TRANSIT_MS + 1);
        expect(transit.isClosed(0, null)).toBe(false);
    });
});
