// Renderer state type definitions

import { FlowNode } from './nodes';

export interface ZoomState {
    scale: number;
    offsetX: number;
    offsetY: number;
}

export type LayoutType = 'vertical' | 'horizontal' | 'compact' | 'force' | 'radial';

export type FocusMode = 'all' | 'upstream' | 'downstream';

export interface ViewState {
    scale: number;
    offsetX: number;
    offsetY: number;
    selectedNodeId: string | null;
    isDragging: boolean;
    dragStartX: number;
    dragStartY: number;
    isDraggingNode: boolean;
    isDraggingCloud: boolean;
    draggingNodeId: string | null;
    draggingCloudNodeId: string | null;
    dragNodeStartX: number;
    dragNodeStartY: number;
    dragCloudStartOffsetX: number;
    dragCloudStartOffsetY: number;
    dragMouseStartX: number;
    dragMouseStartY: number;
    searchTerm: string;
    searchResults: string[];
    currentSearchIndex: number;
    focusModeEnabled: boolean;
    legendVisible: boolean;
    highlightedColumnSources: string[];
    isFullscreen: boolean;
    isDarkTheme: boolean;
    isHighContrast: boolean;
    breadcrumbPath: FlowNode[];
    showColumnLineage: boolean;
    showColumnFlows: boolean;
    selectedColumn: string | null;
    zoomedNodeId: string | null;
    previousZoomState: ZoomState | null;
    layoutType?: LayoutType;
    focusMode: FocusMode;
}

export interface CloudViewState {
    scale: number;
    offsetX: number;
    offsetY: number;
    isDragging: boolean;
    dragStartX: number;
    dragStartY: number;
}

export interface CloudOffset {
    offsetX: number;
    offsetY: number;
}

export interface CloudElements {
    cloud: SVGRectElement;
    title: SVGTextElement;
    arrow: SVGPathElement;
    subflowGroup: SVGGElement;
    nestedSvg?: SVGSVGElement;
    closeButton?: SVGGElement;
}
