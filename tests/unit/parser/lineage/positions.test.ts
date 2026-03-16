import { calculateColumnPositions } from '../../../../src/webview/parser/lineage/positions';
import { FlowNode } from '../../../../src/webview/types';

function makeNode(overrides: Partial<FlowNode>): FlowNode {
    return {
        id: 'n1',
        type: 'table',
        label: 'test',
        x: 0,
        y: 0,
        width: 120,
        height: 40,
        columns: [],
        ...overrides,
    } as FlowNode;
}

describe('calculateColumnPositions', () => {
    it('skips nodes with no columns', () => {
        const node = makeNode({ columns: [] });
        calculateColumnPositions([node]);
        expect(node.columnPositions).toBeUndefined();
    });

    it('positions table columns vertically on the right edge', () => {
        const node = makeNode({
            type: 'table',
            width: 120,
            columns: [
                { name: 'id', expression: 'col' },
                { name: 'name', expression: 'col' },
                { name: 'email', expression: 'col' },
            ],
        });
        calculateColumnPositions([node]);

        expect(node.columnPositions!.size).toBe(3);
        expect(node.columnPositions!.get('id')).toEqual({ x: 120, y: 20 });
        expect(node.columnPositions!.get('name')).toEqual({ x: 120, y: 38 });
        expect(node.columnPositions!.get('email')).toEqual({ x: 120, y: 56 });
        expect(node.visibleColumns).toEqual(['id', 'name', 'email']);
    });

    it('limits table columns to 10 visible', () => {
        const columns = Array.from({ length: 15 }, (_, i) => ({ name: `col${i}`, expression: 'col' }));
        const node = makeNode({ type: 'table', columns });
        calculateColumnPositions([node]);

        expect(node.visibleColumns!.length).toBe(10);
        expect(node.columnPositions!.size).toBe(10);
        expect(node.columnPositions!.has('col10')).toBe(false);
    });

    it('positions select columns in a grid layout', () => {
        const columns = Array.from({ length: 6 }, (_, i) => ({ name: `c${i}`, expression: 'col' }));
        const node = makeNode({ type: 'select', height: 40, columns });
        calculateColumnPositions([node]);

        expect(node.visibleColumns!.length).toBe(6);
        // First row: c0 at x=10, c1 at x=90, c2 at x=170, c3 at x=250
        expect(node.columnPositions!.get('c0')).toEqual({ x: 10, y: 40 });
        expect(node.columnPositions!.get('c1')).toEqual({ x: 90, y: 40 });
        // Second row: c4 at x=10, c5 at x=90
        expect(node.columnPositions!.get('c4')).toEqual({ x: 10, y: 55 });
    });

    it('limits select columns to 8 visible', () => {
        const columns = Array.from({ length: 12 }, (_, i) => ({ name: `c${i}`, expression: 'col' }));
        const node = makeNode({ type: 'select', columns });
        calculateColumnPositions([node]);

        expect(node.visibleColumns!.length).toBe(8);
    });

    it('positions aggregate columns from aggregateDetails', () => {
        const node = makeNode({
            type: 'aggregate',
            width: 160,
            height: 50,
            columns: [{ name: 'cnt', expression: 'col' }],
            aggregateDetails: {
                functions: [
                    { name: 'COUNT', alias: 'cnt', expression: 'COUNT(*)' },
                    { name: 'SUM', alias: 'total', expression: 'SUM(amount)' },
                ],
                groupBy: [],
            },
        } as any);
        calculateColumnPositions([node]);

        expect(node.columnPositions!.get('cnt')).toEqual({ x: 80, y: 50 });
        expect(node.columnPositions!.get('total')).toEqual({ x: 80, y: 65 });
    });

    it('positions window function columns from windowDetails', () => {
        const node = makeNode({
            type: 'window',
            width: 140,
            height: 50,
            columns: [{ name: 'row_num', expression: 'col' }],
            windowDetails: {
                functions: [
                    { name: 'ROW_NUMBER', partitionBy: [], orderBy: [] },
                ],
            },
        } as any);
        calculateColumnPositions([node]);

        expect(node.columnPositions!.get('ROW_NUMBER')).toEqual({ x: 70, y: 50 });
    });

    it('uses default layout for unknown node types', () => {
        const columns = Array.from({ length: 7 }, (_, i) => ({ name: `f${i}`, expression: 'col' }));
        const node = makeNode({ type: 'filter' as any, width: 100, height: 30, columns });
        calculateColumnPositions([node]);

        // Default caps at 5
        expect(node.visibleColumns!.length).toBe(5);
        expect(node.columnPositions!.get('f0')).toEqual({ x: 50, y: 30 });
        expect(node.columnPositions!.get('f4')).toEqual({ x: 50, y: 78 });
    });

    it('processes multiple nodes independently', () => {
        const table = makeNode({
            id: 'n1',
            type: 'table',
            width: 100,
            columns: [{ name: 'a', expression: 'col' }],
        });
        const select = makeNode({
            id: 'n2',
            type: 'select',
            height: 30,
            columns: [{ name: 'b', expression: 'col' }],
        });
        calculateColumnPositions([table, select]);

        expect(table.columnPositions!.has('a')).toBe(true);
        expect(select.columnPositions!.has('b')).toBe(true);
    });
});
