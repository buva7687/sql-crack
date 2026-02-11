// Pinned tabs UI module - for in-panel tab management (legacy feature)

import { SqlDialect, BatchParseResult } from '../sqlParser';

export interface PinnedTab {
    id: string;
    name: string;
    sql: string;
    dialect: SqlDialect;
    result: BatchParseResult | null;
}

export interface PinnedTabsCallbacks {
    onSwitchTab: (tabId: string | null) => void;
    onUnpinTab: (tabId: string) => void;
    getCurrentSql: () => string;
    getCurrentDialect: () => SqlDialect;
    getCurrentResult: () => BatchParseResult | null;
    isDarkTheme?: () => boolean;
}

let pinnedTabs: PinnedTab[] = [];
let activeTabId: string | null = null;

export function getPinnedTabs(): PinnedTab[] {
    return pinnedTabs;
}

export function getActiveTabId(): string | null {
    return activeTabId;
}

export function setActiveTabId(tabId: string | null): void {
    activeTabId = tabId;
}

export function pinCurrentVisualization(callbacks: PinnedTabsCallbacks, fileName?: string): void {
    const sql = callbacks.getCurrentSql();
    if (!sql.trim()) {
        alert('No visualization to pin');
        return;
    }

    const tabId = 'tab-' + Date.now();
    const tabName = fileName || `Query ${pinnedTabs.length + 1}`;

    const pinnedTab: PinnedTab = {
        id: tabId,
        name: tabName.replace('.sql', ''),
        sql: sql,
        dialect: callbacks.getCurrentDialect(),
        result: callbacks.getCurrentResult()
    };

    pinnedTabs.push(pinnedTab);
    activeTabId = tabId;

    updateTabsUI(callbacks);
}

export function unpinTab(tabId: string, callbacks: PinnedTabsCallbacks): void {
    const index = pinnedTabs.findIndex(t => t.id === tabId);
    if (index === -1) {return;}

    pinnedTabs.splice(index, 1);

    if (activeTabId === tabId) {
        activeTabId = null;
        callbacks.onSwitchTab(null);
    }

    updateTabsUI(callbacks);
}

export function switchToTab(tabId: string | null, callbacks: PinnedTabsCallbacks): void {
    activeTabId = tabId;
    callbacks.onSwitchTab(tabId);
    updateTabsUI(callbacks);
}

export function findPinnedTab(tabId: string): PinnedTab | undefined {
    return pinnedTabs.find(t => t.id === tabId);
}

export function updateTabsUI(callbacks: PinnedTabsCallbacks): void {
    let tabsContainer = document.getElementById('pinned-tabs-container');

    if (!tabsContainer) {
        tabsContainer = createTabsContainer();
    }

    tabsContainer.style.display = pinnedTabs.length > 0 ? 'flex' : 'none';

    const tabsList = tabsContainer.querySelector('#tabs-list') as HTMLElement;
    if (!tabsList) {return;}

    tabsList.innerHTML = '';

    // Add "Current" tab
    const currentTab = createTabElement({
        id: 'current',
        name: 'Current',
        sql: callbacks.getCurrentSql(),
        dialect: callbacks.getCurrentDialect(),
        result: callbacks.getCurrentResult()
    }, activeTabId === null, callbacks);
    tabsList.appendChild(currentTab);

    // Add pinned tabs
    for (const tab of pinnedTabs) {
        const tabEl = createTabElement(tab, activeTabId === tab.id, callbacks);
        tabsList.appendChild(tabEl);
    }
}

function createTabsContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'pinned-tabs-container';
    container.style.cssText = `
        position: absolute;
        top: 60px;
        left: 16px;
        display: none;
        align-items: center;
        gap: 4px;
        background: rgba(17, 17, 17, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 4px;
        z-index: 100;
        max-width: calc(100% - 350px);
        overflow-x: auto;
    `;

    const tabsList = document.createElement('div');
    tabsList.id = 'tabs-list';
    tabsList.style.cssText = `display: flex; gap: 4px;`;
    container.appendChild(tabsList);

    const root = document.getElementById('root');
    if (root) {
        root.appendChild(container);
    }

    return container;
}

function createTabElement(tab: PinnedTab, isActive: boolean, callbacks: PinnedTabsCallbacks): HTMLElement {
    const tabEl = document.createElement('div');
    tabEl.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: ${isActive ? 'rgba(99, 102, 241, 0.3)' : 'transparent'};
        color: ${isActive ? (callbacks.isDarkTheme?.() !== false ? '#f1f5f9' : '#1e293b') : '#94a3b8'};
        transition: background 0.15s;
        white-space: nowrap;
    `;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = tab.name;
    nameSpan.style.maxWidth = '120px';
    nameSpan.style.overflow = 'hidden';
    nameSpan.style.textOverflow = 'ellipsis';
    tabEl.appendChild(nameSpan);

    tabEl.addEventListener('click', () => {
        switchToTab(tab.id === 'current' ? null : tab.id, callbacks);
    });

    tabEl.addEventListener('mouseenter', () => {
        if (!isActive) {tabEl.style.background = 'rgba(148, 163, 184, 0.1)';}
    });
    tabEl.addEventListener('mouseleave', () => {
        if (!isActive) {tabEl.style.background = 'transparent';}
    });

    if (tab.id !== 'current') {
        const closeBtn = document.createElement('span');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            font-size: 14px;
            font-weight: 600;
            opacity: 0.6;
            padding: 0 2px;
        `;
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            unpinTab(tab.id, callbacks);
        });
        closeBtn.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
        closeBtn.addEventListener('mouseleave', () => closeBtn.style.opacity = '0.6');
        tabEl.appendChild(closeBtn);
    }

    return tabEl;
}
