import { parseSql } from '../../../src/webview/sqlParser';
import { SchemaExtractor, ReferenceExtractor } from '../../../src/workspace/extraction';
import { normalizeSelectIntoTargets, preprocessTransactSqlSyntax } from '../../../src/webview/parser/dialects/preprocessing';
import { astifySql } from '../../../src/shared';
import { Parser } from 'node-sql-parser';

describe('SELECT INTO source locations and escaped identifiers', () => {
    it('starts a PostgreSQL definition at SELECT after leading comments', () => {
        const statement = 'SELECT id INTO sales.archive_2024 FROM sales.orders;';
        const [definition] = new SchemaExtractor().extractDefinitions('-- header comment\n' + statement, 'query.sql', 'PostgreSQL');
        expect(definition.lineNumber).toBe(2);
        expect(definition.sql).toBe(statement);
    });

    it('renders an escaped SQL Server target as a write without a partial graph', () => {
        const sql = 'SELECT a INTO [weird]]name] FROM dbo.src;';
        const result = parseSql(sql, 'TransactSQL', { allowDialectFallback: false });
        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(result.sql).toBe(sql);
        expect(result.nodes.find(node => node.label === 'weird]name')).toMatchObject({
            type: 'table', accessMode: 'write', operationType: 'CREATE_TABLE',
        });
        expect(result.nodes.filter(node => node.type === 'table').map(node => node.label)).toEqual(['src', 'weird]name']);
        expect(new SchemaExtractor().extractDefinitions(sql, 'query.sql', 'TransactSQL')[0].name).toBe('weird]name');
        expect(new ReferenceExtractor().extractReferences(sql, 'query.sql', 'TransactSQL').map(ref => ref.tableName)).not.toContain('weird');
    });

    it.each(['PostgreSQL', 'TransactSQL', 'Redshift'] as const)('skips nested block and line comments for %s definition navigation', dialect => {
        const sql = '/* header;\n /* SELECT INTO fake */\n*/\n-- another header\nSELECT id INTO archive FROM orders;';
        const [definition] = new SchemaExtractor().extractDefinitions(sql, 'query.sql', dialect);
        expect(definition.lineNumber).toBe(5);
        expect(definition.sql).not.toMatch(/^(?:--|\/\*)/);
        if (dialect !== 'Redshift') { expect(definition.sql).toMatch(/^SELECT id INTO archive FROM orders;?$/); }
    });

    it('keeps separate statement locations and the WITH clause after comments', () => {
        const sql = 'SELECT id INTO first FROM src;\n/* header ; */\nWITH c AS (SELECT id FROM src)\nSELECT id INTO second FROM c;';
        const definitions = new SchemaExtractor().extractDefinitions(sql, 'query.sql', 'PostgreSQL');
        expect(definitions.map(definition => [definition.name, definition.lineNumber, definition.statementIndex])).toEqual([
            ['first', 1, 0], ['second', 3, 1],
        ]);
        expect(definitions[1].sql).toMatch(/^WITH c AS/);
    });

    it.each([
        ['[my schema].[weird]]name]', 'my schema.weird]name'],
        ['[catalog].[schema]]x].[weird]]name]', 'catalog.schema]x.weird]name'],
        ['[a.b].[name]]with"quote]', 'a.b.name]with"quote'],
        ['[name]]]', 'name]'],
    ])('keeps qualified escaped target %s intact', (target, name) => {
        const result = parseSql(`SELECT id INTO ${target} FROM dbo.src;`, 'TransactSQL', { allowDialectFallback: false });
        expect(result.partial).toBeUndefined();
        expect(result.error).toBeUndefined();
        expect(result.nodes.find(node => node.accessMode === 'write')?.label).toBe(name);
    });

    it('normalizes escaped source and column identifiers too', () => {
        const sql = 'SELECT [a]]b] INTO [out]]table] FROM [dbo]]x].[src]]table];';
        const result = parseSql(sql, 'TransactSQL', { allowDialectFallback: false });
        expect(result.partial).toBeUndefined();
        expect(result.error).toBeUndefined();
        expect(result.columnLineage[0].outputColumn).toBe('a]b');
        expect(result.nodes.filter(node => node.type === 'table').map(node => node.label)).toEqual(['src]table', 'out]table']);
        expect(new ReferenceExtractor().extractReferences(sql, 'query.sql', 'TransactSQL')).toContainEqual(
            expect.objectContaining({ tableName: 'src]table', schema: 'dbo]x', nameQuoted: true, schemaQuoted: true })
        );
    });

    it('ignores bracket examples and INTO text in comments or literals', () => {
        const sql = 'SELECT \'[x]]y] INTO a.b FROM fake\', "INTO x.y FROM z" FROM src; -- [x]]y]';
        expect(preprocessTransactSqlSyntax(sql, 'TransactSQL')).toBeNull();
        expect(normalizeSelectIntoTargets(sql, 'TransactSQL')).toBeNull();
    });

    it('locates an escaped write target on its actual line', () => {
        const result = parseSql('SELECT id\nINTO [out]]table]\nFROM dbo.src;', 'TransactSQL', { allowDialectFallback: false });
        expect(result.nodes.find(node => node.accessMode === 'write')?.startLine).toBe(2);
    });

    it('does not collide with existing identifiers or rewrite literal values', () => {
        const sql = 'SELECT [__sql_crack_bracket_0__], [a]]b], \'__sql_crack_bracket_1__\' AS note INTO [out]]table] FROM [src]]table];';
        const ast: any = astifySql(new Parser(), sql, 'TransactSQL');
        expect(ast.columns[0].expr.column).toBe('__sql_crack_bracket_0__');
        expect(ast.columns[1].expr.column).toBe('a]b');
        expect(ast.columns[2].expr.value).toBe('__sql_crack_bracket_1__');
        expect(ast.into.expr).toBe('out]table');
        expect(ast.from[0].table).toBe('src]table');
    });

    it('preserves escaped identifiers in Workspace table definitions', () => {
        const sql = '-- header\nCREATE TABLE [dbo].[weird]]name] ([id]]x] INT);';
        const { definitions, warnings } = new SchemaExtractor().extractDefinitionsWithStatus(sql, 'query.sql', 'TransactSQL');
        expect(warnings).toEqual([]);
        expect(definitions[0]).toMatchObject({ name: 'weird]name', schema: 'dbo', lineNumber: 2 });
        expect(definitions[0].columns[0].name).toBe('id]x');
    });

    it('does not turn an unterminated bracket identifier into valid SQL', () => {
        expect(() => astifySql(new Parser(), 'SELECT id FROM [bad]]name', 'TransactSQL')).toThrow();
    });
});
