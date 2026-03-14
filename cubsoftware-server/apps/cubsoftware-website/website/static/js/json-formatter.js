// JSON Formatter JavaScript

// Elements
const jsonInput = document.getElementById('jsonInput');
const jsonOutput = document.getElementById('jsonOutput');
const inputLineNumbers = document.getElementById('inputLineNumbers');
const outputLineNumbers = document.getElementById('outputLineNumbers');
const statusBar = document.getElementById('statusBar');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');
const inputLines = document.getElementById('inputLines');
const inputSize = document.getElementById('inputSize');
const outputFormatted = document.getElementById('outputFormatted');
const outputTree = document.getElementById('outputTree');
const panelTabs = document.querySelectorAll('.panel-tab');

// Settings
const indentSize = document.getElementById('indentSize');
const sortKeys = document.getElementById('sortKeys');
const quoteKeys = document.getElementById('quoteKeys');

// State
let currentJson = null;
let currentView = 'formatted';

// Sample JSON
const sampleJson = {
    "name": "John Doe",
    "age": 30,
    "email": "john@example.com",
    "isActive": true,
    "address": {
        "street": "123 Main St",
        "city": "New York",
        "zipCode": "10001"
    },
    "hobbies": ["reading", "gaming", "coding"],
    "education": [
        {
            "degree": "Bachelor's",
            "field": "Computer Science",
            "year": 2015
        }
    ],
    "metadata": null
};

// Initialize
function init() {
    setupEventListeners();
    updateLineNumbers(jsonInput, inputLineNumbers);
    updateInputStats();
}

// Setup event listeners
function setupEventListeners() {
    // Input events
    jsonInput.addEventListener('input', () => {
        updateLineNumbers(jsonInput, inputLineNumbers);
        updateInputStats();
        validateJson();
    });

    jsonInput.addEventListener('scroll', () => {
        inputLineNumbers.scrollTop = jsonInput.scrollTop;
    });

    // Action buttons
    document.getElementById('formatBtn').addEventListener('click', formatJson);
    document.getElementById('minifyBtn').addEventListener('click', minifyJson);
    document.getElementById('validateBtn').addEventListener('click', () => validateJson(true));
    document.getElementById('copyBtn').addEventListener('click', copyOutput);
    document.getElementById('clearBtn').addEventListener('click', clearAll);
    document.getElementById('sampleBtn').addEventListener('click', loadSample);

    // View tabs
    panelTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            panelTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentView = tab.dataset.view;
            toggleView();
        });
    });

    // Settings
    indentSize.addEventListener('change', () => {
        if (currentJson) formatJson();
    });

    sortKeys.addEventListener('change', () => {
        if (currentJson) formatJson();
    });
}

// Update line numbers
function updateLineNumbers(textarea, lineNumbersEl) {
    const lines = textarea.value.split('\n').length;
    let html = '';
    for (let i = 1; i <= lines; i++) {
        html += i + '\n';
    }
    lineNumbersEl.textContent = html;
}

// Update input stats
function updateInputStats() {
    const text = jsonInput.value;
    const lines = text.split('\n').length;
    const bytes = new Blob([text]).size;

    inputLines.textContent = `${lines} line${lines !== 1 ? 's' : ''}`;
    inputSize.textContent = formatBytes(bytes);
}

// Validate JSON
function validateJson(showMessage = false) {
    const text = jsonInput.value.trim();

    if (!text) {
        setStatus('neutral', 'Enter JSON to validate');
        currentJson = null;
        return false;
    }

    try {
        currentJson = JSON.parse(text);
        setStatus('valid', 'Valid JSON');
        if (showMessage) showToast('JSON is valid!');
        return true;
    } catch (e) {
        const match = e.message.match(/position (\d+)/);
        let errorMsg = 'Invalid JSON';

        if (match) {
            const pos = parseInt(match[1]);
            const lines = text.substring(0, pos).split('\n');
            const line = lines.length;
            const col = lines[lines.length - 1].length + 1;
            errorMsg = `Error at line ${line}, column ${col}: ${e.message}`;
        } else {
            errorMsg = e.message;
        }

        setStatus('error', errorMsg);
        currentJson = null;
        return false;
    }
}

// Set status
function setStatus(type, message) {
    statusBar.className = 'status-bar ' + type;

    if (type === 'valid') {
        statusIcon.textContent = '✓';
    } else if (type === 'error') {
        statusIcon.textContent = '✕';
    } else {
        statusIcon.textContent = '○';
    }

    statusText.textContent = message;
}

// Format JSON
function formatJson() {
    if (!validateJson()) return;

    let indent;
    if (indentSize.value === 'tab') {
        indent = '\t';
    } else {
        indent = parseInt(indentSize.value);
    }

    let obj = currentJson;

    // Sort keys if enabled
    if (sortKeys.checked) {
        obj = sortObjectKeys(obj);
    }

    const formatted = JSON.stringify(obj, null, indent);
    jsonOutput.innerHTML = syntaxHighlight(formatted);
    updateLineNumbers({ value: formatted }, outputLineNumbers);

    // Update tree view too
    if (currentView === 'tree') {
        renderTreeView();
    }
}

// Minify JSON
function minifyJson() {
    if (!validateJson()) return;

    const minified = JSON.stringify(currentJson);
    jsonOutput.innerHTML = syntaxHighlight(minified);
    updateLineNumbers({ value: minified }, outputLineNumbers);
}

// Sort object keys recursively
function sortObjectKeys(obj) {
    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
    } else if (obj !== null && typeof obj === 'object') {
        return Object.keys(obj)
            .sort()
            .reduce((result, key) => {
                result[key] = sortObjectKeys(obj[key]);
                return result;
            }, {});
    }
    return obj;
}

// Syntax highlighting
function syntaxHighlight(json) {
    // Escape HTML
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return json.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        function(match) {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        }
    );
}

// Toggle view
function toggleView() {
    if (currentView === 'formatted') {
        outputFormatted.style.display = 'flex';
        outputTree.style.display = 'none';
    } else {
        outputFormatted.style.display = 'none';
        outputTree.style.display = 'block';
        renderTreeView();
    }
}

// Render tree view
function renderTreeView() {
    if (!currentJson) {
        outputTree.innerHTML = '<div style="color: var(--text-muted);">No valid JSON to display</div>';
        return;
    }

    outputTree.innerHTML = renderTreeNode(currentJson, true);
}

// Render tree node
function renderTreeNode(data, isRoot = false) {
    if (data === null) {
        return '<span class="tree-value null">null</span>';
    }

    if (typeof data === 'boolean') {
        return `<span class="tree-value boolean">${data}</span>`;
    }

    if (typeof data === 'number') {
        return `<span class="tree-value number">${data}</span>`;
    }

    if (typeof data === 'string') {
        return `<span class="tree-value">"${escapeHtml(data)}"</span>`;
    }

    if (Array.isArray(data)) {
        if (data.length === 0) return '<span class="json-bracket">[]</span>';

        let html = '<div class="tree-node' + (isRoot ? ' tree-node-root' : '') + '">';
        html += '<span class="tree-toggle" onclick="this.parentElement.classList.toggle(\'tree-collapsed\')">▼</span>';
        html += '<span class="json-bracket">[</span>';
        html += '<div class="tree-children">';

        data.forEach((item, index) => {
            html += '<div class="tree-node">';
            html += `<span class="tree-key">${index}:</span> `;
            html += renderTreeNode(item);
            if (index < data.length - 1) html += ',';
            html += '</div>';
        });

        html += '</div>';
        html += '<span class="json-bracket">]</span>';
        html += '</div>';
        return html;
    }

    if (typeof data === 'object') {
        const keys = Object.keys(data);
        if (keys.length === 0) return '<span class="json-bracket">{}</span>';

        let html = '<div class="tree-node' + (isRoot ? ' tree-node-root' : '') + '">';
        html += '<span class="tree-toggle" onclick="this.parentElement.classList.toggle(\'tree-collapsed\')">▼</span>';
        html += '<span class="json-bracket">{</span>';
        html += '<div class="tree-children">';

        keys.forEach((key, index) => {
            html += '<div class="tree-node">';
            html += `<span class="tree-key">"${escapeHtml(key)}":</span> `;
            html += renderTreeNode(data[key]);
            if (index < keys.length - 1) html += ',';
            html += '</div>';
        });

        html += '</div>';
        html += '<span class="json-bracket">}</span>';
        html += '</div>';
        return html;
    }

    return String(data);
}

// Copy output
function copyOutput() {
    const text = jsonOutput.textContent;
    if (!text) {
        showToast('Nothing to copy');
        return;
    }

    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
}

// Clear all
function clearAll() {
    jsonInput.value = '';
    jsonOutput.innerHTML = '';
    outputTree.innerHTML = '';
    currentJson = null;
    updateLineNumbers(jsonInput, inputLineNumbers);
    updateLineNumbers({ value: '' }, outputLineNumbers);
    updateInputStats();
    setStatus('neutral', 'Enter JSON to validate');
}

// Load sample
function loadSample() {
    jsonInput.value = JSON.stringify(sampleJson, null, 4);
    updateLineNumbers(jsonInput, inputLineNumbers);
    updateInputStats();
    validateJson();
    formatJson();
}

// Format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 bytes';
    const k = 1024;
    const sizes = ['bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show toast
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
