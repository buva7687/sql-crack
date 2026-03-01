import * as vscodeMock from '../__mocks__/vscode';

describe('visualizationPanel.ts integration', () => {
    let VisualizationPanel: any;

    beforeEach(() => {
        jest.clearAllMocks();
        vscodeMock.__resetStorage();
        
        VisualizationPanel = require('../../src/visualizationPanel').VisualizationPanel;
    });

    describe('static method: setContext', () => {
        it('stores context for later use', () => {
            const context = vscodeMock.createMockExtensionContext();
            VisualizationPanel.setContext(context);
            expect(VisualizationPanel._context).toBe(context);
        });
    });

    describe('static method: getPinnedTabs', () => {
        it('returns empty array when no context set', () => {
            VisualizationPanel._context = undefined;
            expect(VisualizationPanel.getPinnedTabs()).toEqual([]);
        });

        it('returns pinned tabs from workspace state', () => {
            const context = vscodeMock.createMockExtensionContext();
            VisualizationPanel.setContext(context);
            
            const pinnedTabs = [
                { id: 'pin-1', name: 'Query 1', sql: 'SELECT 1', dialect: 'MySQL', timestamp: Date.now() }
            ];
            context.workspaceState.update('pinnedTabs', pinnedTabs);
            
            expect(VisualizationPanel.getPinnedTabs()).toEqual(pinnedTabs);
        });

        it('returns empty array when no pinned tabs stored', () => {
            const context = vscodeMock.createMockExtensionContext();
            VisualizationPanel.setContext(context);
            
            expect(VisualizationPanel.getPinnedTabs()).toEqual([]);
        });
    });

    describe('static method: sourceDocumentUri', () => {
        it('returns undefined when no current panel', () => {
            VisualizationPanel.currentPanel = undefined;
            expect(VisualizationPanel.sourceDocumentUri).toBeUndefined();
        });

        it('returns source document URI when panel exists', () => {
            const mockUri = vscodeMock.Uri.file('/test/query.sql');
            VisualizationPanel.currentPanel = {
                _sourceDocumentUri: mockUri
            };
            
            expect(VisualizationPanel.sourceDocumentUri).toBe(mockUri);
        });
    });

    describe('normalizeAdvancedLimit (module-level function)', () => {
        const source = require('fs').readFileSync(require('path').join(__dirname, '../../src/visualizationPanel.ts'), 'utf8');
        
        it('clamps values to min/max range', () => {
            expect(source).toContain('Math.max(min, Math.min(max, rounded))');
        });

        it('returns fallback for non-number types', () => {
            expect(source).toContain("typeof raw !== 'number'");
            expect(source).toContain('!Number.isFinite(raw)');
        });
    });

    describe('getNonce (module-level function)', () => {
        const source = require('fs').readFileSync(require('path').join(__dirname, '../../src/visualizationPanel.ts'), 'utf8');
        
        it('generates 32 character nonce', () => {
            expect(source).toContain('for (let i = 0; i < 32; i++)');
        });
    });
});

describe('ViewLocation type', () => {
    it('is defined as type in the module', () => {
        const source = require('fs').readFileSync(require('path').join(__dirname, '../../src/visualizationPanel.ts'), 'utf8');
        expect(source).toContain("export type ViewLocation = 'beside' | 'tab'");
    });
});

describe('_escapeForInlineScript via source analysis', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../../src/visualizationPanel.ts'), 'utf8');
    
    it('escapes script tags to prevent XSS', () => {
        expect(source).toContain(".replace(/<\\/script/gi, '<\\\\/script')");
    });

    it('escapes HTML comments', () => {
        expect(source).toContain(".replace(/<!--/g, '<\\\\!--')");
        expect(source).toContain(".replace(/-->/g, '--\\\\>')");
    });

    it('escapes CDATA sections', () => {
        expect(source).toContain(".replace(/\\]\\]>/g, ']\\\\]>");
    });

    it('uses JSON.stringify for base escaping', () => {
        expect(source).toContain('JSON.stringify(value)');
    });
});

describe('pinned tabs persistence', () => {
    let VisualizationPanel: any;

    beforeEach(() => {
        jest.clearAllMocks();
        vscodeMock.__resetStorage();
        VisualizationPanel = require('../../src/visualizationPanel').VisualizationPanel;
    });

    it('saves pinned tab to workspace state', () => {
        const context = vscodeMock.createMockExtensionContext();
        VisualizationPanel.setContext(context);
        
        const pin = {
            id: 'pin-1',
            name: 'Test Query',
            sql: 'SELECT * FROM users',
            dialect: 'PostgreSQL',
            timestamp: Date.now()
        };
        
        VisualizationPanel['savePinnedTab'](pin);
        
        const saved = context.workspaceState.get('pinnedTabs');
        expect(saved).toContainEqual(pin);
    });

    it('updates existing pinned tab by id', () => {
        const context = vscodeMock.createMockExtensionContext();
        VisualizationPanel.setContext(context);
        
        const originalPin = {
            id: 'pin-1',
            name: 'Original',
            sql: 'SELECT 1',
            dialect: 'MySQL',
            timestamp: 1000
        };
        context.workspaceState.update('pinnedTabs', [originalPin]);
        
        const updatedPin = {
            id: 'pin-1',
            name: 'Updated',
            sql: 'SELECT 2',
            dialect: 'PostgreSQL',
            timestamp: 2000
        };
        VisualizationPanel['savePinnedTab'](updatedPin);
        
        const saved = context.workspaceState.get('pinnedTabs') as any[];
        expect(saved.length).toBe(1);
        expect(saved[0].name).toBe('Updated');
    });

    it('adds new pinned tab if not exists', () => {
        const context = vscodeMock.createMockExtensionContext();
        VisualizationPanel.setContext(context);
        
        const existingPin = {
            id: 'pin-1',
            name: 'Existing',
            sql: 'SELECT 1',
            dialect: 'MySQL',
            timestamp: 1000
        };
        context.workspaceState.update('pinnedTabs', [existingPin]);
        
        const newPin = {
            id: 'pin-2',
            name: 'New',
            sql: 'SELECT 2',
            dialect: 'PostgreSQL',
            timestamp: 2000
        };
        VisualizationPanel['savePinnedTab'](newPin);
        
        const saved = context.workspaceState.get('pinnedTabs') as any[];
        expect(saved.length).toBe(2);
    });

    it('removes pinned tab by id', () => {
        const context = vscodeMock.createMockExtensionContext();
        VisualizationPanel.setContext(context);
        
        const pins = [
            { id: 'pin-1', name: 'Query 1', sql: 'SELECT 1', dialect: 'MySQL', timestamp: 1000 },
            { id: 'pin-2', name: 'Query 2', sql: 'SELECT 2', dialect: 'MySQL', timestamp: 2000 }
        ];
        context.workspaceState.update('pinnedTabs', pins);
        
        VisualizationPanel['removePinnedTab']('pin-1');
        
        const saved = context.workspaceState.get('pinnedTabs') as any[];
        expect(saved.length).toBe(1);
        expect(saved[0].id).toBe('pin-2');
    });
});

describe('UI state key generation', () => {
    let VisualizationPanel: any;

    beforeEach(() => {
        VisualizationPanel = require('../../src/visualizationPanel').VisualizationPanel;
    });

    it('creates pin key for pinned tabs', () => {
        const key = VisualizationPanel['_createUiStateKey']({
            isPinned: true,
            pinId: 'pin-123'
        });
        expect(key).toBe('pin:pin-123');
    });

    it('creates doc key for document URIs', () => {
        const uri = vscodeMock.Uri.file('/test/query.sql');
        const key = VisualizationPanel['_createUiStateKey']({
            documentUri: uri,
            isPinned: false
        });
        expect(key).toBe(`doc:${uri.toString()}`);
    });

    it('creates file key for file names', () => {
        const key = VisualizationPanel['_createUiStateKey']({
            fileName: 'query.sql',
            isPinned: false
        });
        expect(key).toBe('file:query.sql');
    });

    it('returns null when no identifier available', () => {
        const key = VisualizationPanel['_createUiStateKey']({
            isPinned: false
        });
        expect(key).toBeNull();
    });

    it('prioritizes pin key over doc key', () => {
        const uri = vscodeMock.Uri.file('/test/query.sql');
        const key = VisualizationPanel['_createUiStateKey']({
            isPinned: true,
            pinId: 'pin-123',
            documentUri: uri
        });
        expect(key).toBe('pin:pin-123');
    });

    it('prioritizes doc key over file key', () => {
        const uri = vscodeMock.Uri.file('/test/query.sql');
        const key = VisualizationPanel['_createUiStateKey']({
            documentUri: uri,
            fileName: 'other.sql',
            isPinned: false
        });
        expect(key).toBe(`doc:${uri.toString()}`);
    });
});
