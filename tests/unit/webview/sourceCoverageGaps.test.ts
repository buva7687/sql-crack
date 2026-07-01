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

    it('keeps column lineage panel escaping, keyboard close, search, and highlight wiring', () => {
        const source = readWebviewFile('features/columnLineage.ts');

        expect(source).toContain('export function showColumnLineagePanelFeature');
        expect(source).toContain('export function showLineagePathFeature');
        expect(source).toContain('export function highlightLineageNodesFeature');
        expect(source).toContain('export function highlightColumnSourcesFeature');
        expect(source).toContain('escapeHtml(flow.outputColumn)');
        expect(source).toContain('escapeHtml(firstStep.nodeName)');
        expect(source).toContain('escapeHtml(firstStep.columnName)');
        expect(source).toContain('escapeHtml(step.expression)');
        expect(source).toContain("header.querySelector<HTMLButtonElement>('#column-lineage-panel-close')?.addEventListener('click'");
        expect(source).toContain("if (e.key !== 'Escape')");
        expect(source).toContain("item.setAttribute('data-column-name', flow.outputColumn.toLowerCase());");
        expect(source).toContain("const items = columnList.querySelectorAll('[data-column-name]');");
        expect(source).toContain('state.highlightedColumnSources = lineage.sources.map((source) => source.nodeId).filter(Boolean);');
        expect(source).toContain('highlightPathToSelect(mainGroup, currentNodes, currentEdges, state.highlightedColumnSources, edgeColors.columnLineage);');
        expect(source).not.toMatch(/onclick=/);
    });
});
