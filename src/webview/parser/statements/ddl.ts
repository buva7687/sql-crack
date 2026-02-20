import type {
    NodeType,
    ParseResult,
    SqlDialect,
    FlowEdge,
    FlowNode
} from '../../types';
import { createFreshContext, type ParserContext } from '../context';
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
    { pattern: /^EXEC(?:UTE)?\s+(.+)/i, type: 'EXECUTE', description: (m) => `Execute: ${m[1]}`, dialects: ['TransactSQL'] },
    { pattern: /^PRINT\s+(.+)/i, type: 'PRINT', description: (m) => `Print: ${m[1]}`, dialects: ['TransactSQL'] },
    { pattern: /^DECLARE\s+(.+)/i, type: 'DECLARE', description: (m) => `Declare: ${m[1]}` },
    { pattern: /^GO\s*$/i, type: 'GO', description: () => 'Batch separator', dialects: ['TransactSQL'] },
    { pattern: /^\\(\w+)\s*(.*)/i, type: 'PSQL COMMAND', description: (m) => `psql: \\${m[1]} ${m[2]}`, dialects: ['PostgreSQL'] },
    { pattern: /^COPY\s+(.+)/i, type: 'COPY', description: (m) => `Copy: ${m[1]}`, dialects: ['PostgreSQL'] },
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
    { pattern: /^EXPORT\s+DATA\s+(.+)/i, type: 'EXPORT DATA', description: (m) => `Export data: ${m[1]}`, dialects: ['BigQuery'] },
    { pattern: /^LOAD\s+DATA\s+(.+)/i, type: 'LOAD DATA', description: (m) => `Load data: ${m[1]}` },
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
        if (match) {
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

export function getSessionCommandInfo(sql: string): { type: string; description: string } | null {
    const trimmedSql = stripLeadingComments(sql);

    for (const cmd of SESSION_COMMAND_PATTERNS) {
        const match = trimmedSql.match(cmd.pattern);
        if (match) {
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

    const createMatch = trimmedSql.match(/^CREATE\s+(OR\s+REPLACE\s+)?(TABLE|VIEW|INDEX|SCHEMA|DATABASE|FUNCTION|PROCEDURE|TRIGGER|SEQUENCE|TYPE|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
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
        label: 'Schema Definition',
        description: `${summaryLabel}\n\n${descriptions}`,
        accessMode: 'write',
        x: 0,
        y: 0,
        width: Math.max(220, summaryLabel.length * 8 + 40),
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
            suggestion: `This block contains ${commands.length} DDL statement${commands.length > 1 ? 's' : ''} defining database schema.`
        }],
        sql: combinedSql,
        columnLineage: [],
        tableUsage: new Map(),
    };
}
