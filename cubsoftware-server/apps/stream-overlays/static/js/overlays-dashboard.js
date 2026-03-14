// Stream Overlays — Dashboard JS

function showToast(msg, duration = 2500) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
}

function copyUrl(elemId, btn) {
    const el = document.getElementById(elemId);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent.trim()).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.color = '#00cc66';
        setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
    }).catch(() => {
        // Fallback
        const range = document.createRange();
        range.selectNode(el);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        window.getSelection().removeAllRanges();
        showToast('URL copied!');
    });
}

function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.color = '#00cc66';
        setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
    });
}

function deleteScene(sceneId, btn) {
    if (!confirm('Delete this scene? This cannot be undone.\n\nAnyone using this OBS source URL will see a blank page.')) return;
    const card = btn.closest('.ov-scene-card');
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    fetch('/overlays/api/scenes/' + sceneId, { method: 'DELETE' })
        .then(r => r.json())
        .then(data => {
            if (data.ok) {
                card.style.opacity = '0';
                card.style.transform = 'scale(.95)';
                card.style.transition = 'all .3s';
                setTimeout(() => card.remove(), 300);
                showToast('Scene deleted');
            } else {
                btn.disabled = false;
                btn.textContent = 'Delete';
                showToast('Error: ' + (data.error || 'Could not delete'));
            }
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = 'Delete';
            showToast('Network error');
        });
}

function duplicateScene(sceneId, btn) {
    const orig = btn.innerHTML;
    btn.disabled = true;
    fetch('/overlays/api/scenes/' + sceneId + '/duplicate', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
            if (data.ok && data.scene_id) {
                showToast('Scene duplicated — redirecting to editor');
                setTimeout(() => { window.location.href = '/overlays/scenes/' + data.scene_id + '/edit'; }, 800);
            } else {
                btn.disabled = false;
                btn.innerHTML = orig;
                showToast('Error: ' + (data.error || 'Could not duplicate'));
            }
        })
        .catch(() => {
            btn.disabled = false;
            btn.innerHTML = orig;
            showToast('Network error');
        });
}

function downloadOffline(sceneId, btn) {
    const orig = btn.textContent;
    btn.textContent = 'Opening...';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 3000);
    window.open('/overlays/source/' + sceneId + '?capture=1', '_blank', 'width=1920,height=1080');
}

// Auto-dismiss alerts
document.querySelectorAll('.ov-alert').forEach(el => {
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .5s'; setTimeout(() => el.remove(), 500); }, 5000);
});
