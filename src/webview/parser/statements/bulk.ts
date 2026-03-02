import { Parser } from 'node-sql-parser';
import type { FlowEdge, FlowNode, OptimizationHint, ParseResult, QueryStats, SqlDialect } from '../../types';
import type { ParserContext } from '../context';
import { findMatchingParen, stripSqlComments } from '../dialects/preprocessing';

type GenIdFn = (prefix: string) => string;
type ProcessSelectFn = (
    context: ParserContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[]
) => string | null;

interface TryParseBulkStatementArgs {
    context: ParserContext;
    sql: string;
    genId: GenIdFn;
    processSelect: ProcessSelectFn;
}

interface ParsedEndpoint {
    label: string;
    kind: 'table' | 'external';
}

const IDENTIFIER_PART = '[\\p{L}\\p{N}_$]+';
const QUOTED_IDENTIFIER = "(?:`[^`]+`|\"[^\"]+\"|\\[[^\\]]+\\]|'[^']+')";
const IDENTIFIER = `(?:${QUOTED_IDENTIFIER}|${IDENTIFIER_PART})`;
const QUALIFIED_IDENTIFIER = `${IDENTIFIER}(?:\\.${IDENTIFIER})*`;
const IDENTIFIER_WRAPPER_PATTERN = /[`"'\[\]]/g;

function normalizeIdentifier(raw: string): string {
    const parts = raw.split('.').map((part) => part.replace(IDENTIFIER_WRAPPER_PATTERN, '')).filter(Boolean);
    return parts[parts.length - 1] || raw.replace(IDENTIFIER_WRAPPER_PATTERN, '');
}

function cleanQuotedLiteral(raw: string): string {
    const trimmed = raw.trim();
    if ((trimmed.startsWith('\'') && trimmed.endsWith('\'')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        const inner = trimmed.slice(1, -1);
        return inner.replace(/''/g, '\'').replace(/""/g, '"');
    }
    return trimmed;
}

function upsertHint(context: ParserContext, message: string, suggestion: string): void {
    const exists = context.hints.some(hint =>
        hint.message === message
        && hint.suggestion === suggestion
        && hint.category === 'best-practice'
    );
    if (!exists) {
        context.hints.push({
            type: 'info',
            message,
            suggestion,
            category: 'best-practice',
            severity: 'low',
        });
    }
}

function trackTableUsage(context: ParserContext, tableName: string): void {
    const key = tableName.toLowerCase();
    context.tableUsageMap.set(key, (context.tableUsageMap.get(key) || 0) + 1);
}

function ensureTableNode(
    nodes: FlowNode[],
    genId: GenIdFn,
    label: string,
    options: Partial<FlowNode> = {}
): FlowNode {
    const existing = nodes.find(node => node.type === 'table' && node.label === label);
    if (existing) {
        if (options.description) {
            existing.description = options.description;
        }
        if (options.accessMode) {
            existing.accessMode = options.accessMode;
        }
        if (options.operationType) {
            existing.operationType = options.operationType;
        }
        return existing;
    }

    const node: FlowNode = {
        id: genId('table'),
        type: 'table',
        label,
        description: options.description,
        accessMode: options.accessMode,
        operationType: options.operationType,
        x: 0,
        y: 0,
        width: 180,
        height: 60,
        tableCategory: options.tableCategory || 'physical',
    };
    nodes.push(node);
    return node;
}

function createResultNode(genId: GenIdFn, label: string, description: string, details?: string[]): FlowNode {
    const width = Math.min(420, Math.max(180, label.length * 10 + 40));
    return {
        id: genId('stmt'),
        type: 'result',
        label,
        description,
        details,
        x: 0,
        y: 0,
        width,
        height: 60,
    };
}

function createFlowEdge(genId: GenIdFn, source: string, target: string, clause?: string): FlowEdge {
    return {
        id: genId('e'),
        source,
        target,
        sqlClause: clause,
        clauseType: 'flow',
    };
}

function isExternalLocation(raw: string): boolean {
    const trimmed = raw.trim();
    if (!trimmed) {
        return false;
    }

    return /^(@|s3:\/\/|gs:\/\/|abfss?:\/\/|azure:\/\/|file:\/\/|https?:\/\/|stdin\b|stdout\b|program\b|local\b|'.*'|".*")/i.test(trimmed);
}

function extractEndpoint(raw: string): ParsedEndpoint | null {
    const trimmed = raw.trim();
    if (!trimmed) {
        return null;
    }

    const quotedMatch = trimmed.match(/^('(?:''|[^'])*'|"(?:[^"]|"")*")/);
    if (quotedMatch) {
        return {
            label: cleanQuotedLiteral(quotedMatch[1]),
            kind: 'external',
        };
    }

    const stageMatch = trimmed.match(/^(@[^\s,;]+)/);
    if (stageMatch) {
        return {
            label: stageMatch[1],
            kind: 'external',
        };
    }

    const specialMatch = trimmed.match(/^(STDIN|STDOUT|PROGRAM\s+'(?:''|[^'])*'|PROGRAM\s+"(?:[^"]|"")*")/i);
    if (specialMatch) {
        return {
            label: cleanQuotedLiteral(specialMatch[1]),
            kind: 'external',
        };
    }

    const objectMatch = trimmed.match(new RegExp(`^(${QUALIFIED_IDENTIFIER})`, 'iu'));
    if (objectMatch) {
        return {
            label: normalizeIdentifier(objectMatch[1]),
            kind: isExternalLocation(objectMatch[1]) ? 'external' : 'table',
        };
    }

    return {
        label: trimmed.split(/\s+/)[0],
        kind: isExternalLocation(trimmed) ? 'external' : 'table',
    };
}

function parseSelectAst(selectSql: string, dialect: SqlDialect): any | null {
    const parser = new Parser();
    const parserDialect = dialect === 'Oracle'
        ? 'PostgreSQL'
        : dialect === 'Teradata'
            ? 'MySQL'
            : dialect;

    try {
        return parser.astify(selectSql, { database: parserDialect });
    } catch {
        return null;
    }
}

function createApproximateQuerySource(
    context: ParserContext,
    querySql: string,
    nodes: FlowNode[],
    edges: FlowEdge[],
    genId: GenIdFn
): string {
    const stripped = stripSqlComments(querySql);
    const sources = new Set<string>();
    const pattern = new RegExp(`\\b(?:FROM|JOIN)\\s+(${QUALIFIED_IDENTIFIER})`, 'giu');
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(stripped)) !== null) {
        sources.add(normalizeIdentifier(match[1]));
    }

    const resultNode = createResultNode(genId, 'SELECT', 'Approximated source query');
    nodes.push(resultNode);

    for (const source of sources) {
        trackTableUsage(context, source);
        const sourceNode = ensureTableNode(nodes, genId, source, {
            description: 'Source table',
            accessMode: 'read',
        });
        edges.push(createFlowEdge(genId, sourceNode.id, resultNode.id, 'SELECT'));
    }

    upsertHint(
        context,
        'Approximated embedded SELECT for bulk operation',
        'The bulk operation was recognized, but the embedded SELECT required a simplified source-flow approximation.'
    );

    return resultNode.id;
}

function attachQuerySource(
    context: ParserContext,
    selectSql: string,
    dialect: SqlDialect,
    nodes: FlowNode[],
    edges: FlowEdge[],
    genId: GenIdFn,
    processSelect: ProcessSelectFn
): string {
    const ast = parseSelectAst(selectSql, dialect);
    if (ast) {
        const selectStmt = Array.isArray(ast) ? ast[0] : ast;
        const previousType = context.statementType;
        context.statementType = 'select';
        const rootId = processSelect(context, selectStmt, nodes, edges);
        context.statementType = previousType;
        if (rootId) {
            return rootId;
        }
    }

    return createApproximateQuerySource(context, selectSql, nodes, edges, genId);
}

function finalizeResult(context: ParserContext, sql: string, nodes: FlowNode[], edges: FlowEdge[]): ParseResult {
    context.stats.tables = context.tableUsageMap.size;
    if (context.stats.complexityScore === 0) {
        const edgeFactor = Math.max(1, edges.length);
        context.stats.complexityScore = Math.max(2, context.stats.tables * 2 + edgeFactor);
        context.stats.complexity = context.stats.complexityScore >= 15
            ? 'Complex'
            : context.stats.complexityScore >= 5
                ? 'Moderate'
                : 'Simple';
    }

    const stats: QueryStats = { ...context.stats };

    return {
        nodes,
        edges,
        stats,
        hints: [...context.hints],
        sql,
        columnLineage: [],
        tableUsage: new Map(context.tableUsageMap),
    };
}

function parseCopyStatement(args: TryParseBulkStatementArgs, strippedSql: string): ParseResult | null {
    const { context, sql, genId, processSelect } = args;

    if (!/^COPY\b/i.test(strippedSql)) {
        return null;
    }

    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    if (/^COPY\s*\(/i.test(strippedSql)) {
        const openParen = strippedSql.indexOf('(');
        const closeParen = findMatchingParen(strippedSql, openParen);
        if (closeParen === -1) {
            return null;
        }

        const querySql = strippedSql.slice(openParen + 1, closeParen).trim();
        const remainder = strippedSql.slice(closeParen + 1).trim();
        const toMatch = remainder.match(/^TO\s+(.+)/i);
        if (!toMatch) {
            return null;
        }

        const destination = extractEndpoint(toMatch[1]);
        if (!destination) {
            return null;
        }

        const sourceRootId = attachQuerySource(context, querySql, context.dialect, nodes, edges, genId, processSelect);
        const destinationNode = ensureTableNode(nodes, genId, destination.label, {
            description: 'Export destination',
            accessMode: 'write',
        });
        const resultNode = createResultNode(
            genId,
            'COPY TO',
            `Copy query results to ${destination.label}`,
            [`Destination: ${destination.label}`]
        );

        nodes.push(resultNode);
        edges.push(createFlowEdge(genId, sourceRootId, destinationNode.id, 'COPY TO'));
        edges.push(createFlowEdge(genId, destinationNode.id, resultNode.id, 'COPY'));

        upsertHint(context, 'Parsed COPY TO bulk operation', 'COPY query export is modeled using the bulk-operation compatibility parser.');
        return finalizeResult(context, sql, nodes, edges);
    }

    const tableMatch = strippedSql.match(new RegExp(`^COPY\\s+(${QUALIFIED_IDENTIFIER})(?:\\s*\\([^)]*\\))?\\s+(FROM|TO)\\s+(.+)`, 'iu'));
    if (!tableMatch) {
        return null;
    }

    const tableName = normalizeIdentifier(tableMatch[1]);
    const direction = tableMatch[2].toUpperCase();
    const endpoint = extractEndpoint(tableMatch[3]);
    if (!endpoint) {
        return null;
    }

    const tableNode = ensureTableNode(nodes, genId, tableName, {
        description: direction === 'FROM' ? 'Copy target table' : 'Copy source table',
        accessMode: direction === 'FROM' ? 'write' : 'read',
        operationType: direction === 'FROM' ? 'INSERT' : undefined,
    });
    trackTableUsage(context, tableName);

    const endpointNode = endpoint.kind === 'external'
        ? ensureTableNode(nodes, genId, endpoint.label, {
            description: direction === 'FROM' ? 'Copy source location' : 'Copy destination',
            accessMode: direction === 'FROM' ? 'read' : 'write',
        })
        : ensureTableNode(nodes, genId, endpoint.label, {
            description: direction === 'FROM' ? 'Copy source table' : 'Copy destination table',
            accessMode: direction === 'FROM' ? 'read' : 'write',
        });

    if (endpoint.kind === 'table') {
        trackTableUsage(context, endpoint.label);
    }

    const resultNode = createResultNode(
        genId,
        `COPY ${tableName}`,
        direction === 'FROM'
            ? `Copy data from ${endpoint.label} into ${tableName}`
            : `Copy data from ${tableName} to ${endpoint.label}`,
        [`Direction: ${direction}`, `${direction === 'FROM' ? 'Source' : 'Destination'}: ${endpoint.label}`]
    );
    nodes.push(resultNode);

    if (direction === 'FROM') {
        edges.push(createFlowEdge(genId, endpointNode.id, tableNode.id, 'COPY FROM'));
        edges.push(createFlowEdge(genId, tableNode.id, resultNode.id, 'COPY'));
    } else {
        edges.push(createFlowEdge(genId, tableNode.id, endpointNode.id, 'COPY TO'));
        edges.push(createFlowEdge(genId, endpointNode.id, resultNode.id, 'COPY'));
    }

    upsertHint(context, 'Parsed COPY bulk operation', 'COPY import/export is modeled using the bulk-operation compatibility parser.');
    return finalizeResult(context, sql, nodes, edges);
}

function parseCopyIntoStatement(args: TryParseBulkStatementArgs, strippedSql: string): ParseResult | null {
    const { context, sql, genId, processSelect } = args;
    const match = strippedSql.match(/^COPY\s+INTO\s+(.+?)\s+FROM\s+([\s\S]+)$/i);
    if (!match) {
        return null;
    }

    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const target = extractEndpoint(match[1]);
    if (!target) {
        return null;
    }

    const sourceSpec = match[2].trim();
    const targetIsExternal = target.kind === 'external' || target.label.startsWith('@');

    let sourceRootId: string | null = null;
    if (sourceSpec.startsWith('(')) {
        const closeParen = findMatchingParen(sourceSpec, 0);
        if (closeParen === -1) {
            return null;
        }
        const querySql = sourceSpec.slice(1, closeParen).trim();
        sourceRootId = attachQuerySource(context, querySql, context.dialect, nodes, edges, genId, processSelect);
    } else {
        const source = extractEndpoint(sourceSpec);
        if (!source) {
            return null;
        }

        const sourceNode = ensureTableNode(nodes, genId, source.label, {
            description: source.kind === 'external' ? 'Bulk source location' : 'Bulk source table',
            accessMode: 'read',
        });
        if (source.kind === 'table') {
            trackTableUsage(context, source.label);
        }
        sourceRootId = sourceNode.id;
    }

    const targetNode = ensureTableNode(nodes, genId, target.label, {
        description: targetIsExternal ? 'Bulk export destination' : 'Bulk load target table',
        accessMode: targetIsExternal ? 'write' : 'write',
        operationType: targetIsExternal ? undefined : 'INSERT',
    });
    if (!targetIsExternal) {
        trackTableUsage(context, target.label);
    }

    const resultLabel = `COPY INTO ${target.label}`;
    const resultDescription = targetIsExternal
        ? `Unload data into ${target.label}`
        : `Load data into ${target.label}`;
    const resultNode = createResultNode(genId, resultLabel, resultDescription, [
        `Target: ${target.label}`,
        `Mode: ${targetIsExternal ? 'export' : 'load'}`,
    ]);
    nodes.push(resultNode);

    if (sourceRootId) {
        edges.push(createFlowEdge(genId, sourceRootId, targetNode.id, 'COPY INTO'));
    }
    edges.push(createFlowEdge(genId, targetNode.id, resultNode.id, 'COPY'));

    upsertHint(
        context,
        'Parsed COPY INTO bulk operation',
        'Snowflake-style COPY INTO load/unload is modeled using the bulk-operation compatibility parser.'
    );
    return finalizeResult(context, sql, nodes, edges);
}

function parseUnloadStatement(args: TryParseBulkStatementArgs, strippedSql: string): ParseResult | null {
    const { context, sql, genId, processSelect } = args;
    const match = strippedSql.match(/^UNLOAD\s*\(\s*'((?:''|[^'])*)'\s*\)\s+TO\s+('(?:''|[^'])*'|"(?:[^"]|"")*"|\S+)/i);
    if (!match) {
        return null;
    }

    const querySql = match[1].replace(/''/g, '\'');
    const destination = extractEndpoint(match[2]);
    if (!destination) {
        return null;
    }

    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const sourceRootId = attachQuerySource(context, querySql, context.dialect, nodes, edges, genId, processSelect);
    const destinationNode = ensureTableNode(nodes, genId, destination.label, {
        description: 'Unload destination',
        accessMode: 'write',
    });
    const resultNode = createResultNode(genId, 'UNLOAD', `Unload query results to ${destination.label}`, [
        `Destination: ${destination.label}`,
    ]);
    nodes.push(resultNode);

    edges.push(createFlowEdge(genId, sourceRootId, destinationNode.id, 'UNLOAD'));
    edges.push(createFlowEdge(genId, destinationNode.id, resultNode.id, 'UNLOAD'));

    upsertHint(context, 'Parsed UNLOAD bulk operation', 'Redshift UNLOAD is modeled using the bulk-operation compatibility parser.');
    return finalizeResult(context, sql, nodes, edges);
}

function parseExportDataStatement(args: TryParseBulkStatementArgs, strippedSql: string): ParseResult | null {
    const { context, sql, genId, processSelect } = args;
    if (!/^EXPORT\s+DATA\b/i.test(strippedSql)) {
        return null;
    }

    const optionsMatch = strippedSql.match(/^EXPORT\s+DATA\s+OPTIONS\s*\(([\s\S]*?)\)\s+AS\s+([\s\S]+)$/i);
    if (!optionsMatch) {
        return null;
    }

    const optionsText = optionsMatch[1];
    const querySql = optionsMatch[2].trim();
    const uriMatch = optionsText.match(/\buri\s*=\s*('(?:''|[^'])*'|"(?:[^"]|"")*")/i);
    const destination = extractEndpoint(uriMatch ? uriMatch[1] : 'export_destination');

    if (!destination) {
        return null;
    }

    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const sourceRootId = attachQuerySource(context, querySql, context.dialect, nodes, edges, genId, processSelect);
    const destinationNode = ensureTableNode(nodes, genId, destination.label, {
        description: 'Export destination',
        accessMode: 'write',
    });
    const resultNode = createResultNode(genId, 'EXPORT DATA', `Export query results to ${destination.label}`, [
        `Destination: ${destination.label}`,
    ]);
    nodes.push(resultNode);

    edges.push(createFlowEdge(genId, sourceRootId, destinationNode.id, 'EXPORT'));
    edges.push(createFlowEdge(genId, destinationNode.id, resultNode.id, 'EXPORT DATA'));

    upsertHint(context, 'Parsed EXPORT DATA bulk operation', 'BigQuery EXPORT DATA is modeled using the bulk-operation compatibility parser.');
    return finalizeResult(context, sql, nodes, edges);
}

function parseLoadDataStatement(args: TryParseBulkStatementArgs, strippedSql: string): ParseResult | null {
    const { context, sql, genId } = args;
    const match = strippedSql.match(/^LOAD\s+DATA\s+(?:LOCAL\s+)?IN(?:FILE|PATH)\s+('(?:''|[^'])*'|"(?:[^"]|"")*")\s+(?:OVERWRITE\s+)?INTO\s+TABLE\s+([^\s(]+)/i);
    if (!match) {
        return null;
    }

    const source = extractEndpoint(match[1]);
    const tableName = normalizeIdentifier(match[2]);
    if (!source) {
        return null;
    }

    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const sourceNode = ensureTableNode(nodes, genId, source.label, {
        description: 'Load source file',
        accessMode: 'read',
    });
    const targetNode = ensureTableNode(nodes, genId, tableName, {
        description: 'Load target table',
        accessMode: 'write',
        operationType: 'INSERT',
    });
    trackTableUsage(context, tableName);

    const resultNode = createResultNode(genId, `LOAD DATA ${tableName}`, `Load data from ${source.label} into ${tableName}`, [
        `Source: ${source.label}`,
    ]);
    nodes.push(resultNode);

    edges.push(createFlowEdge(genId, sourceNode.id, targetNode.id, 'LOAD DATA'));
    edges.push(createFlowEdge(genId, targetNode.id, resultNode.id, 'LOAD'));

    upsertHint(context, 'Parsed LOAD DATA bulk operation', 'LOAD DATA is modeled using the bulk-operation compatibility parser.');
    return finalizeResult(context, sql, nodes, edges);
}

function parseInsertOverwriteStatement(args: TryParseBulkStatementArgs, strippedSql: string): ParseResult | null {
    const { context, sql, genId, processSelect } = args;
    if (!/^INSERT\s+OVERWRITE\b/i.test(strippedSql)) {
        return null;
    }

    const tableMatch = strippedSql.match(/^INSERT\s+OVERWRITE\s+TABLE\s+([^\s(]+)\s+([\s\S]+)$/i);
    const directoryMatch = strippedSql.match(/^INSERT\s+OVERWRITE\s+(?:LOCAL\s+)?DIRECTORY\s+('(?:''|[^'])*'|"(?:[^"]|"")*"|\S+)\s+([\s\S]+)$/i);

    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    if (tableMatch) {
        const targetTable = normalizeIdentifier(tableMatch[1]);
        const querySql = tableMatch[2].trim();
        const sourceRootId = attachQuerySource(context, querySql, context.dialect, nodes, edges, genId, processSelect);
        const targetNode = ensureTableNode(nodes, genId, targetTable, {
            description: 'INSERT OVERWRITE target table',
            accessMode: 'write',
            operationType: 'INSERT',
        });
        trackTableUsage(context, targetTable);
        const resultNode = createResultNode(
            genId,
            `INSERT OVERWRITE ${targetTable}`,
            `Overwrite table ${targetTable} with query results`,
            [`Target: ${targetTable}`]
        );
        nodes.push(resultNode);

        edges.push(createFlowEdge(genId, sourceRootId, targetNode.id, 'INSERT OVERWRITE'));
        edges.push(createFlowEdge(genId, targetNode.id, resultNode.id, 'OVERWRITE'));

        upsertHint(context, 'Parsed INSERT OVERWRITE bulk operation', 'INSERT OVERWRITE TABLE is modeled using the bulk-operation compatibility parser.');
        return finalizeResult(context, sql, nodes, edges);
    }

    if (directoryMatch) {
        const destination = extractEndpoint(directoryMatch[1]);
        if (!destination) {
            return null;
        }

        const querySql = directoryMatch[2].trim();
        const sourceRootId = attachQuerySource(context, querySql, context.dialect, nodes, edges, genId, processSelect);
        const destinationNode = ensureTableNode(nodes, genId, destination.label, {
            description: 'INSERT OVERWRITE destination',
            accessMode: 'write',
        });
        const resultNode = createResultNode(
            genId,
            'INSERT OVERWRITE DIRECTORY',
            `Overwrite directory ${destination.label} with query results`,
            [`Destination: ${destination.label}`]
        );
        nodes.push(resultNode);

        edges.push(createFlowEdge(genId, sourceRootId, destinationNode.id, 'INSERT OVERWRITE'));
        edges.push(createFlowEdge(genId, destinationNode.id, resultNode.id, 'OVERWRITE'));

        upsertHint(context, 'Parsed INSERT OVERWRITE DIRECTORY bulk operation', 'INSERT OVERWRITE DIRECTORY is modeled using the bulk-operation compatibility parser.');
        return finalizeResult(context, sql, nodes, edges);
    }

    return null;
}

export function tryParseBulkDataStatement(args: TryParseBulkStatementArgs): ParseResult | null {
    const strippedSql = stripSqlComments(args.sql).trim();
    if (!strippedSql) {
        return null;
    }

    return parseCopyIntoStatement(args, strippedSql)
        || parseUnloadStatement(args, strippedSql)
        || parseExportDataStatement(args, strippedSql)
        || parseLoadDataStatement(args, strippedSql)
        || parseInsertOverwriteStatement(args, strippedSql)
        || parseCopyStatement(args, strippedSql);
}
