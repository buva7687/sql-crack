import { createIssuesPageHtml } from '../../../../src/workspace/panel/issuesPage';
import { DetailedWorkspaceStats } from '../../../../src/workspace/types';

function createDetailedStats(): DetailedWorkspaceStats {
    return {
        totalFiles: 1,
        totalTables: 2,
        totalViews: 0,
        totalReferences: 3,
        orphanedDefinitions: ['stale_table'],
        missingDefinitions: ['missing_table'],
        circularDependencies: [],
        parseErrors: 0,
        orphanedDetails: [
            { name: 'stale_table', type: 'table', filePath: '/repo/models/stale.sql', lineNumber: 12 },
        ],
        missingDetails: [
            {
                tableName: 'missing_table',
                references: [
                    {
                        tableName: 'missing_table',
                        referenceType: 'select',
                        filePath: '/repo/models/orders.sql',
                        lineNumber: 44,
                        context: 'FROM',
                    },
                ],
                referenceCount: 1,
                referencingFiles: ['/repo/models/orders.sql'],
            },
        ],
        parseErrorDetails: [],
    };
}

describe('issues page in-page navigation wiring', () => {
    it('renders summary cards with scroll targets and section anchors', () => {
        const html = createIssuesPageHtml({
            nonce: 'test',
            detailedStats: createDetailedStats(),
            totalIssues: 2,
            styles: '',
            script: '',
            escapeHtml: (value: string) => value,
        });

        expect(html).toContain('data-scroll-target="orphaned-definitions-section"');
        expect(html).toContain('data-scroll-target="missing-definitions-section"');
        expect(html).toContain('id="orphaned-definitions-section"');
        expect(html).toContain('id="missing-definitions-section"');
        expect(html).toContain('class="section issues-section-anchor"');
        expect(html).toContain('id="issues-back-to-top"');
        expect(html).toContain('aria-label="Back to top"');
        expect(html).toContain('class="issue-inline-action show-in-graph-btn"');
        expect(html).toContain('data-show-graph-query="stale_table"');
        expect(html).toContain('data-show-graph-query="missing_table"');
    });
});
