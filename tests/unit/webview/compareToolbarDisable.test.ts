/**
 * M21: while the compare view is open, toolbar controls that act on the hidden
 * graph are disabled; compare-safe controls (compare, theme, refresh, ...) are not.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { setGraphControlsDisabledForCompare } from '../../../src/webview/ui/toolbar/actionGroups';

class FakeControl {
    style: Record<string, string> = { opacity: '', pointerEvents: '' };
    disabled = false;
    private attributes = new Map<string, string>();
    constructor(public readonly name: string, private readonly compareSafe = false) {}
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    hasAttribute(name: string) { return this.attributes.has(name); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    closest(selector: string) { return selector === '[data-compare-safe="true"]' && this.compareSafe ? this : null; }
}

describe('compare mode toolbar (M21)', () => {
    it('disables graph controls and restores them when compare closes', () => {
        const zoomIn = new FakeControl('zoom-in');
        const exportBtn = new FakeControl('export');
        const alreadyDisabledUndo = new FakeControl('undo');
        alreadyDisabledUndo.disabled = true;
        alreadyDisabledUndo.setAttribute('aria-disabled', 'true');
        alreadyDisabledUndo.style.opacity = '0.35';
        const compare = new FakeControl('compare', true);
        const theme = new FakeControl('theme', true);
        const actions = {
            querySelectorAll: () => [zoomIn, exportBtn, alreadyDisabledUndo, compare, theme],
        } as unknown as HTMLElement;

        setGraphControlsDisabledForCompare(actions, true);
        for (const control of [zoomIn, exportBtn, alreadyDisabledUndo]) {
            expect(control.disabled).toBe(true);
            expect(control.getAttribute('aria-disabled')).toBe('true');
            expect(control.style.pointerEvents).toBe('none');
        }
        expect(compare.disabled).toBe(false);
        expect(theme.getAttribute('aria-disabled')).toBeNull();

        setGraphControlsDisabledForCompare(actions, false);
        expect(zoomIn.disabled).toBe(false);
        expect(zoomIn.getAttribute('aria-disabled')).toBeNull();
        expect(zoomIn.style.pointerEvents).toBe('');
        // A control that was already disabled (e.g. undo with no history) stays disabled.
        expect(alreadyDisabledUndo.disabled).toBe(true);
        expect(alreadyDisabledUndo.getAttribute('aria-disabled')).toBe('true');
        expect(alreadyDisabledUndo.style.opacity).toBe('0.35');
    });

    it('marks only the controls that do not act on the hidden graph as compare-safe', () => {
        const featureGroup = readFileSync(join(__dirname, '../../../src/webview/ui/toolbar/featureGroup.ts'), 'utf8');
        for (const name of ['compareBtn', 'themeBtn', 'helpBtn', 'refreshBtn', 'pinBtn', 'pinsBtn', 'viewLocBtn']) {
            expect(featureGroup).toContain(`${name}.dataset.compareSafe = 'true';`);
        }
        for (const name of ['focusBtn', 'columnFlowBtn', 'layoutPicker', 'fullscreenBtn', 'sqlBtn', 'hintsSummaryBtn']) {
            expect(featureGroup).not.toContain(`${name}.dataset.compareSafe`);
        }
        const actionGroups = readFileSync(join(__dirname, '../../../src/webview/ui/toolbar/actionGroups.ts'), 'utf8');
        expect(actionGroups).toContain("document.addEventListener('compare-mode-state', compareModeHandler, listenerOptions);");
    });
});
