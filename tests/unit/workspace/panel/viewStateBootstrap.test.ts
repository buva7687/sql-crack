import { buildWorkspaceInitialRestoreState } from '../../../../src/workspace/panel/viewStateBootstrap';

describe('workspace viewState bootstrap', () => {
    it('omits impact html when no cached report exists', () => {
        const state = buildWorkspaceInitialRestoreState({
            currentImpactReport: null,
            impactView: {
                generateImpactReport: jest.fn(),
            } as any,
        });

        expect(state).toEqual({
            impact: {
                hasReport: false,
                html: null,
            },
        });
    });

    it('hydrates impact html when a cached report exists', () => {
        const report = {
            changeType: 'modify',
            target: { type: 'table', name: 'orders' },
            severity: 'low',
            summary: { totalAffected: 0, tablesAffected: 0, viewsAffected: 0, queriesAffected: 0, filesAffected: 0 },
            directImpacts: [],
            transitiveImpacts: [],
            suggestions: [],
        };
        const impactView = {
            generateImpactReport: jest.fn(() => '<div>impact-report</div>'),
        };

        const state = buildWorkspaceInitialRestoreState({
            currentImpactReport: report as any,
            impactView: impactView as any,
        });

        expect(impactView.generateImpactReport).toHaveBeenCalledWith(report);
        expect(state).toEqual({
            impact: {
                hasReport: true,
                html: '<div>impact-report</div>',
            },
        });
    });
});
