import * as fs from 'fs';
import * as path from 'path';

describe('graphSvg tooltip content generation', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '../../../../src/workspace/panel/graphSvg.ts'),
        'utf-8'
    );

    it('truncates definitions list at 5 with overflow message', () => {
        // getNodeTooltipContent shows first 5 definitions, then "...and N more"
        expect(source).toContain('.definitions.slice(0, 5)');
        expect(source).toContain('definitions.length > 5');
        expect(source).toContain('...and ${node.definitions.length - 5} more');
    });

    it('truncates references list at 5 with overflow message', () => {
        expect(source).toContain('.references.slice(0, 5)');
        expect(source).toContain('references.length > 5');
        expect(source).toContain('...and ${node.references.length - 5} more tables');
    });

    it('shows column list in reference tooltips with truncation at 8', () => {
        expect(source).toContain('.columns.slice(0, 8)');
        expect(source).toContain('columns.length - 8');
    });

    it('shows external node warning', () => {
        expect(source).toContain("node.type === 'external'");
        expect(source).toContain('Not defined in workspace');
    });

    it('shows file path for file-type nodes', () => {
        expect(source).toContain("node.type === 'file'");
        expect(source).toContain('node.filePath');
    });

    it('shows upstream and downstream connection counts', () => {
        expect(source).toContain('upstream');
        expect(source).toContain('downstream');
        expect(source).toContain('function buildNodeConnectionCounts');
        expect(source).toContain('const connectionCounts = nodeConnectionCounts.get(node.id)');
        expect(source).not.toMatch(/edges\.filter\(e\s*=>\s*e\.target\s*===\s*node\.id\)/);
    });

    it('escapes node label in tooltip title', () => {
        expect(source).toContain('escapeHtml(node.label)');
    });

    it('escapes table name in reference list', () => {
        expect(source).toContain('escapeHtml(ref.tableName)');
    });

    it('escapes file path in tooltip', () => {
        expect(source).toContain('escapeHtml(node.filePath)');
    });
});
