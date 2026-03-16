import type { SqlFlowWebviewMessage } from '../../shared/messages';
import type { FlowNode } from '../types';

interface VsCodeMessageApi {
    postMessage: (message: SqlFlowWebviewMessage) => void;
}

export function canTraceInWorkspaceLineage(node: FlowNode): boolean {
    return node.type === 'table' && (node.tableCategory || 'physical') === 'physical';
}

export function buildTraceInWorkspaceLineageMessage(
    node: FlowNode
): Extract<SqlFlowWebviewMessage, { command: 'traceInWorkspaceLineage' }> | null {
    if (!canTraceInWorkspaceLineage(node)) {
        return null;
    }

    return {
        command: 'traceInWorkspaceLineage',
        tableName: node.label,
        nodeType: 'table',
    };
}

export function traceInWorkspaceLineage(node: FlowNode, vscodeApi?: VsCodeMessageApi | null): boolean {
    const message = buildTraceInWorkspaceLineageMessage(node);
    if (!message || !vscodeApi?.postMessage) {
        return false;
    }

    vscodeApi.postMessage(message);
    return true;
}
