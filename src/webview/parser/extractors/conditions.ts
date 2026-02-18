// Condition extraction utilities
import { getAstString } from './columns';

export function extractConditions(where: any): string[] {
    const conditions: string[] = [];
    formatConditionRecursive(where, conditions);
    return conditions.slice(0, 5); // Limit to first 5
}

export function formatConditionRecursive(expr: any, conditions: string[], depth = 0): void {
    if (!expr || depth > 3) { return; }

    if (expr.type === 'binary_expr') {
        if (expr.operator === 'AND' || expr.operator === 'OR') {
            formatConditionRecursive(expr.left, conditions, depth + 1);
            formatConditionRecursive(expr.right, conditions, depth + 1);
        } else {
            conditions.push(formatCondition(expr));
        }
    }
}

export function formatCondition(expr: any): string {
    if (!expr) { return '?'; }

    if (expr.type === 'binary_expr') {
        const left = formatConditionOperand(expr.left);
        const right = formatConditionOperand(expr.right);
        return `${left} ${expr.operator} ${right}`;
    }

    return 'condition';
}

function formatConditionOperand(operand: any): string {
    if (operand === null || operand === undefined) {
        return '?';
    }
    if (typeof operand === 'string' || typeof operand === 'number' || typeof operand === 'boolean') {
        return String(operand);
    }
    if (Array.isArray(operand)) {
        return operand.map(formatConditionOperand).join(', ');
    }
    if (typeof operand !== 'object') {
        return '?';
    }

    if (operand.type === 'column_ref') {
        const table = getAstString(operand.table);
        const column = getAstString(operand.column);
        return `${table ? `${table}.` : ''}${column || '?'}`;
    }
    if (operand.type === 'expr_list') {
        if (!Array.isArray(operand.value)) {
            return '?';
        }
        return operand.value.map(formatConditionOperand).join(', ');
    }
    if (operand.type === 'number' || operand.type === 'single_quote_string' || operand.type === 'string' || operand.type === 'bool') {
        return String(operand.value ?? '?');
    }
    if (operand.type === 'null') {
        return 'NULL';
    }
    if (operand.type === 'binary_expr') {
        return formatCondition(operand);
    }
    if (operand.type === 'unary_expr') {
        return `${operand.operator || ''}${formatConditionOperand(operand.expr ?? operand.value)}`;
    }
    if (operand.type === 'function' || operand.type === 'aggr_func') {
        const funcName = getAstString(operand.name) || (operand.type === 'aggr_func' ? 'AGG' : 'FUNC');
        const rawArgs = operand.args?.value ?? operand.args?.expr ?? operand.args;
        const args = Array.isArray(rawArgs) ? rawArgs : (rawArgs ? [rawArgs] : []);
        return `${funcName}(${args.map(formatConditionOperand).join(', ')})`;
    }
    if (operand.type === 'star' || operand.column === '*') {
        return '*';
    }
    if (operand.expr) {
        return formatConditionOperand(operand.expr);
    }

    const scalar = getAstString(operand.column) || getAstString(operand.value) || getAstString(operand.name);
    return scalar || '?';
}
