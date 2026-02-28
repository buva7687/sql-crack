import { Parser } from 'node-sql-parser';
import type { FlowEdge, FlowNode, ParseResult, QueryStats, SqlDialect } from '../../types';
import type { ParserContext } from '../context';
import {
    findMatchingParen,
    maskStringsAndComments,
    preprocessOracleSyntax,
    stripSqlComments
} from '../dialects/preprocessing';

type GenIdFn = (prefix: string) => string;
type ProcessSelectFn = (
    context: ParserContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[]
) => string | null;

interface TryParseCompatibleOracleInsertArgs {
    context: ParserContext;
    sql: string;
    genId: GenIdFn;
    processSelect: ProcessSelectFn;
}

interface OracleInsertTarget {
    tableName: string;
    columns: string[];
}

interface OracleInsertBranch {
    condition?: string;
    elseBranch?: boolean;
    targets: OracleInsertTarget[];
}

const SELECT_PARSER = new Parser();
const IDENTIFIER_PART = '[\\p{L}\\p{N}_$]+';
const QUOTED_IDENTIFIER = "(?:`[^`]+`|\"[^\"]+\"|\\[[^\\]]+\\]|'[^']+')";
const IDENTIFIER = `(?:${QUOTED_IDENTIFIER}|${IDENTIFIER_PART})`;
const QUALIFIED_IDENTIFIER = `${IDENTIFIER}(?:\\.${IDENTIFIER})*`;
const IDENTIFIER_WRAPPER_PATTERN = /[`"'\[\]]/g;

function normalizeIdentifier(raw: string): string {
    const parts = raw.split('.').map((part) => part.replace(IDENTIFIER_WRAPPER_PATTERN, '').trim()).filter(Boolean);
    return parts[parts.length - 1] || raw.replace(IDENTIFIER_WRAPPER_PATTERN, '');
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
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

function isKeywordBoundary(char: string | undefined): boolean {
    return !char || !/[A-Za-z0-9_]/.test(char);
}

function matchTopLevelKeyword(maskedSql: string, keyword: string, startIndex = 0): number {
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

        const fragment = maskedSql.slice(index, index + keyword.length);
        if (fragment.toUpperCase() !== keyword) {
            continue;
        }

        if (isKeywordBoundary(maskedSql[index - 1]) && isKeywordBoundary(maskedSql[index + keyword.length])) {
            return index;
        }
    }

    return -1;
}

function findNextTopLevelKeyword(maskedSql: string, startIndex: number, keywords: string[]): { keyword: string; index: number } | null {
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

        for (const keyword of keywords) {
            const fragment = maskedSql.slice(index, index + keyword.length);
            if (fragment.toUpperCase() !== keyword) {
                continue;
            }
            if (isKeywordBoundary(maskedSql[index - 1]) && isKeywordBoundary(maskedSql[index + keyword.length])) {
                return { keyword, index };
            }
        }
    }

    return null;
}

function findQueryStart(sql: string, startIndex: number): number {
    const masked = maskStringsAndComments(sql);
    const queryKeyword = findNextTopLevelKeyword(masked, startIndex, ['WITH', 'SELECT']);
    return queryKeyword?.index ?? -1;
}

function parseSelectAst(querySql: string): any | null {
    const candidates = [querySql];
    const preprocessed = preprocessOracleSyntax(querySql, 'Oracle');
    if (preprocessed && preprocessed !== querySql) {
        candidates.push(preprocessed);
    }

    for (const candidate of candidates) {
        try {
            const ast = SELECT_PARSER.astify(candidate, { database: 'PostgreSQL' });
            return Array.isArray(ast) ? ast[0] : ast;
        } catch {
            continue;
        }
    }

    return null;
}

function extractTopLevelSourceTables(sql: string): string[] {
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
            index = pos + identifierMatch[1].length - 1;
        }
    }

    return Array.from(sourceTables);
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

function createApproximateSourceFlow(
    context: ParserContext,
    querySql: string,
    nodes: FlowNode[],
    edges: FlowEdge[],
    genId: GenIdFn
): string | null {
    const sourceTables = extractTopLevelSourceTables(querySql);
    if (sourceTables.length === 0) {
        return null;
    }

    const sourceRootId = genId('select');
    nodes.push({
        id: sourceRootId,
        type: 'select',
        label: 'SELECT',
        description: 'Approximated Oracle multi-insert source flow',
        x: 0,
        y: 0,
        width: 180,
        height: 60,
    });

    for (const tableName of sourceTables) {
        context.tableUsageMap.set(tableName.toLowerCase(), (context.tableUsageMap.get(tableName.toLowerCase()) || 0) + 1);
        const tableId = genId('table');
        nodes.push({
            id: tableId,
            type: 'table',
            label: tableName,
            description: 'Multi-insert source table',
            accessMode: 'read',
            x: 0,
            y: 0,
            width: 160,
            height: 60,
            tableCategory: 'physical',
        });
        edges.push(createFlowEdge(genId, tableId, sourceRootId, 'SELECT'));
    }

    context.hints.push({
        type: 'info',
        message: 'Approximated Oracle multi-insert source flow',
        suggestion: 'The trailing SELECT was recognized, but source flow required a simplified approximation.',
        category: 'best-practice',
        severity: 'low',
    });

    return sourceRootId;
}

function parseIntoClause(clauseSql: string): OracleInsertTarget | null {
    const targetMatch = clauseSql.match(new RegExp(`^(${QUALIFIED_IDENTIFIER})`, 'iu'));
    if (!targetMatch) {
        return null;
    }

    const tableName = normalizeIdentifier(targetMatch[1]);
    let columns: string[] = [];
    let pos = targetMatch[1].length;

    while (pos < clauseSql.length && /\s/.test(clauseSql[pos])) {
        pos++;
    }

    if (clauseSql[pos] === '(') {
        const closeParen = findMatchingParen(clauseSql, pos);
        if (closeParen !== -1) {
            columns = splitTopLevelComma(clauseSql.slice(pos + 1, closeParen))
                .map((column) => normalizeIdentifier(column))
                .filter(Boolean);
        }
    }

    return { tableName, columns };
}

function parseBranches(branchSql: string): OracleInsertBranch[] {
    const masked = maskStringsAndComments(branchSql);
    const branches: OracleInsertBranch[] = [];
    let current: OracleInsertBranch = { targets: [] };
    let index = 0;

    while (index < masked.length) {
        if (/\s/.test(masked[index])) {
            index++;
            continue;
        }

        const nextKeyword = findNextTopLevelKeyword(masked, index, ['WHEN', 'ELSE', 'INTO']);
        if (!nextKeyword || nextKeyword.index !== index) {
            index++;
            continue;
        }

        if (nextKeyword.keyword === 'WHEN') {
            if (current.targets.length > 0 || current.condition || current.elseBranch) {
                branches.push(current);
            }

            const thenIndex = matchTopLevelKeyword(masked, 'THEN', index + 'WHEN'.length);
            if (thenIndex === -1) {
                return [];
            }

            current = {
                condition: normalizeWhitespace(branchSql.slice(index + 'WHEN'.length, thenIndex)),
                targets: [],
            };
            index = thenIndex + 'THEN'.length;
            continue;
        }

        if (nextKeyword.keyword === 'ELSE') {
            if (current.targets.length > 0 || current.condition || current.elseBranch) {
                branches.push(current);
            }

            current = {
                elseBranch: true,
                targets: [],
            };
            index = index + 'ELSE'.length;
            continue;
        }

        const clauseEnd = findNextTopLevelKeyword(masked, index + 'INTO'.length, ['WHEN', 'ELSE', 'INTO']);
        const clauseSql = branchSql.slice(index + 'INTO'.length, clauseEnd?.index ?? branchSql.length).trim();
        const target = parseIntoClause(clauseSql);
        if (target) {
            current.targets.push(target);
        }

        index = clauseEnd?.index ?? masked.length;
    }

    if (current.targets.length > 0 || current.condition || current.elseBranch) {
        branches.push(current);
    }

    return branches.filter((branch) => branch.targets.length > 0);
}

function describeBranch(branch: OracleInsertBranch): string {
    const targets = Array.from(new Set(branch.targets.map((target) => target.tableName)));
    if (branch.elseBranch) {
        return `ELSE -> ${targets.join(', ')}`;
    }
    if (branch.condition) {
        return `WHEN ${branch.condition} -> ${targets.join(', ')}`;
    }
    return `ALL ROWS -> ${targets.join(', ')}`;
}

function buildStats(context: ParserContext, branchCount: number, conditionalBranchCount: number): QueryStats {
    const tables = context.tableUsageMap.size;
    const complexityScore = Math.max(
        4,
        tables * 2
        + branchCount * 2
        + conditionalBranchCount * 2
        + Math.max(0, context.stats.joins)
    );

    let complexity: QueryStats['complexity'] = 'Simple';
    if (complexityScore >= 30) {
        complexity = 'Very Complex';
    } else if (complexityScore >= 15) {
        complexity = 'Complex';
    } else if (complexityScore >= 5) {
        complexity = 'Moderate';
    }

    return {
        ...context.stats,
        tables,
        conditions: Math.max(context.stats.conditions, conditionalBranchCount),
        complexity,
        complexityScore,
    };
}

export function tryParseCompatibleOracleInsertStatement(args: TryParseCompatibleOracleInsertArgs): ParseResult | null {
    const { context, sql, genId, processSelect } = args;
    if (context.dialect !== 'Oracle') {
        return null;
    }

    const commentStripped = stripSqlComments(sql).trim();
    const modeMatch = commentStripped.match(/^INSERT\s+(ALL|FIRST)\b/i);
    if (!modeMatch) {
        return null;
    }

    const mode = modeMatch[1].toUpperCase() as 'ALL' | 'FIRST';
    const queryStart = findQueryStart(commentStripped, modeMatch[0].length);
    if (queryStart === -1) {
        return null;
    }

    const branchSql = commentStripped.slice(modeMatch[0].length, queryStart).trim();
    const querySql = commentStripped.slice(queryStart).trim();
    if (!branchSql || !querySql) {
        return null;
    }

    const branches = parseBranches(branchSql);
    if (branches.length === 0) {
        return null;
    }

    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const branchDetails = branches.map(describeBranch);

    let sourceRootId: string | null = null;
    const selectAst = parseSelectAst(querySql);
    if (selectAst) {
        const previousType = context.statementType;
        context.statementType = 'select';
        sourceRootId = processSelect(context, selectAst, nodes, edges);
        context.statementType = previousType;
    } else {
        sourceRootId = createApproximateSourceFlow(context, querySql, nodes, edges, genId);
    }

    if (!sourceRootId) {
        return null;
    }

    const resultId = genId('stmt');
    const resultDescription = mode === 'FIRST'
        ? 'Oracle conditional multi-table insert'
        : 'Oracle multi-table insert';
    nodes.push({
        id: resultId,
        type: 'result',
        label: `INSERT ${mode}`,
        description: `${resultDescription} | Targets: ${Array.from(new Set(branches.flatMap((branch) => branch.targets.map((target) => target.tableName)))).join(', ')}`,
        details: branchDetails,
        accessMode: 'write',
        operationType: 'INSERT',
        x: 0,
        y: 0,
        width: 260,
        height: 60,
    });

    const targetNodes = new Map<string, string>();
    const conditionalBranchCount = branches.filter((branch) => branch.condition || branch.elseBranch).length;

    for (const branch of branches) {
        let inboundId = sourceRootId;
        if (branch.condition || branch.elseBranch) {
            const branchId = genId('filter');
            const branchDetail = branch.elseBranch ? 'Oracle ELSE branch' : `Oracle WHEN branch: ${branch.condition}`;
            nodes.push({
                id: branchId,
                type: 'filter',
                label: branch.elseBranch ? 'ELSE' : 'WHEN',
                description: branchDetail,
                details: [describeBranch(branch)],
                x: 0,
                y: 0,
                width: 200,
                height: 60,
            });
            edges.push(createFlowEdge(genId, sourceRootId, branchId, branch.elseBranch ? 'ELSE' : 'WHEN', 'filter'));
            inboundId = branchId;
        }

        for (const target of branch.targets) {
            context.tableUsageMap.set(target.tableName.toLowerCase(), (context.tableUsageMap.get(target.tableName.toLowerCase()) || 0) + 1);

            let targetId = targetNodes.get(target.tableName);
            if (!targetId) {
                targetId = genId('table');
                targetNodes.set(target.tableName, targetId);
                nodes.push({
                    id: targetId,
                    type: 'table',
                    label: target.tableName,
                    description: target.columns.length > 0
                        ? `Insert target table | Columns: ${target.columns.join(', ')}`
                        : 'Insert target table',
                    accessMode: 'write',
                    operationType: 'INSERT',
                    x: 0,
                    y: 0,
                    width: 160,
                    height: 60,
                    tableCategory: 'physical',
                });
            }

            edges.push(createFlowEdge(genId, inboundId, targetId, 'INTO'));
        }
    }

    for (const targetId of targetNodes.values()) {
        edges.push(createFlowEdge(genId, targetId, resultId, 'INSERT'));
    }

    const hints = [
        {
            type: 'info' as const,
            message: `Parsed Oracle INSERT ${mode} using compatibility parser`,
            suggestion: `INSERT ${mode} is structurally mapped (source flow, conditional branches, targets) because direct Oracle multi-table insert AST support is incomplete.`,
            category: 'best-practice' as const,
            severity: 'low' as const,
        },
        ...context.hints,
    ];

    return {
        nodes,
        edges,
        stats: buildStats(context, branches.length, conditionalBranchCount),
        hints,
        sql,
        columnLineage: [],
        tableUsage: new Map(context.tableUsageMap),
    };
}
