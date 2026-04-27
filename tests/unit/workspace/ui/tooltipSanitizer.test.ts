import { getTooltipScriptFragment } from '../../../../src/workspace/ui/scripts/tooltip';

describe('workspace tooltip sanitizer hardening', () => {
    it('removes high-risk elements via the blockedTags guard in the recursive sanitizer walk', () => {
        const script = getTooltipScriptFragment();

        expect(script).toContain("const blockedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM']);");
        expect(script).toContain('if (blockedTags.has(element.tagName)) {');
        expect(script).toContain('return document.createDocumentFragment();');
    });

    it('still keeps the structural allowlist and safe class-token filtering for supported tooltip markup', () => {
        const script = getTooltipScriptFragment();

        expect(script).toContain("const allowedTags = new Set(['DIV', 'UL', 'LI', 'STRONG', 'SPAN', 'BR']);");
        expect(script).toContain("const allowedClassPattern = /^[a-z0-9_-]+$/i;");
        expect(script).toContain("clean.setAttribute('class', safeClassName);");
        expect(script).not.toContain("clean.setAttribute('style'");
    });
});
