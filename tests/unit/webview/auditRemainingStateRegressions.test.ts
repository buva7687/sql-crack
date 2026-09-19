import { readFileSync } from 'fs';
import { join } from 'path';

describe('remaining audit state and lifecycle regressions', () => {
    const indexSource = readFileSync(join(__dirname, '../../../src/webview/index.ts'), 'utf8');
    const rendererSource = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');
    const panelSource = readFileSync(join(__dirname, '../../../src/workspace/workspacePanel.ts'), 'utf8');
    const managerSource = readFileSync(join(__dirname, '../../../src/workspace/indexManager.ts'), 'utf8');
    const referenceExtractorSource = readFileSync(
        join(__dirname, '../../../src/workspace/extraction/referenceExtractor.ts'),
        'utf8'
    );

    it('does not mutate per-query view state while merely capturing persistence', () => {
        const capture = indexSource.match(/function capturePersistedState\(\)[\s\S]*?^}/m)?.[0] || '';
        expect(capture).not.toContain('queryViewStates.set(');
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
        expect(managerSource).toContain('return manager._disposed || cancellationToken?.isCancellationRequested === true;');
        expect(managerSource).toContain('if (this._disposed || !this.index) {return;}');
    });

    it('reuses masked SQL and statement boundaries for reference locations', () => {
        const locationMethod = referenceExtractorSource.match(
            /private findTableReferenceLocation\([\s\S]*?^    }/m
        )?.[0] || '';
        expect(locationMethod).toContain('const cacheHit = this.locationSearchSource === sql;');
        expect(locationMethod).toContain('? this.locationSearchSql');
        expect(locationMethod).toContain('? this.locationStatementBoundaries');
    });
});
