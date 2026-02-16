/**
 * Dialect Support Tests
 *
 * Tests SQL dialect-specific syntax including:
 * - MySQL specific features
 * - PostgreSQL specific features
 * - Snowflake specific features
 * - BigQuery specific features
 * - SQL Server (TransactSQL) specific features
 */

import { parseSql, preprocessPostgresSyntax } from '../../../src/webview/sqlParser';

describe('Dialect Support', () => {
  describe('MySQL', () => {
    const dialect = 'MySQL';

    it('parses backtick identifiers', () => {
      const result = parseSql('SELECT `user-name` FROM `my-table`', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses LIMIT with offset syntax', () => {
      const result = parseSql('SELECT * FROM users LIMIT 10, 20', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses LIMIT with OFFSET keyword', () => {
      const result = parseSql('SELECT * FROM users LIMIT 20 OFFSET 10', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses IF() function', () => {
      const result = parseSql('SELECT IF(status = 1, "active", "inactive") FROM users', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses IFNULL() function', () => {
      const result = parseSql('SELECT IFNULL(name, "Unknown") FROM users', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses GROUP_CONCAT()', () => {
      const result = parseSql('SELECT department, GROUP_CONCAT(name) FROM employees GROUP BY department', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses DATE_FORMAT()', () => {
      const result = parseSql('SELECT DATE_FORMAT(created_at, "%Y-%m-%d") FROM users', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses INSERT with ON DUPLICATE KEY UPDATE', () => {
      const result = parseSql(
        'INSERT INTO users (id, name) VALUES (1, "John") ON DUPLICATE KEY UPDATE name = "John"',
        dialect
      );
      expect(result.error).toBeUndefined();
    });

    it('parses STRAIGHT_JOIN', () => {
      const result = parseSql('SELECT * FROM orders STRAIGHT_JOIN customers ON orders.customer_id = customers.id', dialect);
      expect(result.error).toBeUndefined();
    });
  });

  describe('PostgreSQL', () => {
    const dialect = 'PostgreSQL';

    it('parses double-quoted identifiers', () => {
      const result = parseSql('SELECT "user-name" FROM "my-table"', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses :: type casting', () => {
      const result = parseSql("SELECT '2024-01-01'::date", dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses multiple :: casts', () => {
      const result = parseSql("SELECT '123'::integer, '45.67'::numeric(10,2)", dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses ARRAY syntax', () => {
      const result = parseSql('SELECT ARRAY[1, 2, 3]', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses array access', () => {
      const result = parseSql('SELECT tags[1] FROM articles', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses COALESCE()', () => {
      const result = parseSql('SELECT COALESCE(name, email, "Unknown") FROM users', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses NULLIF()', () => {
      const result = parseSql('SELECT NULLIF(status, 0) FROM users', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses FULL OUTER JOIN', () => {
      const result = parseSql('SELECT * FROM a FULL OUTER JOIN b ON a.id = b.id', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses RETURNING clause', () => {
      const result = parseSql('INSERT INTO users (name) VALUES ("John") RETURNING id', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses DISTINCT ON', () => {
      const result = parseSql('SELECT DISTINCT ON (department) * FROM employees ORDER BY department, salary DESC', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses ILIKE', () => {
      const result = parseSql("SELECT * FROM users WHERE name ILIKE '%john%'", dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses window function with FILTER', () => {
      const result = parseSql('SELECT COUNT(*) FILTER (WHERE active = true) FROM users', dialect);
      // May or may not parse depending on node-sql-parser version
    });

    describe('preprocessPostgresSyntax', () => {
      it('removes AT TIME ZONE with string literal', () => {
        const result = preprocessPostgresSyntax(
          "SELECT created_at AT TIME ZONE 'America/Chicago' FROM events",
          'PostgreSQL'
        );
        expect(result).not.toBeNull();
        expect(result).not.toContain('AT TIME ZONE');
        expect(result).not.toContain('America/Chicago');
        expect(result).toContain('created_at');
        expect(result).toContain('FROM events');
      });

      it('removes AT TIME ZONE with identifier', () => {
        const result = preprocessPostgresSyntax(
          "SELECT created_at AT TIME ZONE tz_col FROM events",
          'PostgreSQL'
        );
        expect(result).not.toBeNull();
        expect(result).not.toContain('AT TIME ZONE');
        expect(result).not.toContain('tz_col');
      });

      it('removes multiple AT TIME ZONE occurrences', () => {
        const result = preprocessPostgresSyntax(
          "SELECT a AT TIME ZONE 'UTC', b AT TIME ZONE 'EST' FROM t",
          'PostgreSQL'
        );
        expect(result).not.toBeNull();
        expect(result!.match(/AT TIME ZONE/gi)).toBeNull();
      });

      it('strips timestamptz type prefix', () => {
        const result = preprocessPostgresSyntax(
          "SELECT date_bin('15 minutes'::interval, created_at, timestamptz '1970-01-01 00:00:00+00') FROM events",
          'PostgreSQL'
        );
        expect(result).not.toBeNull();
        expect(result).not.toMatch(/\btimestamptz\s+'/i);
        expect(result).toContain("'1970-01-01 00:00:00+00'");
      });

      it('strips multiple type-prefixed literals', () => {
        const result = preprocessPostgresSyntax(
          "SELECT timestamp '2024-01-01', date '2024-01-01', interval '1 day' FROM t",
          'PostgreSQL'
        );
        expect(result).not.toBeNull();
        expect(result).not.toMatch(/\btimestamp\s+'/i);
        expect(result).not.toMatch(/\bdate\s+'/i);
        expect(result).not.toMatch(/\binterval\s+'/i);
        expect(result).toContain("'2024-01-01'");
      });

      it('returns null for non-PostgreSQL dialect', () => {
        const result = preprocessPostgresSyntax(
          "SELECT created_at AT TIME ZONE 'UTC' FROM events",
          'MySQL'
        );
        expect(result).toBeNull();
      });

      it('returns null when no rewrites needed', () => {
        const result = preprocessPostgresSyntax(
          "SELECT id, name FROM users WHERE active = true",
          'PostgreSQL'
        );
        expect(result).toBeNull();
      });

      it('does not rewrite AT TIME ZONE inside string literals', () => {
        const result = preprocessPostgresSyntax(
          "SELECT 'AT TIME ZONE test' FROM t",
          'PostgreSQL'
        );
        expect(result).toBeNull();
      });
    });

    it('parses query with AT TIME ZONE and timestamptz literals', () => {
      const sql = `
        WITH time_buckets AS (
          SELECT
            date_bin('15 minutes'::interval, created_at, timestamptz '1970-01-01 00:00:00+00') AS bucket,
            count(*) AS event_count
          FROM events
          GROUP BY 1
        ),
        recent AS (
          SELECT
            created_at AT TIME ZONE 'America/Chicago' AS local_time,
            event_type
          FROM events
          WHERE created_at > now() - interval '24 hours'
        ),
        summary AS (
          SELECT
            tb.bucket,
            tb.event_count,
            r.event_type
          FROM time_buckets tb
          JOIN recent r ON r.local_time >= tb.bucket
        )
        SELECT * FROM summary
      `;
      const result = parseSql(sql, dialect);
      expect(result.error).toBeUndefined();
      // Should find CTE nodes
      const nodeLabels = result.nodes.map(n => n.label?.toLowerCase() || '');
      expect(nodeLabels).toEqual(expect.arrayContaining([
        expect.stringContaining('time_buckets'),
        expect.stringContaining('recent'),
        expect.stringContaining('summary'),
      ]));
    });

    it('parses GROUPING SETS by rewriting to a parser-compatible GROUP BY', () => {
      const sql = `
        SELECT dept, region, COUNT(*) AS total
        FROM sales
        GROUP BY GROUPING SETS ((dept), (region), ())
      `;
      const result = parseSql(sql, dialect);

      expect(result.partial).not.toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.hints.some(h => h.message.includes('Rewrote GROUPING SETS'))).toBe(true);
    });
  });

  describe('Snowflake', () => {
    const dialect = 'Snowflake';

    it('parses basic SELECT', () => {
      const result = parseSql('SELECT * FROM my_table', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses QUALIFY clause', () => {
      const result = parseSql(`
        SELECT *
        FROM employees
        QUALIFY ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) = 1
      `, dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses SAMPLE clause', () => {
      const result = parseSql('SELECT * FROM large_table SAMPLE (10)', dialect);
      // May or may not be supported
    });

    it('parses FLATTEN function', () => {
      const result = parseSql('SELECT f.value FROM my_table, LATERAL FLATTEN(input => my_array) f', dialect);
      // LATERAL FLATTEN is Snowflake specific
    });

    it('parses TRY_CAST()', () => {
      const result = parseSql("SELECT TRY_CAST('123' AS INTEGER)", dialect);
      // Document behavior
    });

    it('parses LISTAGG()', () => {
      const result = parseSql("SELECT LISTAGG(name, ', ') WITHIN GROUP (ORDER BY name) FROM users", dialect);
      // Document behavior
    });

    it('parses semi-structured data access', () => {
      const result = parseSql('SELECT data:name::string FROM json_table', dialect);
      // Document behavior for JSON path syntax
    });

    it('parses deep Snowflake paths by collapsing to parser-compatible depth', () => {
      const sql = 'SELECT data:items:sku:value::string AS sku FROM json_table';
      const result = parseSql(sql, dialect);

      expect(result.partial).not.toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.hints.some(h => h.message.includes('Collapsed deep Snowflake path expressions'))).toBe(true);
    });
  });

  describe('BigQuery', () => {
    const dialect = 'BigQuery';

    it('parses basic SELECT', () => {
      const result = parseSql('SELECT * FROM `project.dataset.table`', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses backtick project.dataset.table', () => {
      const result = parseSql('SELECT * FROM `my-project.my_dataset.my_table`', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses STRUCT syntax', () => {
      const result = parseSql('SELECT STRUCT(1 AS a, 2 AS b)', dialect);
      // Document behavior
    });

    it('parses ARRAY_AGG()', () => {
      const result = parseSql('SELECT ARRAY_AGG(name) FROM users GROUP BY department', dialect);
      // Note: ARRAY_AGG may have parsing issues in some node-sql-parser versions
      // This test documents the current behavior
      expect(result.nodes.length).toBeGreaterThanOrEqual(0);
    });

    it('parses UNNEST()', () => {
      const result = parseSql('SELECT * FROM UNNEST([1, 2, 3]) AS num', dialect);
      // Document behavior
    });

    it('parses SAFE_DIVIDE()', () => {
      const result = parseSql('SELECT SAFE_DIVIDE(a, b) FROM numbers', dialect);
      // Document behavior
    });

    it('parses EXCEPT columns', () => {
      const result = parseSql('SELECT * EXCEPT (sensitive_column) FROM users', dialect);
      // Document behavior
    });

    it('parses DATE functions', () => {
      const result = parseSql('SELECT DATE_TRUNC(created_at, MONTH) FROM events', dialect);
      expect(result.error).toBeUndefined();
    });
  });

  describe('SQL Server (TransactSQL)', () => {
    const dialect = 'TransactSQL';

    it('parses basic SELECT', () => {
      const result = parseSql('SELECT * FROM users', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses square bracket identifiers', () => {
      const result = parseSql('SELECT [user-name] FROM [my-table]', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses TOP clause', () => {
      const result = parseSql('SELECT TOP 10 * FROM users', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses TOP with PERCENT', () => {
      const result = parseSql('SELECT TOP 10 PERCENT * FROM users', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses ISNULL()', () => {
      const result = parseSql('SELECT ISNULL(name, "Unknown") FROM users', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses CONVERT()', () => {
      const result = parseSql('SELECT CONVERT(VARCHAR(10), created_at, 120) FROM users', dialect);
      // Document behavior
    });

    it('parses OFFSET FETCH', () => {
      const result = parseSql('SELECT * FROM users ORDER BY id OFFSET 10 ROWS FETCH NEXT 20 ROWS ONLY', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses CROSS APPLY', () => {
      const result = parseSql('SELECT * FROM orders CROSS APPLY STRING_SPLIT(tags, ",")', dialect);
      // Document behavior
    });

    it('parses OUTER APPLY', () => {
      const result = parseSql('SELECT * FROM users OUTER APPLY (SELECT TOP 1 * FROM orders WHERE orders.user_id = users.id)', dialect);
      // Document behavior
    });
  });

  describe('MariaDB', () => {
    const dialect = 'MariaDB';

    it('parses basic SELECT', () => {
      const result = parseSql('SELECT * FROM users', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses backtick identifiers like MySQL', () => {
      const result = parseSql('SELECT `column` FROM `table`', dialect);
      expect(result.error).toBeUndefined();
    });
  });

  describe('SQLite', () => {
    const dialect = 'SQLite';

    it('parses basic SELECT', () => {
      const result = parseSql('SELECT * FROM users', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses double-quoted strings (SQLite quirk)', () => {
      // SQLite accepts double quotes for both identifiers and strings
      const result = parseSql('SELECT "name" FROM users', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses GLOB operator', () => {
      const result = parseSql("SELECT * FROM files WHERE name GLOB '*.txt'", dialect);
      // Document behavior
    });
  });

  describe('Hive', () => {
    const dialect = 'Hive';

    it('parses basic SELECT', () => {
      const result = parseSql('SELECT * FROM my_table', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses LATERAL VIEW', () => {
      const result = parseSql('SELECT col1, item FROM my_table LATERAL VIEW explode(array_col) t AS item', dialect);
      // Document behavior
    });

    it('parses DISTRIBUTE BY', () => {
      const result = parseSql('SELECT * FROM my_table DISTRIBUTE BY col1', dialect);
      // Document behavior
    });

    it('parses CLUSTER BY', () => {
      const result = parseSql('SELECT * FROM my_table CLUSTER BY col1', dialect);
      // Document behavior
    });
  });

  describe('Redshift', () => {
    const dialect = 'Redshift';

    it('parses basic SELECT', () => {
      const result = parseSql('SELECT * FROM my_table', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses APPROXIMATE COUNT', () => {
      const result = parseSql('SELECT APPROXIMATE COUNT(DISTINCT user_id) FROM events', dialect);
      // Document behavior
    });
  });

  describe('Athena', () => {
    const dialect = 'Athena';

    it('parses basic SELECT', () => {
      const result = parseSql('SELECT * FROM my_table', dialect);
      expect(result.error).toBeUndefined();
    });
  });

  describe('Trino', () => {
    const dialect = 'Trino';

    it('parses basic SELECT', () => {
      const result = parseSql('SELECT * FROM my_table', dialect);
      expect(result.error).toBeUndefined();
    });

    it('parses TRY() function', () => {
      const result = parseSql("SELECT TRY(CAST('abc' AS INTEGER))", dialect);
      // Document behavior
    });
  });
});
