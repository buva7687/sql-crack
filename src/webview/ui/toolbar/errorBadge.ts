import { ICONS } from '../../../shared/icons';
import { Z_INDEX } from '../../../shared/zIndex';
import { getComponentUiColors } from '../../constants';
import { repositionBreadcrumbBar } from '../breadcrumbBar';

let errorBadgeClickCallback: ((queryIndex: number) => void) | null = null;
let errorCycleIndex = 0;
let currentBadgeErrors: Array<{ queryIndex: number; message: string; line?: number; sourceLine?: string }> = [];
let currentBadgeIsDark = typeof window !== 'undefined' ? window.vscodeTheme !== 'light' : true;

function applyErrorBadgeTheme(badge: HTMLElement, isDark: boolean): void {
    const theme = getComponentUiColors(isDark);
    const background = theme.errorBg;
    const hoverBackground = theme.errorBgHover;
    const borderColor = isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(220, 38, 38, 0.3)';
    const textColor = isDark ? '#fecaca' : '#991b1b';

    badge.dataset.theme = isDark ? 'dark' : 'light';
    badge.style.background = background;
    badge.style.borderColor = borderColor;
    badge.style.color = textColor;

    const icon = badge.querySelector('[data-role="error-badge-icon"]') as HTMLElement | null;
    const label = badge.querySelector('[data-role="error-badge-label"]') as HTMLElement | null;
    if (icon) {
        icon.style.color = textColor;
    }
    if (label) {
        label.style.color = textColor;
    }

    badge.onmouseenter = () => {
        badge.style.background = hoverBackground;
    };
    badge.onmouseleave = () => {
        badge.style.background = background;
    };
}

if (typeof document !== 'undefined') {
    document.addEventListener('theme-change', ((event: CustomEvent<{ dark: boolean }>) => {
        currentBadgeIsDark = Boolean(event.detail?.dark);
        const badge = document.getElementById('sql-crack-error-badge');
        if (badge) {
            applyErrorBadgeTheme(badge, currentBadgeIsDark);
        }
    }) as EventListener);
}

/**
 * Register a callback for when the error badge is clicked.
 * Cycles through error query indices on each click.
 */
export function setErrorBadgeClickHandler(callback: (queryIndex: number) => void): void {
    errorBadgeClickCallback = callback;
}

/**
 * Update or hide the error notification badge in the toolbar.
 */
export function updateErrorBadge(
    errorCount: number,
    errors?: Array<{ queryIndex: number; message: string; line?: number; sourceLine?: string }>
): void {
    const existingBadge = document.getElementById('sql-crack-error-badge');

    if (errorCount === 0) {
        if (existingBadge) {
            existingBadge.remove();
        }
        return;
    }

    currentBadgeErrors = errors || [];
    errorCycleIndex = 0;

    let badge = existingBadge;
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'sql-crack-error-badge';
        badge.style.cssText = `
            position: absolute;
            top: 56px;
            left: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            border-radius: 8px;
            padding: 6px 12px;
            z-index: ${Z_INDEX.badge};
            cursor: pointer;
            transition: background 0.2s;
        `;
        badge.addEventListener('click', () => {
            if (currentBadgeErrors.length > 0 && errorBadgeClickCallback) {
                errorBadgeClickCallback(currentBadgeErrors[errorCycleIndex % currentBadgeErrors.length].queryIndex);
                errorCycleIndex = (errorCycleIndex + 1) % currentBadgeErrors.length;
            }
        });

        const container = document.getElementById('root');
        if (container) {
            container.appendChild(badge);
        }
    }

    const tooltipText = errors?.map(e => {
        const prefix = e.line ? `Q${e.queryIndex + 1} (line ${e.line})` : `Q${e.queryIndex + 1}`;
        let text = `${prefix}: ${e.message}`;
        if (e.sourceLine) {
            text += `\n→ ${e.sourceLine}`;
        }
        return text;
    }).join('\n')
        || `${errorCount} query${errorCount > 1 ? 'ies' : ''} failed to parse`;

    badge.innerHTML = `
        <span data-role="error-badge-icon" style="font-size: 14px; display: inline-flex; width: 14px; height: 14px;">${ICONS.warning}</span>
        <span data-role="error-badge-label" style="font-size: 12px; font-weight: 500;">
            ${errorCount} parse error${errorCount > 1 ? 's' : ''}
        </span>
    `;
    applyErrorBadgeTheme(badge, currentBadgeIsDark);
    badge.title = tooltipText;
    requestAnimationFrame(() => repositionBreadcrumbBar());
}

/**
 * Clear the error badge from the toolbar.
 */
export function clearErrorBadge(): void {
    const badge = document.getElementById('sql-crack-error-badge');
    if (badge) {
        badge.remove();
        repositionBreadcrumbBar();
    }
}
