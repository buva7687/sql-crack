import { OptimizationHint } from './types';

export interface HintBadgeState {
    status: 'ok' | 'warning' | 'error';
    label: string;
    total: number;
    warningCount: number;
    errorCount: number;
}

const severityWeight: Record<string, number> = {
    high: 3,
    medium: 2,
    low: 1,
};

const typeWeight: Record<string, number> = {
    error: 3,
    warning: 2,
    info: 1,
};

function getHintWeight(hint: OptimizationHint): number {
    const sev = severityWeight[hint.severity || 'low'] || 0;
    const type = typeWeight[hint.type] || 0;
    return sev * 10 + type;
}

export function sortHintsByImpact(hints: OptimizationHint[]): OptimizationHint[] {
    return [...hints].sort((a, b) => getHintWeight(b) - getHintWeight(a));
}

export function getTopHints(hints: OptimizationHint[], limit = 3): OptimizationHint[] {
    return sortHintsByImpact(hints).slice(0, limit);
}

export function getHintBadgeState(hints: OptimizationHint[]): HintBadgeState {
    const total = hints.length;
    const errorCount = hints.filter(h => h.type === 'error' || h.severity === 'high').length;
    const warningCount = hints.filter(h => h.type === 'warning' || h.severity === 'medium').length;

    if (total === 0) {
        return {
            status: 'ok',
            label: '✓',
            total,
            warningCount: 0,
            errorCount: 0,
        };
    }

    if (errorCount > 0) {
        return {
            status: 'error',
            label: `${errorCount}!`,
            total,
            warningCount,
            errorCount,
        };
    }

    return {
        status: 'warning',
        label: String(total),
        total,
        warningCount,
        errorCount,
    };
}
