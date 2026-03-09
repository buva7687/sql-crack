import type {
    WorkspaceRecoveryReason,
    WorkspaceRequestId,
    WorkspaceHostMessage,
    WorkspaceWebviewMessage,
} from '../../shared/messages';

export interface MissingDataReasonOptions {
    changesSinceIndex: number;
    parseErrorCount: number;
    requestedNodeType?: string;
    knownMissingDueToScope?: boolean;
}

export function getWorkspaceRequestId(message: WorkspaceWebviewMessage): WorkspaceRequestId | undefined {
    const candidate = (message as { requestId?: unknown }).requestId;
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
        return undefined;
    }
    const normalized = Math.floor(candidate);
    return normalized >= 0 ? normalized : undefined;
}

export function attachWorkspaceRequestId<T extends WorkspaceHostMessage>(message: T, requestId?: WorkspaceRequestId): T {
    if (typeof requestId !== 'number') {
        return message;
    }
    return {
        ...message,
        data: {
            ...('data' in message && message.data ? message.data : {}),
            requestId,
        },
    } as T;
}

export function inferMissingDataReason(options: MissingDataReasonOptions): WorkspaceRecoveryReason {
    if (options.changesSinceIndex > 0) {
        return 'stale_index';
    }
    if (options.knownMissingDueToScope) {
        return 'excluded_file';
    }
    if ((options.requestedNodeType || '').toLowerCase() === 'external') {
        return 'external_unresolved';
    }
    if (options.parseErrorCount > 0) {
        return 'parse_error';
    }
    return 'not_found';
}
