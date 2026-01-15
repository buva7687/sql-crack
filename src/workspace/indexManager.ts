// Index Manager - Cache and manage workspace SQL index

import * as vscode from 'vscode';
import {
    WorkspaceIndex,
    SerializedWorkspaceIndex,
    FileAnalysis,
    SchemaDefinition,
    TableReference,
    ProgressCallback
} from './types';
import { SqlDialect } from '../webview/types/parser';
import { WorkspaceScanner } from './scanner';

const INDEX_VERSION = 1;
const DEFAULT_AUTO_INDEX_THRESHOLD = 50;
const INDEX_STALE_THRESHOLD = 3600000; // 1 hour

/**
 * Manages the workspace SQL index with caching and file watching
 */
export class IndexManager {
    private context: vscode.ExtensionContext;
    private scanner: WorkspaceScanner;
    private index: WorkspaceIndex | null = null;
    private fileWatcher: vscode.FileSystemWatcher | null = null;
    private updateQueue: Set<string> = new Set();
    private updateTimer: NodeJS.Timeout | null = null;
    private updateDebounceMs: number = 1000;
    private onIndexUpdated: (() => void) | null = null;

    constructor(context: vscode.ExtensionContext, dialect: SqlDialect = 'MySQL') {
        this.context = context;
        this.scanner = new WorkspaceScanner(dialect);
    }

    /**
     * Initialize the index manager
     * Returns whether auto-indexing was performed and the file count
     */
    async initialize(autoIndexThreshold: number = DEFAULT_AUTO_INDEX_THRESHOLD): Promise<{ autoIndexed: boolean; fileCount: number }> {
        const fileCount = await this.scanner.getFileCount();
        const shouldAutoIndex = fileCount < autoIndexThreshold && fileCount > 0;

        // Try to load cached index
        this.index = await this.loadCachedIndex();

        // Auto-index if small workspace and no valid cache
        if (shouldAutoIndex && (!this.index || this.isIndexStale())) {
            await this.buildIndex();
        }

        // Setup file watcher for incremental updates
        this.setupFileWatcher();

        return { autoIndexed: shouldAutoIndex && this.index !== null, fileCount };
    }

    /**
     * Build the full workspace index
     */
    async buildIndex(progressCallback?: ProgressCallback): Promise<WorkspaceIndex> {
        const analyses = await this.scanner.analyzeWorkspace(progressCallback);

        this.index = {
            version: INDEX_VERSION,
            lastUpdated: Date.now(),
            fileCount: analyses.length,
            files: new Map(),
            definitionMap: new Map(),
            referenceMap: new Map()
        };

        for (const analysis of analyses) {
            this.addFileToIndex(analysis);
        }

        // Persist to workspace state
        await this.persistIndex();

        // Notify listeners
        if (this.onIndexUpdated) {
            this.onIndexUpdated();
        }

        return this.index;
    }

    /**
     * Get the current index
     */
    getIndex(): WorkspaceIndex | null {
        return this.index;
    }

    /**
     * Check if index exists
     */
    hasIndex(): boolean {
        return this.index !== null && this.index.fileCount > 0;
    }

    /**
     * Update a single file in the index
     */
    async updateFile(uri: vscode.Uri): Promise<void> {
        if (!this.index) {
            await this.buildIndex();
            return;
        }

        const analysis = await this.scanner.analyzeFile(uri);

        // Remove old entries for this file
        const oldAnalysis = this.index.files.get(uri.fsPath);
        if (oldAnalysis) {
            this.removeFileFromIndex(oldAnalysis);
        }

        // Add new analysis
        this.addFileToIndex(analysis);
        this.index.lastUpdated = Date.now();

        // Persist
        await this.persistIndex();

        // Notify listeners
        if (this.onIndexUpdated) {
            this.onIndexUpdated();
        }
    }

    /**
     * Remove a file from the index
     */
    async removeFile(uri: vscode.Uri): Promise<void> {
        if (!this.index) return;

        const analysis = this.index.files.get(uri.fsPath);
        if (analysis) {
            this.removeFileFromIndex(analysis);
            this.index.fileCount = this.index.files.size;
            this.index.lastUpdated = Date.now();
            await this.persistIndex();

            // Notify listeners
            if (this.onIndexUpdated) {
                this.onIndexUpdated();
            }
        }
    }

    /**
     * Find the definition for a table name
     */
    findDefinition(tableName: string): SchemaDefinition | undefined {
        return this.index?.definitionMap.get(tableName.toLowerCase());
    }

    /**
     * Find all references to a table
     */
    findReferences(tableName: string): TableReference[] {
        return this.index?.referenceMap.get(tableName.toLowerCase()) || [];
    }

    /**
     * Get external references for a file
     * (tables referenced but not defined in this file)
     */
    getExternalReferences(filePath: string): TableReference[] {
        const analysis = this.index?.files.get(filePath);
        if (!analysis) return [];

        const localDefinitions = new Set(
            analysis.definitions.map(d => d.name.toLowerCase())
        );

        return analysis.references.filter(
            ref => !localDefinitions.has(ref.tableName.toLowerCase())
        );
    }

    /**
     * Get files that depend on a table
     */
    getDependentFiles(tableName: string): string[] {
        const refs = this.findReferences(tableName);
        return [...new Set(refs.map(r => r.filePath))];
    }

    /**
     * Get all defined table names
     */
    getDefinedTables(): string[] {
        if (!this.index) return [];
        return [...this.index.definitionMap.keys()];
    }

    /**
     * Get all referenced table names (including external)
     */
    getReferencedTables(): string[] {
        if (!this.index) return [];
        return [...this.index.referenceMap.keys()];
    }

    /**
     * Get tables that are referenced but not defined (external/missing)
     */
    getMissingDefinitions(): string[] {
        if (!this.index) return [];

        const defined = new Set(this.index.definitionMap.keys());
        const missing: string[] = [];

        for (const tableName of this.index.referenceMap.keys()) {
            if (!defined.has(tableName)) {
                missing.push(tableName);
            }
        }

        return missing;
    }

    /**
     * Get tables that are defined but never referenced (orphaned)
     */
    getOrphanedDefinitions(): string[] {
        if (!this.index) return [];

        const orphaned: string[] = [];

        for (const [tableName, def] of this.index.definitionMap) {
            const refs = this.index.referenceMap.get(tableName);
            if (!refs || refs.length === 0) {
                orphaned.push(def.name);
            }
        }

        return orphaned;
    }

    /**
     * Set callback for index updates
     */
    setOnIndexUpdated(callback: () => void): void {
        this.onIndexUpdated = callback;
    }

    /**
     * Set the SQL dialect
     */
    setDialect(dialect: SqlDialect): void {
        this.scanner.setDialect(dialect);
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = null;
        }
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
    }

    // Private methods

    /**
     * Add a file analysis to the index
     */
    private addFileToIndex(analysis: FileAnalysis): void {
        if (!this.index) return;

        this.index.files.set(analysis.filePath, analysis);

        // Index definitions
        for (const def of analysis.definitions) {
            const key = def.name.toLowerCase();
            // If already defined elsewhere, prefer the first definition
            if (!this.index.definitionMap.has(key)) {
                this.index.definitionMap.set(key, def);
            }
        }

        // Index references
        for (const ref of analysis.references) {
            const key = ref.tableName.toLowerCase();
            if (!this.index.referenceMap.has(key)) {
                this.index.referenceMap.set(key, []);
            }
            this.index.referenceMap.get(key)!.push(ref);
        }

        this.index.fileCount = this.index.files.size;
    }

    /**
     * Remove a file analysis from the index
     */
    private removeFileFromIndex(analysis: FileAnalysis): void {
        if (!this.index) return;

        this.index.files.delete(analysis.filePath);

        // Remove definitions from this file
        for (const def of analysis.definitions) {
            const key = def.name.toLowerCase();
            const existing = this.index.definitionMap.get(key);
            if (existing?.filePath === analysis.filePath) {
                this.index.definitionMap.delete(key);
            }
        }

        // Remove references from this file
        for (const [key, refs] of this.index.referenceMap.entries()) {
            const filtered = refs.filter(r => r.filePath !== analysis.filePath);
            if (filtered.length === 0) {
                this.index.referenceMap.delete(key);
            } else {
                this.index.referenceMap.set(key, filtered);
            }
        }
    }

    /**
     * Setup file watcher for incremental updates
     */
    private setupFileWatcher(): void {
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.sql');

        // Debounced update function
        const queueUpdate = (uri: vscode.Uri) => {
            this.updateQueue.add(uri.fsPath);
            if (this.updateTimer) {
                clearTimeout(this.updateTimer);
            }
            this.updateTimer = setTimeout(() => {
                this.processUpdateQueue();
            }, this.updateDebounceMs);
        };

        this.fileWatcher.onDidChange(uri => queueUpdate(uri));
        this.fileWatcher.onDidCreate(uri => queueUpdate(uri));
        this.fileWatcher.onDidDelete(uri => this.removeFile(uri));
    }

    /**
     * Process queued file updates
     */
    private async processUpdateQueue(): Promise<void> {
        const files = [...this.updateQueue];
        this.updateQueue.clear();

        for (const filePath of files) {
            await this.updateFile(vscode.Uri.file(filePath));
        }
    }

    /**
     * Load cached index from workspace state
     */
    private async loadCachedIndex(): Promise<WorkspaceIndex | null> {
        const cached = this.context.workspaceState.get<SerializedWorkspaceIndex>('sqlWorkspaceIndex');

        if (!cached || cached.version !== INDEX_VERSION) {
            return null;
        }

        // Reconstruct Maps from arrays
        return {
            version: cached.version,
            lastUpdated: cached.lastUpdated,
            fileCount: cached.fileCount,
            files: new Map(cached.filesArray || []),
            definitionMap: new Map(cached.definitionArray || []),
            referenceMap: new Map(cached.referenceArray || [])
        };
    }

    /**
     * Persist index to workspace state
     */
    private async persistIndex(): Promise<void> {
        if (!this.index) return;

        // Convert Maps to arrays for JSON serialization
        const serializable: SerializedWorkspaceIndex = {
            version: this.index.version,
            lastUpdated: this.index.lastUpdated,
            fileCount: this.index.fileCount,
            filesArray: [...this.index.files.entries()],
            definitionArray: [...this.index.definitionMap.entries()],
            referenceArray: [...this.index.referenceMap.entries()]
        };

        await this.context.workspaceState.update('sqlWorkspaceIndex', serializable);
    }

    /**
     * Check if the cached index is stale
     */
    private isIndexStale(): boolean {
        if (!this.index) return true;
        return Date.now() - this.index.lastUpdated > INDEX_STALE_THRESHOLD;
    }
}
