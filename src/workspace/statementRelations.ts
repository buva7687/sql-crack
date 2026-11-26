import { getQualifiedKey } from './identifiers';
import type { TableReference } from './types';

interface StatementRelations {
    inputs: Map<string, TableReference>;
    outputs: Map<string, TableReference>;
}

/** Classify physical reads and writes using the reference's statement identity. */
export function getStatementRelations(references: readonly TableReference[]): Map<number, StatementRelations> {
    const statements = new Map<number, StatementRelations>();
    for (const reference of references) {
        if (reference.referenceType === 'cte') {continue;}
        const statementIndex = reference.statementIndex ?? 0;
        let statement = statements.get(statementIndex);
        if (!statement) {
            statement = { inputs: new Map(), outputs: new Map() };
            statements.set(statementIndex, statement);
        }
        const key = getQualifiedKey(reference.tableName, reference.schema, reference);
        const reads = reference.referenceType === 'select' || reference.referenceType === 'join' || reference.referenceType === 'subquery';
        if (reads || reference.alsoRead) {statement.inputs.set(key, reference);}
        if (!reads) {statement.outputs.set(key, reference);}
    }
    return statements;
}
