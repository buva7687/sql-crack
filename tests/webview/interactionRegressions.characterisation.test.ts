/**
 * Characterisation tests for interaction & rendering regressions.
 *
 * These guard against re-introducing bugs that were fixed:
 *   1. Cloud internal pan intercepting whole-cloud drag
 *   2. Node drag double-offsetting cloud arrow (updateCloudAndArrow inside group transform)
 *   3. Search not clearing when input text is deleted
 *   4. Reset view (R key) not restoring initial node positions
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const srcDir = join(__dirname, '../../src/webview');

const dragListenersSource = readFileSync(join(srcDir, 'interaction/dragListeners.ts'), 'utf8');
const containerNodeRendererSource = readFileSync(join(srcDir, 'rendering/containerNodeRenderer.ts'), 'utf8');
const cloudPositioningSource = readFileSync(join(srcDir, 'rendering/cloudPositioning.ts'), 'utf8');
const searchSource = readFileSync(join(srcDir, 'features/search.ts'), 'utf8');
const rendererSource = readFileSync(join(srcDir, 'renderer.ts'), 'utf8');

describe('Cloud drag regressions', () => {
    it('does not leave temporary cloud drag debug logs in source', () => {
        expect(dragListenersSource).not.toContain('[CLOUD-DRAG]');
        expect(containerNodeRendererSource).not.toContain('[CLOUD-DRAG]');
        expect(cloudPositioningSource).not.toContain('[CLOUD-POSITION]');
    });

    describe('no internal pan mousedown on cloud nestedSvg', () => {
        it('attachCloudPanZoomListeners should only have wheel listener, no mousedown', () => {
            // Extract the attachCloudPanZoomListeners function body
            const fnMatch = containerNodeRendererSource.match(
                /function attachCloudPanZoomListeners\b[\s\S]*?^}/m
            );
            expect(fnMatch).not.toBeNull();
            const fnBody = fnMatch![0];

            // Must have wheel listener (zoom still works inside cloud)
            expect(fnBody).toContain("addEventListener('wheel'");

            // Must NOT have mousedown/mousemove/mouseup listeners
            // (internal pan was removed so whole-cloud drag works via the cloud container)
            expect(fnBody).not.toContain("addEventListener('mousedown'");
            expect(fnBody).not.toContain("addEventListener('mousemove'");
            expect(fnBody).not.toContain("addEventListener('mouseup'");
        });

        it('cloud drag mousedown must be on cloudGroup, not cloud rect', () => {
            // The mousedown for whole-cloud drag must be on the cloudGroup <g> element,
            // NOT on the cloud <rect>. The rect is covered by title text, close button,
            // and nestedSvg — clicks on those never reach the rect. The cloudGroup
            // receives bubbled events from all children.
            expect(containerNodeRendererSource).toMatch(
                /cloudGroup\.addEventListener\('mousedown'[\s\S]*?isDraggingCloud\s*=\s*true/
            );
            // Must NOT be cloud.addEventListener (the rect)
            expect(containerNodeRendererSource).not.toMatch(
                /\bcloud\.addEventListener\('mousedown'/
            );
        });

        it('cloud drag handler excludes clicks on subflow content and close button', () => {
            // Clicks inside the nested subflow or the close button should not
            // trigger whole-cloud drag — they have their own interactions
            const dragMatch = containerNodeRendererSource.match(
                /cloudGroup\.addEventListener\('mousedown'[\s\S]*?isDraggingCloud\s*=\s*true/
            );
            expect(dragMatch).not.toBeNull();
            const handlerBody = dragMatch![0];
            expect(handlerBody).toContain("closest('.cloud-content')");
            expect(handlerBody).toContain("closest('.cloud-close-btn')");
        });
    });

    describe('node drag must not call updateCloudAndArrow', () => {
        it('isDraggingNode branch should not invoke callbacks.updateCloudAndArrow', () => {
            // The cloud is inside the node group — group transform already moves it.
            // Calling updateCloudAndArrow with absolute node.x/y while inside the
            // transformed group causes double-offset on the arrow.
            const nodeDragMatch = dragListenersSource.match(
                /isDraggingNode[\s\S]*?updateNodeEdges/
            );
            expect(nodeDragMatch).not.toBeNull();
            // Must not have a callbacks.updateCloudAndArrow CALL (comments don't count)
            expect(nodeDragMatch![0]).not.toMatch(/callbacks\.updateCloudAndArrow/);
        });

        it('isDraggingCloud branch should still invoke callbacks.updateCloudAndArrow', () => {
            // When dragging the cloud itself (not the node), updateCloudAndArrow
            // is correct because the node group has no extra transform
            const cloudDragMatch = dragListenersSource.match(
                /isDraggingCloud[\s\S]*?\} else if \(state\.isDraggingNode/
            );
            expect(cloudDragMatch).not.toBeNull();
            expect(cloudDragMatch![0]).toMatch(/callbacks\.updateCloudAndArrow/);
        });
    });
});

describe('Search clear on empty input', () => {
    it('calls onClearSearch when input value becomes empty', () => {
        // When the user deletes all search text, clearSearch must fire
        // (same as pressing Escape) to reset breadcrumbs and highlights
        const inputListenerMatch = searchSource.match(
            /addEventListener\('input'[\s\S]*?onHighlightMatches/
        );
        expect(inputListenerMatch).not.toBeNull();
        const listenerBody = inputListenerMatch![0];

        expect(listenerBody).toContain('!input.value');
        expect(listenerBody).toContain('onClearSearch()');
    });

    it('returns early after onClearSearch so onHighlightMatches is not called with empty string', () => {
        // The clearSearch path must return before calling onHighlightMatches
        const inputListenerMatch = searchSource.match(
            /addEventListener\('input'[\s\S]*?onNavigateToFirstResult/
        );
        expect(inputListenerMatch).not.toBeNull();
        const body = inputListenerMatch![0];

        const clearIdx = body.indexOf('onClearSearch()');
        const returnIdx = body.indexOf('return;', clearIdx);
        const highlightIdx = body.indexOf('onHighlightMatches(');

        expect(clearIdx).toBeGreaterThan(-1);
        expect(returnIdx).toBeGreaterThan(clearIdx);
        expect(highlightIdx).toBeGreaterThan(returnIdx);
    });
});

describe('Reset view triggers full refresh via custom event', () => {
    const indexSource = readFileSync(join(srcDir, 'index.ts'), 'utf8');

    it('resetView dispatches sql-crack-reset-view custom event', () => {
        const resetMatch = rendererSource.match(
            /function resetView\(\)[\s\S]*?^}/m
        );
        expect(resetMatch).not.toBeNull();
        const fnBody = resetMatch![0];

        expect(fnBody).toContain("sql-crack-reset-view");
        expect(fnBody).toContain('CustomEvent');
    });

    it('index.ts listens for sql-crack-reset-view and triggers refresh', () => {
        expect(indexSource).toContain("addEventListener('sql-crack-reset-view'");
        expect(indexSource).toMatch(/sql-crack-reset-view[\s\S]*?requestRefresh/);
    });

    it('command bar labels R as Refresh Visualization', () => {
        expect(rendererSource).toContain("label: 'Refresh Visualization', shortcut: 'R'");
    });

    it('restoreLayoutHistorySnapshot mutates cloudOffsets instead of replacing the map', () => {
        const restoreMatch = rendererSource.match(
            /function restoreLayoutHistorySnapshot\(snapshot: LayoutHistorySnapshot\)[\s\S]*?^}/m
        );
        expect(restoreMatch).not.toBeNull();
        const fnBody = restoreMatch![0];

        expect(fnBody).toContain('cloudOffsets.clear()');
        expect(fnBody).toContain('snapshot.cloudOffsets.forEach');
        expect(fnBody).not.toContain('cloudOffsets = new Map(');
    });
});
