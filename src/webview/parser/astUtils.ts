/**
 * Unwrap identifier-like AST nodes produced by node-sql-parser.
 * Handles plain strings and nested shapes such as:
 * - { value: 'col' }
 * - { expr: { value: 'col' } }
 * - { name: [{ value: 'col' }] }
 */
export function unwrapIdentifierValue(value: any): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    if (typeof value.value === 'string') {
        return value.value;
    }
    if (typeof value.expr?.value === 'string') {
        return value.expr.value;
    }
    if (typeof value.expr?.expr?.value === 'string') {
        return value.expr.expr.value;
    }
    if (Array.isArray(value.name) && value.name.length > 0) {
        const first = value.name[0];
        if (typeof first?.value === 'string') {
            return first.value;
        }
    }
    return undefined;
}
