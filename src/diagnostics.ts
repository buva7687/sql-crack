import * as vscode from 'vscode';
import { BatchParseResult, OptimizationHint, ParseResult } from './webview/types';

export const SQL_CRACK_DIAGNOSTIC_SOURCE = 'SQL Crack';

const LINE_IN_MESSAGE_REGEX = /\bline\s+(\d+)\b/i;

function clampLine(line: number, lineCount: number): number {
    if (lineCount <= 0) {
        return 0;
    }
    return Math.max(0, Math.min(line, lineCount - 1));
}

function parseLineFromHintMessage(message: string): number | null {
    const match = message.match(LINE_IN_MESSAGE_REGEX);
    if (!match) {
        return null;
    }
    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
}

function createLineRange(document: vscode.TextDocument, lineZeroBased: number): vscode.Range {
    const safeLine = clampLine(lineZeroBased, document.lineCount);
    const line = document.lineAt(safeLine);
    const firstNonWhitespace = line.firstNonWhitespaceCharacterIndex ?? 0;
    const endChar = Math.max(firstNonWhitespace + 1, line.text.length);
    return new vscode.Range(
        new vscode.Position(safeLine, firstNonWhitespace),
        new vscode.Position(safeLine, endChar)
    );
}

function resolveHintLine(
    hint: OptimizationHint,
    query: ParseResult,
    queryStartLine: number,
    document: vscode.TextDocument
): number {
    if (hint.nodeId) {
        const node = query.nodes.find(n => n.id === hint.nodeId);
        if (node?.startLine && node.startLine > 0) {
            return clampLine((queryStartLine - 1) + (node.startLine - 1), document.lineCount);
        }
    }

    const parsedMessageLine = parseLineFromHintMessage(hint.message);
    if (parsedMessageLine !== null) {
        return clampLine(parsedMessageLine - 1, document.lineCount);
    }

    return clampLine(queryStartLine - 1, document.lineCount);
}

export function mapHintSeverityToDiagnosticSeverity(hint: OptimizationHint): vscode.DiagnosticSeverity {
    if (hint.severity === 'high' || hint.type === 'error') {
        return vscode.DiagnosticSeverity.Error;
    }
    if (hint.severity === 'medium' || hint.type === 'warning') {
        return vscode.DiagnosticSeverity.Warning;
    }
    return vscode.DiagnosticSeverity.Information;
}

export function createDiagnosticFromHint(
    document: vscode.TextDocument,
    hint: OptimizationHint,
    query: ParseResult,
    queryStartLine: number
): vscode.Diagnostic {
    const line = resolveHintLine(hint, query, queryStartLine, document);
    const range = createLineRange(document, line);
    const diagnostic = new vscode.Diagnostic(range, hint.message, mapHintSeverityToDiagnosticSeverity(hint));
    diagnostic.source = SQL_CRACK_DIAGNOSTIC_SOURCE;
    diagnostic.code = 'sql-crack.hint';
    return diagnostic;
}

export function createDiagnosticsFromBatch(
    document: vscode.TextDocument,
    result: BatchParseResult
): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const queryRanges = result.queryLineRanges || [];

    result.queries.forEach((query, index) => {
        if (!query.hints || query.hints.length === 0) {
            return;
        }
        const queryStartLine = queryRanges[index]?.startLine || 1;
        query.hints.forEach((hint) => {
            diagnostics.push(createDiagnosticFromHint(document, hint, query, queryStartLine));
        });
    });

    (result.parseErrors || []).forEach((parseError) => {
        const fallbackLine = parseError.line ? parseError.line - 1 : 0;
        const range = createLineRange(document, fallbackLine);
        const diagnostic = new vscode.Diagnostic(range, parseError.message, vscode.DiagnosticSeverity.Error);
        diagnostic.source = SQL_CRACK_DIAGNOSTIC_SOURCE;
        diagnostic.code = 'sql-crack.parse-error';
        diagnostics.push(diagnostic);
    });

    return diagnostics;
}

export function createShowInFlowCodeAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
): vscode.CodeAction {
    const action = new vscode.CodeAction('Show in SQL Flow', vscode.CodeActionKind.QuickFix);
    action.command = {
        command: 'sql-crack.visualize',
        title: 'Show in SQL Flow',
        arguments: [document.uri],
    };
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    return action;
}

export class SqlCrackCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        return context.diagnostics
            .filter((diagnostic) => diagnostic.source === SQL_CRACK_DIAGNOSTIC_SOURCE)
            .map((diagnostic) => createShowInFlowCodeAction(document, diagnostic));
    }
}
