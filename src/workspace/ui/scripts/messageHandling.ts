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
                case 'lineageResult':
                case 'upstreamResult':
                case 'downstreamResult':
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
                    if (lineageContent) {
                        const resultsDiv = document.getElementById('impact-results');
                        if (message.data?.error) {
                            const errorHtml = '<div style="color: var(--error); padding: 20px;">' + escapeHtmlSafe(message.data.error) + '</div>';
                            if (resultsDiv) {
                                resultsDiv.style.display = 'block';
                                resultsDiv.innerHTML = errorHtml;
                            } else {
                                lineageContent.innerHTML = errorHtml;
                            }
                        } else if (message.data?.html) {
                            if (resultsDiv) {
                                resultsDiv.style.display = 'block';
                                setSafeHtml(resultsDiv, message.data.html);
                            } else {
                                setSafeHtml(lineageContent, message.data.html);
                            }
                            setupImpactSummaryDetails();
                            if (typeof restoreViewState === 'function') {
                                restoreViewState(currentViewMode);
                            }
                        }
                    }
                    break;
                case 'tableDetailResult':
                    if (lineageContent) {
                        if (message.data?.error) {
                            lineageContent.innerHTML = '<div style="color: var(--error); padding: 20px;">' + escapeHtmlSafe(message.data.error) + '</div>';
                        } else if (message.data?.html) {
                            setSafeHtml(lineageContent, message.data.html);
                            if (typeof restoreViewState === 'function') {
                                restoreViewState(currentViewMode);
                            }
                        }
                    }
                    break;
                case 'columnLineageResult':
                    handleColumnLineageResult(message.data);
                    break;
                case 'columnSelectionCleared':
                    clearColumnHighlighting();
                    break;
                case 'impactFormResult':
                    if (lineageContent && message.data?.html) {
                        setSafeHtml(lineageContent, message.data.html);
                        setupImpactForm();
                        if (typeof restoreViewState === 'function') {
                            restoreViewState(currentViewMode);
                        }
                    }
                    break;
                case 'lineageOverviewResult':
                    if (lineageContent && message.data?.html) {
                        setSafeHtml(lineageContent, message.data.html);
                        setupVisualLineageSearch();
                        if (typeof restoreViewState === 'function') {
                            restoreViewState(currentViewMode);
                        }
                    }
                    break;
                case 'lineageSearchResults':
                    if (message.data?.results) {
                        showLineageSearchResults(message.data.results);
                    }
                    break;
                case 'lineageGraphResult':
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
                        vscode.postMessage({
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
