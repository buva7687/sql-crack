import { readFileSync } from 'fs';
import { join } from 'path';
import {
    emptyLayoutHistory,
    isValidDialect,
    isValidFocusMode,
    isValidLayoutHistorySnapshot,
    isValidLayoutType,
    isValidQueryIndex,
    isValidTabViewState,
    sanitizeLayoutHistory,
    toBoolean,
} from '../../../src/webview/state/persistedViewState';

const readSource = (relPath: string): string =>
    readFileSync(join(__dirname, '../../../', relPath), 'utf8');

/**
 * Persisted UI state is read back from workspaceState on disk. These guards are
 * the trust boundary: a corrupt scale reaches the SVG transform via restore /
 * undo-redo, and a NaN query index slips past the range check in
 * performSwitchToQueryIndex because every NaN comparison is false.
 */
describe('persisted view state validation', () => {
    const validGeometry = { scale: 1.5, offsetX: -20, offsetY: 40 };
    const validSnapshot = {
        ...validGeometry,
        selectedNodeId: null,
        focusModeEnabled: false,
        focusMode: 'all',
        layoutType: 'vertical',
        nodePositions: [{ id: 'n1', x: 10, y: 20 }],
        cloudOffsets: [{ nodeId: 'n1', offsetX: 5, offsetY: -5 }],
    };

    describe('isValidTabViewState', () => {
        it('accepts finite geometry with a positive scale', () => {
            expect(isValidTabViewState(validGeometry)).toBe(true);
        });

        it.each([
            ['zero scale', { ...validGeometry, scale: 0 }],
            ['negative scale', { ...validGeometry, scale: -1 }],
            ['NaN scale', { ...validGeometry, scale: NaN }],
            ['Infinity scale', { ...validGeometry, scale: Infinity }],
            ['NaN offsetX', { ...validGeometry, offsetX: NaN }],
            ['NaN offsetY', { ...validGeometry, offsetY: NaN }],
            ['string scale', { ...validGeometry, scale: '2' }],
            ['missing scale', { offsetX: 0, offsetY: 0 }],
        ])('rejects %s', (_label, value) => {
            expect(isValidTabViewState(value)).toBe(false);
        });

        it.each([['null', null], ['undefined', undefined], ['number', 5], ['string', 'x']])(
            'rejects non-object %s',
            (_label, value) => {
                expect(isValidTabViewState(value)).toBe(false);
            }
        );
    });

    describe('isValidQueryIndex', () => {
        it('accepts non-negative integers', () => {
            expect(isValidQueryIndex(0)).toBe(true);
            expect(isValidQueryIndex(7)).toBe(true);
        });

        it.each([
            ['NaN', NaN],
            ['negative', -1],
            ['fractional', 1.5],
            ['Infinity', Infinity],
            ['string', '2'],
            ['undefined', undefined],
            ['null', null],
        ])('rejects %s', (_label, value) => {
            expect(isValidQueryIndex(value)).toBe(false);
        });

        it('rejects the NaN that would bypass a naive range guard', () => {
            const queryCount = 5;
            const target = Math.max(0, Math.min(NaN, queryCount - 1));
            // Demonstrates the trap this guard exists to close.
            expect(Number.isNaN(target)).toBe(true);
            expect(target < 0).toBe(false);
            expect(target >= queryCount).toBe(false);
            expect(isValidQueryIndex(target)).toBe(false);
        });
    });

    describe('isValidLayoutHistorySnapshot', () => {
        it('accepts a well-formed snapshot', () => {
            expect(isValidLayoutHistorySnapshot(validSnapshot)).toBe(true);
        });

        it('accepts a string selectedNodeId as well as null', () => {
            expect(isValidLayoutHistorySnapshot({ ...validSnapshot, selectedNodeId: 'node-7' })).toBe(true);
        });

        it.each([
            ['NaN scale', { ...validSnapshot, scale: NaN }],
            ['negative scale', { ...validSnapshot, scale: -1 }],
            ['NaN offsetX', { ...validSnapshot, offsetX: NaN }],
            ['missing nodePositions', { ...validSnapshot, nodePositions: undefined }],
            ['missing cloudOffsets', { ...validSnapshot, cloudOffsets: undefined }],
        ])('rejects %s', (_label, value) => {
            expect(isValidLayoutHistorySnapshot(value)).toBe(false);
        });

        // These throw or write NaN into the DOM if they survive the restore:
        // restoreLayoutHistorySnapshot maps over nodePositions and forEaches
        // cloudOffsets, then applyNodePositionsToDom derives a transform.
        it.each([
            ['null entry', { ...validSnapshot, nodePositions: [null] }],
            ['undefined entry', { ...validSnapshot, nodePositions: [undefined] }],
            ['non-object entry', { ...validSnapshot, nodePositions: ['n1'] }],
            ['missing id', { ...validSnapshot, nodePositions: [{ x: 1, y: 2 }] }],
            ['numeric id', { ...validSnapshot, nodePositions: [{ id: 7, x: 1, y: 2 }] }],
            ['NaN x', { ...validSnapshot, nodePositions: [{ id: 'n1', x: NaN, y: 2 }] }],
            ['NaN y', { ...validSnapshot, nodePositions: [{ id: 'n1', x: 1, y: NaN }] }],
            ['Infinity x', { ...validSnapshot, nodePositions: [{ id: 'n1', x: Infinity, y: 2 }] }],
            ['missing y', { ...validSnapshot, nodePositions: [{ id: 'n1', x: 1 }] }],
            ['string coords', { ...validSnapshot, nodePositions: [{ id: 'n1', x: '1', y: '2' }] }],
            ['one bad among good', {
                ...validSnapshot,
                nodePositions: [{ id: 'a', x: 1, y: 2 }, null, { id: 'b', x: 3, y: 4 }],
            }],
        ])('rejects nodePositions with %s', (_label, value) => {
            expect(isValidLayoutHistorySnapshot(value)).toBe(false);
        });

        it.each([
            ['null entry', { ...validSnapshot, cloudOffsets: [null] }],
            ['missing nodeId', { ...validSnapshot, cloudOffsets: [{ offsetX: 1, offsetY: 2 }] }],
            ['numeric nodeId', { ...validSnapshot, cloudOffsets: [{ nodeId: 3, offsetX: 1, offsetY: 2 }] }],
            ['NaN offsetX', { ...validSnapshot, cloudOffsets: [{ nodeId: 'n1', offsetX: NaN, offsetY: 2 }] }],
            ['NaN offsetY', { ...validSnapshot, cloudOffsets: [{ nodeId: 'n1', offsetX: 1, offsetY: NaN }] }],
            ['-Infinity offsetY', { ...validSnapshot, cloudOffsets: [{ nodeId: 'n1', offsetX: 1, offsetY: -Infinity }] }],
        ])('rejects cloudOffsets with %s', (_label, value) => {
            expect(isValidLayoutHistorySnapshot(value)).toBe(false);
        });

        // Remaining schema fields are assigned onto renderer state by the same
        // restore, so they are validated too.
        it.each([
            ['numeric selectedNodeId', { ...validSnapshot, selectedNodeId: 7 }],
            ['object selectedNodeId', { ...validSnapshot, selectedNodeId: {} }],
            ['missing focusModeEnabled', { ...validSnapshot, focusModeEnabled: undefined }],
            ['non-boolean focusModeEnabled', { ...validSnapshot, focusModeEnabled: 'yes' }],
            ['unknown focusMode', { ...validSnapshot, focusMode: 'sideways' }],
            ['missing focusMode', { ...validSnapshot, focusMode: undefined }],
            ['unknown layoutType', { ...validSnapshot, layoutType: 'spiral' }],
            ['missing layoutType', { ...validSnapshot, layoutType: undefined }],
        ])('rejects %s', (_label, value) => {
            expect(isValidLayoutHistorySnapshot(value)).toBe(false);
        });

        it.each(['vertical', 'horizontal', 'compact', 'force', 'radial'])(
            'accepts layoutType %s',
            (layoutType) => {
                expect(isValidLayoutHistorySnapshot({ ...validSnapshot, layoutType })).toBe(true);
            }
        );

        it.each(['all', 'upstream', 'downstream'])('accepts focusMode %s', (focusMode) => {
            expect(isValidLayoutHistorySnapshot({ ...validSnapshot, focusMode })).toBe(true);
        });
    });

    describe('sanitizeLayoutHistory', () => {
        it('passes through a valid stack', () => {
            const stack = { history: [validSnapshot], index: 0 };
            expect(sanitizeLayoutHistory(stack)).toBe(stack);
        });

        it('accepts an empty stack at index -1', () => {
            expect(sanitizeLayoutHistory({ history: [], index: -1 })).not.toBeNull();
        });

        it('rejects the whole stack when any frame is malformed', () => {
            const stack = { history: [validSnapshot, { ...validSnapshot, scale: NaN }], index: 1 };
            expect(sanitizeLayoutHistory(stack)).toBeNull();
        });

        it.each([
            ['index past the end', { history: [validSnapshot], index: 1 }],
            ['index below -1', { history: [validSnapshot], index: -2 }],
            ['NaN index', { history: [validSnapshot], index: NaN }],
            ['fractional index', { history: [validSnapshot], index: 0.5 }],
            ['missing history', { index: 0 }],
            ['history not an array', { history: 'nope', index: 0 }],
        ])('rejects %s', (_label, value) => {
            expect(sanitizeLayoutHistory(value)).toBeNull();
        });

        it('provides a usable empty fallback', () => {
            expect(emptyLayoutHistory()).toEqual({ history: [], index: -1 });
            expect(sanitizeLayoutHistory(emptyLayoutHistory())).not.toBeNull();
        });
    });

    describe('top-level schema fields', () => {
        it('accepts every dialect the parser supports', () => {
            const dialects = ['MySQL', 'PostgreSQL', 'TransactSQL', 'MariaDB', 'SQLite', 'Snowflake',
                'BigQuery', 'Hive', 'Redshift', 'Athena', 'Trino', 'Oracle', 'Teradata'];
            for (const dialect of dialects) {
                expect(isValidDialect(dialect)).toBe(true);
            }
        });

        it.each([
            ['a settings-UI alias that is not an internal id', 'SQL Server'],
            ['unknown dialect', 'CockroachDB'],
            ['empty string', ''],
            ['null', null],
            ['number', 3],
        ])('rejects %s', (_label, value) => {
            expect(isValidDialect(value)).toBe(false);
        });

        it('validates layout type and focus mode against their unions', () => {
            expect(isValidLayoutType('radial')).toBe(true);
            expect(isValidLayoutType('spiral')).toBe(false);
            expect(isValidLayoutType(null)).toBe(false);
            expect(isValidFocusMode('upstream')).toBe(true);
            expect(isValidFocusMode('sideways')).toBe(false);
            expect(isValidFocusMode(undefined)).toBe(false);
        });

        it('coerces cosmetic toggles rather than rejecting the record', () => {
            expect(toBoolean(true)).toBe(true);
            expect(toBoolean(false)).toBe(false);
            expect(toBoolean('true')).toBe(false);
            expect(toBoolean(1)).toBe(false);
            expect(toBoolean(undefined)).toBe(false);
            expect(toBoolean(null)).toBe(false);
        });
    });

    /**
     * index.ts and renderer.ts carry DOM dependencies that block a direct Jest
     * import, so these assert the guards stay wired at their call sites.
     */
    describe('restore-path wiring', () => {
        it('parseInitialUiState applies every validator', () => {
            const source = readSource('src/webview/index.ts');
            expect(source).toContain("from './state/persistedViewState'");
            expect(source).toContain('if (!isValidTabViewState(candidate.renderer.viewState))');
            expect(source).toContain('if (!isValidQueryIndex(candidate.currentQueryIndex))');
            expect(source).toContain('sanitizeLayoutHistory(sanitized.renderer.layoutHistory)');
            expect(source).toContain('isValidTabViewState(entry?.viewState)');
            expect(source).toContain('isValidDialect(candidate.currentDialect)');
            expect(source).toContain('isValidLayoutType(candidate.renderer.layout)');
            expect(source).toContain('isValidFocusMode(candidate.renderer.focusMode)');
        });

        it('coerces every persisted boolean toggle', () => {
            const source = readSource('src/webview/index.ts');
            for (const field of [
                'sanitized.userExplicitlySetDialect',
                'sanitized.compareModeActive',
                'sanitized.renderer.legendVisible',
                'sanitized.renderer.hintsVisible',
                'sanitized.renderer.sqlPreviewVisible',
                'sanitized.renderer.columnFlowsVisible',
                'sanitized.renderer.focusModeEnabled',
            ]) {
                expect(source).toContain(`${field} = toBoolean(${field})`);
            }
        });

        it('performSwitchToQueryIndex rejects a non-integer index', () => {
            const source = readSource('src/webview/index.ts');
            expect(source).toContain('!Number.isInteger(newIndex)');
        });

        it('keeps initial state pending while re-parsing with the restored dialect', () => {
            const source = readSource('src/webview/index.ts');
            const functionBody = source.match(
                /async function applyInitialUiStateIfAvailable\(\): Promise<void> \{[\s\S]*?\n}\n/
            )?.[0];
            expect(functionBody).toBeDefined();
            expect(functionBody!.indexOf('applyInitialStatePending = false;'))
                .toBeGreaterThan(functionBody!.indexOf('state.currentDialect !== lastParsedDialect'));
            expect(functionBody!.indexOf('applyInitialStatePending = false;'))
                .toBeGreaterThan(functionBody!.indexOf('void visualize(sql);'));
        });

        it('updateTransform sanitizes geometry before writing the SVG transform', () => {
            const source = readSource('src/webview/renderer.ts');
            expect(source).toContain('function sanitizeViewportGeometry(): void');
            expect(source).toMatch(/function updateTransform\(\): void \{\s*sanitizeViewportGeometry\(\);/);
        });

        it('getViewportBounds clamps a non-positive or non-finite scale', () => {
            const source = readSource('src/webview/virtualization.ts');
            expect(source).toContain('const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;');
            expect(source).not.toMatch(/const minX = -offsetX \/ scale;/);
        });
    });
});
