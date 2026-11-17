import { parseSql } from '../../../../src/webview/sqlParser';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ParseResult } from '../../../../src/webview/types';
import { computeCompareDiff, positionRemovedGhostNodes } from '../../../../src/webview/ui/compareView';

function makeResult(
    labels: string[],
    statsOverrides: Partial<ParseResult['stats']> = {},
    detailsByLabel: Record<string, string[]> = {}
): ParseResult {
    const nodes = labels.map((label, index) => ({
        id: `${label}-${index}`,
        type: 'table' as const,
        label,
        x: 80 + (index * 220),
        y: 80,
        width: 170,
        height: 56,
        details: detailsByLabel[label] || [],
    }));

    const edges = labels.slice(1).map((label, index) => ({
        id: `e-${index}`,
        source: `${labels[index]}-${index}`,
        target: `${label}-${index + 1}`,
    }));

    return {
        nodes,
        edges,
        stats: {
            tables: labels.length,
            joins: Math.max(0, labels.length - 1),
            subqueries: 0,
            ctes: 0,
            aggregations: 0,
            windowFunctions: 0,
            unions: 0,
            conditions: 0,
            complexity: 'Simple',
            complexityScore: labels.length,
            ...statsOverrides,
        },
        hints: [],
        sql: labels.join(','),
        columnLineage: [],
        columnFlows: [],
        tableUsage: new Map<string, number>(),
    };
}

describe('compareView', () => {
    const source = readFileSync(
        join(__dirname, '../../../../src/webview/ui/compareView.ts'),
        'utf8'
    );

    it('computes added/removed/changed nodes and stats deltas', () => {
        const left = makeResult(['orders', 'customers'], { joins: 1, complexityScore: 12 }, { customers: ['name'] });
        const right = makeResult(['orders', 'payments'], { joins: 2, complexityScore: 18 }, { orders: ['updated'] });

        const diff = computeCompareDiff(left, right);
        expect(diff.addedNodeKeys).toContain('table:payments');
        expect(diff.removedNodeKeys).toContain('table:customers');
        expect(diff.changedNodeKeys).toContain('table:orders');
        expect(diff.statsDelta).toEqual({
            joins: 1,
            subqueries: 0,
            complexityScore: 6,
        });
    });

    it('returns no node diffs for empty and identical graphs', () => {
        const emptyLeft = makeResult([]);
        const emptyRight = makeResult([]);
        const emptyDiff = computeCompareDiff(emptyLeft, emptyRight);
        expect(emptyDiff.addedNodeKeys).toEqual([]);
        expect(emptyDiff.removedNodeKeys).toEqual([]);
        expect(emptyDiff.changedNodeKeys).toEqual([]);
        expect(emptyDiff.statsDelta).toEqual({
            joins: 0,
            subqueries: 0,
            complexityScore: 0,
        });

        const base = makeResult(['orders', 'customers'], { joins: 1, subqueries: 2, complexityScore: 12 }, {
            orders: ['id', 'customer_id'],
            customers: ['id', 'name'],
        });
        const identical = makeResult(['orders', 'customers'], { joins: 1, subqueries: 2, complexityScore: 12 }, {
            orders: ['id', 'customer_id'],
            customers: ['id', 'name'],
        });
        const identicalDiff = computeCompareDiff(base, identical);
        expect(identicalDiff.addedNodeKeys).toEqual([]);
        expect(identicalDiff.removedNodeKeys).toEqual([]);
        expect(identicalDiff.changedNodeKeys).toEqual([]);
    });

    it('handles completely disjoint node sets', () => {
        const left = makeResult(['a', 'b', 'c']);
        const right = makeResult(['x', 'y', 'z']);
        const diff = computeCompareDiff(left, right);

        expect(diff.addedNodeKeys.sort()).toEqual(['table:x', 'table:y', 'table:z']);
        expect(diff.removedNodeKeys.sort()).toEqual(['table:a', 'table:b', 'table:c']);
        expect(diff.changedNodeKeys).toEqual([]);
    });

    it('detects node detail changes while key remains stable', () => {
        const left = makeResult(['orders'], { complexityScore: 5 }, { orders: ['order_id', 'amount'] });
        const right = makeResult(['orders'], { complexityScore: 5 }, { orders: ['order_id', 'amount', 'status'] });

        const diff = computeCompareDiff(left, right);
        expect(diff.addedNodeKeys).toEqual([]);
        expect(diff.removedNodeKeys).toEqual([]);
        expect(diff.changedNodeKeys).toEqual(['table:orders']);
    });

    it('handles zero and negative stats deltas', () => {
        const left = makeResult(['orders'], { joins: 3, subqueries: 4, complexityScore: 15 });
        const right = makeResult(['orders'], { joins: 3, subqueries: 1, complexityScore: 6 });

        const diff = computeCompareDiff(left, right);
        expect(diff.statsDelta).toEqual({
            joins: 0,
            subqueries: -3,
            complexityScore: -9,
        });
    });

    it('marks a CTE whose child filter changed', () => {
        const makeQuery = (amount: number) => parseSql(
            `WITH c AS (SELECT id FROM sales WHERE revenue > ${amount}) SELECT id FROM c;`,
            'PostgreSQL'
        );
        const left = makeQuery(100);
        const changed = computeCompareDiff(left, makeQuery(500));
        expect(changed.changedNodeKeys).toHaveLength(1);
        expect(changed.changedNodeKeys[0]).toMatch(/^cte:/);
        expect(computeCompareDiff(left, makeQuery(100)).changedNodeKeys).toEqual([]);
    });

    it.each([['Ledger', 'ledger'], ['a  b', 'a b']])(
        'distinguishes quoted relations %s and %s in PostgreSQL',
        (leftName, rightName) => {
            const makeQuery = (name: string) => parseSql(`SELECT id FROM "${name}";`, 'PostgreSQL');
            const diff = computeCompareDiff(makeQuery(leftName), makeQuery(rightName));
            expect(diff.removedNodeKeys).toContain(`table:${encodeURIComponent(leftName)}`);
            expect(diff.addedNodeKeys).toContain(`table:${encodeURIComponent(rightName)}`);
        }
    );

    it.each([
        ['"Ledger".orders', '"ledger".orders'],
        ['orders AS " o"', 'orders AS "o "'],
        ['Ledger', '"Ledger"'],
        ['Ledger.orders', '"Ledger".orders'],
        ['orders AS Ledger', 'orders AS "Ledger"'],
    ])('distinguishes PostgreSQL relation identities in %s and %s', (left, right) => {
        const compare = (a: string, b: string) =>
            computeCompareDiff(parseSql(a, 'PostgreSQL'), parseSql(b, 'PostgreSQL'));

        const diff = compare(`SELECT id FROM ${left}`, `SELECT id FROM ${right}`);
        expect(diff.removedNodeKeys).toEqual([expect.stringMatching(/^table:/)]);
        expect(diff.addedNodeKeys).toEqual([expect.stringMatching(/^table:/)]);

        const nested = (relation: string) => `WITH scope AS (SELECT id FROM ${relation}) SELECT id FROM scope`;
        expect(compare(nested(left), nested(right)).changedNodeKeys).toEqual([expect.stringMatching(/^cte:/)]);
    });

    it('treats PostgreSQL unquoted case changes as the same relation', () => {
        const diff = computeCompareDiff(
            parseSql('SELECT id FROM Billing.Ledger AS LedgerRow', 'PostgreSQL'),
            parseSql('SELECT id FROM billing.ledger AS ledgerrow', 'PostgreSQL'),
        );
        expect(diff).toMatchObject({ addedNodeKeys: [], removedNodeKeys: [], changedNodeKeys: [] });
    });

    it('processes large node sets with stable diff output', () => {
        const total = 900;
        const labels = Array.from({ length: total }, (_, i) => `table_${i}`);
        const nextLabels = labels.map((label, i) => (i % 150 === 0 ? `${label}_next` : label));
        const left = makeResult(labels, { joins: total - 1, complexityScore: total + 25 });
        const right = makeResult(nextLabels, { joins: total - 1, complexityScore: total + 25 });

        const diff = computeCompareDiff(left, right);
        expect(diff.changedNodeKeys).toEqual([]);
        expect(diff.addedNodeKeys).toHaveLength(6);
        expect(diff.removedNodeKeys).toHaveLength(6);
    });

    it('repositions removed ghost nodes to avoid overlap with active nodes and each other', () => {
        const anchors = makeResult(['orders']).nodes;
        const ghosts = [
            {
                ...anchors[0],
                id: 'ghost-1',
                label: 'Removed: orders',
            },
            {
                ...anchors[0],
                id: 'ghost-2',
                label: 'Removed: orders_legacy',
            },
        ];

        const positioned = positionRemovedGhostNodes(ghosts, anchors);
        expect(positioned[0].y).not.toBe(anchors[0].y);
        expect(positioned[1].y).not.toBe(anchors[0].y);
        expect(positioned[0].y).not.toBe(positioned[1].y);
    });

    it('renders a two-pane compare layout with state highlights', () => {
        expect(source).toContain("overlay.id = 'sql-crack-compare-overlay';");
        expect(source).toContain("grid-template-columns: 1fr 1fr;");
        expect(source).toContain("leftPane.className = 'sql-crack-compare-pane';");
        expect(source).toContain("rightPane.className = 'sql-crack-compare-pane';");
        expect(source).toContain("group.setAttribute('data-compare-state', state);");
        expect(source).toContain("group.setAttribute('data-ghost-node', 'true');");
    });

    it('supports independent pan/zoom state per pane viewport', () => {
        expect(source).toContain("viewport.id = `sql-crack-compare-${paneId}-viewport`;");
        expect(source).toContain("viewport.dataset.scale = state.scale.toFixed(2);");
        expect(source).toContain("viewport.dataset.panX = state.translateX.toFixed(1);");
        expect(source).toContain("viewport.dataset.panY = state.translateY.toFixed(1);");
        expect(source).toContain("viewport.addEventListener('wheel', onWheel, { passive: false });");
        expect(source).toContain("viewport.addEventListener('mousedown', onMouseDown);");
    });

    it('closes compare mode using Escape and explicit close button', () => {
        expect(source).toContain("closeButton.id = 'sql-crack-compare-close';");
        expect(source).toContain("if (event.key !== 'Escape') {");
        expect(source).toContain("document.addEventListener('keydown', escHandler);");
        expect(source).toContain('closeButton.addEventListener(\'click\', finishClose);');
    });

    it('re-renders compare overlay on theme changes', () => {
        expect(source).toContain('function rerenderActiveCompareView(dark: boolean): void {');
        expect(source).toContain("document.addEventListener('theme-change', themeChangeHandler);");
        expect(source).toContain('rerenderActiveCompareView(nextDark);');
        expect(source).toContain("document.removeEventListener('theme-change', themeChangeHandler)");
    });
});

it('counts added and removed repeated instances instead of overwriting them', () => {
    const left = makeResult(['employees', 'employees']);
    left.nodes[0].alias = 'e'; left.nodes[1].alias = 'm';
    const right = makeResult(['employees', 'employees', 'employees']);
    right.nodes[0].alias = 'e'; right.nodes[1].alias = 'm'; right.nodes[2].alias = 'n';
    const added = computeCompareDiff(left, right);
    expect(added.addedNodeKeys).toHaveLength(1);
    expect(added.removedNodeKeys).toEqual([]);
    expect(computeCompareDiff(right, left).removedNodeKeys).toEqual(added.addedNodeKeys);
});

it('retains duplicate nodes without aliases, including repeated JOIN labels', () => {
    const left = makeResult(['INNER JOIN', 'INNER JOIN']);
    const right = makeResult(['INNER JOIN', 'INNER JOIN', 'INNER JOIN']);
    left.nodes.forEach(node => { node.type = 'join'; });
    right.nodes.forEach(node => { node.type = 'join'; });
    expect(computeCompareDiff(left, right).addedNodeKeys).toHaveLength(1);
    expect(computeCompareDiff(right, left).removedNodeKeys).toHaveLength(1);
    expect(computeCompareDiff(right, right).addedNodeKeys).toEqual([]);
});

it('keeps aliases stable when repeated table instances are reordered', () => {
    const left = makeResult(['employees', 'employees']);
    left.nodes[0].alias = 'e'; left.nodes[1].alias = 'm';
    const right = { ...left, nodes: [...left.nodes].reverse() };
    expect(computeCompareDiff(left, right)).toEqual(expect.objectContaining({ addedNodeKeys: [], removedNodeKeys: [], changedNodeKeys: [] }));
});

it('does not let identifier text collide with instance-key delimiters', () => {
    const left = makeResult(['employees', 'employees', 'employees:instance:2']);
    const right = makeResult(['employees']);
    const diff = computeCompareDiff(left, right);
    expect(diff.removedNodeKeys).toHaveLength(2);
});
