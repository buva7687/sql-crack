import { readFileSync } from 'fs';
import { join } from 'path';

describe('renderer keyboard node navigation integration', () => {
    const rendererSource = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');
    const nodeDispatcherSource = readFileSync(join(__dirname, '../../../src/webview/rendering/nodeDispatcher.ts'), 'utf8');
    const listenerSource = readFileSync(join(__dirname, '../../../src/webview/interaction/keyboardListeners.ts'), 'utf8');

    it('handles Tab and Shift+Tab cycling on nodes and SVG container', () => {
        expect(nodeDispatcherSource).toContain("if (key === 'Tab') {");
        expect(nodeDispatcherSource).toContain("navigateToAdjacentNode(node, event.shiftKey ? 'prev' : 'next');");
        expect(listenerSource).toContain("if (e.key === 'Tab') {");
        expect(listenerSource).toContain('const orderedNodes = callbacks.getKeyboardNavigationNodes();');
        expect(listenerSource).toContain("const target = getCycledNode(orderedNodes, seedId, e.shiftKey ? 'prev' : 'next');");
    });

    it('maps arrow keys to edge-following and sibling navigation semantics', () => {
        expect(nodeDispatcherSource).toContain("if (key === 'ArrowUp') {");
        expect(nodeDispatcherSource).toContain("navigateToConnectedNode('upstream', node.id);");
        expect(nodeDispatcherSource).toContain("if (key === 'ArrowDown') {");
        expect(nodeDispatcherSource).toContain("navigateToConnectedNode('downstream', node.id);");
        expect(nodeDispatcherSource).toContain("if (key === 'ArrowRight') {");
        expect(nodeDispatcherSource).toContain("navigateToSiblingNode(node, 'next');");
        expect(nodeDispatcherSource).toContain("if (key === 'ArrowLeft') {");
        expect(nodeDispatcherSource).toContain("navigateToSiblingNode(node, 'prev');");
    });

    it('wires Konami and Shift+S+Q+L easter-egg shortcuts through keyboard callbacks', () => {
        expect(listenerSource).toContain('const KONAMI_SEQUENCE =');
        expect(listenerSource).toContain('callbacks.toggleZeroGravityMode();');
        expect(listenerSource).toContain('callbacks.triggerMatrixRainOverlay();');
        expect(listenerSource).toContain('const matrixChordResult = handleMatrixChordKeydown(e);');
        expect(listenerSource).toContain("if (matrixChordResult !== 'none') {");
        expect(listenerSource).toContain('callbacks.isZeroGravityModeActive()');
        expect(listenerSource).toContain('callbacks.toggleZeroGravityMode(false);');
    });

    it('maps U/D/A shortcuts to focus direction and enables focus mode from setFocusMode', () => {
        expect(listenerSource).toContain("if (e.key === 'u' || e.key === 'U')");
        expect(listenerSource).toContain("callbacks.setFocusMode('upstream');");
        expect(listenerSource).toContain("if (e.key === 'd' || e.key === 'D')");
        expect(listenerSource).toContain("callbacks.setFocusMode('downstream');");
        expect(listenerSource).toContain("if (e.key === 'a' || e.key === 'A')");
        expect(listenerSource).toContain("callbacks.setFocusMode('all');");

        expect(rendererSource).toContain('if (state.selectedNodeId) {');
        expect(rendererSource).toContain('state.focusModeEnabled = true;');
        expect(rendererSource).toContain('const modeLabel = mode === \'upstream\' ? \'Upstream\' : mode === \'downstream\' ? \'Downstream\' : \'All\';');
        expect(rendererSource).toContain("id: 'focus-mode',");
        expect(rendererSource).toContain('label: `Focus: ${modeLabel}`');
    });

    it('adds accessibility metadata and announces focused nodes via live region', () => {
        expect(nodeDispatcherSource).toContain("group.setAttribute('role', 'button');");
        expect(nodeDispatcherSource).toContain("group.setAttribute('tabindex', '0');");
        expect(nodeDispatcherSource).toContain("group.setAttribute('aria-label', `${node.type} node: ${node.label}${nodeDescription}`);");
        expect(rendererSource).toContain("nodeFocusLiveRegion.id = 'node-focus-live-region';");
        expect(nodeDispatcherSource).toContain('announceFocusedNode(node);');
    });

    it('uses theme-aware node focus ring colors distinct from selection state', () => {
        expect(nodeDispatcherSource).toContain('UI_COLORS.nodeFocusRingDark');
        expect(nodeDispatcherSource).toContain('UI_COLORS.nodeFocusRingLight');
        expect(nodeDispatcherSource).toContain("group.setAttribute('data-keyboard-focus', 'true');");
    });

    it('connects zero-gravity and matrix helpers into renderer setup and lifecycle cleanup', () => {
        expect(rendererSource).toContain('triggerMatrixRainOverlay,');
        expect(rendererSource).toContain('toggleZeroGravityMode,');
        expect(rendererSource).toContain('isZeroGravityModeActive,');
        expect(rendererSource).toContain('function toggleZeroGravityMode(enable?: boolean): void');
        expect(rendererSource).toContain('function triggerMatrixRainOverlay(): void');
        expect(rendererSource).toContain('stopZeroGravityMode({ silent: true });');
        expect(rendererSource).toContain('clearMatrixRainOverlay();');
    });
});
