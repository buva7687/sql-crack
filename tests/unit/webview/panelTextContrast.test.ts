import { updateDetailsPanelContent, updateHintsPanelContent, updateStatsPanelContent } from '../../../src/webview/panels/infoPanel';
import { setHighContrastMode } from '../../../src/webview/constants';
import { createFakeElement, installFakeDocument, uninstallFakeDocument } from '../../helpers/fakeDom';
import type { FlowNode } from '../../../src/webview/types';

function luminance(hex: string): number {
    const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
}

function labelColor(html: string, label: string): string {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const style = html.match(new RegExp(`<(?:span|div) style="([^"]*)">\\s*${escapedLabel}\\s*</(?:span|div)>`))?.[1];
    expect(style).toBeDefined();
    const color = style!.match(/(?:^|;)\s*color:\s*(#[\da-f]+)/i)?.[1];
    expect(color).toBeDefined();
    return color!;
}

describe('rendered panel text contrast', () => {
    beforeEach(() => installFakeDocument());
    afterEach(() => {
        setHighContrastMode(false);
        uninstallFakeDocument();
    });

    it.each([[false, false], [true, false], [false, true], [true, true]])('keeps severity labels readable (high contrast: %s, dark: %s)', (highContrast, isDarkTheme) => {
        setHighContrastMode(highContrast);
        const panel = createFakeElement('div');
        updateHintsPanelContent({
            hintsPanel: panel as unknown as HTMLDivElement,
            currentHints: [
                { type: 'info', message: 'Informational hint', severity: 'low' },
                { type: 'warning', message: 'Warning hint', severity: 'medium' },
                { type: 'error', message: 'Error hint', severity: 'high' },
            ],
            currentNodes: [], isDarkTheme, panelBottom: 16, hintsMinimized: false,
            hintsShowAll: false, setHintsMinimized: jest.fn(), setHintsShowAll: jest.fn(),
            escapeHtml: text => text, onSelectNode: jest.fn(), onExecuteHintAction: jest.fn(),
            onRequestRerender: jest.fn(), onSyncViewportBounds: jest.fn(),
        });
        // Hint tints composited over the corresponding panel surface.
        expect(contrast(labelColor(panel.innerHTML, 'low'), isDarkTheme ? '#151c28' : '#ebf3fe')).toBeGreaterThanOrEqual(highContrast ? 7 : 4.5);
        expect(contrast(labelColor(panel.innerHTML, 'medium'), isDarkTheme ? '#282011' : '#fef5e7')).toBeGreaterThanOrEqual(highContrast ? 7 : 4.5);
        expect(contrast(labelColor(panel.innerHTML, 'high'), isDarkTheme ? '#281717' : '#fdecec')).toBeGreaterThanOrEqual(highContrast ? 7 : 4.5);
    });

    it.each([[false, false], [true, false], [false, true], [true, true]])('keeps function badges readable (high contrast: %s, dark: %s)', (highContrast, isDarkTheme) => {
        setHighContrastMode(highContrast);
        const panel = createFakeElement('div');
        updateStatsPanelContent({
            statsPanel: panel as unknown as HTMLDivElement,
            currentStats: {
                tables: 1, joins: 0, conditions: 0, ctes: 0, subqueries: 0,
                complexity: 'Simple', complexityScore: 1, aggregations: 1, windowFunctions: 1, unions: 0,
                functionsUsed: [
                    { name: 'SUM', category: 'aggregate' },
                    { name: 'RANK', category: 'window' },
                    { name: 'UNNEST', category: 'tvf' },
                ],
            },
            currentTableUsage: new Map(), isDarkTheme, statsMinimized: false,
            setStatsMinimized: jest.fn(), escapeHtml: text => text,
            onNavigateToTable: jest.fn(), onRequestRerender: jest.fn(),
        });
        expect(contrast(labelColor(panel.innerHTML, 'SUM'), isDarkTheme ? '#3f2d14' : '#fef0da')).toBeGreaterThanOrEqual(highContrast ? 7 : 4.5);
        expect(contrast(labelColor(panel.innerHTML, 'RANK'), isDarkTheme ? '#291f3f' : '#eee7fd')).toBeGreaterThanOrEqual(highContrast ? 7 : 4.5);
        expect(contrast(labelColor(panel.innerHTML, 'UNNEST'), isDarkTheme ? '#103329' : '#dbf5ec')).toBeGreaterThanOrEqual(highContrast ? 7 : 4.5);
    });

    it.each([false, true])('keeps amber function text readable in light node details (high contrast: %s)', highContrast => {
        setHighContrastMode(highContrast);
        const panel = createFakeElement('div');
        const node: FlowNode = {
            id: 'aggregate', type: 'aggregate', label: 'Aggregate', x: 0, y: 0, width: 100, height: 60,
            aggregateDetails: { functions: [{ name: 'SUM', expression: 'SUM(total)' }] },
            windowDetails: { functions: [{ name: 'RANK' }] },
        };
        updateDetailsPanelContent({
            detailsPanel: panel as unknown as HTMLDivElement, nodeId: node.id,
            currentNodes: [node], currentColumnFlows: [], isDarkTheme: false,
            escapeHtml: text => text, getNodeVisualIcon: () => '',
            ensureDetailsPanelExpanded: jest.fn(), onSelectNode: jest.fn(), onToggleColumnFlows: jest.fn(),
        });
        for (const label of ['SUM(total)', 'RANK()']) {
            expect(contrast(labelColor(panel.innerHTML, label), '#f5f6f6')).toBeGreaterThanOrEqual(highContrast ? 7 : 4.5);
        }
    });
});
