import { createCspNonce } from '../../nonce';

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

export function escapeHtmlText(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function generateNonce(): string {
    return createCspNonce();
}
