export interface RelativeTimeOptions {
    showMonths?: boolean;
}

export function formatRelativeTime(timestamp: number, options: RelativeTimeOptions = {}): string {
    // A non-finite timestamp propagates NaN through every branch below and
    // renders as "NaNd ago"; fail closed with a readable label instead.
    if (!Number.isFinite(timestamp)) {
        return 'unknown';
    }
    const now = Date.now();
    const diffMs = Math.max(0, now - timestamp);
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) {
        return 'just now';
    }
    if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (options.showMonths && diffDays >= 30) {
        return `${Math.floor(diffDays / 30)}mo ago`;
    }
    return `${diffDays}d ago`;
}
