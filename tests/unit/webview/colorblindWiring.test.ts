import { readFileSync } from 'fs';
import { join } from 'path';

describe('colorblind mode wiring', () => {
    const rendererSource = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');
    const edgeRendererSource = readFileSync(join(__dirname, '../../../src/webview/rendering/edgeRenderer.ts'), 'utf8');
    const panelSource = readFileSync(join(__dirname, '../../../src/visualizationPanel.ts'), 'utf8');
    const packageJson = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'));

    it('wires renderer colorblind mode updates without forcing a full graph re-render', () => {
        expect(rendererSource).toContain('function applyColorblindModeToRenderedGraph()');
        expect(rendererSource).toContain('export function setColorblindMode(mode: ColorblindMode): void');
        expect(rendererSource).toContain('applyColorblindModeToRenderedGraph();');

        const setColorblindMatch = rendererSource.match(/export function setColorblindMode\([\s\S]*?\n}\n/);
        expect(setColorblindMatch?.[0]).toBeDefined();
        expect(setColorblindMatch?.[0]).not.toContain('render(');
    });

    it('adds dash-pattern encoding for edge types in edge renderer', () => {
        expect(edgeRendererSource).toContain('getEdgeDashPattern(edge.clauseType)');
        expect(edgeRendererSource).toContain("path.setAttribute('stroke-dasharray', dashPattern);");
    });

    it('injects colorblind mode config into webview bootstrap script', () => {
        expect(panelSource).toContain("const colorblindMode = config.get<string>('colorblindMode') || 'off';");
        expect(panelSource).toContain('window.colorblindMode =');
    });

    it('registers sqlCrack.colorblindMode setting in package configuration', () => {
        expect(packageJson.contributes.configuration.properties['sqlCrack.colorblindMode']).toBeDefined();
        expect(packageJson.contributes.configuration.properties['sqlCrack.colorblindMode'].enum).toEqual([
            'off',
            'deuteranopia',
            'protanopia',
            'tritanopia',
        ]);
    });
});
