import { readFileSync } from 'fs';
import { join } from 'path';
import { getExportToPngScript } from '../../../src/workspace/ui/scripts/export';

describe('workspace PNG export (CSP-safe clipboard)', () => {
    const script = getExportToPngScript();

    interface PngHarnessOptions {
        clipboardAvailable?: boolean;
        clipboardWrite?: jest.Mock;
        clipboardItemError?: Error;
        blobResult?: Blob | null;
    }

    function createPngHarness(options: PngHarnessOptions = {}) {
        const postMessage = jest.fn();
        const clipboardWrite = options.clipboardWrite || jest.fn().mockResolvedValue(undefined);
        const canvas = {
            width: 0,
            height: 0,
            getContext: jest.fn(() => ({
                scale: jest.fn(),
                drawImage: jest.fn(),
            })),
            toDataURL: jest.fn(() => 'data:image/png;base64,cG5n'),
            toBlob: jest.fn((callback: (blob: Blob | null) => void) => {
                callback(options.blobResult === undefined
                    ? new Blob(['png'], { type: 'image/png' })
                    : options.blobResult);
            }),
        };
        const svgClone = {
            firstChild: null,
            setAttribute: jest.fn(),
            getElementById: jest.fn(() => ({ setAttribute: jest.fn() })),
            insertBefore: jest.fn(),
        };
        const documentMock = {
            documentElement: {},
            body: { appendChild: jest.fn() },
            getElementById: jest.fn((id: string) => {
                if (id === 'graph-svg') {
                    return { cloneNode: jest.fn(() => svgClone) };
                }
                return null;
            }),
            createElementNS: jest.fn(() => ({ setAttribute: jest.fn() })),
            createElement: jest.fn((tag: string) => {
                if (tag === 'canvas') {
                    return canvas;
                }
                return {
                    id: '',
                    textContent: '',
                    style: { cssText: '', opacity: '' },
                    remove: jest.fn(),
                };
            }),
        };
        const urlMock = {
            createObjectURL: jest.fn(() => 'blob:workspace-export'),
            revokeObjectURL: jest.fn(),
        };

        class MockImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;

            set src(_value: string) {
                this.onload?.();
            }
        }

        class MockXmlSerializer {
            serializeToString(): string {
                return '<svg></svg>';
            }
        }

        class MockClipboardItem {
            constructor(_items: Record<string, Blob>) {
                if (options.clipboardItemError) {
                    throw options.clipboardItemError;
                }
            }
        }

        const navigatorMock = options.clipboardAvailable === false
            ? {}
            : { clipboard: { write: clipboardWrite } };
        const factory = new Function(
            'document',
            'vscode',
            'mainGroup',
            'getComputedStyle',
            'XMLSerializer',
            'Blob',
            'URL',
            'Image',
            'navigator',
            'ClipboardItem',
            'prefersReducedMotion',
            'requestAnimationFrame',
            `${script}\nreturn exportToPng;`
        ) as (...args: unknown[]) => (copyToClipboard?: boolean) => void;

        const exportToPng = factory(
            documentMock,
            { postMessage },
            { getBBox: () => ({ x: 0, y: 0, width: 100, height: 100 }) },
            () => ({ getPropertyValue: () => '#ffffff' }),
            MockXmlSerializer,
            Blob,
            urlMock,
            MockImage,
            navigatorMock,
            MockClipboardItem,
            true,
            (callback: () => void) => callback()
        );

        return { exportToPng, postMessage, clipboardWrite, canvas };
    }

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

    it('falls back to the save dialog when ClipboardItem throws synchronously', () => {
        const harness = createPngHarness({
            clipboardItemError: new Error('unsupported image type'),
        });

        harness.exportToPng(true);

        expect(harness.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            command: 'savePng',
            data: 'cG5n',
        }));
        expect(harness.clipboardWrite).not.toHaveBeenCalled();
    });

    it('falls back to the save dialog when clipboard.write rejects', async () => {
        const clipboardWrite = jest.fn().mockRejectedValue(new Error('permission denied'));
        const harness = createPngHarness({ clipboardWrite });

        harness.exportToPng(true);
        await Promise.resolve();
        await Promise.resolve();

        expect(clipboardWrite).toHaveBeenCalledTimes(1);
        expect(harness.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            command: 'savePng',
            data: 'cG5n',
        }));
    });

    it('falls back when the Clipboard API is unavailable', () => {
        const harness = createPngHarness({ clipboardAvailable: false });

        harness.exportToPng(true);

        expect(harness.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            command: 'savePng',
        }));
    });

    it('falls back when canvas.toBlob cannot create an image blob', () => {
        const harness = createPngHarness({ blobResult: null });

        harness.exportToPng(true);

        expect(harness.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            command: 'savePng',
        }));
        expect(harness.clipboardWrite).not.toHaveBeenCalled();
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
