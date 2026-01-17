# Toolbar HTML Update for workspacePanel.ts

## Current Toolbar HTML (needs replacement)
Located in `getWebviewHtml()` method, around line 310-330:

```html
<div class="toolbar">
    <span class="toolbar-title">Workspace Dependencies</span>
    <div class="toolbar-separator"></div>
    <button class="toolbar-btn ${this._currentMode === 'files' ? 'active' : ''}" id="btn-files">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        Files
    </button>
    <button class="toolbar-btn ${this._currentMode === 'tables' ? 'active' : ''}" id="btn-tables">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        Tables
    </button>
    <button class="toolbar-btn ${this._currentMode === 'hybrid' ? 'active' : ''}" id="btn-hybrid">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        Hybrid
    </button>
    <div class="toolbar-separator"></div>
    <button class="toolbar-btn" id="btn-refresh">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        Refresh
    </button>

    <div class="toolbar-separator"></div>
    <button class="toolbar-btn" id="btn-legend" title="Show color legend">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        Legend
    </button>

    <div class="search-container">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" class="search-input" id="search-input" placeholder="Search nodes..." value="${this.escapeHtml(searchFilter.query)}">
        ...
    </div>
</div>
```

## New Simplified Toolbar HTML

```html
<div class="toolbar">
    <span class="toolbar-title">Workspace Dependencies</span>
    <div class="toolbar-separator"></div>
    <button class="toolbar-btn" id="btn-refresh">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        Refresh
    </button>

    <div class="toolbar-separator"></div>
    <button class="toolbar-btn" id="btn-help" title="Show help and legend">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
        Help
    </button>

    <div class="toolbar-separator"></div>
    <div style="position: relative;">
        <button class="toolbar-btn" id="btn-export">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 10px; height: 10px;"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="export-dropdown" id="export-dropdown" style="display: none;">
            <button class="dropdown-item" data-format="svg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Export as SVG
            </button>
            <button class="dropdown-item" data-format="mermaid">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Export as Mermaid
            </button>
            <button class="dropdown-item" data-format="png" style="opacity: 0.5; cursor: not-allowed;" title="Coming soon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Export as PNG (Soon)
            </button>
        </div>
    </div>

    <div class="toolbar-spacer"></div>

    <div class="search-container">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" class="search-input" id="search-input" placeholder="Search nodes..." value="${this.escapeHtml(searchFilter.query)}">
        <select class="search-filter-select" id="filter-type">
            <option value="all">All Types</option>
            <option value="file" ${searchFilter.nodeTypes?.includes('file') ? 'selected' : ''}>Files</option>
            <option value="table" ${searchFilter.nodeTypes?.includes('table') ? 'selected' : ''}>Tables</option>
            <option value="view" ${searchFilter.nodeTypes?.includes('view') ? 'selected' : ''}>Views</option>
            <option value="external" ${searchFilter.nodeTypes?.includes('external') ? 'selected' : ''}>External</option>
        </select>
        <div class="search-options">
            <button class="search-option ${searchFilter.useRegex ? 'active' : ''}" id="btn-regex" title="Regular Expression">Regex</button>
            <button class="search-option ${searchFilter.caseSensitive ? 'active' : ''}" id="btn-case" title="Case Sensitive">Aa</button>
        </div>
        <button class="search-clear ${searchFilter.query ? 'visible' : ''}" id="btn-clear-search" title="Clear">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
    </div>

    <div class="toolbar-separator"></div>
    <button class="toolbar-btn ${this._currentView === 'issues' ? 'active' : ''}" id="btn-issues">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        Issues
        ${graph.stats.orphanedDefinitions.length > 0 || graph.stats.missingDefinitions.length > 0 ?
            `<span style="background: #ef4444; color: white; padding: 2px 6px; border-radius: 8px; font-size: 9px; margin-left: 4px;">
                ${graph.stats.orphanedDefinitions.length + graph.stats.missingDefinitions.length}
            </span>` : ''}
    </button>
</div>
```

## New CSS to Add

Add these styles to the `<style>` section:

```css
/* Toolbar spacer */
.toolbar-spacer {
    flex: 1;
}

/* Export dropdown */
.export-dropdown {
    position: absolute; top: 100%; right: 0; margin-top: 4px;
    background: #1e293b; border: 1px solid #475569; border-radius: 6px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.4); z-index: 1000;
    min-width: 180px;
}
.export-dropdown.visible {
    display: block;
}
.dropdown-item {
    display: flex; align-items: center; gap: 8px; padding: 8px 12px;
    background: transparent; border: none; color: #e2e8f0;
    font-size: 12px; cursor: pointer; width: 100%; text-align: left;
}
.dropdown-item:hover {
    background: #334155;
}
.dropdown-item:disabled {
    opacity: 0.5; cursor: not-allowed;
}

/* Search highlighting */
.node.highlighted rect {
    filter: brightness(1.3);
    stroke: #fbbf24;
    stroke-width: 3;
}
.node.dimmed {
    opacity: 0.3;
}

/* Help popover */
.help-popover {
    position: absolute; top: 50px; right: 12px;
    background: #1e293b; border: 1px solid #475569; border-radius: 8px;
    padding: 16px; min-width: 280px; max-width: 400px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
    z-index: 100; display: none;
}
.help-popover.visible {
    display: block;
}
.help-title {
    font-size: 14px; font-weight: 600; color: #f1f5f9; margin-bottom: 12px;
    display: flex; align-items: center; gap: 8px;
}
.help-section {
    margin-bottom: 16px;
}
.help-section:last-child {
    margin-bottom: 0;
}
.help-section-title {
    font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase;
    letter-spacing: 0.5px; margin-bottom: 8px;
}
.help-item {
    display: flex; align-items: center; gap: 8px; padding: 4px 0;
    font-size: 12px; color: #e2e8f0;
}
.help-shortcut {
    background: #0f172a; border: 1px solid #475569; border-radius: 3px;
    padding: 2px 6px; font-family: monospace; font-size: 10px; color: #94a3b8;
}
```

## JavaScript Updates

Add these event listeners and functions to the script section:

```javascript
// Export dropdown
const btnExport = document.getElementById('btn-export');
const exportDropdown = document.getElementById('export-dropdown');

btnExport?.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown?.classList.toggle('visible');
});

document.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
        const format = e.currentTarget.getAttribute('data-format');
        if (format && !e.currentTarget.hasAttribute('disabled')) {
            vscode.postMessage({ command: 'export', format: format });
            exportDropdown?.classList.remove('visible');
        }
    });
});

// Close dropdown when clicking outside
document.addEventListener('click', () => {
    exportDropdown?.classList.remove('visible');
});

// Help button
const btnHelp = document.getElementById('btn-help');
const helpPopover = document.getElementById('help-popover');

btnHelp?.addEventListener('click', (e) => {
    e.stopPropagation();
    helpPopover?.classList.toggle('visible');
});

// Issues button
document.getElementById('btn-issues')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'switchView', view: 'issues' });
});

// Enhanced search with highlighting
function performSearch() {
    const query = searchInput.value.trim();
    const typeFilter = filterType.value;
    const useRegex = btnRegex.classList.contains('active');
    const caseSensitive = btnCase.classList.contains('active');

    if (!query && typeFilter === 'all') {
        clearSearch();
        return;
    }

    let nodeTypes = undefined;
    if (typeFilter !== 'all') {
        nodeTypes = [typeFilter];
    }

    vscode.postMessage({
        command: 'search',
        filter: { query, nodeTypes, useRegex, caseSensitive }
    });

    // Show/hide clear button
    if (query || typeFilter !== 'all') {
        btnClearSearch.classList.add('visible');
    } else {
        btnClearSearch.classList.remove('visible');
    }

    // Apply highlighting
    applySearchHighlight(query, nodeTypes, useRegex, caseSensitive);
}

function applySearchHighlight(query, nodeTypes, useRegex, caseSensitive) {
    const nodes = document.querySelectorAll('.node');
    let matchCount = 0;

    nodes.forEach(node => {
        const label = node.querySelector('.node-label')?.textContent || '';
        const matches = searchMatches(label, query, nodeTypes, useRegex, caseSensitive);

        if (matches && query) {
            node.classList.add('highlighted');
            node.classList.remove('dimmed');
            matchCount++;
        } else if (query) {
            node.classList.remove('highlighted');
            node.classList.add('dimmed');
        } else {
            node.classList.remove('highlighted', 'dimmed');
        }
    });

    // Show match count
    const searchResults = document.getElementById('search-results');
    if (query && matchCount > 0) {
        searchResults.textContent = `Found ${matchCount} match${matchCount !== 1 ? 'es' : ''}`;
        searchResults.classList.add('visible');
    } else if (query) {
        searchResults.textContent = 'No matches found';
        searchResults.classList.add('visible');
    } else {
        searchResults.classList.remove('visible');
    }
}

function searchMatches(text, query, nodeTypes, useRegex, caseSensitive) {
    if (!query) return true;

    let searchQuery = query;
    if (!caseSensitive) {
        searchQuery = query.toLowerCase();
        text = text.toLowerCase();
    }

    if (useRegex) {
        try {
            return new RegExp(searchQuery).test(text);
        } catch (e) {
            return false;
        }
    }

    return text.includes(searchQuery);
}
```

## Legend/Help Popover HTML

Replace the old legend popover with this new help popover:

```html
<!-- Help Popover -->
<div class="help-popover" id="help-popover">
    <div class="help-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
        </svg>
        Help & Legend
    </div>

    <div class="help-section">
        <div class="help-section-title">Node Types</div>
        <div class="help-item">
            <div style="width: 16px; height: 16px; background: #3b82f6; border-radius: 3px; border: 2px solid #60a5fa;"></div>
            <span>Files (SQL documents)</span>
        </div>
        <div class="help-item">
            <div style="width: 16px; height: 16px; background: #10b981; border-radius: 3px; border: 2px solid #34d399;"></div>
            <span>Tables (CREATE TABLE)</span>
        </div>
        <div class="help-item">
            <div style="width: 16px; height: 16px; background: #8b5cf6; border-radius: 3px; border: 2px solid #a78bfa;"></div>
            <span>Views (CREATE VIEW)</span>
        </div>
        <div class="help-item">
            <div style="width: 16px; height: 16px; background: #475569; border-radius: 3px; border: 2px dashed #64748b;"></div>
            <span>External (referenced but not defined)</span>
        </div>
    </div>

    <div class="help-section">
        <div class="help-section-title">Edge Types (References)</div>
        <div class="help-item">
            <div style="width: 24px; height: 3px; background: #64748b; border-radius: 2px;"></div>
            <span>SELECT (read from)</span>
        </div>
        <div class="help-item">
            <div style="width: 24px; height: 3px; background: #a78bfa; border-radius: 2px;"></div>
            <span>JOIN (table join)</span>
        </div>
        <div class="help-item">
            <div style="width: 24px; height: 3px; background: #10b981; border-radius: 2px;"></div>
            <span>INSERT (write to)</span>
        </div>
        <div class="help-item">
            <div style="width: 24px; height: 3px; background: #fbbf24; border-radius: 2px;"></div>
            <span>UPDATE (modify)</span>
        </div>
        <div class="help-item">
            <div style="width: 24px; height: 3px; background: #f87171; border-radius: 2px;"></div>
            <span>DELETE (remove)</span>
        </div>
    </div>

    <div class="help-section">
        <div class="help-section-title">Keyboard Shortcuts</div>
        <div class="help-item">
            <span class="help-shortcut">Ctrl+F</span>
            <span>Search nodes</span>
        </div>
        <div class="help-item">
            <span class="help-shortkit">Drag</span>
            <span>Pan the graph</span>
        </div>
        <div class="help-item">
            <span class="help-shortcut">Scroll</span>
            <span>Zoom in/out</span>
        </div>
        <div class="help-item">
            <span class="help-shortcut">Click</span>
            <span>Open file</span>
        </div>
        <div class="help-item">
            <span class="help-shortcut">Double-click</span>
            <span>Visualize file</span>
        </div>
    </div>

    <div class="help-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #334155;">
        <div style="font-size: 11px; color: #94a3b8; line-height: 1.5;">
            Click <b>Issues</b> button to see orphaned/missing definitions.<br>
            Use <b>Export</b> to save graphs as SVG or Mermaid.
        </div>
    </div>
</div>
```
