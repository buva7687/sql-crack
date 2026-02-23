import { ICONS } from '../../../shared/icons';

export interface OverflowPalette {
    background: string;
    border: string;
    text: string;
    hover: string;
    shadow: string;
}

export function getOverflowPalette(dark: boolean): OverflowPalette {
    return dark ? {
        background: 'rgba(17, 17, 17, 0.95)',
        border: 'rgba(148, 163, 184, 0.2)',
        text: '#e2e8f0',
        hover: 'rgba(148, 163, 184, 0.2)',
        shadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    } : {
        background: 'rgba(255, 255, 255, 0.98)',
        border: 'rgba(148, 163, 184, 0.3)',
        text: '#1e293b',
        hover: 'rgba(15, 23, 42, 0.06)',
        shadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
    };
}

export function applyOverflowMenuTheme(dark: boolean): void {
    const overflowBtn = document.getElementById('sql-crack-overflow-btn') as HTMLButtonElement | null;
    const overflowDropdown = document.getElementById('sql-crack-overflow-dropdown') as HTMLDivElement | null;
    const palette = getOverflowPalette(dark);

    if (overflowBtn) {
        overflowBtn.style.background = dark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.08)';
        overflowBtn.style.borderColor = dark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.4)';
        overflowBtn.style.color = palette.text;
    }

    if (overflowDropdown) {
        overflowDropdown.style.background = dark ? 'rgba(17, 17, 17, 0.98)' : 'rgba(255, 255, 255, 0.98)';
        overflowDropdown.style.borderColor = palette.border;
        overflowDropdown.style.boxShadow = palette.shadow;
        overflowDropdown.querySelectorAll('[data-overflow-row="true"]').forEach((row) => {
            const rowEl = row as HTMLElement;
            rowEl.style.color = palette.text;
        });
    }
}

function getDirectText(el: HTMLElement): string {
    for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            return node.textContent.trim();
        }
    }
    return '';
}

function cleanOverflowLabel(title: string): string {
    return title
        .replace(/\s*\([^)]*\)\s*$/, '')
        .replace(/^Toggle\s+/i, '')
        .replace(/^Show\s+/i, '')
        .replace(/^Export as\s+/i, 'Export ')
        .trim();
}

function collectOverflowableButtons(actions: HTMLElement): Array<{ btn: HTMLElement; label: string; icon: string }> {
    const result: Array<{ btn: HTMLElement; label: string; icon: string }> = [];

    // Children of actions: [zoomGroup, featureGroup, exportGroup]
    const children = Array.from(actions.children) as HTMLElement[];
    const featureGroup = children[1];
    const exportGroup = children[2];

    if (!exportGroup || !featureGroup) {
        return result;
    }

    const extractMeta = (el: HTMLElement): { icon: string; label: string } => {
        const explicitIcon = (el.dataset.overflowIcon || '').trim();
        if (explicitIcon) {
            const label = cleanOverflowLabel(el.title || '') || 'Action';
            return { icon: explicitIcon, label };
        }

        let icon = getDirectText(el);
        let title = el.title || '';

        if (!icon) {
            const innerBtn = el.querySelector('button');
            const select = el.querySelector('select');
            if (innerBtn) {
                icon = innerBtn.dataset.overflowIcon || getDirectText(innerBtn) || innerBtn.innerHTML.trim().slice(0, 3);
                title = title || innerBtn.title || '';
            } else if (select) {
                icon = ICONS.layout;
                title = title || 'Layout';
            } else {
                icon = el.textContent?.trim().slice(0, 2) || '';
            }
        }

        const label = cleanOverflowLabel(title) || icon;
        return { icon, label };
    };

    for (const el of Array.from(featureGroup.children) as HTMLElement[]) {
        if (el.dataset.overflowKeepVisible === 'true') {
            continue;
        }
        if (el.tagName !== 'BUTTON') {
            continue;
        }
        const meta = extractMeta(el);
        result.push({ btn: el, ...meta });
    }

    for (const el of Array.from(exportGroup.children) as HTMLElement[]) {
        if (el.dataset.overflowKeepVisible === 'true') {
            continue;
        }
        if (el.tagName !== 'BUTTON') {
            continue;
        }
        const meta = extractMeta(el);
        result.push({ btn: el, ...meta });
    }

    return result;
}

export function setupOverflowObserver(
    actions: HTMLElement,
    toolbarWrapper: HTMLElement,
    isDarkTheme: () => boolean
): ResizeObserver | null {
    const overflowContainer = document.getElementById('sql-crack-overflow-container') as HTMLElement;
    const overflowDropdown = document.getElementById('sql-crack-overflow-dropdown') as HTMLElement;
    if (!overflowContainer || !overflowDropdown) {
        return null;
    }

    const allButtons = collectOverflowableButtons(actions);

    const originalDisplays = new Map<HTMLElement, string>();
    for (const { btn } of allButtons) {
        originalDisplays.set(btn, btn.style.display || '');
    }

    const updateOverflow = () => {
        for (const { btn } of allButtons) {
            btn.style.display = originalDisplays.get(btn) || '';
        }
        overflowContainer.style.display = 'none';
        overflowDropdown.style.display = 'none';

        const wrapperWidth = toolbarWrapper.clientWidth;
        const contentWidth = toolbarWrapper.scrollWidth;

        if (contentWidth <= wrapperWidth) {
            return;
        }

        overflowContainer.style.display = 'flex';

        const hiddenButtons: Array<{ btn: HTMLElement; label: string; icon: string }> = [];

        for (let i = allButtons.length - 1; i >= 0; i--) {
            if (toolbarWrapper.scrollWidth <= wrapperWidth) {
                break;
            }
            const item = allButtons[i];
            item.btn.style.display = 'none';
            hiddenButtons.push(item);
        }

        if (hiddenButtons.length === 0) {
            overflowContainer.style.display = 'none';
            return;
        }

        overflowDropdown.innerHTML = '';
        const palette = getOverflowPalette(isDarkTheme());
        hiddenButtons.reverse();

        for (const { btn, label, icon } of hiddenButtons) {
            const row = document.createElement('div');
            row.setAttribute('data-overflow-row', 'true');
            row.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                color: ${palette.text};
                transition: background 0.15s;
                font-size: 12px;
                white-space: nowrap;
            `;

            const iconSpan = document.createElement('span');
            iconSpan.style.cssText = 'display: inline-flex; min-width: 20px; align-items: center; justify-content: center;';
            if (icon.includes('<svg')) {
                iconSpan.innerHTML = icon;
            } else {
                iconSpan.textContent = icon;
            }
            row.appendChild(iconSpan);

            const labelSpan = document.createElement('span');
            labelSpan.textContent = label;
            row.appendChild(labelSpan);

            row.addEventListener('mouseenter', () => {
                row.style.background = getOverflowPalette(isDarkTheme()).hover;
            });
            row.addEventListener('mouseleave', () => {
                row.style.background = 'transparent';
            });

            row.addEventListener('click', (event) => {
                event.stopPropagation();
                overflowDropdown.style.display = 'none';
                btn.click();
            });

            overflowDropdown.appendChild(row);
        }
        applyOverflowMenuTheme(isDarkTheme());
    };

    let overflowResizeDebounce: number | null = null;
    const scheduleOverflowUpdate = () => {
        if (overflowResizeDebounce !== null) {
            window.clearTimeout(overflowResizeDebounce);
        }
        overflowResizeDebounce = window.setTimeout(() => {
            overflowResizeDebounce = null;
            updateOverflow();
        }, 100);
    };

    const observer = new ResizeObserver(() => {
        scheduleOverflowUpdate();
    });
    observer.observe(toolbarWrapper);

    requestAnimationFrame(() => updateOverflow());

    return observer;
}
