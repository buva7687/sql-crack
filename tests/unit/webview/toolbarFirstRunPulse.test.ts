import { readFileSync } from 'fs';
import { join } from 'path';

describe('toolbar first-run help pulse', () => {
    const toolbarSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/toolbar.ts'),
        'utf8'
    );
    const indexSource = readFileSync(
        join(__dirname, '../../../src/webview/index.ts'),
        'utf8'
    );

    it('adds a one-time first-run pulse class to the help button', () => {
        expect(toolbarSource).toContain('function applyFirstRunHelpPulse');
        expect(toolbarSource).toContain("helpBtn.classList.add('sql-crack-help-pulse');");
        expect(toolbarSource).toContain("applyFirstRunHelpPulse(helpBtn, options.isFirstRun);");
        expect(toolbarSource).toContain("window.setTimeout(stopPulse, 3600);");
    });

    it('skips the pulse when reduced-motion is preferred', () => {
        expect(toolbarSource).toContain("import { prefersReducedMotion } from './motion';");
        expect(toolbarSource).toContain('if (!enabled || prefersReducedMotion())');
    });

    it('passes first-run state from webview bootstrap into toolbar options', () => {
        expect(indexSource).toContain('isFirstRun: window.isFirstRun || false');
    });
});
