import {
    PANEL_LAYOUT_DEFAULTS,
    applyHintsPanelViewportBounds,
    applyPanelBottomOffsets,
    parsePixelValue,
} from '../../../src/webview/ui/panelLayout';

type MockPanel = {
    style: Record<string, string>;
    querySelector: (selector: string) => MockPanel | null;
};

function createMockPanel(hasHintsList = false): { panel: MockPanel; hintsList: MockPanel | null } {
    const hintsList: MockPanel | null = hasHintsList ? {
        style: {},
        querySelector: () => null,
    } : null;

    const panel: MockPanel = {
        style: {},
        querySelector: (selector: string) => (selector === '.hints-list' ? hintsList : null),
    };

    return { panel, hintsList };
}

describe('panel layout dom behavior', () => {
    it('repositions stats and hints panels above legend when legend height grows', () => {
        const { panel: statsPanel } = createMockPanel(false);
        const { panel: hintsPanel, hintsList } = createMockPanel(true);
        expect(hintsList).not.toBeNull();

        const firstBottom = applyPanelBottomOffsets(
            { statsPanel: statsPanel as unknown as HTMLDivElement, hintsPanel: hintsPanel as unknown as HTMLDivElement },
            36,
            760
        );

        expect(firstBottom).toBe(52);
        expect(statsPanel.style.bottom).toBe('52px');
        expect(hintsPanel.style.bottom).toBe('52px');
        expect(hintsPanel.style.maxHeight).toBe('616px');
        expect(hintsList!.style.maxHeight).toBe('520px');

        const secondBottom = applyPanelBottomOffsets(
            { statsPanel: statsPanel as unknown as HTMLDivElement, hintsPanel: hintsPanel as unknown as HTMLDivElement },
            92,
            760
        );

        expect(secondBottom).toBe(108);
        expect(statsPanel.style.bottom).toBe('108px');
        expect(hintsPanel.style.bottom).toBe('108px');
        expect(hintsPanel.style.maxHeight).toBe('560px');
        expect(hintsList!.style.maxHeight).toBe('464px');
    });

    it('clamps hints panel and list heights in small viewports', () => {
        const { panel: hintsPanel, hintsList } = createMockPanel(true);
        expect(hintsList).not.toBeNull();

        applyPanelBottomOffsets(
            { hintsPanel: hintsPanel as unknown as HTMLDivElement },
            80,
            250
        );

        expect(hintsPanel.style.bottom).toBe('96px');
        expect(hintsPanel.style.maxHeight).toBe(`${PANEL_LAYOUT_DEFAULTS.minPanelHeight}px`);
        expect(hintsList!.style.maxHeight).toBe(`${PANEL_LAYOUT_DEFAULTS.minListHeight}px`);
    });

    it('applies viewport bounds safely when hints list is missing and parses fallback pixel values', () => {
        const { panel: hintsPanel } = createMockPanel(false);

        expect(parsePixelValue('108px', 16)).toBe(108);
        expect(parsePixelValue('invalid', 16)).toBe(16);
        expect(parsePixelValue(undefined, 16)).toBe(16);

        applyHintsPanelViewportBounds(
            hintsPanel as unknown as HTMLDivElement,
            108,
            760
        );

        expect(hintsPanel.style.maxHeight).toBe('560px');
    });
});
