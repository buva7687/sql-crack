const BASE_STROKE_ATTR = 'data-node-base-stroke';
const BASE_STROKE_WIDTH_ATTR = 'data-node-base-stroke-width';
const BASE_STROKE_DASHARRAY_ATTR = 'data-node-base-stroke-dasharray';

const observedRects = new WeakSet<SVGRectElement>();

function readAttr(rect: SVGRectElement, name: string): string {
    return rect.getAttribute(name) || '';
}

function hasBaseBorderState(rect: SVGRectElement): boolean {
    return Boolean(
        readAttr(rect, BASE_STROKE_ATTR)
        || readAttr(rect, BASE_STROKE_WIDTH_ATTR)
        || readAttr(rect, BASE_STROKE_DASHARRAY_ATTR)
    );
}

function isDomNode(value: unknown): value is Node {
    return Boolean(value && typeof (value as Node).nodeType === 'number');
}

export function captureNodeBorderState(rect: SVGRectElement): void {
    const stroke = readAttr(rect, 'stroke');
    const strokeWidth = readAttr(rect, 'stroke-width');
    const strokeDasharray = readAttr(rect, 'stroke-dasharray');

    if (stroke) {
        rect.setAttribute(BASE_STROKE_ATTR, stroke);
    }
    if (strokeWidth) {
        rect.setAttribute(BASE_STROKE_WIDTH_ATTR, strokeWidth);
    }
    if (strokeDasharray) {
        rect.setAttribute(BASE_STROKE_DASHARRAY_ATTR, strokeDasharray);
    }
}

export function restoreNodeBorderState(rect: SVGRectElement): void {
    restoreNodeBorderStroke(rect);
    restoreNodeBorderWidth(rect);
    restoreNodeBorderDasharray(rect);
}

export function restoreNodeBorderStroke(rect: SVGRectElement): void {
    const stroke = readAttr(rect, BASE_STROKE_ATTR);

    if (stroke) {
        rect.setAttribute('stroke', stroke);
    } else {
        rect.removeAttribute('stroke');
    }
}

export function restoreNodeBorderWidth(rect: SVGRectElement): void {
    const strokeWidth = readAttr(rect, BASE_STROKE_WIDTH_ATTR);

    if (strokeWidth) {
        rect.setAttribute('stroke-width', strokeWidth);
    } else {
        rect.removeAttribute('stroke-width');
    }
}

export function restoreNodeBorderDasharray(rect: SVGRectElement): void {
    const strokeDasharray = readAttr(rect, BASE_STROKE_DASHARRAY_ATTR);
    if (strokeDasharray) {
        rect.setAttribute('stroke-dasharray', strokeDasharray);
    } else {
        rect.removeAttribute('stroke-dasharray');
    }
}

export function ensureNodeBorderStateObserver(rect: SVGRectElement): void {
    if (observedRects.has(rect)) {
        return;
    }
    observedRects.add(rect);
    captureNodeBorderState(rect);

    if (typeof MutationObserver === 'undefined' || !isDomNode(rect)) {
        return;
    }

    const observer = new MutationObserver(() => {
        if (!hasBaseBorderState(rect)) {
            return;
        }

        const needsStroke = !rect.hasAttribute('stroke');
        const needsStrokeWidth = !rect.hasAttribute('stroke-width');
        const needsDasharray = rect.hasAttribute(BASE_STROKE_DASHARRAY_ATTR) && !rect.hasAttribute('stroke-dasharray');

        if (!needsStroke && !needsStrokeWidth && !needsDasharray) {
            return;
        }

        restoreNodeBorderState(rect);
    });

    observer.observe(rect, {
        attributes: true,
        attributeFilter: ['stroke', 'stroke-width', 'stroke-dasharray'],
    });
}
