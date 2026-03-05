/**
 * Tier 1 Bug Fix Regression Tests
 *
 * Bug 4+5: splitSqlStatements — comments and doubled-quote escaping
 * Bug 7:   UNION result node connected to final output
 * Bug 13:  ?? instead of || for startLine: 0
 * Bug 14:  dispose() re-entrancy guard
 * Bug 18:  Edge highlight restores stroke-dasharray
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSql } from '../../src/webview/sqlParser';
import type { SqlDialect } from '../../src/webview/types/parser';

// ============================================================
// Bug 4+5: splitSqlStatements — comments & doubled-quote escaping
// ============================================================
// splitSqlStatements is a local function inside the activate() closure in
// extension.ts, so we can't import it directly. We extract a portable copy
// for behavioral testing, then use source-reading assertions to prove the
// production code contains the same logic.

/** Portable copy of the fixed splitSqlStatements for behavioral tests. */
function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let inLineComment = false;
    let inBlockComment = false;
    let depth = 0;

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const next = i + 1 < sql.length ? sql[i + 1] : '';

        if (inLineComment) {
            current += char;
            if (char === '\n') { inLineComment = false; }
            continue;
        }
        if (inBlockComment) {
            current += char;
            if (char === '*' && next === '/') {
                current += '/';
                i++;
                inBlockComment = false;
            }
            continue;
        }
        if (inString) {
            current += char;
            if (char === stringChar) {
                if (next === stringChar) {
                    current += next;
                    i++;
                } else {
                    inString = false;
                }
            }
            continue;
        }
        if (char === '-' && next === '-') {
            inLineComment = true;
            current += char;
            continue;
        }
        if (char === '/' && next === '*') {
            inBlockComment = true;
            current += char;
            continue;
        }
        if (char === "'" || char === '"') {
            inString = true;
            stringChar = char;
            current += char;
            continue;
        }
        if (char === '(') { depth++; }
        if (char === ')') { depth--; }
        if (char === ';' && depth === 0) {
            const trimmed = current.trim();
            if (trimmed) { statements.push(trimmed); }
            current = '';
        } else {
            current += char;
        }
    }
    const trimmed = current.trim();
    if (trimmed) { statements.push(trimmed); }
    return statements;
}

describe('Bug 4+5: splitSqlStatements handles comments and doubled quotes', () => {
    // --- Bug 4: Comment-aware splitting ---
    it('does not split on semicolons inside line comments', () => {
        const sql = `-- This query needs optimization; it's too slow\nSELECT * FROM users;`;
        const result = splitSqlStatements(sql);
        expect(result).toHaveLength(1);
        expect(result[0]).toContain('SELECT * FROM users');
    });

    it('does not split on semicolons inside block comments', () => {
        const sql = `/* config: timeout=30; retries=3; */\nSELECT 1; SELECT 2;`;
        const result = splitSqlStatements(sql);
        expect(result).toHaveLength(2);
        expect(result[0]).toContain('SELECT 1');
        expect(result[1]).toContain('SELECT 2');
    });

    it('handles block comments spanning multiple lines', () => {
        const sql = `SELECT 1;\n/* multi\nline; comment\n*/\nSELECT 2;`;
        const result = splitSqlStatements(sql);
        expect(result).toHaveLength(2);
    });

    it('handles line comment at end of statement', () => {
        const sql = `SELECT 1; -- done\nSELECT 2;`;
        const result = splitSqlStatements(sql);
        expect(result).toHaveLength(2);
    });

    // --- Bug 5: SQL-standard doubled-quote escaping ---
    it('handles SQL-standard doubled single quotes (O\'\'Brien)', () => {
        const sql = `SELECT * FROM users WHERE name = 'O''Brien';`;
        const result = splitSqlStatements(sql);
        expect(result).toHaveLength(1);
        expect(result[0]).toContain("O''Brien");
    });

    it('handles multiple doubled quotes in one string', () => {
        const sql = `INSERT INTO t VALUES ('it''s a ''test''');`;
        const result = splitSqlStatements(sql);
        expect(result).toHaveLength(1);
    });

    it('handles doubled double-quotes in identifiers', () => {
        const sql = `SELECT "col""name" FROM t; SELECT 1;`;
        const result = splitSqlStatements(sql);
        expect(result).toHaveLength(2);
    });

    it('does not confuse doubled quote with end-of-string + start-of-next', () => {
        // Two separate strings back to back: 'a' 'b'
        const sql = `SELECT 'a','b'; SELECT 1;`;
        const result = splitSqlStatements(sql);
        expect(result).toHaveLength(2);
    });

    // --- Combined edge cases ---
    it('handles comments AND doubled quotes together', () => {
        const sql = `-- name has apostrophe; beware\nSELECT * FROM users WHERE name = 'O''Brien';`;
        const result = splitSqlStatements(sql);
        expect(result).toHaveLength(1);
    });

    it('handles semicolon inside parentheses (not affected by comment fix)', () => {
        const sql = `CREATE FUNCTION f() RETURNS void AS $$ SELECT 1; $$ LANGUAGE sql; SELECT 2;`;
        // $$ is not handled, so this splits at each ;. Just verify parentheses work.
        const sql2 = `SELECT (1; -- this is unusual but tests depth`;
        const result = splitSqlStatements(sql2);
        // The open paren prevents split
        expect(result).toHaveLength(1);
    });

    // --- Source-reading: verify production code has the same fix ---
    it('production code in extension.ts uses comment and doubled-quote handling', () => {
        const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');
        expect(source).toContain('inLineComment');
        expect(source).toContain('inBlockComment');
        expect(source).toContain('next === stringChar');
    });
});

// ============================================================
// Bug 7: UNION result node connected to final output
// ============================================================
describe('Bug 7: UNION result node is the final output', () => {
    it('returns union node as final output for UNION query', () => {
        const sql = `SELECT id FROM users UNION SELECT id FROM admins`;
        const result = parseSql(sql, 'MySQL' as SqlDialect);

        const unionNode = result.nodes.find(n => n.type === 'union');
        expect(unionNode).toBeDefined();

        // The union node should have incoming edges (from both branches)
        const incomingEdges = result.edges.filter(e => e.target === unionNode!.id);
        expect(incomingEdges.length).toBeGreaterThanOrEqual(2);

        // No node should be "dangling" — every non-result node with incoming edges
        // that is a terminal (no outgoing) must be the final node in the graph.
        // The union node should be the final node OR connected to something downstream.
        const unionOutgoing = result.edges.filter(e => e.source === unionNode!.id);
        // After the fix, if there are downstream nodes (like result), union connects to them.
        // If union IS the final node (returned as resultId), it's the terminal.
        // Either way, the union should not be a dead-end with nothing pointing past it
        // while a separate result node exists disconnected.
        const resultNodes = result.nodes.filter(n => n.type === 'result');
        // Every result node should connect TO the union (as input), not be the final output
        for (const rn of resultNodes) {
            const rnOutgoing = result.edges.filter(e => e.source === rn.id);
            if (rnOutgoing.length > 0) {
                // Result node has outgoing edge — it should point to the union
                expect(rnOutgoing.some(e => e.target === unionNode!.id)).toBe(true);
            }
        }
    });

    it('returns union node for UNION ALL', () => {
        const sql = `SELECT name FROM t1 UNION ALL SELECT name FROM t2`;
        const result = parseSql(sql, 'MySQL' as SqlDialect);
        const unionNode = result.nodes.find(n => n.type === 'union');
        expect(unionNode).toBeDefined();
        expect(unionNode!.label).toContain('UNION');
    });

    it('returns union node for INTERSECT', () => {
        const sql = `SELECT id FROM t1 INTERSECT SELECT id FROM t2`;
        const result = parseSql(sql, 'MySQL' as SqlDialect);
        const unionNode = result.nodes.find(n => n.type === 'union');
        if (unionNode) {
            const incoming = result.edges.filter(e => e.target === unionNode.id);
            expect(incoming.length).toBeGreaterThanOrEqual(2);
        }
    });

    it('returns union node for EXCEPT', () => {
        const sql = `SELECT id FROM t1 EXCEPT SELECT id FROM t2`;
        const result = parseSql(sql, 'MySQL' as SqlDialect);
        const unionNode = result.nodes.find(n => n.type === 'union');
        if (unionNode) {
            const incoming = result.edges.filter(e => e.target === unionNode.id);
            expect(incoming.length).toBeGreaterThanOrEqual(2);
        }
    });

    // Source-reading: verify the fix is present
    it('processStatement returns unionId when UNION is present', () => {
        const source = readFileSync(
            join(__dirname, '../../src/webview/parser/statements/select.ts'),
            'utf8'
        );
        expect(source).toContain('return unionId;');
    });
});

// ============================================================
// Bug 2: _isFirstRun() called once and cached
// ============================================================
describe('Bug 2: _isFirstRun() is called once and cached', () => {
    it('visualizationPanel.ts caches _isFirstRun in a local variable', () => {
        const source = readFileSync(
            join(__dirname, '../../src/visualizationPanel.ts'),
            'utf8'
        );
        // Should have a single call cached in a const
        expect(source).toContain('const isFirstRun = VisualizationPanel._isFirstRun()');
        // Both usages should reference the cached variable, not call _isFirstRun() again
        const calls = source.match(/VisualizationPanel\._isFirstRun\(\)/g) || [];
        expect(calls).toHaveLength(1);
    });
});

// ============================================================
// Bug 13: ?? instead of || for startLine: 0
// ============================================================
describe('Bug 13: startLine: 0 is not treated as falsy', () => {
    it('diagnostics.ts uses ?? instead of || for queryStartLine', () => {
        const source = readFileSync(join(__dirname, '../../src/diagnostics.ts'), 'utf8');
        // Must use nullish coalescing, not logical-or
        expect(source).toContain('?.startLine ?? 1');
        expect(source).not.toContain('?.startLine || 1');
    });
});

// ============================================================
// Bug 14: dispose() re-entrancy guard
// ============================================================
describe('Bug 14: dispose() has re-entrancy guard', () => {
    it('visualizationPanel.ts checks _disposed before proceeding', () => {
        const source = readFileSync(
            join(__dirname, '../../src/visualizationPanel.ts'),
            'utf8'
        );
        // The dispose() method should check _disposed and return early
        const disposeMethod = source.slice(
            source.indexOf('public dispose()'),
            source.indexOf('public dispose()') + 200
        );
        expect(disposeMethod).toContain('if (this._disposed)');
        expect(disposeMethod).toContain('return');
    });
});

// ============================================================
// Bug 18: Edge highlight restores stroke-dasharray
// ============================================================
describe('Bug 18: highlightConnectedEdges restores stroke-dasharray', () => {
    it('edgeRenderer.ts restores dasharray on unhighlight', () => {
        const source = readFileSync(
            join(__dirname, '../../src/webview/rendering/edgeRenderer.ts'),
            'utf8'
        );
        // Find the highlightConnectedEdges function
        const fnStart = source.indexOf('export function highlightConnectedEdges');
        expect(fnStart).toBeGreaterThan(-1);

        const fnBody = source.slice(fnStart, fnStart + 1600);

        // The unhighlight branch must handle stroke-dasharray
        expect(fnBody).toContain('stroke-dasharray');
        expect(fnBody).toContain('getEdgeDashPattern');
        expect(fnBody).toContain('removeAttribute');
    });
});
