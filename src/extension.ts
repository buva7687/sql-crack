import * as vscode from 'vscode';
import * as path from 'path';
import { VisualizationPanel } from './visualizationPanel';
import { setCustomFunctions } from './dialects';
import { logger } from './logger';
import { parseSqlBatch, DEFAULT_VALIDATION_LIMITS } from './webview/sqlParser';
import {
    createDiagnosticsFromBatch,
    SqlCrackCodeActionProvider,
} from './diagnostics';
import { stripSqlComments } from './shared/stringUtils';
import { preprocessJinjaTemplates } from './webview/parser/dialects/jinjaPreprocessor';

// Track the last active SQL document for refresh functionality
let lastActiveSqlDocument: vscode.TextDocument | null = null;

/** Normalize dialect setting: map user-friendly "SQL Server" → internal "TransactSQL" */
export function normalizeDialect(dialect: string): string {
    if (dialect === 'SQL Server') { return 'TransactSQL'; }
    if (dialect === 'PL/SQL') { return 'Oracle'; }
    return dialect;
}

// Auto-refresh debounce timer
let autoRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let diagnosticsRefreshTimer: ReturnType<typeof setTimeout> | null = null;

// Cache of additional file extensions
let additionalExtensions: string[] = [];

/**
 * Load custom functions from VS Code settings and inject into the function registry
 */
function loadCustomFunctions(): void {
    const config = vscode.workspace.getConfiguration('sqlCrack');
    const customAggregates = config.get<string[]>('customAggregateFunctions') || [];
    const customWindow = config.get<string[]>('customWindowFunctions') || [];
    setCustomFunctions(customAggregates, customWindow);
}

/**
 * Load additional file extensions from settings
 */
function loadAdditionalExtensions(): void {
    const config = vscode.workspace.getConfiguration('sqlCrack');
    additionalExtensions = config.get<string[]>('additionalFileExtensions') || [];
    // Normalize extensions to lowercase, filter empty strings, and ensure they start with a dot
    additionalExtensions = additionalExtensions
        .map(ext => ext.toLowerCase().trim())
        .filter(ext => ext.length > 0)
        .map(ext => ext.startsWith('.') ? ext : '.' + ext);
}

/**
 * Check if a document is SQL-like (either .sql or in additional extensions)
 */
function isSqlLikeDocument(document: vscode.TextDocument): boolean {
    // Check if it's a SQL language file
    if (document.languageId === 'sql') {
        return true;
    }

    // Check file extension against additional extensions
    const fileName = document.fileName.toLowerCase();
    for (const ext of additionalExtensions) {
        if (fileName.endsWith(ext)) {
            return true;
        }
    }

    return false;
}

/**
 * Build document selectors for SQL diagnostics quick-fix registration.
 * Includes SQL language documents and configured additional file extensions.
 */
function getSqlCodeActionDocumentSelector(): vscode.DocumentSelector {
    const selectors: vscode.DocumentFilter[] = [
        { language: 'sql', scheme: 'file' },
        { language: 'sql', scheme: 'untitled' },
    ];

    const seenPatterns = new Set<string>();
    for (const ext of additionalExtensions) {
        const pattern = `**/*${ext}`;
        if (seenPatterns.has(pattern)) {
            continue;
        }
        seenPatterns.add(pattern);
        selectors.push({ scheme: 'file', pattern });
    }

    return selectors;
}

/**
 * Update the context variable for SQL-like files (used in when clauses)
 * This enables the SQL Crack icon/menu for files with additional extensions
 */
function updateSqlLikeFileContext(editor: vscode.TextEditor | undefined): void {
    let isSqlLike = false;

    if (editor) {
        const fileName = editor.document.fileName.toLowerCase();
        // Check if file has an additional extension (not .sql, since that's handled by package.json)
        for (const ext of additionalExtensions) {
            if (fileName.endsWith(ext)) {
                isSqlLike = true;
                break;
            }
        }
    }

    // Set context for use in when clauses
    vscode.commands.executeCommand('setContext', 'sqlCrack.isAdditionalSqlFile', isSqlLike);
}

function hasExecutableSql(sql: string): boolean {
    const { rewritten } = preprocessJinjaTemplates(sql);
    return stripSqlComments(rewritten).trim().length > 0;
}

async function loadWorkspacePanel() {
    return import('./workspace');
}

export function normalizeAdvancedLimit(raw: unknown, fallback: number, min: number, max: number): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return fallback;
    }
    const rounded = Math.round(raw);
    return Math.max(min, Math.min(max, rounded));
}

export function activate(context: vscode.ExtensionContext) {
    // Initialize logger first
    logger.initialize(context);
    logger.info('SQL Crack extension is now active!');

    // Load custom functions from settings
    loadCustomFunctions();

    // Load additional file extensions from settings
    loadAdditionalExtensions();

    // Initialize VisualizationPanel with context for persistence
    VisualizationPanel.setContext(context);

    // Get configuration
    const getConfig = () => vscode.workspace.getConfiguration('sqlCrack');

    const diagnosticsCollection = vscode.languages.createDiagnosticCollection('sql-crack');
    context.subscriptions.push(diagnosticsCollection);

    const shouldShowDiagnosticsInProblems = (): boolean => {
        return getConfig().get<boolean>('advanced.showDiagnosticsInProblems', false);
    };

    const updateDiagnosticsForDocument = (document: vscode.TextDocument): void => {
        if (!isSqlLikeDocument(document)) {
            diagnosticsCollection.delete(document.uri);
            return;
        }

        if (!shouldShowDiagnosticsInProblems()) {
            diagnosticsCollection.delete(document.uri);
            return;
        }

        const sql = document.getText();
        if (!sql.trim()) {
            diagnosticsCollection.delete(document.uri);
            return;
        }
        if (!hasExecutableSql(sql)) {
            diagnosticsCollection.delete(document.uri);
            return;
        }

        try {
            const config = getConfig();
            const defaultDialect = normalizeDialect(config.get<string>('defaultDialect') || 'MySQL');
            const autoDetectDialect = config.get<boolean>('autoDetectDialect') !== false;
            const maxFileSizeKB = normalizeAdvancedLimit(config.get<number>('advanced.maxFileSizeKB', 100), 100, 10, 10000);
            const maxStatements = normalizeAdvancedLimit(config.get<number>('advanced.maxStatements', 50), 50, 1, 500);
            const combineDdlStatements = config.get<boolean>('advanced.combineDdlStatements', false);
            const batch = parseSqlBatch(
                sql,
                defaultDialect as any,
                {
                    maxSqlSizeBytes: maxFileSizeKB * 1024,
                    maxQueryCount: maxStatements || DEFAULT_VALIDATION_LIMITS.maxQueryCount,
                },
                {
                    combineDdlStatements,
                    allowDialectFallback: autoDetectDialect,
                }
            );
            diagnosticsCollection.set(document.uri, createDiagnosticsFromBatch(document, batch));
        } catch (e) {
            logger.debug('[extension] Diagnostics parse failed, clearing: ' + String(e));
            diagnosticsCollection.delete(document.uri);
        }
    };

    // Track active SQL document and update context for menu visibility
    let activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
        const isSqlLike = Boolean(editor && isSqlLikeDocument(editor.document));
        VisualizationPanel.setActiveEditorActivity(isSqlLike);
        if (isSqlLike && editor) {
            lastActiveSqlDocument = editor.document;
        }
        // Update context for additional file extensions (used in when clauses)
        updateSqlLikeFileContext(editor);
    });

    // Initialize with current editor if it's SQL-like
    if (vscode.window.activeTextEditor && isSqlLikeDocument(vscode.window.activeTextEditor.document)) {
        lastActiveSqlDocument = vscode.window.activeTextEditor.document;
    }

    // Set initial context for menu visibility
    updateSqlLikeFileContext(vscode.window.activeTextEditor);
    VisualizationPanel.setActiveEditorActivity(Boolean(
        vscode.window.activeTextEditor && isSqlLikeDocument(vscode.window.activeTextEditor.document)
    ));

    // Command: Visualize SQL
    let visualizeCommand = vscode.commands.registerCommand('sql-crack.visualize', async (uri?: vscode.Uri) => {
        let document: vscode.TextDocument;
        let sqlCode: string;

        // If URI is provided (from explorer context menu), open the file
        if (uri) {
            try {
                document = await vscode.workspace.openTextDocument(uri);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to open file: ${err instanceof Error ? err.message : String(err)}`);
                return;
            }
            sqlCode = document.getText();
        } else {
            // Otherwise use active editor
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                vscode.window.showErrorMessage('No active editor found');
                return;
            }

            document = editor.document;

            // Allow visualization from any file - user may have SQL in non-.sql files
            // The parser will handle invalid SQL gracefully with an error message

            // Get selected text or entire document
            const selection = editor.selection;
            sqlCode = selection.isEmpty
                ? document.getText()
                : document.getText(selection);
        }

        // Track this document
        lastActiveSqlDocument = document;

        if (!sqlCode.trim()) {
            vscode.window.showWarningMessage('No SQL code found to visualize');
            return;
        }
        if (!hasExecutableSql(sqlCode)) {
            vscode.window.showWarningMessage('Only comments or whitespace found. Add at least one SQL statement to visualize.');
            return;
        }

        // Get default dialect from settings
        const config = getConfig();
        const defaultDialect = normalizeDialect(config.get<string>('defaultDialect') || 'MySQL');

        // Create or show visualization panel
        VisualizationPanel.createOrShow(context.extensionUri, sqlCode, {
            dialect: defaultDialect,
            fileName: path.basename(document.fileName) || 'Query',
            documentUri: document.uri
        });
        VisualizationPanel.setActiveEditorActivity(isSqlLikeDocument(document));
    });

    // Command: Refresh visualization
    let refreshCommand = vscode.commands.registerCommand('sql-crack.refresh', () => {
        // Use last active SQL document, not current active editor
        const document = lastActiveSqlDocument;
        if (document) {
            const sqlCode = document.getText();
            const config = getConfig();
            const defaultDialect = normalizeDialect(config.get<string>('defaultDialect') || 'MySQL');

            VisualizationPanel.refresh(sqlCode, {
                dialect: defaultDialect,
                fileName: path.basename(document.fileName) || 'Query',
                documentUri: document.uri
            });
            VisualizationPanel.setActiveEditorActivity(true);
        } else {
            vscode.window.showWarningMessage('No SQL file to refresh. Please open a SQL file first.');
        }
    });

    // Command: Restore/open pinned SQL Flow tabs
    let restorePinnedTabsCommand = vscode.commands.registerCommand('sql-crack.restorePinnedTabs', async () => {
        const pinnedTabs = VisualizationPanel.getPinnedTabs()
            .slice()
            .sort((a, b) => b.timestamp - a.timestamp);
        if (pinnedTabs.length === 0) {
            vscode.window.showInformationMessage('No pinned SQL Flow tabs found in this workspace.');
            return;
        }

        const selection = await vscode.window.showQuickPick(
            pinnedTabs.map(pin => ({
                label: pin.name,
                description: pin.dialect,
                detail: `Pinned ${new Date(pin.timestamp).toLocaleString()}`,
                pinId: pin.id,
            })),
            {
                placeHolder: 'Select a pinned SQL Flow tab to reopen',
                matchOnDescription: true,
                matchOnDetail: true,
            }
        );
        if (!selection) {
            return;
        }
        VisualizationPanel.openPinnedTab(selection.pinId, context.extensionUri);
    });

    // Command: Analyze Workspace Dependencies
    let workspaceCommand = vscode.commands.registerCommand('sql-crack.analyzeWorkspace', async (uri?: vscode.Uri) => {
        const config = getConfig();
        const defaultDialect = normalizeDialect(config.get<string>('defaultDialect') || 'MySQL');
        const { WorkspacePanel } = await loadWorkspacePanel();

        await WorkspacePanel.createOrShow(
            context.extensionUri,
            context,
            defaultDialect as any,
            uri
        );
    });

    let workspaceUxMetricsCommand = vscode.commands.registerCommand('sql-crack.showWorkspaceUxMetrics', async () => {
        const { WorkspacePanel } = await loadWorkspacePanel();
        const panel = WorkspacePanel.currentPanel;
        if (!panel) {
            vscode.window.showInformationMessage('Open Workspace Dependencies first to capture Graph UX metrics.');
            return;
        }

        const summaryLine = panel.getWorkspaceUxMetricsSummaryLine();
        logger.info(`[Workspace UX] manual snapshot ${summaryLine}`);

        const enabled = panel.isWorkspaceUxInstrumentationEnabled();
        const baseMessage = enabled
            ? `Workspace Graph UX metrics: ${summaryLine}`
            : `Workspace Graph UX instrumentation is disabled. Current counters: ${summaryLine}`;

        const actions = enabled
            ? ['Open SQL Crack Output', 'Reset Session Metrics']
            : ['Open SQL Crack Output', 'Enable Setting'];
        const selectedAction = await vscode.window.showInformationMessage(baseMessage, ...actions);
        if (selectedAction === 'Open SQL Crack Output') {
            logger.show();
            return;
        }
        if (selectedAction === 'Reset Session Metrics') {
            panel.resetWorkspaceUxMetrics();
            vscode.window.showInformationMessage('Workspace Graph UX session metrics reset.');
            return;
        }
        if (selectedAction === 'Enable Setting') {
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'sqlCrack.advanced.workspaceUxInstrumentation'
            );
        }
    });

    let diagnosticCodeActionProvider: vscode.Disposable | undefined;
    const registerDiagnosticCodeActionProvider = (): void => {
        diagnosticCodeActionProvider?.dispose();
        diagnosticCodeActionProvider = vscode.languages.registerCodeActionsProvider(
            getSqlCodeActionDocumentSelector(),
            new SqlCrackCodeActionProvider(),
            {
                providedCodeActionKinds: SqlCrackCodeActionProvider.providedCodeActionKinds,
            }
        );
    };
    registerDiagnosticCodeActionProvider();

    context.subscriptions.push(activeEditorListener);
    context.subscriptions.push(workspaceCommand);
    context.subscriptions.push(workspaceUxMetricsCommand);
    context.subscriptions.push({
        dispose: () => diagnosticCodeActionProvider?.dispose(),
    });

    // Listen for cursor position changes in SQL files.
    // Only the raw cursor line is sent to the webview; the webview owns the
    // authoritative query line ranges (from its parse) and maps the line to the
    // correct query itself. Re-deriving statement boundaries here with a separate
    // splitter risked drifting from the parser's view and selecting the wrong query.
    let cursorChangeListener = vscode.window.onDidChangeTextEditorSelection((e) => {
        // Scope cursor-follow to the panel's source document only. The webview maps
        // the line through that document's query ranges, so a cursor line from any
        // other SQL file would be interpreted against the wrong ranges.
        const sourceUri = VisualizationPanel.sourceDocumentUri;
        const isSourceDoc = !!sourceUri &&
            e.textEditor.document.uri.toString() === sourceUri.toString();
        if (isSourceDoc && VisualizationPanel.currentPanel && e.selections.length > 0) {
            const line = e.selections[0].active.line + 1; // 1-indexed
            VisualizationPanel.sendCursorPosition(line);
        }
    });

    const documentOpenListener = vscode.workspace.onDidOpenTextDocument((document) => {
        updateDiagnosticsForDocument(document);
    });

    const documentSaveListener = vscode.workspace.onDidSaveTextDocument((document) => {
        updateDiagnosticsForDocument(document);
    });

    const documentCloseListener = vscode.workspace.onDidCloseTextDocument((document) => {
        diagnosticsCollection.delete(document.uri);
        if (lastActiveSqlDocument && lastActiveSqlDocument.uri.toString() === document.uri.toString()) {
            lastActiveSqlDocument = null;
        }
    });

    // Listen for document changes with debounced auto-refresh
    let docChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
        const config = getConfig();
        const diagnosticsAutoRefresh = config.get<boolean>('autoRefresh', true);
        const autoRefreshDelay = config.get<number>('autoRefreshDelay', 500);

        if (isSqlLikeDocument(e.document) && diagnosticsAutoRefresh && shouldShowDiagnosticsInProblems()) {
            if (diagnosticsRefreshTimer) {
                clearTimeout(diagnosticsRefreshTimer);
            }
            diagnosticsRefreshTimer = setTimeout(() => {
                updateDiagnosticsForDocument(e.document);
                diagnosticsRefreshTimer = null;
            }, autoRefreshDelay);
        }

        // Only refresh the panel when the changed document is the exact source
        // document the visualization was opened from. Edits in any other SQL file
        // must not hijack or overwrite the active visualization.
        const sourceUri = VisualizationPanel.sourceDocumentUri;
        const isSourceDoc = !!sourceUri &&
            e.document.uri.toString() === sourceUri.toString();
        if (isSourceDoc && VisualizationPanel.currentPanel) {
            const autoRefreshEnabled = config.get<boolean>('autoRefresh', true);

            // Always mark as stale immediately for visual feedback
            VisualizationPanel.markAsStale();

            if (autoRefreshEnabled) {
                // Clear any existing timer (debounce)
                if (autoRefreshTimer) {
                    clearTimeout(autoRefreshTimer);
                }

                // Set new debounced timer
                autoRefreshTimer = setTimeout(() => {
                    autoRefreshTimer = null;
                    const document = e.document;

                    // Re-validate the source at fire time: the panel may have been
                    // switched to a different source document during the debounce
                    // window, in which case refreshing with this document would
                    // overwrite the newly selected visualization.
                    const currentSourceUri = VisualizationPanel.sourceDocumentUri;
                    const stillSourceDoc = !!currentSourceUri &&
                        document.uri.toString() === currentSourceUri.toString();

                    if (document && VisualizationPanel.currentPanel && stillSourceDoc) {
                        const sqlCode = document.getText();
                        if (!hasExecutableSql(sqlCode)) {
                            return;
                        }
                        const defaultDialect = normalizeDialect(config.get<string>('defaultDialect') || 'MySQL');

                        VisualizationPanel.refresh(sqlCode, {
                            dialect: defaultDialect,
                            fileName: path.basename(document.fileName) || 'Query',
                            documentUri: document.uri
                        });
                    }
                }, autoRefreshDelay);
            }
        }
    });

    // Listen for configuration changes to reload custom functions and file extensions
    const configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('sqlCrack.customAggregateFunctions') ||
            e.affectsConfiguration('sqlCrack.customWindowFunctions')) {
            loadCustomFunctions();
        }
        if (e.affectsConfiguration('sqlCrack.additionalFileExtensions')) {
            loadAdditionalExtensions();
            registerDiagnosticCodeActionProvider();
            // Re-evaluate context for current editor with new extensions
            updateSqlLikeFileContext(vscode.window.activeTextEditor);
        }
        if (e.affectsConfiguration('sqlCrack.advanced.showDiagnosticsInProblems')) {
            if (!shouldShowDiagnosticsInProblems()) {
                diagnosticsCollection.clear();
            } else {
                vscode.workspace.textDocuments.forEach((document) => {
                    updateDiagnosticsForDocument(document);
                });
            }
        }
        if (e.affectsConfiguration('sqlCrack.autoDetectDialect')) {
            vscode.workspace.textDocuments.forEach((document) => {
                updateDiagnosticsForDocument(document);
            });
        }
    });

    // Prime diagnostics for currently open SQL-like documents
    vscode.workspace.textDocuments.forEach((document) => {
        updateDiagnosticsForDocument(document);
    });

    context.subscriptions.push(visualizeCommand);
    context.subscriptions.push(refreshCommand);
    context.subscriptions.push(restorePinnedTabsCommand);
    context.subscriptions.push(cursorChangeListener);
    context.subscriptions.push(documentOpenListener);
    context.subscriptions.push(documentSaveListener);
    context.subscriptions.push(documentCloseListener);
    context.subscriptions.push(docChangeListener);
    context.subscriptions.push(configChangeListener);
}

export function deactivate() {
    // Clean up auto-refresh timer
    if (autoRefreshTimer) {
        clearTimeout(autoRefreshTimer);
        autoRefreshTimer = null;
    }
    if (diagnosticsRefreshTimer) {
        clearTimeout(diagnosticsRefreshTimer);
        diagnosticsRefreshTimer = null;
    }
}
