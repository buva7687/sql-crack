import { Parser } from 'node-sql-parser';
import { analyzePerformance } from '../../../src/webview/performanceAnalyzer';
import type { FlowNode } from '../../../src/webview/types';

function makeJoinNode(id: string, label: string): FlowNode {
    return {
        id,
        type: 'join',
        label,
        x: 0,
        y: 0,
        width: 140,
        height: 60,
    };
}

describe('performance analyzer regressions', () => {
    it('detects early CROSS JOINs from join labels when joinType is absent', () => {
        const result = analyzePerformance(
            { from: [] },
            [
                makeJoinNode('join_cross', 'CROSS JOIN'),
                makeJoinNode('join_inner', 'INNER JOIN'),
            ],
            [],
            new Map()
        );

        expect(result.hints).toEqual(expect.arrayContaining([
            expect.objectContaining({
                message: 'CROSS JOIN appears before other JOINs',
                nodeId: 'join_cross',
            }),
        ]));
    });

    it('handles object-form GROUP BY and COUNT star parser args', () => {
        const ast = new Parser().astify(
            `SELECT a, b, c, d, e, f, COUNT(*)
             FROM sales
             GROUP BY a, b, c, d, e, f`,
            { database: 'MySQL' }
        );

        const result = analyzePerformance(ast, [], [], new Map());

        expect(result.indexSuggestions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                reason: 'group',
                columns: expect.arrayContaining(['a', 'b', 'c', 'd', 'e', 'f']),
            }),
        ]));
        expect(result.hints).toEqual(expect.arrayContaining([
            expect.objectContaining({
                message: 'GROUP BY with 6 columns',
            }),
            expect.objectContaining({
                message: 'Aggregate query without WHERE clause',
            }),
        ]));
    });
});
