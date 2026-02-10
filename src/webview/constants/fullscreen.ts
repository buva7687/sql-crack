/**
 * Fullscreen mode element definitions — single source of truth.
 *
 * toggleFullscreen() in renderer.ts builds its hide/show list from these
 * constants plus the dynamic `[data-fullscreen-hide]` attribute query.
 * Keeping them here avoids duplicated lists and makes them testable
 * without pulling in heavy renderer dependencies (d3, dagre, etc.).
 */

/** Element IDs to hide in fullscreen mode. */
export const FULLSCREEN_HIDE_IDS = [
    'sql-crack-toolbar',
    'sql-crack-actions',
    'batch-tabs',
    'sql-crack-error-badge',
    'sql-crack-breadcrumb-bar',
    'sql-crack-toolbar-wrapper',
] as const;

/** CSS class selectors for panels to hide in fullscreen mode. */
export const FULLSCREEN_HIDE_SELECTORS = [
    '.breadcrumb-panel',
    '.details-panel',
    '.stats-panel',
    '.hints-panel',
    '.legend-panel',
    '.sql-preview-panel',
] as const;
