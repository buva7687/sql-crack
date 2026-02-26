import { readFileSync } from 'fs';
import { join } from 'path';

const readSource = (relativePath: string): string =>
    readFileSync(join(__dirname, '../../../', relativePath), 'utf8');

describe('workspace parser boundary adapter', () => {
    it('keeps extraction modules off deep webview parser internals', () => {
        const referenceExtractor = readSource('src/workspace/extraction/referenceExtractor.ts');
        const schemaExtractor = readSource('src/workspace/extraction/schemaExtractor.ts');
        const extractionTypes = readSource('src/workspace/extraction/types.ts');

        expect(referenceExtractor).not.toContain('webview/parser/dialects/preprocessing');
        expect(schemaExtractor).not.toContain('webview/parser/dialects/preprocessing');
        expect(extractionTypes).not.toContain('webview/types/parser');

        expect(referenceExtractor).toContain('../parserConfig');
        expect(schemaExtractor).toContain('../parserConfig');
        expect(extractionTypes).toContain('../parserConfig');
    });

    it('contains the single allowed workspace-to-webview preprocessing import', () => {
        const parserConfig = readSource('src/workspace/parserConfig.ts');

        expect(parserConfig).toContain("from '../webview/parser/dialects/preprocessing'");
    });
});
