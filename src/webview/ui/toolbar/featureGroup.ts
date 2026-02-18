import type { SqlDialect } from '../../sqlParser';
import type { ToolbarCallbacks } from '../toolbar';
import { ICONS } from '../../../shared/icons';
import { prefersReducedMotion } from '../motion';
import { createFocusModeSelector, createPinnedTabsButton, createViewLocationButton } from './featureMenus';
import type { ToolbarActionOptions } from './actionGroups';
import { createLayoutPicker } from '../layoutPicker';
import { createToolbarButton } from './buttonFactory';

const LINEAGE_PULSE_STYLE_ID = 'sql-crack-lineage-pulse-style';
let lineagePulseApplied = false;

interface FeatureGroupDeps {
    callbacks: ToolbarCallbacks;
    options: ToolbarActionOptions;
    documentListeners: Array<{ type: string; handler: EventListener }>;
    getListenerOptions: () => AddEventListenerOptions | undefined;
    getBtnStyle: (dark: boolean) => string;
    onHintsButtonReady: (button: HTMLButtonElement) => void;
    createHintsBadgeMarkup: (label: string) => string;
    showKeyboardShortcutsHelp: (shortcuts: Array<{ key: string; description: string }>, isDark: boolean) => void;
    applyFirstRunHelpPulse: (helpButton: HTMLButtonElement, enabled: boolean) => void;
}

export function createFeatureGroupElement(deps: FeatureGroupDeps): HTMLElement {
    const {
        callbacks,
        options,
        documentListeners,
        getListenerOptions,
        getBtnStyle,
        onHintsButtonReady,
        createHintsBadgeMarkup,
        showKeyboardShortcutsHelp,
        applyFirstRunHelpPulse,
    } = deps;
    const listenerOptions = getListenerOptions();
    const isDark = callbacks.isDarkTheme();
    const groupBackground = isDark ? 'rgba(17, 17, 17, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const borderColor = isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';
    const mutedText = isDark ? '#94a3b8' : '#64748b';
    const featureGroup = document.createElement('div');
    featureGroup.style.cssText = `
        display: flex;
        flex-shrink: 0;
        background: ${groupBackground};
        border: 1px solid ${borderColor};
        border-radius: 8px;
        overflow: hidden;
    `;

    const createButton = (
        label: string,
        onClick: () => void,
        ariaLabel?: string,
        dark = true
    ): HTMLButtonElement => createToolbarButton({
        label,
        onClick,
        getBtnStyle,
        listenerOptions,
        ariaLabel,
        isDark: dark,
    });

    const refreshBtn = createButton(ICONS.refresh, callbacks.onRefresh, 'Refresh visualization');
    refreshBtn.id = 'refresh-btn';
    refreshBtn.title = 'Refresh visualization';
    refreshBtn.dataset.overflowIcon = ICONS.refresh;
    featureGroup.appendChild(refreshBtn);

    const hintsSummaryBtn = createButton(createHintsBadgeMarkup('OK'), callbacks.onToggleHints, 'Show optimization hints');
    hintsSummaryBtn.id = 'hints-summary-btn';
    hintsSummaryBtn.title = 'Optimization hints';
    hintsSummaryBtn.style.borderLeft = `1px solid ${borderColor}`;
    hintsSummaryBtn.style.fontSize = '11px';
    hintsSummaryBtn.style.fontWeight = '700';
    hintsSummaryBtn.style.display = 'inline-flex';
    hintsSummaryBtn.style.alignItems = 'center';
    hintsSummaryBtn.style.gap = '6px';
    hintsSummaryBtn.dataset.overflowIcon = ICONS.bolt;
    featureGroup.appendChild(hintsSummaryBtn);
    onHintsButtonReady(hintsSummaryBtn);

    if (!options.isPinnedView) {
        const viewLocBtn = createViewLocationButton(callbacks, options.viewLocation, {
            documentListeners,
            getListenerOptions,
            getBtnStyle,
        });
        featureGroup.appendChild(viewLocBtn);

        const pinBtn = createButton(ICONS.pin, () => {
            const { sql, name } = callbacks.getCurrentQuerySql();
            callbacks.onPinVisualization(sql, 'MySQL' as SqlDialect, name);
        }, 'Pin visualization as new tab');
        pinBtn.title = 'Pin visualization as new tab';
        pinBtn.style.borderLeft = `1px solid ${borderColor}`;
        pinBtn.dataset.overflowIcon = ICONS.pin;
        featureGroup.appendChild(pinBtn);

        if (options.persistedPinnedTabs.length > 0) {
            const pinsBtn = createPinnedTabsButton(callbacks, options.persistedPinnedTabs, {
                documentListeners,
                getListenerOptions,
                getBtnStyle,
            });
            featureGroup.appendChild(pinsBtn);
        }
    } else {
        const pinnedContainer = document.createElement('div');
        pinnedContainer.style.cssText = `
            display: flex;
            align-items: center;
            border-left: 1px solid ${borderColor};
        `;

        const pinnedIndicator = document.createElement('span');
        pinnedIndicator.innerHTML = `<span style="display: inline-flex; width: 14px; height: 14px;">${ICONS.pin}</span><span>Pinned</span>`;
        pinnedIndicator.style.cssText = `
            color: ${mutedText};
            font-size: 11px;
            padding: 4px 8px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        `;
        pinnedContainer.appendChild(pinnedIndicator);

        if (options.pinId) {
            const unpinBtn = createButton('×', () => {
                callbacks.onUnpinTab(options.pinId!);
            });
            unpinBtn.title = 'Unpin and close this tab';
            unpinBtn.style.cssText = `
                background: transparent;
                border: none;
                color: ${mutedText};
                padding: 4px 8px;
                cursor: pointer;
                font-size: 16px;
                transition: color 0.2s;
            `;
            unpinBtn.addEventListener('mouseenter', () => {
                unpinBtn.style.color = '#ef4444';
            }, listenerOptions);
            unpinBtn.addEventListener('mouseleave', () => {
                unpinBtn.style.color = mutedText;
            }, listenerOptions);
            pinnedContainer.appendChild(unpinBtn);
        }

        featureGroup.appendChild(pinnedContainer);
    }

    const compareBtn = createButton(ICONS.compareMode, callbacks.onToggleCompareMode, 'Compare with Baseline Query');
    compareBtn.id = 'compare-mode-btn';
    const updateCompareButtonTitle = () => {
        const baselineLabel = callbacks.getCompareBaselineLabel();
        compareBtn.title = baselineLabel
            ? `Compare with Baseline Query (${baselineLabel})`
            : 'Compare with Baseline Query (Pin another query or use multi-query file)';
    };
    updateCompareButtonTitle();
    compareBtn.addEventListener('mouseenter', updateCompareButtonTitle, listenerOptions);
    compareBtn.dataset.overflowIcon = ICONS.compareMode;
    compareBtn.style.borderLeft = `1px solid ${borderColor}`;
    const setCompareButtonState = (active: boolean) => {
        const dark = callbacks.isDarkTheme();
        compareBtn.dataset.active = active ? 'true' : 'false';
        compareBtn.style.background = active ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
        compareBtn.style.color = active ? (dark ? '#a5b4fc' : '#4f46e5') : (dark ? '#f1f5f9' : '#1e293b');
    };
    setCompareButtonState(callbacks.isCompareMode());
    featureGroup.appendChild(compareBtn);

    const compareStateHandler = ((event: CustomEvent) => {
        setCompareButtonState(Boolean(event.detail?.active));
    }) as EventListener;
    document.addEventListener('compare-mode-state', compareStateHandler, listenerOptions);
    documentListeners.push({ type: 'compare-mode-state', handler: compareStateHandler });

    let focusModeActive = false;
    const focusBtn = createButton(ICONS.eye, () => {
        focusModeActive = !focusModeActive;
        callbacks.onToggleFocusMode(focusModeActive);
        focusBtn.style.background = focusModeActive ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
    }, 'Toggle focus mode');
    focusBtn.title = 'Focus mode - highlight connected nodes';
    focusBtn.style.borderLeft = `1px solid ${borderColor}`;
    focusBtn.dataset.overflowIcon = ICONS.eye;
    featureGroup.appendChild(focusBtn);

    const focusModeSelector = createFocusModeSelector(callbacks, {
        documentListeners,
        getListenerOptions,
        getBtnStyle,
    });
    featureGroup.appendChild(focusModeSelector);

    const sqlBtn = createButton('{ }', callbacks.onToggleSqlPreview, 'Show formatted SQL');
    sqlBtn.title = 'Show formatted SQL (S)';
    sqlBtn.style.fontSize = '11px';
    sqlBtn.style.fontWeight = '700';
    sqlBtn.style.borderLeft = `1px solid ${borderColor}`;
    sqlBtn.dataset.overflowIcon = '{ }';
    featureGroup.appendChild(sqlBtn);

    let columnFlowActive = false;
    const columnFlowBtn = createButton(ICONS.columnLineage, () => {
        columnFlowActive = !columnFlowActive;
        callbacks.onToggleColumnFlows(columnFlowActive);
        columnFlowBtn.style.background = columnFlowActive ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
        columnFlowBtn.style.color = columnFlowActive ? '#818cf8' : '';
        if (columnFlowActive && !lineagePulseApplied && !prefersReducedMotion()) {
            lineagePulseApplied = true;
            if (!document.getElementById(LINEAGE_PULSE_STYLE_ID)) {
                const style = document.createElement('style');
                style.id = LINEAGE_PULSE_STYLE_ID;
                style.textContent = `
                    .sql-crack-lineage-pulse {
                        animation: sql-crack-help-pulse 1.1s ease-out 2;
                    }
                `;
                document.head.appendChild(style);
            }
            columnFlowBtn.classList.add('sql-crack-lineage-pulse');
            const stop = () => columnFlowBtn.classList.remove('sql-crack-lineage-pulse');
            window.setTimeout(stop, 2400);
        }
    }, 'Toggle column lineage');
    columnFlowBtn.title = 'Toggle column lineage (C)';
    columnFlowBtn.style.borderLeft = `1px solid ${borderColor}`;
    columnFlowBtn.style.color = mutedText;
    columnFlowBtn.dataset.overflowIcon = ICONS.columnLineage;
    featureGroup.appendChild(columnFlowBtn);

    const themeBtn = createButton(callbacks.isDarkTheme() ? '◐' : '◑', () => {
        callbacks.onToggleTheme();
        themeBtn.innerHTML = callbacks.isDarkTheme() ? '◐' : '◑';
    }, 'Toggle dark or light theme');
    themeBtn.title = 'Toggle dark/light theme (T)';
    themeBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    themeBtn.dataset.overflowIcon = callbacks.isDarkTheme() ? '◐' : '◑';
    featureGroup.appendChild(themeBtn);

    const layoutPicker = createLayoutPicker({
        onLayoutChange: callbacks.onLayoutChange,
        getCurrentLayout: callbacks.getCurrentLayout,
        isDarkTheme: callbacks.isDarkTheme,
    }, documentListeners);
    featureGroup.appendChild(layoutPicker);

    const fullscreenBtn = createButton('⛶', () => {
        callbacks.onToggleFullscreen();
        setTimeout(() => {
            fullscreenBtn.style.background = callbacks.isFullscreen() ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
        }, 50);
    }, 'Toggle fullscreen');
    fullscreenBtn.title = 'Toggle fullscreen (F)';
    fullscreenBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    fullscreenBtn.dataset.overflowIcon = '⛶';
    featureGroup.appendChild(fullscreenBtn);

    const fullscreenHandler = () => {
        fullscreenBtn.style.background = callbacks.isFullscreen() ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
    };
    document.addEventListener('fullscreenchange', fullscreenHandler, listenerOptions);
    documentListeners.push({ type: 'fullscreenchange', handler: fullscreenHandler });

    const helpBtn = createButton('?', () => {
        showKeyboardShortcutsHelp(callbacks.getKeyboardShortcuts(), callbacks.isDarkTheme());
    }, 'Show keyboard shortcuts');
    helpBtn.title = 'Keyboard shortcuts';
    helpBtn.style.fontWeight = '700';
    helpBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    helpBtn.dataset.overflowIcon = '?';
    featureGroup.appendChild(helpBtn);
    applyFirstRunHelpPulse(helpBtn, options.isFirstRun);

    return featureGroup;
}
