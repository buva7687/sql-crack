import type { OptimizationHint, QueryStats, SqlDialect } from '../types';

export interface ParserContext {
    stats: QueryStats;
    hints: OptimizationHint[];
    nodeCounter: number;
    hasSelectStar: boolean;
    hasNoLimit: boolean;
    statementType: string;
    tableUsageMap: Map<string, number>;
    dialect: SqlDialect;
    functionsUsed: Set<string>;
}

export function createFreshContext(dialect: SqlDialect): ParserContext {
    return {
        stats: {
            tables: 0,
            joins: 0,
            subqueries: 0,
            ctes: 0,
            aggregations: 0,
            windowFunctions: 0,
            unions: 0,
            conditions: 0,
            complexity: 'Simple',
            complexityScore: 0
        },
        hints: [],
        nodeCounter: 0,
        hasSelectStar: false,
        hasNoLimit: true,
        statementType: '',
        tableUsageMap: new Map(),
        dialect,
        functionsUsed: new Set<string>()
    };
}
