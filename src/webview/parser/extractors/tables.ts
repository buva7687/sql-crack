// Table extraction utilities

export function getTableName(item: any): string {
    if (typeof item === 'string') { return item; }

    // For table references, prefer the actual table name over alias
    if (item.table) {
        if (typeof item.table === 'object') {
            return item.table.table || item.table.name || item.table.value || item.as || 'table';
        }
        return item.table;
    }

    return item.name || item.as || 'table';
}

export function extractTablesFromStatement(stmt: any): string[] {
    const tables: string[] = [];
    if (!stmt || !stmt.from) { return tables; }

    const fromItems = Array.isArray(stmt.from) ? stmt.from : [stmt.from];
    for (const item of fromItems) {
        const name = getTableName(item);
        if (name && name !== 'table') {
            tables.push(name);
        }
    }
    return tables;
}
