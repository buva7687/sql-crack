// UI module - Re-exports all UI components

export {
    createToolbar,
    disposeToolbar,
    updateToolbarTheme,
    updateAutoDetectIndicator,
    updateHintsSummaryBadge,
    showKeyboardShortcutsHelp,
    markRefreshButtonStale,
    clearRefreshButtonStale,
    updateErrorBadge,
    clearErrorBadge,
    setErrorBadgeClickHandler,
    ToolbarCallbacks,
    ToolbarCleanup
} from './toolbar';

export {
    createBatchTabs,
    updateBatchTabs,
    disposeBatchTabs,
    getBatchNavigationScope,
    getScopedAdjacentQueryIndex,
    BatchNavigationScope,
    BatchTabsCallbacks
} from './batchTabs';

export {
    pinCurrentVisualization,
    unpinTab,
    switchToTab,
    findPinnedTab,
    updateTabsUI,
    getPinnedTabs,
    getActiveTabId,
    setActiveTabId,
    disposePinnedTabs,
    PinnedTab,
    PinnedTabsCallbacks
} from './pinnedTabs';

export { createLegendBar, toggleLegendBar, isLegendBarVisible, getLegendBarHeight, disposeLegendBar } from './legendBar';
export type { LegendBarCallbacks } from './legendBar';

export { createExportDropdown, disposeExportDropdown } from './exportDropdown';
export type { ExportDropdownCallbacks } from './exportDropdown';

export {
    createCommandBar,
    showCommandBar,
    hideCommandBar,
    toggleCommandBar,
    isCommandBarVisible,
    registerCommandBarActions,
    disposeCommandBar,
} from './commandBar';
export type { CommandBarAction } from './commandBar';

export { createLayoutPicker, disposeLayoutPicker } from './layoutPicker';
export type { LayoutPickerCallbacks } from './layoutPicker';

export {
    createBreadcrumbBar,
    updateBreadcrumbBar,
    addBreadcrumbSegment,
    removeBreadcrumbSegment,
    clearBreadcrumbBar,
    isBreadcrumbBarVisible,
    disposeBreadcrumbBar,
} from './breadcrumbBar';
export type { BreadcrumbSegment, BreadcrumbBarCallbacks } from './breadcrumbBar';

export { showFirstRunOverlay } from './firstRunOverlay';
export type { FirstRunOverlayCallbacks } from './firstRunOverlay';

export {
    showCompareView,
    hideCompareView,
    isCompareViewActive,
    computeCompareDiff,
} from './compareView';
export type {
    ComparePaneInput,
    CompareViewOptions,
    CompareDiffResult,
} from './compareView';

export { showTooltip, updateTooltipPosition, hideTooltip } from './tooltip';
export type { ShowTooltipOptions } from './tooltip';

export { showContextMenu, hideContextMenu, showCopyFeedback } from './contextMenu';
export type { ShowContextMenuOptions, ContextMenuColors, ContextMenuIcons } from './contextMenu';
