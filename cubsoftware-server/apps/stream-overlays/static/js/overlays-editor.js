// Stream Overlays — Editor JS

// ─── Sidebar tab switching ───
document.querySelectorAll('.ov-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        document.querySelectorAll('.ov-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ov-tab-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const pane = document.getElementById('tab-' + target);
        if (pane) pane.classList.add('active');
        sessionStorage.setItem('ov-editor-tab', target);
    });
});
// Restore last-used tab
const _savedTab = sessionStorage.getItem('ov-editor-tab');
if (_savedTab) {
    const _tabBtn = document.querySelector(`.ov-tab[data-tab="${_savedTab}"]`);
    if (_tabBtn) _tabBtn.click();
}

// ─── Sidebar search ───
const sidebarSearch = document.getElementById('sidebarSearch');
if (sidebarSearch) {
    sidebarSearch.addEventListener('input', () => {
        const q = sidebarSearch.value.trim().toLowerCase();
        const allSections = document.querySelectorAll('#sidebar .ov-ctrl-section');
        const allPanes = document.querySelectorAll('#sidebar .ov-tab-pane');
        const tabBar = document.querySelector('.ov-tab-bar');
        if (!q) {
            // Restore normal tab view
            allSections.forEach(s => s.classList.remove('ov-search-hidden'));
            allPanes.forEach(p => { p.style.display = ''; });
            tabBar.style.display = '';
            // Re-apply active tab
            const activePane = document.querySelector('.ov-tab-pane.active');
            if (activePane) activePane.style.display = 'block';
            return;
        }
        // Show all panes during search
        tabBar.style.display = 'none';
        allPanes.forEach(p => { p.style.display = 'block'; });
        // Hide sections with no label match
        allSections.forEach(section => {
            const text = section.textContent.toLowerCase();
            section.classList.toggle('ov-search-hidden', !text.includes(q));
        });
    });
}

let saveDebounce = null;
let isSaving = false;
const CONFIG_SNAPSHOT = {};

const saveStatus = document.getElementById('saveStatus');
const saveBtn = document.getElementById('saveBtn');
const previewFrame = document.getElementById('previewFrame');

// ─── Instant preview via postMessage (bypasses save → SSE cycle) ───
let _previewTimer = null;
function pushPreviewUpdate() {
    clearTimeout(_previewTimer);
    _previewTimer = setTimeout(() => {
        if (!previewFrame || !previewFrame.contentWindow) return;
        const cfg = { template: getTemplate(), ...buildPayload() };
        previewFrame.contentWindow.postMessage({ type: 'preview-update', config: cfg }, '*');
    }, 80);
}

function showToast(msg, duration = 2500) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
}

function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.color = '#00cc66';
        setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast('Copied!');
    });
}

function setSaveStatus(state) {
    if (!saveStatus) return;
    saveStatus.className = 'ov-save-status';
    if (state === 'saving') { saveStatus.classList.add('saving'); saveStatus.textContent = 'Saving...'; }
    else if (state === 'saved') { saveStatus.classList.add('saved'); saveStatus.textContent = '✓ Saved'; }
    else if (state === 'error') { saveStatus.textContent = 'Save failed'; saveStatus.style.color = '#ff6666'; }
    else saveStatus.textContent = '';
}

function buildPayload() {
    const cfg = {};

    // All data-key inputs
    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.dataset.key;
        if (el.type === 'checkbox') cfg[key] = el.checked;
        else if (el.type === 'number') cfg[key] = parseFloat(el.value) || 0;
        else cfg[key] = el.value;
    });

    // Social links
    cfg.social = {};
    document.querySelectorAll('[data-social]').forEach(el => {
        cfg.social[el.dataset.social] = el.value.trim();
    });

    // Co-players (live scene)
    const coPlayersListEl = document.getElementById('coPlayersList');
    if (coPlayersListEl !== null) cfg.co_players = buildCoPlayersList();

    // Games list (live scene)
    const sceneGamesListEl = document.getElementById('sceneGamesList');
    if (sceneGamesListEl !== null) cfg.games_list = buildSceneGamesList();

    // Viewer queue
    const viewerQueueListEl = document.getElementById('viewerQueueList');
    if (viewerQueueListEl !== null) cfg.viewer_queue = buildViewerQueueList();

    // Schedule rows
    const schedRows = {};
    document.querySelectorAll('[data-sched-key]').forEach(el => {
        const idx = parseInt(el.dataset.schedKey);
        const field = el.dataset.schedField;
        if (!schedRows[idx]) schedRows[idx] = {};
        if (el.type === 'checkbox') schedRows[idx][field] = el.checked;
        else schedRows[idx][field] = el.value;
    });
    if (Object.keys(schedRows).length > 0) {
        const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
        cfg.schedule = days.map((day, i) => ({ day, ...schedRows[i] }));
    }

    return cfg;
}

function getTemplate() {
    const active = document.querySelector('.ov-tmpl-btn.active');
    return active ? active.dataset.template : 'minimal';
}

function getSceneName() {
    const el = document.getElementById('sceneName');
    return el ? el.value.trim() : '';
}

function saveScene(immediate = false) {
    pushPreviewUpdate();
    if (isSaving) return;
    if (!immediate) {
        clearTimeout(saveDebounce);
        saveDebounce = setTimeout(() => saveScene(true), 800);
        return;
    }

    isSaving = true;
    if (saveBtn) saveBtn.disabled = true;
    setSaveStatus('saving');

    const payload = {
        name: getSceneName(),
        template: getTemplate(),
        config: buildPayload()
    };

    fetch('/overlays/api/scenes/' + SCENE_ID, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(data => {
        isSaving = false;
        if (saveBtn) saveBtn.disabled = false;
        if (data.ok) {
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus(''), 3000);
        } else {
            setSaveStatus('error');
            showToast('Save failed: ' + (data.error || 'unknown error'));
        }
    })
    .catch(() => {
        isSaving = false;
        if (saveBtn) saveBtn.disabled = false;
        setSaveStatus('error');
        showToast('Network error — changes not saved');
    });
}

// Bind all inputs to auto-save
function bindAutoSave() {
    document.querySelectorAll('[data-key], [data-social], [data-sched-key]').forEach(el => {
        el.addEventListener('input', () => saveScene());
        el.addEventListener('change', () => saveScene());
    });
    // Textarea
    document.querySelectorAll('.ov-textarea').forEach(el => {
        el.addEventListener('input', () => saveScene());
    });
}

// Template buttons
document.querySelectorAll('.ov-tmpl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.ov-tmpl-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        saveScene();
    });
});

// Scene name
const sceneNameEl = document.getElementById('sceneName');
if (sceneNameEl) {
    sceneNameEl.addEventListener('input', () => saveScene());
}

// Save button (explicit, immediate)
if (saveBtn) {
    saveBtn.addEventListener('click', () => saveScene(true));
}

// Color picker sync — swatch → text field
document.querySelectorAll('.ov-color-swatch').forEach(swatch => {
    const targetId = swatch.id.replace('_picker', '');
    const textField = document.getElementById(targetId);
    if (textField) {
        swatch.addEventListener('input', () => {
            textField.value = swatch.value;
            saveScene();
        });
        textField.addEventListener('input', () => {
            if (/^#[0-9a-fA-F]{6}$/.test(textField.value)) {
                swatch.value = textField.value;
                saveScene();
            }
        });
    }
});

// Gradient angle display
const angleSlider = document.getElementById('cfg_bg_gradient_angle');
const angleVal = document.getElementById('angleVal');
if (angleSlider && angleVal) {
    angleSlider.addEventListener('input', () => {
        angleVal.textContent = angleSlider.value + '°';
    });
}

// Background type toggle — show/hide gradient fields
function updateBgTypeVisibility() {
    const bgType = document.getElementById('cfg_background_type');
    if (!bgType) return;
    const isSolid = bgType.value === 'solid';
    const isGradient = bgType.value === 'gradient' || bgType.value === 'animated-gradient';
    const solidRow = document.getElementById('solidColorRow');
    const gradFrom = document.getElementById('gradientFromRow');
    const gradTo = document.getElementById('gradientToRow');
    const gradAngle = document.getElementById('gradientAngleRow');
    if (solidRow) solidRow.style.display = (isSolid || bgType.value === 'transparent') ? '' : 'none';
    if (gradFrom) gradFrom.style.display = isGradient ? '' : 'none';
    if (gradTo) gradTo.style.display = isGradient ? '' : 'none';
    if (gradAngle) gradAngle.style.display = isGradient ? '' : 'none';
}
const bgTypeEl = document.getElementById('cfg_background_type');
if (bgTypeEl) {
    bgTypeEl.addEventListener('change', () => { updateBgTypeVisibility(); saveScene(); });
    updateBgTypeVisibility();
}

// Particles toggle — show/hide particle color
function updateParticlesVisibility() {
    const particlesEl = document.getElementById('cfg_particles');
    const particleColorRow = document.getElementById('particleColorRow');
    if (particlesEl && particleColorRow) {
        particleColorRow.style.display = particlesEl.checked ? '' : 'none';
    }
}
const particlesEl = document.getElementById('cfg_particles');
if (particlesEl) {
    particlesEl.addEventListener('change', updateParticlesVisibility);
    updateParticlesVisibility();
}

// Video overlay toggle — show/hide sub-rows
function updateVideoOverlayVisibility() {
    const cb   = document.getElementById('cfg_video_overlay');
    const rows = document.getElementById('videoOverlayRows');
    if (cb && rows) rows.style.display = cb.checked ? '' : 'none';
}
const videoOverlayCb = document.getElementById('cfg_video_overlay');
if (videoOverlayCb) {
    videoOverlayCb.addEventListener('change', updateVideoOverlayVisibility);
    updateVideoOverlayVisibility();
}

// Video overlay audio volume row visibility
function updateVideoOverlayAudioVisibility() {
    const audioCb  = document.querySelector('[data-key="video_overlay_audio"]');
    const volRow   = document.getElementById('videoOverlayVolumeRow');
    if (audioCb && volRow) volRow.style.display = audioCb.checked ? '' : 'none';
}
const videoOverlayAudioCb = document.querySelector('[data-key="video_overlay_audio"]');
if (videoOverlayAudioCb) {
    videoOverlayAudioCb.addEventListener('change', updateVideoOverlayAudioVisibility);
    updateVideoOverlayAudioVisibility();
}

// Logo preview
const logoUrlEl = document.getElementById('cfg_logo_url');
const logoPreview = document.getElementById('logoPreview');
const logoPreviewImg = document.getElementById('logoPreviewImg');
if (logoUrlEl && logoPreview && logoPreviewImg) {
    logoUrlEl.addEventListener('input', () => {
        if (logoUrlEl.value) {
            logoPreviewImg.src = logoUrlEl.value;
            logoPreview.style.display = 'block';
        } else {
            logoPreview.style.display = 'none';
        }
    });
}

// Refresh preview button
const refreshBtn = document.getElementById('refreshPreview');
if (refreshBtn && previewFrame) {
    refreshBtn.addEventListener('click', () => {
        previewFrame.src = previewFrame.src;
    });
}

// Delete scene
const deleteBtn = document.getElementById('deleteSceneBtn');
if (deleteBtn && IS_OWNER) {
    deleteBtn.addEventListener('click', () => {
        if (!confirm('Delete this scene permanently? Anyone using the OBS browser source URL will see a blank page.')) return;
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
        fetch('/overlays/api/scenes/' + SCENE_ID, { method: 'DELETE' })
            .then(r => r.json())
            .then(data => {
                if (data.ok) window.location.href = '/overlays';
                else { deleteBtn.disabled = false; deleteBtn.textContent = 'Delete This Scene'; showToast('Error: ' + data.error); }
            })
            .catch(() => { deleteBtn.disabled = false; deleteBtn.textContent = 'Delete This Scene'; showToast('Network error'); });
    });
}

// Invite link generation
const generateInviteBtn = document.getElementById('generateInviteBtn');
if (generateInviteBtn) {
    generateInviteBtn.addEventListener('click', () => {
        generateInviteBtn.disabled = true;
        generateInviteBtn.textContent = 'Generating...';
        fetch('/overlays/api/scenes/' + SCENE_ID + '/invite', { method: 'POST' })
            .then(r => r.json())
            .then(data => {
                if (data.ok && data.invite_url) {
                    const section = document.getElementById('inviteLinkSection');
                    section.innerHTML = `
                        <div class="ov-obs-url-box">
                            <code id="inviteUrlCode">${data.invite_url}</code>
                            <button class="ov-copy-btn" onclick="copyText('${data.invite_url}', this)">Copy</button>
                        </div>
                        <button class="ov-btn-danger-sm" id="revokeInviteBtn">Revoke Link</button>
                    `;
                    document.getElementById('revokeInviteBtn').addEventListener('click', revokeInvite);
                    showToast('Invite link generated!');
                } else {
                    generateInviteBtn.disabled = false;
                    generateInviteBtn.textContent = 'Generate Invite Link';
                    showToast('Error generating invite link');
                }
            })
            .catch(() => {
                generateInviteBtn.disabled = false;
                generateInviteBtn.textContent = 'Generate Invite Link';
                showToast('Network error');
            });
    });
}

const revokeInviteBtnEl = document.getElementById('revokeInviteBtn');
if (revokeInviteBtnEl) {
    revokeInviteBtnEl.addEventListener('click', revokeInvite);
}

function revokeInvite() {
    if (!confirm('Revoke this invite link? People who already accepted it keep access.')) return;
    fetch('/overlays/api/scenes/' + SCENE_ID + '/invite', { method: 'DELETE' })
        .then(r => r.json())
        .then(data => {
            if (data.ok) {
                const section = document.getElementById('inviteLinkSection');
                section.innerHTML = '<button class="ov-btn-secondary" id="generateInviteBtn">Generate Invite Link</button>';
                document.getElementById('generateInviteBtn').addEventListener('click', () => location.reload());
                showToast('Invite link revoked');
            }
        })
        .catch(() => showToast('Network error'));
}

function removeCollab(sceneId, collabId, btn) {
    if (!confirm('Remove this collaborator? They will lose edit access immediately.')) return;
    btn.disabled = true;
    fetch('/overlays/api/scenes/' + sceneId + '/collaborators/' + collabId, { method: 'DELETE' })
        .then(r => r.json())
        .then(data => {
            if (data.ok) { btn.closest('.ov-collab-row').remove(); showToast('Collaborator removed'); }
            else { btn.disabled = false; showToast('Error: ' + data.error); }
        })
        .catch(() => { btn.disabled = false; showToast('Network error'); });
}

// Test alert (alerts-scene editor)
const testAlertBtn = document.getElementById('testAlertBtn');
if (testAlertBtn) {
    testAlertBtn.addEventListener('click', () => {
        const type = document.getElementById('testAlertType')?.value || 'follow';
        testAlertBtn.disabled = true;
        fetch('/overlays/alerts/test/' + DISCORD_USER_ID, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type })
        })
        .then(r => r.json())
        .then(data => {
            testAlertBtn.disabled = false;
            showToast(data.ok ? 'Test alert sent!' : 'Error: ' + data.error);
        })
        .catch(() => { testAlertBtn.disabled = false; showToast('Network error'); });
    });
}

// Test alert (global — all scene types)
const testAlertBtnGlobal = document.getElementById('testAlertBtnGlobal');
if (testAlertBtnGlobal) {
    testAlertBtnGlobal.addEventListener('click', () => {
        const type = document.getElementById('testAlertTypeGlobal')?.value || 'follow';
        testAlertBtnGlobal.disabled = true;
        fetch('/overlays/alerts/test/' + DISCORD_USER_ID, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type })
        })
        .then(r => r.json())
        .then(data => {
            testAlertBtnGlobal.disabled = false;
            showToast(data.ok ? 'Test alert sent!' : 'Error: ' + data.error);
        })
        .catch(() => { testAlertBtnGlobal.disabled = false; showToast('Network error'); });
    });
}

// Custom font live loading — loads font from Google Fonts and updates the select preview
function loadCustomFont(name) {
    if (!name || !name.trim()) return;
    const enc = name.trim().replace(/ /g, '+');
    const existing = document.getElementById('_custom_font_editor_lk');
    if (existing) {
        existing.href = `https://fonts.googleapis.com/css2?family=${enc}&display=swap`;
    } else {
        const lk = document.createElement('link');
        lk.id = '_custom_font_editor_lk';
        lk.rel = 'stylesheet';
        lk.href = `https://fonts.googleapis.com/css2?family=${enc}&display=swap`;
        document.head.appendChild(lk);
    }
}

const customFontEl = document.getElementById('cfg_custom_font');
if (customFontEl) {
    // Load on page init if already set
    if (customFontEl.value) loadCustomFont(customFontEl.value);
    // Load when user types
    customFontEl.addEventListener('input', () => {
        loadCustomFont(customFontEl.value);
        saveScene();
    });
}

// ─── Preview scaling — fit 1920×1080 overlay into the preview panel ───
function scalePreview() {
    const panel = document.querySelector('.ov-editor-preview-panel');
    const wrap = document.querySelector('.ov-preview-frame-wrap');
    const frame = document.getElementById('previewFrame');
    if (!panel || !wrap || !frame) return;
    const header = panel.querySelector('.ov-preview-header');
    const headerH = header ? header.offsetHeight + 12 : 52;
    const padding = 32; // 16px × 2
    const availW = panel.clientWidth - padding;
    const availH = panel.clientHeight - padding - headerH;
    if (availW <= 0 || availH <= 0) return;
    const scale = Math.min(availW / 1920, availH / 1080);
    const displayW = Math.round(1920 * scale);
    const displayH = Math.round(1080 * scale);
    frame.style.transform = `scale(${scale})`;
    wrap.style.width = displayW + 'px';
    wrap.style.height = displayH + 'px';
}

const _previewPanel = document.querySelector('.ov-editor-preview-panel');
if (_previewPanel) {
    new ResizeObserver(scalePreview).observe(_previewPanel);
    requestAnimationFrame(scalePreview);
}
window.addEventListener('resize', scalePreview);

// ─── Co-Players & Games list management (live scene) ───

function escAttr(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildCoPlayersList() {
    const players = [];
    document.querySelectorAll('#coPlayersList .ov-list-row').forEach(row => {
        const name = (row.querySelector('[data-player-field="name"]')?.value || '').trim();
        const twitch = (row.querySelector('[data-player-field="twitch"]')?.value || '').trim();
        if (name) players.push({ name, twitch });
    });
    return players;
}

function buildSceneGamesList() {
    const games = [];
    document.querySelectorAll('#sceneGamesList .ov-list-row').forEach(row => {
        const title = (row.querySelector('[data-game-field="title"]')?.value || '').trim();
        if (title) games.push({ title });
    });
    return games;
}

function addPlayerRow(name, twitch) {
    const container = document.getElementById('coPlayersList');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'ov-list-row';
    row.innerHTML = `
        <input type="text" class="ov-input" data-player-field="name" value="${escAttr(name || '')}" placeholder="Name">
        <input type="text" class="ov-input" data-player-field="twitch" value="${escAttr(twitch || '')}" placeholder="Twitch link">
        <button class="ov-btn-danger-sm ov-remove-player" type="button">✕</button>
    `;
    row.querySelector('.ov-remove-player').addEventListener('click', () => { row.remove(); saveScene(); });
    row.querySelectorAll('input').forEach(i => i.addEventListener('input', () => saveScene()));
    container.appendChild(row);
}

function addGameRow(title) {
    const container = document.getElementById('sceneGamesList');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'ov-list-row';
    row.innerHTML = `
        <input type="text" class="ov-input" data-game-field="title" value="${escAttr(title || '')}" placeholder="Game title">
        <button class="ov-btn-danger-sm ov-remove-game" type="button">✕</button>
    `;
    row.querySelector('.ov-remove-game').addEventListener('click', () => { row.remove(); saveScene(); });
    row.querySelector('input').addEventListener('input', () => saveScene());
    container.appendChild(row);
}

// Bind existing player/game rows (rendered server-side)
document.querySelectorAll('#coPlayersList .ov-remove-player').forEach(btn => {
    btn.addEventListener('click', () => { btn.closest('.ov-list-row').remove(); saveScene(); });
});
document.querySelectorAll('#coPlayersList input').forEach(i => i.addEventListener('input', () => saveScene()));
document.querySelectorAll('#sceneGamesList .ov-remove-game').forEach(btn => {
    btn.addEventListener('click', () => { btn.closest('.ov-list-row').remove(); saveScene(); });
});
document.querySelectorAll('#sceneGamesList input').forEach(i => i.addEventListener('input', () => saveScene()));

const addPlayerBtn = document.getElementById('addPlayerBtn');
if (addPlayerBtn) addPlayerBtn.addEventListener('click', () => { addPlayerRow('', ''); });

const addGameBtn = document.getElementById('addGameBtn');
if (addGameBtn) addGameBtn.addEventListener('click', () => { addGameRow(''); });

// ─── Quick Timer (starting-soon countdown) ───
function setTimerFromMinutes(minutes) {
    const target = new Date(Date.now() + minutes * 60000);
    const pad = n => String(n).padStart(2, '0');
    const val = `${target.getFullYear()}-${pad(target.getMonth()+1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}:${pad(target.getSeconds())}`;
    const input = document.getElementById('cfg_countdown_to');
    if (input) { input.value = val; saveScene(); }
    showToast(`Timer set: ${minutes < 60 ? minutes + ' min' : (minutes/60) + ' hr'} from now`);
}

document.querySelectorAll('.quick-timer-btn').forEach(btn => {
    btn.addEventListener('click', () => setTimerFromMinutes(parseInt(btn.dataset.minutes)));
});

const applyCustomTimerBtn = document.getElementById('applyCustomTimerBtn');
if (applyCustomTimerBtn) {
    applyCustomTimerBtn.addEventListener('click', () => {
        const mins = parseInt(document.getElementById('customTimerMins')?.value);
        if (!mins || mins < 1) { showToast('Enter a valid number of minutes'); return; }
        setTimerFromMinutes(mins);
    });
}

// ─── Color grading slider display ───
const colorGradingSlider = document.getElementById('cfg_color_grading');
const colorGradingVal = document.getElementById('colorGradingVal');
if (colorGradingSlider && colorGradingVal) {
    colorGradingSlider.addEventListener('input', () => {
        colorGradingVal.textContent = colorGradingSlider.value + '°';
    });
}

// ─── Music preview player ───
let _previewAudio = null;

function toggleMusicPreview() {
    const btn = document.getElementById('musicPreviewBtn');
    const status = document.getElementById('musicPreviewStatus');
    const urlInput = document.getElementById('cfg_bg_music_url');
    const url = (urlInput ? urlInput.value.trim() : '') || '';

    // Stop if already playing
    if (_previewAudio && !_previewAudio.paused) {
        _previewAudio.pause();
        _previewAudio.currentTime = 0;
        btn.textContent = '▶ Play Sample';
        status.textContent = '';
        return;
    }

    if (!url) {
        status.textContent = 'Pick a preset or enter a URL first';
        status.style.color = '#f59e0b';
        return;
    }

    // YouTube can't be previewed directly
    if (/youtube\.com|youtu\.be/.test(url)) {
        status.textContent = 'YouTube links work in OBS but can\'t be previewed here';
        status.style.color = '#f59e0b';
        return;
    }

    if (!_previewAudio) {
        _previewAudio = document.getElementById('musicPreviewAudio');
    }
    _previewAudio.src = url;
    _previewAudio.volume = 0.5;
    _previewAudio.currentTime = 0;
    btn.textContent = '⏳ Loading...';
    status.textContent = '';

    _previewAudio.play().then(() => {
        btn.textContent = '⏹ Stop';
        status.textContent = 'Playing...';
        status.style.color = '#00cc88';
    }).catch(() => {
        btn.textContent = '▶ Play Sample';
        status.textContent = 'Could not load — check the URL';
        status.style.color = '#ff6666';
    });

    _previewAudio.onended = () => {
        btn.textContent = '▶ Play Sample';
        status.textContent = '';
    };
}

// Stop preview when switching tracks
document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('cfg_bg_music_url');
    if (urlInput) {
        urlInput.addEventListener('input', () => {
            if (_previewAudio && !_previewAudio.paused) {
                _previewAudio.pause();
                const btn = document.getElementById('musicPreviewBtn');
                const status = document.getElementById('musicPreviewStatus');
                if (btn) btn.textContent = '▶ Play Sample';
                if (status) status.textContent = '';
            }
        });
    }
});

// ─── Music preset selector ───
const musicPresetSelect = document.getElementById('musicPresetSelect');
const musicUrlInput = document.getElementById('cfg_bg_music_url');
if (musicPresetSelect && musicUrlInput) {
    // On load, mark the preset as selected if the current URL matches one
    const currentUrl = musicUrlInput.value;
    if (currentUrl) {
        const match = Array.from(musicPresetSelect.options).find(o => o.value === currentUrl);
        if (match) match.selected = true;
    }
    musicPresetSelect.addEventListener('change', () => {
        const url = musicPresetSelect.value;
        if (url) {
            musicUrlInput.value = url;
            musicUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
    musicUrlInput.addEventListener('input', () => {
        const url = musicUrlInput.value.trim();
        const match = Array.from(musicPresetSelect.options).find(o => o.value === url);
        musicPresetSelect.value = match ? url : '';
    });
}

// ─── Background effect speed slider display ───
const bgSpeedSlider = document.getElementById('cfg_bg_effect_speed');
const bgSpeedVal = document.getElementById('bgEffectSpeedVal');
if (bgSpeedSlider && bgSpeedVal) {
    bgSpeedSlider.addEventListener('input', () => {
        bgSpeedVal.textContent = parseFloat(bgSpeedSlider.value).toFixed(1) + 'x';
    });
}

// ─── Generic range slider → adjacent .ov-range-val label ───
document.querySelectorAll('input.ov-range[data-key]').forEach(slider => {
    const span = slider.nextElementSibling;
    if (!span || !span.classList.contains('ov-range-val')) return;
    const unit = span.textContent.replace(/[\d.]+/, '') || 'px';
    slider.addEventListener('input', () => { span.textContent = slider.value + unit; });
});

// ─── Alert type color pickers (data-for attribute pattern) ───
document.querySelectorAll('.ov-color-swatch[data-for]').forEach(swatch => {
    const key = swatch.dataset.for;
    const textField = document.querySelector(`.ov-color-text[data-key="${key}"]`);
    if (textField) {
        swatch.addEventListener('input', () => { textField.value = swatch.value; saveScene(); });
        textField.addEventListener('input', () => {
            if (/^#[0-9a-fA-F]{6}$/.test(textField.value)) { swatch.value = textField.value; saveScene(); }
        });
    }
});

// ─── Viewer Queue ───
function buildViewerQueueList() {
    const names = [];
    document.querySelectorAll('#viewerQueueList [data-queue-name]').forEach(el => {
        const n = el.value.trim();
        if (n) names.push(n);
    });
    return names;
}

function addQueueEntryRow(name) {
    const container = document.getElementById('viewerQueueList');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'ov-list-row';
    row.innerHTML = `
        <input type="text" class="ov-input" data-queue-name value="${escAttr(name || '')}" placeholder="Viewer name">
        <button class="ov-btn-danger-sm ov-remove-queue-entry" type="button">✕</button>
    `;
    row.querySelector('.ov-remove-queue-entry').addEventListener('click', () => { row.remove(); saveScene(); });
    row.querySelector('input').addEventListener('input', () => saveScene());
    container.appendChild(row);
}

// Bind existing server-rendered queue rows
document.querySelectorAll('#viewerQueueList .ov-remove-queue-entry').forEach(btn => {
    btn.addEventListener('click', () => { btn.closest('.ov-list-row').remove(); saveScene(); });
});
document.querySelectorAll('#viewerQueueList [data-queue-name]').forEach(i => i.addEventListener('input', () => saveScene()));

const addQueueEntryBtn = document.getElementById('addQueueEntryBtn');
if (addQueueEntryBtn) addQueueEntryBtn.addEventListener('click', () => addQueueEntryRow(''));

const clearQueueBtn = document.getElementById('clearQueueBtn');
if (clearQueueBtn) clearQueueBtn.addEventListener('click', () => {
    const container = document.getElementById('viewerQueueList');
    if (container) { container.innerHTML = ''; saveScene(); }
});

// ─── Preset Themes ───
// Keys any theme can touch — used for reset
const THEME_KEYS = [
    'background_type','bg_gradient_from','bg_gradient_to','bg_gradient_angle','bg_gradient_mid',
    'bg_color','text_primary','text_secondary','accent_color','font',
    'animation','film_grain','vignette','saturation','brightness','text_glow',
    'bg_pattern','bg_pattern_color','bg_pattern_opacity','bg_pattern_size',
    'scanlines','noise_overlay','noise_opacity',
    'bg_mesh_color_1','bg_mesh_color_2','bg_mesh_color_3','bg_mesh_color_4',
];

// Scene defaults restored on reset (matches DEFAULT_CONFIGS values)
const THEME_DEFAULTS = {
    background_type: 'gradient', bg_gradient_from: '#0a0a1a', bg_gradient_to: '#1a0a2e',
    bg_gradient_angle: 135, bg_gradient_mid: '', bg_color: '#0a0a1a',
    text_primary: '#ffffff', text_secondary: '#a0a0c0', accent_color: '#5865f2',
    font: 'Poppins', animation: 'fade',
    film_grain: false, vignette: 0, saturation: 100, brightness: 100, text_glow: 0,
    bg_pattern: 'none', bg_pattern_color: '#ffffff', bg_pattern_opacity: 10, bg_pattern_size: 30,
    scanlines: false, noise_overlay: false, noise_opacity: 10,
    bg_mesh_color_1: '#7c3aed', bg_mesh_color_2: '#0ea5e9',
    bg_mesh_color_3: '#f59e0b', bg_mesh_color_4: '#10b981',
};

const THEMES = {
    'neon-purple':  { background_type: 'gradient', bg_gradient_from: '#1a0040', bg_gradient_to: '#0d0d1a', bg_color: '#0d0d1a', text_color: '#cc99ff', accent_color: '#7c3aed', font_family: 'Orbitron', animation: 'fade-up' },
    'cyber-red':    { background_type: 'gradient', bg_gradient_from: '#1a0000', bg_gradient_to: '#0a0000', bg_color: '#0a0000', text_color: '#ff6666', accent_color: '#cc2200', font_family: 'Rajdhani', animation: 'glitch-in' },
    'arctic-blue':  { background_type: 'gradient', bg_gradient_from: '#003366', bg_gradient_to: '#001122', bg_color: '#001122', text_color: '#aaddff', accent_color: '#0088cc', font_family: 'Exo 2', animation: 'slide-in' },
    'forest-green': { background_type: 'gradient', bg_gradient_from: '#002200', bg_gradient_to: '#001100', bg_color: '#001100', text_color: '#88ee88', accent_color: '#22aa44', font_family: 'Nunito', animation: 'fade' },
    'solar-gold':   { background_type: 'gradient', bg_gradient_from: '#1a0e00', bg_gradient_to: '#0d0800', bg_color: '#0d0800', text_color: '#ffdd66', accent_color: '#cc8800', font_family: 'Oswald', animation: 'wipe' },
    'midnight':     { background_type: 'gradient', bg_gradient_from: '#0a0a14', bg_gradient_to: '#050508', bg_color: '#050508', text_color: '#8888aa', accent_color: '#444466', font_family: 'DM Mono', animation: 'zoom-blur' },
    'vaporwave':    { background_type: 'animated-gradient', bg_gradient_from: '#330066', bg_gradient_to: '#001a33', bg_color: '#1a0030', text_color: '#ff77cc', accent_color: '#cc44ff', font_family: 'Righteous', animation: 'flip-3d' },
    'broadcast':      { background_type: 'gradient', bg_gradient_from: '#001f3f', bg_gradient_to: '#00050f', bg_color: '#00050f', text_color: '#ffffff', accent_color: '#0055cc', font_family: 'Bebas Neue', animation: 'slide-in' },
    'retro-arcade':   { background_type: 'solid', bg_color: '#000000', text_color: '#ffff00', accent_color: '#ff00ff', font: 'Press Start 2P', bg_pattern: 'grid', bg_pattern_color: '#ffffff', bg_pattern_opacity: 8, scanlines: true },
    'dracula':        { background_type: 'gradient', bg_gradient_from: '#282a36', bg_gradient_to: '#1e1f29', bg_color: '#282a36', text_color: '#f8f8f2', accent_color: '#bd93f9', font: 'Fira Code', animation: 'fade' },
    'oceanic':        { background_type: 'mesh-gradient', bg_mesh_color_1: '#006994', bg_mesh_color_2: '#0099cc', bg_mesh_color_3: '#004466', bg_mesh_color_4: '#002233', text_color: '#c0e8ff', accent_color: '#00ccff', font: 'Rajdhani' },
    'cherry-blossom': { background_type: 'gradient', bg_gradient_from: '#2d0a1e', bg_gradient_to: '#1a0610', bg_color: '#1a0610', text_color: '#ffaabb', accent_color: '#ff6699', font: 'Pacifico', bg_gradient_mid: '#3d1228' },
    'toxic-green':    { background_type: 'gradient', bg_gradient_from: '#001a00', bg_gradient_to: '#000d00', bg_color: '#000d00', text_color: '#00ff88', accent_color: '#39ff14', font: 'Share Tech Mono', film_grain: true },
    'blood-moon':     { background_type: 'gradient', bg_gradient_from: '#1a0000', bg_gradient_to: '#0d0000', bg_color: '#0d0000', text_color: '#ff4444', accent_color: '#cc0000', font: 'Cinzel', vignette: 60, text_glow: 50 },
    'ice-crystal':    { background_type: 'radial-gradient', bg_gradient_from: '#e8f4ff', bg_gradient_to: '#a8d8f0', bg_color: '#d0eeff', text_color: '#003366', accent_color: '#4499cc', font: 'Cormorant Garamond', noise_overlay: true, noise_opacity: 10 },
    'golden-hour':    { background_type: 'gradient', bg_gradient_from: '#1a0d00', bg_gradient_to: '#2d1600', bg_color: '#1a0d00', text_color: '#ffd280', accent_color: '#ffaa00', font: 'Playfair Display', bg_gradient_mid: '#3d2000', brightness: 110 },
    'space-dark':     { background_type: 'solid', bg_color: '#000008', text_color: '#ffffff', accent_color: '#8888ff', font: 'Orbitron', bg_pattern: 'dots', bg_pattern_color: '#ffffff', bg_pattern_opacity: 20, bg_pattern_size: 30 },
    'candy-pop':      { background_type: 'animated-gradient', bg_gradient_from: '#ff66bb', bg_gradient_to: '#66bbff', bg_color: '#ff66bb', text_color: '#ffffff', accent_color: '#ffdd00', font: 'Fredoka One', saturation: 150, text_glow: 30 },
};

function applyTheme(themeId) {
    const t = THEMES[themeId];
    if (!t) return;
    Object.entries(t).forEach(([key, value]) => {
        const el = document.querySelector(`[data-key="${key}"]`);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = value;
        if (el.id) { const sw = document.getElementById(el.id + '_picker'); if (sw) sw.value = value; }
        if (el.type === 'range') { const span = el.parentElement?.querySelector('.ov-range-val'); if (span) span.textContent = value; }
    });
    updateBgTypeVisibility();
    saveScene(true);
    showToast('Theme applied!');
}

function resetTheme() {
    Object.entries(THEME_DEFAULTS).forEach(([key, value]) => {
        const el = document.querySelector(`[data-key="${key}"]`);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = value;
        if (el.id) { const sw = document.getElementById(el.id + '_picker'); if (sw) sw.value = value; }
        if (el.type === 'range') { const span = el.parentElement?.querySelector('.ov-range-val'); if (span) span.textContent = value; }
    });
    updateBgTypeVisibility();
    saveScene(true);
    showToast('Theme reset to defaults');
}

document.querySelectorAll('.preset-theme-btn').forEach(btn => {
    const themeId = btn.dataset.theme;
    const t = THEMES[themeId];
    if (t) {
        const from    = t.bg_gradient_from || t.bg_color || '#12121e';
        const to      = t.bg_gradient_to   || t.bg_color || '#080810';
        const accent  = t.accent_color || '#5865f2';
        const textCol = t.text_color || '#ffffff';
        const label   = btn.textContent.trim();
        // Make the button itself look like the theme
        btn.style.cssText = [
            'position:relative',
            'overflow:hidden',
            'padding:11px 12px 11px 16px',
            `background:linear-gradient(135deg,${from},${to})`,
            `border:1px solid ${accent}55`,
            'border-radius:8px',
            'cursor:pointer',
            'display:flex',
            'align-items:center',
            'text-align:left',
            'min-height:42px',
            'transition:filter .15s,transform .1s',
        ].join(';');
        btn.innerHTML =
            // Accent left stripe
            `<span style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${accent};border-radius:8px 0 0 8px;"></span>` +
            // Label
            `<span style="position:relative;color:${textCol};font-weight:700;font-size:11px;letter-spacing:.04em;text-shadow:0 1px 4px #0008;line-height:1.3">${label}</span>` +
            // Accent dot
            `<span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:8px;height:8px;border-radius:50%;background:${accent};box-shadow:0 0 6px ${accent}"></span>`;
        btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(1.25)'; btn.style.transform = 'scale(1.02)'; });
        btn.addEventListener('mouseleave', () => { btn.style.filter = ''; btn.style.transform = ''; });
    }
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

// ─── Export Config ───
const exportConfigBtn = document.getElementById('exportConfigBtn');
if (exportConfigBtn) {
    exportConfigBtn.addEventListener('click', () => {
        const payload = { name: getSceneName(), template: getTemplate(), config: buildPayload() };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (getSceneName() || 'scene').replace(/[^a-z0-9_-]/gi, '_') + '-config.json';
        a.click();
        URL.revokeObjectURL(a.href);
    });
}

// ─── Import Config ───
const importConfigBtn = document.getElementById('importConfigBtn');
const importConfigFile = document.getElementById('importConfigFile');
if (importConfigBtn && importConfigFile) {
    importConfigBtn.addEventListener('click', () => importConfigFile.click());
    importConfigFile.addEventListener('change', () => {
        const file = importConfigFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = JSON.parse(e.target.result);
                const cfg = data.config || data;

                // Restore scene name
                if (data.name) {
                    const nameEl = document.getElementById('sceneName');
                    if (nameEl) nameEl.value = data.name;
                }

                // Restore template selection
                const tpl = data.template || cfg.template;
                if (tpl) {
                    document.querySelectorAll('.ov-tmpl-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.template === tpl);
                    });
                }

                Object.entries(cfg).forEach(([key, value]) => {
                    // Social links
                    if (key === 'social' && value && typeof value === 'object') {
                        Object.entries(value).forEach(([platform, url]) => {
                            const el = document.querySelector(`[data-social="${platform}"]`);
                            if (el) el.value = url;
                        });
                        return;
                    }
                    // Schedule rows
                    if (key === 'schedule' && Array.isArray(value)) {
                        value.forEach((dayData, i) => {
                            Object.entries(dayData).forEach(([field, val]) => {
                                if (field === 'day') return;
                                const el = document.querySelector(`[data-sched-key="${i}"][data-sched-field="${field}"]`);
                                if (!el) return;
                                if (el.type === 'checkbox') el.checked = !!val;
                                else el.value = val;
                            });
                        });
                        return;
                    }
                    // Co-players list
                    if (key === 'co_players' && Array.isArray(value)) {
                        const container = document.getElementById('coPlayersList');
                        if (container) { container.innerHTML = ''; value.forEach(p => addPlayerRow(p.name || '', p.twitch || '')); }
                        return;
                    }
                    // Games list
                    if (key === 'games_list' && Array.isArray(value)) {
                        const container = document.getElementById('sceneGamesList');
                        if (container) { container.innerHTML = ''; value.forEach(g => addGameRow(g.title || g)); }
                        return;
                    }
                    // Viewer queue
                    if (key === 'viewer_queue' && Array.isArray(value)) {
                        const container = document.getElementById('viewerQueueList');
                        if (container) { container.innerHTML = ''; value.forEach(n => addQueueEntryRow(n)); }
                        return;
                    }
                    // Standard data-key elements
                    const el = document.querySelector(`[data-key="${key}"]`);
                    if (!el) return;
                    if (el.type === 'checkbox') el.checked = !!value;
                    else el.value = value;
                    // Sync paired color picker swatch
                    if (el.id) { const sw = document.getElementById(el.id + '_picker'); if (sw) sw.value = value; }
                    // Update range display span
                    if (el.type === 'range') {
                        const span = el.parentElement?.querySelector('.ov-range-val');
                        if (span) span.textContent = value;
                    }
                });

                // Fire input on elements with visual side-effects beyond just saving
                ['cfg_logo_url'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.dispatchEvent(new Event('input', { bubbles: false }));
                });

                updateBgTypeVisibility();
                updateParticlesVisibility();
                updateVideoOverlayVisibility();
                updateVideoOverlayAudioVisibility();
                saveScene(true);
                showToast('Config imported!');
            } catch { showToast('Invalid JSON file'); }
            importConfigFile.value = '';
        };
        reader.readAsText(file);
    });
}

// ─── Copy Config to Another Scene ───
const copyConfigBtn = document.getElementById('copyConfigBtn');
if (copyConfigBtn) {
    copyConfigBtn.addEventListener('click', () => {
        const target = document.getElementById('copyConfigTarget')?.value;
        if (!target) { showToast('Select a target scene first'); return; }
        copyConfigBtn.disabled = true;
        fetch('/overlays/api/scenes/' + SCENE_ID + '/copy-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_scene_id: target })
        })
        .then(r => r.json())
        .then(data => {
            copyConfigBtn.disabled = false;
            showToast(data.ok ? 'Style copied to scene!' : 'Error: ' + (data.error || 'unknown'));
        })
        .catch(() => { copyConfigBtn.disabled = false; showToast('Network error'); });
    });
}

// Init
bindAutoSave();
updateBgTypeVisibility();
