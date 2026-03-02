import * as vscodeMock from '../__mocks__/vscode';
import { normalizeDialect } from '../../src/extension';

describe('extension.ts integration', () => {
    describe('normalizeDialect', () => {
        it('maps SQL Server to TransactSQL', () => {
            expect(normalizeDialect('SQL Server')).toBe('TransactSQL');
        });

        it('maps PL/SQL to Oracle', () => {
            expect(normalizeDialect('PL/SQL')).toBe('Oracle');
        });

        it('returns unchanged dialect for standard names', () => {
            expect(normalizeDialect('MySQL')).toBe('MySQL');
            expect(normalizeDialect('PostgreSQL')).toBe('PostgreSQL');
            expect(normalizeDialect('TransactSQL')).toBe('TransactSQL');
            expect(normalizeDialect('Oracle')).toBe('Oracle');
            expect(normalizeDialect('BigQuery')).toBe('BigQuery');
            expect(normalizeDialect('Snowflake')).toBe('Snowflake');
            expect(normalizeDialect('SQLite')).toBe('SQLite');
            expect(normalizeDialect('Hive')).toBe('Hive');
            expect(normalizeDialect('Presto')).toBe('Presto');
            expect(normalizeDialect('Trino')).toBe('Trino');
        });

        it('handles case-sensitive input (does not lowercase)', () => {
            expect(normalizeDialect('sql server')).toBe('sql server');
            expect(normalizeDialect('pl/sql')).toBe('pl/sql');
            expect(normalizeDialect('mysql')).toBe('mysql');
        });

        it('handles empty string', () => {
            expect(normalizeDialect('')).toBe('');
        });

        it('handles whitespace-only input', () => {
            expect(normalizeDialect('   ')).toBe('   ');
        });
    });
});

describe('extension module structure', () => {
    it('exports normalizeDialect function', () => {
        const extension = require('../../src/extension');
        expect(typeof extension.normalizeDialect).toBe('function');
    });

    it('exports activate function', () => {
        const extension = require('../../src/extension');
        expect(typeof extension.activate).toBe('function');
    });

    it('exports deactivate function', () => {
        const extension = require('../../src/extension');
        expect(typeof extension.deactivate).toBe('function');
    });
});
