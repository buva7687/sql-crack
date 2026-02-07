import { getHintBadgeState, getTopHints, sortHintsByImpact } from '../../../src/webview/hintsHierarchy';
import { OptimizationHint } from '../../../src/webview/types';

describe('hintsHierarchy', () => {
    it('returns green check badge state when no hints exist', () => {
        expect(getHintBadgeState([])).toEqual({
            status: 'ok',
            label: '✓',
            total: 0,
            warningCount: 0,
            errorCount: 0,
        });
    });

    it('sorts hints by severity/type impact', () => {
        const hints: OptimizationHint[] = [
            { type: 'info', message: 'FYI', severity: 'low' },
            { type: 'warning', message: 'Medium warning', severity: 'medium' },
            { type: 'warning', message: 'High warning', severity: 'high' },
        ];

        const sorted = sortHintsByImpact(hints);
        expect(sorted.map(h => h.message)).toEqual([
            'High warning',
            'Medium warning',
            'FYI',
        ]);
    });

    it('defaults to top 3 hints and reports warning/error badge state', () => {
        const hints: OptimizationHint[] = [
            { type: 'warning', message: 'A', severity: 'medium' },
            { type: 'warning', message: 'B', severity: 'high' },
            { type: 'info', message: 'C', severity: 'low' },
            { type: 'warning', message: 'D', severity: 'medium' },
        ];

        const top = getTopHints(hints, 3);
        expect(top).toHaveLength(3);
        expect(top[0].message).toBe('B');

        expect(getHintBadgeState(hints)).toMatchObject({
            status: 'error',
            label: '1!',
            total: 4,
        });
    });
});
