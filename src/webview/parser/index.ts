// Parser module - exports all parser utilities
// The main parseSql and parseSqlBatch functions remain in sqlParser.ts
// due to their tight interdependencies with internal processing functions.
// Parser state is managed via ParserContext (ctx) inside sqlParser.ts only.

// Extractors
export {
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

// Note: generateHints and detectAdvancedIssues are now internal to sqlParser.ts
// They use the consolidated ParserContext (ctx) for state management.

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
