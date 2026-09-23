/**
 * H8: the workspace graph must not capture Tab / Enter / arrows while focus is
 * on page controls, and Tab must be able to leave the graph.
 *
 * Evaluates the real keyboard script fragment with its free identifiers
 * supplied by a stub scope, then drives the captured keydown handler.
 */

import { getWorkspaceShellScriptFragment } from '../../../../src/workspace/ui/scripts/workspaceShell';

type KeyHandler = (event: Record<string, unknown>) => void;

function makeElement(attributes: Record<string, string> = {}, parent: any = null): any {
    const element: any = {
        tagName: 'DIV',
        parent,
        style: {},
        classList: { contains: (name: string) => attributes.class?.split(' ').includes(name) ?? false },
        getAttribute: (name: string) => attributes[name] ?? null,
        addEventListener: () => undefined,
        contains: (other: any) => {
            for (let node = other; node; node = node.parent) {
                if (node === element) {
                    return true;
                }
            }
            return false;
        },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    };
    return element;
}

function loadShell() {
    const graphContainer = makeElement({ id: 'graph-container' });
    const nodes = [0, 1, 2].map(index => makeElement({
        'data-id': `n${index}`,
        'data-type': 'file',
        'data-filepath': `/ws/file${index}.sql`,
        transform: `translate(${index * 200}, 0)`,
    }, graphContainer));
    const graphTab = makeElement({ class: 'view-tab active' });
    const toolbarButton = Object.assign(makeElement(), { tagName: 'BUTTON' });
    let keydown: KeyHandler | undefined;

    const documentStub: any = {
        activeElement: null,
        body: makeElement(),
        documentElement: makeElement(),
        addEventListener: (type: string, handler: KeyHandler) => {
            if (type === 'keydown' && !keydown) {
                keydown = handler;
            }
        },
        getElementById: (id: string) => (id === 'graph-container' ? graphContainer : null),
        querySelector: (selector: string) => {
            if (selector === '.view-tab[data-view="graph"]') {
                return graphTab;
            }
            const nodeId = /^\.node\[data-id="([^"]+)"\]$/.exec(selector)?.[1];
            return nodes.find(node => node.getAttribute('data-id') === nodeId) ?? null;
        },
        querySelectorAll: (selector: string) => (selector === '.node' ? nodes : []),
        createElement: () => makeElement(),
    };

    const scope: Record<string | symbol, unknown> = {
        document: documentStub,
        window: {},
        selectedNodeId: null,
        currentViewMode: 'graph',
        focusModeEnabled: false,
        updateSelectionPanel: jest.fn((node: any) => { scope.selectedNodeId = node.getAttribute('data-id'); }),
        // activatePrimaryGraphNode (defined by the fragment) posts showFileTables for file nodes.
        vscode: { postMessage: jest.fn() },
        CSS: { escape: (value: string) => value },
    };
    const stubs = new Map<string | symbol, jest.Mock>();
    const proxy = new Proxy(scope, {
        has: () => true,
        get(target, property) {
            if (property === Symbol.unscopables) {
                return undefined;
            }
            if (property in target) {
                return target[property];
            }
            if (typeof property === 'string' && property in globalThis) {
                return (globalThis as any)[property];
            }
            if (!stubs.has(property)) {
                stubs.set(property, jest.fn());
            }
            return stubs.get(property);
        },
        set(target, property, value) {
            target[property] = value;
            return true;
        },
    });

    // eslint-disable-next-line no-new-func
    new Function('scope', `with (scope) {\n${getWorkspaceShellScriptFragment()}\n}`)(proxy);
    if (!keydown) {
        throw new Error('keydown handler not registered');
    }

    const press = (key: string, activeElement: unknown, extra: Record<string, unknown> = {}) => {
        documentStub.activeElement = activeElement;
        const event = { key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault: jest.fn(), stopPropagation: jest.fn(), ...extra };
        keydown!(event);
        return event;
    };

    return { scope, press, graphContainer, toolbarButton, body: documentStub.body };
}

describe('workspace graph keyboard focus (H8)', () => {
    it('lets Tab and Enter reach toolbar controls instead of cycling nodes', () => {
        const { scope, press, toolbarButton } = loadShell();
        scope.selectedNodeId = 'n1';

        const tab = press('Tab', toolbarButton);
        expect(tab.preventDefault).not.toHaveBeenCalled();
        expect(scope.updateSelectionPanel).not.toHaveBeenCalled();

        const enter = press('Enter', toolbarButton);
        expect(enter.preventDefault).not.toHaveBeenCalled();
        expect((scope.vscode as any).postMessage).not.toHaveBeenCalled();

        const arrow = press('ArrowRight', toolbarButton);
        expect(arrow.preventDefault).not.toHaveBeenCalled();
    });

    it('cycles nodes with Tab inside the graph and lets focus leave after the last node', () => {
        const { scope, press, graphContainer } = loadShell();

        for (const expected of ['n0', 'n1', 'n2']) {
            const event = press('Tab', graphContainer);
            expect(event.preventDefault).toHaveBeenCalled();
            expect(scope.selectedNodeId).toBe(expected);
        }
        expect(press('Tab', graphContainer).preventDefault).not.toHaveBeenCalled();

        scope.selectedNodeId = 'n0';
        expect(press('Tab', graphContainer, { shiftKey: true }).preventDefault).not.toHaveBeenCalled();
    });

    it('still opens a mouse-selected node with Enter from the page body', () => {
        const { scope, press, body } = loadShell();
        scope.selectedNodeId = 'n1';

        const enter = press('Enter', body);
        expect(enter.preventDefault).toHaveBeenCalled();
        expect((scope.vscode as any).postMessage).toHaveBeenCalledWith({ command: 'showFileTables', filePath: '/ws/file1.sql' });
    });
});
