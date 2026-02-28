import {
    getJoinColorFeature,
    getJoinDescriptionFeature,
    getJoinVennDiagramFeature,
    getKeyboardShortcutsFeature,
} from '../../../src/webview/features/rendererMetadata';

describe('rendererMetadata feature', () => {
    it('returns the expected keyboard shortcuts for core navigation and search', () => {
        const shortcuts = getKeyboardShortcutsFeature();

        expect(shortcuts).toEqual(expect.arrayContaining([
            { key: 'Ctrl/Cmd + F', description: 'Search nodes' },
            { key: 'F', description: 'Toggle fullscreen' },
            { key: 'E', description: 'Expand/collapse all CTEs & subqueries' },
            { key: '?', description: 'Show all shortcuts' },
        ]));
        expect(shortcuts).toHaveLength(28);
    });

    it('returns theme-aware venn diagrams and sensible fallback join visuals', () => {
        const darkDiagram = getJoinVennDiagramFeature('LEFT OUTER JOIN', true);
        const lightDiagram = getJoinVennDiagramFeature('LEFT OUTER JOIN', false);
        const fallbackDiagram = getJoinVennDiagramFeature('SOME CUSTOM JOIN', true);

        expect(darkDiagram).toContain('stroke="#94a3b8"');
        expect(lightDiagram).toContain('stroke="#475569"');
        expect(darkDiagram).toContain('fill="#2563eb"');
        expect(fallbackDiagram).toContain('fill="#6366f1"');
    });

    it('maps join colors and descriptions by join family', () => {
        expect(getJoinColorFeature('LEFT JOIN')).toBe('#3b82f6');
        expect(getJoinColorFeature('RIGHT OUTER JOIN')).toBe('#f59e0b');
        expect(getJoinColorFeature('FULL JOIN')).toBe('#8b5cf6');
        expect(getJoinColorFeature('CROSS JOIN')).toBe('#ef4444');
        expect(getJoinColorFeature('INNER JOIN')).toBe('#22c55e');
        expect(getJoinColorFeature('CUSTOM JOIN')).toBe('#6366f1');

        expect(getJoinDescriptionFeature('LEFT JOIN')).toContain('left table');
        expect(getJoinDescriptionFeature('RIGHT JOIN')).toContain('right table');
        expect(getJoinDescriptionFeature('FULL OUTER JOIN')).toContain('both tables');
        expect(getJoinDescriptionFeature('CROSS JOIN')).toContain('Cartesian product');
        expect(getJoinDescriptionFeature('CUSTOM JOIN')).toBe('Combines rows from two tables');
    });
});
