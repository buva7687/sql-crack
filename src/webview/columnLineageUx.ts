export const COLUMN_LINEAGE_BANNER_TEXT = 'Column Lineage active — click any column';
export const COLUMN_LINEAGE_UNAVAILABLE_BANNER_TEXT = 'Column lineage unavailable for this query — try a single SELECT or switch dialect';

export function shouldEnableColumnLineage(columnFlowCount: number): boolean {
    return columnFlowCount > 0;
}

export function shouldShowTraceColumnsAction(columnFlowCount: number): boolean {
    return shouldEnableColumnLineage(columnFlowCount);
}
