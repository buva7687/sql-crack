import { readFileSync } from 'fs';
import { join } from 'path';
import { updateHintsPanelContent } from '../../../src/webview/panels/infoPanel';
import { createFakeElement, installFakeDocument, uninstallFakeDocument } from '../../helpers/fakeDom';

function render(hiddenByUser: boolean) {
    const panel = createFakeElement('div');
    updateHintsPanelContent({
        hintsPanel: panel as unknown as HTMLDivElement,
        currentHints: [{ type: 'info', message: 'No LIMIT clause', severity: 'low' }],
        currentNodes: [],
        isDarkTheme: true,
        panelBottom: 16,
        hintsMinimized: false,
        hiddenByUser,
        setHintsMinimized: jest.fn(),
        hintsShowAll: false,
        setHintsShowAll: jest.fn(),
        escapeHtml: (text: string) => text,
        onSelectNode: jest.fn(),
        onExecuteHintAction: jest.fn(),
        onRequestRerender: jest.fn(),
        onSyncViewportBounds: jest.fn(),
    } as any);
    return panel;
}

describe('hints panel visibility across re-renders', () => {
    beforeEach(() => installFakeDocument());
    afterEach(() => uninstallFakeDocument());

    it('stays hidden when the user hid it, while still refreshing its content', () => {
        const panel = render(true);
        expect(panel.style.visibility).toBe('hidden');
        expect(panel.style.opacity).toBe('0');
        expect(panel.innerHTML).toContain('No LIMIT clause');
    });

    it('shows hints when the user has not hidden the panel', () => {
        const panel = render(false);
        expect(panel.style.visibility).toBe('visible');
        expect(panel.style.opacity).toBe('1');
    });

    it('passes the O-key visibility into every hints re-render', () => {
        const renderer = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8').replace(/\r\n/g, '\n');
        const updateHints = renderer.slice(renderer.indexOf('function updateHintsPanel(): void {'), renderer.indexOf('function fitView(): void {'));
        expect(updateHints).toContain('hiddenByUser: !hintsVisible,');
    });
});
