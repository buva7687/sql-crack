import { readFileSync } from 'fs';
import { join } from 'path';

describe('panel minimize toggles', () => {
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );

    describe('Performance Hints panel', () => {
        it('has persistent minimized state variable', () => {
            expect(rendererSource).toContain('let hintsMinimized = false;');
        });

        it('renders a clickable header with id for toggle', () => {
            expect(rendererSource).toContain('id="hints-header"');
            expect(rendererSource).toMatch(/hintsHeader\?\.addEventListener\('click'/);
        });

        it('toggles hintsMinimized on header click', () => {
            expect(rendererSource).toContain('hintsMinimized = !hintsMinimized;');
        });

        it('uses chevron icon that rotates based on minimized state', () => {
            // Chevron rotates -90deg when minimized
            expect(rendererSource).toMatch(/rotate\(\$\{hintsMinimized \? '-90deg' : '0deg'\}\)/);
        });

        it('hides hints-list when minimized', () => {
            expect(rendererSource).toMatch(/display: \$\{hintsMinimized \? 'none' : 'flex'\}/);
        });
    });

    describe('Query Stats panel', () => {
        it('has persistent minimized state variable', () => {
            expect(rendererSource).toContain('let statsMinimized = false;');
        });

        it('renders a clickable header with id for toggle', () => {
            expect(rendererSource).toContain('id="stats-header"');
            expect(rendererSource).toMatch(/statsHeader\?\.addEventListener\('click'/);
        });

        it('toggles statsMinimized on header click', () => {
            expect(rendererSource).toContain('statsMinimized = !statsMinimized;');
        });

        it('uses chevron icon that rotates based on minimized state', () => {
            expect(rendererSource).toMatch(/rotate\(\$\{statsMinimized \? '-90deg' : '0deg'\}\)/);
        });

        it('wraps body content in a collapsible div', () => {
            expect(rendererSource).toContain('id="stats-body"');
            expect(rendererSource).toMatch(/display: \$\{statsMinimized \? 'none' : 'block'\}/);
        });
    });
});
