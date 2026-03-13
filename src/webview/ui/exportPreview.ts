import { getComponentUiColors } from '../constants';
import { escapeHtml } from '../../shared/stringUtils';
import { MONO_FONT_STACK } from '../../shared/themeTokens';
import { Z_INDEX } from '../../shared/zIndex';
import { prefersReducedMotion } from './motion';
import type {
    ExportPreviewAsset,
    ExportPreviewFormat,
    ExportPreviewState,
    PngExportOptions,
    PdfExportOptions,
    SvgExportOptions,
} from '../features/export/contracts';

export interface ExportPreviewCallbacks {
    buildPngPreview: (options: PngExportOptions) => Promise<ExportPreviewAsset>;
    buildSvgPreview: (options: SvgExportOptions) => Promise<ExportPreviewAsset>;
    buildPdfPreview: (options: PdfExportOptions) => Promise<ExportPreviewAsset>;
    savePng: (options: PngExportOptions) => Promise<void>;
    saveSvg: (options: SvgExportOptions) => Promise<void>;
    savePdf: (options: PdfExportOptions) => Promise<void>;
    isDarkTheme: () => boolean;
}

export interface ExportPreviewOptions {
    initialState: ExportPreviewState;
    callbacks: ExportPreviewCallbacks;
}

let exportPreviewAbortController: AbortController | null = null;
let exportPreviewOverlay: HTMLDivElement | null = null;

export function showExportPreview(options: ExportPreviewOptions): void {
    disposeExportPreview();

    exportPreviewAbortController = new AbortController();
    const signal = exportPreviewAbortController.signal;
    const reducedMotion = prefersReducedMotion();
    let state: ExportPreviewState = {
        format: options.initialState.format,
        png: { ...options.initialState.png },
        svg: { ...options.initialState.svg },
        pdf: { ...options.initialState.pdf },
    };
    let requestVersion = 0;

    const palette = getComponentUiColors(options.callbacks.isDarkTheme());
    const overlay = document.createElement('div');
    overlay.id = 'sql-crack-export-preview';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'sql-crack-export-preview-title');
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${options.callbacks.isDarkTheme() ? 'rgba(0, 0, 0, 0.72)' : 'rgba(15, 23, 42, 0.28)'};
        z-index: ${Z_INDEX.dropdownTop + 100};
        backdrop-filter: blur(8px);
    `;

    const shell = document.createElement('div');
    shell.style.cssText = `
        width: min(1120px, calc(100vw - 48px));
        height: min(760px, calc(100vh - 56px));
        display: grid;
        grid-template-columns: minmax(0, 1.7fr) 320px;
        background: ${palette.surfaceElevated};
        border: 1px solid ${palette.border};
        border-radius: 20px;
        box-shadow: ${palette.shadow};
        overflow: hidden;
    `;

    const previewPane = document.createElement('section');
    previewPane.style.cssText = `
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
        background:
            linear-gradient(${options.callbacks.isDarkTheme() ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255,255,255,0.88)'},
            ${options.callbacks.isDarkTheme() ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255,255,255,0.88)'}),
            radial-gradient(circle at top left, ${palette.accentBg} 0%, transparent 44%);
    `;

    const previewHeader = document.createElement('div');
    previewHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 20px 24px 14px;
        border-bottom: 1px solid ${palette.border};
    `;
    previewHeader.innerHTML = `
        <div>
            <div id="sql-crack-export-preview-title" style="font-size: 18px; font-weight: 700; color: ${palette.textBright};">Export Preview</div>
            <div style="font-size: 12px; color: ${palette.textMuted}; margin-top: 4px;">Preview the graph before saving it out.</div>
        </div>
    `;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close export preview');
    closeButton.textContent = '×';
    closeButton.style.cssText = `
        width: 36px;
        height: 36px;
        border-radius: 999px;
        border: 1px solid ${palette.border};
        background: ${palette.surface};
        color: ${palette.text};
        cursor: pointer;
        font-size: 24px;
        line-height: 1;
        transition: ${reducedMotion ? 'none' : 'transform 0.15s ease, background 0.15s ease'};
    `;
    previewHeader.appendChild(closeButton);

    const previewStage = document.createElement('div');
    previewStage.style.cssText = `
        flex: 1;
        min-height: 0;
        padding: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    const previewSurface = document.createElement('div');
    previewSurface.style.cssText = `
        width: 100%;
        height: 100%;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px dashed ${palette.border};
        border-radius: 18px;
        background:
            linear-gradient(45deg, ${palette.surface} 25%, transparent 25%),
            linear-gradient(-45deg, ${palette.surface} 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, ${palette.surface} 75%),
            linear-gradient(-45deg, transparent 75%, ${palette.surface} 75%);
        background-size: 24px 24px;
        background-position: 0 0, 0 12px, 12px -12px, -12px 0px;
        overflow: auto;
    `;

    const previewImage = document.createElement('img');
    previewImage.alt = 'Export preview';
    previewImage.style.cssText = `
        display: block;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 12px;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
    `;
    previewSurface.appendChild(previewImage);
    previewStage.appendChild(previewSurface);

    const previewMeta = document.createElement('div');
    previewMeta.style.cssText = `
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        flex-shrink: 0;
        padding: 0 24px 20px;
        color: ${palette.textMuted};
        font-size: 12px;
    `;

    const sidebar = document.createElement('aside');
    sidebar.style.cssText = `
        display: flex;
        flex-direction: column;
        min-width: 0;
        border-left: 1px solid ${palette.border};
        background: ${palette.surface};
    `;

    const form = document.createElement('div');
    form.style.cssText = `
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 20px;
        color: ${palette.text};
        font-size: 13px;
    `;

    const buildControlHtml = (): string => {
        const pngChecked = state.format === 'png' ? 'checked' : '';
        const svgChecked = state.format === 'svg' ? 'checked' : '';
        const pdfChecked = state.format === 'pdf' ? 'checked' : '';
        const pngHidden = state.format === 'png' ? '' : 'display:none;';
        const svgHidden = state.format === 'svg' ? '' : 'display:none;';
        const pdfHidden = state.format === 'pdf' ? '' : 'display:none;';

        return `
            <div style="display:flex; gap:8px; margin-bottom:18px;">
                <label style="flex:1; cursor:pointer;">
                    <input type="radio" name="export-format" value="png" ${pngChecked} style="display:none;">
                    <span style="display:block; padding:10px 12px; border-radius:12px; border:1px solid ${palette.border}; background:${state.format === 'png' ? palette.accentBg : palette.surfaceElevated}; color:${state.format === 'png' ? palette.textBright : palette.text}; font-weight:600; text-align:center;">PNG</span>
                </label>
                <label style="flex:1; cursor:pointer;">
                    <input type="radio" name="export-format" value="svg" ${svgChecked} style="display:none;">
                    <span style="display:block; padding:10px 12px; border-radius:12px; border:1px solid ${palette.border}; background:${state.format === 'svg' ? palette.accentBg : palette.surfaceElevated}; color:${state.format === 'svg' ? palette.textBright : palette.text}; font-weight:600; text-align:center;">SVG</span>
                </label>
                <label style="flex:1; cursor:pointer;">
                    <input type="radio" name="export-format" value="pdf" ${pdfChecked} style="display:none;">
                    <span style="display:block; padding:10px 12px; border-radius:12px; border:1px solid ${palette.border}; background:${state.format === 'pdf' ? palette.accentBg : palette.surfaceElevated}; color:${state.format === 'pdf' ? palette.textBright : palette.text}; font-weight:600; text-align:center;">PDF</span>
                </label>
            </div>

            <div id="export-preview-png-controls" style="${pngHidden}">
                ${renderSelectControl('Scale Factor', 'png-scale', String(state.png.scaleFactor), [
                    ['1', '1x'],
                    ['2', '2x'],
                    ['3', '3x'],
                ], palette)}
                ${renderSelectControl('DPI', 'png-dpi', String(state.png.dpi), [
                    ['72', '72'],
                    ['144', '144'],
                    ['300', '300'],
                ], palette)}
                ${renderSelectControl('Background', 'png-background', state.png.background, [
                    ['transparent', 'Transparent'],
                    ['white', 'White'],
                    ['dark', 'Dark'],
                ], palette)}
            </div>

            <div id="export-preview-svg-controls" style="${svgHidden}">
                ${renderSelectControl('Background', 'svg-background', state.svg.background, [
                    ['transparent', 'Transparent'],
                    ['white', 'White'],
                    ['dark', 'Dark'],
                ], palette)}
                ${renderToggleControl('Embed Fonts', 'svg-embed-fonts', state.svg.embedFonts, 'Best-effort font stack embedding for shared exports.', palette)}
                ${renderToggleControl('Optimize Markup', 'svg-optimize', state.svg.optimize, 'Trim excess whitespace from the SVG payload.', palette)}
            </div>

            <div id="export-preview-pdf-controls" style="${pdfHidden}">
                ${renderSelectControl('Page Size', 'pdf-page-size', state.pdf.pageSize, [
                    ['A4', 'A4'],
                    ['Letter', 'Letter'],
                ], palette)}
                ${renderSelectControl('Orientation', 'pdf-orientation', state.pdf.orientation, [
                    ['landscape', 'Landscape'],
                    ['portrait', 'Portrait'],
                ], palette)}
                ${renderSelectControl('DPI', 'pdf-dpi', String(state.pdf.dpi), [
                    ['72', '72'],
                    ['144', '144'],
                    ['300', '300'],
                ], palette)}
                ${renderSelectControl('Page Background', 'pdf-background', state.pdf.background, [
                    ['white', 'White'],
                    ['dark', 'Dark'],
                ], palette)}
            </div>
        `;
    };

    form.innerHTML = buildControlHtml();

    const footer = document.createElement('div');
    footer.style.cssText = `
        display: flex;
        gap: 10px;
        flex-shrink: 0;
        padding: 18px 20px 20px;
        border-top: 1px solid ${palette.border};
    `;

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = buttonStyle(palette, false);

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.textContent = getSaveButtonLabel(state.format);
    saveButton.style.cssText = buttonStyle(palette, true);

    footer.append(cancelButton, saveButton);
    previewPane.append(previewHeader, previewStage, previewMeta);
    sidebar.append(form, footer);
    shell.append(previewPane, sidebar);
    overlay.appendChild(shell);
    document.body.appendChild(overlay);
    exportPreviewOverlay = overlay;

    const close = (): void => disposeExportPreview();

    const setLoading = (loading: boolean): void => {
        saveButton.disabled = loading;
        saveButton.style.pointerEvents = loading ? 'none' : '';
        saveButton.textContent = loading ? 'Rendering…' : getSaveButtonLabel(state.format);
        if (loading) {
            previewMeta.textContent = 'Updating preview…';
        }
    };

    const refreshPreview = async (): Promise<void> => {
        requestVersion += 1;
        const currentVersion = requestVersion;
        setLoading(true);
        try {
            const asset = state.format === 'png'
                ? await options.callbacks.buildPngPreview(state.png)
                : state.format === 'svg'
                    ? await options.callbacks.buildSvgPreview(state.svg)
                    : await options.callbacks.buildPdfPreview(state.pdf);
            if (currentVersion !== requestVersion) {
                return;
            }
            previewImage.src = asset.previewUrl;
            previewMeta.innerHTML = renderMeta(asset, state.format, palette);
        } catch (error) {
            if (currentVersion !== requestVersion) {
                return;
            }
            previewMeta.innerHTML = `<span style="color:${palette.accentSoft};">Preview failed: ${escapeHtml(String(error instanceof Error ? error.message : error))}</span>`;
        } finally {
            if (currentVersion === requestVersion) {
                setLoading(false);
            }
        }
    };

    const syncStateFromControls = (): void => {
        const selectedFormat = (form.querySelector('input[name="export-format"]:checked') as HTMLInputElement | null)?.value;
        if (selectedFormat === 'png' || selectedFormat === 'svg' || selectedFormat === 'pdf') {
            state.format = selectedFormat;
        }

        const pngScale = Number((form.querySelector('#png-scale') as HTMLSelectElement | null)?.value || state.png.scaleFactor);
        const pngDpi = Number((form.querySelector('#png-dpi') as HTMLSelectElement | null)?.value || state.png.dpi);
        const pngBackground = (form.querySelector('#png-background') as HTMLSelectElement | null)?.value as PngExportOptions['background'] | undefined;
        const svgBackground = (form.querySelector('#svg-background') as HTMLSelectElement | null)?.value as SvgExportOptions['background'] | undefined;
        const pdfBackground = (form.querySelector('#pdf-background') as HTMLSelectElement | null)?.value as PdfExportOptions['background'] | undefined;
        const pdfDpi = Number((form.querySelector('#pdf-dpi') as HTMLSelectElement | null)?.value || state.pdf.dpi);
        const pdfPageSize = (form.querySelector('#pdf-page-size') as HTMLSelectElement | null)?.value as PdfExportOptions['pageSize'] | undefined;
        const pdfOrientation = (form.querySelector('#pdf-orientation') as HTMLSelectElement | null)?.value as PdfExportOptions['orientation'] | undefined;

        state = {
            ...state,
            png: {
                scaleFactor: normalizePngScale(pngScale),
                dpi: normalizePngDpi(pngDpi),
                background: pngBackground || state.png.background,
            },
            svg: {
                embedFonts: Boolean((form.querySelector('#svg-embed-fonts') as HTMLInputElement | null)?.checked),
                optimize: Boolean((form.querySelector('#svg-optimize') as HTMLInputElement | null)?.checked),
                background: svgBackground || state.svg.background,
            },
            pdf: {
                dpi: normalizeExportDpi(pdfDpi),
                background: normalizePdfBackground(pdfBackground),
                pageSize: normalizePdfPageSize(pdfPageSize),
                orientation: normalizePdfOrientation(pdfOrientation),
            },
        };

        form.innerHTML = buildControlHtml();
        bindFormEvents();
        void refreshPreview();
    };

    const bindFormEvents = (): void => {
        form.querySelectorAll('input, select').forEach((control) => {
            control.addEventListener('change', syncStateFromControls, { signal });
        });
    };

    bindFormEvents();

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            close();
        }
    }, { signal });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        }
    }, { signal });
    closeButton.addEventListener('click', close, { signal });
    cancelButton.addEventListener('click', close, { signal });
    saveButton.addEventListener('click', async () => {
        try {
            if (state.format === 'png') {
                await options.callbacks.savePng(state.png);
            } else if (state.format === 'svg') {
                await options.callbacks.saveSvg(state.svg);
            } else {
                await options.callbacks.savePdf(state.pdf);
            }
            close();
        } catch (error) {
            previewMeta.innerHTML = `<span style="color:${palette.accentSoft};">Save failed: ${escapeHtml(String(error instanceof Error ? error.message : error))}</span>`;
        }
    }, { signal });

    document.addEventListener('theme-change', () => {
        if (exportPreviewOverlay) {
            showExportPreview({ initialState: state, callbacks: options.callbacks });
        }
    }, { signal });

    requestAnimationFrame(() => {
        closeButton.focus();
    });
    void refreshPreview();
}

export function disposeExportPreview(): void {
    exportPreviewAbortController?.abort();
    exportPreviewAbortController = null;
    exportPreviewOverlay?.remove();
    exportPreviewOverlay = null;
}

function renderSelectControl(
    label: string,
    id: string,
    currentValue: string,
    options: Array<[string, string]>,
    palette: ReturnType<typeof getComponentUiColors>
): string {
    return `
        <label for="${id}" style="display:block; margin-bottom:16px;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${palette.textMuted}; margin-bottom:8px;">${label}</div>
            <select id="${id}" style="width:100%; border-radius:12px; border:1px solid ${palette.border}; background:${palette.surfaceElevated}; color:${palette.text}; padding:12px; font-size:13px;">
                ${options.map(([value, text]) => `<option value="${value}" ${value === currentValue ? 'selected' : ''}>${text}</option>`).join('')}
            </select>
        </label>
    `;
}

function renderToggleControl(
    label: string,
    id: string,
    checked: boolean,
    description: string,
    palette: ReturnType<typeof getComponentUiColors>
): string {
    return `
        <label for="${id}" style="display:block; margin-bottom:16px; border:1px solid ${palette.border}; border-radius:14px; padding:12px; background:${palette.surfaceElevated};">
            <div style="display:flex; align-items:flex-start; gap:10px;">
                <input id="${id}" type="checkbox" ${checked ? 'checked' : ''} style="margin-top:2px;">
                <div>
                    <div style="font-weight:600; color:${palette.textBright};">${label}</div>
                    <div style="font-size:12px; color:${palette.textMuted}; margin-top:4px;">${description}</div>
                </div>
            </div>
        </label>
    `;
}

function renderMeta(
    asset: ExportPreviewAsset,
    format: ExportPreviewFormat,
    palette: ReturnType<typeof getComponentUiColors>
): string {
    const chips = asset.metaChips ? [...asset.metaChips, formatBytes(asset.fileSizeBytes)] : [
        `${format.toUpperCase()} preview`,
        `${asset.width}×${asset.height}`,
        `${formatBytes(asset.fileSizeBytes)}`,
    ];
    if (typeof asset.effectiveScale === 'number') {
        chips.push(`${asset.effectiveScale.toFixed(2)}x raster`);
    }
    return chips
        .map((chip) => `<span style="padding:6px 10px; border-radius:999px; border:1px solid ${palette.border}; background:${palette.surface}; color:${palette.text}; font-family:${MONO_FONT_STACK};">${chip}</span>`)
        .join('');
}

function buttonStyle(palette: ReturnType<typeof getComponentUiColors>, primary: boolean): string {
    return `
        flex: 1;
        border-radius: 14px;
        border: 1px solid ${primary ? palette.accent : palette.border};
        background: ${primary ? palette.accent : palette.surfaceElevated};
        color: ${primary ? '#ffffff' : palette.text};
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        padding: 12px 14px;
    `;
}

function normalizePngScale(value: number): PngExportOptions['scaleFactor'] {
    if (value >= 3) { return 3; }
    if (value >= 2) { return 2; }
    return 1;
}

function normalizePngDpi(value: number): PngExportOptions['dpi'] {
    return normalizeExportDpi(value);
}

function normalizeExportDpi(value: number): 72 | 144 | 300 {
    if (value >= 300) { return 300; }
    if (value >= 144) { return 144; }
    return 72;
}

function normalizePdfPageSize(value?: string): PdfExportOptions['pageSize'] {
    return value === 'Letter' ? 'Letter' : 'A4';
}

function normalizePdfOrientation(value?: string): PdfExportOptions['orientation'] {
    return value === 'portrait' ? 'portrait' : 'landscape';
}

function normalizePdfBackground(value?: string): PdfExportOptions['background'] {
    return value === 'dark' ? 'dark' : 'white';
}

function getSaveButtonLabel(format: ExportPreviewFormat): string {
    switch (format) {
        case 'svg':
            return 'Save SVG';
        case 'pdf':
            return 'Save PDF';
        case 'png':
        default:
            return 'Save PNG';
    }
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
