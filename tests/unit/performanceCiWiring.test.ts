import { readFileSync } from 'fs';
import { join } from 'path';

describe('performance CI wiring', () => {
    const packageJsonSource = readFileSync(join(__dirname, '../../package.json'), 'utf8');
    const packageJson = JSON.parse(packageJsonSource) as {
        scripts?: Record<string, string>;
    };
    const testWorkflowSource = readFileSync(join(__dirname, '../../.github/workflows/test.yml'), 'utf8');
    const releaseWorkflowSource = readFileSync(join(__dirname, '../../.github/workflows/release.yml'), 'utf8');

    it('keeps the perf gate out of default Jest runs and exposes a dedicated script', () => {
        const perfIgnorePatterns = [
            'testPathIgnorePatterns=/tests/benchmark/ciParsePerformance.test.ts',
            'testPathIgnorePatterns=/tests/webview/perfBaseline.test.ts',
        ];

        for (const scriptName of ['test', 'test:watch', 'test:coverage', 'test:ci']) {
            const script = packageJson.scripts?.[scriptName] || '';
            for (const pattern of perfIgnorePatterns) {
                expect(script).toContain(pattern);
            }
        }

        expect(packageJson.scripts?.['test:perf']).toBe(
            'node scripts/runJest.js --runInBand --runTestsByPath tests/benchmark/ciParsePerformance.test.ts tests/webview/perfBaseline.test.ts'
        );
    });

    it('runs the perf gate in pull-request CI and release validation', () => {
        expect(testWorkflowSource).toContain('Run parse performance gate');
        expect(testWorkflowSource).toContain('npm run test:perf');
        expect(releaseWorkflowSource).toContain('Run performance gate');
        expect(releaseWorkflowSource).toContain('npm run test:perf');
    });

    it('gates release packaging on a production dependency audit', () => {
        expect(packageJson.scripts?.['audit:prod']).toBe(
            'npm audit --omit=dev --audit-level=moderate'
        );

        const auditIndex = releaseWorkflowSource.indexOf('npm run audit:prod');
        const packageIndex = releaseWorkflowSource.indexOf('npm run package');
        const publishIndex = releaseWorkflowSource.indexOf('npx @vscode/vsce publish');

        expect(auditIndex).toBeGreaterThan(-1);
        expect(packageIndex).toBeGreaterThan(auditIndex);
        expect(publishIndex).toBeGreaterThan(auditIndex);
    });

    it('serializes release attempts and tags before external registry publishes', () => {
        const concurrencyIndex = releaseWorkflowSource.indexOf('concurrency:');
        const releaseGroupIndex = releaseWorkflowSource.indexOf('group: release-${{ github.workflow }}');
        const cancelInProgressIndex = releaseWorkflowSource.indexOf('cancel-in-progress: false');
        const packageVsixIndex = releaseWorkflowSource.indexOf('npx @vscode/vsce package');
        const githubReleaseIndex = releaseWorkflowSource.indexOf('uses: softprops/action-gh-release@v2');
        const marketplacePublishIndex = releaseWorkflowSource.indexOf('npx @vscode/vsce publish');
        const openVsxPublishIndex = releaseWorkflowSource.indexOf('npx ovsx publish');

        expect(concurrencyIndex).toBeGreaterThan(-1);
        expect(releaseGroupIndex).toBeGreaterThan(concurrencyIndex);
        expect(cancelInProgressIndex).toBeGreaterThan(releaseGroupIndex);
        expect(packageVsixIndex).toBeGreaterThan(-1);
        expect(githubReleaseIndex).toBeGreaterThan(packageVsixIndex);
        expect(marketplacePublishIndex).toBeGreaterThan(githubReleaseIndex);
        expect(openVsxPublishIndex).toBeGreaterThan(githubReleaseIndex);
    });
});
