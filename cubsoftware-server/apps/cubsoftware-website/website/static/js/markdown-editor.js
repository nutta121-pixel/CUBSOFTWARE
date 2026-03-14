// Markdown Editor JavaScript

class MarkdownEditor {
    constructor() {
        this.initElements();
        this.bindEvents();
        this.loadSaved();
    }

    initElements() {
        this.markdownInput = document.getElementById('markdownInput');
        this.previewContent = document.getElementById('previewContent');
        this.toolbarBtns = document.querySelectorAll('.toolbar-btn');
        this.clearBtn = document.getElementById('clearBtn');
        this.copyHtmlBtn = document.getElementById('copyHtmlBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.toast = document.getElementById('toast');
    }

    bindEvents() {
        // Real-time preview
        this.markdownInput.addEventListener('input', () => {
            this.updatePreview();
            this.saveDraft();
        });

        // Toolbar actions
        this.toolbarBtns.forEach(btn => {
            btn.addEventListener('click', () => this.handleToolbar(btn.dataset.action));
        });

        // Keyboard shortcuts
        this.markdownInput.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Clear button
        this.clearBtn.addEventListener('click', () => {
            if (confirm('Clear all content?')) {
                this.markdownInput.value = '';
                this.updatePreview();
                localStorage.removeItem('markdownDraft');
            }
        });

        // Copy HTML
        this.copyHtmlBtn.addEventListener('click', () => {
            const html = this.previewContent.innerHTML;
            navigator.clipboard.writeText(html).then(() => {
                this.showToast('HTML copied to clipboard');
            });
        });

        // Download
        this.downloadBtn.addEventListener('click', () => this.download());
    }

    handleToolbar(action) {
        const start = this.markdownInput.selectionStart;
        const end = this.markdownInput.selectionEnd;
        const text = this.markdownInput.value;
        const selected = text.substring(start, end);

        let replacement = '';
        let cursorOffset = 0;

        switch (action) {
            case 'bold':
                replacement = `**${selected || 'bold text'}**`;
                cursorOffset = selected ? 0 : -2;
                break;
            case 'italic':
                replacement = `*${selected || 'italic text'}*`;
                cursorOffset = selected ? 0 : -1;
                break;
            case 'strikethrough':
                replacement = `~~${selected || 'strikethrough'}~~`;
                cursorOffset = selected ? 0 : -2;
                break;
            case 'h1':
                replacement = `# ${selected || 'Heading 1'}`;
                break;
            case 'h2':
                replacement = `## ${selected || 'Heading 2'}`;
                break;
            case 'h3':
                replacement = `### ${selected || 'Heading 3'}`;
                break;
            case 'ul':
                replacement = selected ? selected.split('\n').map(l => `- ${l}`).join('\n') : '- List item';
                break;
            case 'ol':
                replacement = selected ? selected.split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n') : '1. List item';
                break;
            case 'checkbox':
                replacement = selected ? selected.split('\n').map(l => `- [ ] ${l}`).join('\n') : '- [ ] Task';
                break;
            case 'link':
                replacement = `[${selected || 'link text'}](url)`;
                cursorOffset = selected ? -1 : -4;
                break;
            case 'image':
                replacement = `![${selected || 'alt text'}](image-url)`;
                cursorOffset = selected ? -1 : -10;
                break;
            case 'code':
                replacement = `\`${selected || 'code'}\``;
                cursorOffset = selected ? 0 : -1;
                break;
            case 'codeblock':
                replacement = `\`\`\`\n${selected || 'code'}\n\`\`\``;
                cursorOffset = selected ? 0 : -4;
                break;
            case 'quote':
                replacement = selected ? selected.split('\n').map(l => `> ${l}`).join('\n') : '> Quote';
                break;
            case 'hr':
                replacement = '\n---\n';
                break;
            case 'table':
                replacement = `| Header 1 | Header 2 | Header 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |`;
                break;
        }

        this.markdownInput.value = text.substring(0, start) + replacement + text.substring(end);
        this.markdownInput.focus();

        const newPos = start + replacement.length + cursorOffset;
        this.markdownInput.setSelectionRange(newPos, newPos);

        this.updatePreview();
        this.saveDraft();
    }

    handleKeyboard(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'b':
                    e.preventDefault();
                    this.handleToolbar('bold');
                    break;
                case 'i':
                    e.preventDefault();
                    this.handleToolbar('italic');
                    break;
                case 'k':
                    e.preventDefault();
                    this.handleToolbar('link');
                    break;
            }
        }

        // Tab handling for code blocks
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.markdownInput.selectionStart;
            const end = this.markdownInput.selectionEnd;
            const text = this.markdownInput.value;
            this.markdownInput.value = text.substring(0, start) + '  ' + text.substring(end);
            this.markdownInput.selectionStart = this.markdownInput.selectionEnd = start + 2;
        }
    }

    updatePreview() {
        const markdown = this.markdownInput.value;

        if (!markdown.trim()) {
            this.previewContent.innerHTML = '<p class="placeholder-text">Your rendered Markdown will appear here...</p>';
            return;
        }

        this.previewContent.innerHTML = this.parseMarkdown(markdown);
    }

    parseMarkdown(md) {
        let html = md;

        // Escape HTML
        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Code blocks (must be first to avoid other processing inside)
        html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Headers
        html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

        // Bold and italic
        html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');

        // Images (before links)
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

        // Blockquotes
        html = html.replace(/^&gt; (.*$)/gm, '<blockquote>$1</blockquote>');

        // Horizontal rule
        html = html.replace(/^---$/gm, '<hr>');

        // Checkboxes
        html = html.replace(/^- \[x\] (.*$)/gm, '<li><input type="checkbox" checked disabled> $1</li>');
        html = html.replace(/^- \[ \] (.*$)/gm, '<li><input type="checkbox" disabled> $1</li>');

        // Unordered lists
        html = html.replace(/^- (.*$)/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>(\n|$))+/g, '<ul>$&</ul>');

        // Ordered lists
        html = html.replace(/^\d+\. (.*$)/gm, '<li>$1</li>');

        // Tables
        html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
            const cells = content.split('|').map(c => c.trim());
            if (cells.every(c => /^-+$/.test(c))) {
                return ''; // Skip separator row
            }
            const isHeader = /<\/th>/.test(html.substring(html.lastIndexOf('<table'), html.length)) === false;
            const tag = isHeader ? 'th' : 'td';
            return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
        });
        html = html.replace(/(<tr>.*<\/tr>(\n|$))+/g, '<table>$&</table>');

        // Paragraphs (lines not already wrapped)
        html = html.split('\n\n').map(block => {
            if (block.trim() && !block.match(/^<[^>]+>/)) {
                return `<p>${block.replace(/\n/g, '<br>')}</p>`;
            }
            return block;
        }).join('\n');

        // Clean up
        html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');
        html = html.replace(/<\/ul>\n<ul>/g, '\n');

        return html;
    }

    saveDraft() {
        localStorage.setItem('markdownDraft', this.markdownInput.value);
    }

    loadSaved() {
        const saved = localStorage.getItem('markdownDraft');
        if (saved) {
            this.markdownInput.value = saved;
            this.updatePreview();
        }
    }

    download() {
        const markdown = this.markdownInput.value;
        if (!markdown.trim()) {
            this.showToast('Nothing to download');
            return;
        }

        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('Markdown file downloaded');
    }

    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new MarkdownEditor();
});
