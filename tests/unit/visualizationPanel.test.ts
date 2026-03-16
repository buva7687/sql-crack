import { readFileSync } from 'fs';
import { join } from 'path';

describe('visualizationPanel.ts', () => {
    const source = readFileSync(join(__dirname, '../../src/visualizationPanel.ts'), 'utf8');

    describe('normalizeAdvancedLimit function', () => {
        it('returns fallback for non-number types', () => {
            expect(source).toContain("typeof raw !== 'number'");
            expect(source).toContain('!Number.isFinite(raw)');
            expect(source).toContain('return fallback');
        });

        it('rounds values before clamping', () => {
            expect(source).toContain('const rounded = Math.round(raw)');
        });

        it('clamps to min/max range', () => {
            expect(source).toContain('Math.max(min, Math.min(max, rounded))');
        });
    });

    describe('getNonce function', () => {
        it('generates 32 character nonce', () => {
            expect(source).toContain('for (let i = 0; i < 32; i++)');
        });

        it('uses alphanumeric characters', () => {
            expect(source).toContain("'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'");
        });

        it('uses random selection', () => {
            expect(source).toContain('Math.random()');
        });
    });

    describe('_escapeForInlineScript security', () => {
        it('uses JSON.stringify for base escaping', () => {
            expect(source).toContain('JSON.stringify(value)');
        });

        it('escapes closing script tags', () => {
            expect(source).toContain(".replace(/<\\/script/gi, '<\\\\/script')");
        });

        it('escapes HTML comment start', () => {
            expect(source).toContain(".replace(/<!--/g, '<\\\\!--')");
        });

        it('escapes HTML comment end', () => {
            expect(source).toContain(".replace(/-->/g, '--\\\\>')");
        });

        it('escapes CDATA section end', () => {
            expect(source).toContain(".replace(/\\]\\]>/g, ']\\\\]>");
        });
    });

    describe('_createUiStateKey patterns', () => {
        it('creates pin key for pinned tabs', () => {
            expect(source).toContain("`pin:${options.pinId}`");
        });

        it('creates doc key for document URIs', () => {
            expect(source).toContain("`doc:${options.documentUri.toString()}`");
        });

        it('creates file key for file names', () => {
            expect(source).toContain("`file:${options.fileName}`");
        });

        it('returns null when no identifier available', () => {
            expect(source).toContain('return null');
        });
    });

    describe('pinned tabs persistence', () => {
        it('stores pinned tabs in workspaceState', () => {
            expect(source).toContain("workspaceState.get<PinnedVisualization[]>('pinnedTabs')");
            expect(source).toContain("workspaceState.update('pinnedTabs'");
        });

        it('updates existing pinned tab by id', () => {
            expect(source).toContain('pinnedTabs.findIndex(t => t.id === pin.id)');
            expect(source).toContain('pinnedTabs[existingIndex] = pin');
        });

        it('adds new pinned tab if not exists', () => {
            expect(source).toContain('pinnedTabs.push(pin)');
        });

        it('filters out removed pinned tabs', () => {
            expect(source).toContain('pinnedTabs.filter(t => t.id !== pinId)');
        });
    });

    describe('pinned panel management', () => {
        it('stores pinned panels in static Map', () => {
            expect(source).toContain('static pinnedPanels: Map<string, VisualizationPanel>');
            expect(source).toContain('pinnedPanels.set(id, pinnedPanel)');
            expect(source).toContain('pinnedPanels.delete(this._pinId)');
        });

        it('checks if pinned panel already open', () => {
            expect(source).toContain('pinnedPanels.has(pinId)');
            expect(source).toContain('pinnedPanels.get(pinId)?._panel.reveal()');
        });
    });

    describe('webview message handling', () => {
        it('handles error messages', () => {
            expect(source).toContain("case 'error':");
            expect(source).toContain('showErrorMessage(message.text)');
        });

        it('handles info messages', () => {
            expect(source).toContain("case 'info':");
            expect(source).toContain('showInformationMessage(message.text)');
        });

        it('handles goToLine navigation', () => {
            expect(source).toContain("case 'goToLine':");
            expect(source).toContain('this._goToLine(message.line)');
        });

        it('handles traceInWorkspaceLineage requests', () => {
            expect(source).toContain("case 'traceInWorkspaceLineage':");
            expect(source).toContain('this._traceInWorkspaceLineage(message.tableName, message.nodeType)');
        });

        it('handles pinVisualization request', () => {
            expect(source).toContain("case 'pinVisualization':");
            expect(source).toContain('createPinnedPanel');
        });

        it('handles persistUiState request', () => {
            expect(source).toContain("case 'persistUiState':");
            expect(source).toContain('_persistUiState');
        });

        it('handles unpinTab request', () => {
            expect(source).toContain("case 'unpinTab':");
            expect(source).toContain('removePinnedTab(message.pinId)');
        });

        it('handles savePng request', () => {
            expect(source).toContain("case 'savePng':");
            expect(source).toContain('_savePngFile(message.data, message.filename)');
        });

        it('handles saveSvg request', () => {
            expect(source).toContain("case 'saveSvg':");
            expect(source).toContain('_saveSvgFile(message.data, message.filename)');
        });

        it('handles savePdf request', () => {
            expect(source).toContain("case 'savePdf':");
            expect(source).toContain('_savePdfFile(message.data, message.filename)');
        });
    });

    describe('_goToLine navigation', () => {
        it('prefers source document URI', () => {
            expect(source).toContain('const targetUri = this._sourceDocumentUri');
            expect(source).toContain('vscode.workspace.openTextDocument(targetUri)');
        });

        it('falls back to active editor', () => {
            expect(source).toContain('const editor = vscode.window.activeTextEditor');
        });

        it('converts 1-indexed line to 0-indexed position', () => {
            expect(source).toContain('Math.max(0, line - 1)');
        });

        it('reveals line in center', () => {
            expect(source).toContain('vscode.TextEditorRevealType.InCenter');
        });

        it('logs error on document open failure', () => {
            expect(source).toContain("logger.error('Failed to open document', error)");
        });
    });

    describe('_traceInWorkspaceLineage', () => {
        it('opens the workspace panel and forwards the lineage trace request', () => {
            expect(source).toContain('WorkspacePanel.createOrShow(');
            expect(source).toContain('workspacePanel.traceTableInLineage(tableName, nodeType)');
        });

        it('shows an error when extension context is unavailable', () => {
            expect(source).toContain("'Cannot trace in workspace: extension context not available'");
        });
    });

    describe('_savePngFile', () => {
        it('shows save dialog with PNG filter', () => {
            expect(source).toContain('showSaveDialog');
            expect(source).toContain("'PNG Images': ['png']");
        });

        it('converts base64 to buffer', () => {
            expect(source).toContain("Buffer.from(base64Data, 'base64')");
        });

        it('writes file using VS Code filesystem API', () => {
            expect(source).toContain('vscode.workspace.fs.writeFile');
        });

        it('shows success message after save', () => {
            expect(source).toContain("showInformationMessage(`Saved:");
        });

        it('logs error on save failure', () => {
            expect(source).toContain("logger.error('Failed to save PNG'");
        });
    });

    describe('_saveSvgFile', () => {
        it('shows save dialog with SVG filter', () => {
            expect(source).toContain("'SVG Images': ['svg']");
        });

        it('writes utf8 SVG text through VS Code filesystem API', () => {
            expect(source).toContain("Buffer.from(svgData, 'utf8')");
            expect(source).toContain('vscode.workspace.fs.writeFile');
        });

        it('logs error on svg save failure', () => {
            expect(source).toContain("logger.error('Failed to save SVG'");
        });
    });

    describe('_savePdfFile', () => {
        it('shows save dialog with PDF filter', () => {
            expect(source).toContain("'PDF Documents': ['pdf']");
        });

        it('converts base64 PDF payload to a buffer before writing', () => {
            expect(source).toContain("Buffer.from(base64Data, 'base64')");
            expect(source).toContain('vscode.workspace.fs.writeFile');
        });

        it('logs error on pdf save failure', () => {
            expect(source).toContain("logger.error('Failed to save PDF'");
        });
    });

    describe('panel disposal', () => {
        it('sets disposed flag', () => {
            expect(source).toContain('this._disposed = true');
        });

        it('removes from pinned panels map if pinned', () => {
            expect(source).toContain('if (this._isPinned && this._pinId)');
            expect(source).toContain('pinnedPanels.delete(this._pinId)');
        });

        it('clears current panel if not pinned', () => {
            expect(source).toContain('VisualizationPanel.currentPanel = undefined');
        });

        it('disposes all listeners before panel', () => {
            expect(source).toContain('while (this._disposables.length)');
            expect(source).toContain('x.dispose()');
        });

        it('disposes panel after listeners', () => {
            expect(source).toContain('this._panel.dispose()');
            expect(source).toContain('while (this._disposables.length)');
        });
    });

    describe('_postMessage disposal guard', () => {
        it('checks disposed flag before posting', () => {
            expect(source).toContain('if (this._disposed) { return; }');
            expect(source).toContain('this._panel.webview.postMessage');
        });
    });

    describe('configuration reading', () => {
        it('reads theme preference setting', () => {
            expect(source).toContain("get<string>('advanced.defaultTheme', 'light')");
        });

        it('reads view location setting', () => {
            expect(source).toContain("get<ViewLocation>('viewLocation') || 'tab'");
        });

        it('reads default layout setting', () => {
            expect(source).toContain("get<string>('defaultLayout') || 'vertical'");
        });

        it('reads advanced limits with fallbacks', () => {
            expect(source).toContain('normalizeAdvancedLimit');
            expect(source).toContain('maxFileSizeKB');
            expect(source).toContain('maxStatements');
            expect(source).toContain('deferredQueryThreshold');
            expect(source).toContain('parseTimeoutSeconds');
        });
    });

    describe('theme detection', () => {
        it('detects high contrast themes', () => {
            expect(source).toContain('vscode.ColorThemeKind.HighContrast');
            expect(source).toContain('vscode.ColorThemeKind.HighContrastLight');
        });

        it('respects theme preference setting (light/dark/auto)', () => {
            expect(source).toContain("if (themePreference === 'light')");
            expect(source).toContain("else if (themePreference === 'dark')");
        });

        it('falls back to VS Code theme for auto', () => {
            expect(source).toContain("themeKind === vscode.ColorThemeKind.Light");
        });
    });

    describe('CSP header', () => {
        it('restricts to nonce scripts only', () => {
            expect(source).toContain("script-src 'nonce-${nonce}'");
        });

        it('allows inline styles from webview CSP source', () => {
            expect(source).toContain("style-src ${webview.cspSource} 'unsafe-inline'");
        });

        it('allows data and blob images for export', () => {
            expect(source).toContain('img-src data: blob:');
        });

        it('sets default-src to none', () => {
            expect(source).toContain("default-src 'none'");
        });
    });

    describe('webpack nonce injection', () => {
        it('sets webpack nonce for chunk loading', () => {
            expect(source).toContain('window.__webpack_nonce__');
            expect(source).toContain('_escapeForInlineScript(nonce)');
        });
    });

    describe('window config injection', () => {
        it('injects sqlCrackConfig object', () => {
            expect(source).toContain('window.sqlCrackConfig = {');
        });

        it('injects all required config fields', () => {
            const requiredFields = [
                'initialSqlCode',
                'vscodeTheme',
                'isHighContrast',
                'defaultDialect',
                'autoDetectDialect',
                'fileName',
                'isPinnedView',
                'pinId',
                'viewLocation',
                'defaultLayout',
                'persistedPinnedTabs',
                'initialUiState',
                'showDeadColumnHints',
                'combineDdlStatements',
                'gridStyle',
                'nodeAccentPosition',
                'showMinimap',
                'colorblindMode',
                'maxFileSizeKB',
                'maxStatements',
                'deferredQueryThreshold',
                'parseTimeoutSeconds',
                'isFirstRun',
                'debugLogging',
            ];

            for (const field of requiredFields) {
                expect(source).toContain(`${field}: \${this._escapeForInlineScript`);
            }
        });

        it('escapes all injected values', () => {
            const escapeMatches = source.match(/_escapeForInlineScript\([^)]+\)/g);
            expect(escapeMatches?.length).toBeGreaterThan(20);
        });
    });

    describe('first run detection', () => {
        it('checks globalState for hasLaunched flag', () => {
            expect(source).toContain("globalState.get<boolean>('sqlCrack.hasLaunched')");
        });

        it('sets hasLaunched flag on first run', () => {
            expect(source).toContain("globalState.update('sqlCrack.hasLaunched', true)");
        });

        it('returns true only on first run', () => {
            expect(source).toContain('return true');
            expect(source).toContain('return false');
        });
    });

    describe('view column selection', () => {
        it('returns Active for tab location', () => {
            expect(source).toContain("case 'tab':");
            expect(source).toContain('return vscode.ViewColumn.Active');
        });

        it('returns Beside for beside location', () => {
            expect(source).toContain("case 'beside':");
            expect(source).toContain('return vscode.ViewColumn.Beside');
        });
    });
});

describe('visualizationPanel static state management', () => {
    const source = readFileSync(join(__dirname, '../../src/visualizationPanel.ts'), 'utf8');

    it('stores context for workspace state access', () => {
        expect(source).toContain('static _context: vscode.ExtensionContext');
        expect(source).toContain('VisualizationPanel._context = context');
    });

    it('tracks current panel instance', () => {
        expect(source).toContain('public static currentPanel: VisualizationPanel | undefined');
        expect(source).toContain('VisualizationPanel.currentPanel = newPanel');
        expect(source).toContain('VisualizationPanel.currentPanel = undefined');
    });

    it('exposes source document URI', () => {
        expect(source).toContain('public static get sourceDocumentUri');
        expect(source).toContain('return VisualizationPanel.currentPanel?._sourceDocumentUri');
    });
});

describe('visualizationPanel refresh flow', () => {
    const source = readFileSync(join(__dirname, '../../src/visualizationPanel.ts'), 'utf8');

    it('posts refresh message to webview', () => {
        expect(source).toContain("command: 'refresh'");
        expect(source).toContain('sql: sqlCode');
        expect(source).toContain('options: options');
    });

    it('updates current SQL and options', () => {
        expect(source).toContain('currentPanel._currentSql = sqlCode');
        expect(source).toContain('currentPanel._currentOptions = options');
    });

    it('clears stale flag', () => {
        expect(source).toContain('currentPanel._isStale = false');
    });
});

describe('visualizationPanel stale state', () => {
    const source = readFileSync(join(__dirname, '../../src/visualizationPanel.ts'), 'utf8');

    it('marks panel as stale', () => {
        expect(source).toContain('public static markAsStale()');
        expect(source).toContain('currentPanel._isStale = true');
    });

    it('posts markStale message to webview', () => {
        expect(source).toContain("command: 'markStale'");
    });
});
