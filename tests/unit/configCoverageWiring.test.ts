import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';

describe('config and coverage wiring', () => {
    const repoRoot = join(__dirname, '../..');
    const requireFromTest = createRequire(__filename);

    it('enables recommended ESLint presets and avoids deprecated TypeScript semi rule', () => {
        const eslintConfig = JSON.parse(
            readFileSync(join(repoRoot, '.eslintrc.json'), 'utf8')
        ) as {
            extends?: string[];
            rules?: Record<string, unknown>;
        };

        expect(eslintConfig.extends).toEqual(expect.arrayContaining([
            'eslint:recommended',
            'plugin:@typescript-eslint/recommended',
        ]));
        expect(eslintConfig.rules).not.toHaveProperty('@typescript-eslint/semi');
        expect(eslintConfig.rules?.semi).toEqual(['warn', 'always']);
    });

    it('keeps webview UI and workspacePanel in Jest coverage collection', () => {
        const jestConfig = requireFromTest(join(repoRoot, 'jest.config.js')) as {
            collectCoverageFrom?: string[];
        };
        const coverageGlobs = jestConfig.collectCoverageFrom || [];

        expect(coverageGlobs).toContain('src/**/*.ts');
        expect(coverageGlobs).not.toContain('!src/webview/ui/**');
        expect(coverageGlobs).not.toContain('!src/workspace/workspacePanel.ts');
    });
});
