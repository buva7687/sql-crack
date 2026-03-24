import { readFileSync } from 'fs';
import { join } from 'path';

describe('phase 4 remaining bug fixes', () => {
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );
    const virtualizedViewportSource = readFileSync(
        join(__dirname, '../../../src/webview/rendering/virtualizedViewport.ts'),
        'utf8'
    );
    const nodePulseSource = readFileSync(
        join(__dirname, '../../../src/webview/interaction/nodePulse.ts'),
        'utf8'
    );
    const cloudPositioningSource = readFileSync(
        join(__dirname, '../../../src/webview/rendering/cloudPositioning.ts'),
        'utf8'
    );
    const containerNodeRendererSource = readFileSync(
        join(__dirname, '../../../src/webview/rendering/containerNodeRenderer.ts'),
        'utf8'
    );
    const clusterProjectionSource = readFileSync(
        join(__dirname, '../../../src/webview/rendering/clusterProjection.ts'),
        'utf8'
    );
    const nodeDispatcherSource = readFileSync(
        join(__dirname, '../../../src/webview/rendering/nodeDispatcher.ts'),
        'utf8'
    );
    const canvasSetupSource = readFileSync(
        join(__dirname, '../../../src/webview/rendering/canvasSetup.ts'),
        'utf8'
    );

    it('uses theme-aware colors for offscreen virtualization indicators', () => {
        expect(virtualizedViewportSource).toContain('isDarkTheme: boolean;');
        expect(virtualizedViewportSource).toContain('const fill = isDarkTheme ? UI_COLORS.backgroundDark : UI_COLORS.backgroundPanelLightSolid;');
        expect(virtualizedViewportSource).toContain("const textColor = isDarkTheme ? UI_COLORS.textDim : UI_COLORS.textLightDim;");
    });

    it('routes search, navigation, and virtualization through the projected render graph', () => {
        expect(rendererSource).toContain('currentNodes: renderNodes,');
        expect(rendererSource).toContain('currentEdges: renderEdges,');
        expect(rendererSource).toContain('updateSearchCountDisplayFeature(searchRuntime, state, renderNodes.length);');
        expect(rendererSource).toContain('navigateSearchFeature(delta, state, renderNodes, {');
        expect(rendererSource).toContain('const node = renderNodes.find((candidate) => candidate.id === nodeId);');
        expect(rendererSource).toContain('nodes: renderNodes,');
        expect(rendererSource).toContain('edges: renderEdges,');
        expect(rendererSource).toContain('return getConnectedNodesFeature(nodeId, renderEdges, state.focusMode);');
        expect(rendererSource).toContain('if (snapshot.selectedNodeId && renderNodes.some((node) => node.id === snapshot.selectedNodeId)) {');
    });

    it('uses theme-aware pulse palettes instead of hardcoded animation colors', () => {
        expect(nodePulseSource).toContain('function getPulsePalette(isDarkTheme: boolean): PulsePalette');
        expect(nodePulseSource).toContain('selectedStroke: UI_COLORS.white');
        expect(nodePulseSource).toContain('selectedStroke: UI_COLORS.focusTextLight');
        expect(nodePulseSource).toContain('nodePulseStart:');
        expect(nodePulseSource).toContain('cloudPulsePrimary:');
        expect(nodePulseSource).toContain('isDarkTheme: boolean;');
    });

    it('uses shared expandable node constants across rendering modules', () => {
        expect(cloudPositioningSource).toContain("from './expandableNodeConstants'");
        expect(containerNodeRendererSource).toContain("from './expandableNodeConstants'");
        expect(clusterProjectionSource).toContain("from './expandableNodeConstants'");

        expect(cloudPositioningSource).not.toContain('const nodeWidth = 180;');
        expect(containerNodeRendererSource).not.toContain('const nodeWidth = 180;');
        expect(clusterProjectionSource).not.toContain('node.width = 180;');
    });

    it('keeps collapse drag guards and hover markers aligned with the rendered theme', () => {
        expect(nodeDispatcherSource).toContain("target.closest('.collapse-btn')");
        expect(nodeDispatcherSource).toContain('captureNodeBorderState(rect);');
        expect(nodeDispatcherSource).toContain('ensureNodeBorderStateObserver(rect);');
        expect(canvasSetupSource).toContain('const hoverArrowFill = isDark ? EDGE_THEME.dark.hover : EDGE_THEME.light.hover;');
        expect(canvasSetupSource).toContain('fill="${hoverArrowFill}"');
    });
});
