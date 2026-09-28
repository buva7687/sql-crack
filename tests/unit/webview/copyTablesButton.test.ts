/**
 * The Query Stats "Copy" button shows "Copied!" for two seconds. A second
 * click inside that window used to capture the "Copied!" markup as the label
 * to restore, leaving the button stuck on "Copied!".
 */

import { updateStatsPanelContent } from '../../../src/webview/panels/infoPanel';

function createCopyButton() {
    const listeners = new Map<string, (event: unknown) => unknown>();
    return {
        innerHTML: '<svg></svg> Copy',
        style: {} as Record<string, string>,
        getAttribute: (name: string) => (name === 'data-tables' ? 'orders, customers' : null),
        addEventListener: (type: string, handler: (event: unknown) => unknown) => listeners.set(type, handler),
        click: () => listeners.get('click')!({ stopPropagation: () => undefined }),
    };
}

describe('Query Stats copy-tables button', () => {
    const originalNavigator = (global as { navigator?: unknown }).navigator;

    afterEach(() => {
        jest.useRealTimers();
        Object.defineProperty(global, 'navigator', { value: originalNavigator, configurable: true });
    });

    it('returns to its idle label after repeated clicks', async () => {
        jest.useFakeTimers();
        const writeText = jest.fn(() => Promise.resolve());
        Object.defineProperty(global, 'navigator', { value: { clipboard: { writeText } }, configurable: true });

        const copyBtn = createCopyButton();
        const statsPanel = {
            innerHTML: '',
            querySelector: (selector: string) => (selector === '#copy-tables-btn' ? copyBtn : null),
            querySelectorAll: () => [],
        };

        updateStatsPanelContent({
            statsPanel: statsPanel as unknown as HTMLDivElement,
            currentStats: {
                tables: 2, joins: 1, subqueries: 0, ctes: 0, aggregations: 0, windowFunctions: 0,
                unions: 0, conditions: 1, complexity: 'Simple', complexityScore: 3,
            } as never,
            currentTableUsage: new Map([['orders', 1], ['customers', 1]]),
            isDarkTheme: true,
            statsMinimized: false,
            setStatsMinimized: jest.fn(),
            escapeHtml: (text: string) => text,
            onNavigateToTable: jest.fn(),
            onRequestRerender: jest.fn(),
        });

        await copyBtn.click();
        expect(copyBtn.innerHTML).toContain('Copied!');

        jest.advanceTimersByTime(1000);
        await copyBtn.click();
        expect(copyBtn.innerHTML).toContain('Copied!');

        // The first click's timer must not restore early, and the second must
        // restore the idle label rather than "Copied!".
        jest.advanceTimersByTime(1500);
        expect(copyBtn.innerHTML).toContain('Copied!');
        jest.advanceTimersByTime(500);
        expect(copyBtn.innerHTML).toBe('<svg></svg> Copy');
        expect(writeText).toHaveBeenCalledTimes(2);
    });
});
