// Text Tools JavaScript

// DOM Elements
const inputText = document.getElementById('inputText');
const outputText = document.getElementById('outputText');
const toast = document.getElementById('toast');

// Stats Elements
const charCount = document.getElementById('charCount');
const charNoSpaceCount = document.getElementById('charNoSpaceCount');
const wordCount = document.getElementById('wordCount');
const sentenceCount = document.getElementById('sentenceCount');
const paragraphCount = document.getElementById('paragraphCount');
const lineCount = document.getElementById('lineCount');

// Button Elements
const pasteBtn = document.getElementById('pasteBtn');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const generateLorem = document.getElementById('generateLorem');
const replaceAllBtn = document.getElementById('replaceAllBtn');
// Selected transformations
let selectedTransformations = [];

// Lorem Elements
const loremCount = document.getElementById('loremCount');
const loremType = document.getElementById('loremType');

// Find & Replace Elements
const findText = document.getElementById('findText');
const replaceText = document.getElementById('replaceText');
const caseSensitive = document.getElementById('caseSensitive');
const useRegex = document.getElementById('useRegex');

// Initialize
function init() {
    setupEventListeners();
    updateStats();
}

// Setup Event Listeners
function setupEventListeners() {
    // Input text change
    inputText.addEventListener('input', () => {
        updateStats();
        applyAllTransformations();
    });

    // Action buttons
    pasteBtn.addEventListener('click', pasteFromClipboard);
    clearBtn.addEventListener('click', clearText);
    copyBtn.addEventListener('click', copyToClipboard);
    downloadBtn.addEventListener('click', downloadText);

    // Tool buttons - toggle selection and apply immediately
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            btn.classList.toggle('selected');

            if (btn.classList.contains('selected')) {
                selectedTransformations.push(action);
            } else {
                selectedTransformations = selectedTransformations.filter(a => a !== action);
            }

            // Apply all selected transformations immediately
            applyAllTransformations();
        });
    });

    // Lorem Ipsum
    generateLorem.addEventListener('click', generateLoremIpsum);

    // Find & Replace
    replaceAllBtn.addEventListener('click', findAndReplace);
}

// Update text statistics
function updateStats() {
    const text = inputText.value;

    // Character count
    charCount.textContent = text.length;

    // Character count without spaces
    charNoSpaceCount.textContent = text.replace(/\s/g, '').length;

    // Word count
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    wordCount.textContent = words.length;

    // Sentence count
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    sentenceCount.textContent = sentences.length;

    // Paragraph count
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    paragraphCount.textContent = text.trim() ? paragraphs.length : 0;

    // Line count
    const lines = text.split('\n');
    lineCount.textContent = text.trim() ? lines.length : 0;
}

// Apply all selected transformations
function applyAllTransformations() {
    let result = inputText.value;

    if (selectedTransformations.length === 0) {
        outputText.value = result;
        return;
    }

    for (const action of selectedTransformations) {
        result = applyTransformation(action, result);
    }

    outputText.value = result;
}

// Apply text transformation
function applyTransformation(action, text = null) {
    if (text === null) text = inputText.value;
    let result = '';

    switch (action) {
        // Case Conversion
        case 'uppercase':
            result = text.toUpperCase();
            break;
        case 'lowercase':
            result = text.toLowerCase();
            break;
        case 'titlecase':
            result = toTitleCase(text);
            break;
        case 'sentencecase':
            result = toSentenceCase(text);
            break;
        case 'togglecase':
            result = toggleCase(text);
            break;
        case 'capitalizewords':
            result = capitalizeWords(text);
            break;

        // Text Formatting
        case 'removeextraspaces':
            result = text.replace(/  +/g, ' ').replace(/\n +/g, '\n').replace(/ +\n/g, '\n');
            break;
        case 'removelinebreaks':
            result = text.replace(/\n+/g, ' ').replace(/  +/g, ' ');
            break;
        case 'addlinenumbers':
            result = addLineNumbers(text);
            break;
        case 'removelinenumbers':
            result = removeLineNumbers(text);
            break;
        case 'trimlines':
            result = text.split('\n').map(line => line.trim()).join('\n');
            break;
        case 'removeemptylines':
            result = text.split('\n').filter(line => line.trim().length > 0).join('\n');
            break;

        // Text Manipulation
        case 'reversetext':
            result = text.split('').reverse().join('');
            break;
        case 'reverselines':
            result = text.split('\n').reverse().join('\n');
            break;
        case 'sortlines':
            result = text.split('\n').sort((a, b) => a.localeCompare(b)).join('\n');
            break;
        case 'sortlinesdesc':
            result = text.split('\n').sort((a, b) => b.localeCompare(a)).join('\n');
            break;
        case 'shufflelines':
            result = shuffleArray(text.split('\n')).join('\n');
            break;
        case 'removeduplicates':
            result = [...new Set(text.split('\n'))].join('\n');
            break;

        // Encode/Decode
        case 'encodeurl':
            result = encodeURIComponent(text);
            break;
        case 'decodeurl':
            try {
                result = decodeURIComponent(text);
            } catch {
                result = text;
                showToast('Invalid URL encoding');
            }
            break;
        case 'encodebase64':
            try {
                result = btoa(unescape(encodeURIComponent(text)));
            } catch {
                result = text;
                showToast('Could not encode to Base64');
            }
            break;
        case 'decodebase64':
            try {
                result = decodeURIComponent(escape(atob(text)));
            } catch {
                result = text;
                showToast('Invalid Base64 string');
            }
            break;
        case 'encodehtmlentities':
            result = encodeHTMLEntities(text);
            break;
        case 'decodehtmlentities':
            result = decodeHTMLEntities(text);
            break;

        default:
            result = text;
    }

    return result;
}

// Helper Functions
function toTitleCase(str) {
    return str.toLowerCase().replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
}

function toSentenceCase(str) {
    return str.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, match => match.toUpperCase());
}

function toggleCase(str) {
    return str.split('').map(char => {
        return char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase();
    }).join('');
}

function capitalizeWords(str) {
    return str.replace(/\b\w/g, char => char.toUpperCase());
}

function addLineNumbers(str) {
    return str.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n');
}

function removeLineNumbers(str) {
    return str.split('\n').map(line => line.replace(/^\d+[\.\)\:\-]\s*/, '')).join('\n');
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function encodeHTMLEntities(str) {
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
}

function decodeHTMLEntities(str) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
}

// Paste from clipboard
async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        inputText.value = text;
        outputText.value = text;
        updateStats();
        showToast('Pasted from clipboard');
    } catch {
        showToast('Could not access clipboard');
    }
}

// Clear text
function clearText() {
    inputText.value = '';
    outputText.value = '';
    updateStats();
    showToast('Text cleared');
}

// Copy to clipboard
async function copyToClipboard() {
    try {
        await navigator.clipboard.writeText(outputText.value);
        showToast('Copied to clipboard');
    } catch {
        showToast('Could not copy to clipboard');
    }
}

// Download text
function downloadText() {
    const text = outputText.value;
    if (!text) {
        showToast('No text to download');
        return;
    }

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'cubsoftware - text.txt';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded');
}

// Lorem Ipsum Generator
const loremWords = [
    'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
    'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
    'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
    'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
    'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
    'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint',
    'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia',
    'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum', 'perspiciatis', 'unde',
    'omnis', 'iste', 'natus', 'error', 'voluptatem', 'accusantium', 'doloremque',
    'laudantium', 'totam', 'rem', 'aperiam', 'eaque', 'ipsa', 'quae', 'ab', 'illo',
    'inventore', 'veritatis', 'quasi', 'architecto', 'beatae', 'vitae', 'dicta',
    'explicabo', 'nemo', 'ipsam', 'quia', 'voluptas', 'aspernatur', 'aut', 'odit',
    'fugit', 'consequuntur', 'magni', 'dolores', 'eos', 'ratione', 'sequi', 'nesciunt'
];

function generateLoremIpsum() {
    const count = parseInt(loremCount.value) || 3;
    const type = loremType.value;
    let result = '';

    switch (type) {
        case 'words':
            result = generateLoremWords(count);
            break;
        case 'sentences':
            result = generateLoremSentences(count);
            break;
        case 'paragraphs':
            result = generateLoremParagraphs(count);
            break;
    }

    inputText.value = result;
    outputText.value = result;
    updateStats();
    showToast('Lorem ipsum generated');
}

function generateLoremWords(count) {
    const words = [];
    for (let i = 0; i < count; i++) {
        words.push(loremWords[Math.floor(Math.random() * loremWords.length)]);
    }
    return words.join(' ');
}

function generateLoremSentences(count) {
    const sentences = [];
    for (let i = 0; i < count; i++) {
        const wordCount = Math.floor(Math.random() * 10) + 8;
        let sentence = generateLoremWords(wordCount);
        sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
        sentences.push(sentence);
    }
    return sentences.join(' ');
}

function generateLoremParagraphs(count) {
    const paragraphs = [];
    for (let i = 0; i < count; i++) {
        const sentenceCount = Math.floor(Math.random() * 4) + 4;
        paragraphs.push(generateLoremSentences(sentenceCount));
    }
    return paragraphs.join('\n\n');
}

// Find & Replace
function findAndReplace() {
    const find = findText.value;
    const replace = replaceText.value;
    const text = inputText.value;

    if (!find) {
        showToast('Enter text to find');
        return;
    }

    let result;
    try {
        if (useRegex.checked) {
            const flags = caseSensitive.checked ? 'g' : 'gi';
            const regex = new RegExp(find, flags);
            result = text.replace(regex, replace);
        } else {
            if (caseSensitive.checked) {
                result = text.split(find).join(replace);
            } else {
                const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                result = text.replace(regex, replace);
            }
        }

        outputText.value = result;
        showToast('Replacement complete');
    } catch (e) {
        showToast('Invalid regex pattern');
    }
}

// Show toast notification
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
