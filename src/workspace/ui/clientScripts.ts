// Client Scripts - JavaScript for workspace webviews
// Extracted from workspacePanel.ts for modularity
import { getExportDropdownScript } from './scripts/export';
import { getThemeToggleScript } from './scripts/theme';
import { getViewModeScriptFragment } from './scripts/viewMode';
import { getContextMenuScriptFragment } from './scripts/contextMenu';
import { getImpactSummaryScriptFragment } from './scripts/impactSummary';
import { getDirectionButtonsScriptFragment } from './scripts/directionButtons';
import { getUtilityScriptFragment } from './scripts/utility';
import { getImpactFormScriptFragment } from './scripts/impactForm';
import { getVisualLineageSearchScriptFragment } from './scripts/lineageSearch';
import { getLineageGraphScriptFragment } from './scripts/lineageGraph';
import { getColumnLineageScriptFragment } from './scripts/columnLineage';
import { getGraphInteractionsScriptFragment } from './scripts/graphInteractions';
import { getMessageHandlingScriptFragment } from './scripts/messageHandling';
import { getEventDelegationScriptFragment } from './scripts/eventDelegation';
import { getNodeInteractionsScriptFragment } from './scripts/nodeInteractions';
import { getTooltipScriptFragment } from './scripts/tooltip';
import { getWorkspaceShellScriptFragment } from './scripts/workspaceShell';

/**
 * Parameters for generating webview script
 */
export interface WebviewScriptParams {
    nonce: string;
    graphData: string;
    searchFilterQuery: string;
    initialView?: string;
    currentGraphMode?: 'files' | 'tables' | 'hybrid';
    lineageDefaultDepth?: number;
    lineageLegendVisible?: boolean;
}

/**
 * Generate the complete client script for main webview
 */
export function getWebviewScript(params: WebviewScriptParams): string {
    const {
        nonce,
        graphData,
        searchFilterQuery,
        initialView = 'graph',
        currentGraphMode = 'tables',
        lineageDefaultDepth = 5,
        lineageLegendVisible = true
    } = params;
    const normalizedLineageDepth = Number.isFinite(lineageDefaultDepth)
        ? Math.min(20, Math.max(1, Math.floor(lineageDefaultDepth)))
        : 5;

    return `
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const graphData = ${graphData};
        const initialViewMode = '${initialView}';
        let currentGraphMode = '${currentGraphMode}';
        let lineageDepth = ${normalizedLineageDepth};
        let lineageLegendVisibleFromHost = ${lineageLegendVisible ? 'true' : 'false'};
        function normalizeLineageDepth(value, fallbackDepth = 5) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) {
                return fallbackDepth;
            }
            const normalized = Math.floor(numeric);
            if (normalized < 1) {
                return fallbackDepth;
            }
            return Math.min(20, normalized);
        }
        lineageDepth = normalizeLineageDepth(lineageDepth, 5);
        const prefersReducedMotion = typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const motionDurationMs = prefersReducedMotion ? 0 : 200;
        let graphLayoutFitTimer = null;

        // ========== Pan and Zoom State ==========
        let scale = 1;
        let offsetX = 50;
        let offsetY = 50;
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;

        // ========== DOM Elements ==========
        const svg = document.getElementById('graph-svg');
        const mainGroup = document.getElementById('main-group');
        const searchInput = document.getElementById('search-input');
        const filterType = document.getElementById('filter-type');
        const btnClearSearch = document.getElementById('btn-clear-search');
        const sidebar = document.getElementById('sidebar');
        const zoomLevel = document.getElementById('zoom-level');
        const tooltip = document.getElementById('tooltip');
        const focusBtn = document.getElementById('btn-focus');
        const selectionEmpty = document.getElementById('selection-empty');
        const selectionDetails = document.getElementById('selection-details');
        const selectionTitle = document.getElementById('selection-title');
        const selectionMeta = document.getElementById('selection-meta');
        const selectionFile = document.getElementById('selection-file');
        const selectionUpstream = document.getElementById('selection-upstream');
        const selectionDownstream = document.getElementById('selection-downstream');
        const selectionCrossLinks = document.getElementById('selection-cross-links');
        const graphEmptyOverlay = document.getElementById('graph-empty-overlay');
        const graphEmptyTitle = document.getElementById('graph-empty-title');
        const graphEmptyDesc = document.getElementById('graph-empty-desc');
        const graphEmptyActions = document.getElementById('graph-empty-actions');
        const graphLegendBar = document.getElementById('workspace-legend-bar');
        const graphLegendDismiss = document.getElementById('workspace-legend-dismiss');
        const graphLegendToggleBtn = document.getElementById('btn-legend-toggle');
        const searchCount = document.getElementById('graph-search-count');
        const selectionEmptyText = (selectionEmpty && selectionEmpty.textContent) ? selectionEmpty.textContent : 'Click a node to see details and paths.';

        // ========== Selection & Focus State ==========
        let selectedNodeId = null;
        let focusModeEnabled = false;
        let traceMode = null; // null, 'upstream', 'downstream'
        let activeEmptyState = null;
        const traceUpBtn = document.getElementById('btn-trace-up');
        const traceDownBtn = document.getElementById('btn-trace-down');
        const graphLegendStorageKey = 'sqlCrack.workspace.graphLegendVisible';

        ${getGraphInteractionsScriptFragment()}
        ${getThemeToggleScript()}
        ${getWorkspaceShellScriptFragment()}

        ${getExportDropdownScript()}

        ${getViewModeScriptFragment()}
        ${getContextMenuScriptFragment()}
        ${getMessageHandlingScriptFragment()}
        ${getEventDelegationScriptFragment()}
        ${getNodeInteractionsScriptFragment()}
        ${getTooltipScriptFragment()}
        ${getImpactSummaryScriptFragment()}
        ${getImpactFormScriptFragment()}
        ${getVisualLineageSearchScriptFragment()}
        ${getLineageGraphScriptFragment()}
        ${getColumnLineageScriptFragment()}
        ${getDirectionButtonsScriptFragment()}
        ${getUtilityScriptFragment()}
    </script>`;
}

/**
 * Generate script for issues view
 */
export function getIssuesScript(nonce: string): string {
    return `<script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        document.getElementById('btn-back').addEventListener('click', () => {
            vscode.postMessage({ command: 'switchView', view: 'graph' });
        });

        document.querySelectorAll('.list-item, .missing-ref-item').forEach(item => {
            item.addEventListener('click', () => {
                const filePath = item.getAttribute('data-filepath');
                const line = item.getAttribute('data-line');
                if (filePath) {
                    vscode.postMessage({
                        command: 'openFileAtLine',
                        filePath: filePath,
                        line: parseInt(line) || 0
                    });
                }
            });
        });
    </script>`;
}

/**
 * Generate minimal script for simple state pages (loading, error, manual index)
 */
export function getMinimalScript(nonce: string): string {
    return `<script nonce="${nonce}">const vscode = acquireVsCodeApi();</script>`;
}
