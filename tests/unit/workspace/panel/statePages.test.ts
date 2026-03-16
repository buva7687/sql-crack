import {
    createLoadingHtml,
    createManualIndexHtml,
    createEmptyWorkspaceHtml,
    createErrorHtml,
} from '../../../../src/workspace/panel/statePages';

const nonce = 'test-nonce-abc123';

describe('statePages', () => {
    describe('createLoadingHtml', () => {
        it('generates valid HTML with CSP nonce', () => {
            const html = createLoadingHtml({ isDarkTheme: true, nonce });
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain(`nonce-${nonce}`);
        });

        it('includes loading UI elements', () => {
            const html = createLoadingHtml({ isDarkTheme: false, nonce });
            expect(html).toContain('Analyzing Workspace');
            expect(html).toContain('Scanning SQL files');
            expect(html).toContain('loader');
        });

        it('works with both dark and light themes', () => {
            const dark = createLoadingHtml({ isDarkTheme: true, nonce });
            const light = createLoadingHtml({ isDarkTheme: false, nonce });
            expect(dark).toBeTruthy();
            expect(light).toBeTruthy();
        });
    });

    describe('createManualIndexHtml', () => {
        it('shows file count', () => {
            const html = createManualIndexHtml({ isDarkTheme: true, nonce, fileCount: 42 });
            expect(html).toContain('42');
            expect(html).toContain('SQL Files Found');
        });

        it('includes start analysis button with event listener', () => {
            const html = createManualIndexHtml({ isDarkTheme: false, nonce, fileCount: 10 });
            expect(html).toContain('Start Analysis');
            expect(html).toContain('manual-refresh-btn');
            expect(html).toContain(`nonce="${nonce}"`);
            // Should not have inline onclick
            expect(html).not.toContain('onclick=');
        });

        it('includes CSP meta tag', () => {
            const html = createManualIndexHtml({ isDarkTheme: true, nonce, fileCount: 5 });
            expect(html).toContain('Content-Security-Policy');
            expect(html).toContain("default-src 'none'");
        });
    });

    describe('createEmptyWorkspaceHtml', () => {
        it('shows empty state guidance', () => {
            const html = createEmptyWorkspaceHtml({ isDarkTheme: true, nonce });
            expect(html).toContain('No SQL Files Found');
            expect(html).toContain('.sql');
            expect(html).toContain('additionalFileExtensions');
        });

        it('includes refresh button', () => {
            const html = createEmptyWorkspaceHtml({ isDarkTheme: false, nonce });
            expect(html).toContain('Refresh');
            expect(html).toContain('empty-refresh-btn');
        });
    });

    describe('createErrorHtml', () => {
        it('escapes HTML in error message', () => {
            const html = createErrorHtml({
                isDarkTheme: true,
                nonce,
                message: '<script>alert("xss")</script>',
                statusLine: 'v0.6.0',
            });
            expect(html).not.toContain('<script>alert');
            expect(html).toContain('&lt;script&gt;');
        });

        it('shows error UI with refresh button', () => {
            const html = createErrorHtml({
                isDarkTheme: false,
                nonce,
                message: 'Index failed',
                statusLine: 'v0.6.0',
            });
            expect(html).toContain('Something went wrong');
            expect(html).toContain('Index failed');
            expect(html).toContain('Refresh Index');
        });

        it('includes optional detail when provided', () => {
            const html = createErrorHtml({
                isDarkTheme: true,
                nonce,
                message: 'Parse error',
                detail: 'Unexpected token at line 5',
                statusLine: 'v0.6.0',
            });
            expect(html).toContain('Unexpected token at line 5');
        });

        it('omits detail section when not provided', () => {
            const html = createErrorHtml({
                isDarkTheme: true,
                nonce,
                message: 'Error',
                statusLine: 'v0.6.0',
            });
            // Should not have the detail div (opacity: 0.7)
            const detailDivCount = (html.match(/opacity: 0\.7/g) || []).length;
            expect(detailDivCount).toBe(0);
        });

        it('escapes HTML in detail and status line', () => {
            const html = createErrorHtml({
                isDarkTheme: true,
                nonce,
                message: 'Error',
                detail: '<img onerror=alert(1)>',
                statusLine: 'v<0.6.0>',
            });
            expect(html).not.toContain('<img onerror');
            expect(html).toContain('&lt;img');
            expect(html).toContain('v&lt;0.6.0&gt;');
        });
    });
});
