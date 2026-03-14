// CubPresence - Dashboard Logic

document.addEventListener('DOMContentLoaded', function() {
    if (CONFIG_ID && CONFIG) {
        initConfigEditor();
        initExtension();
    }
});

// ==================== SETUP (CREATE) ====================

async function createConfig() {
    const appId = document.getElementById('appIdInput').value.trim();
    if (!appId) {
        showStatus('Please enter your Discord Application ID.', 'error');
        return;
    }
    if (!/^\d+$/.test(appId)) {
        showStatus('Application ID should be a number (e.g. 1234567890123456789).', 'error');
        return;
    }

    const btn = document.getElementById('createBtn');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
        const resp = await fetch('/api/cubpresence/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: appId })
        });
        const data = await resp.json();
        if (data.success) {
            window.location.href = '/apps/cubpresence?config=' + data.config_id;
        } else {
            showStatus(data.error || 'Failed to create config.', 'error');
            btn.disabled = false;
            btn.textContent = 'Create Presence';
        }
    } catch (e) {
        showStatus('Network error. Please try again.', 'error');
        btn.disabled = false;
        btn.textContent = 'Create Presence';
    }
}

// ==================== CONFIG EDITOR ====================

function initConfigEditor() {
    // Set share URL
    const shareUrl = window.location.origin + '/apps/cubpresence?config=' + CONFIG_ID;
    const shareInput = document.getElementById('shareUrl');
    if (shareInput) shareInput.value = shareUrl;

    // Timestamp radio handlers
    document.querySelectorAll('input[name="timestampType"]').forEach(radio => {
        radio.addEventListener('change', function() {
            document.querySelectorAll('.timestamp-option').forEach(opt => opt.classList.remove('active'));
            this.closest('.timestamp-option').classList.add('active');
            updateTimestampFields();
            updatePreview();
        });
    });
    updateTimestampFields();

    // Live preview on any input change
    document.querySelectorAll('#configEditor input, #configEditor select').forEach(el => {
        el.addEventListener('input', updatePreview);
        el.addEventListener('change', updatePreview);
    });

    // Initial preview
    updatePreview();
}

function updateTimestampFields() {
    const type = document.querySelector('input[name="timestampType"]:checked').value;
    const customFields = document.getElementById('timestampCustomFields');
    if (customFields) {
        customFields.classList.toggle('visible', type === 'custom');
    }
}

// ==================== SAVE ====================

async function saveConfig() {
    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const presence = {
        details: document.getElementById('detailsField').value,
        state: document.getElementById('stateField').value,
        timestamps_type: document.querySelector('input[name="timestampType"]:checked').value,
        start_timestamp: parseInt(document.getElementById('startTimestamp').value) || null,
        end_timestamp: parseInt(document.getElementById('endTimestamp').value) || null,
        large_image_key: document.getElementById('largeImageKey').value,
        large_image_text: document.getElementById('largeImageText').value,
        small_image_key: document.getElementById('smallImageKey').value,
        small_image_text: document.getElementById('smallImageText').value,
        button1_label: document.getElementById('btn1Label').value,
        button1_url: document.getElementById('btn1Url').value,
        button2_label: document.getElementById('btn2Label').value,
        button2_url: document.getElementById('btn2Url').value,
        party_size: parseInt(document.getElementById('partySize').value) || 0,
        party_max: parseInt(document.getElementById('partyMax').value) || 0
    };

    const clientId = document.getElementById('clientIdField').value.trim();

    try {
        const resp = await fetch('/api/cubpresence/config/' + CONFIG_ID, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, presence: presence })
        });
        const data = await resp.json();
        if (data.success) {
            showStatus('Configuration saved!', 'success');
        } else {
            showStatus(data.error || 'Failed to save.', 'error');
        }
    } catch (e) {
        showStatus('Network error. Please try again.', 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Save Changes';
}

// ==================== DELETE ====================

async function deleteConfig() {
    if (!confirm('Are you sure you want to delete this presence configuration? This cannot be undone.')) return;

    try {
        await fetch('/api/cubpresence/config/' + CONFIG_ID, { method: 'DELETE' });
        window.location.href = '/apps/cubpresence';
    } catch (e) {
        showStatus('Failed to delete. Please try again.', 'error');
    }
}

// ==================== APP DOWNLOAD PROMPT ====================

// Initialize - show app download prompt
function initExtension() {
    const statusDot = document.getElementById('extStatusDot');
    const statusText = document.getElementById('extStatusText');
    const installPrompt = document.getElementById('extensionInstall');

    // Web version can't connect directly - app required
    statusDot.classList.add('not-installed');
    statusText.textContent = 'Desktop app required for Discord connection';
    installPrompt.style.display = 'block';
}

// Show download prompt when trying to connect
function connectViaExtension() {
    showStatus('Please download the CubPresence desktop app to connect to Discord.', 'error');
    document.getElementById('extensionInstall').style.display = 'block';

    // Scroll to the install prompt
    document.getElementById('extensionInstall').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Not used in web version
function disconnectViaExtension() {
    showStatus('Use the desktop app to manage your Discord connection.', 'info');
}

// Legacy connect function
function connectPresence() {
    connectViaExtension();
}

// ==================== LIVE PREVIEW ====================

function updatePreview() {
    const details = document.getElementById('detailsField').value;
    const state = document.getElementById('stateField').value;
    const largeKey = document.getElementById('largeImageKey').value;
    const largeText = document.getElementById('largeImageText').value;
    const smallKey = document.getElementById('smallImageKey').value;
    const btn1Label = document.getElementById('btn1Label').value;
    const btn2Label = document.getElementById('btn2Label').value;
    const tsType = document.querySelector('input[name="timestampType"]:checked').value;
    const partySize = parseInt(document.getElementById('partySize').value) || 0;
    const partyMax = parseInt(document.getElementById('partyMax').value) || 0;

    // App name — we can't fetch it, just show placeholder
    // Details
    const previewDetails = document.getElementById('previewDetails');
    previewDetails.textContent = details || '';
    previewDetails.style.display = details ? '' : 'none';

    // State (with optional party)
    const previewState = document.getElementById('previewState');
    let stateText = state || '';
    if (partySize > 0 && partyMax > 0) {
        stateText += (stateText ? ' ' : '') + '(' + partySize + ' of ' + partyMax + ')';
    }
    previewState.textContent = stateText;
    previewState.style.display = stateText ? '' : 'none';

    // Timestamp
    const previewTs = document.getElementById('previewTimestamp');
    if (tsType === 'elapsed') {
        previewTs.textContent = '00:01:23 elapsed';
        previewTs.style.display = '';
    } else if (tsType === 'countdown') {
        previewTs.textContent = '01:30:00 left';
        previewTs.style.display = '';
    } else if (tsType === 'custom') {
        previewTs.textContent = 'custom timestamp';
        previewTs.style.display = '';
    } else {
        previewTs.textContent = '';
        previewTs.style.display = 'none';
    }

    // Large image
    const previewLarge = document.getElementById('previewLargeImg');
    if (largeKey) {
        if (largeKey.startsWith('http://') || largeKey.startsWith('https://')) {
            previewLarge.innerHTML = '<img src="' + escapeHtml(largeKey) + '" alt="large">';
        } else {
            previewLarge.innerHTML = '<span style="font-size:0.65rem;color:#b9bbbe;text-align:center;padding:0.25rem;">' + escapeHtml(largeKey) + '</span>';
        }
        if (largeText) previewLarge.title = largeText;
    } else {
        previewLarge.innerHTML = '<span class="placeholder-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><polyline points="21 15 16 10 5 21" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>';
        previewLarge.title = '';
    }

    // Small image
    const previewSmall = document.getElementById('previewSmallImg');
    if (smallKey) {
        previewSmall.style.display = '';
        if (smallKey.startsWith('http://') || smallKey.startsWith('https://')) {
            previewSmall.innerHTML = '<img src="' + escapeHtml(smallKey) + '" alt="small">';
        } else {
            previewSmall.innerHTML = '<span style="font-size:0.5rem;color:#b9bbbe;">' + escapeHtml(smallKey.substring(0, 3)) + '</span>';
        }
    } else {
        previewSmall.style.display = 'none';
    }

    // Buttons
    const previewBtns = document.getElementById('previewButtons');
    let btnsHtml = '';
    if (btn1Label) btnsHtml += '<div class="preview-btn">' + escapeHtml(btn1Label) + '</div>';
    if (btn2Label) btnsHtml += '<div class="preview-btn">' + escapeHtml(btn2Label) + '</div>';
    previewBtns.innerHTML = btnsHtml;
    previewBtns.style.display = btnsHtml ? '' : 'none';
}

// ==================== UTILITIES ====================

function showStatus(message, type) {
    const el = document.getElementById('statusMessage');
    el.textContent = message;
    el.className = 'status-message visible ' + type;
    setTimeout(() => { el.classList.remove('visible'); }, 5000);
}

function copyShareUrl() {
    const input = document.getElementById('shareUrl');
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
        showStatus('Link copied to clipboard!', 'success');
    }).catch(() => {
        document.execCommand('copy');
        showStatus('Link copied!', 'success');
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
