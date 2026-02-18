/**
 * WorkspaceScanner Scope Tests
 *
 * Tests that the scanner correctly scopes file discovery when a scopeUri
 * is provided (e.g., when user right-clicks a subfolder in the explorer).
 */

import * as vscode from 'vscode';
import { WorkspaceScanner } from '../../../src/workspace/scanner';
import {
    __setMockConfig,
    __resetMockConfig,
    RelativePattern
} from '../../__mocks__/vscode';

jest.mock('vscode');

describe('WorkspaceScanner - subfolder scoping', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        __resetMockConfig();
    });

    it('should use plain glob pattern when no scopeUri is provided', async () => {
        const scanner = new WorkspaceScanner('MySQL');
        (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);

        await scanner.findSqlFiles();

        expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
            '**/*.sql',
            expect.any(String)
        );
    });

    it('should use RelativePattern when scopeUri is provided', async () => {
        const scopeUri = vscode.Uri.file('/workspace/examples/sample_queries');
        const scanner = new WorkspaceScanner('MySQL', undefined, scopeUri);
        (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);

        await scanner.findSqlFiles();

        const callArg = (vscode.workspace.findFiles as jest.Mock).mock.calls[0][0];
        expect(callArg).toBeInstanceOf(RelativePattern);
        expect(callArg.base).toBe('/workspace/examples/sample_queries');
        expect(callArg.pattern).toBe('**/*.sql');
    });

    it('should use RelativePattern with multiple extensions when scopeUri is set', async () => {
        __setMockConfig('sqlCrack', {
            additionalFileExtensions: ['hql', 'bteq']
        });

        const scopeUri = vscode.Uri.file('/workspace/subfolder');
        const scanner = new WorkspaceScanner('MySQL', undefined, scopeUri);
        (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);

        await scanner.findSqlFiles();

        const callArg = (vscode.workspace.findFiles as jest.Mock).mock.calls[0][0];
        expect(callArg).toBeInstanceOf(RelativePattern);
        expect(callArg.base).toBe('/workspace/subfolder');
        expect(callArg.pattern).toBe('**/*.{sql,hql,bteq}');
    });

    it('should still apply exclude pattern when scoped', async () => {
        const scopeUri = vscode.Uri.file('/workspace/subfolder');
        const scanner = new WorkspaceScanner('MySQL', undefined, scopeUri);
        (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);

        await scanner.findSqlFiles();

        expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
            expect.any(RelativePattern),
            '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**}'
        );
    });

    it('should return only files found within the scoped folder', async () => {
        const scopeUri = vscode.Uri.file('/workspace/subfolder');
        const scanner = new WorkspaceScanner('MySQL', undefined, scopeUri);

        const scopedFiles = [
            vscode.Uri.file('/workspace/subfolder/query1.sql'),
            vscode.Uri.file('/workspace/subfolder/nested/query2.sql'),
        ];
        (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(scopedFiles);

        const files = await scanner.findSqlFiles();

        expect(files).toHaveLength(2);
        expect(files[0].fsPath).toBe('/workspace/subfolder/query1.sql');
        expect(files[1].fsPath).toBe('/workspace/subfolder/nested/query2.sql');
    });
});
