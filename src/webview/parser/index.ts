// Parser module - exports all parser utilities
// The main parseSql and parseSqlBatch functions remain in sqlParser.ts
// due to their tight interdependencies with internal processing functions.
// Parser state is managed via ParserContext (ctx) inside sqlParser.ts only.

// Context
export { createFreshContext } from './context';
export type { ParserContext } from './context';

// Validation
export { DEFAULT_VALIDATION_LIMITS, validateSql } from './validation/validate';
export { splitSqlStatements } from './validation/splitting';

// Dialects
export { detectDialect, rankDialectScores } from './dialects/detection';
export type { DialectDetectionResult } from './dialects/detection';
export { regexFallbackParse } from './dialects/fallback';
export {
    hoistNestedCtes,
    preprocessPostgresSyntax,
    rewriteGroupingSets,
    collapseSnowflakePaths
} from './dialects/preprocessing';
export { detectDialectSpecificSyntax } from './dialects/warnings';

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

// Hints
export { generateHints, detectAdvancedIssues, calculateEnhancedMetrics } from './hints';

// Statements
export {
    getStatementPresentation,
    tryProcessCreateStatement,
    tryProcessDmlStatements,
    processSelectStatement
} from './statements';

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
