import * as vscode from 'vscode';
import * as path from 'path';

export class VisualizationPanel {
    public static currentPanel: VisualizationPanel | undefined;
    public static readonly viewType = 'sqlCrackVisualization';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, sqlCode: string) {
        // If we already have a panel, update it
        if (VisualizationPanel.currentPanel) {
            VisualizationPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
            VisualizationPanel.currentPanel._update(sqlCode);
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

        VisualizationPanel.currentPanel = new VisualizationPanel(panel, extensionUri, sqlCode);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, sqlCode: string) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update(sqlCode);

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
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
                }
            },
            null,
            this._disposables
        );
    }

    private _update(sqlCode: string) {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview, sqlCode);
    }

    private _escapeForInlineScript(sqlCode: string): string {
        // Use JSON.stringify and then escape closing </script to avoid breaking out of the script tag
        const json = JSON.stringify(sqlCode);
        return json.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
    }

    private _getHtmlForWebview(webview: vscode.Webview, sqlCode: string) {
        // Local path to main script run in the webview
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
        );

        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        // Get VS Code theme kind
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
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    public dispose() {
        VisualizationPanel.currentPanel = undefined;

        // Clean up our resources
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
