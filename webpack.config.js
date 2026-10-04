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
  const sharedOutputKeep = isProduction
    ? /^(?:extension|webview|parser\.worker|workspace\.worker)\.js$|^webview\.js\.LICENSE\.txt$/
    : /^(?:extension|webview|parser\.worker|workspace\.worker)\.js(?:\.map)?$|^webview\.js\.LICENSE\.txt$/;

  /**@type {import('webpack').Configuration}*/
  const extensionConfig = {
    target: 'node',
    mode: isProduction ? 'production' : 'none',
    entry: './src/extension.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2',
      clean: {
        keep: sharedOutputKeep
      }
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
      // PDF export only uses addImage; jsPDF's optional HTML renderer is unused.
      alias: { html2canvas: false, canvg: false, dompurify: false },
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
      // The parser dominates this bundle and CSP-safe dynamic chunk loading is
      // intentionally disabled. Keep an explicit 4 MiB budget (binary bytes),
      // which still warns on meaningful growth without mislabeling 4,000,000
      // bytes as "4 MB" in webpack's MiB-formatted output.
      maxAssetSize: 4 * 1024 * 1024,
      maxEntrypointSize: 4 * 1024 * 1024
    },
    plugins: [
      new webpack.ProvidePlugin({
        process: 'process/browser',
      })
    ],
    devtool: isProduction ? false : 'source-map'
  };

  const workspaceWorkerConfig = {
    ...extensionConfig,
    entry: './src/workspace/analysis.worker.ts',
    plugins: [new webpack.NormalModuleReplacementPlugin(/(?:^|\/)logger$/, path.resolve(__dirname, 'src/workspace/workerLogger.ts'))],
    output: { path: path.resolve(__dirname, 'dist'), filename: 'workspace.worker.js', libraryTarget: 'commonjs2' }
  };
  return [extensionConfig, webviewConfig, workspaceWorkerConfig];
};
