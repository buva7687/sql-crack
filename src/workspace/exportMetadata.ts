import * as path from 'path';
import { GraphMode, SearchFilter } from './types';

export type WorkspaceExportView = 'graph' | 'lineage' | 'impact';

export interface WorkspaceLineageExportMetadata {
    centerNodeId: string;
    centerNodeName: string;
    centerNodeType: string;
    direction: 'both' | 'upstream' | 'downstream';
    depth: number;
    expandedNodeCount?: number;
    upstreamCount?: number;
    downstreamCount?: number;
}

export interface WorkspaceExportContext {
    exportedAt: string;
    view: WorkspaceExportView;
    nodeCount: number;
    edgeCount: number;
    graphMode?: GraphMode;
    searchFilter?: SearchFilter;
    scopeUri?: string;
    scopeLabel?: string;
    lineage?: WorkspaceLineageExportMetadata;
}

export interface WorkspaceExportContextInput {
    view: WorkspaceExportView;
    nodeCount: number;
    edgeCount: number;
    graphMode?: GraphMode;
    searchFilter?: SearchFilter;
    scopeUri?: string;
    exportedAt?: string;
    lineage?: WorkspaceLineageExportMetadata;
}

interface SerializedSearchFilter {
    active: boolean;
    query: string;
    nodeTypes: string[];
    useRegex: boolean;
    caseSensitive: boolean;
}

function slugifySegment(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeScopeLabel(scopeUri?: string): string | undefined {
    if (!scopeUri) {
        return undefined;
    }
    const baseName = path.basename(scopeUri);
    return baseName || undefined;
}

function serializeSearchFilter(searchFilter?: SearchFilter): SerializedSearchFilter | undefined {
    if (!searchFilter) {
        return undefined;
    }

    const query = (searchFilter.query || '').trim();
    const nodeTypes = Array.isArray(searchFilter.nodeTypes) ? [...searchFilter.nodeTypes] : [];

    return {
        active: Boolean(query || nodeTypes.length > 0 || searchFilter.useRegex || searchFilter.caseSensitive),
        query,
        nodeTypes,
        useRegex: Boolean(searchFilter.useRegex),
        caseSensitive: Boolean(searchFilter.caseSensitive),
    };
}

function formatSearchFilterSummary(searchFilter?: SerializedSearchFilter): string {
    if (!searchFilter || !searchFilter.active) {
        return 'none';
    }

    const parts: string[] = [];
    if (searchFilter.query) {
        parts.push(`query="${searchFilter.query}"`);
    }
    if (searchFilter.nodeTypes.length > 0) {
        parts.push(`types=${searchFilter.nodeTypes.join(',')}`);
    }
    if (searchFilter.useRegex) {
        parts.push('regex=true');
    }
    if (searchFilter.caseSensitive) {
        parts.push('caseSensitive=true');
    }
    return parts.length > 0 ? parts.join(', ') : 'active';
}

function formatTimestampForFilename(timestamp: string): string {
    return timestamp
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z')
        .replace('T', '-');
}

export function createWorkspaceExportContext(input: WorkspaceExportContextInput): WorkspaceExportContext {
    return {
        exportedAt: input.exportedAt || new Date().toISOString(),
        view: input.view,
        nodeCount: input.nodeCount,
        edgeCount: input.edgeCount,
        graphMode: input.graphMode,
        searchFilter: input.searchFilter,
        scopeUri: input.scopeUri,
        scopeLabel: normalizeScopeLabel(input.scopeUri),
        lineage: input.lineage,
    };
}

export function buildWorkspaceExportMetadata(context: WorkspaceExportContext): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
        view: context.view,
        exportedAt: context.exportedAt,
        counts: {
            nodes: context.nodeCount,
            edges: context.edgeCount,
        },
    };

    if (context.graphMode) {
        metadata.graphMode = context.graphMode;
    }

    if (context.scopeUri) {
        metadata.scope = {
            uri: context.scopeUri,
            label: context.scopeLabel || normalizeScopeLabel(context.scopeUri) || context.scopeUri,
        };
    }

    const searchFilter = serializeSearchFilter(context.searchFilter);
    if (searchFilter) {
        metadata.filters = searchFilter;
    }

    if (context.lineage) {
        metadata.lineage = {
            centerNodeId: context.lineage.centerNodeId,
            centerNodeName: context.lineage.centerNodeName,
            centerNodeType: context.lineage.centerNodeType,
            direction: context.lineage.direction,
            depth: context.lineage.depth,
            expandedNodeCount: context.lineage.expandedNodeCount || 0,
            upstreamCount: context.lineage.upstreamCount ?? 0,
            downstreamCount: context.lineage.downstreamCount ?? 0,
        };
    }

    return metadata;
}

export function buildWorkspaceExportMetadataLines(context: WorkspaceExportContext): string[] {
    const lines = [
        'SQL Crack Workspace Export',
        `Exported At: ${context.exportedAt}`,
        `View: ${context.view}`,
        `Nodes: ${context.nodeCount}`,
        `Edges: ${context.edgeCount}`,
    ];

    if (context.graphMode) {
        lines.push(`Graph Mode: ${context.graphMode}`);
    }

    if (context.scopeUri) {
        lines.push(`Scope: ${context.scopeUri}`);
    }

    const searchFilter = serializeSearchFilter(context.searchFilter);
    if (searchFilter) {
        lines.push(`Filters: ${formatSearchFilterSummary(searchFilter)}`);
    }

    if (context.lineage) {
        lines.push(`Lineage Root: ${context.lineage.centerNodeName} (${context.lineage.centerNodeType})`);
        lines.push(`Lineage Direction: ${context.lineage.direction}`);
        lines.push(`Lineage Depth: ${context.lineage.depth}`);
        lines.push(`Expanded Nodes: ${context.lineage.expandedNodeCount || 0}`);
        lines.push(`Upstream Count: ${context.lineage.upstreamCount ?? 0}`);
        lines.push(`Downstream Count: ${context.lineage.downstreamCount ?? 0}`);
    }

    return lines;
}

export function buildWorkspaceExportCommentBlock(context: WorkspaceExportContext, prefix: string): string {
    return buildWorkspaceExportMetadataLines(context)
        .map((line) => `${prefix} ${line}`)
        .join('\n');
}

export function buildWorkspaceSvgMetadata(
    context: WorkspaceExportContext,
    escapeHtml: (value: string) => string
): string {
    const metadata = JSON.stringify(buildWorkspaceExportMetadata(context), null, 2);
    return `    <metadata id="sql-crack-export-metadata">${escapeHtml(metadata)}</metadata>`;
}

export function buildWorkspaceExportFilename(
    baseName: string,
    extension: string,
    context?: WorkspaceExportContext
): string {
    if (!context) {
        return `${baseName}.${extension}`;
    }

    const segments: string[] = [baseName];

    if (context.view === 'graph' && context.graphMode) {
        segments.push(context.graphMode);
    }

    if (context.view === 'lineage' && context.lineage?.centerNodeName) {
        const lineageRoot = slugifySegment(context.lineage.centerNodeName);
        if (lineageRoot) {
            segments.push(lineageRoot);
        }
        segments.push(context.lineage.direction);
    }

    if (context.scopeLabel) {
        const scopeSlug = slugifySegment(context.scopeLabel);
        if (scopeSlug) {
            segments.push(scopeSlug);
        }
    }

    segments.push(formatTimestampForFilename(context.exportedAt));

    return `${segments.filter(Boolean).join('-')}.${extension}`;
}
