import type { FlowNode } from '../types';

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

export function showContextMenu(options: ShowContextMenuOptions): void {
    const { colors, contextMenuElement, event, icons, isDarkTheme, node, onAction } = options;
    if (!contextMenuElement) {
        return;
    }

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
        <div class="ctx-menu-item" data-action="zoom" style="${menuItemStyle}">
            <span style="width: 16px; display: inline-flex;">${icons.search}</span>
            <span>Zoom to node</span>
        </div>
        <div class="ctx-menu-item" data-action="focus-upstream" style="${menuItemStyle}">
            <span style="width: 16px;">↑</span>
            <span>Focus upstream</span>
        </div>
        <div class="ctx-menu-item" data-action="focus-downstream" style="${menuItemStyle}">
            <span style="width: 16px;">↓</span>
            <span>Focus downstream</span>
        </div>
        <div class="ctx-menu-item" data-action="reset-view" style="${menuItemStyle}">
            <span style="width: 16px;">⊡</span>
            <span>Reset view (Esc)</span>
        </div>
        <div style="${separatorStyle}"></div>
    `;

    if ((node.type === 'cte' || node.type === 'subquery') && node.collapsible && node.children && node.children.length > 0) {
        const isExpanded = node.expanded !== false;
        menuItems += `
            <div class="ctx-menu-item" data-action="toggle-expand" style="${menuItemStyle}">
                <span style="width: 16px; display: inline-flex;">${isExpanded ? icons.folderOpen : icons.folderClosed}</span>
                <span>${isExpanded ? 'Collapse children' : 'Expand children'}</span>
            </div>
        `;
    }

    menuItems += `
        <div class="ctx-menu-item" data-action="copy-label" style="${menuItemStyle}">
            <span style="width: 16px; display: inline-flex;">${icons.clipboard}</span>
            <span>Copy node name</span>
        </div>
    `;

    if (node.details && node.details.length > 0) {
        menuItems += `
            <div class="ctx-menu-item" data-action="copy-details" style="${menuItemStyle}">
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

    const items = contextMenuElement.querySelectorAll('.ctx-menu-item');
    items.forEach(item => {
        const itemEl = item as HTMLElement;
        itemEl.addEventListener('mouseenter', () => {
            itemEl.style.background = menuItemHoverBg;
        });
        itemEl.addEventListener('mouseleave', () => {
            itemEl.style.background = 'transparent';
        });
        itemEl.addEventListener('click', clickEvent => {
            clickEvent.stopPropagation();
            const action = itemEl.getAttribute('data-action');
            onAction(action, node);
            if (contextMenuElement) {
                contextMenuElement.style.display = 'none';
            }
        });
    });
}

export function hideContextMenu(contextMenuElement: HTMLDivElement | null): void {
    if (contextMenuElement) {
        contextMenuElement.style.display = 'none';
    }
}

export function showCopyFeedback(message: string, zIndex: number): void {
    const feedback = document.createElement('div');
    feedback.textContent = message;
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
        animation: fadeInOut 1.5s ease forwards;
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
    setTimeout(() => feedback.remove(), 1500);
}
