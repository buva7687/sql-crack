/**
 * Review 3, Phase 1 — Security & Bug Fix Regression Tests
 *
 * Tests for:
 * 1. XSS: inline onclick replaced with data-attributes + event delegation (1.1/1.4)
 * 2. XSS: tooltip sanitization (1.2)
 * 3. XSS: batchTabs label escaping (1.3)
 * 4. Windows path handling — path.basename (1.5)
 * 5. DOMContentLoaded guard pattern (1.6)
 * 6. Indexer processUpdateQueue error handling (1.7/1.8)
 * 7. Webview message handler completeness (1.9)
 * 8. Defensive guards (1.10)
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// =========================================================================
// 1. XSS: No inline onclick in clientScripts.ts lineage results
// =========================================================================

describe('XSS: clientScripts.ts lineage result rendering', () => {
    const source = readFileSync(join(__dirname, '../../src/workspace/ui/clientScripts.ts'), 'utf8');

    it('should NOT use inline onclick for lineage clickable nodes', () => {
        // The old pattern: onclick="vscode.postMessage({command:'openFileAtLine'..."
        // Should now use data-attributes + addEventListener
        expect(source).not.toMatch(/onclick=.*openFileAtLine/);
    });

    it('should use data-filepath and data-line attributes for lineage nodes', () => {
        expect(source).toContain('class="lineage-clickable"');
        expect(source).toContain('data-filepath=');
        expect(source).toContain('data-line=');
    });

    it('should use delegated event listener for lineage-clickable elements', () => {
        expect(source).toContain("querySelectorAll('.lineage-clickable')");
        expect(source).toContain("addEventListener('click'");
        expect(source).toContain("getAttribute('data-filepath')");
        expect(source).toContain("getAttribute('data-line')");
    });

    it('should escape filePath in data-attribute with escapeHtmlSafe', () => {
        // data-filepath should be escaped, not raw
        expect(source).toMatch(/data-filepath=.*escapeHtmlSafe/);
    });
});

// =========================================================================
// 2. XSS: Tooltip sanitization
// =========================================================================

describe('XSS: tooltip sanitization in clientScripts.ts', () => {
    const source = readFileSync(join(__dirname, '../../src/workspace/ui/clientScripts.ts'), 'utf8');

    it('should define a sanitizeTooltipHtml function', () => {
        expect(source).toContain('function sanitizeTooltipHtml');
    });

    it('should escape all HTML first via textContent, then restore only safe tags', () => {
        // The sanitizer must escape everything first (textContent → innerHTML)
        expect(source).toContain('div.textContent = html');
        expect(source).toContain('div.innerHTML');
        // Then selectively restore only allowlisted structural tags
        // Should only allow div, ul, li, strong, span — no script, img, iframe, etc.
        expect(source).toMatch(/div\|ul\|li\|strong\|span/);
    });

    it('should only restore class attribute, not style or event handlers', () => {
        // The allowlist regex should permit class only (style removed — tooltips use CSS classes)
        expect(source).toMatch(/class=&quot;/);
        // style should NOT be in the attribute whitelist
        expect(source).not.toMatch(/(?:class\|style|style\|class)/);
        // Should NOT contain any pattern that passes through on* attributes
        expect(source).not.toMatch(/sanitizeTooltipHtml[^}]*onclick/);
    });

    it('should use sanitizeTooltipHtml in showTooltip', () => {
        expect(source).toContain('sanitizeTooltipHtml(content)');
    });
});

// =========================================================================
// 3. XSS: batchTabs label escaping
// =========================================================================

describe('XSS: batchTabs label escaping', () => {
    const source = readFileSync(join(__dirname, '../../src/webview/ui/batchTabs.ts'), 'utf8');

    it('should define an escapeHtml function', () => {
        expect(source).toContain('function escapeHtml(');
        expect(source).toContain("replace(/&/g, '&amp;')");
        expect(source).toContain("replace(/</g, '&lt;')");
        expect(source).toContain("replace(/>/g, '&gt;')");
    });

    it('should escape extractQueryLabel output in tab innerHTML', () => {
        // The label should go through escapeHtml before being injected
        expect(source).toMatch(/escapeHtml\(extractQueryLabel\(/);
    });
});

// =========================================================================
// 4. Windows path handling
// =========================================================================

describe('Windows path handling in extension.ts', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('should import path module', () => {
        expect(source).toContain("import * as path from 'path'");
    });

    it('should use path.basename instead of split/pop for fileName', () => {
        expect(source).toContain('path.basename(document.fileName)');
        // Should NOT use the old pattern
        expect(source).not.toContain("document.fileName.split('/').pop()");
    });
});

// =========================================================================
// 5. DOMContentLoaded guard
// =========================================================================

describe('DOMContentLoaded guard in webview/index.ts', () => {
    const source = readFileSync(join(__dirname, '../../src/webview/index.ts'), 'utf8');

    it('should check document.readyState before adding DOMContentLoaded listener', () => {
        expect(source).toContain("document.readyState === 'loading'");
    });

    it('should call setup directly when DOM is already ready', () => {
        // Pattern: if (readyState === 'loading') { addEventListener } else { setup() }
        expect(source).toMatch(/if \(document\.readyState === 'loading'\)/);
        expect(source).toContain('} else {');
    });
});

// =========================================================================
// 6. Indexer processUpdateQueue error handling
// =========================================================================

describe('indexManager processUpdateQueue robustness', () => {
    const source = readFileSync(join(__dirname, '../../src/workspace/indexManager.ts'), 'utf8');

    it('should check file existence before updating (race condition guard)', () => {
        // Should call fs.stat to verify file still exists before processing
        expect(source).toContain('vscode.workspace.fs.stat(uri)');
    });

    it('should call removeFile when stat fails (file was deleted while queued)', () => {
        // Extract the full processUpdateQueue method (find the next method after it)
        const startIdx = source.indexOf('private async processUpdateQueue');
        const nextMethodIdx = source.indexOf('private ', startIdx + 50);
        const queueSection = source.substring(startIdx, nextMethodIdx > startIdx ? nextMethodIdx : startIdx + 1000);
        expect(queueSection).toContain('this.removeFile(uri)');
        expect(queueSection).toContain('continue');
    });

    it('should wrap each file update in try/catch to prevent one failure from skipping the rest', () => {
        const startIdx = source.indexOf('private async processUpdateQueue');
        const nextMethodIdx = source.indexOf('private ', startIdx + 50);
        const queueSection = source.substring(startIdx, nextMethodIdx > startIdx ? nextMethodIdx : startIdx + 1000);
        expect(queueSection).toContain('catch (err)');
        expect(queueSection).toContain('logger.debug');
    });
});

// =========================================================================
// 7. Webview message handler completeness
// =========================================================================

describe('webview message handler completeness', () => {
    const source = readFileSync(join(__dirname, '../../src/webview/index.ts'), 'utf8');

    it('should handle viewLocationOptions message', () => {
        expect(source).toContain("case 'viewLocationOptions':");
    });

    it('should handle pinCreated message', () => {
        expect(source).toContain("case 'pinCreated':");
    });
});

// =========================================================================
// 8. Defensive guards
// =========================================================================

describe('defensive guards in extension.ts', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('should guard selections array before accessing [0]', () => {
        expect(source).toContain('e.selections.length > 0');
    });

    it('should filter empty strings from additionalFileExtensions', () => {
        expect(source).toContain(".filter(ext => ext.length > 0)");
    });
});

describe('defensive guards in visualizationPanel.ts', () => {
    const source = readFileSync(join(__dirname, '../../src/visualizationPanel.ts'), 'utf8');

    it('should show error message when pin context is unavailable', () => {
        expect(source).toContain("'Cannot pin: extension context not available'");
    });
});
