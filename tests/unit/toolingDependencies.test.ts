import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const { loadNycConfig } = require('@istanbuljs/load-nyc-config') as {
    loadNycConfig: (options: { cwd: string; nycrcPath: string }) => Promise<Record<string, unknown>>;
};

describe('coverage YAML configuration', () => {
    let directory: string;

    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'sql-crack-nyc-'));
        writeFileSync(join(directory, 'package.json'), '{}');
    });

    afterEach(() => {
        rmSync(directory, { recursive: true, force: true });
    });

    it('rejects legacy JavaScript tags when loading coverage configuration', async () => {
        writeFileSync(join(directory, '.nycrc.yml'), 'exclude: !!js/regexp /private/\n');

        await expect(loadNycConfig({ cwd: directory, nycrcPath: '.nycrc.yml' }))
            .rejects.toThrow(/unknown tag/);
    });

    it('loads inherited YAML settings and normalizes coverage file patterns', async () => {
        writeFileSync(join(directory, 'base.yml'), 'exclude: "**/vendor/**"\ncheck-coverage: true\n');
        writeFileSync(join(directory, '.nycrc.yml'),
            'extends: ./base.yml\ninclude: "src/**/*.ts"\nextension: .ts\n');

        await expect(loadNycConfig({ cwd: directory, nycrcPath: '.nycrc.yml' }))
            .resolves.toMatchObject({
                cwd: directory,
                exclude: ['**/vendor/**'],
                checkCoverage: true,
                include: ['src/**/*.ts'],
                extension: ['.ts'],
            });
    });
});
