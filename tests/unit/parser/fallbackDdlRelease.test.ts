import { regexFallbackParse } from '../../../src/webview/parser/dialects/fallback';
it('shows an explicit partial DDL card for unsupported CREATE TABLE syntax', () => {
    const result = regexFallbackParse('CREATE TABLE sales (id NUMBER, total NUMBER) ORGANIZATION INDEX;', 'Oracle');
    expect(result.partial).toBe(true);
    expect(result.nodes).toEqual(expect.arrayContaining([expect.objectContaining({operationType: 'CREATE_TABLE', label: 'sales'})]));
    expect(result.columnLineage).toEqual([]);
});
