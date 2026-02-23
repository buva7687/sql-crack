import * as vscode from 'vscode';
import { logger } from '../../../../src/logger';
import { WorkspaceUxMetrics } from '../../../../src/workspace/panel/uxMetrics';

describe('WorkspaceUxMetrics', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode as any).__resetMockConfig?.();
    });

    it('does not log events when instrumentation is disabled', () => {
        (vscode as any).__setMockConfig('sqlCrack.advanced', {
            workspaceUxInstrumentation: false,
        });

        const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
        const metrics = new WorkspaceUxMetrics();

        metrics.record('graph_trace_in_lineage', { nodeType: 'table' });

        expect(infoSpy).not.toHaveBeenCalled();
    });

    it('logs sanitized local events when instrumentation is enabled', () => {
        (vscode as any).__setMockConfig('sqlCrack.advanced', {
            workspaceUxInstrumentation: true,
        });

        const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
        const metrics = new WorkspaceUxMetrics();

        metrics.record('Graph Trace In Lineage', {
            nodeType: 'table',
            queryLength: 12,
            ignored: { nested: true } as any,
        });

        expect(infoSpy).toHaveBeenCalled();
        const firstLog = infoSpy.mock.calls[0]?.[0] || '';
        expect(firstLog).toContain('event=graph_trace_in_lineage');
        expect(firstLog).not.toContain('[object Object]');
    });

    it('provides snapshot and supports reset for current session', () => {
        (vscode as any).__setMockConfig('sqlCrack.advanced', {
            workspaceUxInstrumentation: true,
        });

        const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
        const metrics = new WorkspaceUxMetrics();
        metrics.record('graph_mode_switched', { mode: 'tables' });
        metrics.record('graph_mode_switched', { mode: 'files' });
        metrics.record('graph_search_submitted', { queryLength: 4 });

        const snapshot = metrics.getSnapshot();
        expect(snapshot.instrumentationEnabled).toBe(true);
        expect(snapshot.totalEvents).toBe(3);
        expect(snapshot.topEvents[0]).toEqual({ event: 'graph_mode_switched', count: 2 });

        metrics.reset();
        const clearedSnapshot = metrics.getSnapshot();
        expect(clearedSnapshot.totalEvents).toBe(0);
        expect(clearedSnapshot.topEvents).toEqual([]);
        expect(infoSpy).toHaveBeenCalledWith('[Workspace UX] session metrics reset');
    });
});
