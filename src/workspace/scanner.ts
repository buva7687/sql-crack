// Workspace Scanner - Find and analyze SQL files

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { ProgressCallback, CancellationToken } from './types';
import {
    FileAnalysis,
    SqlDialect,
    SchemaExtractor,
    ReferenceExtractor
} from './extraction';

/**
 * Scans workspace for SQL files and analyzes them
 */
export class WorkspaceScanner {
    private schemaExtractor: SchemaExtractor;
    private referenceExtractor: ReferenceExtractor;
    private dialect: SqlDialect;
    private maxFileSize: number;
    private scopeUri: vscode.Uri | undefined;
    private readonly maxConcurrentAnalyses = 4;

    constructor(dialect: SqlDialect = 'MySQL', maxFileSize: number = 10 * 1024 * 1024, scopeUri?: vscode.Uri) {
        this.schemaExtractor = new SchemaExtractor();
        this.referenceExtractor = new ReferenceExtractor();
        this.dialect = dialect;
        this.maxFileSize = maxFileSize; // Default 10MB
        this.scopeUri = scopeUri;
    }

    /**
     * Get the list of file extensions to scan, including .sql and any
     * additional extensions configured in settings.
     */
    private getSqlExtensions(): string[] {
        const extensions = ['sql']; // Always include .sql
        const config = vscode.workspace.getConfiguration('sqlCrack');
        const additionalExtensions = config.get<string[]>('additionalFileExtensions') || [];

        for (const ext of additionalExtensions) {
            // Normalize: remove leading dot if present, convert to lowercase
            const normalized = ext.toLowerCase().trim().replace(/^\./, '');
            if (normalized && !extensions.includes(normalized)) {
                extensions.push(normalized);
            }
        }

        return extensions;
    }

    /**
     * Find all SQL files in the workspace, including files with extensions
     * configured in additionalFileExtensions setting.
     */
    async findSqlFiles(): Promise<vscode.Uri[]> {
        const extensions = this.getSqlExtensions();

        // Build glob pattern: **/*.{sql,hql,bteq,...}
        const rawPattern = extensions.length === 1
            ? `**/*.${extensions[0]}`
            : `**/*.{${extensions.join(',')}}`;

        // If scoped to a subfolder, use RelativePattern to restrict search
        const pattern = this.scopeUri
            ? new vscode.RelativePattern(this.scopeUri, rawPattern)
            : rawPattern;

        const files = await vscode.workspace.findFiles(
            pattern,
            '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**}'
        );
        return files;
    }

    /**
     * Get count of SQL files in workspace
     */
    async getFileCount(): Promise<number> {
        const files = await this.findSqlFiles();
        return files.length;
    }

    /**
     * Generate SHA-256 hash of file content
     * Using Node's built-in crypto module for security and reliability
     */
    private generateContentHash(content: string): string {
        return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    }

    private decodeSqlContent(bytes: Uint8Array): string {
        let text = new TextDecoder('utf-8').decode(bytes);
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }
        return text;
    }

    private async readSqlText(uri: vscode.Uri, expectedSize: number): Promise<string> {
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (bytes.length === 0 && expectedSize > 0) {
            const document = await vscode.workspace.openTextDocument(uri);
            return document.getText();
        }

        const decoded = this.decodeSqlContent(bytes);
        if (decoded.includes('\uFFFD')) {
            const document = await vscode.workspace.openTextDocument(uri);
            return document.getText();
        }

        return decoded;
    }

    /**
     * Analyze a single SQL file
     */
    async analyzeFile(uri: vscode.Uri): Promise<FileAnalysis> {
        const filePath = uri.fsPath;
        const fileName = path.basename(filePath);

        try {
            // Check file size first
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.size > this.maxFileSize) {
                return {
                    filePath,
                    fileName,
                    lastModified: stat.mtime,
                    contentHash: '',
                    definitions: [],
                    references: [],
                    parseError: `File too large (${Math.round(stat.size / 1024 / 1024)}MB > ${Math.round(this.maxFileSize / 1024 / 1024)}MB limit)`
                };
            }

            // Read file content without creating a TextDocument model unless decoding needs a fallback.
            const sql = await this.readSqlText(uri, stat.size);

            // Generate content hash for change detection
            const contentHash = this.generateContentHash(sql);

            // Extract definitions and references
            const definitions = this.schemaExtractor.extractDefinitions(sql, filePath, this.dialect);
            const references = this.referenceExtractor.extractReferences(sql, filePath, this.dialect);

            return {
                filePath,
                fileName,
                lastModified: stat.mtime,
                contentHash,
                definitions,
                references
            };
        } catch (error) {
            return {
                filePath,
                fileName,
                lastModified: Date.now(),
                contentHash: '',
                definitions: [],
                references: [],
                parseError: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Analyze all SQL files in the workspace
     * Supports cancellation via token
     */
    async analyzeWorkspace(
        progressCallback?: ProgressCallback,
        cancellationToken?: CancellationToken
    ): Promise<FileAnalysis[]> {
        const files = await this.findSqlFiles();
        if (files.length === 0) {
            return [];
        }

        const results: Array<FileAnalysis | undefined> = new Array(files.length);
        const concurrency = Math.max(1, Math.min(this.maxConcurrentAnalyses, files.length));
        let nextIndex = 0;

        const runWorker = async (): Promise<void> => {
            while (true) {
                if (cancellationToken?.isCancellationRequested) {
                    return;
                }

                const currentIndex = nextIndex;
                nextIndex++;

                if (currentIndex >= files.length) {
                    return;
                }

                const file = files[currentIndex];
                const fileName = path.basename(file.fsPath);

                if (progressCallback) {
                    progressCallback(currentIndex + 1, files.length, fileName);
                }

                const analysis = await this.analyzeFile(file);
                results[currentIndex] = analysis;
            }
        };

        const workers = Array.from({ length: concurrency }, () => runWorker());
        await Promise.all(workers);

        return results.filter((analysis): analysis is FileAnalysis => analysis !== undefined);
    }

    /**
     * Set the SQL dialect for parsing
     */
    setDialect(dialect: SqlDialect): void {
        this.dialect = dialect;
    }

    /**
     * Get current dialect
     */
    getDialect(): SqlDialect {
        return this.dialect;
    }
}
