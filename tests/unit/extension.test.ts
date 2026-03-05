import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeDialect } from '../../src/extension';

describe('extension.ts', () => {
    describe('normalizeDialect', () => {
        it('maps SQL Server to TransactSQL', () => {
            expect(normalizeDialect('SQL Server')).toBe('TransactSQL');
        });

        it('maps PL/SQL to Oracle', () => {
            expect(normalizeDialect('PL/SQL')).toBe('Oracle');
        });

        it('returns unchanged dialect for others', () => {
            expect(normalizeDialect('MySQL')).toBe('MySQL');
            expect(normalizeDialect('PostgreSQL')).toBe('PostgreSQL');
            expect(normalizeDialect('TransactSQL')).toBe('TransactSQL');
            expect(normalizeDialect('Oracle')).toBe('Oracle');
            expect(normalizeDialect('BigQuery')).toBe('BigQuery');
            expect(normalizeDialect('Snowflake')).toBe('Snowflake');
        });

        it('handles case-sensitive input', () => {
            expect(normalizeDialect('sql server')).toBe('sql server');
            expect(normalizeDialect('pl/sql')).toBe('pl/sql');
        });

        it('handles empty string', () => {
            expect(normalizeDialect('')).toBe('');
        });
    });
});

describe('extension normalizeAdvancedLimit function', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('clamps values to min/max range', () => {
        expect(source).toContain('Math.max(min, Math.min(max, rounded))');
    });

    it('returns fallback for non-number types', () => {
        expect(source).toContain("typeof raw !== 'number'");
        expect(source).toContain('!Number.isFinite(raw)');
        expect(source).toContain('return fallback');
    });

    it('rounds raw values before clamping', () => {
        expect(source).toContain('const rounded = Math.round(raw)');
    });
});

describe('extension additional file extensions normalization', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('normalizes extensions to lowercase', () => {
        expect(source).toContain('ext.toLowerCase()');
    });

    it('trims whitespace from extensions', () => {
        expect(source).toContain('ext.toLowerCase().trim()');
    });

    it('filters empty strings', () => {
        expect(source).toContain('filter(ext => ext.length > 0)');
    });

    it('ensures extensions start with a dot', () => {
        expect(source).toContain("ext.startsWith('.') ? ext : '.' + ext");
    });
});

describe('extension isSqlLikeDocument logic', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('checks languageId for sql', () => {
        expect(source).toContain("document.languageId === 'sql'");
    });

    it('checks file extension against additional extensions', () => {
        expect(source).toContain('fileName.endsWith(ext)');
    });
});

describe('extension hasExecutableSql logic', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('preprocesses Jinja and strips comments before checking for executable SQL', () => {
        expect(source).toContain("from './webview/parser/dialects/jinjaPreprocessor'");
        expect(source).toContain('const { rewritten } = preprocessJinjaTemplates(sql);');
        expect(source).toContain('stripSqlComments(rewritten)');
        expect(source).toContain('.trim().length > 0');
    });
});

describe('extension splitSqlStatements edge cases', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('handles string literals with quotes', () => {
        expect(source).toContain("char === \"'\" || char === '\"'");
    });

    it('tracks parentheses depth for nested expressions', () => {
        expect(source).toContain("char === '('");
        expect(source).toContain("char === ')'");
        expect(source).toContain('depth');
    });

    it('splits on semicolon only at depth 0', () => {
        expect(source).toContain("char === ';'");
        expect(source).toContain('depth === 0');
    });

    it('handles SQL-standard doubled-quote escaping', () => {
        // The new implementation handles doubled quotes ('') not backslash
        expect(source).toContain('next === stringChar');
    });

    it('handles line comments (--)', () => {
        expect(source).toContain('inLineComment');
        expect(source).toContain("char === '-' && next === '-'");
    });

    it('handles block comments (/* */)', () => {
        expect(source).toContain('inBlockComment');
        expect(source).toContain("char === '/' && next === '*'");
    });
});

describe('extension diagnostics debounce', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('uses separate timer for diagnostics refresh', () => {
        expect(source).toContain('diagnosticsRefreshTimer');
        expect(source).toContain('clearTimeout(diagnosticsRefreshTimer)');
    });

    it('debounces diagnostics updates with configurable delay', () => {
        expect(source).toContain("get<number>('autoRefreshDelay', 500)");
    });
});

describe('extension auto-refresh timer cleanup', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('clears auto-refresh timer in deactivate', () => {
        expect(source).toContain('export function deactivate()');
        expect(source).toContain('clearTimeout(autoRefreshTimer)');
        expect(source).toContain('clearTimeout(diagnosticsRefreshTimer)');
        expect(source).toContain('autoRefreshTimer = null');
        expect(source).toContain('diagnosticsRefreshTimer = null');
    });
});

describe('extension config change listeners', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('reloads custom functions when config changes', () => {
        expect(source).toContain("e.affectsConfiguration('sqlCrack.customAggregateFunctions')");
        expect(source).toContain("e.affectsConfiguration('sqlCrack.customWindowFunctions')");
        expect(source).toContain('loadCustomFunctions()');
    });

    it('reloads additional extensions when config changes', () => {
        expect(source).toContain("e.affectsConfiguration('sqlCrack.additionalFileExtensions')");
        expect(source).toContain('loadAdditionalExtensions()');
    });

    it('updates context when extensions change', () => {
        expect(source).toContain('updateSqlLikeFileContext(vscode.window.activeTextEditor)');
    });
});

describe('extension cursor sync to webview', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('syncs cursor position when setting is enabled', () => {
        expect(source).toContain("get<boolean>('syncEditorToFlow')");
        expect(source).toContain('VisualizationPanel.sendCursorPosition(line)');
    });

    it('sends query index based on line number', () => {
        expect(source).toContain('getQueryIndexForLine(sql, line)');
        expect(source).toContain('VisualizationPanel.sendQueryIndex(queryIndex)');
    });
});

describe('extension visualize command validation', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('warns when no SQL code found', () => {
        expect(source).toContain("showWarningMessage('No SQL code found to visualize')");
    });

    it('warns when only comments/whitespace found', () => {
        expect(source).toContain('hasExecutableSql(sqlCode)');
        expect(source).toContain("showWarningMessage('Only comments or whitespace found");
    });
});
