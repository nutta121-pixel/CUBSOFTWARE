let activeDownloads = new Set();
let pollingIntervals = new Map();

function startDownload() {
    const urlInput = document.getElementById('urlInput');
    const downloadBtn = document.getElementById('downloadBtn');
    const btnText = document.getElementById('btnText');
    const btnLoader = document.getElementById('btnLoader');
    const errorMessage = document.getElementById('errorMessage');

    const url = urlInput.value.trim();

    if (!url) {
        showError('Please enter a URL');
        return;
    }

    // Disable button and show loader
    downloadBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'block';
    errorMessage.classList.remove('show');

    // Send download request
    fetch('/apps/social-media-saver/api/download', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: url })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showError(data.error);
            resetButton();
            return;
        }

        // Clear input
        urlInput.value = '';
        resetButton();

        // Add download to active downloads
        activeDownloads.add(data.download_id);
        createDownloadCard(data.download_id, url, data.platform);

        // Start polling for status
        startPolling(data.download_id);
    })
    .catch(error => {
        showError('Failed to start download: ' + error.message);
        resetButton();
    });
}

function createDownloadCard(downloadId, url, platform) {
    const container = document.getElementById('activeDownloads');

    const card = document.createElement('div');
    card.className = 'download-card';
    card.id = `download-${downloadId}`;

    card.innerHTML = `
        <div class="download-header">
            <div class="download-title-section">
                <div class="download-title">
                    <span class="platform-badge">${platform}</span>
                    <span id="title-${downloadId}">Preparing download...</span>
                </div>
                <div class="download-url-small">${url}</div>
            </div>
            <div class="download-actions">
                <span class="status-badge status-queued" id="status-${downloadId}">QUEUED</span>
            </div>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" id="progress-${downloadId}" style="width: 0%"></div>
        </div>
        <div class="logs-section" id="logs-${downloadId}">
            <div class="log-line">Starting download...</div>
        </div>
    `;

    container.prepend(card);
}

function startPolling(downloadId) {
    const interval = setInterval(() => {
        fetch(`/apps/social-media-saver/api/status/${downloadId}`)
            .then(response => {
                if (!response.ok) {
                    if (response.status === 404) {
                        console.log(`Task ${downloadId} not found on server`);
                        clearInterval(interval);
                        pollingIntervals.delete(downloadId);
                    }
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                updateDownloadCard(downloadId, data);

                if (data.status === 'completed' || data.status === 'failed') {
                    clearInterval(interval);
                    pollingIntervals.delete(downloadId);

                    if (data.status === 'completed') {
                        triggerDownload(downloadId);
                    }
                }
            })
            .catch(error => {
                console.error('Polling error:', error);
            });
    }, 1000);

    pollingIntervals.set(downloadId, interval);
}

function updateDownloadCard(downloadId, data) {
    const statusBadge = document.getElementById(`status-${downloadId}`);
    const progressBar = document.getElementById(`progress-${downloadId}`);
    const logsSection = document.getElementById(`logs-${downloadId}`);

    // Update status badge
    if (statusBadge) {
        statusBadge.textContent = data.status.toUpperCase();
        statusBadge.className = `status-badge status-${data.status}`;
    }

    // Update progress
    if (progressBar) {
        progressBar.style.width = `${data.progress}%`;
    }

    // Update logs
    if (logsSection && data.logs) {
        logsSection.innerHTML = data.logs.map(log =>
            `<div class="log-line">${log}</div>`
        ).join('');
        logsSection.scrollTop = logsSection.scrollHeight;
    }

    // Handle errors
    if (data.error && data.status === 'failed') {
        if (logsSection) {
            logsSection.innerHTML += `<div class="log-line" style="color: #ff5252;">Error: ${data.error}</div>`;
        }
    }
}

function triggerDownload(downloadId) {
    const downloadUrl = `/apps/social-media-saver/api/download-file/${downloadId}`;

    // Create hidden iframe to trigger download
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);

    // Remove iframe after download
    setTimeout(() => {
        document.body.removeChild(iframe);
    }, 5000);
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
}

function resetButton() {
    const downloadBtn = document.getElementById('downloadBtn');
    const btnText = document.getElementById('btnText');
    const btnLoader = document.getElementById('btnLoader');

    downloadBtn.disabled = false;
    btnText.style.display = 'block';
    btnLoader.style.display = 'none';
}

// Allow Enter key to trigger download
document.addEventListener('DOMContentLoaded', function() {
    const urlInput = document.getElementById('urlInput');
    urlInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            startDownload();
        }
    });
});
