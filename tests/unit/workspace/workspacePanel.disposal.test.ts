import { WorkspacePanel } from '../../../src/workspace/workspacePanel';

describe('WorkspacePanel disposal guards', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        WorkspacePanel.currentPanel = undefined;
    });

    it('skips posting messages once panel is disposed', () => {
        const postMessage = jest.fn();
        const context: any = {
            _isDisposed: false,
            _panel: { webview: { postMessage } },
        };

        (WorkspacePanel.prototype as any)._postMessage.call(context, {
            command: 'themeChanged',
            css: 'body { color: red; }',
            isDark: true,
        });
        expect(postMessage).toHaveBeenCalledTimes(1);

        context._isDisposed = true;
        (WorkspacePanel.prototype as any)._postMessage.call(context, {
            command: 'themeChanged',
            css: 'body { color: blue; }',
            isDark: false,
        });
        expect(postMessage).toHaveBeenCalledTimes(1);
    });

    it('returns early from rebuild when panel is already disposed', async () => {
        const context: any = {
            _isDisposed: true,
            _indexManager: { getIndex: jest.fn() },
        };

        await (WorkspacePanel.prototype as any).rebuildAndRenderGraph.call(context);

        expect(context._indexManager.getIndex).not.toHaveBeenCalled();
    });

    it('marks handler disposed and detaches index callback during dispose', async () => {
        const markDisposed = jest.fn();
        const setOnIndexUpdated = jest.fn();
        const indexDispose = jest.fn();
        const flushPersist = jest.fn().mockResolvedValue(undefined);
        const context: any = {
            _isDisposed: false,
            _messageHandler: { markDisposed },
            _indexManager: { setOnIndexUpdated, dispose: indexDispose, flushPersist },
            _panel: { dispose: jest.fn() },
            _disposables: [],
        };

        (WorkspacePanel.prototype as any).dispose.call(context);

        expect(markDisposed).toHaveBeenCalledTimes(1);
        expect(setOnIndexUpdated).toHaveBeenCalledWith(null);
        expect(flushPersist).toHaveBeenCalledTimes(1);
        expect(context._panel.dispose).toHaveBeenCalledTimes(1);

        // indexManager.dispose() is called in the .finally() of flushPersist — drain microtasks
        await new Promise(resolve => process.nextTick(resolve));
        expect(indexDispose).toHaveBeenCalledTimes(1);
    });
});
