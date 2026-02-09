import { getWarningIndicatorState, isPerformanceWarningType } from '../../../src/webview/warningIndicator';
import { NodeWarning } from '../../../src/webview/types';

describe('warningIndicator', () => {
    it('identifies performance warning types used for inline node badges', () => {
        expect(isPerformanceWarningType('repeated-scan')).toBe(true);
        expect(isPerformanceWarningType('unused')).toBe(false);
    });

    it('returns null when node warnings are non-performance only', () => {
        const warnings: NodeWarning[] = [
            { type: 'unused', severity: 'low', message: 'Unused alias' },
        ];
        expect(getWarningIndicatorState(warnings)).toBeNull();
    });

    it('returns count and highest severity for performance warnings', () => {
        const warnings: NodeWarning[] = [
            { type: 'index-suggestion', severity: 'low', message: 'Index this column' },
            { type: 'repeated-scan', severity: 'high', message: 'Repeated scan detected' },
            { type: 'fan-out', severity: 'medium', message: 'High fan-out' },
        ];
        expect(getWarningIndicatorState(warnings)).toEqual({
            count: 3,
            severity: 'high',
        });
    });
});
