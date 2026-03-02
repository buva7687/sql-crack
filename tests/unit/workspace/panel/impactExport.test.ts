import {
    buildImpactReportExportData,
    generateImpactReportMarkdown,
} from '../../../../src/workspace/panel/impactExport';

describe('workspace/panel/impactExport.ts', () => {
    describe('buildImpactReportExportData', () => {
        it('includes version and timestamp', () => {
            const report: any = {
                changeType: 'column_drop',
                target: { type: 'column', name: 'user_id' },
                severity: 'high',
                summary: {
                    totalAffected: 0,
                    tablesAffected: 0,
                    viewsAffected: 0,
                    queriesAffected: 0,
                    filesAffected: 0,
                },
                directImpacts: [],
                transitiveImpacts: [],
                suggestions: [],
            };

            const result: any = buildImpactReportExportData(report, '1.0.0');

            expect(result.version).toBe('1.0.0');
            expect(result.exportedAt).toBeDefined();
        });

        it('serializes direct impacts', () => {
            const report: any = {
                changeType: 'column_drop',
                target: { type: 'column', name: 'user_id' },
                severity: 'high',
                summary: {
                    totalAffected: 1,
                    tablesAffected: 1,
                    viewsAffected: 0,
                    queriesAffected: 0,
                    filesAffected: 1,
                },
                directImpacts: [
                    {
                        node: {
                            id: 'node-1',
                            name: 'users',
                            type: 'table',
                            filePath: '/workspace/users.sql',
                            lineNumber: 10,
                        },
                        impactType: 'direct',
                        reason: 'Column user_id is referenced',
                        filePath: '/workspace/users.sql',
                        lineNumber: 10,
                        severity: 'high',
                    },
                ],
                transitiveImpacts: [],
                suggestions: ['Consider updating dependent views'],
            };

            const result: any = buildImpactReportExportData(report, '1.0.0');

            expect(result.report.directImpacts).toHaveLength(1);
            expect(result.report.directImpacts[0].node.name).toBe('users');
            expect(result.report.directImpacts[0].reason).toBe('Column user_id is referenced');
        });

        it('serializes transitive impacts', () => {
            const report: any = {
                changeType: 'table_drop',
                target: { type: 'table', name: 'old_table' },
                severity: 'critical',
                summary: {
                    totalAffected: 2,
                    tablesAffected: 1,
                    viewsAffected: 1,
                    queriesAffected: 0,
                    filesAffected: 2,
                },
                directImpacts: [],
                transitiveImpacts: [
                    {
                        node: {
                            id: 'node-2',
                            name: 'dependent_view',
                            type: 'view',
                            filePath: '/workspace/views.sql',
                            lineNumber: 20,
                        },
                        impactType: 'transitive',
                        reason: 'View depends on dropped table',
                        filePath: '/workspace/views.sql',
                        lineNumber: 20,
                        severity: 'medium',
                    },
                ],
                suggestions: [],
            };

            const result: any = buildImpactReportExportData(report, '2.0.0');

            expect(result.report.transitiveImpacts).toHaveLength(1);
            expect(result.report.transitiveImpacts[0].node.type).toBe('view');
        });

        it('copies suggestions', () => {
            const report: any = {
                changeType: 'column_rename',
                target: { type: 'column', name: 'old_name' },
                severity: 'low',
                summary: {
                    totalAffected: 0,
                    tablesAffected: 0,
                    viewsAffected: 0,
                    queriesAffected: 0,
                    filesAffected: 0,
                },
                directImpacts: [],
                transitiveImpacts: [],
                suggestions: ['Update references', 'Add alias'],
            };

            const result: any = buildImpactReportExportData(report, '1.0.0');

            expect(result.report.suggestions).toEqual(['Update references', 'Add alias']);
        });
    });

    describe('generateImpactReportMarkdown', () => {
        const createPayload = (overrides: Record<string, unknown> = {}): Record<string, any> => ({
            version: '1.0.0',
            exportedAt: '2024-01-15T10:30:00.000Z',
            report: {
                changeType: 'column_drop',
                target: { type: 'column', name: 'user_id' },
                severity: 'high',
                summary: {
                    totalAffected: 2,
                    tablesAffected: 1,
                    viewsAffected: 1,
                    queriesAffected: 0,
                    filesAffected: 2,
                },
                directImpacts: [
                    {
                        node: { name: 'users', type: 'table' },
                        reason: 'Column is referenced',
                        filePath: '/workspace/users.sql',
                        lineNumber: 10,
                        severity: 'high',
                    },
                ],
                transitiveImpacts: [],
                suggestions: ['Update views'],
            },
            ...overrides,
        });

        it('generates markdown header', () => {
            const markdown = generateImpactReportMarkdown(createPayload());

            expect(markdown).toContain('# Impact Analysis Report');
            expect(markdown).toContain('Exported: 2024-01-15T10:30:00.000Z');
        });

        it('includes severity and change type in uppercase', () => {
            const markdown = generateImpactReportMarkdown(createPayload());

            expect(markdown).toContain('Severity: HIGH');
            expect(markdown).toContain('Change Type: COLUMN_DROP');
        });

        it('includes target information', () => {
            const markdown = generateImpactReportMarkdown(createPayload());

            expect(markdown).toContain('Target: column `user_id`');
        });

        it('includes summary counts', () => {
            const markdown = generateImpactReportMarkdown(createPayload());

            expect(markdown).toContain('Total Affected: 2');
            expect(markdown).toContain('Tables Affected: 1');
            expect(markdown).toContain('Views Affected: 1');
            expect(markdown).toContain('Files Affected: 2');
        });

        it('includes direct impacts section with details', () => {
            const markdown = generateImpactReportMarkdown(createPayload());

            expect(markdown).toContain('## Direct Impacts');
            expect(markdown).toContain('`users` (table)');
            expect(markdown).toContain('Severity: high');
            expect(markdown).toContain('Reason: Column is referenced');
            expect(markdown).toContain('/workspace/users.sql:10');
        });

        it('shows "None" for empty direct impacts', () => {
            const payload = createPayload();
            (payload.report as any).directImpacts = [];
            const markdown = generateImpactReportMarkdown(payload);

            expect(markdown).toContain('## Direct Impacts');
            expect(markdown).toContain('- None');
        });

        it('shows "None" for empty transitive impacts', () => {
            const payload = createPayload();
            (payload.report as any).transitiveImpacts = [];
            const markdown = generateImpactReportMarkdown(payload);

            expect(markdown).toContain('## Transitive Impacts');
            expect(markdown).toContain('- None');
        });

        it('shows "None" for empty suggestions', () => {
            const payload = createPayload();
            (payload.report as any).suggestions = [];
            const markdown = generateImpactReportMarkdown(payload);

            expect(markdown).toContain('## Suggestions');
            expect(markdown).toContain('- None');
        });

        it('includes suggestions list', () => {
            const markdown = generateImpactReportMarkdown(createPayload());

            expect(markdown).toContain('## Suggestions');
            expect(markdown).toContain('- Update views');
        });

        it('omits line number when zero or negative', () => {
            const payload = createPayload();
            (payload.report as any).directImpacts = [
                {
                    node: { name: 'no_line', type: 'view' },
                    reason: 'No line number',
                    filePath: '/workspace/no_line.sql',
                    lineNumber: 0,
                    severity: 'low',
                },
            ];
            const markdown = generateImpactReportMarkdown(payload);

            expect(markdown).toContain('Location: /workspace/no_line.sql');
            expect(markdown).not.toContain('/workspace/no_line.sql:0');
        });

        it('includes transitive impacts section', () => {
            const payload = createPayload();
            (payload.report as any).transitiveImpacts = [
                {
                    node: { name: 'downstream_view', type: 'view' },
                    reason: 'Indirect dependency',
                    filePath: '/workspace/downstream.sql',
                    lineNumber: 30,
                    severity: 'medium',
                },
            ];
            const markdown = generateImpactReportMarkdown(payload);

            expect(markdown).toContain('## Transitive Impacts');
            expect(markdown).toContain('`downstream_view` (view)');
            expect(markdown).toContain('Indirect dependency');
        });

        it('handles multiple direct impacts', () => {
            const payload = createPayload();
            (payload.report as any).directImpacts = [
                {
                    node: { name: 'users', type: 'table' },
                    reason: 'Direct reference',
                    filePath: '/users.sql',
                    lineNumber: 5,
                    severity: 'high',
                },
                {
                    node: { name: 'orders', type: 'table' },
                    reason: 'FK constraint',
                    filePath: '/orders.sql',
                    lineNumber: 15,
                    severity: 'medium',
                },
            ];
            const markdown = generateImpactReportMarkdown(payload);

            expect(markdown).toContain('`users` (table)');
            expect(markdown).toContain('`orders` (table)');
        });

        it('handles multiple suggestions', () => {
            const payload = createPayload();
            (payload.report as any).suggestions = ['First suggestion', 'Second suggestion', 'Third suggestion'];
            const markdown = generateImpactReportMarkdown(payload);

            expect(markdown).toContain('- First suggestion');
            expect(markdown).toContain('- Second suggestion');
            expect(markdown).toContain('- Third suggestion');
        });
    });
});
