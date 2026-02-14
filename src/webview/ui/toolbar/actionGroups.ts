import { createExportDropdown } from '../exportDropdown';
import { Z_INDEX } from '../../../shared/zIndex';
import { applyOverflowMenuTheme, getOverflowPalette } from './overflowMenu';
import type { ToolbarCallbacks } from '../toolbar';

export interface ToolbarActionOptions {
    isPinnedView: boolean;
    pinId: string | null;
    viewLocation: string;
    persistedPinnedTabs: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>;
    isFirstRun: boolean;
}

interface ActionGroupsDeps {
    callbacks: ToolbarCallbacks;
    options: ToolbarActionOptions;
    documentListeners: Array<{ type: string; handler: EventListener }>;
    getListenerOptions: () => AddEventListenerOptions | undefined;
    getBtnStyle: (dark: boolean) => string;
    createFeatureGroup: (
        callbacks: ToolbarCallbacks,
        options: ToolbarActionOptions,
        documentListeners: Array<{ type: string; handler: EventListener }>
    ) => HTMLElement;
}

export function createActionButtons(deps: ActionGroupsDeps): HTMLElement {
    const {
        callbacks,
        options,
        documentListeners,
        getListenerOptions,
        getBtnStyle,
        createFeatureGroup,
    } = deps;
    const listenerOptions = getListenerOptions();

    const actions = document.createElement('div');
    actions.id = 'sql-crack-actions';
    actions.style.cssText = `
        display: flex;
        gap: 8px;
        flex-shrink: 0;
        margin-left: auto;
    `;

    actions.appendChild(createZoomGroup(callbacks, documentListeners, getListenerOptions, getBtnStyle));
    actions.appendChild(createFeatureGroup(callbacks, options, documentListeners));
    actions.appendChild(createExportGroup(callbacks, documentListeners));

    const overflowContainer = document.createElement('div');
    overflowContainer.id = 'sql-crack-overflow-container';
    overflowContainer.style.cssText = `
        position: relative;
        display: none;
        flex-shrink: 0;
    `;

    const overflowBtn = document.createElement('button');
    overflowBtn.id = 'sql-crack-overflow-btn';
    overflowBtn.innerHTML = '⋯';
    overflowBtn.title = 'More actions';
    overflowBtn.setAttribute('aria-label', 'More actions');
    overflowBtn.setAttribute('role', 'button');
    overflowBtn.style.cssText = `
        ${getBtnStyle(callbacks.isDarkTheme())}
        background: transparent;
        border: 1px solid transparent;
        border-radius: 8px;
        font-size: 18px;
        letter-spacing: 1px;
        line-height: 1;
        padding: 8px 10px;
    `;
    overflowBtn.addEventListener('mouseenter', () => {
        overflowBtn.style.background = getOverflowPalette(callbacks.isDarkTheme()).hover;
    }, listenerOptions);
    overflowBtn.addEventListener('mouseleave', () => {
        applyOverflowMenuTheme(callbacks.isDarkTheme());
    }, listenerOptions);

    const overflowDropdown = document.createElement('div');
    overflowDropdown.id = 'sql-crack-overflow-dropdown';
    overflowDropdown.style.cssText = `
        display: none;
        position: fixed;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 8px 0;
        min-width: 200px;
        z-index: ${Z_INDEX.dropdown};
        box-shadow: none;
    `;

    const rootContainer = document.getElementById('root') || document.body;
    rootContainer.appendChild(overflowDropdown);

    const positionDropdown = () => {
        const rect = overflowBtn.getBoundingClientRect();
        overflowDropdown.style.top = `${rect.bottom + 4}px`;
        overflowDropdown.style.right = `${window.innerWidth - rect.right}px`;
    };

    overflowBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = overflowDropdown.style.display === 'none';
        overflowDropdown.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            positionDropdown();
        }
    }, listenerOptions);

    const overflowClickHandler = () => {
        overflowDropdown.style.display = 'none';
    };
    document.addEventListener('click', overflowClickHandler, listenerOptions);
    documentListeners.push({ type: 'click', handler: overflowClickHandler });

    overflowContainer.appendChild(overflowBtn);
    actions.appendChild(overflowContainer);

    return actions;
}

function createZoomGroup(
    callbacks: ToolbarCallbacks,
    documentListeners: Array<{ type: string; handler: EventListener }>,
    getListenerOptions: () => AddEventListenerOptions | undefined,
    getBtnStyle: (dark: boolean) => string
): HTMLElement {
    const isDark = callbacks.isDarkTheme();
    const groupBackground = isDark ? 'rgba(17, 17, 17, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const borderColor = isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';
    const mutedText = isDark ? '#94a3b8' : '#64748b';
    const zoomGroup = document.createElement('div');
    zoomGroup.style.cssText = `
        display: flex;
        flex-shrink: 0;
        align-items: center;
        background: ${groupBackground};
        border: 1px solid ${borderColor};
        border-radius: 8px;
        overflow: hidden;
    `;

    const undoBtn = createButton('↶', callbacks.onUndo, getBtnStyle, getListenerOptions, 'Undo layout change');
    undoBtn.id = 'sql-crack-undo-btn';
    undoBtn.title = 'Undo (Ctrl/Cmd+Z)';
    undoBtn.style.borderRight = `1px solid ${borderColor}`;
    zoomGroup.appendChild(undoBtn);

    const redoBtn = createButton('↷', callbacks.onRedo, getBtnStyle, getListenerOptions, 'Redo layout change');
    redoBtn.id = 'sql-crack-redo-btn';
    redoBtn.title = 'Redo (Ctrl/Cmd+Shift+Z)';
    redoBtn.style.borderRight = `1px solid ${borderColor}`;
    zoomGroup.appendChild(redoBtn);

    const zoomOutBtn = createButton('−', callbacks.onZoomOut, getBtnStyle, getListenerOptions, 'Zoom out');
    zoomOutBtn.title = 'Zoom out (-)';
    zoomGroup.appendChild(zoomOutBtn);

    const zoomLevel = document.createElement('span');
    zoomLevel.id = 'zoom-level';
    zoomLevel.style.cssText = `
        color: ${mutedText};
        font-size: 10px;
        min-width: 36px;
        text-align: center;
        padding: 0 2px;
        border-left: 1px solid ${borderColor};
        border-right: 1px solid ${borderColor};
    `;
    zoomLevel.textContent = `${callbacks.getZoomLevel()}%`;
    zoomLevel.title = 'Current zoom level';
    zoomGroup.appendChild(zoomLevel);

    const zoomInBtn = createButton('+', callbacks.onZoomIn, getBtnStyle, getListenerOptions, 'Zoom in');
    zoomInBtn.title = 'Zoom in (+)';
    zoomGroup.appendChild(zoomInBtn);

    const fitBtn = createButton('⊡', callbacks.onResetView, getBtnStyle, getListenerOptions, 'Fit to view');
    fitBtn.title = 'Fit to view (R)';
    fitBtn.style.borderLeft = `1px solid ${borderColor}`;
    zoomGroup.appendChild(fitBtn);

    const updateUndoRedo = (canUndo: boolean, canRedo: boolean) => {
        undoBtn.disabled = !canUndo;
        redoBtn.disabled = !canRedo;
        undoBtn.style.opacity = canUndo ? '1' : '0.45';
        redoBtn.style.opacity = canRedo ? '1' : '0.45';
        undoBtn.style.cursor = canUndo ? 'pointer' : 'default';
        redoBtn.style.cursor = canRedo ? 'pointer' : 'default';
    };

    updateUndoRedo(callbacks.canUndo(), callbacks.canRedo());

    const undoRedoStateHandler = ((event: CustomEvent) => {
        const detail = event.detail || {};
        updateUndoRedo(Boolean(detail.canUndo), Boolean(detail.canRedo));
    }) as EventListener;
    document.addEventListener('undo-redo-state', undoRedoStateHandler);
    documentListeners.push({ type: 'undo-redo-state', handler: undoRedoStateHandler });

    return zoomGroup;
}

function createExportGroup(
    callbacks: ToolbarCallbacks,
    documentListeners: Array<{ type: string; handler: EventListener }>
): HTMLElement {
    const isDark = callbacks.isDarkTheme();
    const exportGroup = document.createElement('div');
    exportGroup.style.cssText = `
        display: flex;
        flex-shrink: 0;
        background: ${isDark ? 'rgba(17, 17, 17, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
        border: 1px solid ${isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'};
        border-radius: 8px;
        overflow: visible;
    `;

    const exportDropdown = createExportDropdown({
        onExportPng: callbacks.onExportPng,
        onExportSvg: callbacks.onExportSvg,
        onExportMermaid: callbacks.onExportMermaid,
        onCopyToClipboard: callbacks.onCopyToClipboard,
        onCopyMermaidToClipboard: callbacks.onCopyMermaidToClipboard,
        isDarkTheme: callbacks.isDarkTheme,
    }, documentListeners);

    exportGroup.appendChild(exportDropdown);
    return exportGroup;
}

function createButton(
    label: string,
    onClick: () => void,
    getBtnStyle: (dark: boolean) => string,
    getListenerOptions: () => AddEventListenerOptions | undefined,
    ariaLabel?: string,
    isDark = true
): HTMLButtonElement {
    const listenerOptions = getListenerOptions();
    const btn = document.createElement('button');
    btn.innerHTML = label;
    btn.style.cssText = getBtnStyle(isDark);
    btn.addEventListener('click', onClick, listenerOptions);
    btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(148, 163, 184, 0.1)';
    }, listenerOptions);
    btn.addEventListener('mouseleave', () => {
        if (!btn.style.background.includes('102, 241')) {
            btn.style.background = 'transparent';
        }
    }, listenerOptions);

    if (ariaLabel) {
        btn.setAttribute('aria-label', ariaLabel);
    }
    btn.setAttribute('role', 'button');
    return btn;
}
