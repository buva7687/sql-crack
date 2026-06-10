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
) => Array<{ optimization?: { minimize?: boolean }; devtool?: unknown; mode?: string }>;

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
