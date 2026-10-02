import { readFileSync } from 'fs';
import { join } from 'path';

const { hasDatedReleaseEntry } = require('../../scripts/validateReleaseChangelog') as {
    hasDatedReleaseEntry: (changelog: string, version: string) => boolean;
};

describe('release changelog date gate', () => {
    it('accepts a real date for the exact release version', () => {
        expect(hasDatedReleaseEntry('## [Unreleased]\n\n## [0.9.4] - 2026-09-22\n', '0.9.4')).toBe(true);
    });

    it.each([
        '## [0.9.4] - Unreleased',
        '## [0.9.3] - 2026-09-22',
        '## [0.9.4] - 2026-02-30',
        '## [0.9.4] - 2026-9-22',
    ])('rejects an undated, mismatched, or invalid release heading: %s', heading => {
        expect(hasDatedReleaseEntry(`${heading}\n`, '0.9.4')).toBe(false);
    });

    it('runs the gate before packaging or publication', () => {
        const workflow = readFileSync(join(__dirname, '../../.github/workflows/release.yml'), 'utf8');
        const gate = workflow.indexOf('node scripts/validateReleaseChangelog.js "$VERSION"');
        expect(gate).toBeGreaterThan(-1);
        expect(gate).toBeLessThan(workflow.indexOf('npm run package'));
        expect(gate).toBeLessThan(workflow.indexOf('softprops/action-gh-release@v2'));
    });
});
