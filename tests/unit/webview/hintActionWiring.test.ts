import { readFileSync } from 'fs';
import { join } from 'path';

describe('hint action wiring', () => {
    it('renders hint action buttons and routes commands from the hints panel', () => {
        const infoPanelSource = readFileSync(join(__dirname, '../../../src/webview/panels/infoPanel.ts'), 'utf8');

        expect(infoPanelSource).toContain('class="hint-action-btn"');
        expect(infoPanelSource).toContain('onExecuteHintAction: (command: string) => void;');
        expect(infoPanelSource).toContain("onExecuteHintAction(button.dataset.command || '')");
    });

    it('executes switchDialect hint commands via the existing dialect select change flow', () => {
        const rendererSource = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');

        expect(rendererSource).toContain("const switchDialectPrefix = 'switchDialect:';");
        expect(rendererSource).toContain("const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement | null;");
        expect(rendererSource).toContain("dialectSelect.dispatchEvent(new Event('change', { bubbles: true }));");
    });
});
