import type { FlowNode } from '../types';

/** Find the visible node that best represents a source line. */
export function findNodeAtLine(nodes: FlowNode[], line: number): FlowNode | null {
    const visible: Array<{ node: FlowNode; depth: number }> = [];
    const collect = (items: FlowNode[], depth: number): void => {
        for (const node of items) {
            visible.push({ node, depth });
            if (node.children && node.expanded !== false) {
                collect(node.children, depth + 1);
            }
        }
    };
    collect(nodes, 0);

    // An expanded child clause is more specific than its enclosing CTE range.
    const exact = visible.filter(({ node }) => node.startLine === line)
        .sort((a, b) => b.depth - a.depth)[0];
    if (exact) { return exact.node; }

    const containing = visible.filter(({ node }) => node.startLine !== undefined
        && node.endLine !== undefined && line >= node.startLine && line <= node.endLine)
        .sort((a, b) => b.depth - a.depth)[0];
    if (containing) { return containing.node; }

    let closest: FlowNode | null = null;
    let minDist = Infinity;
    for (const { node } of visible) {
        if (node.startLine !== undefined) {
            const dist = Math.abs(node.startLine - line);
            if (dist < minDist) {
                minDist = dist;
                closest = node;
            }
        }
    }
    return minDist <= 5 ? closest : null;
}
