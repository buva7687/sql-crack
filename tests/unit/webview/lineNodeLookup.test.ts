import { findNodeAtLine } from '../../../src/webview/interaction/lineNodeLookup';
import type { FlowNode } from '../../../src/webview/types';

const node = (id: string, startLine: number, endLine?: number): FlowNode => ({
    id, type: 'select', label: id, x: 0, y: 0, width: 100, height: 40, startLine, endLine,
});

describe('findNodeAtLine', () => {
    it('uses the enclosing CTE for body lines while collapsed', () => {
        const cte = { ...node('cte', 1, 5), type: 'cte' as const, expanded: false,
            children: [node('child filter', 4)] };
        expect(findNodeAtLine([cte, node('outer select', 6)], 4)?.id).toBe('cte');
        expect(findNodeAtLine([cte, node('outer select', 6)], 5)?.id).toBe('cte');
    });

    it('prefers an exact visible child clause over its CTE range', () => {
        const cte = { ...node('cte', 1, 5), type: 'cte' as const, expanded: true,
            children: [node('child filter', 4)] };
        expect(findNodeAtLine([cte, node('outer select', 6)], 4)?.id).toBe('child filter');
        expect(findNodeAtLine([cte, node('outer select', 6)], 5)?.id).toBe('cte');
    });
});
