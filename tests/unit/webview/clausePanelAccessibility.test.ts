import { showSqlClausePanelContent } from '../../../src/webview/panels/sqlPanels';
import { CONDITION_COLORS, getReadableTextColor } from '../../../src/webview/constants';
import { applyPanelBottomOffsets } from '../../../src/webview/ui/panelLayout';
import { createFakeElement, installFakeDocument, uninstallFakeDocument } from '../../helpers/fakeDom';
import type { FlowEdge } from '../../../src/webview/types';

function luminance(hex: string): number {
    const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map(value => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
}

function showPanel(edge: Partial<FlowEdge>, bottomPx?: number) {
    const container = createFakeElement('div');
    showSqlClausePanelContent({
        edge: { id: 'e1', source: 'a', target: 'b', ...edge } as FlowEdge,
        containerElement: container as unknown as HTMLElement,
        isDarkTheme: true,
        zIndex: 10,
        pinIcon: '',
        escapeHtml: value => value,
        getClauseTypeColor: clauseType => CONDITION_COLORS[clauseType] || CONDITION_COLORS.default,
        monoFontStack: 'monospace',
        ...(bottomPx === undefined ? {} : { bottomPx }),
    });
    return container.children[0];
}

describe('SQL clause popup accessibility', () => {
    beforeEach(() => installFakeDocument());
    afterEach(() => uninstallFakeDocument());

    it.each(Object.entries(CONDITION_COLORS))('keeps the %s badge label at 4.5:1 or better', (_clauseType, fill) => {
        expect(contrast(getReadableTextColor(fill), fill)).toBeGreaterThanOrEqual(4.5);
    });

    it('falls back to white for fills it cannot measure', () => {
        expect(getReadableTextColor('rgba(0, 0, 0, 0.5)')).toBe('#ffffff');
    });

    it('draws the badge label in the readable colour instead of always white', () => {
        const panel = showPanel({ clauseType: 'on', sqlClause: 'a.id = b.id' });
        expect(panel.innerHTML).toContain(`background: ${CONDITION_COLORS.on};`);
        expect(panel.innerHTML).toContain(`color: ${getReadableTextColor(CONDITION_COLORS.on)};`);
        expect(panel.innerHTML).not.toContain('color: white;');
    });

    it('names the close button for screen readers', () => {
        const panel = showPanel({ clauseType: 'join' });
        expect(panel.innerHTML).toContain('class="clause-panel-close-btn" type="button" aria-label="Close SQL clause details"');
    });

    it('reserves room for the close button so a short popup does not draw it over the heading', () => {
        const panel = showPanel({ clauseType: 'where', sqlClause: 'a = 1' });
        expect(panel.innerHTML).toContain('margin-bottom: 12px; padding-right: 28px;');
    });

    it('sits at the requested bottom offset and defaults to the panel baseline', () => {
        const panel = showPanel({ clauseType: 'join' });
        expect(panel.style.cssText).toContain('bottom: 16px;');
        // The popup element is reused, so showing it again restyles the same panel.
        showPanel({ clauseType: 'join' }, 108);
        expect(panel.style.cssText).toContain('bottom: 108px;');
    });

    it('moves with the stats and hints panels when the legend bar changes height', () => {
        const clausePanel = { style: {} as Record<string, string> };
        const bottom = applyPanelBottomOffsets({ clausePanel: clausePanel as unknown as HTMLElement }, 92, 760);
        expect(bottom).toBe(108);
        expect(clausePanel.style.bottom).toBe('108px');
    });
});
