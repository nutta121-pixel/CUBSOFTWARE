// Timestamp Converter JavaScript

// Elements
const currentTimestamp = document.getElementById('currentTimestamp');
const currentReadable = document.getElementById('currentReadable');
const unixInput = document.getElementById('unixInput');
const unixFormat = document.getElementById('unixFormat');
const nowBtn = document.getElementById('nowBtn');
const localResult = document.getElementById('localResult');
const utcResult = document.getElementById('utcResult');
const isoResult = document.getElementById('isoResult');
const relativeResult = document.getElementById('relativeResult');
const dateInput = document.getElementById('dateInput');
const timeInput = document.getElementById('timeInput');
const timezoneSelect = document.getElementById('timezoneSelect');
const secondsResult = document.getElementById('secondsResult');
const millisecondsResult = document.getElementById('millisecondsResult');

// Initialize
function init() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);

    // Set default date/time to now
    const now = new Date();
    dateInput.value = formatDateInput(now);
    timeInput.value = formatTimeInput(now);

    setupEventListeners();
    convertDateToUnix();
}

// Update current time display
function updateCurrentTime() {
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000);

    currentTimestamp.textContent = timestamp.toLocaleString();
    currentReadable.textContent = formatReadable(now);
}

// Format date for input
function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Format time for input
function formatTimeInput(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

// Format readable date
function formatReadable(date) {
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    return date.toLocaleString('en-US', options);
}

// Setup event listeners
function setupEventListeners() {
    // Unix to Human
    unixInput.addEventListener('input', convertUnixToHuman);
    unixFormat.addEventListener('change', convertUnixToHuman);
    nowBtn.addEventListener('click', () => {
        const now = Math.floor(Date.now() / 1000);
        unixInput.value = now;
        unixFormat.value = 'seconds';
        convertUnixToHuman();
    });

    // Human to Unix
    dateInput.addEventListener('change', convertDateToUnix);
    timeInput.addEventListener('change', convertDateToUnix);
    timezoneSelect.addEventListener('change', convertDateToUnix);

    // Copy buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.copy;
            const value = document.getElementById(targetId).textContent;
            if (value && value !== '-') {
                navigator.clipboard.writeText(value);
                showToast('Copied!');
            }
        });
    });
}

// Convert Unix timestamp to human readable
function convertUnixToHuman() {
    const value = unixInput.value.trim();

    if (!value) {
        clearUnixResults();
        return;
    }

    let timestamp = parseInt(value);
    if (isNaN(timestamp)) {
        clearUnixResults();
        return;
    }

    // Convert to milliseconds if in seconds
    if (unixFormat.value === 'seconds') {
        timestamp *= 1000;
    }

    const date = new Date(timestamp);

    // Check if valid date
    if (isNaN(date.getTime())) {
        clearUnixResults();
        return;
    }

    // Local time
    localResult.textContent = date.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    // UTC time
    utcResult.textContent = date.toUTCString();

    // ISO 8601
    isoResult.textContent = date.toISOString();

    // Relative time
    relativeResult.textContent = getRelativeTime(date);
}

// Clear Unix results
function clearUnixResults() {
    localResult.textContent = '-';
    utcResult.textContent = '-';
    isoResult.textContent = '-';
    relativeResult.textContent = '-';
}

// Get relative time
function getRelativeTime(date) {
    const now = new Date();
    const diffMs = date - now;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    const isFuture = diffMs > 0;
    const abs = Math.abs;

    if (abs(diffSeconds) < 60) {
        return isFuture ? 'in a few seconds' : 'a few seconds ago';
    } else if (abs(diffMinutes) < 60) {
        const m = abs(diffMinutes);
        return isFuture ? `in ${m} minute${m > 1 ? 's' : ''}` : `${m} minute${m > 1 ? 's' : ''} ago`;
    } else if (abs(diffHours) < 24) {
        const h = abs(diffHours);
        return isFuture ? `in ${h} hour${h > 1 ? 's' : ''}` : `${h} hour${h > 1 ? 's' : ''} ago`;
    } else if (abs(diffDays) < 7) {
        const d = abs(diffDays);
        return isFuture ? `in ${d} day${d > 1 ? 's' : ''}` : `${d} day${d > 1 ? 's' : ''} ago`;
    } else if (abs(diffWeeks) < 4) {
        const w = abs(diffWeeks);
        return isFuture ? `in ${w} week${w > 1 ? 's' : ''}` : `${w} week${w > 1 ? 's' : ''} ago`;
    } else if (abs(diffMonths) < 12) {
        const mo = abs(diffMonths);
        return isFuture ? `in ${mo} month${mo > 1 ? 's' : ''}` : `${mo} month${mo > 1 ? 's' : ''} ago`;
    } else {
        const y = abs(diffYears);
        return isFuture ? `in ${y} year${y > 1 ? 's' : ''}` : `${y} year${y > 1 ? 's' : ''} ago`;
    }
}

// Convert date to Unix timestamp
function convertDateToUnix() {
    const dateValue = dateInput.value;
    const timeValue = timeInput.value || '00:00:00';

    if (!dateValue) {
        secondsResult.textContent = '-';
        millisecondsResult.textContent = '-';
        return;
    }

    let date;
    const dateTimeString = `${dateValue}T${timeValue}`;

    if (timezoneSelect.value === 'UTC') {
        date = new Date(dateTimeString + 'Z');
    } else {
        date = new Date(dateTimeString);
    }

    if (isNaN(date.getTime())) {
        secondsResult.textContent = '-';
        millisecondsResult.textContent = '-';
        return;
    }

    const milliseconds = date.getTime();
    const seconds = Math.floor(milliseconds / 1000);

    secondsResult.textContent = seconds.toLocaleString();
    millisecondsResult.textContent = milliseconds.toLocaleString();
}

// Show toast
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
