import { readFileSync } from 'fs';
import { join } from 'path';

function readSource(relPath: string): string {
    return readFileSync(join(__dirname, '../../', relPath), 'utf8');
}

describe('confirmed bug regression anchors from archive/multiple_bugs.txt', () => {
    it('#2 routes edge rendering through calculateEdgePath with the active layout type', () => {
        const edgeRendererSource = readSource('src/webview/rendering/edgeRenderer.ts');
        const rendererSource = readSource('src/webview/renderer.ts');

        expect(edgeRendererSource).toContain('layoutType: LayoutType;');
        expect(edgeRendererSource).toContain("path.setAttribute('d', calculateEdgePath(sourceNode, targetNode, options.layoutType));");
        expect(rendererSource).toContain("layoutType: state.layoutType || 'vertical',");
    });

    it('#3 preserves JOIN keywords during duplicate-subquery alias normalization', () => {
        const source = readSource('src/webview/parser/hints/advancedIssues.ts');
        expect(source).toContain("const sqlKeywords = new Set(['inner', 'outer', 'left', 'right', 'full', 'cross', 'natural', 'join', 'on', 'where', 'group', 'order', 'having', 'limit', 'union', 'intersect', 'except', 'select', 'from', 'set', 'into', 'values']);");
        expect(source).toContain('if (sqlKeywords.has(alias)) {');
    });

    it('#4 scopes dead-column SQL matching to the owning CTE body', () => {
        const source = readSource('src/webview/parser/hints/advancedIssues.ts');
        expect(source).toContain('const fullNormalizedSql = sql.replace');
        expect(source).toContain("const ctePattern = new RegExp(`\\\\b${escapeRegex(cteName)}\\\\b\\\\s+as\\\\s*\\\\(`, 'i');");
        expect(source).toContain('let depth = 1;');
        expect(source).toContain('normalizedSql = fullNormalizedSql.substring(bodyStart, bodyEnd).trim();');
    });

    it('#5 uses one helper to normalize columnLineageResult payloads', () => {
        const source = readSource('src/workspace/handlers/messageHandler.ts');
        expect(source).toContain('private buildColumnLineageResultPayload(');
        expect(source).toContain('html: string');
        expect(source).toContain("data: this.buildColumnLineageResultPayload(");
        expect(source).toContain("...this.buildColumnLineageResultPayload(");
    });

    it('#7 returns a safe report when column impact analysis is missing table context', () => {
        const source = readSource('src/workspace/lineage/impactAnalyzer.ts');
        expect(source).toContain('private createMissingColumnTableReport(');
        expect(source).toContain('const normalizedTableName = tableName?.trim();');
        expect(source).toContain('if (!normalizedTableName) {');
        expect(source).toContain('Table name is required for column impact analysis.');
    });

    it('#9 uses full-line matching instead of the old 30-char prefix heuristic', () => {
        const source = readSource('src/webview/sqlParser.ts');
        expect(source).toContain('const matchPrefix = stmtFirstLine.trimEnd();');
        expect(source).toContain('if (matchPrefix.length < 30 && stmtSecondLine && i + 1 < lines.length)');
        expect(source).not.toContain('substring(0, Math.min(30');
    });

    it('#10 assigns a perfect performance score when no perf hints are present', () => {
        const source = readSource('src/webview/sqlParser.ts');
        expect(source).toContain('ctx.stats.performanceScore = 100;');
        expect(source).toContain('ctx.stats.performanceIssues = 0;');
    });

    it('#11 handles non-trivial AST node variants in resolveColumnName', () => {
        const source = readSource('src/webview/parser/statements/select.ts');
        expect(source).toContain("if (col.type === 'function' && col.name)");
        expect(source).toContain("if (col.type === 'aggr_func' && col.name)");
        expect(source).toContain("if (col.type === 'binary_expr' && col.operator)");
        expect(source).toContain("if (col.type === 'cast' && col.expr)");
    });

    it('#13 preloads workspace SQL asynchronously on the live lineage build path', () => {
        const source = readSource('src/workspace/lineage/lineageBuilder.ts');
        const panelSource = readSource('src/workspace/workspacePanel.ts');
        expect(source).toContain('async buildFromIndexAsync(index: WorkspaceIndex): Promise<LineageGraph>');
        expect(source).toContain("const sql = await fs.promises.readFile(filePath, 'utf8');");
        expect(panelSource).toContain('const graph = await builder.buildFromIndexAsync(currentIndex);');
    });

    it('#15 handles SQL-standard doubled-quote escaping in statement splitting', () => {
        const source = readSource('src/webview/parser/validation/splitting.ts');
        expect(source).toContain("// SQL-standard doubled quote escape: '' or \"\"");
        expect(source).toContain('if (nextChar === stringChar) {');
        expect(source).not.toContain("prevChar !== '\\\\'");
    });

    it('#19 clears lastActiveSqlDocument when the closed document matches', () => {
        const source = readSource('src/extension.ts');
        expect(source).toContain('if (lastActiveSqlDocument && lastActiveSqlDocument.uri.toString() === document.uri.toString()) {');
        expect(source).toContain('lastActiveSqlDocument = null;');
    });

    it('#20 guards debounced auto-refresh with hasExecutableSql', () => {
        const source = readSource('src/extension.ts');
        expect(source).toContain('if (!hasExecutableSql(sqlCode)) {');
        expect(source).toContain('VisualizationPanel.refresh(sqlCode, {');
    });

    it('#24 cancels stale queued parser-client requests before synchronous parsing starts', () => {
        const source = readSource('src/webview/parserClient.ts');
        expect(source).toContain('function isParseRequestStale(requestId: number): boolean {');
        expect(source).toContain('return requestId <= cancelledParseRequestId || requestId !== latestParseRequestId;');
        expect(source).toContain('return createCancelledParseResult(sql);');
        expect(source).toContain('return createCancelledBatchParseResult(sql);');
    });

    it('#25 makes logger initialization idempotent and exposes a test reset hook', () => {
        const source = readSource('src/logger.ts');
        expect(source).toContain('if (this.outputChannel) {');
        expect(source).toContain('return;');
        expect(source).toContain('_reset(): void {');
    });

    it('#N2 passes the active dialect into delete statement SELECT parsing', () => {
        const source = readSource('src/webview/parser/statements/delete.ts');
        expect(source).toContain("function parseSelectAst(selectSql: string, dialect: SqlDialect = 'PostgreSQL'): any | null {");
        expect(source).toContain('const syntheticAst = parseSelectAst(syntheticSelect, context.dialect);');
    });

    it('#N6 treats backticks as quote delimiters in extension statement splitting', () => {
        const source = readSource('src/extension.ts');
        expect(source).toContain('if (char === "\'" || char === \'"\' || char === \'`\') {');
    });

    it('#N7 uses a nullish-style line guard for diagnostics parse errors', () => {
        const source = readSource('src/diagnostics.ts');
        expect(source).toContain('const fallbackLine = parseError.line != null ? parseError.line - 1 : 0;');
    });

    it('#N9 guards viewAlerts click handling against non-Element event targets', () => {
        const source = readSource('src/workspace/ui/scripts/viewAlerts.ts');
        expect(source).toContain('if (!(event.target instanceof Element)) {');
    });

    it('#34 resolves multi-definition lineage targets by statement proximity instead of first match', () => {
        const source = readSource('src/workspace/lineage/lineageBuilder.ts');
        expect(source).toContain('private resolveDefinitionTargetId(');
        expect(source).toContain('const rankedDefs = matchingDefs');
        expect(source).toContain('statementDistance');
        expect(source).toContain('lineDistance');
        expect(source).toContain('const bestDef = rankedDefs[0]?.def;');
    });
});
