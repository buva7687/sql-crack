/**
 * Script fragment: visual lineage search interactions and filtering.
 */
export function getVisualLineageSearchScriptFragment(): string {
    return `
        // ========== Visual Lineage Search Setup ==========
        let lineageTypeFilter = 'all';

        function setupVisualLineageSearch() {
            const searchInput = document.getElementById('lineage-search-input');
            const searchClear = document.getElementById('lineage-search-clear');
            const filterChips = document.querySelectorAll('.view-quick-filters .view-filter-chip');
            const sortSelect = document.getElementById('lineage-sort');
            const tablesGrid = document.getElementById('lineage-tables-grid');
            const popularSection = document.getElementById('lineage-popular-section');
            const showAllBtn = document.getElementById('lineage-show-all-btn');
            const emptyFilter = document.getElementById('lineage-empty-filter');
            const resultsInfo = document.getElementById('lineage-results-info');
            const resultsCount = document.getElementById('lineage-results-count');
            let showAllTables = false;
            let lineageFilterDebounceTimer = null;
            const lineageFilterDebounceMs = 180;

            function setLineageGridMode(expanded) {
                if (tablesGrid) {
                    tablesGrid.style.display = expanded ? 'grid' : 'none';
                }
                if (popularSection) {
                    popularSection.style.display = expanded ? 'none' : 'block';
                }
            }

            function filterLineageTables() {
                if (!tablesGrid) return;

                const searchQuery = (searchInput?.value || '').toLowerCase().trim();
                const hasActiveFilter = lineageTypeFilter !== 'all';
                const shouldExpand = showAllTables || !!searchQuery || hasActiveFilter;
                const sortValue = sortSelect?.value || 'connected';
                const items = Array.from(tablesGrid.querySelectorAll('.lineage-table-item'));
                const visibleItems = [];

                setLineageGridMode(shouldExpand);

                items.forEach(item => {
                    const name = item.getAttribute('data-name') || '';
                    const type = item.getAttribute('data-type') || '';

                    const matchesSearch = !searchQuery || name.includes(searchQuery);
                    const matchesType = lineageTypeFilter === 'all' || type === lineageTypeFilter;

                    if (matchesSearch && matchesType) {
                        item.style.display = '';
                        visibleItems.push(item);

                        // Highlight matching text
                        const nameEl = item.querySelector('.table-item-name');
                        if (nameEl && searchQuery) {
                            const originalName = nameEl.textContent || '';
                            const lowerName = originalName.toLowerCase();
                            const idx = lowerName.indexOf(searchQuery);
                            if (idx >= 0) {
                                const before = originalName.slice(0, idx);
                                const match = originalName.slice(idx, idx + searchQuery.length);
                                const after = originalName.slice(idx + searchQuery.length);
                                nameEl.innerHTML = escapeHtml(before) + '<mark>' + escapeHtml(match) + '</mark>' + escapeHtml(after);
                            } else {
                                nameEl.textContent = originalName;
                            }
                        } else if (nameEl) {
                            // Remove highlighting when no search
                            const text = nameEl.textContent || '';
                            nameEl.textContent = text;
                        }
                    } else {
                        item.style.display = 'none';
                    }
                });

                visibleItems.sort((a, b) => {
                    const nameA = a.getAttribute('data-name') || '';
                    const nameB = b.getAttribute('data-name') || '';
                    const typeA = a.getAttribute('data-type') || '';
                    const typeB = b.getAttribute('data-type') || '';
                    const totalA = Number(a.getAttribute('data-total') || '0');
                    const totalB = Number(b.getAttribute('data-total') || '0');

                    if (sortValue === 'name-asc') {
                        return nameA.localeCompare(nameB);
                    }
                    if (sortValue === 'name-desc') {
                        return nameB.localeCompare(nameA);
                    }
                    if (sortValue === 'type') {
                        if (typeA !== typeB) {
                            return typeA.localeCompare(typeB);
                        }
                        return nameA.localeCompare(nameB);
                    }

                    if (totalB !== totalA) {
                        return totalB - totalA;
                    }
                    return nameA.localeCompare(nameB);
                });

                visibleItems.forEach(item => tablesGrid.appendChild(item));
                const visibleCount = visibleItems.length;

                // Show/hide empty state and results count
                if (emptyFilter) {
                    emptyFilter.style.display = shouldExpand && visibleCount === 0 ? 'block' : 'none';
                }
                if (resultsInfo && resultsCount) {
                    if (searchQuery || lineageTypeFilter !== 'all') {
                        resultsInfo.style.display = 'inline';
                        resultsCount.textContent = visibleCount;
                    } else {
                        resultsInfo.style.display = 'none';
                    }
                }
            }

            function scheduleLineageFilter(immediate = false) {
                if (lineageFilterDebounceTimer) {
                    clearTimeout(lineageFilterDebounceTimer);
                    lineageFilterDebounceTimer = null;
                }
                if (immediate) {
                    filterLineageTables();
                    return;
                }
                lineageFilterDebounceTimer = setTimeout(() => {
                    lineageFilterDebounceTimer = null;
                    filterLineageTables();
                }, lineageFilterDebounceMs);
            }

            searchInput?.addEventListener('input', () => {
                const query = searchInput.value.trim();
                if (searchClear) searchClear.style.display = query ? 'flex' : 'none';
                if (!query) {
                    showAllTables = false;
                }
                scheduleLineageFilter();
            });

            searchInput?.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    if (searchClear) searchClear.style.display = 'none';
                    showAllTables = false;
                    scheduleLineageFilter(true);
                    searchInput.blur();
                } else if (e.key === 'Enter') {
                    // Select the first visible item
                    const firstVisible = tablesGrid?.querySelector('.lineage-table-item:not([style*="display: none"])');
                    if (firstVisible) {
                        firstVisible.click();
                    }
                }
            });

            searchClear?.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (searchClear) searchClear.style.display = 'none';
                showAllTables = false;
                scheduleLineageFilter(true);
                searchInput?.focus();
            });

            filterChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    filterChips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    lineageTypeFilter = chip.getAttribute('data-filter') || 'all';
                    if (lineageTypeFilter === 'all' && !(searchInput?.value || '').trim()) {
                        showAllTables = false;
                    }
                    scheduleLineageFilter(true);
                });
            });

            sortSelect?.addEventListener('change', () => scheduleLineageFilter(true));

            showAllBtn?.addEventListener('click', () => {
                showAllTables = true;
                scheduleLineageFilter(true);
            });

            // Setup click handlers for table items (both curated and full grids)
            document.querySelectorAll('.lineage-table-item, .popular-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const nodeId = item.getAttribute('data-node-id');
                    if (nodeId) {
                        selectLineageNode(nodeId);
                    }
                });
            });
        }

        function selectLineageNode(nodeId) {
            if (lineageContent) {
                lineageContent.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 300px;"><div class="skeleton-loader" style="width: 200px;"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>';
            }
            vscode.postMessage({
                command: 'getLineageGraph',
                nodeId: nodeId,
                depth: lineageDepth,
                direction: lineageCurrentDirection
            });
        }
    `;
}
