import type {
    FlowEdge,
    FlowNode,
} from './nodes';
import type {
    ColumnFlow,
    ColumnLineage,
} from './lineage';
import type {
    OptimizationHint,
    QueryStats,
} from './parser';
import type {
    ViewState,
    CloudOffset,
    CloudElements,
    CloudViewState,
} from './renderer';
import type { NodeCluster } from '../clustering';

export interface RendererDomContext {
    getSvg: () => SVGSVGElement | null;
    getMainGroup: () => SVGGElement | null;
    getContainerElement: () => HTMLElement | null;
    getSearchBox: () => HTMLInputElement | null;
}

export interface RenderDataContext {
    getCurrentNodes: () => FlowNode[];
    getCurrentEdges: () => FlowEdge[];
    getRenderNodes: () => FlowNode[];
    getRenderEdges: () => FlowEdge[];
    getRenderNodeMap: () => Map<string, FlowNode>;
    getCurrentClusters: () => NodeCluster[];
    getClusterNodeMap: () => Map<string, NodeCluster>;
    getCurrentColumnFlows: () => ColumnFlow[];
    getCurrentStats: () => QueryStats | null;
    getCurrentHints: () => OptimizationHint[];
    getCurrentSql: () => string;
    getCurrentColumnLineage: () => ColumnLineage[];
    getCurrentTableUsage: () => Map<string, number>;
}

export interface PanelElementsContext {
    getDetailsPanel: () => HTMLDivElement | null;
    getStatsPanel: () => HTMLDivElement | null;
    getHintsPanel: () => HTMLDivElement | null;
    getLegendPanel: () => HTMLDivElement | null;
    getSqlPreviewPanel: () => HTMLDivElement | null;
}

export interface CloudStateContext {
    cloudOffsets: Map<string, CloudOffset>;
    cloudElements: Map<string, CloudElements>;
    cloudViewStates: Map<string, CloudViewState>;
}

export interface RendererContext {
    state: ViewState;
    dom: RendererDomContext;
    renderData: RenderDataContext;
    panels: PanelElementsContext;
    cloud: CloudStateContext;
    emit: (event: string, data?: unknown) => void;
}
