import { buildDetailedWorkspaceStats, buildIndexStatus } from '../../../../src/workspace/panel/workspaceStats';

describe('buildDetailedWorkspaceStats', () => {
    const baseStats = {
        totalFiles: 5,
        totalTables: 3,
        totalViews: 2,
        totalReferences: 8,
        orphanedDefinitions: [] as string[],
        missingDefinitions: [] as string[],
        circularDependencies: [] as string[],
        parseErrors: 0,
    };

    it('returns base stats with empty details when index is null', () => {
        const graph = { stats: baseStats } as any;
        const result = buildDetailedWorkspaceStats(graph, null);

        expect(result.orphanedDetails).toEqual([]);
        expect(result.missingDetails).toEqual([]);
        expect(result.parseErrorDetails).toEqual([]);
        expect(result.totalFiles).toBe(baseStats.totalFiles);
    });

    it('collects orphaned definition details from index', () => {
        const graph = {
            stats: {
                ...baseStats,
                orphanedDefinitions: ['public.stale_table'],
            },
        } as any;

        const index = {
            definitionMap: new Map([
                ['public.stale_table', [
                    { name: 'stale_table', schema: 'public', type: 'table', filePath: '/sql/stale.sql', lineNumber: 1 },
                ]],
            ]),
            referenceMap: new Map(),
            files: new Map(),
        } as any;

        const result = buildDetailedWorkspaceStats(graph, index);
        expect(result.orphanedDetails).toHaveLength(1);
        expect(result.orphanedDetails[0].name).toContain('stale_table');
        expect(result.orphanedDetails[0].filePath).toBe('/sql/stale.sql');
    });

    it('skips orphaned definitions not in index definitionMap', () => {
        const graph = {
            stats: {
                ...baseStats,
                orphanedDefinitions: ['missing_key'],
            },
        } as any;

        const index = {
            definitionMap: new Map(),
            referenceMap: new Map(),
            files: new Map(),
        } as any;

        const result = buildDetailedWorkspaceStats(graph, index);
        expect(result.orphanedDetails).toHaveLength(0);
    });

    it('collects missing definition details with referencing files', () => {
        const graph = {
            stats: {
                ...baseStats,
                missingDefinitions: ['external_api.events'],
            },
        } as any;

        const index = {
            definitionMap: new Map(),
            referenceMap: new Map([
                ['external_api.events', [
                    { tableName: 'events', schema: 'external_api', filePath: '/sql/queries.sql', lineNumber: 10 },
                    { tableName: 'events', schema: 'external_api', filePath: '/sql/reports.sql', lineNumber: 5 },
                ]],
            ]),
            files: new Map(),
        } as any;

        const result = buildDetailedWorkspaceStats(graph, index);
        expect(result.missingDetails).toHaveLength(1);
        expect(result.missingDetails[0].referenceCount).toBe(2);
        expect(result.missingDetails[0].referencingFiles).toHaveLength(2);
    });

    it('handles missing definition with no references in map', () => {
        const graph = {
            stats: {
                ...baseStats,
                missingDefinitions: ['unknown_table'],
            },
        } as any;

        const index = {
            definitionMap: new Map(),
            referenceMap: new Map(),
            files: new Map(),
        } as any;

        const result = buildDetailedWorkspaceStats(graph, index);
        expect(result.missingDetails).toHaveLength(1);
        expect(result.missingDetails[0].tableName).toBe('unknown_table');
        expect(result.missingDetails[0].referenceCount).toBe(0);
    });

    it('collects parse error details from files', () => {
        const graph = { stats: baseStats } as any;

        const index = {
            definitionMap: new Map(),
            referenceMap: new Map(),
            files: new Map([
                ['file1', { filePath: '/sql/broken.sql', parseError: 'Unexpected token' }],
                ['file2', { filePath: '/sql/good.sql' }],
                ['file3', { filePath: '/sql/also_broken.sql', parseError: 'Missing FROM clause' }],
            ]),
        } as any;

        const result = buildDetailedWorkspaceStats(graph, index);
        expect(result.parseErrorDetails).toHaveLength(2);
        expect(result.parseErrorDetails[0].fileName).toBe('broken.sql');
        expect(result.parseErrorDetails[0].error).toBe('Unexpected token');
        expect(result.parseErrorDetails[1].fileName).toBe('also_broken.sql');
    });

    it('collects partial-parser warning details separately from fatal file errors', () => {
        const graph = { stats: { ...baseStats, parseWarnings: 1 } } as any;
        const index = {
            definitionMap: new Map(),
            referenceMap: new Map(),
            files: new Map([
                ['partial', {
                    filePath: '/sql/partial.sql',
                    parseWarnings: ['Reference parser failed; regex fallback used: Unexpected token'],
                }],
                ['good', { filePath: '/sql/good.sql' }],
            ]),
        } as any;

        const result = buildDetailedWorkspaceStats(graph, index);

        expect(result.parseErrorDetails).toEqual([]);
        expect(result.parseWarningDetails).toEqual([{
            filePath: '/sql/partial.sql',
            fileName: 'partial.sql',
            warnings: ['Reference parser failed; regex fallback used: Unexpected token'],
        }]);
    });

    it('deduplicates referencing files for missing definitions', () => {
        const graph = {
            stats: {
                ...baseStats,
                missingDefinitions: ['shared_table'],
            },
        } as any;

        const index = {
            definitionMap: new Map(),
            referenceMap: new Map([
                ['shared_table', [
                    { tableName: 'shared_table', filePath: '/sql/a.sql', lineNumber: 1 },
                    { tableName: 'shared_table', filePath: '/sql/a.sql', lineNumber: 10 },
                    { tableName: 'shared_table', filePath: '/sql/b.sql', lineNumber: 5 },
                ]],
            ]),
            files: new Map(),
        } as any;

        const result = buildDetailedWorkspaceStats(graph, index);
        expect(result.missingDetails[0].referenceCount).toBe(3);
        expect(result.missingDetails[0].referencingFiles).toHaveLength(2);
    });
});

describe('buildIndexStatus edge cases', () => {
    it('marks index older than 1 hour as old', () => {
        const index = {
            lastUpdated: Date.now() - (2 * 60 * 60 * 1000),
            fileCount: 10,
        } as any;
        const status = buildIndexStatus(index, 0);
        expect(status.level).toBe('old');
    });

    it('marks index older than 10 minutes as stale', () => {
        const index = {
            lastUpdated: Date.now() - (15 * 60 * 1000),
            fileCount: 5,
        } as any;
        const status = buildIndexStatus(index, 0);
        expect(status.level).toBe('stale');
    });

    it('marks recent index as fresh', () => {
        const index = {
            lastUpdated: Date.now() - (30 * 1000),
            fileCount: 3,
        } as any;
        const status = buildIndexStatus(index, 0);
        expect(status.level).toBe('fresh');
    });

    it('handles singular file count in title', () => {
        const index = {
            lastUpdated: Date.now() - 1000,
            fileCount: 1,
        } as any;
        const status = buildIndexStatus(index, 0);
        expect(status.title).toContain('1 file');
        expect(status.title).not.toContain('1 files');
    });

    it('handles singular change count in title', () => {
        const index = {
            lastUpdated: Date.now() - 1000,
            fileCount: 5,
        } as any;
        const status = buildIndexStatus(index, 1);
        expect(status.title).toContain('1 file change since');
        expect(status.title).not.toContain('1 file changes');
    });

    it('handles missing fileCount gracefully', () => {
        const index = {
            lastUpdated: Date.now() - 1000,
        } as any;
        const status = buildIndexStatus(index, 0);
        expect(status.title).toContain('0 files');
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, 0])('marks invalid index timestamp %p as stale and unknown', (lastUpdated) => {
        const status = buildIndexStatus({ lastUpdated, fileCount: 4 } as any, 0);

        expect(status.level).toBe('stale');
        expect(status.text).toBe('Index age unknown');
        expect(status.title).toContain('Refresh to verify current results');
    });

    it('marks an index timestamp far ahead of the current clock as stale', () => {
        const status = buildIndexStatus({
            lastUpdated: Date.now() + (10 * 60 * 1000),
            fileCount: 2,
        } as any, 1);

        expect(status.level).toBe('stale');
        expect(status.text).toBe('Index age unknown (1 changed)');
        expect(status.title).toContain('ahead of the current clock');
    });
});
