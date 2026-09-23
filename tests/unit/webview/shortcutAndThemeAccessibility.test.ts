/**
 * M17/M18/M20: focus rings follow the theme, menu accents use theme tokens,
 * and advertised shortcuts match what the webview implements.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { getKeyboardShortcutsFeature } from '../../../src/webview/features/rendererMetadata';
import { registerDocumentKeyboardListeners } from '../../../src/webview/interaction/keyboardListeners';

const read = (relative: string) => readFileSync(join(__dirname, '../../..', relative), 'utf8');

describe('advertised shortcuts (M20)', () => {
    it('does not advertise an unbound copy shortcut in the export menu', () => {
        const source = read('src/webview/ui/exportDropdown.ts');
        expect(source).toContain("{ label: 'Copy to clipboard (PNG)', shortcut: '', action: callbacks.onCopyToClipboard }");
        expect(source).not.toContain('${modKey}C');
    });

    it('lists Shift+Enter and documents the implemented command bar / search keys', () => {
        expect(getKeyboardShortcutsFeature()).toEqual(expect.arrayContaining([
            { key: 'Shift + Enter', description: 'Previous search result' },
        ]));
        const readme = read('README.md');
        expect(readme).toContain('| `Alt + P` | Open SQL Crack quick actions |');
        expect(readme).toContain('| `Shift + Enter` | Previous search result |');
        expect(readme).not.toContain('Cmd/Ctrl + Shift + P');
        expect(readme).not.toContain('| `Enter` / `↓` |');
    });

    it('lets a single Shift+S reach the SQL preview toggle instead of the hidden chord', () => {
        const listeners = new Map<string, (event: any) => void>();
        const originalDocument = (global as any).document;
        (global as any).document = {
            activeElement: { tagName: 'DIV' },
            addEventListener: (type: string, handler: (event: any) => void) => listeners.set(type, handler),
        };
        const callbacks: any = new Proxy({
            isCommandBarVisible: () => false,
            isZeroGravityModeActive: () => false,
            isCompareModeActive: () => false,
        }, {
            get(target: any, property) {
                if (!(property in target)) {
                    target[property] = jest.fn();
                }
                return target[property];
            },
        });
        try {
            registerDocumentKeyboardListeners({
                state: { showColumnFlows: false, isFullscreen: false } as any,
                getSvg: () => null,
                getMainGroup: () => null,
                getCurrentNodes: () => [],
                cloudOffsets: new Map(),
                getSearchBox: () => null,
                documentListeners: [],
            }, callbacks);
            const keydown = listeners.get('keydown')!;
            const base = { preventDefault: jest.fn(), ctrlKey: false, metaKey: false, altKey: false };
            keydown({ ...base, key: 'Shift', shiftKey: true });
            keydown({ ...base, key: 'S', shiftKey: true });
            expect(callbacks.toggleSqlPreview).toHaveBeenCalledTimes(1);
            expect(callbacks.triggerMatrixRainOverlay).not.toHaveBeenCalled();
        } finally {
            (global as any).document = originalDocument;
        }
    });
});

describe('theme-aware focus and menu colors (M17, M18)', () => {
    it('regenerates focus rings on theme change and overrides inline outline:none', () => {
        const renderer = read('src/webview/renderer.ts');
        expect(renderer).toMatch(/function applyTheme\(dark: boolean\): void \{[\s\S]*?applyFocusRingStyles\(dark\);/);
        expect(renderer).toContain('outline: 2px solid ${focusRingColor} !important;');
        expect(renderer).toContain('[role="menu"] [tabindex="-1"]:focus-visible');
        // Action buttons live in #sql-crack-actions, outside #sql-crack-toolbar.
        expect(renderer).toContain('#root button:focus-visible');
    });

    it('colors the Focus Direction and View Location menus from theme tokens', () => {
        const featureMenus = read('src/webview/ui/toolbar/featureMenus.ts');
        const focusTheme = /function applyFocusModeDropdownTheme[\s\S]*?\n\}/.exec(featureMenus)?.[0] ?? '';
        const locationTheme = /function applyViewLocationDropdownState[\s\S]*?\n\}/.exec(featureMenus)?.[0] ?? '';
        for (const block of [focusTheme, locationTheme]) {
            expect(block).toContain('getComponentUiColors(dark)');
            expect(block).not.toContain('#818cf8');
            expect(block).not.toContain('#a5b4fc');
        }
    });
});
