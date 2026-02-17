import * as vscode from 'vscode';
import * as path from 'path';
import { VisualizationPanel } from './visualizationPanel';
import { WorkspacePanel } from './workspace';
import { setCustomFunctions } from './dialects';
import { logger } from './logger';
import { parseSqlBatch, DEFAULT_VALIDATION_LIMITS } from './webview/sqlParser';
import {
    createDiagnosticsFromBatch,
    SqlCrackCodeActionProvider,
} from './diagnostics';

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

        try {
            const config = getConfig();
            const defaultDialect = normalizeDialect(config.get<string>('defaultDialect') || 'MySQL');
            const maxFileSizeKB = config.get<number>('advanced.maxFileSizeKB', 100);
            const maxStatements = config.get<number>('advanced.maxStatements', 50);
            const combineDdlStatements = config.get<boolean>('advanced.combineDdlStatements', false);
            const batch = parseSqlBatch(
                sql,
                defaultDialect as any,
                {
                    maxSqlSizeBytes: (maxFileSizeKB || 100) * 1024,
                    maxQueryCount: maxStatements || DEFAULT_VALIDATION_LIMITS.maxQueryCount,
                },
                {
                    combineDdlStatements,
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
        if (editor && isSqlLikeDocument(editor.document)) {
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

        // Get default dialect from settings
        const config = getConfig();
        const defaultDialect = normalizeDialect(config.get<string>('defaultDialect') || 'MySQL');

        // Create or show visualization panel
        VisualizationPanel.createOrShow(context.extensionUri, sqlCode, {
            dialect: defaultDialect,
            fileName: path.basename(document.fileName) || 'Query',
            documentUri: document.uri
        });
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
        } else {
            vscode.window.showWarningMessage('No SQL file to refresh. Please open a SQL file first.');
        }
    });

    // Command: Analyze Workspace Dependencies
    let workspaceCommand = vscode.commands.registerCommand('sql-crack.analyzeWorkspace', async () => {
        const config = getConfig();
        const defaultDialect = normalizeDialect(config.get<string>('defaultDialect') || 'MySQL');

        await WorkspacePanel.createOrShow(
            context.extensionUri,
            context,
            defaultDialect as any
        );
    });

    const diagnosticCodeActionProvider = vscode.languages.registerCodeActionsProvider(
        [
            { language: 'sql', scheme: 'file' },
            { language: 'sql', scheme: 'untitled' },
        ],
        new SqlCrackCodeActionProvider(),
        {
            providedCodeActionKinds: SqlCrackCodeActionProvider.providedCodeActionKinds,
        }
    );

    context.subscriptions.push(activeEditorListener);
    context.subscriptions.push(workspaceCommand);
    context.subscriptions.push(diagnosticCodeActionProvider);

    // Listen for cursor position changes in SQL files
    let cursorChangeListener = vscode.window.onDidChangeTextEditorSelection((e) => {
        const config = getConfig();
        const syncEnabled = config.get<boolean>('syncEditorToFlow');

        if (syncEnabled && isSqlLikeDocument(e.textEditor.document) && VisualizationPanel.currentPanel && e.selections.length > 0) {
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

    const documentOpenListener = vscode.workspace.onDidOpenTextDocument((document) => {
        updateDiagnosticsForDocument(document);
    });

    const documentSaveListener = vscode.workspace.onDidSaveTextDocument((document) => {
        updateDiagnosticsForDocument(document);
    });

    const documentCloseListener = vscode.workspace.onDidCloseTextDocument((document) => {
        diagnosticsCollection.delete(document.uri);
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

        const isSourceDoc = VisualizationPanel.sourceDocumentUri &&
            e.document.uri.toString() === VisualizationPanel.sourceDocumentUri.toString();
        if ((isSqlLikeDocument(e.document) || isSourceDoc) && VisualizationPanel.currentPanel) {
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
                    const document = e.document;
                    if (document && VisualizationPanel.currentPanel) {
                        const sqlCode = document.getText();
                        const defaultDialect = normalizeDialect(config.get<string>('defaultDialect') || 'MySQL');

                        VisualizationPanel.refresh(sqlCode, {
                            dialect: defaultDialect,
                            fileName: path.basename(document.fileName) || 'Query',
                            documentUri: document.uri
                        });
                    }
                    autoRefreshTimer = null;
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
    });

    // Prime diagnostics for currently open SQL-like documents
    vscode.workspace.textDocuments.forEach((document) => {
        updateDiagnosticsForDocument(document);
    });

    context.subscriptions.push(visualizeCommand);
    context.subscriptions.push(refreshCommand);
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
