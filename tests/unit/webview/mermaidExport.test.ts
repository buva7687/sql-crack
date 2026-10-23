import { exportToMermaid } from '../../../src/webview/features/export';
import { createFakeElement, getElementsOfType, installFakeDocument, uninstallFakeDocument } from '../../helpers/fakeDom';
import type { ExportContext } from '../../../src/webview/features/export/contracts';
import type { FlowNode } from '../../../src/webview/types';

function context(): ExportContext {
    const nodes = [
        { id: 'table_0', type: 'table', label: 'orders', x: 0, y: 0, width: 180, height: 60 },
        { id: 'result_1', type: 'result', label: 'Result', x: 0, y: 120, width: 180, height: 60 },
    ] as FlowNode[];
    return {
        getSvg: () => null,
        getContainerElement: () => null,
        getCurrentNodes: () => nodes,
        getCurrentEdges: () => [{ id: 'e1', source: 'table_0', target: 'result_1' }],
        isDarkTheme: () => true,
        calculateBounds: () => ({ minX: 0, minY: 0, width: 180, height: 180 }),
    };
}

describe('SQL Flow Mermaid export', () => {
    const win = global as unknown as { window?: Record<string, unknown> };

    beforeEach(() => {
        installFakeDocument();
        Object.assign(global.document, { body: createFakeElement('body'), addEventListener: jest.fn(), removeEventListener: jest.fn() });
    });

    afterEach(() => {
        delete win.window;
        delete (global as any).requestAnimationFrame;
        uninstallFakeDocument();
    });

    it('asks the extension host to save the file instead of using a browser download', () => {
        const postMessage = jest.fn();
        win.window = { vscodeApi: { postMessage }, setTimeout: jest.fn() };
        (global as any).requestAnimationFrame = jest.fn();

        exportToMermaid(context());

        expect(postMessage).toHaveBeenCalledTimes(1);
        const message = postMessage.mock.calls[0][0];
        expect(message.command).toBe('saveMermaid');
        expect(message.filename).toMatch(/^sql-flow-\d+\.md$/);
        expect(message.data).toContain('```mermaid');
        expect(message.data).toContain('orders');
        expect(getElementsOfType('a')).toHaveLength(0);
    });
});
