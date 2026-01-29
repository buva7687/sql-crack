import * as vscode from 'vscode';

interface VisualizationOptions {
    dialect: string;
    fileName: string;
    documentUri?: vscode.Uri; // Store the document URI for navigation
}

export type ViewLocation = 'beside' | 'tab';

interface PinnedVisualization {
    id: string;
    name: string;
    sql: string;
    dialect: string;
    timestamp: number;
}

export class VisualizationPanel {
    public static currentPanel: VisualizationPanel | undefined;
    public static readonly viewType = 'sqlCrackVisualization';
    public static pinnedPanels: Map<string, VisualizationPanel> = new Map();

    private static _context: vscode.ExtensionContext | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _currentSql: string = '';
    private _currentOptions: VisualizationOptions;
    private _isStale: boolean = false;
    private _isPinned: boolean = false;
    private _pinId: string | undefined;
    private _sourceDocumentUri: vscode.Uri | undefined; // Track source document for navigation

    public static setContext(context: vscode.ExtensionContext) {
        VisualizationPanel._context = context;
        // Restore pinned tabs on activation
        VisualizationPanel.restorePinnedTabs();
    }

    private static getViewColumn(): vscode.ViewColumn {
        const config = vscode.workspace.getConfiguration('sqlCrack');
        const location = config.get<ViewLocation>('viewLocation') || 'beside';

        switch (location) {
            case 'tab':
                return vscode.ViewColumn.Active;
            case 'beside':
            default:
                // Note: VS Code doesn't support programmatic panel placement in secondary sidebar.
                // The 'beside' option opens the panel next to the SQL file in the editor area.
                return vscode.ViewColumn.Beside;
        }
    }

    public static createOrShow(extensionUri: vscode.Uri, sqlCode: string, options: VisualizationOptions) {
        const viewColumn = VisualizationPanel.getViewColumn();

        // If we already have a panel, update it
        if (VisualizationPanel.currentPanel) {
            VisualizationPanel.currentPanel._panel.reveal(viewColumn);
            VisualizationPanel.currentPanel._update(sqlCode, options);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            VisualizationPanel.viewType,
            'SQL Flow',
            viewColumn,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist')
                ]
            }
        );

        const newPanel = new VisualizationPanel(panel, extensionUri, sqlCode, options, false);
        newPanel._sourceDocumentUri = options.documentUri;
        VisualizationPanel.currentPanel = newPanel;
    }

    public static createPinnedPanel(extensionUri: vscode.Uri, sqlCode: string, options: VisualizationOptions, pinId?: string): string {
        const id = pinId || 'pin-' + Date.now();
        const name = options.fileName.replace('.sql', '') || `Pinned Query`;

        // Create panel as a new tab
        const panel = vscode.window.createWebviewPanel(
            VisualizationPanel.viewType + '.pinned',
            `📌 ${name}`,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist')
                ]
            }
        );

        const pinnedPanel = new VisualizationPanel(panel, extensionUri, sqlCode, options, true, id);
        pinnedPanel._sourceDocumentUri = options.documentUri;
        VisualizationPanel.pinnedPanels.set(id, pinnedPanel);

        // Save to workspace state
        VisualizationPanel.savePinnedTab({
            id,
            name,
            sql: sqlCode,
            dialect: options.dialect,
            timestamp: Date.now()
        });

        return id;
    }

    private static savePinnedTab(pin: PinnedVisualization) {
        if (!VisualizationPanel._context) {return;}

        const pinnedTabs = VisualizationPanel._context.workspaceState.get<PinnedVisualization[]>('pinnedTabs') || [];
        const existingIndex = pinnedTabs.findIndex(t => t.id === pin.id);

        if (existingIndex >= 0) {
            pinnedTabs[existingIndex] = pin;
        } else {
            pinnedTabs.push(pin);
        }

        VisualizationPanel._context.workspaceState.update('pinnedTabs', pinnedTabs);
    }

    private static removePinnedTab(pinId: string) {
        if (!VisualizationPanel._context) {return;}

        const pinnedTabs = VisualizationPanel._context.workspaceState.get<PinnedVisualization[]>('pinnedTabs') || [];
        const filtered = pinnedTabs.filter(t => t.id !== pinId);
        VisualizationPanel._context.workspaceState.update('pinnedTabs', filtered);
    }

    private static restorePinnedTabs() {
        if (!VisualizationPanel._context) {return;}

        const pinnedTabs = VisualizationPanel._context.workspaceState.get<PinnedVisualization[]>('pinnedTabs') || [];

        // Don't auto-restore on activation - let user reopen manually or use a command
        // This prevents opening many tabs unexpectedly
        // We just keep the data persisted
    }

    public static getPinnedTabs(): PinnedVisualization[] {
        if (!VisualizationPanel._context) {return [];}
        return VisualizationPanel._context.workspaceState.get<PinnedVisualization[]>('pinnedTabs') || [];
    }

    public static openPinnedTab(pinId: string, extensionUri: vscode.Uri) {
        const pinnedTabs = VisualizationPanel.getPinnedTabs();
        const pin = pinnedTabs.find(t => t.id === pinId);

        if (pin) {
            // Check if already open
            if (VisualizationPanel.pinnedPanels.has(pinId)) {
                VisualizationPanel.pinnedPanels.get(pinId)?._panel.reveal();
                return;
            }

            // Try to find the document URI if we can match by name
            let documentUri: vscode.Uri | undefined;
            // For pinned tabs, we don't have the original URI, so we'll try to find it
            VisualizationPanel.createPinnedPanel(extensionUri, pin.sql, {
                dialect: pin.dialect,
                fileName: pin.name,
                documentUri: documentUri
            }, pin.id);
        }
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
            VisualizationPanel.currentPanel._sourceDocumentUri = options.documentUri;
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

    public static sendQueryIndex(queryIndex: number) {
        if (VisualizationPanel.currentPanel) {
            VisualizationPanel.currentPanel._postMessage({
                command: 'switchToQuery',
                queryIndex: queryIndex
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

    public static sendViewLocationOptions() {
        if (VisualizationPanel.currentPanel) {
            const config = vscode.workspace.getConfiguration('sqlCrack');
            const location = config.get<ViewLocation>('viewLocation') || 'beside';
            VisualizationPanel.currentPanel._postMessage({
                command: 'viewLocationOptions',
                currentLocation: location,
                pinnedTabs: VisualizationPanel.getPinnedTabs()
            });
        }
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        sqlCode: string,
        options: VisualizationOptions,
        isPinned: boolean,
        pinId?: string
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._currentSql = sqlCode;
        this._currentOptions = options;
        this._isPinned = isPinned;
        this._pinId = pinId;

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
                        vscode.commands.executeCommand('sql-crack.refresh');
                        return;
                    case 'goToLine':
                        this._goToLine(message.line);
                        return;
                    case 'requestFullscreen':
                        // VS Code doesn't support programmatic fullscreen, but we can maximize the panel
                        if (message.enable) {
                            this._panel.reveal(vscode.ViewColumn.Active, true);
                        }
                        return;
                    case 'pinVisualization':
                        // Create a new pinned panel
                        if (VisualizationPanel._context) {
                            const pinId = VisualizationPanel.createPinnedPanel(
                                this._extensionUri,
                                message.sql || this._currentSql,
                                {
                                    dialect: message.dialect || this._currentOptions.dialect,
                                    fileName: message.name || this._currentOptions.fileName
                                }
                            );
                            this._postMessage({
                                command: 'pinCreated',
                                pinId: pinId
                            });
                            vscode.window.showInformationMessage(`Pinned: ${message.name || this._currentOptions.fileName}`);
                        }
                        return;
                    case 'changeViewLocation':
                        this._changeViewLocation(message.location);
                        return;
                    case 'getViewLocationOptions':
                        VisualizationPanel.sendViewLocationOptions();
                        return;
                    case 'openPinnedTab':
                        if (VisualizationPanel._context) {
                            VisualizationPanel.openPinnedTab(message.pinId, this._extensionUri);
                        }
                        return;
                    case 'unpinTab':
                        if (message.pinId) {
                            VisualizationPanel.removePinnedTab(message.pinId);
                            // Close the panel if it's open
                            const pinnedPanel = VisualizationPanel.pinnedPanels.get(message.pinId);
                            if (pinnedPanel) {
                                pinnedPanel.dispose();
                            }
                            VisualizationPanel.sendViewLocationOptions();
                        }
                        return;
                    case 'savePng':
                        this._savePngFile(message.data, message.filename);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async _changeViewLocation(location: ViewLocation) {
        const config = vscode.workspace.getConfiguration('sqlCrack');
        await config.update('viewLocation', location, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(`View location changed to: ${location}`);
    }

    /**
     * Phase 1 Feature: Click Node → Jump to SQL
     * Navigate to the specified line in the source SQL document.
     * Uses the tracked source document URI to ensure navigation to the correct file,
     * even if the user has switched to a different editor.
     * 
     * @param line - Line number (1-indexed) to navigate to
     */
    private async _goToLine(line: number) {
        // Try to use the source document URI if available (preferred method)
        const targetUri = this._sourceDocumentUri;
        
        if (targetUri) {
            // Open the document and navigate to the line
            try {
                const document = await vscode.workspace.openTextDocument(targetUri);
                const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
                const position = new vscode.Position(Math.max(0, line - 1), 0); // Convert to 0-indexed
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
                return;
            } catch (error) {
                console.error('Failed to open document:', error);
            }
        }
        
        // Fallback to active editor if source document URI is not available
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const position = new vscode.Position(Math.max(0, line - 1), 0); // Convert to 0-indexed
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        } else {
            console.warn('No active editor found, cannot navigate to line', line);
            vscode.window.showWarningMessage(`Could not navigate to line ${line}. Please open the SQL file first.`);
        }
    }

    private _postMessage(message: any) {
        this._panel.webview.postMessage(message);
    }

    /**
     * Save PNG data to file using VS Code's save dialog
     */
    private async _savePngFile(base64Data: string, suggestedFilename: string) {
        try {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(suggestedFilename),
                filters: {
                    'PNG Images': ['png']
                },
                saveLabel: 'Save PNG'
            });

            if (uri) {
                const buffer = Buffer.from(base64Data, 'base64');
                await vscode.workspace.fs.writeFile(uri, buffer);
                vscode.window.showInformationMessage(`Saved: ${uri.fsPath}`);
            }
        } catch (error) {
            console.error('Failed to save PNG:', error);
            vscode.window.showErrorMessage('Failed to save PNG file');
        }
    }

    private _update(sqlCode: string, options: VisualizationOptions) {
        this._currentSql = sqlCode;
        this._currentOptions = options;
        this._sourceDocumentUri = options.documentUri;
        this._isStale = false;
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview, sqlCode, options);
    }

    /**
     * Safely escape a string for embedding in an inline script tag.
     * Uses JSON.stringify for base escaping, then handles HTML-specific sequences
     * that could break out of the script context.
     */
    private _escapeForInlineScript(str: string): string {
        // JSON.stringify handles quotes, backslashes, control chars, and unicode
        const json = JSON.stringify(str);

        // Escape HTML-specific sequences that could break script context:
        // 1. </script - could close the script tag (case-insensitive)
        // 2. <!-- - HTML comment start
        // 3. --> - HTML comment end
        // 4. ]]> - CDATA section end
        return json
            .replace(/<\/script/gi, '<\\/script')
            .replace(/<!--/g, '<\\!--')
            .replace(/-->/g, '--\\>')
            .replace(/\]\]>/g, ']\\]>');
    }

    private _getHtmlForWebview(webview: vscode.Webview, sqlCode: string, options: VisualizationOptions) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
        );

        const nonce = getNonce();

        const themeKind = vscode.window.activeColorTheme.kind;
        const vscodeTheme = themeKind === vscode.ColorThemeKind.Light ? 'light' : 'dark';

        const config = vscode.workspace.getConfiguration('sqlCrack');
        const viewLocation = config.get<ViewLocation>('viewLocation') || 'beside';
        const defaultLayout = config.get<string>('defaultLayout') || 'vertical';
        const showDeadColumnHints = config.get<boolean>('advanced.showDeadColumnHints') !== false;
        const pinnedTabs = VisualizationPanel.getPinnedTabs();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <!-- CSP: Allow img-src for data: and blob: URLs to enable PNG export and clipboard copy -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data: blob:;">
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
        window.initialSqlCode = ${JSON.stringify(sqlCode)};
        window.vscodeTheme = ${JSON.stringify(vscodeTheme)};
        window.defaultDialect = ${JSON.stringify(options.dialect)};
        window.fileName = ${JSON.stringify(options.fileName)};
        window.isPinnedView = ${JSON.stringify(this._isPinned)};
        window.pinId = ${JSON.stringify(this._pinId || null)};
        window.viewLocation = ${JSON.stringify(viewLocation)};
        window.defaultLayout = ${JSON.stringify(defaultLayout)};
        window.persistedPinnedTabs = ${JSON.stringify(pinnedTabs)};
        window.showDeadColumnHints = ${JSON.stringify(showDeadColumnHints)};

        // VS Code API for messaging
        const vscode = acquireVsCodeApi();
        window.vscodeApi = vscode;
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    public dispose() {
        if (this._isPinned && this._pinId) {
            VisualizationPanel.pinnedPanels.delete(this._pinId);
        } else {
            VisualizationPanel.currentPanel = undefined;
        }

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
