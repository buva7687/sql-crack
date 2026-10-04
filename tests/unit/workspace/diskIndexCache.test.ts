import * as vscode from 'vscode';
import { gzipSync } from 'zlib';
import { DiskIndexCache } from '../../../src/workspace/diskIndexCache';
import type { SerializedWorkspaceIndex } from '../../../src/workspace/types';

describe('disk workspace index cache', () => {
    const index: SerializedWorkspaceIndex = {
        version: 8, identity: 'workspace-identity', lastUpdated: 123, fileCount: 0,
        filesArray: [], fileHashesArray: [], definitionArray: [], referenceArray: [],
    };
    let cache: DiskIndexCache;
    let disk: Map<string, Uint8Array>;
    beforeEach(() => {
        jest.clearAllMocks();
        disk = new Map();
        cache = new DiskIndexCache(vscode.Uri.file('/storage'));
        (vscode.workspace.fs.createDirectory as jest.Mock).mockResolvedValue(undefined);
        (vscode.workspace.fs.writeFile as jest.Mock).mockImplementation(async (uri: vscode.Uri, data: Uint8Array) => {
            disk.set(uri.toString(), data);
        });
        (vscode.workspace.fs.readFile as jest.Mock).mockImplementation(async (uri: vscode.Uri) => {
            if (!disk.has(uri.toString())) { throw new Error('FileNotFound'); }
            return disk.get(uri.toString());
        });
        (vscode.workspace.fs.rename as jest.Mock).mockImplementation(async (from: vscode.Uri, to: vscode.Uri) => {
            disk.set(to.toString(), disk.get(from.toString())!);
            disk.delete(from.toString());
        });
        (vscode.workspace.fs.delete as jest.Mock).mockImplementation(async (uri: vscode.Uri) => { disk.delete(uri.toString()); });
        (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({ size: 1024 });
    });

    it('writes compressed data atomically and restores its content', async () => {
        await cache.write(index);
        expect(vscode.workspace.fs.rename).toHaveBeenCalledWith(expect.anything(), expect.anything(), { overwrite: true });
        expect(disk.size).toBe(1);
        expect(await cache.read()).toEqual(index);
        await cache.remove();
        expect(disk.size).toBe(0);
    });

    it('keeps the previous cache when a replacement fails', async () => {
        await cache.write(index);
        (vscode.workspace.fs.rename as jest.Mock).mockRejectedValueOnce(new Error('Disk full'));
        await expect(cache.write({ ...index, lastUpdated: 456 })).rejects.toThrow('Disk full');
        expect(disk.size).toBe(1);
        expect(await cache.read()).toEqual(index);
    });

    it('rejects corrupt and malformed cached payloads', async () => {
        await cache.write(index);
        const uri = Array.from(disk.keys())[0];
        disk.set(uri, Buffer.from('broken gzip'));
        await expect(cache.read()).rejects.toThrow();
        disk.set(uri, gzipSync(JSON.stringify({ ...index, filesArray: [null] })));
        await expect(cache.read()).rejects.toThrow('Invalid workspace disk cache');
    });

    it('rejects oversized files before reading them', async () => {
        (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({ size: 17 * 1024 * 1024 });
        await expect(cache.read()).rejects.toThrow('too large');
        expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
    });

    it('handles missing workspace storage explicitly', async () => {
        const unavailable = new DiskIndexCache(undefined);
        await expect(unavailable.write(index)).rejects.toThrow('unavailable');
        await expect(unavailable.read()).rejects.toThrow('unavailable');
        await unavailable.remove();
    });
});
