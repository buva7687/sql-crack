import { getColumnLineageScriptFragment } from '../../../../src/workspace/ui/scripts/columnLineage';
import { getMessageHandlingScriptFragment } from '../../../../src/workspace/ui/scripts/messageHandling';
import { getWorkspaceRequestStateScriptFragment } from '../../../../src/workspace/ui/scripts/requestState';
import { createFakeElement } from '../../../helpers/fakeDom';

function namedFunction(script: string, name: string): string {
    const start = script.indexOf(`function ${name}(`);
    if (start < 0) {throw new Error(`Missing function ${name}`);}
    let depth = 0;
    let end = script.indexOf('{', start);
    for (; end < script.length; end++) {
        if (script[end] === '{') {depth++;}
        if (script[end] === '}' && --depth === 0) {break;}
    }
    return script.slice(start, end + 1);
}

function row(name: string) {
    const classes = new Set<string>();
    return {
        getAttribute: () => name,
        querySelector: () => ({ textContent: '' }),
        classes,
        classList: {
            add: (...names: string[]) => names.forEach(value => classes.add(value)),
            remove: (...names: string[]) => names.forEach(value => classes.delete(value)),
        },
    };
}

describe('Workspace canonical column highlighting', () => {
    const script = getColumnLineageScriptFragment();
    const runtime = new Function(`
        ${['normalizeColumnName', 'findColumnRow', 'applyColumnPathState', 'getColumnPosition'].map(name => namedFunction(script, name)).join('\n')}
        return {findColumnRow, applyColumnPathState, getColumnPosition};
    `)();

    it('selects exact case-distinct column rows and rejects an unmatched quoted name', () => {
        const upper = row('ID');
        const lower = row('id');
        const spaced = row(' id ');
        const node = { querySelectorAll: () => [upper, lower, spaced] };
        expect(runtime.findColumnRow(node, 'ID')).toBe(upper);
        expect(runtime.findColumnRow(node, 'id')).toBe(lower);
        expect(runtime.findColumnRow(node, 'Id')).toBeNull();
        expect(runtime.findColumnRow(node, ' id ')).toBe(spaced);
    });

    it('highlights only the canonical column returned by the tracker', () => {
        const upper = row('ID');
        const lower = row('id');
        const node = { querySelectorAll: () => [upper, lower], classList: { add: jest.fn() } };
        runtime.applyColumnPathState(node, new Set(['ID']), 'downstream');
        expect(upper.classes.has('in-path')).toBe(true);
        expect(lower.classes.has('in-path')).toBe(false);
        expect(lower.classes.has('dimmed')).toBe(true);
    });

    it('anchors arrows to a column row within a translated SVG node', () => {
        const node = createFakeElement('g');
        const column = createFakeElement('g');
        node.setAttribute('transform', 'translate(150, 80)');
        column.setAttribute('class', 'column-row');
        node.appendChild(column);

        expect(runtime.getColumnPosition(node, column)).toEqual({
            left: { x: 150, y: 144 },
            right: { x: 350, y: 144 },
            center: { x: 250, y: 144 },
        });
    });

    it('ignores an in-flight column response after clearing the trace', () => {
        const window = Object.assign(createFakeElement('window'), {
            clearWorkspaceColumnTrace: () => {},
            __workspaceColumnTraceActive: false,
            __workspaceSelectedColumnLabel: '',
        });
        const registerRequest = new Function('document', 'window', `
            const currentViewMode = 'lineage';
            function dismissColumnTraceHint() {}
            ${script}
            ${getWorkspaceRequestStateScriptFragment()}
            ${getMessageHandlingScriptFragment()}
            return () => registerWorkspaceRequest('selectColumn');
        `)(createFakeElement('document'), window);
        const respond = (requestId: number, columnName: string) => window.dispatchEvent({
            type: 'message',
            data: { command: 'columnLineageResult', data: { requestId, tableId: 'table:orders', columnName } },
        });

        respond(registerRequest(), 'before');
        expect(window.__workspaceSelectedColumnLabel).toBe('before');
        const pending = registerRequest();
        window.clearWorkspaceColumnTrace();
        respond(pending, 'after');
        expect(window.__workspaceColumnTraceActive).toBe(false);
        expect(window.__workspaceSelectedColumnLabel).toBe('');

        respond(registerRequest(), 'current');
        expect(window.__workspaceSelectedColumnLabel).toBe('current');
    });
});
