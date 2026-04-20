export function getTooltipScriptFragment(): string {
    return `
        // ========== Tooltip Functions ==========
        function sanitizeTooltipHtml(html) {
            const template = document.createElement('template');
            template.innerHTML = typeof html === 'string' ? html : '';

            const allowedTags = new Set(['DIV', 'UL', 'LI', 'STRONG', 'SPAN', 'BR']);
            const blockedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM']);
            const allowedClassPattern = /^[a-z0-9_-]+$/i;

            function sanitizeNode(node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    return document.createTextNode(node.textContent || '');
                }

                if (node.nodeType !== Node.ELEMENT_NODE) {
                    return document.createDocumentFragment();
                }

                const element = node;
                if (blockedTags.has(element.tagName)) {
                    return document.createDocumentFragment();
                }
                if (!allowedTags.has(element.tagName)) {
                    const fragment = document.createDocumentFragment();
                    Array.from(element.childNodes).forEach((child) => {
                        fragment.appendChild(sanitizeNode(child));
                    });
                    return fragment;
                }

                const clean = document.createElement(element.tagName.toLowerCase());
                const className = element.getAttribute('class') || '';
                const safeClassName = className
                    .split(/\\s+/)
                    .filter((token) => allowedClassPattern.test(token))
                    .join(' ');
                if (safeClassName) {
                    clean.setAttribute('class', safeClassName);
                }

                Array.from(element.childNodes).forEach((child) => {
                    clean.appendChild(sanitizeNode(child));
                });

                return clean;
            }

            const container = document.createElement('div');
            Array.from(template.content.childNodes).forEach((child) => {
                container.appendChild(sanitizeNode(child));
            });
            return container.innerHTML;
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
