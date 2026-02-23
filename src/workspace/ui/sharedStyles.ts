// Shared Styles - Centralized CSS for all workspace webviews
// Individual style functions have been extracted to ./styles/ modules.
// This file re-exports them for backward compatibility and provides assembler functions.

// Import all style functions from extracted modules
import {
    getCssVariables,
    getBaseStyles,
    getContextMenuStyles,
    getLineagePanelStyles,
    getSharedViewStyles,
    getTableListStyles,
    getImpactFormStyles,
    getLineageVisualStyles,
    getLineageGraphStyles,
    getLineageNodeStyles,
    getGraphStyles,
    getIssuesPanelStyles,
    getStateStyles
} from './styles';

// Re-export all functions for backward compatibility
export {
    getCssVariables,
    getBaseStyles,
    getContextMenuStyles,
    getLineagePanelStyles,
    getSharedViewStyles,
    getTableListStyles,
    getImpactFormStyles,
    getLineageVisualStyles,
    getLineageGraphStyles,
    getLineageNodeStyles,
    getGraphStyles,
    getIssuesPanelStyles,
    getStateStyles
};

/**
 * Combined styles for main webview
 * @param dark - Whether to use dark theme (default: true)
 */
export function getWebviewStyles(dark: boolean = true, isHighContrast: boolean = false): string {
    return [
        getCssVariables(dark, isHighContrast),
        getBaseStyles(),
        getContextMenuStyles(),
        getLineagePanelStyles(),
        getSharedViewStyles(),
        getTableListStyles(),
        getImpactFormStyles(),
        getLineageVisualStyles(),
        getLineageGraphStyles(),
        getLineageNodeStyles(),
        getGraphStyles()
    ].join('\n');
}

/**
 * Combined styles for issues webview (with CSS variables)
 * @param dark - Whether to use dark theme (default: true)
 */
export function getIssuesStyles(dark: boolean = true, isHighContrast: boolean = false): string {
    return [
        getCssVariables(dark, isHighContrast),
        getIssuesPanelStyles()
    ].join('\n');
}
