import { MAX_RASTER_DIMENSION } from './constants';

/** Convert a UTF-8 string to base64 without the deprecated unescape(). */
export function svgToBase64(str: string): string {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export function getRasterScale(width: number, height: number, preferredScale = 2): number {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const widthLimitScale = MAX_RASTER_DIMENSION / safeWidth;
    const heightLimitScale = MAX_RASTER_DIMENSION / safeHeight;
    return Math.max(1, Math.min(preferredScale, widthLimitScale, heightLimitScale));
}
