import { getWorkspaceNodeIcon } from '../../../src/shared/icons';

describe('shared workspace icons', () => {
    it('returns SVG markup for workspace node types', () => {
        const types = ['file', 'table', 'view', 'external', 'cte', 'column'];
        for (const type of types) {
            const icon = getWorkspaceNodeIcon(type);
            expect(icon).toContain('<svg');
            expect(icon).toContain('aria-hidden="true"');
            expect(icon).not.toMatch(/[📄📊👁️🌐🔄📦]/u);
        }
    });
});
