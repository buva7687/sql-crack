// Identifier helpers for schema-aware workspace analysis

/**
 * Normalize identifier for consistent map keys.
 */
export function normalizeIdentifier(value?: string): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : undefined;
}

/**
 * Build a schema-aware key for lookups.
 */
export function getQualifiedKey(name: string, schema?: string): string {
    const normalizedName = normalizeIdentifier(name) || '';
    const normalizedSchema = normalizeIdentifier(schema);
    return normalizedSchema ? `${normalizedSchema}.${normalizedName}` : normalizedName;
}

/**
 * Render a display name with schema prefix when available.
 */
export function getDisplayName(name: string, schema?: string): string {
    return schema ? `${schema}.${name}` : name;
}

/**
 * Parse a qualified key into schema and name.
 */
export function parseQualifiedKey(key: string): { schema?: string; name: string } {
    const parts = key.split('.');
    if (parts.length > 1) {
        return { schema: parts[0], name: parts.slice(1).join('.') };
    }
    return { name: key };
}
