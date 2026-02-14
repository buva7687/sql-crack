import type { FlowEdge, FlowNode } from '../../types';
import type { ParserContext } from '../context';

type GenIdFn = (prefix: string) => string;
type ProcessSelectFn = (
    context: ParserContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[]
) => string | null;

export interface StatementPresentation {
    label: string;
    description: string;
    objectName: string;
}

export function getStatementPresentation(stmt: any, statementType: string): StatementPresentation {
    let label = stmt.type?.toUpperCase() || '';
    let description = `${stmt.type} statement`;
    let objectName = '';

    if (statementType === 'create' && stmt.keyword) {
        const keyword = stmt.keyword.toUpperCase();

        if (stmt.keyword === 'view' && stmt.view) {
            objectName = stmt.view.view || stmt.view.name || '';
        } else if (stmt.keyword === 'table' && stmt.table) {
            const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
            objectName = tables[0]?.table || tables[0]?.name || '';
        } else if (stmt.keyword === 'index' && stmt.index) {
            objectName = stmt.index || '';
        } else if (stmt.keyword === 'database' && stmt.database) {
            objectName = stmt.database || '';
        } else if (stmt.keyword === 'schema' && stmt.schema) {
            objectName = stmt.schema || '';
        }

        label = objectName ? `${keyword} ${objectName}` : `CREATE ${keyword}`;
        description = objectName
            ? `Create ${keyword.toLowerCase()}: ${objectName}`
            : `Create ${keyword.toLowerCase()}`;
    }

    return { label, description, objectName };
}

export function tryProcessCreateStatement(
    context: ParserContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[],
    rootId: string,
    objectName: string,
    genId: GenIdFn,
    processSelect: ProcessSelectFn
): string | null {
    if (context.statementType !== 'create' || !stmt.keyword) {
        return null;
    }

    // For CREATE VIEW with a SELECT, process the inner SELECT and connect to view
    if (stmt.keyword === 'view' && stmt.select && objectName) {
        const selectRootId = processSelect(context, stmt.select, nodes, edges);

        const viewNodeWidth = Math.max(160, objectName.length * 10 + 60);
        nodes.push({
            id: rootId,
            type: 'result',
            label: `VIEW ${objectName}`,
            description: `Create view: ${objectName}`,
            accessMode: 'write',
            operationType: 'CREATE_VIEW',
            x: 0,
            y: 0,
            width: viewNodeWidth,
            height: 60
        });

        if (selectRootId) {
            edges.push({
                id: genId('e'),
                source: selectRootId,
                target: rootId
            });
        }

        return rootId;
    }

    // For CREATE TABLE AS SELECT (CTAS), process the inner SELECT for optimization hints
    if (stmt.keyword === 'table' && (stmt.select || stmt.as) && objectName) {
        const innerSelect = stmt.select || stmt.as;
        const selectRootId = processSelect(context, innerSelect, nodes, edges);

        const tableNodeWidth = Math.max(160, objectName.length * 10 + 60);
        nodes.push({
            id: rootId,
            type: 'result',
            label: `TABLE ${objectName}`,
            description: `Create table as select: ${objectName}`,
            accessMode: 'write',
            operationType: 'CREATE_TABLE_AS',
            x: 0,
            y: 0,
            width: tableNodeWidth,
            height: 60
        });

        if (selectRootId) {
            edges.push({
                id: genId('e'),
                source: selectRootId,
                target: rootId
            });
        }

        return rootId;
    }

    return null;
}
