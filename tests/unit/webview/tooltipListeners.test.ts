import { registerTooltipListeners } from '../../../src/webview/interaction/tooltipListeners';

describe('registerTooltipListeners', () => {
    it('acts as a safe no-op extension hook', () => {
        const context = {
            state: {} as any,
            getSvg: () => null,
            getMainGroup: () => null,
            getCurrentNodes: () => [],
            cloudOffsets: new Map(),
            getSearchBox: () => null,
            documentListeners: [],
        };
        const callbacks = {
            updateCloudAndArrow: jest.fn(),
            updateNodeEdges: jest.fn(),
            updateTransform: jest.fn(),
            updateZoomIndicator: jest.fn(),
            recordLayoutHistorySnapshot: jest.fn(),
            selectNode: jest.fn(),
            clearFocusMode: jest.fn(),
            fitView: jest.fn(),
            getKeyboardNavigationNodes: jest.fn(() => []),
            moveKeyboardFocusToNode: jest.fn(),
            toggleColumnFlows: jest.fn(),
            hideContextMenu: jest.fn(),
            clearSearch: jest.fn(),
            resetView: jest.fn(),
            undoLayoutChange: jest.fn(),
            redoLayoutChange: jest.fn(),
            toggleCommandBar: jest.fn(),
            isCommandBarVisible: jest.fn(() => false),
            hideCommandBar: jest.fn(),
            navigateSearch: jest.fn(),
            switchLayout: jest.fn(),
            zoomIn: jest.fn(),
            zoomOut: jest.fn(),
            toggleFullscreen: jest.fn(),
            toggleTheme: jest.fn(),
            toggleLayout: jest.fn(),
            toggleSqlPreview: jest.fn(),
            toggleStats: jest.fn(),
            toggleHints: jest.fn(),
            setFocusMode: jest.fn(),
            toggleExpandAll: jest.fn(),
            toggleLegend: jest.fn(),
            triggerMatrixRainOverlay: jest.fn(),
            toggleZeroGravityMode: jest.fn(),
            isZeroGravityModeActive: jest.fn(() => false),
            showKeyboardShortcutsHelp: jest.fn(),
            getKeyboardShortcuts: jest.fn(() => []),
            navigateToConnectedNode: jest.fn(),
            navigateToSiblingNode: jest.fn(),
        };

        expect(() => registerTooltipListeners(context as any, callbacks as any)).not.toThrow();
        expect(context.documentListeners).toEqual([]);
    });
});
