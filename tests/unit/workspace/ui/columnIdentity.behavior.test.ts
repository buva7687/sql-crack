import { getColumnLineageScriptFragment } from '../../../../src/workspace/ui/scripts/columnLineage';

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
        ${['normalizeColumnName', 'findColumnRow', 'applyColumnPathState'].map(name => namedFunction(script, name)).join('\n')}
        return {findColumnRow, applyColumnPathState};
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
});
