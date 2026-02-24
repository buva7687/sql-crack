import { readFileSync } from 'fs';
import { join } from 'path';

describe('audit section 2 performance regression guards', () => {
    it('P2: caches statement line counts instead of repeatedly splitting per loop iteration', () => {
        const source = readFileSync(join(__dirname, '../../src/webview/sqlParser.ts'), 'utf8');
        expect(source).toContain('const stmtLineCount = countLines(stmt);');
        expect(source).toContain('currentLine = stmtStartLine + stmtLineCount;');
        expect(source).not.toContain("stmt.split('\\n').length");
    });

    it('P3/P4: virtualized viewport diffs rendered edges and uses id lookups for drag updates', () => {
        const source = readFileSync(join(__dirname, '../../src/webview/rendering/virtualizedViewport.ts'), 'utf8');
        expect(source).toContain('renderedEdgeIds: Set<string>;');
        expect(source).toContain('const visibleEdgeIds = new Set(result.visibleEdges.map(edge => edge.id));');
        expect(source).toContain('const nodeMap = new Map(nodes.map(candidate => [candidate.id, candidate]));');
        expect(source).not.toContain("edgesGroup.innerHTML = '';");
        expect(source).not.toContain('nodes.find(candidate => candidate.id === sourceId)');
    });

    it('P5/P8/P9/P12: renderer uses pure escaping, debounced legend resize, cloud reset, and avoids innerHTML graph wipes', () => {
        const source = readFileSync(join(__dirname, '../../src/webview/renderer.ts'), 'utf8');
        expect(source).toContain("replace(/&/g, '&amp;')");
        expect(source).toContain('let legendResizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;');
        expect(source).toContain('cloudOffsets.clear();');
        expect(source).toContain('cloudElements.clear();');
        expect(source).toContain('cloudViewStates.clear();');
        expect(source).toContain('clearMainGroupContent();');
        expect(source).not.toContain("mainGroup.innerHTML = '';");
    });

    it('P7: batch rendering supports deferred query hydration to reduce peak in-memory query payloads', () => {
        const source = readFileSync(join(__dirname, '../../src/webview/index.ts'), 'utf8');
        expect(source).toContain('const DEFERRED_QUERY_THRESHOLD = 12;');
        expect(source).toContain('function compactBatchResultMemory(result: BatchParseResult, activeIndex: number): void');
        expect(source).toContain('async function hydrateQueryIfNeeded(queryIndex: number): Promise<void>');
        expect(source).toContain('deferredQueryIndexes.has(newIndex)');
        expect(source).toContain("showGlobalLoading('Loading query details...');");
    });

    it('P11: workspace index updates are debounced and cache-size checks avoid whole-index stringify', () => {
        const source = readFileSync(join(__dirname, '../../src/workspace/indexManager.ts'), 'utf8');
        expect(source).toContain('private schedulePersist(delayMs: number = this._persistDebounceMs): void');
        expect(source).toContain('private estimateSerializedIndexSizeBytes(serializable: SerializedWorkspaceIndex): number');
        expect(source).toContain('this.schedulePersist();');
        expect(source).toContain('const sizeBytes = this.estimateSerializedIndexSizeBytes(serializable);');
        expect(source).not.toContain('const serialized = JSON.stringify(serializable);');
    });

    it('P10: splitter keyword matching uses char-code comparison in inner loops', () => {
        const source = readFileSync(join(__dirname, '../../src/webview/parser/validation/splitting.ts'), 'utf8');
        expect(source).toContain('const upperSourceCode = (sourceCode >= 97 && sourceCode <= 122) ? sourceCode - 32 : sourceCode;');
        expect(source).toContain('if (upperSourceCode !== keyword.charCodeAt(i)) {');
        expect(source).not.toContain('sql.substring(idx, idx + keyword.length).toUpperCase()');
    });
});
