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
    `;
}
