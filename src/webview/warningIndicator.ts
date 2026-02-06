import { NodeWarning, Severity, WarningType } from './types';

const severityRank: Record<Severity, number> = {
    low: 1,
    medium: 2,
    high: 3,
};

const performanceWarningTypes = new Set<WarningType>([
    'expensive',
    'fan-out',
    'repeated-scan',
    'filter-pushdown',
    'non-sargable',
    'join-order',
    'index-suggestion',
    'dead-column',
]);

export interface WarningIndicatorState {
    count: number;
    severity: Severity;
}

export function isPerformanceWarningType(type: WarningType): boolean {
    return performanceWarningTypes.has(type);
}

export function getWarningIndicatorState(warnings?: NodeWarning[]): WarningIndicatorState | null {
    if (!warnings || warnings.length === 0) {
        return null;
    }

    const performanceWarnings = warnings.filter((warning) => isPerformanceWarningType(warning.type));
    if (performanceWarnings.length === 0) {
        return null;
    }

    const sortedBySeverity = [...performanceWarnings].sort(
        (a, b) => severityRank[b.severity] - severityRank[a.severity]
    );

    return {
        count: performanceWarnings.length,
        severity: sortedBySeverity[0].severity,
    };
}
