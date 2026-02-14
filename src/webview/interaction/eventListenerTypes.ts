import type { FocusMode, FlowNode, LayoutType, ViewState } from '../types';

export type KeyboardShortcut = {
    key: string;
    description: string;
};

export interface EventListenerContext {
    state: ViewState;
    getSvg: () => SVGSVGElement | null;
    getMainGroup: () => SVGGElement | null;
    getCurrentNodes: () => FlowNode[];
    cloudOffsets: Map<string, { offsetX: number; offsetY: number }>;
    getSearchBox: () => HTMLInputElement | null;
    documentListeners: Array<{ type: string; handler: EventListener }>;
}

export interface EventListenerCallbacks {
    updateCloudAndArrow: (node: FlowNode) => void;
    updateNodeEdges: (node: FlowNode) => void;
    updateTransform: () => void;
    updateZoomIndicator: () => void;
    recordLayoutHistorySnapshot: () => void;
    selectNode: (nodeId: string | null) => void;
    clearFocusMode: () => void;
    fitView: () => void;
    getKeyboardNavigationNodes: () => FlowNode[];
    moveKeyboardFocusToNode: (node: FlowNode) => void;
    toggleColumnFlows: (enabled?: boolean) => void;
    hideContextMenu: () => void;
    clearSearch: () => void;
    resetView: () => void;
    undoLayoutChange: () => void;
    redoLayoutChange: () => void;
    toggleCommandBar: () => void;
    isCommandBarVisible: () => boolean;
    hideCommandBar: () => void;
    navigateSearch: (direction: 1 | -1) => void;
    switchLayout: (layoutType: LayoutType) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    toggleFullscreen: (enable?: boolean) => void;
    toggleTheme: () => void;
    toggleLayout: () => void;
    toggleSqlPreview: () => void;
    toggleStats: () => void;
    toggleHints: () => void;
    setFocusMode: (mode: FocusMode) => void;
    toggleExpandAll: () => void;
    toggleLegend: () => void;
    showKeyboardShortcutsHelp: (shortcuts: KeyboardShortcut[], isDarkTheme: boolean) => void;
    getKeyboardShortcuts: () => KeyboardShortcut[];
    navigateToConnectedNode: (direction: 'upstream' | 'downstream', nodeId: string) => void;
    navigateToSiblingNode: (selectedNode: FlowNode, direction: 'next' | 'prev') => void;
}
