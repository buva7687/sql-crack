import { readFileSync } from 'fs';
import { join } from 'path';

describe('query stats compact layout', () => {
    const source = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');

    it('renders summary metrics in a single-row flex container', () => {
        expect(source).toContain('id="query-stats-summary-row"');
        expect(source).toContain('display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 8px;');
        expect(source).toContain("{ value: currentStats.ctes, label: currentStats.ctes === 1 ? 'CTE' : 'CTEs' },");
        expect(source).toContain('if (currentStats.subqueries > 0) {');
    });

    it('removes the previous two-row grid/cte block layout', () => {
        expect(source).not.toContain('grid-template-columns: repeat(3, 1fr);');
        expect(source).not.toContain('currentStats.ctes > 0 || currentStats.subqueries > 0');
    });
});
