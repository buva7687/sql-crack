import type { FlowNode, ViewState } from '../../../src/webview/types';
import {
    addCollapseButtonFeature,
    renderNodeFeature,
} from '../../../src/webview/rendering/nodeDispatcher';

type ListenerMap = Record<string, Array<(event?: any) => void>>;

type FakeElement = {
    tagName: string;
    style: {
        cursor: string;
        opacity: string;
    };
    children: FakeElement[];
    textContent: string;
    appendChild: jest.Mock<FakeElement, [FakeElement]>;
    setAttribute: jest.Mock<void, [string, string]>;
    getAttribute: jest.Mock<string | null, [string]>;
    removeAttribute: jest.Mock<void, [string]>;
    addEventListener: jest.Mock<void, [string, (event?: any) => void]>;
    querySelector: jest.Mock<FakeElement | null, [string]>;
    closest: jest.Mock<null, []>;
    dispatchEvent: jest.Mock<boolean, [any]>;
    emit(type: string, event?: any): void;
    focus: jest.Mock<void, []>;
};

function createElement(tagName: string): FakeElement {
    const attrs = new Map<string, string>();
    const listeners: ListenerMap = {};
    const element: FakeElement = {
        tagName,
        style: {
            cursor: '',
            opacity: '',
        },
        children: [] as any[],
        textContent: '',
        appendChild: jest.fn((child: any) => {
            element.children.push(child);
            return child;
        }),
        setAttribute: jest.fn((name: string, value: string) => {
            attrs.set(name, value);
        }),
        getAttribute: jest.fn((name: string) => attrs.get(name) || null),
        removeAttribute: jest.fn((name: string) => {
            attrs.delete(name);
        }),
        addEventListener: jest.fn((type: string, handler: (event?: any) => void) => {
            listeners[type] = listeners[type] || [];
            listeners[type].push(handler);
        }),
        querySelector: jest.fn((selector: string): FakeElement | null => {
            for (const child of element.children) {
                if (selector === '.node-rect' && child.getAttribute?.('class') === 'node-rect') {
                    return child;
                }
                if (selector === '.collapse-btn' && child.getAttribute?.('class') === 'collapse-btn') {
                    return child;
                }
            }
            return null;
        }),
        closest: jest.fn(() => null),
        dispatchEvent: jest.fn((event: any) => {
            for (const handler of listeners[event.type] || []) {
                handler(event);
            }
            return true;
        }),
        emit(type: string, event: any = {}) {
            event.type = type;
            for (const handler of listeners[type] || []) {
                handler(event);
            }
        },
        focus: jest.fn(),
    };
    return element;
}

function createState(overrides: Partial<ViewState> = {}): ViewState {
    return {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        selectedNodeId: null,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        isDraggingNode: false,
        isDraggingCloud: false,
        draggingNodeId: null,
        draggingCloudNodeId: null,
        dragNodeStartX: 0,
        dragNodeStartY: 0,
        dragCloudStartOffsetX: 0,
        dragCloudStartOffsetY: 0,
        dragMouseStartX: 0,
        dragMouseStartY: 0,
        searchTerm: '',
        searchResults: [],
        currentSearchIndex: -1,
        focusModeEnabled: false,
        legendVisible: true,
        highlightedColumnSources: [],
        isFullscreen: false,
        isDarkTheme: true,
        isHighContrast: false,
        breadcrumbPath: [],
        showColumnLineage: false,
        showColumnFlows: false,
        selectedColumn: null,
        zoomedNodeId: null,
        previousZoomState: null,
        layoutType: 'vertical',
        focusMode: 'all',
        ...overrides,
    };
}

function createRect() {
    return createElement('rect');
}

describe('nodeDispatcher', () => {
    beforeEach(() => {
        (global as any).document = {
            createElementNS: jest.fn((_ns: string, tag: string) => createElement(tag)),
        };
        (global as any).MouseEvent = class {
            type: string;
            bubbles: boolean;
            constructor(type: string, init?: { bubbles?: boolean }) {
                this.type = type;
                this.bubbles = !!init?.bubbles;
            }
        };
    });

    afterEach(() => {
        delete (global as any).document;
        delete (global as any).MouseEvent;
    });

    it('adds a working collapse button with hover states', () => {
        const node: FlowNode = {
            id: 'cte_1',
            type: 'cte',
            label: 'cte_1',
            x: 10,
            y: 20,
            width: 100,
            height: 60,
            expanded: true,
        };
        const group = createElement('g');
        const onToggle = jest.fn();

        addCollapseButtonFeature(node, group as any, onToggle);

        const button = group.children.find((child: FakeElement) => child.getAttribute('class') === 'collapse-btn');
        const icon = group.children.find((child: FakeElement) => child.getAttribute('class') === 'collapse-icon');
        expect(button).toBeDefined();
        expect(icon?.textContent).toBe('−');

        button!.emit('mouseenter');
        expect(button!.setAttribute).toHaveBeenCalledWith('fill', 'rgba(99, 102, 241, 0.5)');
        button!.emit('mouseleave');
        expect(button!.setAttribute).toHaveBeenCalledWith('fill', 'rgba(255, 255, 255, 0.15)');

        const stopPropagation = jest.fn();
        button!.emit('click', { stopPropagation });
        expect(stopPropagation).toHaveBeenCalled();
        expect(onToggle).toHaveBeenCalledWith('cte_1');
    });

    it('dispatches standard nodes, wiring selection, keyboard focus, and zoom pulse', () => {
        const parent = createElement('g');
        const svg = { focus: jest.fn(), getBoundingClientRect: () => ({ left: 0, top: 0 }) };
        const node: FlowNode = {
            id: 'n1',
            type: 'table',
            label: 'users',
            description: 'user table',
            x: 10,
            y: 20,
            width: 120,
            height: 50,
        };
        const rect = createRect();
        rect.setAttribute('class', 'node-rect');
        const callbacks = {
            renderStandardNode: jest.fn(),
            renderContainerNode: jest.fn((_node: FlowNode, group: any) => {
                group.appendChild(rect);
            }),
            renderClusterNode: jest.fn(),
            renderWindowNode: jest.fn(),
            renderAggregateNode: jest.fn(),
            renderCaseNode: jest.fn(),
            renderJoinNode: jest.fn(),
            onClusterToggle: jest.fn(),
            highlightConnectedEdges: jest.fn(),
            showTooltip: jest.fn(),
            updateTooltipPosition: jest.fn(),
            hideTooltip: jest.fn(),
            selectNode: jest.fn(),
            navigateToAdjacentNode: jest.fn(),
            navigateToConnectedNode: jest.fn(() => true),
            navigateToSiblingNode: jest.fn(() => true),
            announceFocusedNode: jest.fn(),
            onContainerExpandRequested: jest.fn(),
            onZoomPulseRequested: jest.fn(),
            showContextMenu: jest.fn(),
            onToggleNodeCollapse: jest.fn(),
        };

        renderNodeFeature({
            node,
            parent: parent as any,
            state: createState(),
            svg: svg as any,
            cloudViewStates: new Map(),
            ...callbacks,
        });

        const group = parent.children[0];
        expect(callbacks.renderStandardNode).toHaveBeenCalled();
        expect(group.setAttribute).toHaveBeenCalledWith('role', 'button');
        expect(group.setAttribute).toHaveBeenCalledWith('tabindex', '0');
        expect(group.setAttribute).toHaveBeenCalledWith('aria-label', 'table node: users. user table');

        const stopPropagation = jest.fn();
        group.emit('click', { stopPropagation, ctrlKey: false, metaKey: false });
        expect(callbacks.selectNode).toHaveBeenCalledWith('n1', { skipNavigation: true });
        expect(callbacks.hideTooltip).toHaveBeenCalled();
        expect(svg.focus).toHaveBeenCalled();

        group.emit('keydown', {
            key: 'ArrowUp',
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
            ctrlKey: false,
            metaKey: false,
            altKey: false,
        });
        expect(callbacks.navigateToConnectedNode).toHaveBeenCalledWith('upstream', 'n1');

        group.emit('dblclick', { stopPropagation: jest.fn() });
        expect(callbacks.onZoomPulseRequested).toHaveBeenCalledWith(node);

        group.emit('contextmenu', { preventDefault: jest.fn(), stopPropagation: jest.fn() });
        expect(callbacks.showContextMenu).toHaveBeenCalledWith(node, expect.any(Object));
    });

    it('dispatches cluster nodes through cluster renderer/toggle path only', () => {
        const parent = createElement('g');
        const node: FlowNode = {
            id: 'cluster_1',
            type: 'cluster',
            label: 'cluster',
            x: 0,
            y: 0,
            width: 80,
            height: 40,
        };
        const callbacks = {
            renderStandardNode: jest.fn(),
            renderClusterNode: jest.fn(),
            renderContainerNode: jest.fn(),
            renderWindowNode: jest.fn(),
            renderAggregateNode: jest.fn(),
            renderCaseNode: jest.fn(),
            renderJoinNode: jest.fn(),
            onClusterToggle: jest.fn(),
            highlightConnectedEdges: jest.fn(),
            showTooltip: jest.fn(),
            updateTooltipPosition: jest.fn(),
            hideTooltip: jest.fn(),
            selectNode: jest.fn(),
            navigateToAdjacentNode: jest.fn(),
            navigateToConnectedNode: jest.fn(() => true),
            navigateToSiblingNode: jest.fn(() => true),
            announceFocusedNode: jest.fn(),
            onContainerExpandRequested: jest.fn(),
            onZoomPulseRequested: jest.fn(),
            showContextMenu: jest.fn(),
            onToggleNodeCollapse: jest.fn(),
        };

        renderNodeFeature({
            node,
            parent: parent as any,
            state: createState(),
            svg: null,
            cloudViewStates: new Map(),
            ...callbacks,
        });

        const group = parent.children[0];
        expect(callbacks.renderClusterNode).toHaveBeenCalledWith(node, group);
        expect(callbacks.renderStandardNode).not.toHaveBeenCalled();

        group.emit('click', { stopPropagation: jest.fn() });
        expect(callbacks.onClusterToggle).toHaveBeenCalledWith('cluster_1');
    });

    it('does not start dragging when the collapse button is the mousedown target', () => {
        const parent = createElement('g');
        const svg = { focus: jest.fn(), getBoundingClientRect: () => ({ left: 0, top: 0 }) };
        const node: FlowNode = {
            id: 'cte_2',
            type: 'cte',
            label: 'cte_2',
            x: 10,
            y: 20,
            width: 120,
            height: 60,
            expanded: true,
            children: [{ id: 'child', type: 'table', label: 'child', x: 0, y: 0, width: 80, height: 30 }],
        };
        const rect = createRect();
        rect.setAttribute('class', 'node-rect');
        const callbacks = {
            renderStandardNode: jest.fn((_node: FlowNode, group: any) => {
                group.appendChild(rect);
            }),
            renderClusterNode: jest.fn(),
            renderContainerNode: jest.fn(),
            renderWindowNode: jest.fn(),
            renderAggregateNode: jest.fn(),
            renderCaseNode: jest.fn(),
            renderJoinNode: jest.fn(),
            onClusterToggle: jest.fn(),
            highlightConnectedEdges: jest.fn(),
            showTooltip: jest.fn(),
            updateTooltipPosition: jest.fn(),
            hideTooltip: jest.fn(),
            selectNode: jest.fn(),
            navigateToAdjacentNode: jest.fn(),
            navigateToConnectedNode: jest.fn(() => true),
            navigateToSiblingNode: jest.fn(() => true),
            announceFocusedNode: jest.fn(),
            onContainerExpandRequested: jest.fn(),
            onZoomPulseRequested: jest.fn(),
            showContextMenu: jest.fn(),
            onToggleNodeCollapse: jest.fn(),
        };

        renderNodeFeature({
            node,
            parent: parent as any,
            state: createState(),
            svg: svg as any,
            cloudViewStates: new Map(),
            ...callbacks,
        });

        const group = parent.children[0];
        const collapseTarget = {
            closest: jest.fn((selector: string) => (selector === '.collapse-btn' ? {} : null)),
        };

        group.emit('mousedown', {
            target: collapseTarget,
            clientX: 20,
            clientY: 30,
            stopPropagation: jest.fn(),
        });

        expect(collapseTarget.closest).toHaveBeenCalledWith('.collapse-btn');
        expect((group as any).style.opacity).toBe('');
        expect(callbacks.onContainerExpandRequested).not.toHaveBeenCalled();
    });
});
