import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
const root = join(__dirname, '../..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
it('ships every walkthrough illustration rather than referring to excluded demo media', () => {
    const ignored = readFileSync(join(root, '.vscodeignore'), 'utf8');
    for (const step of manifest.contributes.walkthroughs[0].steps) {
        expect(existsSync(join(root, step.media.image))).toBe(true);
        expect(ignored.split('\n')).not.toContain(step.media.image);
    }
});
it('activates custom extensions at startup and declares Restricted Mode support', () => {
    expect(manifest.activationEvents).toContain('onStartupFinished');
    expect(manifest.capabilities.untrustedWorkspaces.supported).toBe(true);
    expect(manifest.devDependencies['@types/vscode']).toBe('1.85.0');
});
it('keeps install/test/build outside the credential-bearing publication job', () => {
    const workflow = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8');
    const build = workflow.split('  build:')[1].split('  release:')[0];
    const publication = workflow.split('  release:')[1];
    expect(build).not.toContain('secrets.');
    expect(build).toContain('contents: read');
    expect(publication).not.toContain('npm ci');
    expect(publication).not.toContain('npm run package');
    expect(publication).toContain('target_commitish: ${{ needs.check.outputs.checkout_ref }}');
    expect(publication).toContain('actions/download-artifact');
});

it('provides a square PNG listing icon and discovery metadata', () => {
    const png = readFileSync(join(root, manifest.icon));
    expect(png.readUInt32BE(16)).toBe(128);
    expect(png.readUInt32BE(20)).toBe(128);
    expect(manifest.bugs.url).toContain('sql-crack/issues');
    expect(manifest.homepage).toContain('sql-crack');
    expect(manifest.galleryBanner.color).toBeTruthy();
});
