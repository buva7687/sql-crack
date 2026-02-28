export {
    createMergedDdlResult,
    createMergedSessionResult,
    getDdlStatementInfo,
    getSessionCommandInfo,
    getStatementPresentation,
    tryProcessDdlStatement,
    tryParseSessionCommand,
    tryProcessCreateStatement,
    type StatementPresentation
} from './ddl';
export { tryParseCompatibleDeleteStatement } from './delete';
export { tryParseBulkDataStatement } from './bulk';
export { tryParseWarehouseDdlStatement } from './warehouseDdl';
export { resolveDeleteTargetTableNames, tryProcessDmlStatements, type ProcessDmlStatementsArgs } from './dml';
export { tryParseCompatibleMergeStatement } from './merge';
export {
    processSelectStatement,
    type SelectRuntimeDependencies
} from './select';
export { getTableName } from '../extractors/tables';
export { getAstString } from '../extractors/columns';
export { extractConditions } from '../extractors/conditions';
