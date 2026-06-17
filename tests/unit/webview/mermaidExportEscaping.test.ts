/**
 * Source-reading guard for Mermaid export escaping. The Mermaid generator lives
 * in a DOM-heavy module (renderer/export dependencies) that can't be imported
 * directly under Jest, so we assert on the escaper's source. It must encode
 * quotes and the shape-delimiter brackets as HTML numeric entities and collapse
 * backslashes / line breaks, instead of dropping quotes or leaving brackets raw.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('Mermaid export label escaping', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/webview/features/export.ts'),
        'utf8'
    );

    function escaperBody(): string {
        const start = source.indexOf('function escapeMermaidLabel');
        expect(start).toBeGreaterThan(-1);
        const end = source.indexOf('\n}', start);
        return source.slice(start, end);
    }

    it('encodes quotes and brackets as HTML numeric entities', () => {
        const body = escaperBody();
        expect(body).toContain("replace(/\"/g, '#34;')");
        expect(body).toContain("replace(/\\[/g, '#91;')");
        expect(body).toContain("replace(/\\]/g, '#93;')");
        expect(body).toContain("replace(/\\(/g, '#40;')");
        expect(body).toContain("replace(/\\)/g, '#41;')");
        expect(body).toContain("replace(/\\{/g, '#123;')");
        expect(body).toContain("replace(/\\}/g, '#125;')");
    });

    it('collapses backslashes and line breaks to spaces', () => {
        const body = escaperBody();
        expect(body).toContain("replace(/\\\\/g, ' ')");
        expect(body).toContain("replace(/\\r?\\n/g, ' ')");
    });

    it('no longer drops double quotes by converting them to apostrophes', () => {
        const body = escaperBody();
        expect(body).not.toContain("replace(/\"/g, \"'\")");
    });

    it('truncates the raw label before escaping so entities are not cut', () => {
        const body = escaperBody();
        const truncateIdx = body.indexOf('.substring(0, 50)');
        const firstEntityIdx = body.indexOf("'#34;'");
        expect(truncateIdx).toBeGreaterThan(-1);
        expect(firstEntityIdx).toBeGreaterThan(-1);
        expect(truncateIdx).toBeLessThan(firstEntityIdx);
    });
});
