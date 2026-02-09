import { readFileSync } from 'fs';
import { join } from 'path';

describe('renderer keyboard node navigation integration', () => {
    const source = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');

    it('handles Tab and Shift+Tab cycling on nodes and SVG container', () => {
        expect(source).toContain("if (key === 'Tab') {");
        expect(source).toContain("navigateToAdjacentNode(node, e.shiftKey ? 'prev' : 'next');");
        expect(source).toContain("if (e.key === 'Tab') {");
        expect(source).toContain("const orderedNodes = getKeyboardNavigationNodes();");
        expect(source).toContain("const target = getCycledNode(orderedNodes, seedId, e.shiftKey ? 'prev' : 'next');");
    });

    it('maps arrow keys to edge-following and sibling navigation semantics', () => {
        expect(source).toContain("if (key === 'ArrowUp') {");
        expect(source).toContain("navigateToConnectedNode('upstream', node.id);");
        expect(source).toContain("if (key === 'ArrowDown') {");
        expect(source).toContain("navigateToConnectedNode('downstream', node.id);");
        expect(source).toContain("if (key === 'ArrowRight') {");
        expect(source).toContain("navigateToSiblingNode(node, 'next');");
        expect(source).toContain("if (key === 'ArrowLeft') {");
        expect(source).toContain("navigateToSiblingNode(node, 'prev');");
    });

    it('adds accessibility metadata and announces focused nodes via live region', () => {
        expect(source).toContain("group.setAttribute('role', 'button');");
        expect(source).toContain("group.setAttribute('tabindex', '0');");
        expect(source).toContain("group.setAttribute('aria-label', `${node.type} node: ${node.label}${nodeDescription}`);");
        expect(source).toContain("nodeFocusLiveRegion.id = 'node-focus-live-region';");
        expect(source).toContain('announceFocusedNode(node);');
    });

    it('uses theme-aware node focus ring colors distinct from selection state', () => {
        expect(source).toContain('UI_COLORS.nodeFocusRingDark');
        expect(source).toContain('UI_COLORS.nodeFocusRingLight');
        expect(source).toContain("group.setAttribute('data-keyboard-focus', 'true');");
    });
});
