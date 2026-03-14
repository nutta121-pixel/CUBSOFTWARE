// Image Editor JavaScript - Full Featured Version

// DOM Elements
const imageInput = document.getElementById('imageInput');
const uploadArea = document.getElementById('uploadArea');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const canvasContainer = document.getElementById('canvasContainer');
const canvasWrapper = document.getElementById('canvasWrapper');
const imageCanvas = document.getElementById('imageCanvas');
const ctx = imageCanvas.getContext('2d');
const drawCanvas = document.getElementById('drawCanvas');
const drawCtx = drawCanvas.getContext('2d');
const imageInfo = document.getElementById('imageInfo');
const imageDimensions = document.getElementById('imageDimensions');
const imageSize = document.getElementById('imageSize');
const editorActions = document.getElementById('editorActions');
const toast = document.getElementById('toast');

// Tool buttons
const cropBtn = document.getElementById('cropBtn');
const rotateLeftBtn = document.getElementById('rotateLeft');
const rotateRightBtn = document.getElementById('rotateRight');
const flipHBtn = document.getElementById('flipH');
const flipVBtn = document.getElementById('flipV');

// Crop elements
const cropOverlay = document.getElementById('cropOverlay');
const cropSelection = document.getElementById('cropSelection');
const cropActions = document.getElementById('cropActions');
const cropOptions = document.getElementById('cropOptions');
const applyCropBtn = document.getElementById('applyCrop');
const cancelCropBtn = document.getElementById('cancelCrop');
const aspectRatioBtns = document.querySelectorAll('.ratio-btn');

// Resize inputs
const resizeWidth = document.getElementById('resizeWidth');
const resizeHeight = document.getElementById('resizeHeight');
const maintainRatio = document.getElementById('maintainRatio');
const applyResizeBtn = document.getElementById('applyResize');

// Adjustment sliders
const brightnessSlider = document.getElementById('brightness');
const contrastSlider = document.getElementById('contrast');
const saturationSlider = document.getElementById('saturation');
const blurSlider = document.getElementById('blur');
const hueSlider = document.getElementById('hue');
const temperatureSlider = document.getElementById('temperature');
const sharpenSlider = document.getElementById('sharpen');
const vignetteSlider = document.getElementById('vignette');

// Adjustment value displays
const brightnessValue = document.getElementById('brightnessValue');
const contrastValue = document.getElementById('contrastValue');
const saturationValue = document.getElementById('saturationValue');
const blurValue = document.getElementById('blurValue');
const hueValue = document.getElementById('hueValue');
const temperatureValue = document.getElementById('temperatureValue');
const sharpenValue = document.getElementById('sharpenValue');
const vignetteValue = document.getElementById('vignetteValue');

// Text controls
const textInput = document.getElementById('textInput');
const fontFamily = document.getElementById('fontFamily');
const fontSize = document.getElementById('fontSize');
const boldBtn = document.getElementById('boldBtn');
const italicBtn = document.getElementById('italicBtn');
const underlineBtn = document.getElementById('underlineBtn');
const uppercaseBtn = document.getElementById('uppercaseBtn');
const textColor = document.getElementById('textColor');
const textStroke = document.getElementById('textStroke');
const textShadowColor = document.getElementById('textShadowColor');
const textBgColor = document.getElementById('textBgColor');
const textStrokeWidth = document.getElementById('textStrokeWidth');
const textShadowBlur = document.getElementById('textShadowBlur');
const textBgOpacity = document.getElementById('textBgOpacity');
const textRotation = document.getElementById('textRotation');
const textLetterSpacing = document.getElementById('textLetterSpacing');
const addTextBtn = document.getElementById('addTextBtn');
const applyTextBtn = document.getElementById('applyTextBtn');
const cancelTextBtn = document.getElementById('cancelTextBtn');
const textActions = document.getElementById('textActions');
const textHint = document.getElementById('textHint');
const textOverlay = document.getElementById('textOverlay');
const draggableText = document.getElementById('draggableText');

// Draw controls
const penTool = document.getElementById('penTool');
const lineTool = document.getElementById('lineTool');
const rectTool = document.getElementById('rectTool');
const circleTool = document.getElementById('circleTool');
const arrowTool = document.getElementById('arrowTool');
const drawColor = document.getElementById('drawColor');
const drawSize = document.getElementById('drawSize');
const clearDrawBtn = document.getElementById('clearDraw');
const applyDrawBtn = document.getElementById('applyDraw');

// Sticker elements
const stickerGrid = document.getElementById('stickerGrid');
const stickerSize = document.getElementById('stickerSize');
const stickerOverlay = document.getElementById('stickerOverlay');
const draggableSticker = document.getElementById('draggableSticker');
const applyStickerBtn = document.getElementById('applyStickerBtn');
const cancelStickerBtn = document.getElementById('cancelStickerBtn');
const stickerActions = document.getElementById('stickerActions');
const stickerHint = document.getElementById('stickerHint');

// Watermark controls
const watermarkText = document.getElementById('watermarkText');
const watermarkPosition = document.getElementById('watermarkPosition');
const watermarkOpacity = document.getElementById('watermarkOpacity');
const applyWatermarkBtn = document.getElementById('applyWatermark');

// Comparison controls
const comparisonToggle = document.getElementById('comparisonToggle');
const comparisonOverlay = document.getElementById('comparisonOverlay');
const comparisonSlider = document.getElementById('comparisonSlider');
const originalCanvas = document.getElementById('originalCanvas');
const originalCtx = originalCanvas ? originalCanvas.getContext('2d') : null;

// Download options
const downloadFormat = document.getElementById('downloadFormat');
const downloadQuality = document.getElementById('downloadQuality');
const qualityValue = document.getElementById('qualityValue');
const qualitySliderContainer = document.getElementById('qualitySliderContainer');

// Action buttons
const resetBtn = document.getElementById('resetAll');
const newImageBtn = document.getElementById('newImage');
const undoBtn = document.getElementById('undoBtn');
const downloadBtn = document.getElementById('downloadImage');

// Filter buttons
const filterBtns = document.querySelectorAll('.filter-btn');

// State
let originalImage = null;
let currentImage = null;
let aspectRatio = 1;
let history = [];
let currentFilter = 'none';

// Crop state
let isCropping = false;
let cropStart = { x: 0, y: 0 };
let cropEnd = { x: 0, y: 0 };
let isDragging = false;
let selectedAspectRatio = 'free';

// Adjustments state
let adjustments = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    blur: 0,
    hue: 0,
    temperature: 0,
    sharpen: 0,
    vignette: 0
};

// Text state
let textSettings = {
    bold: false,
    italic: false,
    underline: false,
    uppercase: false
};
let activeText = null;
let isTextDragging = false;
let textDragStart = { x: 0, y: 0 };
let textPosition = { x: 50, y: 50 }; // percentage position

// Draw state
let isDrawing = false;
let currentDrawTool = 'pen';
let drawStartPos = { x: 0, y: 0 };
let drawPath = [];
let completedDrawings = []; // Store completed shapes

// Comparison state
let isComparing = false;
let comparisonPosition = 50;

// Text objects for drag
let textObjects = [];
let selectedText = null;
let isDraggingText = false;
let textDragOffset = { x: 0, y: 0 };

// Sticker state
let activeSticker = null;
let isStickerDragging = false;
let stickerDragStart = { x: 0, y: 0 };
let stickerPosition = { x: 50, y: 50 };

// Tab elements
const sidebarTabs = document.querySelectorAll('.sidebar-tab');
const tabPanels = document.querySelectorAll('.tab-panel');

// Initialize
function init() {
    setupEventListeners();
    setupDrawCanvas();
    setupTabs();
}

// Setup tab navigation
function setupTabs() {
    sidebarTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Remove active from all tabs
            sidebarTabs.forEach(t => t.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));

            // Add active to clicked tab and panel
            tab.classList.add('active');
            const panel = document.getElementById(`panel-${targetTab}`);
            if (panel) {
                panel.classList.add('active');
            }
        });
    });
}

// Setup Draw Canvas
function setupDrawCanvas() {
    if (drawCanvas) {
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // File upload - only trigger on placeholder, not on canvas
    uploadArea.addEventListener('click', (e) => {
        // Only open file dialog if clicking on placeholder (no image loaded)
        if (!currentImage && !isCropping && !isDrawing) {
            imageInput.click();
        }
    });
    imageInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);

    // Crop tool
    cropBtn.addEventListener('click', toggleCropMode);
    applyCropBtn.addEventListener('click', applyCrop);
    cancelCropBtn.addEventListener('click', cancelCrop);

    // Aspect ratio buttons
    aspectRatioBtns.forEach(btn => {
        btn.addEventListener('click', () => selectAspectRatio(btn.dataset.ratio));
    });

    // Crop overlay events
    cropOverlay.addEventListener('mousedown', startCrop);
    cropOverlay.addEventListener('mousemove', updateCrop);
    cropOverlay.addEventListener('mouseup', endCrop);
    cropOverlay.addEventListener('mouseleave', endCrop);

    // Transform tools
    rotateLeftBtn.addEventListener('click', () => rotateImage(-90));
    rotateRightBtn.addEventListener('click', () => rotateImage(90));
    flipHBtn.addEventListener('click', () => flipImage('horizontal'));
    flipVBtn.addEventListener('click', () => flipImage('vertical'));

    // Resize
    resizeWidth.addEventListener('input', handleWidthChange);
    resizeHeight.addEventListener('input', handleHeightChange);
    applyResizeBtn.addEventListener('click', applyResize);

    // Adjustments
    brightnessSlider.addEventListener('input', updateAdjustments);
    contrastSlider.addEventListener('input', updateAdjustments);
    saturationSlider.addEventListener('input', updateAdjustments);
    blurSlider.addEventListener('input', updateAdjustments);
    if (hueSlider) hueSlider.addEventListener('input', updateAdjustments);
    if (temperatureSlider) temperatureSlider.addEventListener('input', updateAdjustments);
    if (sharpenSlider) sharpenSlider.addEventListener('input', updateAdjustments);
    if (vignetteSlider) vignetteSlider.addEventListener('input', updateAdjustments);

    // Filters
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
    });

    // Text controls
    if (boldBtn) boldBtn.addEventListener('click', toggleBold);
    if (italicBtn) italicBtn.addEventListener('click', toggleItalic);
    if (underlineBtn) underlineBtn.addEventListener('click', toggleUnderline);
    if (uppercaseBtn) uppercaseBtn.addEventListener('click', toggleUppercase);
    if (addTextBtn) addTextBtn.addEventListener('click', addText);
    if (applyTextBtn) applyTextBtn.addEventListener('click', applyText);
    if (cancelTextBtn) cancelTextBtn.addEventListener('click', cancelText);

    // Text slider value displays
    if (textStrokeWidth) textStrokeWidth.addEventListener('input', updateTextSliderValues);
    if (textShadowBlur) textShadowBlur.addEventListener('input', updateTextSliderValues);
    if (textBgOpacity) textBgOpacity.addEventListener('input', updateTextSliderValues);
    if (textRotation) textRotation.addEventListener('input', updateTextSliderValues);
    if (textLetterSpacing) textLetterSpacing.addEventListener('input', updateTextSliderValues);

    // Draggable text events
    if (draggableText) {
        draggableText.addEventListener('mousedown', startTextDrag);
        document.addEventListener('mousemove', dragText);
        document.addEventListener('mouseup', stopTextDrag);
    }

    // Draw tools
    if (penTool) penTool.addEventListener('click', () => selectDrawTool('pen'));
    if (lineTool) lineTool.addEventListener('click', () => selectDrawTool('line'));
    if (rectTool) rectTool.addEventListener('click', () => selectDrawTool('rect'));
    if (circleTool) circleTool.addEventListener('click', () => selectDrawTool('circle'));
    if (arrowTool) arrowTool.addEventListener('click', () => selectDrawTool('arrow'));
    if (clearDrawBtn) clearDrawBtn.addEventListener('click', clearDrawing);
    if (applyDrawBtn) applyDrawBtn.addEventListener('click', applyDrawing);

    // Draw canvas events
    if (drawCanvas) {
        drawCanvas.addEventListener('mousedown', startDrawing);
        drawCanvas.addEventListener('mousemove', draw);
        drawCanvas.addEventListener('mouseup', (e) => stopDrawing(e));
        drawCanvas.addEventListener('mouseleave', (e) => stopDrawing(e));
    }

    // Stickers
    if (stickerGrid) {
        const stickerBtns = stickerGrid.querySelectorAll('.sticker-btn');
        stickerBtns.forEach(btn => {
            btn.addEventListener('click', () => addSticker(btn.textContent.trim()));
        });
    }
    if (stickerSize) {
        stickerSize.addEventListener('input', () => {
            const val = document.getElementById('stickerSizeValue');
            if (val) val.textContent = stickerSize.value;
            // Update draggable sticker size if active
            if (activeSticker && draggableSticker) {
                draggableSticker.style.fontSize = `${stickerSize.value}px`;
                activeSticker.size = parseInt(stickerSize.value);
            }
        });
    }
    if (applyStickerBtn) applyStickerBtn.addEventListener('click', applySticker);
    if (cancelStickerBtn) cancelStickerBtn.addEventListener('click', cancelSticker);

    // Draggable sticker events
    if (draggableSticker) {
        draggableSticker.addEventListener('mousedown', startStickerDrag);
        document.addEventListener('mousemove', dragSticker);
        document.addEventListener('mouseup', stopStickerDrag);
    }

    // Watermark
    if (applyWatermarkBtn) applyWatermarkBtn.addEventListener('click', applyWatermark);

    // Comparison
    if (comparisonToggle) comparisonToggle.addEventListener('click', toggleComparison);
    if (comparisonSlider) {
        comparisonSlider.addEventListener('mousedown', startComparisonDrag);
        document.addEventListener('mousemove', updateComparisonDrag);
        document.addEventListener('mouseup', stopComparisonDrag);
    }

    // Download options
    if (downloadFormat) {
        downloadFormat.addEventListener('change', updateQualityVisibility);
    }
    if (downloadQuality) {
        downloadQuality.addEventListener('input', () => {
            if (qualityValue) qualityValue.textContent = downloadQuality.value;
        });
    }

    // Actions
    resetBtn.addEventListener('click', resetAll);
    newImageBtn.addEventListener('click', loadNewImage);
    undoBtn.addEventListener('click', undo);
    downloadBtn.addEventListener('click', downloadImage);
}

// Update quality slider visibility
function updateQualityVisibility() {
    if (qualitySliderContainer && downloadFormat) {
        const format = downloadFormat.value;
        qualitySliderContainer.style.display = (format === 'jpeg' || format === 'webp') ? 'block' : 'none';
    }
}

// Select aspect ratio for crop
function selectAspectRatio(ratio) {
    selectedAspectRatio = ratio;
    aspectRatioBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ratio === ratio);
    });
}

// Toggle crop mode
function toggleCropMode() {
    if (!currentImage) {
        showToast('Load an image first');
        return;
    }

    isCropping = !isCropping;
    cropBtn.classList.toggle('active', isCropping);

    if (isCropping) {
        cropOverlay.style.display = 'block';
        if (cropOptions) cropOptions.style.display = 'block';
        cropSelection.style.display = 'none';
        showToast('Click and drag to select crop area');
    } else {
        cropOverlay.style.display = 'none';
        if (cropOptions) cropOptions.style.display = 'none';
        cropSelection.style.display = 'none';
    }
}

// Start crop selection
function startCrop(e) {
    if (!isCropping) return;

    isDragging = true;
    const rect = cropOverlay.getBoundingClientRect();
    cropStart.x = e.clientX - rect.left;
    cropStart.y = e.clientY - rect.top;
    cropEnd.x = cropStart.x;
    cropEnd.y = cropStart.y;

    cropSelection.style.display = 'block';
    updateCropSelection();
}

// Update crop selection while dragging
function updateCrop(e) {
    if (!isDragging || !isCropping) return;

    const rect = cropOverlay.getBoundingClientRect();
    let newX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    let newY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    // Apply aspect ratio constraint
    if (selectedAspectRatio !== 'free') {
        const ratioMap = {
            '1:1': 1,
            '4:3': 4/3,
            '3:4': 3/4,
            '16:9': 16/9,
            '9:16': 9/16,
            '3:2': 3/2,
            '2:3': 2/3
        };
        const targetRatio = ratioMap[selectedAspectRatio];
        if (targetRatio) {
            const width = Math.abs(newX - cropStart.x);
            const height = Math.abs(newY - cropStart.y);
            const currentRatio = width / height;

            if (currentRatio > targetRatio) {
                // Width is too large, adjust based on height
                const adjustedWidth = height * targetRatio;
                newX = cropStart.x + (newX > cropStart.x ? adjustedWidth : -adjustedWidth);
            } else {
                // Height is too large, adjust based on width
                const adjustedHeight = width / targetRatio;
                newY = cropStart.y + (newY > cropStart.y ? adjustedHeight : -adjustedHeight);
            }
        }
    }

    cropEnd.x = newX;
    cropEnd.y = newY;

    updateCropSelection();
}

// End crop selection
function endCrop() {
    isDragging = false;
}

// Update crop selection box display
function updateCropSelection() {
    const left = Math.min(cropStart.x, cropEnd.x);
    const top = Math.min(cropStart.y, cropEnd.y);
    const width = Math.abs(cropEnd.x - cropStart.x);
    const height = Math.abs(cropEnd.y - cropStart.y);

    cropSelection.style.left = `${left}px`;
    cropSelection.style.top = `${top}px`;
    cropSelection.style.width = `${width}px`;
    cropSelection.style.height = `${height}px`;
}

// Apply crop
function applyCrop() {
    const selectionWidth = Math.abs(cropEnd.x - cropStart.x);
    const selectionHeight = Math.abs(cropEnd.y - cropStart.y);

    if (selectionWidth < 10 || selectionHeight < 10) {
        showToast('Selection too small');
        return;
    }

    saveToHistory();

    // Get the scale factor between displayed canvas and actual canvas
    const displayedWidth = imageCanvas.offsetWidth;
    const displayedHeight = imageCanvas.offsetHeight;
    const scaleX = imageCanvas.width / displayedWidth;
    const scaleY = imageCanvas.height / displayedHeight;

    // Calculate actual crop coordinates
    const left = Math.min(cropStart.x, cropEnd.x) * scaleX;
    const top = Math.min(cropStart.y, cropEnd.y) * scaleY;
    const width = selectionWidth * scaleX;
    const height = selectionHeight * scaleY;

    // Get cropped image data
    const imageData = ctx.getImageData(left, top, width, height);

    // Create temp canvas with cropped size
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);

    // Update main canvas
    imageCanvas.width = width;
    imageCanvas.height = height;
    ctx.drawImage(tempCanvas, 0, 0);

    // Update draw canvas
    if (drawCanvas) {
        drawCanvas.width = width;
        drawCanvas.height = height;
        clearDrawing();
    }

    // Update aspect ratio and resize inputs
    aspectRatio = width / height;
    resizeWidth.value = Math.round(width);
    resizeHeight.value = Math.round(height);
    updateImageInfo(Math.round(width), Math.round(height));

    // Exit crop mode
    cancelCrop();
    showToast('Cropped');
}

// Cancel crop
function cancelCrop() {
    isCropping = false;
    isDragging = false;
    cropBtn.classList.remove('active');
    cropOverlay.style.display = 'none';
    if (cropOptions) cropOptions.style.display = 'none';
    cropSelection.style.display = 'none';
}

// Handle file selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        loadImage(file);
    }
}

// Handle drag over
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('dragover');
}

// Handle drag leave
function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
}

// Handle drop
function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        loadImage(file);
    } else {
        showToast('Please drop an image file');
    }
}

// Load image
function loadImage(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            currentImage = img;
            aspectRatio = img.width / img.height;

            // Update canvas
            imageCanvas.width = img.width;
            imageCanvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            // Update draw canvas
            if (drawCanvas) {
                drawCanvas.width = img.width;
                drawCanvas.height = img.height;
                clearDrawing();
            }

            // Update original canvas for comparison
            if (originalCanvas) {
                originalCanvas.width = img.width;
                originalCanvas.height = img.height;
                originalCtx.drawImage(img, 0, 0);
            }

            // Update UI
            uploadPlaceholder.style.display = 'none';
            canvasContainer.style.display = 'flex';
            imageInfo.style.display = 'flex';
            editorActions.style.display = 'flex';

            // Show comparison toggle
            const comparisonContainer = document.getElementById('comparisonContainer');
            if (comparisonContainer) comparisonContainer.style.display = 'block';

            // Update dimensions
            updateImageInfo(img.width, img.height, file.size);

            // Update resize inputs
            resizeWidth.value = img.width;
            resizeHeight.value = img.height;

            // Reset adjustments
            resetAdjustments();

            // Clear text and sticker objects
            textObjects = [];
            stickerObjects = [];

            // Clear history and save initial state
            history = [];
            saveToHistory();

            showToast('Image loaded');
        };
        img.src = e.target.result;
    };

    reader.readAsDataURL(file);
}

// Update image info
function updateImageInfo(width, height, size) {
    imageDimensions.textContent = `${width} x ${height}`;
    if (size) {
        const sizeKB = (size / 1024).toFixed(1);
        imageSize.textContent = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
    }
}

// Save current state to history
function saveToHistory() {
    const imageData = imageCanvas.toDataURL();
    history.push({
        imageData,
        width: imageCanvas.width,
        height: imageCanvas.height,
        adjustments: { ...adjustments },
        filter: currentFilter
    });

    // Limit history to 20 states
    if (history.length > 20) {
        history.shift();
    }
}

// Undo
function undo() {
    if (history.length <= 1) {
        showToast('Nothing to undo');
        return;
    }

    history.pop(); // Remove current state
    const previousState = history[history.length - 1];

    const img = new Image();
    img.onload = () => {
        imageCanvas.width = previousState.width;
        imageCanvas.height = previousState.height;
        ctx.drawImage(img, 0, 0);

        // Update draw canvas
        if (drawCanvas) {
            drawCanvas.width = previousState.width;
            drawCanvas.height = previousState.height;
            clearDrawing();
        }

        // Restore adjustments
        adjustments = { ...previousState.adjustments };
        currentFilter = previousState.filter;

        // Update sliders
        brightnessSlider.value = adjustments.brightness;
        contrastSlider.value = adjustments.contrast;
        saturationSlider.value = adjustments.saturation;
        blurSlider.value = adjustments.blur;
        if (hueSlider) hueSlider.value = adjustments.hue;
        if (temperatureSlider) temperatureSlider.value = adjustments.temperature;
        if (sharpenSlider) sharpenSlider.value = adjustments.sharpen;
        if (vignetteSlider) vignetteSlider.value = adjustments.vignette;
        updateSliderValues();

        // Update filter buttons
        filterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === currentFilter);
        });

        // Update resize inputs
        resizeWidth.value = previousState.width;
        resizeHeight.value = previousState.height;

        updateImageInfo(previousState.width, previousState.height);
        showToast('Undone');
    };
    img.src = previousState.imageData;
}

// Rotate image
function rotateImage(degrees) {
    if (!currentImage) return;

    saveToHistory();

    const radians = degrees * Math.PI / 180;
    const sin = Math.abs(Math.sin(radians));
    const cos = Math.abs(Math.cos(radians));

    const oldWidth = imageCanvas.width;
    const oldHeight = imageCanvas.height;
    const newWidth = Math.round(oldWidth * cos + oldHeight * sin);
    const newHeight = Math.round(oldWidth * sin + oldHeight * cos);

    // Get current image data
    const imageData = ctx.getImageData(0, 0, oldWidth, oldHeight);

    // Create temp canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = oldWidth;
    tempCanvas.height = oldHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);

    // Resize main canvas
    imageCanvas.width = newWidth;
    imageCanvas.height = newHeight;

    // Draw rotated image
    ctx.save();
    ctx.translate(newWidth / 2, newHeight / 2);
    ctx.rotate(radians);
    ctx.drawImage(tempCanvas, -oldWidth / 2, -oldHeight / 2);
    ctx.restore();

    // Update draw canvas
    if (drawCanvas) {
        drawCanvas.width = newWidth;
        drawCanvas.height = newHeight;
        clearDrawing();
    }

    // Update aspect ratio
    aspectRatio = newWidth / newHeight;
    resizeWidth.value = newWidth;
    resizeHeight.value = newHeight;
    updateImageInfo(newWidth, newHeight);

    showToast(`Rotated ${degrees > 0 ? 'right' : 'left'}`);
}

// Flip image
function flipImage(direction) {
    if (!currentImage) return;

    saveToHistory();

    const width = imageCanvas.width;
    const height = imageCanvas.height;

    // Get current image data
    const imageData = ctx.getImageData(0, 0, width, height);

    // Create temp canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);

    // Clear and flip
    ctx.clearRect(0, 0, width, height);
    ctx.save();

    if (direction === 'horizontal') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
    } else {
        ctx.translate(0, height);
        ctx.scale(1, -1);
    }

    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();

    showToast(`Flipped ${direction}`);
}

// Handle width change
function handleWidthChange() {
    if (maintainRatio.checked && resizeWidth.value) {
        resizeHeight.value = Math.round(resizeWidth.value / aspectRatio);
    }
}

// Handle height change
function handleHeightChange() {
    if (maintainRatio.checked && resizeHeight.value) {
        resizeWidth.value = Math.round(resizeHeight.value * aspectRatio);
    }
}

// Apply resize
function applyResize() {
    if (!currentImage) return;

    const newWidth = parseInt(resizeWidth.value);
    const newHeight = parseInt(resizeHeight.value);

    if (!newWidth || !newHeight || newWidth < 1 || newHeight < 1) {
        showToast('Invalid dimensions');
        return;
    }

    if (newWidth > 4000 || newHeight > 4000) {
        showToast('Maximum size is 4000px');
        return;
    }

    saveToHistory();

    // Get current image
    const imageData = ctx.getImageData(0, 0, imageCanvas.width, imageCanvas.height);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageCanvas.width;
    tempCanvas.height = imageCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);

    // Resize canvas
    imageCanvas.width = newWidth;
    imageCanvas.height = newHeight;

    // Draw resized image
    ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);

    // Update draw canvas
    if (drawCanvas) {
        drawCanvas.width = newWidth;
        drawCanvas.height = newHeight;
        clearDrawing();
    }

    // Update aspect ratio
    aspectRatio = newWidth / newHeight;
    updateImageInfo(newWidth, newHeight);

    showToast('Resized');
}

// Update adjustments
function updateAdjustments() {
    if (!currentImage) return;

    adjustments.brightness = parseInt(brightnessSlider.value);
    adjustments.contrast = parseInt(contrastSlider.value);
    adjustments.saturation = parseInt(saturationSlider.value);
    adjustments.blur = parseInt(blurSlider.value);
    if (hueSlider) adjustments.hue = parseInt(hueSlider.value);
    if (temperatureSlider) adjustments.temperature = parseInt(temperatureSlider.value);
    if (sharpenSlider) adjustments.sharpen = parseInt(sharpenSlider.value);
    if (vignetteSlider) adjustments.vignette = parseInt(vignetteSlider.value);

    updateSliderValues();
    applyAdjustmentsAndFilter();
}

// Update slider value displays
function updateSliderValues() {
    brightnessValue.textContent = adjustments.brightness;
    contrastValue.textContent = adjustments.contrast;
    saturationValue.textContent = adjustments.saturation;
    blurValue.textContent = adjustments.blur;
    if (hueValue) hueValue.textContent = adjustments.hue;
    if (temperatureValue) temperatureValue.textContent = adjustments.temperature;
    if (sharpenValue) sharpenValue.textContent = adjustments.sharpen;
    if (vignetteValue) vignetteValue.textContent = adjustments.vignette;
}

// Apply adjustments and filter to canvas
function applyAdjustmentsAndFilter() {
    // Get the last saved state from history (before adjustments)
    if (history.length === 0) return;

    const baseState = history[history.length - 1];

    const img = new Image();
    img.onload = () => {
        imageCanvas.width = baseState.width;
        imageCanvas.height = baseState.height;

        // Build filter string
        let filterString = '';

        // Brightness: -100 to 100 -> 0 to 200%
        const brightness = 100 + adjustments.brightness;
        filterString += `brightness(${brightness}%) `;

        // Contrast: -100 to 100 -> 0 to 200%
        const contrast = 100 + adjustments.contrast;
        filterString += `contrast(${contrast}%) `;

        // Saturation: -100 to 100 -> 0 to 200%
        const saturation = 100 + adjustments.saturation;
        filterString += `saturate(${saturation}%) `;

        // Hue rotation
        if (adjustments.hue !== 0) {
            filterString += `hue-rotate(${adjustments.hue}deg) `;
        }

        // Blur
        if (adjustments.blur > 0) {
            filterString += `blur(${adjustments.blur}px) `;
        }

        // Add preset filter
        filterString += getFilterString(currentFilter);

        ctx.filter = filterString.trim() || 'none';
        ctx.drawImage(img, 0, 0);
        ctx.filter = 'none';

        // Apply temperature (sepia tint for warm, invert + hue for cold)
        if (adjustments.temperature !== 0) {
            applyTemperature();
        }

        // Apply sharpen
        if (adjustments.sharpen > 0) {
            applySharpen();
        }

        // Apply vignette
        if (adjustments.vignette > 0) {
            applyVignette();
        }
    };
    img.src = baseState.imageData;
}

// Get filter string for preset filters
function getFilterString(filter) {
    switch (filter) {
        case 'grayscale':
            return 'grayscale(100%) ';
        case 'sepia':
            return 'sepia(100%) ';
        case 'invert':
            return 'invert(100%) ';
        case 'vintage':
            return 'sepia(50%) contrast(90%) brightness(90%) ';
        case 'cold':
            return 'saturate(80%) hue-rotate(180deg) ';
        case 'warm':
            return 'saturate(120%) hue-rotate(-10deg) ';
        case 'dramatic':
            return 'contrast(150%) saturate(120%) ';
        case 'polaroid':
            return 'sepia(30%) contrast(110%) brightness(110%) saturate(130%) ';
        case 'lomo':
            return 'contrast(150%) saturate(130%) ';
        case 'nashville':
            return 'sepia(25%) contrast(110%) brightness(110%) saturate(120%) hue-rotate(-15deg) ';
        case 'toaster':
            return 'sepia(40%) contrast(130%) brightness(90%) saturate(150%) ';
        case 'xpro':
            return 'contrast(130%) saturate(140%) sepia(20%) ';
        case 'willow':
            return 'grayscale(50%) contrast(95%) brightness(105%) ';
        case 'clarendon':
            return 'contrast(120%) saturate(125%) ';
        case 'moon':
            return 'grayscale(100%) contrast(110%) brightness(110%) ';
        default:
            return '';
    }
}

// Apply temperature adjustment
function applyTemperature() {
    const imageData = ctx.getImageData(0, 0, imageCanvas.width, imageCanvas.height);
    const data = imageData.data;
    const temp = adjustments.temperature;

    for (let i = 0; i < data.length; i += 4) {
        if (temp > 0) {
            // Warm - increase red, decrease blue
            data[i] = Math.min(255, data[i] + temp * 0.5);
            data[i + 2] = Math.max(0, data[i + 2] - temp * 0.3);
        } else {
            // Cold - increase blue, decrease red
            data[i] = Math.max(0, data[i] + temp * 0.3);
            data[i + 2] = Math.min(255, data[i + 2] - temp * 0.5);
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

// Apply sharpen using convolution
function applySharpen() {
    const strength = adjustments.sharpen / 100;
    const imageData = ctx.getImageData(0, 0, imageCanvas.width, imageCanvas.height);
    const data = imageData.data;
    const width = imageCanvas.width;
    const height = imageCanvas.height;

    // Create a copy for convolution
    const copy = new Uint8ClampedArray(data);

    // Sharpen kernel
    const kernel = [
        0, -strength, 0,
        -strength, 1 + 4 * strength, -strength,
        0, -strength, 0
    ];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                        sum += copy[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
                    }
                }
                const idx = (y * width + x) * 4 + c;
                data[idx] = Math.max(0, Math.min(255, sum));
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

// Apply vignette effect
function applyVignette() {
    const strength = adjustments.vignette / 100;
    const width = imageCanvas.width;
    const height = imageCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.sqrt(centerX * centerX + centerY * centerY);

    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${strength})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}

// Apply filter
function applyFilter(filter) {
    if (!currentImage) return;

    currentFilter = filter;

    // Update button states
    filterBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    applyAdjustmentsAndFilter();
    showToast(`Filter: ${filter}`);
}

// Toggle bold text
function toggleBold() {
    textSettings.bold = !textSettings.bold;
    boldBtn.classList.toggle('active', textSettings.bold);
}

// Toggle italic text
function toggleItalic() {
    textSettings.italic = !textSettings.italic;
    italicBtn.classList.toggle('active', textSettings.italic);
}

// Toggle underline text
function toggleUnderline() {
    textSettings.underline = !textSettings.underline;
    if (underlineBtn) underlineBtn.classList.toggle('active', textSettings.underline);
}

// Toggle uppercase text
function toggleUppercase() {
    textSettings.uppercase = !textSettings.uppercase;
    if (uppercaseBtn) uppercaseBtn.classList.toggle('active', textSettings.uppercase);
}

// Update text slider value displays
function updateTextSliderValues() {
    if (textStrokeWidth) {
        const val = document.getElementById('strokeWidthValue');
        if (val) val.textContent = textStrokeWidth.value;
    }
    if (textShadowBlur) {
        const val = document.getElementById('shadowBlurValue');
        if (val) val.textContent = textShadowBlur.value;
    }
    if (textBgOpacity) {
        const val = document.getElementById('bgOpacityValue');
        if (val) val.textContent = textBgOpacity.value;
    }
    if (textRotation) {
        const val = document.getElementById('textRotationValue');
        if (val) val.textContent = textRotation.value;
    }
    if (textLetterSpacing) {
        const val = document.getElementById('letterSpacingValue');
        if (val) val.textContent = textLetterSpacing.value;
    }
}

// Add text - show draggable preview
function addText() {
    if (!currentImage) {
        showToast('Load an image first');
        return;
    }

    let text = textInput.value.trim();
    if (!text) {
        showToast('Enter some text');
        return;
    }

    // Apply uppercase if enabled
    if (textSettings.uppercase) {
        text = text.toUpperCase();
    }

    // Store text settings
    const font = fontFamily.value;
    const size = parseInt(fontSize.value) || 32;
    const color = textColor.value;
    const stroke = textStroke.value;
    const strokeWidth = textStrokeWidth ? parseInt(textStrokeWidth.value) : 2;
    const shadowColor = textShadowColor ? textShadowColor.value : '#000000';
    const shadowBlur = textShadowBlur ? parseInt(textShadowBlur.value) : 0;
    const bgColor = textBgColor ? textBgColor.value : '#000000';
    const bgOpacity = textBgOpacity ? parseInt(textBgOpacity.value) / 100 : 0;
    const rotation = textRotation ? parseInt(textRotation.value) : 0;
    const letterSpacing = textLetterSpacing ? parseInt(textLetterSpacing.value) : 0;

    activeText = {
        text,
        font,
        size,
        color,
        stroke,
        strokeWidth,
        shadowColor,
        shadowBlur,
        bgColor,
        bgOpacity,
        rotation,
        letterSpacing,
        bold: textSettings.bold,
        italic: textSettings.italic,
        underline: textSettings.underline
    };

    // Reset position to center
    textPosition = { x: 50, y: 50 };

    // Style the draggable text
    if (draggableText) {
        draggableText.textContent = text;
        draggableText.style.fontFamily = font;
        draggableText.style.fontSize = `${size}px`;
        draggableText.style.color = color;
        draggableText.style.fontWeight = textSettings.bold ? 'bold' : 'normal';
        draggableText.style.fontStyle = textSettings.italic ? 'italic' : 'normal';
        draggableText.style.textDecoration = textSettings.underline ? 'underline' : 'none';
        draggableText.style.webkitTextStroke = `${strokeWidth}px ${stroke}`;
        draggableText.style.textShadow = shadowBlur > 0 ? `${shadowBlur}px ${shadowBlur}px ${shadowBlur}px ${shadowColor}` : 'none';
        draggableText.style.letterSpacing = `${letterSpacing}px`;
        draggableText.style.left = '50%';
        draggableText.style.top = '50%';
        draggableText.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;

        // Background
        if (bgOpacity > 0) {
            const r = parseInt(bgColor.slice(1,3), 16);
            const g = parseInt(bgColor.slice(3,5), 16);
            const b = parseInt(bgColor.slice(5,7), 16);
            draggableText.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;
            draggableText.style.padding = '10px 15px';
        } else {
            draggableText.style.backgroundColor = 'transparent';
            draggableText.style.padding = '5px 10px';
        }
    }

    // Show overlay and controls
    if (textOverlay) textOverlay.style.display = 'block';
    if (textActions) textActions.style.display = 'flex';
    if (textHint) textHint.style.display = 'block';
    if (addTextBtn) addTextBtn.style.display = 'none';

    showToast('Drag text to position');
}

// Start dragging text
function startTextDrag(e) {
    if (!activeText) return;
    isTextDragging = true;
    const rect = draggableText.getBoundingClientRect();
    textDragStart.x = e.clientX - rect.left - rect.width / 2;
    textDragStart.y = e.clientY - rect.top - rect.height / 2;
    draggableText.style.cursor = 'grabbing';
}

// Drag text
function dragText(e) {
    if (!isTextDragging || !activeText || !textOverlay) return;

    const overlayRect = textOverlay.getBoundingClientRect();
    let x = e.clientX - overlayRect.left - textDragStart.x;
    let y = e.clientY - overlayRect.top - textDragStart.y;

    // Convert to percentage
    textPosition.x = (x / overlayRect.width) * 100;
    textPosition.y = (y / overlayRect.height) * 100;

    // Clamp to bounds
    textPosition.x = Math.max(5, Math.min(95, textPosition.x));
    textPosition.y = Math.max(5, Math.min(95, textPosition.y));

    draggableText.style.left = `${textPosition.x}%`;
    draggableText.style.top = `${textPosition.y}%`;
    draggableText.style.transform = `translate(-50%, -50%) rotate(${activeText.rotation}deg)`;
}

// Stop dragging text
function stopTextDrag() {
    isTextDragging = false;
    if (draggableText) draggableText.style.cursor = 'move';
}

// Apply text to canvas
function applyText() {
    if (!activeText || !currentImage) return;

    saveToHistory();

    const bold = activeText.bold ? 'bold ' : '';
    const italic = activeText.italic ? 'italic ' : '';

    // Calculate position based on percentage
    const x = (textPosition.x / 100) * imageCanvas.width;
    const y = (textPosition.y / 100) * imageCanvas.height;

    ctx.save();

    // Move to position and rotate
    ctx.translate(x, y);
    if (activeText.rotation !== 0) {
        ctx.rotate(activeText.rotation * Math.PI / 180);
    }

    // Set font
    ctx.font = `${italic}${bold}${activeText.size}px ${activeText.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Measure text for background
    const metrics = ctx.measureText(activeText.text);
    const textWidth = metrics.width;
    const textHeight = activeText.size;

    // Draw background if opacity > 0
    if (activeText.bgOpacity > 0) {
        const r = parseInt(activeText.bgColor.slice(1,3), 16);
        const g = parseInt(activeText.bgColor.slice(3,5), 16);
        const b = parseInt(activeText.bgColor.slice(5,7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${activeText.bgOpacity})`;
        const padding = 10;
        ctx.fillRect(-textWidth/2 - padding, -textHeight/2 - padding/2, textWidth + padding*2, textHeight + padding);
    }

    // Set shadow
    if (activeText.shadowBlur > 0) {
        ctx.shadowColor = activeText.shadowColor;
        ctx.shadowBlur = activeText.shadowBlur;
        ctx.shadowOffsetX = activeText.shadowBlur / 2;
        ctx.shadowOffsetY = activeText.shadowBlur / 2;
    }

    // Draw text with letter spacing if needed
    if (activeText.letterSpacing !== 0) {
        drawTextWithSpacing(activeText.text, 0, 0, activeText.letterSpacing, activeText.stroke, activeText.strokeWidth, activeText.color);
    } else {
        // Draw stroke
        if (activeText.strokeWidth > 0) {
            ctx.strokeStyle = activeText.stroke;
            ctx.lineWidth = activeText.strokeWidth;
            ctx.strokeText(activeText.text, 0, 0);
        }

        // Draw fill
        ctx.fillStyle = activeText.color;
        ctx.fillText(activeText.text, 0, 0);
    }

    // Draw underline if enabled
    if (activeText.underline) {
        ctx.strokeStyle = activeText.color;
        ctx.lineWidth = Math.max(1, activeText.size / 20);
        ctx.beginPath();
        ctx.moveTo(-textWidth/2, textHeight/3);
        ctx.lineTo(textWidth/2, textHeight/3);
        ctx.stroke();
    }

    ctx.restore();

    // Hide overlay and reset
    cancelText();
    showToast('Text applied');
}

// Draw text with letter spacing
function drawTextWithSpacing(text, x, y, spacing, strokeColor, strokeWidth, fillColor) {
    const chars = text.split('');
    let currentX = x - ctx.measureText(text).width / 2 - (spacing * (chars.length - 1)) / 2;

    chars.forEach((char, i) => {
        if (strokeWidth > 0) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeWidth;
            ctx.strokeText(char, currentX, y);
        }
        ctx.fillStyle = fillColor;
        ctx.fillText(char, currentX, y);
        currentX += ctx.measureText(char).width + spacing;
    });
}

// Cancel text
function cancelText() {
    activeText = null;
    if (textOverlay) textOverlay.style.display = 'none';
    if (textActions) textActions.style.display = 'none';
    if (textHint) textHint.style.display = 'none';
    if (addTextBtn) addTextBtn.style.display = 'block';

    // Reset draggable text styles
    if (draggableText) {
        draggableText.style.transform = 'translate(-50%, -50%)';
        draggableText.style.backgroundColor = 'transparent';
    }
}

// Select draw tool
function selectDrawTool(tool) {
    currentDrawTool = tool;
    const toolBtns = [penTool, lineTool, rectTool, circleTool, arrowTool];
    toolBtns.forEach(btn => {
        if (btn) btn.classList.remove('active');
    });

    switch (tool) {
        case 'pen': if (penTool) penTool.classList.add('active'); break;
        case 'line': if (lineTool) lineTool.classList.add('active'); break;
        case 'rect': if (rectTool) rectTool.classList.add('active'); break;
        case 'circle': if (circleTool) circleTool.classList.add('active'); break;
        case 'arrow': if (arrowTool) arrowTool.classList.add('active'); break;
    }

    // Enable drawing canvas
    if (drawCanvas) {
        drawCanvas.classList.add('active');
    }
}

// Start drawing
function startDrawing(e) {
    if (!currentImage) return;

    isDrawing = true;
    const rect = drawCanvas.getBoundingClientRect();
    const scaleX = drawCanvas.width / rect.width;
    const scaleY = drawCanvas.height / rect.height;

    drawStartPos.x = (e.clientX - rect.left) * scaleX;
    drawStartPos.y = (e.clientY - rect.top) * scaleY;

    const color = drawColor ? drawColor.value : '#ff0000';
    const size = drawSize ? parseInt(drawSize.value) : 5;

    if (currentDrawTool === 'pen') {
        drawPath = [{ x: drawStartPos.x, y: drawStartPos.y }];
        drawCtx.strokeStyle = color;
        drawCtx.lineWidth = size;
        drawCtx.beginPath();
        drawCtx.moveTo(drawStartPos.x, drawStartPos.y);
    }
}

// Draw
function draw(e) {
    if (!isDrawing || !currentImage) return;

    const rect = drawCanvas.getBoundingClientRect();
    const scaleX = drawCanvas.width / rect.width;
    const scaleY = drawCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const color = drawColor ? drawColor.value : '#ff0000';
    const size = drawSize ? parseInt(drawSize.value) : 5;

    if (currentDrawTool === 'pen') {
        drawPath.push({ x, y });
        drawCtx.lineTo(x, y);
        drawCtx.stroke();
    } else {
        // For shapes, redraw completed shapes plus the current preview
        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

        // Redraw all completed drawings
        redrawCompletedDrawings();

        // Draw current shape preview
        drawCtx.strokeStyle = color;
        drawCtx.lineWidth = size;
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';

        switch (currentDrawTool) {
            case 'line':
                drawCtx.beginPath();
                drawCtx.moveTo(drawStartPos.x, drawStartPos.y);
                drawCtx.lineTo(x, y);
                drawCtx.stroke();
                break;

            case 'rect':
                drawCtx.strokeRect(
                    Math.min(drawStartPos.x, x),
                    Math.min(drawStartPos.y, y),
                    Math.abs(x - drawStartPos.x),
                    Math.abs(y - drawStartPos.y)
                );
                break;

            case 'circle':
                const radiusX = Math.abs(x - drawStartPos.x) / 2;
                const radiusY = Math.abs(y - drawStartPos.y) / 2;
                const centerX = (drawStartPos.x + x) / 2;
                const centerY = (drawStartPos.y + y) / 2;
                drawCtx.beginPath();
                drawCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
                drawCtx.stroke();
                break;

            case 'arrow':
                drawArrow(drawStartPos.x, drawStartPos.y, x, y, color, size);
                break;
        }
    }
}

// Draw arrow
function drawArrow(fromX, fromY, toX, toY, color, size) {
    const headLength = Math.max(15, size * 3);
    const angle = Math.atan2(toY - fromY, toX - fromX);

    if (color) drawCtx.strokeStyle = color;
    if (size) drawCtx.lineWidth = size;

    drawCtx.beginPath();
    drawCtx.moveTo(fromX, fromY);
    drawCtx.lineTo(toX, toY);
    drawCtx.stroke();

    // Arrow head
    drawCtx.beginPath();
    drawCtx.moveTo(toX, toY);
    drawCtx.lineTo(
        toX - headLength * Math.cos(angle - Math.PI / 6),
        toY - headLength * Math.sin(angle - Math.PI / 6)
    );
    drawCtx.moveTo(toX, toY);
    drawCtx.lineTo(
        toX - headLength * Math.cos(angle + Math.PI / 6),
        toY - headLength * Math.sin(angle + Math.PI / 6)
    );
    drawCtx.stroke();
}

// Stop drawing - save the completed shape
function stopDrawing(e) {
    if (!isDrawing) return;

    const rect = drawCanvas.getBoundingClientRect();
    const scaleX = drawCanvas.width / rect.width;
    const scaleY = drawCanvas.height / rect.height;
    const endX = e ? (e.clientX - rect.left) * scaleX : drawStartPos.x;
    const endY = e ? (e.clientY - rect.top) * scaleY : drawStartPos.y;

    const color = drawColor ? drawColor.value : '#ff0000';
    const size = drawSize ? parseInt(drawSize.value) : 5;

    // Save the completed drawing
    if (currentDrawTool === 'pen' && drawPath.length > 1) {
        completedDrawings.push({
            type: 'pen',
            path: [...drawPath],
            color,
            size
        });
    } else if (currentDrawTool !== 'pen') {
        // Only save if there's actual movement
        if (Math.abs(endX - drawStartPos.x) > 2 || Math.abs(endY - drawStartPos.y) > 2) {
            completedDrawings.push({
                type: currentDrawTool,
                startX: drawStartPos.x,
                startY: drawStartPos.y,
                endX,
                endY,
                color,
                size
            });
        }
    }

    isDrawing = false;
    drawPath = [];
}

// Redraw all completed drawings
function redrawCompletedDrawings() {
    completedDrawings.forEach(drawing => {
        drawCtx.strokeStyle = drawing.color;
        drawCtx.lineWidth = drawing.size;
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';

        switch (drawing.type) {
            case 'pen':
                if (drawing.path.length > 1) {
                    drawCtx.beginPath();
                    drawCtx.moveTo(drawing.path[0].x, drawing.path[0].y);
                    for (let i = 1; i < drawing.path.length; i++) {
                        drawCtx.lineTo(drawing.path[i].x, drawing.path[i].y);
                    }
                    drawCtx.stroke();
                }
                break;

            case 'line':
                drawCtx.beginPath();
                drawCtx.moveTo(drawing.startX, drawing.startY);
                drawCtx.lineTo(drawing.endX, drawing.endY);
                drawCtx.stroke();
                break;

            case 'rect':
                drawCtx.strokeRect(
                    Math.min(drawing.startX, drawing.endX),
                    Math.min(drawing.startY, drawing.endY),
                    Math.abs(drawing.endX - drawing.startX),
                    Math.abs(drawing.endY - drawing.startY)
                );
                break;

            case 'circle':
                const radiusX = Math.abs(drawing.endX - drawing.startX) / 2;
                const radiusY = Math.abs(drawing.endY - drawing.startY) / 2;
                const centerX = (drawing.startX + drawing.endX) / 2;
                const centerY = (drawing.startY + drawing.endY) / 2;
                drawCtx.beginPath();
                drawCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
                drawCtx.stroke();
                break;

            case 'arrow':
                drawArrow(drawing.startX, drawing.startY, drawing.endX, drawing.endY, drawing.color, drawing.size);
                break;
        }
    });
}

// Clear drawing canvas
function clearDrawing() {
    if (drawCtx) {
        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    }
    // Clear completed drawings
    completedDrawings = [];
    drawPath = [];

    // Deactivate draw tools
    const toolBtns = [penTool, lineTool, rectTool, circleTool, arrowTool];
    toolBtns.forEach(btn => {
        if (btn) btn.classList.remove('active');
    });
    if (drawCanvas) {
        drawCanvas.classList.remove('active');
    }
}

// Apply drawing to main canvas
function applyDrawing() {
    if (!currentImage) return;

    // Check if there's anything drawn
    const drawData = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height).data;
    let hasDrawing = false;
    for (let i = 3; i < drawData.length; i += 4) {
        if (drawData[i] > 0) {
            hasDrawing = true;
            break;
        }
    }

    if (!hasDrawing) {
        showToast('Nothing to apply');
        return;
    }

    saveToHistory();

    // Draw the draw canvas onto the main canvas
    ctx.drawImage(drawCanvas, 0, 0);

    // Clear the draw canvas
    clearDrawing();

    showToast('Drawing applied');
}

// Add sticker - show draggable preview
function addSticker(emoji) {
    if (!currentImage) {
        showToast('Load an image first');
        return;
    }

    const size = stickerSize ? parseInt(stickerSize.value) : 64;

    activeSticker = {
        emoji,
        size
    };

    // Reset position to center
    stickerPosition = { x: 50, y: 50 };

    // Style the draggable sticker
    if (draggableSticker) {
        draggableSticker.textContent = emoji;
        draggableSticker.style.fontSize = `${size}px`;
        draggableSticker.style.left = '50%';
        draggableSticker.style.top = '50%';
        draggableSticker.style.transform = 'translate(-50%, -50%)';
    }

    // Show overlay and controls
    if (stickerOverlay) stickerOverlay.style.display = 'block';
    if (stickerActions) stickerActions.style.display = 'flex';
    if (stickerHint) stickerHint.style.display = 'block';

    showToast('Drag sticker to position');
}

// Start dragging sticker
function startStickerDrag(e) {
    if (!activeSticker) return;
    isStickerDragging = true;
    const rect = draggableSticker.getBoundingClientRect();
    stickerDragStart.x = e.clientX - rect.left - rect.width / 2;
    stickerDragStart.y = e.clientY - rect.top - rect.height / 2;
    draggableSticker.style.cursor = 'grabbing';
}

// Drag sticker
function dragSticker(e) {
    if (!isStickerDragging || !activeSticker || !stickerOverlay) return;

    const overlayRect = stickerOverlay.getBoundingClientRect();
    let x = e.clientX - overlayRect.left - stickerDragStart.x;
    let y = e.clientY - overlayRect.top - stickerDragStart.y;

    // Convert to percentage
    stickerPosition.x = (x / overlayRect.width) * 100;
    stickerPosition.y = (y / overlayRect.height) * 100;

    // Clamp to bounds
    stickerPosition.x = Math.max(5, Math.min(95, stickerPosition.x));
    stickerPosition.y = Math.max(5, Math.min(95, stickerPosition.y));

    draggableSticker.style.left = `${stickerPosition.x}%`;
    draggableSticker.style.top = `${stickerPosition.y}%`;
}

// Stop dragging sticker
function stopStickerDrag() {
    isStickerDragging = false;
    if (draggableSticker) draggableSticker.style.cursor = 'move';
}

// Apply sticker to canvas
function applySticker() {
    if (!activeSticker || !currentImage) return;

    saveToHistory();

    ctx.font = `${activeSticker.size}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Calculate position based on percentage
    const x = (stickerPosition.x / 100) * imageCanvas.width;
    const y = (stickerPosition.y / 100) * imageCanvas.height;

    ctx.fillText(activeSticker.emoji, x, y);

    // Hide overlay and reset
    cancelSticker();
    showToast('Sticker applied');
}

// Cancel sticker
function cancelSticker() {
    activeSticker = null;
    if (stickerOverlay) stickerOverlay.style.display = 'none';
    if (stickerActions) stickerActions.style.display = 'none';
    if (stickerHint) stickerHint.style.display = 'none';
}

// Apply watermark
function applyWatermark() {
    if (!currentImage) {
        showToast('Load an image first');
        return;
    }

    const text = watermarkText ? watermarkText.value.trim() : '';
    if (!text) {
        showToast('Enter watermark text');
        return;
    }

    saveToHistory();

    const position = watermarkPosition ? watermarkPosition.value : 'bottom-right';
    const opacity = watermarkOpacity ? parseInt(watermarkOpacity.value) / 100 : 0.5;

    const fontSize = Math.max(16, Math.min(imageCanvas.width, imageCanvas.height) / 20);

    ctx.save();
    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.strokeStyle = `rgba(0, 0, 0, ${opacity * 0.5})`;
    ctx.lineWidth = 2;

    const padding = 20;
    let x, y;

    switch (position) {
        case 'top-left':
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            x = padding;
            y = padding;
            break;
        case 'top-right':
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            x = imageCanvas.width - padding;
            y = padding;
            break;
        case 'bottom-left':
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            x = padding;
            y = imageCanvas.height - padding;
            break;
        case 'bottom-right':
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            x = imageCanvas.width - padding;
            y = imageCanvas.height - padding;
            break;
        case 'center':
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            x = imageCanvas.width / 2;
            y = imageCanvas.height / 2;
            break;
        default:
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            x = imageCanvas.width - padding;
            y = imageCanvas.height - padding;
    }

    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.restore();

    showToast('Watermark added');
}

// Toggle comparison mode
let isComparisonDragging = false;

function toggleComparison() {
    if (!currentImage || !originalImage) {
        showToast('Load an image first');
        return;
    }

    isComparing = !isComparing;

    if (comparisonToggle) {
        comparisonToggle.classList.toggle('active', isComparing);
    }

    if (comparisonOverlay) {
        comparisonOverlay.style.display = isComparing ? 'block' : 'none';

        if (isComparing && originalCanvas) {
            // Make sure original canvas matches current size
            originalCanvas.width = imageCanvas.width;
            originalCanvas.height = imageCanvas.height;
            originalCtx.drawImage(originalImage, 0, 0, originalCanvas.width, originalCanvas.height);

            // Reset comparison position
            comparisonPosition = 50;
            updateComparisonSlider();
        }
    }

    showToast(isComparing ? 'Comparison mode on' : 'Comparison mode off');
}

function startComparisonDrag(e) {
    isComparisonDragging = true;
    updateComparisonDrag(e);
}

function updateComparisonDrag(e) {
    if (!isComparisonDragging || !comparisonOverlay) return;

    const rect = comparisonOverlay.getBoundingClientRect();
    comparisonPosition = ((e.clientX - rect.left) / rect.width) * 100;
    comparisonPosition = Math.max(0, Math.min(100, comparisonPosition));

    updateComparisonSlider();
}

function stopComparisonDrag() {
    isComparisonDragging = false;
}

function updateComparisonSlider() {
    if (comparisonSlider) {
        comparisonSlider.style.left = `${comparisonPosition}%`;
    }
    if (originalCanvas) {
        originalCanvas.style.clipPath = `inset(0 ${100 - comparisonPosition}% 0 0)`;
    }
}

// Reset adjustments
function resetAdjustments() {
    adjustments = {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        blur: 0,
        hue: 0,
        temperature: 0,
        sharpen: 0,
        vignette: 0
    };

    brightnessSlider.value = 0;
    contrastSlider.value = 0;
    saturationSlider.value = 0;
    blurSlider.value = 0;
    if (hueSlider) hueSlider.value = 0;
    if (temperatureSlider) temperatureSlider.value = 0;
    if (sharpenSlider) sharpenSlider.value = 0;
    if (vignetteSlider) vignetteSlider.value = 0;

    updateSliderValues();

    currentFilter = 'none';
    filterBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === 'none');
    });
}

// Reset all
function resetAll() {
    if (!originalImage) return;

    // Cancel crop if active
    if (isCropping) cancelCrop();

    // Cancel text if active
    if (activeText) cancelText();

    // Cancel sticker if active
    if (activeSticker) cancelSticker();

    // Turn off comparison
    if (isComparing) toggleComparison();

    // Clear drawing
    clearDrawing();

    // Reset to original image
    imageCanvas.width = originalImage.width;
    imageCanvas.height = originalImage.height;
    ctx.drawImage(originalImage, 0, 0);

    // Reset draw canvas
    if (drawCanvas) {
        drawCanvas.width = originalImage.width;
        drawCanvas.height = originalImage.height;
    }

    // Reset adjustments
    resetAdjustments();

    // Clear text and sticker objects
    textObjects = [];
    stickerObjects = [];

    // Update UI
    aspectRatio = originalImage.width / originalImage.height;
    resizeWidth.value = originalImage.width;
    resizeHeight.value = originalImage.height;
    updateImageInfo(originalImage.width, originalImage.height);

    // Clear history and save initial state
    history = [];
    saveToHistory();

    showToast('Reset to original');
}

// Load new image
function loadNewImage() {
    // Cancel crop if active
    if (isCropping) cancelCrop();

    // Cancel text if active
    if (activeText) cancelText();

    // Cancel sticker if active
    if (activeSticker) cancelSticker();

    // Turn off comparison
    if (isComparing) toggleComparison();

    // Reset state
    originalImage = null;
    currentImage = null;
    history = [];
    textObjects = [];
    stickerObjects = [];
    resetAdjustments();

    // Clear drawing
    clearDrawing();

    // Reset UI
    uploadPlaceholder.style.display = 'block';
    canvasContainer.style.display = 'none';
    imageInfo.style.display = 'none';
    editorActions.style.display = 'none';

    // Clear canvas
    ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);

    // Reset file input
    imageInput.value = '';

    // Trigger file dialog
    imageInput.click();
}

// Download image
function downloadImage() {
    if (!currentImage) return;

    // First apply current adjustments permanently
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = imageCanvas.width;
    finalCanvas.height = imageCanvas.height;
    const finalCtx = finalCanvas.getContext('2d');

    // Build filter string
    let filterString = '';
    const brightness = 100 + adjustments.brightness;
    const contrast = 100 + adjustments.contrast;
    const saturation = 100 + adjustments.saturation;

    filterString += `brightness(${brightness}%) `;
    filterString += `contrast(${contrast}%) `;
    filterString += `saturate(${saturation}%) `;

    if (adjustments.hue !== 0) {
        filterString += `hue-rotate(${adjustments.hue}deg) `;
    }

    if (adjustments.blur > 0) {
        filterString += `blur(${adjustments.blur}px) `;
    }

    filterString += getFilterString(currentFilter);

    finalCtx.filter = filterString.trim() || 'none';
    finalCtx.drawImage(imageCanvas, 0, 0);
    finalCtx.filter = 'none';

    // Apply temperature
    if (adjustments.temperature !== 0) {
        const imageData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
        const data = imageData.data;
        const temp = adjustments.temperature;

        for (let i = 0; i < data.length; i += 4) {
            if (temp > 0) {
                data[i] = Math.min(255, data[i] + temp * 0.5);
                data[i + 2] = Math.max(0, data[i + 2] - temp * 0.3);
            } else {
                data[i] = Math.max(0, data[i] + temp * 0.3);
                data[i + 2] = Math.min(255, data[i + 2] - temp * 0.5);
            }
        }
        finalCtx.putImageData(imageData, 0, 0);
    }

    // Apply sharpen
    if (adjustments.sharpen > 0) {
        const strength = adjustments.sharpen / 100;
        const imageData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
        const data = imageData.data;
        const width = finalCanvas.width;
        const height = finalCanvas.height;
        const copy = new Uint8ClampedArray(data);

        const kernel = [
            0, -strength, 0,
            -strength, 1 + 4 * strength, -strength,
            0, -strength, 0
        ];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                            sum += copy[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
                        }
                    }
                    const idx = (y * width + x) * 4 + c;
                    data[idx] = Math.max(0, Math.min(255, sum));
                }
            }
        }
        finalCtx.putImageData(imageData, 0, 0);
    }

    // Apply vignette
    if (adjustments.vignette > 0) {
        const strength = adjustments.vignette / 100;
        const width = finalCanvas.width;
        const height = finalCanvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.sqrt(centerX * centerX + centerY * centerY);

        const gradient = finalCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(0.5, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, `rgba(0,0,0,${strength})`);

        finalCtx.fillStyle = gradient;
        finalCtx.fillRect(0, 0, width, height);
    }

    // Merge draw canvas if has content
    if (drawCanvas) {
        finalCtx.drawImage(drawCanvas, 0, 0);
    }

    // Get format and quality
    const format = downloadFormat ? downloadFormat.value : 'png';
    const quality = downloadQuality ? parseInt(downloadQuality.value) / 100 : 0.9;

    let mimeType = 'image/png';
    let extension = 'png';

    switch (format) {
        case 'jpeg':
            mimeType = 'image/jpeg';
            extension = 'jpg';
            break;
        case 'webp':
            mimeType = 'image/webp';
            extension = 'webp';
            break;
    }

    // Download
    const link = document.createElement('a');
    link.download = `cubsoftware-edited-image.${extension}`;

    if (format === 'png') {
        link.href = finalCanvas.toDataURL(mimeType);
    } else {
        link.href = finalCanvas.toDataURL(mimeType, quality);
    }

    link.click();

    showToast('Downloaded');
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
