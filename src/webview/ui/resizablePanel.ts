import { getComponentUiColors } from '../constants';
import { Z_INDEX } from '../../shared/zIndex';

interface ResizablePanelOptions {
    panel: HTMLDivElement;
    side: 'left' | 'right';
    storageKey: string;
    minWidth?: number;
    maxWidthRatio?: number;
    collapsedWidth?: number;
    isDarkTheme: () => boolean;
}

const WIDTH_PREFIX = 'sql-crack.panelWidth.';
const COLLAPSED_PREFIX = 'sql-crack.panelCollapsed.';

function getStoredNumber(key: string): number | null {
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) { return null; }
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : null;
    } catch { return null; }
}

export function computeClampedPanelWidth(
    width: number,
    minWidth: number,
    maxWidthRatio: number,
    viewportWidth = window.innerWidth,
): number {
    const maxWidth = Math.max(minWidth, Math.floor(viewportWidth * maxWidthRatio));
    return Math.max(minWidth, Math.min(maxWidth, Math.round(width)));
}

export function attachResizablePanel({
    panel,
    side,
    storageKey,
    minWidth = 150,
    maxWidthRatio = 0.5,
    collapsedWidth = 24,
    isDarkTheme,
}: ResizablePanelOptions): () => void {
    const panelAbortController = new AbortController();
    const listenerOptions: AddEventListenerOptions = { signal: panelAbortController.signal };

    const widthKey = `${WIDTH_PREFIX}${storageKey}`;
    const collapsedKey = `${COLLAPSED_PREFIX}${storageKey}`;
    const defaultWidth = Number.parseInt(panel.style.width || `${panel.offsetWidth || minWidth}`, 10) || minWidth;
    const originalPadding = panel.style.padding;
    const originalOverflow = panel.style.overflow;
    const originalMinWidth = panel.style.minWidth;

    const handle = document.createElement('div');
    handle.className = 'sql-crack-resize-handle';
    handle.setAttribute('data-panel-key', storageKey);
    handle.style.cssText = `
        position: absolute;
        top: 0;
        bottom: 0;
        ${side === 'right' ? 'left: -6px;' : 'right: -6px;'}
        width: 12px;
        cursor: ew-resize;
        z-index: ${Z_INDEX.panelTop};
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        transition: background 0.15s ease;
    `;

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'sql-crack-resize-toggle';
    toggleBtn.setAttribute('data-panel-key', storageKey);
    toggleBtn.style.cssText = `
        width: 12px;
        height: 28px;
        border: none;
        border-radius: 6px;
        padding: 0;
        margin: 0;
        font-size: 10px;
        line-height: 1;
        cursor: pointer;
        opacity: 0.95;
    `;
    handle.appendChild(toggleBtn);
    panel.appendChild(handle);

    let dragging = false;
    let startX = 0;
    let startWidth = 0;
    let collapsed = false;
    let preferredWidth = getStoredNumber(widthKey) || defaultWidth;
    let expandedWidth = computeClampedPanelWidth(preferredWidth, minWidth, maxWidthRatio);

    const applyTheme = (): void => {
        const theme = getComponentUiColors(isDarkTheme());
        handle.style.background = 'transparent';
        toggleBtn.style.background = theme.subtleBg;
        toggleBtn.style.color = theme.textDim;
        toggleBtn.style.boxShadow = `inset 0 0 0 1px ${theme.border}`;
    };

    const setWidth = (nextWidth: number, persist = true): void => {
        const width = computeClampedPanelWidth(nextWidth, minWidth, maxWidthRatio);
        panel.style.width = `${width}px`;
        panel.style.maxWidth = 'none';
        expandedWidth = width;
        if (persist) {
            preferredWidth = nextWidth;
            try { window.localStorage.setItem(widthKey, String(nextWidth)); } catch {}
        }
    };

    const applyCollapseState = (nextCollapsed: boolean): void => {
        collapsed = nextCollapsed;
        try { window.localStorage.setItem(collapsedKey, String(collapsed)); } catch {}

        if (collapsed) {
            setWidth(expandedWidth, false);
            panel.style.width = `${collapsedWidth}px`;
            panel.style.minWidth = `${collapsedWidth}px`;
            panel.style.padding = '0';
            panel.style.overflow = 'hidden';
            Array.from(panel.children).forEach(child => {
                if (child === handle) { return; }
                (child as HTMLElement).style.display = 'none';
            });
            toggleBtn.textContent = side === 'right' ? '◀' : '▶';
            panel.setAttribute('aria-expanded', 'false');
        } else {
            panel.style.padding = originalPadding;
            panel.style.overflow = originalOverflow;
            panel.style.minWidth = originalMinWidth;
            Array.from(panel.children).forEach(child => {
                if (child === handle) { return; }
                (child as HTMLElement).style.display = '';
            });
            setWidth(expandedWidth, false);
            toggleBtn.textContent = side === 'right' ? '▶' : '◀';
            panel.setAttribute('aria-expanded', 'true');
        }
    };

    const onMouseMove = (event: MouseEvent): void => {
        if (!dragging || collapsed) { return; }
        const delta = side === 'right'
            ? (startX - event.clientX)
            : (event.clientX - startX);
        setWidth(startWidth + delta, true);
    };

    const onMouseUp = (): void => {
        dragging = false;
    };

    handle.addEventListener('mousedown', (event) => {
        if ((event.target as HTMLElement).closest('.sql-crack-resize-toggle')) {
            return;
        }
        if (collapsed) { return; }
        event.preventDefault();
        dragging = true;
        startX = event.clientX;
        startWidth = Number.parseInt(panel.style.width || `${panel.offsetWidth || minWidth}`, 10) || minWidth;
    }, listenerOptions);

    handle.addEventListener('mouseenter', () => {
        handle.style.background = isDarkTheme() ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.08)';
    }, listenerOptions);
    handle.addEventListener('mouseleave', () => {
        handle.style.background = 'transparent';
    }, listenerOptions);

    toggleBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        applyCollapseState(!collapsed);
    }, listenerOptions);

    const onResize = (): void => {
        if (collapsed) {
            panel.style.width = `${collapsedWidth}px`;
            return;
        }
        setWidth(preferredWidth, false);
    };

    const onThemeChange = () => {
        applyTheme();
    };

    document.addEventListener('mousemove', onMouseMove, listenerOptions);
    document.addEventListener('mouseup', onMouseUp, listenerOptions);
    document.addEventListener('theme-change', onThemeChange as EventListener, listenerOptions);
    window.addEventListener('resize', onResize, listenerOptions);

    // Initialize persisted state
    setWidth(expandedWidth, false);
    let storedCollapsed = false;
    try { storedCollapsed = window.localStorage.getItem(collapsedKey) === 'true'; } catch {}
    applyCollapseState(storedCollapsed);
    applyTheme();

    return () => {
        panelAbortController.abort();
        handle.remove();
    };
}
