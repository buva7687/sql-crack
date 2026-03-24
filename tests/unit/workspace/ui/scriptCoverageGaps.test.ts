import { readFileSync } from 'fs';
import { join } from 'path';

function readWorkspaceScript(fileName: string): string {
    return readFileSync(
        join(__dirname, '../../../../src/workspace/ui/scripts', fileName),
        'utf8'
    );
}

describe('workspace ui script coverage gaps', () => {
    it('keeps breadcrumb escaping and data-attribute navigation in viewMode', () => {
        const source = readWorkspaceScript('viewMode.ts');

        expect(source).toContain("replace(/&/g, '&amp;')");
        expect(source).toContain("replace(/</g, '&lt;')");
        expect(source).toContain("replace(/>/g, '&gt;')");
        expect(source).toContain("replace(/\"/g, '&quot;')");
        expect(source).toContain('data-breadcrumb-action=');
        expect(source).toContain('data-breadcrumb-value=');
        expect(source).not.toMatch(/onclick=/);
    });

    it('uses delegated data-action routing and keyboard activation in eventDelegation', () => {
        const source = readWorkspaceScript('eventDelegation.ts');

        expect(source).toContain("closest('[data-action]')");
        expect(source).toContain("if (e.key !== 'Enter' && e.key !== ' ')");
        expect(source).toContain('target.click()');
        expect(source).toContain("const format = requested === 'json' ? 'impact-json' : 'impact-markdown';");
        expect(source).not.toMatch(/onclick=/);
    });

    it('posts theme toggle messages and hot-swaps theme vars without full reload', () => {
        const source = readWorkspaceScript('theme.ts');

        expect(source).toContain("document.getElementById('btn-theme')?.addEventListener('click'");
        expect(source).toContain("command: 'toggleTheme'");
        expect(source).toContain("case 'themeChanged':");
        expect(source).toContain("document.getElementById('theme-vars')");
        expect(source).toContain("document.head.appendChild(themeStyle)");
        expect(source).toContain("themeBtn.setAttribute('aria-label'");
        expect(source).not.toContain('window.location.reload');
    });

    it('wires direction buttons through data attributes and preserves expanded lineage nodes', () => {
        const source = readWorkspaceScript('directionButtons.ts');

        expect(source).toContain(".direction-btn[data-direction][data-node-id]");
        expect(source).toContain('e.preventDefault()');
        expect(source).toContain('e.stopPropagation()');
        expect(source).toContain("command: 'getLineageGraph'");
        expect(source).toContain('expandedNodes: lineageExpandedNodes ? Array.from(lineageExpandedNodes) : []');
    });

    it('parses lineage table names without producing undefined for malformed table ids', () => {
        const source = readWorkspaceScript('columnLineage.ts');

        expect(source).toContain('function getLineageTableName(tableId)');
        expect(source).toContain("const tableName = parts[parts.length - 1];");
        expect(source).toContain('return tableName ? tableName : tableId;');
        expect(source).toContain('const tableName = getLineageTableName(tableId);');
        expect(source).not.toContain("tableId.split(':')[1]");
    });

    it('uses data-action context menu routing instead of inline handlers', () => {
        const source = readWorkspaceScript('contextMenu.ts');

        expect(source).toContain("contextMenu?.querySelectorAll('.context-menu-item').forEach");
        expect(source).toContain("const action = item.getAttribute('data-action');");
        expect(source).toContain("item.classList.contains('disabled')");
        expect(source).toContain("navigator.clipboard.writeText");
        expect(source).not.toMatch(/onclick=/);
    });

    it('keeps escaped impact summary rendering and expandable transitive groups', () => {
        const source = readWorkspaceScript('impactSummary.ts');

        expect(source).toContain("JSON.parse(decodeURIComponent(listRaw))");
        expect(source).toContain("const label = escapeHtml(item.label || '');");
        expect(source).toContain("const titleAttr = escapeHtmlAttr(item.title || '');");
        expect(source).toContain("listEl.innerHTML = items.map(item => {");
        expect(source).toContain("document.querySelectorAll('.transitive-group-header').forEach");
        expect(source).toContain("header.setAttribute('aria-expanded', 'true');");
        expect(source).toContain("header.setAttribute('aria-expanded', 'false');");
    });
});
