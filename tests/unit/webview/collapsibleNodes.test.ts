import type { CloudViewState, FlowNode, ParseResult } from '../../../src/webview/types';
import {
    toggleExpandAllFeature,
    toggleNodeCollapseFeature,
} from '../../../src/webview/features/collapsibleNodes';

function createExpandableNode(id: string, x: number, y: number, expanded: boolean): FlowNode {
    return {
        id,
        type: 'cte',
        label: id,
        x,
        y,
        width: 160,
        height: 60,
        collapsible: true,
        expanded,
        children: [
            { id: `${id}-child`, type: 'table', label: `${id}-child`, x: 0, y: 0, width: 120, height: 40 },
        ],
        childEdges: [],
    };
}

function createParseResult(): ParseResult {
    return {
        nodes: [],
        edges: [],
        stats: {} as any,
        hints: [],
        sql: '',
        columnLineage: [],
        tableUsage: new Map(),
    };
}

describe('collapsibleNodes feature', () => {
    it('toggles a collapsible node and re-renders', () => {
        const node = createExpandableNode('cte_1', 0, 0, false);
        const createRenderResult = jest.fn(() => createParseResult());
        const onRender = jest.fn();

        toggleNodeCollapseFeature({
            nodeId: 'cte_1',
            currentNodes: [node],
            createRenderResult,
            onRender,
        });

        expect(node.expanded).toBe(true);
        expect(createRenderResult).toHaveBeenCalledTimes(1);
        expect(onRender).toHaveBeenCalledTimes(1);
    });

    it('ignores non-collapsible or missing nodes', () => {
        const staticNode: FlowNode = {
            id: 'table_1',
            type: 'table',
            label: 'users',
            x: 0,
            y: 0,
            width: 160,
            height: 60,
        };
        const createRenderResult = jest.fn();
        const onRender = jest.fn();

        toggleNodeCollapseFeature({
            nodeId: 'table_1',
            currentNodes: [staticNode],
            createRenderResult,
            onRender,
        });

        expect(createRenderResult).not.toHaveBeenCalled();
        expect(onRender).not.toHaveBeenCalled();
    });

    it('expands all collapsed expandable clouds, seeds view state, and fits the view', () => {
        jest.useFakeTimers();
        const first = createExpandableNode('cte_1', 0, 300, false);
        const second = createExpandableNode('cte_2', 220, 300, false);
        const onRender = jest.fn();
        const onFitView = jest.fn();
        const onSwitchToVerticalLayout = jest.fn();
        const createRenderResult = jest.fn(() => createParseResult());
        const cloudOffsets = new Map<string, { offsetX: number; offsetY: number }>();
        const cloudViewStates = new Map<string, CloudViewState>();

        toggleExpandAllFeature({
            currentNodes: [first, second],
            currentEdges: [],
            cloudOffsets,
            cloudViewStates,
            layoutSubflowNodesVertical: (children) => ({ width: Math.max(120, children.length * 120), height: 80 }),
            createRenderResult,
            onRender,
            wasHorizontalLayout: true,
            onSwitchToVerticalLayout,
            onFitView,
        });

        expect(first.expanded).toBe(true);
        expect(second.expanded).toBe(true);
        expect(cloudViewStates.has('cte_1')).toBe(true);
        expect(cloudViewStates.has('cte_2')).toBe(true);
        expect(cloudOffsets.has('cte_1')).toBe(true);
        expect(cloudOffsets.has('cte_2')).toBe(true);
        expect(onRender).toHaveBeenCalledTimes(1);
        expect(onSwitchToVerticalLayout).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(100);
        expect(onFitView).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    it('collapses expanded clouds and clears stored offsets', () => {
        jest.useFakeTimers();
        const expandedNode = createExpandableNode('cte_1', 0, 300, true);
        const cloudOffsets = new Map<string, { offsetX: number; offsetY: number }>([
            ['cte_1', { offsetX: 20, offsetY: -100 }],
        ]);
        const cloudViewStates = new Map<string, CloudViewState>([
            ['cte_1', { scale: 1, offsetX: 0, offsetY: 0, isDragging: false, dragStartX: 0, dragStartY: 0 }],
        ]);
        const onRender = jest.fn();

        toggleExpandAllFeature({
            currentNodes: [expandedNode],
            currentEdges: [],
            cloudOffsets,
            cloudViewStates,
            layoutSubflowNodesVertical: () => ({ width: 120, height: 80 }),
            createRenderResult: () => createParseResult(),
            onRender,
            wasHorizontalLayout: false,
            onSwitchToVerticalLayout: jest.fn(),
            onFitView: jest.fn(),
        });

        expect(expandedNode.expanded).toBe(false);
        expect(cloudOffsets.has('cte_1')).toBe(false);
        expect(onRender).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });
});
