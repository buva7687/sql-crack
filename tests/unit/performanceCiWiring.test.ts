import { readFileSync } from 'fs';
import { join } from 'path';

describe('performance CI wiring', () => {
    const packageJsonSource = readFileSync(join(__dirname, '../../package.json'), 'utf8');
    const packageJson = JSON.parse(packageJsonSource) as {
        scripts?: Record<string, string>;
    };
    const testWorkflowSource = readFileSync(join(__dirname, '../../.github/workflows/test.yml'), 'utf8');
    const releaseWorkflowSource = readFileSync(join(__dirname, '../../.github/workflows/release.yml'), 'utf8');
    const releaseConfig = JSON.parse(
        readFileSync(join(__dirname, '../../release.config.json'), 'utf8')
    ) as { channel?: string; candidateFor?: string };

    it('keeps the perf gate out of default Jest runs and exposes a dedicated script', () => {
        const perfIgnorePatterns = [
            'testPathIgnorePatterns=/tests/benchmark/',
            'testPathIgnorePatterns=/tests/webview/perfBaseline.test.ts',
        ];

        for (const scriptName of ['test', 'test:watch', 'test:coverage', 'test:ci']) {
            const script = packageJson.scripts?.[scriptName] || '';
            for (const pattern of perfIgnorePatterns) {
                expect(script).toContain(pattern);
            }
        }

        expect(packageJson.scripts?.['test:perf']).toBe(
            'node scripts/runJest.js --sql-crack-expose-gc --runInBand --runTestsByPath tests/benchmark/ciParsePerformance.test.ts tests/benchmark/workspaceReferencePerformance.test.ts tests/webview/perfBaseline.test.ts'
        );
    });

    it('runs the perf gate in pull-request CI and release validation', () => {
        expect(testWorkflowSource).toContain('Run parse performance gate');
        expect(testWorkflowSource).toContain('npm run test:perf');
        expect(releaseWorkflowSource).toContain('Run performance gate');
        expect(releaseWorkflowSource).toContain('npm run test:perf');
    });

    it('measures retained parser memory with garbage collection enabled', () => {
        const runnerSource = readFileSync(join(__dirname, '../../scripts/runJest.js'), 'utf8');

        expect(runnerSource).toContain("const exposeGcFlag = '--sql-crack-expose-gc';");
        expect(runnerSource).toContain("exposeGc ? ['--expose-gc'] : []");
    });

    it('gates release packaging on a production dependency audit', () => {
        expect(packageJson.scripts?.['audit:prod']).toBe(
            'npm audit --omit=dev --audit-level=moderate'
        );

        const auditIndex = releaseWorkflowSource.indexOf('npm run audit:prod');
        const packageIndex = releaseWorkflowSource.indexOf('npm run package');
        const publishIndex = releaseWorkflowSource.indexOf('@vscode/vsce@3.9.2 publish');

        expect(auditIndex).toBeGreaterThan(-1);
        expect(packageIndex).toBeGreaterThan(auditIndex);
        expect(publishIndex).toBeGreaterThan(auditIndex);
    });

    it('serializes release attempts and tags before external registry publishes', () => {
        const concurrencyIndex = releaseWorkflowSource.indexOf('concurrency:');
        const releaseGroupIndex = releaseWorkflowSource.indexOf('group: release-${{ github.workflow }}');
        const cancelInProgressIndex = releaseWorkflowSource.indexOf('cancel-in-progress: false');
        const packageVsixIndex = releaseWorkflowSource.indexOf('@vscode/vsce@3.9.2 package');
        const githubReleaseIndex = releaseWorkflowSource.indexOf('uses: softprops/action-gh-release@v2');
        const marketplacePublishIndex = releaseWorkflowSource.indexOf('@vscode/vsce@3.9.2 publish');
        const openVsxPublishIndex = releaseWorkflowSource.indexOf('ovsx@1.2.0 publish');

        expect(concurrencyIndex).toBeGreaterThan(-1);
        expect(releaseGroupIndex).toBeGreaterThan(concurrencyIndex);
        expect(cancelInProgressIndex).toBeGreaterThan(releaseGroupIndex);
        expect(packageVsixIndex).toBeGreaterThan(-1);
        expect(githubReleaseIndex).toBeGreaterThan(packageVsixIndex);
        expect(marketplacePublishIndex).toBeGreaterThan(githubReleaseIndex);
        expect(openVsxPublishIndex).toBeGreaterThan(githubReleaseIndex);
    });

    it('supports targeted publication retries from the exact existing tag', () => {
        expect(releaseWorkflowSource).toContain('release_target:');
        expect(releaseWorkflowSource).toContain('- github-release');
        expect(releaseWorkflowSource).toContain('- vscode-marketplace');
        expect(releaseWorkflowSource).toContain('- open-vsx');
        expect(releaseWorkflowSource).toContain('git rev-parse "refs/tags/v$VERSION"');
        expect(releaseWorkflowSource).toContain('REQUESTED_VERSION: ${{ github.event.inputs.version }}');
        expect(releaseWorkflowSource).not.toContain('REQUESTED_VERSION="${{ github.event.inputs.version }}"');
        expect(releaseWorkflowSource).toContain('Invalid release version: $VERSION');
        expect(releaseWorkflowSource).toContain('checkout_ref=refs/tags/v$VERSION');
        expect(releaseWorkflowSource).toContain('ref: ${{ needs.check.outputs.checkout_ref }}');
        expect(releaseWorkflowSource).toContain('does not match requested release $VERSION');
        expect(releaseWorkflowSource).toContain("env.RELEASE_MODE == 'github-release'");
        expect(releaseWorkflowSource).toContain("env.RELEASE_MODE == 'vscode-marketplace'");
        expect(releaseWorkflowSource).toContain("env.RELEASE_MODE == 'open-vsx'");
    });

    it('publishes 0.9.4 as a reproducible 1.0 pre-release candidate', () => {
        expect(releaseConfig).toEqual({ channel: 'pre-release', candidateFor: '1.0.0' });
        expect(releaseWorkflowSource).toContain('release_channel: ${{ steps.check.outputs.release_channel }}');
        expect(releaseWorkflowSource).toContain('RELEASE_CHANNEL: ${{ needs.check.outputs.release_channel }}');
        expect(releaseWorkflowSource).toContain('PRERELEASE_ARGS+=(--pre-release)');
        expect(releaseWorkflowSource).toContain("prerelease: ${{ env.RELEASE_CHANNEL == 'pre-release' }}");
        expect(releaseWorkflowSource).toContain('@vscode/vsce@3.9.2 package');
        expect(releaseWorkflowSource).toContain('@vscode/vsce@3.9.2 publish');
        expect(releaseWorkflowSource).toContain('ovsx@1.2.0 publish');
        expect(releaseWorkflowSource).toContain('node-version: 22.x');
        expect(testWorkflowSource).toContain('node-version: [20.x, 22.x]');
        expect(testWorkflowSource).not.toContain('18.x');
    });
});
