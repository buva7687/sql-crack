import { readFileSync } from 'fs';
import { join } from 'path';

describe('canvas accessibility metadata', () => {
    const source = readFileSync(join(__dirname, '../../../src/webview/rendering/canvasSetup.ts'), 'utf8');

    it('marks the main SVG as an image with a descriptive label', () => {
        expect(source).toContain("svg.setAttribute('role', 'img');");
        expect(source).toContain("svg.setAttribute('aria-label', 'SQL query flow diagram');");
    });
});
