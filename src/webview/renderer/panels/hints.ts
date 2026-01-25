// Optimization hints panel

import { OptimizationHint } from '../../types';
import { hintsPanel, currentHints } from '../state';

export function updateHintsPanel(): void {
    if (!hintsPanel) { return; }

    if (!currentHints || currentHints.length === 0) {
        hintsPanel.style.display = 'none';
        return;
    }

    hintsPanel.style.display = 'block';

    const hintColors: Record<string, { bg: string; border: string; icon: string }> = {
        'error': { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', icon: '⚠' },
        'warning': { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b', icon: '⚡' },
        'info': { bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6', icon: 'ℹ' }
    };

    // Group hints by category
    const hintsByCategory: Record<string, OptimizationHint[]> = {
        'performance': [],
        'quality': [],
        'best-practice': [],
        'complexity': [],
        'other': []
    };

    currentHints.forEach(hint => {
        const category = hint.category || 'other';
        if (hintsByCategory[category]) {
            hintsByCategory[category].push(hint);
        } else {
            hintsByCategory['other'].push(hint);
        }
    });

    // Count hints by category
    const perfCount = hintsByCategory['performance'].length;
    const qualityCount = hintsByCategory['quality'].length;
    const bestPracticeCount = hintsByCategory['best-practice'].length;
    const complexityCount = hintsByCategory['complexity'].length;

    // Count by severity
    const highCount = currentHints.filter(h => h.severity === 'high').length;
    const mediumCount = currentHints.filter(h => h.severity === 'medium').length;
    const lowCount = currentHints.filter(h => h.severity === 'low').length;

    hintsPanel.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span style="font-weight: 600; color: #f1f5f9;">Optimization Hints</span>
            <span style="
                background: rgba(245, 158, 11, 0.2);
                color: #fbbf24;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
            ">${currentHints.length}</span>
        </div>

        <!-- Category Filters -->
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(148, 163, 184, 0.2);">
            ${perfCount > 0 ? `
                <button class="hint-filter-btn" data-category="performance" style="
                    background: rgba(59, 130, 246, 0.2);
                    color: #60a5fa;
                    border: 1px solid rgba(59, 130, 246, 0.3);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    cursor: pointer;
                ">Performance (${perfCount})</button>
            ` : ''}
            ${qualityCount > 0 ? `
                <button class="hint-filter-btn" data-category="quality" style="
                    background: rgba(245, 158, 11, 0.2);
                    color: #fbbf24;
                    border: 1px solid rgba(245, 158, 11, 0.3);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    cursor: pointer;
                ">Quality (${qualityCount})</button>
            ` : ''}
            ${bestPracticeCount > 0 ? `
                <button class="hint-filter-btn" data-category="best-practice" style="
                    background: rgba(34, 197, 94, 0.2);
                    color: #4ade80;
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    cursor: pointer;
                ">Best Practice (${bestPracticeCount})</button>
            ` : ''}
            ${complexityCount > 0 ? `
                <button class="hint-filter-btn" data-category="complexity" style="
                    background: rgba(139, 92, 246, 0.2);
                    color: #a78bfa;
                    border: 1px solid rgba(139, 92, 246, 0.3);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    cursor: pointer;
                ">Complexity (${complexityCount})</button>
            ` : ''}
        </div>

        <!-- Severity Filters -->
        ${(highCount > 0 || mediumCount > 0 || lowCount > 0) ? `
            <div style="display: flex; gap: 6px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(148, 163, 184, 0.2);">
                ${highCount > 0 ? `
                    <button class="hint-severity-btn" data-severity="high" style="
                        background: rgba(239, 68, 68, 0.2);
                        color: #f87171;
                        border: 1px solid rgba(239, 68, 68, 0.3);
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 10px;
                        cursor: pointer;
                    ">High (${highCount})</button>
                ` : ''}
                ${mediumCount > 0 ? `
                    <button class="hint-severity-btn" data-severity="medium" style="
                        background: rgba(245, 158, 11, 0.2);
                        color: #fbbf24;
                        border: 1px solid rgba(245, 158, 11, 0.3);
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 10px;
                        cursor: pointer;
                    ">Medium (${mediumCount})</button>
                ` : ''}
                ${lowCount > 0 ? `
                    <button class="hint-severity-btn" data-severity="low" style="
                        background: rgba(148, 163, 184, 0.2);
                        color: #cbd5e1;
                        border: 1px solid rgba(148, 163, 184, 0.3);
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 10px;
                        cursor: pointer;
                    ">Low (${lowCount})</button>
                ` : ''}
            </div>
        ` : ''}

        <!-- Hints List -->
        <div class="hints-list" style="max-height: 300px; overflow-y: auto;">
            ${Object.entries(hintsByCategory).map(([category, hints]) => {
                if (hints.length === 0) {return '';}

                const categoryLabels: Record<string, string> = {
                    'performance': '⚡ Performance',
                    'quality': '🔍 Quality',
                    'best-practice': '✨ Best Practice',
                    'complexity': '📊 Complexity',
                    'other': '📝 Other'
                };

                return `
                    <div class="hint-category" data-category="${category}" style="margin-bottom: 12px;">
                        <div style="font-size: 10px; color: #94a3b8; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${categoryLabels[category] || category} (${hints.length})
                        </div>
                        ${hints.map(hint => {
                            const style = hintColors[hint.type] || hintColors.info;
                            const severityBadge = hint.severity ? `
                                <span style="
                                    background: ${hint.severity === 'high' ? 'rgba(239, 68, 68, 0.2)' : hint.severity === 'medium' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(148, 163, 184, 0.2)'};
                                    color: ${hint.severity === 'high' ? '#f87171' : hint.severity === 'medium' ? '#fbbf24' : '#cbd5e1'};
                                    padding: 2px 6px;
                                    border-radius: 4px;
                                    font-size: 9px;
                                    margin-left: 6px;
                                    text-transform: uppercase;
                                ">${hint.severity}</span>
                            ` : '';

                            return `
                                <div class="hint-item" data-category="${hint.category || 'other'}" data-severity="${hint.severity || ''}" style="
                                    background: ${style.bg};
                                    border-left: 3px solid ${style.border};
                                    padding: 8px 12px;
                                    margin-bottom: 8px;
                                    border-radius: 0 4px 4px 0;
                                ">
                                    <div style="color: #f1f5f9; font-size: 12px; margin-bottom: 4px; display: flex; align-items: center;">
                                        ${style.icon} ${hint.message}${severityBadge}
                                    </div>
                                    ${hint.suggestion ? `
                                        <div style="color: #94a3b8; font-size: 11px;">
                                            ${hint.suggestion}
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Add filter button event listeners
    setupHintFilters();
}

function setupHintFilters(): void {
    if (!hintsPanel) {return;}

    const filterButtons = hintsPanel.querySelectorAll('.hint-filter-btn');
    const severityButtons = hintsPanel.querySelectorAll('.hint-severity-btn');
    const hintItems = hintsPanel.querySelectorAll('.hint-item');
    const categoryGroups = hintsPanel.querySelectorAll('.hint-category');

    let activeCategory: string | null = null;
    let activeSeverity: string | null = null;

    filterButtons.forEach(btn => {
        const btnEl = btn as HTMLElement;
        btnEl.addEventListener('click', () => {
            const category = btnEl.getAttribute('data-category');
            if (activeCategory === category) {
                activeCategory = null;
                btnEl.style.opacity = '1';
            } else {
                activeCategory = category;
                filterButtons.forEach(b => {
                    (b as HTMLElement).style.opacity = '0.5';
                });
                btnEl.style.opacity = '1';
            }
            applyFilters();
        });
    });

    severityButtons.forEach(btn => {
        const btnEl = btn as HTMLElement;
        btnEl.addEventListener('click', () => {
            const severity = btnEl.getAttribute('data-severity');
            if (activeSeverity === severity) {
                activeSeverity = null;
                btnEl.style.opacity = '1';
            } else {
                activeSeverity = severity;
                severityButtons.forEach(b => {
                    (b as HTMLElement).style.opacity = '0.5';
                });
                btnEl.style.opacity = '1';
            }
            applyFilters();
        });
    });

    function applyFilters() {
        hintItems.forEach(item => {
            const itemEl = item as HTMLElement;
            const itemCategory = itemEl.getAttribute('data-category') || 'other';
            const itemSeverity = itemEl.getAttribute('data-severity') || '';

            const categoryMatch = !activeCategory || itemCategory === activeCategory;
            const severityMatch = !activeSeverity || itemSeverity === activeSeverity;

            if (categoryMatch && severityMatch) {
                itemEl.style.display = '';
            } else {
                itemEl.style.display = 'none';
            }
        });

        // Hide/show category groups
        categoryGroups.forEach(group => {
            const groupEl = group as HTMLElement;
            const visibleItems = Array.from(groupEl.querySelectorAll('.hint-item')).filter(item => {
                const itemEl = item as HTMLElement;
                return itemEl.style.display !== 'none';
            });

            if (visibleItems.length === 0) {
                groupEl.style.display = 'none';
            } else {
                groupEl.style.display = '';
            }
        });
    }
}
