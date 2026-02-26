import { readFileSync } from 'fs';
import { join } from 'path';

const readSource = (relativePath: string): string =>
    readFileSync(join(__dirname, '../../../', relativePath), 'utf8');

describe('webview runtime config contract', () => {
    it('injects typed bootstrap config from visualization panel', () => {
        const panelSource = readSource('src/visualizationPanel.ts');
        expect(panelSource).toContain('window.sqlCrackConfig = {');
        expect(panelSource).toContain('window.initialSqlCode =');
    });

    it('declares typed sqlCrackConfig on Window and uses it for runtime limits', () => {
        const indexSource = readSource('src/webview/index.ts');

        expect(indexSource).toContain('interface SqlCrackWebviewBootstrapConfig');
        expect(indexSource).toContain('sqlCrackConfig?: Partial<SqlCrackWebviewBootstrapConfig>');
        expect(indexSource).toContain('window.sqlCrackConfig?.maxFileSizeKB ?? window.maxFileSizeKB');
        expect(indexSource).toContain('window.sqlCrackConfig?.defaultDialect');
    });

    it('removes renderer reliance on window as any for bootstrap fields', () => {
        const rendererSource = readSource('src/webview/renderer.ts');

        expect(rendererSource).not.toContain('(window as any).colorblindMode');
        expect(rendererSource).not.toContain('(window as any).gridStyle');
        expect(rendererSource).toContain('window.colorblindMode');
        expect(rendererSource).toContain('window.gridStyle');
    });
});
