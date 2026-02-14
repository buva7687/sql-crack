import * as vscode from 'vscode';
import { WorkspacePanel } from '../../../src/workspace/workspacePanel';
import { LineageBuilder } from '../../../src/workspace/lineage/lineageBuilder';
import { resolveAutoIndexThresholdFromConfig } from '../../../src/workspace/panel/settings';

describe('WorkspacePanel lineage guards and config defaults', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode as any).__resetMockConfig?.();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('does not retain a legacy in-class handleMessage router', () => {
        expect((WorkspacePanel.prototype as any).handleMessage).toBeUndefined();
    });

    it('reuses a single in-flight lineage build promise across concurrent callers', async () => {
        const mockGraph = {
            nodes: new Map(),
            edges: [],
            columnEdges: [],
            getUpstream: jest.fn(),
            getDownstream: jest.fn(),
            getColumnLineage: jest.fn(),
        } as any;

        const buildSpy = jest
            .spyOn(LineageBuilder.prototype, 'buildFromIndex')
            .mockReturnValue(mockGraph);

        const context: any = {
            _lineageGraph: null,
            _lineageBuilder: null,
            _flowAnalyzer: null,
            _impactAnalyzer: null,
            _columnLineageTracker: null,
            _lineageBuildPromise: null,
            _indexManager: {
                getIndex: jest.fn(() => ({ files: [] })),
            },
        };

        await Promise.all([
            (WorkspacePanel.prototype as any).buildLineageGraph.call(context),
            (WorkspacePanel.prototype as any).buildLineageGraph.call(context),
            (WorkspacePanel.prototype as any).buildLineageGraph.call(context),
        ]);

        expect(buildSpy).toHaveBeenCalledTimes(1);
        expect(context._lineageGraph).toBe(mockGraph);
        expect(context._lineageBuildPromise).toBeNull();
    });

    it('reads auto-index threshold from configuration with bounds', () => {
        (vscode as any).__setMockConfig('sqlCrack', { workspaceAutoIndexThreshold: 999 });
        expect(resolveAutoIndexThresholdFromConfig()).toBe(500);

        (vscode as any).__setMockConfig('sqlCrack', { workspaceAutoIndexThreshold: 5 });
        expect(resolveAutoIndexThresholdFromConfig()).toBe(10);

        (vscode as any).__setMockConfig('sqlCrack', { workspaceAutoIndexThreshold: 73 });
        expect(resolveAutoIndexThresholdFromConfig()).toBe(73);
    });
});
