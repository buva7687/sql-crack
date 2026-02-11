import { readFileSync } from 'fs';
import { join } from 'path';

const readSource = (relativePath: string): string =>
    readFileSync(join(__dirname, '../../', relativePath), 'utf8');

describe('review 3 phase 3 polish guards', () => {
    it('keeps phase-3 hotspot files free of legacy emoji icon glyphs', () => {
        const targets = [
            'src/webview/renderer.ts',
            'src/webview/ui/toolbar.ts',
            'src/webview/ui/batchTabs.ts',
            'src/webview/constants/colors.ts',
            'src/webview/hintsHierarchy.ts',
            'src/workspace/workspacePanel.ts',
        ];
        const forbiddenGlyphs = ['📊', '🔄', '📄', '⚡', '⚠', '👁', '✓'];

        targets.forEach((file) => {
            const source = readSource(file);
            forbiddenGlyphs.forEach((glyph) => {
                expect(source).not.toContain(glyph);
            });
        });
    });

    it('uses SVG icons in first-run overlay instead of unicode glyph shortcuts', () => {
        const source = readSource('src/webview/ui/firstRunOverlay.ts');

        expect(source).toContain('ICONS.bolt');
        expect(source).toContain('ICONS.help');
        expect(source).not.toContain('\\u2328');
        expect(source).not.toContain('\\u2502');
        expect(source).not.toContain('\\u2318');
        expect(source).not.toContain('\\u26A1');
    });

    it('uses shared Z_INDEX constants in phase-3 layering modules', () => {
        const layeredFiles = [
            'src/webview/ui/toolbar.ts',
            'src/webview/ui/batchTabs.ts',
            'src/webview/ui/pinnedTabs.ts',
            'src/webview/ui/breadcrumbBar.ts',
            'src/webview/ui/resizablePanel.ts',
            'src/webview/ui/compareView.ts',
            'src/webview/ui/firstRunOverlay.ts',
            'src/webview/rendering/edgeRenderer.ts',
            'src/webview/renderer.ts',
        ];

        layeredFiles.forEach((file) => {
            const source = readSource(file);
            expect(source).toContain('Z_INDEX');
            expect(source).not.toMatch(/z-index:\s*[0-9]+/i);
            expect(source).not.toMatch(/zIndex\s*=\s*['"]?[0-9]+/);
        });
    });

    it('uses path-safe SC icon assets for Cursor compatibility', () => {
        const light = readSource('assets/sql-flow-sc-light.svg');
        const dark = readSource('assets/sql-flow-sc-dark.svg');

        [light, dark].forEach((asset) => {
            expect(asset).toContain('<svg');
            expect(asset).toContain('<path');
            expect(asset).not.toContain('<text');
        });
    });
});
