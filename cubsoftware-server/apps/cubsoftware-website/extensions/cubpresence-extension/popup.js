// CubPresence Extension - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
    const statusDot = document.getElementById('statusDot');
    const statusTitle = document.getElementById('statusTitle');
    const statusDetail = document.getElementById('statusDetail');
    const presenceInfo = document.getElementById('presenceInfo');
    const connectedActions = document.getElementById('connectedActions');
    const noConfig = document.getElementById('noConfig');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const openSiteBtn = document.getElementById('openSiteBtn');

    // ── Linux tip ────────────────────────────────────────────────────────────
    const isLinux = navigator.platform.toLowerCase().includes('linux');
    if (isLinux) {
        document.getElementById('linuxTip').style.display = 'block';
    }

    // Get current state from background
    function updateUI(state) {
        statusDot.className = 'status-dot ' + (state.connectionState || 'disconnected');

        if (state.connectionState === 'connected') {
            statusTitle.textContent = 'Connected to Discord';
            statusDetail.textContent = 'Rich Presence is active';
            connectedActions.style.display = 'block';
            noConfig.style.display = 'none';

            if (state.config) {
                presenceInfo.style.display = 'block';
                document.getElementById('infoDetails').textContent = state.config.details || '-';
                document.getElementById('infoState').textContent = state.config.state || '-';
            }
        } else if (state.connectionState === 'connecting' || state.connectionState === 'authorizing') {
            statusTitle.textContent = state.connectionState === 'authorizing' ? 'Authorizing...' : 'Connecting...';
            statusDetail.textContent = 'Please wait...';
            connectedActions.style.display = 'none';
            presenceInfo.style.display = 'none';
            noConfig.style.display = 'none';
        } else {
            statusTitle.textContent = 'Disconnected';
            statusDetail.textContent = state.error || 'Not connected to Discord';
            connectedActions.style.display = 'none';
            presenceInfo.style.display = 'none';
            noConfig.style.display = state.config ? 'none' : 'block';
        }
    }

    // Initial state
    try {
        const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
        updateUI(state);
    } catch (err) {
        updateUI({ connectionState: 'disconnected', error: 'Extension error' });
    }

    // Listen for state updates
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'STATE_UPDATE') {
            updateUI(message);
        }
    });

    // Disconnect button
    disconnectBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ type: 'DISCONNECT' });
        updateUI({ connectionState: 'disconnected' });
    });

    // Open website button
    openSiteBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://cubsoftware.site/apps/cubpresence' });
    });

    // ── Debug panel ──────────────────────────────────────────────────────────
    const debugToggle = document.getElementById('debugToggle');
    const debugPanel  = document.getElementById('debugPanel');
    const dbgContent  = document.getElementById('dbgContent');
    let debugOpen = false;

    debugToggle.addEventListener('click', () => {
        debugOpen = !debugOpen;
        debugPanel.style.display = debugOpen ? 'block' : 'none';
        debugToggle.textContent = (debugOpen ? '▾' : '▸') + ' Debug';
        if (debugOpen) refreshLogs();
    });

    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function badge(ok) { return `<span class="dbg-badge ${ok?'ok':'fail'}">${ok?'OPEN':'CLOSED'}</span>`; }

    function renderLogs(data) {
        let html = '';

        // System
        html += `<div class="dbg-section"><div class="dbg-title">System</div>`;
        html += `<div class="dbg-row"><span class="dbg-label">Platform</span><span class="dbg-val">${esc(data.platform||navigator.platform)}</span></div>`;
        html += `<div class="dbg-row"><span class="dbg-label">Connected port</span><span class="dbg-val ${data.wsPort?'dbg-ok':'dbg-fail'}">${data.wsPort || 'none'}</span></div>`;
        html += `<div class="dbg-row"><span class="dbg-label">State</span><span class="dbg-val">${esc(data.connectionState||'—')}</span></div>`;
        html += `<div class="dbg-row"><span class="dbg-label">Authenticated</span><span class="dbg-val ${data.authenticated?'dbg-ok':'dbg-fail'}">${data.authenticated?'Yes':'No'}</span></div>`;
        html += `</div>`;

        // Logs
        if (data.logs && data.logs.length) {
            html += `<div class="dbg-section"><div class="dbg-title">Log (last ${data.logs.length})</div>`;
            data.logs.slice(-30).forEach(l => {
                const t = new Date(l.t).toISOString().slice(11,19);
                html += `<div class="dbg-log ${esc(l.level)}"><span style="color:#444">${t}</span> ${esc(l.msg)}</div>`;
            });
            html += `</div>`;
        }

        dbgContent.innerHTML = html;
    }

    function renderPortScan(results) {
        let html = `<div class="dbg-section"><div class="dbg-title">Discord RPC Port Scan</div>`;
        const open = results.filter(r => r.open);
        results.forEach(r => {
            html += `<div class="dbg-row">${badge(r.open)} <span class="dbg-label" style="min-width:60px">:${r.port}</span><span class="dbg-val" style="color:#555">${esc(r.reason)} · ${r.ms}ms</span></div>`;
        });
        if (open.length === 0) {
            html += `<div style="color:#ff6b6b;margin-top:4px">No ports open. ${isLinux ? 'Run discord-rpc-bridge.py first!' : 'Is Discord running?'}</div>`;
        } else {
            html += `<div style="color:#4cff88;margin-top:4px">Discord RPC found on port${open.length>1?'s':''} ${open.map(r=>r.port).join(', ')}</div>`;
        }
        html += `</div>`;
        dbgContent.innerHTML = html;
    }

    async function refreshLogs() {
        try {
            const data = await chrome.runtime.sendMessage({ type: 'GET_DEBUG' });
            renderLogs(data);
        } catch(e) {
            dbgContent.innerHTML = `<span class="dbg-fail">Error: ${esc(e.message)}</span>`;
        }
    }

    document.getElementById('dbgScanBtn').addEventListener('click', async () => {
        dbgContent.innerHTML = '<span style="color:#9146ff">Scanning ports…</span>';
        try {
            const res = await chrome.runtime.sendMessage({ type: 'SCAN_PORTS' });
            renderPortScan(res.results || []);
        } catch(e) {
            dbgContent.innerHTML = `<span class="dbg-fail">Error: ${esc(e.message)}</span>`;
        }
    });

    document.getElementById('dbgLogsBtn').addEventListener('click', refreshLogs);

    document.getElementById('dbgCopyBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(dbgContent.innerText).catch(() => {});
    });
});
