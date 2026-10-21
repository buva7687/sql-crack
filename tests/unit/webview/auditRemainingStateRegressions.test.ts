import { readTextFile } from '../../helpers/readTextFile';
import { join } from 'path';

describe('remaining audit state and lifecycle regressions', () => {
    const indexSource = readTextFile(join(__dirname, '../../../src/webview/index.ts'), 'utf8');
    const rendererSource = readTextFile(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');
    const panelSource = readTextFile(join(__dirname, '../../../src/workspace/workspacePanel.ts'), 'utf8');
    const managerSource = readTextFile(join(__dirname, '../../../src/workspace/indexManager.ts'), 'utf8');
    const referenceExtractorSource = readTextFile(
        join(__dirname, '../../../src/workspace/extraction/referenceExtractor.ts'),
        'utf8'
    );
    const workspaceCommandBarSource = readTextFile(
        join(__dirname, '../../../src/workspace/ui/scripts/workspaceCommandBar.ts'),
        'utf8'
    );

    it('preserves interaction state only when reparsing the same document and query', () => {
        const visualize = indexSource.slice(indexSource.indexOf('async function visualize('), indexSource.indexOf('function clampQueryIndex('));
        expect(visualize).toContain('batchResult !== null && renderedDocumentKey === documentKeyForParse');
        expect(visualize).toContain('renderCurrentQuery(preserveInteractionState)');
        const renderCurrent = indexSource.slice(indexSource.indexOf('function renderCurrentQuery('), indexSource.indexOf('async function switchToQueryIndex('));
        expect(renderCurrent).toContain('preserveInteractionState && renderedQueryIndex === currentQueryIndex');
    });

    it('does not mutate per-query view state while merely capturing persistence', () => {
        const capture = indexSource.match(/function capturePersistedState\(\)[\s\S]*?^}/m)?.[0] || '';
        expect(capture).not.toContain('queryViewStates.set(');
        expect(capture).toContain('persistedQueryViewStates.set(renderedQueryIndex, getViewState())');
    });

    it('does not overwrite query zero while restoring another initial query', () => {
        expect(indexSource).toContain('switchToQueryIndex(targetIndex, { skipSaveCurrent: true })');
        expect(indexSource).toContain('if (!options.skipSaveCurrent)');
    });

    it('restores persisted history after the requested layout completes', () => {
        expect(indexSource).toContain('recordHistory: false, onComplete: restoreHistory');
        expect(rendererSource).toContain('options.onComplete?.();');
    });

    it('clears transient graph UI on error and empty renders', () => {
        const earlyReturnArea = rendererSource.slice(
            rendererSource.indexOf('if (result.error)'),
            rendererSource.indexOf('// Store column flows')
        );
        expect(earlyReturnArea.match(/hideTooltip\(\);/g)).toHaveLength(2);
        expect(earlyReturnArea.match(/hideContextMenu\(\);/g)).toHaveLength(2);
        expect(earlyReturnArea.match(/updateMinimap\(\);/g)).toHaveLength(2);
    });

    it('coalesces concurrent panel build requests into one progress operation', () => {
        expect(panelSource).toContain('if (this._indexBuildPromise)');
        expect(panelSource).toContain('const buildPromise = this.runIndexBuildWithProgress();');
    });

    it('cancels and suppresses persistence from disposed index managers', () => {
        expect(managerSource).toContain('return isManagerDisposed() || cancellationToken?.isCancellationRequested === true;');
        expect(managerSource).toContain('if ((!allowDisposed && this._disposed) || !this.index) {return;}');
        expect(panelSource).toContain('const flushPromise = this._indexManager.flushPersist();');
        expect(panelSource.indexOf('const flushPromise = this._indexManager.flushPersist();'))
            .toBeLessThan(panelSource.indexOf('this._indexManager.dispose();'));
    });

    it('limits restored-dialect reparsing to one explicit override attempt', () => {
        expect(indexSource).toContain('let dialectResyncAttempted = false;');
        expect(indexSource).toContain('state.userExplicitlySetDialect\n        && !dialectResyncAttempted');
        expect(indexSource).toContain('dialectResyncAttempted = true;');
    });

    it('records the live viewport for the query that is actually rendered', () => {
        expect(indexSource).toContain('let renderedQueryIndex = 0;');
        expect(indexSource).toContain('renderedQueryIndex = currentQueryIndex;');
    });

    it('keeps batch navigation inactive for editable controls', () => {
        expect(indexSource).toContain("activeElement?.tagName === 'SELECT'");
        expect(indexSource).toContain('activeElement?.isContentEditable');
    });

    it('uses physical key codes for macOS-safe Alt shortcuts', () => {
        expect(workspaceCommandBarSource).toContain("event.code === 'KeyK'");
    });

    it('discards only the failed statement before regex fallback', () => {
        const catchBlock = referenceExtractorSource.slice(
            referenceExtractorSource.indexOf('} catch (error) {'),
            referenceExtractorSource.indexOf('// MERGE remains unsupported')
        );
        expect(catchBlock).toContain('references.length = referenceStart;');
        expect(catchBlock).toContain('parsedStatements.length = parsedStart;');
    });

    it('reuses masked SQL and statement boundaries for reference locations', () => {
        const locationMethod = referenceExtractorSource.match(
            /private findTableReferenceLocation\([\s\S]*?^\s{4}}/m
        )?.[0] || '';
        expect(locationMethod).toContain('const cacheHit = this.locationSearchSource === sql;');
        expect(locationMethod).toContain('? this.locationSearchSql');
        expect(locationMethod).toContain('? this.locationStatementBoundaries');
    });
});
