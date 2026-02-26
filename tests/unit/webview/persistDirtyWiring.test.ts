import { readFileSync } from 'fs';
import { join } from 'path';

describe('persist dirty wiring for renderer keyboard paths', () => {
    it('marks persist dirty when renderer emits view-state changes', () => {
        const indexSource = readFileSync(join(__dirname, '../../../src/webview/index.ts'), 'utf8');

        expect(indexSource).toContain("document.addEventListener('layout-state-changed'");
        expect(indexSource).toContain('persistStateDirty = true;');
        expect(indexSource).toContain('persistStateDirty = false;');
    });

    it('emits renderer state-changed notifications from persisted view toggles', () => {
        const rendererSource = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');

        expect(rendererSource).toContain("function notifyRendererStateChanged(): void");
        expect(rendererSource).toContain('notifyRendererStateChanged();');
        expect(rendererSource).toContain('export function toggleLegend(show?: boolean): void');
        expect(rendererSource).toContain('export function toggleHints(show?: boolean): void');
        expect(rendererSource).toContain('export function toggleSqlPreview(show?: boolean): void');
        expect(rendererSource).toContain('export function toggleColumnFlows(show?: boolean): void');
        expect(rendererSource).toContain('export function toggleFocusMode(enable?: boolean): void');
        expect(rendererSource).toContain('export function setFocusMode(mode: FocusMode): void');
    });
});
