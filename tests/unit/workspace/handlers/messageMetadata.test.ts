import {
    attachWorkspaceRequestId,
    getWorkspaceRequestId,
    inferMissingDataReason,
} from '../../../../src/workspace/handlers/messageMetadata';

describe('workspace message metadata helpers', () => {
    it('normalizes valid request ids and ignores invalid values', () => {
        expect(getWorkspaceRequestId({ command: 'switchToImpactView', requestId: 7 } as any)).toBe(7);
        expect(getWorkspaceRequestId({ command: 'switchToImpactView', requestId: 7.9 } as any)).toBe(7);
        expect(getWorkspaceRequestId({ command: 'switchToImpactView', requestId: -1 } as any)).toBeUndefined();
        expect(getWorkspaceRequestId({ command: 'switchToImpactView' } as any)).toBeUndefined();
    });

    it('attaches request ids to host payload messages without mutating other fields', () => {
        expect(attachWorkspaceRequestId({
            command: 'impactFormResult',
            data: { html: '<div>impact</div>' },
        } as any, 11)).toEqual({
            command: 'impactFormResult',
            data: { html: '<div>impact</div>', requestId: 11 },
        });
    });

    it('infers recovery reasons in priority order', () => {
        expect(inferMissingDataReason({
            changesSinceIndex: 2,
            parseErrorCount: 4,
        })).toBe('stale_index');
        expect(inferMissingDataReason({
            changesSinceIndex: 0,
            parseErrorCount: 0,
            knownMissingDueToScope: true,
        })).toBe('excluded_file');
        expect(inferMissingDataReason({
            changesSinceIndex: 0,
            parseErrorCount: 0,
            requestedNodeType: 'external',
        })).toBe('external_unresolved');
        expect(inferMissingDataReason({
            changesSinceIndex: 0,
            parseErrorCount: 2,
        })).toBe('parse_error');
        expect(inferMissingDataReason({
            changesSinceIndex: 0,
            parseErrorCount: 0,
        })).toBe('not_found');
    });
});
