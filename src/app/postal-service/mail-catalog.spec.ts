import { describe as label, toItem, toMail } from './mail-catalog';

describe('mail shapes', () => {
    const m = toMail;

    it('posts every mail as a letter', () => {
        expect(toItem(m(1))).toEqual({ shape: 'letter', label: '#1' });
    });

    it('bundles letters into a package (pairwise, bufferCount, toArray...)', () => {
        expect(toItem([m(1), m(2)])).toEqual({ shape: 'package', label: '[#1 #2]' });
        expect(toItem([])).toEqual({ shape: 'package', label: '[]' });
    });

    it('bundles packages into a mail car, keeping the array notation', () => {
        expect(toItem([[m(1), m(2)], [m(3)]])).toEqual({ shape: 'car', label: '[[#1 #2] [#3]]' });
        expect(toItem([[[m(1)]]]).shape).toBe('car');
    });

    it('looks through timestamp/timeInterval wrappers', () => {
        expect(toItem({ value: [m(1)], interval: 1000 })).toEqual({ shape: 'package', label: '[#1] +1000ms' });
    });

    it('shows non-mail values (scan, reduce counts) without an icon', () => {
        expect(toItem(3)).toEqual({ shape: 'other', label: '3' });
        expect(label(m(2))).toBe('#2');
    });

    it('labels the parts a courier delivers', () => {
        expect(label({ id: 3, part: 1 })).toBe('#3b');
    });
});
