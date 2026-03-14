// Discord Timestamp Generator

const FLAGS = ['t', 'T', 'd', 'D', 'f', 'F', 'R'];

let currentUnix = null;
let relativeInterval = null;

// --- Timezone population ---
function populateTimezones() {
    const sel = document.getElementById('tgTimezone');
    // Common timezones ordered by region
    const zones = [
        'UTC',
        'Europe/London',
        'Europe/Paris',
        'Europe/Berlin',
        'Europe/Madrid',
        'Europe/Rome',
        'Europe/Amsterdam',
        'Europe/Brussels',
        'Europe/Warsaw',
        'Europe/Stockholm',
        'Europe/Helsinki',
        'Europe/Athens',
        'Europe/Bucharest',
        'Europe/Istanbul',
        'Europe/Moscow',
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'America/Phoenix',
        'America/Anchorage',
        'America/Honolulu',
        'America/Toronto',
        'America/Vancouver',
        'America/Mexico_City',
        'America/Bogota',
        'America/Lima',
        'America/Santiago',
        'America/Sao_Paulo',
        'America/Argentina/Buenos_Aires',
        'Africa/Cairo',
        'Africa/Lagos',
        'Africa/Nairobi',
        'Africa/Johannesburg',
        'Asia/Dubai',
        'Asia/Karachi',
        'Asia/Kolkata',
        'Asia/Dhaka',
        'Asia/Bangkok',
        'Asia/Singapore',
        'Asia/Shanghai',
        'Asia/Hong_Kong',
        'Asia/Tokyo',
        'Asia/Seoul',
        'Australia/Sydney',
        'Australia/Melbourne',
        'Australia/Perth',
        'Pacific/Auckland',
        'Pacific/Fiji',
    ];

    // Try to detect user's local timezone
    let localTz = 'UTC';
    try { localTz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}

    // Add local tz first if not already in list
    if (!zones.includes(localTz)) zones.unshift(localTz);

    zones.forEach(tz => {
        const opt = document.createElement('option');
        opt.value = tz;
        opt.textContent = tz.replace(/_/g, ' ');
        if (tz === localTz) opt.selected = true;
        sel.appendChild(opt);
    });
}

// --- Date/time → unix ---
function getUnixFromInputs() {
    const dateVal = document.getElementById('tgDate').value;
    const timeVal = document.getElementById('tgTime').value;
    const tz      = document.getElementById('tgTimezone').value;

    if (!dateVal || !timeVal) return null;

    const [year, month, day] = dateVal.split('-').map(Number);
    const [hour, minute]     = timeVal.split(':').map(Number);

    // Build ISO string with timezone offset
    try {
        // Use Temporal if available, otherwise fallback to Intl trick
        const dtStr = `${dateVal}T${timeVal}:00`;
        const dtInTz = new Date(
            new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false,
            }).format
        );

        // Simpler: create the date as if it's UTC then adjust for offset
        // Get the offset at that time in the chosen tz
        const tempDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
        const offset   = getTzOffsetMinutes(tempDate, tz);
        return Math.floor((tempDate.getTime() - offset * 60 * 1000) / 1000);
    } catch (e) {
        // Fallback: local time if tz fails
        const d = new Date(year, month - 1, day, hour, minute, 0);
        return Math.floor(d.getTime() / 1000);
    }
}

function getTzOffsetMinutes(date, tz) {
    // Get UTC offset of `tz` at a given UTC date
    const utcStr  = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    }).format(date);

    const tzStr = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    }).format(date);

    return (parseFormattedDate(tzStr) - parseFormattedDate(utcStr)) / 60000;
}

function parseFormattedDate(str) {
    // Parses "MM/DD/YYYY, HH:MM:SS"
    const [datePart, timePart] = str.split(', ');
    const [m, d, y] = datePart.split('/').map(Number);
    const [h, mi, s] = timePart.split(':').map(Number);
    return Date.UTC(y, m - 1, d, h, mi, s);
}

// --- Unix → date/time inputs ---
function setInputsFromUnix(unix, tz) {
    const date = new Date(unix * 1000);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        hour12: false,
    }).formatToParts(date);

    const get = (t) => parts.find(p => p.type === t)?.value || '00';
    const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
    let   timeStr = `${get('hour')}:${get('minute')}`;
    // Normalize midnight edge case (some locales return 24:00)
    if (timeStr.startsWith('24')) timeStr = '00' + timeStr.slice(2);

    document.getElementById('tgDate').value = dateStr;
    document.getElementById('tgTime').value = timeStr;
}

// --- Preview formatters ---
function formatPreview(unix, flag) {
    const date = new Date(unix * 1000);
    const opts = { timeZone: 'UTC' }; // Discord renders in viewer's local; we show UTC as reference
    switch (flag) {
        case 't': return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        case 'T': return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        case 'd': return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
        case 'D': return date.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
        case 'f': return date.toLocaleString([], { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        case 'F': return date.toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        case 'R': return formatRelative(unix);
        default:  return '—';
    }
}

function formatRelative(unix) {
    const diffSec = unix - Math.floor(Date.now() / 1000);
    const abs = Math.abs(diffSec);
    const past = diffSec < 0;

    let str;
    if (abs < 5)          str = 'just now';
    else if (abs < 60)    str = `${abs} seconds`;
    else if (abs < 3600)  str = `${Math.round(abs / 60)} minutes`;
    else if (abs < 86400) str = `${Math.round(abs / 3600)} hours`;
    else if (abs < 2592000) str = `${Math.round(abs / 86400)} days`;
    else if (abs < 31536000) str = `${Math.round(abs / 2592000)} months`;
    else                  str = `${Math.round(abs / 31536000)} years`;

    if (abs < 5) return str;
    return past ? `${str} ago` : `in ${str}`;
}

// --- Render all cards ---
function renderAll(unix) {
    currentUnix = unix;
    document.getElementById('tgUnixValue').textContent = unix;

    FLAGS.forEach(flag => {
        document.getElementById(`preview-${flag}`).textContent = formatPreview(unix, flag);
        document.getElementById(`code-${flag}`).textContent    = `<t:${unix}:${flag}>`;
    });
}

function clearAll() {
    document.getElementById('tgUnixValue').textContent = '—';
    FLAGS.forEach(flag => {
        document.getElementById(`preview-${flag}`).textContent = '—';
        document.getElementById(`code-${flag}`).textContent    = '—';
    });
    currentUnix = null;
}

// --- Update from date/time inputs ---
function updateFromDatetime() {
    const unix = getUnixFromInputs();
    if (unix !== null) {
        // Sync unix input field
        document.getElementById('tgUnixInput').value = '';
        renderAll(unix);
    } else {
        clearAll();
    }
}

// --- Set now ---
function setNow() {
    const now = Math.floor(Date.now() / 1000);
    const tz = document.getElementById('tgTimezone').value;
    document.getElementById('tgUnixInput').value = '';
    setInputsFromUnix(now, tz);
    renderAll(now);
}

// --- Set offset from now (minutes) ---
function setOffset(minutes) {
    const base = currentUnix !== null ? currentUnix : Math.floor(Date.now() / 1000);
    const unix  = base + minutes * 60;
    const tz    = document.getElementById('tgTimezone').value;
    document.getElementById('tgUnixInput').value = '';
    setInputsFromUnix(unix, tz);
    renderAll(unix);
}

// --- Copy single format ---
function copyCode(flag) {
    if (currentUnix === null) { showToast('Set a date and time first', 'error'); return; }
    const code = `<t:${currentUnix}:${flag}>`;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.querySelector(`[data-flag="${flag}"] .tg-copy-btn`);
        if (btn) {
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
        }
        showToast(`Copied ${flag} format`);
    });
}

// --- Copy all ---
function copyAll() {
    if (currentUnix === null) { showToast('Set a date and time first', 'error'); return; }
    const lines = FLAGS.map(f => {
        const label = document.querySelector(`[data-flag="${f}"] .tg-format-label`).textContent;
        return `${label}: <t:${currentUnix}:${f}>`;
    });
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
        showToast('All formats copied!');
    });
}

// --- Toast ---
function showToast(msg, type) {
    const toast = document.getElementById('tgToast');
    toast.textContent = msg;
    toast.style.background = type === 'error' ? '#ef4444' : '#22c55e';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
}

// --- Relative time live ticker ---
function startRelativeTicker() {
    clearInterval(relativeInterval);
    relativeInterval = setInterval(() => {
        if (currentUnix !== null) {
            document.getElementById('preview-R').textContent = formatRelative(currentUnix);
        }
    }, 5000);
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    populateTimezones();

    // Date/time inputs → update
    document.getElementById('tgDate').addEventListener('change', updateFromDatetime);
    document.getElementById('tgTime').addEventListener('input', updateFromDatetime);
    document.getElementById('tgTimezone').addEventListener('change', () => {
        if (currentUnix !== null) {
            setInputsFromUnix(currentUnix, document.getElementById('tgTimezone').value);
        } else {
            updateFromDatetime();
        }
    });

    // Direct unix input
    document.getElementById('tgUnixInput').addEventListener('input', () => {
        const val = document.getElementById('tgUnixInput').value.trim();
        if (!val) { clearAll(); return; }
        const unix = parseInt(val, 10);
        if (!isNaN(unix) && unix > 0) {
            const tz = document.getElementById('tgTimezone').value;
            setInputsFromUnix(unix, tz);
            renderAll(unix);
        }
    });

    // Start with "now"
    setNow();
    startRelativeTicker();
});
