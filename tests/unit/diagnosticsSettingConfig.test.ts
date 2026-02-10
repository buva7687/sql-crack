import { readFileSync } from 'fs';
import { join } from 'path';

describe('diagnostics problems setting config', () => {
    it('registers showDiagnosticsInProblems with default false', () => {
        const packageJson = JSON.parse(
            readFileSync(join(__dirname, '../../package.json'), 'utf8')
        );

        const setting = packageJson?.contributes?.configuration?.properties?.['sqlCrack.advanced.showDiagnosticsInProblems'];
        expect(setting).toBeDefined();
        expect(setting.type).toBe('boolean');
        expect(setting.default).toBe(false);
    });
});
