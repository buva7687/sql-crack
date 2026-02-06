// Layout Picker — Popover replacing blind H cycling
// Shows 5 layouts with mini descriptions, checkmark on current
// Uses position: fixed and appends to body to escape overflow:hidden clipping

import type { LayoutType } from '../types';

export interface LayoutPickerCallbacks {
    onLayoutChange: (layout: LayoutType) => void;
    getCurrentLayout: () => LayoutType;
    isDarkTheme: () => boolean;
}

const LAYOUTS: Array<{ value: LayoutType; label: string; icon: string; desc: string; key: string }> = [
    { value: 'vertical', label: 'Vertical', icon: '↓', desc: 'Top-to-bottom flow', key: '1' },
    { value: 'horizontal', label: 'Horizontal', icon: '→', desc: 'Left-to-right flow', key: '2' },
    { value: 'compact', label: 'Compact', icon: '⊞', desc: 'Tighter spacing', key: '3' },
    { value: 'force', label: 'Force', icon: '◎', desc: 'Physics-based positioning', key: '4' },
    { value: 'radial', label: 'Radial', icon: '◉', desc: 'Root at center, rings', key: '5' },
];

let pickerElement: HTMLDivElement | null = null;
let triggerBtn: HTMLButtonElement | null = null;
let isOpen = false;

/**
 * Create the layout picker trigger button + popover.
 * The popover is appended to document.body to escape overflow:hidden parents.
 */
export function createLayoutPicker(
    callbacks: LayoutPickerCallbacks,
    documentListeners: Array<{ type: string; handler: EventListener }>
): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; align-items: center;';

    const isDark = callbacks.isDarkTheme();
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
        color: ${isDark ? '#f1f5f9' : '#1e293b'};
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.15s;
        border-left: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'};
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
        box-shadow: 0 4px 16px rgba(0, 0, 0, ${isDark ? '0.4' : '0.15'});
        background: ${isDark ? 'rgba(17,17,17,0.98)' : 'rgba(255,255,255,0.98)'};
        border: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'};
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

    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(148,163,184,0.1)'; });
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
        btn.style.color = dark ? '#f1f5f9' : '#1e293b';
        btn.style.borderLeftColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
        dropdown.style.background = dark ? 'rgba(17,17,17,0.98)' : 'rgba(255,255,255,0.98)';
        dropdown.style.borderColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
        dropdown.style.boxShadow = `0 4px 16px rgba(0, 0, 0, ${dark ? '0.4' : '0.15'})`;
    }) as EventListener);

    return container;
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
    const current = callbacks.getCurrentLayout();
    const textColor = isDark ? '#E2E8F0' : '#1E293B';
    const activeColor = isDark ? '#818CF8' : '#6366F1';

    dropdown.innerHTML = '';

    const header = document.createElement('div');
    header.textContent = 'Layout';
    header.style.cssText = `
        padding: 4px 12px 6px;
        font-size: 10px;
        text-transform: uppercase;
        color: ${isDark ? '#64748B' : '#94A3B8'};
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
            background: ${isActive ? (isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)') : 'transparent'};
            transition: background 0.1s;
            font-size: 12px;
        `;

        item.innerHTML = `
            <span style="font-size: 14px; min-width: 18px; text-align: center;">${layout.icon}</span>
            <div style="flex: 1;">
                <div style="font-weight: 500;">${layout.label}</div>
                <div style="font-size: 10px; color: ${isDark ? '#64748B' : '#94A3B8'};">${layout.desc}</div>
            </div>
            <kbd style="
                background: ${isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)'};
                border-radius: 3px;
                padding: 2px 6px;
                font-size: 10px;
                color: ${isDark ? '#A5B4FC' : '#6366F1'};
                font-family: monospace;
            ">${layout.key}</kbd>
            ${isActive ? `<span style="color: ${activeColor};">&#x2713;</span>` : ''}
        `;

        item.addEventListener('mouseenter', () => {
            if (!isActive) {
                item.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
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
    return found ? found.icon : '↓';
}
