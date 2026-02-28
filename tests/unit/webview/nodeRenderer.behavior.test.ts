import type { FlowNode, ViewState } from '../../../src/webview/types';
import {
    renderJoinNodeVisual,
    renderStandardNodeVisual,
    type NodeVisualRendererDeps,
} from '../../../src/webview/rendering/nodeRenderer';

function createSvgElement(tagName: string) {
    const attrs = new Map<string, string>();
    const element = {
        tagName,
        style: { cssText: '' },
        children: [] as any[],
        textContent: '',
        innerHTML: '',
        appendChild: jest.fn((child: any) => {
            element.children.push(child);
            return child;
        }),
        setAttribute: jest.fn((name: string, value: string) => {
            attrs.set(name, value);
        }),
        getAttribute: jest.fn((name: string) => attrs.get(name) || null),
        querySelector: jest.fn(() => null),
    };
    return element;
}

function createDeps(overrides: Partial<NodeVisualRendererDeps> = {}): NodeVisualRendererDeps {
    return {
        state: {
            isDarkTheme: true,
        } as ViewState,
        getNodeAccentPosition: () => 'left',
        getNodeVisualIcon: () => 'T',
        getJoinColor: () => '#22c55e',
        getJoinVennDiagram: () => '<svg class="venn"></svg>',
        getWarningColor: () => '#ef4444',
        truncate: (value) => value,
        ...overrides,
    };
}

describe('nodeRenderer behavior', () => {
    let createdElements: Array<ReturnType<typeof createSvgElement>>;

    beforeEach(() => {
        createdElements = [];
        (global as any).document = {
            createElementNS: jest.fn((_ns: string, tag: string) => {
                const el = createSvgElement(tag);
                createdElements.push(el);
                return el;
            }),
            createElement: jest.fn((tag: string) => {
                const el = createSvgElement(tag);
                createdElements.push(el);
                return el;
            }),
        };
    });

    afterEach(() => {
        delete (global as any).document;
    });

    it('renders standard nodes with accent strip, badges, and warning indicator', () => {
        const group = createSvgElement('g');
        const node: FlowNode = {
            id: 'n1',
            type: 'table',
            label: 'users',
            description: 'user table',
            x: 10,
            y: 20,
            width: 180,
            height: 60,
            accessMode: 'write',
            operationType: 'DELETE',
            warnings: [{ type: 'expensive', severity: 'high', message: 'scan' }],
        };

        renderStandardNodeVisual(node, group as any, createDeps());

        const nodeRect = createdElements.find(el => el.tagName === 'rect' && el.getAttribute('class') === 'node-rect');
        const accentStrip = createdElements.find(el => el.tagName === 'rect' && el.getAttribute('class') === 'node-accent');
        const warningTriangle = createdElements.find(el => el.tagName === 'path' && el.getAttribute('class') === 'node-warning-triangle');
        const warningIcon = createdElements.find(el => el.tagName === 'text' && el.getAttribute('class') === 'node-warning-icon');
        const texts = createdElements.filter(el => el.tagName === 'text').map(el => el.textContent);

        expect(nodeRect).toBeDefined();
        expect(nodeRect!.setAttribute).toHaveBeenCalledWith('stroke-width', '2');
        expect(accentStrip).toBeDefined();
        expect(accentStrip!.setAttribute).toHaveBeenCalledWith('fill', expect.any(String));
        expect(warningTriangle).toBeDefined();
        expect(warningIcon).toBeDefined();
        expect(texts).toContain('users');
        expect(texts).toContain('user table');
        expect(texts).toContain('WRITE');
        expect(texts).toContain('DELETE');
    });

    it('renders join nodes with a foreignObject venn diagram and detail labels', () => {
        const group = createSvgElement('g');
        const node: FlowNode = {
            id: 'j1',
            type: 'join',
            label: 'LEFT JOIN',
            details: ['u.id = o.user_id', 'orders'],
            x: 10,
            y: 20,
            width: 180,
            height: 60,
        };

        renderJoinNodeVisual(node, group as any, createDeps({
            truncate: (value, maxLen) => value.slice(0, maxLen),
        }));

        const foreignObject = createdElements.find(el => el.tagName === 'foreignObject');
        const div = createdElements.find(el => el.tagName === 'div');
        const texts = createdElements.filter(el => el.tagName === 'text').map(el => el.textContent);

        expect(foreignObject).toBeDefined();
        expect(div).toBeDefined();
        expect(div!.innerHTML).toContain('venn');
        expect(texts).toContain('LEFT JOIN');
        expect(texts).toContain('u.id = o.user_id'.slice(0, 18));
        expect(texts).toContain('orders');
    });
});
