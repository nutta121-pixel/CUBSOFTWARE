/**
 * Webpack Configuration for Web Version (Browser)
 */

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = {
    target: 'web',
    mode: 'development',
    entry: './desktop/renderer/index.tsx',
    output: {
        path: path.resolve(__dirname, 'dist/web'),
        filename: 'bundle.js',
        clean: true
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
        fallback: {
            "fs": false,
            "path": false,
            "os": false,
            "crypto": false
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
    devServer: {
        static: {
            directory: path.join(__dirname, 'dist/web'),
        },
        compress: true,
        port: 3000,
        hot: true,
        open: true
    },
    devtool: 'source-map'
};
