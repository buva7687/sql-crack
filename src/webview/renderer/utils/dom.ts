// DOM utility functions

export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) { return str; }
    return str.substring(0, maxLen - 1) + '…';
}

export function createSvgElement<K extends keyof SVGElementTagNameMap>(
    tagName: K
): SVGElementTagNameMap[K] {
    return document.createElementNS('http://www.w3.org/2000/svg', tagName);
}

export function setAttributes(element: Element, attrs: Record<string, string | number>): void {
    for (const [key, value] of Object.entries(attrs)) {
        element.setAttribute(key, String(value));
    }
}
