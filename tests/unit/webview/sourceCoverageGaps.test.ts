import { readFileSync } from 'fs';
import { join } from 'path';

function readWebviewFile(relativePath: string): string {
    return readFileSync(join(__dirname, '../../../src/webview', relativePath), 'utf8');
}

describe('webview source coverage gaps', () => {
    it('keeps accessible toolbar button wiring in buttonFactory', () => {
        const source = readWebviewFile('ui/toolbar/buttonFactory.ts');

        expect(source).toContain("document.createElement('button')");
        expect(source).toContain("btn.style.cssText = getBtnStyle(isDark);");
        expect(source).toContain("btn.addEventListener('click', onClick, listenerOptions);");
        expect(source).toContain("btn.setAttribute('aria-label', ariaLabel);");
        expect(source).toContain("btn.setAttribute('role', 'button');");
        expect(source).not.toMatch(/onclick=/);
    });

    it('keeps modal accessibility, focus restoration, and keyboard dismissal in shortcutsModal', () => {
        const source = readWebviewFile('ui/toolbar/shortcutsModal.ts');

        expect(source).toContain("overlay.setAttribute('role', 'dialog');");
        expect(source).toContain("overlay.setAttribute('aria-modal', 'true');");
        expect(source).toContain("overlay.setAttribute('aria-labelledby', 'shortcuts-title');");
        expect(source).toContain("const previouslyFocused = document.activeElement as HTMLElement | null;");
        expect(source).toContain("if (e.key === 'Escape')");
        expect(source).toContain("else if (e.key === 'Tab')");
        expect(source).toContain('previouslyFocused.focus()');
    });

    it('keeps theme-aware standard and join node rendering in nodeRenderer', () => {
        const source = readWebviewFile('rendering/nodeRenderer.ts');

        expect(source).toContain('NODE_SURFACE.dark');
        expect(source).toContain('NODE_SURFACE.light');
        expect(source).toContain('getNodeAccentColor(node.type, isDark)');
        expect(source).toContain("accentStrip.setAttribute('class', 'node-accent');");
        expect(source).toContain("document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject')");
        expect(source).toContain('deps.getJoinVennDiagram(joinType, isDark)');
        expect(source).toContain("warningTriangle.setAttribute('class', 'node-warning-triangle');");
    });

    it('keeps tooltipListeners as an intentional extension hook rather than duplicated wiring', () => {
        const source = readWebviewFile('interaction/tooltipListeners.ts');

        expect(source).toContain('export function registerTooltipListeners');
        expect(source).toContain('Node-level tooltip handlers remain attached in renderNode().');
        expect(source).not.toContain("document.addEventListener('mouseover'");
    });
});
