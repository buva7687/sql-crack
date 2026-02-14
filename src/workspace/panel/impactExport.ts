import { ImpactReport } from '../lineage/impactAnalyzer';

export function buildImpactReportExportData(
    report: ImpactReport,
    extensionVersion: string
): Record<string, unknown> {
    const serializeItems = (items: typeof report.directImpacts) => items.map(item => ({
        node: {
            id: item.node.id,
            name: item.node.name,
            type: item.node.type,
            filePath: item.node.filePath,
            lineNumber: item.node.lineNumber
        },
        impactType: item.impactType,
        reason: item.reason,
        filePath: item.filePath,
        lineNumber: item.lineNumber,
        severity: item.severity
    }));

    return {
        version: extensionVersion,
        exportedAt: new Date().toISOString(),
        report: {
            changeType: report.changeType,
            target: report.target,
            severity: report.severity,
            summary: report.summary,
            directImpacts: serializeItems(report.directImpacts),
            transitiveImpacts: serializeItems(report.transitiveImpacts),
            suggestions: report.suggestions
        }
    };
}

export function generateImpactReportMarkdown(payload: Record<string, any>): string {
    const report = payload.report as ImpactReport & {
        directImpacts: Array<{
            node: { name: string; type: string; };
            reason: string;
            filePath: string;
            lineNumber: number;
            severity: string;
        }>;
        transitiveImpacts: Array<{
            node: { name: string; type: string; };
            reason: string;
            filePath: string;
            lineNumber: number;
            severity: string;
        }>;
    };
    const lines: string[] = [];

    lines.push('# Impact Analysis Report');
    lines.push('');
    lines.push(`- Exported: ${payload.exportedAt}`);
    lines.push(`- Severity: ${report.severity.toUpperCase()}`);
    lines.push(`- Change Type: ${report.changeType.toUpperCase()}`);
    lines.push(`- Target: ${report.target.type} \`${report.target.name}\``);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`- Total Affected: ${report.summary.totalAffected}`);
    lines.push(`- Tables Affected: ${report.summary.tablesAffected}`);
    lines.push(`- Views Affected: ${report.summary.viewsAffected}`);
    lines.push(`- Queries Affected: ${report.summary.queriesAffected}`);
    lines.push(`- Files Affected: ${report.summary.filesAffected}`);
    lines.push('');

    const appendImpactSection = (
        title: string,
        items: Array<{
            node: { name: string; type: string; };
            reason: string;
            filePath: string;
            lineNumber: number;
            severity: string;
        }>
    ) => {
        lines.push(`## ${title}`);
        lines.push('');
        if (items.length === 0) {
            lines.push('- None');
            lines.push('');
            return;
        }

        for (const item of items) {
            const location = item.lineNumber > 0
                ? `${item.filePath}:${item.lineNumber}`
                : item.filePath;
            lines.push(`- \`${item.node.name}\` (${item.node.type})`);
            lines.push(`  - Severity: ${item.severity}`);
            lines.push(`  - Reason: ${item.reason}`);
            lines.push(`  - Location: ${location}`);
        }
        lines.push('');
    };

    appendImpactSection('Direct Impacts', report.directImpacts);
    appendImpactSection('Transitive Impacts', report.transitiveImpacts);

    lines.push('## Suggestions');
    lines.push('');
    if (report.suggestions.length === 0) {
        lines.push('- None');
    } else {
        for (const suggestion of report.suggestions) {
            lines.push(`- ${suggestion}`);
        }
    }
    lines.push('');

    return lines.join('\n');
}
