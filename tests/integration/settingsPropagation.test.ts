/**
 * Integration test: Settings propagation contracts
 *
 * Validates that settings declared in package.json flow correctly through
 * the extension → panel → webview chain, covering:
 *   - normalizeDialect mapping
 *   - Custom function injection into functionRegistry
 *   - additionalFileExtensions normalization
 *   - RuntimeConfig completeness
 *   - Webview Window interface coverage
 *   - runtimeConfig message handling in index.ts
 */

jest.mock('vscode');
jest.mock('../../src/visualizationPanel', () => ({
    VisualizationPanel: {
        setContext: jest.fn(),
        setActiveEditorActivity: jest.fn(),
        currentPanel: null,
        sourceDocumentUri: null,
        getPinnedTabs: jest.fn().mockReturnValue([]),
        createOrShow: jest.fn(),
        refresh: jest.fn(),
        markAsStale: jest.fn(),
        sendCursorPosition: jest.fn(),
        sendQueryIndex: jest.fn(),
        openPinnedTab: jest.fn(),
    },
}));
jest.mock('../../src/workspace', () => ({
    WorkspacePanel: {
        createOrShow: jest.fn().mockResolvedValue(undefined),
        currentPanel: null,
    },
}));
jest.mock('../../src/logger', () => ({
    logger: {
        initialize: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        show: jest.fn(),
    },
}));

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { normalizeDialect, normalizeAdvancedLimit, activate } from '../../src/extension';
import { setCustomFunctions, getFunctionsForDialect, isAggregateFunction, isWindowFunction } from '../../src/dialects/functionRegistry';

// ============================================================
// Source paths
// ============================================================

const PKG_PATH = path.join(__dirname, '../../package.json');
const EXTENSION_PATH = path.join(__dirname, '../../src/extension.ts');
const VIZ_PANEL_PATH = path.join(__dirname, '../../src/visualizationPanel.ts');
const INDEX_PATH = path.join(__dirname, '../../src/webview/index.ts');
const RUNTIME_CONFIG_PATH = path.join(__dirname, '../../src/shared/messages/sqlFlowRuntimeConfig.ts');

function readSource(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
}

const pkg = require('../../package.json');
const configProps = pkg.contributes.configuration.properties;

// ============================================================
// Tests
// ============================================================

describe('Settings Propagation', () => {

    // --------------------------------------------------------
    // 1. normalizeDialect
    // --------------------------------------------------------
    describe('normalizeDialect()', () => {
        it('maps "SQL Server" to "TransactSQL"', () => {
            expect(normalizeDialect('SQL Server')).toBe('TransactSQL');
        });

        it('maps "PL/SQL" to "Oracle"', () => {
            expect(normalizeDialect('PL/SQL')).toBe('Oracle');
        });

        it('passes through all standard dialects unchanged', () => {
            const standardDialects = [
                'MySQL', 'PostgreSQL', 'Snowflake', 'BigQuery',
                'Redshift', 'Hive', 'SQLite', 'TransactSQL',
                'Oracle', 'Teradata', 'Athena', 'Trino', 'MariaDB',
            ];
            for (const d of standardDialects) {
                expect(normalizeDialect(d)).toBe(d);
            }
        });

        it('all package.json defaultDialect enum values survive normalizeDialect', () => {
            const enumValues: string[] = configProps['sqlCrack.defaultDialect'].enum;
            for (const val of enumValues) {
                const result = normalizeDialect(val);
                expect(typeof result).toBe('string');
                expect(result.length).toBeGreaterThan(0);
            }
        });
    });

    // --------------------------------------------------------
    // 2. Custom function injection → functionRegistry
    // --------------------------------------------------------
    describe('Custom function injection', () => {
        afterEach(() => {
            // Reset custom functions
            setCustomFunctions([], []);
        });

        it('setCustomFunctions makes custom aggregates available via getFunctionsForDialect', () => {
            setCustomFunctions(['MY_CUSTOM_AGG', 'another_agg'], []);
            const funcs = getFunctionsForDialect('MySQL');
            expect(funcs.aggregates.has('MY_CUSTOM_AGG')).toBe(true);
            expect(funcs.aggregates.has('ANOTHER_AGG')).toBe(true);
        });

        it('setCustomFunctions makes custom window functions available', () => {
            setCustomFunctions([], ['MY_WIN_FUNC']);
            const funcs = getFunctionsForDialect('PostgreSQL');
            expect(funcs.window.has('MY_WIN_FUNC')).toBe(true);
        });

        it('custom functions are uppercased for consistent matching', () => {
            setCustomFunctions(['lower_case_agg'], ['lower_case_win']);
            expect(isAggregateFunction('lower_case_agg', 'MySQL')).toBe(true);
            expect(isAggregateFunction('LOWER_CASE_AGG', 'MySQL')).toBe(true);
            expect(isWindowFunction('lower_case_win', 'MySQL')).toBe(true);
        });

        it('custom functions are available across all dialects', () => {
            setCustomFunctions(['CROSS_DIALECT_AGG'], []);
            const dialects = ['MySQL', 'PostgreSQL', 'Snowflake', 'BigQuery', 'TransactSQL'];
            for (const dialect of dialects) {
                expect(isAggregateFunction('CROSS_DIALECT_AGG', dialect)).toBe(true);
            }
        });

        it('resetting custom functions removes them', () => {
            setCustomFunctions(['TEMP_AGG'], []);
            expect(isAggregateFunction('TEMP_AGG', 'MySQL')).toBe(true);

            setCustomFunctions([], []);
            expect(isAggregateFunction('TEMP_AGG', 'MySQL')).toBe(false);
        });

        it('built-in functions are preserved when custom functions are set', () => {
            // SUM, COUNT, AVG should always be present
            setCustomFunctions(['MY_CUSTOM'], []);
            const funcs = getFunctionsForDialect('MySQL');
            expect(funcs.aggregates.has('SUM')).toBe(true);
            expect(funcs.aggregates.has('COUNT')).toBe(true);
            expect(funcs.aggregates.has('MY_CUSTOM')).toBe(true);
        });
    });

    // --------------------------------------------------------
    // 3. package.json setting completeness
    // --------------------------------------------------------
    describe('package.json setting declarations', () => {
        it('defaultDialect includes user-friendly aliases', () => {
            const enumValues: string[] = configProps['sqlCrack.defaultDialect'].enum;
            expect(enumValues).toContain('SQL Server');
            expect(enumValues).toContain('MySQL');
            expect(enumValues).toContain('PostgreSQL');
            expect(enumValues).toContain('Snowflake');
            expect(enumValues).toContain('BigQuery');
        });

        it('colorblindMode has all required modes', () => {
            const modes: string[] = configProps['sqlCrack.colorblindMode'].enum;
            expect(modes).toContain('off');
            expect(modes).toContain('deuteranopia');
            expect(modes).toContain('protanopia');
            expect(modes).toContain('tritanopia');
        });

        it('gridStyle has dots, lines, and none', () => {
            const styles: string[] = configProps['sqlCrack.gridStyle'].enum;
            expect(styles).toEqual(expect.arrayContaining(['dots', 'lines', 'none']));
        });

        it('nodeAccentPosition has left and bottom', () => {
            const positions: string[] = configProps['sqlCrack.nodeAccentPosition'].enum;
            expect(positions).toContain('left');
            expect(positions).toContain('bottom');
        });

        it('defaultLayout has all layout types', () => {
            const layouts: string[] = configProps['sqlCrack.defaultLayout'].enum;
            expect(layouts).toEqual(expect.arrayContaining([
                'vertical', 'horizontal', 'compact', 'force', 'radial',
            ]));
        });

        it('customAggregateFunctions is array type', () => {
            expect(configProps['sqlCrack.customAggregateFunctions'].type).toBe('array');
        });

        it('customWindowFunctions is array type', () => {
            expect(configProps['sqlCrack.customWindowFunctions'].type).toBe('array');
        });

        it('additionalFileExtensions is array type', () => {
            expect(configProps['sqlCrack.additionalFileExtensions'].type).toBe('array');
        });

        it('advanced settings have correct types', () => {
            expect(configProps['sqlCrack.advanced.maxFileSizeKB'].type).toBe('number');
            expect(configProps['sqlCrack.advanced.maxStatements'].type).toBe('number');
            expect(configProps['sqlCrack.advanced.parseTimeoutSeconds'].type).toBe('number');
            expect(configProps['sqlCrack.advanced.debugLogging'].type).toBe('boolean');
        });
    });

    // --------------------------------------------------------
    // 4. SqlFlowRuntimeConfig covers all runtime settings
    // --------------------------------------------------------
    describe('SqlFlowRuntimeConfig completeness', () => {
        const configSource = readSource(RUNTIME_CONFIG_PATH);

        it('declares all core runtime settings', () => {
            const requiredFields = [
                'vscodeTheme', 'isHighContrast', 'defaultDialect',
                'autoDetectDialect', 'viewLocation', 'defaultLayout',
            ];
            for (const field of requiredFields) {
                expect(configSource).toContain(`${field}:`);
            }
        });

        it('declares all UI/UX settings', () => {
            const uiFields = [
                'gridStyle', 'nodeAccentPosition', 'showMinimap',
                'colorblindMode', 'showDeadColumnHints', 'combineDdlStatements',
            ];
            for (const field of uiFields) {
                expect(configSource).toContain(`${field}:`);
            }
        });

        it('declares all performance limit settings', () => {
            const limitFields = [
                'maxFileSizeKB', 'maxStatements',
                'deferredQueryThreshold', 'parseTimeoutSeconds',
            ];
            for (const field of limitFields) {
                expect(configSource).toContain(`${field}:`);
            }
        });

        it('declares debugLogging', () => {
            expect(configSource).toContain('debugLogging:');
        });
    });

    // --------------------------------------------------------
    // 5. VisualizationPanel reads and injects all settings
    // --------------------------------------------------------
    describe('VisualizationPanel settings propagation', () => {
        const panelSource = readSource(VIZ_PANEL_PATH);

        it('reads all runtime config settings from VS Code config', () => {
            // These settings are read via config.get('settingName') in _readRuntimeConfig
            const settingsRead = [
                'autoDetectDialect', 'viewLocation',
                'defaultLayout', 'gridStyle', 'nodeAccentPosition',
                'showMinimap', 'colorblindMode',
            ];
            for (const s of settingsRead) {
                expect(panelSource).toContain(`'${s}'`);
            }
            // defaultDialect is passed via options.dialect, not read directly from config in the panel
            expect(panelSource).toContain('defaultDialect');
        });

        it('reads advanced settings', () => {
            const advancedSettings = [
                'advanced.defaultTheme', 'advanced.showDeadColumnHints',
                'advanced.combineDdlStatements', 'advanced.maxFileSizeKB',
                'advanced.maxStatements', 'advanced.parseTimeoutSeconds',
                'advanced.debugLogging',
            ];
            for (const s of advancedSettings) {
                expect(panelSource).toContain(`'${s}'`);
            }
        });

        it('injects settings into webview HTML via sqlCrackConfig or window properties', () => {
            // These should be present in the HTML injection section
            const injectedProps = [
                'gridStyle', 'nodeAccentPosition', 'colorblindMode',
                'maxFileSizeKB', 'maxStatements', 'debugLogging',
            ];
            for (const prop of injectedProps) {
                expect(panelSource).toContain(prop);
            }
        });

        it('sends runtimeConfig message on configuration change', () => {
            expect(panelSource).toContain("command: 'runtimeConfig'");
        });

        it('uses _escapeForInlineScript for safe injection', () => {
            expect(panelSource).toContain('_escapeForInlineScript');
        });

        it('normalizes dialect for workspace tracing', () => {
            // The panel normalizes dialect via normalizeWorkspaceDialect (local method)
            expect(panelSource).toContain('normalizeWorkspaceDialect');
        });
    });

    // --------------------------------------------------------
    // 6. Webview index.ts Window interface and runtime config handling
    // --------------------------------------------------------
    describe('Webview index.ts settings consumption', () => {
        const indexSource = readSource(INDEX_PATH);

        it('Window interface declares all bootstrap properties', () => {
            // Most are optional (?:) but initialSqlCode is required
            const optionalProps = [
                'vscodeTheme', 'defaultDialect',
                'autoDetectDialect', 'gridStyle', 'nodeAccentPosition',
                'showMinimap', 'colorblindMode', 'maxFileSizeKB',
                'maxStatements', 'debugLogging', 'defaultLayout',
            ];
            for (const prop of optionalProps) {
                expect(indexSource).toContain(`${prop}?:`);
            }
            // initialSqlCode is required (no ?)
            expect(indexSource).toContain('initialSqlCode:');
        });

        it('handles runtimeConfig message', () => {
            expect(indexSource).toContain("'runtimeConfig'");
        });

        it('has applyRuntimeConfigUpdate function or logic', () => {
            expect(indexSource).toContain('applyRuntimeConfig');
        });

        it('references sqlCrackConfig for modern bootstrap', () => {
            expect(indexSource).toContain('sqlCrackConfig');
        });
    });

    // --------------------------------------------------------
    // 7. Extension.ts settings wiring
    // --------------------------------------------------------
    describe('Extension.ts settings wiring', () => {
        const extSource = readSource(EXTENSION_PATH);

        it('loadCustomFunctions reads customAggregateFunctions and customWindowFunctions', () => {
            expect(extSource).toContain("'customAggregateFunctions'");
            expect(extSource).toContain("'customWindowFunctions'");
            expect(extSource).toContain('setCustomFunctions');
        });

        it('loadAdditionalExtensions reads and normalizes file extensions', () => {
            expect(extSource).toContain("'additionalFileExtensions'");
            expect(extSource).toContain('.toLowerCase()');
            expect(extSource).toContain("startsWith('.')");
        });

        it('listens for configuration changes', () => {
            expect(extSource).toContain('onDidChangeConfiguration');
        });

        it('uses normalizeDialect when reading dialect settings', () => {
            // normalizeDialect should be called wherever defaultDialect is consumed
            expect(extSource).toContain('normalizeDialect');
        });
    });

    // --------------------------------------------------------
    // 8. End-to-end: Setting names match across layers
    // --------------------------------------------------------
    describe('Cross-layer setting name consistency', () => {
        const panelSource = readSource(VIZ_PANEL_PATH);
        const configSource = readSource(RUNTIME_CONFIG_PATH);

        it('every SqlFlowRuntimeConfig field is referenced in visualizationPanel', () => {
            // Extract field names from the interface
            const fieldRegex = /^\s+(\w+):\s/gm;
            let match;
            const fields: string[] = [];
            while ((match = fieldRegex.exec(configSource)) !== null) {
                fields.push(match[1]);
            }

            // Each field should appear in the panel source (either being set or read)
            for (const field of fields) {
                expect(panelSource).toContain(field);
            }
        });

        it('colorblindMode enum values in package.json match theme.ts ColorblindMode type', () => {
            const themeSource = readSource(path.join(__dirname, '../../src/shared/theme.ts'));
            const pkgModes: string[] = configProps['sqlCrack.colorblindMode'].enum;

            for (const mode of pkgModes) {
                expect(themeSource).toContain(`'${mode}'`);
            }
        });
    });

    // --------------------------------------------------------
    // 9. normalizeAdvancedLimit — runtime clamping unit tests
    // --------------------------------------------------------
    describe('normalizeAdvancedLimit()', () => {
        it('returns fallback for non-number input', () => {
            expect(normalizeAdvancedLimit(undefined, 50, 1, 500)).toBe(50);
            expect(normalizeAdvancedLimit(null, 50, 1, 500)).toBe(50);
            expect(normalizeAdvancedLimit('abc', 50, 1, 500)).toBe(50);
            expect(normalizeAdvancedLimit(true, 50, 1, 500)).toBe(50);
        });

        it('returns fallback for NaN', () => {
            expect(normalizeAdvancedLimit(NaN, 100, 10, 10000)).toBe(100);
        });

        it('returns fallback for Infinity', () => {
            expect(normalizeAdvancedLimit(Infinity, 100, 10, 10000)).toBe(100);
            expect(normalizeAdvancedLimit(-Infinity, 100, 10, 10000)).toBe(100);
        });

        it('clamps below min', () => {
            expect(normalizeAdvancedLimit(0, 50, 1, 500)).toBe(1);
            expect(normalizeAdvancedLimit(-10, 50, 1, 500)).toBe(1);
        });

        it('clamps above max', () => {
            expect(normalizeAdvancedLimit(9999, 50, 1, 500)).toBe(500);
            expect(normalizeAdvancedLimit(50000, 100, 10, 10000)).toBe(10000);
        });

        it('passes through values within range', () => {
            expect(normalizeAdvancedLimit(50, 100, 10, 10000)).toBe(50);
            expect(normalizeAdvancedLimit(250, 50, 1, 500)).toBe(250);
        });

        it('rounds fractional values', () => {
            expect(normalizeAdvancedLimit(49.7, 50, 1, 500)).toBe(50);
            expect(normalizeAdvancedLimit(49.2, 50, 1, 500)).toBe(49);
        });

        it('handles boundary values exactly', () => {
            expect(normalizeAdvancedLimit(1, 50, 1, 500)).toBe(1);
            expect(normalizeAdvancedLimit(500, 50, 1, 500)).toBe(500);
        });
    });

    // --------------------------------------------------------
    // 10. Runtime: activate() loads custom functions from config
    // --------------------------------------------------------
    describe('Runtime config loading via activate()', () => {
        let context: vscode.ExtensionContext;
        const mockVscode = require('vscode');

        beforeEach(() => {
            jest.clearAllMocks();
            context = mockVscode.createMockExtensionContext();
            // Set up mock config with custom functions
            mockVscode.__setMockConfig('sqlCrack', {
                'customAggregateFunctions': ['MY_TEST_AGG'],
                'customWindowFunctions': ['MY_TEST_WIN'],
                'additionalFileExtensions': ['.psql', 'hql'],
            });
        });

        afterEach(() => {
            mockVscode.__resetMockConfig();
            // Reset custom functions
            setCustomFunctions([], []);
        });

        it('activate() reads custom functions from config and injects them', () => {
            activate(context);
            // loadCustomFunctions() should have called setCustomFunctions with the config values
            expect(isAggregateFunction('MY_TEST_AGG', 'MySQL')).toBe(true);
        });

        it('activate() reads additionalFileExtensions from config', () => {
            activate(context);
            // After activation, getConfiguration should have been called for 'sqlCrack'
            expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('sqlCrack');
        });

        it('config change handler reloads custom functions when setting changes', () => {
            activate(context);

            // Get the onDidChangeConfiguration handler
            const configChangeCalls = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls;
            expect(configChangeCalls.length).toBeGreaterThan(0);
            const configChangeHandler = configChangeCalls[0][0];

            // Update the mock config
            mockVscode.__setMockConfig('sqlCrack', {
                'customAggregateFunctions': ['RELOADED_AGG'],
                'customWindowFunctions': [],
            });

            // Trigger the handler with an event that affects custom functions
            configChangeHandler({
                affectsConfiguration: (section: string) =>
                    section === 'sqlCrack.customAggregateFunctions' ||
                    section === 'sqlCrack.customWindowFunctions',
            });

            expect(isAggregateFunction('RELOADED_AGG', 'MySQL')).toBe(true);
        });

        it('config change handler ignores unrelated setting changes', () => {
            activate(context);

            const configChangeCalls = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls;
            const configChangeHandler = configChangeCalls[0][0];

            // Reset to verify no reload happens
            setCustomFunctions([], []);

            // Trigger with unrelated setting
            configChangeHandler({
                affectsConfiguration: () => false,
            });

            // Custom functions should NOT have been reloaded (still empty)
            expect(isAggregateFunction('MY_TEST_AGG', 'MySQL')).toBe(false);
        });
    });
});
