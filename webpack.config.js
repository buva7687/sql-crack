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
  optimization: isProduction ? {
    minimize: true,
    usedExports: true,
    sideEffects: true
  } : undefined,
  performance: {
    hints: isProduction ? 'warning' : false,
    maxAssetSize: 1000000, // 1 MB target
    maxEntrypointSize: 1000000
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
    })
  ],
  devtool: false
};

module.exports = [extensionConfig, webviewConfig];
