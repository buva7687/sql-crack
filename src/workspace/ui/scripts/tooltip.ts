export function getTooltipScriptFragment(): string {
    return `
        // ========== Tooltip Functions ==========
        function sanitizeTooltipHtml(html) {
            // Escape everything first, then restore only known-safe tooltip tags
            var div = document.createElement('div');
            div.textContent = html;
            var safe = div.innerHTML;
            // Restore only the structural tags used by tooltip content:
            // <div class="tooltip-*">, <ul class="tooltip-list">, <li>, <strong>, <span>
            // Opening tags with optional class attribute only (no style — tooltips use CSS classes)
            safe = safe.replace(/&lt;(div|ul|li|strong|span)(\\s+class=&quot;[^&]*?&quot;)*\\s*&gt;/gi, function(m, tag, attrs) {
                var restored = '<' + tag;
                if (attrs) restored += attrs.replace(/&quot;/g, '"');
                return restored + '>';
            });
            // Closing tags
            safe = safe.replace(/&lt;\\\/(div|ul|li|strong|span)&gt;/gi, '</$1>');
            // Safety net: strip any remaining on* event handler attributes
            safe = safe.replace(/\\s+on\\w+\\s*=\\s*(?:&quot;[^&]*&quot;|'[^']*'|[^\\s>]+)/gi, '');
            return safe;
        }
        function showTooltip(e, content) {
            tooltip.innerHTML = sanitizeTooltipHtml(content);
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 12) + 'px';
            tooltip.style.top = (e.clientY + 12) + 'px';
        }

        function hideTooltip() {
            tooltip.style.display = 'none';
        }
    `;
}
