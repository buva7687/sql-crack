import { ParseResult } from '../types';
import { FlowNode } from '../types/nodes';

export interface ComparePaneInput {
    label: string;
    result: ParseResult;
}

export interface CompareViewOptions {
    container: HTMLElement;
    left: ComparePaneInput;
    right: ComparePaneInput;
    isDarkTheme: boolean;
    onClose?: () => void;
}

export interface CompareDiffResult {
    addedNodeKeys: string[];
    removedNodeKeys: string[];
    changedNodeKeys: string[];
    statsDelta: {
        joins: number;
        subqueries: number;
        complexityScore: number;
    };
}

type CompareNodeState = 'default' | 'added' | 'removed' | 'changed';

interface PaneInteractionCleanup {
    cleanup: () => void;
}

interface ActiveCompareContext {
    container: HTMLElement;
    left: ComparePaneInput;
    right: ComparePaneInput;
    onClose?: () => void;
}

let activeOverlay: HTMLDivElement | null = null;
let activeCleanupHandlers: Array<() => void> = [];
let activeCompareContext: ActiveCompareContext | null = null;

function normalizeNodeKey(node: Pick<FlowNode, 'type' | 'label'>): string {
    const normalizedLabel = node.label.trim().toLowerCase().replace(/\s+/g, ' ');
    return `${node.type}:${normalizedLabel}`;
}

function nodeSignature(node: FlowNode): string {
    return JSON.stringify({
        description: node.description || '',
        details: node.details || [],
        accessMode: node.accessMode || '',
        operationType: node.operationType || '',
        warnings: (node.warnings || []).map(w => `${w.type}:${w.severity}`),
    });
}

function toNodeMap(nodes: FlowNode[]): Map<string, FlowNode> {
    const map = new Map<string, FlowNode>();
    for (const node of nodes) {
        map.set(normalizeNodeKey(node), node);
    }
    return map;
}

function formatDelta(label: string, delta: number): string {
    if (delta === 0) {
        return `no ${label} change`;
    }
    if (delta > 0) {
        return `${delta} more ${label}`;
    }
    return `${Math.abs(delta)} fewer ${label}`;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function getNodeStyle(state: CompareNodeState, dark: boolean): {
    fill: string;
    stroke: string;
    text: string;
    dash?: string;
    opacity?: string;
} {
    if (state === 'added') {
        return {
            fill: dark ? 'rgba(22, 163, 74, 0.18)' : 'rgba(34, 197, 94, 0.14)',
            stroke: dark ? '#4ade80' : '#16a34a',
            text: dark ? '#dcfce7' : '#14532d',
        };
    }
    if (state === 'removed') {
        return {
            fill: dark ? 'rgba(239, 68, 68, 0.16)' : 'rgba(248, 113, 113, 0.15)',
            stroke: dark ? '#f87171' : '#dc2626',
            text: dark ? '#fee2e2' : '#7f1d1d',
            dash: '5 3',
            opacity: '0.8',
        };
    }
    if (state === 'changed') {
        return {
            fill: dark ? 'rgba(245, 158, 11, 0.17)' : 'rgba(251, 191, 36, 0.16)',
            stroke: dark ? '#fbbf24' : '#d97706',
            text: dark ? '#fef3c7' : '#78350f',
        };
    }
    return {
        fill: dark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(248, 250, 252, 0.95)',
        stroke: dark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.4)',
        text: dark ? '#e2e8f0' : '#1e293b',
    };
}

function computeBounds(nodes: FlowNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
    if (nodes.length === 0) {
        return { minX: 0, minY: 0, maxX: 600, maxY: 380 };
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    nodes.forEach((node, index) => {
        const x = Number.isFinite(node.x) ? node.x : 80;
        const y = Number.isFinite(node.y) ? node.y : 80 + (index * 80);
        const width = Number.isFinite(node.width) ? node.width : 180;
        const height = Number.isFinite(node.height) ? node.height : 58;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
    });

    return { minX, minY, maxX, maxY };
}

function createNodeGroup(
    _svg: SVGSVGElement,
    node: FlowNode,
    state: CompareNodeState,
    dark: boolean,
    indexHint: number
): SVGGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(ns, 'g');
    const style = getNodeStyle(state, dark);
    const x = Number.isFinite(node.x) ? node.x : 80;
    const y = Number.isFinite(node.y) ? node.y : 80 + (indexHint * 80);
    const width = Number.isFinite(node.width) ? node.width : 180;
    const height = Number.isFinite(node.height) ? node.height : 58;

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('rx', '10');
    rect.setAttribute('ry', '10');
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.setAttribute('fill', style.fill);
    rect.setAttribute('stroke', style.stroke);
    rect.setAttribute('stroke-width', '1.5');
    if (style.dash) {
        rect.setAttribute('stroke-dasharray', style.dash);
    }
    if (style.opacity) {
        rect.setAttribute('opacity', style.opacity);
    }
    group.appendChild(rect);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(x + 10));
    label.setAttribute('y', String(y + 22));
    label.setAttribute('fill', style.text);
    label.setAttribute('font-size', '12');
    label.setAttribute('font-weight', '600');
    label.textContent = node.label.length > 34 ? `${node.label.slice(0, 34)}...` : node.label;
    group.appendChild(label);

    const type = document.createElementNS(ns, 'text');
    type.setAttribute('x', String(x + 10));
    type.setAttribute('y', String(y + 39));
    type.setAttribute('fill', dark ? '#94a3b8' : '#64748b');
    type.setAttribute('font-size', '10');
    type.textContent = node.type;
    group.appendChild(type);

    group.setAttribute('data-compare-state', state);
    group.setAttribute('data-node-key', normalizeNodeKey(node));
    if (state === 'removed') {
        group.setAttribute('data-ghost-node', 'true');
    }
    return group;
}

function renderGraphPane(
    pane: HTMLElement,
    result: ParseResult,
    nodeStates: Map<string, CompareNodeState>,
    ghostNodes: FlowNode[],
    dark: boolean,
    paneId: 'left' | 'right'
): PaneInteractionCleanup {
    pane.innerHTML = '';

    const viewport = document.createElement('div');
    viewport.id = `sql-crack-compare-${paneId}-viewport`;
    viewport.style.cssText = `
        position: relative;
        flex: 1;
        border: 1px solid ${dark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.32)'};
        border-radius: 10px;
        overflow: hidden;
        background: ${dark ? 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.96))' : 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))'};
        cursor: grab;
    `;
    pane.appendChild(viewport);

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    viewport.appendChild(svg);

    const allNodes = result.nodes.slice();
    const bounds = computeBounds(allNodes.concat(ghostNodes));
    const padding = 100;
    const width = Math.max(640, (bounds.maxX - bounds.minX) + (padding * 2));
    const height = Math.max(420, (bounds.maxY - bounds.minY) + (padding * 2));
    svg.setAttribute('viewBox', `${bounds.minX - padding} ${bounds.minY - padding} ${width} ${height}`);

    const graphGroup = document.createElementNS(ns, 'g');
    graphGroup.setAttribute('transform', 'translate(0 0) scale(1)');
    svg.appendChild(graphGroup);

    const nodeById = new Map<string, FlowNode>();
    result.nodes.forEach(node => nodeById.set(node.id, node));

    result.edges.forEach((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) {
            return;
        }

        const sourceX = (Number.isFinite(source.x) ? source.x : 80) + ((Number.isFinite(source.width) ? source.width : 180) / 2);
        const sourceY = (Number.isFinite(source.y) ? source.y : 80) + (Number.isFinite(source.height) ? source.height : 58);
        const targetX = (Number.isFinite(target.x) ? target.x : 80) + ((Number.isFinite(target.width) ? target.width : 180) / 2);
        const targetY = Number.isFinite(target.y) ? target.y : 80;

        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', String(sourceX));
        line.setAttribute('y1', String(sourceY));
        line.setAttribute('x2', String(targetX));
        line.setAttribute('y2', String(targetY));
        line.setAttribute('stroke', dark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.45)');
        line.setAttribute('stroke-width', '1.2');
        line.setAttribute('opacity', '0.85');
        graphGroup.appendChild(line);
    });

    result.nodes.forEach((node, index) => {
        const key = normalizeNodeKey(node);
        const state = nodeStates.get(key) || 'default';
        graphGroup.appendChild(createNodeGroup(svg, node, state, dark, index));
    });

    ghostNodes.forEach((node, index) => {
        graphGroup.appendChild(createNodeGroup(svg, node, 'removed', dark, result.nodes.length + index));
    });

    const state = {
        scale: 1,
        translateX: 0,
        translateY: 0,
        dragging: false,
        startX: 0,
        startY: 0,
    };

    const applyTransform = () => {
        graphGroup.setAttribute('transform', `translate(${state.translateX} ${state.translateY}) scale(${state.scale})`);
        viewport.dataset.scale = state.scale.toFixed(2);
        viewport.dataset.panX = state.translateX.toFixed(1);
        viewport.dataset.panY = state.translateY.toFixed(1);
    };
    applyTransform();

    const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const multiplier = event.deltaY > 0 ? 0.92 : 1.08;
        state.scale = clamp(state.scale * multiplier, 0.45, 2.8);
        applyTransform();
    };

    const onMouseDown = (event: MouseEvent) => {
        event.preventDefault();
        state.dragging = true;
        state.startX = event.clientX;
        state.startY = event.clientY;
        viewport.style.cursor = 'grabbing';
    };

    const onMouseMove = (event: MouseEvent) => {
        if (!state.dragging) {
            return;
        }
        const dx = event.clientX - state.startX;
        const dy = event.clientY - state.startY;
        state.startX = event.clientX;
        state.startY = event.clientY;
        state.translateX += dx;
        state.translateY += dy;
        applyTransform();
    };

    const onMouseUp = () => {
        state.dragging = false;
        viewport.style.cursor = 'grab';
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return {
        cleanup: () => {
            viewport.removeEventListener('wheel', onWheel);
            viewport.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        },
    };
}

export function computeCompareDiff(left: ParseResult, right: ParseResult): CompareDiffResult {
    const leftMap = toNodeMap(left.nodes);
    const rightMap = toNodeMap(right.nodes);

    const addedNodeKeys: string[] = [];
    const removedNodeKeys: string[] = [];
    const changedNodeKeys: string[] = [];

    rightMap.forEach((rightNode, key) => {
        if (!leftMap.has(key)) {
            addedNodeKeys.push(key);
            return;
        }
        const leftNode = leftMap.get(key);
        if (leftNode && nodeSignature(leftNode) !== nodeSignature(rightNode)) {
            changedNodeKeys.push(key);
        }
    });

    leftMap.forEach((_leftNode, key) => {
        if (!rightMap.has(key)) {
            removedNodeKeys.push(key);
        }
    });

    return {
        addedNodeKeys,
        removedNodeKeys,
        changedNodeKeys,
        statsDelta: {
            joins: right.stats.joins - left.stats.joins,
            subqueries: right.stats.subqueries - left.stats.subqueries,
            complexityScore: right.stats.complexityScore - left.stats.complexityScore,
        },
    };
}

function buildDeltaSummary(delta: CompareDiffResult['statsDelta']): string {
    return [
        formatDelta('joins', delta.joins),
        formatDelta('subqueries', delta.subqueries),
        `complexity score ${delta.complexityScore >= 0 ? '+' : ''}${delta.complexityScore}`,
    ].join('  •  ');
}

function closeActiveCompareView(): void {
    activeCleanupHandlers.forEach(cleanup => cleanup());
    activeCleanupHandlers = [];
    activeCompareContext = null;

    if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
    }
}

export function hideCompareView(): void {
    closeActiveCompareView();
}

export function isCompareViewActive(): boolean {
    return activeOverlay !== null;
}

function rerenderActiveCompareView(dark: boolean): void {
    const context = activeCompareContext;
    if (!context) {
        return;
    }
    showCompareView({
        container: context.container,
        left: context.left,
        right: context.right,
        isDarkTheme: dark,
        onClose: context.onClose,
    });
}

export function showCompareView(options: CompareViewOptions): void {
    closeActiveCompareView();
    activeCompareContext = {
        container: options.container,
        left: options.left,
        right: options.right,
        onClose: options.onClose,
    };

    const diff = computeCompareDiff(options.left.result, options.right.result);
    const leftNodeMap = toNodeMap(options.left.result.nodes);
    const rightStates = new Map<string, CompareNodeState>();
    diff.addedNodeKeys.forEach(key => rightStates.set(key, 'added'));
    diff.changedNodeKeys.forEach(key => rightStates.set(key, 'changed'));

    const removedGhostNodes = diff.removedNodeKeys
        .map((key, index) => {
            const node = leftNodeMap.get(key);
            if (!node) {
                return null;
            }
            return {
                ...node,
                id: `${node.id}::removed::${index}`,
                label: `Removed: ${node.label}`,
            };
        })
        .filter((node): node is FlowNode => node !== null);

    const overlay = document.createElement('div');
    overlay.id = 'sql-crack-compare-overlay';
    overlay.style.cssText = `
        position: absolute;
        inset: 12px;
        top: 74px;
        z-index: 130;
        border-radius: 12px;
        border: 1px solid ${options.isDarkTheme ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.35)'};
        background: ${options.isDarkTheme ? 'rgba(2, 6, 23, 0.95)' : 'rgba(241, 245, 249, 0.96)'};
        backdrop-filter: blur(4px);
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border-bottom: 1px solid ${options.isDarkTheme ? 'rgba(148, 163, 184, 0.23)' : 'rgba(148, 163, 184, 0.32)'};
        padding: 2px 4px 10px 4px;
    `;

    const titleGroup = document.createElement('div');
    titleGroup.innerHTML = `
        <div style="font-size: 12px; font-weight: 700; color: ${options.isDarkTheme ? '#e2e8f0' : '#0f172a'};">
            Compare Mode
        </div>
        <div id="sql-crack-compare-stats-diff" style="font-size: 11px; color: ${options.isDarkTheme ? '#94a3b8' : '#475569'};">
            ${buildDeltaSummary(diff.statsDelta)}
        </div>
    `;
    header.appendChild(titleGroup);

    const legend = document.createElement('div');
    legend.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 10px;
        color: ${options.isDarkTheme ? '#cbd5e1' : '#334155'};
        flex-wrap: wrap;
    `;
    legend.innerHTML = `
        <span style="padding: 2px 6px; border-radius: 999px; border: 1px solid ${options.isDarkTheme ? '#4ade80' : '#16a34a'};">Added</span>
        <span style="padding: 2px 6px; border-radius: 999px; border: 1px solid ${options.isDarkTheme ? '#f87171' : '#dc2626'};">Removed</span>
        <span style="padding: 2px 6px; border-radius: 999px; border: 1px solid ${options.isDarkTheme ? '#fbbf24' : '#d97706'};">Changed</span>
    `;
    header.appendChild(legend);

    const closeButton = document.createElement('button');
    closeButton.id = 'sql-crack-compare-close';
    closeButton.textContent = 'Close';
    closeButton.style.cssText = `
        border: 1px solid ${options.isDarkTheme ? 'rgba(148, 163, 184, 0.3)' : 'rgba(100, 116, 139, 0.35)'};
        background: ${options.isDarkTheme ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.92)'};
        color: ${options.isDarkTheme ? '#f8fafc' : '#0f172a'};
        border-radius: 8px;
        font-size: 11px;
        font-weight: 600;
        padding: 6px 10px;
        cursor: pointer;
    `;
    header.appendChild(closeButton);
    overlay.appendChild(header);

    const panes = document.createElement('div');
    panes.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        min-height: 0;
        flex: 1;
    `;

    const leftPane = document.createElement('section');
    leftPane.className = 'sql-crack-compare-pane';
    leftPane.setAttribute('data-pane', 'left');
    leftPane.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
        min-height: 0;
    `;
    const leftLabel = document.createElement('div');
    leftLabel.style.cssText = `font-size: 11px; font-weight: 700; color: ${options.isDarkTheme ? '#e2e8f0' : '#1e293b'};`;
    leftLabel.textContent = options.left.label;
    leftPane.appendChild(leftLabel);

    const rightPane = document.createElement('section');
    rightPane.className = 'sql-crack-compare-pane';
    rightPane.setAttribute('data-pane', 'right');
    rightPane.style.cssText = leftPane.style.cssText;
    const rightLabel = document.createElement('div');
    rightLabel.style.cssText = leftLabel.style.cssText;
    rightLabel.textContent = options.right.label;
    rightPane.appendChild(rightLabel);

    panes.appendChild(leftPane);
    panes.appendChild(rightPane);
    overlay.appendChild(panes);

    options.container.appendChild(overlay);
    activeOverlay = overlay;

    const leftCleanup = renderGraphPane(
        leftPane,
        options.left.result,
        new Map<string, CompareNodeState>(),
        [],
        options.isDarkTheme,
        'left'
    );
    const rightCleanup = renderGraphPane(
        rightPane,
        options.right.result,
        rightStates,
        removedGhostNodes,
        options.isDarkTheme,
        'right'
    );

    const finishClose = () => {
        closeActiveCompareView();
        options.onClose?.();
    };

    const themeChangeHandler = ((event: CustomEvent<{ dark?: boolean }>) => {
        const nextDark = typeof event.detail?.dark === 'boolean'
            ? event.detail.dark
            : options.isDarkTheme;
        rerenderActiveCompareView(nextDark);
    }) as EventListener;

    const escHandler = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') {
            return;
        }
        event.preventDefault();
        finishClose();
    };

    closeButton.addEventListener('click', finishClose);
    document.addEventListener('theme-change', themeChangeHandler);
    document.addEventListener('keydown', escHandler);

    activeCleanupHandlers.push(leftCleanup.cleanup);
    activeCleanupHandlers.push(rightCleanup.cleanup);
    activeCleanupHandlers.push(() => closeButton.removeEventListener('click', finishClose));
    activeCleanupHandlers.push(() => document.removeEventListener('theme-change', themeChangeHandler));
    activeCleanupHandlers.push(() => document.removeEventListener('keydown', escHandler));
}
