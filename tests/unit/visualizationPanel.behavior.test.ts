import * as vscode from 'vscode';
import { VisualizationPanel } from '../../src/visualizationPanel';

describe('VisualizationPanel behavior', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode as any).__resetMockConfig?.();
    });

    it('reads and normalizes the live default dialect for runtime updates', () => {
        (vscode as any).__setMockConfig?.('sqlCrack', {
            defaultDialect: 'SQL Server',
            autoDetectDialect: false,
            gridStyle: 'dots',
        });

        const config = (VisualizationPanel.prototype as any)._readRuntimeConfig.call(
            {},
            { dialect: 'PostgreSQL', fileName: 'query.sql' }
        );

        expect(config.defaultDialect).toBe('TransactSQL');
        expect(config.autoDetectDialect).toBe(false);
        expect(config.gridStyle).toBe('dots');
    });

    it('falls back to the opened dialect and clamps advanced runtime limits', () => {
        (vscode as any).__setMockConfig?.('sqlCrack', {
            'advanced.maxFileSizeKB': 2,
            'advanced.maxStatements': 999,
            'advanced.deferredQueryThreshold': 12.6,
            'advanced.parseTimeoutSeconds': Number.NaN,
            colorblindMode: 'unsupported-mode',
        });

        const config = (VisualizationPanel.prototype as any)._readRuntimeConfig.call(
            {},
            { dialect: 'PL/SQL', fileName: 'query.sql' }
        );

        expect(config.defaultDialect).toBe('Oracle');
        expect(config.maxFileSizeKB).toBe(10);
        expect(config.maxStatements).toBe(500);
        expect(config.deferredQueryThreshold).toBe(13);
        expect(config.parseTimeoutSeconds).toBe(5);
        expect(config.colorblindMode).toBe('off');
    });

    it('escapes script termination and parser-sensitive HTML sequences', () => {
        const escaped = (VisualizationPanel.prototype as any)._escapeForInlineScript.call(
            {},
            '</script><!-- -->]]>'
        );

        expect(escaped).toContain('\\u003c/script\\u003e');
        expect(escaped).toContain('\\u003c!--');
        expect(escaped).toContain('--\\u003e');
        expect(escaped).toContain(']]\\u003e');
        expect(escaped).not.toContain('</script>');
    });

    it('refreshes a pinned snapshot in the panel that requested it', () => {
        const postMessage = jest.fn();
        const panel = {
            _isPinned: true,
            _currentSql: 'SELECT * FROM pinned_snapshot',
            _currentOptions: { dialect: 'PostgreSQL', fileName: 'snapshot.sql' },
            _isStale: true,
            _postMessage: postMessage,
        };

        (VisualizationPanel.prototype as any)._handleRefreshRequest.call(panel);

        expect(postMessage).toHaveBeenCalledWith({
            command: 'refresh',
            sql: 'SELECT * FROM pinned_snapshot',
            options: { dialect: 'PostgreSQL', fileName: 'snapshot.sql' },
        });
        expect(panel._isStale).toBe(false);
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('sql-crack.refresh');
    });

    it('routes mutable main-panel refresh through the source-aware command', () => {
        const panel = {
            _isPinned: false,
            _currentSql: 'SELECT 1',
            _currentOptions: { dialect: 'MySQL', fileName: 'query.sql' },
            _postMessage: jest.fn(),
        };

        (VisualizationPanel.prototype as any)._handleRefreshRequest.call(panel);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('sql-crack.refresh');
        expect(panel._postMessage).not.toHaveBeenCalled();
    });
});
