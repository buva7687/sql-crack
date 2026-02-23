import { readFileSync } from 'fs';
import { join } from 'path';

describe('panel minimize toggles', () => {
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );
    const panelSource = readFileSync(
        join(__dirname, '../../../src/webview/panels/infoPanel.ts'),
        'utf8'
    );

    describe('Performance Hints panel', () => {
        it('has persistent minimized state variable', () => {
            expect(rendererSource).toContain('let hintsMinimized = false;');
        });

        it('renders a clickable header with id for toggle', () => {
            expect(panelSource).toContain('id="hints-header"');
            expect(panelSource).toMatch(/hintsHeader\?\.addEventListener\('click'/);
        });

        it('toggles hintsMinimized on header click', () => {
            expect(panelSource).toContain('setHintsMinimized(!hintsMinimized);');
        });

        it('uses chevron icon that rotates based on minimized state', () => {
            // Chevron rotates -90deg when minimized
            expect(panelSource).toMatch(/rotate\(\$\{hintsMinimized \? '-90deg' : '0deg'\}\)/);
        });

        it('hides hints-list when minimized', () => {
            expect(panelSource).toMatch(/display: \$\{hintsMinimized \? 'none' : 'flex'\}/);
        });
    });

    describe('Query Stats panel', () => {
        it('has persistent minimized state variable', () => {
            expect(rendererSource).toContain('let statsMinimized = false;');
        });

        it('renders a clickable header with id for toggle', () => {
            expect(panelSource).toContain('id="stats-header"');
            expect(panelSource).toMatch(/statsHeader\?\.addEventListener\('click'/);
        });

        it('toggles statsMinimized on header click', () => {
            expect(panelSource).toContain('setStatsMinimized(!statsMinimized);');
        });

        it('uses chevron icon that rotates based on minimized state', () => {
            expect(panelSource).toMatch(/rotate\(\$\{statsMinimized \? '-90deg' : '0deg'\}\)/);
        });

        it('wraps body content in a collapsible div', () => {
            expect(panelSource).toContain('id="stats-body"');
            expect(panelSource).toMatch(/display: \$\{statsMinimized \? 'none' : 'block'\}/);
        });
    });
});
