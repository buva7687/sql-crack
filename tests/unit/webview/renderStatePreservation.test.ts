/**
 * Regression guards for renderer state handling (audit S2, S3, S7).
 *
 * renderer.ts depends on the DOM and d3, so these assertions read its source.
 * Both behaviours were also checked in a browser against the built webview:
 * a dragged CTE kept its position across a theme toggle in the horizontal
 * layout, and the SQL preview switched to the failing statement's SQL.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const rendererSource = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');
const renderStart = rendererSource.indexOf('export function render(');
const renderBody = rendererSource.slice(renderStart, rendererSource.indexOf('\n}\n', renderStart));

describe('render() state preservation', () => {
    it('does not re-run a non-vertical layout over an unchanged graph (S2)', () => {
        expect(renderBody).toContain(
            'const reRendersSameGraph = !shouldResetCloudState && clustered.nodes === result.nodes;'
        );
        expect(renderBody).toContain("if (initialLayout !== 'vertical' && !reRendersSameGraph) {");
        // The layout switch must stay behind that guard.
        const guard = renderBody.indexOf('!reRendersSameGraph');
        expect(guard).toBeGreaterThan(-1);
        expect(renderBody.indexOf('layoutGraphHorizontal(renderNodes')).toBeGreaterThan(guard);
    });

    it('refreshes an open SQL preview on error and empty renders (S3)', () => {
        const errorBranch = renderBody.slice(renderBody.indexOf('if (result.error) {'), renderBody.indexOf('if (result.nodes.length === 0) {'));
        const emptyStart = renderBody.indexOf('if (result.nodes.length === 0) {');
        const emptyBranch = renderBody.slice(emptyStart, renderBody.indexOf('return;', emptyStart));

        expect(errorBranch).toContain('refreshVisibleSqlPreview();');
        expect(errorBranch.indexOf('refreshVisibleSqlPreview();')).toBeLessThan(errorBranch.indexOf('return;'));
        expect(emptyBranch).toContain('refreshVisibleSqlPreview();');
        expect(renderBody.split('refreshVisibleSqlPreview();').length - 1).toBe(3);
    });

    it('notifies the toolbar after restoring any layout history snapshot (S7)', () => {
        const start = rendererSource.indexOf('function restoreLayoutHistorySnapshot(');
        const body = rendererSource.slice(start, rendererSource.indexOf('\n}\n', start));
        const focusBranchEnd = body.lastIndexOf('clearFocusMode();');
        // Undo to a focus-mode snapshot restores layout and focus direction;
        // applyFocusMode() alone never told the layout picker.
        expect(body.lastIndexOf('notifyRendererStateChanged();')).toBeGreaterThan(focusBranchEnd);
    });
});
