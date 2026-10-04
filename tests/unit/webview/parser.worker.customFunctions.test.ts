describe('worker custom function configuration', () => {
    it('applies and clears custom aggregates in the worker parsing context', () => {
        let listener: (event: {data: unknown}) => void = () => undefined;
        const messages: any[] = [];
        const previousPost = (global as any).postMessage;
        const previousListener = (global as any).addEventListener;
        (global as any).postMessage = (message: unknown) => messages.push(message);
        (global as any).addEventListener = (_event: string, callback: typeof listener) => {listener = callback;};
        try {
            jest.isolateModules(() => {
                require('../../../src/webview/parser.worker');
                const payload = {sql: 'SELECT MY_SUM(amount) AS total FROM orders', dialect: 'PostgreSQL'};
                listener({data: {type: 'parse', requestId: 1, payload: {...payload, customAggregateFunctions: ['MY_SUM']}}});
                const first = messages.find(message => message.requestId === 1 && message.type === 'parse').result;
                expect(first.nodes.some((node: any) => node.type === 'aggregate')).toBe(true);
                expect(first.stats.aggregations).toBe(1);
                expect(first.stats.functionsUsed).toEqual(expect.arrayContaining([expect.objectContaining({name: 'MY_SUM', category: 'aggregate'})]));
                listener({data: {type: 'parse', requestId: 2, payload}});
                const second = messages.find(message => message.requestId === 2 && message.type === 'parse').result;
                expect(second.nodes.some((node: any) => node.type === 'aggregate')).toBe(false);
            });
        } finally {
            (global as any).postMessage = previousPost;
            (global as any).addEventListener = previousListener;
        }
    });
});
