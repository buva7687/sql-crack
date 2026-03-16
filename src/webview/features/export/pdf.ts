import * as jspdfUmd from 'jspdf/dist/jspdf.umd.min.js';
import { buildPngExportArtifact } from './artifacts';
import type {
    ExportBackground,
    ExportContext,
    ExportPreviewAsset,
    PdfExportOptions,
    PdfPageSize,
} from './contracts';

const PDF_PAGE_SIZES: Record<PdfPageSize, readonly [number, number]> = {
    A4: [595.28, 841.89],
    Letter: [612, 792],
};

const { jsPDF } = jspdfUmd as { jsPDF: typeof import('jspdf').jsPDF };

const PREVIEW_MARGIN_POINTS = 28;

export interface PdfExportArtifact extends ExportPreviewAsset {
    base64Data: string;
}

export interface PdfPageDimensions {
    widthPoints: number;
    heightPoints: number;
}

export interface PdfBinaryBuildOptions {
    jpegDataUrl: string;
    pageWidthPoints: number;
    pageHeightPoints: number;
    orientation: PdfExportOptions['orientation'];
}

export function getPdfPageDimensions(options: Pick<PdfExportOptions, 'pageSize' | 'orientation'>): PdfPageDimensions {
    const [baseWidth, baseHeight] = PDF_PAGE_SIZES[options.pageSize];
    if (options.orientation === 'landscape') {
        return {
            widthPoints: baseHeight,
            heightPoints: baseWidth,
        };
    }

    return {
        widthPoints: baseWidth,
        heightPoints: baseHeight,
    };
}

export async function buildPdfExportArtifact(
    context: ExportContext,
    options: PdfExportOptions
): Promise<PdfExportArtifact> {
    const graphRaster = await buildPngExportArtifact(context, {
        scaleFactor: 1,
        dpi: options.dpi,
        background: options.background,
    });
    const page = getPdfPageDimensions(options);
    const pageCanvas = await buildPdfPageCanvas(
        graphRaster.previewUrl,
        graphRaster.width,
        graphRaster.height,
        options,
        page
    );
    const jpegDataUrl = pageCanvas.toDataURL('image/jpeg', 0.92);
    const pdfBuffer = buildPdfArrayBufferFromJpegData({
        jpegDataUrl,
        pageWidthPoints: page.widthPoints,
        pageHeightPoints: page.heightPoints,
        orientation: options.orientation,
    });

    return {
        base64Data: arrayBufferToBase64(pdfBuffer),
        previewUrl: pageCanvas.toDataURL('image/png'),
        width: Math.round(page.widthPoints),
        height: Math.round(page.heightPoints),
        fileSizeBytes: pdfBuffer.byteLength,
        metaChips: [
            'PDF preview',
            `${options.pageSize} ${options.orientation}`,
            `${Math.round(page.widthPoints)}×${Math.round(page.heightPoints)} pt`,
            `${options.dpi} DPI`,
        ],
    };
}

export function buildPdfArrayBufferFromJpegData(options: PdfBinaryBuildOptions): ArrayBuffer {
    const pdf = new jsPDF({
        orientation: options.orientation,
        unit: 'pt',
        format: [options.pageWidthPoints, options.pageHeightPoints],
        compress: false,
        putOnlyUsedFonts: true,
    });

    pdf.setDocumentProperties({
        title: 'SQL Flow Export',
        subject: 'SQL Crack graph export',
        creator: 'SQL Crack',
        author: 'SQL Crack',
    });
    pdf.addImage(
        options.jpegDataUrl,
        'JPEG',
        0,
        0,
        options.pageWidthPoints,
        options.pageHeightPoints,
        undefined,
        'FAST'
    );

    return pdf.output('arraybuffer');
}

async function buildPdfPageCanvas(
    previewUrl: string,
    sourceWidth: number,
    sourceHeight: number,
    options: PdfExportOptions,
    page: PdfPageDimensions
): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    const dpiScale = options.dpi / 72;
    canvas.width = Math.max(1, Math.round(page.widthPoints * dpiScale));
    canvas.height = Math.max(1, Math.round(page.heightPoints * dpiScale));

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas context unavailable');
    }

    ctx.fillStyle = getPdfPageFill(options.background);
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const image = await loadImage(previewUrl);
    const margin = Math.round(PREVIEW_MARGIN_POINTS * dpiScale);
    const maxWidth = Math.max(1, canvas.width - (margin * 2));
    const maxHeight = Math.max(1, canvas.height - (margin * 2));
    const fitScale = Math.min(maxWidth / Math.max(1, sourceWidth), maxHeight / Math.max(1, sourceHeight), 1);
    const drawWidth = Math.max(1, Math.round(sourceWidth * fitScale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * fitScale));
    const x = Math.round((canvas.width - drawWidth) / 2);
    const y = Math.round((canvas.height - drawHeight) / 2);

    ctx.drawImage(image, x, y, drawWidth, drawHeight);
    return canvas;
}

function getPdfPageFill(background: ExportBackground): string {
    switch (background) {
        case 'dark':
            return '#111111';
        case 'transparent':
        case 'white':
        default:
            return '#ffffff';
    }
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
