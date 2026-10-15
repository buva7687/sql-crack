import { createRendererBootstrap, updateLoadingOverlayTheme } from '../../../../src/webview/ui/rendererBootstrap';
import { getComponentUiColors, setHighContrastMode } from '../../../../src/webview/constants';
import { createFakeElement, FakeElement, installFakeDocument, uninstallFakeDocument } from '../../../helpers/fakeDom';

describe('renderer bootstrap theme', () => {
    beforeEach(() => {
        installFakeDocument();
        const fakeDocument = document as unknown as { head: FakeElement; createElement: (tag: string) => FakeElement };
        fakeDocument.head = createFakeElement('head');
        const createElement = fakeDocument.createElement;
        fakeDocument.createElement = tag => {
            const element = createElement(tag);
            Object.defineProperty(element.style, 'setProperty', {
                value: (name: string, value: string) => { element.style[name] = value; },
            });
            return element;
        };
    });

    afterEach(() => {
        setHighContrastMode(false);
        uninstallFakeDocument();
    });

    function bootstrap(isDarkTheme: boolean) {
        return createRendererBootstrap({
            container: createFakeElement('div') as unknown as HTMLElement,
            isDarkTheme, existingSpinnerStyleElement: null,
            onToggleColumnFlows: jest.fn(), onSetupMinimapDrag: jest.fn(),
        });
    }

    it.each([false, true])('initializes matching panel text and backgrounds (dark: %s)', isDarkTheme => {
        setHighContrastMode(true);
        const result = bootstrap(isDarkTheme);
        const colors = getComponentUiColors(isDarkTheme);
        for (const panel of [result.statsPanel, result.hintsPanel]) {
            expect(panel.style.cssText).toContain(`background: ${colors.surface}`);
            expect(panel.style.cssText).toContain(`color: ${colors.textMuted}`);
        }
        const overlay = result.loadingOverlay as unknown as FakeElement;
        expect(overlay.style.color).toBe(colors.textDim);
        expect(overlay.style['--loading-panel-bg']).toBe(colors.modalBg);
        expect(overlay.innerHTML).toContain('color: inherit');
        expect(overlay.innerHTML).toContain('background: var(--loading-panel-bg)');
    });

    it('updates the existing loading card across theme and contrast changes', () => {
        const overlay = bootstrap(true).loadingOverlay;
        const originalMarkup = overlay.innerHTML;
        setHighContrastMode(true);
        updateLoadingOverlayTheme(overlay, false);
        expect(overlay.style.color).toBe('#334155');
        expect((overlay as unknown as FakeElement).style['--loading-panel-bg']).toBe(getComponentUiColors(false).modalBg);
        setHighContrastMode(false);
        updateLoadingOverlayTheme(overlay, true);
        expect(overlay.style.color).toBe(getComponentUiColors(true).textDim);
        expect((overlay as unknown as FakeElement).style['--loading-panel-bg']).toBe(getComponentUiColors(true).modalBg);
        expect(overlay.innerHTML).toBe(originalMarkup);
    });
});
