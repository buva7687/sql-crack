import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { getExportDefaultUri } from '../../src/exportPaths';
it('places exports beside the SQL source and strips paths from suggested names', () => {
    const source = vscode.Uri.file('/workspace/queries/q.sql');
    expect(getExportDefaultUri('diagram.pdf', source).fsPath).toBe('/workspace/queries/diagram.pdf');
    expect(getExportDefaultUri('..\\elsewhere\\diagram.pdf', source).fsPath).toBe('/workspace/queries/diagram.pdf');
});
it('uses the workspace or home for documents without a filesystem directory', () => {
    const folders = vscode.workspace.workspaceFolders;
    try {
        (vscode.workspace as any).workspaceFolders = [{uri: vscode.Uri.file('/workspace')}];
        expect(getExportDefaultUri('graph.svg').fsPath).toBe('/workspace/graph.svg');
        (vscode.workspace as any).workspaceFolders = undefined;
        expect(getExportDefaultUri('graph.svg').fsPath).toBe(path.join(os.homedir(), 'graph.svg'));
    } finally {(vscode.workspace as any).workspaceFolders = folders;}
});
