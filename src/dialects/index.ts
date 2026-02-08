/**
 * SQL Dialect Functions Module
 *
 * Provides dialect-specific aggregate, window, and table-valued function detection.
 * Combines built-in definitions with user-customizable settings.
 */

export {
    isAggregateFunction,
    isWindowFunction,
    isTableValuedFunction,
    getAggregateFunctions,
    getWindowFunctions,
    getTableValuedFunctions,
    getFunctionsForDialect,
    getSupportedDialects,
    setCustomFunctions
} from './functionRegistry';
