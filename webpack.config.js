const path = require('path');
const webpack = require('webpack');

const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--mode=production');

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
  devtool: false
};

/**@type {import('webpack').Configuration}*/
const webviewConfig = {
  target: 'web',
  mode: isProduction ? 'production' : 'none',
  entry: './src/webview/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'webview.js'
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
  devtool: false
};

module.exports = [extensionConfig, webviewConfig];
