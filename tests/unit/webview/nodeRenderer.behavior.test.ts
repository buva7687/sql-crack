import type { FlowNode, ViewState } from '../../../src/webview/types';
import {
    renderAggregateNodeVisual,
    renderCaseNodeVisual,
    renderJoinNodeVisual,
    renderStandardNodeVisual,
    renderWindowNodeVisual,
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

    it('renders window nodes with partition/order badges and overflow summary', () => {
        const group = createSvgElement('g');
        const node: FlowNode = {
            id: 'w1',
            type: 'window',
            label: 'window funcs',
            x: 10,
            y: 20,
            width: 220,
            height: 140,
            windowDetails: {
                functions: [
                    { name: 'ROW_NUMBER', partitionBy: ['dept'], orderBy: ['created_at'] },
                    { name: 'RANK', orderBy: ['salary'] },
                    { name: 'DENSE_RANK' },
                    { name: 'LAG' },
                    { name: 'LEAD' },
                ],
            },
        };

        renderWindowNodeVisual(node, group as any, createDeps());

        const texts = createdElements.filter(el => el.tagName === 'text').map(el => el.textContent);
        expect(texts).toContain('WINDOW (5)');
        expect(texts).toContain('ROW_NUMBER');
        expect(texts).toContain('RANK');
        expect(texts).toContain('P');
        expect(texts).toContain('O');
        expect(texts).toContain('+1 more');
    });

    it('renders aggregate nodes with truncated expressions and overflow summary', () => {
        const group = createSvgElement('g');
        const longExpr = 'SUM(CASE WHEN fiscal_year = 2024 THEN revenue ELSE 0 END)';
        const node: FlowNode = {
            id: 'a1',
            type: 'aggregate',
            label: 'agg',
            x: 10,
            y: 20,
            width: 220,
            height: 140,
            aggregateDetails: {
                functions: [
                    { name: 'SUM', expression: longExpr },
                    { name: 'COUNT', expression: 'COUNT(*)' },
                    { name: 'AVG', expression: 'AVG(price)' },
                    { name: 'MAX', expression: 'MAX(updated_at)' },
                    { name: 'MIN', expression: 'MIN(created_at)' },
                ],
            },
        };

        renderAggregateNodeVisual(node, group as any, createDeps());

        const texts = createdElements.filter(el => el.tagName === 'text').map(el => el.textContent);
        expect(texts).toContain('AGGREGATE (5)');
        expect(texts).toContain(`${longExpr.substring(0, 22)}...`);
        expect(texts).toContain('COUNT(*)');
        expect(texts).toContain('+1 more');
    });

    it('renders case nodes with ELSE truncation and hidden-case summary', () => {
        const group = createSvgElement('g');
        const node: FlowNode = {
            id: 'c1',
            type: 'case',
            label: 'case',
            x: 10,
            y: 20,
            width: 220,
            height: 190,
            caseDetails: {
                cases: [
                    {
                        conditions: [{ when: 'a = 1', then: 'one' }],
                        elseValue: 'small label',
                    },
                    {
                        conditions: [{ when: 'b = 2', then: 'two' }, { when: 'b = 3', then: 'three' }],
                        elseValue: 'a very long else branch that should truncate cleanly',
                    },
                    {
                        conditions: [{ when: 'c = 4', then: 'four' }],
                    },
                    {
                        conditions: [{ when: 'd = 5', then: 'five' }],
                    },
                ],
            },
        };

        renderCaseNodeVisual(node, group as any, createDeps());

        const texts = createdElements.filter(el => el.tagName === 'text').map(el => el.textContent);
        expect(texts).toContain('CASE (4)');
        expect(texts).toContain('1 WHEN condition');
        expect(texts).toContain('2 WHEN conditions');
        expect(texts).toContain('ELSE: small label');
        expect(texts).toContain('ELSE: a very long else ...');
        expect(texts).toContain('+1 more');
    });
});
