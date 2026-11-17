import { unwrapIdentifierValue } from '../../shared';

export interface ColumnIdentifier {
    name: string;
    nameQuoted?: boolean;
}

export function readColumnIdentifier(value: unknown): ColumnIdentifier | undefined {
    const node = value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
    if (node?.type === 'column_ref') {
        return readColumnIdentifier(node.column);
    }
    if (node?.expr) {
        return readColumnIdentifier(node.expr);
    }

    const name = unwrapIdentifierValue(value);
    if (!name) {return undefined;}
    if (!node && /^(?:"[\s\S]*"|`[\s\S]*`|\[[\s\S]*\])$/.test(name)) {
        const closingDelimiter = name[name.length - 1];
        return {
            name: name.slice(1, -1).split(closingDelimiter.repeat(2)).join(closingDelimiter),
            nameQuoted: true,
        };
    }
    const type = String(node?.type ?? '').toLowerCase();
    return { name, nameQuoted: /quote|backtick|bracket/.test(type) };
}
