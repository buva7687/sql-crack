import * as vscode from 'vscode';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import type { SerializedWorkspaceIndex } from './types';

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const MAX_RAW_BYTES = 64 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 16 * 1024 * 1024;

/** Large indexes belong in extension storage, not VS Code's workspace-state database. */
export class DiskIndexCache {
    constructor(private readonly storageUri: vscode.Uri | undefined) {}

    private get uri(): vscode.Uri | undefined {
        return this.storageUri && vscode.Uri.joinPath(this.storageUri, 'sql-workspace-index.json.gz');
    }

    async write(index: SerializedWorkspaceIndex): Promise<void> {
        if (!this.storageUri || !this.uri) {
            throw new Error('Workspace extension storage is unavailable');
        }
        const json = JSON.stringify(index);
        if (Buffer.byteLength(json, 'utf8') > MAX_RAW_BYTES) {
            throw new Error('Workspace disk cache exceeds its 64 MiB limit');
        }
        const data = await compress(json);
        if (data.length > MAX_COMPRESSED_BYTES) {
            throw new Error('Compressed workspace cache exceeds its 16 MiB limit');
        }
        const temporary = vscode.Uri.joinPath(this.storageUri, 'sql-workspace-index.json.gz.tmp');
        await vscode.workspace.fs.createDirectory(this.storageUri);
        await vscode.workspace.fs.writeFile(temporary, data);
        try {
            await vscode.workspace.fs.rename(temporary, this.uri, { overwrite: true });
        } finally {
            await vscode.workspace.fs.delete(temporary).then(undefined, () => undefined);
        }
    }

    async read(): Promise<SerializedWorkspaceIndex> {
        if (!this.uri) { throw new Error('Workspace extension storage is unavailable'); }
        const stat = await vscode.workspace.fs.stat(this.uri);
        if (stat.size > MAX_COMPRESSED_BYTES) { throw new Error('Workspace disk cache is too large'); }
        const data = await vscode.workspace.fs.readFile(this.uri);
        if (data.length > MAX_COMPRESSED_BYTES) { throw new Error('Workspace disk cache is too large'); }
        const json = await decompress(data, { maxOutputLength: MAX_RAW_BYTES });
        const index: SerializedWorkspaceIndex = JSON.parse(json.toString('utf8'));
        const hasPairs = (value: unknown, validValue: (entry: unknown) => boolean): boolean =>
            Array.isArray(value) && value.every(pair => Array.isArray(pair) && pair.length === 2
                && typeof pair[0] === 'string' && validValue(pair[1]));
        const isObject = (value: unknown): boolean => value !== null && typeof value === 'object' && !Array.isArray(value);
        const isObjectList = (value: unknown): boolean => Array.isArray(value) && value.every(isObject);
        if (!index || !hasPairs(index.filesArray, value => isObject(value)
            && isObjectList((value as SerializedWorkspaceIndex['filesArray'][number][1]).definitions)
            && isObjectList((value as SerializedWorkspaceIndex['filesArray'][number][1]).references))
            || !hasPairs(index.fileHashesArray, value => typeof value === 'string')
            || !hasPairs(index.definitionArray, isObjectList) || !hasPairs(index.referenceArray, isObjectList)) {
            throw new Error('Invalid workspace disk cache');
        }
        return index;
    }

    async remove(): Promise<void> {
        if (this.uri) {
            await vscode.workspace.fs.delete(this.uri).then(undefined, () => undefined);
        }
    }
}
