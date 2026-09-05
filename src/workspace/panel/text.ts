import { createCspNonce } from '../../nonce';
import { escapeHtml } from '../../shared/stringUtils';

// Canonical inline-script escaper lives in shared/stringUtils; re-exported here
// for existing workspace-panel importers.
export { escapeForInlineScriptValue } from '../../shared/stringUtils';

export function formatDurationText(ms: number): string {
    if (ms < 1000) {
        return '<1s';
    }
    if (ms < 60000) {
        return `${Math.round(ms / 1000)}s`;
    }
    return `${Math.round(ms / 60000)}m`;
}

export const escapeHtmlText = escapeHtml;

export function generateNonce(): string {
    return createCspNonce();
}
