import type { FlowEdge, FlowNode } from '../types';

export interface ExportContext {
    getSvg: () => SVGSVGElement | null;
    getContainerElement: () => HTMLElement | null;
    getCurrentNodes: () => FlowNode[];
    getCurrentEdges: () => FlowEdge[];
    isDarkTheme: () => boolean;
    calculateBounds: () => { minX: number; minY: number; width: number; height: number };
}

const MAX_EXPORT_DIMENSION = 4096;
const MAX_RASTER_DIMENSION = 4096;

function showExportToast(message: string, isDarkTheme: boolean, isError = false): void {
    const existing = document.getElementById('sql-flow-export-toast');
    if (existing) {
        existing.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'sql-flow-export-toast';
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.style.cssText = `
        position: fixed;
        top: 72px;
        right: 20px;
        z-index: 10001;
        border-radius: 8px;
        border: 1px solid ${isError ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'};
        background: ${isError
            ? (isDarkTheme ? 'rgba(127, 29, 29, 0.9)' : 'rgba(254, 226, 226, 0.95)')
            : (isDarkTheme ? 'rgba(6, 78, 59, 0.9)' : 'rgba(220, 252, 231, 0.95)')};
        color: ${isError
            ? (isDarkTheme ? '#fecaca' : '#7f1d1d')
            : (isDarkTheme ? '#d1fae5' : '#065f46')};
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28);
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        opacity: 0;
        transition: opacity 0.18s ease;
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });
    window.setTimeout(() => {
        toast.style.opacity = '0';
        window.setTimeout(() => toast.remove(), 180);
    }, 1500);
}

function prepareSvgForExport(
    svgElement: SVGSVGElement,
    calculateBounds: () => { minX: number; minY: number; width: number; height: number }
): { svgClone: SVGSVGElement; width: number; height: number } {
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
    const bounds = calculateBounds();
    const padding = 40;
    const rawWidth = Math.max(1, Math.ceil(bounds.width + padding * 2));
    const rawHeight = Math.max(1, Math.ceil(bounds.height + padding * 2));
    const scaleDown = Math.min(1, MAX_EXPORT_DIMENSION / rawWidth, MAX_EXPORT_DIMENSION / rawHeight);
    const width = Math.max(1, Math.floor(rawWidth * scaleDown));
    const height = Math.max(1, Math.floor(rawHeight * scaleDown));

    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));
    svgClone.setAttribute('viewBox', `${bounds.minX - padding} ${bounds.minY - padding} ${rawWidth} ${rawHeight}`);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Reset the pan/zoom transform on the main group so nodes align with the viewBox
    const mainGroupClone = svgClone.querySelector('g');
    if (mainGroupClone) {
        mainGroupClone.removeAttribute('transform');
    }

    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
        text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .node { opacity: 1 !important; }
        .edge { opacity: 1 !important; fill: none !important; stroke: #64748b !important; stroke-width: 2 !important; }
        path.edge { fill: none !important; stroke: #64748b !important; stroke-width: 2 !important; opacity: 1 !important; }
        .node-rect { stroke-width: 1 !important; }
        .node-accent { opacity: 1 !important; }
        marker path { fill: #64748b !important; }
    `;
    svgClone.insertBefore(style, svgClone.firstChild);

    embedInlineStyles(svgClone, svgElement);

    // Remove foreignObject elements — browsers block SVG-as-image rendering
    // when foreignObject is present (security restriction). This affects join
    // nodes that use foreignObject for Venn diagram icons.
    const foreignObjects = svgClone.querySelectorAll('foreignObject');
    foreignObjects.forEach(fo => fo.remove());

    return { svgClone, width, height };
}

function embedInlineStyles(element: Element, originalSvgElement: SVGSVGElement): void {
    let originalElement: Element | null = null;
    const dataId = element.getAttribute('data-id');
    if (dataId) {
        originalElement = originalSvgElement.querySelector(`[data-id="${dataId}"]`);
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

    const styleProps = ['fill', 'stroke', 'stroke-width', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor'];

    if (originalElement) {
        const origStyle = window.getComputedStyle(originalElement);
        styleProps.forEach(prop => {
            const value = origStyle.getPropertyValue(prop);
            if (value && value !== 'none' && value !== '') {
                (element as HTMLElement).style.setProperty(prop, value);
            }
        });
    }

    Array.from(element.children).forEach(child => embedInlineStyles(child, originalSvgElement));
}

function getRasterScale(width: number, height: number, preferredScale = 2): number {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const widthLimitScale = MAX_RASTER_DIMENSION / safeWidth;
    const heightLimitScale = MAX_RASTER_DIMENSION / safeHeight;
    return Math.max(1, Math.min(preferredScale, widthLimitScale, heightLimitScale));
}

export function exportToPng(context: ExportContext): void {
    if (!context) {
        showExportToast('PNG export failed', false, true);
        return;
    }

    const svgElement = context.getSvg() || (context.getContainerElement()?.querySelector('svg') as SVGSVGElement | null);
    if (!svgElement) {
        showExportToast('No graph available to export', context.isDarkTheme(), true);
        return;
    }

    try {
        const { svgClone, width, height } = prepareSvgForExport(svgElement, context.calculateBounds);
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            showExportToast('PNG export failed', context.isDarkTheme(), true);
            return;
        }

        const scale = getRasterScale(width, height);
        canvas.width = width * scale;
        canvas.height = height * scale;
        ctx.scale(scale, scale);

        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        const finishExport = (img: HTMLImageElement, urlToRevoke?: string) => {
            try {
                ctx.drawImage(img, 0, 0);
                if (urlToRevoke) {
                    URL.revokeObjectURL(urlToRevoke);
                }
                const pngDataUrl = canvas.toDataURL('image/png');
                const vscodeApi = (window as any).vscodeApi;
                if (vscodeApi && vscodeApi.postMessage) {
                    const base64Data = pngDataUrl.split(',')[1];
                    vscodeApi.postMessage({
                        command: 'savePng',
                        data: base64Data,
                        filename: `sql-flow-${Date.now()}.png`
                    });
                    showExportToast('Save dialog opened', context.isDarkTheme());
                    return;
                }
                const a = document.createElement('a');
                a.download = `sql-flow-${Date.now()}.png`;
                a.href = pngDataUrl;
                a.click();
                showExportToast('PNG downloaded', context.isDarkTheme());
            } catch (e) {
                if (typeof window !== 'undefined' && Boolean((window as any).debugLogging)) {
                    console.debug('[renderer] PNG export canvas draw failed:', e);
                }
                if (urlToRevoke) {
                    URL.revokeObjectURL(urlToRevoke);
                }
                showExportToast('PNG export failed', context.isDarkTheme(), true);
            }
        };
        const img = new Image();
        img.onload = () => finishExport(img, svgUrl);
        img.onerror = () => {
            URL.revokeObjectURL(svgUrl);
            const fallbackImg = new Image();
            fallbackImg.onload = () => finishExport(fallbackImg);
            fallbackImg.onerror = () => {
                showExportToast('PNG export failed', context.isDarkTheme(), true);
            };
            fallbackImg.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        };
        img.src = svgUrl;
    } catch (e) {
        if (typeof window !== 'undefined' && Boolean((window as any).debugLogging)) {
            console.debug('[renderer] PNG export failed:', e);
        }
        showExportToast('PNG export failed', context.isDarkTheme(), true);
    }
}

export function exportToSvg(context: ExportContext): void {
    const svgElement = context.getSvg() || (context.getContainerElement()?.querySelector('svg') as SVGSVGElement | null);
    if (!svgElement) {
        return;
    }

    try {
        const { svgClone } = prepareSvgForExport(svgElement, context.calculateBounds);
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = `sql-flow-${Date.now()}.svg`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        if (typeof window !== 'undefined' && Boolean((window as any).debugLogging)) {
            console.debug('[renderer] SVG export failed:', e);
        }
    }
}

export function exportToMermaid(context: ExportContext): void {
    const nodes = context.getCurrentNodes();
    if (nodes.length === 0) {
        return;
    }
    const mermaidCode = generateMermaidCode(nodes, context.getCurrentEdges(), context.isDarkTheme());
    const markdownContent = `# SQL Flow Diagram

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;

    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.download = `sql-flow-${Date.now()}.md`;
    a.href = url;
    a.click();

    URL.revokeObjectURL(url);
}

export function copyMermaidToClipboard(context: ExportContext): void {
    const nodes = context.getCurrentNodes();
    if (nodes.length === 0) {
        return;
    }

    const mermaidCode = generateMermaidCode(nodes, context.getCurrentEdges(), context.isDarkTheme());
    const copyWithFallback = (): boolean => {
        const textarea = document.createElement('textarea');
        textarea.value = mermaidCode;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        return copied;
    };

    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(mermaidCode).then(() => {
            showExportToast('Copied! Mermaid is in clipboard', context.isDarkTheme());
        }).catch(() => {
            if (copyWithFallback()) {
                showExportToast('Copied! Mermaid is in clipboard', context.isDarkTheme());
            } else {
                showExportToast('Mermaid copy failed', context.isDarkTheme(), true);
            }
        });
        return;
    }

    if (copyWithFallback()) {
        showExportToast('Copied! Mermaid is in clipboard', context.isDarkTheme());
    } else {
        showExportToast('Mermaid copy failed', context.isDarkTheme(), true);
    }
}

export function copyToClipboard(context: ExportContext): void {
    if (!context) {
        showExportToast('PNG copy failed', false, true);
        return;
    }

    const svgElement = context.getSvg() || (context.getContainerElement()?.querySelector('svg') as SVGSVGElement | null);
    if (!svgElement) {
        showExportToast('No graph available to copy', context.isDarkTheme(), true);
        return;
    }

    try {
        const { svgClone, width, height } = prepareSvgForExport(svgElement, context.calculateBounds);
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            showExportToast('PNG copy failed', context.isDarkTheme(), true);
            return;
        }

        const scale = getRasterScale(width, height);
        canvas.width = width * scale;
        canvas.height = height * scale;
        ctx.scale(scale, scale);

        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
                if (blob && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]).then(() => {
                        showExportToast('Copied! PNG is in clipboard', context.isDarkTheme());
                    }).catch(() => {
                        const a = document.createElement('a');
                        a.download = `sql-flow-${Date.now()}.png`;
                        a.href = canvas.toDataURL('image/png');
                        a.click();
                        showExportToast('Clipboard blocked, PNG downloaded', context.isDarkTheme());
                    });
                } else {
                    const a = document.createElement('a');
                    a.download = `sql-flow-${Date.now()}.png`;
                    a.href = canvas.toDataURL('image/png');
                    a.click();
                    showExportToast('Clipboard unavailable, PNG downloaded', context.isDarkTheme());
                }
            }, 'image/png');
        };
        img.onerror = () => {
            const blob = new Blob([svgData], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const img2 = new Image();
            img2.onload = () => {
                ctx.drawImage(img2, 0, 0);
                const a = document.createElement('a');
                a.download = `sql-flow-${Date.now()}.png`;
                a.href = canvas.toDataURL('image/png');
                a.click();
                URL.revokeObjectURL(url);
                showExportToast('Clipboard unavailable, PNG downloaded', context.isDarkTheme());
            };
            img2.onerror = () => {
                showExportToast('PNG copy failed', context.isDarkTheme(), true);
            };
            img2.src = url;
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch (e) {
        if (typeof window !== 'undefined' && Boolean((window as any).debugLogging)) {
            console.debug('[renderer] Clipboard copy failed:', e);
        }
        showExportToast('PNG copy failed', context.isDarkTheme(), true);
    }
}

function generateMermaidCode(nodes: FlowNode[], edges: FlowEdge[], isDarkTheme: boolean): string {
    const direction = window.flowDirection === 'bottom-up' ? 'BT' : 'TD';
    const lines: string[] = [`flowchart ${direction}`];

    const tableNodes = nodes.filter(n => n.type === 'table');
    const resultNodes = nodes.filter(n => n.type === 'result');
    const otherNodes = nodes.filter(n => n.type !== 'table' && n.type !== 'result');

    if (tableNodes.length > 0) {
        lines.push('    subgraph Sources');
        tableNodes.forEach(node => lines.push(`        ${formatMermaidNode(node)}`));
        lines.push('    end');
    }

    otherNodes.forEach(node => lines.push(`    ${formatMermaidNode(node)}`));

    if (resultNodes.length > 0) {
        lines.push('    subgraph Results');
        resultNodes.forEach(node => lines.push(`        ${formatMermaidNode(node)}`));
        lines.push('    end');
    }

    lines.push('');
    edges.forEach(edge => {
        const edgeLine = formatMermaidEdge(edge);
        if (edgeLine) {
            lines.push(`    ${edgeLine}`);
        }
    });

    const mermaidTextColor = isDarkTheme ? '#fff' : '#111827';
    lines.push('');
    lines.push('    %% Node styling');
    lines.push(`    classDef tableStyle fill:#3b82f6,stroke:#1e40af,color:${mermaidTextColor}`);
    lines.push(`    classDef filterStyle fill:#f59e0b,stroke:#b45309,color:${mermaidTextColor}`);
    lines.push(`    classDef joinStyle fill:#8b5cf6,stroke:#5b21b6,color:${mermaidTextColor}`);
    lines.push(`    classDef aggregateStyle fill:#10b981,stroke:#047857,color:${mermaidTextColor}`);
    lines.push(`    classDef sortStyle fill:#6366f1,stroke:#4338ca,color:${mermaidTextColor}`);
    lines.push(`    classDef resultStyle fill:#22c55e,stroke:#15803d,color:${mermaidTextColor}`);
    lines.push(`    classDef cteStyle fill:#ec4899,stroke:#be185d,color:${mermaidTextColor}`);
    lines.push(`    classDef unionStyle fill:#14b8a6,stroke:#0f766e,color:${mermaidTextColor}`);
    lines.push(`    classDef defaultStyle fill:#64748b,stroke:#475569,color:${mermaidTextColor}`);

    generateStyleAssignments(nodes).forEach(assignment => lines.push(`    ${assignment}`));
    return lines.join('\n');
}

function formatMermaidNode(node: FlowNode): string {
    const id = sanitizeMermaidId(node.id);
    const label = escapeMermaidLabel(node.label);

    switch (node.type) {
        case 'table':
            return `${id}[("${label}")]`;
        case 'filter':
            return `${id}{"${label}"}`;
        case 'join':
            return `${id}{{"${label}"}}`;
        case 'aggregate':
            return `${id}[["${label}"]]`;
        case 'sort':
            return `${id}[/"${label}"/]`;
        case 'result':
            return `${id}(["${label}"])`;
        case 'cte':
            return `${id}((("${label}")))`;
        case 'union':
            return `${id}[/"${label}"\\]`;
        case 'subquery':
            return `${id}[["${label}"]]`;
        case 'window':
            return `${id}>"${label}"]`;
        default:
            return `${id}("${label}")`;
    }
}

function formatMermaidEdge(edge: FlowEdge): string {
    const sourceId = sanitizeMermaidId(edge.source);
    const targetId = sanitizeMermaidId(edge.target);
    if (edge.label) {
        return `${sourceId} -->|"${escapeMermaidLabel(edge.label)}"| ${targetId}`;
    }
    return `${sourceId} --> ${targetId}`;
}

function sanitizeMermaidId(id: string): string {
    return id
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
}

function escapeMermaidLabel(label: string): string {
    return label
        .replace(/"/g, "'")
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, ' ')
        .substring(0, 50);
}

function generateStyleAssignments(nodes: FlowNode[]): string[] {
    const assignments: string[] = [];
    const typeToClass: Record<string, string> = {
        table: 'tableStyle',
        filter: 'filterStyle',
        join: 'joinStyle',
        aggregate: 'aggregateStyle',
        sort: 'sortStyle',
        result: 'resultStyle',
        cte: 'cteStyle',
        union: 'unionStyle'
    };

    const nodesByType = new Map<string, string[]>();
    nodes.forEach(node => {
        const className = typeToClass[node.type] || 'defaultStyle';
        if (!nodesByType.has(className)) {
            nodesByType.set(className, []);
        }
        nodesByType.get(className)!.push(sanitizeMermaidId(node.id));
    });

    nodesByType.forEach((nodeIds, className) => {
        if (nodeIds.length > 0) {
            assignments.push(`class ${nodeIds.join(',')} ${className}`);
        }
    });

    return assignments;
}
