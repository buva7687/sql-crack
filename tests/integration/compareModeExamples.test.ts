import * as fs from 'fs';
import * as path from 'path';
import { parseSql } from '../../src/webview/sqlParser';

describe('Compare Mode examples', () => {
    it('includes scalar subquery source tables in KPI before flow', () => {
        const sqlPath = path.join(__dirname, '../../examples/compare-mode-kpi-before.sql');
        const sql = fs.readFileSync(sqlPath, 'utf-8');

        const result = parseSql(sql, 'MySQL');

        expect(result.error).toBeUndefined();

        const tableNodes = result.nodes.filter(node => node.type === 'table');
        const tableLabels = tableNodes.map(node => node.label.toLowerCase());
        expect(tableLabels).toEqual(expect.arrayContaining([
            'warehouses',
            'shipments',
            'returns',
            'carriers'
        ]));

        const selectNode = result.nodes.find(node => node.type === 'select');
        expect(selectNode).toBeDefined();
        const subquerySourceEdges = result.edges.filter(edge =>
            edge.target === selectNode?.id && edge.sqlClause === 'SELECT subquery source'
        );
        expect(subquerySourceEdges.length).toBeGreaterThanOrEqual(3);
    });
});
