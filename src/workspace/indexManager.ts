// Index Manager - Cache and manage workspace SQL index

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
    WorkspaceIndex,
    SerializedWorkspaceIndex,
    FileAnalysis,
    SchemaDefinition,
    TableReference,
    ProgressCallback,
    CancellationToken,
    SqlDialect,
    WorkspaceCacheState,
} from './types';
import { WorkspaceScanner } from './scanner';
import { normalizeFileExtensions } from '../shared/fileExtensions';
import { getQualifiedKey, IdentifierQualification, normalizeIdentifier } from './identifiers';
import { logger } from '../logger';

const INDEX_VERSION = 7; // Bumped for nested CTE query analysis and scoped source tables
const DEFAULT_AUTO_INDEX_THRESHOLD = 50;
const DEFAULT_CACHE_TTL_HOURS = 24;
const DEFAULT_MAX_CACHE_BYTES = 4 * 1024 * 1024; // 4MB safety limit for workspaceState
const MAX_CACHE_VALIDATION_CONCURRENCY = 4;

function isFileNotFoundCode(code: string | undefined): boolean {
    return code === 'FileNotFound' || code === 'ENOENT';
}

function getDefinitionKey(definition: SchemaDefinition): string {
    return getQualifiedKey(definition.name, definition.schema, definition);
}

function getReferenceKey(reference: TableReference): string {
    return getQualifiedKey(reference.tableName, reference.schema, reference);
}

function getDefinitionNameKey(definition: SchemaDefinition | undefined): string | undefined {
    return normalizeIdentifier(
        definition?.name,
        definition?.nameQuoted,
        definition?.identifierCaseFolding,
        definition?.quotedIdentifiersCaseSensitive
    );
}

function getReferenceNameKey(reference: TableReference | undefined): string | undefined {
    return normalizeIdentifier(
        reference?.tableName,
        reference?.nameQuoted,
        reference?.identifierCaseFolding,
        reference?.quotedIdentifiersCaseSensitive
    );
}

/**
 * Manages the workspace SQL index with caching and file watching
 */
export class IndexManager {
    private context: vscode.ExtensionContext;
    private scanner: WorkspaceScanner;
    private dialect: SqlDialect;
    private scopeUri: vscode.Uri | undefined;
    private index: WorkspaceIndex | null = null;
    private fileWatcher: vscode.FileSystemWatcher | null = null;
    private updateQueue: Set<string> = new Set();
    private updateTimer: NodeJS.Timeout | null = null;
    private updateDebounceMs: number = 1000;
    private onIndexUpdated: (() => void) | null = null;
    private _configDisposable: vscode.Disposable | null = null;
    private _buildPromise: Promise<WorkspaceIndex> | null = null;
    private _queueProcessingPromise: Promise<void> | null = null;
    private _changesSinceIndex: number = 0;
    private _persistTimer: NodeJS.Timeout | null = null;
    private _persistDebounceMs: number = 1000;
    private _deletedDuringBuild: Set<string> = new Set();
    private _fileWatcherDisposables: vscode.Disposable[] = [];
    private _pendingDialectRebuildVersion: number = 0;
    private _completedDialectRebuildVersion: number = 0;
    private _dialectRebuildPromise: Promise<void> | null = null;
    private _lastCacheState: WorkspaceCacheState = 'missing';
    private _indexUpdateBatchDepth: number = 0;
    private _indexUpdatePending: boolean = false;
    private _disposed: boolean = false;

    constructor(context: vscode.ExtensionContext, dialect: SqlDialect = 'MySQL', scopeUri?: vscode.Uri) {
        this.context = context;
        this.dialect = dialect;
        this.scopeUri = scopeUri;
        this.scanner = new WorkspaceScanner(dialect, undefined, scopeUri);
    }

    /**
     * Initialize the index manager
     * Returns whether auto-indexing was performed and the file count
     */
    async initialize(autoIndexThreshold: number = DEFAULT_AUTO_INDEX_THRESHOLD): Promise<{
        autoIndexed: boolean;
        fileCount: number;
        cacheState: WorkspaceCacheState;
        hasValidIndex: boolean;
    }> {
        const fileCount = await this.scanner.getFileCount();
        const shouldAutoIndex = fileCount < autoIndexThreshold && fileCount > 0;

        // Try to load cached index. loadCachedIndex() records the precise reason
        // (valid / missing / stale / version- or identity-mismatch / oversized /
        // disabled) so callers don't have to infer it from a bare null.
        this.index = await this.loadCachedIndex(fileCount);
        const cacheState = this._lastCacheState;

        // Auto-index small workspaces when there is no valid cache to reuse. A
        // freshly loaded valid index already passed the TTL check in
        // loadCachedIndex, so isIndexStale() only matters on the auto-build path.
        if (shouldAutoIndex && (!this.index || this.isIndexStale())) {
            await this.buildIndex();
        }

        // Setup file watcher for incremental updates
        this.setupFileWatcher();

        return {
            autoIndexed: shouldAutoIndex && this.index !== null,
            fileCount,
            cacheState,
            hasValidIndex: this.index !== null,
        };
    }

    /**
     * Build the full workspace index with incremental updates based on content hashes.
     * Supports cancellation via token.
     * Concurrent calls return the same in-flight promise to prevent race conditions.
     */
    async buildIndex(
        progressCallback?: ProgressCallback,
        cancellationToken?: CancellationToken
    ): Promise<WorkspaceIndex> {
        if (this._disposed) {
            throw new Error('IndexManager has been disposed');
        }
        if (this._buildPromise) {
            return this._buildPromise;
        }
        await this.waitForQueueToDrain();
        return this.startBuild(progressCallback, cancellationToken);
    }

    /**
     * Start or join a serialized full build. Callers outside the watcher queue
     * must use buildIndex() so pending incremental updates drain first.
     */
    private async startBuild(
        progressCallback?: ProgressCallback,
        cancellationToken?: CancellationToken
    ): Promise<WorkspaceIndex> {
        if (this._buildPromise) {
            return this._buildPromise;
        }
        this._buildPromise = this._doBuildIndex(progressCallback, cancellationToken);
        try {
            return await this._buildPromise;
        } finally {
            this._buildPromise = null;
            // Tombstones only describe events concurrent with this build. If the
            // build failed, the next scan must observe the filesystem afresh.
            this._deletedDuringBuild.clear();
        }
    }

    /**
     * A queued watcher update cannot call buildIndex() while the index is
     * missing because buildIndex() waits for that same queue to drain.
     * Starting the serialized build directly is safe here: the full scan
     * subsumes the queued change, and later queue entries are still processed.
     */
    private async updateQueuedFile(uri: vscode.Uri): Promise<void> {
        if (!this.index) {
            await this.startBuild();
            return;
        }
        await this.updateFile(uri);
    }

    private async _doBuildIndex(
        progressCallback?: ProgressCallback,
        cancellationToken?: CancellationToken
    ): Promise<WorkspaceIndex> {
        const previousIndex = this.index;
        const manager = this;
        const combinedCancellationToken: CancellationToken = {
            get isCancellationRequested() {
                return manager._disposed || cancellationToken?.isCancellationRequested === true;
            }
        };
        const analyses = await this.scanner.analyzeWorkspace(progressCallback, combinedCancellationToken);

        if (this._disposed) {
            return previousIndex ?? {
                version: INDEX_VERSION,
                lastUpdated: Date.now(),
                fileCount: 0,
                files: new Map(),
                fileHashes: new Map(),
                definitionMap: new Map(),
                referenceMap: new Map(),
            };
        }

        // A cancelled refresh must not replace a complete, usable index with
        // the scanner's partial result set.
        if (cancellationToken?.isCancellationRequested && previousIndex) {
            return previousIndex;
        }

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

        // Process all files with fresh analysis
        // Note: We always use the new analysis since analyzeWorkspace() already re-parsed all files
        // This ensures schema extractor improvements (like column extraction) take effect
        for (const analysis of analyses) {
            if (this._deletedDuringBuild.has(analysis.filePath)) {
                continue;
            }
            const previousAnalysis = previousIndex?.files.get(analysis.filePath);
            if (analysis.readError && isFileNotFoundCode(analysis.readErrorCode)) {
                continue;
            }
            if (analysis.readError && previousAnalysis) {
                this.addFileToIndex({
                    ...previousAnalysis,
                    parseError: analysis.parseError || analysis.readError,
                    readError: analysis.readError,
                    readErrorCode: analysis.readErrorCode,
                }, newIndex);
            } else {
                this.addFileToIndex(analysis, newIndex);
            }
        }
        newIndex.fileCount = newIndex.files.size;

        this.index = newIndex;
        this._changesSinceIndex = 0;

        // Persist to workspace state
        await this.persistIndex();

        // Notify listeners
        this.notifyIndexUpdated();

        return this.index;
    }

    /**
     * Get the current index
     */
    getIndex(): WorkspaceIndex | null {
        return this.index;
    }

    /**
     * Number of pending workspace changes not yet reflected in the index.
     * 0 means index is clean relative to observed file watcher events.
     */
    getChangesSinceIndex(): number {
        return this._changesSinceIndex;
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
        this._deletedDuringBuild.delete(uri.fsPath);
        const oldHash = this.index.fileHashes.get(uri.fsPath);
        const oldAnalysis = this.index.files.get(uri.fsPath);

        if (analysis.readError && isFileNotFoundCode(analysis.readErrorCode)) {
            if (oldAnalysis) {
                await this.removeFile(uri);
            }
            return;
        }

        // A watcher update can race with an atomic save or hit a transient
        // filesystem outage. Do not turn that temporary I/O failure into an
        // empty graph analysis: keep the last-known-good dependencies and mark
        // the file as unreadable so the Issues view still exposes the problem.
        if (analysis.readError && oldAnalysis) {
            if (oldAnalysis.readError === analysis.readError) {
                return;
            }

            const preservedAnalysis: FileAnalysis = {
                ...oldAnalysis,
                parseError: analysis.parseError || analysis.readError,
                readError: analysis.readError,
                readErrorCode: analysis.readErrorCode,
            };
            this.removeFileFromIndex(oldAnalysis);
            this.addFileToIndex(preservedAnalysis);
            this.index.lastUpdated = Date.now();
            this.schedulePersist();
            this.notifyIndexUpdated();
            return;
        }

        // Check if file actually changed (hash comparison)
        // A successful read must also replace a preserved error marker, even
        // when the recovered content is byte-identical to the previous version.
        if (oldHash === analysis.contentHash && oldAnalysis && !oldAnalysis.readError) {
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
        this.schedulePersist();

        // Notify listeners
        this.notifyIndexUpdated();
    }

    /**
     * Remove a file from the index
     */
    async removeFile(uri: vscode.Uri): Promise<void> {
        if (this._buildPromise) {
            this._deletedDuringBuild.add(uri.fsPath);
        }
        if (!this.index) {return;}

        const analysis = this.index.files.get(uri.fsPath);
        if (analysis) {
            this.removeFileFromIndex(analysis);
            this.index.fileHashes.delete(uri.fsPath);
            this.index.fileCount = this.index.files.size;
            this.index.lastUpdated = Date.now();
            this.schedulePersist();

            // Notify listeners
            this.notifyIndexUpdated();
        }
    }

    /**
     * Find the definition for a table name
     */
    findDefinition(
        tableName: string,
        schema?: string,
        qualification: IdentifierQualification = {}
    ): SchemaDefinition | undefined {
        if (!this.index) {return undefined;}
        const key = getQualifiedKey(tableName, schema, qualification);
        const direct = this.index.definitionMap.get(key);
        if (direct && direct.length > 0) {
            return direct[0];
        }

        const targetName = normalizeIdentifier(
            tableName,
            qualification.nameQuoted,
            qualification.identifierCaseFolding,
            qualification.quotedIdentifiersCaseSensitive
        );
        if (!targetName) {return undefined;}

        if (schema || qualification.catalog) {
            for (const defs of this.index.definitionMap.values()) {
                const match = defs.find(def =>
                    !def.schema && !def.catalog && getDefinitionNameKey(def) === targetName
                );
                if (match) {return match;}
            }
            return undefined;
        }

        for (const defs of this.index.definitionMap.values()) {
            const match = defs.find(def => getDefinitionNameKey(def) === targetName);
            if (match) {return match;}
        }

        return undefined;
    }

    /**
     * Find all references to a table
     */
    findReferences(
        tableName: string,
        schema?: string,
        qualification: IdentifierQualification = {}
    ): TableReference[] {
        if (!this.index) {return [];}
        const key = getQualifiedKey(tableName, schema, qualification);
        const direct = this.index.referenceMap.get(key);
        if (direct && direct.length > 0) {
            return direct;
        }

        const targetName = normalizeIdentifier(
            tableName,
            qualification.nameQuoted,
            qualification.identifierCaseFolding,
            qualification.quotedIdentifiersCaseSensitive
        );
        if (!targetName) {return [];}

        if (schema || qualification.catalog) {
            const matches: TableReference[] = [];
            for (const refs of this.index.referenceMap.values()) {
                for (const ref of refs) {
                    if (!ref.schema && !ref.catalog && getReferenceNameKey(ref) === targetName) {
                        matches.push(ref);
                    }
                }
            }
            return matches;
        }

        const matches: TableReference[] = [];
        for (const refs of this.index.referenceMap.values()) {
            for (const ref of refs) {
                if (getReferenceNameKey(ref) === targetName) {
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
            analysis.definitions.map(getDefinitionKey)
        );

        return analysis.references.filter(
            ref => !localDefinitions.has(getReferenceKey(ref))
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
                const name = getDefinitionNameKey(def);
                if (!name) {continue;}
                if (!definitionsByName.has(name)) {
                    definitionsByName.set(name, []);
                }
                definitionsByName.get(name)!.push(def);
            }
        }
        const missing: string[] = [];

        for (const [key, refs] of this.index.referenceMap.entries()) {
            const hasSchema = refs.some(ref => !!ref.schema || !!ref.catalog);
            if (hasSchema) {
                if (!definedKeys.has(key)) {
                    const refName = getReferenceNameKey(refs[0]);
                    const defs = refName ? (definitionsByName.get(refName) || []) : [];
                    const hasUnqualified = defs.some(def => !def.schema && !def.catalog);
                    if (!hasUnqualified) {
                        missing.push(key);
                    }
                }
                continue;
            }

            const refName = getReferenceNameKey(refs[0]);
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
                const name = getReferenceNameKey(ref);
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

            const nameKey = getDefinitionNameKey(defs[0]);
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
    setOnIndexUpdated(callback: (() => void) | null): void {
        this.onIndexUpdated = callback;
    }

    private notifyIndexUpdated(): void {
        if (this._indexUpdateBatchDepth > 0) {
            this._indexUpdatePending = true;
            return;
        }
        this.onIndexUpdated?.();
    }

    private beginIndexUpdateBatch(): void {
        this._indexUpdateBatchDepth++;
    }

    private endIndexUpdateBatch(): void {
        this._indexUpdateBatchDepth = Math.max(0, this._indexUpdateBatchDepth - 1);
        if (this._indexUpdateBatchDepth === 0 && this._indexUpdatePending) {
            this._indexUpdatePending = false;
            this.onIndexUpdated?.();
        }
    }

    /**
     * Set the SQL dialect
     */
    setDialect(dialect: SqlDialect): void {
        if (this.dialect === dialect) {
            return;
        }
        this.dialect = dialect;
        this.scanner.setDialect(dialect);
        this._pendingDialectRebuildVersion += 1;
        this.scheduleDialectRebuild();
    }

    private scheduleDialectRebuild(): void {
        if (this._dialectRebuildPromise) {
            return;
        }

        this._dialectRebuildPromise = this.runPendingDialectRebuilds()
            .catch((error) => {
                logger.warn(`[IndexManager] Failed to rebuild index after dialect change: ${error instanceof Error ? error.message : String(error)}`);
            })
            .finally(() => {
                this._dialectRebuildPromise = null;
                if (this._completedDialectRebuildVersion !== this._pendingDialectRebuildVersion) {
                    this.scheduleDialectRebuild();
                }
            });
    }

    private async runPendingDialectRebuilds(): Promise<void> {
        while (this._completedDialectRebuildVersion !== this._pendingDialectRebuildVersion) {
            const requestedVersion = this._pendingDialectRebuildVersion;

            if (this._buildPromise) {
                try {
                    await this._buildPromise;
                } catch (error) {
                    logger.warn(`[IndexManager] Existing build failed before dialect-triggered rebuild: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            if (requestedVersion !== this._pendingDialectRebuildVersion) {
                continue;
            }

            await this.clearCache();

            if (requestedVersion !== this._pendingDialectRebuildVersion) {
                continue;
            }

            try {
                await this.buildIndex();
            } finally {
                this._completedDialectRebuildVersion = requestedVersion;
            }
        }
    }

    /**
     * Flush any pending index persistence to workspace state.
     * Call before dispose() to ensure data is not lost on shutdown.
     */
    async flushPersist(): Promise<void> {
        if (this._persistTimer) {
            clearTimeout(this._persistTimer);
            this._persistTimer = null;
        }
        if (this.index) {
            await this.persistIndex();
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this._disposed = true;
        this.disposeFileWatcherResources();
        if (this._configDisposable) {
            this._configDisposable.dispose();
            this._configDisposable = null;
        }
        if (this._persistTimer) {
            clearTimeout(this._persistTimer);
            this._persistTimer = null;
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
            const key = getDefinitionKey(def);
            if (!targetIndex.definitionMap.has(key)) {
                targetIndex.definitionMap.set(key, []);
            }
            targetIndex.definitionMap.get(key)!.push(def);
        }

        // Index references
        for (const ref of analysis.references) {
            const key = getReferenceKey(ref);
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
            const key = getDefinitionKey(def);
            const existing = this.index.definitionMap.get(key) || [];
            const remaining = existing.filter(entry => entry.filePath !== analysis.filePath);
            if (remaining.length === 0) {
                this.index.definitionMap.delete(key);
            } else {
                this.index.definitionMap.set(key, remaining);
            }
        }

        // Only this file's reference keys can contain its entries. Targeting
        // those buckets avoids sweeping the complete workspace map per save.
        const referenceKeys = new Set(analysis.references.map(getReferenceKey));
        for (const key of referenceKeys) {
            const refs = this.index.referenceMap.get(key) || [];
            const filtered = refs.filter(r => r.filePath !== analysis.filePath);
            if (filtered.length === 0) {
                this.index.referenceMap.delete(key);
            } else {
                this.index.referenceMap.set(key, filtered);
            }
        }
    }

    private normalizePathForComparison(filePath: string): string {
        const normalized = path.normalize(filePath);
        return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    }

    /**
     * Build a stable identity fingerprint for the cached index. The cache is only
     * valid when it was produced for the same workspace scope, dialect, relevant
     * extension configuration, and index schema version. Persisting and validating
     * this prevents a cache built for one scope/dialect from being served for
     * another (e.g. switching folders or dialects).
     */
    private computeCacheIdentity(): string {
        const scopeKey = this.scopeUri
            ? this.canonicalizePathForComparison(this.scopeUri.fsPath)
            : '<workspace>';

        const config = vscode.workspace.getConfiguration('sqlCrack');
        const additionalExtensions = normalizeFileExtensions(config.get<string[]>('additionalFileExtensions')).sort();

        return JSON.stringify({
            schema: INDEX_VERSION,
            scope: scopeKey,
            dialect: this.dialect,
            extensions: additionalExtensions,
        });
    }

    private canonicalizePathForComparison(filePath: string): string {
        const resolved = path.resolve(filePath);
        try {
            return this.normalizePathForComparison(fs.realpathSync(resolved));
        } catch {
            return this.normalizePathForComparison(resolved);
        }
    }

    private isInScope(filePath: string): boolean {
        if (!this.scopeUri) {
            return true;
        }

        const scopePath = this.canonicalizePathForComparison(this.scopeUri.fsPath);
        const candidatePath = this.canonicalizePathForComparison(filePath);

        return candidatePath === scopePath || candidatePath.startsWith(scopePath + path.sep);
    }

    /**
     * Build the file watcher glob pattern from configured extensions.
     * Always includes .sql, plus any additionalFileExtensions from settings.
     */
    private getWatcherGlob(): string {
        const extensions = ['sql'];
        const config = vscode.workspace.getConfiguration('sqlCrack');
        // Validate/normalize so a value like `*.hql` cannot produce a malformed
        // glob such as `**/*.{sql,*.hql}`.
        for (const ext of normalizeFileExtensions(config.get<string[]>('additionalFileExtensions'))) {
            if (!extensions.includes(ext)) {
                extensions.push(ext);
            }
        }

        return extensions.length === 1
            ? `**/*.${extensions[0]}`
            : `**/*.{${extensions.join(',')}}`;
    }

    /**
     * Apply the same ignore policy used by workspace scanning so watcher updates
     * do not re-index generated/dependency folders.
     */
    private shouldIndexFile(uri: vscode.Uri): boolean {
        if (/(^|[\\/])(node_modules|\.git|dist|build)([\\/]|$)/i.test(uri.fsPath)) {
            return false;
        }
        // When scoped to a subfolder, only index files within that folder
        if (!this.isInScope(uri.fsPath)) {
            return false;
        }
        return true;
    }

    private queueFullReindex(reason: string): void {
        const rebuild = async () => {
            await this.buildIndex();
        };

        if (this._buildPromise) {
            void this._buildPromise
                .finally(() => rebuild())
                .catch(error => logger.warn(`[IndexManager] Failed to rebuild index after ${reason}: ${error instanceof Error ? error.message : String(error)}`));
            return;
        }

        void rebuild().catch(error =>
            logger.warn(`[IndexManager] Failed to rebuild index after ${reason}: ${error instanceof Error ? error.message : String(error)}`)
        );
    }

    /**
     * Setup file watcher for incremental updates
     */
    private setupFileWatcher(): void {
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(this.getWatcherGlob());

        // Debounced update function
        const queueUpdate = (uri: vscode.Uri) => {
            if (!this.shouldIndexFile(uri)) {
                return;
            }
            if (!this.updateQueue.has(uri.fsPath)) {
                this._changesSinceIndex++;
            }
            this.updateQueue.add(uri.fsPath);
            if (this.updateTimer) {
                clearTimeout(this.updateTimer);
            }
            this.updateTimer = setTimeout(() => {
                this.updateTimer = null;
                void this.processUpdateQueue();
            }, this.updateDebounceMs);
        };

        this.attachFileWatcherListeners(queueUpdate);

        // Recreate watcher when settings change
        this._configDisposable = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('sqlCrack.additionalFileExtensions')) {
                this.disposeFileWatcherResources();
                this.fileWatcher = vscode.workspace.createFileSystemWatcher(this.getWatcherGlob());
                this.attachFileWatcherListeners(queueUpdate);
                this.queueFullReindex('additionalFileExtensions change');
            }
        });
    }

    private attachFileWatcherListeners(queueUpdate: (uri: vscode.Uri) => void): void {
        if (!this.fileWatcher) {
            return;
        }

        this._fileWatcherDisposables.push(
            this.fileWatcher.onDidChange(uri => queueUpdate(uri)),
            this.fileWatcher.onDidCreate(uri => queueUpdate(uri)),
            // Deletes share the same debounce/drain as creates and changes. The
            // queue's stat preflight distinguishes a still-missing file from a
            // delete/recreate race and coalesces one panel refresh per drain.
            this.fileWatcher.onDidDelete(uri => queueUpdate(uri))
        );
    }

    private clearUpdateTimer(): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
    }

    private disposeFileWatcherResources(): void {
        this.clearUpdateTimer();
        for (const disposable of this._fileWatcherDisposables) {
            disposable.dispose();
        }
        this._fileWatcherDisposables = [];
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = null;
        }
    }

    /**
     * Process queued file updates.
     * Skips processing while a full build is in progress to avoid race conditions.
     */
    private async processUpdateQueue(): Promise<void> {
        if (this._queueProcessingPromise) {
            await this._queueProcessingPromise;
            return;
        }

        const run = async () => {
            this.beginIndexUpdateBatch();
            try {
                while (this.updateQueue.size > 0) {
                    if (this._buildPromise) {
                        // A full build is in progress — defer queue processing until it completes
                        await this._buildPromise;
                    }

                    const files = [...this.updateQueue];

                    for (const filePath of files) {
                        // Claim each queued path individually so files re-queued during processing
                        // remain in the set for a follow-up pass instead of being wiped up front.
                        if (!this.updateQueue.delete(filePath)) {
                            continue;
                        }
                        const uri = vscode.Uri.file(filePath);
                        if (!this.shouldIndexFile(uri)) {
                            this.markChangeProcessed();
                            continue;
                        }
                        try {
                            // Guard: skip if file was deleted while queued
                            try {
                                await vscode.workspace.fs.stat(uri);
                            } catch (e) {
                                if (this.isFileNotFoundError(e)) {
                                    logger.debug(`[IndexManager] Queued file no longer exists, removing: ${uri.fsPath}`);
                                    await this.removeFile(uri);
                                } else {
                                    // A provider outage or permission error is not
                                    // evidence of deletion. Retry through analyzeFile;
                                    // if it remains unreadable, updateFile preserves
                                    // and marks the last-known-good analysis.
                                    logger.debug(`[IndexManager] File stat failed, preserving until analysis retry: ${uri.fsPath} ${String(e)}`);
                                    await this.updateQueuedFile(uri);
                                }
                                continue;
                            }
                            await this.updateQueuedFile(uri);
                        } catch (err) {
                            logger.debug(`[IndexManager] Update failed for ${filePath}: ${err}`);
                        } finally {
                            this.markChangeProcessed();
                        }
                    }
                }
            } finally {
                this.endIndexUpdateBatch();
            }
        };

        this._queueProcessingPromise = run();
        try {
            await this._queueProcessingPromise;
        } finally {
            this._queueProcessingPromise = null;
            if (this.updateQueue.size > 0) {
                void this.processUpdateQueue();
            }
        }
    }

    private async waitForQueueToDrain(): Promise<void> {
        while (this._queueProcessingPromise) {
            await this._queueProcessingPromise;
        }
    }

    private markChangeProcessed(): void {
        if (this._changesSinceIndex > 0) {
            this._changesSinceIndex--;
        }
    }

    private isFileNotFoundError(error: unknown): boolean {
        if (!error || typeof error !== 'object') {
            return false;
        }
        const code = 'code' in error ? String(error.code) : '';
        return isFileNotFoundCode(code);
    }

    /**
     * Load cached index from workspace state
     */
    /**
     * The classification of the most recent {@link loadCachedIndex} attempt.
     * Exposed via {@link initialize} so callers can react to each case.
     */
    getLastCacheState(): WorkspaceCacheState {
        return this._lastCacheState;
    }

    private async loadCachedIndex(currentFileCount: number): Promise<WorkspaceIndex | null> {
        // Check advanced settings
        const config = vscode.workspace.getConfiguration('sqlCrack.advanced');
        const cacheTTLHours = config.get<number>('cacheTTLHours', DEFAULT_CACHE_TTL_HOURS);

        // If TTL is 0, caching is disabled
        if (cacheTTLHours === 0) {
            logger.debug('[IndexManager] Caching disabled (TTL=0) - rebuilding index');
            this._lastCacheState = 'disabled';
            return null;
        }

        const cached = this.context.workspaceState.get<SerializedWorkspaceIndex>('sqlWorkspaceIndex');

        if (!cached) {
            this._lastCacheState = 'missing';
            return null;
        }

        if (cached.version !== INDEX_VERSION) {
            logger.debug('[IndexManager] Cached index version mismatch - rebuilding index');
            this._lastCacheState = 'version-mismatch';
            return null;
        }

        // Reject caches built for a different scope, dialect, configuration, or
        // schema. Without this, switching scoped folders or dialects would serve
        // a stale index that belongs to a different identity.
        const currentIdentity = this.computeCacheIdentity();
        if (cached.identity !== currentIdentity) {
            logger.debug('[IndexManager] Cached index identity mismatch - rebuilding index');
            this._lastCacheState = 'identity-mismatch';
            return null;
        }

        // Oversized marker: a prior index was too large to persist. There is no
        // usable index to load, but this is distinct from "missing" so callers can
        // avoid re-prompting on every open.
        if (cached.oversized) {
            logger.debug('[IndexManager] Cached index marked oversized - index was not persisted');
            this._lastCacheState = 'oversized';
            return null;
        }

        // Check TTL
        const cacheTTLMs = cacheTTLHours * 60 * 60 * 1000;
        const cacheAge = Date.now() - cached.lastUpdated;
        if (cacheAge > cacheTTLMs) {
            logger.debug(`[IndexManager] Cache expired (age: ${Math.round(cacheAge / 3600000)}h, TTL: ${cacheTTLHours}h) - rebuilding index`);
            this._lastCacheState = 'stale';
            return null;
        }

        if (!(await this.isCachedIndexCurrent(cached, currentFileCount))) {
            logger.debug('[IndexManager] Cached index filesystem snapshot changed - rebuilding index');
            this._lastCacheState = 'stale';
            return null;
        }

        // Reconstruct Maps from arrays
        // Handle backward compatibility: fileHashesArray may not exist in old cache
        const fileHashesArray = cached.fileHashesArray || [];
        const rawDefinitionArray = (cached.definitionArray || []) as [string, SchemaDefinition[] | SchemaDefinition][];
        const definitionArray: [string, SchemaDefinition[]][] = rawDefinitionArray.map(([key, value]) => {
            return [key, Array.isArray(value) ? value : [value]];
        });

        logger.debug(`[IndexManager] Using cached index (age: ${Math.round(cacheAge / 3600000)}h)`);
        this._lastCacheState = 'valid';
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

    private async isCachedIndexCurrent(cached: SerializedWorkspaceIndex, currentFileCount: number): Promise<boolean> {
        if (cached.fileCount !== currentFileCount) {
            return false;
        }

        const cachedFiles = cached.filesArray || [];
        if (cachedFiles.length !== cached.fileCount) {
            return false;
        }

        const cachedHashes = new Map(cached.fileHashesArray || []);
        let nextFileIndex = 0;
        let validationFailed = false;

        const validateNextFiles = async (): Promise<void> => {
            while (!validationFailed) {
                const currentIndex = nextFileIndex++;
                if (currentIndex >= cachedFiles.length) {
                    return;
                }

                const [filePath, analysis] = cachedFiles[currentIndex];
                const cachedHash = cachedHashes.get(filePath) || analysis.contentHash;

                try {
                    const uri = vscode.Uri.file(filePath);
                    const stat = await vscode.workspace.fs.stat(uri);
                    if (analysis.skippedReason === 'tooLarge') {
                        if (analysis.fileSize !== stat.size || analysis.lastModified !== stat.mtime) {
                            validationFailed = true;
                        }
                        continue;
                    }
                    // Preserved read-error entries retain the last-known-good
                    // hash and can be verified like any other cached analysis.
                    if (!cachedHash) {
                        validationFailed = true;
                        return;
                    }
                    const currentHash = await this.computeCurrentContentHash(uri, stat.size);
                    if (currentHash !== cachedHash) {
                        validationFailed = true;
                        return;
                    }
                } catch (error) {
                    if (this.isFileNotFoundError(error)) {
                        validationFailed = true;
                        return;
                    }
                    // If the provider is still unavailable, a preserved-error
                    // entry is safer and more useful than discarding the entire
                    // last-known-good workspace index. Its warning remains
                    // visible until a successful refresh verifies/replaces it.
                    if (analysis.readError && cachedHash) {
                        continue;
                    }
                    validationFailed = true;
                    return;
                }
            }
        };

        const concurrency = Math.max(
            1,
            Math.min(MAX_CACHE_VALIDATION_CONCURRENCY, cachedFiles.length)
        );
        await Promise.all(Array.from({ length: concurrency }, () => validateNextFiles()));
        return !validationFailed;
    }

    private async computeCurrentContentHash(uri: vscode.Uri, expectedSize: number): Promise<string> {
        const bytes = await vscode.workspace.fs.readFile(uri);
        let text: string;
        if (bytes.length === 0 && expectedSize > 0) {
            const document = await vscode.workspace.openTextDocument(uri);
            text = document.getText();
        } else {
            text = new TextDecoder('utf-8').decode(bytes);
            if (text.charCodeAt(0) === 0xFEFF) {
                text = text.slice(1);
            }
            if (text.includes('\uFFFD')) {
                const document = await vscode.workspace.openTextDocument(uri);
                text = document.getText();
            }
        }

        return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
    }

    /**
     * Persist index to workspace state
     */
    private schedulePersist(delayMs: number = this._persistDebounceMs): void {
        if (this._disposed) {
            return;
        }
        if (this._persistTimer) {
            clearTimeout(this._persistTimer);
        }
        this._persistTimer = setTimeout(() => {
            this._persistTimer = null;
            void this.persistIndex();
        }, delayMs);
    }

    private estimateValueSizeBytes(value: unknown): number {
        try {
            return Buffer.byteLength(JSON.stringify(value), 'utf8');
        } catch {
            return 0;
        }
    }

    private estimateSerializedIndexSizeBytes(serializable: SerializedWorkspaceIndex): number {
        let total = 256; // object keys, delimiters, and structure overhead

        total += this.estimateValueSizeBytes(serializable.version);
        total += this.estimateValueSizeBytes(serializable.lastUpdated);
        total += this.estimateValueSizeBytes(serializable.fileCount);

        for (const [filePath, analysis] of serializable.filesArray) {
            total += Buffer.byteLength(filePath, 'utf8');
            total += this.estimateValueSizeBytes(analysis);
        }
        for (const [filePath, hash] of serializable.fileHashesArray) {
            total += Buffer.byteLength(filePath, 'utf8');
            total += Buffer.byteLength(hash, 'utf8');
        }
        for (const [key, defs] of serializable.definitionArray) {
            total += Buffer.byteLength(key, 'utf8');
            total += this.estimateValueSizeBytes(defs);
        }
        for (const [key, refs] of serializable.referenceArray) {
            total += Buffer.byteLength(key, 'utf8');
            total += this.estimateValueSizeBytes(refs);
        }

        return total;
    }

    private async persistIndex(): Promise<void> {
        if (this._disposed || !this.index) {return;}

        // Convert Maps to arrays for JSON serialization
        const serializable: SerializedWorkspaceIndex = {
            version: this.index.version,
            identity: this.computeCacheIdentity(),
            lastUpdated: this.index.lastUpdated,
            fileCount: this.index.fileCount,
            filesArray: [...this.index.files.entries()],
            fileHashesArray: [...this.index.fileHashes.entries()],
            definitionArray: [...this.index.definitionMap.entries()],
            referenceArray: [...this.index.referenceMap.entries()]
        };

        // Guard against oversized cache entries that can exceed VS Code storage limits
        const sizeBytes = this.estimateSerializedIndexSizeBytes(serializable);
        if (sizeBytes > DEFAULT_MAX_CACHE_BYTES) {
            logger.warn(`[IndexManager] Skipping cache persist (${Math.round(sizeBytes / 1024)}KB > ${Math.round(DEFAULT_MAX_CACHE_BYTES / 1024)}KB).`);
            vscode.window.showWarningMessage(
                `SQL Crack: Workspace index (${Math.round(sizeBytes / 1024)}KB) exceeds the ${Math.round(DEFAULT_MAX_CACHE_BYTES / 1024 / 1024)}MB cache limit. ` +
                'The index will not persist across restarts. Consider excluding generated SQL folders or reducing workspace file scope.'
            );
            // Persist a lightweight marker (no payload arrays) so the next session
            // can tell this apart from a missing cache and skip re-prompting.
            const marker: SerializedWorkspaceIndex = {
                version: serializable.version,
                identity: serializable.identity,
                oversized: true,
                lastUpdated: serializable.lastUpdated,
                fileCount: serializable.fileCount,
                filesArray: [],
                fileHashesArray: [],
                definitionArray: [],
                referenceArray: []
            };
            try {
                await this.context.workspaceState.update('sqlWorkspaceIndex', marker);
            } catch (error) {
                logger.warn(`[IndexManager] Failed to persist oversized marker: ${error instanceof Error ? error.message : String(error)}`);
            }
            return;
        }

        try {
            await this.context.workspaceState.update('sqlWorkspaceIndex', serializable);
        } catch (error) {
            logger.warn(`[IndexManager] Failed to persist index cache: ${error instanceof Error ? error.message : String(error)}`);
        }
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
        logger.debug('[IndexManager] Cache cleared');
    }
}
