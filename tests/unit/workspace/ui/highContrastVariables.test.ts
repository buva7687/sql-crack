import { getCssVariables } from '../../../../src/workspace/ui/styles/variables';

function luminance(hex: string): number {
    const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const [r, g, b] = channels.map(value => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
}

/** Last declaration wins, matching how the appended override block cascades. */
function lastValue(css: string, variable: string): string {
    const matches = Array.from(css.matchAll(new RegExp(`${variable}:\\s*(#[0-9a-fA-F]{6})`, 'g')));
    expect(matches.length).toBeGreaterThan(0);
    return matches[matches.length - 1][1];
}

describe('workspace high-contrast variables', () => {
    it.each([['dark', true], ['light', false]] as const)('keeps muted text at 7:1 or better in %s high contrast', (_name, dark) => {
        const css = getCssVariables(dark, true);
        const background = lastValue(css, '--bg-primary');
        expect(contrast(lastValue(css, '--text-muted'), background)).toBeGreaterThanOrEqual(7);
        expect(contrast(lastValue(css, '--text-dim'), background)).toBeGreaterThanOrEqual(7);
    });

    it('leaves the regular theme tokens unchanged', () => {
        expect(lastValue(getCssVariables(true, false), '--text-muted').toLowerCase()).toBe('#71717a');
        expect(lastValue(getCssVariables(false, false), '--text-muted').toLowerCase()).toBe('#64748b');
    });
});
