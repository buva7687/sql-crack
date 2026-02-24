import type { FlowNode } from '../types';
import { prefersReducedMotion } from './motion';

export interface ContextMenuIcons {
    clipboard: string;
    document: string;
    folderClosed: string;
    folderOpen: string;
    search: string;
}

export interface ContextMenuColors {
    backgroundDark: string;
    backgroundLight: string;
    borderDark: string;
    borderLight: string;
    textDark: string;
    textLight: string;
}

export interface ShowContextMenuOptions {
    colors: ContextMenuColors;
    contextMenuElement: HTMLDivElement | null;
    event: MouseEvent;
    icons: ContextMenuIcons;
    isDarkTheme: boolean;
    node: FlowNode;
    onAction: (action: string | null, node: FlowNode) => void;
}

const contextMenuCleanupMap = new WeakMap<HTMLDivElement, () => void>();

function cleanupContextMenu(menu: HTMLDivElement): void {
    const cleanup = contextMenuCleanupMap.get(menu);
    if (cleanup) {
        cleanup();
        contextMenuCleanupMap.delete(menu);
    }
}

function closeContextMenu(menu: HTMLDivElement): void {
    cleanupContextMenu(menu);
    menu.style.display = 'none';
}

export function showContextMenu(options: ShowContextMenuOptions): void {
    const { colors, contextMenuElement, event, icons, isDarkTheme, node, onAction } = options;
    if (!contextMenuElement) {
        return;
    }
    cleanupContextMenu(contextMenuElement);

    event.preventDefault();
    event.stopPropagation();

    const menuItemStyle = `
        padding: 8px 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background 0.1s;
    `;
    const menuItemHoverBg = isDarkTheme ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.15)';
    const separatorStyle = `
        height: 1px;
        background: ${isDarkTheme ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'};
        margin: 4px 0;
    `;

    let menuItems = `
        <div class="ctx-menu-item" role="menuitem" tabindex="-1" data-action="zoom" style="${menuItemStyle}">
            <span style="width: 16px; display: inline-flex;">${icons.search}</span>
            <span>Zoom to node</span>
        </div>
        <div class="ctx-menu-item" role="menuitem" tabindex="-1" data-action="focus-upstream" style="${menuItemStyle}">
            <span style="width: 16px;">↑</span>
            <span>Focus upstream</span>
        </div>
        <div class="ctx-menu-item" role="menuitem" tabindex="-1" data-action="focus-downstream" style="${menuItemStyle}">
            <span style="width: 16px;">↓</span>
            <span>Focus downstream</span>
        </div>
        <div class="ctx-menu-item" role="menuitem" tabindex="-1" data-action="reset-view" style="${menuItemStyle}">
            <span style="width: 16px;">⊡</span>
            <span>Reset view (Esc)</span>
        </div>
        <div role="separator" style="${separatorStyle}"></div>
    `;

    if ((node.type === 'cte' || node.type === 'subquery') && node.collapsible && node.children && node.children.length > 0) {
        const isExpanded = node.expanded !== false;
        menuItems += `
            <div class="ctx-menu-item" role="menuitem" tabindex="-1" data-action="toggle-expand" style="${menuItemStyle}">
                <span style="width: 16px; display: inline-flex;">${isExpanded ? icons.folderOpen : icons.folderClosed}</span>
                <span>${isExpanded ? 'Collapse children' : 'Expand children'}</span>
            </div>
        `;
    }

    menuItems += `
        <div class="ctx-menu-item" role="menuitem" tabindex="-1" data-action="copy-label" style="${menuItemStyle}">
            <span style="width: 16px; display: inline-flex;">${icons.clipboard}</span>
            <span>Copy node name</span>
        </div>
    `;

    if (node.details && node.details.length > 0) {
        menuItems += `
            <div class="ctx-menu-item" role="menuitem" tabindex="-1" data-action="copy-details" style="${menuItemStyle}">
                <span style="width: 16px; display: inline-flex;">${icons.document}</span>
                <span>Copy details</span>
            </div>
        `;
    }

    contextMenuElement.innerHTML = menuItems;

    const menuWidth = 180;
    const menuHeight = contextMenuElement.offsetHeight || 200;
    let left = event.clientX;
    let top = event.clientY;

    if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 10;
    }
    if (top + menuHeight > window.innerHeight) {
        top = window.innerHeight - menuHeight - 10;
    }

    contextMenuElement.style.left = `${left}px`;
    contextMenuElement.style.top = `${top}px`;
    contextMenuElement.style.display = 'block';
    contextMenuElement.style.background = isDarkTheme ? colors.backgroundDark : colors.backgroundLight;
    contextMenuElement.style.color = isDarkTheme ? colors.textDark : colors.textLight;
    contextMenuElement.style.borderColor = isDarkTheme ? colors.borderDark : colors.borderLight;
    contextMenuElement.setAttribute('role', 'menu');
    contextMenuElement.setAttribute('aria-label', `Actions for ${node.label}`);
    contextMenuElement.tabIndex = 0;

    const itemElements = Array.from(contextMenuElement.querySelectorAll('.ctx-menu-item')) as HTMLElement[];
    if (itemElements.length === 0) {
        return;
    }

    const abortController = new AbortController();
    const signal = abortController.signal;
    let activeIndex = 0;

    const setActiveItem = (index: number): void => {
        activeIndex = (index + itemElements.length) % itemElements.length;
        itemElements.forEach((itemEl, itemIndex) => {
            itemEl.style.background = itemIndex === activeIndex ? menuItemHoverBg : 'transparent';
        });
        itemElements[activeIndex].focus();
    };

    const triggerAction = (itemEl: HTMLElement): void => {
        const action = itemEl.getAttribute('data-action');
        onAction(action, node);
        closeContextMenu(contextMenuElement);
    };

    itemElements.forEach((item, index) => {
        const itemEl = item as HTMLElement;
        itemEl.addEventListener('mouseenter', () => {
            setActiveItem(index);
        }, { signal });
        itemEl.addEventListener('mouseleave', () => {
            if (index !== activeIndex) {
                itemEl.style.background = 'transparent';
            }
        }, { signal });
        itemEl.addEventListener('click', (clickEvent) => {
            clickEvent.stopPropagation();
            triggerAction(itemEl);
        }, { signal });
    });

    contextMenuElement.addEventListener('keydown', (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === 'ArrowDown') {
            keyEvent.preventDefault();
            setActiveItem(activeIndex + 1);
            return;
        }
        if (keyEvent.key === 'ArrowUp') {
            keyEvent.preventDefault();
            setActiveItem(activeIndex - 1);
            return;
        }
        if (keyEvent.key === 'Home') {
            keyEvent.preventDefault();
            setActiveItem(0);
            return;
        }
        if (keyEvent.key === 'End') {
            keyEvent.preventDefault();
            setActiveItem(itemElements.length - 1);
            return;
        }
        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
            keyEvent.preventDefault();
            triggerAction(itemElements[activeIndex]);
            return;
        }
        if (keyEvent.key === 'Escape' || keyEvent.key === 'Tab') {
            keyEvent.preventDefault();
            closeContextMenu(contextMenuElement);
        }
    }, { signal });

    contextMenuCleanupMap.set(contextMenuElement, () => {
        abortController.abort();
    });
    contextMenuElement.focus();
    setActiveItem(0);
}

export function hideContextMenu(contextMenuElement: HTMLDivElement | null): void {
    if (contextMenuElement) {
        closeContextMenu(contextMenuElement);
    }
}

export function showCopyFeedback(message: string, zIndex: number): void {
    const feedback = document.createElement('div');
    feedback.textContent = message;
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.setAttribute('aria-atomic', 'true');
    const reduceMotion = prefersReducedMotion();
    feedback.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(16, 185, 129, 0.9);
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 12px;
        z-index: ${zIndex};
        animation: ${reduceMotion ? 'none' : 'fadeInOut 1.5s ease forwards'};
        opacity: ${reduceMotion ? '1' : '0'};
    `;

    if (!document.getElementById('copy-feedback-style')) {
        const style = document.createElement('style');
        style.id = 'copy-feedback-style';
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
                15% { opacity: 1; transform: translateX(-50%) translateY(0); }
                85% { opacity: 1; transform: translateX(-50%) translateY(0); }
                100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(feedback);
    setTimeout(() => feedback.remove(), reduceMotion ? 1400 : 1500);
}
