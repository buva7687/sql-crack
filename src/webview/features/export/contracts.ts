import type { FlowEdge, FlowNode } from '../../types';

export interface ExportContext {
    getSvg: () => SVGSVGElement | null;
    getContainerElement: () => HTMLElement | null;
    getCurrentNodes: () => FlowNode[];
    getCurrentEdges: () => FlowEdge[];
    isDarkTheme: () => boolean;
    calculateBounds: () => { minX: number; minY: number; width: number; height: number };
}

export type ExportPreviewFormat = 'png' | 'svg' | 'pdf';
export type ExportBackground = 'transparent' | 'white' | 'dark';
export type ExportDpi = 72 | 144 | 300;
export type PdfPageSize = 'A4' | 'Letter';
export type PdfOrientation = 'landscape' | 'portrait';

export interface PngExportOptions {
    scaleFactor: 1 | 2 | 3;
    dpi: ExportDpi;
    background: ExportBackground;
}

export interface SvgExportOptions {
    embedFonts: boolean;
    optimize: boolean;
    background: ExportBackground;
}

export interface PdfExportOptions {
    dpi: ExportDpi;
    background: ExportBackground;
    pageSize: PdfPageSize;
    orientation: PdfOrientation;
}

export interface ExportPreviewState {
    format: ExportPreviewFormat;
    png: PngExportOptions;
    svg: SvgExportOptions;
    pdf: PdfExportOptions;
}

export interface ExportPreviewAsset {
    previewUrl: string;
    width: number;
    height: number;
    fileSizeBytes: number;
    effectiveScale?: number;
    metaChips?: string[];
}

export const DEFAULT_PNG_EXPORT_OPTIONS: PngExportOptions = {
    scaleFactor: 1,
    dpi: 144,
    background: 'transparent',
};

export const DEFAULT_SVG_EXPORT_OPTIONS: SvgExportOptions = {
    embedFonts: true,
    optimize: false,
    background: 'transparent',
};

export const DEFAULT_PDF_EXPORT_OPTIONS: PdfExportOptions = {
    dpi: 144,
    background: 'white',
    pageSize: 'A4',
    orientation: 'landscape',
};
