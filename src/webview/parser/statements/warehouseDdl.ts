import { Parser } from 'node-sql-parser';
import type { FlowEdge, FlowNode, ParseResult, QueryStats } from '../../types';
import type { ParserContext } from '../context';
import { findMatchingParen, maskStringsAndComments, stripSqlComments } from '../dialects/preprocessing';

type GenIdFn = (prefix: string) => string;
type ProcessSelectFn = (
    context: ParserContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[]
) => string | null;

interface TryParseWarehouseDdlArgs {
    context: ParserContext;
    sql: string;
    genId: GenIdFn;
    processSelect: ProcessSelectFn;
}

const IDENTIFIER_WRAPPER_PATTERN = /[`"'\[\]]/g;

function normalizeIdentifier(raw: string): string {
    return raw.replace(IDENTIFIER_WRAPPER_PATTERN, '').trim();
}

function splitTopLevelComma(input: string): string[] {
    const parts: string[] = [];
    let depthParen = 0;
    let depthBracket = 0;
    let current = '';

    for (let index = 0; index < input.length; index++) {
        const char = input[index];
        if (char === '(') {
            depthParen++;
            current += char;
            continue;
        }
        if (char === ')') {
            depthParen = Math.max(0, depthParen - 1);
            current += char;
            continue;
        }
        if (char === '[') {
            depthBracket++;
            current += char;
            continue;
        }
        if (char === ']') {
            depthBracket = Math.max(0, depthBracket - 1);
            current += char;
            continue;
        }
        if (char === ',' && depthParen === 0 && depthBracket === 0) {
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

function createFlowEdge(genId: GenIdFn, source: string, target: string, sqlClause?: string): FlowEdge {
    return {
        id: genId('e'),
        source,
        target,
        sqlClause,
        clauseType: 'flow',
    };
}

function buildStats(context: ParserContext, edges: FlowEdge[]): QueryStats {
    const tables = context.tableUsageMap.size;
    const complexityScore = Math.max(2, tables + edges.length);
    const complexity: QueryStats['complexity'] = complexityScore >= 8 ? 'Moderate' : 'Simple';

    return {
        ...context.stats,
        tables,
        complexity,
        complexityScore,
    };
}

function trackObject(context: ParserContext, objectName: string): void {
    if (!objectName) {
        return;
    }
    const key = objectName.toLowerCase();
    context.tableUsageMap.set(key, (context.tableUsageMap.get(key) || 0) + 1);
}

function createTargetNode(
    context: ParserContext,
    nodes: FlowNode[],
    genId: GenIdFn,
    label: string,
    description: string,
    operationType: FlowNode['operationType']
): string {
    trackObject(context, label);
    const id = genId('table');
    nodes.push({
        id,
        type: 'table',
        label,
        description,
        accessMode: 'write',
        operationType,
        x: 0,
        y: 0,
        width: Math.min(240, Math.max(150, label.length * 10 + 36)),
        height: 60,
    });
    return id;
}

function createSourceNode(
    nodes: FlowNode[],
    genId: GenIdFn,
    label: string,
    description: string,
    details?: string[]
): string {
    const id = genId('source');
    nodes.push({
        id,
        type: 'operation',
        label,
        description,
        details,
        accessMode: 'read',
        x: 0,
        y: 0,
        width: Math.min(280, Math.max(160, label.length * 8 + 40)),
        height: 60,
    });
    return id;
}

function createResultNode(
    nodes: FlowNode[],
    rootId: string,
    label: string,
    description: string,
    details: string[],
    operationType: FlowNode['operationType']
): void {
    nodes.push({
        id: rootId,
        type: 'result',
        label,
        description,
        details: details.length > 0 ? details : undefined,
        accessMode: 'write',
        operationType,
        x: 0,
        y: 0,
        width: Math.min(440, Math.max(180, label.length * 10 + 40)),
        height: 60,
    });
}

function findTopLevelKeywordIndex(maskedSql: string, keyword: string, startIndex = 0): number {
    const upperKeyword = keyword.toUpperCase();
    let depth = 0;
    let bracketDepth = 0;

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
        if (char === '[') {
            bracketDepth++;
            continue;
        }
        if (char === ']') {
            bracketDepth = Math.max(0, bracketDepth - 1);
            continue;
        }
        if (depth !== 0 || bracketDepth !== 0) {
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

function extractParenthesizedSection(sql: string, searchToken: string): string | null {
    const masked = maskStringsAndComments(sql);
    const tokenIndex = findTopLevelKeywordIndex(masked, searchToken);
    if (tokenIndex === -1) {
        return null;
    }
    const openParen = sql.indexOf('(', tokenIndex + searchToken.length);
    if (openParen === -1) {
        return null;
    }
    const closeParen = findMatchingParen(sql, openParen);
    if (closeParen === -1) {
        return null;
    }
    return sql.slice(openParen + 1, closeParen).trim();
}

function extractFirstParenContentAfterIndex(sql: string, startIndex: number): string | null {
    const openParen = sql.indexOf('(', startIndex);
    if (openParen === -1) {
        return null;
    }
    const closeParen = findMatchingParen(sql, openParen);
    if (closeParen === -1) {
        return null;
    }
    return sql.slice(openParen + 1, closeParen).trim();
}

function parseAssignmentOptions(content: string): string[] {
    return splitTopLevelComma(content).map(part => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function extractQuotedValues(input: string): string[] {
    return Array.from(input.matchAll(/'([^']+)'|"([^"]+)"/g)).map(match => match[1] || match[2]).filter(Boolean);
}

function createQueryResultNode(nodes: FlowNode[], genId: GenIdFn, label: string, description: string, details: string[] = []): string {
    const id = genId('stmt');
    nodes.push({
        id,
        type: 'result',
        label,
        description,
        details: details.length > 0 ? details : undefined,
        accessMode: 'write',
        operationType: 'CREATE_TABLE_AS',
        x: 0,
        y: 0,
        width: Math.min(440, Math.max(180, label.length * 10 + 40)),
        height: 60,
    });
    return id;
}

function parseSelectAst(selectSql: string, dialect: ParserContext['dialect']): any | null {
    const parser = new Parser();
    const parserDialect = dialect === 'Oracle'
        ? 'PostgreSQL'
        : dialect === 'Teradata'
            ? 'MySQL'
            : dialect;

    try {
        return parser.astify(selectSql, { database: parserDialect });
    } catch {
        if (dialect === 'Redshift') {
            try {
                return parser.astify(selectSql, { database: 'PostgreSQL' });
            } catch {
                return null;
            }
        }
        return null;
    }
}

function attachQuerySource(
    args: TryParseWarehouseDdlArgs,
    querySql: string,
    nodes: FlowNode[],
    edges: FlowEdge[]
): string {
    const ast = parseSelectAst(querySql, args.context.dialect);
    if (ast) {
        const selectStmt = Array.isArray(ast) ? ast[0] : ast;
        const previousType = args.context.statementType;
        args.context.statementType = 'select';
        const rootId = args.processSelect(args.context, selectStmt, nodes, edges);
        args.context.statementType = previousType;
        if (rootId) {
            return rootId;
        }
    }

    const approxNodeId = args.genId('source');
    nodes.push({
        id: approxNodeId,
        type: 'operation',
        label: 'SELECT',
        description: 'Approximated source query',
        details: [querySql.replace(/\s+/g, ' ').slice(0, 140)],
        accessMode: 'read',
        x: 0,
        y: 0,
        width: 220,
        height: 60,
    });
    return approxNodeId;
}

function buildExternalTableResult(
    args: TryParseWarehouseDdlArgs,
    objectType: 'EXTERNAL TABLE' | 'TABLE',
    tableName: string,
    description: string,
    details: string[],
    locationValues: string[],
    hintMessage: string
): ParseResult {
    const { context, sql, genId } = args;
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const rootId = genId('stmt');
    const targetId = createTargetNode(context, nodes, genId, tableName, description, 'CREATE_TABLE');

    if (locationValues.length > 0) {
        const sourceLabel = locationValues.length === 1 ? locationValues[0] : `${locationValues.length} external sources`;
        const sourceDetails = locationValues.length > 1 ? locationValues : undefined;
        const sourceId = createSourceNode(nodes, genId, sourceLabel, 'External data location', sourceDetails);
        edges.push(createFlowEdge(genId, sourceId, targetId, 'LOCATION'));
    }

    createResultNode(
        nodes,
        rootId,
        `CREATE ${objectType} ${tableName}`,
        description,
        details,
        'CREATE_TABLE'
    );
    edges.push(createFlowEdge(genId, targetId, rootId, 'CREATE'));

    context.hints.push({
        type: 'info',
        message: hintMessage,
        suggestion: 'This warehouse/external DDL form is modeled through a compatibility parser.',
        category: 'best-practice',
        severity: 'low',
    });

    return {
        nodes,
        edges,
        stats: buildStats(context, edges),
        hints: [...context.hints],
        sql,
        columnLineage: [],
        tableUsage: new Map(context.tableUsageMap),
    };
}

function tryParseHiveExternalTable(args: TryParseWarehouseDdlArgs): ParseResult | null {
    const { context, sql } = args;
    if (!['Hive', 'Athena'].includes(context.dialect)) {
        return null;
    }

    const stripped = stripSqlComments(sql).trim();
    const match = stripped.match(/^CREATE\s+EXTERNAL\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
    if (!match) {
        return null;
    }

    const tableName = normalizeIdentifier(match[1]);
    const matchStart = match.index ?? stripped.indexOf(match[0]);
    const columnSection = extractFirstParenContentAfterIndex(stripped, matchStart + match[0].length);
    const locationMatch = stripped.match(/\bLOCATION\s+(['"])(.+?)\1/i);
    const storedAsMatch = stripped.match(/\bSTORED\s+AS\s+([A-Z_]+)/i);
    const rowFormatMatch = stripped.match(/\bROW\s+FORMAT\s+([A-Z\s]+)/i);
    const tblProperties = extractParenthesizedSection(stripped, 'TBLPROPERTIES');

    const columnCount = columnSection ? splitTopLevelComma(columnSection).length : 0;
    const details = [
        columnCount > 0 ? `Columns: ${columnCount}` : '',
        storedAsMatch ? `Format: ${storedAsMatch[1].toUpperCase()}` : '',
        rowFormatMatch ? `Row format: ${rowFormatMatch[1].trim().replace(/\s+/g, ' ')}` : '',
        locationMatch ? `Location: ${locationMatch[2]}` : '',
        tblProperties ? `TBLPROPERTIES: ${parseAssignmentOptions(tblProperties).slice(0, 3).join(', ')}` : '',
    ].filter(Boolean);

    return buildExternalTableResult(
        args,
        'EXTERNAL TABLE',
        tableName,
        `Create external table: ${tableName}`,
        details,
        locationMatch ? [locationMatch[2]] : [],
        `Parsed ${context.dialect} CREATE EXTERNAL TABLE via compatibility parser`
    );
}

function tryParseRedshiftExternalTable(args: TryParseWarehouseDdlArgs): ParseResult | null {
    const { context, sql } = args;
    if (context.dialect !== 'Redshift') {
        return null;
    }

    const stripped = stripSqlComments(sql).trim();
    const match = stripped.match(/^CREATE\s+EXTERNAL\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
    if (!match) {
        return null;
    }

    const tableName = normalizeIdentifier(match[1]);
    const matchStart = match.index ?? stripped.indexOf(match[0]);
    const columnSection = extractFirstParenContentAfterIndex(stripped, matchStart + match[0].length);
    const storedAsMatch = stripped.match(/\bSTORED\s+AS\s+([A-Z_]+)/i);
    const locationMatch = stripped.match(/\bLOCATION\s+(['"])(.+?)\1/i);
    const partitionMatch = stripped.match(/\bPARTITIONED\s+BY\s*\(([\s\S]*?)\)/i);
    const columnCount = columnSection ? splitTopLevelComma(columnSection).length : 0;
    const partitionCount = partitionMatch ? splitTopLevelComma(partitionMatch[1]).length : 0;
    const details = [
        columnCount > 0 ? `Columns: ${columnCount}` : '',
        partitionCount > 0 ? `Partitions: ${partitionCount}` : '',
        storedAsMatch ? `Format: ${storedAsMatch[1].toUpperCase()}` : '',
        locationMatch ? `Location: ${locationMatch[2]}` : '',
    ].filter(Boolean);

    return buildExternalTableResult(
        args,
        'EXTERNAL TABLE',
        tableName,
        `Create external table: ${tableName}`,
        details,
        locationMatch ? [locationMatch[2]] : [],
        'Parsed Redshift CREATE EXTERNAL TABLE via compatibility parser'
    );
}

function tryParseBigQueryExternalTable(args: TryParseWarehouseDdlArgs): ParseResult | null {
    const { context, sql } = args;
    if (context.dialect !== 'BigQuery') {
        return null;
    }

    const stripped = stripSqlComments(sql).trim();
    const match = stripped.match(/^CREATE\s+EXTERNAL\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
    if (!match) {
        return null;
    }

    const tableName = normalizeIdentifier(match[1]);
    const optionsBlock = extractParenthesizedSection(stripped, 'OPTIONS');
    const optionList = optionsBlock ? parseAssignmentOptions(optionsBlock) : [];
    const formatMatch = optionsBlock?.match(/\bformat\s*=\s*(['"])(.+?)\1/i);
    const urisMatch = optionsBlock?.match(/\buris\s*=\s*\[([\s\S]+?)\]/i);
    const uriValues = urisMatch ? extractQuotedValues(urisMatch[1]) : [];

    const details = [
        formatMatch ? `Format: ${formatMatch[2]}` : '',
        optionList.length > 0 ? `Options: ${optionList.slice(0, 3).join(', ')}` : '',
    ].filter(Boolean);

    return buildExternalTableResult(
        args,
        'EXTERNAL TABLE',
        tableName,
        `Create external table: ${tableName}`,
        details,
        uriValues,
        'Parsed BigQuery CREATE EXTERNAL TABLE via compatibility parser'
    );
}

function tryParseTrinoCreateTableWith(args: TryParseWarehouseDdlArgs): ParseResult | null {
    const { context, sql } = args;
    if (context.dialect !== 'Trino') {
        return null;
    }

    const stripped = stripSqlComments(sql).trim();
    const match = stripped.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
    if (!match || !/\bWITH\s*\(/i.test(stripped)) {
        return null;
    }

    const tableName = normalizeIdentifier(match[1]);
    const withBlock = extractParenthesizedSection(stripped, 'WITH');
    if (!withBlock) {
        return null;
    }

    const optionList = parseAssignmentOptions(withBlock);
    const locationMatch = withBlock.match(/\b(?:external_location|location)\s*=\s*(['"])(.+?)\1/i);
    const details = [`WITH: ${optionList.slice(0, 4).join(', ')}`].filter(Boolean);

    return buildExternalTableResult(
        args,
        'TABLE',
        tableName,
        `Create Trino table: ${tableName}`,
        details,
        locationMatch ? [locationMatch[2]] : [],
        'Parsed Trino CREATE TABLE ... WITH (...) via compatibility parser'
    );
}

function tryParseSnowflakeStage(args: TryParseWarehouseDdlArgs): ParseResult | null {
    const { context, sql, genId } = args;
    if (context.dialect !== 'Snowflake') {
        return null;
    }

    const stripped = stripSqlComments(sql).trim();
    const match = stripped.match(/^CREATE\s+(?:OR\s+REPLACE\s+)?STAGE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
    if (!match) {
        return null;
    }

    const stageName = normalizeIdentifier(match[1]);
    const urlMatch = stripped.match(/\bURL\s*=\s*(['"])(.+?)\1/i);
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const rootId = genId('stmt');
    const targetId = createTargetNode(context, nodes, genId, stageName, 'Stage object', 'CREATE_OBJECT');

    if (urlMatch) {
        const sourceId = createSourceNode(nodes, genId, urlMatch[2], 'External stage URL');
        edges.push(createFlowEdge(genId, sourceId, targetId, 'URL'));
    }

    createResultNode(
        nodes,
        rootId,
        `CREATE STAGE ${stageName}`,
        `Create stage: ${stageName}`,
        urlMatch ? [`URL: ${urlMatch[2]}`] : [],
        'CREATE_OBJECT'
    );
    edges.push(createFlowEdge(genId, targetId, rootId, 'CREATE'));
    context.hints.push({
        type: 'info',
        message: 'Parsed Snowflake CREATE STAGE via compatibility parser',
        suggestion: 'Snowflake stage DDL is modeled through a compatibility parser.',
        category: 'best-practice',
        severity: 'low',
    });

    return {
        nodes,
        edges,
        stats: buildStats(context, edges),
        hints: [...context.hints],
        sql,
        columnLineage: [],
        tableUsage: new Map(context.tableUsageMap),
    };
}

function tryParseSnowflakeStream(args: TryParseWarehouseDdlArgs): ParseResult | null {
    const { context, sql, genId } = args;
    if (context.dialect !== 'Snowflake') {
        return null;
    }

    const stripped = stripSqlComments(sql).trim();
    const match = stripped.match(/^CREATE\s+(?:OR\s+REPLACE\s+)?STREAM\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s+ON\s+(TABLE|VIEW)\s+([^\s(;]+)/i);
    if (!match) {
        return null;
    }

    const streamName = normalizeIdentifier(match[1]);
    const sourceKind = match[2].toUpperCase();
    const sourceName = normalizeIdentifier(match[3]);
    trackObject(context, sourceName);

    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const rootId = genId('stmt');
    const sourceId = genId('table');
    nodes.push({
        id: sourceId,
        type: 'table',
        label: sourceName,
        description: `${sourceKind.toLowerCase()} source`,
        accessMode: 'read',
        x: 0,
        y: 0,
        width: Math.min(220, Math.max(140, sourceName.length * 10 + 36)),
        height: 60,
    });
    const targetId = createTargetNode(context, nodes, genId, streamName, 'Stream object', 'CREATE_OBJECT');
    edges.push(createFlowEdge(genId, sourceId, targetId, `ON ${sourceKind}`));

    createResultNode(
        nodes,
        rootId,
        `CREATE STREAM ${streamName}`,
        `Create stream: ${streamName}`,
        [`Source: ${sourceKind} ${sourceName}`],
        'CREATE_OBJECT'
    );
    edges.push(createFlowEdge(genId, targetId, rootId, 'CREATE'));
    context.hints.push({
        type: 'info',
        message: 'Parsed Snowflake CREATE STREAM via compatibility parser',
        suggestion: 'Snowflake stream DDL is modeled through a compatibility parser.',
        category: 'best-practice',
        severity: 'low',
    });

    return {
        nodes,
        edges,
        stats: buildStats(context, edges),
        hints: [...context.hints],
        sql,
        columnLineage: [],
        tableUsage: new Map(context.tableUsageMap),
    };
}

function tryParseSnowflakeTask(args: TryParseWarehouseDdlArgs): ParseResult | null {
    const { context, sql, genId } = args;
    if (context.dialect !== 'Snowflake') {
        return null;
    }

    const stripped = stripSqlComments(sql).trim();
    const match = stripped.match(/^CREATE\s+(?:OR\s+REPLACE\s+)?TASK\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
    if (!match) {
        return null;
    }

    const taskName = normalizeIdentifier(match[1]);
    const warehouseMatch = stripped.match(/\bWAREHOUSE\s*=\s*([^\s]+)/i);
    const scheduleMatch = stripped.match(/\bSCHEDULE\s*=\s*(['"])(.+?)\1/i);
    const asIndex = findTopLevelKeywordIndex(maskStringsAndComments(stripped), 'AS');
    const body = asIndex === -1 ? '' : stripped.slice(asIndex + 2).trim();
    const details = [
        warehouseMatch ? `Warehouse: ${normalizeIdentifier(warehouseMatch[1])}` : '',
        scheduleMatch ? `Schedule: ${scheduleMatch[2]}` : '',
        body ? `Body: ${body.replace(/\s+/g, ' ').slice(0, 120)}` : '',
    ].filter(Boolean);

    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const rootId = genId('stmt');
    const targetId = createTargetNode(context, nodes, genId, taskName, 'Task object', 'CREATE_OBJECT');
    createResultNode(
        nodes,
        rootId,
        `CREATE TASK ${taskName}`,
        `Create task: ${taskName}`,
        details,
        'CREATE_OBJECT'
    );
    edges.push(createFlowEdge(genId, targetId, rootId, 'CREATE'));
    context.hints.push({
        type: 'info',
        message: 'Parsed Snowflake CREATE TASK via compatibility parser',
        suggestion: 'Task metadata is modeled directly; task body SQL is summarized in details.',
        category: 'best-practice',
        severity: 'low',
    });

    return {
        nodes,
        edges,
        stats: buildStats(context, edges),
        hints: [...context.hints],
        sql,
        columnLineage: [],
        tableUsage: new Map(context.tableUsageMap),
    };
}

function tryParseRedshiftCreateTable(args: TryParseWarehouseDdlArgs): ParseResult | null {
    const { context, sql } = args;
    if (context.dialect !== 'Redshift') {
        return null;
    }

    const stripped = stripSqlComments(sql).trim();
    const match = stripped.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
    if (!match || !/\bDISTKEY\b|\bSORTKEY\b|\bDISTSTYLE\b/i.test(stripped)) {
        return null;
    }

    const tableName = normalizeIdentifier(match[1]);
    const matchStart = match.index ?? stripped.indexOf(match[0]);
    const columnSection = extractFirstParenContentAfterIndex(stripped, matchStart + match[0].length);
    const columnCount = columnSection ? splitTopLevelComma(columnSection).length : 0;
    const distkeyMatch = stripped.match(/\bDISTKEY\s*\(([^)]+)\)/i);
    const sortkeyMatch = stripped.match(/\b(?:COMPOUND\s+|INTERLEAVED\s+)?SORTKEY\s*\(([^)]+)\)/i);
    const diststyleMatch = stripped.match(/\bDISTSTYLE\s+([A-Z]+)/i);
    const details = [
        columnCount > 0 ? `Columns: ${columnCount}` : '',
        diststyleMatch ? `DISTSTYLE: ${diststyleMatch[1].toUpperCase()}` : '',
        distkeyMatch ? `DISTKEY: ${distkeyMatch[1].trim()}` : '',
        sortkeyMatch ? `SORTKEY: ${sortkeyMatch[1].trim()}` : '',
    ].filter(Boolean);

    return buildExternalTableResult(
        args,
        'TABLE',
        tableName,
        `Create Redshift table: ${tableName}`,
        details,
        [],
        'Parsed Redshift CREATE TABLE with physical options via compatibility parser'
    );
}

function tryParseRedshiftCreateTableAs(args: TryParseWarehouseDdlArgs): ParseResult | null {
    const { context, sql, genId } = args;
    if (context.dialect !== 'Redshift') {
        return null;
    }

    const stripped = stripSqlComments(sql).trim();
    const match = stripped.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
    if (!match) {
        return null;
    }

    const headerEnd = (match.index ?? stripped.indexOf(match[0])) + match[0].length;
    const masked = maskStringsAndComments(stripped);
    const asIndex = findTopLevelKeywordIndex(masked, 'AS', headerEnd);
    if (asIndex === -1) {
        return null;
    }

    const querySql = stripped.slice(asIndex + 'AS'.length).trim();
    if (!/^(SELECT|WITH|\(SELECT|\(WITH)\b/i.test(querySql)) {
        return null;
    }

    const optionsSegment = stripped.slice(headerEnd, asIndex);
    if (!/\bDISTSTYLE\b|\bDISTKEY\s*\(|\b(?:COMPOUND\s+|INTERLEAVED\s+)?SORTKEY\s*\(/i.test(optionsSegment)) {
        return null;
    }

    const tableName = normalizeIdentifier(match[1]);
    const distkeyMatch = optionsSegment.match(/\bDISTKEY\s*\(([^)]+)\)/i);
    const sortkeyMatch = optionsSegment.match(/\b(?:COMPOUND\s+|INTERLEAVED\s+)?SORTKEY\s*\(([^)]+)\)/i);
    const diststyleMatch = optionsSegment.match(/\bDISTSTYLE\s+([A-Z]+)/i);
    const details = [
        diststyleMatch ? `DISTSTYLE: ${diststyleMatch[1].toUpperCase()}` : '',
        distkeyMatch ? `DISTKEY: ${distkeyMatch[1].trim()}` : '',
        sortkeyMatch ? `SORTKEY: ${sortkeyMatch[1].trim()}` : '',
    ].filter(Boolean);

    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const sourceRootId = attachQuerySource(args, querySql, nodes, edges);
    const targetId = createTargetNode(context, nodes, genId, tableName, 'CTAS target table', 'CREATE_TABLE_AS');
    const resultId = createQueryResultNode(
        nodes,
        genId,
        `TABLE ${tableName}`,
        `Create table as select: ${tableName}`,
        details
    );

    edges.push(createFlowEdge(genId, sourceRootId, targetId, 'AS SELECT'));
    edges.push(createFlowEdge(genId, targetId, resultId, 'CREATE'));

    context.hints.push({
        type: 'info',
        message: 'Parsed Redshift CREATE TABLE AS with physical options via compatibility parser',
        suggestion: 'Redshift CTAS distribution/sort options are preserved while the SELECT source flow is modeled separately.',
        category: 'best-practice',
        severity: 'low',
    });

    return {
        nodes,
        edges,
        stats: buildStats(context, edges),
        hints: [...context.hints],
        sql,
        columnLineage: [],
        tableUsage: new Map(context.tableUsageMap),
    };
}

export function tryParseWarehouseDdlStatement(args: TryParseWarehouseDdlArgs): ParseResult | null {
    return tryParseHiveExternalTable(args)
        || tryParseRedshiftExternalTable(args)
        || tryParseBigQueryExternalTable(args)
        || tryParseTrinoCreateTableWith(args)
        || tryParseSnowflakeStage(args)
        || tryParseSnowflakeStream(args)
        || tryParseSnowflakeTask(args)
        || tryParseRedshiftCreateTableAs(args)
        || tryParseRedshiftCreateTable(args);
}
