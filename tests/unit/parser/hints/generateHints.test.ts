import { createFreshContext } from '../../../../src/webview/parser/context';
import { generateHints } from '../../../../src/webview/parser/hints/generateHints';

describe('generateHints', () => {
    it('returns without mutating hints when no statement is provided', () => {
        const context = createFreshContext('MySQL');

        generateHints(context, null);

        expect(context.hints).toEqual([]);
    });

    it('emits SELECT performance hints for star projections and missing LIMIT', () => {
        const context = createFreshContext('MySQL');
        context.hasSelectStar = true;
        context.hasNoLimit = true;
        context.stats.tables = 1;

        generateHints(context, { type: 'select' });

        expect(context.hints).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'warning',
                message: 'SELECT * detected',
                severity: 'medium',
            }),
            expect.objectContaining({
                type: 'info',
                message: 'No LIMIT clause',
                severity: 'low',
            }),
        ]));
    });

    it('warns about destructive writes without WHERE clauses', () => {
        for (const statementType of ['update', 'delete']) {
            const context = createFreshContext('MySQL');

            generateHints(context, { type: statementType });

            expect(context.hints).toContainEqual(expect.objectContaining({
                type: 'error',
                message: `${statementType.toUpperCase()} without WHERE clause`,
                severity: 'high',
            }));
        }
    });

    it('emits complexity hints for many joins, subqueries, and Cartesian products', () => {
        const context = createFreshContext('MySQL');
        context.stats.tables = 2;
        context.stats.joins = 6;
        context.stats.subqueries = 4;
        context.stats.conditions = 0;

        generateHints(context, { type: 'select' });

        expect(context.hints).toEqual(expect.arrayContaining([
            expect.objectContaining({
                message: 'High number of JOINs (6)',
                severity: 'medium',
            }),
            expect.objectContaining({
                message: 'Multiple subqueries detected (4)',
                severity: 'medium',
            }),
        ]));
        expect(context.hints.some((hint) => hint.message === 'Possible Cartesian product')).toBe(false);

        context.stats.joins = 0;
        context.hints = [];
        generateHints(context, { type: 'select' });

        expect(context.hints).toContainEqual(expect.objectContaining({
            type: 'error',
            message: 'Possible Cartesian product',
            severity: 'high',
        }));
    });
});
