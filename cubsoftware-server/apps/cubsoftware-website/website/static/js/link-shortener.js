// Link Shortener JavaScript

// Elements
const longUrlInput = document.getElementById('longUrl');
const shortenBtn = document.getElementById('shortenBtn');
const btnText = document.getElementById('btnText');
const btnLoader = document.getElementById('btnLoader');
const resultSection = document.getElementById('resultSection');
const shortUrlInput = document.getElementById('shortUrl');
const copyBtn = document.getElementById('copyBtn');
const newLinkBtn = document.getElementById('newLinkBtn');
const visitLink = document.getElementById('visitLink');
const errorMessage = document.getElementById('errorMessage');
const recentList = document.getElementById('recentList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const vanityToggle = document.getElementById('vanityToggle');
const vanityWrapper = document.getElementById('vanityWrapper');
const vanityCode = document.getElementById('vanityCode');
const vanityStatus = document.getElementById('vanityStatus');

let vanityCheckTimeout = null;

// Initialize
function init() {
    loadRecentLinks();
    setupEventListeners();
}

// Setup event listeners
function setupEventListeners() {
    shortenBtn.addEventListener('click', shortenUrl);
    longUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') shortenUrl();
    });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(shortUrlInput.value);
        showToast('Copied to clipboard!');
    });

    newLinkBtn.addEventListener('click', resetForm);

    clearHistoryBtn.addEventListener('click', () => {
        localStorage.removeItem('recentLinks');
        loadRecentLinks();
        showToast('History cleared');
    });

    // Vanity URL toggle
    vanityToggle.addEventListener('click', () => {
        const isVisible = vanityWrapper.style.display !== 'none';
        vanityWrapper.style.display = isVisible ? 'none' : 'flex';
        vanityToggle.classList.toggle('active', !isVisible);
        if (!isVisible) vanityCode.focus();
    });

    // Check vanity availability as user types
    vanityCode.addEventListener('input', () => {
        const code = vanityCode.value.trim();

        // Clean input - only allow alphanumeric and hyphens
        vanityCode.value = code.replace(/[^a-zA-Z0-9\-_]/g, '');

        if (vanityCheckTimeout) clearTimeout(vanityCheckTimeout);

        if (!code || code.length < 3) {
            vanityStatus.textContent = code.length > 0 ? 'Min 3 characters' : '';
            vanityStatus.className = 'vanity-status';
            return;
        }

        vanityStatus.textContent = 'Checking...';
        vanityStatus.className = 'vanity-status checking';

        vanityCheckTimeout = setTimeout(() => checkVanityAvailability(code), 400);
    });

    vanityCode.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') shortenUrl();
    });
}

// Check if vanity code is available
async function checkVanityAvailability(code) {
    try {
        const response = await fetch(`/api/check-vanity/${encodeURIComponent(code)}`);
        const data = await response.json();

        if (data.available) {
            vanityStatus.textContent = 'Available';
            vanityStatus.className = 'vanity-status available';
        } else {
            vanityStatus.textContent = 'Taken';
            vanityStatus.className = 'vanity-status taken';
        }
    } catch {
        vanityStatus.textContent = '';
        vanityStatus.className = 'vanity-status';
    }
}

// Shorten URL
async function shortenUrl() {
    const url = longUrlInput.value.trim();
    const customCode = vanityCode.value.trim();

    // Validate URL
    if (!url) {
        showError('Please enter a URL');
        return;
    }

    if (!isValidUrl(url)) {
        showError('Please enter a valid URL (including http:// or https://)');
        return;
    }

    // Validate vanity code if provided
    if (customCode) {
        if (customCode.length < 3 || customCode.length > 20) {
            showError('Custom URL must be 3-20 characters');
            return;
        }
        if (!/^[a-zA-Z0-9\-_]+$/.test(customCode)) {
            showError('Custom URL can only contain letters, numbers, hyphens, and underscores');
            return;
        }
    }

    // Show loading
    setLoading(true);
    hideError();

    try {
        const body = { url };
        if (customCode) body.customCode = customCode;

        const response = await fetch('/api/shorten', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to shorten URL');
        }

        // Show result - use the short domain
        const shortUrl = 'https://cubsw.link/' + data.shortCode;
        shortUrlInput.value = shortUrl;
        visitLink.href = shortUrl;
        resultSection.style.display = 'block';

        // Save to recent
        saveToRecent(url, data.shortCode);

    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(false);
    }
}

// Validate URL
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

// Set loading state
function setLoading(loading) {
    shortenBtn.disabled = loading;
    btnText.style.display = loading ? 'none' : 'inline';
    btnLoader.style.display = loading ? 'inline-block' : 'none';
}

// Show error
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

// Hide error
function hideError() {
    errorMessage.style.display = 'none';
}

// Reset form
function resetForm() {
    longUrlInput.value = '';
    vanityCode.value = '';
    vanityStatus.textContent = '';
    vanityStatus.className = 'vanity-status';
    resultSection.style.display = 'none';
    hideError();
    longUrlInput.focus();
}

// Save to recent
function saveToRecent(longUrl, code) {
    const recent = JSON.parse(localStorage.getItem('recentLinks') || '[]');

    // Remove if already exists
    const filtered = recent.filter(item => item.code !== code);

    // Add to beginning
    filtered.unshift({
        longUrl,
        code,
        createdAt: Date.now()
    });

    // Keep only last 20
    const trimmed = filtered.slice(0, 20);

    localStorage.setItem('recentLinks', JSON.stringify(trimmed));
    loadRecentLinks();
}

// Load recent links
function loadRecentLinks() {
    const recent = JSON.parse(localStorage.getItem('recentLinks') || '[]');

    if (recent.length === 0) {
        recentList.innerHTML = '<div class="empty-state">No links shortened yet</div>';
        return;
    }

    recentList.innerHTML = recent.map(item => {
        const shortUrl = 'https://cubsw.link/' + item.code;
        return `
            <div class="recent-item" data-code="${item.code}">
                <div class="recent-item-info">
                    <div class="recent-item-short">${shortUrl}</div>
                    <div class="recent-item-long">${escapeHtml(item.longUrl)}</div>
                </div>
                <div class="recent-item-actions">
                    <button onclick="copyLink('${shortUrl}')">Copy</button>
                    <button onclick="window.open('${shortUrl}', '_blank')">Visit</button>
                    <button onclick="deleteLink('${item.code}')" class="delete-btn">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

// Delete a specific link
window.deleteLink = async function(code) {
    if (!confirm('Are you sure you want to delete this link?')) {
        return;
    }

    try {
        const response = await fetch(`/api/links/${code}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete link');
        }

        // Remove from localStorage
        const recent = JSON.parse(localStorage.getItem('recentLinks') || '[]');
        const filtered = recent.filter(item => item.code !== code);
        localStorage.setItem('recentLinks', JSON.stringify(filtered));

        // Reload the list
        loadRecentLinks();
        showToast('Link deleted!');

    } catch (error) {
        showToast(error.message);
    }
};

// Copy link
window.copyLink = function(url) {
    navigator.clipboard.writeText(url);
    showToast('Copied!');
};

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
