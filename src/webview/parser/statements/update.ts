import type { FlowNode, ParseResult, SqlDialect } from '../../types';
import type { ParserContext } from '../context';
import { stripSqlComments } from '../dialects/preprocessing';
import { createFlowEdge, extractOutputIntoInfo, type GenIdFn } from './delete';

interface TryParseCompatibleUpdateArgs {
    context: ParserContext;
    sql: string;
    genId: GenIdFn;
    parseSql: (sql: string, dialect: SqlDialect) => ParseResult;
}

// T-SQL supports `UPDATE ... SET ... OUTPUT <cols> [INTO <target>] FROM ...`, but node-sql-parser
// rejects the OUTPUT clause. Strip OUTPUT/INTO, parse the remaining UPDATE, then re-attach the
// OUTPUT metadata (and an INTO write-target node) so the flow is still visualized. (Issue #87)
export function tryParseCompatibleUpdateStatement(args: TryParseCompatibleUpdateArgs): ParseResult | null {
    const { context, sql, genId, parseSql } = args;
    if (context.dialect !== 'TransactSQL') {
        return null;
    }

    const commentStripped = stripSqlComments(sql).trim();
    if (!/^UPDATE\b/i.test(commentStripped) || !/\bOUTPUT\b/i.test(commentStripped)) {
        return null;
    }

    const outputInfo = extractOutputIntoInfo(commentStripped);
    if (!outputInfo || !outputInfo.sanitizedSql) {
        return null;
    }

    const result = parseSql(outputInfo.sanitizedSql, context.dialect);
    // If the sanitized statement still doesn't parse, let the normal pipeline handle it
    // (which reports the original error) rather than showing a misleading partial graph.
    if (result.error) {
        return null;
    }
    result.sql = sql;

    const updateNode = result.nodes.find((node) => node.type === 'result' && node.label === 'UPDATE') || null;
    const detail = outputInfo.columns.length > 0
        ? `OUTPUT: ${outputInfo.columns.join(', ')}`
        : 'OUTPUT';

    if (updateNode) {
        updateNode.description = updateNode.description
            ? `${updateNode.description} | ${detail}`
            : detail;
        updateNode.details = [...(updateNode.details || []), detail];
    }

    if (updateNode && outputInfo.intoTarget) {
        const outputNodeId = genId('table');
        const outputNode: FlowNode = {
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
        };
        result.nodes.push(outputNode);
        result.edges.push(createFlowEdge(genId, updateNode.id, outputNodeId, 'OUTPUT INTO'));
        result.tableUsage.set(outputInfo.intoTarget.toLowerCase(), 1);
        result.stats.tables = Math.max(result.stats.tables, result.tableUsage.size);
    }

    result.hints.unshift({
        type: 'info',
        message: 'Parsed TransactSQL UPDATE ... OUTPUT via compatibility parser',
        suggestion: 'OUTPUT semantics are preserved while the statement structure is parsed from a sanitized update form.',
        category: 'best-practice',
        severity: 'low',
    });

    return result;
}
