import * as vscode from 'vscode';
import { VisualizationPanel } from './visualizationPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('SQL Crack extension is now active!');

    // Get configuration
    const getConfig = () => vscode.workspace.getConfiguration('sqlCrack');

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
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'sql') {
            const sqlCode = editor.document.getText();
            const config = getConfig();
            const defaultDialect = config.get<string>('defaultDialect') || 'MySQL';

            VisualizationPanel.refresh(sqlCode, {
                dialect: defaultDialect,
                fileName: editor.document.fileName.split('/').pop() || 'Query'
            });
        }
    });

    // Listen for cursor position changes in SQL files
    let cursorChangeListener = vscode.window.onDidChangeTextEditorSelection((e) => {
        const config = getConfig();
        const syncEnabled = config.get<boolean>('syncEditorToFlow');

        if (syncEnabled && e.textEditor.document.languageId === 'sql') {
            const line = e.selections[0].active.line + 1; // 1-indexed
            VisualizationPanel.sendCursorPosition(line);
        }
    });

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
