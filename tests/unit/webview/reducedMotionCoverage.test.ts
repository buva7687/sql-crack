import { readFileSync } from 'fs';
import { join } from 'path';

describe('reduced motion coverage across webview ui modules', () => {
    const motionSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/motion.ts'),
        'utf8'
    );
    const legendBarSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/legendBar.ts'),
        'utf8'
    );
    const breadcrumbBarSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/breadcrumbBar.ts'),
        'utf8'
    );
    const exportDropdownSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/exportDropdown.ts'),
        'utf8'
    );
    const commandBarSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/commandBar.ts'),
        'utf8'
    );
    const toolbarSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/toolbar.ts'),
        'utf8'
    );
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );

    it('defines a shared prefersReducedMotion utility', () => {
        expect(motionSource).toContain('export function prefersReducedMotion()');
        expect(motionSource).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
    });

    it('disables legend, breadcrumb, and export transitions when reduced motion is enabled', () => {
        expect(legendBarSource).toContain("import { prefersReducedMotion } from './motion';");
        expect(legendBarSource).toContain("transition: ${reducedMotion ? 'none' : 'transform 0.2s ease, opacity 0.2s ease'}");
        expect(breadcrumbBarSource).toContain("const transition = prefersReducedMotion() ? 'none' : 'background 0.1s';");
        expect(exportDropdownSource).toContain("transition: ${reducedMotion ? 'none' : 'background 0.15s'}");
    });

    it('guards command bar entrance animation and shared toolbar/renderer pulse checks', () => {
        expect(commandBarSource).toContain("import { prefersReducedMotion } from './motion';");
        expect(commandBarSource).toContain('if (prefersReducedMotion()) {');
        expect(commandBarSource).toContain("transition: ${reducedMotion ? 'none' : 'opacity 0.15s ease'}");
        expect(toolbarSource).toContain("import { prefersReducedMotion } from './motion';");
        expect(rendererSource).toContain("import { prefersReducedMotion } from './ui/motion';");
    });
});
