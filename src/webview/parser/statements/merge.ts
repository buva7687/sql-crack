import type { FlowEdge, FlowNode, ParseResult, QueryStats, SqlDialect } from '../../types';
import { regexFallbackParse } from '../dialects/fallback';
import { findMatchingParen, maskStringsAndComments } from '../dialects/preprocessing';
import { stripSqlComments } from '../../../shared/stringUtils';

const MERGE_COMPATIBILITY_DIALECTS: SqlDialect[] = ['TransactSQL', 'Oracle', 'Snowflake', 'BigQuery', 'Teradata', 'PostgreSQL'];
const IDENTIFIER_PART = '[\\p{L}\\p{N}_$]+';
const QUOTED_IDENTIFIER = "(?:`[^`]+`|\"[^\"]+\"|\\[[^\\]]+\\]|'[^']+')";
const IDENTIFIER = `(?:${QUOTED_IDENTIFIER}|${IDENTIFIER_PART})`;
const QUALIFIED_IDENTIFIER = `${IDENTIFIER}(?:\\.${IDENTIFIER})*`;
const IDENTIFIER_WRAPPER_PATTERN = /[`"'\[\]]/g;

let mergeIdCounter = 0;
function mergeGenId(prefix: string): string {
    return `${prefix}_${mergeIdCounter++}`;
}

function normalizeObjectName(raw: string): string {
    const parts = raw.split('.').map((part) => part.replace(IDENTIFIER_WRAPPER_PATTERN, '')).filter(Boolean);
    return parts[parts.length - 1] || raw.replace(IDENTIFIER_WRAPPER_PATTERN, '');
}

function buildCompatibilityHint(dialect: SqlDialect): { message: string; suggestion: string } {
    if (dialect === 'Teradata') {
        return {
            message: 'Parsed Teradata MERGE using compatibility parser',
            suggestion: 'MERGE is structurally mapped (source/target/WHEN branches) because this Teradata MERGE form is unsupported by the proxy AST parser.',
        };
    }

    return {
        message: `Parsed ${dialect} MERGE using compatibility parser`,
        suggestion: `MERGE is structurally mapped (source/target/WHEN branches) using the compatibility parser for ${dialect}.`,
    };
}

function createTableNode(label: string, accessMode?: FlowNode['accessMode'], operationType?: FlowNode['operationType']): FlowNode {
    return {
        id: '',
        type: 'table',
        label,
        description: accessMode === 'write' ? 'Merge target table' : 'Merge source table',
        accessMode,
        operationType,
        x: 0,
        y: 0,
        width: 160,
        height: 60,
        tableCategory: 'physical',
    };
}

function extractWhenClauses(sql: string): string[] {
    const clauses: string[] = [];
    const whenRegex = /\bWHEN\s+(MATCHED|NOT\s+MATCHED(?:\s+BY\s+(?:TARGET|SOURCE))?)(?:\s+AND\s+[\s\S]*?)?\s+THEN\s+(\w+)/gi;
    let match: RegExpExecArray | null;

    while ((match = whenRegex.exec(sql)) !== null) {
        clauses.push(`${match[1].replace(/\s+/g, ' ').toUpperCase()} -> ${match[2].toUpperCase()}`);
    }

    return clauses;
}

function extractUpdateColumns(sql: string): string[] {
    const updateCols: string[] = [];
    const setMatch = sql.match(/UPDATE\s+SET\s+([\s\S]+?)(?=\bWHEN\b|$)/i);
    if (!setMatch) {
        return updateCols;
    }

    const assignments = setMatch[1].split(',');
    for (const assignment of assignments) {
        const colMatch = assignment.trim().match(/(?:\w+\.)?(\w+)\s*=/);
        if (colMatch) {
            updateCols.push(colMatch[1]);
        }
    }
    return updateCols;
}

function extractInsertColumns(sql: string): string[] {
    const insertMatch = sql.match(/\bINSERT\s*\(([^)]+)\)/i);
    if (!insertMatch) {
        return [];
    }
    return insertMatch[1].split(',').map(column => column.trim()).filter(Boolean);
}

function extractOnCondition(sql: string): string | null {
    const onMatch = sql.match(/\bON\s+([\s\S]+?)(?=\s*WHEN\b|$)/i);
    if (!onMatch) {
        return null;
    }
    return onMatch[1].trim().replace(/\s+/g, ' ');
}

function extractSourceTablesFromSubquery(sql: string): string[] {
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

        const remainder = masked.substring(index);
        const keywordMatch = remainder.match(/^(FROM|JOIN)\b/i);
        if (!keywordMatch) {
            continue;
        }

        let pos = index + keywordMatch[0].length;
        while (pos < masked.length && /\s/.test(masked[pos])) {
            pos++;
        }

        const identifierMatch = sql.substring(pos).match(new RegExp(`^(${QUALIFIED_IDENTIFIER})`, 'iu'));
        if (identifierMatch) {
            sourceTables.add(normalizeObjectName(identifierMatch[1]));
        }

        index = pos - 1;
    }

    return Array.from(sourceTables);
}

function extractMergeSourceTables(sql: string): string[] {
    const usingMatch = /\bUSING\b/gi.exec(sql);
    if (!usingMatch) {
        return [];
    }

    let pos = usingMatch.index + usingMatch[0].length;
    while (pos < sql.length && /\s/.test(sql[pos])) {
        pos++;
    }

    if (sql[pos] === '(') {
        const closePos = findMatchingParen(sql, pos);
        if (closePos === -1) {
            return [];
        }
        return extractSourceTablesFromSubquery(sql.substring(pos + 1, closePos));
    }

    const directSource = sql.substring(pos).match(new RegExp(`^(${QUALIFIED_IDENTIFIER})`, 'iu'));
    if (!directSource) {
        return [];
    }

    return [normalizeObjectName(directSource[1])];
}

function ensureTableNode(
    nodes: FlowNode[],
    label: string,
    accessMode?: FlowNode['accessMode'],
    operationType?: FlowNode['operationType']
): FlowNode {
    const existing = nodes.find(node => node.type === 'table' && node.label === label);
    if (existing) {
        if (accessMode) {
            existing.accessMode = accessMode;
        }
        if (operationType) {
            existing.operationType = operationType;
        }
        return existing;
    }

    const node = createTableNode(label, accessMode, operationType);
    node.id = mergeGenId('merge_table');
    nodes.push(node);
    return node;
}

function buildStats(nodes: FlowNode[], edges: FlowEdge[], sql: string): QueryStats {
    const tableNames = new Set(
        nodes
            .filter(node => node.type === 'table' || node.type === 'cte')
            .map(node => node.label.toLowerCase())
    );
    const joins = edges.filter(edge => edge.clauseType === 'join').length;
    const ctes = nodes.filter(node => node.tableCategory === 'cte_reference' || node.type === 'cte').length;
    const cleaned = maskStringsAndComments(sql);
    const subqueries = (cleaned.match(/\(\s*SELECT\b/gi) || []).length;
    const aggregations = (cleaned.match(/\b(COUNT|SUM|AVG|MIN|MAX|GROUP_CONCAT)\b/gi) || []).length;
    const windowFunctions = (cleaned.match(/\bOVER\s*\(/gi) || []).length;
    const unions = (cleaned.match(/\bUNION\b/gi) || []).length;
    const conditions = (cleaned.match(/\bWHERE\b/gi) || []).length + (cleaned.match(/\bHAVING\b/gi) || []).length;
    const complexityScore = tableNames.size + joins * 3 + Math.max(2, edges.filter(edge => edge.clauseType?.startsWith('merge_')).length * 2);

    let complexity: QueryStats['complexity'] = 'Simple';
    if (complexityScore >= 30) {
        complexity = 'Very Complex';
    } else if (complexityScore >= 15) {
        complexity = 'Complex';
    } else if (complexityScore >= 5) {
        complexity = 'Moderate';
    }

    return {
        tables: tableNames.size,
        joins,
        subqueries,
        ctes,
        aggregations,
        windowFunctions,
        unions,
        conditions,
        complexity,
        complexityScore,
    };
}

export function tryParseCompatibleMergeStatement(sql: string, dialect: SqlDialect): ParseResult | null {
    mergeIdCounter = 0;
    if (!MERGE_COMPATIBILITY_DIALECTS.includes(dialect)) {
        return null;
    }

    const commentStripped = stripSqlComments(sql);
    const mergeTargetMatch = commentStripped.match(new RegExp(`\\bMERGE\\s+INTO\\s+(${QUALIFIED_IDENTIFIER})`, 'iu'));
    if (!mergeTargetMatch) {
        return null;
    }

    const targetTable = normalizeObjectName(mergeTargetMatch[1]);
    const sourceTables = extractMergeSourceTables(commentStripped);
    const whenClauses = extractWhenClauses(commentStripped);
    const updateCols = extractUpdateColumns(commentStripped);
    const insertCols = extractInsertColumns(commentStripped);
    const onCondition = extractOnCondition(commentStripped);

    const result = regexFallbackParse(sql, dialect);
    const { message, suggestion } = buildCompatibilityHint(dialect);

    result.nodes = result.nodes.map(node => ({
        ...node,
        description: node.description
            ? node.description
                .replace('detected by fallback parser', dialect === 'Teradata' ? 'detected by Teradata compatibility parser' : 'detected by MERGE compatibility parser')
                .replace('Partial visualization - parsing failed', 'MERGE compatibility parser')
            : node.description,
        details: Array.isArray(node.details)
            ? node.details.map(detail => detail === 'Partial visualization - parsing failed' ? 'MERGE compatibility parser' : detail)
            : node.details,
    }));

    const filteredHints = result.hints.filter(hint =>
        hint.message !== 'Partial visualization - SQL parser could not parse this query'
        && !hint.message.includes('MERGE statement detected (using fallback parser)')
    );

    const targetNode = ensureTableNode(result.nodes, targetTable, 'write', 'MERGE');
    const mergeLabel = `MERGE INTO ${targetTable}`;
    const mergeDescriptionParts = [...whenClauses];
    if (updateCols.length > 0) {
        mergeDescriptionParts.push(`SET: ${updateCols.join(', ')}`);
    }
    if (insertCols.length > 0) {
        mergeDescriptionParts.push(`INSERT: ${insertCols.join(', ')}`);
    }
    if (onCondition) {
        mergeDescriptionParts.push(`ON: ${onCondition}`);
    }

    let mergeNode = result.nodes.find(node => node.type === 'result' && node.label === mergeLabel);
    if (!mergeNode) {
        mergeNode = {
            id: mergeGenId('merge_stmt'),
            type: 'result',
            label: mergeLabel,
            description: mergeDescriptionParts.join(' | '),
            accessMode: 'write',
            operationType: 'MERGE',
            x: 0,
            y: 0,
            width: 260,
            height: 60,
        };
        result.nodes.push(mergeNode);
    } else {
        mergeNode.accessMode = 'write';
        mergeNode.operationType = 'MERGE';
        mergeNode.description = mergeDescriptionParts.join(' | ');
    }

    const edgeIds = new Set(result.edges.map(edge => `${edge.source}:${edge.target}:${edge.clauseType || ''}`));
    const sourceNodes = sourceTables.map(sourceTable => ensureTableNode(result.nodes, sourceTable));

    const mergeTargetEdgeKey = `${targetNode.id}:${mergeNode.id}:merge_target`;
    if (!edgeIds.has(mergeTargetEdgeKey)) {
        result.edges.push({
            id: mergeGenId('merge_edge'),
            source: targetNode.id,
            target: mergeNode.id,
            sqlClause: 'INTO',
            clauseType: 'merge_target',
        });
        edgeIds.add(mergeTargetEdgeKey);
    }

    for (const sourceNode of sourceNodes) {
        const sourceEdgeKey = `${sourceNode.id}:${mergeNode.id}:merge_source`;
        if (edgeIds.has(sourceEdgeKey)) {
            continue;
        }
        result.edges.push({
            id: mergeGenId('merge_edge'),
            source: sourceNode.id,
            target: mergeNode.id,
            sqlClause: 'USING',
            clauseType: 'merge_source',
        });
        edgeIds.add(sourceEdgeKey);
    }

    result.hints = [{
        type: 'info',
        message,
        suggestion,
        category: 'best-practice',
        severity: 'low',
    }, ...filteredHints];

    result.stats = buildStats(result.nodes, result.edges, sql);
    result.tableUsage = new Map(
        result.nodes
            .filter(node => node.type === 'table' || node.type === 'cte')
            .map(node => [node.label.toLowerCase(), 1])
    );
    delete result.partial;

    return result;
}
