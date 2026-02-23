import { FocusMode } from '../../types';
import { ICONS } from '../../../shared/icons';
import { Z_INDEX } from '../../../shared/zIndex';
import { formatRelativeTime } from '../../../shared/time';

interface ToolbarMenuCallbacks {
    isDarkTheme: () => boolean;
    onFocusModeChange: (mode: FocusMode) => void;
    getFocusMode: () => FocusMode;
    onChangeViewLocation: (location: string) => void;
    onOpenPinnedTab: (pinId: string) => void;
    onUnpinTab: (pinId: string) => void;
}

interface MenuListenerContext {
    documentListeners: Array<{ type: string; handler: EventListener }>;
    getListenerOptions: () => AddEventListenerOptions | undefined;
    getBtnStyle: (dark: boolean) => string;
}

export function createFocusModeSelector(
    callbacks: ToolbarMenuCallbacks,
    context: MenuListenerContext
): HTMLElement {
    const listenerOptions = context.getListenerOptions();
    const dark = callbacks.isDarkTheme();
    const borderColor = dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';
    const dropdownBg = dark ? 'rgba(17, 17, 17, 0.98)' : 'rgba(255, 255, 255, 0.98)';
    const dropdownShadow = dark ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 4px 12px rgba(15, 23, 42, 0.15)';

    const container = document.createElement('div');
    container.id = 'focus-mode-selector';
    container.dataset.overflowKeepVisible = 'true';
    container.style.cssText = 'display: flex; align-items: center;';

    const btn = document.createElement('button');
    btn.id = 'focus-mode-btn';
    btn.innerHTML = ICONS.focusDirection;
    btn.title = 'Focus Mode Direction (U/D/A)';
    btn.style.cssText = context.getBtnStyle(dark) + `border-left: 1px solid ${borderColor};`;

    const dropdown = document.createElement('div');
    dropdown.id = 'focus-mode-dropdown';
    dropdown.className = 'sql-crack-floating-toolbar-menu';
    dropdown.style.cssText = `
        display: none;
        position: fixed;
        background: ${dropdownBg};
        border: 1px solid ${borderColor};
        border-radius: 8px;
        padding: 8px 0;
        min-width: 180px;
        z-index: ${Z_INDEX.dropdownTop};
        box-shadow: ${dropdownShadow};
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
            color: ${isActive ? '#818cf8' : (dark ? '#e2e8f0' : '#1e293b')};
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
            ${isActive ? `<span class="sql-crack-check-icon" style="color: #818cf8; display: inline-flex; width: 14px; height: 14px;">${ICONS.check}</span>` : ''}
        `;

        item.addEventListener('click', (event) => {
            event.stopPropagation();
            callbacks.onFocusModeChange(mode.id);
            dropdown.style.display = 'none';
            btn.innerHTML = mode.icon;
            updateFocusModeDropdown(dropdown, mode.id, callbacks.isDarkTheme());
        }, listenerOptions);

        item.addEventListener('mouseenter', () => {
            if (callbacks.getFocusMode() !== mode.id) {
                item.style.background = 'rgba(148, 163, 184, 0.1)';
            }
        }, listenerOptions);
        item.addEventListener('mouseleave', () => {
            if (callbacks.getFocusMode() !== mode.id) {
                item.style.background = 'transparent';
            }
        }, listenerOptions);

        dropdown.appendChild(item);
    });

    btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isHidden = dropdown.style.display === 'none';
        if (isHidden) {
            const rect = btn.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
            dropdown.style.left = 'auto';
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    }, listenerOptions);

    btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(148, 163, 184, 0.1)';
    }, listenerOptions);
    btn.addEventListener('mouseleave', () => {
        if (dropdown.style.display !== 'block') {
            btn.style.background = 'transparent';
        }
    }, listenerOptions);

    const focusModeClickHandler = () => {
        dropdown.style.display = 'none';
    };
    document.addEventListener('click', focusModeClickHandler, listenerOptions);
    context.documentListeners.push({ type: 'click', handler: focusModeClickHandler });

    const focusModeResizeHandler = () => {
        if (dropdown.style.display === 'block') {
            const rect = btn.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
        }
    };
    window.addEventListener('resize', focusModeResizeHandler, listenerOptions);
    context.documentListeners.push({ type: 'resize', handler: focusModeResizeHandler as EventListener });

    container.appendChild(btn);
    document.body.appendChild(dropdown);
    return container;
}

function updateFocusModeDropdown(dropdown: HTMLElement, activeMode: FocusMode, isDark: boolean): void {
    dropdown.querySelectorAll('[data-mode]').forEach(item => {
        const mode = item.getAttribute('data-mode') as FocusMode;
        const isActive = mode === activeMode;
        (item as HTMLElement).style.color = isActive ? '#818cf8' : (isDark ? '#e2e8f0' : '#1e293b');
        (item as HTMLElement).style.background = isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent';

        item.querySelector('.sql-crack-check-icon')?.remove();
        if (isActive) {
            const check = document.createElement('span');
            check.className = 'sql-crack-check-icon';
            check.style.color = '#818cf8';
            check.style.display = 'inline-flex';
            check.style.width = '14px';
            check.style.height = '14px';
            check.innerHTML = ICONS.check;
            item.appendChild(check);
        }
    });
}

export function createViewLocationButton(
    callbacks: ToolbarMenuCallbacks,
    currentLocation: string,
    context: MenuListenerContext
): HTMLElement {
    const listenerOptions = context.getListenerOptions();
    const dark = callbacks.isDarkTheme();
    const borderColor = dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';

    const viewLocBtn = document.createElement('button');
    viewLocBtn.id = 'view-location-btn';
    viewLocBtn.dataset.overflowKeepVisible = 'true';
    viewLocBtn.innerHTML = '⊞';
    viewLocBtn.title = 'Change view location';
    viewLocBtn.style.cssText = context.getBtnStyle(dark) + `border-left: 1px solid ${borderColor};`;

    const dropdown = createViewLocationDropdown(callbacks, currentLocation, context);
    document.body.appendChild(dropdown);

    viewLocBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isHidden = dropdown.style.display === 'none';
        if (isHidden) {
            const rect = viewLocBtn.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
            dropdown.style.left = 'auto';
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    }, listenerOptions);

    const viewLocClickHandler = () => {
        dropdown.style.display = 'none';
    };
    document.addEventListener('click', viewLocClickHandler, listenerOptions);
    context.documentListeners.push({ type: 'click', handler: viewLocClickHandler });

    const viewLocResizeHandler = () => {
        if (dropdown.style.display === 'block') {
            const rect = viewLocBtn.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
        }
    };
    window.addEventListener('resize', viewLocResizeHandler, listenerOptions);
    context.documentListeners.push({ type: 'resize', handler: viewLocResizeHandler as EventListener });

    viewLocBtn.addEventListener('mouseenter', () => {
        viewLocBtn.style.background = 'rgba(148, 163, 184, 0.1)';
    }, listenerOptions);
    viewLocBtn.addEventListener('mouseleave', () => {
        if (dropdown.style.display !== 'block') {
            viewLocBtn.style.background = 'transparent';
        }
    }, listenerOptions);

    return viewLocBtn;
}

function createViewLocationDropdown(
    callbacks: ToolbarMenuCallbacks,
    currentLocation: string,
    context: MenuListenerContext
): HTMLElement {
    const listenerOptions = context.getListenerOptions();
    const dark = callbacks.isDarkTheme();
    const borderColor = dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';
    const dropdownBg = dark ? 'rgba(17, 17, 17, 0.98)' : 'rgba(255, 255, 255, 0.98)';
    const dropdownShadow = dark ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 4px 12px rgba(15, 23, 42, 0.15)';

    const dropdown = document.createElement('div');
    dropdown.id = 'view-location-dropdown';
    dropdown.className = 'sql-crack-floating-toolbar-menu';
    dropdown.style.cssText = `
        display: none;
        position: fixed;
        background: ${dropdownBg};
        border: 1px solid ${borderColor};
        border-radius: 8px;
        padding: 8px 0;
        min-width: 180px;
        z-index: ${Z_INDEX.dropdownTop};
        box-shadow: ${dropdownShadow};
    `;

    const locations = [
        { id: 'beside', label: 'Side by Side', icon: '⫝', desc: 'Next to SQL file' },
        { id: 'tab', label: 'New Tab', icon: '⊟', desc: 'As editor tab' }
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

    locations.forEach(location => {
        const item = document.createElement('div');
        const isActive = currentLocation === location.id;
        item.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            color: ${isActive ? '#818cf8' : (dark ? '#e2e8f0' : '#1e293b')};
            background: ${isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent'};
            transition: background 0.15s;
        `;

        item.innerHTML = `
            <span style="font-size: 14px;">${location.icon}</span>
            <div>
                <div style="font-size: 12px; font-weight: 500;">${location.label}</div>
                <div style="font-size: 10px; color: #64748b;">${location.desc}</div>
            </div>
            ${isActive ? `<span style="margin-left: auto; color: #818cf8; display: inline-flex; width: 14px; height: 14px;">${ICONS.check}</span>` : ''}
        `;

        item.addEventListener('mouseenter', () => {
            if (!isActive) {
                item.style.background = 'rgba(148, 163, 184, 0.1)';
            }
        }, listenerOptions);
        item.addEventListener('mouseleave', () => {
            if (!isActive) {
                item.style.background = 'transparent';
            }
        }, listenerOptions);

        item.addEventListener('click', (event) => {
            event.stopPropagation();
            callbacks.onChangeViewLocation(location.id);
            dropdown.style.display = 'none';
        }, listenerOptions);

        dropdown.appendChild(item);
    });

    return dropdown;
}

export function createPinnedTabsButton(
    callbacks: ToolbarMenuCallbacks,
    pins: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>,
    context: MenuListenerContext
): HTMLElement {
    const listenerOptions = context.getListenerOptions();
    const dark = callbacks.isDarkTheme();
    const borderColor = dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';

    const pinsBtn = document.createElement('button');
    pinsBtn.id = 'pinned-tabs-btn';
    pinsBtn.dataset.overflowKeepVisible = 'true';
    pinsBtn.innerHTML = ICONS.clipboard;
    pinsBtn.title = `Open pinned tabs (${pins.length})`;
    pinsBtn.dataset.overflowIcon = ICONS.clipboard;
    pinsBtn.style.cssText = context.getBtnStyle(dark) + `border-left: 1px solid ${borderColor};`;

    const dropdown = createPinnedTabsDropdown(callbacks, pins, context);
    document.body.appendChild(dropdown);

    pinsBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isHidden = dropdown.style.display === 'none';
        if (isHidden) {
            const rect = pinsBtn.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
            dropdown.style.left = 'auto';
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    }, listenerOptions);

    const pinnedTabsClickHandler = () => {
        dropdown.style.display = 'none';
    };
    document.addEventListener('click', pinnedTabsClickHandler, listenerOptions);
    context.documentListeners.push({ type: 'click', handler: pinnedTabsClickHandler });

    const pinnedTabsResizeHandler = () => {
        if (dropdown.style.display === 'block') {
            const rect = pinsBtn.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
        }
    };
    window.addEventListener('resize', pinnedTabsResizeHandler, listenerOptions);
    context.documentListeners.push({ type: 'resize', handler: pinnedTabsResizeHandler as EventListener });

    pinsBtn.addEventListener('mouseenter', () => {
        pinsBtn.style.background = 'rgba(148, 163, 184, 0.1)';
    }, listenerOptions);
    pinsBtn.addEventListener('mouseleave', () => {
        if (dropdown.style.display !== 'block') {
            pinsBtn.style.background = 'transparent';
        }
    }, listenerOptions);

    return pinsBtn;
}

function createPinnedTabsDropdown(
    callbacks: ToolbarMenuCallbacks,
    pins: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>,
    context: MenuListenerContext
): HTMLElement {
    const listenerOptions = context.getListenerOptions();
    const dark = callbacks.isDarkTheme();
    const borderColor = dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';
    const dropdownBg = dark ? 'rgba(17, 17, 17, 0.98)' : 'rgba(255, 255, 255, 0.98)';
    const dropdownShadow = dark ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 4px 12px rgba(15, 23, 42, 0.15)';

    const dropdown = document.createElement('div');
    dropdown.id = 'pinned-tabs-dropdown';
    dropdown.className = 'sql-crack-floating-toolbar-menu';
    dropdown.style.cssText = `
        display: none;
        position: fixed;
        background: ${dropdownBg};
        border: 1px solid ${borderColor};
        border-radius: 8px;
        padding: 8px 0;
        min-width: 220px;
        max-height: 300px;
        overflow-y: auto;
        z-index: ${Z_INDEX.dropdownTop};
        box-shadow: ${dropdownShadow};
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
            color: ${dark ? '#e2e8f0' : '#1e293b'};
            transition: background 0.15s;
        `;

        const date = new Date(pin.timestamp);
        const absoluteTimeStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const relativeTimeStr = formatRelativeTime(pin.timestamp, { showMonths: true });

        item.innerHTML = `
            <span style="display: inline-flex; width: 14px; height: 14px;">${ICONS.pin}</span>
            <div style="flex: 1; overflow: hidden;">
                <div style="font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pin.name}</div>
                <div style="font-size: 10px; color: #64748b;">${pin.dialect} • <span title="${absoluteTimeStr}">${relativeTimeStr}</span></div>
            </div>
        `;

        const deleteBtn = document.createElement('span');
        deleteBtn.innerHTML = '×';
        deleteBtn.style.cssText = 'font-size: 16px; color: #64748b; padding: 0 4px; cursor: pointer;';
        deleteBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            callbacks.onUnpinTab(pin.id);
            item.remove();
        }, listenerOptions);
        deleteBtn.addEventListener('mouseenter', () => {
            deleteBtn.style.color = '#ef4444';
        }, listenerOptions);
        deleteBtn.addEventListener('mouseleave', () => {
            deleteBtn.style.color = '#64748b';
        }, listenerOptions);
        item.appendChild(deleteBtn);

        item.addEventListener('mouseenter', () => {
            item.style.background = 'rgba(148, 163, 184, 0.1)';
        }, listenerOptions);
        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        }, listenerOptions);

        item.addEventListener('click', (event) => {
            event.stopPropagation();
            callbacks.onOpenPinnedTab(pin.id);
            dropdown.style.display = 'none';
        }, listenerOptions);

        dropdown.appendChild(item);
    });

    return dropdown;
}
