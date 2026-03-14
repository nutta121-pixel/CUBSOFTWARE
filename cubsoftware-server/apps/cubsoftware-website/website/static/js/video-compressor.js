// Video Compressor JavaScript
// Uses FFmpeg.wasm for client-side video compression

// Elements
const uploadZone = document.getElementById('uploadZone');
const videoInput = document.getElementById('videoInput');
const uploadSection = document.getElementById('uploadSection');
const settingsSection = document.getElementById('settingsSection');
const progressSection = document.getElementById('progressSection');
const resultSection = document.getElementById('resultSection');
const videoPreview = document.getElementById('videoPreview');
const browserNotice = document.getElementById('browserNotice');

// Info elements
const fileNameEl = document.getElementById('fileName');
const originalSizeEl = document.getElementById('originalSize');
const durationEl = document.getElementById('duration');
const resolutionEl = document.getElementById('resolution');
const estimatedSizeEl = document.getElementById('estimatedSize');

// Settings elements
const qualityBtns = document.querySelectorAll('.quality-btn');
const outputFormat = document.getElementById('outputFormat');
const resolutionScale = document.getElementById('resolutionScale');
const scaleValue = document.getElementById('scaleValue');

// Action elements
const changeVideoBtn = document.getElementById('changeVideoBtn');
const compressBtn = document.getElementById('compressBtn');
const downloadBtn = document.getElementById('downloadBtn');
const newVideoBtn = document.getElementById('newVideoBtn');

// Progress elements
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const progressStatus = document.getElementById('progressStatus');

// Result elements
const resultOriginal = document.getElementById('resultOriginal');
const resultCompressed = document.getElementById('resultCompressed');
const resultSaved = document.getElementById('resultSaved');

// State
let currentFile = null;
let compressedBlob = null;
let currentQuality = 'medium';
let ffmpeg = null;

// Quality presets
const qualityPresets = {
    low: { crf: 35, preset: 'faster' },
    medium: { crf: 28, preset: 'medium' },
    high: { crf: 23, preset: 'slow' }
};

// Initialize
async function init() {
    // Check browser support
    if (!checkBrowserSupport()) {
        browserNotice.style.display = 'flex';
    }

    setupEventListeners();
}

// Check browser support
function checkBrowserSupport() {
    // Check for SharedArrayBuffer (required for FFmpeg.wasm)
    return typeof SharedArrayBuffer !== 'undefined';
}

// Setup event listeners
function setupEventListeners() {
    // Upload zone
    uploadZone.addEventListener('click', () => videoInput.click());
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    videoInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    // Quality buttons
    qualityBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            qualityBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentQuality = btn.dataset.quality;
            updateEstimate();
        });
    });

    // Resolution scale
    resolutionScale.addEventListener('input', () => {
        scaleValue.textContent = resolutionScale.value;
        updateEstimate();
    });

    outputFormat.addEventListener('change', updateEstimate);

    // Action buttons
    changeVideoBtn.addEventListener('click', () => {
        videoInput.click();
    });

    compressBtn.addEventListener('click', compressVideo);
    newVideoBtn.addEventListener('click', resetAll);
    downloadBtn.addEventListener('click', downloadCompressed);
}

// Handle file
function handleFile(file) {
    // Validate file
    if (!file.type.startsWith('video/')) {
        showToast('Please select a video file');
        return;
    }

    if (file.size > 500 * 1024 * 1024) {
        showToast('File size must be under 500MB');
        return;
    }

    currentFile = file;

    // Show video preview
    const url = URL.createObjectURL(file);
    videoPreview.src = url;

    // Update info
    fileNameEl.textContent = file.name;
    originalSizeEl.textContent = formatFileSize(file.size);

    // Get video metadata
    videoPreview.onloadedmetadata = () => {
        durationEl.textContent = formatDuration(videoPreview.duration);
        resolutionEl.textContent = `${videoPreview.videoWidth}x${videoPreview.videoHeight}`;
        updateEstimate();
    };

    // Show settings
    uploadSection.style.display = 'none';
    settingsSection.style.display = 'grid';
    resultSection.style.display = 'none';
}

// Update size estimate
function updateEstimate() {
    if (!currentFile) return;

    const scale = resolutionScale.value / 100;
    const qualityFactor = {
        low: 0.15,
        medium: 0.3,
        high: 0.5
    }[currentQuality];

    const estimated = currentFile.size * qualityFactor * scale * scale;
    estimatedSizeEl.textContent = '~' + formatFileSize(estimated);
}

// Compress video
async function compressVideo() {
    if (!currentFile) return;

    // Show progress
    settingsSection.style.display = 'none';
    progressSection.style.display = 'block';
    updateProgress(0, 'Loading FFmpeg...');

    try {
        // Load FFmpeg
        if (!ffmpeg) {
            const { createFFmpeg, fetchFile } = FFmpeg;
            ffmpeg = createFFmpeg({
                log: false,
                progress: ({ ratio }) => {
                    updateProgress(Math.round(ratio * 100), 'Compressing...');
                }
            });
        }

        if (!ffmpeg.isLoaded()) {
            await ffmpeg.load();
        }

        updateProgress(5, 'Processing video...');

        // Write input file
        const { fetchFile } = FFmpeg;
        ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(currentFile));

        // Build FFmpeg command
        const quality = qualityPresets[currentQuality];
        const scale = resolutionScale.value / 100;
        const format = outputFormat.value;

        let args = ['-i', 'input.mp4'];

        // Scale if needed
        if (scale < 1) {
            const newWidth = Math.round(videoPreview.videoWidth * scale);
            const newHeight = Math.round(videoPreview.videoHeight * scale);
            // Ensure even dimensions
            const evenWidth = newWidth - (newWidth % 2);
            const evenHeight = newHeight - (newHeight % 2);
            args.push('-vf', `scale=${evenWidth}:${evenHeight}`);
        }

        // Codec settings
        if (format === 'mp4') {
            args.push('-c:v', 'libx264', '-crf', quality.crf.toString(), '-preset', quality.preset);
            args.push('-c:a', 'aac', '-b:a', '128k');
        } else {
            args.push('-c:v', 'libvpx-vp9', '-crf', quality.crf.toString(), '-b:v', '0');
            args.push('-c:a', 'libopus', '-b:a', '128k');
        }

        args.push(`output.${format}`);

        // Run FFmpeg
        await ffmpeg.run(...args);

        // Get output
        const data = ffmpeg.FS('readFile', `output.${format}`);
        compressedBlob = new Blob([data.buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });

        // Clean up
        ffmpeg.FS('unlink', 'input.mp4');
        ffmpeg.FS('unlink', `output.${format}`);

        // Show results
        showResults();

    } catch (error) {
        console.error('Compression error:', error);
        showToast('Compression failed. Please try again.');
        resetAll();
    }
}

// Update progress
function updateProgress(percent, status) {
    progressFill.style.width = percent + '%';
    progressPercent.textContent = percent + '%';
    progressStatus.textContent = status;
}

// Show results
function showResults() {
    progressSection.style.display = 'none';
    resultSection.style.display = 'block';

    const originalSize = currentFile.size;
    const compressedSize = compressedBlob.size;
    const saved = originalSize - compressedSize;
    const savedPercent = Math.round((saved / originalSize) * 100);

    resultOriginal.textContent = formatFileSize(originalSize);
    resultCompressed.textContent = formatFileSize(compressedSize);
    resultSaved.textContent = `${formatFileSize(saved)} (${savedPercent}%)`;
}

// Download compressed video
function downloadCompressed() {
    if (!compressedBlob) return;

    const format = outputFormat.value;
    const originalName = currentFile.name.replace(/\.[^/.]+$/, '');
    const fileName = `${originalName}_compressed.${format}`;

    const url = URL.createObjectURL(compressedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Download started!');
}

// Reset all
function resetAll() {
    currentFile = null;
    compressedBlob = null;
    videoInput.value = '';
    videoPreview.src = '';

    uploadSection.style.display = 'block';
    settingsSection.style.display = 'none';
    progressSection.style.display = 'none';
    resultSection.style.display = 'none';

    progressFill.style.width = '0%';
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format duration
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
