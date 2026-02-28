import { Parser } from 'node-sql-parser';
import type { FlowEdge, FlowNode, ParseResult, QueryStats, SqlDialect } from '../../types';
import type { ParserContext } from '../context';
import { findMatchingParen, maskStringsAndComments, stripSqlComments } from '../dialects/preprocessing';

type GenIdFn = (prefix: string) => string;
type ProcessSelectFn = (
    context: ParserContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[]
) => string | null;

interface TryParseCompatibleDeleteArgs {
    context: ParserContext;
    sql: string;
    genId: GenIdFn;
    processSelect: ProcessSelectFn;
    parseSql: (sql: string, dialect: SqlDialect) => ParseResult;
}

const IDENTIFIER_PART = '[\\p{L}\\p{N}_$]+';
const QUOTED_IDENTIFIER = "(?:`[^`]+`|\"[^\"]+\"|\\[[^\\]]+\\]|'[^']+')";
const IDENTIFIER = `(?:${QUOTED_IDENTIFIER}|${IDENTIFIER_PART})`;
const QUALIFIED_IDENTIFIER = `${IDENTIFIER}(?:\\.${IDENTIFIER})*`;
const IDENTIFIER_WRAPPER_PATTERN = /[`"'\[\]]/g;
const SELECT_PARSER = new Parser();

function normalizeIdentifier(raw: string): string {
    const parts = raw.split('.').map((part) => part.replace(IDENTIFIER_WRAPPER_PATTERN, '')).filter(Boolean);
    return parts[parts.length - 1] || raw.replace(IDENTIFIER_WRAPPER_PATTERN, '');
}

function createFlowEdge(genId: GenIdFn, source: string, target: string, sqlClause?: string, clauseType: FlowEdge['clauseType'] = 'flow'): FlowEdge {
    return {
        id: genId('e'),
        source,
        target,
        sqlClause,
        clauseType,
    };
}

function buildStats(context: ParserContext, edges: FlowEdge[], hasWhereClause: boolean): QueryStats {
    const tables = context.tableUsageMap.size;
    const joins = edges.filter((edge) => edge.clauseType === 'join' || edge.clauseType === 'on').length;
    const complexityScore = Math.max(3, tables * 2 + edges.length);
    const complexity: QueryStats['complexity'] = complexityScore >= 15
        ? 'Complex'
        : complexityScore >= 5
            ? 'Moderate'
            : 'Simple';

    return {
        ...context.stats,
        tables,
        joins: Math.max(context.stats.joins, joins),
        conditions: Math.max(context.stats.conditions, hasWhereClause ? 1 : 0),
        complexity,
        complexityScore,
    };
}

function splitTopLevelComma(input: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';

    for (let index = 0; index < input.length; index++) {
        const char = input[index];
        if (char === '(') {
            depth++;
            current += char;
            continue;
        }
        if (char === ')') {
            depth = Math.max(0, depth - 1);
            current += char;
            continue;
        }
        if (char === ',' && depth === 0) {
            if (current.trim()) {
                parts.push(current.trim());
            }
            current = '';
            continue;
        }
        current += char;
    }

    if (current.trim()) {
        parts.push(current.trim());
    }
    return parts;
}

function parseSelectAst(selectSql: string): any | null {
    try {
        return SELECT_PARSER.astify(selectSql, { database: 'PostgreSQL' });
    } catch {
        return null;
    }
}

function findTopLevelKeywordIndex(maskedSql: string, keyword: string, startIndex = 0): number {
    const upperKeyword = keyword.toUpperCase();
    let depth = 0;

    for (let index = startIndex; index < maskedSql.length; index++) {
        const char = maskedSql[index];
        if (char === '(') {
            depth++;
            continue;
        }
        if (char === ')') {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (depth !== 0) {
            continue;
        }

        const fragment = maskedSql.slice(index, index + upperKeyword.length);
        if (fragment.toUpperCase() !== upperKeyword) {
            continue;
        }

        const prev = index === 0 ? ' ' : maskedSql[index - 1];
        const next = index + upperKeyword.length >= maskedSql.length ? ' ' : maskedSql[index + upperKeyword.length];
        if (!/[A-Za-z0-9_]/.test(prev) && !/[A-Za-z0-9_]/.test(next)) {
            return index;
        }
    }

    return -1;
}

function extractTopLevelClause(sql: string, startKeyword: string, endKeywords: string[]): string | null {
    const masked = maskStringsAndComments(sql);
    const startIndex = findTopLevelKeywordIndex(masked, startKeyword);
    if (startIndex === -1) {
        return null;
    }

    let clauseEnd = sql.length;
    for (const endKeyword of endKeywords) {
        const endIndex = findTopLevelKeywordIndex(masked, endKeyword, startIndex + startKeyword.length);
        if (endIndex !== -1) {
            clauseEnd = Math.min(clauseEnd, endIndex);
        }
    }

    return sql.slice(startIndex + startKeyword.length, clauseEnd).trim();
}

function findTopLevelClauseRange(sql: string, startKeyword: string, endKeywords: string[]): { start: number; end: number } | null {
    const masked = maskStringsAndComments(sql);
    const start = findTopLevelKeywordIndex(masked, startKeyword);
    if (start === -1) {
        return null;
    }

    let end = sql.length;
    for (const endKeyword of endKeywords) {
        const endIndex = findTopLevelKeywordIndex(masked, endKeyword, start + startKeyword.length);
        if (endIndex !== -1) {
            end = Math.min(end, endIndex);
        }
    }

    return { start, end };
}

function extractTopLevelFromJoinTables(sql: string): string[] {
    const masked = maskStringsAndComments(sql);
    const sourceTables = new Set<string>();
    let depth = 0;

    for (let index = 0; index < masked.length; index++) {
        const char = masked[index];
        if (char === '(') {
            depth++;
            continue;
        }
        if (char === ')') {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (depth !== 0) {
            continue;
        }

        const remainder = masked.slice(index);
        const keywordMatch = remainder.match(/^(FROM|JOIN)\b/i);
        if (!keywordMatch) {
            continue;
        }

        let pos = index + keywordMatch[0].length;
        while (pos < masked.length && /\s/.test(masked[pos])) {
            pos++;
        }

        const identifierMatch = sql.slice(pos).match(new RegExp(`^(${QUALIFIED_IDENTIFIER})`, 'iu'));
        if (identifierMatch) {
            sourceTables.add(normalizeIdentifier(identifierMatch[1]));
        }

        index = pos - 1;
    }

    return Array.from(sourceTables);
}

function extractUsingSourceTables(usingClause: string): string[] {
    const masked = maskStringsAndComments(usingClause);
    const sourceTables = new Set<string>();
    let depth = 0;
    let expectSource = true;

    for (let index = 0; index < masked.length; index++) {
        const char = masked[index];

        if (char === '(') {
            if (depth === 0 && expectSource) {
                const closeParen = findMatchingParen(masked, index);
                if (closeParen !== -1) {
                    const innerSql = usingClause.slice(index + 1, closeParen).trim();
                    if (/^SELECT\b/i.test(innerSql)) {
                        for (const tableName of extractTopLevelFromJoinTables(innerSql)) {
                            sourceTables.add(tableName);
                        }
                    }
                    index = closeParen;
                    expectSource = false;
                    continue;
                }
            }
            depth++;
            continue;
        }
        if (char === ')') {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (depth !== 0) {
            continue;
        }

        if (char === ',') {
            expectSource = true;
            continue;
        }

        const remainder = masked.slice(index);
        const joinMatch = remainder.match(/^(?:INNER\s+JOIN|LEFT(?:\s+OUTER)?\s+JOIN|RIGHT(?:\s+OUTER)?\s+JOIN|FULL(?:\s+OUTER)?\s+JOIN|CROSS\s+JOIN|JOIN)\b/i);
        if (joinMatch) {
            expectSource = true;
            index += joinMatch[0].length - 1;
            continue;
        }

        if (!expectSource || /\s/.test(char)) {
            continue;
        }

        const identifierMatch = usingClause.slice(index).match(new RegExp(`^(${QUALIFIED_IDENTIFIER})`, 'iu'));
        if (identifierMatch) {
            sourceTables.add(normalizeIdentifier(identifierMatch[1]));
            index += identifierMatch[1].length - 1;
            expectSource = false;
        }
    }

    return Array.from(sourceTables);
}

function createApproximateUsingSource(context: ParserContext, usingClause: string, nodes: FlowNode[], edges: FlowEdge[], genId: GenIdFn): string | null {
    const sourceTables = extractUsingSourceTables(usingClause);
    if (sourceTables.length === 0) {
        return null;
    }

    const sourceRootId = genId('select');
    nodes.push({
        id: sourceRootId,
        type: 'select',
        label: 'USING',
        description: 'Approximated USING source flow',
        x: 0,
        y: 0,
        width: 160,
        height: 60,
    });

    for (const tableName of sourceTables) {
        context.tableUsageMap.set(tableName.toLowerCase(), (context.tableUsageMap.get(tableName.toLowerCase()) || 0) + 1);
        const tableNodeId = genId('table');
        nodes.push({
            id: tableNodeId,
            type: 'table',
            label: tableName,
            description: 'USING source table',
            accessMode: 'read',
            x: 0,
            y: 0,
            width: 160,
            height: 60,
            tableCategory: 'physical',
        });
        edges.push(createFlowEdge(genId, tableNodeId, sourceRootId, 'USING'));
    }

    context.hints.push({
        type: 'info',
        message: 'Approximated PostgreSQL DELETE ... USING sources',
        suggestion: 'The USING clause was recognized, but source flow required a simplified approximation.',
        category: 'best-practice',
        severity: 'low',
    });

    return sourceRootId;
}

interface DeleteOutputInfo {
    columns: string[];
    intoTarget?: string;
    sanitizedSql: string;
}

function extractDeleteOutputInfo(sql: string): DeleteOutputInfo | null {
    const outputRange = findTopLevelClauseRange(sql, 'OUTPUT', ['INTO', 'FROM', 'WHERE', 'OPTION']);
    if (!outputRange) {
        return null;
    }

    const outputBody = sql.slice(outputRange.start + 'OUTPUT'.length, outputRange.end).trim();
    let sanitizedEnd = outputRange.end;
    let intoTarget: string | undefined;

    const intoRange = findTopLevelClauseRange(sql, 'INTO', ['FROM', 'WHERE', 'OPTION']);
    if (intoRange && intoRange.start >= outputRange.end) {
        const intoBody = sql.slice(intoRange.start + 'INTO'.length, intoRange.end).trim();
        const intoMatch = intoBody.match(/^([^\s(]+)/);
        if (intoMatch) {
            intoTarget = normalizeIdentifier(intoMatch[1]);
        }
        sanitizedEnd = intoRange.end;
    }

    const columns = splitTopLevelComma(outputBody)
        .map((part) => part.replace(/\bDELETED\./gi, '').replace(/\bINSERTED\./gi, '').trim())
        .filter(Boolean);

    const sanitizedSql = `${sql.slice(0, outputRange.start).trimEnd()} ${sql.slice(sanitizedEnd).trimStart()}`.trim();
    return {
        columns,
        intoTarget,
        sanitizedSql,
    };
}

function annotateDeleteResult(result: ParseResult, detail: string): FlowNode | null {
    const deleteNode = result.nodes.find((node) => node.type === 'result' && node.label === 'DELETE') || null;
    if (!deleteNode) {
        return null;
    }

    deleteNode.description = deleteNode.description
        ? `${deleteNode.description} | ${detail}`
        : detail;
    deleteNode.details = [...(deleteNode.details || []), detail];
    return deleteNode;
}

function tryParseTransactSqlDeleteOutput(args: TryParseCompatibleDeleteArgs): ParseResult | null {
    const { context, sql, genId, parseSql } = args;
    if (context.dialect !== 'TransactSQL') {
        return null;
    }

    const commentStripped = stripSqlComments(sql).trim();
    if (!/^DELETE\b/i.test(commentStripped) || !/\bOUTPUT\b/i.test(commentStripped)) {
        return null;
    }

    const outputInfo = extractDeleteOutputInfo(commentStripped);
    if (!outputInfo || !outputInfo.sanitizedSql) {
        return null;
    }

    const result = parseSql(outputInfo.sanitizedSql, context.dialect);
    result.sql = sql;

    const detail = outputInfo.columns.length > 0
        ? `OUTPUT: ${outputInfo.columns.join(', ')}`
        : 'OUTPUT';
    const deleteNode = annotateDeleteResult(result, detail);

    if (deleteNode && outputInfo.intoTarget) {
        const outputNodeId = genId('table');
        result.nodes.push({
            id: outputNodeId,
            type: 'table',
            label: outputInfo.intoTarget,
            description: 'OUTPUT target table',
            accessMode: 'write',
            operationType: 'INSERT',
            x: 0,
            y: 0,
            width: 160,
            height: 60,
            tableCategory: 'physical',
        });
        result.edges.push(createFlowEdge(genId, deleteNode.id, outputNodeId, 'OUTPUT INTO'));
        result.tableUsage.set(outputInfo.intoTarget.toLowerCase(), 1);
        result.stats.tables = Math.max(result.stats.tables, result.tableUsage.size);
    }

    result.hints.unshift({
        type: 'info',
        message: 'Parsed TransactSQL DELETE ... OUTPUT via compatibility parser',
        suggestion: 'OUTPUT semantics are preserved while the statement structure is parsed from a sanitized delete form.',
        category: 'best-practice',
        severity: 'low',
    });

    return result;
}

export function tryParseCompatibleDeleteStatement(args: TryParseCompatibleDeleteArgs): ParseResult | null {
    const { context, sql, genId, processSelect } = args;
    const outputResult = tryParseTransactSqlDeleteOutput(args);
    if (outputResult) {
        return outputResult;
    }

    if (context.dialect !== 'PostgreSQL') {
        return null;
    }

    const commentStripped = stripSqlComments(sql).trim();
    if (!/^DELETE\s+FROM\b/i.test(commentStripped) || !/\bUSING\b/i.test(commentStripped)) {
        return null;
    }

    const targetMatch = commentStripped.match(new RegExp(`^DELETE\\s+FROM\\s+(${QUALIFIED_IDENTIFIER})`, 'iu'));
    if (!targetMatch) {
        return null;
    }

    const targetTable = normalizeIdentifier(targetMatch[1]);
    const usingClause = extractTopLevelClause(commentStripped, 'USING', ['WHERE', 'RETURNING']);
    if (!usingClause) {
        return null;
    }

    const whereClause = extractTopLevelClause(commentStripped, 'WHERE', ['RETURNING']);
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    let sourceRootId: string | null = null;
    const syntheticSelect = `SELECT * FROM ${usingClause}`;
    const syntheticAst = parseSelectAst(syntheticSelect);
    if (syntheticAst) {
        const previousType = context.statementType;
        context.statementType = 'select';
        sourceRootId = processSelect(context, Array.isArray(syntheticAst) ? syntheticAst[0] : syntheticAst, nodes, edges);
        context.statementType = previousType;
    } else {
        sourceRootId = createApproximateUsingSource(context, usingClause, nodes, edges, genId);
    }

    if (!sourceRootId) {
        return null;
    }

    context.tableUsageMap.set(targetTable.toLowerCase(), (context.tableUsageMap.get(targetTable.toLowerCase()) || 0) + 1);

    const targetId = genId('table');
    nodes.push({
        id: targetId,
        type: 'table',
        label: targetTable,
        description: 'Delete target table',
        accessMode: 'write',
        operationType: 'DELETE',
        x: 0,
        y: 0,
        width: 160,
        height: 60,
        tableCategory: 'physical',
    });

    const resultId = genId('stmt');
    nodes.push({
        id: resultId,
        type: 'result',
        label: 'DELETE',
        description: whereClause
            ? `PostgreSQL DELETE USING | WHERE: ${whereClause.replace(/\s+/g, ' ')}`
            : 'PostgreSQL DELETE USING',
        x: 0,
        y: 0,
        width: 220,
        height: 60,
    });

    let inboundTargetId = sourceRootId;
    if (whereClause) {
        const filterId = genId('filter');
        nodes.push({
            id: filterId,
            type: 'filter',
            label: 'WHERE',
            description: 'Delete filter condition',
            details: [whereClause.replace(/\s+/g, ' ')],
            x: 0,
            y: 0,
            width: 180,
            height: 60,
        });
        edges.push(createFlowEdge(genId, sourceRootId, filterId, 'WHERE', 'filter'));
        inboundTargetId = filterId;
    }

    edges.push(createFlowEdge(genId, inboundTargetId, targetId, 'USING'));
    edges.push(createFlowEdge(genId, targetId, resultId, 'DELETE'));

    context.hints.push({
        type: 'info',
        message: 'Parsed PostgreSQL DELETE ... USING via compatibility parser',
        suggestion: 'DELETE ... USING is structurally mapped through a compatibility parser because direct PostgreSQL AST support is incomplete.',
        category: 'best-practice',
        severity: 'low',
    });

    const stats = buildStats(context, edges, Boolean(whereClause));
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
