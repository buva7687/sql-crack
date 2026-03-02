// Shared SQL keyword sets used by workspace extraction modules.

// SQL reserved words for schema extraction (CREATE TABLE/VIEW name filtering).
export const SCHEMA_SQL_RESERVED_WORDS = new Set([
    'select', 'insert', 'update', 'delete', 'create', 'drop', 'alter', 'truncate',
    'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'between',
    'join', 'inner', 'outer', 'left', 'right', 'full', 'cross', 'on', 'using',
    'group', 'by', 'having', 'order', 'asc', 'desc', 'limit', 'offset',
    'union', 'intersect', 'except', 'all', 'distinct', 'as',
    'case', 'when', 'then', 'else', 'end', 'if', 'exists',
    'values', 'set', 'into', 'table', 'view', 'index', 'database', 'schema',
    'primary', 'foreign', 'key', 'references', 'constraint', 'unique', 'check',
    'default', 'auto_increment', 'identity', 'serial',
    'with', 'recursive', 'over', 'partition', 'rows', 'range',
    'true', 'false', 'unknown'
]);

// SQL reserved words for reference extraction (broader to avoid false table names).
export const REFERENCE_SQL_RESERVED_WORDS = new Set([
    // DML/DDL keywords
    'select', 'insert', 'update', 'delete', 'create', 'drop', 'alter', 'truncate',
    'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'between',
    'join', 'inner', 'outer', 'left', 'right', 'full', 'cross', 'on', 'using',
    'group', 'by', 'having', 'order', 'asc', 'desc', 'limit', 'offset',
    'union', 'intersect', 'except', 'all', 'distinct', 'as',
    'case', 'when', 'then', 'else', 'end', 'if', 'exists',
    'values', 'set', 'into', 'table', 'view', 'index', 'database', 'schema',
    'primary', 'foreign', 'key', 'references', 'constraint', 'unique', 'check',
    'default', 'auto_increment', 'identity', 'serial',
    // Data types
    'int', 'integer', 'bigint', 'smallint', 'tinyint', 'float', 'double', 'decimal',
    'numeric', 'real', 'char', 'varchar', 'text', 'blob', 'clob', 'date', 'time',
    'datetime', 'timestamp', 'boolean', 'bool', 'binary', 'varbinary', 'json', 'xml',
    // Functions (common ones that might be mistaken for tables)
    'count', 'sum', 'avg', 'min', 'max', 'coalesce', 'nullif', 'cast', 'convert',
    'concat', 'substring', 'length', 'trim', 'upper', 'lower', 'replace',
    'now', 'current_date', 'current_time', 'current_timestamp', 'getdate',
    'year', 'month', 'day', 'hour', 'minute', 'second', 'dateadd', 'datediff',
    'row_number', 'rank', 'dense_rank', 'ntile', 'lead', 'lag', 'first_value', 'last_value',
    // Other common keywords
    'true', 'false', 'unknown', 'query', 'result', 'data', 'temp', 'temporary', 'without',
    'with', 'recursive', 'over', 'partition', 'rows', 'range', 'unbounded', 'preceding', 'following',
    'rollup', 'cube', 'grouping', 'sets', 'fetch', 'next', 'only', 'percent',
    'top', 'dual', 'sysdate', 'rownum', 'rowid', 'level', 'connect', 'start',
    // Transaction keywords
    'begin', 'commit', 'rollback', 'transaction', 'savepoint',
    // Permissions
    'grant', 'revoke', 'execute', 'procedure', 'function', 'trigger',
]);

// Teradata-specific reserved words — only applied when dialect is Teradata.
export const TERADATA_RESERVED_WORDS = new Set([
    'sel', 'multiset', 'volatile', 'locking', 'qualify', 'sample', 'normalize',
    'hashrow', 'hashbucket', 'hashamp'
]);
