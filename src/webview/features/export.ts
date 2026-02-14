import type { FlowEdge, FlowNode } from '../types';

export interface ExportContext {
    getSvg: () => SVGSVGElement | null;
    getContainerElement: () => HTMLElement | null;
    getCurrentNodes: () => FlowNode[];
    getCurrentEdges: () => FlowEdge[];
    isDarkTheme: () => boolean;
    calculateBounds: () => { minX: number; minY: number; width: number; height: number };
}

function prepareSvgForExport(
    svgElement: SVGSVGElement,
    calculateBounds: () => { minX: number; minY: number; width: number; height: number }
): { svgClone: SVGSVGElement; width: number; height: number } {
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
    const bounds = calculateBounds();
    const padding = 40;
    const width = Math.ceil(bounds.width + padding * 2);
    const height = Math.ceil(bounds.height + padding * 2);

    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));
    svgClone.setAttribute('viewBox', `${bounds.minX - padding} ${bounds.minY - padding} ${width} ${height}`);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

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

export function exportToPng(context: ExportContext): void {
    const svgElement = context.getSvg() || (context.getContainerElement()?.querySelector('svg') as SVGSVGElement | null);
    if (!svgElement) {
        return;
    }

    try {
        const { svgClone, width, height } = prepareSvgForExport(svgElement, context.calculateBounds);
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        const scale = 2;
        canvas.width = width * scale;
        canvas.height = height * scale;
        ctx.scale(scale, scale);

        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
            try {
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(svgUrl);
                const pngDataUrl = canvas.toDataURL('image/png');
                const vscodeApi = (window as any).vscodeApi;
                if (vscodeApi && vscodeApi.postMessage) {
                    const base64Data = pngDataUrl.split(',')[1];
                    vscodeApi.postMessage({
                        command: 'savePng',
                        data: base64Data,
                        filename: `sql-flow-${Date.now()}.png`
                    });
                }
            } catch (e) {
                if (typeof window !== 'undefined' && Boolean((window as any).debugLogging)) {
                    console.debug('[renderer] PNG export canvas draw failed:', e);
                }
                URL.revokeObjectURL(svgUrl);
            }
        };
        img.onerror = () => URL.revokeObjectURL(svgUrl);
        img.src = svgUrl;
    } catch (e) {
        if (typeof window !== 'undefined' && Boolean((window as any).debugLogging)) {
            console.debug('[renderer] PNG export failed:', e);
        }
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
    navigator.clipboard.writeText(mermaidCode).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = mermaidCode;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    });
}

export function copyToClipboard(context: ExportContext): void {
    const svgElement = context.getSvg() || (context.getContainerElement()?.querySelector('svg') as SVGSVGElement | null);
    if (!svgElement) {
        return;
    }

    try {
        const { svgClone, width, height } = prepareSvgForExport(svgElement, context.calculateBounds);
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        const scale = 2;
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
                    ]).catch(() => {
                        const a = document.createElement('a');
                        a.download = `sql-flow-${Date.now()}.png`;
                        a.href = canvas.toDataURL('image/png');
                        a.click();
                    });
                } else {
                    const a = document.createElement('a');
                    a.download = `sql-flow-${Date.now()}.png`;
                    a.href = canvas.toDataURL('image/png');
                    a.click();
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
            };
            img2.onerror = () => {
                // noop
            };
            img2.src = url;
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch (e) {
        if (typeof window !== 'undefined' && Boolean((window as any).debugLogging)) {
            console.debug('[renderer] Clipboard copy failed:', e);
        }
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
