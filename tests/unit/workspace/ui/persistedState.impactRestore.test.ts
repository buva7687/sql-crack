import { getPersistedWorkspaceStateScriptFragment } from '../../../../src/workspace/ui/scripts/persistedState';

type RestoreState = { impact: { hasReport: boolean; html: string | null } };

function loadFragment(savedState: Record<string, unknown>, restoreState: RestoreState) {
    let state = { ...savedState };
    const vscode = {
        getState: () => state,
        setState: (next: Record<string, unknown>) => { state = next; },
    };
    const factory = new Function(
        'vscode',
        'initialWorkspaceRestoreState',
        `${getPersistedWorkspaceStateScriptFragment()}\nreturn { getPersistedImpactResult };`
    );
    const api = factory(vscode, restoreState) as { getPersistedImpactResult: () => { html: string; meta: unknown } };
    return { api, getState: () => state };
}

describe('persisted impact report restore (M12)', () => {
    const saved = {
        workspaceImpactResultHtml: '<div>old report</div>',
        workspaceImpactResultMeta: { target: 'orders' },
    };

    it('drops a saved report when the host no longer holds one (re-index)', () => {
        const { api, getState } = loadFragment(saved, { impact: { hasReport: false, html: null } });

        expect(api.getPersistedImpactResult()).toEqual({ html: '', meta: null });
        expect(getState().workspaceImpactResultHtml).toBeNull();
        expect(getState().workspaceImpactResultMeta).toBeNull();
    });

    it('restores the saved report while the host still holds it', () => {
        const { api } = loadFragment(saved, { impact: { hasReport: true, html: '<div>host report</div>' } });

        expect(api.getPersistedImpactResult()).toEqual({
            html: '<div>old report</div>',
            meta: { target: 'orders' },
        });
    });
});
