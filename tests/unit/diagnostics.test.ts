import * as vscode from 'vscode';
import {
    createDiagnosticFromHint,
    createDiagnosticsFromBatch,
    createShowInFlowCodeAction,
    mapHintSeverityToDiagnosticSeverity,
    SQL_CRACK_DIAGNOSTIC_SOURCE,
    SqlCrackCodeActionProvider,
} from '../../src/diagnostics';
import { BatchParseResult, OptimizationHint, ParseResult } from '../../src/webview/types';

jest.mock('vscode');

function createMockDocument(text: string): vscode.TextDocument {
    const lines = text.split('\n');
    return {
        uri: vscode.Uri.file('/workspace/query.sql'),
        lineCount: lines.length,
        lineAt: (line: number) => {
            const lineText = lines[line] ?? '';
            const first = Math.max(0, lineText.search(/\S|$/));
            return {
                lineNumber: line,
                text: lineText,
                firstNonWhitespaceCharacterIndex: first,
            } as unknown as vscode.TextLine;
        },
    } as unknown as vscode.TextDocument;
}

function createParseResult(hints: OptimizationHint[]): ParseResult {
    return {
        nodes: [
            {
                id: 'orders-node',
                type: 'table',
                label: 'orders',
                x: 0,
                y: 0,
                width: 100,
                height: 40,
                startLine: 2,
            },
        ],
        edges: [],
        stats: {
            tables: 1,
            joins: 0,
            subqueries: 0,
            ctes: 0,
            aggregations: 0,
            windowFunctions: 0,
            unions: 0,
            conditions: 0,
            complexity: 'Simple',
            complexityScore: 1,
        },
        hints,
        sql: 'SELECT * FROM orders;',
        columnLineage: [],
        columnFlows: [],
        tableUsage: new Map<string, number>(),
    };
}

describe('diagnostics mapping', () => {
    it('maps hint severities to VS Code diagnostic severities', () => {
        expect(mapHintSeverityToDiagnosticSeverity({
            type: 'warning',
            message: 'bad',
            severity: 'high',
        })).toBe(vscode.DiagnosticSeverity.Error);

        expect(mapHintSeverityToDiagnosticSeverity({
            type: 'warning',
            message: 'warn',
            severity: 'medium',
        })).toBe(vscode.DiagnosticSeverity.Warning);

        expect(mapHintSeverityToDiagnosticSeverity({
            type: 'info',
            message: 'info',
            severity: 'low',
        })).toBe(vscode.DiagnosticSeverity.Information);
    });

    it('creates diagnostic ranges using query offsets and node line numbers', () => {
        const document = createMockDocument([
            '-- header',
            'SELECT 1;',
            'SELECT *',
            'FROM orders',
            'WHERE amount > 10;',
            '',
            'SELECT 2;',
        ].join('\n'));

        const hint: OptimizationHint = {
            type: 'warning',
            message: 'Repeated table scan',
            severity: 'medium',
            nodeId: 'orders-node',
        };
        const query = createParseResult([hint]);
        const diagnostic = createDiagnosticFromHint(document, hint, query, 3);

        expect(diagnostic.range.start.line).toBe(3);
        expect(diagnostic.severity).toBe(vscode.DiagnosticSeverity.Warning);
        expect(diagnostic.source).toBe(SQL_CRACK_DIAGNOSTIC_SOURCE);
    });

    it('creates diagnostics for parse hints and returns none when no hints exist', () => {
        const document = createMockDocument('SELECT * FROM orders;');
        const hintedBatch: BatchParseResult = {
            queries: [createParseResult([{
                type: 'error',
                message: 'line 1 parse issue',
                severity: 'high',
            }])],
            totalStats: createParseResult([]).stats,
            queryLineRanges: [{ startLine: 1, endLine: 1 }],
            parseErrors: [],
            errorCount: 0,
        };

        const hintedDiagnostics = createDiagnosticsFromBatch(document, hintedBatch);
        expect(hintedDiagnostics).toHaveLength(1);
        expect(hintedDiagnostics[0].severity).toBe(vscode.DiagnosticSeverity.Error);

        const emptyBatch: BatchParseResult = {
            ...hintedBatch,
            queries: [createParseResult([])],
        };
        expect(createDiagnosticsFromBatch(document, emptyBatch)).toHaveLength(0);
    });

    it('creates "Show in SQL Flow" quick-fix code actions', () => {
        const document = createMockDocument('SELECT * FROM orders;');
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 6)),
            'Hint',
            vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = SQL_CRACK_DIAGNOSTIC_SOURCE;

        const action = createShowInFlowCodeAction(document, diagnostic);
        expect(action.title).toBe('Show in SQL Flow');
        expect((action.command as vscode.Command).command).toBe('sql-crack.visualize');

        const provider = new SqlCrackCodeActionProvider();
        const actions = provider.provideCodeActions(
            document,
            diagnostic.range,
            { diagnostics: [diagnostic], triggerKind: 1 } as unknown as vscode.CodeActionContext
        );
        expect(actions).toHaveLength(1);
        expect(actions[0].title).toBe('Show in SQL Flow');
    });
});
