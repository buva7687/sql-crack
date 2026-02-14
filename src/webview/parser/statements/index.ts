export {
    getStatementPresentation,
    tryProcessCreateStatement,
    type StatementPresentation
} from './ddl';
export { tryProcessDmlStatements, type ProcessDmlStatementsArgs } from './dml';
export {
    processSelectStatement,
    getTableName,
    getAstString,
    extractConditions,
    type SelectRuntimeDependencies
} from './select';
