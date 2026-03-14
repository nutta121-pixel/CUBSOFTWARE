/**
 * Webpack Configuration for Electron Main Process
 */

const path = require('path');

module.exports = {
    target: 'electron-main',
    mode: 'development',
    entry: {
        main: './desktop/main.ts',
        preload: './desktop/preload.ts'
    },
    output: {
        path: path.resolve(__dirname, 'dist/desktop'),
        filename: '[name].js'
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    node: {
        __dirname: false,
        __filename: false
    },
    externals: {
        electron: 'commonjs electron'
    }
};
