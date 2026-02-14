import { readFileSync } from 'fs';
import { join } from 'path';

describe('undo/redo layout history wiring', () => {
    const rendererSource = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');
    const listenerSource = readFileSync(join(__dirname, '../../../src/webview/interaction/keyboardListeners.ts'), 'utf8');
    const rendererStateSource = readFileSync(join(__dirname, '../../../src/webview/state/rendererState.ts'), 'utf8');
    const toolbarSource = readFileSync(join(__dirname, '../../../src/webview/ui/toolbar.ts'), 'utf8');
    const indexSource = readFileSync(join(__dirname, '../../../src/webview/index.ts'), 'utf8');

    it('wires Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z keyboard shortcuts in renderer', () => {
        expect(listenerSource).toContain("(e.key === 'z' || e.key === 'Z')");
        expect(listenerSource).toContain('callbacks.redoLayoutChange();');
        expect(listenerSource).toContain('callbacks.undoLayoutChange();');
    });

    it('records and restores layout history snapshots in renderer', () => {
        expect(rendererSource).toContain('const layoutHistory = createLayoutHistory();');
        expect(rendererStateSource).toContain('new UndoManager<LayoutHistorySnapshot>');
        expect(rendererSource).toContain('function captureLayoutHistorySnapshot()');
        expect(rendererSource).toContain('function restoreLayoutHistorySnapshot(snapshot: LayoutHistorySnapshot): void');
        expect(rendererSource).toContain('recordLayoutHistorySnapshot();');
        expect(rendererSource).toContain("document.dispatchEvent(new CustomEvent('undo-redo-state'");
    });

    it('adds undo/redo buttons to toolbar and syncs disabled states', () => {
        expect(toolbarSource).toContain('onUndo: () => void;');
        expect(toolbarSource).toContain('onRedo: () => void;');
        expect(toolbarSource).toContain("undoBtn.id = 'sql-crack-undo-btn';");
        expect(toolbarSource).toContain("redoBtn.id = 'sql-crack-redo-btn';");
        expect(toolbarSource).toContain("document.addEventListener('undo-redo-state', undoRedoStateHandler);");
    });

    it('clears history on new parse and query switch in webview bootstrap', () => {
        expect(indexSource).toContain('clearUndoHistory();');
        expect(indexSource).toContain('queryViewStates.clear();');
        expect(indexSource).toContain('switchToQueryIndex(newIndex');
    });
});
