const path = require('path');

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
        exclude: [/node_modules/, /__tests__/, /\.test\.ts$/],
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              onlyCompileBundledFiles: true
            }
          }
        ]
      }
    ]
  },
  devtool: false,
  infrastructureLogging: {
    level: "log",
  },
};

/**@type {import('webpack').Configuration}*/
const webviewConfig = {
  target: 'web',
  mode: isProduction ? 'production' : 'none',
  entry: './src/webview/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'webview.js'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: isProduction ? {
      'react': 'react/cjs/react.production.min.js',
      'react-dom': 'react-dom/cjs/react-dom.production.min.js'
    } : {}
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: [/node_modules/, /__tests__/, /\.test\.tsx?$/],
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              onlyCompileBundledFiles: true
            }
          }
        ]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  optimization: isProduction ? {
    minimize: true,
    usedExports: true,
    sideEffects: false,
    splitChunks: false, // Don't split chunks for VS Code extension
    runtimeChunk: false
  } : undefined,
  performance: {
    hints: isProduction ? 'warning' : false,
    maxAssetSize: 2500000, // 2.5 MB
    maxEntrypointSize: 2500000
  },
  devtool: false
};

module.exports = [extensionConfig, webviewConfig];
