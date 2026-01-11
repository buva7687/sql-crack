import * as vscode from 'vscode';
import { VisualizationPanel } from './visualizationPanel';

// Track the last active SQL document for refresh functionality
let lastActiveSqlDocument: vscode.TextDocument | null = null;

export function activate(context: vscode.ExtensionContext) {
    console.log('SQL Crack extension is now active!');

    // Initialize VisualizationPanel with context for persistence
    VisualizationPanel.setContext(context);

    // Get configuration
    const getConfig = () => vscode.workspace.getConfiguration('sqlCrack');

    // Track active SQL document
    let activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.languageId === 'sql') {
            lastActiveSqlDocument = editor.document;
        }
    });

    // Initialize with current editor if it's SQL
    if (vscode.window.activeTextEditor?.document.languageId === 'sql') {
        lastActiveSqlDocument = vscode.window.activeTextEditor.document;
    }

    // Command: Visualize SQL
    let visualizeCommand = vscode.commands.registerCommand('sql-crack.visualize', () => {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const document = editor.document;

        if (document.languageId !== 'sql') {
            vscode.window.showWarningMessage('Please open a SQL file to visualize');
            return;
        }

        // Track this document
        lastActiveSqlDocument = document;

        // Get selected text or entire document
        const selection = editor.selection;
        const sqlCode = selection.isEmpty
            ? document.getText()
            : document.getText(selection);

        if (!sqlCode.trim()) {
            vscode.window.showWarningMessage('No SQL code found to visualize');
            return;
        }

        // Get default dialect from settings
        const config = getConfig();
        const defaultDialect = config.get<string>('defaultDialect') || 'MySQL';

        // Create or show visualization panel
        VisualizationPanel.createOrShow(context.extensionUri, sqlCode, {
            dialect: defaultDialect,
            fileName: document.fileName.split('/').pop() || 'Query'
        });
    });

    // Command: Refresh visualization
    let refreshCommand = vscode.commands.registerCommand('sql-crack.refresh', () => {
        // Use last active SQL document, not current active editor
        const document = lastActiveSqlDocument;
        if (document) {
            const sqlCode = document.getText();
            const config = getConfig();
            const defaultDialect = config.get<string>('defaultDialect') || 'MySQL';

            VisualizationPanel.refresh(sqlCode, {
                dialect: defaultDialect,
                fileName: document.fileName.split('/').pop() || 'Query'
            });
        } else {
            vscode.window.showWarningMessage('No SQL file to refresh. Please open a SQL file first.');
        }
    });

    context.subscriptions.push(activeEditorListener);

    // Listen for cursor position changes in SQL files
    let cursorChangeListener = vscode.window.onDidChangeTextEditorSelection((e) => {
        const config = getConfig();
        const syncEnabled = config.get<boolean>('syncEditorToFlow');

        if (syncEnabled && e.textEditor.document.languageId === 'sql' && VisualizationPanel.currentPanel) {
            const line = e.selections[0].active.line + 1; // 1-indexed
            const sql = e.textEditor.document.getText();
            
            // Determine which query this line belongs to
            const queryIndex = getQueryIndexForLine(sql, line);
            if (queryIndex !== null && queryIndex >= 0) {
                VisualizationPanel.sendQueryIndex(queryIndex);
            }
            
            VisualizationPanel.sendCursorPosition(line);
        }
    });

    // Helper function to determine which query index a line belongs to
    function getQueryIndexForLine(sql: string, lineNumber: number): number | null {
        const statements = splitSqlStatements(sql);
        let currentLine = 1;
        const lines = sql.split('\n');

        for (let queryIndex = 0; queryIndex < statements.length; queryIndex++) {
            const stmt = statements[queryIndex];
            // Find the starting line of this statement
            let stmtStartLine = currentLine;
            const stmtFirstLine = stmt.trim().split('\n')[0];
            for (let i = currentLine - 1; i < lines.length; i++) {
                if (lines[i].includes(stmtFirstLine.substring(0, Math.min(30, stmtFirstLine.length)))) {
                    stmtStartLine = i + 1;
                    break;
                }
            }
            
            const stmtEndLine = stmtStartLine + stmt.split('\n').length - 1;
            
            // Check if the line number falls within this query's range
            if (lineNumber >= stmtStartLine && lineNumber <= stmtEndLine) {
                return queryIndex;
            }
            
            currentLine = stmtStartLine + stmt.split('\n').length;
        }
        
        return null;
    }

    // Helper function to split SQL into statements (simplified version)
    function splitSqlStatements(sql: string): string[] {
        const statements: string[] = [];
        let current = '';
        let inString = false;
        let stringChar = '';
        let depth = 0;

        for (let i = 0; i < sql.length; i++) {
            const char = sql[i];
            const prevChar = i > 0 ? sql[i - 1] : '';

            // Handle string literals
            if ((char === "'" || char === '"') && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            // Handle parentheses depth
            if (!inString) {
                if (char === '(') { depth++; }
                if (char === ')') { depth--; }
            }

            // Split on semicolon at depth 0
            if (char === ';' && !inString && depth === 0) {
                const trimmed = current.trim();
                if (trimmed) {
                    statements.push(trimmed);
                }
                current = '';
            } else {
                current += char;
            }
        }

        // Add last statement
        const trimmed = current.trim();
        if (trimmed) {
            statements.push(trimmed);
        }

        return statements;
    }

    // Listen for document changes (for auto-refresh if needed)
    let docChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId === 'sql' && VisualizationPanel.currentPanel) {
            // Debounce - don't auto-refresh, but mark as stale
            VisualizationPanel.markAsStale();
        }
    });

    context.subscriptions.push(visualizeCommand);
    context.subscriptions.push(refreshCommand);
    context.subscriptions.push(cursorChangeListener);
    context.subscriptions.push(docChangeListener);
}

export function deactivate() {}
