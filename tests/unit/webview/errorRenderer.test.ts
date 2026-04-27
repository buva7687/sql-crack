import {
    createFakeElement,
    FakeElement,
    installFakeDocument,
    uninstallFakeDocument,
} from '../../helpers/fakeDom';
import { getErrorGuidanceLines, renderErrorFeature } from '../../../src/webview/ui/errorRenderer';

function createMainGroup(): SVGGElement {
    return createFakeElement('g', 'http://www.w3.org/2000/svg') as unknown as SVGGElement;
}

function getRenderedText(group: SVGGElement): string[] {
    return ((group as unknown as FakeElement).children[0]?.children || [])
        .filter((child) => child.tagName === 'text')
        .map((child) => child.textContent || '');
}

describe('errorRenderer', () => {
    beforeEach(() => installFakeDocument());
    afterEach(() => uninstallFakeDocument());

    it('returns concise guidance lines for badge/tooltips to reuse', () => {
        expect(getErrorGuidanceLines('Query parsing took 5.3s — exceeded 5s timeout')).toEqual([
            'Try visualizing one statement at a time or narrowing the query slice.',
            'If this query is expected, increase SQL Crack › Advanced: Parse Timeout Seconds.',
        ]);
    });

    it('shows actionable timeout guidance', () => {
        const mainGroup = createMainGroup();

        renderErrorFeature({
            mainGroup,
            isDarkTheme: true,
            message: 'Query parsing took 5.3s — exceeded 5s timeout',
        });

        expect(getRenderedText(mainGroup)).toEqual(expect.arrayContaining([
            'Error: Query parsing took 5.3s — exceeded 5s timeout',
            'Try visualizing one statement at a time or narrowing the query slice.',
            'If this query is expected, increase SQL Crack › Advanced: Parse Timeout Seconds.',
        ]));
    });

    it('shows recovery guidance when visualization fallback still fails', () => {
        const mainGroup = createMainGroup();

        renderErrorFeature({
            mainGroup,
            isDarkTheme: false,
            message: 'Failed to recover query visualization',
        });

        expect(getRenderedText(mainGroup)).toEqual(expect.arrayContaining([
            'Error: Failed to recover query visualization',
            'Try switching to the failing statement tab or refresh after narrowing the SQL.',
            'If the SQL uses dialect-specific syntax, try the dialect dropdown in the toolbar.',
        ]));
    });

    it('keeps dialect-switch guidance and source-line context', () => {
        const mainGroup = createMainGroup();

        renderErrorFeature({
            mainGroup,
            isDarkTheme: true,
            message: 'SQL syntax not recognized by MySQL parser. Try PostgreSQL dialect (most compatible).',
            sourceLine: 'SELECT now()::timestamp;',
        });

        expect(getRenderedText(mainGroup)).toEqual(expect.arrayContaining([
            'Error: SQL syntax not recognized by MySQL parser. Try PostgreSQL dialect (most compatible).',
            '→ SELECT now()::timestamp;',
            'Tip: Try PostgreSQL dialect (most compatible).',
            'Change dialect using the dropdown in the top-left toolbar',
        ]));
    });
});
