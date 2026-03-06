import type { ImpactReport } from '../lineage/impactAnalyzer';
import type { ImpactEntry, ImpactReportResult } from '../../shared/messages';

function toImpactEntry(entry: ImpactReport['directImpacts'][number]): ImpactEntry {
    return {
        name: entry.node.name,
        type: entry.node.type,
        reason: entry.reason,
        severity: entry.severity,
        filePath: entry.filePath,
        lineNumber: entry.lineNumber,
    };
}

export function toImpactReportResult(report: ImpactReport): ImpactReportResult {
    return {
        changeType: report.changeType,
        target: report.target,
        severity: report.severity,
        summary: report.summary,
        directImpacts: report.directImpacts.map(toImpactEntry),
        transitiveImpacts: report.transitiveImpacts.map(toImpactEntry),
        suggestions: report.suggestions,
    };
}
