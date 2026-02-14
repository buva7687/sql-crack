/**
 * Script fragment: impact summary interactions.
 */
export function getImpactSummaryScriptFragment(): string {
    return `
        function setupImpactSummaryDetails() {
            const details = document.getElementById('impact-summary-details');
            const titleEl = document.getElementById('impact-summary-title');
            const listEl = document.getElementById('impact-summary-list');
            const closeBtn = document.getElementById('impact-summary-close');
            if (!details || !titleEl || !listEl) {
                return;
            }

            closeBtn?.addEventListener('click', () => {
                details.style.display = 'none';
            });

            document.querySelectorAll('.impact-summary-trigger').forEach(button => {
                button.addEventListener('click', () => {
                    const title = button.getAttribute('data-title') || 'Details';
                    const listRaw = button.getAttribute('data-list') || '[]';
                    let items = [];
                    try {
                        items = JSON.parse(decodeURIComponent(listRaw));
                    } catch (e) {
                        window.debugLogging && console.debug('[clientScripts] JSON parse failed for summary list:', e);
                        items = [];
                    }

                    titleEl.textContent = title;
                    if (!items.length) {
                        listEl.innerHTML = '<div class="summary-item">No items found</div>';
                    } else {
                        listEl.innerHTML = items.map(item => {
                            const label = escapeHtml(item.label || '');
                            const titleAttr = escapeHtmlAttr(item.title || '');
                            return '<div class="summary-item" title="' + titleAttr + '">' + label + '</div>';
                        }).join('');
                    }

                    details.style.display = 'block';
                    details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                });
            });

            // Transitive group expand/collapse
            document.querySelectorAll('.transitive-group-header').forEach(header => {
                header.addEventListener('click', () => {
                    const group = header.closest('.transitive-group');
                    if (!group) return;
                    const content = group.querySelector('.transitive-group-content');
                    if (!content) return;

                    const isExpanded = group.classList.contains('expanded');
                    if (isExpanded) {
                        group.classList.remove('expanded');
                        content.style.display = 'none';
                        header.setAttribute('aria-expanded', 'false');
                    } else {
                        group.classList.add('expanded');
                        content.style.display = 'block';
                        header.setAttribute('aria-expanded', 'true');
                    }
                });
            });
        }
    `;
}
