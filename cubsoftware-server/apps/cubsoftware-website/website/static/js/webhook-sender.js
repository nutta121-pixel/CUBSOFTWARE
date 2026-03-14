// Discord Webhook Sender

const WEBHOOK_REGEX = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
let history = [];

function updateContentCount() {
    document.getElementById('contentCount').textContent =
        document.getElementById('wsContent').value.length;
}

function validateEmbedJson() {
    const raw = document.getElementById('wsEmbedJson').value.trim();
    const status = document.getElementById('jsonStatus');
    if (!raw) { status.textContent = ''; status.className = 'ws-json-status'; return; }
    try {
        JSON.parse(raw);
        status.textContent = '✓ Valid JSON';
        status.className = 'ws-json-status valid';
    } catch (e) {
        status.textContent = '✗ ' + e.message;
        status.className = 'ws-json-status invalid';
    }
}

async function validateWebhook() {
    const url = document.getElementById('webhookUrl').value.trim();
    const info = document.getElementById('webhookInfo');

    if (!url) { showInfo(info, 'invalid', 'Enter a webhook URL first'); return; }
    if (!WEBHOOK_REGEX.test(url)) { showInfo(info, 'invalid', '✗ Invalid webhook URL format'); return; }

    showInfo(info, '', '⏳ Validating...');
    info.classList.add('show');

    try {
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            const avatarUrl = data.avatar
                ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
                : null;
            const imgTag = avatarUrl
                ? `<img class="ws-webhook-avatar" src="${avatarUrl}" onerror="this.style.display='none'">`
                : '';
            info.innerHTML = `${imgTag}<span>✓ Valid — <strong>${data.name || 'Webhook'}</strong> (Channel ID: ${data.channel_id})</span>`;
            info.className = 'ws-webhook-info show valid';
        } else {
            const err = await res.json().catch(() => ({}));
            showInfo(info, 'invalid', `✗ ${err.message || 'Invalid webhook — check the URL'}`);
        }
    } catch (e) {
        showInfo(info, 'invalid', '✗ Network error — check the URL and try again');
    }
}

function showInfo(el, type, msg) {
    el.innerHTML = msg;
    el.className = 'ws-webhook-info show' + (type ? ' ' + type : '');
}

async function sendWebhook() {
    const url = document.getElementById('webhookUrl').value.trim();
    const content = document.getElementById('wsContent').value;
    const username = document.getElementById('wsUsername').value.trim();
    const avatar = document.getElementById('wsAvatar').value.trim();
    const embedRaw = document.getElementById('wsEmbedJson').value.trim();
    const threadId = document.getElementById('wsThreadId').value.trim();
    const wait = document.getElementById('wsWait').checked;

    if (!url) { showToast('Enter a webhook URL', 'error'); return; }
    if (!WEBHOOK_REGEX.test(url)) { showToast('Invalid webhook URL format', 'error'); return; }
    if (!content && !embedRaw) { showToast('Add content or an embed', 'error'); return; }

    // Parse embed JSON
    let embed = null;
    if (embedRaw) {
        try {
            embed = JSON.parse(embedRaw);
        } catch (e) {
            showToast('Invalid embed JSON: ' + e.message, 'error');
            return;
        }
    }

    const payload = {};
    if (content)  payload.content = content;
    if (username) payload.username = username;
    if (avatar)   payload.avatar_url = avatar;
    if (embed)    payload.embeds = [embed];

    const btn = document.getElementById('wsSendBtn');
    btn.textContent = 'Sending...';
    btn.disabled = true;

    let sendUrl = url;
    const params = new URLSearchParams();
    if (wait)     params.set('wait', 'true');
    if (threadId) params.set('thread_id', threadId);
    if ([...params].length) sendUrl += '?' + params.toString();

    const responseEl = document.getElementById('wsResponseContent');
    const emptyEl    = document.getElementById('wsResponseEmpty');

    try {
        const res = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const text = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}

        emptyEl.style.display = 'none';
        responseEl.style.display = 'block';

        if (res.ok) {
            responseEl.className = 'ws-response-content success';
            const msgId = parsed?.id ? `\nMessage ID: ${parsed.id}` : '';
            responseEl.innerHTML =
                `<div class="ws-response-status ok">✓ ${res.status} ${res.statusText}${msgId}</div>` +
                (parsed ? `<pre>${JSON.stringify(parsed, null, 2)}</pre>` : '');
            addHistory('ok', res.status, content || (embed?.title ? `[Embed: ${embed.title}]` : '[Embed]'));
            showToast('Message sent!');
        } else {
            responseEl.className = 'ws-response-content error';
            const errMsg = parsed?.message || res.statusText;
            responseEl.innerHTML =
                `<div class="ws-response-status err">✗ ${res.status} — ${errMsg}</div>` +
                (parsed ? `<pre>${JSON.stringify(parsed, null, 2)}</pre>` : '');
            addHistory('err', res.status, errMsg);
            showToast('Error ' + res.status + ': ' + errMsg, 'error');
        }
    } catch (e) {
        emptyEl.style.display = 'none';
        responseEl.style.display = 'block';
        responseEl.className = 'ws-response-content error';
        responseEl.innerHTML = `<div class="ws-response-status err">✗ Network Error</div><pre>${e.message}</pre>`;
        addHistory('err', 0, e.message);
        showToast('Network error', 'error');
    } finally {
        btn.textContent = 'Send Message';
        btn.disabled = false;
    }
}

function addHistory(status, code, preview) {
    history.unshift({ status, code, preview: String(preview).substring(0, 60), time: new Date() });
    if (history.length > 10) history.pop();
    renderHistory();
}

function renderHistory() {
    const container = document.getElementById('wsHistory');
    if (!history.length) {
        container.innerHTML = '<div class="ws-empty-state" style="padding:16px 0"><p style="font-size:0.82rem;color:var(--text-secondary)">No sends yet</p></div>';
        return;
    }
    container.innerHTML = history.map(h => {
        const timeStr = h.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const badgeClass = h.status === 'ok' ? 'ok' : 'err';
        const badgeText = h.status === 'ok' ? `✓ ${h.code}` : `✗ ${h.code || 'ERR'}`;
        return `<div class="ws-history-item">
            <span class="ws-history-badge ${badgeClass}">${badgeText}</span>
            <span class="ws-history-preview">${escHtml(h.preview) || '(no preview)'}</span>
            <span class="ws-history-time">${timeStr}</span>
        </div>`;
    }).join('');
}

function clearEmbed() {
    document.getElementById('wsEmbedJson').value = '';
    validateEmbedJson();
}

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.background = type === 'error' ? '#ef4444' : '#22c55e';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
}

document.addEventListener('DOMContentLoaded', () => {
    // Load embed JSON from URL param (passed from embed builder)
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('embed');
    if (encoded) {
        try {
            const json = decodeURIComponent(escape(atob(encoded)));
            document.getElementById('wsEmbedJson').value = JSON.stringify(JSON.parse(json), null, 2);
            validateEmbedJson();
            showToast('Embed loaded from Embed Builder');
        } catch (e) {
            console.warn('Could not decode embed param:', e);
        }
    }

    renderHistory();
});
