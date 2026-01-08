import * as vscode from 'vscode';
import { VisualizationPanel } from './visualizationPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('SQL Crack extension is now active!');

    let disposable = vscode.commands.registerCommand('sql-crack.visualize', () => {
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

        // Create or show visualization panel
        VisualizationPanel.createOrShow(context.extensionUri, sqlCode);
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
