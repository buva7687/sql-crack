import { getWorkspaceRequestStateScriptFragment } from '../../../../src/workspace/ui/scripts/requestState';
import { getMessageHandlingScriptFragment } from '../../../../src/workspace/ui/scripts/messageHandling';
import { getViewModeScriptFragment } from '../../../../src/workspace/ui/scripts/viewMode';
import { getLineageGraphScriptFragment } from '../../../../src/workspace/ui/scripts/lineageGraph';

function namedFunction(script: string, name: string): string {
    const start = script.indexOf(`function ${name}(`);
    if (start < 0) { throw new Error(`Missing function: ${name}`); }
    let depth = 0;
    let end = script.indexOf('{', start);
    for (; end < script.length; end++) {
        if (script[end] === '{') { depth++; }
        if (script[end] === '}' && --depth === 0) { break; }
    }
    return script.slice(start, end + 1);
}

function navigation(initialView = 'impact') {
    let messageHandler: (event: unknown) => void = () => undefined;
    const posts: Array<{ command: string; requestId?: number }> = [];
    const impactResults = { innerHTML: '', style: { display: 'none' } };
    let html = '';
    const content = {
        get innerHTML() { return html; },
        set innerHTML(value: string) { html = value; impactResults.innerHTML = ''; impactResults.style.display = 'none'; },
    };
    const documentStub = {
        getElementById: (id: string) => id === 'impact-results' && content.innerHTML.includes('id="impact-results"') ? impactResults : null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({ innerHTML: '', content: { querySelectorAll: () => [] } }),
    };
    const runtime = new Function('document', 'window', 'vscode', 'initialView', 'lineageContent', `
        let currentViewMode = initialView, lineageDetailView = false;
        let lineageSetupInProgress = false, pendingLineageGraphMessage = null;
        const viewTabs = [], viewStates = {}, navStack = [], viewEmptyStates = {};
        const viewTitles = { lineage: 'Data Lineage', impact: 'Impact Analysis' };
        const lineagePanel = null, graphArea = null, graphModeSwitcher = null, graphContextStrip = null, lineageTitle = null;
        const svg = null, mainGroup = null, prefersReducedMotion = true;
        const selectionDetails = null, selectionEdgeDetails = null, selectionCrossLinks = null, selectionEmpty = null;
        let navigationOriginLabel = '', navigationOriginType = '';
        function saveCurrentViewState() {} function restoreViewState() {}
        function updateSidebarSectionsForView() {} function updateBackButtonText() {} function updateWorkspaceBreadcrumb() {}
        function setupVisualLineageSearch() {} function setupImpactForm() {} function setupImpactSummaryDetails() {} function persistImpactResult() {}
        function processLineageGraphResult(message) { setSafeHtml(lineageContent, message.data.html); lineageDetailView = true; }
        ${getWorkspaceRequestStateScriptFragment()}
        ${namedFunction(getViewModeScriptFragment(), 'restoreWorkspaceViewRoot')}
        ${namedFunction(getViewModeScriptFragment(), 'switchToView')}
        ${namedFunction(getLineageGraphScriptFragment(), 'finishLineageSetup')}
        ${getMessageHandlingScriptFragment()}
        return {
            request: (command) => postWorkspaceMessage({ command }),
            navigate: switchToView,
            back: restoreWorkspaceViewRoot,
            read: () => ({ view: currentViewMode, html: lineageContent.innerHTML, detail: lineageDetailView }),
            startSetup: () => { lineageSetupInProgress = true; },
            finishSetup: finishLineageSetup
        };
    `)(documentStub, { addEventListener: (_type: string, handler: typeof messageHandler) => { messageHandler = handler; } }, { postMessage: (message: typeof posts[number]) => posts.push(message) }, initialView, content);
    return {
        ...runtime,
        posts,
        readImpactResults: () => ({ ...impactResults, style: { ...impactResults.style } }),
        respond: (command: string, requestId: number | undefined, html: string) => messageHandler({ data: { command, data: { requestId, html } } }),
    };
}

describe('async Workspace navigation', () => {
    it('keeps the Impact form when context-menu analysis starts before the form response arrives', () => {
        const ui = navigation('lineage');
        ui.navigate('impact');
        const formId = ui.posts[ui.posts.length - 1].requestId;
        const reportId = ui.request('analyzeImpact');
        const form = '<div>IMPACT FORM<div id="impact-results"></div></div>';

        ui.respond('impactFormResult', formId, form);
        expect(ui.read().html).toBe(form);
        ui.respond('impactResult', reportId, 'REPORT');
        expect(ui.read()).toEqual({ view: 'impact', html: form, detail: true });
        expect(ui.readImpactResults()).toEqual({ innerHTML: 'REPORT', style: { display: 'block' } });

        const nextReportId = ui.request('analyzeImpact');
        ui.respond('impactResult', nextReportId, 'UPDATED REPORT');
        expect(ui.read().html).toBe(form);
        expect(ui.readImpactResults().innerHTML).toBe('UPDATED REPORT');
    });

    it('does not replace Lineage with an Impact report requested before the tab switch', () => {
        const ui = navigation();
        const impactId = ui.request('analyzeImpact');
        ui.navigate('lineage');
        ui.respond('lineageOverviewResult', ui.posts[ui.posts.length - 1].requestId, 'LINEAGE');
        ui.respond('impactResult', impactId, 'OLD IMPACT');
        expect(ui.read()).toEqual({ view: 'lineage', html: 'LINEAGE', detail: false });
    });

    it('rejects both Impact responses from a previous visit after leaving and returning', () => {
        const ui = navigation('lineage');
        ui.navigate('impact');
        const oldFormId = ui.posts[ui.posts.length - 1].requestId;
        const oldReportId = ui.request('analyzeImpact');
        ui.navigate('lineage');
        ui.navigate('impact');
        const currentFormId = ui.posts[ui.posts.length - 1].requestId;

        ui.respond('impactFormResult', currentFormId, 'CURRENT FORM');
        ui.respond('impactFormResult', oldFormId, 'OLD FORM');
        ui.respond('impactResult', oldReportId, 'OLD REPORT');
        expect(ui.read()).toEqual({ view: 'impact', html: 'CURRENT FORM', detail: false });
    });

    it('still accepts a cached report returned by the current Impact view request', () => {
        const ui = navigation('lineage');
        ui.navigate('impact');
        ui.respond('impactResult', ui.posts[ui.posts.length - 1].requestId, 'CACHED REPORT');
        expect(ui.read()).toEqual({ view: 'impact', html: 'CACHED REPORT', detail: true });
    });

    it('does not replace Impact with a late Lineage graph or a legacy untagged Lineage response', () => {
        const ui = navigation('lineage');
        const graphId = ui.request('getLineageGraph');
        ui.navigate('impact');
        ui.respond('impactFormResult', ui.posts[ui.posts.length - 1].requestId, 'IMPACT FORM');
        ui.respond('lineageGraphResult', graphId, 'OLD GRAPH');
        ui.respond('lineageGraphResult', undefined, 'LEGACY GRAPH');
        expect(ui.read()).toEqual({ view: 'impact', html: 'IMPACT FORM', detail: false });
    });

    it('does not reopen a detail graph after navigating back to the Lineage overview', () => {
        const ui = navigation('lineage');
        const graphId = ui.request('getLineageGraph');
        ui.respond('lineageGraphResult', graphId, 'DETAIL');
        ui.back();
        ui.respond('lineageOverviewResult', ui.posts[ui.posts.length - 1].requestId, 'OVERVIEW');
        ui.respond('lineageGraphResult', graphId, 'OLD DETAIL');
        expect(ui.read()).toEqual({ view: 'lineage', html: 'OVERVIEW', detail: false });
    });

    it('rechecks queued graphs after newer navigation has replaced the shared content', () => {
        const ui = navigation('lineage');
        const graphId = ui.request('getLineageGraph');
        ui.startSetup();
        ui.respond('lineageGraphResult', graphId, 'QUEUED DETAIL');
        ui.back();
        ui.respond('lineageOverviewResult', ui.posts[ui.posts.length - 1].requestId, 'OVERVIEW');
        ui.finishSetup();
        expect(ui.read()).toEqual({ view: 'lineage', html: 'OVERVIEW', detail: false });
    });

    it('invalidates a request when leaving its view even if the return does not make another request', () => {
        const ui = navigation();
        const impactId = ui.request('analyzeImpact');
        ui.navigate('graph');
        ui.navigate('impact', true);
        const before = ui.read();
        ui.respond('impactResult', impactId, 'OLD REPORT');
        expect(ui.read()).toEqual(before);
    });

    it('still renders the latest report for the active Impact view', () => {
        const ui = navigation();
        const oldId = ui.request('analyzeImpact');
        const latestId = ui.request('analyzeImpact');
        ui.respond('impactResult', latestId, 'LATEST REPORT');
        ui.respond('impactResult', oldId, 'OLD REPORT');
        expect(ui.read()).toEqual({ view: 'impact', html: 'LATEST REPORT', detail: true });
    });

    it('drops delayed requests from an inactive view without invalidating the active response', () => {
        const ui = navigation();
        const impactId = ui.request('analyzeImpact');
        expect(ui.request('exploreTable')).toBeUndefined();
        expect(ui.posts).toHaveLength(1);
        ui.respond('impactResult', impactId, 'CURRENT REPORT');
        expect(ui.read()).toEqual({ view: 'impact', html: 'CURRENT REPORT', detail: true });
    });
});
