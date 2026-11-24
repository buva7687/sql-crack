// Shared utilities and constants
// Re-export all shared modules for convenient importing

export {
    REFERENCE_TYPE_COLORS,
    REFERENCE_TYPE_COLORS_DARK,
    WORKSPACE_NODE_COLORS,
    WORKSPACE_NODE_COLORS_DARK,
    COLORBLIND_WORKSPACE_NODE_COLORS,
    UI_THEME,
    COMPLEXITY_COLORS,
    COMPLEXITY_TEXT_COLORS,
    getReferenceTypeColor,
    getWorkspaceNodeColor,
} from './theme';
export type { ColorblindMode } from './theme';

export {
    escapeRegex,
    safeString,
    escapeHtml,
    truncateCodePoints,
    stripSqlComments,
    maskSqlCommentsPreservingPositions,
    isHashTempTableIdentifierAt,
    isPostgresJsonPathOperatorAt,
    dialectSupportsHashComments,
    dialectSupportsBackslashEscapes,
    quotedStringAllowsBackslashEscapes,
    getDollarQuoteDelimiterAt,
    getDollarQuotedTokenEnd,
} from './stringUtils';
export type { StripSqlCommentsOptions } from './stringUtils';
export { astifySql, unwrapIdentifierValue } from './astUtils';
export { getQueryScopeOffsets, visitQueryScopes } from './queryScopes';
export { getAstIdentifier, getColumnQualifier, getRelationIdentifiers, getSqlIdentifierKey, getSqlRelationIdentifiers, getStarQualifier, tokenizeSqlIdentifiers } from './sqlIdentifiers';
export type { SqlIdentifier } from './sqlIdentifiers';
export { getSetOperationTree } from './setOperations';
export type { SetOperationTree } from './setOperations';
export { TextOffsetIndex, buildSegmentStarts, countStartsAtOrBefore } from './textOffsets';

export {
    CANVAS,
    GRID_CONFIG,
    NODE_ACCENT_COLORS,
    NODE_SURFACE,
    EDGE_THEME,
    UI_SURFACE,
    ACCENT_STRIP,
    WORKSPACE_ACCENT_COLORS,
    MONO_FONT_STACK,
    getNodeAccentColor,
} from './themeTokens';

export type { GridStyle, AccentPosition, NodeAccentType } from './themeTokens';

export { ICONS, getNodeTypeIcon, getWorkspaceNodeIcon } from './icons';

export { Z_INDEX } from './zIndex';
