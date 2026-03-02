import type { FlowEdge, FlowNode, ParseResult } from '../types';

function applyLineOffsetToEdge(edge: FlowEdge, lineOffset: number): void {
    if (typeof edge.startLine === 'number') {
        edge.startLine += lineOffset;
    }
    if (typeof edge.endLine === 'number') {
        edge.endLine += lineOffset;
    }
}

function applyLineOffsetToNode(node: FlowNode, lineOffset: number): void {
    if (typeof node.startLine === 'number') {
        node.startLine += lineOffset;
    }
    if (typeof node.endLine === 'number') {
        node.endLine += lineOffset;
    }

    if (Array.isArray(node.childEdges)) {
        for (const childEdge of node.childEdges) {
            applyLineOffsetToEdge(childEdge, lineOffset);
        }
    }

    if (Array.isArray(node.children)) {
        for (const childNode of node.children) {
            applyLineOffsetToNode(childNode, lineOffset);
        }
    }
}

export function applyLineOffsetToResult(result: ParseResult, lineOffset: number): void {
    if (lineOffset <= 0) {
        return;
    }

    for (const node of result.nodes) {
        applyLineOffsetToNode(node, lineOffset);
    }

    for (const edge of result.edges) {
        applyLineOffsetToEdge(edge, lineOffset);
    }
}
