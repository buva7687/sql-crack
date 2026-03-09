import type { ImpactReport } from '../lineage/impactAnalyzer';
import type { ImpactView } from '../ui/impactView';

export interface WorkspaceImpactRestoreState {
    hasReport: boolean;
    html: string | null;
}

export interface WorkspaceInitialRestoreState {
    impact: WorkspaceImpactRestoreState;
}

export interface BuildWorkspaceInitialRestoreStateOptions {
    currentImpactReport: ImpactReport | null;
    impactView: ImpactView;
}

export function buildWorkspaceInitialRestoreState(
    options: BuildWorkspaceInitialRestoreStateOptions
): WorkspaceInitialRestoreState {
    const { currentImpactReport, impactView } = options;

    return {
        impact: {
            hasReport: !!currentImpactReport,
            html: currentImpactReport
                ? impactView.generateImpactReport(currentImpactReport)
                : null,
        },
    };
}
