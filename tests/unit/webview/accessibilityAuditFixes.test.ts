import { readFileSync } from 'fs';
import { join } from 'path';

describe('accessibility audit regression guards', () => {
    it('keeps focus-trap guards on first-run overlay and command bar dialogs', () => {
        const firstRunSource = readFileSync(join(__dirname, '../../../src/webview/ui/firstRunOverlay.ts'), 'utf8');
        const commandBarSource = readFileSync(join(__dirname, '../../../src/webview/ui/commandBar.ts'), 'utf8');

        expect(firstRunSource).toContain("overlay.setAttribute('aria-modal', 'true');");
        expect(firstRunSource).toContain("if (e.key === 'Tab') {");
        expect(commandBarSource).toContain("commandBarElement.setAttribute('aria-modal', 'true');");
        expect(commandBarSource).toContain("if (e.key !== 'Tab') {");
    });

    it('keeps keyboard semantics on toolbar and context menu controls', () => {
        const toolbarSource = readFileSync(join(__dirname, '../../../src/webview/ui/toolbar.ts'), 'utf8');
        const contextMenuSource = readFileSync(join(__dirname, '../../../src/webview/ui/contextMenu.ts'), 'utf8');

        expect(toolbarSource).toContain("toolbarWrapper.setAttribute('role', 'navigation');");
        expect(toolbarSource).toContain("toolbar.setAttribute('role', 'toolbar');");
        expect(contextMenuSource).toContain("contextMenuElement.setAttribute('role', 'menu');");
        expect(contextMenuSource).toContain("if (keyEvent.key === 'ArrowDown') {");
    });

    it('keeps search controls labeled and touch-target sized', () => {
        const searchBoxSource = readFileSync(join(__dirname, '../../../src/webview/ui/toolbar/searchBox.ts'), 'utf8');

        expect(searchBoxSource).toContain("searchInput.setAttribute('aria-label', 'Search nodes');");
        expect(searchBoxSource).toContain("prevBtn.setAttribute('aria-label', 'Previous match');");
        expect(searchBoxSource).toContain("nextBtn.setAttribute('aria-label', 'Next match');");
        expect(searchBoxSource).toContain('width: 44px;');
        expect(searchBoxSource).toContain('height: 44px;');
    });
});
