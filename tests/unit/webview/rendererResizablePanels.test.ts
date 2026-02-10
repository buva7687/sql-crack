import { readFileSync } from 'fs';
import { join } from 'path';

describe('renderer resizable panel integration', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );

    it('wires resizable behavior for details, stats, and hints panels', () => {
        expect(source).toContain("import { attachResizablePanel } from './ui/resizablePanel';");
        expect(source).toContain("storageKey: 'details'");
        expect(source).toContain("storageKey: 'stats'");
        expect(source).toContain("storageKey: 'hints'");
        expect(source).toContain('panelResizerCleanup = [');
    });

    it('cleans up panel resizer handlers when renderer is disposed', () => {
        expect(source).toContain('panelResizerCleanup.forEach(cleanup => cleanup());');
        expect(source).toContain('panelResizerCleanup = [];');
    });
});
