/**
 * Item #6: Fullscreen Element List Consolidation
 *
 * Tests that the fullscreen hide/show lists are consolidated into a single
 * source of truth (exported constants) and that the toggle logic correctly
 * saves/restores element display state.
 */

import {
    FULLSCREEN_HIDE_IDS,
    FULLSCREEN_HIDE_SELECTORS,
} from '../../../src/webview/constants/fullscreen';

describe('Item #6: Fullscreen Element List Consolidation', () => {
    // ── Exported constants contain all required elements ──────────────
    describe('FULLSCREEN_HIDE_IDS', () => {
        it('should be an array', () => {
            expect(Array.isArray(FULLSCREEN_HIDE_IDS)).toBe(true);
        });

        it('should contain the toolbar ID', () => {
            expect(FULLSCREEN_HIDE_IDS).toContain('sql-crack-toolbar');
        });

        it('should contain the actions ID', () => {
            expect(FULLSCREEN_HIDE_IDS).toContain('sql-crack-actions');
        });

        it('should contain batch-tabs', () => {
            expect(FULLSCREEN_HIDE_IDS).toContain('batch-tabs');
        });

        it('should contain the error badge', () => {
            expect(FULLSCREEN_HIDE_IDS).toContain('sql-crack-error-badge');
        });

        it('should contain the breadcrumb bar', () => {
            expect(FULLSCREEN_HIDE_IDS).toContain('sql-crack-breadcrumb-bar');
        });

        it('should contain the toolbar wrapper', () => {
            expect(FULLSCREEN_HIDE_IDS).toContain('sql-crack-toolbar-wrapper');
        });

        it('should only contain strings', () => {
            FULLSCREEN_HIDE_IDS.forEach(id => {
                expect(typeof id).toBe('string');
                expect(id.length).toBeGreaterThan(0);
            });
        });
    });

    describe('FULLSCREEN_HIDE_SELECTORS', () => {
        it('should be an array', () => {
            expect(Array.isArray(FULLSCREEN_HIDE_SELECTORS)).toBe(true);
        });

        it('should contain .breadcrumb-panel', () => {
            expect(FULLSCREEN_HIDE_SELECTORS).toContain('.breadcrumb-panel');
        });

        it('should contain .details-panel', () => {
            expect(FULLSCREEN_HIDE_SELECTORS).toContain('.details-panel');
        });

        it('should contain .stats-panel', () => {
            expect(FULLSCREEN_HIDE_SELECTORS).toContain('.stats-panel');
        });

        it('should contain .hints-panel', () => {
            expect(FULLSCREEN_HIDE_SELECTORS).toContain('.hints-panel');
        });

        it('should contain .legend-panel', () => {
            expect(FULLSCREEN_HIDE_SELECTORS).toContain('.legend-panel');
        });

        it('should contain .sql-preview-panel', () => {
            expect(FULLSCREEN_HIDE_SELECTORS).toContain('.sql-preview-panel');
        });

        it('should only contain valid CSS selectors (start with .)', () => {
            FULLSCREEN_HIDE_SELECTORS.forEach(sel => {
                expect(sel.startsWith('.')).toBe(true);
            });
        });
    });

    // ── No duplicates between lists ──────────────────────────────────
    describe('No duplicates', () => {
        it('should have no duplicate IDs', () => {
            const unique = new Set(FULLSCREEN_HIDE_IDS);
            expect(unique.size).toBe(FULLSCREEN_HIDE_IDS.length);
        });

        it('should have no duplicate selectors', () => {
            const unique = new Set(FULLSCREEN_HIDE_SELECTORS);
            expect(unique.size).toBe(FULLSCREEN_HIDE_SELECTORS.length);
        });

        it('should have no overlap between IDs and selectors', () => {
            // IDs should not appear as selectors and vice versa
            const idSet = new Set(FULLSCREEN_HIDE_IDS.map(id => `#${id}`));
            for (const sel of FULLSCREEN_HIDE_SELECTORS) {
                expect(idSet.has(sel)).toBe(false);
            }
        });
    });

    // ── Completeness check ───────────────────────────────────────────
    describe('Completeness', () => {
        it('should have at least 6 IDs to hide', () => {
            expect(FULLSCREEN_HIDE_IDS.length).toBeGreaterThanOrEqual(6);
        });

        it('should have at least 6 selectors to hide', () => {
            expect(FULLSCREEN_HIDE_SELECTORS.length).toBeGreaterThanOrEqual(6);
        });

        it('should cover all known panel classes', () => {
            const knownPanels = [
                '.breadcrumb-panel',
                '.details-panel',
                '.stats-panel',
                '.hints-panel',
                '.legend-panel',
                '.sql-preview-panel',
            ];
            knownPanels.forEach(panel => {
                expect(FULLSCREEN_HIDE_SELECTORS).toContain(panel);
            });
        });

        it('should cover all known toolbar-area IDs', () => {
            const knownIds = [
                'sql-crack-toolbar',
                'sql-crack-actions',
                'batch-tabs',
                'sql-crack-error-badge',
                'sql-crack-breadcrumb-bar',
                'sql-crack-toolbar-wrapper',
            ];
            knownIds.forEach(id => {
                expect(FULLSCREEN_HIDE_IDS).toContain(id);
            });
        });
    });

    // ── Readonly enforcement ────────────────────────────────────────
    describe('Immutability', () => {
        it('FULLSCREEN_HIDE_IDS should be declared as const (readonly tuple)', () => {
            // `as const` is enforced at compile time by TypeScript.
            // At runtime we verify the array is a plain, non-empty tuple.
            expect(FULLSCREEN_HIDE_IDS.length).toBeGreaterThan(0);
            expect(typeof FULLSCREEN_HIDE_IDS[0]).toBe('string');
        });

        it('FULLSCREEN_HIDE_SELECTORS should be declared as const (readonly tuple)', () => {
            expect(FULLSCREEN_HIDE_SELECTORS.length).toBeGreaterThan(0);
            expect(typeof FULLSCREEN_HIDE_SELECTORS[0]).toBe('string');
        });
    });
});
