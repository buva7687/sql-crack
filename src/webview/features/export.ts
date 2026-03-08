import type { FlowEdge, FlowNode } from '../types';
import type {
    ExportContext,
    ExportPreviewFormat,
    PngExportOptions,
    PdfExportOptions,
    SvgExportOptions,
} from './export/index';
import {
    DEFAULT_PNG_EXPORT_OPTIONS,
    DEFAULT_PDF_EXPORT_OPTIONS,
    DEFAULT_SVG_EXPORT_OPTIONS,
    buildPdfExportArtifact,
    buildPngExportArtifact,
    buildSvgExportArtifact,
    getRasterScale,
    prepareSvgForExport,
    svgToBase64,
} from './export/index';
import { showExportPreview } from '../ui/exportPreview';

export type { ExportContext } from './export/index';

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

export function exportToPng(context: ExportContext, options: PngExportOptions = DEFAULT_PNG_EXPORT_OPTIONS): void {
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
        void savePngArtifact(context, options).catch((error) => {
            if (typeof window !== 'undefined' && Boolean((window as any).debugLogging)) {
                console.debug('[renderer] PNG export failed:', error);
            }
            showExportToast('PNG export failed', context.isDarkTheme(), true);
        });
    } catch (e) {
        if (typeof window !== 'undefined' && Boolean((window as any).debugLogging)) {
            console.debug('[renderer] PNG export failed:', e);
        }
        showExportToast('PNG export failed', context.isDarkTheme(), true);
    }
}

export function exportToSvg(context: ExportContext, options: SvgExportOptions = DEFAULT_SVG_EXPORT_OPTIONS): void {
    const svgElement = context.getSvg() || (context.getContainerElement()?.querySelector('svg') as SVGSVGElement | null);
    if (!svgElement) {
        return;
    }

    try {
        void saveSvgArtifact(context, options).catch((error) => {
            if (typeof window !== 'undefined' && Boolean((window as any).debugLogging)) {
                console.debug('[renderer] SVG export failed:', error);
            }
        });
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
        img.src = 'data:image/svg+xml;base64,' + svgToBase64(svgData);
    } catch (e) {
        if (typeof window !== 'undefined' && Boolean((window as any).debugLogging)) {
            console.debug('[renderer] Clipboard copy failed:', e);
        }
        showExportToast('PNG copy failed', context.isDarkTheme(), true);
    }
}

export function openExportPreview(
    context: ExportContext,
    initialFormat: ExportPreviewFormat = 'png'
): void {
    showExportPreview({
        initialState: {
            format: initialFormat,
            png: { ...DEFAULT_PNG_EXPORT_OPTIONS },
            svg: { ...DEFAULT_SVG_EXPORT_OPTIONS },
            pdf: { ...DEFAULT_PDF_EXPORT_OPTIONS },
        },
        callbacks: {
            buildPngPreview: (options) => buildPngExportArtifact(context, options),
            buildSvgPreview: async (options) => buildSvgExportArtifact(context, options),
            buildPdfPreview: (options) => buildPdfExportArtifact(context, options),
            savePng: (options) => savePngArtifact(context, options),
            saveSvg: async (options) => saveSvgArtifact(context, options),
            savePdf: async (options) => savePdfArtifact(context, options),
            isDarkTheme: context.isDarkTheme,
        },
    });
}

async function savePngArtifact(context: ExportContext, options: PngExportOptions): Promise<void> {
    const artifact = await buildPngExportArtifact(context, options);
    const vscodeApi = (window as any).vscodeApi;
    if (vscodeApi?.postMessage) {
        vscodeApi.postMessage({
            command: 'savePng',
            data: artifact.base64Data,
            filename: `sql-flow-${Date.now()}.png`,
        });
        showExportToast('Save dialog opened', context.isDarkTheme());
        return;
    }

    const link = document.createElement('a');
    link.download = `sql-flow-${Date.now()}.png`;
    link.href = artifact.dataUrl;
    link.click();
    showExportToast('PNG downloaded', context.isDarkTheme());
}

async function saveSvgArtifact(context: ExportContext, options: SvgExportOptions): Promise<void> {
    const artifact = buildSvgExportArtifact(context, options);
    const vscodeApi = (window as any).vscodeApi;
    if (vscodeApi?.postMessage) {
        vscodeApi.postMessage({
            command: 'saveSvg',
            data: artifact.svgData,
            filename: `sql-flow-${Date.now()}.svg`,
        });
        showExportToast('Save dialog opened', context.isDarkTheme());
        return;
    }

    const blob = new Blob([artifact.svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `sql-flow-${Date.now()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

async function savePdfArtifact(context: ExportContext, options: PdfExportOptions): Promise<void> {
    const artifact = await buildPdfExportArtifact(context, options);
    const vscodeApi = (window as any).vscodeApi;
    if (vscodeApi?.postMessage) {
        vscodeApi.postMessage({
            command: 'savePdf',
            data: artifact.base64Data,
            filename: `sql-flow-${Date.now()}.pdf`,
        });
        showExportToast('Save dialog opened', context.isDarkTheme());
        return;
    }

    const binary = atob(artifact.base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `sql-flow-${Date.now()}.pdf`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

function generateMermaidCode(nodes: FlowNode[], edges: FlowEdge[], _isDarkTheme: boolean): string {
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

    lines.push('');
    lines.push('    %% Node styling');
    lines.push('    classDef tableStyle fill:#3b82f6,stroke:#1e40af,color:#fff');
    lines.push('    classDef filterStyle fill:#f59e0b,stroke:#b45309,color:#fff');
    lines.push('    classDef joinStyle fill:#8b5cf6,stroke:#5b21b6,color:#fff');
    lines.push('    classDef aggregateStyle fill:#10b981,stroke:#047857,color:#fff');
    lines.push('    classDef sortStyle fill:#6366f1,stroke:#4338ca,color:#fff');
    lines.push('    classDef resultStyle fill:#22c55e,stroke:#15803d,color:#fff');
    lines.push('    classDef cteStyle fill:#ec4899,stroke:#be185d,color:#fff');
    lines.push('    classDef unionStyle fill:#14b8a6,stroke:#0f766e,color:#fff');
    lines.push('    classDef defaultStyle fill:#64748b,stroke:#475569,color:#fff');

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
