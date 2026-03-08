import { readFileSync } from 'fs';
import { join } from 'path';
import {
    buildTraceInWorkspaceLineageMessage,
    canTraceInWorkspaceLineage,
    traceInWorkspaceLineage,
} from '../../../src/webview/features/workspaceTrace';
import type { FlowNode } from '../../../src/webview/types';

function createNode(overrides: Partial<FlowNode> = {}): FlowNode {
    return {
        id: 'orders',
        type: 'table',
        label: 'orders',
        x: 0,
        y: 0,
        width: 120,
        height: 40,
        tableCategory: 'physical',
        ...overrides,
    };
}

describe('workspaceTrace feature', () => {
    it('allows physical table nodes', () => {
        expect(canTraceInWorkspaceLineage(createNode())).toBe(true);
    });

    it('blocks derived and non-table nodes', () => {
        expect(canTraceInWorkspaceLineage(createNode({ tableCategory: 'derived' }))).toBe(false);
        expect(canTraceInWorkspaceLineage(createNode({ type: 'join' }))).toBe(false);
    });

    it('builds the SQL Flow host message for trace requests', () => {
        expect(buildTraceInWorkspaceLineageMessage(createNode())).toEqual({
            command: 'traceInWorkspaceLineage',
            tableName: 'orders',
            nodeType: 'table',
        });
    });

    it('posts the trace request through the VS Code API when available', () => {
        const postMessage = jest.fn();

        const traced = traceInWorkspaceLineage(createNode(), { postMessage });

        expect(traced).toBe(true);
        expect(postMessage).toHaveBeenCalledWith({
            command: 'traceInWorkspaceLineage',
            tableName: 'orders',
            nodeType: 'table',
        });
    });

    it('keeps the renderer/context menu wiring in place', () => {
        const rendererSource = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');
        const contextMenuSource = readFileSync(join(__dirname, '../../../src/webview/ui/contextMenu.ts'), 'utf8');

        expect(rendererSource).toContain('showWorkspaceTraceAction: canTraceInWorkspaceLineageFeature(node)');
        expect(rendererSource).toContain("case 'trace-workspace-lineage':");
        expect(contextMenuSource).toContain('Show in Workspace Lineage');
        expect(contextMenuSource).toContain('data-action="trace-workspace-lineage"');
    });
});
