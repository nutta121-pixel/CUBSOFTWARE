// Overlay Pack Creator JS

const templatePreviewBg = {
    minimal:    { from: '#0a0a1a', to: '#0a0a1a' },
    neon:       { from: '#0a0a1a', to: '#0a0a1a' },
    retro:      { from: '#0a0000', to: '#0a0000' },
    cozy:       { from: '#1a0a10', to: '#0a1020' },
    gradient:   { from: '#0a0a1a', to: '#1a0030' },
    gaming:     { from: '#000000', to: '#000000' },
    lofi:       { from: '#1a1008', to: '#0f0c08' },
    esports:    { from: '#020208', to: '#020208' },
    vaporwave:  { from: '#2d004f', to: '#001a4f' },
    glass:      { from: '#0e0e1e', to: '#0e0e1e' },
    cinematic:  { from: '#000000', to: '#000000' },
    broadcast:  { from: '#050510', to: '#050510' },
};

function updatePreview() {
    const template = document.getElementById('packTemplate').value;
    const from = document.getElementById('packBgFrom').value;
    const to = document.getElementById('packBgTo').value;
    const accent = document.getElementById('packAccent').value;
    const font = document.getElementById('packFont').value;
    const preview = document.getElementById('packPreview');
    const label = document.getElementById('packPreviewLabel');
    preview.style.background = `linear-gradient(135deg, ${from}, ${to})`;
    label.style.color = '#fff';
    label.style.fontFamily = `'${font}', sans-serif`;
    label.style.textShadow = `0 0 20px ${accent}88`;
}

document.getElementById('packTemplate').addEventListener('change', function() {
    const bg = templatePreviewBg[this.value] || { from: '#0a0a1a', to: '#1a0a2e' };
    document.getElementById('packBgFrom').value = bg.from;
    document.getElementById('packBgTo').value = bg.to;
    updatePreview();
});
['packBgFrom', 'packBgTo', 'packAccent', 'packFont'].forEach(id => {
    document.getElementById(id).addEventListener('input', updatePreview);
});

const packNameInput = document.getElementById('packName');
packNameInput.addEventListener('input', () => {
    document.getElementById('packCreateBtn').disabled = !packNameInput.value.trim();
});

document.getElementById('packCreateBtn').addEventListener('click', () => {
    const name = packNameInput.value.trim();
    if (!name) return;
    const sceneTypes = Array.from(document.querySelectorAll('.pack-scene-check input:checked')).map(i => i.value);
    if (!sceneTypes.length) {
        document.getElementById('packStatus').textContent = 'Please select at least one scene.';
        return;
    }
    const btn = document.getElementById('packCreateBtn');
    btn.disabled = true; btn.textContent = 'Creating...';
    document.getElementById('packStatus').textContent = '';

    fetch('/overlays/api/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pack_name: name,
            template: document.getElementById('packTemplate').value,
            scene_types: sceneTypes,
            config_overrides: {
                bg_gradient_from: document.getElementById('packBgFrom').value,
                bg_gradient_to: document.getElementById('packBgTo').value,
                bg_color: document.getElementById('packBgFrom').value,
                accent_color: document.getElementById('packAccent').value,
                particle_color: document.getElementById('packAccent').value,
                font: document.getElementById('packFont').value,
            }
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.ok) {
            document.getElementById('packStatus').textContent = `✓ ${data.scenes.length} scenes created! Redirecting...`;
            document.getElementById('packStatus').style.color = '#00cc66';
            setTimeout(() => { window.location.href = '/overlays'; }, 1200);
        } else {
            btn.disabled = false; btn.textContent = 'Create Pack ⚡';
            document.getElementById('packStatus').textContent = 'Error: ' + (data.error || 'Could not create pack');
            document.getElementById('packStatus').style.color = '#ff5555';
        }
    })
    .catch(() => {
        btn.disabled = false; btn.textContent = 'Create Pack ⚡';
        document.getElementById('packStatus').textContent = 'Network error — please try again';
        document.getElementById('packStatus').style.color = '#ff5555';
    });
});

updatePreview();
