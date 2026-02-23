/**
 * Script fragment: shared HTML escaping helpers for generated script blocks.
 */
export function getUtilityScriptFragment(): string {
    return `
        function escapeHtml(text) {
            return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function escapeHtmlAttr(text) {
            return escapeHtml(text).replace(/"/g, '&quot;');
        }

        function escapeHtmlSafe(text) {
            return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        }

        function trackUxEvent(eventName, metadata) {
            if (!eventName || typeof eventName !== 'string') {
                return;
            }

            const payload = { command: 'trackUxEvent', event: eventName };
            if (metadata && typeof metadata === 'object') {
                const sanitized = {};
                let count = 0;
                Object.entries(metadata).forEach(([key, value]) => {
                    if (count >= 8) {
                        return;
                    }
                    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                        sanitized[key] = value;
                        count += 1;
                    }
                });
                if (Object.keys(sanitized).length > 0) {
                    payload.metadata = sanitized;
                }
            }

            vscode.postMessage(payload);
        }
    `;
}
