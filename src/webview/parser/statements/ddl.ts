import type {
    NodeType,
    ParseResult,
    SqlDialect,
    FlowEdge,
    FlowNode
} from '../../types';
import { createFreshContext, type ParserContext } from '../context';
import { formatExpressionFromAst, getAstString } from '../extractors/columns';
import { stripLeadingComments } from '../validation/splitting';

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

const IDENTIFIER_WRAPPER_PATTERN = /[`"'\[\]]/g;

function normalizeIdentifier(raw: string): string {
    return raw
        .split('.')
        .map(part => part.replace(IDENTIFIER_WRAPPER_PATTERN, '').trim())
        .filter(Boolean)
        .join('.');
}

function extractIdentifierName(node: any): string | null {
    if (typeof node === 'string' || typeof node === 'number') {
        const normalized = normalizeIdentifier(String(node));
        return normalized || null;
    }
    if (!node || typeof node !== 'object') {
        return null;
    }
    if (Array.isArray(node)) {
        const parts = node.map((part: any) => extractIdentifierName(part)).filter(Boolean);
        return parts.length > 0 ? parts.join('.') : null;
    }

    const db = extractIdentifierName(node.db || node.schema);
    const table = extractIdentifierName(node.table || node.view || node.name);
    if (db && table) {
        return `${db}.${table}`;
    }
    if (table) {
        return table;
    }

    if (node.column) {
        return extractIdentifierName(node.column);
    }
    if (node.value) {
        return extractIdentifierName(node.value);
    }
    if (node.expr) {
        return extractIdentifierName(node.expr);
    }

    return null;
}

function getObjectNames(input: any): string[] {
    if (Array.isArray(input)) {
        return input
            .map((item: any) => extractIdentifierName(item))
            .filter((value: string | null): value is string => Boolean(value));
    }
    const single = extractIdentifierName(input);
    return single ? [single] : [];
}

function trackSchemaObject(context: ParserContext, objectName: string): void {
    if (!objectName) {
        return;
    }
    const key = objectName.toLowerCase();
    context.tableUsageMap.set(key, (context.tableUsageMap.get(key) || 0) + 1);
}

function getCreateQueryStatement(stmt: any): any | null {
    if (!stmt || stmt.type?.toLowerCase() !== 'create') {
        return null;
    }
    if (stmt.select && typeof stmt.select === 'object') {
        return stmt.select;
    }
    if (stmt.query_expr && typeof stmt.query_expr === 'object') {
        return stmt.query_expr;
    }
    if (stmt.as && typeof stmt.as === 'object') {
        return stmt.as;
    }
    return null;
}

function getReferenceDisplay(referenceDefinition: any): string | null {
    if (!referenceDefinition || typeof referenceDefinition !== 'object') {
        return null;
    }

    const tables = getObjectNames(referenceDefinition.table);
    if (tables.length === 0) {
        return null;
    }

    const columns = Array.isArray(referenceDefinition.definition)
        ? referenceDefinition.definition
            .map((item: any) => extractIdentifierName(item))
            .filter((value: string | null): value is string => Boolean(value))
        : [];
    const suffix = columns.length > 0 ? `(${columns.join(', ')})` : '';
    return `${tables[0]}${suffix}`;
}

function getReferenceTableNames(referenceDefinition: any): string[] {
    if (!referenceDefinition || typeof referenceDefinition !== 'object') {
        return [];
    }
    return getObjectNames(referenceDefinition.table);
}

function describeCreateDefinition(definition: any): string | null {
    if (!definition || typeof definition !== 'object') {
        return null;
    }

    if (definition.resource === 'column') {
        const columnName = extractIdentifierName(definition.column);
        if (!columnName) {
            return null;
        }

        const dataType = typeof definition.definition?.dataType === 'string'
            ? ` ${definition.definition.dataType.toUpperCase()}`
            : '';
        let summary = `${columnName}${dataType}`;
        if (definition.primary_key) {
            summary += ' PRIMARY KEY';
        }
        if (definition.unique) {
            summary += ' UNIQUE';
        }
        if (definition.not_null) {
            summary += ' NOT NULL';
        }

        const referenceDisplay = getReferenceDisplay(definition.reference_definition);
        if (referenceDisplay) {
            summary += ` REFERENCES ${referenceDisplay}`;
        }
        return summary;
    }

    const constraintName = typeof definition.constraint === 'string' ? definition.constraint : '';
    const constraintType = typeof definition.constraint_type === 'string'
        ? definition.constraint_type.toUpperCase()
        : 'CONSTRAINT';
    const columns = Array.isArray(definition.definition)
        ? definition.definition
            .map((item: any) => extractIdentifierName(item))
            .filter((value: string | null): value is string => Boolean(value))
        : [];

    let summary = constraintName ? `${constraintName}: ${constraintType}` : constraintType;
    if (columns.length > 0) {
        summary += ` (${columns.join(', ')})`;
    }

    const referenceDisplay = getReferenceDisplay(definition.reference_definition);
    if (referenceDisplay) {
        summary += ` REFERENCES ${referenceDisplay}`;
    }
    return summary;
}

function collectReferenceTablesFromDefinitions(definitions: any[]): string[] {
    const names = new Set<string>();
    for (const definition of definitions) {
        for (const tableName of getReferenceTableNames(definition?.reference_definition)) {
            names.add(tableName);
        }
        for (const tableName of getReferenceTableNames(definition?.create_definitions?.reference_definition)) {
            names.add(tableName);
        }
    }
    return Array.from(names);
}

function getCreateTableDetails(stmt: any): string[] {
    const definitions = Array.isArray(stmt.create_definitions) ? stmt.create_definitions : [];
    if (definitions.length === 0) {
        return [];
    }

    const details = definitions
        .map((definition: any) => describeCreateDefinition(definition))
        .filter((value: string | null): value is string => Boolean(value));
    const header = `Definitions: ${details.length}`;
    return [header, ...details.slice(0, 5), ...(details.length > 5 ? [`+${details.length - 5} more`] : [])];
}

function formatOptionValue(value: any): string {
    if (Array.isArray(value)) {
        return value.map(item => formatOptionValue(item)).join(', ');
    }
    if (typeof value === 'string' || typeof value === 'number') {
        return String(value);
    }
    if (!value || typeof value !== 'object') {
        return '';
    }

    if (typeof value.type === 'string') {
        const formatted = formatExpressionFromAst(value)?.trim();
        if (formatted && formatted !== 'expr') {
            return formatted.replace(/\s+/g, ' ');
        }
    }

    const astString = getAstString(value)?.trim();
    if (astString) {
        return astString.replace(/\s+/g, ' ');
    }
    return '';
}

function getCreateTableOptionDetails(stmt: any): string[] {
    const options = Array.isArray(stmt.table_options) ? stmt.table_options : [];
    return options
        .map((option: any) => {
            const keyword = typeof option?.keyword === 'string' ? option.keyword.toUpperCase() : '';
            const value = formatOptionValue(option?.value);
            if (!keyword) {
                return null;
            }
            return value ? `${keyword}: ${value}` : keyword;
        })
        .filter((value: string | null): value is string => Boolean(value));
}

function describeAlterExpression(expr: any): string | null {
    if (!expr || typeof expr !== 'object') {
        return null;
    }

    const action = typeof expr.action === 'string' ? expr.action.toUpperCase() : 'ALTER';
    if (expr.create_definitions) {
        const definitionSummary = describeCreateDefinition(expr.create_definitions);
        return definitionSummary ? `${action} ${definitionSummary}` : action;
    }

    const resource = typeof expr.resource === 'string'
        ? expr.resource.toUpperCase()
        : (typeof expr.keyword === 'string' ? expr.keyword.toUpperCase() : 'OBJECT');
    const target = extractIdentifierName(expr.column || expr.name || expr.old_column || expr.target);
    const newName = extractIdentifierName(expr.rename || expr.new_column);
    const dataType = typeof expr.definition?.dataType === 'string'
        ? ` ${expr.definition.dataType.toUpperCase()}`
        : '';

    if (action === 'RENAME' && target && newName) {
        return `RENAME ${resource} ${target} TO ${newName}`;
    }
    if (target) {
        return `${action} ${resource} ${target}${dataType}`.trim();
    }
    return `${action} ${resource}`.trim();
}

function getAlterDetails(stmt: any): string[] {
    const expressions = Array.isArray(stmt.expr) ? stmt.expr : [];
    const details = expressions
        .map((expr: any) => describeAlterExpression(expr))
        .filter((value: string | null): value is string => Boolean(value));

    return details.length > 0 ? details : [];
}

function getDropDetails(stmt: any): string[] {
    const details: string[] = [];
    if (typeof stmt.prefix === 'string' && stmt.prefix.trim()) {
        details.push(stmt.prefix.toUpperCase());
    }
    const tableName = extractIdentifierName(stmt.table);
    if (tableName) {
        details.push(`ON ${tableName}`);
    }
    return details;
}

function getTruncateDetails(stmt: any): string[] {
    const suffixes = Array.isArray(stmt.suffix)
        ? stmt.suffix
            .map((item: any) => typeof item?.value === 'string' ? item.value.toUpperCase() : '')
            .filter(Boolean)
        : [];
    return suffixes.length > 0 ? [`Options: ${suffixes.join(', ')}`] : [];
}

function createWriteTargetNode(
    context: ParserContext,
    nodes: FlowNode[],
    genId: GenIdFn,
    label: string,
    description: string,
    operationType: FlowNode['operationType']
): string {
    trackSchemaObject(context, label);
    const nodeId = genId('table');
    nodes.push({
        id: nodeId,
        type: 'table',
        label,
        description,
        accessMode: 'write',
        operationType,
        x: 0,
        y: 0,
        width: Math.min(220, Math.max(140, label.length * 10 + 36)),
        height: 60,
    });
    return nodeId;
}

function attachReferenceSources(
    context: ParserContext,
    nodes: FlowNode[],
    edges: FlowEdge[],
    genId: GenIdFn,
    targetId: string,
    referenceTables: string[]
): void {
    const seen = new Set<string>();
    for (const tableName of referenceTables) {
        const normalizedName = tableName.toLowerCase();
        if (seen.has(normalizedName)) {
            continue;
        }
        seen.add(normalizedName);
        trackSchemaObject(context, tableName);

        const sourceId = genId('table');
        nodes.push({
            id: sourceId,
            type: 'table',
            label: tableName,
            description: 'Referenced table',
            accessMode: 'read',
            x: 0,
            y: 0,
            width: Math.min(220, Math.max(140, tableName.length * 10 + 36)),
            height: 60,
        });
        edges.push({
            id: genId('e'),
            source: sourceId,
            target: targetId,
            sqlClause: 'REFERENCES',
            clauseType: 'flow',
        });
    }
}

export function getStatementPresentation(stmt: any, statementType: string): StatementPresentation {
    let label = stmt.type?.toUpperCase() || '';
    let description = `${stmt.type} statement`;
    let objectName = '';

    if (statementType === 'create' && stmt.keyword) {
        const keyword = stmt.keyword.toUpperCase();

        if (stmt.keyword === 'view' && stmt.view) {
            objectName = getObjectNames(stmt.view)[0] || '';
        } else if (stmt.keyword === 'table' && stmt.table) {
            objectName = getObjectNames(stmt.table)[0] || '';
        } else if (stmt.keyword === 'index' && stmt.index) {
            objectName = extractIdentifierName(stmt.index) || '';
        } else if (stmt.keyword === 'database' && stmt.database) {
            objectName = stmt.database || '';
        } else if (stmt.keyword === 'schema' && stmt.schema) {
            objectName = stmt.schema || '';
        }

        label = objectName ? `${keyword} ${objectName}` : `CREATE ${keyword}`;
        description = objectName
            ? `Create ${keyword.toLowerCase()}: ${objectName}`
            : `Create ${keyword.toLowerCase()}`;
    } else if (statementType === 'alter') {
        const keyword = stmt.keyword ? String(stmt.keyword).toUpperCase() : 'TABLE';
        objectName = getObjectNames(stmt.table)[0] || '';
        label = objectName ? `ALTER ${keyword} ${objectName}` : `ALTER ${keyword}`;
        description = objectName
            ? `Alter ${keyword.toLowerCase()}: ${objectName}`
            : `Alter ${keyword.toLowerCase()}`;
    } else if (statementType === 'drop') {
        const keyword = stmt.keyword ? String(stmt.keyword).toUpperCase().replace(/\s+/g, ' ') : 'OBJECT';
        objectName = getObjectNames(stmt.name)[0] || '';
        label = objectName ? `DROP ${keyword} ${objectName}` : `DROP ${keyword}`;
        description = objectName
            ? `Drop ${keyword.toLowerCase()}: ${objectName}`
            : `Drop ${keyword.toLowerCase()}`;
    } else if (statementType === 'truncate') {
        const keyword = stmt.keyword ? String(stmt.keyword).toUpperCase() : 'TABLE';
        objectName = getObjectNames(stmt.name)[0] || '';
        label = objectName ? `TRUNCATE ${keyword} ${objectName}` : `TRUNCATE ${keyword}`;
        description = objectName
            ? `Truncate ${keyword.toLowerCase()}: ${objectName}`
            : `Truncate ${keyword.toLowerCase()}`;
    } else if (statementType === 'replace') {
        objectName = getObjectNames(stmt.table)[0] || '';
        label = objectName ? `REPLACE ${objectName}` : 'REPLACE';
        description = objectName
            ? `Replace rows in table: ${objectName}`
            : 'Replace rows';
    }

    return { label, description, objectName };
}

export function tryProcessDdlStatement(
    context: ParserContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[],
    rootId: string,
    objectName: string,
    genId: GenIdFn,
    processSelect: ProcessSelectFn
): string | null {
    if (context.statementType === 'create' && stmt.keyword) {
        // For CREATE VIEW with a SELECT, process the inner SELECT and connect to view
        if (stmt.keyword === 'view' && stmt.select && objectName) {
            const selectRootId = processSelect(context, stmt.select, nodes, edges);

            const viewNodeWidth = Math.min(420, Math.max(160, objectName.length * 10 + 60));
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
        const innerSelect = getCreateQueryStatement(stmt);
        if (stmt.keyword === 'table' && innerSelect && objectName) {
            const selectRootId = processSelect(context, innerSelect, nodes, edges);
            const details = getCreateTableOptionDetails(stmt);

            const tableNodeWidth = Math.min(420, Math.max(160, objectName.length * 10 + 60));
            nodes.push({
                id: rootId,
                type: 'result',
                label: `TABLE ${objectName}`,
                description: `Create table as select: ${objectName}`,
                details: details.length > 0 ? details : undefined,
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

        if (stmt.keyword === 'table' && objectName) {
            trackSchemaObject(context, objectName);
            const details = [
                ...getCreateTableDetails(stmt),
                ...getCreateTableOptionDetails(stmt)
            ];
            const referenceTables = collectReferenceTablesFromDefinitions(Array.isArray(stmt.create_definitions) ? stmt.create_definitions : []);

            nodes.push({
                id: rootId,
                type: 'result',
                label: `TABLE ${objectName}`,
                description: `Create table: ${objectName}`,
                details,
                accessMode: 'write',
                operationType: 'CREATE_TABLE',
                x: 0,
                y: 0,
                width: Math.min(420, Math.max(180, objectName.length * 10 + 80)),
                height: 60
            });
            attachReferenceSources(context, nodes, edges, genId, rootId, referenceTables);
            return rootId;
        }
    }

    if (context.statementType === 'alter') {
        const targetNames = getObjectNames(stmt.table);
        const targetName = targetNames[0] || objectName;
        if (!targetName) {
            return null;
        }

        const targetId = createWriteTargetNode(
            context,
            nodes,
            genId,
            targetName,
            'Alter target object',
            'ALTER'
        );
        const details = getAlterDetails(stmt);
        const referenceTables = collectReferenceTablesFromDefinitions(Array.isArray(stmt.expr) ? stmt.expr : []);
        attachReferenceSources(context, nodes, edges, genId, targetId, referenceTables);

        nodes.push({
            id: rootId,
            type: 'result',
            label: `ALTER TABLE ${targetName}`,
            description: `Alter table: ${targetName}`,
            details,
            accessMode: 'write',
            operationType: 'ALTER',
            x: 0,
            y: 0,
            width: Math.min(420, Math.max(180, targetName.length * 10 + 80)),
            height: 60
        });
        edges.push({
            id: genId('e'),
            source: targetId,
            target: rootId
        });
        return rootId;
    }

    if (context.statementType === 'drop') {
        const keyword = stmt.keyword ? String(stmt.keyword).toUpperCase().replace(/\s+/g, ' ') : 'OBJECT';
        const targetNames = getObjectNames(stmt.name);
        if (targetNames.length === 0) {
            return null;
        }

        const details = getDropDetails(stmt);
        const rootLabel = targetNames.length === 1
            ? `DROP ${keyword} ${targetNames[0]}`
            : `DROP ${keyword} (${targetNames.length})`;

        nodes.push({
            id: rootId,
            type: 'result',
            label: rootLabel,
            description: `Drop ${keyword.toLowerCase()}: ${targetNames.join(', ')}`,
            details,
            accessMode: 'write',
            operationType: 'DROP',
            x: 0,
            y: 0,
            width: Math.min(420, Math.max(180, rootLabel.length * 10 + 40)),
            height: 60
        });

        for (const targetName of targetNames) {
            const targetId = createWriteTargetNode(
                context,
                nodes,
                genId,
                targetName,
                `Drop ${keyword.toLowerCase()} target`,
                'DROP'
            );
            edges.push({
                id: genId('e'),
                source: targetId,
                target: rootId
            });
        }

        return rootId;
    }

    if (context.statementType === 'truncate') {
        const targetNames = getObjectNames(stmt.name);
        if (targetNames.length === 0) {
            return null;
        }

        const details = getTruncateDetails(stmt);
        const rootLabel = targetNames.length === 1
            ? `TRUNCATE TABLE ${targetNames[0]}`
            : `TRUNCATE TABLE (${targetNames.length})`;

        nodes.push({
            id: rootId,
            type: 'result',
            label: rootLabel,
            description: `Truncate table: ${targetNames.join(', ')}`,
            details,
            accessMode: 'write',
            operationType: 'TRUNCATE',
            x: 0,
            y: 0,
            width: Math.min(420, Math.max(180, rootLabel.length * 10 + 40)),
            height: 60
        });

        for (const targetName of targetNames) {
            const targetId = createWriteTargetNode(
                context,
                nodes,
                genId,
                targetName,
                'Truncate target table',
                'TRUNCATE'
            );
            edges.push({
                id: genId('e'),
                source: targetId,
                target: rootId
            });
        }

        return rootId;
    }

    return null;
}

export const tryProcessCreateStatement = tryProcessDdlStatement;

const SESSION_COMMAND_PATTERNS: Array<{
    pattern: RegExp;
    type: string;
    description: (match: RegExpMatchArray) => string;
    dialects?: string[];
}> = [
    { pattern: /^USE\s+WAREHOUSE\s+(\S+)/i, type: 'USE WAREHOUSE', description: (m) => `Switch to warehouse: ${m[1]}`, dialects: ['Snowflake'] },
    { pattern: /^USE\s+DATABASE\s+(\S+)/i, type: 'USE DATABASE', description: (m) => `Switch to database: ${m[1]}` },
    { pattern: /^USE\s+SCHEMA\s+(\S+)/i, type: 'USE SCHEMA', description: (m) => `Switch to schema: ${m[1]}` },
    { pattern: /^USE\s+ROLE\s+(\S+)/i, type: 'USE ROLE', description: (m) => `Switch to role: ${m[1]}`, dialects: ['Snowflake'] },
    { pattern: /^USE\s+SECONDARY\s+ROLES\s+(\S+)/i, type: 'USE SECONDARY ROLES', description: (m) => `Set secondary roles: ${m[1]}`, dialects: ['Snowflake'] },
    { pattern: /^USE\s+(\S+)/i, type: 'USE', description: (m) => `Use: ${m[1]}` },
    { pattern: /^SET\s+(\w+)\s*=\s*(.+)/i, type: 'SET', description: (m) => `Set ${m[1]} = ${m[2]}` },
    { pattern: /^SET\s+(TRANSACTION|SESSION|LOCAL|GLOBAL)\s+(.+)/i, type: 'SET', description: (m) => `Set ${m[1]} ${m[2]}` },
    { pattern: /^UNSET\s+(\w+)/i, type: 'UNSET', description: (m) => `Unset variable: ${m[1]}` },
    { pattern: /^ALTER\s+SESSION\s+SET\s+(.+)/i, type: 'ALTER SESSION', description: (m) => `Alter session: ${m[1]}`, dialects: ['Snowflake'] },
    { pattern: /^ALTER\s+SESSION\s+UNSET\s+(.+)/i, type: 'ALTER SESSION', description: (m) => `Unset session param: ${m[1]}`, dialects: ['Snowflake'] },
    { pattern: /^ALTER\s+TABLE\s+(\S+)\s+(ENABLE|DISABLE)\s+ROW\s+MOVEMENT\b/i, type: 'ALTER TABLE', description: (m) => `${m[2]} ROW MOVEMENT on table: ${m[1]}`, dialects: ['Oracle'] },
    { pattern: /^EXEC(?:UTE)?\s+(.+)/i, type: 'EXECUTE', description: (m) => `Execute: ${m[1]}`, dialects: ['TransactSQL'] },
    { pattern: /^PRINT\s+(.+)/i, type: 'PRINT', description: (m) => `Print: ${m[1]}`, dialects: ['TransactSQL'] },
    { pattern: /^DECLARE\s+(.+)/i, type: 'DECLARE', description: (m) => `Declare: ${m[1]}` },
    { pattern: /^GO\s*$/i, type: 'GO', description: () => 'Batch separator', dialects: ['TransactSQL'] },
    { pattern: /^\\(\w+)\s*(.*)/i, type: 'PSQL COMMAND', description: (m) => `psql: \\${m[1]} ${m[2]}`, dialects: ['PostgreSQL'] },
    { pattern: /^LISTEN\s+(\S+)/i, type: 'LISTEN', description: (m) => `Listen to channel: ${m[1]}`, dialects: ['PostgreSQL'] },
    { pattern: /^NOTIFY\s+(\S+)/i, type: 'NOTIFY', description: (m) => `Notify channel: ${m[1]}`, dialects: ['PostgreSQL'] },
    { pattern: /^VACUUM\s*(.*)/i, type: 'VACUUM', description: (m) => `Vacuum${m[1] ? ': ' + m[1] : ''}`, dialects: ['PostgreSQL'] },
    { pattern: /^ANALYZE\s*(.*)/i, type: 'ANALYZE', description: (m) => `Analyze${m[1] ? ': ' + m[1] : ''}`, dialects: ['PostgreSQL'] },
    { pattern: /^REINDEX\s*(.*)/i, type: 'REINDEX', description: (m) => `Reindex${m[1] ? ': ' + m[1] : ''}`, dialects: ['PostgreSQL'] },
    { pattern: /^CLUSTER\s*(.*)/i, type: 'CLUSTER', description: (m) => `Cluster${m[1] ? ': ' + m[1] : ''}`, dialects: ['PostgreSQL'] },
    { pattern: /^SHOW\s+TRANSACTIONS/i, type: 'SHOW TRANSACTIONS', description: () => 'Show transactions' },
    { pattern: /^SHOW\s+VARIABLES(\s+LIKE\s+.+)?/i, type: 'SHOW VARIABLES', description: (m) => `Show variables${m[1] || ''}` },
    { pattern: /^SHOW\s+PARAMETERS(\s+LIKE\s+.+)?/i, type: 'SHOW PARAMETERS', description: (m) => `Show parameters${m[1] || ''}`, dialects: ['Snowflake'] },
    { pattern: /^SHOW\s+DATABASES/i, type: 'SHOW DATABASES', description: () => 'Show databases' },
    { pattern: /^SHOW\s+SCHEMAS/i, type: 'SHOW SCHEMAS', description: () => 'Show schemas' },
    { pattern: /^SHOW\s+TABLES(\s+IN\s+\S+)?/i, type: 'SHOW TABLES', description: (m) => `Show tables${m[1] || ''}` },
    { pattern: /^SHOW\s+VIEWS(\s+IN\s+\S+)?/i, type: 'SHOW VIEWS', description: (m) => `Show views${m[1] || ''}` },
    { pattern: /^SHOW\s+COLUMNS\s+(IN|FROM)\s+(\S+)/i, type: 'SHOW COLUMNS', description: (m) => `Show columns in ${m[2]}` },
    { pattern: /^SHOW\s+GRANTS(\s+.+)?/i, type: 'SHOW GRANTS', description: (m) => `Show grants${m[1] || ''}` },
    { pattern: /^SHOW\s+ROLES/i, type: 'SHOW ROLES', description: () => 'Show roles', dialects: ['Snowflake'] },
    { pattern: /^SHOW\s+WAREHOUSES/i, type: 'SHOW WAREHOUSES', description: () => 'Show warehouses', dialects: ['Snowflake'] },
    { pattern: /^SHOW\s+(.+)/i, type: 'SHOW', description: (m) => `Show: ${m[1]}` },
    { pattern: /^DESCRIBE\s+(\S+)/i, type: 'DESCRIBE', description: (m) => `Describe table: ${m[1]}` },
    { pattern: /^DESC\s+(\S+)/i, type: 'DESCRIBE', description: (m) => `Describe table: ${m[1]}` },
    { pattern: /^EXPLAIN\s+(.+)/i, type: 'EXPLAIN', description: (m) => `Explain: ${m[1].substring(0, 50)}...` },
    { pattern: /^FLUSH\s+(.+)/i, type: 'FLUSH', description: (m) => `Flush: ${m[1]}`, dialects: ['MySQL', 'MariaDB'] },
    { pattern: /^RESET\s+(.+)/i, type: 'RESET', description: (m) => `Reset: ${m[1]}` },
    { pattern: /^PURGE\s+(.+)/i, type: 'PURGE', description: (m) => `Purge: ${m[1]}`, dialects: ['MySQL', 'MariaDB'] },
    { pattern: /^DATABASE\s+(\S+)/i, type: 'DATABASE', description: (m) => `Switch to database: ${m[1]}`, dialects: ['Teradata'] },
    { pattern: /^COMMENT\s+ON\s+(\w+)\s+(\S+)\s+IS\s+/i, type: 'COMMENT ON', description: (m) => `Comment on ${m[1]}: ${m[2]}` },
    { pattern: /^COLLECT\s+STATISTICS?\s+/i, type: 'COLLECT STATISTICS', description: () => 'Collect statistics', dialects: ['Teradata'] },
    { pattern: /^RENAME\s+(TABLE|VIEW)\s+(\S+)\s+/i, type: 'RENAME', description: (m) => `Rename ${m[1]}: ${m[2]}`, dialects: ['Teradata'] },
    { pattern: /^ASSERT\s+(.+)/i, type: 'ASSERT', description: (m) => `Assert: ${m[1]}`, dialects: ['BigQuery'] },
    { pattern: /^ADD\s+(JAR|FILE|ARCHIVE)\s+(.+)/i, type: 'ADD RESOURCE', description: (m) => `Add ${m[1]}: ${m[2]}`, dialects: ['Hive'] },
    { pattern: /^MSCK\s+REPAIR\s+TABLE\s+(\S+)/i, type: 'MSCK REPAIR', description: (m) => `Repair table: ${m[1]}`, dialects: ['Hive'] },
    { pattern: /^REFRESH\s+TABLE\s+(\S+)/i, type: 'REFRESH TABLE', description: (m) => `Refresh table: ${m[1]}`, dialects: ['Hive'] },
    { pattern: /^INVALIDATE\s+METADATA\s*(.*)/i, type: 'INVALIDATE METADATA', description: (m) => `Invalidate metadata${m[1] ? ': ' + m[1] : ''}`, dialects: ['Hive'] },
    { pattern: /^BEGIN(\s+TRANSACTION|\s+WORK|\s+TRAN)?/i, type: 'BEGIN', description: () => 'Begin transaction' },
    { pattern: /^START\s+TRANSACTION/i, type: 'START TRANSACTION', description: () => 'Start transaction' },
    { pattern: /^COMMIT(\s+TRANSACTION|\s+WORK|\s+TRAN)?/i, type: 'COMMIT', description: () => 'Commit transaction' },
    { pattern: /^ROLLBACK(\s+TRANSACTION|\s+WORK|\s+TRAN)?(\s+TO\s+SAVEPOINT\s+\S+)?/i, type: 'ROLLBACK', description: (m) => `Rollback transaction${m[2] || ''}` },
    { pattern: /^SAVEPOINT\s+(\S+)/i, type: 'SAVEPOINT', description: (m) => `Create savepoint: ${m[1]}` },
    { pattern: /^RELEASE\s+SAVEPOINT\s+(\S+)/i, type: 'RELEASE SAVEPOINT', description: (m) => `Release savepoint: ${m[1]}` },
    { pattern: /^GRANT\s+(.+)/i, type: 'GRANT', description: (m) => `Grant: ${m[1].substring(0, 50)}...` },
    { pattern: /^REVOKE\s+(.+)/i, type: 'REVOKE', description: (m) => `Revoke: ${m[1].substring(0, 50)}...` },
    { pattern: /^--.*$/i, type: 'COMMENT', description: () => 'SQL comment' },
    { pattern: /^\/\*[\s\S]*\*\/$/i, type: 'COMMENT', description: () => 'SQL block comment' },
];

export function tryParseSessionCommand(
    context: ParserContext,
    sql: string,
    genId: (prefix: string) => string
): ParseResult | null {
    const trimmedSql = stripLeadingComments(sql);

    for (const cmd of SESSION_COMMAND_PATTERNS) {
        const match = trimmedSql.match(cmd.pattern);
        if (!match || (cmd.dialects && !cmd.dialects.includes(context.dialect))) {
            continue;
        }
        {
            const nodeId = genId('session');
            const nodes: FlowNode[] = [{
                id: nodeId,
                type: 'operation' as NodeType,
                label: cmd.type,
                description: cmd.description(match),
                x: 0,
                y: 0,
                width: 200,
                height: 60,
            }];

            context.stats.complexity = 'Simple';
            context.stats.complexityScore = 1;

            return {
                nodes,
                edges: [],
                stats: { ...context.stats },
                hints: [{
                    type: 'info',
                    message: `${cmd.type} statement`,
                    suggestion: 'This is a session/utility command that sets database context or configuration.'
                }],
                sql,
                columnLineage: [],
                tableUsage: new Map(),
            };
        }
    }

    return null;
}

export function getSessionCommandInfo(sql: string, dialect: SqlDialect): { type: string; description: string } | null {
    const trimmedSql = stripLeadingComments(sql);

    for (const cmd of SESSION_COMMAND_PATTERNS) {
        const match = trimmedSql.match(cmd.pattern);
        if (!match || (cmd.dialects && !cmd.dialects.includes(dialect))) {
            continue;
        }
        {
            return {
                type: cmd.type,
                description: cmd.description(match)
            };
        }
    }

    return null;
}

export function createMergedSessionResult(
    commands: Array<{ sql: string; type: string; description: string }>,
    dialect: SqlDialect
): ParseResult {
    const context = createFreshContext(dialect);
    const combinedSql = commands.map(c => c.sql).join(';\n');
    const combinedLineCount = combinedSql.split('\n').length;

    const nodeId = 'session_0';
    const descriptions = commands.map(c => `• ${c.description}`).join('\n');
    const nodes: FlowNode[] = [{
        id: nodeId,
        type: 'operation' as NodeType,
        label: 'Session Setup',
        description: descriptions,
        x: 0,
        y: 0,
        width: 220,
        height: Math.max(60, 30 + commands.length * 20),
        startLine: 1,
        endLine: combinedLineCount,
    }];

    context.stats.complexity = 'Simple';
    context.stats.complexityScore = 1;

    return {
        nodes,
        edges: [],
        stats: { ...context.stats },
        hints: [{
            type: 'info',
            message: `${commands.length} session command${commands.length > 1 ? 's' : ''}`,
            suggestion: 'These are session/utility commands that set database context or configuration.'
        }],
        sql: combinedSql,
        columnLineage: [],
        tableUsage: new Map(),
    };
}

export function getDdlStatementInfo(sql: string): { type: string; keyword: string; objectName: string } | null {
    const trimmedSql = stripLeadingComments(sql).trim();

    const createMatch = trimmedSql.match(/^CREATE\s+(OR\s+REPLACE\s+)?(EXTERNAL\s+TABLE|TABLE|VIEW|INDEX|SCHEMA|DATABASE|FUNCTION|PROCEDURE|TRIGGER|SEQUENCE|TYPE|MATERIALIZED\s+VIEW|STAGE|STREAM|TASK|PIPE)\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
    if (createMatch) {
        const keyword = createMatch[2].toUpperCase().replace(/\s+/g, ' ');
        return {
            type: 'CREATE',
            keyword,
            objectName: createMatch[3].replace(/[`"[\]]/g, ''),
        };
    }

    const alterMatch = trimmedSql.match(/^ALTER\s+(TABLE|VIEW|INDEX|SCHEMA|DATABASE|FUNCTION|PROCEDURE)\s+([^\s(]+)/i);
    if (alterMatch) {
        return {
            type: 'ALTER',
            keyword: alterMatch[1].toUpperCase(),
            objectName: alterMatch[2].replace(/[`"[\]]/g, ''),
        };
    }

    const dropMatch = trimmedSql.match(/^DROP\s+(TABLE|VIEW|INDEX|SCHEMA|DATABASE|FUNCTION|PROCEDURE|TRIGGER|SEQUENCE|TYPE|MATERIALIZED\s+VIEW)\s+(?:IF\s+EXISTS\s+)?([^\s(;]+)/i);
    if (dropMatch) {
        const keyword = dropMatch[1].toUpperCase().replace(/\s+/g, ' ');
        return {
            type: 'DROP',
            keyword,
            objectName: dropMatch[2].replace(/[`"[\]]/g, ''),
        };
    }

    const truncateMatch = trimmedSql.match(/^TRUNCATE\s+(TABLE\s+)?([^\s(;]+)/i);
    if (truncateMatch) {
        return {
            type: 'TRUNCATE',
            keyword: 'TABLE',
            objectName: truncateMatch[2].replace(/[`"[\]]/g, ''),
        };
    }

    return null;
}

export function createMergedDdlResult(
    commands: Array<{ sql: string; type: string; keyword: string; objectName: string }>,
    dialect: SqlDialect
): ParseResult {
    const context = createFreshContext(dialect);
    const combinedSql = commands.map(c => c.sql).join(';\n');
    const combinedLineCount = combinedSql.split('\n').length;

    const groups: Record<string, string[]> = {};
    for (const cmd of commands) {
        const key = `${cmd.type} ${cmd.keyword}`;
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(cmd.objectName);
    }

    const summaryParts: string[] = [];
    for (const [key, names] of Object.entries(groups)) {
        summaryParts.push(`${names.length} ${key}${names.length > 1 ? 's' : ''}`);
    }
    const summaryLabel = summaryParts.join(', ');

    const descriptionParts: string[] = [];
    for (const [key, names] of Object.entries(groups)) {
        const objectType = key.split(' ').slice(1).join(' ');
        const plural = names.length > 1 ? 's' : '';
        descriptionParts.push(`${objectType}${plural}: ${names.join(', ')}`);
    }
    const descriptions = descriptionParts.join('\n');

    const nodes: FlowNode[] = [{
        id: 'ddl_0',
        type: 'result' as NodeType,
        label: 'Schema Changes',
        description: `${summaryLabel}\n\n${descriptions}`,
        accessMode: 'write',
        x: 0,
        y: 0,
        width: Math.min(520, Math.max(220, summaryLabel.length * 8 + 40)),
        height: Math.max(80, 40 + commands.length * 18),
        startLine: 1,
        endLine: combinedLineCount,
    }];

    context.stats.complexity = 'Simple';
    context.stats.complexityScore = commands.length;

    return {
        nodes,
        edges: [],
        stats: { ...context.stats },
        hints: [{
            type: 'info',
            message: summaryLabel,
            suggestion: `This block contains ${commands.length} DDL statement${commands.length > 1 ? 's' : ''} that change database objects.`
        }],
        sql: combinedSql,
        columnLineage: [],
        tableUsage: new Map(),
    };
}
