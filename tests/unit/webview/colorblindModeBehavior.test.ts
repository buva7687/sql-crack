import type { FlowNode } from '../../../src/webview/types';
import { EDGE_DASH_PATTERNS } from '../../../src/webview/constants/colors';
import { applyColorblindModeToRenderedGraph } from '../../../src/webview/features/theme';

function createNodeGroup(nodeId: string) {
    const accent = { setAttribute: jest.fn() };
    const nodeIcon = { textContent: '' };
    const warningTriangle = { setAttribute: jest.fn() };
    const warningIcon = { textContent: '' };

    return {
        getAttribute: jest.fn((name: string) => (name === 'data-id' ? nodeId : null)),
        querySelector: jest.fn((selector: string) => {
            if (selector === '.node-accent') { return accent; }
            if (selector === '.node-main-icon') { return nodeIcon; }
            if (selector === '.node-warning-triangle') { return warningTriangle; }
            if (selector === '.node-warning-icon') { return warningIcon; }
            return null;
        }),
        accent,
        nodeIcon,
        warningTriangle,
        warningIcon,
    };
}

function createEdge(clauseType?: string) {
    return {
        getAttribute: jest.fn((name: string) => (name === 'data-clause-type' ? clauseType ?? null : null)),
        setAttribute: jest.fn(),
        removeAttribute: jest.fn(),
    };
}

describe('applyColorblindModeToRenderedGraph', () => {
    it('updates node accents/icons/warnings and edge dash patterns', () => {
        const warningNode: FlowNode = {
            id: 'n1',
            type: 'table',
            label: 'users',
            x: 0,
            y: 0,
            width: 100,
            height: 40,
            warnings: [{ type: 'expensive', severity: 'high', message: 'scan' }],
        };
        const plainNode: FlowNode = {
            id: 'n2',
            type: 'join',
            label: 'JOIN',
            x: 0,
            y: 0,
            width: 100,
            height: 40,
        };
        const nodeGroup = createNodeGroup('n1');
        const plainGroup = createNodeGroup('n2');
        const joinEdge = createEdge('join');
        const subqueryEdge = createEdge('subquery_flow');
        const flowEdge = createEdge('flow');

        applyColorblindModeToRenderedGraph({
            getEdgeDashPattern: (clauseType?: string) => clauseType === 'join' ? '8,3' : null,
            getNodeColor: (nodeType) => nodeType === 'table' ? '#00f' : '#0f0',
            getNodeVisualIcon: (node) => node.type === 'table' ? 'T' : 'J',
            getSeverityIcon: (severity) => severity === 'high' ? '!' : '?',
            getWarningColor: (severity) => severity === 'high' ? '#f00' : '#ff0',
            getWarningIndicatorState: (warnings) => warnings?.length ? { severity: 'high' } : null,
            mainGroup: {
                querySelectorAll: jest.fn((selector: string) => {
                    if (selector === '.node') {
                        return [nodeGroup, plainGroup];
                    }
                    if (selector === '.edge') {
                        return [joinEdge, subqueryEdge, flowEdge];
                    }
                    return [];
                }),
            } as any,
            nodes: [warningNode, plainNode],
        });

        expect(nodeGroup.accent.setAttribute).toHaveBeenCalledWith('fill', '#00f');
        expect(plainGroup.accent.setAttribute).toHaveBeenCalledWith('fill', '#0f0');
        expect(nodeGroup.nodeIcon.textContent).toBe('T');
        expect(plainGroup.nodeIcon.textContent).toBe('J');
        expect(nodeGroup.warningTriangle.setAttribute).toHaveBeenCalledWith('fill', '#f00');
        expect(nodeGroup.warningIcon.textContent).toBe('!');
        expect(joinEdge.setAttribute).toHaveBeenCalledWith('stroke-dasharray', '8,3');
        expect(subqueryEdge.setAttribute).toHaveBeenCalledWith('stroke-dasharray', EDGE_DASH_PATTERNS.subquery_flow!);
        expect(flowEdge.removeAttribute).toHaveBeenCalledWith('stroke-dasharray');
    });

    it('returns early when no main group is available', () => {
        expect(() => applyColorblindModeToRenderedGraph({
            getEdgeDashPattern: () => null,
            getNodeColor: () => '#000',
            getNodeVisualIcon: () => '',
            getSeverityIcon: () => '',
            getWarningColor: () => '#000',
            getWarningIndicatorState: () => null,
            mainGroup: null,
            nodes: [],
        })).not.toThrow();
    });
});
