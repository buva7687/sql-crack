import { ImpactView } from '../../../../src/workspace/ui/impactView';
import { getWebviewStyles } from '../../../../src/workspace/ui/sharedStyles';

describe('ImpactView severity badge styling', () => {
    it('renders class-based severity badges without inline colors', () => {
        const view = new ImpactView();
        const html = view.generateSeverityBadge('critical');

        expect(html).toContain('class="severity-badge severity-critical"');
        expect(html).toContain('CRITICAL IMPACT');
        expect(html).not.toContain('style=');
        expect(html).not.toContain('#dc2626');
    });

    it('defines theme-token severity badge classes in shared styles', () => {
        const css = getWebviewStyles(true);

        expect(css).toContain('.severity-badge.severity-critical');
        expect(css).toContain('background: var(--error);');
        expect(css).toContain('.severity-badge.severity-high');
        expect(css).toContain('background: var(--warning);');
        expect(css).toContain('.severity-badge.severity-medium');
        expect(css).toContain('background: var(--success);');
        expect(css).toContain('.severity-badge.severity-low');
        expect(css).toContain('background: var(--text-dim);');
    });
});
