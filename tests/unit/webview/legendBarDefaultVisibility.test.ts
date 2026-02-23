import { readFileSync } from 'fs';
import { join } from 'path';

describe('legend bar default visibility', () => {
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );
    const rendererStateSource = readFileSync(
        join(__dirname, '../../../src/webview/state/rendererState.ts'),
        'utf8'
    );
    const legendBarSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/legendBar.ts'),
        'utf8'
    );

    it('shows legend by default while honoring an explicit stored false preference', () => {
        expect(rendererSource).toContain('createInitialViewState(window.vscodeTheme, window.defaultLayout)');
        expect(rendererStateSource).toContain('legendVisible: true,');
        expect(legendBarSource).toContain('let legendVisible = true;');
        expect(legendBarSource).toContain("legendVisible = stored !== 'false';");
    });
});
