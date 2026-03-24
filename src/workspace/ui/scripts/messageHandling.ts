import { getExportMessageCasesScript, getExportToPngScript } from './export';
import { getThemeChangedMessageCaseScript } from './theme';

export function getMessageHandlingScriptFragment(): string {
    return `
        // ========== Message Handling from Extension ==========
        function sanitizeExtensionHtml(html) {
            const template = document.createElement('template');
            template.innerHTML = typeof html === 'string' ? html : '';

            // Remove high-risk elements entirely.
            template.content.querySelectorAll('script, iframe, object, embed, link, meta, base, form').forEach((el) => {
                el.remove();
            });

            // Strip event handlers and javascript: URLs from remaining elements.
            template.content.querySelectorAll('*').forEach((el) => {
                Array.from(el.attributes).forEach((attr) => {
                    const name = attr.name.toLowerCase();
                    const value = attr.value || '';

                    if (name.startsWith('on')) {
                        el.removeAttribute(attr.name);
                        return;
                    }

                    if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\\s*javascript:/i.test(value)) {
                        el.removeAttribute(attr.name);
                        return;
                    }

                    if (name === 'style' && /(expression\\s*\\(|javascript:)/i.test(value)) {
                        el.removeAttribute(attr.name);
                    }
                });
            });

            return template.innerHTML;
        }

        function setSafeHtml(target, html) {
            if (!target) {
                return;
            }
            target.innerHTML = sanitizeExtensionHtml(html);
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'showInGraphResult':
                    if (typeof switchToView === 'function') {
                        switchToView('graph', true);
                    }
                    if (searchInput) {
                        searchInput.value = message.data?.query || '';
                    }
                    btnClearSearch?.classList.toggle('visible', Boolean(searchInput && searchInput.value.trim()));
                    updateGraphEmptyState();
                    refreshSearchNavigation(searchInput ? searchInput.value.trim() : '');
                    applySearchHighlight();
                    if (searchMatchNodeIds.length > 0 && searchMatchNodeIds.length <= 3) {
                        jumpToSearchMatch(0, { autoZoom: true, track: false });
                    }
                    syncGraphContextUi();
                    break;
                case 'lineageResult':
                case 'upstreamResult':
                case 'downstreamResult':
                    if (!isLatestWorkspaceResponse(message)) break;
                    if (lineageContent && message.data) {
                        const nodes = message.data.nodes || message.data.result?.nodes || [];
                        let html = '<h2>' + (message.command === 'upstreamResult' ? 'Upstream' : message.command === 'downstreamResult' ? 'Downstream' : 'Lineage') + ' Analysis</h2>';
                        html += '<p style="color: var(--text-muted); margin-bottom: 16px;">Found ' + nodes.length + ' related nodes</p>';
                        html += '<div style="display: grid; gap: 8px;">';
                        nodes.forEach(n => {
                            html += '<div class="lineage-clickable" data-filepath="' + escapeHtmlSafe(n.filePath || '') + '" data-line="' + (n.lineNumber || 0) + '" style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; cursor: pointer;">';
                            html += '<div style="font-weight: 600; color: var(--text-primary);">' + escapeHtmlSafe(n.name) + '</div>';
                            html += '<div style="font-size: 11px; color: var(--text-muted);">' + escapeHtmlSafe(n.type) + (n.filePath ? ' • ' + escapeHtmlSafe(basenameFromPath(n.filePath)) : '') + '</div>';
                            html += '</div>';
                        });
                        html += '</div>';
                        lineageContent.innerHTML = html;
                        // Delegated click handler — avoids inline onclick XSS
                        lineageContent.querySelectorAll('.lineage-clickable').forEach(el => {
                            el.addEventListener('click', () => {
                                vscode.postMessage({
                                    command: 'openFileAtLine',
                                    filePath: el.getAttribute('data-filepath') || '',
                                    line: parseInt(el.getAttribute('data-line') || '0', 10)
                                });
                            });
                        });
                    }
                    break;
                case 'impactResult':
                    if (!isLatestWorkspaceResponse(message)) break;
                    if (lineageContent) {
                        const resultsDiv = document.getElementById('impact-results');
                        if (message.data?.error) {
                            lineageDetailView = false;
                            if (typeof updateBackButtonText === 'function') {
                                updateBackButtonText();
                            }
                            if (typeof updateWorkspaceBreadcrumb === 'function') {
                                updateWorkspaceBreadcrumb();
                            }
                            if (resultsDiv) {
                                resultsDiv.style.display = 'block';
                                showWorkspaceAlert(resultsDiv, message.data.error, message.data.reason, 'Impact analysis unavailable');
                            } else {
                                showWorkspaceAlert(lineageContent, message.data.error, message.data.reason, 'Impact analysis unavailable');
                            }
                        } else if (message.data?.html) {
                            lineageDetailView = true;
                            if (typeof updateBackButtonText === 'function') {
                                updateBackButtonText();
                            }
                            if (typeof updateWorkspaceBreadcrumb === 'function') {
                                updateWorkspaceBreadcrumb();
                            }
                            if (resultsDiv) {
                                resultsDiv.style.display = 'block';
                                setSafeHtml(resultsDiv, message.data.html);
                            } else {
                                setSafeHtml(lineageContent, message.data.html);
                            }
                            setupImpactSummaryDetails();
                            persistImpactResult(message.data.html, message.data.report || null);
                            if (typeof restoreViewState === 'function') {
                                restoreViewState(currentViewMode);
                            }
                        }
                    }
                    break;
                case 'tableDetailResult':
                    if (!isLatestWorkspaceResponse(message)) break;
                    if (lineageContent) {
                        if (message.data?.error) {
                            showWorkspaceAlert(lineageContent, message.data.error, message.data.reason, 'Table details unavailable');
                        } else if (message.data?.html) {
                            setSafeHtml(lineageContent, message.data.html);
                            if (typeof restoreViewState === 'function') {
                                restoreViewState(currentViewMode);
                            }
                        }
                    }
                    break;
                case 'columnLineageResult':
                    if (!isLatestWorkspaceResponse(message)) break;
                    handleColumnLineageResult(message.data);
                    break;
                case 'columnSelectionCleared':
                    clearColumnHighlighting();
                    break;
                case 'impactFormResult':
                    if (!isLatestWorkspaceResponse(message)) break;
                    if (currentViewMode !== 'impact') break;
                    if (lineageContent && message.data?.html) {
                        lineageDetailView = false;
                        setSafeHtml(lineageContent, message.data.html);
                        setupImpactForm();
                        if (typeof updateBackButtonText === 'function') {
                            updateBackButtonText();
                        }
                        if (typeof updateWorkspaceBreadcrumb === 'function') {
                            updateWorkspaceBreadcrumb();
                        }
                        if (typeof restoreViewState === 'function') {
                            restoreViewState(currentViewMode);
                        }
                        if (typeof flushPendingWorkspaceSearchFocus === 'function') {
                            flushPendingWorkspaceSearchFocus('impact');
                        }
                    }
                    break;
                case 'lineageOverviewResult':
                    if (!isLatestWorkspaceResponse(message)) break;
                    if (currentViewMode !== 'lineage') break;
                    if (lineageContent && message.data?.html) {
                        setSafeHtml(lineageContent, message.data.html);
                        setupVisualLineageSearch();
                        if (typeof restoreViewState === 'function') {
                            restoreViewState(currentViewMode);
                        }
                        if (typeof flushPendingWorkspaceSearchFocus === 'function') {
                            flushPendingWorkspaceSearchFocus('lineage');
                        }
                    }
                    break;
                case 'lineageSearchResults':
                    if (!isLatestWorkspaceResponse(message)) break;
                    if (message.data?.results) {
                        showLineageSearchResults(message.data.results);
                    }
                    break;
                case 'lineageGraphResult':
                    if (!isLatestWorkspaceResponse(message)) break;
                    if (message.data?.error) {
                        if (lineageContent) {
                            lineageSetupInProgress = false;
                            showWorkspaceAlert(lineageContent, message.data.error, message.data.reason, 'Lineage graph unavailable');
                            if (typeof restoreViewState === 'function') {
                                restoreViewState(currentViewMode);
                            }
                        }
                        break;
                    }
                    if (lineageSetupInProgress) {
                        // Queue the latest message so it's processed after current setup finishes
                        pendingLineageGraphMessage = message;
                        break;
                    }
                    processLineageGraphResult(message);
                    break;
                case 'nodeColumnsResult':
                    if (message.data?.nodeId) {
                        expandNodeWithColumns(message.data.nodeId);
                    }
                    break;
                case 'nodeCollapsedResult':
                    if (message.data?.nodeId) {
                        collapseNodeWithColumns(message.data.nodeId);
                    }
                    break;
                ${getThemeChangedMessageCaseScript()}
                case 'workspaceLineageDepthUpdated':
                    lineageDepth = normalizeLineageDepth(message.depth, lineageDepth);
                    if (currentViewMode === 'lineage' && lineageDetailView && lineageCurrentNodeId) {
                        postWorkspaceMessage({
                            command: 'getLineageGraph',
                            nodeId: lineageCurrentNodeId,
                            depth: lineageDepth,
                            direction: lineageCurrentDirection,
                            expandedNodes: Array.from(lineageExpandedNodes || new Set())
                        });
                    }
                    break;
                ${getExportMessageCasesScript()}
            }
        });

        ${getExportToPngScript()}
    `;
}
