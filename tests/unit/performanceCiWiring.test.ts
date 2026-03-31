import { readFileSync } from 'fs';
import { join } from 'path';

describe('performance CI wiring', () => {
    const packageJsonSource = readFileSync(join(__dirname, '../../package.json'), 'utf8');
    const testWorkflowSource = readFileSync(join(__dirname, '../../.github/workflows/test.yml'), 'utf8');
    const releaseWorkflowSource = readFileSync(join(__dirname, '../../.github/workflows/release.yml'), 'utf8');

    it('keeps the perf gate out of default Jest runs and exposes a dedicated script', () => {
        expect(packageJsonSource).toContain('testPathIgnorePatterns=/tests/benchmark/ciParsePerformance.test.ts');
        expect(packageJsonSource).toContain('"test:perf": "node scripts/runJest.js --runInBand --runTestsByPath tests/benchmark/ciParsePerformance.test.ts"');
    });

    it('runs the perf gate in pull-request CI and release validation', () => {
        expect(testWorkflowSource).toContain('Run parse performance gate');
        expect(testWorkflowSource).toContain('npm run test:perf');
        expect(releaseWorkflowSource).toContain('Run performance gate');
        expect(releaseWorkflowSource).toContain('npm run test:perf');
    });
});
