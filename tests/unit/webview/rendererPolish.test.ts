import { readFileSync } from 'fs';
import { join } from 'path';

describe('renderer polish safeguards', () => {
    const source = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');

    it('uses safe cloud state helpers instead of non-null map assertions', () => {
        expect(source).toContain('function ensureCloudViewState(nodeId: string): CloudViewState');
        expect(source).toContain('function ensureCloudOffset(nodeId: string, cloudWidth: number, cloudHeight: number, nodeHeight: number, cloudGap: number)');
        expect(source).not.toContain('cloudOffsets.get(node.id)!');
        expect(source).not.toContain('cloudViewStates.get(node.id)!');
    });

    it('cleans up injected style elements and resize observer state', () => {
        expect(source).toContain('let spinnerStyleElement: HTMLStyleElement | null = null;');
        expect(source).toContain('let reducedMotionStyleElement: HTMLStyleElement | null = null;');
        expect(source).toContain('rendererResizeObserver?.disconnect();');
        expect(source).toContain('spinnerStyleElement?.remove();');
        expect(source).toContain('reducedMotionStyleElement?.remove();');
        expect(source).toContain('clearTimeout(resizeObserverDebounceTimer);');
    });

    it('preserves same-query interaction state and avoids redundant initial fitting', () => {
        expect(source).toContain('|| (!shouldResetCloudState && currentNodes.length > 0)');
        expect(source).toContain("if (!canVirtualizeOnFirstPaint && (!state.layoutType || state.layoutType === 'vertical'))");
    });

    it('coalesces minimap viewport work into one animation frame', () => {
        expect(source).toContain('if (!minimapViewportFramePending)');
        expect(source).toContain('minimapViewportFramePending = false;');
    });

    it('restores the selected border after cursor-follow highlighting moves away', () => {
        expect(source).toContain('restoreNodeBorderState(rect);');
        expect(source).toContain('if (state.selectedNodeId === highlightedLineNodeId)');
    });
});
