import { COURIER_OPTIONS, CREATION_OPTIONS, SORTING_OPERATORS } from './mail-catalog';
import { COURIER_GUIDES, CREATION_GUIDES, OPERATOR_GUIDES, OperatorGuide } from './operator-guide';

const complete = (guide: OperatorGuide | undefined) =>
    !!guide && guide.about.length > 0 && guide.scenario.length > 0 && guide.docs.every((d) => d.url.startsWith('https://rxjs.dev/'));

describe('operator guides', () => {
    it('explains every mailbox creation operator', () => {
        expect(CREATION_OPTIONS.filter((o) => !complete(CREATION_GUIDES[o.name])).map((o) => o.name)).toEqual([]);
    });

    it('explains every courier creation', () => {
        expect(COURIER_OPTIONS.filter((o) => !complete(COURIER_GUIDES[o.name])).map((o) => o.name)).toEqual([]);
    });

    it('explains every sorting operator', () => {
        expect(SORTING_OPERATORS.filter((o) => !complete(OPERATOR_GUIDES[o.name])).map((o) => o.name)).toEqual([]);
    });
});
