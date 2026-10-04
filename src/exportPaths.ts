import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

/** Save beside the source document, workspace, or home rather than filesystem root. */
export function getExportDefaultUri(filename: string, source?: vscode.Uri): vscode.Uri {
    const basename = path.basename(filename.replace(/\\/g, '/'));
    if (source && source.scheme !== 'untitled') {
        return vscode.Uri.joinPath(source, '..', basename);
    }
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    return folder ? vscode.Uri.joinPath(folder, basename) : vscode.Uri.file(path.join(os.homedir(), basename));
}
