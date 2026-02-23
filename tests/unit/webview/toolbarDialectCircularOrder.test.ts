import { readFileSync } from 'fs';
import { join } from 'path';

describe('toolbar dialect circular ordering', () => {
    const source = readFileSync(join(__dirname, '../../../src/webview/ui/toolbar.ts'), 'utf8');

    it('defines a circular dialect option helper', () => {
        expect(source).toContain('function getCircularDialectOptions(currentDialect: SqlDialect): DialectOption[]');
        expect(source).toContain('DIALECT_OPTIONS.slice(currentIndex).concat(DIALECT_OPTIONS.slice(0, currentIndex))');
    });

    it('renders select options from circular order instead of fixed hardcoded list', () => {
        expect(source).toContain('const dialectOptionsHtml = getCircularDialectOptions(options.currentDialect)');
        expect(source).toContain('${dialectOptionsHtml}');
        expect(source).not.toContain('<option value="MySQL">MySQL</option>');
    });

    it('re-renders circular order after dialect change', () => {
        expect(source).toContain('renderDialectOptions(dialectSelect, selectedDialect);');
        expect(source).toContain('callbacks.onDialectChange(selectedDialect);');
    });
});
