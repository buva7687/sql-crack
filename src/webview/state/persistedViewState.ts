import type { LayoutHistorySnapshot } from './rendererState';

/**
 * Validation for view state restored from persisted storage.
 *
 * Persisted UI state round-trips through workspaceState on disk, so its values
 * are only as trustworthy as that file. Every producer of `state.scale` clamps
 * its own output, which means a corrupt value can only enter through a restore
 * path — and those assign scale/offsets straight onto renderer state, where a
 * NaN or non-positive scale emits an invalid SVG transform (`scale(NaN)`) or
 * mirrors the graph (`scale(-1)`), and NaN viewport bounds defeat
 * virtualization.
 *
 * These helpers live in their own DOM-free module so they can be unit tested
 * directly; `src/webview/index.ts` cannot be imported under Jest.
 */

/** Geometry shared by tab view state and layout-history snapshots. */
interface ViewportGeometry {
    scale: number;
    offsetX: number;
    offsetY: number;
}

export interface LayoutHistoryStateLike {
    history: LayoutHistorySnapshot[];
    index: number;
}

function hasValidViewportGeometry(value: unknown): value is ViewportGeometry {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value as Partial<ViewportGeometry>;
    return typeof candidate.scale === 'number' && Number.isFinite(candidate.scale) && candidate.scale > 0
        && typeof candidate.offsetX === 'number' && Number.isFinite(candidate.offsetX)
        && typeof candidate.offsetY === 'number' && Number.isFinite(candidate.offsetY);
}

/** A restored tab viewport must carry finite offsets and a positive scale. */
export function isValidTabViewState(value: unknown): boolean {
    return hasValidViewportGeometry(value);
}

const VALID_LAYOUT_TYPES: readonly string[] = ['vertical', 'horizontal', 'compact', 'force', 'radial'];
const VALID_FOCUS_MODES: readonly string[] = ['all', 'upstream', 'downstream'];
const VALID_DIALECTS: readonly string[] = [
    'MySQL', 'PostgreSQL', 'TransactSQL', 'MariaDB', 'SQLite', 'Snowflake', 'BigQuery',
    'Hive', 'Redshift', 'Athena', 'Trino', 'Oracle', 'Teradata',
];

/** `layout` is handed to switchLayout() and drives edge-path geometry. */
export function isValidLayoutType(value: unknown): boolean {
    return typeof value === 'string' && VALID_LAYOUT_TYPES.includes(value);
}

/** `focusMode` is handed to setFocusMode(). */
export function isValidFocusMode(value: unknown): boolean {
    return typeof value === 'string' && VALID_FOCUS_MODES.includes(value);
}

/**
 * A restored dialect is assigned to the dialect selector and can trigger a
 * re-parse, so it must be one the parser actually supports.
 */
export function isValidDialect(value: unknown): boolean {
    return typeof value === 'string' && VALID_DIALECTS.includes(value);
}

/**
 * Cosmetic toggles are only ever read in boolean position, so coerce rather
 * than discarding an otherwise-good record over a stray `"true"`.
 */
export function toBoolean(value: unknown): boolean {
    return value === true;
}

function isFiniteNumber(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Restored node positions are written straight onto node coordinates, and
 * `applyNodePositionsToDom` then derives a transform from them, so a NaN here
 * reaches the DOM as `translate(NaN, NaN)`. A null/missing entry throws when
 * the restore maps over the array.
 */
function isValidNodePosition(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value as { id?: unknown; x?: unknown; y?: unknown };
    return typeof candidate.id === 'string' && isFiniteNumber(candidate.x) && isFiniteNumber(candidate.y);
}

/** Cloud offsets are keyed by nodeId and applied as raw coordinate deltas. */
function isValidCloudOffset(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value as { nodeId?: unknown; offsetX?: unknown; offsetY?: unknown };
    return typeof candidate.nodeId === 'string'
        && isFiniteNumber(candidate.offsetX)
        && isFiniteNumber(candidate.offsetY);
}

/**
 * Layout-history snapshots are replayed both immediately on restore and by
 * later undo/redo, so malformed entries must not survive the restore.
 *
 * Every field of LayoutHistorySnapshot is checked, because the restore assigns
 * all of them onto renderer state:
 *  - scale/offsetX/offsetY  -> the SVG transform
 *  - selectedNodeId         -> selectNode() and applyFocusMode()
 *  - focusMode/layoutType   -> renderer state; layoutType also drives
 *                              switchLayout() and edge-path geometry
 *  - focusModeEnabled       -> gates focus mode on restore
 *  - nodePositions          -> node coordinates, then DOM transforms
 *  - cloudOffsets           -> cloud placement
 */
export function isValidLayoutHistorySnapshot(value: unknown): boolean {
    if (!hasValidViewportGeometry(value)) {
        return false;
    }
    const candidate = value as Partial<LayoutHistorySnapshot>;

    if (candidate.selectedNodeId !== null && typeof candidate.selectedNodeId !== 'string') {
        return false;
    }
    if (typeof candidate.focusModeEnabled !== 'boolean') {
        return false;
    }
    if (!isValidFocusMode(candidate.focusMode) || !isValidLayoutType(candidate.layoutType)) {
        return false;
    }

    return Array.isArray(candidate.nodePositions) && candidate.nodePositions.every(isValidNodePosition)
        && Array.isArray(candidate.cloudOffsets) && candidate.cloudOffsets.every(isValidCloudOffset);
}

/**
 * Return a trustworthy history stack, or null when the stored one is
 * malformed. Any bad frame invalidates the whole stack: dropping individual
 * frames would silently reorder undo/redo relative to the stored index.
 */
export function sanitizeLayoutHistory(value: unknown): LayoutHistoryStateLike | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const candidate = value as Partial<LayoutHistoryStateLike>;
    if (!Array.isArray(candidate.history) || !candidate.history.every(isValidLayoutHistorySnapshot)) {
        return null;
    }
    const index = candidate.index;
    if (!Number.isInteger(index) || (index as number) < -1 || (index as number) >= candidate.history.length) {
        return null;
    }
    return candidate as LayoutHistoryStateLike;
}

/** Empty stack used when the persisted history cannot be trusted. */
export function emptyLayoutHistory(): LayoutHistoryStateLike {
    return { history: [], index: -1 };
}

/**
 * A restored query index must be a non-negative integer. `NaN` is the case
 * that matters: it clamps to `NaN` through Math.min/Math.max and then slips
 * past `newIndex < 0 || newIndex >= length` because every NaN comparison is
 * false, leaving `currentQueryIndex` as NaN and crashing the next render.
 */
export function isValidQueryIndex(value: unknown): boolean {
    return Number.isInteger(value) && (value as number) >= 0;
}
