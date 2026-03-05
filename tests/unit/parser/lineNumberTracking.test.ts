/**
 * Regression tests for line number tracking (Observations #3, #6, #10).
 *
 * Guards against:
 *   #3  All union nodes assigned the same source line number
 *   #6  All same-type nodes share the first line (WHERE, GROUP BY, ORDER BY, etc.)
 *   #10 lineNumbers.ts doesn't assign lines for subquery, window, or case nodes
 */

import { assignLineNumbers, extractKeywordLineNumbers } from '../../../src/webview/parser/lineNumbers';
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
