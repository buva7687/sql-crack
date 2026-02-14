import { readFileSync } from 'fs';
import { join } from 'path';

describe('renderer keyboard node navigation integration', () => {
    const rendererSource = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');
    const listenerSource = readFileSync(join(__dirname, '../../../src/webview/interaction/keyboardListeners.ts'), 'utf8');

    it('handles Tab and Shift+Tab cycling on nodes and SVG container', () => {
        expect(rendererSource).toContain("if (key === 'Tab') {");
        expect(rendererSource).toContain("navigateToAdjacentNode(node, e.shiftKey ? 'prev' : 'next');");
        expect(listenerSource).toContain("if (e.key === 'Tab') {");
        expect(listenerSource).toContain('const orderedNodes = callbacks.getKeyboardNavigationNodes();');
        expect(listenerSource).toContain("const target = getCycledNode(orderedNodes, seedId, e.shiftKey ? 'prev' : 'next');");
    });

    it('maps arrow keys to edge-following and sibling navigation semantics', () => {
        expect(rendererSource).toContain("if (key === 'ArrowUp') {");
        expect(rendererSource).toContain("navigateToConnectedNode('upstream', node.id);");
        expect(rendererSource).toContain("if (key === 'ArrowDown') {");
        expect(rendererSource).toContain("navigateToConnectedNode('downstream', node.id);");
        expect(rendererSource).toContain("if (key === 'ArrowRight') {");
        expect(rendererSource).toContain("navigateToSiblingNode(node, 'next');");
        expect(rendererSource).toContain("if (key === 'ArrowLeft') {");
        expect(rendererSource).toContain("navigateToSiblingNode(node, 'prev');");
    });

    it('adds accessibility metadata and announces focused nodes via live region', () => {
        expect(rendererSource).toContain("group.setAttribute('role', 'button');");
        expect(rendererSource).toContain("group.setAttribute('tabindex', '0');");
        expect(rendererSource).toContain("group.setAttribute('aria-label', `${node.type} node: ${node.label}${nodeDescription}`);");
        expect(rendererSource).toContain("nodeFocusLiveRegion.id = 'node-focus-live-region';");
        expect(rendererSource).toContain('announceFocusedNode(node);');
    });

    it('uses theme-aware node focus ring colors distinct from selection state', () => {
        expect(rendererSource).toContain('UI_COLORS.nodeFocusRingDark');
        expect(rendererSource).toContain('UI_COLORS.nodeFocusRingLight');
        expect(rendererSource).toContain("group.setAttribute('data-keyboard-focus', 'true');");
    });
});
