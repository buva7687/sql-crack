/**
 * Review 3, Phase 2 — Visual Cleanup Regression Tests
 *
 * Tests for:
 * 1. Blue-tint purge on dark surfaces (2.1)
 * 2. Dark muted text token updates (2.2)
 * 3. localStorage safety wrappers (2.4)
 * 4. Shared monospace font stack usage (2.5)
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const readSource = (relativePath: string): string =>
    readFileSync(join(__dirname, '../../', relativePath), 'utf8');

describe('phase 2.1 dark surface blue-tint cleanup', () => {
    const toolbar = [
        readSource('src/webview/ui/toolbar.ts'),
        readSource('src/webview/ui/toolbar/featureMenus.ts'),
        readSource('src/webview/ui/toolbar/overflowMenu.ts'),
    ].join('\n');
    const batchTabs = readSource('src/webview/ui/batchTabs.ts');
    const compareView = readSource('src/webview/ui/compareView.ts');
    const pinnedTabs = readSource('src/webview/ui/pinnedTabs.ts');
    const colors = readSource('src/webview/constants/colors.ts');
    const workspaceStyles = readSource('src/workspace/ui/sharedStyles.ts');
    const variablesStyles = readSource('src/workspace/ui/styles/variables.ts');

    it('uses neutral dark backgrounds in updated webview surfaces', () => {
        expect(toolbar).toContain('rgba(17, 17, 17, 0.95)');
        expect(toolbar).toContain('rgba(17, 17, 17, 0.98)');
        expect(batchTabs).toContain('rgba(17, 17, 17, 0.95)');
        expect(compareView).toContain('rgba(17,17,17,0.96)');
        expect(pinnedTabs).toContain('rgba(17, 17, 17, 0.95)');
    });

    it('uses black-based overlay/track tones for dark theme tokens', () => {
        expect(colors).toContain("track: 'rgba(0, 0, 0, 0.35)'");
        expect(colors).toContain("shadowSoft: '0 4px 12px rgba(0, 0, 0, 0.12)'");
        // CSS variables are now in the extracted variables module
        expect(variablesStyles).toContain('--scrollbar-track: rgba(0, 0, 0, 0.35);');
    });
});

describe('phase 2.2 dark muted text values', () => {
    const theme = readSource('src/shared/theme.ts');
    const themeTokens = readSource('src/shared/themeTokens.ts');
    const colors = readSource('src/webview/constants/colors.ts');
    const variablesStyles = readSource('src/workspace/ui/styles/variables.ts');

    it('uses #71717A/#71717a for dark muted text tokens', () => {
        expect(themeTokens).toContain("textMuted: '#71717A'");
        expect(themeTokens).not.toContain("textMuted: '#94A3B8'");
        expect(theme).toContain("textMuted: '#71717a'");
        expect(colors).toContain("textMuted: '#71717a'");
        // CSS variables are now in the extracted variables module
        expect(variablesStyles).toContain('--text-muted: #71717a;');
    });
});

describe('phase 2.4 localStorage wrappers', () => {
    const resizablePanel = readSource('src/webview/ui/resizablePanel.ts');
    const clientScripts = [
        readSource('src/workspace/ui/clientScripts.ts'),
        readSource('src/workspace/ui/scripts/lineageGraph.ts'),
    ].join('\n');

    it('wraps resizable panel localStorage access in try/catch with debug logging', () => {
        expect(resizablePanel).toContain('try {');
        expect(resizablePanel).toContain('window.localStorage.getItem(key)');
        expect(resizablePanel).toContain('window.localStorage.setItem(widthKey, String(nextWidth));');
        expect(resizablePanel).toContain('window.localStorage.setItem(collapsedKey, String(collapsed));');
        expect(resizablePanel).toContain("window.localStorage.getItem(collapsedKey) === 'true';");
        // All catches now log with console.debug
        expect(resizablePanel).toContain("console.debug('[resizablePanel] localStorage");
    });

    it('wraps column trace hint localStorage access in try/catch with debug logging', () => {
        expect(clientScripts).toContain("columnTraceHintDismissed = localStorage.getItem(columnTraceHintStorageKey) === '1';");
        expect(clientScripts).toContain("localStorage.setItem(columnTraceHintStorageKey, '1');");
        expect(clientScripts).toContain("console.debug('[clientScripts] localStorage");
    });
});

describe('phase 2.5 shared monospace font stack', () => {
    const themeTokens = readSource('src/shared/themeTokens.ts');
    const sharedIndex = readSource('src/shared/index.ts');
    const renderer = readSource('src/webview/renderer.ts');
    const edgeRenderer = readSource('src/webview/rendering/edgeRenderer.ts');

    it('defines and re-exports MONO_FONT_STACK token', () => {
        expect(themeTokens).toContain("export const MONO_FONT_STACK = \"'SF Mono', Monaco, 'Cascadia Code', 'Menlo', 'Consolas', monospace\"");
        expect(sharedIndex).toContain('MONO_FONT_STACK,');
    });

    it('uses MONO_FONT_STACK in renderer and edge renderer panels', () => {
        expect(renderer).toContain("import { MONO_FONT_STACK } from '../shared/themeTokens';");
        expect(renderer).toContain('font-family: ${MONO_FONT_STACK};');
        expect(edgeRenderer).toContain("import { EDGE_THEME, MONO_FONT_STACK } from '../../shared/themeTokens';");
        expect(edgeRenderer).toContain('font-family: ${MONO_FONT_STACK};');
    });

    it('removes previous inline monospace stacks from updated renderers', () => {
        expect(renderer).not.toContain("'Monaco', 'Menlo', 'Consolas', monospace");
        expect(renderer).not.toContain("'SF Mono', Monaco, 'Cascadia Code', monospace");
        expect(edgeRenderer).not.toContain("'Monaco', 'Menlo', 'Consolas', monospace");
    });
});
