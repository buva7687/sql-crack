import { STATUS_COLORS, UI_COLORS } from '../constants';

export interface ErrorRenderOptions {
    mainGroup: SVGGElement | null;
    isDarkTheme: boolean;
    message: string;
    sourceLine?: string;
}

export function renderErrorFeature(options: ErrorRenderOptions): void {
    const { mainGroup, isDarkTheme, message, sourceLine } = options;
    if (!mainGroup) {
        return;
    }

    const hasSuggestion = message.includes('Try ') && message.includes(' dialect');
    const hasSourceLine = Boolean(sourceLine);
    const parts = hasSuggestion ? message.split('. ') : [message];

    const extraLines = (hasSourceLine ? 1 : 0) + (hasSuggestion ? 2 : 0);
    const baseOffset = extraLines > 0 ? -3 * extraLines : 0;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(0, -20)');

    const iconY = hasSuggestion ? '45%' : hasSourceLine ? '46%' : '48%';
    const iconCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    iconCircle.setAttribute('cx', '50%');
    iconCircle.setAttribute('cy', `${parseFloat(iconY) + baseOffset}%`);
    iconCircle.setAttribute('r', '11');
    iconCircle.setAttribute('fill', isDarkTheme ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.12)');
    iconCircle.setAttribute('stroke', STATUS_COLORS.error);
    iconCircle.setAttribute('stroke-width', '1.5');
    g.appendChild(iconCircle);

    const iconMark = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconMark.setAttribute('x', '50%');
    iconMark.setAttribute('y', `${parseFloat(iconY) + 0.6 + baseOffset}%`);
    iconMark.setAttribute('text-anchor', 'middle');
    iconMark.setAttribute('fill', STATUS_COLORS.error);
    iconMark.setAttribute('font-size', '15');
    iconMark.setAttribute('font-weight', '700');
    iconMark.textContent = '!';
    g.appendChild(iconMark);

    const errorMsgY = hasSuggestion ? 52 : hasSourceLine ? 53 : 55;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '50%');
    text.setAttribute('y', `${errorMsgY + baseOffset}%`);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', STATUS_COLORS.error);
    text.setAttribute('font-size', '14');
    text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    text.textContent = hasSuggestion ? parts[0] : `Error: ${message}`;
    g.appendChild(text);

    let nextY = errorMsgY + baseOffset + 6;
    if (hasSourceLine) {
        const sourceText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        sourceText.setAttribute('x', '50%');
        sourceText.setAttribute('y', `${nextY}%`);
        sourceText.setAttribute('text-anchor', 'middle');
        sourceText.setAttribute('fill', UI_COLORS.textMuted);
        sourceText.setAttribute('font-size', '11');
        sourceText.setAttribute('font-family', 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace');
        sourceText.textContent = `→ ${sourceLine}`;
        g.appendChild(sourceText);
        nextY += 6;
    }

    if (hasSuggestion && parts[1]) {
        const suggestion = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        suggestion.setAttribute('x', '50%');
        suggestion.setAttribute('y', `${nextY}%`);
        suggestion.setAttribute('text-anchor', 'middle');
        suggestion.setAttribute('fill', UI_COLORS.textMuted);
        suggestion.setAttribute('font-size', '12');
        suggestion.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        suggestion.textContent = `Tip: ${parts[1]}`;
        g.appendChild(suggestion);

        const hint = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        hint.setAttribute('x', '50%');
        hint.setAttribute('y', `${nextY + 6}%`);
        hint.setAttribute('text-anchor', 'middle');
        hint.setAttribute('fill', UI_COLORS.textDim);
        hint.setAttribute('font-size', '11');
        hint.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        hint.textContent = 'Change dialect using the dropdown in the top-left toolbar';
        g.appendChild(hint);
    }

    mainGroup.appendChild(g);
}
