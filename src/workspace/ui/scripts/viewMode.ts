/**
 * Script fragment: workspace view mode orchestration and navigation.
 */
export function getViewModeScriptFragment(): string {
    return `
        // ========== View Mode Tabs ==========
        let currentViewMode = 'graph';
        let lineageDetailView = false;

        // Navigation state stack for cross-view navigation
        const navStack = [];
        // Per-view zoom/pan state preservation
        const viewStates = {};
        let navigationOriginLabel = '';
        let navigationOriginType = '';

        function saveCurrentViewState() {
            if (currentViewMode === 'graph') {
                viewStates['graph'] = {
                    scale,
                    offsetX,
                    offsetY,
                    selectedNodeId
                };
            } else {
                // Save scroll position for non-graph views (lineage, impact)
                const scrollContainer = lineageContent || document.querySelector('.lineage-content');
                if (scrollContainer) {
                    viewStates[currentViewMode] = {
                        scrollTop: scrollContainer.scrollTop,
                        scrollLeft: scrollContainer.scrollLeft
                    };
                }
            }
        }

        function restoreViewState(view) {
            if (view === 'graph' && viewStates['graph']) {
                const graphState = viewStates['graph'];
                scale = typeof graphState.scale === 'number' ? graphState.scale : scale;
                offsetX = typeof graphState.offsetX === 'number' ? graphState.offsetX : offsetX;
                offsetY = typeof graphState.offsetY === 'number' ? graphState.offsetY : offsetY;
                updateTransform();
                if (graphState.selectedNodeId) {
                    const escapedNodeId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
                        ? CSS.escape(graphState.selectedNodeId)
                        : graphState.selectedNodeId.replace(/"/g, '\\"');
                    const selectedNode = document.querySelector('.node[data-id="' + escapedNodeId + '"]');
                    if (selectedNode) {
                        updateSelectionPanel(selectedNode);
                    }
                }
            } else if (viewStates[view]) {
                // Restore scroll position for non-graph views
                const scrollContainer = lineageContent || document.querySelector('.lineage-content');
                if (scrollContainer) {
                    requestAnimationFrame(() => {
                        scrollContainer.scrollTop = viewStates[view].scrollTop || 0;
                        scrollContainer.scrollLeft = viewStates[view].scrollLeft || 0;
                    });
                }
            }
        }
        const viewTabs = document.querySelectorAll('.view-tab');
        const lineagePanel = document.getElementById('lineage-panel');
        const lineageContent = document.getElementById('lineage-content');
        const lineageTitle = document.getElementById('lineage-title');
        const lineageBackBtn = document.getElementById('lineage-back-btn');
        const workspaceBreadcrumb = document.getElementById('workspace-breadcrumb');
        const graphArea = document.querySelector('.graph-area');
        const graphModeSwitcher = document.getElementById('graph-mode-switcher');

        const viewTitles = {
            lineage: 'Data Lineage',
            impact: 'Impact Analysis'
        };

        // Inline skeleton templates keep first-paint placeholders close to the tab switch logic.
        // If these variants grow much further, move them into dedicated render helpers.
        const viewEmptyStates = {
            lineage: '<div class="view-skeleton view-skeleton-lineage">' +
                '<div class="view-skeleton-header"></div>' +
                '<div class="view-skeleton-search"></div>' +
                '<div class="view-skeleton-grid">' +
                    '<div class="view-skeleton-card"></div>' +
                    '<div class="view-skeleton-card"></div>' +
                    '<div class="view-skeleton-card"></div>' +
                    '<div class="view-skeleton-card"></div>' +
                    '<div class="view-skeleton-card"></div>' +
                    '<div class="view-skeleton-card"></div>' +
                '</div>' +
            '</div>',
            impact: '<div class="view-skeleton view-skeleton-impact">' +
                '<div class="view-skeleton-header"></div>' +
                '<div class="view-skeleton-form">' +
                    '<div class="view-skeleton-field"></div>' +
                    '<div class="view-skeleton-field"></div>' +
                    '<div class="view-skeleton-actions">' +
                        '<div class="view-skeleton-button"></div>' +
                        '<div class="view-skeleton-button secondary"></div>' +
                    '</div>' +
                '</div>' +
            '</div>'
        };

        function updateSidebarSectionsForView() {
            const show = currentViewMode === 'graph';
            document.querySelectorAll('[data-sidebar-section]').forEach(el => {
                el.style.display = show ? '' : 'none';
            });
        }

        function escapeBreadcrumbText(value) {
            return (value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        function escapeBreadcrumbAttr(value) {
            return escapeBreadcrumbText(value).replace(/"/g, '&quot;');
        }

        function updateWorkspaceBreadcrumb() {
            if (!workspaceBreadcrumb) return;
            if (currentViewMode === 'graph') {
                workspaceBreadcrumb.style.display = 'none';
                workspaceBreadcrumb.innerHTML = '';
                return;
            }

            const viewLabels = {
                lineage: 'Lineage',
                impact: 'Impact'
            };
            const segments = [{
                label: 'Graph',
                action: 'view',
                value: 'graph',
                clickable: true,
            }];

            if (navigationOriginLabel) {
                const originTypeLabel = navigationOriginType ? ' (' + navigationOriginType + ')' : '';
                segments.push({
                    label: navigationOriginLabel + originTypeLabel,
                    action: 'origin',
                    value: navigationOriginLabel,
                    clickable: true,
                });
            }

            segments.push({
                label: viewLabels[currentViewMode] || 'View',
                action: 'view',
                value: currentViewMode,
                clickable: currentViewMode !== 'graph',
            });

            if (lineageDetailView && lineageTitle && lineageTitle.textContent) {
                const titleText = lineageTitle.textContent.trim();
                if (titleText && titleText !== 'Data Lineage' && titleText !== 'Impact Analysis') {
                    segments.push({
                        label: titleText,
                        action: 'detail-root',
                        value: currentViewMode,
                        clickable: true,
                    });
                }
            }

            const activeColumnLabel = (window && window.__workspaceSelectedColumnLabel) ? window.__workspaceSelectedColumnLabel : '';
            if (activeColumnLabel) {
                segments.push({
                    label: 'Column: ' + activeColumnLabel,
                    action: 'clear-column-trace',
                    value: activeColumnLabel,
                    clickable: true,
                });
            }

            workspaceBreadcrumb.innerHTML = segments.map((segment, index) => {
                const className = segment.clickable ? 'workspace-breadcrumb-segment is-clickable' : 'workspace-breadcrumb-segment';
                const actionAttr = segment.clickable
                    ? ' data-breadcrumb-action="' + escapeBreadcrumbAttr(segment.action) + '" data-breadcrumb-value="' + escapeBreadcrumbAttr(segment.value) + '"'
                    : '';
                const separator = index < segments.length - 1 ? '<span class="workspace-breadcrumb-separator">›</span>' : '';
                return '<button type="button" class="' + className + '"' + actionAttr + '>' + escapeBreadcrumbText(segment.label) + '</button>' + separator;
            }).join('');
            workspaceBreadcrumb.style.display = 'block';
        }

        function switchToView(view, skipMessage = false, originLabel = '', originType = '') {
            if (view === currentViewMode) return;

            // Clear column trace when leaving a lineage-related view to prevent stale state
            if (typeof clearColumnHighlighting === 'function') {
                clearColumnHighlighting();
            }

            // Reset lineage detail mode on explicit tab transitions so the back button
            // always reflects the current tab's true navigation target.
            lineageDetailView = false;

            // Save state of current view before switching
            saveCurrentViewState();

            if (originLabel) {
                navigationOriginLabel = originLabel;
                navigationOriginType = originType;
            } else {
                // Clear stale origin context on any manual tab switch without explicit origin.
                navigationOriginLabel = '';
                navigationOriginType = '';
            }

            // Push current view to nav stack for back navigation (avoid duplicates, cap size)
            if (!skipMessage) {
                if (navStack[navStack.length - 1] !== currentViewMode) {
                    navStack.push(currentViewMode);
                }
                // Cap stack depth to prevent unbounded growth from rapid toggling
                if (navStack.length > 20) {
                    navStack.splice(0, navStack.length - 20);
                }
            }

            viewTabs.forEach(t => {
                if (t.getAttribute('data-view') === view) {
                    t.classList.add('active');
                } else {
                    t.classList.remove('active');
                }
            });

            // Crossfade transition
            const container = lineagePanel || graphArea;
            if (container) {
                if (prefersReducedMotion) {
                    container.style.transition = 'none';
                } else {
                    container.style.transition = 'opacity 0.2s ease';
                    container.style.opacity = '0';
                    setTimeout(() => {
                        container.style.opacity = '1';
                    }, 50);
                }
            }

            currentViewMode = view;
            if (view === 'graph') {
                navigationOriginLabel = '';
                navigationOriginType = '';
            }

            // Show/hide header search box (only relevant for Graph tab)
            const headerSearchBox = document.querySelector('.header-right .search-box');
            if (headerSearchBox) {
                headerSearchBox.style.display = view === 'graph' ? '' : 'none';
            }

            if (view === 'graph') {
                // Sync server-side view state so theme toggle / re-render preserves correct tab
                vscode.postMessage({ command: 'switchView', view: 'graph' });
                lineagePanel?.classList.remove('visible');
                if (graphArea) graphArea.style.display = '';
                if (focusBtn) focusBtn.style.display = '';
                if (graphModeSwitcher) {
                    // Use visibility (not display) so switcher always reserves space in layout.
                    // This prevents main tabs (Graph|Lineage|Impact) from shifting position
                    // when switching between tabs, ensuring good UX (mouse stays over clicked tab).
                    graphModeSwitcher.style.visibility = 'visible';
                    graphModeSwitcher.style.pointerEvents = 'auto';
                }
                // Restore graph zoom/pan state when switching back to Graph tab
                if (viewStates['graph']) {
                    requestAnimationFrame(() => {
                        restoreViewState('graph');
                    });
                } else if (svg && mainGroup && graphData && graphData.nodes && graphData.nodes.length > 0) {
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            fitToScreen();
                        }, prefersReducedMotion ? 0 : 100);
                    });
                }
            } else {
                if (graphArea) graphArea.style.display = 'none';
                if (focusBtn) focusBtn.style.display = 'none';
                if (graphModeSwitcher) {
                    // Hide switcher but keep it in layout (visibility: hidden) so main tabs don't shift.
                    // pointer-events: none prevents clicks when hidden.
                    graphModeSwitcher.style.visibility = 'hidden';
                    graphModeSwitcher.style.pointerEvents = 'none';
                }
                lineagePanel?.classList.add('visible');

                if (lineageTitle) {
                    lineageTitle.textContent = viewTitles[view] || 'Data Lineage';
                }

                if (lineageContent) {
                    lineageContent.innerHTML = viewEmptyStates[view] || '';
                }

                // Restore scroll position for non-graph views
                restoreViewState(view);

                // Only send message if not restoring view (skipMessage = false by default)
                if (!skipMessage) {
                    if (view === 'lineage') {
                        vscode.postMessage({ command: 'switchToLineageView' });
                    } else if (view === 'impact') {
                        vscode.postMessage({ command: 'switchToImpactView' });
                    }
                }
            }
            updateSidebarSectionsForView();
            updateBackButtonText();
            updateWorkspaceBreadcrumb();
        }

        viewTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                const view = tab.getAttribute('data-view');
                switchToView(view);
            });
        });

        workspaceBreadcrumb?.addEventListener('click', (e) => {
            const target = e.target.closest('[data-breadcrumb-action]');
            if (!target) return;

            e.stopPropagation();
            const action = target.getAttribute('data-breadcrumb-action');
            const value = target.getAttribute('data-breadcrumb-value');

            if (action === 'view' && value) {
                switchToView(value, true);
                return;
            }

            if (action === 'origin') {
                switchToView('graph', true);
                return;
            }

            if (action === 'detail-root') {
                lineageDetailView = false;
                // Clear column trace when resetting to detail root
                if (typeof clearColumnHighlighting === 'function') {
                    clearColumnHighlighting();
                }
                updateBackButtonText();
                if (currentViewMode === 'lineage') {
                    if (lineageTitle) lineageTitle.textContent = 'Data Lineage';
                    vscode.postMessage({ command: 'switchToLineageView' });
                } else if (currentViewMode === 'impact') {
                    if (lineageTitle) lineageTitle.textContent = 'Impact Analysis';
                    vscode.postMessage({ command: 'switchToImpactView' });
                }
                updateWorkspaceBreadcrumb();
                return;
            }

            if (action === 'clear-column-trace' && typeof window.clearWorkspaceColumnTrace === 'function') {
                window.clearWorkspaceColumnTrace();
                updateWorkspaceBreadcrumb();
            }
        });

        /**
         * Graph mode switcher (Files / Tables / Hybrid)
         * Uses event delegation on the switcher container to handle button clicks.
         * This prevents duplicate listeners and ensures buttons work after tab switches.
         * 
         * Fix: If user clicks mode button while on non-Graph tab, switch to Graph first,
         * then change mode. This prevents navigation to wrong tab after mode switch.
         */
        const graphModeSwitcherContainer = document.getElementById('graph-mode-switcher');
        if (graphModeSwitcherContainer) {
            // Use event delegation - attach listener once to the container
            graphModeSwitcherContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.graph-mode-btn');
                if (!btn) return;
                
                e.stopPropagation();
                e.preventDefault();
                
                // Ensure we're on Graph tab - if not, switch to it first
                if (currentViewMode !== 'graph') {
                    switchToView('graph', false);
                    // After switching to Graph, trigger the mode change
                    setTimeout(() => {
                        const mode = btn.getAttribute('data-mode');
                        if (mode && mode !== currentGraphMode) {
                            currentGraphMode = mode;
                            vscode.postMessage({ command: 'switchGraphMode', mode });
                        }
                    }, 100);
                    return;
                }
                
                const mode = btn.getAttribute('data-mode');
                // Don't do anything if clicking the already-active mode (prevents bug where it navigated to Lineage)
                if (mode && mode !== currentGraphMode) {
                    currentGraphMode = mode;
                    vscode.postMessage({ command: 'switchGraphMode', mode });
                }
            });
        }

        updateSidebarSectionsForView();

        // Graph mode help tooltip
        const helpBtn = document.getElementById('graph-mode-help-btn');
        const helpTooltip = document.getElementById('graph-mode-help-tooltip');
        if (helpBtn && helpTooltip) {
            helpBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = helpTooltip.classList.contains('visible');
                if (!isVisible) {
                    const rect = helpBtn.getBoundingClientRect();
                    helpTooltip.style.top = (rect.bottom + 8) + 'px';
                    helpTooltip.style.right = (window.innerWidth - rect.right) + 'px';
                }
                helpTooltip.classList.toggle('visible');
            });
            document.addEventListener('click', (e) => {
                if (!helpBtn.contains(e.target) && !helpTooltip.contains(e.target)) {
                    helpTooltip.classList.remove('visible');
                }
            });
        }

        // Set initial graph-mode-switcher visibility (always in layout; visibility reserves space).
        // This ensures main tabs are in the same position on initial load regardless of active tab.
        if (graphModeSwitcher) {
            if (currentViewMode === 'graph') {
                graphModeSwitcher.style.visibility = 'visible';
                graphModeSwitcher.style.pointerEvents = 'auto';
            } else {
                graphModeSwitcher.style.visibility = 'hidden';
                graphModeSwitcher.style.pointerEvents = 'none';
            }
        }
        if (focusBtn) {
            focusBtn.style.display = currentViewMode === 'graph' ? '' : 'none';
        }

        // Restore initial view if not graph (e.g., after theme change)
        if (typeof initialViewMode !== 'undefined' && initialViewMode !== 'graph') {
            // Use setTimeout to ensure DOM is ready and to avoid blocking
            setTimeout(() => {
                switchToView(initialViewMode, true);
                // Re-request the view content from server
                if (initialViewMode === 'lineage') {
                    vscode.postMessage({ command: 'switchToLineageView' });
                } else if (initialViewMode === 'impact') {
                    vscode.postMessage({ command: 'switchToImpactView' });
                }
            }, 0);
        }

        function updateBackButtonText() {
            if (!lineageBackBtn) return;
            if (lineageDetailView && currentViewMode === 'lineage') {
                lineageBackBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Back to Lineage';
            } else {
                const fromLabel = navigationOriginLabel ? ' (from: ' + navigationOriginLabel + ')' : '';
                lineageBackBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Back to Graph' + fromLabel;
            }
        }

        lineageBackBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (lineageDetailView && currentViewMode === 'lineage') {
                lineageDetailView = false;
                updateBackButtonText();
                if (lineageTitle) lineageTitle.textContent = 'Data Lineage';
                vscode.postMessage({ command: 'switchToLineageView' });
            } else {
                // Non-detail back always returns to Graph to match button label and user expectation.
                navStack.length = 0;
                switchToView('graph', true); // skipMessage=true since this is local navigation
            }
            updateWorkspaceBreadcrumb();
        });
        updateWorkspaceBreadcrumb();
    `;
}
