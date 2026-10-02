import {
    buildSegmentStarts,
    countStartsAtOrBefore,
    TextOffsetIndex,
} from '../../../src/shared/textOffsets';

describe('textOffsets', () => {
    const samples = [
        '',
        ';',
        '\n',
        'SELECT 1;\nSELECT 2;',
        ';;\n\n;a\nb;',
        'CREATE TABLE a (id INT);\r\nCREATE VIEW v AS SELECT 1;\n-- trailing',
    ];

    it('matches prefix split semantics for line numbers and statement segments', () => {
        const index = new TextOffsetIndex();
        for (const text of samples) {
            for (let offset = 0; offset <= text.length + 2; offset++) {
                expect(index.lineNumberAt(text, offset)).toBe(text.substring(0, offset).split('\n').length);
                expect(index.semicolonSegmentAt(text, offset)).toBe(text.slice(0, offset).split(';').length - 1);
            }
        }
    });

    it('builds ascending segment starts and counts starts with binary search', () => {
        const starts = buildSegmentStarts('a;bc;;d', ';');
        expect(starts).toEqual([0, 2, 5, 6]);
        expect(countStartsAtOrBefore(starts, -1)).toBe(0);
        expect(countStartsAtOrBefore(starts, 0)).toBe(1);
        expect(countStartsAtOrBefore(starts, 4)).toBe(2);
        expect(countStartsAtOrBefore(starts, 5)).toBe(3);
        expect(countStartsAtOrBefore(starts, 100)).toBe(4);
    });

    it('drops cached text on clear', () => {
        const index = new TextOffsetIndex();
        index.lineNumberAt('a\nb', 2);
        index.semicolonSegmentAt('a;b', 2);
        index.clear();
        expect((index as any).lineStarts.size).toBe(0);
        expect((index as any).semicolonStarts.size).toBe(0);
    });
});
