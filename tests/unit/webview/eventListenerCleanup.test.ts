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
                expect(source).toMatch(/signal.*AbortController\.signal|{ signal }/);
            });

            it(`exports a ${disposeFn} function`, () => {
                expect(source).toContain(`export function ${disposeFn}`);
            });
        });
    });

    it('barrel index re-exports all dispose functions', () => {
        const indexSource = readFileSync(join(uiDir, 'index.ts'), 'utf8');
        expect(indexSource).toContain('disposeLegendBar');
        expect(indexSource).toContain('disposeCommandBar');
        expect(indexSource).toContain('disposeLayoutPicker');
        expect(indexSource).toContain('disposeExportDropdown');
    });
});
