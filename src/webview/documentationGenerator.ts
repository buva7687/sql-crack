/**
 * Documentation Generator
 * Automatically generates human-readable documentation for SQL queries
 */

export interface QueryDocumentation {
    summary: string;
    purpose: string;
    tables: TableInfo[];
    joins: JoinInfo[];
    filters: FilterInfo[];
    aggregations: AggregationInfo[];
    ordering: OrderingInfo[];
    complexity: string;
    warnings: string[];
    dataFlow: string[];
}

export interface TableInfo {
    name: string;
    alias?: string;
    role: 'source' | 'joined' | 'updated' | 'deleted';
}

export interface JoinInfo {
    type: string;
    leftTable: string;
    rightTable: string;
    condition: string;
}

export interface FilterInfo {
    column: string;
    operator: string;
    value: string;
    description: string;
}

export interface AggregationInfo {
    function: string;
    column: string;
    alias?: string;
}

export interface OrderingInfo {
    column: string;
    direction: 'ASC' | 'DESC';
}

/**
 * Generate comprehensive documentation for a SQL query
 */
export function generateDocumentation(sqlCode: string, ast: any): QueryDocumentation {
    const doc: QueryDocumentation = {
        summary: '',
        purpose: '',
        tables: [],
        joins: [],
        filters: [],
        aggregations: [],
        ordering: [],
        complexity: 'Simple',
        warnings: [],
        dataFlow: []
    };

    try {
        // Determine query type and generate summary
        if (ast.type === 'select') {
            doc.summary = generateSelectSummary(ast);
            doc.purpose = 'Retrieve data from the database';
            extractSelectDetails(ast, doc);
        } else if (ast.type === 'insert') {
            doc.summary = generateInsertSummary(ast);
            doc.purpose = 'Add new records to the database';
            extractInsertDetails(ast, doc);
        } else if (ast.type === 'update') {
            doc.summary = generateUpdateSummary(ast);
            doc.purpose = 'Modify existing records in the database';
            extractUpdateDetails(ast, doc);
        } else if (ast.type === 'delete') {
            doc.summary = generateDeleteSummary(ast);
            doc.purpose = 'Remove records from the database';
            extractDeleteDetails(ast, doc);
        }

        // Generate data flow description
        doc.dataFlow = generateDataFlow(doc);

        // Assess complexity
        doc.complexity = assessComplexity(doc);

    } catch (error) {
        console.error('Error generating documentation:', error);
        doc.summary = 'Unable to generate documentation';
        doc.purpose = 'Query analysis failed';
    }

    return doc;
}

function generateSelectSummary(ast: any): string {
    const parts: string[] = [];

    // Column selection
    if (ast.columns === '*' || (Array.isArray(ast.columns) && ast.columns.some((c: any) => c.expr?.column === '*'))) {
        parts.push('Select all columns');
    } else if (ast.columns && ast.columns.length > 0) {
        const colCount = ast.columns.length;
        parts.push(`Select ${colCount} column${colCount > 1 ? 's' : ''}`);
    }

    // From clause
    if (ast.from && ast.from.length > 0) {
        const tableCount = ast.from.length;
        parts.push(`from ${tableCount} table${tableCount > 1 ? 's' : ''}`);
    }

    // Joins
    const joinCount = countJoins(ast);
    if (joinCount > 0) {
        parts.push(`with ${joinCount} join${joinCount > 1 ? 's' : ''}`);
    }

    // CTEs
    if (ast.with && ast.with.length > 0) {
        parts.push(`using ${ast.with.length} CTE${ast.with.length > 1 ? 's' : ''}`);
    }

    // Aggregations
    if (ast.groupby || hasAggregations(ast)) {
        parts.push('with aggregations');
    }

    return parts.join(' ');
}

function generateInsertSummary(ast: any): string {
    const tableName = ast.table?.[0]?.table || 'table';
    const columnCount = ast.columns?.length || 0;
    return `Insert ${columnCount > 0 ? columnCount + ' columns' : 'data'} into ${tableName}`;
}

function generateUpdateSummary(ast: any): string {
    const tableName = ast.table?.[0]?.table || 'table';
    const setCount = ast.set?.length || 0;
    return `Update ${setCount} column${setCount > 1 ? 's' : ''} in ${tableName}`;
}

function generateDeleteSummary(ast: any): string {
    const tableName = ast.from?.[0]?.table || 'table';
    return `Delete records from ${tableName}`;
}

function extractSelectDetails(ast: any, doc: QueryDocumentation): void {
    // Extract tables
    if (ast.from) {
        ast.from.forEach((from: any) => {
            if (from.table) {
                doc.tables.push({
                    name: from.table,
                    alias: from.as,
                    role: 'source'
                });
            }
            // Extract joins
            if (from.join) {
                extractJoins(from, doc);
            }
        });
    }

    // Extract WHERE filters
    if (ast.where) {
        extractFilters(ast.where, doc);
    }

    // Extract aggregations
    if (ast.columns) {
        extractAggregations(ast.columns, doc);
    }

    // Extract GROUP BY
    if (ast.groupby) {
        doc.warnings.push('Uses GROUP BY - ensure indexes exist on grouping columns');
    }

    // Extract ORDER BY
    if (ast.orderby) {
        ast.orderby.forEach((order: any) => {
            doc.ordering.push({
                column: order.expr?.column || 'unknown',
                direction: order.type?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
            });
        });
    }

    // Check for LIMIT
    if (!ast.limit) {
        doc.warnings.push('No LIMIT clause - query may return large result sets');
    }
}

function extractInsertDetails(ast: any, doc: QueryDocumentation): void {
    if (ast.table?.[0]) {
        doc.tables.push({
            name: ast.table[0].table,
            alias: ast.table[0].as,
            role: 'updated'
        });
    }
}

function extractUpdateDetails(ast: any, doc: QueryDocumentation): void {
    if (ast.table?.[0]) {
        doc.tables.push({
            name: ast.table[0].table,
            alias: ast.table[0].as,
            role: 'updated'
        });
    }

    if (ast.where) {
        extractFilters(ast.where, doc);
    } else {
        doc.warnings.push('No WHERE clause - will update ALL records in the table!');
    }
}

function extractDeleteDetails(ast: any, doc: QueryDocumentation): void {
    if (ast.from?.[0]) {
        doc.tables.push({
            name: ast.from[0].table,
            alias: ast.from[0].as,
            role: 'deleted'
        });
    }

    if (ast.where) {
        extractFilters(ast.where, doc);
    } else {
        doc.warnings.push('No WHERE clause - will delete ALL records from the table!');
    }
}

function extractJoins(from: any, doc: QueryDocumentation): void {
    if (!from.join) return;

    const joinType = from.join.toUpperCase();
    const rightTable = from.table;
    const condition = from.on ? stringifyCondition(from.on) : 'unknown';

    // Find left table (previous table in the chain)
    const leftTable = doc.tables.length > 0 ? doc.tables[doc.tables.length - 1].name : 'previous';

    doc.joins.push({
        type: joinType,
        leftTable,
        rightTable,
        condition
    });

    if (from.table) {
        doc.tables.push({
            name: from.table,
            alias: from.as,
            role: 'joined'
        });
    }
}

function extractFilters(where: any, doc: QueryDocumentation): void {
    if (!where) return;

    try {
        const filterDesc = describeCondition(where);
        if (filterDesc) {
            doc.filters.push({
                column: 'various',
                operator: where.operator || 'unknown',
                value: 'see condition',
                description: filterDesc
            });
        }
    } catch (error) {
        doc.filters.push({
            column: 'unknown',
            operator: 'unknown',
            value: 'unknown',
            description: 'Complex filtering condition'
        });
    }
}

function extractAggregations(columns: any[], doc: QueryDocumentation): void {
    if (!Array.isArray(columns)) return;

    columns.forEach((col: any) => {
        if (col.expr?.type === 'aggr_func') {
            doc.aggregations.push({
                function: col.expr.name?.toUpperCase() || 'UNKNOWN',
                column: col.expr.args?.expr?.column || '*',
                alias: col.as
            });
        }
    });
}

function countJoins(ast: any): number {
    if (!ast.from) return 0;
    return ast.from.filter((f: any) => f.join).length;
}

function hasAggregations(ast: any): boolean {
    if (!ast.columns || !Array.isArray(ast.columns)) return false;
    return ast.columns.some((c: any) => c.expr?.type === 'aggr_func');
}

function stringifyCondition(condition: any): string {
    if (!condition) return 'unknown';
    if (condition.left && condition.right) {
        return `${condition.left.column || condition.left.table} ${condition.operator} ${condition.right.column || condition.right.value}`;
    }
    return 'complex condition';
}

function describeCondition(condition: any): string {
    if (!condition) return '';

    if (condition.operator === 'AND') {
        const left = describeCondition(condition.left);
        const right = describeCondition(condition.right);
        return `${left} AND ${right}`;
    }

    if (condition.operator === 'OR') {
        const left = describeCondition(condition.left);
        const right = describeCondition(condition.right);
        return `${left} OR ${right}`;
    }

    if (condition.left && condition.right) {
        const leftCol = condition.left.column || condition.left.table || 'column';
        const op = condition.operator || '=';
        const rightVal = condition.right.column || condition.right.value || 'value';
        return `${leftCol} ${op} ${rightVal}`;
    }

    return 'complex condition';
}

function generateDataFlow(doc: QueryDocumentation): string[] {
    const flow: string[] = [];

    // Start with source tables
    const sourceTables = doc.tables.filter(t => t.role === 'source');
    if (sourceTables.length > 0) {
        flow.push(`1. Data is retrieved from: ${sourceTables.map(t => t.name).join(', ')}`);
    }

    // Joins
    if (doc.joins.length > 0) {
        flow.push(`2. Tables are joined using ${doc.joins.length} join operation${doc.joins.length > 1 ? 's' : ''}`);
        doc.joins.forEach((join, idx) => {
            flow.push(`   - ${join.type} JOIN ${join.rightTable} on ${join.condition}`);
        });
    }

    // Filters
    if (doc.filters.length > 0) {
        flow.push(`${flow.length + 1}. Filters are applied to reduce the result set`);
    }

    // Aggregations
    if (doc.aggregations.length > 0) {
        flow.push(`${flow.length + 1}. Data is aggregated using ${doc.aggregations.map(a => a.function).join(', ')}`);
    }

    // Ordering
    if (doc.ordering.length > 0) {
        flow.push(`${flow.length + 1}. Results are sorted by ${doc.ordering.map(o => `${o.column} ${o.direction}`).join(', ')}`);
    }

    // Final result
    if (sourceTables.length > 0) {
        flow.push(`${flow.length + 1}. Final result set is returned to the caller`);
    }

    return flow;
}

function assessComplexity(doc: QueryDocumentation): string {
    let score = 0;

    // Base score from table count
    score += doc.tables.length * 2;

    // Joins add significant complexity
    score += doc.joins.length * 5;

    // Aggregations
    score += doc.aggregations.length * 3;

    // Filters
    score += doc.filters.length * 2;

    if (score < 10) return 'Simple';
    if (score < 25) return 'Moderate';
    if (score < 40) return 'Complex';
    return 'Very Complex';
}

/**
 * Export documentation as markdown
 */
export function exportAsMarkdown(doc: QueryDocumentation, sqlCode: string): string {
    const lines: string[] = [];

    lines.push('# SQL Query Documentation\n');
    lines.push(`**Generated:** ${new Date().toLocaleString()}\n`);

    lines.push('## Summary\n');
    lines.push(`${doc.summary}\n`);

    lines.push('## Purpose\n');
    lines.push(`${doc.purpose}\n`);

    lines.push(`## Complexity: ${doc.complexity}\n`);

    if (doc.tables.length > 0) {
        lines.push('## Tables Involved\n');
        doc.tables.forEach(table => {
            lines.push(`- **${table.name}** ${table.alias ? `(as ${table.alias})` : ''} - ${table.role}`);
        });
        lines.push('');
    }

    if (doc.joins.length > 0) {
        lines.push('## Join Operations\n');
        doc.joins.forEach((join, idx) => {
            lines.push(`${idx + 1}. **${join.type}** join ${join.rightTable} on \`${join.condition}\``);
        });
        lines.push('');
    }

    if (doc.filters.length > 0) {
        lines.push('## Filters & Conditions\n');
        doc.filters.forEach(filter => {
            lines.push(`- ${filter.description}`);
        });
        lines.push('');
    }

    if (doc.aggregations.length > 0) {
        lines.push('## Aggregations\n');
        doc.aggregations.forEach(agg => {
            lines.push(`- **${agg.function}**(${agg.column})${agg.alias ? ` as ${agg.alias}` : ''}`);
        });
        lines.push('');
    }

    if (doc.ordering.length > 0) {
        lines.push('## Ordering\n');
        doc.ordering.forEach(order => {
            lines.push(`- ${order.column} ${order.direction}`);
        });
        lines.push('');
    }

    if (doc.dataFlow.length > 0) {
        lines.push('## Data Flow\n');
        doc.dataFlow.forEach(step => {
            lines.push(step);
        });
        lines.push('');
    }

    if (doc.warnings.length > 0) {
        lines.push('## ⚠️ Warnings\n');
        doc.warnings.forEach(warning => {
            lines.push(`- ${warning}`);
        });
        lines.push('');
    }

    lines.push('## SQL Code\n');
    lines.push('```sql');
    lines.push(sqlCode);
    lines.push('```\n');

    return lines.join('\n');
}
