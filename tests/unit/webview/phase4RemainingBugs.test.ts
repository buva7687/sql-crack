import { readFileSync } from 'fs';
import { join } from 'path';

describe('phase 4 remaining bug fixes', () => {
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

    it('uses theme-aware colors for offscreen virtualization indicators', () => {
        expect(virtualizedViewportSource).toContain('isDarkTheme: boolean;');
        expect(virtualizedViewportSource).toContain('const fill = isDarkTheme ? UI_COLORS.backgroundDark : UI_COLORS.backgroundPanelLightSolid;');
        expect(virtualizedViewportSource).toContain("const textColor = isDarkTheme ? UI_COLORS.textDim : UI_COLORS.textLightDim;");
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
});
