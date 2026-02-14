/**
 * Characterisation Tests for renderer.ts
 *
 * Since renderer.ts has heavy DOM/d3 dependencies that prevent direct Jest import,
 * these tests read the source file as a string and assert on structure.
 *
 * This ensures exported function names, state structure, and key patterns
 * remain stable during refactoring.
 */

import * as fs from 'fs';
import * as path from 'path';

const rendererPath = path.join(__dirname, '../../src/webview/renderer.ts');
const rendererSource = fs.readFileSync(rendererPath, 'utf-8');
const listenerSources = [
    '../../src/webview/interaction/eventListeners.ts',
    '../../src/webview/interaction/dragListeners.ts',
    '../../src/webview/interaction/zoomPanListeners.ts',
    '../../src/webview/interaction/keyboardListeners.ts',
].map((file) => fs.readFileSync(path.join(__dirname, file), 'utf-8')).join('\n');
const rendererStatePath = path.join(__dirname, '../../src/webview/state/rendererState.ts');
const rendererStateSource = fs.readFileSync(rendererStatePath, 'utf-8');

const typesPath = path.join(__dirname, '../../src/webview/types/renderer.ts');
const typesSource = fs.readFileSync(typesPath, 'utf-8');

describe('renderer.ts Source Structure', () => {
    describe('Exported Functions', () => {
        // List of functions that MUST be exported - these are the public API
        const expectedExports = [
            'initRenderer',
            'render',
            'cleanupRenderer',
            'zoomIn',
            'zoomOut',
            'resetView',
            'getZoomLevel',
            'getViewState',
            'setViewState',
            'undoLayoutChange',
            'redoLayoutChange',
            'canUndoLayoutChanges',
            'canRedoLayoutChanges',
            'clearUndoHistory',
            'exportToPng',
            'exportToSvg',
            'exportToMermaid',
            'copyToClipboard',
            'setSearchBox',
            'nextSearchResult',
            'prevSearchResult',
            'toggleLegend',
            'toggleFocusMode',
            'setFocusMode',
            'getFocusMode',
            'toggleSqlPreview',
            'toggleColumnFlows',
            'toggleHints',
            'toggleFullscreen',
            'toggleLayout',
            'switchLayout',
            'getCurrentLayout',
            'toggleTheme',
            'isDarkTheme',
            'getKeyboardShortcuts',
            'highlightNodeAtLine',
            'copyMermaidToClipboard',
            'setColorblindMode',
            'isVirtualizationEnabled',
            'setVirtualizationEnabled',
            'getFormattedSql',
            'getQueryComplexityInfo',
            'getJoinVennDiagram',
            'getJoinColor',
            'getJoinDescription',
            'toggleNodeCollapse',
            'toggleExpandAll',
            'toggleStats',
            'updateMinimap',
        ];

        expectedExports.forEach(funcName => {
            it(`should export ${funcName}`, () => {
                const hasExport = rendererSource.includes(`export function ${funcName}`) ||
                    rendererSource.includes(`export async function ${funcName}`);
                expect(hasExport).toBeTruthy();
            });
        });
    });

    describe('State Structure', () => {
        it('should have ViewState interface in types/renderer.ts', () => {
            expect(typesSource).toMatch(/interface\s+ViewState/);
        });

        it('should have state object with required properties', () => {
            const requiredStateProps = [
                'scale',
                'offsetX',
                'offsetY',
                'isDarkTheme',
                'searchTerm',
                'selectedNodeId',
                'focusModeEnabled',
                'layoutType',
            ];

            requiredStateProps.forEach(prop => {
                expect(rendererStateSource).toMatch(new RegExp(`${prop}:`));
            });
        });

        it('should have UndoManager usage in renderer state module', () => {
            expect(rendererStateSource).toMatch(/import.*UndoManager.*from/);
            expect(rendererStateSource).toMatch(/new UndoManager<LayoutHistorySnapshot>/);
        });

        it('should have layout history tracking', () => {
            expect(rendererSource).toMatch(/layoutHistory/);
        });
    });

    describe('Node Rendering Functions', () => {
        const nodeRenderFunctions = [
            'renderNode',
            'renderStandardNode',
            'renderJoinNode',
            'renderCteNode',
            'renderSubqueryNode',
            'renderAggregateNode',
            'renderWindowNode',
            'renderCaseNode',
        ];

        nodeRenderFunctions.forEach(funcName => {
            it(`should have ${funcName} function`, () => {
                expect(rendererSource).toMatch(new RegExp(`function ${funcName}\\s*\\(`));
            });
        });
    });

    describe('Panel Functions', () => {
        it('should have updateDetailsPanel function', () => {
            expect(rendererSource).toMatch(/function updateDetailsPanel/);
        });

        it('should have updateStatsPanel function', () => {
            expect(rendererSource).toMatch(/function updateStatsPanel/);
        });

        it('should have updateHintsPanel function', () => {
            expect(rendererSource).toMatch(/function updateHintsPanel/);
        });
    });

    describe('Event Handler Patterns', () => {
        it('should wire extracted setupEventListeners function', () => {
            expect(rendererSource).toMatch(/setupRendererEventListeners/);
            expect(listenerSources).toMatch(/export function setupEventListeners/);
        });

        it('should handle mousedown for dragging', () => {
            expect(listenerSources).toMatch(/addEventListener\(['"]mousedown['"]/);
        });

        it('should handle mousemove for dragging', () => {
            expect(listenerSources).toMatch(/addEventListener\(['"]mousemove['"]/);
        });

        it('should handle mouseup for drag end', () => {
            expect(listenerSources).toMatch(/addEventListener\(['"]mouseup['"]/);
        });

        it('should handle keydown for keyboard navigation', () => {
            expect(listenerSources).toMatch(/addEventListener\(['"]keydown['"]/);
        });
    });

    describe('Fullscreen Handling', () => {
        it('should have FULLSCREEN_HIDE_IDS or equivalent', () => {
            expect(rendererSource).toMatch(/FULLSCREEN_HIDE/);
        });

        it('should have toggleFullscreen function', () => {
            expect(rendererSource).toMatch(/export function toggleFullscreen/);
        });
    });

    describe('Layout Functions', () => {
        it('should import layout functions', () => {
            expect(rendererSource).toMatch(/import.*layoutGraphHorizontal/);
            expect(rendererSource).toMatch(/import.*layoutGraphCompact/);
            expect(rendererSource).toMatch(/import.*layoutGraphForce/);
            expect(rendererSource).toMatch(/import.*layoutGraphRadial/);
            expect(rendererSource).toMatch(/import.*layoutGraph[^H]/);
        });

        it('should have LAYOUT_ORDER constant', () => {
            expect(rendererSource).toMatch(/const LAYOUT_ORDER/);
        });
    });

    describe('Minimap Functions', () => {
        it('should have updateMinimap function', () => {
            expect(rendererSource).toMatch(/function updateMinimap|export function updateMinimap/);
        });

        it('should have updateMinimapViewport function', () => {
            expect(rendererSource).toMatch(/function updateMinimapViewport/);
        });
    });

    describe('Theme Handling', () => {
        it('should have applyTheme function', () => {
            expect(rendererSource).toMatch(/function applyTheme/);
        });

        it('should import theme utilities', () => {
            expect(rendererSource).toMatch(/import.*getComponentUiColors/);
        });
    });

    describe('Column Lineage Functions', () => {
        it('should have toggleColumnFlows function', () => {
            expect(rendererSource).toMatch(/export function toggleColumnFlows/);
        });

        it('should have showColumnLineagePanel function', () => {
            expect(rendererSource).toMatch(/function showColumnLineagePanel/);
        });

        it('should have hideColumnLineagePanel function', () => {
            expect(rendererSource).toMatch(/function hideColumnLineagePanel/);
        });
    });

    describe('Context Menu Functions', () => {
        it('should have showContextMenu function', () => {
            expect(rendererSource).toMatch(/function showContextMenu/);
        });

        it('should have hideContextMenu function', () => {
            expect(rendererSource).toMatch(/function hideContextMenu/);
        });
    });

    describe('Tooltip Functions', () => {
        it('should have showTooltip function', () => {
            expect(rendererSource).toMatch(/function showTooltip/);
        });

        it('should have hideTooltip function', () => {
            expect(rendererSource).toMatch(/function hideTooltip/);
        });
    });

    describe('Cloud/CTE Rendering', () => {
        it('should have updateCloudAndArrow function', () => {
            expect(rendererSource).toMatch(/function updateCloudAndArrow/);
        });

        it('should have renderSubflow function', () => {
            expect(rendererSource).toMatch(/function renderSubflow/);
        });

        it('should have layoutSubflowNodesVertical function', () => {
            expect(rendererSource).toMatch(/function layoutSubflowNodesVertical/);
        });
    });

    describe('Navigation Functions', () => {
        it('should have selectNode function', () => {
            expect(rendererSource).toMatch(/function selectNode/);
        });

        it('should have fitView function', () => {
            expect(rendererSource).toMatch(/function fitView/);
        });

        it('should have centerOnNode function', () => {
            expect(rendererSource).toMatch(/function centerOnNode/);
        });

        it('should have navigateToConnectedNode function', () => {
            expect(rendererSource).toMatch(/function navigateToConnectedNode/);
        });
    });

    describe('Edge Rendering', () => {
        it('should have renderEdge function', () => {
            expect(rendererSource).toMatch(/function renderEdge/);
        });

        it('should have calculateEdgePath function', () => {
            expect(rendererSource).toMatch(/function calculateEdgePath|export function calculateEdgePath/);
        });

        it('should have updateNodeEdges function for drag handling', () => {
            expect(rendererSource).toMatch(/function updateNodeEdges/);
        });
    });

    describe('File Size Check', () => {
        it('should document current line count', () => {
            const lines = rendererSource.split('\n').length;
            // Document current size - this should decrease after refactoring
            console.log(`renderer.ts current line count: ${lines}`);
            expect(lines).toBeGreaterThan(7800); // Phase 4 in-progress baseline
            expect(lines).toBeLessThan(12000);   // Sanity check
        });
    });
});
