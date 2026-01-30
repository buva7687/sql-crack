// UI module - Re-exports all UI components

export {
    createToolbar,
    updateToolbarTheme,
    showKeyboardShortcutsHelp,
    markRefreshButtonStale,
    clearRefreshButtonStale,
    updateErrorBadge,
    clearErrorBadge,
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
