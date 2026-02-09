/**
 * VSCode Module Mock for Jest
 *
 * HOW THIS WORKS:
 * ---------------
 * When your code does `import * as vscode from 'vscode'`, Jest intercepts it
 * and loads this file instead. Your tests can then control what vscode APIs return.
 *
 * MOCK PATTERN:
 * -------------
 * 1. jest.fn() creates a "spy" function that tracks calls and can return fake values
 * 2. mockReturnValue() sets what the function returns
 * 3. mockResolvedValue() sets what an async function resolves to
 * 4. In tests, you can override these per-test using mockImplementation()
 *
 * EXAMPLE IN TEST:
 * ----------------
 * import * as vscode from 'vscode';
 *
 * // Override for specific test
 * (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([
 *     vscode.Uri.file('/path/to/test.sql')
 * ]);
 */

// ============================================================================
// Uri - Represents file paths in VS Code
// ============================================================================
export class Uri {
    readonly scheme: string;
    readonly authority: string;
    readonly path: string;
    readonly query: string;
    readonly fragment: string;
    readonly fsPath: string;

    private constructor(scheme: string, authority: string, path: string, query: string, fragment: string) {
        this.scheme = scheme;
        this.authority = authority;
        this.path = path;
        this.query = query;
        this.fragment = fragment;
        // fsPath converts URI path to OS-specific path
        this.fsPath = path;
    }

    static file(path: string): Uri {
        return new Uri('file', '', path, '', '');
    }

    static parse(value: string): Uri {
        // Simple parse - just handle file:// URIs
        if (value.startsWith('file://')) {
            return Uri.file(value.slice(7));
        }
        return new Uri('', '', value, '', '');
    }

    toString(): string {
        return `${this.scheme}://${this.path}`;
    }

    with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
        return new Uri(
            change.scheme ?? this.scheme,
            change.authority ?? this.authority,
            change.path ?? this.path,
            change.query ?? this.query,
            change.fragment ?? this.fragment
        );
    }
}

// ============================================================================
// workspace - File operations, settings, watchers
// ============================================================================

// Mock configuration object
const mockConfigValues: Record<string, Record<string, unknown>> = {
    'sqlCrack': {
        'additionalFileExtensions': []
    },
    'sqlCrack.advanced': {
        'clearCacheOnStartup': false,
        'cacheTTLHours': 24
    }
};

// Helper to set config values in tests
export function __setMockConfig(section: string, values: Record<string, unknown>): void {
    mockConfigValues[section] = { ...mockConfigValues[section], ...values };
}

// Helper to reset config to defaults
export function __resetMockConfig(): void {
    mockConfigValues['sqlCrack'] = { 'additionalFileExtensions': [] };
    mockConfigValues['sqlCrack.advanced'] = { 'clearCacheOnStartup': false, 'cacheTTLHours': 24 };
}

const createMockConfiguration = (section: string) => ({
    get: jest.fn(<T>(key: string, defaultValue?: T): T | undefined => {
        const sectionConfig = mockConfigValues[section] || {};
        return (key in sectionConfig ? sectionConfig[key] : defaultValue) as T | undefined;
    }),
    has: jest.fn((key: string) => {
        const sectionConfig = mockConfigValues[section] || {};
        return key in sectionConfig;
    }),
    inspect: jest.fn(),
    update: jest.fn()
});

// Mock file system watcher
export class MockFileSystemWatcher {
    private changeHandler: ((uri: Uri) => void) | null = null;
    private createHandler: ((uri: Uri) => void) | null = null;
    private deleteHandler: ((uri: Uri) => void) | null = null;

    onDidChange = jest.fn((handler: (uri: Uri) => void) => {
        this.changeHandler = handler;
        return { dispose: jest.fn() };
    });

    onDidCreate = jest.fn((handler: (uri: Uri) => void) => {
        this.createHandler = handler;
        return { dispose: jest.fn() };
    });

    onDidDelete = jest.fn((handler: (uri: Uri) => void) => {
        this.deleteHandler = handler;
        return { dispose: jest.fn() };
    });

    dispose = jest.fn();

    // Test helpers - trigger events manually
    __triggerChange(uri: Uri): void {
        this.changeHandler?.(uri);
    }

    __triggerCreate(uri: Uri): void {
        this.createHandler?.(uri);
    }

    __triggerDelete(uri: Uri): void {
        this.deleteHandler?.(uri);
    }
}

// Store created watchers for test access
let mockFileSystemWatcher: MockFileSystemWatcher | null = null;

export function __getFileSystemWatcher(): MockFileSystemWatcher | null {
    return mockFileSystemWatcher;
}

export const workspace = {
    // Find files matching a glob pattern
    findFiles: jest.fn().mockResolvedValue([]),

    // Get configuration values
    getConfiguration: jest.fn((section: string) => createMockConfiguration(section)),

    // Open a text document
    openTextDocument: jest.fn().mockImplementation((uri: Uri) => {
        // Default: return empty document, override in tests
        return Promise.resolve({
            getText: () => '',
            uri: uri,
            fileName: uri.fsPath,
            languageId: 'sql',
            version: 1,
            isDirty: false,
            isUntitled: false,
            lineCount: 0,
            lineAt: jest.fn(),
            offsetAt: jest.fn(),
            positionAt: jest.fn(),
            save: jest.fn(),
            eol: 1,
            isClosed: false
        });
    }),

    // File system operations
    fs: {
        stat: jest.fn().mockResolvedValue({
            type: 1, // FileType.File
            ctime: Date.now(),
            mtime: Date.now(),
            size: 1024
        }),
        readFile: jest.fn().mockResolvedValue(new Uint8Array()),
        writeFile: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        rename: jest.fn().mockResolvedValue(undefined),
        copy: jest.fn().mockResolvedValue(undefined),
        createDirectory: jest.fn().mockResolvedValue(undefined),
        readDirectory: jest.fn().mockResolvedValue([])
    },

    // Create file system watcher
    createFileSystemWatcher: jest.fn().mockImplementation(() => {
        mockFileSystemWatcher = new MockFileSystemWatcher();
        return mockFileSystemWatcher;
    }),

    // Workspace folders
    workspaceFolders: undefined as { uri: Uri; name: string; index: number }[] | undefined,
    textDocuments: [] as any[],

    // Events
    onDidChangeConfiguration: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeWorkspaceFolders: jest.fn(() => ({ dispose: jest.fn() })),
    onDidOpenTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
    onDidCloseTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
    onDidSaveTextDocument: jest.fn(() => ({ dispose: jest.fn() }))
};

// ============================================================================
// ExtensionContext - Extension lifecycle and storage
// ============================================================================

// In-memory storage for tests
let workspaceStateStorage: Record<string, unknown> = {};
let globalStateStorage: Record<string, unknown> = {};

export function __resetStorage(): void {
    workspaceStateStorage = {};
    globalStateStorage = {};
}

export function __getWorkspaceState(): Record<string, unknown> {
    return workspaceStateStorage;
}

export function createMockExtensionContext(): ExtensionContext {
    return {
        subscriptions: [],
        workspaceState: {
            get: jest.fn(<T>(key: string, defaultValue?: T): T | undefined => {
                return (key in workspaceStateStorage ? workspaceStateStorage[key] : defaultValue) as T | undefined;
            }),
            update: jest.fn((key: string, value: unknown) => {
                if (value === undefined) {
                    delete workspaceStateStorage[key];
                } else {
                    workspaceStateStorage[key] = value;
                }
                return Promise.resolve();
            }),
            keys: jest.fn(() => Object.keys(workspaceStateStorage))
        },
        globalState: {
            get: jest.fn(<T>(key: string, defaultValue?: T): T | undefined => {
                return (key in globalStateStorage ? globalStateStorage[key] : defaultValue) as T | undefined;
            }),
            update: jest.fn((key: string, value: unknown) => {
                if (value === undefined) {
                    delete globalStateStorage[key];
                } else {
                    globalStateStorage[key] = value;
                }
                return Promise.resolve();
            }),
            keys: jest.fn(() => Object.keys(globalStateStorage)),
            setKeysForSync: jest.fn()
        },
        extensionPath: '/mock/extension/path',
        extensionUri: Uri.file('/mock/extension/path'),
        storagePath: '/mock/storage/path',
        storageUri: Uri.file('/mock/storage/path'),
        globalStoragePath: '/mock/global/storage/path',
        globalStorageUri: Uri.file('/mock/global/storage/path'),
        logPath: '/mock/log/path',
        logUri: Uri.file('/mock/log/path'),
        extensionMode: 3, // ExtensionMode.Production
        asAbsolutePath: jest.fn((relativePath: string) => `/mock/extension/path/${relativePath}`),
        extension: {
            id: 'mock.extension',
            extensionUri: Uri.file('/mock/extension/path'),
            extensionPath: '/mock/extension/path',
            isActive: true,
            packageJSON: {},
            exports: undefined,
            activate: jest.fn(),
            extensionKind: 1
        },
        environmentVariableCollection: {
            persistent: true,
            description: undefined,
            replace: jest.fn(),
            append: jest.fn(),
            prepend: jest.fn(),
            get: jest.fn(),
            forEach: jest.fn(),
            delete: jest.fn(),
            clear: jest.fn(),
            getScoped: jest.fn()
        },
        secrets: {
            get: jest.fn(),
            store: jest.fn(),
            delete: jest.fn(),
            onDidChange: jest.fn(() => ({ dispose: jest.fn() }))
        },
        languageModelAccessInformation: {
            onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
            canSendRequest: jest.fn()
        }
    } as unknown as ExtensionContext;
}

// Type for ExtensionContext (simplified)
export interface ExtensionContext {
    subscriptions: { dispose(): void }[];
    workspaceState: {
        get<T>(key: string, defaultValue?: T): T | undefined;
        update(key: string, value: unknown): Thenable<void>;
        keys(): readonly string[];
    };
    globalState: {
        get<T>(key: string, defaultValue?: T): T | undefined;
        update(key: string, value: unknown): Thenable<void>;
        keys(): readonly string[];
        setKeysForSync(keys: readonly string[]): void;
    };
    extensionPath: string;
    extensionUri: Uri;
    storagePath: string | undefined;
    storageUri: Uri | undefined;
    globalStoragePath: string;
    globalStorageUri: Uri;
    logPath: string;
    logUri: Uri;
    extensionMode: number;
    asAbsolutePath(relativePath: string): string;
    extension: unknown;
    environmentVariableCollection: unknown;
    secrets: unknown;
    languageModelAccessInformation: unknown;
}

// ============================================================================
// Enums and Constants
// ============================================================================

export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64
}

export enum ExtensionMode {
    Production = 1,
    Development = 2,
    Test = 3
}

export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
}

export class Diagnostic {
    public source?: string;
    public code?: string | number;

    constructor(
        public readonly range: Range,
        public readonly message: string,
        public readonly severity: DiagnosticSeverity
    ) {}
}

export class CodeActionKind {
    constructor(public readonly value: string) {}
    static readonly QuickFix = new CodeActionKind('quickfix');
}

export class CodeAction {
    public command?: unknown;
    public diagnostics?: Diagnostic[];
    public isPreferred?: boolean;

    constructor(
        public readonly title: string,
        public readonly kind: CodeActionKind = CodeActionKind.QuickFix
    ) {}
}

// ============================================================================
// Window - UI operations (minimal mock)
// ============================================================================

export const window = {
    showInformationMessage: jest.fn().mockResolvedValue(undefined),
    showWarningMessage: jest.fn().mockResolvedValue(undefined),
    showErrorMessage: jest.fn().mockResolvedValue(undefined),
    showQuickPick: jest.fn().mockResolvedValue(undefined),
    showInputBox: jest.fn().mockResolvedValue(undefined),
    createOutputChannel: jest.fn(() => ({
        append: jest.fn(),
        appendLine: jest.fn(),
        clear: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn()
    })),
    withProgress: jest.fn().mockImplementation((_options, task) => task({
        report: jest.fn()
    })),
    activeTextEditor: undefined,
    visibleTextEditors: []
};

// ============================================================================
// Commands
// ============================================================================

export const commands = {
    registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
    executeCommand: jest.fn().mockResolvedValue(undefined),
    getCommands: jest.fn().mockResolvedValue([])
};

export const languages = {
    createDiagnosticCollection: jest.fn((name: string) => ({
        name,
        set: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn(),
        dispose: jest.fn(),
    })),
    registerCodeActionsProvider: jest.fn(() => ({ dispose: jest.fn() })),
};

// ============================================================================
// Position and Range (for text operations)
// ============================================================================

export class Position {
    constructor(public readonly line: number, public readonly character: number) {}

    isEqual(other: Position): boolean {
        return this.line === other.line && this.character === other.character;
    }

    isBefore(other: Position): boolean {
        return this.line < other.line || (this.line === other.line && this.character < other.character);
    }

    isAfter(other: Position): boolean {
        return this.line > other.line || (this.line === other.line && this.character > other.character);
    }

    translate(lineDelta?: number, characterDelta?: number): Position {
        return new Position(this.line + (lineDelta || 0), this.character + (characterDelta || 0));
    }

    with(line?: number, character?: number): Position {
        return new Position(line ?? this.line, character ?? this.character);
    }
}

export class Range {
    constructor(
        public readonly start: Position,
        public readonly end: Position
    ) {}

    static create(startLine: number, startChar: number, endLine: number, endChar: number): Range {
        return new Range(new Position(startLine, startChar), new Position(endLine, endChar));
    }

    get isEmpty(): boolean {
        return this.start.isEqual(this.end);
    }

    get isSingleLine(): boolean {
        return this.start.line === this.end.line;
    }

    contains(positionOrRange: Position | Range): boolean {
        if (positionOrRange instanceof Position) {
            return !positionOrRange.isBefore(this.start) && !positionOrRange.isAfter(this.end);
        }
        return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
    }
}

// ============================================================================
// CancellationToken
// ============================================================================

export class CancellationTokenSource {
    private _isCancelled = false;

    token = {
        isCancellationRequested: false,
        onCancellationRequested: jest.fn(() => ({ dispose: jest.fn() }))
    };

    cancel(): void {
        this._isCancelled = true;
        this.token.isCancellationRequested = true;
    }

    dispose(): void {
        // cleanup
    }
}

// ============================================================================
// Disposable
// ============================================================================

export class Disposable {
    constructor(private callOnDispose: () => void) {}

    dispose(): void {
        this.callOnDispose();
    }

    static from(...disposables: { dispose(): void }[]): Disposable {
        return new Disposable(() => {
            disposables.forEach(d => d.dispose());
        });
    }
}

// ============================================================================
// EventEmitter (for custom events)
// ============================================================================

export class EventEmitter<T> {
    private listeners: ((e: T) => void)[] = [];

    event = (listener: (e: T) => void) => {
        this.listeners.push(listener);
        return { dispose: () => this.listeners = this.listeners.filter(l => l !== listener) };
    };

    fire(data: T): void {
        this.listeners.forEach(l => l(data));
    }

    dispose(): void {
        this.listeners = [];
    }
}
