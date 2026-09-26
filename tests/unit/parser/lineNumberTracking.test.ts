/**
 * Regression tests for line number tracking (Observations #3, #6, #10).
 *
 * Guards against:
 *   #3  All union nodes assigned the same source line number
 *   #6  All same-type nodes share the first line (WHERE, GROUP BY, ORDER BY, etc.)
 *   #10 lineNumbers.ts doesn't assign lines for subquery, window, or case nodes
 * and outer-query nodes claiming keyword lines inside CTE bodies, derived
 * tables, or OVER (...) specs.
 */

import { assignLineNumbers, extractKeywordLineNumbers } from '../../../src/webview/parser/lineNumbers';
import { parseSql, parseSqlBatch } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';
import type { FlowNode } from '../../../src/webview/types';

describe('extractKeywordLineNumbers', () => {
    it('tracks multiple occurrences of the same keyword', () => {
        const sql = [
            'SELECT id FROM alpha',       // line 1: SELECT, FROM
            'WHERE id > 1',                // line 2: WHERE
            'UNION',                       // line 3: UNION
            'SELECT id FROM beta',         // line 4: SELECT, FROM
            'WHERE id < 100',              // line 5: WHERE
        ].join('\n');

        const map = extractKeywordLineNumbers(sql);

        expect(map.get('SELECT')).toEqual([1, 4]);
        expect(map.get('FROM')).toEqual([1, 4]);
        expect(map.get('WHERE')).toEqual([2, 5]);
        expect(map.get('UNION')).toEqual([3]);
    });

    it('ignores keywords inside comments', () => {
        const sql = [
            'SELECT id FROM users',
            '-- WHERE this is a comment',
            'WHERE active = 1',
        ].join('\n');

        const map = extractKeywordLineNumbers(sql);
        expect(map.get('WHERE')).toEqual([3]);
    });

    it('ignores keywords inside multiline block comments', () => {
        const sql = [
            '/*',
            'SELECT * FROM fake_table',
            'JOIN fake_join',
            '*/',
            'SELECT id FROM users',
        ].join('\n');

        const map = extractKeywordLineNumbers(sql);
        expect(map.get('SELECT')).toEqual([5]);
        expect(map.get('FROM')).toEqual([5]);
        expect(map.get('JOIN')).toBeUndefined();
    });
});

describe('Audit regression: #3 — Union nodes get distinct line numbers', () => {
    it('each UNION node gets its own line, not all pointing to the first', () => {
        const sql = [
            'SELECT id FROM alpha',       // line 1
            'UNION',                       // line 2
            'SELECT id FROM beta',         // line 3
            'UNION',                       // line 4
            'SELECT id FROM gamma',        // line 5
        ].join('\n');

        const nodes: FlowNode[] = [
            { id: 'u1', type: 'union', label: 'UNION', x: 0, y: 0, width: 100, height: 32 },
            { id: 'u2', type: 'union', label: 'UNION', x: 0, y: 0, width: 100, height: 32 },
        ];

        assignLineNumbers(nodes, sql);

        expect(nodes[0].startLine).toBe(2);
        expect(nodes[1].startLine).toBe(4);
        // They must be different
        expect(nodes[0].startLine).not.toBe(nodes[1].startLine);
    });
});

describe('Audit regression: #6 — Each node type uses next unused line', () => {
    it('multiple WHERE nodes get distinct lines', () => {
        const sql = [
            'SELECT id FROM alpha',       // line 1
            'WHERE x = 1',                // line 2
            'UNION',                       // line 3
            'SELECT id FROM beta',         // line 4
            'WHERE y = 2',                // line 5
        ].join('\n');

        const nodes: FlowNode[] = [
            { id: 'w1', type: 'filter', label: 'WHERE', x: 0, y: 0, width: 100, height: 32 },
            { id: 'w2', type: 'filter', label: 'WHERE', x: 0, y: 0, width: 100, height: 32 },
        ];

        assignLineNumbers(nodes, sql);

        expect(nodes[0].startLine).toBe(2);
        expect(nodes[1].startLine).toBe(5);
    });

    it('multiple GROUP BY nodes get distinct lines', () => {
        const sql = [
            'SELECT dept, COUNT(*) FROM employees', // line 1
            'GROUP BY dept',                         // line 2
            'UNION',                                 // line 3
            'SELECT city, COUNT(*) FROM offices',    // line 4
            'GROUP BY city',                          // line 5
        ].join('\n');

        const nodes: FlowNode[] = [
            { id: 'g1', type: 'aggregate', label: 'GROUP BY', x: 0, y: 0, width: 100, height: 32 },
            { id: 'g2', type: 'aggregate', label: 'GROUP BY', x: 0, y: 0, width: 100, height: 32 },
        ];

        assignLineNumbers(nodes, sql);

        expect(nodes[0].startLine).toBe(2);
        expect(nodes[1].startLine).toBe(5);
    });

    it('multiple ORDER BY nodes get distinct lines', () => {
        const sql = [
            'SELECT id FROM alpha',       // line 1
            'ORDER BY id',                 // line 2
            'UNION',                       // line 3
            'SELECT id FROM beta',         // line 4
            'ORDER BY id DESC',            // line 5
        ].join('\n');

        const nodes: FlowNode[] = [
            { id: 's1', type: 'sort', label: 'ORDER BY', x: 0, y: 0, width: 100, height: 32 },
            { id: 's2', type: 'sort', label: 'ORDER BY', x: 0, y: 0, width: 100, height: 32 },
        ];

        assignLineNumbers(nodes, sql);

        expect(nodes[0].startLine).toBe(2);
        expect(nodes[1].startLine).toBe(5);
    });

    it('multiple SELECT nodes get distinct lines', () => {
        const sql = [
            'SELECT id FROM alpha',       // line 1
            'UNION',                       // line 2
            'SELECT id FROM beta',         // line 3
        ].join('\n');

        const nodes: FlowNode[] = [
            { id: 'sel1', type: 'select', label: 'SELECT', x: 0, y: 0, width: 100, height: 32 },
            { id: 'sel2', type: 'select', label: 'SELECT', x: 0, y: 0, width: 100, height: 32 },
        ];

        assignLineNumbers(nodes, sql);

        expect(nodes[0].startLine).toBe(1);
        expect(nodes[1].startLine).toBe(3);
    });

    it('multiple LIMIT nodes get distinct lines', () => {
        const sql = [
            'SELECT id FROM alpha',       // line 1
            'LIMIT 10',                    // line 2
            'UNION',                       // line 3
            'SELECT id FROM beta',         // line 4
            'LIMIT 20',                    // line 5
        ].join('\n');

        const nodes: FlowNode[] = [
            { id: 'l1', type: 'limit', label: 'LIMIT', x: 0, y: 0, width: 100, height: 32 },
            { id: 'l2', type: 'limit', label: 'LIMIT', x: 0, y: 0, width: 100, height: 32 },
        ];

        assignLineNumbers(nodes, sql);

        expect(nodes[0].startLine).toBe(2);
        expect(nodes[1].startLine).toBe(5);
    });

    it('HAVING nodes get distinct lines', () => {
        const sql = [
            'SELECT dept, COUNT(*) FROM employees', // line 1
            'GROUP BY dept',                         // line 2
            'HAVING COUNT(*) > 5',                   // line 3
            'UNION',                                 // line 4
            'SELECT city, COUNT(*) FROM offices',    // line 5
            'GROUP BY city',                         // line 6
            'HAVING COUNT(*) > 10',                  // line 7
        ].join('\n');

        const nodes: FlowNode[] = [
            { id: 'h1', type: 'filter', label: 'HAVING', x: 0, y: 0, width: 100, height: 32 },
            { id: 'h2', type: 'filter', label: 'HAVING', x: 0, y: 0, width: 100, height: 32 },
        ];

        assignLineNumbers(nodes, sql);

        expect(nodes[0].startLine).toBe(3);
        expect(nodes[1].startLine).toBe(7);
    });
});

describe('Audit regression: #10 — subquery, window, case nodes get startLine', () => {
    it('subquery node gets a SELECT line', () => {
        const sql = [
            'SELECT id,',                            // line 1
            '  (SELECT MAX(score) FROM scores) top',  // line 2
            'FROM users',                             // line 3
        ].join('\n');

        const nodes: FlowNode[] = [
            { id: 'sq1', type: 'subquery', label: 'Subquery', x: 0, y: 0, width: 100, height: 32 },
        ];

        assignLineNumbers(nodes, sql);
        expect(nodes[0].startLine).toBeDefined();
    });

    it('window node gets a SELECT line', () => {
        const sql = [
            'SELECT id,',                                             // line 1
            '  ROW_NUMBER() OVER (PARTITION BY dept ORDER BY id) rn', // line 2
            'FROM users',                                             // line 3
        ].join('\n');

        const nodes: FlowNode[] = [
            { id: 'w1', type: 'window', label: 'Window', x: 0, y: 0, width: 100, height: 32 },
        ];

        assignLineNumbers(nodes, sql);
        expect(nodes[0].startLine).toBeDefined();
    });

    it('case node gets a SELECT line', () => {
        const sql = [
            'SELECT',                                       // line 1
            '  CASE WHEN status = 1 THEN "active" END st',  // line 2
            'FROM users',                                    // line 3
        ].join('\n');

        const nodes: FlowNode[] = [
            { id: 'c1', type: 'case', label: 'CASE', x: 0, y: 0, width: 100, height: 32 },
        ];

        assignLineNumbers(nodes, sql);
        expect(nodes[0].startLine).toBeDefined();
    });
});

describe('Outer-query nodes skip keywords nested in CTEs, subqueries, and OVER (...)', () => {
    const lineOf = (nodes: FlowNode[], type: FlowNode['type'], label?: string): number | undefined =>
        nodes.find(n => n.type === type && (label === undefined || n.label === label))?.startLine;

    it('maps every outer node of a CTE + window query to its own clause', () => {
        const sql = [
            'WITH recent AS (',                                                     // 1
            '    SELECT customer_id, SUM(amount) AS total',                         // 2
            '    FROM orders',                                                      // 3
            "    WHERE order_date >= '2026-01-01'",                                 // 4
            '    GROUP BY customer_id',                                             // 5
            ')',                                                                    // 6
            'SELECT',                                                               // 7
            '    c.name,',                                                          // 8
            '    c.region,',                                                        // 9
            '    r.total,',                                                         // 10
            '    RANK() OVER (PARTITION BY c.region ORDER BY r.total DESC) AS rnk', // 11
            'FROM customers c',                                                     // 12
            'JOIN recent r ON c.id = r.customer_id',                                // 13
            'WHERE r.total > 1000',                                                 // 14
            'ORDER BY rnk;',                                                        // 15
        ].join('\n');

        const { nodes } = parseSql(sql, 'PostgreSQL' as SqlDialect);

        expect(lineOf(nodes, 'cte', 'WITH recent')).toBe(1);
        expect(lineOf(nodes, 'select')).toBe(7);
        expect(lineOf(nodes, 'window')).toBe(11);
        expect(lineOf(nodes, 'table', 'customers')).toBe(12);
        expect(lineOf(nodes, 'table', 'recent')).toBe(13);
        expect(lineOf(nodes, 'join')).toBe(13);
        expect(lineOf(nodes, 'filter', 'WHERE')).toBe(14);
        expect(lineOf(nodes, 'sort')).toBe(15);
        expect(lineOf(nodes, 'result')).toBe(7);
    });

    it('locates each CTE definition and outer tables shared with CTE bodies', () => {
        const sql = [
            'WITH a AS (',                       // 1
            '  SELECT id FROM orders',           // 2
            '),',                                // 3
            'b AS (',                            // 4
            '  SELECT id FROM orders',           // 5
            '  WHERE x > 1',                     // 6
            ')',                                 // 7
            'SELECT *',                          // 8
            'FROM a',                            // 9
            'JOIN b ON a.id = b.id',             // 10
            'JOIN orders o ON o.id = a.id',      // 11
        ].join('\n');

        const { nodes } = parseSql(sql, 'PostgreSQL' as SqlDialect);

        expect(lineOf(nodes, 'cte', 'WITH a')).toBe(1);
        expect(lineOf(nodes, 'cte', 'WITH b')).toBe(4);
        expect(lineOf(nodes, 'table', 'b')).toBe(10);
        expect(lineOf(nodes, 'table', 'orders')).toBe(11);
        expect(nodes.filter(n => n.type === 'join').map(n => n.startLine)).toEqual([10, 11]);
        expect(lineOf(nodes, 'select')).toBe(8);
    });

    it('keeps derived-table clauses for the subquery node', () => {
        const sql = [
            'SELECT s.id',        // 1
            'FROM (',             // 2
            '  SELECT id FROM t', // 3
            '  WHERE x = 1',      // 4
            '  ORDER BY id',      // 5
            ') s',                // 6
            'WHERE s.id > 3',     // 7
            'ORDER BY s.id',      // 8
        ].join('\n');

        const { nodes } = parseSql(sql, 'PostgreSQL' as SqlDialect);

        expect(lineOf(nodes, 'subquery', 's')).toBe(3);
        expect(lineOf(nodes, 'select')).toBe(1);
        expect(lineOf(nodes, 'filter', 'WHERE')).toBe(7);
        expect(lineOf(nodes, 'sort')).toBe(8);
    });

    it('anchors tables, CASE, and WHERE past scalar subqueries in the select list', () => {
        const sql = [
            'SELECT id,',                                          // 1
            '  (SELECT MAX(v) FROM w WHERE w.id = u.id) mx,',      // 2
            "  CASE WHEN a = 1 THEN 'x' END c",                    // 3
            'FROM u',                                              // 4
            'WHERE id IN (SELECT id FROM z WHERE q = 1)',          // 5
        ].join('\n');

        const { nodes } = parseSql(sql, 'PostgreSQL' as SqlDialect);

        expect(lineOf(nodes, 'table', 'u')).toBe(4);
        expect(lineOf(nodes, 'table', 'w')).toBe(2);
        expect(lineOf(nodes, 'case')).toBe(3);
        expect(lineOf(nodes, 'filter', 'WHERE')).toBe(5);
        expect(lineOf(nodes, 'select')).toBe(1);
    });

    it('treats parenthesized set-operation branches as outer-query scope', () => {
        const sql = [
            '(SELECT a FROM t WHERE x = 1)', // 1
            'UNION',                         // 2
            'SELECT b FROM u WHERE y = 2',   // 3
        ].join('\n');

        const nodes: FlowNode[] = [
            { id: 'w1', type: 'filter', label: 'WHERE', x: 0, y: 0, width: 100, height: 32 },
            { id: 'w2', type: 'filter', label: 'WHERE', x: 0, y: 0, width: 100, height: 32 },
            { id: 'u1', type: 'union', label: 'UNION', x: 0, y: 0, width: 100, height: 32 },
        ];

        assignLineNumbers(nodes, sql);

        expect(nodes.map(n => n.startLine)).toEqual([1, 3, 2]);
    });

    it('does not treat a SELECT-list column as a comma-listed table', () => {
        const sql = [
            'SELECT a, b', // 1
            'FROM t, b',   // 2
        ].join('\n');

        const { nodes } = parseSql(sql, 'PostgreSQL' as SqlDialect);

        expect(lineOf(nodes, 'table', 't')).toBe(2);
        expect(lineOf(nodes, 'table', 'b')).toBe(2);
    });

    it('keeps quoted and unquoted references to one table in source order', () => {
        const sql = [
            'SELECT a.id',                  // 1
            'FROM "orders" a',              // 2
            'JOIN orders b ON a.id = b.id', // 3
        ].join('\n');

        const { nodes } = parseSql(sql, 'PostgreSQL' as SqlDialect);

        expect(nodes.filter(n => n.type === 'table' && n.label === 'orders').map(n => n.startLine))
            .toEqual([2, 3]);
    });

    it('points a derived table with its own WITH at its SELECT, not the CTE body', () => {
        const sql = [
            'SELECT s.x',                        // 1
            'FROM (WITH c AS (SELECT 1 AS x)',   // 2
            '  SELECT x FROM c) s',              // 3
        ].join('\n');

        const { nodes } = parseSql(sql, 'PostgreSQL' as SqlDialect);

        expect(lineOf(nodes, 'subquery', 's')).toBe(3);
        expect(lineOf(nodes, 'select')).toBe(1);
    });

    it('ignores parentheses inside string literals and comments', () => {
        const sql = [
            'WITH x AS (',                          // 1
            "  SELECT id FROM t WHERE note = ')('", // 2
            ')',                                    // 3
            'SELECT id -- (',                       // 4
            'FROM x',                               // 5
            'WHERE id > 0',                         // 6
        ].join('\n');

        const nodes: FlowNode[] = [
            { id: 'w', type: 'filter', label: 'WHERE', x: 0, y: 0, width: 100, height: 32 },
            { id: 's', type: 'select', label: 'SELECT', x: 0, y: 0, width: 100, height: 32 },
        ];

        assignLineNumbers(nodes, sql);

        expect(nodes[0].startLine).toBe(6);
        expect(nodes[1].startLine).toBe(4);
    });
});

describe('Expanded query child navigation', () => {
    it('assigns children their own clause lines and bounds the CTE body', () => {
        const sql = [
            'WITH c AS (',
            '  SELECT id FROM orders',
            '  WHERE id > 1',
            '  GROUP BY id',
            ')',
            'SELECT id FROM c',
        ].join('\n');
        const { nodes } = parseSql(sql, 'PostgreSQL' as SqlDialect);
        const cte = nodes.find(node => node.type === 'cte');
        expect(cte?.endLine).toBe(5);
        expect(cte?.children?.map(child => [child.type, child.startLine])).toEqual([
            ['table', 2], ['filter', 3], ['aggregate', 4], ['select', 2],
        ]);
    });

    it('offsets child lines to file lines in a later statement', () => {
        const sql = 'SELECT 1;\n\n-- orders pipeline\nWITH x AS (\n SELECT id FROM orders\n) SELECT * FROM x';
        const batch = parseSqlBatch(sql, 'PostgreSQL' as SqlDialect);
        const cte = batch.queries[1].nodes.find(node => node.type === 'cte');
        expect(cte?.startLine).toBe(4);
        expect(cte?.children?.find(child => child.type === 'table')?.startLine).toBe(5);
    });

    it('assigns derived table children within their parenthesized source', () => {
        const sql = 'SELECT *\nFROM (\n SELECT id FROM orders\n WHERE id > 1\n) s';
        const { nodes } = parseSql(sql, 'PostgreSQL' as SqlDialect);
        const derived = nodes.find(node => node.type === 'subquery');
        expect(derived?.endLine).toBe(5);
        expect(derived?.children?.find(child => child.type === 'filter')?.startLine).toBe(4);
    });

    it('keeps nested and enclosing SELECT children at their own depths', () => {
        const sql = [
            'WITH c AS (',
            ' SELECT * FROM (',
            '  SELECT id FROM orders',
            '  WHERE id > 1',
            ' ) s',
            ') SELECT * FROM c',
        ].join('\n');
        const { nodes } = parseSql(sql, 'PostgreSQL' as SqlDialect);
        const selects = nodes.find(node => node.type === 'cte')?.children
            ?.filter(child => child.type === 'select');
        expect(selects?.map(child => child.startLine)).toEqual([3, 2]);
    });
});

describe('SELECT edge source navigation', () => {
    it('anchors JOIN, ON, and WHERE edges to their original clauses', () => {
        const sql = [
            'SELECT a.id',
            'FROM a',
            'JOIN b',
            '  ON a.id = b.id',
            'WHERE a.id > 1',
        ].join('\n');
        const { edges } = parseSql(sql, 'PostgreSQL' as SqlDialect);
        const lineOf = (clauseType: string): number | undefined =>
            edges.find(edge => edge.clauseType === clauseType)?.startLine;
        expect(lineOf('join')).toBe(3);
        expect(lineOf('on')).toBe(4);
        expect(lineOf('where')).toBe(5);
    });

    it('offsets edge lines in a later statement to file coordinates', () => {
        const sql = 'SELECT 1;\n\nSELECT a.id\nFROM a\nJOIN b ON a.id = b.id\nWHERE a.id > 1';
        const batch = parseSqlBatch(sql, 'PostgreSQL' as SqlDialect);
        const edges = batch.queries[1].edges;
        expect(edges.find(edge => edge.clauseType === 'on')?.startLine).toBe(5);
        expect(edges.find(edge => edge.clauseType === 'where')?.startLine).toBe(6);
    });

    it('keeps ON edges paired with their own JOIN', () => {
        const sql = [
            'SELECT a.id FROM a',
            'JOIN b ON a.id = b.id',
            'LEFT JOIN c',
            '  ON b.id = c.id',
        ].join('\n');
        const { edges } = parseSql(sql, 'PostgreSQL' as SqlDialect);
        expect(edges.filter(edge => edge.clauseType === 'join').map(edge => edge.startLine)).toEqual([2, 3]);
        expect(edges.filter(edge => edge.clauseType === 'on').map(edge => edge.startLine)).toEqual([2, 4]);
    });
});
