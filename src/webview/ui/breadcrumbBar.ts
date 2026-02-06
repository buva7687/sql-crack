// Breadcrumb Bar — Filter/state indicator below toolbar
// Shows active focus mode, search term, column trace, CTE context
// Each segment is clickable to clear that filter. "x" clears all.

export interface BreadcrumbSegment {
    id: string;
    label: string;
    icon?: string;
    onClear: () => void;
}

export interface BreadcrumbBarCallbacks {
    isDarkTheme: () => boolean;
    onClearAll: () => void;
}

let barElement: HTMLDivElement | null = null;
let currentSegments: BreadcrumbSegment[] = [];
let callbacks: BreadcrumbBarCallbacks | null = null;

/**
 * Create the breadcrumb bar element.
 * Returns the bar (initially hidden) to be placed below the toolbar.
 */
export function createBreadcrumbBar(
    container: HTMLElement,
    cb: BreadcrumbBarCallbacks
): HTMLDivElement {
    callbacks = cb;
    const isDark = cb.isDarkTheme();

    barElement = document.createElement('div');
    barElement.id = 'sql-crack-breadcrumb-bar';
    barElement.setAttribute('role', 'navigation');
    barElement.setAttribute('aria-label', 'Active filters');
    barElement.style.cssText = `
        position: absolute;
        top: 56px;
        left: 12px;
        right: 12px;
        display: none;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 8px;
        background: ${isDark ? 'rgba(17, 17, 17, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
        border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
        backdrop-filter: blur(8px);
        z-index: 99;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        flex-wrap: wrap;
    `;

    container.appendChild(barElement);

    // Listen for theme changes
    document.addEventListener('theme-change', ((e: CustomEvent) => {
        if (!barElement) { return; }
        const dark = e.detail.dark;
        barElement.style.background = dark ? 'rgba(17, 17, 17, 0.95)' : 'rgba(255, 255, 255, 0.95)';
        barElement.style.borderColor = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
        renderSegments();
    }) as EventListener);

    return barElement;
}

/**
 * Update the breadcrumb bar with new segments.
 * Pass an empty array to hide the bar.
 */
export function updateBreadcrumbBar(segments: BreadcrumbSegment[]): void {
    currentSegments = segments;
    renderSegments();
}

/**
 * Add a single segment to the breadcrumb bar.
 * If a segment with the same id exists, it is replaced.
 */
export function addBreadcrumbSegment(segment: BreadcrumbSegment): void {
    const idx = currentSegments.findIndex(s => s.id === segment.id);
    if (idx >= 0) {
        currentSegments[idx] = segment;
    } else {
        currentSegments.push(segment);
    }
    renderSegments();
}

/**
 * Remove a segment by id.
 */
export function removeBreadcrumbSegment(id: string): void {
    currentSegments = currentSegments.filter(s => s.id !== id);
    renderSegments();
}

/**
 * Clear all segments and hide the bar.
 */
export function clearBreadcrumbBar(): void {
    currentSegments = [];
    renderSegments();
}

/**
 * Check if the breadcrumb bar is currently visible.
 */
export function isBreadcrumbBarVisible(): boolean {
    return barElement !== null && barElement.style.display !== 'none';
}

function renderSegments(): void {
    if (!barElement || !callbacks) { return; }

    if (currentSegments.length === 0) {
        barElement.style.display = 'none';
        return;
    }

    barElement.style.display = 'flex';
    barElement.innerHTML = '';

    const isDark = callbacks.isDarkTheme();
    const textColor = isDark ? '#E2E8F0' : '#1E293B';
    const mutedColor = isDark ? '#64748B' : '#94A3B8';
    const chipBg = isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.08)';
    const chipColor = isDark ? '#A5B4FC' : '#6366F1';

    // Label
    const label = document.createElement('span');
    label.textContent = 'Filters:';
    label.style.cssText = `
        color: ${mutedColor};
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-right: 4px;
    `;
    barElement.appendChild(label);

    // Render each segment as a chip
    currentSegments.forEach(segment => {
        const chip = document.createElement('span');
        chip.setAttribute('role', 'button');
        chip.setAttribute('aria-label', `Clear ${segment.label} filter`);
        chip.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 8px;
            border-radius: 4px;
            background: ${chipBg};
            color: ${chipColor};
            cursor: pointer;
            transition: background 0.1s;
            font-size: 11px;
        `;

        if (segment.icon) {
            const icon = document.createElement('span');
            icon.textContent = segment.icon;
            icon.style.fontSize = '10px';
            chip.appendChild(icon);
        }

        const text = document.createElement('span');
        text.textContent = segment.label;
        chip.appendChild(text);

        const closeIcon = document.createElement('span');
        closeIcon.textContent = '\u00d7';
        closeIcon.style.cssText = `
            font-size: 13px;
            line-height: 1;
            opacity: 0.7;
            margin-left: 2px;
        `;
        chip.appendChild(closeIcon);

        chip.addEventListener('mouseenter', () => {
            chip.style.background = isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.15)';
        });
        chip.addEventListener('mouseleave', () => {
            chip.style.background = chipBg;
        });

        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            segment.onClear();
            removeBreadcrumbSegment(segment.id);
        });

        barElement!.appendChild(chip);
    });

    // Separator + clear all button (only if multiple segments)
    if (currentSegments.length > 1) {
        const spacer = document.createElement('span');
        spacer.style.flex = '1';
        barElement.appendChild(spacer);

        const clearAll = document.createElement('button');
        clearAll.textContent = 'Clear all';
        clearAll.setAttribute('aria-label', 'Clear all filters');
        clearAll.style.cssText = `
            background: none;
            border: none;
            color: ${mutedColor};
            font-size: 10px;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 3px;
            transition: color 0.1s, background 0.1s;
        `;

        clearAll.addEventListener('mouseenter', () => {
            clearAll.style.color = textColor;
            clearAll.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
        });
        clearAll.addEventListener('mouseleave', () => {
            clearAll.style.color = mutedColor;
            clearAll.style.background = 'none';
        });

        clearAll.addEventListener('click', (e) => {
            e.stopPropagation();
            callbacks!.onClearAll();
            clearBreadcrumbBar();
        });

        barElement.appendChild(clearAll);
    }
}
