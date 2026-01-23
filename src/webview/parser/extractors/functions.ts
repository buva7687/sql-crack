// Window, aggregate, and case function extraction utilities

import { WindowFunctionDetail, AggregateFunctionDetail, CaseDetail, SqlDialect } from '../../types';
import { getAggregateFunctions, getWindowFunctions } from '../../../dialects';

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

export function extractWindowFunctionDetails(columns: any, dialect: SqlDialect = 'MySQL'): WindowFunctionDetail[] {
    if (!columns || !Array.isArray(columns)) { return []; }

    const details: WindowFunctionDetail[] = [];
    // Get dialect-specific window functions
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
                } catch {
                    // Ignore JSON errors
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

export function extractAggregateFunctionDetails(columns: any, dialect: SqlDialect = 'MySQL'): AggregateFunctionDetail[] {
    if (!columns || !Array.isArray(columns)) { return []; }

    // Get dialect-specific aggregate functions
    const aggregateFuncSet = new Set(getAggregateFunctions(dialect));
    const details: AggregateFunctionDetail[] = [];

    function extractAggregatesFromExpr(expr: any): void {
        if (!expr) {return;}

        const exprFuncName = String(expr.name || '').toUpperCase();
        if (expr.type === 'aggr_func' || (exprFuncName && aggregateFuncSet.has(exprFuncName))) {
            const funcName = exprFuncName || 'AGG';

            let expression = funcName + '()';
            if (expr.args) {
                const args = expr.args.value || expr.args;
                if (Array.isArray(args)) {
                    const argStrs = args.map((arg: any) => {
                        if (arg.column) {return arg.column;}
                        if (arg.value) {return String(arg.value);}
                        if (arg.expr?.column) {return arg.expr.column;}
                        return '?';
                    });
                    expression = funcName + '(' + argStrs.join(', ') + ')';
                } else if (args.column) {
                    expression = funcName + '(' + args.column + ')';
                }
            }

            details.push({
                name: funcName,
                expression: expression,
                alias: undefined
            });
            return;
        }

        if (expr.args) {
            const args = expr.args.value || expr.args;
            if (Array.isArray(args)) {
                args.forEach(extractAggregatesFromExpr);
            } else {
                extractAggregatesFromExpr(args);
            }
        }
        if (expr.left) {extractAggregatesFromExpr(expr.left);}
        if (expr.right) {extractAggregatesFromExpr(expr.right);}
    }

    for (const col of columns) {
        if (col.expr) {
            extractAggregatesFromExpr(col.expr);
            if (col.as && details.length > 0) {
                details[details.length - 1].alias = col.as;
            }
        }
    }

    return details;
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
