/**
 * Normalize a numeric "advanced limit" setting: coerce non-numbers to a fallback,
 * round to an integer, and clamp into [min, max]. Shared by the extension host,
 * the visualization panel, and the webview so the three stay in lock-step (they
 * previously carried three identical private copies).
 */
export function normalizeAdvancedLimit(raw: unknown, fallback: number, min: number, max: number): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return fallback;
    }
    const rounded = Math.round(raw);
    return Math.max(min, Math.min(max, rounded));
}
