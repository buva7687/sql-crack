import { getRasterScale, svgToBase64 } from './raster';
import { prepareSvgForExport } from './svgPreparation';
import type {
    ExportBackground,
    ExportContext,
    ExportPreviewAsset,
    PngExportOptions,
    SvgExportOptions,
} from './contracts';

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export interface SvgExportArtifact extends ExportPreviewAsset {
    svgData: string;
}

export interface PngExportArtifact extends ExportPreviewAsset {
    base64Data: string;
    dataUrl: string;
}

export function buildSvgExportArtifact(
    context: ExportContext,
    options: SvgExportOptions
): SvgExportArtifact {
    const svgElement = getExportSvgElement(context);
    const { svgClone, width, height } = prepareSvgForExport(svgElement, context.calculateBounds);

    applyExportBackground(svgClone, options.background, context.isDarkTheme());
    applyExportContrastAdjustments(svgClone, options.background);
    if (options.embedFonts) {
        injectFontEmbedding(svgClone);
    }

    const serialized = serializeSvg(svgClone, options.optimize);
    const blob = new Blob([serialized], { type: 'image/svg+xml' });

    return {
        svgData: serialized,
        previewUrl: `data:image/svg+xml;base64,${svgToBase64(serialized)}`,
        width,
        height,
        fileSizeBytes: blob.size,
        metaChips: [
            'SVG preview',
            `${width}×${height}`,
            formatBackgroundChip(options.background),
        ],
    };
}

export async function buildPngExportArtifact(
    context: ExportContext,
    options: PngExportOptions
): Promise<PngExportArtifact> {
    const svgArtifact = buildSvgExportArtifact(context, {
        embedFonts: true,
        optimize: false,
        background: options.background,
    });
    const preferredScale = options.scaleFactor * (options.dpi / 72);
    const effectiveScale = getRasterScale(svgArtifact.width, svgArtifact.height, preferredScale);
    const canvas = await rasterizeSvgToCanvas(svgArtifact.svgData, svgArtifact.width, svgArtifact.height, effectiveScale);
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await canvasToBlob(canvas);

    return {
        previewUrl: dataUrl,
        dataUrl,
        base64Data: dataUrl.split(',')[1],
        width: canvas.width,
        height: canvas.height,
        effectiveScale,
        fileSizeBytes: blob?.size ?? estimateBase64Bytes(dataUrl),
        metaChips: [
            'PNG preview',
            `${canvas.width}×${canvas.height}`,
            `${options.dpi} DPI`,
            formatBackgroundChip(options.background),
        ],
    };
}

function getExportSvgElement(context: ExportContext): SVGSVGElement {
    const svgElement = context.getSvg() || (context.getContainerElement()?.querySelector('svg') as SVGSVGElement | null);
    if (!svgElement) {
        throw new Error('No graph available to export');
    }
    return svgElement;
}

function getBackgroundFill(background: ExportBackground, isDarkTheme: boolean): string | null {
    switch (background) {
        case 'white':
            return '#ffffff';
        case 'dark':
            return isDarkTheme ? '#111111' : '#0f172a';
        case 'transparent':
        default:
            return null;
    }
}

function applyExportBackground(
    svgClone: SVGSVGElement,
    background: ExportBackground,
    isDarkTheme: boolean
): void {
    const fill = getBackgroundFill(background, isDarkTheme);
    if (!fill) {
        return;
    }

    const viewBox = svgClone.getAttribute('viewBox');
    if (!viewBox) {
        return;
    }

    const [x, y, width, height] = viewBox.split(/\s+/).map(Number);
    if (![x, y, width, height].every(Number.isFinite)) {
        return;
    }

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.setAttribute('fill', fill);

    const styleNode = svgClone.querySelector('style');
    if (styleNode?.nextSibling) {
        svgClone.insertBefore(rect, styleNode.nextSibling);
        return;
    }

    svgClone.insertBefore(rect, svgClone.firstChild);
}

function injectFontEmbedding(svgClone: SVGSVGElement): void {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
        text, tspan, foreignObject, div, span {
            font-family: ${FONT_STACK};
        }
    `;
    svgClone.insertBefore(style, svgClone.firstChild);
}

function applyExportContrastAdjustments(
    svgClone: SVGSVGElement,
    background: ExportBackground
): void {
    if (background !== 'dark') {
        return;
    }

    const edgeStroke = '#CBD5E1';
    const gridStroke = 'rgba(255, 255, 255, 0.12)';

    svgClone.querySelectorAll('.edge, .edge-path, path[marker-end="url(#arrowhead)"]').forEach((element) => {
        element.setAttribute('stroke', edgeStroke);
    });
    svgClone.querySelectorAll('#arrowhead polygon, #arrowhead-hover polygon').forEach((element) => {
        element.setAttribute('fill', edgeStroke);
    });
    svgClone.querySelectorAll('#grid-pattern circle').forEach((element) => {
        element.setAttribute('fill', gridStroke);
    });
    svgClone.querySelectorAll('#grid-pattern path').forEach((element) => {
        element.setAttribute('stroke', gridStroke);
    });
}

function serializeSvg(svgClone: SVGSVGElement, optimize: boolean): string {
    const serialized = new XMLSerializer().serializeToString(svgClone);
    if (!optimize) {
        return serialized;
    }

    return serialized
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

async function rasterizeSvgToCanvas(
    svgData: string,
    width: number,
    height: number,
    scale: number
): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas context unavailable');
    }

    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx.scale(scale, scale);

    const image = await loadSvgImage(svgData);
    ctx.drawImage(image, 0, 0);
    return canvas;
}

function loadSvgImage(svgData: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(svgUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(svgUrl);
            const fallback = new Image();
            fallback.onload = () => resolve(fallback);
            fallback.onerror = reject;
            fallback.src = `data:image/svg+xml;base64,${svgToBase64(svgData)}`;
        };
        image.src = svgUrl;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
}

function estimateBase64Bytes(dataUrl: string): number {
    const base64 = dataUrl.split(',')[1] || '';
    return Math.ceil((base64.length * 3) / 4);
}

function formatBackgroundChip(background: ExportBackground): string {
    switch (background) {
        case 'dark':
            return 'Dark bg';
        case 'white':
            return 'White bg';
        case 'transparent':
        default:
            return 'Transparent bg';
    }
}
