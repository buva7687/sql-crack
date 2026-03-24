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

    it('embeds precomputed upstream and downstream counts in node tooltips', () => {
        const html = renderWorkspaceGraphSvg({
            graph: {
                nodes: [
                    { id: 'source', type: 'table', label: 'orders', x: 0, y: 0, width: 120, height: 50 },
                    { id: 'middle', type: 'view', label: 'daily_orders', x: 220, y: 120, width: 140, height: 50 },
                    { id: 'target', type: 'view', label: 'weekly_orders', x: 440, y: 240, width: 140, height: 50 }
                ],
                edges: [
                    {
                        id: 'edge_0',
                        source: 'source',
                        target: 'middle',
                        referenceType: 'select',
                        count: 1,
                        tables: ['orders'],
                        references: []
                    },
                    {
                        id: 'edge_1',
                        source: 'middle',
                        target: 'target',
                        referenceType: 'select',
                        count: 1,
                        tables: ['daily_orders'],
                        references: []
                    }
                ],
                stats: {
                    totalFiles: 1,
                    totalTables: 1,
                    totalViews: 2,
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

        const tooltipMatch = html.match(/data-id="middle"[\s\S]*?data-tooltip="([^"]+)"/);
        expect(tooltipMatch?.[1]).toBeDefined();

        const tooltipHtml = Buffer.from(tooltipMatch![1], 'base64').toString('utf8');
        expect(tooltipHtml).toContain('1 upstream &middot; 1 downstream');
    });
});
