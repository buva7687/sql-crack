import { renderWorkspaceGraphSvg } from '../../../../src/workspace/panel/graphSvg';

describe('workspace graphSvg edge metadata', () => {
    it('embeds edge reference samples and labels for edge drilldown UI', () => {
        const html = renderWorkspaceGraphSvg({
            graph: {
                nodes: [
                    { id: 'a', type: 'table', label: 'orders', x: 0, y: 0, width: 120, height: 50 },
                    { id: 'b', type: 'view', label: 'daily_orders', x: 220, y: 120, width: 140, height: 50 }
                ],
                edges: [
                    {
                        id: 'edge_0',
                        source: 'a',
                        target: 'b',
                        referenceType: 'select',
                        count: 2,
                        tables: ['orders'],
                        references: [
                            { filePath: '/repo/models/daily.sql', lineNumber: 21, context: 'FROM', tableName: 'orders' }
                        ]
                    }
                ],
                stats: {
                    totalFiles: 1,
                    totalTables: 1,
                    totalViews: 1,
                    totalReferences: 2,
                    orphanedDefinitions: [],
                    missingDefinitions: [],
                    circularDependencies: [],
                    parseErrors: 0
                }
            } as any,
            isDarkTheme: true,
            escapeHtml: (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        });

        expect(html).toContain('data-source-label="orders"');
        expect(html).toContain('data-target-label="daily_orders"');
        expect(html).toContain('data-reference-count="2"');
        expect(html).toContain('data-reference-samples="');
    });
});
