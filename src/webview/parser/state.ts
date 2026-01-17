// Parser state management - singleton state shared across parser modules

import { QueryStats, OptimizationHint } from '../types';

// State variables for current parse operation
let stats: QueryStats;
let hints: OptimizationHint[];
let nodeCounter = 0;
let hasSelectStar = false;
let hasNoLimit = false;
let statementType = '';
let tableUsageMap: Map<string, number> = new Map();

export function resetState(): void {
    stats = {
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
    };
    hints = [];
    nodeCounter = 0;
    hasSelectStar = false;
    hasNoLimit = true;
    statementType = '';
    tableUsageMap = new Map();
}

export function getStats(): QueryStats {
    return stats;
}

export function setStats(newStats: Partial<QueryStats>): void {
    stats = { ...stats, ...newStats };
}

export function getHints(): OptimizationHint[] {
    return hints;
}

export function addHint(hint: OptimizationHint): void {
    hints.push(hint);
}

export function setHints(newHints: OptimizationHint[]): void {
    hints = newHints;
}

export function genId(prefix: string): string {
    return `${prefix}_${nodeCounter++}`;
}

export function getHasSelectStar(): boolean {
    return hasSelectStar;
}

export function setHasSelectStar(value: boolean): void {
    hasSelectStar = value;
}

export function getHasNoLimit(): boolean {
    return hasNoLimit;
}

export function setHasNoLimit(value: boolean): void {
    hasNoLimit = value;
}

export function getStatementType(): string {
    return statementType;
}

export function setStatementType(value: string): void {
    statementType = value;
}

export function getTableUsageMap(): Map<string, number> {
    return tableUsageMap;
}

export function trackTableUsage(tableName: string): void {
    const normalizedName = tableName.toLowerCase();
    tableUsageMap.set(normalizedName, (tableUsageMap.get(normalizedName) || 0) + 1);
}

// Increment stats helpers
export function incrementTables(): void {
    stats.tables++;
}

export function incrementJoins(): void {
    stats.joins++;
}

export function incrementSubqueries(): void {
    stats.subqueries++;
}

export function incrementCtes(): void {
    stats.ctes++;
}

export function incrementAggregations(): void {
    stats.aggregations++;
}

export function incrementWindowFunctions(): void {
    stats.windowFunctions++;
}

export function incrementUnions(): void {
    stats.unions++;
}

export function incrementConditions(count: number = 1): void {
    stats.conditions += count;
}
