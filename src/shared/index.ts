// Shared utilities and constants
// Re-export all shared modules for convenient importing

export {
    REFERENCE_TYPE_COLORS,
    WORKSPACE_NODE_COLORS,
    WORKSPACE_NODE_COLORS_DARK,
    UI_THEME,
    STATUS_COLORS,
    COMPLEXITY_COLORS,
    getReferenceTypeColor,
    getWorkspaceNodeColor,
} from './theme';

export { escapeRegex } from './stringUtils';

export {
    CANVAS,
    GRID_CONFIG,
    NODE_ACCENT_COLORS,
    NODE_SURFACE,
    EDGE_THEME,
    UI_SURFACE,
    ACCENT_STRIP,
    WORKSPACE_ACCENT_COLORS,
    getNodeAccentColor,
} from './themeTokens';

export type { GridStyle, AccentPosition, NodeAccentType } from './themeTokens';

export { ICONS, getNodeTypeIcon, getWorkspaceNodeIcon } from './icons';
