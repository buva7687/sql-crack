import { ICONS } from '../../../shared/icons';
import { Z_INDEX } from '../../../shared/zIndex';
import { repositionBreadcrumbBar } from '../breadcrumbBar';

let errorBadgeClickCallback: ((queryIndex: number) => void) | null = null;
let errorCycleIndex = 0;
let currentBadgeErrors: Array<{ queryIndex: number; message: string; line?: number; sourceLine?: string }> = [];

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
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 8px;
            padding: 6px 12px;
            z-index: ${Z_INDEX.badge};
            cursor: pointer;
            transition: background 0.2s;
        `;
        badge.addEventListener('mouseenter', () => {
            badge!.style.background = 'rgba(239, 68, 68, 0.25)';
        });
        badge.addEventListener('mouseleave', () => {
            badge!.style.background = 'rgba(239, 68, 68, 0.15)';
        });
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
        <span style="color: #f87171; font-size: 14px; display: inline-flex; width: 14px; height: 14px;">${ICONS.warning}</span>
        <span style="color: #fca5a5; font-size: 12px; font-weight: 500;">
            ${errorCount} parse error${errorCount > 1 ? 's' : ''}
        </span>
    `;
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
