// Workspace Scanner - Find and analyze SQL files

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { ProgressCallback } from './types';
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

    constructor(dialect: SqlDialect = 'MySQL', maxFileSize: number = 10 * 1024 * 1024) {
        this.schemaExtractor = new SchemaExtractor();
        this.referenceExtractor = new ReferenceExtractor();
        this.dialect = dialect;
        this.maxFileSize = maxFileSize; // Default 10MB
    }

    /**
     * Find all SQL files in the workspace
     */
    async findSqlFiles(): Promise<vscode.Uri[]> {
        const files = await vscode.workspace.findFiles(
            '**/*.sql',
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

            // Read file content
            const document = await vscode.workspace.openTextDocument(uri);
            const sql = document.getText();

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
     */
    async analyzeWorkspace(progressCallback?: ProgressCallback): Promise<FileAnalysis[]> {
        const files = await this.findSqlFiles();
        const results: FileAnalysis[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileName = path.basename(file.fsPath);

            if (progressCallback) {
                progressCallback(i + 1, files.length, fileName);
            }

            const analysis = await this.analyzeFile(file);
            results.push(analysis);
        }

        return results;
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
