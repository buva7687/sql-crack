import { formatRelativeTime } from '../../../src/shared/time';

/**
 * Regression guard: a non-finite timestamp used to propagate NaN through every
 * branch and render as "NaNd ago" in the workspace stats and feature menus.
 */
describe('formatRelativeTime boundary inputs', () => {
    const MINUTE = 60_000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;

    it.each([
        ['NaN', NaN],
        ['Infinity', Infinity],
        ['-Infinity', -Infinity],
    ])('returns "unknown" for %s rather than a NaN string', (_label, timestamp) => {
        const result = formatRelativeTime(timestamp as number);
        expect(result).toBe('unknown');
        expect(result).not.toMatch(/NaN/);
    });

    it('clamps future timestamps to "just now"', () => {
        expect(formatRelativeTime(Date.now() + DAY)).toBe('just now');
    });

    it('formats the standard ranges', () => {
        const now = Date.now();
        expect(formatRelativeTime(now)).toBe('just now');
        expect(formatRelativeTime(now - 5 * MINUTE)).toBe('5m ago');
        expect(formatRelativeTime(now - 3 * HOUR)).toBe('3h ago');
        expect(formatRelativeTime(now - 2 * DAY)).toBe('2d ago');
    });

    it('formats months only when requested', () => {
        const now = Date.now();
        expect(formatRelativeTime(now - 60 * DAY)).toBe('60d ago');
        expect(formatRelativeTime(now - 60 * DAY, { showMonths: true })).toBe('2mo ago');
    });

    it('handles the unix epoch without producing NaN', () => {
        expect(formatRelativeTime(0)).toMatch(/^\d+d ago$/);
    });
});
