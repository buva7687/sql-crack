// Renderer module - Central export point
// This module re-exports utilities that have been extracted from renderer.ts
// The main render function and node rendering still remain in renderer.ts

// State management
export {
    state,
    svg,
    mainGroup,
    detailsPanel,
    statsPanel,
    hintsPanel,
    breadcrumbPanel,
    containerElement,
    currentNodes,
    currentEdges,
    currentColumnFlows,
    currentStats,
    currentHints,
    currentSql,
    currentColumnLineage,
    currentTableUsage,
    cloudOffsets,
    cloudElements,
    cloudViewStates,
    setSvg,
    setMainGroup,
    setDetailsPanel,
    setStatsPanel,
    setHintsPanel,
    setBreadcrumbPanel,
    setContainerElement,
    setCurrentNodes,
    setCurrentEdges,
    setCurrentColumnFlows,
    setCurrentStats,
    setCurrentHints,
    setCurrentSql,
    setCurrentColumnLineage,
    setCurrentTableUsage,
    resetState,
    findNodeById,
    findEdgeById
} from './state';

// Utilities
export {
    escapeHtml,
    truncate,
    createSvgElement,
    setAttributes,
    WARNING_ICONS,
    WARNING_COLORS,
    NODE_TYPE_INFO,
    getWarningIcon,
    getWarningColor,
    lightenColor,
    darkenColor,
    getNodeIcon
} from './utils';

// Navigation
export {
    updateTransform,
    clearFocusMode,
    fitView,
    zoomToNode,
    zoomIn,
    zoomOut,
    resetView,
    selectNode,
    highlightConnectedEdges,
    setSelectionCallbacks,
    setSearchBox,
    performSearch,
    navigateSearch,
    clearSearch,
    getSearchResultCount,
    nextSearchResult,
    prevSearchResult
} from './navigation';

// Panels
export {
    updateBreadcrumb,
    setBreadcrumbCallbacks,
    updateDetailsPanel,
    setDetailsPanelCallbacks,
    updateStatsPanel,
    updateHintsPanel
} from './panels';

// Edges
export {
    renderEdge,
    handleEdgeClick,
    showSqlClausePanel,
    getClauseTypeColor
} from './edges';

// Subflows
export {
    layoutSubflowNodes,
    layoutSubflowNodesVertical
} from './subflows';
