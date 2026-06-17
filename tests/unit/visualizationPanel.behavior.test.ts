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

        expect(escaped).toContain('<\\/script>');
        expect(escaped).toContain('<\\!--');
        expect(escaped).toContain('--\\>');
        expect(escaped).toContain(']\\]>');
        expect(escaped).not.toContain('</script>');
    });
});
