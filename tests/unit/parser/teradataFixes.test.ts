import { parseSql, parseSqlBatch, preprocessTeradataSyntax } from '../../../src/webview/sqlParser';
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

    it('[Fix 1] does not rewrite alias AS SEL', () => {
        const sql = 'SELECT 1 AS SEL FROM emp';
        const pp = preprocessTeradataSyntax(sql, 'Teradata');
        expect(pp).toBeNull();
    });

    it('[Fix 1] alias AS SEL parses without partial', () => {
        const sql = 'SELECT 1 AS SEL FROM emp';
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

    it('[Fix 4] Teradata MERGE uses compatibility parser without partial flag', () => {
        const sql = `MERGE INTO target_customers AS t
USING source_updates AS s
ON t.customer_id = s.customer_id
WHEN MATCHED THEN
  UPDATE SET t.customer_name = s.customer_name
WHEN NOT MATCHED THEN
  INSERT (customer_id, customer_name)
  VALUES (s.customer_id, s.customer_name)`;
        const result = parseSql(sql, 'Teradata');
        expect(result.partial).toBeUndefined();
        expect(result.error).toBeUndefined();
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.hints.some(h => h.message.includes('Teradata MERGE using compatibility parser'))).toBe(true);
        expect(result.hints.some(h => h.message.includes('Partial visualization - SQL parser could not parse this query'))).toBe(false);
    });

    it('[Fix 4] XMLAGG with ORDER BY and RETREIVE parses without partial', () => {
        const sql = `SELECT
  department_id,
  TRIM(TRAILING ',' FROM (
    XMLAGG(XMLELEMENT(E, employee_name || ',') ORDER BY employee_name)
    .RETREIVE('/:E[1]/text()' VARCHAR(10000))
  )) AS employee_list
FROM employees
GROUP BY department_id`;
        const result = parseSql(sql, 'Teradata');
        expect(result.partial).toBeUndefined();
        expect(result.error).toBeUndefined();
        expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('[Fix 4] teradata-advanced sample has no partial statements', () => {
        const sampleSql = `MERGE INTO target_customers AS t
USING source_updates AS s
ON t.customer_id = s.customer_id
WHEN MATCHED THEN UPDATE SET t.customer_name = s.customer_name
WHEN NOT MATCHED THEN INSERT (customer_id, customer_name) VALUES (s.customer_id, s.customer_name);

MERGE INTO product_inventory AS target
USING daily_sales AS source
ON target.product_id = source.product_id
WHEN MATCHED AND target.quantity - source.sold_qty >= 0 THEN UPDATE SET target.quantity = target.quantity - source.sold_qty
WHEN MATCHED AND target.quantity - source.sold_qty < 0 THEN UPDATE SET target.quantity = 0, target.stock_status = 'OUT_OF_STOCK'
WHEN NOT MATCHED THEN INSERT (product_id, quantity, stock_status) VALUES (source.product_id, 0, 'NEEDS_INVENTORY');

SELECT
  department_id,
  TRIM(TRAILING ',' FROM (
    XMLAGG(XMLELEMENT(E, employee_name || ',') ORDER BY employee_name)
    .RETREIVE('/:E[1]/text()' VARCHAR(10000))
  )) AS employee_list
FROM employees
GROUP BY department_id;`;
        const result = parseSqlBatch(sampleSql, 'Teradata');
        const partialCount = result.queries.filter(q => q.partial).length;
        expect(result.queries.length).toBe(3);
        expect(partialCount).toBe(0);
    });
});
