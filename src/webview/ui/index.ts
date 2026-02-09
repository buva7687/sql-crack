// UI module - Re-exports all UI components

export {
    createToolbar,
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
    PinnedTab,
    PinnedTabsCallbacks
} from './pinnedTabs';

export { createLegendBar, toggleLegendBar, isLegendBarVisible, getLegendBarHeight } from './legendBar';
export type { LegendBarCallbacks } from './legendBar';

export { createExportDropdown } from './exportDropdown';
export type { ExportDropdownCallbacks } from './exportDropdown';

export {
    createCommandBar,
    showCommandBar,
    hideCommandBar,
    toggleCommandBar,
    isCommandBarVisible,
    registerCommandBarActions,
} from './commandBar';
export type { CommandBarAction } from './commandBar';

export { createLayoutPicker } from './layoutPicker';
export type { LayoutPickerCallbacks } from './layoutPicker';

export {
    createBreadcrumbBar,
    updateBreadcrumbBar,
    addBreadcrumbSegment,
    removeBreadcrumbSegment,
    clearBreadcrumbBar,
    isBreadcrumbBarVisible,
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
