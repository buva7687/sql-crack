// Export Dropdown — Consolidated export menu with all formats
// Replaces separate PNG, SVG, MMD, clipboard buttons
// Uses position: fixed and appends to body to escape overflow:hidden clipping

export interface ExportDropdownCallbacks {
    onExportPng: () => void;
    onExportSvg: () => void;
    onExportMermaid: () => void;
    onCopyToClipboard: () => void;
    isDarkTheme: () => boolean;
}

let dropdownElement: HTMLDivElement | null = null;
let triggerBtn: HTMLButtonElement | null = null;
let isOpen = false;

/**
 * Create the export dropdown trigger button and popover.
 * The popover is appended to document.body to escape overflow:hidden parents.
 * Returns the button element to be placed in toolbar.
 */
export function createExportDropdown(
    callbacks: ExportDropdownCallbacks,
    documentListeners: Array<{ type: string; handler: EventListener }>
): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; align-items: center;';

    const isDark = callbacks.isDarkTheme();

    // Trigger button
    const btn = document.createElement('button');
    btn.id = 'export-dropdown-btn';
    btn.setAttribute('aria-label', 'Export visualization');
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('role', 'button');
    btn.textContent = 'Export';
    btn.style.cssText = `
        background: transparent;
        border: none;
        color: ${isDark ? '#f1f5f9' : '#1e293b'};
        padding: 8px 12px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        transition: background 0.15s;
    `;
    triggerBtn = btn;

    // Dropdown popover — appended to body, positioned with fixed
    const dropdown = document.createElement('div');
    dropdown.id = 'export-dropdown-menu';
    dropdown.setAttribute('role', 'menu');
    dropdown.style.cssText = `
        display: none;
        position: fixed;
        min-width: 200px;
        z-index: 10000;
        padding: 6px 0;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, ${isDark ? '0.4' : '0.15'});
        background: ${isDark ? 'rgba(17, 17, 17, 0.98)' : 'rgba(255, 255, 255, 0.98)'};
        border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
        backdrop-filter: blur(8px);
    `;

    const textColor = isDark ? '#e2e8f0' : '#1e293b';
    const hoverBg = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)';

    const modKey = navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl+';
    const items = [
        { label: 'Copy to clipboard (PNG)', shortcut: `${modKey}C`, action: callbacks.onCopyToClipboard },
        { label: 'Save as PNG', shortcut: `${modKey}S`, action: callbacks.onExportPng },
        { type: 'separator' as const },
        { label: 'SVG', shortcut: '', action: callbacks.onExportSvg },
        { label: 'Mermaid', shortcut: '', action: callbacks.onExportMermaid },
    ];

    items.forEach(item => {
        if ('type' in item && item.type === 'separator') {
            const sep = document.createElement('div');
            sep.style.cssText = `
                height: 1px;
                margin: 4px 8px;
                background: ${isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'};
            `;
            dropdown.appendChild(sep);
            return;
        }

        const row = document.createElement('div');
        row.setAttribute('role', 'menuitem');
        row.setAttribute('tabindex', '-1');
        row.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            color: ${textColor};
            transition: background 0.1s;
            font-size: 12px;
        `;

        const labelSpan = document.createElement('span');
        labelSpan.textContent = (item as any).label;
        row.appendChild(labelSpan);

        if ((item as any).shortcut) {
            const kbd = document.createElement('kbd');
            kbd.textContent = (item as any).shortcut;
            kbd.style.cssText = `
                background: ${isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)'};
                border-radius: 3px;
                padding: 2px 6px;
                font-size: 10px;
                color: ${isDark ? '#a5b4fc' : '#6366f1'};
                font-family: monospace;
            `;
            row.appendChild(kbd);
        }

        row.addEventListener('mouseenter', () => { row.style.background = hoverBg; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });

        row.addEventListener('click', (e) => {
            e.stopPropagation();
            closeDropdown();
            (item as any).action();
        });

        dropdown.appendChild(row);
    });

    // Toggle on button click
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(148, 163, 184, 0.1)'; });
    btn.addEventListener('mouseleave', () => {
        if (!isOpen) { btn.style.background = 'transparent'; }
    });

    // Close on outside click
    const outsideClickHandler = () => { closeDropdown(); };
    document.addEventListener('click', outsideClickHandler);
    documentListeners.push({ type: 'click', handler: outsideClickHandler });

    // Close on Escape
    const escapeHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && isOpen) {
            closeDropdown();
            btn.focus();
        }
    };
    document.addEventListener('keydown', escapeHandler as EventListener);
    documentListeners.push({ type: 'keydown', handler: escapeHandler as EventListener });

    container.appendChild(btn);

    // Append dropdown to body so it escapes overflow:hidden clipping
    document.body.appendChild(dropdown);
    dropdownElement = dropdown;

    // Theme update listener — update all colors including row text
    document.addEventListener('theme-change', ((e: CustomEvent) => {
        const dark = e.detail.dark;
        btn.style.color = dark ? '#f1f5f9' : '#1e293b';
        dropdown.style.background = dark ? 'rgba(17, 17, 17, 0.98)' : 'rgba(255, 255, 255, 0.98)';
        dropdown.style.borderColor = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
        dropdown.style.boxShadow = `0 4px 16px rgba(0, 0, 0, ${dark ? '0.4' : '0.15'})`;
        // Update row text colors
        const newTextColor = dark ? '#e2e8f0' : '#1e293b';
        dropdown.querySelectorAll('[role="menuitem"]').forEach(row => {
            (row as HTMLElement).style.color = newTextColor;
        });
        // Update separator colors
        dropdown.querySelectorAll('div:not([role])').forEach(el => {
            const h = (el as HTMLElement).style.height;
            if (h === '1px') {
                (el as HTMLElement).style.background = dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
            }
        });
        // Update kbd badges
        dropdown.querySelectorAll('kbd').forEach(kbd => {
            kbd.style.background = dark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)';
            kbd.style.color = dark ? '#a5b4fc' : '#6366f1';
        });
    }) as EventListener);

    return container;
}

function openDropdown(): void {
    if (dropdownElement && triggerBtn) {
        // Position dropdown below the button using fixed positioning
        const rect = triggerBtn.getBoundingClientRect();
        dropdownElement.style.top = `${rect.bottom + 4}px`;
        dropdownElement.style.right = `${window.innerWidth - rect.right}px`;
        dropdownElement.style.left = 'auto';
        dropdownElement.style.display = 'block';
        isOpen = true;
        triggerBtn.setAttribute('aria-expanded', 'true');
    }
}

function closeDropdown(): void {
    if (dropdownElement) {
        dropdownElement.style.display = 'none';
        isOpen = false;
        triggerBtn?.setAttribute('aria-expanded', 'false');
    }
}
