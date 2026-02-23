import type {
    ColumnFlow,
    ColumnLineage,
    FlowEdge,
    FlowNode,
    LineagePathStep,
    ViewState,
} from '../types';
import { Z_INDEX } from '../../shared';

export interface ColumnLineageRuntimeState {
    selectedColumnLineage: ColumnFlow | null;
    columnLineagePanel: HTMLElement | null;
}

interface EdgeColorTokens {
    default: string;
    defaultLight: string;
    focus: string;
    columnLineage: string;
}

interface ShowColumnLineagePanelOptions {
    runtime: ColumnLineageRuntimeState;
    currentColumnFlows: ColumnFlow[];
    isDarkTheme: boolean;
    searchIcon: string;
    escapeHtml: (value: string) => string;
    onToggleColumnFlows: (show?: boolean) => void;
    onFlowSelected: (flow: ColumnFlow) => void;
}

export function ensureColumnLineagePanelScrollbarStylesFeature(isDarkTheme: boolean, getScrollbarColors: (dark: boolean) => { thumb: string; thumbHover: string; track: string }): void {
    const styleId = 'column-lineage-panel-scroll-style';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }
    const { thumb, thumbHover, track } = getScrollbarColors(isDarkTheme);
    style.textContent = `
        #column-lineage-panel {
            scrollbar-width: thin;
            scrollbar-color: ${thumb} ${track};
        }
        #column-lineage-panel::-webkit-scrollbar {
            width: 10px;
        }
        #column-lineage-panel::-webkit-scrollbar-track {
            background: ${track};
            border-radius: 8px;
        }
        #column-lineage-panel::-webkit-scrollbar-thumb {
            background: ${thumb};
            border-radius: 8px;
            border: 2px solid transparent;
            background-clip: padding-box;
        }
        #column-lineage-panel::-webkit-scrollbar-thumb:hover {
            background: ${thumbHover};
            background-clip: padding-box;
        }
    `;
}

export function hideColumnLineagePanelFeature(runtime: ColumnLineageRuntimeState): void {
    if (runtime.columnLineagePanel) {
        runtime.columnLineagePanel.remove();
        runtime.columnLineagePanel = null;
    }
    runtime.selectedColumnLineage = null;
}

function createColumnItemFeature(
    flow: ColumnFlow,
    options: ShowColumnLineagePanelOptions
): HTMLElement {
    const { runtime, isDarkTheme, escapeHtml, onFlowSelected } = options;
    const item = document.createElement('div');
    item.style.cssText = `
        padding: 8px 10px;
        background: ${isDarkTheme ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'};
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 2px solid transparent;
    `;

    const firstStep = flow.lineagePath[0];
    const hasAggregation = flow.lineagePath.some((step) => step.transformation === 'aggregated');
    const hasCalculation = flow.lineagePath.some((step) => step.transformation === 'calculated');
    const hasRename = flow.lineagePath.some((step) => step.transformation === 'renamed');

    let badge = '';
    let badgeColor = '#10b981';
    if (hasAggregation) {
        badge = 'AGG';
        badgeColor = '#f59e0b';
    } else if (hasCalculation) {
        badge = 'CALC';
        badgeColor = '#8b5cf6';
    } else if (hasRename) {
        badge = 'ALIAS';
        badgeColor = '#3b82f6';
    }

    item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px;">
            <span style="font-weight: 600; font-size: 11px; color: ${isDarkTheme ? '#e2e8f0' : '#1e293b'};">
                ${escapeHtml(flow.outputColumn)}
            </span>
            ${badge ? `<span style="
                background: ${badgeColor};
                color: white;
                font-size: 8px;
                font-weight: 600;
                padding: 2px 4px;
                border-radius: 3px;
            ">${badge}</span>` : ''}
        </div>
        <div style="font-size: 9px; color: ${isDarkTheme ? '#94a3b8' : '#64748b'};">
            ${firstStep ? `${escapeHtml(firstStep.nodeName)}.${escapeHtml(firstStep.columnName)}` : 'Unknown source'}
        </div>
    `;

    item.addEventListener('mouseenter', () => {
        item.style.background = isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    });

    item.addEventListener('mouseleave', () => {
        if (runtime.selectedColumnLineage?.id !== flow.id) {
            item.style.background = isDarkTheme ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)';
            item.style.borderColor = 'transparent';
        }
    });

    item.addEventListener('click', () => {
        runtime.selectedColumnLineage = flow;
        const allItems = runtime.columnLineagePanel?.querySelectorAll('div[style*="cursor: pointer"]');
        allItems?.forEach((el) => {
            (el as HTMLElement).style.borderColor = 'transparent';
            (el as HTMLElement).style.background = isDarkTheme ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)';
        });

        item.style.borderColor = '#6366f1';
        item.style.background = isDarkTheme ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)';
        onFlowSelected(flow);
    });

    return item;
}

export function showColumnLineagePanelFeature(options: ShowColumnLineagePanelOptions): void {
    const { runtime, currentColumnFlows, isDarkTheme, searchIcon, onToggleColumnFlows } = options;

    hideColumnLineagePanelFeature(runtime);

    if (!currentColumnFlows || currentColumnFlows.length === 0) {
        return;
    }

    runtime.columnLineagePanel = document.createElement('div');
    runtime.columnLineagePanel.id = 'column-lineage-panel';
    runtime.columnLineagePanel.style.cssText = `
        position: fixed;
        left: 16px;
        top: 50%;
        transform: translateY(-50%);
        background: ${isDarkTheme ? 'rgba(17, 17, 17, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
        border: 1px solid ${isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.1)'};
        border-radius: 8px;
        padding: 12px;
        max-height: 70vh;
        overflow-y: auto;
        z-index: ${Z_INDEX.dropdown};
        box-shadow: ${isDarkTheme ? '0 8px 32px rgba(0, 0, 0, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.1)'};
        min-width: 200px;
        max-width: 260px;
        backdrop-filter: blur(8px);
        scrollbar-width: thin;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
        font-weight: 600;
        font-size: 12px;
        color: ${isDarkTheme ? '#f1f5f9' : '#1e293b'};
        margin-bottom: 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid ${isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    header.innerHTML = `
        <span>Column Lineage</span>
        <span style="display: inline-flex; align-items: center; gap: 8px;">
            <span style="font-size: 9px; color: ${isDarkTheme ? '#64748b' : '#94a3b8'};">Click to trace</span>
            <button id="column-lineage-panel-close" type="button" style="
                border: none;
                background: transparent;
                color: ${isDarkTheme ? '#94a3b8' : '#64748b'};
                cursor: pointer;
                font-size: 14px;
                line-height: 1;
                padding: 0 2px;
            " aria-label="Close column lineage panel">×</button>
        </span>
    `;
    runtime.columnLineagePanel.appendChild(header);
    header.querySelector<HTMLButtonElement>('#column-lineage-panel-close')?.addEventListener('click', () => onToggleColumnFlows(false));

    runtime.columnLineagePanel.setAttribute('tabindex', '-1');
    runtime.columnLineagePanel.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        onToggleColumnFlows(false);
    });

    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `
        margin-bottom: 8px;
        position: relative;
    `;
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search columns...';
    searchInput.style.cssText = `
        width: 100%;
        padding: 6px 8px 6px 28px;
        border: 1px solid ${isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)'};
        border-radius: 4px;
        background: ${isDarkTheme ? 'rgba(26, 26, 26, 0.8)' : 'rgba(250, 250, 250, 0.9)'};
        color: ${isDarkTheme ? '#f1f5f9' : '#1e293b'};
        font-size: 11px;
        outline: none;
        box-sizing: border-box;
    `;
    const searchEl = document.createElement('span');
    searchEl.innerHTML = searchIcon;
    searchEl.style.cssText = `
        position: absolute;
        left: 8px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 10px;
        opacity: 0.6;
    `;
    searchContainer.appendChild(searchEl);
    searchContainer.appendChild(searchInput);
    runtime.columnLineagePanel.appendChild(searchContainer);

    const columnList = document.createElement('div');
    columnList.id = 'column-lineage-list';
    columnList.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    for (const flow of currentColumnFlows) {
        const item = createColumnItemFeature(flow, options);
        item.setAttribute('data-column-name', flow.outputColumn.toLowerCase());
        columnList.appendChild(item);
    }
    runtime.columnLineagePanel.appendChild(columnList);

    searchInput.addEventListener('input', (e) => {
        const query = (e.target as HTMLInputElement).value.toLowerCase();
        const items = columnList.querySelectorAll('[data-column-name]');
        items.forEach((item) => {
            const columnName = item.getAttribute('data-column-name') || '';
            const flow = currentColumnFlows.find((candidate) => candidate.outputColumn.toLowerCase() === columnName);
            const matchesQuery = columnName.includes(query)
                || Boolean(flow && flow.lineagePath.some((step) =>
                    step.columnName.toLowerCase().includes(query) || step.nodeName.toLowerCase().includes(query)));
            (item as HTMLElement).style.display = matchesQuery ? 'block' : 'none';
        });
    });

    document.body.appendChild(runtime.columnLineagePanel);
}

interface ShowLineagePathOptions {
    flow: ColumnFlow;
    detailsPanel: HTMLDivElement | null;
    isDarkTheme: boolean;
    escapeHtml: (value: string) => string;
    getTransformationColor: (transformation: string) => string;
    ensureDetailsPanelExpanded: () => void;
}

export function showLineagePathFeature(options: ShowLineagePathOptions): void {
    const { flow, detailsPanel, isDarkTheme, escapeHtml, getTransformationColor, ensureDetailsPanelExpanded } = options;
    if (!detailsPanel) {
        return;
    }
    ensureDetailsPanelExpanded();

    const transformationLabels: Record<string, string> = {
        source: 'Source',
        passthrough: 'Pass',
        renamed: 'Renamed',
        aggregated: 'Aggregated',
        calculated: 'Calculated',
        joined: 'Joined',
    };

    let pathHtml = '';
    for (let i = 0; i < flow.lineagePath.length; i++) {
        const step = flow.lineagePath[i];
        const isFirst = i === 0;
        const isLast = i === flow.lineagePath.length - 1;

        pathHtml += `
            <div style="display: flex; align-items: flex-start; gap: 10px; ${!isLast ? 'margin-bottom: 4px;' : ''}">
                <div style="
                    width: 8px;
                    min-width: 8px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                ">
                    <div style="
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: ${getTransformationColor(step.transformation)};
                        ${isFirst ? 'box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);' : ''}
                        ${isLast ? 'box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);' : ''}
                    "></div>
                    ${!isLast ? `<div style="width: 2px; height: 28px; background: ${isDarkTheme ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.1)'};"></div>` : ''}
                </div>
                <div style="flex: 1; padding-bottom: ${!isLast ? '8px' : '0'};">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                        <span style="
                            font-weight: 600;
                            font-size: 11px;
                            color: ${isDarkTheme ? '#e2e8f0' : '#1e293b'};
                        ">${escapeHtml(step.columnName)}</span>
                        <span style="
                            font-size: 9px;
                            padding: 1px 4px;
                            border-radius: 3px;
                            background: ${getTransformationColor(step.transformation)};
                            color: white;
                        ">${transformationLabels[step.transformation] || step.transformation}</span>
                    </div>
                    <div style="font-size: 10px; color: ${isDarkTheme ? '#94a3b8' : '#64748b'};">
                        ${escapeHtml(step.nodeName)}
                        ${step.expression ? `<br><code style="font-size: 9px; color: ${isDarkTheme ? '#a5b4fc' : '#6366f1'}; background: ${isDarkTheme ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)'}; padding: 1px 4px; border-radius: 3px;">${escapeHtml(step.expression)}</code>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    detailsPanel.innerHTML = `
        <div style="font-weight: 600; font-size: 12px; margin-bottom: 8px; color: ${isDarkTheme ? '#f1f5f9' : '#1e293b'};">
            Lineage Path
        </div>
        <div style="
            background: ${isDarkTheme ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)'};
            border-radius: 6px;
            padding: 6px 8px;
            margin-bottom: 10px;
        ">
            <div style="font-size: 9px; color: ${isDarkTheme ? '#94a3b8' : '#64748b'}; margin-bottom: 2px;">Output Column</div>
            <div style="font-weight: 600; font-size: 12px; color: ${isDarkTheme ? '#a5b4fc' : '#6366f1'};">
                ${escapeHtml(flow.outputColumn)}
            </div>
        </div>
        <div style="font-size: 10px; color: ${isDarkTheme ? '#94a3b8' : '#64748b'}; margin-bottom: 6px;">
            Transformation Path (${flow.lineagePath.length} steps)
        </div>
        <div style="padding-left: 2px;">
            ${pathHtml}
        </div>
    `;

    detailsPanel.style.transform = 'translate(0, -50%)';
}

function createTransformationBadge(x: number, y: number, label: string, color: string): SVGGElement {
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badge.setAttribute('transform', `translate(${x}, ${y})`);

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', '-12');
    bg.setAttribute('y', '-8');
    bg.setAttribute('width', '24');
    bg.setAttribute('height', '16');
    bg.setAttribute('rx', '4');
    bg.setAttribute('fill', color);
    badge.appendChild(bg);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '0');
    text.setAttribute('y', '4');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'white');
    text.setAttribute('font-size', '8');
    text.setAttribute('font-weight', '600');
    text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
    text.textContent = label;
    badge.appendChild(text);

    return badge;
}

function addEdgeTransformationBadge(mainGroup: SVGGElement | null, edge: SVGElement, config: { color: string; icon: string }): void {
    if (!mainGroup) {
        return;
    }
    const pathData = edge.getAttribute('d');
    if (!pathData) {
        return;
    }
    const pathMatch = pathData.match(/M\s*([\d.-]+)\s*([\d.-]+).*?([\d.-]+)\s*([\d.-]+)\s*$/);
    if (!pathMatch) {
        return;
    }

    const x1 = parseFloat(pathMatch[1]);
    const y1 = parseFloat(pathMatch[2]);
    const x2 = parseFloat(pathMatch[3]);
    const y2 = parseFloat(pathMatch[4]);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badgeGroup.classList.add('lineage-edge-badge');
    badgeGroup.setAttribute('transform', `translate(${midX}, ${midY})`);

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('r', '10');
    bg.setAttribute('fill', config.color);
    bg.setAttribute('stroke', 'white');
    bg.setAttribute('stroke-width', '1.5');
    badgeGroup.appendChild(bg);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '0');
    text.setAttribute('y', '4');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'white');
    text.setAttribute('font-size', '10');
    text.setAttribute('font-weight', '700');
    text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
    text.textContent = config.icon;
    badgeGroup.appendChild(text);

    mainGroup.appendChild(badgeGroup);
}

function clearLineageBadges(mainGroup: SVGGElement | null): void {
    if (!mainGroup) {
        return;
    }
    mainGroup.querySelectorAll('.lineage-badge').forEach((badge) => badge.remove());
    mainGroup.querySelectorAll('.lineage-edge-badge').forEach((badge) => badge.remove());
}

interface HighlightLineageNodesOptions {
    flow: ColumnFlow;
    mainGroup: SVGGElement | null;
    edgeColors: EdgeColorTokens;
}

export function highlightLineageNodesFeature(options: HighlightLineageNodesOptions): void {
    const { flow, mainGroup, edgeColors } = options;
    if (!mainGroup) {
        return;
    }

    clearLineageBadges(mainGroup);

    mainGroup.querySelectorAll('.node-group').forEach((node) => {
        (node as SVGElement).style.opacity = '0.3';
    });
    mainGroup.querySelectorAll('.edge-path, .edge-arrow').forEach((edge) => {
        (edge as SVGElement).style.opacity = '0.15';
    });

    const lineageNodeIds = new Set(flow.lineagePath.map((step) => step.nodeId));
    const nodeTransformations = new Map<string, LineagePathStep>();
    flow.lineagePath.forEach((step) => {
        nodeTransformations.set(step.nodeId, step);
    });

    const transformationBadges: Record<string, { label: string; color: string; icon: string }> = {
        source: { label: 'SRC', color: '#10b981', icon: '◉' },
        passthrough: { label: 'PASS', color: '#64748b', icon: '→' },
        renamed: { label: 'ALIAS', color: '#3b82f6', icon: '✎' },
        aggregated: { label: 'AGG', color: '#f59e0b', icon: 'Σ' },
        calculated: { label: 'CALC', color: '#8b5cf6', icon: 'ƒ' },
        joined: { label: 'JOIN', color: '#ec4899', icon: '⋈' },
    };

    for (const step of flow.lineagePath) {
        const nodeGroup = mainGroup.querySelector(`[data-node-id="${step.nodeId}"]`);
        if (!nodeGroup) {
            continue;
        }
        (nodeGroup as SVGElement).style.opacity = '1';

        const rect = nodeGroup.querySelector('rect');
        if (!rect) {
            continue;
        }
        rect.setAttribute('stroke', edgeColors.focus);
        rect.setAttribute('stroke-width', '3');

        const badgeConfig = transformationBadges[step.transformation] || transformationBadges.passthrough;
        const rectBBox = rect.getBBox();
        const badge = createTransformationBadge(
            rectBBox.x + rectBBox.width - 8,
            rectBBox.y - 8,
            badgeConfig.label,
            badgeConfig.color
        );
        badge.classList.add('lineage-badge');
        nodeGroup.appendChild(badge);
    }

    mainGroup.querySelectorAll('.edge-path').forEach((edgePath) => {
        const edge = edgePath as SVGElement;
        const sourceId = edge.getAttribute('data-source');
        const targetId = edge.getAttribute('data-target');
        if (!sourceId || !targetId || !lineageNodeIds.has(sourceId) || !lineageNodeIds.has(targetId)) {
            return;
        }

        edge.style.opacity = '1';
        edge.setAttribute('stroke', edgeColors.focus);
        edge.setAttribute('stroke-width', '3');

        const targetStep = nodeTransformations.get(targetId);
        if (targetStep && targetStep.transformation !== 'passthrough' && targetStep.transformation !== 'source') {
            const edgeBadgeConfig = transformationBadges[targetStep.transformation];
            if (edgeBadgeConfig) {
                addEdgeTransformationBadge(mainGroup, edge, edgeBadgeConfig);
            }
        }

        const arrow = mainGroup.querySelector(`.edge-arrow[data-source="${sourceId}"][data-target="${targetId}"]`);
        if (arrow) {
            (arrow as SVGElement).style.opacity = '1';
        }
    });
}

interface ClearLineageHighlightsOptions {
    mainGroup: SVGGElement | null;
    isDarkTheme: boolean;
    edgeColors: EdgeColorTokens;
    detailsPanel: HTMLDivElement | null;
}

export function clearLineageHighlightsFeature(options: ClearLineageHighlightsOptions): void {
    const { mainGroup, isDarkTheme, edgeColors, detailsPanel } = options;
    if (!mainGroup) {
        return;
    }

    clearLineageBadges(mainGroup);

    mainGroup.querySelectorAll('.node-group').forEach((node) => {
        (node as SVGElement).style.opacity = '1';
        const rect = node.querySelector('rect');
        if (!rect) {
            return;
        }
        rect.removeAttribute('stroke');
        rect.removeAttribute('stroke-width');
    });

    mainGroup.querySelectorAll('.edge-path').forEach((edge) => {
        const edgeEl = edge as SVGElement;
        edgeEl.style.opacity = '1';
        edgeEl.setAttribute('stroke', isDarkTheme ? edgeColors.default : edgeColors.defaultLight);
        edgeEl.setAttribute('stroke-width', '1.5');
    });

    mainGroup.querySelectorAll('.edge-arrow').forEach((arrow) => {
        (arrow as SVGElement).style.opacity = '1';
    });

    if (detailsPanel) {
        detailsPanel.style.transform = 'translate(100%, -50%)';
    }
}

interface HighlightColumnSourcesOptions {
    columnName: string;
    currentColumnLineage: ColumnLineage[];
    currentNodes: FlowNode[];
    currentEdges: FlowEdge[];
    mainGroup: SVGGElement | null;
    state: ViewState;
    edgeColors: EdgeColorTokens;
}

export function highlightColumnSourcesFeature(options: HighlightColumnSourcesOptions): void {
    const { columnName, currentColumnLineage, currentNodes, currentEdges, mainGroup, state, edgeColors } = options;
    if (!mainGroup) {
        return;
    }

    const lineage = currentColumnLineage.find((candidate) =>
        candidate.outputColumn.toLowerCase() === columnName.toLowerCase()
    );

    clearColumnHighlights(mainGroup, state, edgeColors);

    if (!lineage || lineage.sources.length === 0) {
        return;
    }

    state.highlightedColumnSources = lineage.sources.map((source) => source.nodeId).filter(Boolean);

    for (const source of lineage.sources) {
        if (!source.nodeId) {
            continue;
        }
        const nodeEl = mainGroup.querySelector(`.node[data-id="${source.nodeId}"]`);
        if (nodeEl) {
            const rect = nodeEl.querySelector('.node-rect');
            if (rect) {
                rect.setAttribute('stroke', edgeColors.columnLineage);
                rect.setAttribute('stroke-width', '3');
                rect.setAttribute('stroke-dasharray', '5,3');
            }
            nodeEl.classList.add('column-source-highlight');
        }
    }

    highlightPathToSelect(mainGroup, currentNodes, currentEdges, state.highlightedColumnSources, edgeColors.columnLineage);
}

function highlightPathToSelect(
    mainGroup: SVGGElement,
    currentNodes: FlowNode[],
    currentEdges: FlowEdge[],
    sourceNodeIds: string[],
    strokeColor: string
): void {
    if (sourceNodeIds.length === 0) {
        return;
    }

    const selectNode = currentNodes.find((node) => node.type === 'select');
    if (!selectNode) {
        return;
    }

    const pathNodeIds = new Set<string>(sourceNodeIds);
    for (const sourceId of sourceNodeIds) {
        findPath(sourceId, selectNode.id, currentEdges, pathNodeIds);
    }

    mainGroup.querySelectorAll('.edge').forEach((edgeEl) => {
        const source = edgeEl.getAttribute('data-source');
        const target = edgeEl.getAttribute('data-target');
        if (source && target && pathNodeIds.has(source) && pathNodeIds.has(target)) {
            edgeEl.setAttribute('stroke', strokeColor);
            edgeEl.setAttribute('stroke-width', '3');
            edgeEl.setAttribute('stroke-dasharray', '5,3');
        }
    });
}

function findPath(fromId: string, toId: string, edges: FlowEdge[], visited: Set<string>): boolean {
    if (fromId === toId) {
        return true;
    }
    for (const edge of edges) {
        if (edge.source === fromId && !visited.has(edge.target)) {
            visited.add(edge.target);
            if (findPath(edge.target, toId, edges, visited)) {
                return true;
            }
        }
    }
    return false;
}

function clearColumnHighlights(mainGroup: SVGGElement, state: ViewState, edgeColors: EdgeColorTokens): void {
    state.highlightedColumnSources = [];

    mainGroup.querySelectorAll('.column-source-highlight').forEach((nodeEl) => {
        nodeEl.classList.remove('column-source-highlight');
        const rect = nodeEl.querySelector('.node-rect');
        if (!rect) {
            return;
        }
        rect.removeAttribute('stroke-dasharray');
        if (state.selectedNodeId !== nodeEl.getAttribute('data-id')) {
            rect.removeAttribute('stroke');
            rect.removeAttribute('stroke-width');
        }
    });

    mainGroup.querySelectorAll('.edge').forEach((edgeEl) => {
        edgeEl.setAttribute('stroke', edgeColors.default);
        edgeEl.setAttribute('stroke-width', '2');
        edgeEl.removeAttribute('stroke-dasharray');
        edgeEl.setAttribute('marker-end', 'url(#arrowhead)');
    });
}
