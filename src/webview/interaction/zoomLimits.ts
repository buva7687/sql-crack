/** Lowest zoom the toolbar, wheel and pinch reach on their own. */
export const MIN_MANUAL_ZOOM = 0.2;

/**
 * Zoom-out floor for the toolbar, wheel and pinch. Fit may zoom further out
 * than the manual minimum to show a large graph; zooming out from there must
 * not jump back in.
 */
export function getMinZoomScale(fitViewScale: number): number {
    return fitViewScale > 0 && Number.isFinite(fitViewScale)
        ? Math.min(MIN_MANUAL_ZOOM, fitViewScale)
        : MIN_MANUAL_ZOOM;
}
