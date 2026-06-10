const path = require('path');
const webpack = require('webpack');

/**
 * Function-form configuration so production detection is driven by webpack's own
 * resolved `argv.mode`. The previous string-matching on `process.argv` missed the
 * space-separated `--mode production` form that `npm run package` uses, which
 * silently shipped an unminified bundle with source maps. `argv.mode` is set by
 * webpack regardless of whether the flag is `--mode production` or
 * `--mode=production`, with NODE_ENV retained as a fallback for direct API use.
 *
 * @param {Record<string, unknown>} _env
 * @param {{ mode?: string }} argv
 * @returns {import('webpack').Configuration[]}
 */
module.exports = (_env, argv = {}) => {
  const resolvedMode = argv.mode || process.env.NODE_ENV;
  const isProduction = resolvedMode === 'production';

  /**@type {import('webpack').Configuration}*/
  const extensionConfig = {
    target: 'node',
    mode: isProduction ? 'production' : 'none',
    entry: './src/extension.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2'
    },
    externals: {
      vscode: 'commonjs vscode'
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                compilerOptions: {
                  module: 'es2020'
                }
              }
            }
          ]
        }
      ]
    },
    optimization: {
      minimize: isProduction
    },
    devtool: isProduction ? false : 'source-map'
  };

  /**@type {import('webpack').Configuration}*/
  const webviewConfig = {
    target: 'web',
    mode: isProduction ? 'production' : 'none',
    entry: {
      webview: './src/webview/index.ts',
      parser_worker: './src/webview/parser.worker.ts'
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: (pathData) => pathData.chunk?.name === 'parser_worker'
        ? 'parser.worker.js'
        : 'webview.js'
    },
    resolve: {
      extensions: ['.ts', '.js'],
      fallback: {
        "process": require.resolve("process/browser"),
        "path": false,
        "fs": false
      }
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                compilerOptions: {
                  module: 'es2020'
                }
              }
            }
          ]
        }
      ]
    },
    optimization: {
      minimize: isProduction,
      usedExports: true,
      sideEffects: true
      // Note: Code splitting disabled to avoid CSP issues with dynamically loaded chunks
      // in VS Code webview. The webview CSP requires nonce on all scripts, and webpack
      // chunks loaded via dynamic import don't get the nonce attribute.
    },
    performance: {
      hints: isProduction ? 'warning' : false,
      maxAssetSize: 4000000, // 4 MB (node-sql-parser is ~2.4MB)
      maxEntrypointSize: 4000000
    },
    plugins: [
      new webpack.ProvidePlugin({
        process: 'process/browser',
      })
    ],
    devtool: isProduction ? false : 'source-map'
  };

  return [extensionConfig, webviewConfig];
};
