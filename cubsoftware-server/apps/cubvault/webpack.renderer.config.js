/**
 * Webpack Configuration for Electron Renderer Process (React App)
 */

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = {
    target: 'electron-renderer',
    mode: 'development',
    entry: './desktop/renderer/index.tsx',
    output: {
        path: path.resolve(__dirname, 'dist/desktop/renderer'),
        filename: 'index.js'
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js', '.jsx'],
        conditionNames: ['browser', 'import', 'require', 'default'],
        alias: {
            '@noble/hashes/crypto': path.resolve(__dirname, 'node_modules/@noble/hashes/crypto.js')
        },
        fallback: {
            "crypto": false,
            "stream": false,
            "buffer": false,
            "util": false,
            "process": false,
            "path": false,
            "fs": false,
            "os": false
        }
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './desktop/renderer/index.html',
            filename: 'index.html'
        }),
        new webpack.DefinePlugin({
            'process.env.API_BASE_URL': JSON.stringify(process.env.API_BASE_URL || 'http://localhost:3001'),
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
        })
    ],
    devtool: 'source-map'
};
