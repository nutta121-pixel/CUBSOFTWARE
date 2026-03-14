// File Converter JavaScript

class FileConverter {
    constructor() {
        this.files = [];
        this.convertedFiles = [];
        this.initElements();
        this.bindEvents();
    }

    initElements() {
        this.uploadZone = document.getElementById('uploadZone');
        this.fileInput = document.getElementById('fileInput');
        this.optionsSection = document.getElementById('optionsSection');
        this.filesSection = document.getElementById('filesSection');
        this.filesList = document.getElementById('filesList');
        this.fileCount = document.getElementById('fileCount');
        this.downloadSection = document.getElementById('downloadSection');
        this.downloadList = document.getElementById('downloadList');
        this.outputFormat = document.getElementById('outputFormat');
        this.quality = document.getElementById('quality');
        this.qualityValue = document.getElementById('qualityValue');
        this.resize = document.getElementById('resize');
        this.customSizeGroup = document.getElementById('customSizeGroup');
        this.customWidth = document.getElementById('customWidth');
        this.customHeight = document.getElementById('customHeight');
        this.maintainAspect = document.getElementById('maintainAspect');
        this.clearAllBtn = document.getElementById('clearAllBtn');
        this.convertAllBtn = document.getElementById('convertAllBtn');
        this.downloadAllBtn = document.getElementById('downloadAllBtn');
        this.toast = document.getElementById('toast');
    }

    bindEvents() {
        // Upload zone events
        this.uploadZone.addEventListener('click', () => this.fileInput.click());
        this.uploadZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.uploadZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.uploadZone.addEventListener('drop', (e) => this.handleDrop(e));
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Options events
        this.quality.addEventListener('input', () => {
            this.qualityValue.textContent = this.quality.value;
        });

        this.resize.addEventListener('change', () => {
            this.customSizeGroup.style.display = this.resize.value === 'custom' ? 'flex' : 'none';
        });

        this.customWidth.addEventListener('input', () => this.handleDimensionChange('width'));
        this.customHeight.addEventListener('input', () => this.handleDimensionChange('height'));

        // Action buttons
        this.clearAllBtn.addEventListener('click', () => this.clearAll());
        this.convertAllBtn.addEventListener('click', () => this.convertAll());
        this.downloadAllBtn.addEventListener('click', () => this.downloadAllAsZip());
    }

    handleDragOver(e) {
        e.preventDefault();
        this.uploadZone.classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.uploadZone.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        this.uploadZone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        this.addFiles(files);
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.addFiles(files);
        this.fileInput.value = '';
    }

    addFiles(newFiles) {
        newFiles.forEach(file => {
            const id = Date.now() + Math.random().toString(36).substr(2, 9);
            this.files.push({
                id,
                file,
                status: 'pending',
                preview: null
            });
        });
        this.updateUI();
    }

    updateUI() {
        this.fileCount.textContent = this.files.length;
        this.filesSection.classList.toggle('show', this.files.length > 0);
        this.renderFilesList();
    }

    renderFilesList() {
        this.filesList.innerHTML = '';

        this.files.forEach(item => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `
                <img class="file-preview" src="${item.preview || ''}" alt="Preview" id="preview-${item.id}">
                <div class="file-info">
                    <div class="file-name">${item.file.name}</div>
                    <div class="file-size">${this.formatSize(item.file.size)}</div>
                </div>
                <span class="file-status ${item.status}">${this.getStatusText(item.status)}</span>
                <button class="file-remove" data-id="${item.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `;
            this.filesList.appendChild(div);

            // Load preview
            if (!item.preview) {
                this.loadPreview(item);
            }

            // Bind remove button
            div.querySelector('.file-remove').addEventListener('click', () => this.removeFile(item.id));
        });
    }

    loadPreview(item) {
        const reader = new FileReader();
        reader.onload = (e) => {
            item.preview = e.target.result;
            const img = document.getElementById(`preview-${item.id}`);
            if (img) img.src = item.preview;
        };
        reader.readAsDataURL(item.file);
    }

    removeFile(id) {
        this.files = this.files.filter(f => f.id !== id);
        this.updateUI();
    }

    clearAll() {
        this.files = [];
        this.convertedFiles = [];
        this.updateUI();
        this.downloadSection.classList.remove('show');
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getStatusText(status) {
        const texts = {
            pending: 'Pending',
            converting: 'Converting...',
            done: 'Done',
            error: 'Error'
        };
        return texts[status] || status;
    }

    handleDimensionChange(changed) {
        if (!this.maintainAspect.checked || this.files.length === 0) return;

        // Get first file's dimensions for aspect ratio
        const firstFile = this.files[0];
        if (!firstFile.preview) return;

        const img = new Image();
        img.onload = () => {
            const aspectRatio = img.width / img.height;
            if (changed === 'width' && this.customWidth.value) {
                this.customHeight.value = Math.round(this.customWidth.value / aspectRatio);
            } else if (changed === 'height' && this.customHeight.value) {
                this.customWidth.value = Math.round(this.customHeight.value * aspectRatio);
            }
        };
        img.src = firstFile.preview;
    }

    async convertAll() {
        this.convertedFiles = [];

        for (const item of this.files) {
            item.status = 'converting';
            this.renderFilesList();

            try {
                const converted = await this.convertFile(item);
                this.convertedFiles.push(converted);
                item.status = 'done';
            } catch (error) {
                console.error('Conversion error:', error);
                item.status = 'error';
            }

            this.renderFilesList();
        }

        this.showDownloadSection();
        this.showToast('Conversion complete!');
    }

    async convertFile(item) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // Calculate dimensions
                    let width = img.width;
                    let height = img.height;

                    const resizeValue = this.resize.value;
                    if (resizeValue === 'custom') {
                        if (this.customWidth.value) width = parseInt(this.customWidth.value);
                        if (this.customHeight.value) height = parseInt(this.customHeight.value);
                    } else if (resizeValue !== 'original') {
                        const scale = parseInt(resizeValue) / 100;
                        width = Math.round(img.width * scale);
                        height = Math.round(img.height * scale);
                    }

                    canvas.width = width;
                    canvas.height = height;

                    // Fill background for JPEG (no transparency)
                    if (this.outputFormat.value === 'jpeg') {
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, width, height);
                    }

                    ctx.drawImage(img, 0, 0, width, height);

                    const format = this.outputFormat.value;
                    const mimeType = `image/${format}`;
                    const quality = parseInt(this.quality.value) / 100;

                    canvas.toBlob((blob) => {
                        if (blob) {
                            const originalName = item.file.name.replace(/\.[^/.]+$/, '');
                            resolve({
                                blob,
                                name: `${originalName}.${format === 'jpeg' ? 'jpg' : format}`,
                                size: blob.size,
                                preview: URL.createObjectURL(blob)
                            });
                        } else {
                            reject(new Error('Conversion failed'));
                        }
                    }, mimeType, quality);
                } catch (error) {
                    reject(error);
                }
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = item.preview;
        });
    }

    showDownloadSection() {
        this.downloadSection.classList.add('show');
        this.downloadList.innerHTML = '';

        this.convertedFiles.forEach((file, index) => {
            const div = document.createElement('div');
            div.className = 'download-item';
            div.innerHTML = `
                <img class="file-preview" src="${file.preview}" alt="Preview">
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${this.formatSize(file.size)}</div>
                </div>
                <button class="download-btn" data-index="${index}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download
                </button>
            `;
            this.downloadList.appendChild(div);

            div.querySelector('.download-btn').addEventListener('click', () => this.downloadFile(file));
        });
    }

    downloadFile(file) {
        const a = document.createElement('a');
        a.href = file.preview;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    async downloadAllAsZip() {
        if (this.convertedFiles.length === 0) return;

        const zip = new JSZip();

        for (const file of this.convertedFiles) {
            zip.file(file.name, file.blob);
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = 'converted-images.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        this.showToast('ZIP downloaded!');
    }

    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new FileConverter();
});
