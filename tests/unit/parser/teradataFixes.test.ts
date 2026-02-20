import { parseSql, preprocessTeradataSyntax } from '../../../src/webview/sqlParser';
import { detectDialect } from '../../../src/webview/parser/dialects/detection';
import { ReferenceExtractor } from '../../../src/workspace/extraction/referenceExtractor';

describe('Teradata bug fixes', () => {
    it('[Fix 1] indented SEL is preprocessed', () => {
        const sql = '  SEL id FROM t';
        const pp = preprocessTeradataSyntax(sql, 'Teradata');
        expect(pp).not.toBeNull();
        expect(pp).toContain('SELECT');
        expect(pp).not.toMatch(/\bSEL\b/);
    });

    it('[Fix 1] indented SEL is detected', () => {
        const sql = '  SEL id, name FROM employees';
        const result = detectDialect(sql);
        expect(result.dialect).toBe('Teradata');
    });

    it('[Fix 1] indented SEL parses', () => {
        const sql = '  SEL id FROM t';
        const result = parseSql(sql, 'Teradata');
        expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('[Fix 1] SEL after LOCKING is rewritten', () => {
        const sql = 'LOCKING ROW FOR ACCESS\nSEL * FROM emp';
        const pp = preprocessTeradataSyntax(sql, 'Teradata');
        expect(pp).not.toBeNull();
        expect(pp).toContain('SELECT');
        expect(pp).not.toMatch(/\bSEL\b/);
        expect(pp).not.toMatch(/LOCKING/i);
    });

    it('[Fix 1] SEL after LOCKING parses without partial', () => {
        const sql = 'LOCKING ROW FOR ACCESS\nSEL * FROM emp';
        const result = parseSql(sql, 'Teradata');
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.partial).toBeUndefined();
    });

    it('[Fix 1] SEL after REPLACE VIEW AS is rewritten', () => {
        const sql = 'REPLACE VIEW emp_v AS\nSEL * FROM emp WHERE id = 1';
        const pp = preprocessTeradataSyntax(sql, 'Teradata');
        expect(pp).not.toBeNull();
        expect(pp).toContain('SELECT');
        expect(pp).not.toMatch(/\bSEL\b/);
        expect(pp).toContain('CREATE OR REPLACE');
    });

    it('[Fix 1] SEL after REPLACE VIEW parses without partial', () => {
        const sql = 'REPLACE VIEW emp_v AS\nSEL * FROM emp WHERE id = 1';
        const result = parseSql(sql, 'Teradata');
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.partial).toBeUndefined();
    });

    it('[Fix 2] LOCKING TABLE <object> FOR ACCESS is stripped', () => {
        const sql = 'LOCKING TABLE customers FOR ACCESS SELECT * FROM customers';
        const pp = preprocessTeradataSyntax(sql, 'Teradata');
        expect(pp).not.toBeNull();
        expect(pp).not.toMatch(/LOCKING/i);
    });

    it('[Fix 2] LOCKING DATABASE <object> FOR READ is stripped', () => {
        const sql = 'LOCKING DATABASE mydb FOR READ SELECT * FROM emp';
        const pp = preprocessTeradataSyntax(sql, 'Teradata');
        expect(pp).not.toBeNull();
        expect(pp).not.toMatch(/LOCKING/i);
    });

    it('[Fix 2] LOCKING VIEW <object> FOR ACCESS is detected', () => {
        const sql = 'LOCKING VIEW myview FOR ACCESS SELECT * FROM myview';
        const result = detectDialect(sql);
        expect(result.dialect).toBe('Teradata');
    });

    it('[Fix 3] "sample" is a valid table name in MySQL mode', () => {
        const extractor = new ReferenceExtractor({ dialect: 'MySQL' });
        const refs = extractor.extractReferences('SELECT * FROM sample', 'test.sql', 'MySQL');
        const tables = refs.map(r => r.tableName.toLowerCase());
        expect(tables).toContain('sample');
    });

    it('[Fix 3] "sample" is reserved in Teradata mode', () => {
        const extractor = new ReferenceExtractor({ dialect: 'Teradata' });
        const refs = extractor.extractReferences('SELECT * FROM sample', 'test.sql', 'Teradata');
        const tables = refs.map(r => r.tableName.toLowerCase());
        expect(tables).not.toContain('sample');
    });

    it('[Fix 3] "normalize" is a valid table name in PostgreSQL mode', () => {
        const extractor = new ReferenceExtractor({ dialect: 'PostgreSQL' });
        const refs = extractor.extractReferences('SELECT * FROM normalize', 'test.sql', 'PostgreSQL');
        const tables = refs.map(r => r.tableName.toLowerCase());
        expect(tables).toContain('normalize');
    });

    it('[Fix 3] per-call dialect overrides constructor dialect for reserved words', () => {
        // Constructor set to Teradata, but per-call dialect is MySQL
        const extractor = new ReferenceExtractor({ dialect: 'Teradata' });
        const refs = extractor.extractReferences('SELECT * FROM sample', 'test.sql', 'MySQL');
        const tables = refs.map(r => r.tableName.toLowerCase());
        expect(tables).toContain('sample');
    });
});
