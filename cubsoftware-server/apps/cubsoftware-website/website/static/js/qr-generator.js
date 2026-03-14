// QR Code Generator JavaScript

// State
let currentType = 'url';
let currentQrData = '';
let recentQrCodes = [];
let qrCodeInstance = null;

// DOM Elements
const typeTabs = document.querySelectorAll('.type-tab');
const inputForms = {
    url: document.getElementById('urlForm'),
    text: document.getElementById('textForm'),
    wifi: document.getElementById('wifiForm'),
    contact: document.getElementById('contactForm')
};

// Input Elements
const urlInput = document.getElementById('urlInput');
const textInput = document.getElementById('textInput');
const wifiSsid = document.getElementById('wifiSsid');
const wifiPassword = document.getElementById('wifiPassword');
const wifiEncryption = document.getElementById('wifiEncryption');
const wifiHidden = document.getElementById('wifiHidden');
const contactFirstName = document.getElementById('contactFirstName');
const contactLastName = document.getElementById('contactLastName');
const contactPhone = document.getElementById('contactPhone');
const contactEmail = document.getElementById('contactEmail');
const contactOrg = document.getElementById('contactOrg');
const contactWebsite = document.getElementById('contactWebsite');

// Customization Elements
const QR_SIZE = 512; // Fixed QR code size
const qrForeground = document.getElementById('qrForeground');
const qrForegroundHex = document.getElementById('qrForegroundHex');
const qrBackground = document.getElementById('qrBackground');
const qrBackgroundHex = document.getElementById('qrBackgroundHex');
const qrErrorCorrection = document.getElementById('qrErrorCorrection');

// Preview Elements
const qrPreview = document.getElementById('qrPreview');
const qrDataLength = document.getElementById('qrDataLength');

// Buttons
const downloadPng = document.getElementById('downloadPng');
const downloadSvg = document.getElementById('downloadSvg');
const copyToClipboard = document.getElementById('copyToClipboard');
const clearRecent = document.getElementById('clearRecent');
const togglePassword = document.getElementById('togglePassword');

// Toast
const toast = document.getElementById('toast');

// Error correction level mapping
const errorCorrectionLevels = {
    'L': QRCode.CorrectLevel.L,
    'M': QRCode.CorrectLevel.M,
    'Q': QRCode.CorrectLevel.Q,
    'H': QRCode.CorrectLevel.H
};

// Initialize
function init() {
    loadRecentQrCodes();
    setupEventListeners();
    generateQrCode();
}

// Setup Event Listeners
function setupEventListeners() {
    // Type tabs
    typeTabs.forEach(tab => {
        tab.addEventListener('click', () => switchType(tab.dataset.type));
    });

    // URL input
    urlInput.addEventListener('input', debounce(generateQrCode, 300));

    // Text input
    textInput.addEventListener('input', debounce(generateQrCode, 300));

    // WiFi inputs
    wifiSsid.addEventListener('input', debounce(generateQrCode, 300));
    wifiPassword.addEventListener('input', debounce(generateQrCode, 300));
    wifiEncryption.addEventListener('change', generateQrCode);
    wifiHidden.addEventListener('change', generateQrCode);

    // Contact inputs
    contactFirstName.addEventListener('input', debounce(generateQrCode, 300));
    contactLastName.addEventListener('input', debounce(generateQrCode, 300));
    contactPhone.addEventListener('input', debounce(generateQrCode, 300));
    contactEmail.addEventListener('input', debounce(generateQrCode, 300));
    contactOrg.addEventListener('input', debounce(generateQrCode, 300));
    contactWebsite.addEventListener('input', debounce(generateQrCode, 300));

    // Customization
    qrForeground.addEventListener('input', () => {
        qrForegroundHex.value = qrForeground.value;
        generateQrCode();
    });

    qrForegroundHex.addEventListener('input', () => {
        if (isValidHex(qrForegroundHex.value)) {
            qrForeground.value = qrForegroundHex.value;
            generateQrCode();
        }
    });

    qrBackground.addEventListener('input', () => {
        qrBackgroundHex.value = qrBackground.value;
        generateQrCode();
    });

    qrBackgroundHex.addEventListener('input', () => {
        if (isValidHex(qrBackgroundHex.value)) {
            qrBackground.value = qrBackgroundHex.value;
            generateQrCode();
        }
    });

    qrErrorCorrection.addEventListener('change', generateQrCode);

    // Download buttons
    downloadPng.addEventListener('click', () => downloadQrCode('png'));
    downloadSvg.addEventListener('click', () => downloadQrCode('svg'));

    // Copy to clipboard
    copyToClipboard.addEventListener('click', copyQrToClipboard);

    // Clear recent
    clearRecent.addEventListener('click', clearRecentQrCodes);

    // Password toggle
    togglePassword.addEventListener('click', togglePasswordVisibility);
}

// Switch content type
function switchType(type) {
    currentType = type;

    // Update tabs
    typeTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.type === type);
    });

    // Show/hide forms
    Object.keys(inputForms).forEach(formType => {
        inputForms[formType].style.display = formType === type ? 'block' : 'none';
    });

    generateQrCode();
}

// Get QR data based on current type
function getQrData() {
    switch (currentType) {
        case 'url':
            return urlInput.value.trim();

        case 'text':
            return textInput.value.trim();

        case 'wifi':
            const ssid = wifiSsid.value.trim();
            const password = wifiPassword.value;
            const encryption = wifiEncryption.value;
            const hidden = wifiHidden.checked;

            if (!ssid) return '';

            // WiFi QR code format: WIFI:T:WPA;S:mynetwork;P:mypass;H:false;;
            let wifiString = `WIFI:T:${encryption};S:${escapeWifiString(ssid)};`;
            if (encryption !== 'nopass' && password) {
                wifiString += `P:${escapeWifiString(password)};`;
            }
            wifiString += `H:${hidden};;`;
            return wifiString;

        case 'contact':
            const firstName = contactFirstName.value.trim();
            const lastName = contactLastName.value.trim();
            const phone = contactPhone.value.trim();
            const email = contactEmail.value.trim();
            const org = contactOrg.value.trim();
            const website = contactWebsite.value.trim();

            if (!firstName && !lastName && !phone && !email) return '';

            // vCard format
            let vcard = 'BEGIN:VCARD\nVERSION:3.0\n';
            if (firstName || lastName) {
                vcard += `N:${lastName};${firstName};;;\n`;
                vcard += `FN:${firstName} ${lastName}\n`;
            }
            if (phone) vcard += `TEL:${phone}\n`;
            if (email) vcard += `EMAIL:${email}\n`;
            if (org) vcard += `ORG:${org}\n`;
            if (website) vcard += `URL:${website}\n`;
            vcard += 'END:VCARD';
            return vcard;

        default:
            return '';
    }
}

// Escape special characters for WiFi strings
function escapeWifiString(str) {
    return str.replace(/\\/g, '\\\\')
              .replace(/;/g, '\\;')
              .replace(/:/g, '\\:')
              .replace(/"/g, '\\"');
}

// Generate QR Code
function generateQrCode() {
    const data = getQrData();
    currentQrData = data;

    // Update character count
    qrDataLength.textContent = `${data.length} characters`;

    // Get logo overlay element
    const logoOverlay = document.getElementById('qrLogoOverlay');

    // Clear previous QR code
    qrPreview.innerHTML = '';

    if (!data) {
        qrPreview.innerHTML = '<div style="color: #888; font-size: 0.9rem;">Enter content to generate QR code</div>';
        if (logoOverlay) logoOverlay.style.display = 'none';
        return;
    }

    // Show logo overlay when QR code is present
    if (logoOverlay) logoOverlay.style.display = 'block';

    const foreground = qrForeground.value;
    const background = qrBackground.value;
    const errorLevel = errorCorrectionLevels[qrErrorCorrection.value] || QRCode.CorrectLevel.M;

    try {
        // Create new QR code instance
        qrCodeInstance = new QRCode(qrPreview, {
            text: data,
            width: QR_SIZE,
            height: QR_SIZE,
            colorDark: foreground,
            colorLight: background,
            correctLevel: errorLevel
        });
    } catch (error) {
        qrPreview.innerHTML = '<div style="color: #ff4757; font-size: 0.9rem;">Error generating QR code. Data may be too long.</div>';
        console.error(error);
    }
}

// Get canvas from QR code
function getQrCanvas() {
    return qrPreview.querySelector('canvas');
}

// Create canvas with logo overlay for download
function createCanvasWithLogo() {
    const originalCanvas = getQrCanvas();
    if (!originalCanvas) return null;

    // Create new canvas
    const canvas = document.createElement('canvas');
    canvas.width = originalCanvas.width;
    canvas.height = originalCanvas.height;
    const ctx = canvas.getContext('2d');

    // Draw original QR code
    ctx.drawImage(originalCanvas, 0, 0);

    // Draw logo text
    const fontSize = Math.floor(canvas.width / 28);
    ctx.font = `900 ${fontSize}px Orbitron, sans-serif`;

    const cubText = 'CUB';
    const softwareText = 'SOFTWARE';
    const fullText = cubText + softwareText;
    const textWidth = ctx.measureText(fullText).width;
    const cubWidth = ctx.measureText(cubText).width;

    const paddingX = 6;
    const paddingY = 6;
    const boxWidth = textWidth + paddingX * 2;
    const boxHeight = fontSize + paddingY * 2;
    const boxX = (canvas.width - boxWidth) / 2;
    const boxY = (canvas.height - boxHeight) / 2;

    // Draw small white box background with rounded corners
    ctx.fillStyle = '#ffffff';
    const radius = 4;
    ctx.beginPath();
    ctx.moveTo(boxX + radius, boxY);
    ctx.lineTo(boxX + boxWidth - radius, boxY);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius);
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight);
    ctx.lineTo(boxX + radius, boxY + boxHeight);
    ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius);
    ctx.lineTo(boxX, boxY + radius);
    ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
    ctx.closePath();
    ctx.fill();

    // Center text in the box
    ctx.textBaseline = 'middle';
    const textX = boxX + paddingX;
    const textY = boxY + boxHeight / 2;

    // Draw "CUB" in purple
    ctx.fillStyle = '#5865f2';
    ctx.fillText(cubText, textX, textY);

    // Draw "SOFTWARE" in dark gray
    ctx.fillStyle = '#333333';
    ctx.fillText(softwareText, textX + cubWidth, textY);

    return canvas;
}

// Get filename based on QR content
function getFilename(format) {
    let name = '';

    switch (currentType) {
        case 'url':
            name = urlInput.value.trim() || 'url';
            break;
        case 'text':
            name = textInput.value.trim().substring(0, 30).replace(/[^a-zA-Z0-9 ]/g, '') || 'text';
            break;
        case 'wifi':
            name = wifiSsid.value.trim() || 'wifi';
            break;
        case 'contact':
            const first = contactFirstName.value.trim();
            const last = contactLastName.value.trim();
            name = `${first} ${last}`.trim() || 'contact';
            break;
        default:
            name = 'qrcode';
    }

    // Replace characters not allowed in filenames
    name = name.replace(/https?:\/\//g, '').replace(/[<>:"/\\|?*]/g, '');

    return `cubsoftware - ${name}.${format}`;
}

// Download QR Code
function downloadQrCode(format) {
    if (!currentQrData) {
        showToast('No QR code to download');
        return;
    }

    const canvas = createCanvasWithLogo();
    if (!canvas) {
        showToast('No QR code to download');
        return;
    }

    if (format === 'png') {
        const link = document.createElement('a');
        link.download = getFilename('png');
        link.href = canvas.toDataURL('image/png');
        link.click();
        addToRecent(canvas.toDataURL('image/png'));
        showToast('Downloaded!');
    } else if (format === 'svg') {
        // Convert canvas to SVG
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const foreground = qrForeground.value;
        const background = qrBackground.value;

        // Create SVG
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${QR_SIZE}" height="${QR_SIZE}" viewBox="0 0 ${canvas.width} ${canvas.height}">`;
        svg += `<rect width="100%" height="100%" fill="${background}"/>`;

        // Scan the canvas and create rectangles for dark pixels
        const pixelSize = 1;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                // Check if pixel is dark (QR code module)
                if (imageData.data[i] < 128) {
                    svg += `<rect x="${x}" y="${y}" width="${pixelSize}" height="${pixelSize}" fill="${foreground}"/>`;
                }
            }
        }
        svg += '</svg>';

        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = getFilename('svg');
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);

        addToRecent(canvas.toDataURL('image/png'));
        showToast('Downloaded!');
    }
}

// Copy QR Code to Clipboard
async function copyQrToClipboard() {
    if (!currentQrData) {
        showToast('No QR code to copy');
        return;
    }

    const canvas = createCanvasWithLogo();
    if (!canvas) {
        showToast('No QR code to copy');
        return;
    }

    try {
        // Convert canvas to blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

        // Copy to clipboard
        await navigator.clipboard.write([
            new ClipboardItem({
                'image/png': blob
            })
        ]);

        showToast('Copied to clipboard!');
        addToRecent(canvas.toDataURL('image/png'));
    } catch (error) {
        // Fallback: copy data as text
        try {
            await navigator.clipboard.writeText(currentQrData);
            showToast('QR data copied!');
        } catch (e) {
            showToast('Failed to copy');
        }
    }
}

// Wait for Orbitron font to load before downloading
function waitForFont() {
    return document.fonts.ready;
}

// Get label for recent QR code
function getRecentLabel() {
    switch (currentType) {
        case 'url':
            try {
                const url = new URL(urlInput.value.trim());
                return url.hostname.replace('www.', '');
            } catch {
                return 'URL';
            }
        case 'text':
            return textInput.value.trim().substring(0, 15) || 'Text';
        case 'wifi':
            return wifiSsid.value.trim() || 'WiFi';
        case 'contact':
            const first = contactFirstName.value.trim();
            const last = contactLastName.value.trim();
            return `${first} ${last}`.trim() || 'Contact';
        default:
            return 'QR Code';
    }
}

// Add QR code to recent list
function addToRecent(dataUrl) {
    // Check if already exists
    const existingIndex = recentQrCodes.findIndex(qr => qr.data === currentQrData);
    if (existingIndex !== -1) {
        // Move to front
        recentQrCodes.splice(existingIndex, 1);
    }

    // Add to front
    recentQrCodes.unshift({
        data: currentQrData,
        type: currentType,
        image: dataUrl,
        label: getRecentLabel(),
        foreground: qrForeground.value,
        background: qrBackground.value,
        errorLevel: qrErrorCorrection.value,
        timestamp: Date.now()
    });

    // Keep only last 10
    if (recentQrCodes.length > 10) {
        recentQrCodes = recentQrCodes.slice(0, 10);
    }

    saveRecentQrCodes();
    renderRecentQrCodes();
}

// Get label from QR data
function getLabelFromData(qr) {
    if (qr.label) return qr.label;

    const data = qr.data || '';

    // Try to extract URL hostname
    if (data.startsWith('http')) {
        try {
            const url = new URL(data);
            return url.hostname.replace('www.', '');
        } catch {}
    }

    // WiFi
    if (data.startsWith('WIFI:')) {
        const match = data.match(/S:([^;]+)/);
        if (match) return match[1];
    }

    // vCard
    if (data.startsWith('BEGIN:VCARD')) {
        const match = data.match(/FN:(.+)/);
        if (match) return match[1].trim();
    }

    // Text - first 15 chars
    if (data.length > 0) {
        return data.substring(0, 15);
    }

    return 'QR Code';
}

// Render recent QR codes
function renderRecentQrCodes() {
    const container = document.getElementById('recentQrCodes');

    if (recentQrCodes.length === 0) {
        container.innerHTML = '<div class="recent-empty">No recent QR codes</div>';
        return;
    }

    container.innerHTML = recentQrCodes.map((qr, index) => `
        <div class="recent-qr-item" data-index="${index}" title="Click to restore">
            <img src="${qr.image}" alt="QR Code">
            <span class="recent-qr-label">${getLabelFromData(qr)}</span>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.recent-qr-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            restoreQrCode(recentQrCodes[index]);
        });
    });
}

// Restore QR code from recent
function restoreQrCode(qr) {
    currentType = qr.type;

    // Update tabs
    typeTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.type === qr.type);
    });

    // Show/hide forms
    Object.keys(inputForms).forEach(formType => {
        inputForms[formType].style.display = formType === qr.type ? 'block' : 'none';
    });

    // Restore data based on type
    switch (qr.type) {
        case 'url':
            urlInput.value = qr.data;
            break;
        case 'text':
            textInput.value = qr.data;
            break;
        // WiFi and contact are more complex to restore, just regenerate
    }

    // Restore colors and error level
    if (qr.foreground) {
        qrForeground.value = qr.foreground;
        qrForegroundHex.value = qr.foreground;
    }
    if (qr.background) {
        qrBackground.value = qr.background;
        qrBackgroundHex.value = qr.background;
    }
    if (qr.errorLevel) {
        qrErrorCorrection.value = qr.errorLevel;
    }

    generateQrCode();
    showToast('QR code restored');
}

// Save recent QR codes to localStorage
function saveRecentQrCodes() {
    try {
        localStorage.setItem('recentQrCodes', JSON.stringify(recentQrCodes));
    } catch (e) {
        console.warn('Could not save recent QR codes to localStorage');
    }
}

// Load recent QR codes from localStorage
function loadRecentQrCodes() {
    try {
        const saved = localStorage.getItem('recentQrCodes');
        if (saved) {
            recentQrCodes = JSON.parse(saved);
            renderRecentQrCodes();
        }
    } catch (e) {
        console.warn('Could not load recent QR codes from localStorage');
    }
}

// Clear recent QR codes
function clearRecentQrCodes() {
    recentQrCodes = [];
    saveRecentQrCodes();
    renderRecentQrCodes();
    showToast('Recent QR codes cleared');
}

// Toggle password visibility
function togglePasswordVisibility() {
    const eyeIcon = togglePassword.querySelector('.eye-icon');
    const eyeOffIcon = togglePassword.querySelector('.eye-off-icon');

    if (wifiPassword.type === 'password') {
        wifiPassword.type = 'text';
        eyeIcon.style.display = 'none';
        eyeOffIcon.style.display = 'block';
    } else {
        wifiPassword.type = 'password';
        eyeIcon.style.display = 'block';
        eyeOffIcon.style.display = 'none';
    }
}

// Validate hex color
function isValidHex(hex) {
    return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Show toast notification
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
