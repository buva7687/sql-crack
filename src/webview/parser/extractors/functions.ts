// Window, aggregate, and case function extraction utilities

import type {
    AggregateFunctionDetail,
    CaseDetail,
    SqlDialect,
    WindowFunctionDetail
} from '../../types';
import { getAggregateFunctions, getWindowFunctions } from '../../../dialects';
import { unwrapIdentifierValue } from '../astUtils';

export type TrackFunctionUsageFn = (
    functionName: unknown,
    category: 'aggregate' | 'window' | 'tvf' | 'scalar'
) => void;

export interface ExtractFunctionsOptions {
    trackFunctionUsage?: TrackFunctionUsageFn;
}

export function extractWindowFunctions(columns: any): string[] {
    if (!columns || !Array.isArray(columns)) { return []; }

    const windowFuncs: string[] = [];
    for (const col of columns) {
        if (col.expr?.over) {
            let funcName = 'WINDOW';
            const expr = col.expr;
            if (typeof expr.name === 'string') {
                funcName = expr.name;
            } else if (expr.name?.name && typeof expr.name.name === 'string') {
                funcName = expr.name.name;
            } else if (expr.name?.value && typeof expr.name.value === 'string') {
                funcName = expr.name.value;
            }

            const partitionBy = col.expr.over?.partitionby?.map((p: any) => p.column || p.expr?.column).join(', ');
            let desc = `${funcName}()`;
            if (partitionBy) {
                desc += ` OVER(PARTITION BY ${partitionBy})`;
            }
            windowFuncs.push(desc);
        }
    }
    return windowFuncs;
}

export function extractWindowFunctionDetails(
    columns: any,
    dialect: SqlDialect = 'MySQL',
    options: ExtractFunctionsOptions = {}
): WindowFunctionDetail[] {
    if (!columns || !Array.isArray(columns)) { return []; }

    const details: WindowFunctionDetail[] = [];
    const windowFuncList = getWindowFunctions(dialect);

    const getStringName = (obj: any): string | null => {
        if (typeof obj === 'string') {return obj;}
        if (obj && typeof obj.name === 'string') {return obj.name;}
        if (obj && typeof obj.value === 'string') {return obj.value;}
        return null;
    };

    for (const col of columns) {
        if (col.expr?.over) {
            let funcName = 'WINDOW';
            const expr = col.expr;

            const nameFromExpr = getStringName(expr.name);
            if (nameFromExpr) {
                funcName = nameFromExpr;
            } else if (expr.type === 'aggr_func' || expr.type === 'function') {
                const aggName = getStringName(expr.name);
                if (aggName) {funcName = aggName;}
            } else if (expr.args?.expr) {
                const argsName = getStringName(expr.args.expr.name) || getStringName(expr.args.expr);
                if (argsName) {funcName = argsName;}
            }

            if (funcName === 'WINDOW' && col.as) {
                const alias = String(col.as).toLowerCase();
                if (alias.includes('prev') || alias.includes('lag')) {funcName = 'LAG';}
                else if (alias.includes('next') || alias.includes('lead')) {funcName = 'LEAD';}
                else if (alias.includes('rank')) {funcName = 'RANK';}
                else if (alias.includes('row_num')) {funcName = 'ROW_NUMBER';}
                else if (alias.includes('running') || alias.includes('total')) {funcName = 'SUM';}
                else if (alias.includes('avg') || alias.includes('average')) {funcName = 'AVG';}
            }

            if (funcName === 'WINDOW') {
                try {
                    const exprStr = JSON.stringify(expr).toUpperCase();
                    for (const wf of windowFuncList) {
                        if (exprStr.includes(`"NAME":"${wf}"`) || exprStr.includes(`"${wf}"`)) {
                            funcName = wf;
                            break;
                        }
                    }
                } catch (e) {
                    if (typeof window !== 'undefined' && (window as any).debugLogging) {
                        console.debug('[functions] JSON.stringify failed for window function detection:', e);
                    }
                }
            }

            const partitionBy = col.expr.over?.partitionby?.map((p: any) =>
                p.column || p.expr?.column || p.value || '?'
            ).filter(Boolean);

            const orderBy = col.expr.over?.orderby?.map((o: any) => {
                const colName = o.expr?.column || o.column || '?';
                const dir = o.type || '';
                return dir ? `${colName} ${dir}` : colName;
            }).filter(Boolean);

            let frame: string | undefined;
            if (col.expr.over?.frame) {
                const f = col.expr.over.frame;
                frame = `${f.type || 'ROWS'} ${f.start || ''} ${f.end ? 'TO ' + f.end : ''}`.trim();
            }

            const cleanName = typeof funcName === 'string' ? funcName : 'WINDOW';
            options.trackFunctionUsage?.(cleanName, 'window');

            details.push({
                name: cleanName.toUpperCase(),
                partitionBy: partitionBy?.length > 0 ? partitionBy : undefined,
                orderBy: orderBy?.length > 0 ? orderBy : undefined,
                frame
            });
        }
    }

    return details;
}

export type AggregateFunctionDetailWithSource = AggregateFunctionDetail & {
    sourceColumn?: string;
    sourceTable?: string;
};

export function extractAggregateFunctionDetails(
    columns: any,
    dialect: SqlDialect = 'MySQL'
): AggregateFunctionDetailWithSource[] {
    if (!columns || !Array.isArray(columns)) { return []; }

    const aggregateFuncSet = new Set(getAggregateFunctions(dialect));
    const details: AggregateFunctionDetailWithSource[] = [];

    function getExpressionFunctionName(expr: any): string {
        if (typeof expr?.name === 'string') {
            return expr.name.toUpperCase();
        }
        const nameParts = expr?.name?.name;
        if (Array.isArray(nameParts) && nameParts.length > 0) {
            return String(nameParts[0]?.value || '').toUpperCase();
        }
        return '';
    }

    function normalizeColumnRefName(columnRef: any): string {
        const normalized = unwrapIdentifierValue(columnRef?.column);
        if (normalized) {
            return normalized;
        }
        if (typeof columnRef?.column === 'string') {
            return columnRef.column;
        }
        return '?';
    }

    function formatAggregateArg(arg: any): string {
        if (!arg || typeof arg !== 'object') {
            return arg === undefined ? '?' : String(arg);
        }

        if (arg.type === 'star') {
            return '*';
        }
        if (arg.type === 'column_ref') {
            return normalizeColumnRefName(arg);
        }
        if (arg.type === 'expr_list' && Array.isArray(arg.value)) {
            return arg.value.map(formatAggregateArg).join(', ');
        }
        if (arg.type === 'number') {
            return String(arg.value ?? '?');
        }
        if (arg.type && String(arg.type).includes('string')) {
            return `'${String(arg.value ?? '')}'`;
        }
        if (arg.value !== undefined) {
            return String(arg.value);
        }
        if (arg.column) {
            return String(arg.column);
        }
        if (arg.expr) {
            return formatAggregateArg(arg.expr);
        }
        return '?';
    }

    function extractAggregatesFromExpr(expr: any): void {
        if (!expr || typeof expr !== 'object') {
            return;
        }

        if (Array.isArray(expr)) {
            for (const item of expr) {
                extractAggregatesFromExpr(item);
            }
            return;
        }

        const exprType = typeof expr.type === 'string' ? expr.type.toLowerCase() : '';
        const exprFuncName = getExpressionFunctionName(expr);
        if (exprType === 'aggr_func' || (exprFuncName && aggregateFuncSet.has(exprFuncName))) {
            const funcName = exprFuncName || 'AGG';
            const argsContainer = expr.args;
            const argNode = argsContainer?.value ?? argsContainer?.expr ?? argsContainer;
            const argList = Array.isArray(argNode) ? argNode : (argNode ? [argNode] : []);
            const hasDistinct = String(argsContainer?.distinct || '').toUpperCase() === 'DISTINCT';

            let sourceColumn: string | undefined;
            let sourceTable: string | undefined;
            const argStrs = argList.map((arg: any) => {
                if (!sourceColumn && arg?.type === 'column_ref') {
                    sourceColumn = normalizeColumnRefName(arg);
                    sourceTable = arg.table;
                } else if (!sourceColumn && arg?.expr?.type === 'column_ref') {
                    sourceColumn = normalizeColumnRefName(arg.expr);
                    sourceTable = arg.expr.table;
                }
                return formatAggregateArg(arg);
            }).filter(Boolean);

            const distinctPrefix = hasDistinct ? 'DISTINCT ' : '';
            const expression = `${funcName}(${distinctPrefix}${argStrs.join(', ')})`;

            details.push({
                name: funcName,
                expression,
                alias: undefined,
                sourceColumn,
                sourceTable
            });
        }

        for (const value of Object.values(expr)) {
            extractAggregatesFromExpr(value);
        }
    }

    for (const col of columns) {
        if (!col?.expr) {
            continue;
        }

        const startIndex = details.length;
        extractAggregatesFromExpr(col.expr);
        const addedCount = details.length - startIndex;
        const topExprType = typeof col.expr?.type === 'string' ? col.expr.type.toLowerCase() : '';
        const topExprName = getExpressionFunctionName(col.expr);
        const isTopLevelAggregate =
            topExprType === 'aggr_func' || (topExprName && aggregateFuncSet.has(topExprName));

        if (col.as && addedCount === 1 && isTopLevelAggregate) {
            details[startIndex].alias = col.as;
        }
    }

    const deduped: AggregateFunctionDetailWithSource[] = [];
    const indexByKey = new Map<string, number>();
    for (const detail of details) {
        const key = `${detail.name}|${detail.expression}|${detail.sourceTable || ''}|${detail.sourceColumn || ''}`;
        const existingIndex = indexByKey.get(key);
        if (existingIndex === undefined) {
            indexByKey.set(key, deduped.length);
            deduped.push(detail);
            continue;
        }
        if (!deduped[existingIndex].alias && detail.alias) {
            deduped[existingIndex].alias = detail.alias;
        }
    }

    return deduped;
}

export function extractCaseStatementDetails(columns: any): CaseDetail[] {
    if (!columns || !Array.isArray(columns)) { return []; }

    const caseDetails: CaseDetail[] = [];

    function formatExpr(expr: any): string {
        if (!expr) {return '?';}
        if (expr.column) {return expr.column;}
        if (expr.value) {return String(expr.value);}
        if (expr.type === 'binary_expr') {
            const left = formatExpr(expr.left);
            const right = formatExpr(expr.right);
            return `${left} ${expr.operator} ${right}`;
        }
        return 'expr';
    }

    for (const col of columns) {
        if (col.expr && col.expr.type === 'case') {
            const caseExpr = col.expr;
            const conditions: Array<{ when: string; then: string }> = [];

            if (caseExpr.args && Array.isArray(caseExpr.args)) {
                for (const arg of caseExpr.args) {
                    if (arg.cond && arg.result) {
                        conditions.push({
                            when: formatExpr(arg.cond),
                            then: formatExpr(arg.result)
                        });
                    }
                }
            }

            const elseValue = caseExpr.else ? formatExpr(caseExpr.else) : undefined;
            const alias = col.as;

            if (conditions.length > 0) {
                caseDetails.push({ conditions, elseValue, alias });
            }
        }
    }

    return caseDetails;
}
