// Toolbar UI module

import { SqlDialect, BatchParseResult } from '../sqlParser';
import { FocusMode } from '../types';

// Toolbar callbacks interface
export interface ToolbarCallbacks {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetView: () => void;
    onExportPng: () => void;
    onExportSvg: () => void;
    onExportMermaid: () => void;
    onCopyToClipboard: () => void;
    onToggleLegend: () => void;
    onToggleFocusMode: (active: boolean) => void;
    onFocusModeChange: (mode: FocusMode) => void;
    getFocusMode: () => FocusMode;
    onToggleSqlPreview: () => void;
    onToggleColumnFlows: (active: boolean) => void;
    onToggleTheme: () => void;
    onToggleFullscreen: () => void;
    onSearchBoxReady: (input: HTMLInputElement) => void;
    onNextSearchResult: () => void;
    onPrevSearchResult: () => void;
    onDialectChange: (dialect: SqlDialect) => void;
    onRefresh: () => void;
    onPinVisualization: (sql: string, dialect: SqlDialect, name: string) => void;
    onChangeViewLocation: (location: string) => void;
    onOpenPinnedTab: (pinId: string) => void;
    onUnpinTab: (pinId: string) => void;
    onToggleLayout: () => void;
    isDarkTheme: () => boolean;
    isFullscreen: () => boolean;
    getKeyboardShortcuts: () => Array<{ key: string; description: string }>;
    getCurrentQuerySql: () => { sql: string; name: string };
}

// Button style constants
const btnStyle = `
    background: transparent;
    border: none;
    color: #f1f5f9;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.2s;
`;

export function createToolbar(
    container: HTMLElement,
    callbacks: ToolbarCallbacks,
    options: {
        currentDialect: SqlDialect;
        isPinnedView: boolean;
        pinId: string | null;
        viewLocation: string;
        persistedPinnedTabs: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>;
    }
): { toolbar: HTMLElement; actions: HTMLElement; searchContainer: HTMLElement } {
    const toolbar = document.createElement('div');
    toolbar.id = 'sql-crack-toolbar';
    toolbar.style.cssText = `
        position: absolute;
        top: 16px;
        left: 16px;
        display: flex;
        gap: 8px;
        z-index: 100;
    `;

    // Title and dialect selector
    const title = document.createElement('div');
    title.style.cssText = `
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 8px 16px;
        color: #f1f5f9;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 12px;
    `;
    const isDark = callbacks.isDarkTheme();
    const selectBg = isDark ? '#1e293b' : '#f1f5f9';
    const selectColor = isDark ? '#f1f5f9' : '#1e293b';

    title.innerHTML = `
        <span>SQL Flow</span>
        <select id="dialect-select" style="
            background: ${selectBg};
            color: ${selectColor};
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 11px;
            cursor: pointer;
            outline: none;
        ">
            <option value="MySQL">MySQL</option>
            <option value="PostgreSQL">PostgreSQL</option>
            <option value="TransactSQL">SQL Server</option>
            <option value="Snowflake">Snowflake</option>
            <option value="BigQuery">BigQuery</option>
            <option value="Redshift">Redshift</option>
            <option value="Hive">Hive / Databricks</option>
            <option value="Athena">Athena</option>
            <option value="Trino">Trino</option>
            <option value="MariaDB">MariaDB</option>
            <option value="SQLite">SQLite</option>
        </select>
    `;
    toolbar.appendChild(title);

    // Search box
    const searchContainer = createSearchBox(callbacks);
    toolbar.appendChild(searchContainer);

    container.appendChild(toolbar);

    // Action buttons (top right)
    const actions = createActionButtons(container, callbacks, options);
    container.appendChild(actions);

    // Set initial dialect value
    const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement;
    if (dialectSelect) {
        dialectSelect.value = options.currentDialect;
        dialectSelect.addEventListener('change', (e) => {
            callbacks.onDialectChange((e.target as HTMLSelectElement).value as SqlDialect);
        });
    }

    // Listen for theme change events
    document.addEventListener('theme-change', ((e: CustomEvent) => {
        const dark = e.detail.dark;
        updateToolbarTheme(dark, toolbar, actions, searchContainer);
    }) as EventListener);

    return { toolbar, actions, searchContainer };
}

function createSearchBox(callbacks: ToolbarCallbacks): HTMLElement {
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 4px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const searchIcon = document.createElement('span');
    searchIcon.textContent = '🔍';
    searchIcon.style.fontSize = '12px';
    searchContainer.appendChild(searchIcon);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search nodes... (Ctrl+F)';
    searchInput.style.cssText = `
        background: transparent;
        border: none;
        color: #f1f5f9;
        font-size: 12px;
        width: 140px;
        outline: none;
    `;
    searchInput.id = 'search-input';
    searchContainer.appendChild(searchInput);

    // Search navigation buttons
    const searchNav = document.createElement('div');
    searchNav.style.cssText = `display: flex; gap: 4px;`;

    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '↑';
    prevBtn.style.cssText = `
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 2px 6px;
        font-size: 12px;
    `;
    prevBtn.addEventListener('click', callbacks.onPrevSearchResult);
    searchNav.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '↓';
    nextBtn.style.cssText = prevBtn.style.cssText;
    nextBtn.addEventListener('click', callbacks.onNextSearchResult);
    searchNav.appendChild(nextBtn);

    searchContainer.appendChild(searchNav);

    // Notify callback when search input is ready
    callbacks.onSearchBoxReady(searchInput);

    return searchContainer;
}

function createActionButtons(
    container: HTMLElement,
    callbacks: ToolbarCallbacks,
    options: {
        isPinnedView: boolean;
        pinId: string | null;
        viewLocation: string;
        persistedPinnedTabs: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>;
    }
): HTMLElement {
    const actions = document.createElement('div');
    actions.id = 'sql-crack-actions';
    actions.style.cssText = `
        position: absolute;
        top: 16px;
        right: 16px;
        display: flex;
        gap: 8px;
        z-index: 100;
    `;

    // Zoom controls
    actions.appendChild(createZoomGroup(callbacks));

    // Export buttons
    actions.appendChild(createExportGroup(callbacks));

    // Feature buttons
    actions.appendChild(createFeatureGroup(callbacks, options));

    return actions;
}

function createZoomGroup(callbacks: ToolbarCallbacks): HTMLElement {
    const zoomGroup = document.createElement('div');
    zoomGroup.style.cssText = `
        display: flex;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        overflow: hidden;
    `;

    const zoomOutBtn = createButton('−', callbacks.onZoomOut);
    zoomGroup.appendChild(zoomOutBtn);

    const fitBtn = createButton('⊡', callbacks.onResetView);
    fitBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    fitBtn.style.borderRight = '1px solid rgba(148, 163, 184, 0.2)';
    zoomGroup.appendChild(fitBtn);

    const zoomInBtn = createButton('+', callbacks.onZoomIn);
    zoomGroup.appendChild(zoomInBtn);

    return zoomGroup;
}

function createExportGroup(callbacks: ToolbarCallbacks): HTMLElement {
    const exportGroup = document.createElement('div');
    exportGroup.style.cssText = `
        display: flex;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        overflow: hidden;
    `;

    const copyBtn = createButton('📋', () => {
        callbacks.onCopyToClipboard();
        copyBtn.innerHTML = '✓';
        setTimeout(() => copyBtn.innerHTML = '📋', 1500);
    });
    copyBtn.title = 'Copy to clipboard';
    exportGroup.appendChild(copyBtn);

    const pngBtn = createButton('PNG', callbacks.onExportPng);
    pngBtn.title = 'Export as PNG';
    pngBtn.style.fontSize = '11px';
    pngBtn.style.fontWeight = '600';
    pngBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    exportGroup.appendChild(pngBtn);

    const svgBtn = createButton('SVG', callbacks.onExportSvg);
    svgBtn.title = 'Export as SVG';
    svgBtn.style.fontSize = '11px';
    svgBtn.style.fontWeight = '600';
    svgBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    exportGroup.appendChild(svgBtn);

    const mermaidBtn = createButton('MMD', callbacks.onExportMermaid);
    mermaidBtn.title = 'Export as Mermaid flowchart';
    mermaidBtn.style.fontSize = '11px';
    mermaidBtn.style.fontWeight = '600';
    mermaidBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    exportGroup.appendChild(mermaidBtn);

    return exportGroup;
}

function createFeatureGroup(
    callbacks: ToolbarCallbacks,
    options: {
        isPinnedView: boolean;
        pinId: string | null;
        viewLocation: string;
        persistedPinnedTabs: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>;
    }
): HTMLElement {
    const featureGroup = document.createElement('div');
    featureGroup.style.cssText = `
        display: flex;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        overflow: hidden;
    `;

    // Refresh button
    const refreshBtn = createButton('↻', callbacks.onRefresh);
    refreshBtn.id = 'refresh-btn';
    refreshBtn.title = 'Refresh visualization';
    refreshBtn.style.fontSize = '16px';
    featureGroup.appendChild(refreshBtn);

    // Pin/View location buttons for non-pinned views
    if (!options.isPinnedView) {
        // Pin button
        const pinBtn = createButton('📌', () => {
            const { sql, name } = callbacks.getCurrentQuerySql();
            callbacks.onPinVisualization(sql, 'MySQL' as SqlDialect, name);
        });
        pinBtn.title = 'Pin visualization as new tab';
        pinBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
        featureGroup.appendChild(pinBtn);

        // View location button with dropdown
        const viewLocBtn = createViewLocationButton(callbacks, options.viewLocation);
        featureGroup.appendChild(viewLocBtn);

        // Pinned tabs button
        if (options.persistedPinnedTabs.length > 0) {
            const pinsBtn = createPinnedTabsButton(callbacks, options.persistedPinnedTabs);
            featureGroup.appendChild(pinsBtn);
        }
    } else {
        // Pinned indicator with unpin button
        const pinnedContainer = document.createElement('div');
        pinnedContainer.style.cssText = `
            display: flex;
            align-items: center;
            border-left: 1px solid rgba(148, 163, 184, 0.2);
        `;

        const pinnedIndicator = document.createElement('span');
        pinnedIndicator.innerHTML = '📌 Pinned';
        pinnedIndicator.style.cssText = `
            color: #94a3b8;
            font-size: 11px;
            padding: 4px 8px;
        `;
        pinnedContainer.appendChild(pinnedIndicator);

        // Add unpin button
        if (options.pinId) {
            const unpinBtn = createButton('×', () => {
                callbacks.onUnpinTab(options.pinId!);
            });
            unpinBtn.title = 'Unpin and close this tab';
            unpinBtn.style.cssText = `
                background: transparent;
                border: none;
                color: #94a3b8;
                padding: 4px 8px;
                cursor: pointer;
                font-size: 16px;
                transition: color 0.2s;
            `;
            unpinBtn.addEventListener('mouseenter', () => unpinBtn.style.color = '#ef4444');
            unpinBtn.addEventListener('mouseleave', () => unpinBtn.style.color = '#94a3b8');
            pinnedContainer.appendChild(unpinBtn);
        }

        featureGroup.appendChild(pinnedContainer);
    }

    // Legend button
    const legendBtn = createButton('🎨', callbacks.onToggleLegend);
    legendBtn.title = 'Show color legend (L)';
    legendBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    featureGroup.appendChild(legendBtn);

    // Focus Mode button
    let focusModeActive = false;
    const focusBtn = createButton('👁', () => {
        focusModeActive = !focusModeActive;
        callbacks.onToggleFocusMode(focusModeActive);
        focusBtn.style.background = focusModeActive ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
    });
    focusBtn.title = 'Focus mode - highlight connected nodes';
    focusBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    featureGroup.appendChild(focusBtn);

    // Focus Mode Direction selector
    const focusModeSelector = createFocusModeSelector(callbacks);
    featureGroup.appendChild(focusModeSelector);

    // SQL Preview button
    const sqlBtn = createButton('{ }', callbacks.onToggleSqlPreview);
    sqlBtn.title = 'Show formatted SQL (S)';
    sqlBtn.style.fontSize = '11px';
    sqlBtn.style.fontWeight = '700';
    sqlBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    featureGroup.appendChild(sqlBtn);

    // Column Flow toggle button
    let columnFlowActive = false;
    const columnFlowBtn = createButton('📊', () => {
        columnFlowActive = !columnFlowActive;
        callbacks.onToggleColumnFlows(columnFlowActive);
        columnFlowBtn.style.background = columnFlowActive ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
    });
    columnFlowBtn.title = 'Toggle column flow visualization (C)';
    columnFlowBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    featureGroup.appendChild(columnFlowBtn);

    // Theme Toggle button
    const themeBtn = createButton(callbacks.isDarkTheme() ? '◐' : '◑', () => {
        callbacks.onToggleTheme();
        themeBtn.innerHTML = callbacks.isDarkTheme() ? '◐' : '◑';
    });
    themeBtn.title = 'Toggle dark/light theme (T)';
    themeBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    featureGroup.appendChild(themeBtn);

    // Layout Toggle button
    const layoutBtn = createButton('📐', callbacks.onToggleLayout);
    layoutBtn.title = 'Toggle layout algorithm (H)';
    layoutBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    featureGroup.appendChild(layoutBtn);

    // Fullscreen button
    const fullscreenBtn = createButton('⛶', () => {
        callbacks.onToggleFullscreen();
        setTimeout(() => {
            fullscreenBtn.style.background = callbacks.isFullscreen() ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
        }, 50);
    });
    fullscreenBtn.title = 'Toggle fullscreen (F)';
    fullscreenBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    featureGroup.appendChild(fullscreenBtn);

    document.addEventListener('fullscreenchange', () => {
        fullscreenBtn.style.background = callbacks.isFullscreen() ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
    });

    // Help button
    const helpBtn = createButton('?', () => {
        showKeyboardShortcutsHelp(callbacks.getKeyboardShortcuts());
    });
    helpBtn.title = 'Keyboard shortcuts';
    helpBtn.style.fontWeight = '700';
    helpBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    featureGroup.appendChild(helpBtn);

    return featureGroup;
}

function createButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.innerHTML = label;
    btn.style.cssText = btnStyle;
    btn.addEventListener('click', onClick);
    btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(148, 163, 184, 0.1)');
    btn.addEventListener('mouseleave', () => {
        if (!btn.style.background.includes('102, 241')) {
            btn.style.background = 'transparent';
        }
    });
    return btn;
}

function createFocusModeSelector(callbacks: ToolbarCallbacks): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = `position: relative; display: flex; align-items: center;`;

    const btn = document.createElement('button');
    btn.id = 'focus-mode-btn';
    btn.innerHTML = '⇄';
    btn.title = 'Focus Mode Direction (U/D/A)';
    btn.style.cssText = btnStyle + 'border-left: 1px solid rgba(148, 163, 184, 0.2);';

    const dropdown = document.createElement('div');
    dropdown.style.cssText = `
        display: none;
        position: absolute;
        top: 100%;
        right: 0;
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 8px 0;
        min-width: 180px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    const modes: Array<{ id: FocusMode; label: string; icon: string; shortcut: string }> = [
        { id: 'all', label: 'All Connected', icon: '⇄', shortcut: 'A' },
        { id: 'upstream', label: 'Upstream Only', icon: '↑', shortcut: 'U' },
        { id: 'downstream', label: 'Downstream Only', icon: '↓', shortcut: 'D' }
    ];

    const header = document.createElement('div');
    header.textContent = 'Focus Direction';
    header.style.cssText = `
        padding: 4px 12px 8px;
        font-size: 10px;
        text-transform: uppercase;
        color: #64748b;
        letter-spacing: 0.5px;
    `;
    dropdown.appendChild(header);

    modes.forEach(mode => {
        const item = document.createElement('div');
        const isActive = callbacks.getFocusMode() === mode.id;
        item.dataset.mode = mode.id;
        item.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            color: ${isActive ? '#818cf8' : '#e2e8f0'};
            background: ${isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent'};
            transition: background 0.15s;
        `;

        item.innerHTML = `
            <span style="font-size: 14px;">${mode.icon}</span>
            <div style="flex: 1;">
                <div style="font-size: 12px; font-weight: 500;">${mode.label}</div>
            </div>
            <kbd style="
                background: rgba(99, 102, 241, 0.2);
                border-radius: 3px;
                padding: 2px 6px;
                font-size: 10px;
                color: #a5b4fc;
            ">${mode.shortcut}</kbd>
            ${isActive ? '<span style="color: #818cf8;">✓</span>' : ''}
        `;

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            callbacks.onFocusModeChange(mode.id);
            dropdown.style.display = 'none';
            btn.innerHTML = mode.icon;
            updateFocusModeDropdown(dropdown, mode.id);
        });

        item.addEventListener('mouseenter', () => {
            if (callbacks.getFocusMode() !== mode.id) {
                item.style.background = 'rgba(148, 163, 184, 0.1)';
            }
        });
        item.addEventListener('mouseleave', () => {
            if (callbacks.getFocusMode() !== mode.id) {
                item.style.background = 'transparent';
            }
        });

        dropdown.appendChild(item);
    });

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(148, 163, 184, 0.1)');
    btn.addEventListener('mouseleave', () => {
        if (dropdown.style.display !== 'block') {
            btn.style.background = 'transparent';
        }
    });

    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
    });

    container.appendChild(btn);
    container.appendChild(dropdown);
    return container;
}

function updateFocusModeDropdown(dropdown: HTMLElement, activeMode: FocusMode): void {
    dropdown.querySelectorAll('[data-mode]').forEach(item => {
        const mode = item.getAttribute('data-mode') as FocusMode;
        const isActive = mode === activeMode;
        (item as HTMLElement).style.color = isActive ? '#818cf8' : '#e2e8f0';
        (item as HTMLElement).style.background = isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent';

        // Update checkmark
        const existingCheck = item.querySelector('span:last-child');
        if (existingCheck && existingCheck.textContent === '✓') {
            existingCheck.remove();
        }
        if (isActive) {
            const check = document.createElement('span');
            check.style.color = '#818cf8';
            check.textContent = '✓';
            item.appendChild(check);
        }
    });
}

function createViewLocationButton(callbacks: ToolbarCallbacks, currentLocation: string): HTMLElement {
    const viewLocBtn = document.createElement('button');
    viewLocBtn.innerHTML = '⊞';
    viewLocBtn.title = 'Change view location';
    viewLocBtn.style.cssText = btnStyle + 'border-left: 1px solid rgba(148, 163, 184, 0.2); position: relative;';

    const dropdown = createViewLocationDropdown(callbacks, currentLocation);
    viewLocBtn.appendChild(dropdown);

    viewLocBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
    });

    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
    });

    viewLocBtn.addEventListener('mouseenter', () => viewLocBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    viewLocBtn.addEventListener('mouseleave', () => {
        if (dropdown.style.display !== 'block') {
            viewLocBtn.style.background = 'transparent';
        }
    });

    return viewLocBtn;
}

function createViewLocationDropdown(callbacks: ToolbarCallbacks, currentLocation: string): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.style.cssText = `
        display: none;
        position: absolute;
        top: 100%;
        right: 0;
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 8px 0;
        min-width: 180px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    const locations = [
        { id: 'beside', label: 'Side by Side', icon: '⫝', desc: 'Next to SQL file' },
        { id: 'tab', label: 'New Tab', icon: '⊟', desc: 'As editor tab' },
        { id: 'secondary-sidebar', label: 'Secondary Sidebar', icon: '⫿', desc: 'Right sidebar' }
    ];

    const header = document.createElement('div');
    header.textContent = 'View Location';
    header.style.cssText = `
        padding: 4px 12px 8px;
        font-size: 10px;
        text-transform: uppercase;
        color: #64748b;
        letter-spacing: 0.5px;
    `;
    dropdown.appendChild(header);

    locations.forEach(loc => {
        const item = document.createElement('div');
        const isActive = currentLocation === loc.id;
        item.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            color: ${isActive ? '#818cf8' : '#e2e8f0'};
            background: ${isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent'};
            transition: background 0.15s;
        `;

        item.innerHTML = `
            <span style="font-size: 14px;">${loc.icon}</span>
            <div>
                <div style="font-size: 12px; font-weight: 500;">${loc.label}</div>
                <div style="font-size: 10px; color: #64748b;">${loc.desc}</div>
            </div>
            ${isActive ? '<span style="margin-left: auto; color: #818cf8;">✓</span>' : ''}
        `;

        item.addEventListener('mouseenter', () => {
            if (!isActive) {item.style.background = 'rgba(148, 163, 184, 0.1)';}
        });
        item.addEventListener('mouseleave', () => {
            if (!isActive) {item.style.background = 'transparent';}
        });

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            callbacks.onChangeViewLocation(loc.id);
            dropdown.style.display = 'none';
        });

        dropdown.appendChild(item);
    });

    return dropdown;
}

function createPinnedTabsButton(
    callbacks: ToolbarCallbacks,
    pins: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>
): HTMLElement {
    const pinsBtn = document.createElement('button');
    pinsBtn.innerHTML = '📋';
    pinsBtn.title = `Open pinned tabs (${pins.length})`;
    pinsBtn.style.cssText = btnStyle + 'border-left: 1px solid rgba(148, 163, 184, 0.2); position: relative;';

    const dropdown = createPinnedTabsDropdown(callbacks, pins);
    pinsBtn.appendChild(dropdown);

    pinsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
    });

    pinsBtn.addEventListener('mouseenter', () => pinsBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    pinsBtn.addEventListener('mouseleave', () => {
        if (dropdown.style.display !== 'block') {
            pinsBtn.style.background = 'transparent';
        }
    });

    return pinsBtn;
}

function createPinnedTabsDropdown(
    callbacks: ToolbarCallbacks,
    pins: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>
): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.style.cssText = `
        display: none;
        position: absolute;
        top: 100%;
        right: 0;
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 8px 0;
        min-width: 220px;
        max-height: 300px;
        overflow-y: auto;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    const header = document.createElement('div');
    header.textContent = 'Pinned Visualizations';
    header.style.cssText = `
        padding: 4px 12px 8px;
        font-size: 10px;
        text-transform: uppercase;
        color: #64748b;
        letter-spacing: 0.5px;
    `;
    dropdown.appendChild(header);

    pins.forEach(pin => {
        const item = document.createElement('div');
        item.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            color: #e2e8f0;
            transition: background 0.15s;
        `;

        const date = new Date(pin.timestamp);
        const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        item.innerHTML = `
            <span style="font-size: 12px;">📌</span>
            <div style="flex: 1; overflow: hidden;">
                <div style="font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pin.name}</div>
                <div style="font-size: 10px; color: #64748b;">${pin.dialect} • ${timeStr}</div>
            </div>
        `;

        const deleteBtn = document.createElement('span');
        deleteBtn.innerHTML = '×';
        deleteBtn.style.cssText = `font-size: 16px; color: #64748b; padding: 0 4px; cursor: pointer;`;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            callbacks.onUnpinTab(pin.id);
            item.remove();
        });
        deleteBtn.addEventListener('mouseenter', () => deleteBtn.style.color = '#ef4444');
        deleteBtn.addEventListener('mouseleave', () => deleteBtn.style.color = '#64748b');
        item.appendChild(deleteBtn);

        item.addEventListener('mouseenter', () => item.style.background = 'rgba(148, 163, 184, 0.1)');
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            callbacks.onOpenPinnedTab(pin.id);
            dropdown.style.display = 'none';
        });

        dropdown.appendChild(item);
    });

    return dropdown;
}

export function showKeyboardShortcutsHelp(shortcuts: Array<{ key: string; description: string }>): void {
    const overlay = document.createElement('div');
    overlay.id = 'shortcuts-modal';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        padding: 24px;
        min-width: 320px;
        max-width: 400px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="margin: 0; color: #f1f5f9; font-size: 16px;">Keyboard Shortcuts</h3>
            <button id="close-shortcuts" style="
                background: none;
                border: none;
                color: #94a3b8;
                cursor: pointer;
                font-size: 20px;
                padding: 4px;
            ">&times;</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
            ${shortcuts.map(s => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
                    <span style="color: #94a3b8; font-size: 13px;">${s.description}</span>
                    <kbd style="
                        background: rgba(99, 102, 241, 0.2);
                        border: 1px solid rgba(99, 102, 241, 0.3);
                        border-radius: 4px;
                        padding: 4px 8px;
                        color: #a5b4fc;
                        font-size: 11px;
                        font-family: monospace;
                    ">${s.key}</kbd>
                </div>
            `).join('')}
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {closeModal();}
    });
    modal.querySelector('#close-shortcuts')?.addEventListener('click', closeModal);

    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

export function updateToolbarTheme(
    dark: boolean,
    toolbar: HTMLElement,
    actions: HTMLElement,
    searchContainer: HTMLElement
): void {
    const bgColor = dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const textColor = dark ? '#f1f5f9' : '#1e293b';
    const borderColor = dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';

    toolbar.querySelectorAll('div').forEach(el => {
        if (el.style.background?.includes('rgba(15, 23, 42') || el.style.background?.includes('rgba(255, 255, 255')) {
            el.style.background = bgColor;
            el.style.borderColor = borderColor;
        }
    });

    const titleSpan = toolbar.querySelector('span');
    if (titleSpan) {titleSpan.style.color = textColor;}

    // Update dialect select colors
    const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement | null;
    if (dialectSelect) {
        dialectSelect.style.background = dark ? '#1e293b' : '#f1f5f9';
        dialectSelect.style.color = textColor;
    }

    // Update search input colors
    const searchInput = searchContainer.querySelector('input');
    if (searchInput) {
        searchInput.style.color = textColor;
    }

    searchContainer.style.background = bgColor;
    searchContainer.style.borderColor = borderColor;

    actions.querySelectorAll('div').forEach(el => {
        if (el.style.background?.includes('rgba(15, 23, 42') || el.style.background?.includes('rgba(255, 255, 255')) {
            el.style.background = bgColor;
            el.style.borderColor = borderColor;
        }
    });

    actions.querySelectorAll('button').forEach(btn => {
        btn.style.color = textColor;
    });
}

export function markRefreshButtonStale(): void {
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.style.background = 'rgba(234, 179, 8, 0.3)';
        refreshBtn.title = 'Query changed - click to refresh';
    }
}

export function clearRefreshButtonStale(): void {
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.style.background = 'transparent';
        refreshBtn.title = 'Refresh visualization';
    }
}
