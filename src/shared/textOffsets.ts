/**
 * Offset lookups for large SQL text.
 *
 * Workspace extractors repeatedly ask "which line / statement is this offset
 * in?" for every definition and reference in a file. Answering that by
 * slicing and splitting the prefix is O(file size) per call, which makes a
 * whole-file pass quadratic (or worse). These helpers precompute sorted start
 * offsets once per text and answer each lookup with a binary search.
 */

/**
 * Number of entries in the ascending `starts` array that are `<= offset`.
 */
export function countStartsAtOrBefore(starts: readonly number[], offset: number): number {
    let low = 0;
    let high = starts.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (starts[middle] <= offset) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    return low;
}

/**
 * Start offsets of each segment when `text` is split on `delimiter`:
 * `[0, i1 + 1, i2 + 1, ...]` for every delimiter position `iN`.
 */
export function buildSegmentStarts(text: string, delimiter: string): number[] {
    const starts = [0];
    let index = text.indexOf(delimiter);
    while (index !== -1) {
        starts.push(index + 1);
        index = text.indexOf(delimiter, index + 1);
    }
    return starts;
}

/**
 * Per-extraction cache of line and `;`-segment starts, keyed by text.
 *
 * Results match `text.substring(0, offset).split('\n').length` and
 * `text.slice(0, offset).split(';').length - 1` for `0 <= offset`. Call
 * `clear()` when an extraction finishes so large file texts are not retained.
 */
export class TextOffsetIndex {
    private readonly lineStarts = new Map<string, number[]>();
    private readonly semicolonStarts = new Map<string, number[]>();

    /** 1-based line number containing `offset`. */
    lineNumberAt(text: string, offset: number): number {
        let starts = this.lineStarts.get(text);
        if (!starts) {
            starts = buildSegmentStarts(text, '\n');
            this.lineStarts.set(text, starts);
        }
        return Math.max(1, countStartsAtOrBefore(starts, offset));
    }

    /** Number of `;` characters before `offset` (0-based segment index). */
    semicolonSegmentAt(text: string, offset: number): number {
        let starts = this.semicolonStarts.get(text);
        if (!starts) {
            starts = buildSegmentStarts(text, ';');
            this.semicolonStarts.set(text, starts);
        }
        return Math.max(0, countStartsAtOrBefore(starts, offset) - 1);
    }

    clear(): void {
        this.lineStarts.clear();
        this.semicolonStarts.clear();
    }
}
