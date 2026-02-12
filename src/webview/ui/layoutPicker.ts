// Layout Picker — Popover replacing blind H cycling
// Shows 5 layouts with mini descriptions, checkmark on current
// Uses position: fixed and appends to body to escape overflow:hidden clipping

import type { LayoutType } from '../types';
import { getComponentUiColors } from '../constants';
import { ICONS } from '../../shared/icons';
import { MONO_FONT_STACK } from '../../shared/themeTokens';

export interface LayoutPickerCallbacks {
    onLayoutChange: (layout: LayoutType) => void;
    getCurrentLayout: () => LayoutType;
    isDarkTheme: () => boolean;
}

const LAYOUTS: Array<{ value: LayoutType; label: string; icon: string; desc: string; key: string }> = [
    { value: 'vertical', label: 'Vertical', icon: ICONS.layoutVertical, desc: 'Top-to-bottom flow', key: '1' },
    { value: 'horizontal', label: 'Horizontal', icon: ICONS.layoutHorizontal, desc: 'Left-to-right flow', key: '2' },
    { value: 'compact', label: 'Compact', icon: ICONS.layoutCompact, desc: 'Tighter spacing', key: '3' },
    { value: 'force', label: 'Force', icon: ICONS.layoutForce, desc: 'Physics-based positioning', key: '4' },
    { value: 'radial', label: 'Radial', icon: ICONS.layoutRadial, desc: 'Root at center, rings', key: '5' },
];

let pickerElement: HTMLDivElement | null = null;
let triggerBtn: HTMLButtonElement | null = null;
let isOpen = false;
let layoutPickerAbortController: AbortController | null = null;

/**
 * Create the layout picker trigger button + popover.
 * The popover is appended to document.body to escape overflow:hidden parents.
 */
export function createLayoutPicker(
    callbacks: LayoutPickerCallbacks,
    documentListeners: Array<{ type: string; handler: EventListener }>
): HTMLElement {
    layoutPickerAbortController?.abort();
    layoutPickerAbortController = new AbortController();

    const container = document.createElement('div');
    container.style.cssText = 'display: flex; align-items: center;';

    const isDark = callbacks.isDarkTheme();
    const theme = getComponentUiColors(isDark);
    const currentLayout = callbacks.getCurrentLayout();

    // Trigger button
    const btn = document.createElement('button');
    btn.id = 'layout-picker-btn';
    btn.setAttribute('aria-label', 'Choose layout');
    btn.setAttribute('aria-haspopup', 'true');
    btn.innerHTML = getLayoutIcon(currentLayout);
    btn.title = 'Layout (1-5 keys)';
    btn.style.cssText = `
        background: transparent;
        border: none;
        color: ${theme.text};
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.15s;
        border-left: 1px solid ${theme.border};
    `;
    triggerBtn = btn;

    // Dropdown popover — appended to body, positioned with fixed
    const dropdown = document.createElement('div');
    dropdown.id = 'layout-picker-dropdown';
    dropdown.setAttribute('role', 'listbox');
    pickerElement = dropdown;

    dropdown.style.cssText = `
        display: none;
        position: fixed;
        min-width: 200px;
        z-index: 10000;
        padding: 6px 0;
        border-radius: 8px;
        box-shadow: ${theme.shadow};
        background: ${theme.surfaceElevated};
        border: 1px solid ${theme.border};
        backdrop-filter: blur(8px);
    `;

    renderLayoutItems(dropdown, callbacks);

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) {
            closePicker();
        } else {
            openPicker(callbacks);
        }
    });

    btn.addEventListener('mouseenter', () => { btn.style.background = theme.hover; });
    btn.addEventListener('mouseleave', () => {
        if (!isOpen) { btn.style.background = 'transparent'; }
    });

    const closeHandler = () => { closePicker(); };
    document.addEventListener('click', closeHandler);
    documentListeners.push({ type: 'click', handler: closeHandler });

    container.appendChild(btn);

    // Append dropdown to body so it escapes overflow:hidden clipping
    document.body.appendChild(dropdown);

    // Listen for theme changes
    document.addEventListener('theme-change', ((e: CustomEvent) => {
        const dark = e.detail.dark;
        const nextTheme = getComponentUiColors(dark);
        btn.style.color = nextTheme.text;
        btn.style.borderLeftColor = nextTheme.border;
        dropdown.style.background = nextTheme.surfaceElevated;
        dropdown.style.borderColor = nextTheme.border;
        dropdown.style.boxShadow = nextTheme.shadow;
    }) as EventListener, { signal: layoutPickerAbortController.signal });

    return container;
}

/**
 * Dispose layout picker event listeners.
 */
export function disposeLayoutPicker(): void {
    layoutPickerAbortController?.abort();
    layoutPickerAbortController = null;
}

function openPicker(callbacks: LayoutPickerCallbacks): void {
    if (pickerElement && triggerBtn) {
        // Re-render items to reflect current layout/theme
        renderLayoutItems(pickerElement, callbacks);
        // Position dropdown below the button using fixed positioning
        const rect = triggerBtn.getBoundingClientRect();
        pickerElement.style.top = `${rect.bottom + 4}px`;
        pickerElement.style.right = `${window.innerWidth - rect.right}px`;
        pickerElement.style.left = 'auto';
        pickerElement.style.display = 'block';
        isOpen = true;
    }
}

function closePicker(): void {
    if (pickerElement) {
        pickerElement.style.display = 'none';
        isOpen = false;
    }
}

function renderLayoutItems(dropdown: HTMLElement, callbacks: LayoutPickerCallbacks): void {
    const isDark = callbacks.isDarkTheme();
    const theme = getComponentUiColors(isDark);
    const current = callbacks.getCurrentLayout();
    const textColor = theme.textBright;
    const activeColor = theme.accent;

    dropdown.innerHTML = '';

    const header = document.createElement('div');
    header.textContent = 'Layout';
    header.style.cssText = `
        padding: 4px 12px 6px;
        font-size: 10px;
        text-transform: uppercase;
        color: ${theme.textDim};
        letter-spacing: 0.5px;
    `;
    dropdown.appendChild(header);

    LAYOUTS.forEach(layout => {
        const isActive = current === layout.value;
        const item = document.createElement('div');
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(isActive));
        item.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            color: ${isActive ? activeColor : textColor};
            background: ${isActive ? theme.accentBgSoft : 'transparent'};
            transition: background 0.1s;
            font-size: 12px;
        `;

        item.innerHTML = `
            <span style="display: inline-flex; min-width: 18px; align-items: center; justify-content: center;">${layout.icon}</span>
            <div style="flex: 1;">
                <div style="font-weight: 500;">${layout.label}</div>
                <div style="font-size: 10px; color: ${theme.textDim};">${layout.desc}</div>
            </div>
            <kbd style="
                background: ${theme.accentBg};
                border-radius: 3px;
                padding: 2px 6px;
                font-size: 10px;
                color: ${theme.accentSoft};
                font-family: ${MONO_FONT_STACK};
            ">${layout.key}</kbd>
            ${isActive ? `<span style="color: ${activeColor};">&#x2713;</span>` : ''}
        `;

        item.addEventListener('mouseenter', () => {
            if (!isActive) {
                item.style.background = theme.subtleBgAlt;
            }
        });
        item.addEventListener('mouseleave', () => {
            if (!isActive) {
                item.style.background = 'transparent';
            }
        });

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            callbacks.onLayoutChange(layout.value);
            closePicker();
            // Update trigger button icon
            const btn = document.getElementById('layout-picker-btn');
            if (btn) { btn.innerHTML = layout.icon; }
        });

        dropdown.appendChild(item);
    });
}

function getLayoutIcon(layout: LayoutType): string {
    const found = LAYOUTS.find(l => l.value === layout);
    return found ? found.icon : ICONS.layoutVertical;
}
