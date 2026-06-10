import { readFileSync } from 'fs';
import { join } from 'path';
import { getExportToPngScript } from '../../../src/workspace/ui/scripts/export';

describe('workspace PNG export (CSP-safe clipboard)', () => {
    const script = getExportToPngScript();

    it('uses canvas.toBlob() for the clipboard path, not fetch(dataURL)', () => {
        // default-src 'none' (no connect-src) blocks fetch() against data: URLs,
        // so the clipboard image must be produced with canvas.toBlob().
        expect(script).toContain('canvas.toBlob(');
        expect(script).not.toContain('fetch(pngDataUrl)');
    });

    it('writes the blob to the clipboard via ClipboardItem', () => {
        expect(script).toContain("new ClipboardItem({ 'image/png': blob })");
        expect(script).toContain('navigator.clipboard.write');
    });

    it('retains a save-dialog fallback when clipboard copy fails or is unavailable', () => {
        expect(script).toContain('saveViaDialog');
        expect(script).toContain("command: 'savePng'");
        // The clipboard .write() rejection path must fall back to saving.
        expect(script).toContain('.catch(() => {');
    });

    it('wraps the synchronous clipboard call so a thrown error still falls back', () => {
        // new ClipboardItem() / clipboard.write() can throw synchronously, which a
        // .catch() alone would not handle — the try/catch must call saveViaDialog().
        expect(script).toContain('try {');
        expect(script).toContain('} catch (clipboardErr) {');
        const catchIdx = script.indexOf('} catch (clipboardErr) {');
        const afterCatch = script.slice(catchIdx, catchIdx + 80);
        expect(afterCatch).toContain('saveViaDialog()');
    });
});

describe('workspace panel CSP allows image rendering', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/workspace/workspacePanel.ts'),
        'utf8'
    );

    it('permits data: and blob: image sources so canvas/PNG export is not blocked', () => {
        expect(source).toContain('img-src data: blob:');
    });
});
