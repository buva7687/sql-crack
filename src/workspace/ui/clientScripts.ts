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
    currentGraphMode?: 'files' | 'tables';
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
        const btnClearSearch = document.getElementById('btn-clear-search');
        const searchPrevBtn = document.getElementById('btn-search-prev');
        const searchNextBtn = document.getElementById('btn-search-next');
        const sidebar = document.getElementById('sidebar');
        const zoomLevel = document.getElementById('zoom-level');
        const tooltip = document.getElementById('tooltip');
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
        const searchCount = document.getElementById('graph-search-count');
        const graphContextTitle = document.getElementById('graph-context-title');
        const graphStateChips = document.getElementById('graph-state-chips');
        const graphStateReason = document.getElementById('graph-state-reason');
        const graphContextFocusAction = document.getElementById('graph-context-focus');
        const graphContextTraceUpAction = document.getElementById('graph-context-trace-up');
        const graphContextTraceDownAction = document.getElementById('graph-context-trace-down');
        const graphExplainPanel = document.getElementById('graph-explain-panel');
        const graphKeyboardHints = document.getElementById('graph-keyboard-hints');
        const graphZoomToolbar = document.querySelector('.zoom-toolbar');
        const selectionEmptyText = (selectionEmpty && selectionEmpty.textContent) ? selectionEmpty.textContent : 'Click a node to see details and paths.';

        // ========== Selection & Focus State ==========
        let selectedNodeId = null;
        let focusModeEnabled = false;
        let traceMode = null; // null, 'upstream', 'downstream'
        let activeEmptyState = null;
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
        const sectionFlashDurationMs = 1200;
        const backToTopThreshold = 120;
        const backToTopBtn = document.getElementById('issues-back-to-top');

        function getIssuesScrollElement() {
            return document.scrollingElement || document.documentElement || document.body;
        }

        function getIssuesScrollTop() {
            const content = document.querySelector('.content');
            const scrollElement = getIssuesScrollElement();
            const contentTop = content && typeof content.scrollTop === 'number' ? content.scrollTop : 0;
            return (scrollElement && scrollElement.scrollTop)
                || contentTop
                || window.scrollY
                || document.documentElement.scrollTop
                || document.body.scrollTop
                || 0;
        }

        function scrollIssuesToTop() {
            const content = document.querySelector('.content');
            const scrollElement = getIssuesScrollElement();

            // Immediate jump for reliability across webview scroll-root differences.
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            if (content && typeof content.scrollTop === 'number') {
                content.scrollTop = 0;
            }
            if (scrollElement) {
                scrollElement.scrollTop = 0;
            }

            // Then apply smooth behavior where supported.
            if (scrollElement && typeof scrollElement.scrollTo === 'function') {
                scrollElement.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            // Fallback for environments that ignore smooth scroll on the chosen root.
            window.setTimeout(() => {
                if (scrollElement) {
                    scrollElement.scrollTop = 0;
                }
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;
                if (content && typeof content.scrollTop === 'number') {
                    content.scrollTop = 0;
                }
                window.scrollTo(0, 0);
                updateBackToTopVisibility();
            }, 220);
        }

        function updateBackToTopVisibility() {
            if (!backToTopBtn) return;
            if (getIssuesScrollTop() > backToTopThreshold) {
                backToTopBtn.classList.add('is-visible');
            } else {
                backToTopBtn.classList.remove('is-visible');
            }
        }

        function navigateToIssuesSection(targetId, updateHash = true) {
            if (!targetId) return;
            const section = document.getElementById(targetId);
            if (!section) return;

            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            try {
                section.focus({ preventScroll: true });
            } catch (error) {
                section.focus();
            }

            section.classList.remove('issues-section-flash');
            window.requestAnimationFrame(() => {
                section.classList.add('issues-section-flash');
            });
            window.setTimeout(() => {
                section.classList.remove('issues-section-flash');
            }, sectionFlashDurationMs);

            if (!updateHash) return;
            if (window.history && typeof window.history.replaceState === 'function') {
                window.history.replaceState(null, '', '#' + targetId);
            } else {
                window.location.hash = targetId;
            }
        }

        document.getElementById('btn-back').addEventListener('click', () => {
            vscode.postMessage({ command: 'switchView', view: 'graph' });
        });

        if (backToTopBtn) {
            backToTopBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                scrollIssuesToTop();
                try {
                    if (window.history && typeof window.history.replaceState === 'function') {
                        window.history.replaceState(null, '', window.location.pathname + window.location.search);
                    } else {
                        window.location.hash = '';
                    }
                } catch (error) {
                    window.location.hash = '';
                }
            });
            updateBackToTopVisibility();
            window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });
            document.addEventListener('scroll', updateBackToTopVisibility, { passive: true, capture: true });
        }

        document.querySelectorAll('[data-scroll-target]').forEach(card => {
            card.addEventListener('click', () => {
                const targetId = card.getAttribute('data-scroll-target');
                if (targetId) {
                    navigateToIssuesSection(targetId, true);
                }
            });
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

        const initialTargetId = window.location.hash ? window.location.hash.slice(1) : '';
        if (initialTargetId) {
            window.setTimeout(() => {
                navigateToIssuesSection(initialTargetId, false);
                updateBackToTopVisibility();
            }, 0);
        }
    </script>`;
}

/**
 * Generate minimal script for simple state pages (loading, error, manual index)
 */
export function getMinimalScript(nonce: string): string {
    return `<script nonce="${nonce}">const vscode = acquireVsCodeApi();</script>`;
}
