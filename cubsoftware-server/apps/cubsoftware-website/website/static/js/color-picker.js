// Color Picker JavaScript

// ==================== STATE ====================
let currentColor = { h: 0, s: 50, l: 38 };
let currentPalette = 'complementary';
let recentColors = JSON.parse(localStorage.getItem('recentColors')) || [];
let isDragging = false;
let cursorX = 50; // percentage - centered
let cursorY = 50; // percentage - centered

// ==================== DOM ELEMENTS ====================
const colorArea = document.getElementById('colorArea');
const colorCursor = document.getElementById('colorCursor');
const hueSlider = document.getElementById('hueSlider');
const colorPreview = document.getElementById('colorPreview');
const hexInput = document.getElementById('hexInput');
const rgbInput = document.getElementById('rgbInput');
const hslInput = document.getElementById('hslInput');
const redSlider = document.getElementById('redSlider');
const greenSlider = document.getElementById('greenSlider');
const blueSlider = document.getElementById('blueSlider');
const redValue = document.getElementById('redValue');
const greenValue = document.getElementById('greenValue');
const blueValue = document.getElementById('blueValue');
const paletteColors = document.getElementById('paletteColors');
const recentColorsContainer = document.getElementById('recentColors');
const toast = document.getElementById('toast');

// Image picker elements
const imageUploadArea = document.getElementById('imageUploadArea');
const imageInput = document.getElementById('imageInput');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const imageContainer = document.getElementById('imageContainer');
const imageCanvas = document.getElementById('imageCanvas');
const imageActions = document.getElementById('imageActions');
const clearImageBtn = document.getElementById('clearImage');
const colorMagnifier = document.getElementById('colorMagnifier');

// ==================== COLOR CONVERSION UTILITIES ====================

function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return {
        r: Math.round(255 * f(0)),
        g: Math.round(255 * f(8)),
        b: Math.round(255 * f(4))
    };
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    };
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// ==================== UPDATE FUNCTIONS ====================

function updateColorArea() {
    const hueColor = `hsl(${currentColor.h}, 100%, 50%)`;
    colorArea.style.background = `linear-gradient(to right, #fff, ${hueColor})`;
}

function updateAllDisplays() {
    const rgb = hslToRgb(currentColor.h, currentColor.s, currentColor.l);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

    // Update preview
    colorPreview.style.background = hex;

    // Update text inputs
    hexInput.value = hex;
    rgbInput.value = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    hslInput.value = `hsl(${currentColor.h}, ${currentColor.s}%, ${currentColor.l}%)`;

    // Update RGB sliders
    redSlider.value = rgb.r;
    greenSlider.value = rgb.g;
    blueSlider.value = rgb.b;
    redValue.textContent = rgb.r;
    greenValue.textContent = rgb.g;
    blueValue.textContent = rgb.b;

    // Update hue slider
    hueSlider.value = currentColor.h;

    // Update color area gradient
    updateColorArea();

    // Update cursor position
    updateCursorPosition();

    // Update palette
    generatePalette();
}

function updateCursorPosition() {
    colorCursor.style.left = `${cursorX}%`;
    colorCursor.style.top = `${cursorY}%`;
}

// ==================== PALETTE GENERATION ====================

function generatePalette() {
    paletteColors.innerHTML = '';
    let colors = [];

    switch (currentPalette) {
        case 'complementary':
            colors = getComplementary();
            break;
        case 'analogous':
            colors = getAnalogous();
            break;
        case 'triadic':
            colors = getTriadic();
            break;
        case 'tetradic':
            colors = getTetradic();
            break;
        case 'split':
            colors = getSplitComplementary();
            break;
        case 'monochromatic':
            colors = getMonochromatic();
            break;
        case 'shades':
            colors = getShades();
            break;
        case 'tints':
            colors = getTints();
            break;
    }

    colors.forEach(color => {
        const rgb = hslToRgb(color.h, color.s, color.l);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        const div = document.createElement('div');
        div.className = 'palette-color';
        div.style.background = hex;
        div.innerHTML = `<span class="palette-color-hex">${hex}</span>`;
        div.addEventListener('click', () => {
            setColorFromHex(hex);
            addToRecent(hex);
        });
        paletteColors.appendChild(div);
    });
}

function getComplementary() {
    return [
        { ...currentColor },
        { h: (currentColor.h + 180) % 360, s: currentColor.s, l: currentColor.l }
    ];
}

function getAnalogous() {
    return [
        { h: (currentColor.h - 30 + 360) % 360, s: currentColor.s, l: currentColor.l },
        { ...currentColor },
        { h: (currentColor.h + 30) % 360, s: currentColor.s, l: currentColor.l }
    ];
}

function getTriadic() {
    return [
        { ...currentColor },
        { h: (currentColor.h + 120) % 360, s: currentColor.s, l: currentColor.l },
        { h: (currentColor.h + 240) % 360, s: currentColor.s, l: currentColor.l }
    ];
}

function getShades() {
    return [
        { h: currentColor.h, s: currentColor.s, l: 15 },
        { h: currentColor.h, s: currentColor.s, l: 30 },
        { h: currentColor.h, s: currentColor.s, l: 45 },
        { h: currentColor.h, s: currentColor.s, l: 60 },
        { h: currentColor.h, s: currentColor.s, l: 75 }
    ];
}

function getTints() {
    return [
        { h: currentColor.h, s: currentColor.s, l: 85 },
        { h: currentColor.h, s: currentColor.s, l: 80 },
        { h: currentColor.h, s: currentColor.s, l: 70 },
        { h: currentColor.h, s: currentColor.s, l: 60 },
        { h: currentColor.h, s: currentColor.s, l: 50 }
    ];
}

function getTetradic() {
    return [
        { ...currentColor },
        { h: (currentColor.h + 90) % 360, s: currentColor.s, l: currentColor.l },
        { h: (currentColor.h + 180) % 360, s: currentColor.s, l: currentColor.l },
        { h: (currentColor.h + 270) % 360, s: currentColor.s, l: currentColor.l }
    ];
}

function getSplitComplementary() {
    return [
        { ...currentColor },
        { h: (currentColor.h + 150) % 360, s: currentColor.s, l: currentColor.l },
        { h: (currentColor.h + 210) % 360, s: currentColor.s, l: currentColor.l }
    ];
}

function getMonochromatic() {
    return [
        { h: currentColor.h, s: 20, l: currentColor.l },
        { h: currentColor.h, s: 40, l: currentColor.l },
        { h: currentColor.h, s: 60, l: currentColor.l },
        { h: currentColor.h, s: 80, l: currentColor.l },
        { h: currentColor.h, s: 100, l: currentColor.l }
    ];
}

// ==================== RECENT COLORS ====================

function addToRecent(hex) {
    // Remove if already exists
    recentColors = recentColors.filter(c => c !== hex);
    // Add to beginning
    recentColors.unshift(hex);
    // Keep only last 20
    recentColors = recentColors.slice(0, 20);
    // Save to localStorage
    localStorage.setItem('recentColors', JSON.stringify(recentColors));
    // Update display
    renderRecentColors();
}

function renderRecentColors() {
    recentColorsContainer.innerHTML = '';
    if (recentColors.length === 0) {
        recentColorsContainer.innerHTML = '<span class="recent-empty">No colors picked yet</span>';
        return;
    }
    recentColors.forEach(hex => {
        const div = document.createElement('div');
        div.className = 'recent-color';
        div.style.background = hex;
        div.title = hex;
        div.addEventListener('click', () => setColorFromHex(hex));
        recentColorsContainer.appendChild(div);
    });
}

// ==================== SET COLOR ====================

function updateCursorFromHsl() {
    // Convert HSL to HSV to get cursor position
    const h = currentColor.h;
    const s = currentColor.s / 100;
    const l = currentColor.l / 100;

    // HSL to HSV conversion
    const v = l + s * Math.min(l, 1 - l);
    const sv = v === 0 ? 0 : 2 * (1 - l / v);

    cursorX = sv * 100;
    cursorY = (1 - v) * 100;
}

function setColorFromHex(hex) {
    const rgb = hexToRgb(hex);
    if (rgb) {
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        currentColor = hsl;
        updateCursorFromHsl();
        updateAllDisplays();
    }
}

function setColorFromRgb(r, g, b) {
    const hsl = rgbToHsl(r, g, b);
    currentColor = hsl;
    updateCursorFromHsl();
    updateAllDisplays();
}

// ==================== EVENT LISTENERS ====================

// Color Area Click/Drag
function handleColorAreaInteraction(e) {
    const rect = colorArea.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    // Store cursor position
    cursorX = x * 100;
    cursorY = y * 100;

    // Convert position to HSL
    // x = saturation (0 = white/no saturation, 1 = full saturation)
    // y = value/brightness (0 = bright, 1 = dark)
    const saturation = x * 100;
    const value = (1 - y) * 100;

    // Convert HSV to HSL
    const l = value * (1 - saturation / 200);
    const s = l === 0 || l === 100 ? 0 : (value - l) / Math.min(l, 100 - l) * 100;

    currentColor.s = Math.round(Math.max(0, Math.min(100, s)));
    currentColor.l = Math.round(Math.max(0, Math.min(100, l)));

    updateAllDisplays();
}

colorArea.addEventListener('mousedown', (e) => {
    isDragging = true;
    handleColorAreaInteraction(e);
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        handleColorAreaInteraction(e);
    }
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        const rgb = hslToRgb(currentColor.h, currentColor.s, currentColor.l);
        addToRecent(rgbToHex(rgb.r, rgb.g, rgb.b));
    }
});

// Hue Slider
hueSlider.addEventListener('input', (e) => {
    currentColor.h = parseInt(e.target.value);
    updateAllDisplays();
});

hueSlider.addEventListener('change', () => {
    const rgb = hslToRgb(currentColor.h, currentColor.s, currentColor.l);
    addToRecent(rgbToHex(rgb.r, rgb.g, rgb.b));
});

// RGB Sliders
[redSlider, greenSlider, blueSlider].forEach(slider => {
    slider.addEventListener('input', () => {
        setColorFromRgb(
            parseInt(redSlider.value),
            parseInt(greenSlider.value),
            parseInt(blueSlider.value)
        );
    });
    slider.addEventListener('change', () => {
        const hex = rgbToHex(
            parseInt(redSlider.value),
            parseInt(greenSlider.value),
            parseInt(blueSlider.value)
        );
        addToRecent(hex);
    });
});

// HEX Input
hexInput.addEventListener('input', (e) => {
    let hex = e.target.value;
    if (!hex.startsWith('#')) {
        hex = '#' + hex;
    }
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        setColorFromHex(hex);
    }
});

hexInput.addEventListener('change', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(hexInput.value)) {
        addToRecent(hexInput.value);
    }
});

// Copy Buttons
document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        navigator.clipboard.writeText(input.value).then(() => {
            showToast('Copied!');
        });
    });
});

// Palette Tabs
document.querySelectorAll('.palette-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.palette-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentPalette = tab.dataset.palette;
        generatePalette();
    });
});

// Clear Recent
document.getElementById('clearRecent').addEventListener('click', () => {
    recentColors = [];
    localStorage.removeItem('recentColors');
    renderRecentColors();
});

// ==================== IMAGE PICKER ====================

imageUploadArea.addEventListener('click', () => {
    if (!imageContainer.style.display || imageContainer.style.display === 'none') {
        imageInput.click();
    }
});

imageUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageUploadArea.classList.add('dragover');
});

imageUploadArea.addEventListener('dragleave', () => {
    imageUploadArea.classList.remove('dragover');
});

imageUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    imageUploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        loadImage(file);
    }
});

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        loadImage(file);
    }
});

function loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const ctx = imageCanvas.getContext('2d');
            const maxWidth = imageUploadArea.clientWidth - 4;
            const scale = Math.min(1, maxWidth / img.width);
            imageCanvas.width = img.width * scale;
            imageCanvas.height = img.height * scale;
            ctx.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);

            uploadPlaceholder.style.display = 'none';
            imageContainer.style.display = 'block';
            imageActions.style.display = 'block';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

imageCanvas.addEventListener('click', (e) => {
    const rect = imageCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (imageCanvas.width / rect.width);
    const y = (e.clientY - rect.top) * (imageCanvas.height / rect.height);

    const ctx = imageCanvas.getContext('2d');
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);

    setColorFromHex(hex);
    addToRecent(hex);
    showToast(`Picked ${hex}`);
});

imageCanvas.addEventListener('mousemove', (e) => {
    const rect = imageCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (imageCanvas.width / rect.width);
    const y = (e.clientY - rect.top) * (imageCanvas.height / rect.height);

    const ctx = imageCanvas.getContext('2d');
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);

    colorMagnifier.style.display = 'block';
    colorMagnifier.style.left = `${e.clientX - rect.left - 20}px`;
    colorMagnifier.style.top = `${e.clientY - rect.top - 20}px`;
    colorMagnifier.style.background = hex;
});

imageCanvas.addEventListener('mouseleave', () => {
    colorMagnifier.style.display = 'none';
});

clearImageBtn.addEventListener('click', () => {
    uploadPlaceholder.style.display = 'block';
    imageContainer.style.display = 'none';
    imageActions.style.display = 'none';
    imageInput.value = '';
});

// ==================== TOAST ====================

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// ==================== INITIALIZE ====================

function init() {
    // Start with cursor centered and calculate color from that position
    cursorX = 50;
    cursorY = 50;

    // Calculate color from center position
    const saturation = cursorX;
    const value = (1 - cursorY / 100) * 100;
    const l = value * (1 - saturation / 200);
    const s = l === 0 || l === 100 ? 0 : (value - l) / Math.min(l, 100 - l) * 100;

    currentColor.s = Math.round(Math.max(0, Math.min(100, s)));
    currentColor.l = Math.round(Math.max(0, Math.min(100, l)));

    updateAllDisplays();
    renderRecentColors();
}

init();
