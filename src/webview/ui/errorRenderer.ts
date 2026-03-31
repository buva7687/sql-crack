import { STATUS_COLORS, UI_COLORS } from '../constants';

const PARSE_TIMEOUT_SETTING_LABEL = 'SQL Crack › Advanced: Parse Timeout Seconds';

export interface ErrorRenderOptions {
    mainGroup: SVGGElement | null;
    isDarkTheme: boolean;
    message: string;
    sourceLine?: string;
}

export function getErrorGuidanceLines(message: string): string[] {
    const normalizedMessage = message.toLowerCase();

    if (message.includes('Try ') && message.includes(' dialect')) {
        const parts = message.split('. ');
        const suggestion = parts.slice(1).join('. ').trim();
        return suggestion
            ? [
                `Tip: ${suggestion}`,
                'Change dialect using the dropdown in the top-left toolbar',
            ]
            : [];
    }

    if (normalizedMessage.includes('timed out') || normalizedMessage.includes('timeout')) {
        return [
            'Try visualizing one statement at a time or narrowing the query slice.',
            `If this query is expected, increase ${PARSE_TIMEOUT_SETTING_LABEL}.`,
        ];
    }

    if (
        normalizedMessage.includes('failed to recover query visualization')
        || normalizedMessage.includes('failed to hydrate deferred query')
        || normalizedMessage.includes('no visualization data')
    ) {
        return [
            'Try switching to the failing statement tab or refresh after narrowing the SQL.',
            'If the SQL uses dialect-specific syntax, try the dialect dropdown in the toolbar.',
        ];
    }

    if (
        normalizedMessage.includes('no executable sql found')
        || normalizedMessage.includes('no sql statements could be parsed')
    ) {
        return [
            'Add at least one executable SQL statement to render a graph.',
            'Comments and whitespace alone will not produce a visualization.',
        ];
    }

    return [];
}

export function renderErrorFeature(options: ErrorRenderOptions): void {
    const { mainGroup, isDarkTheme, message, sourceLine } = options;
    if (!mainGroup) {
        return;
    }

    const hasSourceLine = Boolean(sourceLine);
    const guidanceLines = getErrorGuidanceLines(message);

    const extraLines = (hasSourceLine ? 1 : 0) + guidanceLines.length;
    const baseOffset = extraLines > 0 ? -3 * extraLines : 0;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(0, -20)');

    const hasGuidance = guidanceLines.length > 0;
    const iconY = hasGuidance ? '45%' : hasSourceLine ? '46%' : '48%';
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

    const errorMsgY = hasGuidance ? 52 : hasSourceLine ? 53 : 55;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '50%');
    text.setAttribute('y', `${errorMsgY + baseOffset}%`);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', STATUS_COLORS.error);
    text.setAttribute('font-size', '14');
    text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    text.textContent = `Error: ${message}`;
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

    guidanceLines.forEach((line, index) => {
        const guidanceText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        guidanceText.setAttribute('x', '50%');
        guidanceText.setAttribute('y', `${nextY}%`);
        guidanceText.setAttribute('text-anchor', 'middle');
        guidanceText.setAttribute('fill', index === 0 ? UI_COLORS.textMuted : UI_COLORS.textDim);
        guidanceText.setAttribute('font-size', index === 0 ? '12' : '11');
        guidanceText.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        guidanceText.textContent = line;
        g.appendChild(guidanceText);
        nextY += 6;
    });

    mainGroup.appendChild(g);
}
