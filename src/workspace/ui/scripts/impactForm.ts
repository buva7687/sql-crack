/**
 * Script fragment: impact form setup and typeahead behavior.
 */
export function getImpactFormScriptFragment(): string {
    return `
        // ========== Impact Form Setup ==========
        function setupImpactForm() {
            const tableInput = document.getElementById('impact-table-input');
            const tableIdInput = document.getElementById('impact-table-id');
            const typeaheadResults = document.getElementById('impact-typeahead-results');
            const resultItems = typeaheadResults ? Array.from(typeaheadResults.querySelectorAll('.impact-typeahead-item')) : [];
            const selectedBadge = document.getElementById('impact-selected-badge');
            const selectedLabel = document.getElementById('impact-selected-label');
            const selectedClear = document.getElementById('impact-selected-clear');
            const analyzeBtn = document.getElementById('impact-analyze-btn');
            const changeTypeButtons = document.querySelectorAll('.change-type-btn');
            let impactTypeaheadDebounceTimer = null;
            const impactTypeaheadDebounceMs = 180;

            changeTypeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    changeTypeButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });

            const analyzeHint = document.getElementById('impact-analyze-hint');
            function updateAnalyzeButtonState() {
                if (analyzeBtn && tableIdInput) {
                    const hasValue = !!tableIdInput.value;
                    analyzeBtn.disabled = !hasValue;
                    if (analyzeHint) {
                        analyzeHint.classList.toggle('hidden', hasValue);
                    }
                }
            }

            function closeTypeaheadResults() {
                if (typeaheadResults) {
                    typeaheadResults.style.display = 'none';
                }
                tableInput?.setAttribute('aria-expanded', 'false');
            }

            function openTypeaheadResults() {
                if (typeaheadResults) {
                    typeaheadResults.style.display = 'block';
                }
                tableInput?.setAttribute('aria-expanded', 'true');
            }

            function clearSelectedTable(preserveInputValue = false) {
                if (!tableIdInput) {
                    return;
                }

                tableIdInput.value = '';
                tableIdInput.dataset.name = '';
                tableIdInput.dataset.type = '';
                if (!preserveInputValue && tableInput) {
                    tableInput.value = '';
                }
                if (selectedBadge) {
                    selectedBadge.style.display = 'none';
                }
                if (selectedLabel) {
                    selectedLabel.textContent = '';
                }
                updateAnalyzeButtonState();
            }

            function selectTypeaheadItem(item) {
                if (!tableIdInput) {
                    return;
                }

                const nodeId = item.getAttribute('data-node-id') || '';
                const tableName = item.getAttribute('data-name') || '';
                const tableType = item.getAttribute('data-type') || '';
                if (!nodeId || !tableName) {
                    return;
                }

                tableIdInput.value = nodeId;
                tableIdInput.dataset.name = tableName;
                tableIdInput.dataset.type = tableType;
                if (tableInput) {
                    tableInput.value = tableName;
                }
                if (selectedBadge) {
                    selectedBadge.style.display = 'inline-flex';
                }
                if (selectedLabel) {
                    selectedLabel.textContent = tableName + ' (' + tableType + ')';
                }
                closeTypeaheadResults();
                updateAnalyzeButtonState();
            }

            function filterTypeaheadResults() {
                if (!tableInput || !typeaheadResults) {
                    return;
                }

                const query = tableInput.value.trim().toLowerCase();
                let visibleCount = 0;

                resultItems.forEach(item => {
                    const itemName = (item.getAttribute('data-name') || '').toLowerCase();
                    const matches = !query || itemName.includes(query);
                    item.style.display = matches ? 'flex' : 'none';
                    if (matches) {
                        visibleCount++;
                    }
                });

                if (query && visibleCount > 0) {
                    openTypeaheadResults();
                } else {
                    closeTypeaheadResults();
                }
            }

            function scheduleTypeaheadFilter(immediate = false) {
                if (impactTypeaheadDebounceTimer) {
                    clearTimeout(impactTypeaheadDebounceTimer);
                    impactTypeaheadDebounceTimer = null;
                }
                if (immediate) {
                    filterTypeaheadResults();
                    return;
                }
                impactTypeaheadDebounceTimer = setTimeout(() => {
                    impactTypeaheadDebounceTimer = null;
                    filterTypeaheadResults();
                }, impactTypeaheadDebounceMs);
            }

            tableInput?.addEventListener('input', () => {
                clearSelectedTable(true);
                scheduleTypeaheadFilter();
            });

            tableInput?.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    closeTypeaheadResults();
                    if (tableInput) {
                        tableInput.blur();
                    }
                    return;
                }

                if (event.key === 'Enter') {
                    const firstVisible = resultItems.find(item => item.style.display !== 'none');
                    if (firstVisible) {
                        event.preventDefault();
                        selectTypeaheadItem(firstVisible);
                    }
                }
            });

            tableInput?.addEventListener('focus', () => {
                if (tableInput.value.trim()) {
                    scheduleTypeaheadFilter(true);
                }
            });

            selectedClear?.addEventListener('click', () => {
                clearSelectedTable();
                closeTypeaheadResults();
                tableInput?.focus();
            });

            resultItems.forEach(item => {
                item.addEventListener('click', () => {
                    selectTypeaheadItem(item);
                });
            });

            document.addEventListener('click', (event) => {
                if (event.target.closest('.impact-typeahead')) {
                    return;
                }
                closeTypeaheadResults();
            });

            if (analyzeBtn && tableIdInput) {
                analyzeBtn.addEventListener('click', () => {
                    const tableName = tableIdInput.dataset.name;
                    const activeButton = document.querySelector('.change-type-btn.active');
                    const changeType = activeButton?.getAttribute('data-value') || 'modify';

                    if (!tableName) {return;}

                    const resultsDiv = document.getElementById('impact-results');
                    if (resultsDiv) {
                        resultsDiv.style.display = 'block';
                        resultsDiv.innerHTML = '<div class="skeleton-loader"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>';
                    }

                    vscode.postMessage({
                        command: 'analyzeImpact',
                        type: 'table',
                        name: tableName,
                        changeType: changeType
                    });
                });
            }

            updateAnalyzeButtonState();
        }
    `;
}
