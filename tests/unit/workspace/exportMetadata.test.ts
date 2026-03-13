import {
    createWorkspaceExportContext,
    buildWorkspaceExportMetadata,
    buildWorkspaceExportMetadataLines,
    buildWorkspaceExportCommentBlock,
    buildWorkspaceSvgMetadata,
    buildWorkspaceExportFilename,
} from '../../../src/workspace/exportMetadata';

const baseInput = {
    view: 'graph' as const,
    nodeCount: 10,
    edgeCount: 15,
    exportedAt: '2026-03-13T12:00:00.000Z',
};

describe('createWorkspaceExportContext', () => {
    it('creates context with required fields', () => {
        const ctx = createWorkspaceExportContext(baseInput);
        expect(ctx.view).toBe('graph');
        expect(ctx.nodeCount).toBe(10);
        expect(ctx.edgeCount).toBe(15);
        expect(ctx.exportedAt).toBe('2026-03-13T12:00:00.000Z');
    });

    it('uses current timestamp when exportedAt is omitted', () => {
        const ctx = createWorkspaceExportContext({
            ...baseInput,
            exportedAt: undefined,
        });
        expect(ctx.exportedAt).toBeTruthy();
        expect(ctx.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('normalizes scope URI to basename', () => {
        const ctx = createWorkspaceExportContext({
            ...baseInput,
            scopeUri: '/home/user/project/sql-files',
        });
        expect(ctx.scopeLabel).toBe('sql-files');
    });

    it('passes lineage metadata through', () => {
        const ctx = createWorkspaceExportContext({
            ...baseInput,
            view: 'lineage',
            lineage: {
                centerNodeId: 'table:orders',
                centerNodeName: 'orders',
                centerNodeType: 'table',
                direction: 'both',
                depth: 3,
                upstreamCount: 2,
                downstreamCount: 5,
            },
        });
        expect(ctx.lineage!.centerNodeName).toBe('orders');
        expect(ctx.lineage!.direction).toBe('both');
    });
});

describe('buildWorkspaceExportMetadata', () => {
    it('includes counts in metadata object', () => {
        const ctx = createWorkspaceExportContext(baseInput);
        const meta = buildWorkspaceExportMetadata(ctx);
        expect(meta.counts).toEqual({ nodes: 10, edges: 15 });
    });

    it('includes graph mode when present', () => {
        const ctx = createWorkspaceExportContext({ ...baseInput, graphMode: 'dependencies' as any });
        const meta = buildWorkspaceExportMetadata(ctx);
        expect(meta.graphMode).toBe('dependencies');
    });

    it('includes scope when scopeUri is set', () => {
        const ctx = createWorkspaceExportContext({ ...baseInput, scopeUri: '/home/project' });
        const meta = buildWorkspaceExportMetadata(ctx);
        expect(meta.scope).toEqual({ uri: '/home/project', label: 'project' });
    });

    it('includes serialized search filter', () => {
        const ctx = createWorkspaceExportContext({
            ...baseInput,
            searchFilter: { query: 'orders', nodeTypes: ['table'], useRegex: false, caseSensitive: true },
        });
        const meta = buildWorkspaceExportMetadata(ctx);
        const filters = meta.filters as any;
        expect(filters.active).toBe(true);
        expect(filters.query).toBe('orders');
        expect(filters.caseSensitive).toBe(true);
    });

    it('includes lineage metadata when present', () => {
        const ctx = createWorkspaceExportContext({
            ...baseInput,
            view: 'lineage',
            lineage: {
                centerNodeId: 'table:users',
                centerNodeName: 'users',
                centerNodeType: 'table',
                direction: 'upstream',
                depth: 2,
                expandedNodeCount: 4,
                upstreamCount: 3,
                downstreamCount: 0,
            },
        });
        const meta = buildWorkspaceExportMetadata(ctx);
        const lineage = meta.lineage as any;
        expect(lineage.centerNodeName).toBe('users');
        expect(lineage.direction).toBe('upstream');
        expect(lineage.upstreamCount).toBe(3);
        expect(lineage.downstreamCount).toBe(0);
    });

    it('omits optional fields when not provided', () => {
        const ctx = createWorkspaceExportContext(baseInput);
        const meta = buildWorkspaceExportMetadata(ctx);
        expect(meta.graphMode).toBeUndefined();
        expect(meta.scope).toBeUndefined();
        expect(meta.filters).toBeUndefined();
        expect(meta.lineage).toBeUndefined();
    });
});

describe('buildWorkspaceExportMetadataLines', () => {
    it('includes header and basic fields', () => {
        const ctx = createWorkspaceExportContext(baseInput);
        const lines = buildWorkspaceExportMetadataLines(ctx);
        expect(lines[0]).toBe('SQL Crack Workspace Export');
        expect(lines).toEqual(expect.arrayContaining([
            expect.stringContaining('Nodes: 10'),
            expect.stringContaining('Edges: 15'),
        ]));
    });

    it('includes lineage lines when present', () => {
        const ctx = createWorkspaceExportContext({
            ...baseInput,
            view: 'lineage',
            lineage: {
                centerNodeId: 'table:orders',
                centerNodeName: 'orders',
                centerNodeType: 'table',
                direction: 'both',
                depth: 3,
            },
        });
        const lines = buildWorkspaceExportMetadataLines(ctx);
        expect(lines).toEqual(expect.arrayContaining([
            expect.stringContaining('Lineage Root: orders'),
            expect.stringContaining('Lineage Direction: both'),
            expect.stringContaining('Lineage Depth: 3'),
        ]));
    });

    it('includes filter summary when search filter is active', () => {
        const ctx = createWorkspaceExportContext({
            ...baseInput,
            searchFilter: { query: 'test', nodeTypes: [], useRegex: true, caseSensitive: false },
        });
        const lines = buildWorkspaceExportMetadataLines(ctx);
        const filterLine = lines.find(l => l.startsWith('Filters:'));
        expect(filterLine).toBeDefined();
        expect(filterLine).toContain('query="test"');
        expect(filterLine).toContain('regex=true');
    });
});

describe('buildWorkspaceExportCommentBlock', () => {
    it('prefixes each line with the given comment prefix', () => {
        const ctx = createWorkspaceExportContext(baseInput);
        const block = buildWorkspaceExportCommentBlock(ctx, '//');
        const lines = block.split('\n');
        expect(lines.every(l => l.startsWith('// '))).toBe(true);
    });

    it('uses -- prefix for SQL comments', () => {
        const ctx = createWorkspaceExportContext(baseInput);
        const block = buildWorkspaceExportCommentBlock(ctx, '--');
        expect(block).toContain('-- SQL Crack Workspace Export');
    });
});

describe('buildWorkspaceSvgMetadata', () => {
    it('generates metadata XML element with escaped JSON', () => {
        const escapeHtml = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const ctx = createWorkspaceExportContext(baseInput);
        const result = buildWorkspaceSvgMetadata(ctx, escapeHtml);
        expect(result).toContain('<metadata id="sql-crack-export-metadata">');
        expect(result).toContain('</metadata>');
        expect(result).toContain('"view"');
    });
});

describe('buildWorkspaceExportFilename', () => {
    it('returns simple filename without context', () => {
        expect(buildWorkspaceExportFilename('workspace', 'png')).toBe('workspace.png');
    });

    it('includes graph mode for graph views', () => {
        const ctx = createWorkspaceExportContext({ ...baseInput, graphMode: 'dependencies' as any });
        const filename = buildWorkspaceExportFilename('workspace', 'svg', ctx);
        expect(filename).toContain('dependencies');
        expect(filename.endsWith('.svg')).toBe(true);
    });

    it('includes lineage center node for lineage views', () => {
        const ctx = createWorkspaceExportContext({
            ...baseInput,
            view: 'lineage',
            lineage: {
                centerNodeId: 'table:orders',
                centerNodeName: 'orders',
                centerNodeType: 'table',
                direction: 'upstream',
                depth: 2,
            },
        });
        const filename = buildWorkspaceExportFilename('workspace', 'png', ctx);
        expect(filename).toContain('orders');
        expect(filename).toContain('upstream');
    });

    it('includes scope label slug', () => {
        const ctx = createWorkspaceExportContext({ ...baseInput, scopeUri: '/home/My Project' });
        const filename = buildWorkspaceExportFilename('workspace', 'json', ctx);
        expect(filename).toContain('my-project');
    });

    it('includes timestamp slug', () => {
        const ctx = createWorkspaceExportContext(baseInput);
        const filename = buildWorkspaceExportFilename('workspace', 'dot', ctx);
        // Timestamp should be formatted without colons/dashes
        expect(filename).toMatch(/\d{8}-\d{6}Z\.dot$/);
    });

    it('slugifies special characters in center node name', () => {
        const ctx = createWorkspaceExportContext({
            ...baseInput,
            view: 'lineage',
            lineage: {
                centerNodeId: 'table:public.user_orders',
                centerNodeName: 'public.user_orders',
                centerNodeType: 'table',
                direction: 'both',
                depth: 1,
            },
        });
        const filename = buildWorkspaceExportFilename('workspace', 'svg', ctx);
        expect(filename).toContain('public-user-orders');
    });
});
