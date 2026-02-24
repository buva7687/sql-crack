import { readFileSync } from 'fs';
import { join } from 'path';

describe('canvas accessibility metadata', () => {
    const source = readFileSync(join(__dirname, '../../../src/webview/rendering/canvasSetup.ts'), 'utf8');

    it('keeps the main SVG keyboard-focusable with a descriptive label', () => {
        expect(source).toContain("svg.setAttribute('tabindex', '0');");
        expect(source).toContain("svg.setAttribute('aria-label', 'SQL query flow diagram');");
        expect(source).not.toContain("svg.setAttribute('role', 'img');");
    });
});
