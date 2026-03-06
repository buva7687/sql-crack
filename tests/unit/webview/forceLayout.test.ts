import { readFileSync } from 'fs';
import { join } from 'path';

describe('layoutGraphForce initial position handling', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/webview/parser/forceLayout.ts'),
        'utf8'
    );

    it('uses nullish coalescing (??) so that x=0 and y=0 are preserved', () => {
        // node.x || random treats 0 as falsy, replacing valid zero positions.
        // node.x ?? random correctly preserves 0 and only falls back on null/undefined.
        expect(source).toContain('node.x ?? Math.random() * 500');
        expect(source).toContain('node.y ?? Math.random() * 500');
        expect(source).not.toContain('node.x || Math.random()');
        expect(source).not.toContain('node.y || Math.random()');
    });
});
