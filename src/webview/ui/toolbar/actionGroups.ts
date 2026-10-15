import { getHighContrastTextColor } from '../../constants';
import { createExportDropdown } from '../exportDropdown';
import { Z_INDEX } from '../../../shared/zIndex';
import { applyOverflowMenuTheme, getOverflowPalette } from './overflowMenu';
import type { ToolbarCallbacks } from '../toolbar';
import { createToolbarButton } from './buttonFactory';
import { attachMenuKeyboardNavigation } from '../menuKeyboard';

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

export interface ActionButtonsResult {
    actions: HTMLElement;
    overflowContainer: HTMLElement;
}

const COMPARE_DISABLED_ATTRIBUTE = 'data-compare-disabled';

/**
 * Disable (or re-enable) toolbar controls that act on the graph hidden behind
 * the compare view. Uses aria-disabled + pointer-events so hover and clicks
 * are blocked, and restores each control's previous inline styles.
 */
export function setGraphControlsDisabledForCompare(actions: HTMLElement, disabled: boolean): void {
    const controls = Array.from(actions.querySelectorAll<HTMLElement>('button, [role="button"], select'))
        .filter(control => !control.closest('[data-compare-safe="true"]'));
    for (const control of controls) {
        if (disabled) {
            if (control.hasAttribute(COMPARE_DISABLED_ATTRIBUTE)) {
                continue;
            }
            const nativeControl = control as HTMLButtonElement | HTMLSelectElement;
            control.setAttribute(COMPARE_DISABLED_ATTRIBUTE, JSON.stringify({
                opacity: control.style.opacity,
                pointerEvents: control.style.pointerEvents,
                ariaDisabled: control.getAttribute('aria-disabled'),
                disabled: typeof nativeControl.disabled === 'boolean' ? nativeControl.disabled : null,
            }));
            control.setAttribute('aria-disabled', 'true');
            // pointer-events alone still lets a focused button fire from the keyboard.
            if (typeof nativeControl.disabled === 'boolean') {
                nativeControl.disabled = true;
            }
            control.style.opacity = '0.35';
            control.style.pointerEvents = 'none';
        } else {
            const saved = control.getAttribute(COMPARE_DISABLED_ATTRIBUTE);
            if (saved === null) {
                continue;
            }
            const previous = JSON.parse(saved) as {
                opacity: string;
                pointerEvents: string;
                ariaDisabled: string | null;
                disabled: boolean | null;
            };
            if (previous.disabled !== null) {
                (control as HTMLButtonElement | HTMLSelectElement).disabled = previous.disabled;
            }
            control.style.opacity = previous.opacity;
            control.style.pointerEvents = previous.pointerEvents;
            if (previous.ariaDisabled === null) {
                control.removeAttribute('aria-disabled');
            } else {
                control.setAttribute('aria-disabled', previous.ariaDisabled);
            }
            control.removeAttribute(COMPARE_DISABLED_ATTRIBUTE);
        }
    }
}

export function createActionButtons(deps: ActionGroupsDeps): ActionButtonsResult {
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

    // Compare mode overlays the graph below the toolbar. Controls that act on
    // the hidden graph (zoom, layout, focus, lineage, export, ...) are disabled
    // until it closes; controls marked data-compare-safe stay usable.
    const compareModeHandler = ((event: CustomEvent) => {
        setGraphControlsDisabledForCompare(actions, Boolean(event.detail?.active));
    }) as EventListener;
    document.addEventListener('compare-mode-state', compareModeHandler, listenerOptions);
    documentListeners.push({ type: 'compare-mode-state', handler: compareModeHandler });

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
    const isDark = callbacks.isDarkTheme();
    overflowBtn.style.cssText = `
        ${getBtnStyle(isDark)}
        background: ${isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.08)'};
        border: 1px solid ${isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.4)'};
        border-radius: 8px;
        font-size: 18px;
        letter-spacing: 1px;
        line-height: 1;
        padding: 8px 10px;
    `;
    overflowBtn.addEventListener('mouseenter', () => {
        const dark = callbacks.isDarkTheme();
        overflowBtn.style.background = dark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(15, 23, 42, 0.14)';
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

    attachMenuKeyboardNavigation({
        trigger: overflowBtn,
        menu: overflowDropdown,
        isOpen: () => overflowDropdown.style.display === 'block',
        close: () => { overflowDropdown.style.display = 'none'; },
        listenerOptions,
    });

    const overflowClickHandler = () => {
        overflowDropdown.style.display = 'none';
    };
    document.addEventListener('click', overflowClickHandler, listenerOptions);
    documentListeners.push({ type: 'click', handler: overflowClickHandler });

    overflowContainer.appendChild(overflowBtn);

    return { actions, overflowContainer };
}

function createZoomGroup(
    callbacks: ToolbarCallbacks,
    documentListeners: Array<{ type: string; handler: EventListener }>,
    getListenerOptions: () => AddEventListenerOptions | undefined,
    getBtnStyle: (dark: boolean) => string
): HTMLElement {
    const listenerOptions = getListenerOptions();
    const isDark = callbacks.isDarkTheme();
    const groupBackground = isDark ? 'rgba(17, 17, 17, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const borderColor = isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';
    const mutedText = getHighContrastTextColor(isDark ? '#94a3b8' : '#64748b', isDark);
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

    const undoBtn = createToolbarButton({
        label: '↶',
        onClick: callbacks.onUndo,
        getBtnStyle,
        listenerOptions,
        ariaLabel: 'Undo layout change',
    });
    undoBtn.id = 'sql-crack-undo-btn';
    undoBtn.title = 'Undo (Ctrl/Cmd+Z)';
    undoBtn.style.borderRight = `1px solid ${borderColor}`;
    zoomGroup.appendChild(undoBtn);

    const redoBtn = createToolbarButton({
        label: '↷',
        onClick: callbacks.onRedo,
        getBtnStyle,
        listenerOptions,
        ariaLabel: 'Redo layout change',
    });
    redoBtn.id = 'sql-crack-redo-btn';
    redoBtn.title = 'Redo (Ctrl/Cmd+Shift+Z)';
    redoBtn.style.borderRight = `1px solid ${borderColor}`;
    zoomGroup.appendChild(redoBtn);

    const zoomOutBtn = createToolbarButton({
        label: '−',
        onClick: callbacks.onZoomOut,
        getBtnStyle,
        listenerOptions,
        ariaLabel: 'Zoom out',
    });
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
    zoomLevel.setAttribute('aria-live', 'polite');
    zoomLevel.setAttribute('aria-atomic', 'true');
    zoomGroup.appendChild(zoomLevel);

    // The label color was fixed at creation; after a theme toggle it kept the
    // other theme's muted color (e.g. #94a3b8 on white, ~2.6:1).
    const zoomLevelThemeHandler = ((event: CustomEvent<{ dark: boolean }>) => {
        zoomLevel.style.color = getHighContrastTextColor(event.detail?.dark ? '#94a3b8' : '#64748b', event.detail?.dark === true);
    }) as EventListener;
    document.addEventListener('theme-change', zoomLevelThemeHandler, listenerOptions);
    documentListeners.push({ type: 'theme-change', handler: zoomLevelThemeHandler });

    const zoomInBtn = createToolbarButton({
        label: '+',
        onClick: callbacks.onZoomIn,
        getBtnStyle,
        listenerOptions,
        ariaLabel: 'Zoom in',
    });
    zoomInBtn.title = 'Zoom in (+)';
    zoomGroup.appendChild(zoomInBtn);

    const fitBtn = createToolbarButton({
        label: '⊡',
        onClick: callbacks.onResetView,
        getBtnStyle,
        listenerOptions,
        ariaLabel: 'Fit to view',
    });
    fitBtn.title = 'Fit to view (Esc)';
    fitBtn.style.borderLeft = `1px solid ${borderColor}`;
    zoomGroup.appendChild(fitBtn);

    const applyHistoryButtonState = (button: HTMLButtonElement, enabled: boolean) => {
        button.style.cursor = enabled ? 'pointer' : 'default';
        // While compare mode has disabled the button, record the new state so
        // closing compare restores it instead of a stale pre-compare value.
        const compareSnapshot = button.getAttribute(COMPARE_DISABLED_ATTRIBUTE);
        if (compareSnapshot !== null) {
            const saved = JSON.parse(compareSnapshot) as Record<string, unknown>;
            button.setAttribute(COMPARE_DISABLED_ATTRIBUTE, JSON.stringify({
                ...saved,
                disabled: !enabled,
                opacity: enabled ? '1' : '0.45',
            }));
            return;
        }
        button.disabled = !enabled;
        button.style.opacity = enabled ? '1' : '0.45';
    };

    const updateUndoRedo = (canUndo: boolean, canRedo: boolean) => {
        applyHistoryButtonState(undoBtn, canUndo);
        applyHistoryButtonState(redoBtn, canRedo);
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
        onOpenExportPreview: callbacks.onOpenExportPreview,
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
