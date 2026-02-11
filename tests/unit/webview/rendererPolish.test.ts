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
});
