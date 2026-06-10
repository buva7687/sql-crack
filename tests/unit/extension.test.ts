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

    it('delegates validation/normalization to the shared normalizer', () => {
        // Glob/path validation now lives in shared/fileExtensions so all consumers
        // share it; see tests/unit/shared/fileExtensions.test.ts for the behavior.
        expect(source).toContain("from './shared/fileExtensions'");
        expect(source).toContain("normalizeFileExtensions(config.get<string[]>('additionalFileExtensions'))");
    });

    it('prefixes a dot for endsWith-based file matching', () => {
        expect(source).toContain(".map(ext => '.' + ext)");
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

describe('extension diagnostics debounce', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('debounces diagnostics per document URI so files do not starve each other', () => {
        // A single shared timer let one file's edit cancel another's pending
        // refresh; timers must be keyed by document URI instead.
        expect(source).toContain('diagnosticsRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>()');
        expect(source).toContain('const docKey = e.document.uri.toString();');
        expect(source).toContain('diagnosticsRefreshTimers.get(docKey)');
        expect(source).toContain('diagnosticsRefreshTimers.set(docKey,');
        expect(source).toContain('diagnosticsRefreshTimers.delete(docKey);');
    });

    it('cancels a document\'s pending diagnostics timer when it closes', () => {
        expect(source).toContain('onDidCloseTextDocument');
        expect(source).toContain('const pendingTimer = diagnosticsRefreshTimers.get(docKey);');
    });

    it('debounces diagnostics updates with configurable delay', () => {
        expect(source).toContain("get<number>('autoRefreshDelay', 500)");
    });
});

describe('extension auto-refresh scoping', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('only refreshes the panel when the changed doc is the visualization source', () => {
        // Editing an unrelated SQL file must not hijack the active visualization.
        // The refresh gate must depend solely on the source-document match, not on
        // whether the changed document merely happens to be SQL-like.
        expect(source).toContain('if (isSourceDoc && VisualizationPanel.currentPanel) {');
        expect(source).not.toContain('if ((isSqlLikeDocument(e.document) || isSourceDoc)');
        expect(source).toContain('e.document.uri.toString() === sourceUri.toString()');
    });

    it('re-validates the source at debounce fire time before refreshing', () => {
        // The panel may switch to a different source during the debounce window;
        // the timer must not refresh with the stale captured document.
        expect(source).toContain('const stillSourceDoc =');
        expect(source).toContain('document.uri.toString() === currentSourceUri.toString()');
        expect(source).toContain('VisualizationPanel.currentPanel && stillSourceDoc');
    });
});

describe('extension cursor-follow scoping', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('only forwards cursor lines from the visualization source document', () => {
        // A cursor line from another SQL file would be interpreted against the
        // source document's query ranges, so cursor-follow must be source-scoped.
        const start = source.indexOf('onDidChangeTextEditorSelection');
        const end = source.indexOf('onDidOpenTextDocument', start);
        const body = source.slice(start, end);

        expect(body).toContain('VisualizationPanel.sourceDocumentUri');
        expect(body).toContain('e.textEditor.document.uri.toString() === sourceUri.toString()');
        expect(body).toContain('if (isSourceDoc && VisualizationPanel.currentPanel');
    });
});

describe('extension auto-refresh timer cleanup', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('clears auto-refresh timer in deactivate', () => {
        expect(source).toContain('export function deactivate()');
        expect(source).toContain('clearTimeout(autoRefreshTimer)');
        expect(source).toContain('autoRefreshTimer = null');
    });

    it('clears all per-document diagnostics timers in deactivate', () => {
        expect(source).toContain('for (const timer of diagnosticsRefreshTimers.values())');
        expect(source).toContain('diagnosticsRefreshTimers.clear()');
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

    it('always syncs cursor position to webview', () => {
        expect(source).toContain('VisualizationPanel.sendCursorPosition(line)');
    });

    it('sends only the cursor line and lets the webview map it to a query', () => {
        // Query-index mapping was moved into the webview, which owns the
        // authoritative query line ranges from its parse. The extension must no
        // longer re-derive statement boundaries with its own splitter.
        expect(source).not.toContain('getQueryIndexForLine');
        expect(source).not.toContain('VisualizationPanel.sendQueryIndex(queryIndex)');
        expect(source).not.toContain('function splitSqlStatements');
    });
});

describe('webview cursor-to-query mapping', () => {
    const source = readFileSync(join(__dirname, '../../src/webview/index.ts'), 'utf8');

    it('maps the cursor line through the parser query line ranges', () => {
        expect(source).toContain('function findQueryIndexForLine');
        expect(source).toContain('batchResult?.queryLineRanges');
    });

    it('guards rapid asynchronous query switches with a request token', () => {
        const start = source.indexOf('async function handleCursorPosition');
        const end = source.indexOf('function handleSwitchToQuery', start);
        const body = source.slice(start, end);

        expect(body).toContain('++cursorFollowToken');
        expect(body).toContain('await switchToQueryIndex(targetIndex)');
        expect(body).toContain('token !== cursorFollowToken');
        expect(body).toContain('highlightNodeAtLine(line)');
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
