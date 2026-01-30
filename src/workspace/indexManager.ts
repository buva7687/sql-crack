// Index Manager - Cache and manage workspace SQL index

import * as vscode from 'vscode';
import {
    WorkspaceIndex,
    SerializedWorkspaceIndex,
    FileAnalysis,
    SchemaDefinition,
    TableReference,
    ProgressCallback,
    CancellationToken
} from './types';
import { SqlDialect } from '../webview/types/parser';
import { WorkspaceScanner } from './scanner';
import { getQualifiedKey, normalizeIdentifier } from './identifiers';

const INDEX_VERSION = 4; // Bumped for column extraction in schema definitions
const DEFAULT_AUTO_INDEX_THRESHOLD = 50;
const DEFAULT_CACHE_TTL_HOURS = 24;

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
     * Build the full workspace index with incremental updates based on content hashes
     * Supports cancellation via token
     */
    async buildIndex(
        progressCallback?: ProgressCallback,
        cancellationToken?: CancellationToken
    ): Promise<WorkspaceIndex> {
        const analyses = await this.scanner.analyzeWorkspace(progressCallback, cancellationToken);

        // Initialize new index or reuse existing for incremental updates
        const newIndex: WorkspaceIndex = {
            version: INDEX_VERSION,
            lastUpdated: Date.now(),
            fileCount: analyses.length,
            files: new Map(),
            fileHashes: new Map(),
            definitionMap: new Map(),
            referenceMap: new Map()
        };

        // Copy existing index for hash comparison if available
        const oldHashes = this.index?.fileHashes || new Map<string, string>();

        // Process all files with fresh analysis
        // Note: We always use the new analysis since analyzeWorkspace() already re-parsed all files
        // This ensures schema extractor improvements (like column extraction) take effect
        for (const analysis of analyses) {
            this.addFileToIndex(analysis, newIndex);
        }

        this.index = newIndex;

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
     * Update a single file in the index with hash-based change detection
     */
    async updateFile(uri: vscode.Uri): Promise<void> {
        if (!this.index) {
            await this.buildIndex();
            return;
        }

        const analysis = await this.scanner.analyzeFile(uri);
        const oldHash = this.index.fileHashes.get(uri.fsPath);
        const oldAnalysis = this.index.files.get(uri.fsPath);

        // Check if file actually changed (hash comparison)
        if (oldHash === analysis.contentHash && oldAnalysis) {
            // No change detected - skip update
            return;
        }

        // Remove old entries for this file
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
        if (!this.index) {return;}

        const analysis = this.index.files.get(uri.fsPath);
        if (analysis) {
            this.removeFileFromIndex(analysis);
            this.index.fileHashes.delete(uri.fsPath);
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
    findDefinition(tableName: string, schema?: string): SchemaDefinition | undefined {
        if (!this.index) {return undefined;}
        const key = getQualifiedKey(tableName, schema);
        const direct = this.index.definitionMap.get(key);
        if (direct && direct.length > 0) {
            return direct[0];
        }

        const targetName = normalizeIdentifier(tableName);
        if (!targetName) {return undefined;}

        if (schema) {
            for (const defs of this.index.definitionMap.values()) {
                const match = defs.find(def => !def.schema && normalizeIdentifier(def.name) === targetName);
                if (match) {return match;}
            }
            return undefined;
        }

        for (const defs of this.index.definitionMap.values()) {
            const match = defs.find(def => normalizeIdentifier(def.name) === targetName);
            if (match) {return match;}
        }

        return undefined;
    }

    /**
     * Find all references to a table
     */
    findReferences(tableName: string, schema?: string): TableReference[] {
        if (!this.index) {return [];}
        const key = getQualifiedKey(tableName, schema);
        const direct = this.index.referenceMap.get(key);
        if (direct && direct.length > 0) {
            return direct;
        }

        const targetName = normalizeIdentifier(tableName);
        if (!targetName) {return [];}

        if (schema) {
            const matches: TableReference[] = [];
            for (const refs of this.index.referenceMap.values()) {
                for (const ref of refs) {
                    if (!ref.schema && normalizeIdentifier(ref.tableName) === targetName) {
                        matches.push(ref);
                    }
                }
            }
            return matches;
        }

        const matches: TableReference[] = [];
        for (const refs of this.index.referenceMap.values()) {
            for (const ref of refs) {
                if (normalizeIdentifier(ref.tableName) === targetName) {
                    matches.push(ref);
                }
            }
        }
        return matches;
    }

    /**
     * Get external references for a file
     * (tables referenced but not defined in this file)
     */
    getExternalReferences(filePath: string): TableReference[] {
        const analysis = this.index?.files.get(filePath);
        if (!analysis) {return [];}

        const localDefinitions = new Set(
            analysis.definitions.map(d => getQualifiedKey(d.name, d.schema))
        );

        return analysis.references.filter(
            ref => !localDefinitions.has(getQualifiedKey(ref.tableName, ref.schema))
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
        if (!this.index) {return [];}
        return [...this.index.definitionMap.keys()];
    }

    /**
     * Get all referenced table names (including external)
     */
    getReferencedTables(): string[] {
        if (!this.index) {return [];}
        return [...this.index.referenceMap.keys()];
    }

    /**
     * Get tables that are referenced but not defined (external/missing)
     */
    getMissingDefinitions(): string[] {
        if (!this.index) {return [];}

        const definedKeys = new Set(this.index.definitionMap.keys());
        const definitionsByName = new Map<string, SchemaDefinition[]>();
        for (const defs of this.index.definitionMap.values()) {
            for (const def of defs) {
                const name = normalizeIdentifier(def.name);
                if (!name) {continue;}
                if (!definitionsByName.has(name)) {
                    definitionsByName.set(name, []);
                }
                definitionsByName.get(name)!.push(def);
            }
        }
        const missing: string[] = [];

        for (const [key, refs] of this.index.referenceMap.entries()) {
            const hasSchema = refs.some(ref => !!ref.schema);
            if (hasSchema) {
                if (!definedKeys.has(key)) {
                    const refName = normalizeIdentifier(refs[0]?.tableName);
                    const defs = refName ? (definitionsByName.get(refName) || []) : [];
                    const hasUnqualified = defs.some(def => !def.schema);
                    if (!hasUnqualified) {
                        missing.push(key);
                    }
                }
                continue;
            }

            const refName = normalizeIdentifier(refs[0]?.tableName);
            if (refName && !definitionsByName.has(refName)) {
                missing.push(key);
            }
        }

        return missing;
    }

    /**
     * Get tables that are defined but never referenced (orphaned)
     */
    getOrphanedDefinitions(): string[] {
        if (!this.index) {return [];}

        const orphaned: string[] = [];
        const refsByName = new Map<string, TableReference[]>();
        for (const refs of this.index.referenceMap.values()) {
            for (const ref of refs) {
                const name = normalizeIdentifier(ref.tableName);
                if (!name) {continue;}
                if (!refsByName.has(name)) {
                    refsByName.set(name, []);
                }
                refsByName.get(name)!.push(ref);
            }
        }

        for (const [key, defs] of this.index.definitionMap.entries()) {
            const refs = this.index.referenceMap.get(key);
            if (refs && refs.length > 0) {
                continue;
            }

            const nameKey = normalizeIdentifier(defs[0]?.name);
            const nameRefs = nameKey ? refsByName.get(nameKey) : undefined;
            if (!nameRefs || nameRefs.length === 0) {
                orphaned.push(key);
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
     * @param analysis The file analysis to add
     * @param index Optional target index (defaults to this.index)
     */
    private addFileToIndex(analysis: FileAnalysis, index?: WorkspaceIndex): void {
        const targetIndex = index || this.index;
        if (!targetIndex) {return;}

        targetIndex.files.set(analysis.filePath, analysis);
        targetIndex.fileHashes.set(analysis.filePath, analysis.contentHash);

        // Index definitions
        for (const def of analysis.definitions) {
            const key = getQualifiedKey(def.name, def.schema);
            if (!targetIndex.definitionMap.has(key)) {
                targetIndex.definitionMap.set(key, []);
            }
            targetIndex.definitionMap.get(key)!.push(def);
        }

        // Index references
        for (const ref of analysis.references) {
            const key = getQualifiedKey(ref.tableName, ref.schema);
            if (!targetIndex.referenceMap.has(key)) {
                targetIndex.referenceMap.set(key, []);
            }
            targetIndex.referenceMap.get(key)!.push(ref);
        }

        targetIndex.fileCount = targetIndex.files.size;
    }

    /**
     * Remove a file analysis from the index
     */
    private removeFileFromIndex(analysis: FileAnalysis): void {
        if (!this.index) {return;}

        this.index.files.delete(analysis.filePath);

        // Remove definitions from this file
        for (const def of analysis.definitions) {
            const key = getQualifiedKey(def.name, def.schema);
            const existing = this.index.definitionMap.get(key) || [];
            const remaining = existing.filter(entry => entry.filePath !== analysis.filePath);
            if (remaining.length === 0) {
                this.index.definitionMap.delete(key);
            } else {
                this.index.definitionMap.set(key, remaining);
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
        // Check advanced settings
        const config = vscode.workspace.getConfiguration('sqlCrack.advanced');
        const clearOnStartup = config.get<boolean>('clearCacheOnStartup', false);
        const cacheTTLHours = config.get<number>('cacheTTLHours', DEFAULT_CACHE_TTL_HOURS);

        // If clear on startup is enabled, always return null (force rebuild)
        if (clearOnStartup) {
            console.log('[IndexManager] Clear cache on startup enabled - rebuilding index');
            await this.context.workspaceState.update('sqlWorkspaceIndex', undefined);
            return null;
        }

        // If TTL is 0, caching is disabled
        if (cacheTTLHours === 0) {
            console.log('[IndexManager] Caching disabled (TTL=0) - rebuilding index');
            return null;
        }

        const cached = this.context.workspaceState.get<SerializedWorkspaceIndex>('sqlWorkspaceIndex');

        if (!cached || cached.version !== INDEX_VERSION) {
            return null;
        }

        // Check TTL
        const cacheTTLMs = cacheTTLHours * 60 * 60 * 1000;
        const cacheAge = Date.now() - cached.lastUpdated;
        if (cacheAge > cacheTTLMs) {
            console.log(`[IndexManager] Cache expired (age: ${Math.round(cacheAge / 3600000)}h, TTL: ${cacheTTLHours}h) - rebuilding index`);
            return null;
        }

        // Reconstruct Maps from arrays
        // Handle backward compatibility: fileHashesArray may not exist in old cache
        const fileHashesArray = cached.fileHashesArray || [];
        const rawDefinitionArray = (cached.definitionArray || []) as [string, SchemaDefinition[] | SchemaDefinition][];
        const definitionArray: [string, SchemaDefinition[]][] = rawDefinitionArray.map(([key, value]) => {
            return [key, Array.isArray(value) ? value : [value]];
        });

        console.log(`[IndexManager] Using cached index (age: ${Math.round(cacheAge / 3600000)}h)`);
        return {
            version: cached.version,
            lastUpdated: cached.lastUpdated,
            fileCount: cached.fileCount,
            files: new Map(cached.filesArray || []),
            fileHashes: new Map(fileHashesArray),
            definitionMap: new Map(definitionArray),
            referenceMap: new Map(cached.referenceArray || [])
        };
    }

    /**
     * Persist index to workspace state
     */
    private async persistIndex(): Promise<void> {
        if (!this.index) {return;}

        // Convert Maps to arrays for JSON serialization
        const serializable: SerializedWorkspaceIndex = {
            version: this.index.version,
            lastUpdated: this.index.lastUpdated,
            fileCount: this.index.fileCount,
            filesArray: [...this.index.files.entries()],
            fileHashesArray: [...this.index.fileHashes.entries()],
            definitionArray: [...this.index.definitionMap.entries()],
            referenceArray: [...this.index.referenceMap.entries()]
        };

        await this.context.workspaceState.update('sqlWorkspaceIndex', serializable);
    }

    /**
     * Check if the cached index is stale based on TTL settings
     */
    private isIndexStale(): boolean {
        if (!this.index) {return true;}

        const config = vscode.workspace.getConfiguration('sqlCrack.advanced');
        const cacheTTLHours = config.get<number>('cacheTTLHours', DEFAULT_CACHE_TTL_HOURS);

        // If TTL is 0, always consider stale (caching disabled)
        if (cacheTTLHours === 0) {return true;}

        const cacheTTLMs = cacheTTLHours * 60 * 60 * 1000;
        return Date.now() - this.index.lastUpdated > cacheTTLMs;
    }

    /**
     * Clear the cached index (force rebuild on next access)
     */
    async clearCache(): Promise<void> {
        this.index = null;
        await this.context.workspaceState.update('sqlWorkspaceIndex', undefined);
        console.log('[IndexManager] Cache cleared');
    }
}
