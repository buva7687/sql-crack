import { createBatchTabs, disposeBatchTabs, updateBatchTabs } from '../../../../src/webview/ui/batchTabs';
import { createFakeElement, getElementsOfType, installFakeDocument, uninstallFakeDocument } from '../../../helpers/fakeDom';
import type { BatchParseResult } from '../../../../src/webview/types';

function query(sql: string, extra: Record<string, unknown> = {}) {
    return { sql, nodes: [], edges: [], hints: [], stats: {}, ...extra };
}

describe('batch tabs accessible names', () => {
    beforeEach(() => {
        installFakeDocument();
        Object.assign(global.document, { addEventListener: jest.fn(), removeEventListener: jest.fn() });
    });
    afterEach(() => {
        disposeBatchTabs();
        uninstallFakeDocument();
    });

    it('names glyph buttons and query tabs instead of announcing the glyphs', () => {
        const container = createFakeElement('div');
        const callbacks = { onQuerySelect: jest.fn(), isDarkTheme: () => true };
        createBatchTabs(container as unknown as HTMLElement, callbacks as any);
        const batch = {
            queries: [
                query('SELECT * FROM customers'),
                query('SELECT * FROM orders', { error: 'Unexpected token' }),
                query('SELECT * FROM payments', { partial: true }),
                query('SELEC broken', { partial: true }),
            ],
            totalStats: {},
        } as unknown as BatchParseResult;

        updateBatchTabs(batch, 0, callbacks as any);

        const labels = getElementsOfType('button').map(button => button.getAttribute('aria-label')).filter(Boolean);
        expect(labels).toEqual(expect.arrayContaining([
            'First query',
            'Previous query',
            'Next query',
            'Last query',
        ]));
        const tabLabels = labels.filter(label => /^Q\d+:/.test(label as string));
        expect(tabLabels).toHaveLength(3);
        // An unrecognised statement is named once, not "Q4: Q4".
        expect(labels).toContain('Q4, partial parse');
        expect(tabLabels[0]).toMatch(/^Q1: /);
        expect(tabLabels[1]).toMatch(/^Q2: .*, parse error$/);
        expect(tabLabels[2]).toMatch(/^Q3: .*, partial parse$/);

        const current = getElementsOfType('button').filter(button => button.getAttribute('aria-current') === 'true');
        expect(current).toHaveLength(1);
        expect(current[0].getAttribute('aria-label')).toMatch(/^Q1: /);
    });
});
