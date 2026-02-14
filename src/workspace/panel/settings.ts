import * as vscode from 'vscode';

const DEFAULT_AUTO_INDEX_THRESHOLD = 50;
const DEFAULT_LINEAGE_DEPTH = 5;

export interface WorkspaceThemeSettings {
    isDarkTheme: boolean;
    isHighContrast: boolean;
}

export function resolveAutoIndexThresholdFromConfig(): number {
    const configured = vscode.workspace
        .getConfiguration('sqlCrack')
        .get<number>('workspaceAutoIndexThreshold', DEFAULT_AUTO_INDEX_THRESHOLD);
    const numeric = Number(configured);
    if (!Number.isFinite(numeric)) {
        return DEFAULT_AUTO_INDEX_THRESHOLD;
    }
    return Math.min(500, Math.max(10, Math.floor(numeric)));
}

export function resolveDefaultLineageDepthFromConfig(): number {
    const configured = vscode.workspace
        .getConfiguration('sqlCrack')
        .get<number>('workspaceLineageDepth', DEFAULT_LINEAGE_DEPTH);
    const numeric = Number(configured);
    if (!Number.isFinite(numeric)) {
        return DEFAULT_LINEAGE_DEPTH;
    }
    return Math.min(20, Math.max(1, Math.floor(numeric)));
}

export function resolveWorkspaceThemeFromSettings(): WorkspaceThemeSettings {
    const config = vscode.workspace.getConfiguration('sqlCrack');
    const themePreference = config.get<string>('advanced.defaultTheme', 'light');
    const themeKind = vscode.window.activeColorTheme.kind;
    const isHighContrast = themeKind === vscode.ColorThemeKind.HighContrast
        || themeKind === vscode.ColorThemeKind.HighContrastLight;

    if (themePreference === 'light') {
        return { isDarkTheme: false, isHighContrast };
    }
    if (themePreference === 'dark') {
        return { isDarkTheme: true, isHighContrast };
    }

    // 'auto' - match VS Code theme
    const isDarkTheme = themeKind !== vscode.ColorThemeKind.Light
        && themeKind !== vscode.ColorThemeKind.HighContrastLight;
    return { isDarkTheme, isHighContrast };
}
