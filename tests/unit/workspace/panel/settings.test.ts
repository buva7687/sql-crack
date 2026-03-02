import {
    resolveAutoIndexThresholdFromConfig,
    resolveDefaultLineageDepthFromConfig,
    resolveWorkspaceThemeFromSettings,
} from '../../../../src/workspace/panel/settings';
import * as vscodeMock from '../../../__mocks__/vscode';

describe('workspace/panel/settings.ts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        vscodeMock.__resetMockConfig();
    });

    describe('resolveAutoIndexThresholdFromConfig', () => {
        it('returns default when config is not set', () => {
            const result = resolveAutoIndexThresholdFromConfig();
            expect(result).toBe(50);
        });

        it('returns configured value when valid', () => {
            vscodeMock.__setMockConfig('sqlCrack', { workspaceAutoIndexThreshold: 100 });
            const result = resolveAutoIndexThresholdFromConfig();
            expect(result).toBe(100);
        });

        it('clamps to minimum of 10', () => {
            vscodeMock.__setMockConfig('sqlCrack', { workspaceAutoIndexThreshold: 5 });
            const result = resolveAutoIndexThresholdFromConfig();
            expect(result).toBe(10);
        });

        it('clamps to maximum of 500', () => {
            vscodeMock.__setMockConfig('sqlCrack', { workspaceAutoIndexThreshold: 1000 });
            const result = resolveAutoIndexThresholdFromConfig();
            expect(result).toBe(500);
        });

        it('returns default for non-numeric value', () => {
            vscodeMock.__setMockConfig('sqlCrack', { workspaceAutoIndexThreshold: 'invalid' });
            const result = resolveAutoIndexThresholdFromConfig();
            expect(result).toBe(50);
        });

        it('returns default for NaN', () => {
            vscodeMock.__setMockConfig('sqlCrack', { workspaceAutoIndexThreshold: NaN });
            const result = resolveAutoIndexThresholdFromConfig();
            expect(result).toBe(50);
        });

        it('returns default for Infinity', () => {
            vscodeMock.__setMockConfig('sqlCrack', { workspaceAutoIndexThreshold: Infinity });
            const result = resolveAutoIndexThresholdFromConfig();
            expect(result).toBe(50);
        });

        it('floors decimal values', () => {
            vscodeMock.__setMockConfig('sqlCrack', { workspaceAutoIndexThreshold: 75.9 });
            const result = resolveAutoIndexThresholdFromConfig();
            expect(result).toBe(75);
        });
    });

    describe('resolveDefaultLineageDepthFromConfig', () => {
        it('returns default when config is not set', () => {
            const result = resolveDefaultLineageDepthFromConfig();
            expect(result).toBe(5);
        });

        it('returns configured value when valid', () => {
            vscodeMock.__setMockConfig('sqlCrack', { workspaceLineageDepth: 10 });
            const result = resolveDefaultLineageDepthFromConfig();
            expect(result).toBe(10);
        });

        it('clamps to minimum of 1', () => {
            vscodeMock.__setMockConfig('sqlCrack', { workspaceLineageDepth: 0 });
            const result = resolveDefaultLineageDepthFromConfig();
            expect(result).toBe(1);
        });

        it('clamps to maximum of 20', () => {
            vscodeMock.__setMockConfig('sqlCrack', { workspaceLineageDepth: 50 });
            const result = resolveDefaultLineageDepthFromConfig();
            expect(result).toBe(20);
        });

        it('returns default for non-numeric value', () => {
            vscodeMock.__setMockConfig('sqlCrack', { workspaceLineageDepth: 'deep' });
            const result = resolveDefaultLineageDepthFromConfig();
            expect(result).toBe(5);
        });

        it('floors decimal values', () => {
            vscodeMock.__setMockConfig('sqlCrack', { workspaceLineageDepth: 7.8 });
            const result = resolveDefaultLineageDepthFromConfig();
            expect(result).toBe(7);
        });
    });

    describe('resolveWorkspaceThemeFromSettings', () => {
        it('returns light theme when preference is light', () => {
            vscodeMock.__setMockConfig('sqlCrack', { 'advanced.defaultTheme': 'light' });
            const result = resolveWorkspaceThemeFromSettings();
            expect(result.isDarkTheme).toBe(false);
        });

        it('returns dark theme when preference is dark', () => {
            vscodeMock.__setMockConfig('sqlCrack', { 'advanced.defaultTheme': 'dark' });
            const result = resolveWorkspaceThemeFromSettings();
            expect(result.isDarkTheme).toBe(true);
        });

        it('returns light theme when preference is auto and VS Code is light', () => {
            vscodeMock.__setMockConfig('sqlCrack', { 'advanced.defaultTheme': 'auto' });
            const vscode = require('vscode');
            vscode.window.activeColorTheme = { kind: 1 };
            const result = resolveWorkspaceThemeFromSettings();
            expect(result.isDarkTheme).toBe(false);
        });

        it('returns dark theme when preference is auto and VS Code is dark', () => {
            vscodeMock.__setMockConfig('sqlCrack', { 'advanced.defaultTheme': 'auto' });
            const vscode = require('vscode');
            vscode.window.activeColorTheme = { kind: 2 };
            const result = resolveWorkspaceThemeFromSettings();
            expect(result.isDarkTheme).toBe(true);
        });

        it('detects high contrast theme', () => {
            vscodeMock.__setMockConfig('sqlCrack', { 'advanced.defaultTheme': 'light' });
            const vscode = require('vscode');
            vscode.window.activeColorTheme = { kind: 3 };
            const result = resolveWorkspaceThemeFromSettings();
            expect(result.isHighContrast).toBe(true);
        });

        it('detects high contrast light theme', () => {
            vscodeMock.__setMockConfig('sqlCrack', { 'advanced.defaultTheme': 'light' });
            const vscode = require('vscode');
            vscode.window.activeColorTheme = { kind: 4 };
            const result = resolveWorkspaceThemeFromSettings();
            expect(result.isHighContrast).toBe(true);
        });
    });
});
