/**
 * Guards production detection in the webpack build. `npm run package` invokes
 * `webpack --mode production` (space-separated), so production must be detected
 * from webpack's resolved `argv.mode` — not by string-matching process.argv,
 * which previously shipped an unminified bundle with source maps.
 */

import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const webpackConfigFactory = require(join(__dirname, '../../webpack.config.js')) as (
    env: Record<string, unknown>,
    argv: { mode?: string }
) => Array<{
    optimization?: { minimize?: boolean };
    devtool?: unknown;
    mode?: string;
    output?: { clean?: boolean | { keep?: RegExp } };
}>;

describe('webpack config production detection', () => {
    it('exports a function (function-form configuration)', () => {
        expect(typeof webpackConfigFactory).toBe('function');
    });

    it('minifies and disables source maps when argv.mode is production', () => {
        const configs = webpackConfigFactory({}, { mode: 'production' });

        expect(Array.isArray(configs)).toBe(true);
        expect(configs.length).toBeGreaterThanOrEqual(1);

        for (const config of configs) {
            expect(config.mode).toBe('production');
            expect(config.optimization?.minimize).toBe(true);
            expect(config.devtool).toBe(false);
        }
    });

    it('keeps source maps and skips minification in development mode', () => {
        const configs = webpackConfigFactory({}, { mode: 'development' });

        for (const config of configs) {
            expect(config.optimization?.minimize).toBe(false);
            expect(config.devtool).toBe('source-map');
        }
    });

    it('cleans stale chunks while preserving named assets from both compilers', () => {
        const configs = webpackConfigFactory({}, { mode: 'production' });
        const extensionClean = configs[0].output?.clean;

        expect(typeof extensionClean).toBe('object');
        const keep = typeof extensionClean === 'object' ? extensionClean.keep : undefined;
        expect(keep?.test('extension.js')).toBe(true);
        expect(keep?.test('webview.js')).toBe(true);
        expect(keep?.test('parser.worker.js')).toBe(true);
        expect(keep?.test('1.extension.js')).toBe(false);
        expect(keep?.test('extension.js.map')).toBe(false);
        // A second cleaner would delete async chunks emitted by the extension compiler.
        expect(configs[1].output?.clean).toBeUndefined();
    });

    it('detects production from NODE_ENV when argv.mode is absent', () => {
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            const configs = webpackConfigFactory({}, {});
            for (const config of configs) {
                expect(config.optimization?.minimize).toBe(true);
                expect(config.devtool).toBe(false);
            }
        } finally {
            process.env.NODE_ENV = previous;
        }
    });

    it('lets an explicit development argv.mode override NODE_ENV', () => {
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            const configs = webpackConfigFactory({}, { mode: 'development' });
            for (const config of configs) {
                expect(config.mode).toBe('none');
                expect(config.optimization?.minimize).toBe(false);
                expect(config.devtool).toBe('source-map');
            }
        } finally {
            process.env.NODE_ENV = previous;
        }
    });
});
