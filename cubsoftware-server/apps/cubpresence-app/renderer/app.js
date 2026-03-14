// CubPresence Renderer

let isConnected = false;
let settings = {};
let profiles = {};
let history = [];
let previewTimer = null;
let connectionTimer = null;
let rotationActive = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const version = await window.cubpresence.getVersion();
    document.getElementById('appVersion').textContent = 'v' + version;

    settings = await window.cubpresence.getSettings();
    profiles = await window.cubpresence.getProfiles();
    history  = await window.cubpresence.getHistory();

    applyTheme();
    applyAccentColor(settings.accentColor);
    applyFontSize(settings.fontSize);
    applyCompactMode(settings.compactMode);
    applySettingsToUI();
    updateProfilesList();
    updateHistoryList();
    restoreCollapsedSections();

    const savedPresence = await window.cubpresence.getSavedPresence();
    if (savedPresence) {
        if (savedPresence.clientId) document.getElementById('clientId').value = savedPresence.clientId;
        if (savedPresence.activity) populateFields(savedPresence.activity);
    }

    const status = await window.cubpresence.getStatus();
    if (status.connected) {
        setConnectedUI();
        if (status.connectionTime) startConnectionTimer(status.connectionTime);
        if (status.activity) populateFields(status.activity);
    }

    window.cubpresence.onStatus((data) => updateStatus(data.state, data.message, data.connectionTime));
    window.cubpresence.onUpdateStatus((data) => handleUpdateStatus(data));
    window.cubpresence.onQuickConnect((data) => {
        if (isConnected) return;
        const field = document.getElementById('clientId');
        const savedId = data.savedClientId || settings.savedClientId;
        if (field && !field.value.trim() && savedId) field.value = savedId;
        if (field && field.value.trim()) connect();
    });
    window.cubpresence.onRotationAdvance((data) => {
        if (data.activity) populateFields(data.activity);
        if (data.clientId) document.getElementById('clientId').value = data.clientId;
        const info = document.getElementById('rotationInfo');
        if (info) info.textContent = `Profile ${data.index + 1} of ${data.total}`;
    });
    window.cubpresence.onHistoryUpdated((h) => { history = h; updateHistoryList(); });

    setupEventListeners();
    setupCharCounters();
    updatePreview();
});

// ─── Theme & appearance ───────────────────────────────────────────────────────

function applyTheme() {
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
}

function applyAccentColor(hex) {
    if (!hex) return;
    document.documentElement.style.setProperty('--accent', hex);
    document.documentElement.style.setProperty('--accent-hover', darkenHex(hex, 25));
    document.documentElement.style.setProperty('--accent-shadow', hexToRgba(hex, 0.25));
}

function applyFontSize(size) {
    document.documentElement.setAttribute('data-font-size', size || 'normal');
}

function applyCompactMode(compact) {
    document.body.classList.toggle('compact', !!compact);
}

function darkenHex(hex, amount) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (n >> 16) - amount);
    const g = Math.max(0, ((n >> 8) & 0xff) - amount);
    const b = Math.max(0, (n & 0xff) - amount);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hexToRgba(hex, alpha) {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ─── Settings UI ──────────────────────────────────────────────────────────────

function applySettingsToUI() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

    set('settingRunOnStartup', settings.runOnStartup);
    set('settingStartMinimized', settings.startMinimized);
    set('settingAutoConnect', settings.autoConnect);
    set('settingMinimizeToTray', settings.minimizeToTray);
    set('settingShowNotifications', settings.showNotifications);
    set('settingSavePresence', settings.savePresenceOnClose);
    set('settingCheckUpdates', settings.checkUpdatesOnStartup);
    set('settingAutoDownload', settings.autoDownloadUpdates);
    set('settingAutoReconnect', settings.autoReconnect);
    set('settingAlwaysOnTop', settings.alwaysOnTop);
    set('settingTrayOnly', settings.trayOnlyMode);
    set('settingCompact', settings.compactMode);

    setVal('settingTheme', settings.theme || 'dark');
    setVal('settingFontSize', settings.fontSize || 'normal');
    setVal('settingAccentColor', settings.accentColor || '#5865f2');
    setVal('settingOpacity', settings.opacity ?? 100);
    setVal('settingHotkeyConnect', settings.globalHotkeyConnect || '');
    setVal('settingHotkeyDisconnect', settings.globalHotkeyDisconnect || '');
    setVal('settingPreviewAppName', settings.previewAppName || '');

    const opacityLabel = document.getElementById('opacityLabel');
    if (opacityLabel) opacityLabel.textContent = (settings.opacity ?? 100) + '%';

    // Update preview app name
    updatePreviewAppName();
}

async function saveSettings() {
    await window.cubpresence.saveSettings(settings);
}

// ─── Update banner ────────────────────────────────────────────────────────────

function handleUpdateStatus(data) {
    const banner = document.getElementById('updateBanner');
    const text   = document.getElementById('updateText');
    const btn    = document.getElementById('updateAction');
    banner.className = 'update-banner';
    btn.style.display = 'none';
    switch (data.status) {
        case 'checking':
            banner.style.display = 'flex';
            text.textContent = 'Checking for updates...';
            break;
        case 'available':
            banner.style.display = 'flex';
            text.textContent = `Update available: v${data.version}`;
            break;
        case 'downloading':
            banner.style.display = 'flex';
            banner.classList.add('downloading');
            text.textContent = data.percent ? `Downloading... ${data.percent}%` : 'Downloading update...';
            break;
        case 'ready':
            banner.style.display = 'flex';
            banner.classList.add('ready');
            text.textContent = 'Update ready — restart to apply';
            btn.textContent = 'Restart Now';
            btn.style.display = '';
            btn.onclick = () => window.cubpresence.installUpdate();
            break;
        case 'up-to-date':
            banner.style.display = 'none';
            break;
        case 'error':
            banner.style.display = 'flex';
            banner.classList.add('error');
            text.textContent = data.message ? `Update error: ${data.message}` : 'Update check failed';
            setTimeout(() => { banner.style.display = 'none'; }, 5000);
            break;
    }
}

// ─── Connection ───────────────────────────────────────────────────────────────

async function connect() {
    const clientId = document.getElementById('clientId').value.trim();
    if (!clientId) { showStatusError('Please enter a Discord Application ID'); return; }
    if (!/^\d+$/.test(clientId)) { showStatusError('Application ID must be a number'); return; }
    const activity = buildActivityWithPlaceholders();
    await window.cubpresence.connect(clientId, activity);
}

async function disconnect() {
    if (rotationActive) {
        await window.cubpresence.stopRotation();
        stopRotationUI();
    }
    await window.cubpresence.disconnect();
    setDisconnectedUI();
    stopConnectionTimer();
}

async function updateActivity() {
    const activity = buildActivityWithPlaceholders();
    const ok = await window.cubpresence.updateActivity(activity);
    if (ok) showStatusInfo('Presence updated!');
}

async function loadAndConnect() {
    const select = document.getElementById('profileSelect');
    const name = select.value;
    if (!name || !profiles[name]) {
        await window.cubpresence.showMessageBox({ type: 'warning', title: 'No Profile', message: 'Please select a profile to load.', buttons: ['OK'] });
        return;
    }
    const data = profiles[name];
    if (data.clientId) document.getElementById('clientId').value = data.clientId;
    if (data.activity) populateFields(data.activity);
    await connect();
}

// ─── Status ───────────────────────────────────────────────────────────────────

function updateStatus(state, message, connTime) {
    const dot  = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    dot.className = 'status-dot ' + (state || '');

    if (state === 'connected') {
        setConnectedUI();
        if (connTime) startConnectionTimer(connTime);
    } else if (state === 'disconnected' || state === 'error') {
        setDisconnectedUI();
        stopConnectionTimer();
        text.textContent = message || '';
    } else {
        text.textContent = message || '';
    }
}

function showStatusError(msg) {
    const dot  = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    dot.className = 'status-dot error';
    text.textContent = msg;
}

function showStatusInfo(msg) {
    const text = document.getElementById('statusText');
    text.textContent = msg;
}

function setConnectedUI() {
    isConnected = true;
    document.getElementById('connectBtn').style.display = 'none';
    document.getElementById('disconnectBtn').style.display = '';
    document.getElementById('updateBtn').style.display = '';
}

function setDisconnectedUI() {
    isConnected = false;
    document.getElementById('connectBtn').style.display = '';
    document.getElementById('disconnectBtn').style.display = 'none';
    document.getElementById('updateBtn').style.display = 'none';
}

// ─── Connection duration timer ────────────────────────────────────────────────

function startConnectionTimer(connTime) {
    stopConnectionTimer();
    const text = document.getElementById('statusText');
    const update = () => {
        const ms = Date.now() - connTime;
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const dur = h > 0
            ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
            : `${m}m ${String(s).padStart(2, '0')}s`;
        text.textContent = `Connected · ${dur}`;
    };
    update();
    connectionTimer = setInterval(update, 1000);
}

function stopConnectionTimer() {
    if (connectionTimer) { clearInterval(connectionTimer); connectionTimer = null; }
}

// ─── Char counters ────────────────────────────────────────────────────────────

function setupCharCounters() {
    [
        { id: 'details', max: 128 },
        { id: 'state', max: 128 },
        { id: 'largeImageText', max: 128 },
        { id: 'smallImageText', max: 128 },
        { id: 'btn1Label', max: 32 },
        { id: 'btn2Label', max: 32 }
    ].forEach(({ id, max }) => {
        const input   = document.getElementById(id);
        const counter = document.getElementById(id + 'Counter');
        if (!input || !counter) return;
        const update = () => {
            const len = input.value.length;
            counter.textContent = `${len}/${max}`;
            counter.className = 'char-counter' + (len >= max ? ' at-limit' : len > max * 0.8 ? ' near-limit' : '');
        };
        input.addEventListener('input', update);
        update();
    });
}

// ─── Dynamic placeholders ─────────────────────────────────────────────────────

const PLACEHOLDERS = {
    '{time}':    () => new Date().toLocaleTimeString(),
    '{date}':    () => new Date().toLocaleDateString(),
    '{day}':     () => new Date().toLocaleDateString('en', { weekday: 'long' }),
    '{month}':   () => new Date().toLocaleDateString('en', { month: 'long' }),
    '{year}':        () => new Date().getFullYear().toString(),
    '{day_num}':     () => { const d = new Date().getDate(); const s = ['th','st','nd','rd']; const v = d % 100; return d + (s[(v-20)%10] || s[v] || s[0]); },
    '{day_short}':   () => new Date().toLocaleDateString('en', { weekday: 'short' }),
    '{month_short}': () => new Date().toLocaleDateString('en', { month: 'short' }),
    '{month_num}':   () => (new Date().getMonth() + 1).toString(),
    '{timezone}':    () => new Date().toLocaleTimeString('en', { timeZoneName: 'short' }).split(' ').pop(),
    '{ampm}':        () => new Date().getHours() >= 12 ? 'PM' : 'AM',
    '{hour}':        () => (new Date().getHours() % 12 || 12).toString(),
    '{hour24}':      () => new Date().getHours().toString(),
    '{weeknum}': () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
        const week1 = new Date(d.getFullYear(), 0, 4);
        return String(1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7));
    }
};

function resolvePlaceholders(text) {
    if (!text) return text;
    let out = text;
    for (const [k, fn] of Object.entries(PLACEHOLDERS)) {
        out = out.split(k).join(fn());
    }
    return out;
}

function buildActivityWithPlaceholders() {
    const a = buildActivity();
    a.details = resolvePlaceholders(a.details);
    a.state   = resolvePlaceholders(a.state);
    return a;
}

// ─── Activity builder ─────────────────────────────────────────────────────────

function buildActivity() {
    const tsType       = document.querySelector('input[name="timestampType"]:checked')?.value || 'none';
    const activityType = parseInt(document.getElementById('activityType').value, 10) || 0;

    let startTimestamp = null, endTimestamp = null, countdownEnd = null;
    if (tsType === 'custom') {
        const s = document.getElementById('startDateTime').value;
        const e = document.getElementById('endDateTime').value;
        if (s) startTimestamp = Math.floor(new Date(s).getTime() / 1000);
        if (e) endTimestamp   = Math.floor(new Date(e).getTime() / 1000);
    } else if (tsType === 'countdown') {
        const presetVal = document.getElementById('countdownPresetVal')?.value;
        if (presetVal) countdownEnd = Date.now() + parseInt(presetVal, 10) * 60000;
    }

    return {
        type:             activityType,
        stream_url:       document.getElementById('streamUrl').value,
        details:          document.getElementById('details').value,
        state:            document.getElementById('state').value,
        timestamps_type:  tsType,
        start_timestamp:  startTimestamp,
        end_timestamp:    endTimestamp,
        countdown_end:    countdownEnd,
        large_image_key:  document.getElementById('largeImageKey').value,
        large_image_text: document.getElementById('largeImageText').value,
        small_image_key:  document.getElementById('smallImageKey').value,
        small_image_text: document.getElementById('smallImageText').value,
        button1_label:    document.getElementById('btn1Label').value,
        button1_url:      document.getElementById('btn1Url').value,
        button2_label:    document.getElementById('btn2Label').value,
        button2_url:      document.getElementById('btn2Url').value,
        party_size:       parseInt(document.getElementById('partySize').value, 10) || 0,
        party_max:        parseInt(document.getElementById('partyMax').value, 10) || 0
    };
}

function populateFields(activity) {
    if (!activity) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
    set('details', activity.details);
    set('state', activity.state);
    set('largeImageKey', activity.large_image_key);
    set('largeImageText', activity.large_image_text);
    set('smallImageKey', activity.small_image_key);
    set('smallImageText', activity.small_image_text);
    set('btn1Label', activity.button1_label);
    set('btn1Url', activity.button1_url);
    set('btn2Label', activity.button2_label);
    set('btn2Url', activity.button2_url);
    set('partySize', activity.party_size || '');
    set('partyMax', activity.party_max || '');

    if (activity.type !== undefined) {
        document.getElementById('activityType').value = activity.type.toString();
        const streamField = document.getElementById('streamUrlField');
        if (streamField) streamField.style.display = activity.type === 1 ? 'block' : 'none';
    }
    if (activity.stream_url) set('streamUrl', activity.stream_url);

    if (activity.timestamps_type) {
        const radio = document.querySelector(`input[name="timestampType"][value="${activity.timestamps_type}"]`);
        if (radio) {
            radio.checked = true;
            document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('active'));
            radio.closest('.radio-option')?.classList.add('active');
            document.getElementById('customTimestamps').style.display =
                activity.timestamps_type === 'custom' ? 'block' : 'none';
        }
    }
    if (activity.start_timestamp) set('startDateTime', formatDateTimeLocal(new Date(activity.start_timestamp * 1000)));
    if (activity.end_timestamp)   set('endDateTime',   formatDateTimeLocal(new Date(activity.end_timestamp   * 1000)));

    // Refresh char counters
    ['details', 'state', 'largeImageText', 'smallImageText', 'btn1Label', 'btn2Label'].forEach(id => {
        document.getElementById(id)?.dispatchEvent(new Event('input'));
    });
    updatePreview();
}

// ─── Presets ──────────────────────────────────────────────────────────────────

function applyPreset(preset) {
    const presets = {
        gaming:   { details: 'In Game', state: 'Playing', type: '0', ts: 'since_update' },
        streaming:{ details: 'Live Now', state: 'Streaming', type: '1', ts: 'since_connection' },
        coding:   { details: 'Writing Code', state: 'In IDE', type: '0', ts: 'since_app_start' },
        music:    { details: 'Listening to Music', state: 'Vibing', type: '2', ts: 'none' },
        chilling: { details: 'Taking a Break', state: 'AFK', type: '0', ts: 'none' },
        studying: { details: 'Studying', state: 'Focused', type: '0', ts: 'since_app_start' },
        working:  { details: 'Working', state: 'Getting things done', type: '0', ts: 'since_app_start' },
        clear:    { details: '', state: '', type: '0', ts: 'none', clearAll: true }
    };
    const p = presets[preset];
    if (!p) return;
    document.getElementById('details').value = p.details || '';
    document.getElementById('state').value   = p.state   || '';
    document.getElementById('activityType').value = p.type || '0';
    const streamField = document.getElementById('streamUrlField');
    if (streamField) streamField.style.display = p.type === '1' ? 'block' : 'none';
    const radio = document.querySelector(`input[name="timestampType"][value="${p.ts}"]`);
    if (radio) {
        radio.checked = true;
        document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('active'));
        radio.closest('.radio-option')?.classList.add('active');
        document.getElementById('customTimestamps').style.display = p.ts === 'custom' ? 'block' : 'none';
    }
    if (p.clearAll) {
        ['largeImageKey','largeImageText','smallImageKey','smallImageText',
         'btn1Label','btn1Url','btn2Label','btn2Url','partySize','partyMax',
         'startDateTime','endDateTime','streamUrl'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }
    ['details', 'state', 'largeImageText', 'smallImageText', 'btn1Label', 'btn2Label'].forEach(id =>
        document.getElementById(id)?.dispatchEvent(new Event('input'))
    );
    updatePreview();
}

// ─── Countdown presets ────────────────────────────────────────────────────────

function applyCountdownPreset(minutes) {
    const radio = document.querySelector('input[name="timestampType"][value="countdown"]');
    if (radio) {
        radio.checked = true;
        document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('active'));
        radio.closest('.radio-option')?.classList.add('active');
        document.getElementById('customTimestamps').style.display = 'none';
    }
    const presetVal = document.getElementById('countdownPresetVal');
    if (presetVal) presetVal.value = minutes;
    updatePreview();
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

function updateProfilesList() {
    const select = document.getElementById('profileSelect');
    const search = document.getElementById('profileSearch')?.value?.toLowerCase() || '';
    const current = select.value;
    select.innerHTML = '<option value="">— Select Profile —</option>';
    Object.keys(profiles).sort().forEach(name => {
        if (search && !name.toLowerCase().includes(search)) return;
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    if (current && profiles[current]) select.value = current;

    // Update rotation checkboxes
    updateRotationProfileList();
}

async function saveCurrentProfile() {
    const nameInput = document.getElementById('profileName');
    const name = nameInput.value.trim();
    if (!name) {
        await window.cubpresence.showMessageBox({ type: 'warning', title: 'Profile Name', message: 'Please enter a profile name.', buttons: ['OK'] });
        return;
    }
    const data = { clientId: document.getElementById('clientId').value, activity: buildActivity() };
    profiles = await window.cubpresence.saveProfile(name, data);
    updateProfilesList();
    document.getElementById('profileSelect').value = name;
    nameInput.value = '';
}

function loadSelectedProfile() {
    const name = document.getElementById('profileSelect').value;
    if (!name || !profiles[name]) return;
    const data = profiles[name];
    if (data.clientId) document.getElementById('clientId').value = data.clientId;
    if (data.activity) populateFields(data.activity);
    document.getElementById('profileName').value = name;
    updatePreview();
}

async function deleteSelectedProfile() {
    const name = document.getElementById('profileSelect').value;
    if (!name) return;
    const result = await window.cubpresence.showMessageBox({
        type: 'question', title: 'Delete Profile',
        message: `Delete profile "${name}"?`, buttons: ['Delete', 'Cancel'], defaultId: 1
    });
    if (result.response === 0) {
        profiles = await window.cubpresence.deleteProfile(name);
        updateProfilesList();
    }
}

async function renameSelectedProfile() {
    const name = document.getElementById('profileSelect').value;
    if (!name) return;
    const newName = prompt(`Rename "${name}" to:`);
    if (!newName || !newName.trim() || newName.trim() === name) return;
    if (profiles[newName.trim()]) {
        await window.cubpresence.showMessageBox({ type: 'warning', title: 'Name Taken', message: `A profile named "${newName.trim()}" already exists.`, buttons: ['OK'] });
        return;
    }
    profiles = await window.cubpresence.renameProfile(name, newName.trim());
    updateProfilesList();
    document.getElementById('profileSelect').value = newName.trim();
}

async function duplicateSelectedProfile() {
    const name = document.getElementById('profileSelect').value;
    if (!name) return;
    let newName = name + ' (copy)';
    let counter = 2;
    while (profiles[newName]) newName = `${name} (copy ${counter++})`;
    profiles = await window.cubpresence.duplicateProfile(name, newName);
    updateProfilesList();
    document.getElementById('profileSelect').value = newName;
}

async function exportProfiles() {
    const result = await window.cubpresence.exportProfiles();
    if (result.success) {
        await window.cubpresence.showMessageBox({ type: 'info', title: 'Export Complete', message: 'Profiles exported successfully.', buttons: ['OK'] });
    } else if (result.error) {
        await window.cubpresence.showMessageBox({ type: 'error', title: 'Export Failed', message: result.error, buttons: ['OK'] });
    }
}

async function importProfiles() {
    const result = await window.cubpresence.importProfiles();
    if (result.success) {
        profiles = result.profiles;
        updateProfilesList();
        await window.cubpresence.showMessageBox({ type: 'info', title: 'Import Complete', message: 'Profiles imported successfully.', buttons: ['OK'] });
    } else if (result.error) {
        await window.cubpresence.showMessageBox({ type: 'error', title: 'Import Failed', message: result.error, buttons: ['OK'] });
    }
}

// ─── History ──────────────────────────────────────────────────────────────────

function updateHistoryList() {
    const container = document.getElementById('historyList');
    if (!container) return;
    if (!history || history.length === 0) {
        container.innerHTML = '<p class="hint no-history">No recent presences yet</p>';
        return;
    }
    container.innerHTML = history.map((entry, i) => {
        const label = entry.activity?.details || entry.activity?.state || 'Unnamed';
        return `
        <div class="history-item">
            <div class="history-info">
                <span class="history-label">${escapeHtml(label)}</span>
                <span class="history-time">${timeAgo(entry.timestamp)}</span>
            </div>
            <button class="btn-icon history-load" data-index="${i}" title="Load this presence">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
        </div>`;
    }).join('');
    container.querySelectorAll('.history-load').forEach(btn => {
        btn.addEventListener('click', () => {
            const entry = history[parseInt(btn.dataset.index, 10)];
            if (!entry) return;
            if (entry.clientId) document.getElementById('clientId').value = entry.clientId;
            if (entry.activity) populateFields(entry.activity);
        });
    });
}

async function clearHistory() {
    const result = await window.cubpresence.showMessageBox({
        type: 'question', title: 'Clear History',
        message: 'Clear all recent presence history?', buttons: ['Clear', 'Cancel'], defaultId: 1
    });
    if (result.response === 0) {
        history = await window.cubpresence.clearHistory();
        updateHistoryList();
    }
}

function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000)    return 'just now';
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

// ─── Rotation ─────────────────────────────────────────────────────────────────

function updateRotationProfileList() {
    const container = document.getElementById('rotationProfileList');
    if (!container) return;
    container.innerHTML = Object.keys(profiles).sort().map(name => `
        <label class="rotation-check">
            <input type="checkbox" class="rotation-profile-cb" value="${escapeHtml(name)}">
            <span>${escapeHtml(name)}</span>
        </label>
    `).join('') || '<p class="hint">No saved profiles yet</p>';
}

async function toggleRotation() {
    const btn = document.getElementById('rotationBtn');
    if (rotationActive) {
        await window.cubpresence.stopRotation();
        stopRotationUI();
    } else {
        const selected = [...document.querySelectorAll('.rotation-profile-cb:checked')].map(c => c.value);
        const interval = Math.max(5, parseInt(document.getElementById('rotationInterval')?.value, 10) || 60);
        if (selected.length < 2) {
            await window.cubpresence.showMessageBox({ type: 'warning', title: 'Rotation', message: 'Select at least 2 profiles to rotate between.', buttons: ['OK'] });
            return;
        }
        const ok = await window.cubpresence.startRotation({ profiles: selected, interval });
        if (ok) {
            rotationActive = true;
            btn.textContent = 'Stop Rotation';
            btn.classList.add('btn-danger-state');
            document.getElementById('rotationInfo').textContent = 'Rotation active';
        } else {
            await window.cubpresence.showMessageBox({ type: 'warning', title: 'Rotation', message: 'You must be connected to Discord before starting rotation.', buttons: ['OK'] });
        }
    }
}

function stopRotationUI() {
    rotationActive = false;
    const btn = document.getElementById('rotationBtn');
    if (btn) { btn.textContent = 'Start Rotation'; btn.classList.remove('btn-danger-state'); }
    const info = document.getElementById('rotationInfo');
    if (info) info.textContent = '';
}

// ─── Section collapse ─────────────────────────────────────────────────────────

function restoreCollapsedSections() {
    (settings.collapsedSections || []).forEach(id => {
        document.getElementById(id)?.classList.add('collapsed');
    });
}

function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.classList.toggle('collapsed');
    const list = settings.collapsedSections || [];
    if (section.classList.contains('collapsed')) {
        if (!list.includes(sectionId)) list.push(sectionId);
    } else {
        const idx = list.indexOf(sectionId);
        if (idx > -1) list.splice(idx, 1);
    }
    settings.collapsedSections = list;
    saveSettings();
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function updatePreviewAppName() {
    const name = settings.previewAppName || 'Your App Name';
    const el = document.getElementById('previewName');
    if (el) el.textContent = name;
}

function updatePreview() {
    const details   = document.getElementById('details').value;
    const state     = document.getElementById('state').value;
    const largeKey  = document.getElementById('largeImageKey').value;
    const smallKey  = document.getElementById('smallImageKey').value;
    const btn1Label = document.getElementById('btn1Label').value;
    const btn2Label = document.getElementById('btn2Label').value;
    const tsType    = document.querySelector('input[name="timestampType"]:checked')?.value || 'none';
    const partySize = parseInt(document.getElementById('partySize').value, 10) || 0;
    const partyMax  = parseInt(document.getElementById('partyMax').value, 10) || 0;
    const actType   = document.getElementById('activityType').value;

    const actLabels = { '0':'Playing','1':'Streaming','2':'Listening to','3':'Watching','5':'Competing in' };
    const previewType = document.getElementById('previewActivityType');
    if (previewType) previewType.textContent = actLabels[actType] || 'Playing';

    // Details with placeholder preview
    const previewDetails = document.getElementById('previewDetails');
    const resolvedDetails = resolvePlaceholders(details);
    previewDetails.textContent = resolvedDetails || '';
    previewDetails.style.display = resolvedDetails ? '' : 'none';

    // State
    const previewState = document.getElementById('previewState');
    let stateText = resolvePlaceholders(state) || '';
    if (partySize > 0 && partyMax > 0) stateText += (stateText ? ' ' : '') + `(${partySize} of ${partyMax})`;
    previewState.textContent = stateText;
    previewState.style.display = stateText ? '' : 'none';

    // Timestamp
    if (previewTimer) { clearInterval(previewTimer); previewTimer = null; }
    const previewTs   = document.getElementById('previewTimestamp');
    const previewTime = document.getElementById('previewTimeText');
    if (tsType === 'none') {
        previewTs.style.display = 'none';
    } else if (tsType === 'local_time') {
        previewTs.style.display = '';
        const tick = () => { if (previewTime) previewTime.textContent = formatLocalTime() + ' elapsed'; };
        tick(); previewTimer = setInterval(tick, 1000);
    } else {
        previewTs.style.display = '';
        const labels = { since_update:'~1m 23s elapsed', since_connection:'~5m 30s elapsed', since_app_start:'~15m elapsed', countdown:'~45m left', custom:'custom time' };
        if (previewTime) previewTime.textContent = labels[tsType] || '';
    }

    // Large image
    const previewLarge = document.getElementById('previewLarge');
    if (largeKey && (largeKey.startsWith('http://') || largeKey.startsWith('https://'))) {
        previewLarge.innerHTML = `<img src="${escapeHtml(largeKey)}" alt="" onerror="this.style.display='none'">`;
    } else if (largeKey) {
        previewLarge.innerHTML = `<span style="font-size:0.6rem;color:#72767d">${escapeHtml(largeKey.substring(0,8))}</span>`;
    } else {
        previewLarge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    }

    // Small image
    const previewSmall = document.getElementById('previewSmall');
    if (smallKey) {
        previewSmall.style.display = '';
        if (smallKey.startsWith('http://') || smallKey.startsWith('https://')) {
            previewSmall.innerHTML = `<img src="${escapeHtml(smallKey)}" alt="">`;
        } else {
            previewSmall.innerHTML = '';
            previewSmall.style.background = '#4f545c';
        }
    } else {
        previewSmall.style.display = 'none';
    }

    // Buttons
    const previewBtns = document.getElementById('previewButtons');
    let btnsHtml = '';
    if (btn1Label) btnsHtml += `<div class="preview-btn">${escapeHtml(btn1Label)}</div>`;
    if (btn2Label) btnsHtml += `<div class="preview-btn">${escapeHtml(btn2Label)}</div>`;
    previewBtns.innerHTML = btnsHtml || '<div class="preview-btn-placeholder">Buttons will appear here</div>';
    previewBtns.style.display = '';
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDateTimeLocal(date) {
    const p = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

function formatLocalTime() {
    const n = new Date();
    return [n.getHours(), n.getMinutes(), n.getSeconds()].map(v => String(v).padStart(2,'0')).join(':');
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ─── Event listeners ──────────────────────────────────────────────────────────

function setupEventListeners() {
    // Footer buttons
    document.getElementById('connectBtn').addEventListener('click', connect);
    document.getElementById('disconnectBtn').addEventListener('click', disconnect);
    document.getElementById('updateBtn').addEventListener('click', updateActivity);

    // Presets
    document.querySelectorAll('.preset-btn').forEach(btn =>
        btn.addEventListener('click', () => applyPreset(btn.dataset.preset))
    );

    // Activity type
    document.getElementById('activityType').addEventListener('change', () => {
        const streamField = document.getElementById('streamUrlField');
        if (streamField) streamField.style.display = document.getElementById('activityType').value === '1' ? 'block' : 'none';
        updatePreview();
    });

    // Timestamp radios
    document.querySelectorAll('input[name="timestampType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('active'));
            e.target.closest('.radio-option')?.classList.add('active');
            document.getElementById('customTimestamps').style.display = e.target.value === 'custom' ? 'block' : 'none';
            updatePreview();
        });
    });

    // Countdown presets
    document.querySelectorAll('.countdown-preset').forEach(btn => {
        btn.addEventListener('click', () => applyCountdownPreset(parseInt(btn.dataset.minutes, 10)));
    });

    // Live preview on all input changes
    document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="color"]), select, textarea').forEach(el => {
        el.addEventListener('input', updatePreview);
    });

    // Profile controls
    document.getElementById('saveProfileBtn').addEventListener('click', saveCurrentProfile);
    document.getElementById('loadProfileBtn').addEventListener('click', loadSelectedProfile);
    document.getElementById('deleteProfileBtn').addEventListener('click', deleteSelectedProfile);
    document.getElementById('renameProfileBtn').addEventListener('click', renameSelectedProfile);
    document.getElementById('duplicateProfileBtn').addEventListener('click', duplicateSelectedProfile);
    document.getElementById('loadConnectBtn').addEventListener('click', loadAndConnect);
    document.getElementById('exportProfilesBtn').addEventListener('click', exportProfiles);
    document.getElementById('importProfilesBtn').addEventListener('click', importProfiles);

    // Profile search
    document.getElementById('profileSearch').addEventListener('input', () => updateProfilesList());

    // History
    document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);

    // Rotation
    document.getElementById('rotationBtn').addEventListener('click', toggleRotation);

    // Section collapse toggles
    document.querySelectorAll('.section-toggle').forEach(btn => {
        btn.addEventListener('click', () => toggleSection(btn.dataset.section));
    });

    // Modals
    document.getElementById('settingsBtn').addEventListener('click', () => document.getElementById('settingsModal').classList.add('active'));
    document.getElementById('closeSettings').addEventListener('click', () => document.getElementById('settingsModal').classList.remove('active'));
    document.getElementById('guideBtn').addEventListener('click', () => document.getElementById('guideModal').classList.add('active'));
    document.getElementById('closeGuide').addEventListener('click', () => document.getElementById('guideModal').classList.remove('active'));
    document.getElementById('changelogBtn').addEventListener('click', () => document.getElementById('changelogModal').classList.add('active'));
    document.getElementById('closeChangelog').addEventListener('click', () => document.getElementById('changelogModal').classList.remove('active'));
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); }));

    // Settings — toggles
    const toggleSetting = (id, key) => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            settings[key] = e.target.checked;
            saveSettings();
        });
    };
    toggleSetting('settingRunOnStartup', 'runOnStartup');
    toggleSetting('settingStartMinimized', 'startMinimized');
    toggleSetting('settingAutoConnect', 'autoConnect');
    toggleSetting('settingMinimizeToTray', 'minimizeToTray');
    toggleSetting('settingShowNotifications', 'showNotifications');
    toggleSetting('settingSavePresence', 'savePresenceOnClose');
    toggleSetting('settingCheckUpdates', 'checkUpdatesOnStartup');
    toggleSetting('settingAutoDownload', 'autoDownloadUpdates');
    toggleSetting('settingAutoReconnect', 'autoReconnect');
    toggleSetting('settingAlwaysOnTop', 'alwaysOnTop');
    toggleSetting('settingTrayOnly', 'trayOnlyMode');
    toggleSetting('settingCompact', 'compactMode');

    document.getElementById('settingCompact')?.addEventListener('change', (e) => applyCompactMode(e.target.checked));

    // Settings — dropdowns/inputs
    document.getElementById('settingTheme')?.addEventListener('change', (e) => {
        settings.theme = e.target.value;
        document.documentElement.setAttribute('data-theme', e.target.value);
        saveSettings();
    });
    document.getElementById('settingFontSize')?.addEventListener('change', (e) => {
        settings.fontSize = e.target.value;
        applyFontSize(e.target.value);
        saveSettings();
    });
    document.getElementById('settingAccentColor')?.addEventListener('input', (e) => {
        settings.accentColor = e.target.value;
        applyAccentColor(e.target.value);
        saveSettings();
    });
    document.getElementById('settingOpacity')?.addEventListener('input', (e) => {
        settings.opacity = parseInt(e.target.value, 10);
        const label = document.getElementById('opacityLabel');
        if (label) label.textContent = e.target.value + '%';
        window.cubpresence.setOpacity(settings.opacity);
        saveSettings();
    });
    document.getElementById('settingHotkeyConnect')?.addEventListener('change', (e) => {
        settings.globalHotkeyConnect = e.target.value;
        saveSettings();
    });
    document.getElementById('settingHotkeyDisconnect')?.addEventListener('change', (e) => {
        settings.globalHotkeyDisconnect = e.target.value;
        saveSettings();
    });
    document.getElementById('settingPreviewAppName')?.addEventListener('input', (e) => {
        settings.previewAppName = e.target.value;
        updatePreviewAppName();
        saveSettings();
    });

    // Settings — buttons
    document.getElementById('checkUpdatesBtn').addEventListener('click', () => window.cubpresence.checkForUpdates());
    document.getElementById('clearDataBtn').addEventListener('click', clearAllData);

    // External links
    document.getElementById('devPortalLink')?.addEventListener('click', e => { e.preventDefault(); window.cubpresence.openExternal('https://discord.com/developers/applications'); });
    document.getElementById('wikiLink')?.addEventListener('click', e => { e.preventDefault(); window.cubpresence.openExternal('https://cubsoftware.site/cubpresence-wiki'); });
    document.querySelectorAll('.guide-link').forEach(link => {
        link.addEventListener('click', e => { e.preventDefault(); if (e.target.dataset.url) window.cubpresence.openExternal(e.target.dataset.url); });
    });
}

async function clearAllData() {
    const result = await window.cubpresence.showMessageBox({
        type: 'warning', title: 'Clear All Data',
        message: 'This will reset all settings and clear your saved presence.',
        detail: 'Saved profiles will NOT be deleted. Are you sure?',
        buttons: ['Clear Data', 'Cancel'], defaultId: 1
    });
    if (result.response !== 0) return;
    settings = {
        runOnStartup: false, startMinimized: false, autoConnect: false,
        checkUpdatesOnStartup: true, autoDownloadUpdates: false, minimizeToTray: true, showNotifications: true,
        savePresenceOnClose: true, savedClientId: '', theme: 'dark',
        autoReconnect: true, alwaysOnTop: false, trayOnlyMode: false,
        compactMode: false, fontSize: 'normal', accentColor: '#5865f2',
        opacity: 100, collapsedSections: [], previewAppName: '',
        globalHotkeyConnect: 'Ctrl+Shift+C', globalHotkeyDisconnect: 'Ctrl+Shift+D'
    };
    await window.cubpresence.saveSettings(settings);
    applySettingsToUI();
    applyTheme();
    applyAccentColor(settings.accentColor);
    applyFontSize(settings.fontSize);
    applyCompactMode(false);
    ['clientId','details','state','streamUrl','largeImageKey','largeImageText','smallImageKey',
     'smallImageText','btn1Label','btn1Url','btn2Label','btn2Url','partySize','partyMax'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('activityType').value = '0';
    const streamField = document.getElementById('streamUrlField');
    if (streamField) streamField.style.display = 'none';
    const noneRadio = document.querySelector('input[name="timestampType"][value="none"]');
    if (noneRadio) {
        noneRadio.checked = true;
        document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('active'));
        noneRadio.closest('.radio-option')?.classList.add('active');
    }
    document.getElementById('customTimestamps').style.display = 'none';
    const presetVal = document.getElementById('countdownPresetVal');
    if (presetVal) presetVal.value = '60';
    ['details', 'state', 'largeImageText', 'smallImageText', 'btn1Label', 'btn2Label'].forEach(id =>
        document.getElementById(id)?.dispatchEvent(new Event('input'))
    );
    updatePreview();
    await window.cubpresence.showMessageBox({ type: 'info', title: 'Done', message: 'Data cleared.', buttons: ['OK'] });
}
