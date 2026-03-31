import { readFileSync } from 'fs';
import { join } from 'path';

describe('settings docs audit', () => {
    it('clarifies layout vs direction and normalization details in contributed settings', () => {
        const packageJson = JSON.parse(
            readFileSync(join(__dirname, '../../package.json'), 'utf8')
        );
        const properties = packageJson?.contributes?.configuration?.properties ?? {};

        expect(properties['sqlCrack.defaultLayout']?.description).toContain('initial arrangement of nodes only');
        expect(properties['sqlCrack.defaultLayout']?.description).toContain('does not change SQL execution order or lineage direction');
        expect(properties['sqlCrack.gridStyle']?.description).toContain('Aesthetic only');
        expect(properties['sqlCrack.nodeAccentPosition']?.description).toContain('Visual-only');
        expect(properties['sqlCrack.showMinimap']?.description).toContain('multi-node graphs');
        expect(properties['sqlCrack.additionalFileExtensions']?.markdownDescription).toContain('With or without the leading dot is accepted and normalized');
        expect(properties['sqlCrack.advanced.cacheTTLHours']?.description).toContain('skip cached restore and force a rebuild');
    });

    it('documents the shipped advanced settings surface in the README', () => {
        const readme = readFileSync(join(__dirname, '../../README.md'), 'utf8');

        expect(readme).toContain('| `sqlCrack.advanced.workspaceUxInstrumentation` | `false` |');
        expect(readme).toContain('Layout only; it does not change SQL execution semantics or lineage direction.');
        expect(readme).toContain('With or without the leading dot is accepted and normalized.');
        expect(readme).toContain('skips cached restore and forces a rebuild when opening Workspace Dependencies');
    });
});
