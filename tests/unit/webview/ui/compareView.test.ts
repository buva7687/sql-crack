import { readFileSync } from 'fs';
import { join } from 'path';
import { ParseResult } from '../../../../src/webview/types';
import { computeCompareDiff } from '../../../../src/webview/ui/compareView';

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
});
