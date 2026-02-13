import { normalizeDialect } from '../../src/extension';

describe('normalizeDialect', () => {
    it('maps "SQL Server" to "TransactSQL"', () => {
        expect(normalizeDialect('SQL Server')).toBe('TransactSQL');
    });

    it('passes through "TransactSQL" unchanged', () => {
        expect(normalizeDialect('TransactSQL')).toBe('TransactSQL');
    });

    it('passes through other dialects unchanged', () => {
        expect(normalizeDialect('MySQL')).toBe('MySQL');
        expect(normalizeDialect('PostgreSQL')).toBe('PostgreSQL');
        expect(normalizeDialect('Snowflake')).toBe('Snowflake');
        expect(normalizeDialect('BigQuery')).toBe('BigQuery');
        expect(normalizeDialect('Redshift')).toBe('Redshift');
        expect(normalizeDialect('Hive')).toBe('Hive');
        expect(normalizeDialect('Athena')).toBe('Athena');
        expect(normalizeDialect('Trino')).toBe('Trino');
        expect(normalizeDialect('MariaDB')).toBe('MariaDB');
        expect(normalizeDialect('SQLite')).toBe('SQLite');
    });
});
