import { getIssuesScript } from '../../../../src/workspace/ui/clientScripts';

describe('issues view script navigation', () => {
    it('wires summary-card navigation to section targets with hash sync and flash state', () => {
        const script = getIssuesScript('test');

        expect(script).toContain("document.querySelectorAll('[data-scroll-target]')");
        expect(script).toContain('navigateToIssuesSection(targetId, true);');
        expect(script).toContain("window.history.replaceState(null, '', '#' + targetId);");
        expect(script).toContain("section.classList.add('issues-section-flash');");
        expect(script).toContain('section.scrollIntoView({ behavior: \'smooth\', block: \'start\' });');
    });

    it('wires sticky back-to-top visibility and click behavior', () => {
        const script = getIssuesScript('test');

        expect(script).toContain("const backToTopBtn = document.getElementById('issues-back-to-top');");
        expect(script).toContain('function getIssuesScrollElement()');
        expect(script).toContain('function getIssuesScrollTop()');
        expect(script).toContain('if (getIssuesScrollTop() > backToTopThreshold)');
        expect(script).toContain("backToTopBtn.classList.add('is-visible');");
        expect(script).toContain("window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });");
        expect(script).toContain("document.addEventListener('scroll', updateBackToTopVisibility, { passive: true, capture: true });");
        expect(script).toContain('function scrollIssuesToTop()');
        expect(script).toContain('document.documentElement.scrollTop = 0;');
        expect(script).toContain('document.body.scrollTop = 0;');
        expect(script).toContain("event.preventDefault();");
        expect(script).toContain('scrollIssuesToTop();');
    });

    it('restores deep-linked section navigation from location hash on load', () => {
        const script = getIssuesScript('test');

        expect(script).toContain('const initialTargetId = window.location.hash ? window.location.hash.slice(1) : \'\';');
        expect(script).toContain('window.setTimeout(() => {');
        expect(script).toContain('navigateToIssuesSection(initialTargetId, false);');
        expect(script).toContain('updateBackToTopVisibility();');
    });

    it('wires "show in graph" buttons to route back to graph with a prefilled query', () => {
        const script = getIssuesScript('test');

        expect(script).toContain("document.querySelectorAll('.show-in-graph-btn')");
        expect(script).toContain("const query = btn.getAttribute('data-show-graph-query') || '';");
        expect(script).toContain("const nodeType = btn.getAttribute('data-show-graph-type') || undefined;");
        expect(script).toContain("vscode.postMessage({ command: 'showInGraph', query, nodeType });");
    });
});
