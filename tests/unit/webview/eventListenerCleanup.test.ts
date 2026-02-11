/**
 * Event Listener Cleanup — Verify AbortController pattern in UI modules
 *
 * Each module should:
 * 1. Create an AbortController on initialization
 * 2. Abort previous controller on re-initialization
 * 3. Export a dispose function that aborts the controller
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const uiDir = join(__dirname, '../../../src/webview/ui');

describe('AbortController event listener cleanup', () => {
    const modules = [
        { name: 'toolbar', file: 'toolbar.ts', disposeFn: 'disposeToolbar' },
        { name: 'batchTabs', file: 'batchTabs.ts', disposeFn: 'disposeBatchTabs' },
        { name: 'pinnedTabs', file: 'pinnedTabs.ts', disposeFn: 'disposePinnedTabs' },
        { name: 'breadcrumbBar', file: 'breadcrumbBar.ts', disposeFn: 'disposeBreadcrumbBar' },
        { name: 'legendBar', file: 'legendBar.ts', disposeFn: 'disposeLegendBar' },
        { name: 'commandBar', file: 'commandBar.ts', disposeFn: 'disposeCommandBar' },
        { name: 'layoutPicker', file: 'layoutPicker.ts', disposeFn: 'disposeLayoutPicker' },
        { name: 'exportDropdown', file: 'exportDropdown.ts', disposeFn: 'disposeExportDropdown' },
    ];

    modules.forEach(({ name, file, disposeFn }) => {
        describe(name, () => {
            const source = readFileSync(join(uiDir, file), 'utf8');

            it('declares an AbortController variable', () => {
                expect(source).toMatch(/AbortController\s*\|\s*null\s*=\s*null/);
            });

            it('aborts previous controller on re-initialization', () => {
                expect(source).toMatch(/AbortController\?\.abort\(\)/);
            });

            it('creates a new AbortController on initialization', () => {
                expect(source).toContain('new AbortController()');
            });

            it('passes signal to at least one addEventListener call', () => {
                expect(source).toMatch(/signal.*AbortController\.signal|{ signal }|get[A-Za-z]+ListenerOptions\(\)/);
            });

            it(`exports a ${disposeFn} function`, () => {
                expect(source).toContain(`export function ${disposeFn}`);
            });
        });
    });

    it('barrel index re-exports all dispose functions', () => {
        const indexSource = readFileSync(join(uiDir, 'index.ts'), 'utf8');
        expect(indexSource).toContain('disposeToolbar');
        expect(indexSource).toContain('disposeBatchTabs');
        expect(indexSource).toContain('disposePinnedTabs');
        expect(indexSource).toContain('disposeBreadcrumbBar');
        expect(indexSource).toContain('disposeLegendBar');
        expect(indexSource).toContain('disposeCommandBar');
        expect(indexSource).toContain('disposeLayoutPicker');
        expect(indexSource).toContain('disposeExportDropdown');
    });

    describe('resizablePanel', () => {
        const source = readFileSync(join(uiDir, 'resizablePanel.ts'), 'utf8');

        it('creates a per-panel AbortController and uses its signal for listeners', () => {
            expect(source).toContain('const panelAbortController = new AbortController();');
            expect(source).toContain('signal: panelAbortController.signal');
            expect(source).toContain("addEventListener('mousemove', onMouseMove, listenerOptions)");
            expect(source).toContain("addEventListener('mouseup', onMouseUp, listenerOptions)");
            expect(source).toContain("addEventListener('resize', onResize, listenerOptions)");
        });

        it('aborts listeners in returned cleanup', () => {
            expect(source).toContain('panelAbortController.abort();');
            expect(source).toContain('handle.remove();');
        });
    });
});
