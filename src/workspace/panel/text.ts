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

export function escapeForInlineScriptValue(value: unknown): string {
    const json = JSON.stringify(value);
    return json
        .replace(/<\/script/gi, '<\\/script')
        .replace(/<!--/g, '<\\!--')
        .replace(/-->/g, '--\\>')
        .replace(/\]\]>/g, ']\\]>');
}

export function generateNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
