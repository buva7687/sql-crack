import {
    COLUMN_LINEAGE_BANNER_TEXT,
    shouldEnableColumnLineage,
    shouldShowTraceColumnsAction,
} from '../../../src/webview/columnLineageUx';

describe('columnLineageUx', () => {
    it('enables column lineage interactions only when flows are present', () => {
        expect(shouldEnableColumnLineage(0)).toBe(false);
        expect(shouldEnableColumnLineage(2)).toBe(true);
    });

    it('shows trace button when flows exist', () => {
        expect(shouldShowTraceColumnsAction(0)).toBe(false);
        expect(shouldShowTraceColumnsAction(1)).toBe(true);
    });

    it('uses the discoverability banner copy for active state', () => {
        expect(COLUMN_LINEAGE_BANNER_TEXT).toContain('Column Lineage active');
        expect(COLUMN_LINEAGE_BANNER_TEXT).toContain('click any column');
    });
});
