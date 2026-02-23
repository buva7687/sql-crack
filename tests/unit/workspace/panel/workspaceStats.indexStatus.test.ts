import { buildIndexStatus } from '../../../../src/workspace/panel/workspaceStats';

describe('workspaceStats buildIndexStatus', () => {
    it('returns missing state when index is not available', () => {
        const status = buildIndexStatus(null, 0);

        expect(status.level).toBe('missing');
        expect(status.text).toBe('Index not ready');
    });

    it('marks fresh index as stale when pending changes exist', () => {
        const index = {
            lastUpdated: Date.now() - (2 * 60 * 1000),
            fileCount: 4,
        } as any;

        const status = buildIndexStatus(index, 2);

        expect(status.level).toBe('stale');
        expect(status.text).toContain('(2 changed)');
        expect(status.title).toContain('2 file changes since last index');
    });

    it('keeps clean index text free of changed-count suffix when no pending changes exist', () => {
        const index = {
            lastUpdated: Date.now() - (2 * 60 * 1000),
            fileCount: 1,
        } as any;

        const status = buildIndexStatus(index, 0);

        expect(status.text).toMatch(/^Indexed /);
        expect(status.text).not.toContain('changed');
        expect(status.title).toContain('1 file');
    });
});
