/**
 * DOM Utility Tests
 *
 * Tests for DOM manipulation utilities.
 * Note: escapeHtml and createSvgElement require a DOM environment
 * and are tested separately or skipped in unit tests.
 */

import { truncate } from '../../../../src/webview/renderer/utils/dom';

describe('DOM Utilities', () => {
    describe('truncate', () => {
        it('returns original string if shorter than maxLen', () => {
            expect(truncate('hello', 10)).toBe('hello');
            expect(truncate('test', 4)).toBe('test');
        });

        it('returns original string if exactly maxLen', () => {
            expect(truncate('hello', 5)).toBe('hello');
        });

        it('truncates and adds ellipsis if longer than maxLen', () => {
            expect(truncate('hello world', 5)).toBe('hell…');
            expect(truncate('testing', 4)).toBe('tes…');
        });

        it('handles empty string', () => {
            expect(truncate('', 5)).toBe('');
        });

        it('handles maxLen of 1', () => {
            expect(truncate('hello', 1)).toBe('…');
        });

        it('handles maxLen of 0', () => {
            // Edge case - substring(0, -1) returns empty string
            expect(truncate('hello', 0)).toBe('…');
        });

        it('handles very long strings', () => {
            const longString = 'a'.repeat(1000);
            const result = truncate(longString, 10);
            expect(result).toHaveLength(10);
            expect(result.endsWith('…')).toBe(true);
        });

        it('handles unicode characters', () => {
            expect(truncate('héllo wörld', 6)).toBe('héllo…');
        });

        it('uses ellipsis character (…) not three dots', () => {
            const result = truncate('hello world', 8);
            expect(result).toContain('…');
            expect(result).not.toContain('...');
        });
    });
});
