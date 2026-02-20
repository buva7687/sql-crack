import { readFileSync } from 'fs';
import { join } from 'path';

describe('package command palette entries', () => {
    const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));

    it('includes visualize command in command palette for sql/sql-like files', () => {
        const entries = packageJson?.contributes?.menus?.commandPalette ?? [];
        const visualize = entries.find((entry: { command?: string }) => entry.command === 'sql-crack.visualize');
        expect(visualize).toEqual(expect.objectContaining({
            command: 'sql-crack.visualize',
            when: 'editorLangId == sql || sqlCrack.isAdditionalSqlFile',
            group: 'navigation',
        }));
    });

    it('keeps analyze workspace command in command palette', () => {
        const entries = packageJson?.contributes?.menus?.commandPalette ?? [];
        expect(entries).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    command: 'sql-crack.analyzeWorkspace',
                }),
            ])
        );
    });

    it('includes workspace UX metrics command in command palette', () => {
        const entries = packageJson?.contributes?.menus?.commandPalette ?? [];
        expect(entries).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    command: 'sql-crack.showWorkspaceUxMetrics',
                    when: 'workspaceFolderCount > 0',
                }),
            ])
        );
    });

    it('includes marketplace keywords for SQL discovery', () => {
        const keywords: string[] = packageJson?.keywords ?? [];
        expect(keywords).toEqual(expect.arrayContaining(['sql', 'visualization', 'lineage', 'database']));
    });

    it('does not keep empty walkthrough media markdown placeholders', () => {
        const walkthroughSteps = packageJson?.contributes?.walkthroughs?.[0]?.steps ?? [];
        walkthroughSteps.forEach((step: { media?: { markdown?: string } }) => {
            expect(step?.media?.markdown).not.toBe('');
        });
    });
});
