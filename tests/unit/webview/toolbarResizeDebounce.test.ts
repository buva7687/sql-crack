import { readFileSync } from 'fs';
import { join } from 'path';

describe('toolbar resize overflow debounce', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/webview/ui/toolbar.ts'),
        'utf8'
    );

    it('debounces overflow recomputation from ResizeObserver callbacks', () => {
        expect(source).toContain('let overflowResizeDebounce: number | null = null;');
        expect(source).toContain('const scheduleOverflowUpdate = () => {');
        expect(source).toContain('window.clearTimeout(overflowResizeDebounce);');
        expect(source).toContain('window.setTimeout(() => {');
        expect(source).toContain('}, 100);');
        expect(source).toContain('scheduleOverflowUpdate();');
    });
});
