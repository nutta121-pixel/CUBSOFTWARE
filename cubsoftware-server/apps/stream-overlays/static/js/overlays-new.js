// Stream Overlays — New Scene JS

let selectedType = null;
let selectedTemplate = null;
let autoFilledName = null; // tracks the last auto-suggested name so we know if user edited it

// Type filter tabs
document.querySelectorAll('.ov-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.ov-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const filter = tab.dataset.filter;
        document.querySelectorAll('.ov-type-card').forEach(card => {
            if (filter === 'all' || card.dataset.category === filter) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    });
});

// Type selection
document.querySelectorAll('.ov-type-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.ov-type-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedType = card.dataset.type;

        // Suggest a scene name — always update if the user hasn't manually changed it
        const title = card.querySelector('.ov-type-title');
        const nameInput = document.getElementById('sceneName');
        if (title && nameInput) {
            const suggested = title.textContent.trim();
            if (!nameInput.value || nameInput.value === autoFilledName) {
                nameInput.value = suggested;
                autoFilledName = suggested;
            }
        }

        // Show template picker
        const picker = document.getElementById('templatePicker');
        picker.style.display = 'block';
        picker.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        updateCreateBtn();
    });
});

// Template selection
document.querySelectorAll('.ov-tmpl-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.ov-tmpl-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedTemplate = card.dataset.template;
        updateCreateBtn();
    });
});

// Select first template by default
const firstTemplate = document.querySelector('.ov-tmpl-card');
if (firstTemplate) {
    firstTemplate.click();
}

function updateCreateBtn() {
    const btn = document.getElementById('createBtn');
    if (!btn) return;
    btn.disabled = !selectedType || !selectedTemplate;
}

// Scene name input
const nameInput = document.getElementById('sceneName');
if (nameInput) {
    nameInput.addEventListener('input', updateCreateBtn);
}

// Create button
const createBtn = document.getElementById('createBtn');
if (createBtn) {
    createBtn.addEventListener('click', () => {
        if (!selectedType || !selectedTemplate) return;
        const name = nameInput ? nameInput.value.trim() : '';
        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';

        fetch('/overlays/api/scenes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: selectedType, template: selectedTemplate, name: name || undefined })
        })
        .then(r => r.json())
        .then(data => {
            if (data.scene_id) {
                window.location.href = '/overlays/scenes/' + data.scene_id + '/edit';
            } else {
                createBtn.disabled = false;
                createBtn.textContent = 'Create Scene →';
                alert('Error: ' + (data.error || 'Could not create scene'));
            }
        })
        .catch(() => {
            createBtn.disabled = false;
            createBtn.textContent = 'Create Scene →';
            alert('Network error — please try again');
        });
    });
}
