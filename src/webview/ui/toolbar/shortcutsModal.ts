export interface ShortcutItem {
    key: string;
    description: string;
}

export interface ShortcutsModalOptions {
    shortcuts: ShortcutItem[];
    isDark: boolean;
    zIndex: number;
    monoFontStack: string;
}

export function showKeyboardShortcutsHelpModal(options: ShortcutsModalOptions): void {
    const { shortcuts, isDark, zIndex, monoFontStack } = options;

    // Store the element that had focus before opening modal
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Theme-aware colors
    const overlayBg = isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.4)';
    const modalBg = isDark ? 'rgba(17, 17, 17, 0.98)' : 'rgba(255, 255, 255, 0.98)';
    const modalBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.1)';
    const titleColor = isDark ? '#f1f5f9' : '#1e293b';
    const descColor = isDark ? '#94a3b8' : '#64748b';
    const closeBtnColor = isDark ? '#94a3b8' : '#64748b';
    const closeBtnHoverColor = isDark ? '#f1f5f9' : '#1e293b';
    const closeBtnHoverBg = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)';
    const rowBorder = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.06)';
    const kbdBg = isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)';
    const kbdBorder = isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)';
    const kbdColor = isDark ? '#a5b4fc' : '#6366f1';

    const overlay = document.createElement('div');
    overlay.id = 'shortcuts-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'shortcuts-title');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: ${overlayBg};
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: ${zIndex};
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: ${modalBg};
        border: 1px solid ${modalBorder};
        border-radius: 12px;
        padding: 24px;
        min-width: 500px;
        max-width: 600px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        backdrop-filter: blur(8px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, ${isDark ? '0.4' : '0.15'});
    `;

    // Split shortcuts into two columns
    const midpoint = Math.ceil(shortcuts.length / 2);
    const leftColumn = shortcuts.slice(0, midpoint);
    const rightColumn = shortcuts.slice(midpoint);

    const renderShortcut = (s: ShortcutItem) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid ${rowBorder};">
            <span style="color: ${descColor}; font-size: 12px;">${s.description}</span>
            <kbd style="
                background: ${kbdBg};
                border: 1px solid ${kbdBorder};
                border-radius: 4px;
                padding: 3px 6px;
                color: ${kbdColor};
                font-size: 10px;
                font-family: ${monoFontStack};
                margin-left: 8px;
                white-space: nowrap;
            ">${s.key}</kbd>
        </div>
    `;

    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 id="shortcuts-title" style="margin: 0; color: ${titleColor}; font-size: 15px;">Keyboard Shortcuts</h3>
            <button id="close-shortcuts" aria-label="Close dialog" style="
                background: none;
                border: none;
                color: ${closeBtnColor};
                cursor: pointer;
                font-size: 20px;
                padding: 4px 8px;
                border-radius: 4px;
                transition: all 0.15s;
            ">&times;</button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px;">
            <div style="display: flex; flex-direction: column;">
                ${leftColumn.map(renderShortcut).join('')}
            </div>
            <div style="display: flex; flex-direction: column;">
                ${rightColumn.map(renderShortcut).join('')}
            </div>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeBtn = modal.querySelector('#close-shortcuts') as HTMLButtonElement;

    // Close modal and restore focus
    const closeModal = () => {
        document.removeEventListener('keydown', keyHandler);
        overlay.remove();
        if (previouslyFocused && previouslyFocused.focus) {
            previouslyFocused.focus();
        }
    };

    // Click outside to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = closeBtnHoverBg;
            closeBtn.style.color = closeBtnHoverColor;
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'none';
            closeBtn.style.color = closeBtnColor;
        });
    }

    // Keyboard handler for Escape and focus trap
    const keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeModal();
        } else if (e.key === 'Tab') {
            e.preventDefault();
            closeBtn?.focus();
        }
    };
    document.addEventListener('keydown', keyHandler);

    // Focus the close button when modal opens
    requestAnimationFrame(() => {
        closeBtn?.focus();
    });
}
