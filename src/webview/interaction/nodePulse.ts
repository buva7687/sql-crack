import { UI_COLORS } from '../constants';
import { prefersReducedMotion } from '../ui/motion';

interface PulseRectOptions {
    rect: SVGRectElement;
    animationName: string;
    animationDurationMs: number;
    styleId: string;
    keyframes: string;
    restoreStroke: () => void;
}

interface PulsePalette {
    selectedStroke: string;
    nodePulseStart: string;
    nodePulseMid: string;
    cloudPulsePrimary: string;
    cloudPulseSecondary: string;
    cloudGlowStrong: string;
    cloudGlowSoft: string;
}

function getPulsePalette(isDarkTheme: boolean): PulsePalette {
    if (isDarkTheme) {
        return {
            selectedStroke: UI_COLORS.white,
            nodePulseStart: '#818cf8',
            nodePulseMid: '#6366f1',
            cloudPulsePrimary: '#fbbf24',
            cloudPulseSecondary: '#f59e0b',
            cloudGlowStrong: 'rgba(251, 191, 36, 0.8)',
            cloudGlowSoft: 'rgba(251, 191, 36, 0.6)',
        };
    }

    return {
        selectedStroke: UI_COLORS.focusTextLight,
        nodePulseStart: '#4f46e5',
        nodePulseMid: '#4338ca',
        cloudPulsePrimary: '#d97706',
        cloudPulseSecondary: '#b45309',
        cloudGlowStrong: 'rgba(217, 119, 6, 0.75)',
        cloudGlowSoft: 'rgba(217, 119, 6, 0.55)',
    };
}

function ensurePulseStyle(styleId: string, keyframes: string): void {
    if (document.getElementById(styleId)) {
        return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = keyframes;
    document.head.appendChild(style);
}

function pulseRect(options: PulseRectOptions): void {
    const { rect, animationName, animationDurationMs, styleId, keyframes, restoreStroke } = options;

    if (prefersReducedMotion()) {
        restoreStroke();
        return;
    }

    ensurePulseStyle(styleId, keyframes);
    rect.style.animation = `${animationName} ${animationDurationMs}ms ease-out`;
    setTimeout(() => {
        rect.style.animation = '';
        restoreStroke();
    }, animationDurationMs);
}

export function pulseNodeFeature(options: {
    nodeId: string;
    mainGroup: SVGGElement | null;
    selectedNodeId: string | null;
    isDarkTheme: boolean;
}): void {
    const { nodeId, mainGroup, selectedNodeId, isDarkTheme } = options;
    const palette = getPulsePalette(isDarkTheme);

    const nodeGroup = mainGroup?.querySelector(`.node[data-id="${nodeId}"]`) as SVGGElement | null;
    if (!nodeGroup) {
        return;
    }

    const rect = nodeGroup.querySelector('.node-rect') as SVGRectElement | null;
    if (!rect) {
        return;
    }

    const originalStroke = rect.getAttribute('stroke') || '';
    const originalStrokeWidth = rect.getAttribute('stroke-width') || '';

    pulseRect({
        rect,
        animationName: 'node-pulse',
        animationDurationMs: 600,
        styleId: 'pulse-animation-style',
        keyframes: `
            @keyframes node-pulse {
                0% {
                    stroke: ${palette.nodePulseStart};
                    stroke-width: 6px;
                    filter: url(#glow) brightness(1.3);
                }
                50% {
                    stroke: ${palette.nodePulseMid};
                    stroke-width: 4px;
                    filter: url(#glow) brightness(1.1);
                }
                100% {
                    stroke: inherit;
                    stroke-width: inherit;
                    filter: url(#shadow);
                }
            }
        `,
        restoreStroke: () => {
            if (selectedNodeId === nodeId) {
                rect.setAttribute('stroke', palette.selectedStroke);
                rect.setAttribute('stroke-width', '3');
                rect.setAttribute('filter', 'url(#glow)');
                return;
            }

            if (originalStroke) {
                rect.setAttribute('stroke', originalStroke);
            } else {
                rect.removeAttribute('stroke');
            }

            if (originalStrokeWidth) {
                rect.setAttribute('stroke-width', originalStrokeWidth);
            } else {
                rect.removeAttribute('stroke-width');
            }
            rect.setAttribute('filter', 'url(#shadow)');
        },
    });
}

export function pulseNodeInCloudFeature(options: {
    subNodeId: string;
    parentNodeId: string;
    mainGroup: SVGGElement | null;
    isDarkTheme: boolean;
}): void {
    const { subNodeId, parentNodeId, mainGroup, isDarkTheme } = options;
    const palette = getPulsePalette(isDarkTheme);
    if (prefersReducedMotion()) {
        return;
    }

    const cloudContainer = mainGroup?.querySelector(`.cloud-container[data-node-id="${parentNodeId}"]`) as SVGGElement | null;
    if (!cloudContainer) {
        return;
    }

    const subGroup = cloudContainer.querySelector(`.cloud-subflow-node[data-node-id="${subNodeId}"]`) as SVGGElement | null;
    if (!subGroup) {
        return;
    }

    const rect = subGroup.querySelector('rect') as SVGRectElement | null;
    if (!rect) {
        return;
    }

    const originalStroke = rect.getAttribute('stroke') || '';
    const originalStrokeWidth = rect.getAttribute('stroke-width') || '';
    const originalFilter = rect.getAttribute('filter') || '';

    ensurePulseStyle(
        'cloud-pulse-animation-style',
        `
            @keyframes cloud-node-pulse {
                0%, 100% {
                    stroke: ${palette.cloudPulsePrimary};
                    stroke-width: 4px;
                    filter: drop-shadow(0 0 8px ${palette.cloudGlowStrong});
                }
                25% {
                    stroke: ${palette.cloudPulseSecondary};
                    stroke-width: 5px;
                    filter: drop-shadow(0 0 12px ${palette.cloudGlowStrong});
                }
                50% {
                    stroke: ${palette.cloudPulsePrimary};
                    stroke-width: 4px;
                    filter: drop-shadow(0 0 8px ${palette.cloudGlowStrong});
                }
                75% {
                    stroke: ${palette.cloudPulseSecondary};
                    stroke-width: 5px;
                    filter: drop-shadow(0 0 12px ${palette.cloudGlowStrong});
                }
            }
        `
    );

    rect.style.animation = 'cloud-node-pulse 1.5s ease-in-out';

    setTimeout(() => {
        rect.style.animation = '';
        rect.setAttribute('stroke', palette.cloudPulsePrimary);
        rect.setAttribute('stroke-width', '3');
        rect.setAttribute('filter', `drop-shadow(0 0 6px ${palette.cloudGlowSoft})`);

        setTimeout(() => {
            rect.style.transition = 'stroke 0.5s ease, stroke-width 0.5s ease, filter 0.5s ease';

            if (originalStroke) {
                rect.setAttribute('stroke', originalStroke);
            } else {
                rect.setAttribute('stroke', UI_COLORS.borderWhite);
            }
            if (originalStrokeWidth) {
                rect.setAttribute('stroke-width', originalStrokeWidth);
            } else {
                rect.setAttribute('stroke-width', '2');
            }
            rect.setAttribute('filter', originalFilter || 'url(#shadow)');

            setTimeout(() => {
                rect.style.transition = '';
            }, 500);
        }, 2000);
    }, 1500);
}
