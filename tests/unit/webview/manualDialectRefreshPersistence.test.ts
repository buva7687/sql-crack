import { readFileSync } from 'fs';
import { join } from 'path';

describe('manual dialect refresh persistence', () => {
    const source = readFileSync(join(__dirname, '../../../src/webview/index.ts'), 'utf8');

    it('marks toolbar dialect changes as explicit user overrides', () => {
        const start = source.indexOf('function setDialectAndVisualize');
        const end = source.indexOf('function getSuggestedDialectFromMessage', start);
        const body = source.slice(start, end);

        expect(body).toContain('userExplicitlySetDialect = true;');
        expect(body).toContain('currentDialect = dialect;');
    });

    it('keeps explicit dialect overrides across refreshes', () => {
        const start = source.indexOf('function handleRefresh');
        const end = source.indexOf('function handleSwitchToQuery', start);
        const body = source.slice(start, end);

        expect(body).toContain('if (!userExplicitlySetDialect)');
        expect(body).toContain('currentDialect = options.dialect as SqlDialect;');
        expect(body).not.toContain('userExplicitlySetDialect = false;');
        expect(body).toContain('dialectSelect.value = currentDialect;');
    });
});
