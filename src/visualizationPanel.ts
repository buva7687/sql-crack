import * as vscode from 'vscode';
import * as path from 'path';

interface VisualizationOptions {
    dialect: string;
    fileName: string;
}

export class VisualizationPanel {
    public static currentPanel: VisualizationPanel | undefined;
    public static readonly viewType = 'sqlCrackVisualization';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _currentSql: string = '';
    private _currentOptions: VisualizationOptions;
    private _isStale: boolean = false;

    public static createOrShow(extensionUri: vscode.Uri, sqlCode: string, options: VisualizationOptions) {
        // If we already have a panel, update it
        if (VisualizationPanel.currentPanel) {
            VisualizationPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
            VisualizationPanel.currentPanel._update(sqlCode, options);
            return;
        }

        // Otherwise, create a new panel beside the current editor (like markdown preview)
        const panel = vscode.window.createWebviewPanel(
            VisualizationPanel.viewType,
            'SQL Flow',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist')
                ]
            }
        );

        VisualizationPanel.currentPanel = new VisualizationPanel(panel, extensionUri, sqlCode, options);
    }

    public static refresh(sqlCode: string, options: VisualizationOptions) {
        if (VisualizationPanel.currentPanel) {
            VisualizationPanel.currentPanel._postMessage({
                command: 'refresh',
                sql: sqlCode,
                options: options
            });
            VisualizationPanel.currentPanel._currentSql = sqlCode;
            VisualizationPanel.currentPanel._currentOptions = options;
            VisualizationPanel.currentPanel._isStale = false;
        }
    }

    public static sendCursorPosition(line: number) {
        if (VisualizationPanel.currentPanel) {
            VisualizationPanel.currentPanel._postMessage({
                command: 'cursorPosition',
                line: line
            });
        }
    }

    public static markAsStale() {
        if (VisualizationPanel.currentPanel) {
            VisualizationPanel.currentPanel._isStale = true;
            VisualizationPanel.currentPanel._postMessage({
                command: 'markStale'
            });
        }
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, sqlCode: string, options: VisualizationOptions) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._currentSql = sqlCode;
        this._currentOptions = options;

        // Set the webview's initial html content
        this._update(sqlCode, options);

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'error':
                        vscode.window.showErrorMessage(message.text);
                        return;
                    case 'info':
                        vscode.window.showInformationMessage(message.text);
                        return;
                    case 'requestRefresh':
                        // Webview requested a refresh
                        vscode.commands.executeCommand('sql-crack.refresh');
                        return;
                    case 'goToLine':
                        // Jump to line in editor
                        this._goToLine(message.line);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private _goToLine(line: number) {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'sql') {
            const position = new vscode.Position(line - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }
    }

    private _postMessage(message: any) {
        this._panel.webview.postMessage(message);
    }

    private _update(sqlCode: string, options: VisualizationOptions) {
        this._currentSql = sqlCode;
        this._currentOptions = options;
        this._isStale = false;
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview, sqlCode, options);
    }

    private _escapeForInlineScript(sqlCode: string): string {
        const json = JSON.stringify(sqlCode);
        return json.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
    }

    private _getHtmlForWebview(webview: vscode.Webview, sqlCode: string, options: VisualizationOptions) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
        );

        const nonce = getNonce();

        const themeKind = vscode.window.activeColorTheme.kind;
        const vscodeTheme = themeKind === vscode.ColorThemeKind.Light ? 'light' : 'dark';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Visualization</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100vh;
            overflow: hidden;
        }
        #root {
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        window.initialSqlCode = ${this._escapeForInlineScript(sqlCode)};
        window.vscodeTheme = ${JSON.stringify(vscodeTheme)};
        window.defaultDialect = ${JSON.stringify(options.dialect)};
        window.fileName = ${JSON.stringify(options.fileName)};

        // VS Code API for messaging
        const vscode = acquireVsCodeApi();
        window.vscodeApi = vscode;
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    public dispose() {
        VisualizationPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
