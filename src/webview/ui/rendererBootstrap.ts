import { UI_COLORS } from '../constants';
import { MONO_FONT_STACK } from '../../shared/themeTokens';
import { ICONS, Z_INDEX } from '../../shared';
import { COLUMN_LINEAGE_BANNER_TEXT } from '../columnLineageUx';

export interface RendererBootstrapOptions {
    container: HTMLElement;
    existingSpinnerStyleElement: HTMLStyleElement | null;
    onToggleColumnFlows: (show?: boolean) => void;
    onSetupMinimapDrag: (minimapContainer: HTMLDivElement) => void;
}

export interface RendererBootstrapResult {
    detailsPanel: HTMLDivElement;
    breadcrumbPanel: HTMLDivElement;
    columnLineageBanner: HTMLDivElement;
    statsPanel: HTMLDivElement;
    hintsPanel: HTMLDivElement;
    sqlPreviewPanel: HTMLDivElement;
    tooltipElement: HTMLDivElement;
    contextMenuElement: HTMLDivElement;
    loadingOverlay: HTMLDivElement;
    spinnerStyleElement: HTMLStyleElement;
}

export function createRendererBootstrap(options: RendererBootstrapOptions): RendererBootstrapResult {
    const { container, existingSpinnerStyleElement, onToggleColumnFlows, onSetupMinimapDrag } = options;

    const detailsPanel = document.createElement('div');
    detailsPanel.className = 'details-panel';
    detailsPanel.style.cssText = `
        position: absolute;
        right: 12px;
        top: 50%;
        width: 260px;
        max-height: 50vh;
        background: ${UI_COLORS.backgroundPanelSolid};
        border: 1px solid ${UI_COLORS.border};
        border-radius: 8px;
        padding: 12px;
        box-sizing: border-box;
        overflow-y: auto;
        transform: translate(calc(100% + 12px), -50%);
        transition: transform 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: ${Z_INDEX.panelTop};
        box-shadow: ${UI_COLORS.shadowMedium};
    `;
    container.appendChild(detailsPanel);

    const breadcrumbPanel = document.createElement('div');
    breadcrumbPanel.className = 'breadcrumb-panel';
    breadcrumbPanel.style.cssText = `
        position: absolute;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: ${UI_COLORS.backgroundPanel};
        border: 1px solid ${UI_COLORS.border};
        border-radius: 8px;
        padding: 8px 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        color: ${UI_COLORS.textSubtle};
        z-index: ${Z_INDEX.panel};
        display: none;
        max-width: 80%;
        overflow-x: auto;
        white-space: nowrap;
    `;
    container.appendChild(breadcrumbPanel);

    const columnLineageBanner = document.createElement('div');
    columnLineageBanner.id = 'column-lineage-banner';
    columnLineageBanner.style.cssText = `
        position: absolute;
        top: 62px;
        left: 16px;
        right: auto;
        z-index: ${Z_INDEX.floatingPanel};
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: min(70vw, 520px);
        pointer-events: none;
    `;
    columnLineageBanner.innerHTML = `
        <span style="pointer-events: none; display: inline-flex; align-items: center; gap: 6px;">
            <span style="display: inline-flex; width: 14px; height: 14px;">${ICONS.link}</span>
            <span>${COLUMN_LINEAGE_BANNER_TEXT}</span>
        </span>
        <button id="column-lineage-banner-close" style="
            border: none;
            background: transparent;
            cursor: pointer;
            font-size: 14px;
            line-height: 1;
            padding: 0 4px;
            pointer-events: auto;
        " aria-label="Close column lineage banner">×</button>
    `;
    container.appendChild(columnLineageBanner);
    const bannerClose = columnLineageBanner.querySelector('#column-lineage-banner-close');
    bannerClose?.addEventListener('click', () => onToggleColumnFlows(false));

    const statsPanel = document.createElement('div');
    statsPanel.className = 'stats-panel';
    statsPanel.style.cssText = `
        position: absolute;
        left: 16px;
        bottom: 16px;
        background: ${UI_COLORS.backgroundPanel};
        border: 1px solid ${UI_COLORS.border};
        border-radius: 8px;
        width: 300px;
        padding: 12px 16px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: ${UI_COLORS.textMuted};
        z-index: ${Z_INDEX.toolbar};
    `;
    container.appendChild(statsPanel);

    const hintsPanel = document.createElement('div');
    hintsPanel.className = 'hints-panel';
    hintsPanel.style.cssText = `
        position: absolute;
        right: 16px;
        bottom: 16px;
        background: ${UI_COLORS.backgroundPanel};
        border: 1px solid ${UI_COLORS.border};
        border-radius: 8px;
        width: 350px;
        padding: 12px 16px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: ${UI_COLORS.textMuted};
        z-index: ${Z_INDEX.toolbar};
        max-height: 200px;
        overflow-y: auto;
        opacity: 0;
        visibility: hidden;
        transform: translateY(8px);
        transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
    `;
    container.appendChild(hintsPanel);

    const sqlPreviewPanel = document.createElement('div');
    sqlPreviewPanel.className = 'sql-preview-panel';
    sqlPreviewPanel.style.cssText = `
        position: absolute;
        left: 0;
        bottom: 0;
        width: 100%;
        max-height: 200px;
        background: ${UI_COLORS.backgroundPanelSolid};
        border-top: 1px solid ${UI_COLORS.border};
        padding: 12px 16px;
        box-sizing: border-box;
        font-family: ${MONO_FONT_STACK};
        font-size: 12px;
        color: ${UI_COLORS.textBright};
        z-index: ${Z_INDEX.panel};
        opacity: 0;
        visibility: hidden;
        transform: translateY(16px);
        transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
        overflow-y: auto;
    `;
    container.appendChild(sqlPreviewPanel);

    const minimapContainer = document.createElement('div');
    minimapContainer.id = 'minimap-container';
    minimapContainer.style.cssText = `
        position: absolute;
        right: 16px;
        top: 50%;
        transform: translateY(-50%);
        width: 150px;
        height: 100px;
        background: ${UI_COLORS.backgroundPanel};
        border: 1px solid ${UI_COLORS.border};
        border-radius: 8px;
        overflow: hidden;
        z-index: ${Z_INDEX.toolbar};
        display: none;
    `;

    const minimapSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    minimapSvg.id = 'minimap-svg';
    minimapSvg.setAttribute('width', '100%');
    minimapSvg.setAttribute('height', '100%');
    minimapSvg.style.background = 'transparent';
    minimapContainer.appendChild(minimapSvg);

    const viewportRect = document.createElement('div');
    viewportRect.id = 'minimap-viewport';
    viewportRect.style.cssText = `
        position: absolute;
        border: 2px solid ${UI_COLORS.focusBorder};
        background: ${UI_COLORS.focusBackground};
        pointer-events: none;
    `;
    minimapContainer.appendChild(viewportRect);
    container.appendChild(minimapContainer);
    onSetupMinimapDrag(minimapContainer);

    const tooltipElement = document.createElement('div');
    tooltipElement.id = 'node-tooltip';
    tooltipElement.style.cssText = `
        position: fixed;
        background: ${UI_COLORS.backgroundPanelSolid};
        border: 1px solid ${UI_COLORS.borderMedium};
        border-radius: 8px;
        padding: 10px 14px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: ${UI_COLORS.textBright};
        z-index: ${Z_INDEX.dropdown};
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
        max-width: 300px;
        box-shadow: ${UI_COLORS.shadowLight};
    `;
    container.appendChild(tooltipElement);

    const contextMenuElement = document.createElement('div');
    contextMenuElement.id = 'node-context-menu';
    contextMenuElement.style.cssText = `
        position: fixed;
        background: ${UI_COLORS.backgroundPanelSolid};
        border: 1px solid ${UI_COLORS.borderMedium};
        border-radius: 8px;
        padding: 4px 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: ${UI_COLORS.textBright};
        z-index: ${Z_INDEX.commandBar};
        display: none;
        min-width: 180px;
        box-shadow: 0 4px 12px ${UI_COLORS.shadowDark};
    `;
    container.appendChild(contextMenuElement);

    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loading-overlay';
    loadingOverlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: ${Z_INDEX.panel};
        pointer-events: none;
    `;
    loadingOverlay.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 20px 32px;
            background: ${UI_COLORS.backgroundPanelSolid};
            border: 1px solid ${UI_COLORS.border};
            border-radius: 12px;
            box-shadow: ${UI_COLORS.shadowMedium};
        ">
            <div class="loading-spinner" style="
                width: 24px;
                height: 24px;
                border: 3px solid rgba(99, 102, 241, 0.2);
                border-top-color: #6366f1;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            "></div>
            <span style="color: ${UI_COLORS.textMuted}; font-size: 12px;">Calculating layout...</span>
        </div>
    `;
    container.appendChild(loadingOverlay);

    existingSpinnerStyleElement?.remove();
    const spinnerStyleElement = document.createElement('style');
    spinnerStyleElement.textContent = `
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(spinnerStyleElement);

    return {
        detailsPanel,
        breadcrumbPanel,
        columnLineageBanner,
        statsPanel,
        hintsPanel,
        sqlPreviewPanel,
        tooltipElement,
        contextMenuElement,
        loadingOverlay,
        spinnerStyleElement,
    };
}
