// Parser module - exports all parser utilities
// The main parseSql and parseSqlBatch functions remain in sqlParser.ts
// due to their tight interdependencies with internal processing functions

// State management
export {
    resetState,
    getStats,
    setStats,
    getHints,
    addHint,
    setHints,
    genId,
    getHasSelectStar,
    setHasSelectStar,
    getHasNoLimit,
    setHasNoLimit,
    getStatementType,
    setStatementType,
    getTableUsageMap,
    trackTableUsage,
    incrementTables,
    incrementJoins,
    incrementSubqueries,
    incrementCtes,
    incrementAggregations,
    incrementWindowFunctions,
    incrementUnions,
    incrementConditions
} from './state';

// Metrics
export { calculateComplexity, calculateEnhancedMetrics } from './metrics';

// Extractors
export {
    extractColumns,
    extractColumnInfos,
    extractConditions,
    formatConditionRecursive,
    formatCondition,
    extractWindowFunctions,
    extractWindowFunctionDetails,
    extractAggregateFunctionDetails,
    extractCaseStatementDetails,
    getTableName,
    extractTablesFromStatement
} from './extractors';

// Hints
export { generateHints, detectAdvancedIssues } from './hints';

// Layout
export { layoutGraph } from './layout';
export { layoutGraphHorizontal, getLayoutMetrics } from './forceLayout';

// Lineage
export {
    extractColumnLineage,
    extractSourcesFromExpr,
    generateColumnFlows,
    buildColumnLineagePath,
    findSourceColumn,
    getTransformationType,
    calculateColumnPositions
} from './lineage';

// Line numbers
export { extractKeywordLineNumbers, assignLineNumbers } from './lineNumbers';
