export type WorkspaceRequestId = number;

export type WorkspaceRecoveryReason =
    | 'stale_index'
    | 'parse_error'
    | 'excluded_file'
    | 'external_unresolved'
    | 'not_found';

export interface WorkspaceErrorPayload {
    error: string;
    reason?: WorkspaceRecoveryReason;
}
