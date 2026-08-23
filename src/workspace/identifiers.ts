// Identifier helpers for schema-aware workspace analysis

export interface IdentifierQualification {
    catalog?: string;
    nameQuoted?: boolean;
    schemaQuoted?: boolean;
    catalogQuoted?: boolean;
    identifierCaseFolding?: 'lower' | 'upper' | 'preserve';
    quotedIdentifiersCaseSensitive?: boolean;
}

export interface ParsedQualifiedKey {
    catalog?: string;
    schema?: string;
    name: string;
}

export function getIdentifierSemantics(dialect: string): Pick<
    IdentifierQualification,
    'identifierCaseFolding' | 'quotedIdentifiersCaseSensitive'
> {
    if (dialect === 'Snowflake' || dialect === 'Oracle') {
        return { identifierCaseFolding: 'upper', quotedIdentifiersCaseSensitive: true };
    }
    if (dialect === 'BigQuery') {
        // BigQuery table names are case-sensitive by default. Backticks delimit
        // a path but do not change its case identity, so preserve both forms.
        return { identifierCaseFolding: 'preserve', quotedIdentifiersCaseSensitive: false };
    }
    if (['TransactSQL', 'MySQL', 'MariaDB', 'SQLite', 'Hive', 'Athena', 'Trino', 'Teradata'].includes(dialect)) {
        return { identifierCaseFolding: 'lower', quotedIdentifiersCaseSensitive: false };
    }
    return { identifierCaseFolding: 'lower', quotedIdentifiersCaseSensitive: true };
}

/**
 * Normalize identifier for consistent map keys. Delimited identifiers retain
 * case because databases such as PostgreSQL treat "Users" and "users" as
 * different objects; ordinary identifiers continue to fold to lowercase.
 */
export function normalizeIdentifier(
    value?: string,
    quoted = false,
    caseFolding: 'lower' | 'upper' | 'preserve' = 'lower',
    quotedCaseSensitive = true
): string | undefined {
    if (!value) {return undefined;}
    const trimmed = value.trim();
    if (!trimmed) {return undefined;}
    if (quoted && quotedCaseSensitive) {return trimmed;}
    if (caseFolding === 'preserve') {return trimmed;}
    return caseFolding === 'upper' ? trimmed.toUpperCase() : trimmed.toLowerCase();
}

export function escapeKeyComponent(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
}

export function splitQualifiedKey(key: string): string[] {
    const parts: string[] = [];
    let current = '';
    for (let index = 0; index < key.length; index++) {
        if (key[index] === '\\' && index + 1 < key.length) {
            current += key[index + 1];
            index++;
        } else if (key[index] === '.') {
            parts.push(current);
            current = '';
        } else {
            current += key[index];
        }
    }
    parts.push(current);
    return parts;
}

/**
 * Split the final component from an escaped qualified key without confusing a
 * delimiter with a literal escaped dot inside a quoted identifier.
 */
export function splitLastQualifiedKeyComponent(key: string): { prefix: string; component: string } {
    let escaped = false;
    let delimiterIndex = -1;
    for (let index = 0; index < key.length; index++) {
        if (escaped) {
            escaped = false;
        } else if (key[index] === '\\') {
            escaped = true;
        } else if (key[index] === '.') {
            delimiterIndex = index;
        }
    }
    if (delimiterIndex < 0) {
        return { prefix: '', component: splitQualifiedKey(key)[0] || '' };
    }
    return {
        prefix: key.slice(0, delimiterIndex),
        component: splitQualifiedKey(key.slice(delimiterIndex + 1))[0] || '',
    };
}

/** Build a column identity by appending one escaped canonical component. */
export function getColumnKey(
    tableKey: string,
    columnName: string,
    qualification: Pick<IdentifierQualification,
        'nameQuoted' | 'identifierCaseFolding' | 'quotedIdentifiersCaseSensitive'> = {}
): string {
    const canonicalColumn = normalizeIdentifier(
        columnName,
        qualification.nameQuoted,
        qualification.identifierCaseFolding,
        qualification.quotedIdentifiersCaseSensitive
    ) || '';
    return `${tableKey}.${escapeKeyComponent(canonicalColumn)}`;
}

/**
 * Build a schema-aware key for lookups.
 */
export function getQualifiedKey(
    name: string,
    schema?: string,
    qualification: IdentifierQualification = {}
): string {
    const folding = qualification.identifierCaseFolding || 'lower';
    const quotedCaseSensitive = qualification.quotedIdentifiersCaseSensitive !== false;
    const normalizedName = normalizeIdentifier(name, qualification.nameQuoted, folding, quotedCaseSensitive) || '';
    const normalizedSchema = normalizeIdentifier(schema, qualification.schemaQuoted, folding, quotedCaseSensitive);
    const normalizedCatalog = normalizeIdentifier(qualification.catalog, qualification.catalogQuoted, folding, quotedCaseSensitive);
    return [normalizedCatalog, normalizedSchema, normalizedName]
        .filter((part): part is string => part !== undefined)
        .map(escapeKeyComponent)
        .join('.');
}

/**
 * Render a display name with schema prefix when available.
 */
export function getDisplayName(name: string, schema?: string, catalog?: string): string {
    return [catalog, schema, name].filter(part => !!part).join('.');
}

/**
 * Parse a qualified key into schema and name.
 */
export function parseQualifiedKey(key: string): ParsedQualifiedKey {
    const parts = splitQualifiedKey(key);
    if (parts.length >= 3) {
        return {
            catalog: parts.slice(0, -2).join('.'),
            schema: parts[parts.length - 2],
            name: parts[parts.length - 1]
        };
    }
    if (parts.length === 2) {
        return { schema: parts[0], name: parts[1] };
    }
    return { name: parts[0] || '' };
}
