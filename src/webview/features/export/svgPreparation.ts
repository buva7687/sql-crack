import {
    EXPORT_BASE_SVG_STYLE,
    EXPORT_INLINE_STYLE_PROPERTIES,
    EXPORT_SVG_PADDING,
    MAX_EXPORT_DIMENSION,
} from './constants';

export interface ExportBounds {
    minX: number;
    minY: number;
    width: number;
    height: number;
}

export interface PreparedSvgExport {
    svgClone: SVGSVGElement;
    width: number;
    height: number;
}

export function prepareSvgForExport(
    svgElement: SVGSVGElement,
    calculateBounds: () => ExportBounds
): PreparedSvgExport {
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
    const bounds = calculateBounds();
    const rawWidth = Math.max(1, Math.ceil(bounds.width + EXPORT_SVG_PADDING * 2));
    const rawHeight = Math.max(1, Math.ceil(bounds.height + EXPORT_SVG_PADDING * 2));
    const scaleDown = Math.min(1, MAX_EXPORT_DIMENSION / rawWidth, MAX_EXPORT_DIMENSION / rawHeight);
    const width = Math.max(1, Math.floor(rawWidth * scaleDown));
    const height = Math.max(1, Math.floor(rawHeight * scaleDown));

    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));
    svgClone.setAttribute(
        'viewBox',
        `${bounds.minX - EXPORT_SVG_PADDING} ${bounds.minY - EXPORT_SVG_PADDING} ${rawWidth} ${rawHeight}`
    );
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    resetMainGroupTransform(svgClone);
    injectExportBaseStyle(svgClone);
    embedInlineStyles(svgClone, svgElement);
    stripForeignObjects(svgClone);

    return { svgClone, width, height };
}

function resetMainGroupTransform(svgClone: SVGSVGElement): void {
    const mainGroupClone = svgClone.querySelector('g');
    if (mainGroupClone) {
        mainGroupClone.removeAttribute('transform');
    }
}

function injectExportBaseStyle(svgClone: SVGSVGElement): void {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = EXPORT_BASE_SVG_STYLE;
    svgClone.insertBefore(style, svgClone.firstChild);
}

function stripForeignObjects(svgClone: SVGSVGElement): void {
    const foreignObjects = svgClone.querySelectorAll('foreignObject');
    foreignObjects.forEach((foreignObject) => foreignObject.remove());
}

function embedInlineStyles(element: Element, originalSvgElement: SVGSVGElement): void {
    let originalElement: Element | null = null;
    const dataId = element.getAttribute('data-id');
    if (dataId) {
        originalElement = originalSvgElement.querySelector(`[data-id="${CSS.escape(dataId)}"]`);
    }

    if (!originalElement && element.classList && element.classList.length > 0) {
        const firstClass = element.classList[0];
        if (firstClass) {
            try {
                const escapedClass = firstClass.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
                originalElement = originalSvgElement.querySelector(`.${escapedClass}`) ||
                    document.querySelector(`.${escapedClass}`);
            } catch (e) {
                if (typeof window !== 'undefined' && Boolean((window as any).debugLogging)) {
                    console.debug('[renderer] Invalid CSS selector, skipping:', e);
                }
            }
        }
    }

    if (originalElement) {
        const originalStyle = window.getComputedStyle(originalElement);
        EXPORT_INLINE_STYLE_PROPERTIES.forEach((property) => {
            const value = originalStyle.getPropertyValue(property);
            if (value && value !== 'none' && value !== '') {
                (element as HTMLElement).style.setProperty(property, value);
            }
        });
    }

    Array.from(element.children).forEach((child) => embedInlineStyles(child, originalSvgElement));
}
