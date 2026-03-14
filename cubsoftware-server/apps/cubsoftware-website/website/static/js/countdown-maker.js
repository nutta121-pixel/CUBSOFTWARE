// Countdown Maker JavaScript

// Elements
const eventTitle = document.getElementById('eventTitle');
const eventDate = document.getElementById('eventDate');
const endMessage = document.getElementById('endMessage');
const showDays = document.getElementById('showDays');
const showHours = document.getElementById('showHours');
const showMinutes = document.getElementById('showMinutes');
const showSeconds = document.getElementById('showSeconds');
const countdownPreview = document.getElementById('countdownPreview');
const previewTitle = document.getElementById('previewTitle');
const previewDays = document.getElementById('previewDays');
const previewHours = document.getElementById('previewHours');
const previewMinutes = document.getElementById('previewMinutes');
const previewSeconds = document.getElementById('previewSeconds');
const previewEndMessage = document.getElementById('previewEndMessage');
const daysBlock = document.getElementById('daysBlock');
const hoursBlock = document.getElementById('hoursBlock');
const minutesBlock = document.getElementById('minutesBlock');
const secondsBlock = document.getElementById('secondsBlock');
const shareLink = document.getElementById('shareLink');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const createShareBtn = document.getElementById('createShareBtn');
const saveCountdownBtn = document.getElementById('saveCountdownBtn');
const savedList = document.getElementById('savedList');
const themeBtns = document.querySelectorAll('.theme-btn');

let currentTheme = 'dark';
let countdownInterval = null;
let currentShareId = null;
let currentSavedId = null; // Track the ID of the currently loaded saved countdown

// Initialize
function init() {
    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);
    eventDate.value = formatDateTimeLocal(tomorrow);

    // Check for URL params
    loadFromUrl();

    // Setup event listeners
    setupEventListeners();

    // Load saved countdowns
    loadSavedCountdowns();

    // Start countdown
    startCountdown();
    updatePreview();
    updateShareLink();
}

// Format date for datetime-local input
function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Setup event listeners
function setupEventListeners() {
    eventTitle.addEventListener('input', () => {
        updatePreview();
        updateShareLink();
    });

    eventDate.addEventListener('change', () => {
        startCountdown();
        updateShareLink();
    });

    endMessage.addEventListener('input', updateShareLink);

    // Theme buttons
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            themeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTheme = btn.dataset.theme;
            updatePreviewTheme();
            updateShareLink();
        });
    });

    // Display options
    [showDays, showHours, showMinutes, showSeconds].forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            updateDisplayOptions();
            updateShareLink();
        });
    });

    // Copy link
    copyLinkBtn.addEventListener('click', () => {
        if (shareLink.value) {
            navigator.clipboard.writeText(shareLink.value);
            showToast('Link copied!');
        }
    });

    // Create shareable link
    if (createShareBtn) {
        createShareBtn.addEventListener('click', createShareableLink);
    }

    // Save countdown
    saveCountdownBtn.addEventListener('click', saveCountdown);
}

// Create or update shareable link via API
async function createShareableLink() {
    if (!eventTitle.value || !eventDate.value) {
        showToast('Please enter a title and date');
        return;
    }

    const countdownData = {
        title: eventTitle.value,
        date: eventDate.value,
        endMessage: endMessage.value,
        theme: currentTheme,
        showDays: showDays.checked,
        showHours: showHours.checked,
        showMinutes: showMinutes.checked,
        showSeconds: showSeconds.checked
    };

    try {
        let response;
        let isUpdate = false;

        // If we have an existing share ID, update it instead of creating new
        if (currentShareId) {
            isUpdate = true;
            response = await fetch(`/api/countdown/${currentShareId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(countdownData)
            });
        } else {
            response = await fetch('/api/countdown/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(countdownData)
            });
        }

        if (!response.ok) {
            throw new Error('Failed to save shareable link');
        }

        const result = await response.json();

        if (!isUpdate) {
            currentShareId = result.countdownId;
            shareLink.value = result.shareUrl;
        }

        // Show the share link container
        document.getElementById('shareLinkContainer').style.display = 'flex';

        // Update button text to show it's now in update mode
        updateShareButtonText();

        showToast(isUpdate ? 'Countdown updated!' : 'Shareable link created!');

    } catch (error) {
        showToast('Failed to save link');
        console.error('Share error:', error);
    }
}

// Update the share button text based on whether we're creating or updating
function updateShareButtonText() {
    if (!createShareBtn) return;
    if (currentShareId) {
        createShareBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            Update Shareable Link
        `;
    } else {
        createShareBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            Create Shareable Link
        `;
    }
}

// Update the save button text based on whether we're editing an existing countdown
function updateSaveButtonText() {
    if (!saveCountdownBtn) return;
    if (currentSavedId) {
        saveCountdownBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            Update Saved
        `;
    } else {
        saveCountdownBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            Save Current
        `;
    }
}

// Update preview
function updatePreview() {
    previewTitle.textContent = eventTitle.value || 'Your Event';
}

// Update preview theme
function updatePreviewTheme() {
    countdownPreview.className = 'countdown-preview theme-' + currentTheme;
}

// Update display options
function updateDisplayOptions() {
    daysBlock.style.display = showDays.checked ? 'flex' : 'none';
    hoursBlock.style.display = showHours.checked ? 'flex' : 'none';
    minutesBlock.style.display = showMinutes.checked ? 'flex' : 'none';
    secondsBlock.style.display = showSeconds.checked ? 'flex' : 'none';
}

// Start countdown
function startCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

// Update countdown
function updateCountdown() {
    const targetDate = new Date(eventDate.value);
    const now = new Date();
    const diff = targetDate - now;

    if (diff <= 0) {
        // Countdown finished
        previewDays.textContent = '00';
        previewHours.textContent = '00';
        previewMinutes.textContent = '00';
        previewSeconds.textContent = '00';

        // All checkboxes can be enabled when countdown is done
        updateCheckboxStates(0, 0, 0, 0);

        if (endMessage.value) {
            document.querySelector('.preview-timer').style.display = 'none';
            previewEndMessage.textContent = endMessage.value;
            previewEndMessage.style.display = 'block';
        }
        return;
    }

    // Show timer, hide end message
    document.querySelector('.preview-timer').style.display = 'flex';
    previewEndMessage.style.display = 'none';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    previewDays.textContent = String(days).padStart(2, '0');
    previewHours.textContent = String(hours).padStart(2, '0');
    previewMinutes.textContent = String(minutes).padStart(2, '0');
    previewSeconds.textContent = String(seconds).padStart(2, '0');

    // Update which checkboxes can be toggled
    updateCheckboxStates(days, hours, minutes, seconds);
}

// Update checkbox enabled/disabled states based on time values
// Rule: Can only disable a unit if it's zero (except seconds which can always be toggled)
function updateCheckboxStates(days, hours, minutes, seconds) {
    // Days: can only disable if days is 0
    const canDisableDays = days === 0;
    showDays.disabled = !canDisableDays;
    showDays.parentElement.classList.toggle('checkbox-disabled', !canDisableDays);

    // If days > 0, force it to be checked
    if (days > 0 && !showDays.checked) {
        showDays.checked = true;
        updateDisplayOptions();
    }

    // Hours: can only disable if hours is 0
    const canDisableHours = hours === 0;
    showHours.disabled = !canDisableHours;
    showHours.parentElement.classList.toggle('checkbox-disabled', !canDisableHours);

    // If hours > 0, force it to be checked
    if (hours > 0 && !showHours.checked) {
        showHours.checked = true;
        updateDisplayOptions();
    }

    // Minutes: can only disable if minutes is 0
    const canDisableMinutes = minutes === 0;
    showMinutes.disabled = !canDisableMinutes;
    showMinutes.parentElement.classList.toggle('checkbox-disabled', !canDisableMinutes);

    // If minutes > 0, force it to be checked
    if (minutes > 0 && !showMinutes.checked) {
        showMinutes.checked = true;
        updateDisplayOptions();
    }

    // Seconds: can always be toggled (it's just precision)
    showSeconds.disabled = false;
    showSeconds.parentElement.classList.remove('checkbox-disabled');
}

// Called when settings change - no longer clears the share ID
// User can now update their existing shared countdown
function updateShareLink() {
    // Keep the share ID so user can update the existing link
    // Just ensure the button text is correct
    if (createShareBtn) {
        updateShareButtonText();
    }
}

// Load from URL
function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);

    if (params.has('title')) {
        eventTitle.value = params.get('title');
    }

    if (params.has('date')) {
        eventDate.value = params.get('date');
    }

    if (params.has('msg')) {
        endMessage.value = params.get('msg');
    }

    if (params.has('theme')) {
        currentTheme = params.get('theme');
        themeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === currentTheme);
        });
        updatePreviewTheme();
    }

    if (params.has('show')) {
        const show = params.get('show');
        showDays.checked = show.includes('d');
        showHours.checked = show.includes('h');
        showMinutes.checked = show.includes('m');
        showSeconds.checked = show.includes('s');
        updateDisplayOptions();
    }
}

// Save countdown
function saveCountdown() {
    if (!eventTitle.value || !eventDate.value) {
        showToast('Please enter a title and date');
        return;
    }

    let saved = JSON.parse(localStorage.getItem('savedCountdowns') || '[]');

    // Check if we're updating an existing saved countdown (by saved ID or shareId)
    let existingIndex = -1;
    if (currentSavedId) {
        existingIndex = saved.findIndex(c => c.id === currentSavedId);
    } else if (currentShareId) {
        existingIndex = saved.findIndex(c => c.shareId === currentShareId);
    }

    const countdown = {
        id: existingIndex >= 0 ? saved[existingIndex].id : Date.now(),
        title: eventTitle.value,
        date: eventDate.value,
        endMessage: endMessage.value,
        theme: currentTheme,
        showDays: showDays.checked,
        showHours: showHours.checked,
        showMinutes: showMinutes.checked,
        showSeconds: showSeconds.checked,
        shareId: currentShareId || (existingIndex >= 0 ? saved[existingIndex].shareId : null),
        shareUrl: currentShareId ? shareLink.value : (existingIndex >= 0 ? saved[existingIndex].shareUrl : null)
    };

    if (existingIndex >= 0) {
        // Update existing
        saved[existingIndex] = countdown;
        currentSavedId = countdown.id;
        showToast('Countdown updated!');
    } else {
        // Add new
        saved.push(countdown);
        currentSavedId = countdown.id;
        showToast('Countdown saved!');
    }

    localStorage.setItem('savedCountdowns', JSON.stringify(saved));
    loadSavedCountdowns();
    updateSaveButtonText();
}

// Load saved countdowns
function loadSavedCountdowns() {
    const saved = JSON.parse(localStorage.getItem('savedCountdowns') || '[]');

    if (saved.length === 0) {
        savedList.innerHTML = '<div class="empty-state">No saved countdowns yet</div>';
        return;
    }

    savedList.innerHTML = saved.map(countdown => `
        <div class="saved-item ${currentSavedId === countdown.id ? 'editing' : ''}" data-id="${countdown.id}">
            <div class="saved-item-info">
                <div class="saved-item-title">
                    ${escapeHtml(countdown.title)}
                    ${countdown.shareId ? '<span class="shared-badge" title="Has shareable link">🔗</span>' : ''}
                    ${currentSavedId === countdown.id ? '<span class="editing-badge">Editing</span>' : ''}
                </div>
                <div class="saved-item-date">${formatReadableDate(countdown.date)}</div>
            </div>
            <div class="saved-item-actions">
                <button onclick="loadCountdown(${countdown.id})">${currentSavedId === countdown.id ? 'Reload' : 'Edit'}</button>
                <button class="delete-btn" onclick="deleteCountdown(${countdown.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

// Load countdown
window.loadCountdown = function(id) {
    const saved = JSON.parse(localStorage.getItem('savedCountdowns') || '[]');
    const countdown = saved.find(c => c.id === id);

    if (!countdown) return;

    // Track that we're editing this saved countdown
    currentSavedId = countdown.id;

    eventTitle.value = countdown.title;
    eventDate.value = countdown.date;
    endMessage.value = countdown.endMessage || '';
    currentTheme = countdown.theme;

    themeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === currentTheme);
    });

    showDays.checked = countdown.showDays;
    showHours.checked = countdown.showHours;
    showMinutes.checked = countdown.showMinutes;
    showSeconds.checked = countdown.showSeconds;

    // Restore share ID and URL if they exist
    if (countdown.shareId) {
        currentShareId = countdown.shareId;
        shareLink.value = countdown.shareUrl || '';
        document.getElementById('shareLinkContainer').style.display = 'flex';
        updateShareButtonText();
    } else {
        currentShareId = null;
        shareLink.value = '';
        document.getElementById('shareLinkContainer').style.display = 'none';
        updateShareButtonText();
    }

    updatePreview();
    updatePreviewTheme();
    updateDisplayOptions();
    startCountdown();
    updateSaveButtonText();

    showToast('Countdown loaded - edit and save to update');
};

// Delete countdown
window.deleteCountdown = function(id) {
    let saved = JSON.parse(localStorage.getItem('savedCountdowns') || '[]');
    saved = saved.filter(c => c.id !== id);
    localStorage.setItem('savedCountdowns', JSON.stringify(saved));
    loadSavedCountdowns();
    showToast('Countdown deleted');
};

// Format readable date
function formatReadableDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

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

// Start a new countdown (clear everything)
window.newCountdown = function() {
    // Reset form
    eventTitle.value = '';
    endMessage.value = '';

    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);
    eventDate.value = formatDateTimeLocal(tomorrow);

    // Reset theme to dark
    currentTheme = 'dark';
    themeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === 'dark');
    });

    // Reset display options
    showDays.checked = true;
    showHours.checked = true;
    showMinutes.checked = true;
    showSeconds.checked = true;

    // Clear share state
    currentShareId = null;
    shareLink.value = '';
    document.getElementById('shareLinkContainer').style.display = 'none';
    updateShareButtonText();

    // Update UI
    updatePreview();
    updatePreviewTheme();
    updateDisplayOptions();
    startCountdown();

    showToast('Ready for new countdown!');
};

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
