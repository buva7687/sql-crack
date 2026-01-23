/**
 * SQL Dialect Functions Module
 *
 * Provides dialect-specific aggregate and window function detection.
 * Combines built-in definitions with user-customizable settings.
 */

export {
    isAggregateFunction,
    isWindowFunction,
    getAggregateFunctions,
    getWindowFunctions,
    getFunctionsForDialect,
    getSupportedDialects,
    clearFunctionCache,
    setCustomFunctions
} from './functionRegistry';
