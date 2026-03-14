// Code Minifier JavaScript

class CodeMinifier {
    constructor() {
        this.currentTab = 'html';
        this.initElements();
        this.bindEvents();
    }

    initElements() {
        this.tabs = document.querySelectorAll('.tab');
        this.inputCode = document.getElementById('inputCode');
        this.outputCode = document.getElementById('outputCode');
        this.minifyBtn = document.getElementById('minifyBtn');
        this.beautifyBtn = document.getElementById('beautifyBtn');
        this.pasteBtn = document.getElementById('pasteBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.copyBtn = document.getElementById('copyBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.stats = document.getElementById('stats');
        this.originalSize = document.getElementById('originalSize');
        this.minifiedSize = document.getElementById('minifiedSize');
        this.savedSize = document.getElementById('savedSize');
        this.toast = document.getElementById('toast');

        // Options panels
        this.htmlOptions = document.getElementById('htmlOptions');
        this.cssOptions = document.getElementById('cssOptions');
        this.jsOptions = document.getElementById('jsOptions');
    }

    bindEvents() {
        // Tab switching
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Main actions
        this.minifyBtn.addEventListener('click', () => this.minify());
        this.beautifyBtn.addEventListener('click', () => this.beautify());

        // Helper actions
        this.pasteBtn.addEventListener('click', () => this.paste());
        this.clearBtn.addEventListener('click', () => this.clear());
        this.copyBtn.addEventListener('click', () => this.copy());
        this.downloadBtn.addEventListener('click', () => this.download());
    }

    switchTab(tab) {
        this.currentTab = tab;
        this.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

        // Show/hide options panels
        this.htmlOptions.style.display = tab === 'html' ? 'block' : 'none';
        this.cssOptions.style.display = tab === 'css' ? 'block' : 'none';
        this.jsOptions.style.display = tab === 'js' ? 'block' : 'none';

        // Update placeholder
        const placeholders = {
            html: 'Paste your HTML code here...',
            css: 'Paste your CSS code here...',
            js: 'Paste your JavaScript code here...'
        };
        this.inputCode.placeholder = placeholders[tab];
    }

    minify() {
        const input = this.inputCode.value;
        if (!input.trim()) {
            this.showToast('Please enter some code to minify');
            return;
        }

        let output;
        switch (this.currentTab) {
            case 'html':
                output = this.minifyHTML(input);
                break;
            case 'css':
                output = this.minifyCSS(input);
                break;
            case 'js':
                output = this.minifyJS(input);
                break;
        }

        this.outputCode.value = output;
        this.updateStats(input, output);
    }

    beautify() {
        const input = this.inputCode.value;
        if (!input.trim()) {
            this.showToast('Please enter some code to beautify');
            return;
        }

        let output;
        switch (this.currentTab) {
            case 'html':
                output = this.beautifyHTML(input);
                break;
            case 'css':
                output = this.beautifyCSS(input);
                break;
            case 'js':
                output = this.beautifyJS(input);
                break;
        }

        this.outputCode.value = output;
        this.updateStats(input, output);
    }

    // === HTML Minification ===
    minifyHTML(code) {
        let result = code;

        if (document.getElementById('htmlRemoveComments').checked) {
            result = result.replace(/<!--[\s\S]*?-->/g, '');
        }

        if (document.getElementById('htmlCollapseWhitespace').checked) {
            result = result
                .replace(/\s+/g, ' ')
                .replace(/>\s+</g, '><')
                .replace(/\s+>/g, '>')
                .replace(/<\s+/g, '<');
        }

        if (document.getElementById('htmlRemoveEmptyAttrs').checked) {
            result = result.replace(/\s+(?:class|id|style)=["']\s*["']/gi, '');
        }

        return result.trim();
    }

    beautifyHTML(code) {
        let result = '';
        let indent = 0;
        const indentStr = '  ';
        const selfClosing = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];

        // Simple HTML beautifier
        const tokens = code.replace(/>\s*</g, '>\n<').split('\n');

        tokens.forEach(token => {
            token = token.trim();
            if (!token) return;

            // Check if closing tag
            if (token.match(/^<\/\w/)) {
                indent = Math.max(0, indent - 1);
            }

            result += indentStr.repeat(indent) + token + '\n';

            // Check if opening tag (not self-closing)
            if (token.match(/^<\w[^>]*[^\/]>$/)) {
                const tagMatch = token.match(/^<(\w+)/);
                if (tagMatch && !selfClosing.includes(tagMatch[1].toLowerCase())) {
                    indent++;
                }
            }
        });

        return result.trim();
    }

    // === CSS Minification ===
    minifyCSS(code) {
        let result = code;

        if (document.getElementById('cssRemoveComments').checked) {
            result = result.replace(/\/\*[\s\S]*?\*\//g, '');
        }

        if (document.getElementById('cssRemoveWhitespace').checked) {
            result = result
                .replace(/\s+/g, ' ')
                .replace(/\s*{\s*/g, '{')
                .replace(/\s*}\s*/g, '}')
                .replace(/\s*;\s*/g, ';')
                .replace(/\s*:\s*/g, ':')
                .replace(/\s*,\s*/g, ',');
        }

        if (document.getElementById('cssRemoveLastSemicolon').checked) {
            result = result.replace(/;}/g, '}');
        }

        if (document.getElementById('cssShortColors').checked) {
            // Convert #ffffff to #fff
            result = result.replace(/#([0-9a-fA-F])\1([0-9a-fA-F])\2([0-9a-fA-F])\3\b/g, '#$1$2$3');
        }

        return result.trim();
    }

    beautifyCSS(code) {
        let result = code;

        // Remove existing formatting
        result = result.replace(/\s+/g, ' ');

        // Add newlines and indentation
        result = result
            .replace(/\{/g, ' {\n  ')
            .replace(/\}/g, '\n}\n\n')
            .replace(/;/g, ';\n  ')
            .replace(/;\n  }/g, ';\n}')
            .replace(/{\n  \n}/g, '{}')
            .replace(/\n\s*\n/g, '\n\n');

        return result.trim();
    }

    // === JavaScript Minification ===
    minifyJS(code) {
        let result = code;

        if (document.getElementById('jsRemoveComments').checked) {
            // Remove single-line comments (but not URLs)
            result = result.replace(/([^:])\/\/.*$/gm, '$1');
            // Remove multi-line comments
            result = result.replace(/\/\*[\s\S]*?\*\//g, '');
        }

        if (document.getElementById('jsRemoveConsole').checked) {
            result = result.replace(/console\.(log|debug|info|warn|error|trace|dir|group|groupEnd|time|timeEnd|assert|count)\s*\([^)]*\)\s*;?/g, '');
        }

        if (document.getElementById('jsRemoveWhitespace').checked) {
            // Preserve strings while removing whitespace
            const strings = [];
            result = result.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, match => {
                strings.push(match);
                return `__STRING_${strings.length - 1}__`;
            });

            // Remove whitespace
            result = result
                .replace(/\s+/g, ' ')
                .replace(/\s*([{}\[\]();,=+\-*/%<>!&|?:])\s*/g, '$1')
                .replace(/\s*\n\s*/g, '')
                .replace(/;;+/g, ';');

            // Restore strings
            strings.forEach((str, i) => {
                result = result.replace(`__STRING_${i}__`, str);
            });
        }

        return result.trim();
    }

    beautifyJS(code) {
        let result = code;
        let indent = 0;
        const indentStr = '  ';

        // Preserve strings
        const strings = [];
        result = result.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, match => {
            strings.push(match);
            return `__STRING_${strings.length - 1}__`;
        });

        // Add newlines
        result = result
            .replace(/\{/g, ' {\n')
            .replace(/\}/g, '\n}\n')
            .replace(/;/g, ';\n')
            .replace(/,\s*\n/g, ',\n');

        // Add indentation
        const lines = result.split('\n');
        result = lines.map(line => {
            line = line.trim();
            if (!line) return '';

            if (line.startsWith('}')) {
                indent = Math.max(0, indent - 1);
            }

            const indented = indentStr.repeat(indent) + line;

            if (line.endsWith('{')) {
                indent++;
            }

            return indented;
        }).filter(line => line !== '').join('\n');

        // Restore strings
        strings.forEach((str, i) => {
            result = result.replace(`__STRING_${i}__`, str);
        });

        return result.trim();
    }

    // === Utility Functions ===
    updateStats(original, minified) {
        const originalBytes = new Blob([original]).size;
        const minifiedBytes = new Blob([minified]).size;
        const saved = originalBytes - minifiedBytes;
        const percent = originalBytes > 0 ? ((saved / originalBytes) * 100).toFixed(1) : 0;

        this.originalSize.textContent = this.formatBytes(originalBytes);
        this.minifiedSize.textContent = this.formatBytes(minifiedBytes);
        this.savedSize.textContent = `${this.formatBytes(saved)} (${percent}%)`;

        this.stats.style.display = 'flex';
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async paste() {
        try {
            const text = await navigator.clipboard.readText();
            this.inputCode.value = text;
            this.showToast('Pasted from clipboard');
        } catch (e) {
            this.showToast('Unable to access clipboard');
        }
    }

    clear() {
        this.inputCode.value = '';
        this.outputCode.value = '';
        this.stats.style.display = 'none';
    }

    copy() {
        const text = this.outputCode.value;
        if (!text) {
            this.showToast('Nothing to copy');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Copied to clipboard');
        });
    }

    download() {
        const text = this.outputCode.value;
        if (!text) {
            this.showToast('Nothing to download');
            return;
        }

        const extensions = { html: 'html', css: 'css', js: 'js' };
        const ext = extensions[this.currentTab];
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `minified.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('File downloaded');
    }

    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new CodeMinifier();
});
