export {
    createMergedDdlResult,
    createMergedSessionResult,
    getDdlStatementInfo,
    getSessionCommandInfo,
    getStatementPresentation,
    tryParseSessionCommand,
    tryProcessCreateStatement,
    type StatementPresentation
} from './ddl';
export { tryParseBulkDataStatement } from './bulk';
export { tryProcessDmlStatements, type ProcessDmlStatementsArgs } from './dml';
export { tryParseCompatibleMergeStatement } from './merge';
export {
    processSelectStatement,
    type SelectRuntimeDependencies
} from './select';
export { getTableName } from '../extractors/tables';
export { getAstString } from '../extractors/columns';
export { extractConditions } from '../extractors/conditions';
