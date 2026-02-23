import type { FocusMode, LayoutType, ViewState } from '../types';
import { UndoManager } from '../ui/undoManager';

export interface LayoutHistorySnapshot {
    scale: number;
    offsetX: number;
    offsetY: number;
    selectedNodeId: string | null;
    focusModeEnabled: boolean;
    focusMode: FocusMode;
    layoutType: LayoutType;
    nodePositions: Array<{ id: string; x: number; y: number }>;
    cloudOffsets: Array<{ nodeId: string; offsetX: number; offsetY: number }>;
}

export function resolveInitialLayout(defaultLayout: unknown): LayoutType {
    const valid: LayoutType[] = ['vertical', 'horizontal', 'compact', 'force', 'radial'];
    if (typeof defaultLayout === 'string' && valid.includes(defaultLayout as LayoutType)) {
        return defaultLayout as LayoutType;
    }
    return 'vertical';
}

export function createInitialViewState(vscodeTheme: string | undefined, defaultLayout: unknown): ViewState {
    return {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        selectedNodeId: null,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        isDraggingNode: false,
        isDraggingCloud: false,
        draggingNodeId: null,
        draggingCloudNodeId: null,
        dragNodeStartX: 0,
        dragNodeStartY: 0,
        dragCloudStartOffsetX: 0,
        dragCloudStartOffsetY: 0,
        dragMouseStartX: 0,
        dragMouseStartY: 0,
        searchTerm: '',
        searchResults: [],
        currentSearchIndex: -1,
        focusModeEnabled: false,
        legendVisible: true,
        highlightedColumnSources: [],
        isFullscreen: false,
        isDarkTheme: vscodeTheme !== 'light',
        isHighContrast: false,
        breadcrumbPath: [],
        showColumnLineage: false,
        showColumnFlows: false,
        selectedColumn: null,
        zoomedNodeId: null,
        previousZoomState: null,
        focusMode: 'all' as FocusMode,
        layoutType: resolveInitialLayout(defaultLayout),
    };
}

export function createLayoutHistory(): UndoManager<LayoutHistorySnapshot> {
    return new UndoManager<LayoutHistorySnapshot>({
        maxEntries: 50,
        serialize: (snapshot) => JSON.stringify(snapshot),
    });
}
