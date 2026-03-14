// PDF Tools JavaScript
const { PDFDocument, rgb } = PDFLib;

class PDFTools {
    constructor() {
        this.currentTool = 'merge';
        this.mergeFiles = [];
        this.splitFile = null;
        this.imageFiles = [];
        this.compressFile = null;
        this.compressQuality = 'medium';
        this.resultBlobs = [];

        this.initElements();
        this.bindEvents();
        this.initSortables();
    }

    initElements() {
        // Tabs
        this.toolTabs = document.querySelectorAll('.tool-tab');
        this.toolPanels = document.querySelectorAll('.tool-panel');

        // Merge elements
        this.mergeUploadZone = document.getElementById('mergeUploadZone');
        this.mergeFileInput = document.getElementById('mergeFileInput');
        this.mergeFilesSection = document.getElementById('mergeFilesSection');
        this.mergeFilesList = document.getElementById('mergeFilesList');
        this.mergeFileCount = document.getElementById('mergeFileCount');
        this.mergeClearBtn = document.getElementById('mergeClearBtn');
        this.mergeBtn = document.getElementById('mergeBtn');

        // Split elements
        this.splitUploadZone = document.getElementById('splitUploadZone');
        this.splitFileInput = document.getElementById('splitFileInput');
        this.splitOptions = document.getElementById('splitOptions');
        this.splitPdfName = document.getElementById('splitPdfName');
        this.splitPdfPages = document.getElementById('splitPdfPages');
        this.splitModeRadios = document.querySelectorAll('input[name="splitMode"]');
        this.rangeInputs = document.getElementById('rangeInputs');
        this.customInput = document.getElementById('customInput');
        this.splitClearBtn = document.getElementById('splitClearBtn');
        this.splitBtn = document.getElementById('splitBtn');

        // Images elements
        this.imagesUploadZone = document.getElementById('imagesUploadZone');
        this.imagesFileInput = document.getElementById('imagesFileInput');
        this.imagesFilesSection = document.getElementById('imagesFilesSection');
        this.imagesFilesList = document.getElementById('imagesFilesList');
        this.imagesFileCount = document.getElementById('imagesFileCount');
        this.imagesClearBtn = document.getElementById('imagesClearBtn');
        this.imagesToPdfBtn = document.getElementById('imagesToPdfBtn');

        // Compress elements
        this.compressUploadZone = document.getElementById('compressUploadZone');
        this.compressFileInput = document.getElementById('compressFileInput');
        this.compressOptions = document.getElementById('compressOptions');
        this.compressPdfName = document.getElementById('compressPdfName');
        this.compressPdfSize = document.getElementById('compressPdfSize');
        this.qualityBtns = document.querySelectorAll('.quality-btn');
        this.compressClearBtn = document.getElementById('compressClearBtn');
        this.compressBtn = document.getElementById('compressBtn');

        // Result elements
        this.resultSection = document.getElementById('resultSection');
        this.resultTitle = document.getElementById('resultTitle');
        this.resultMessage = document.getElementById('resultMessage');
        this.resultFiles = document.getElementById('resultFiles');
        this.downloadResultBtn = document.getElementById('downloadResultBtn');

        // Progress
        this.progressOverlay = document.getElementById('progressOverlay');
        this.progressMessage = document.getElementById('progressMessage');

        // Toast
        this.toast = document.getElementById('toast');
    }

    bindEvents() {
        // Tab switching
        this.toolTabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTool(tab.dataset.tool));
        });

        // Merge events
        this.mergeUploadZone.addEventListener('click', () => this.mergeFileInput.click());
        this.mergeUploadZone.addEventListener('dragover', (e) => this.handleDragOver(e, this.mergeUploadZone));
        this.mergeUploadZone.addEventListener('dragleave', (e) => this.handleDragLeave(e, this.mergeUploadZone));
        this.mergeUploadZone.addEventListener('drop', (e) => this.handleDrop(e, 'merge'));
        this.mergeFileInput.addEventListener('change', (e) => this.handleFileSelect(e, 'merge'));
        this.mergeClearBtn.addEventListener('click', () => this.clearMerge());
        this.mergeBtn.addEventListener('click', () => this.mergePDFs());

        // Split events
        this.splitUploadZone.addEventListener('click', () => this.splitFileInput.click());
        this.splitUploadZone.addEventListener('dragover', (e) => this.handleDragOver(e, this.splitUploadZone));
        this.splitUploadZone.addEventListener('dragleave', (e) => this.handleDragLeave(e, this.splitUploadZone));
        this.splitUploadZone.addEventListener('drop', (e) => this.handleDrop(e, 'split'));
        this.splitFileInput.addEventListener('change', (e) => this.handleFileSelect(e, 'split'));
        this.splitModeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.updateSplitMode());
        });
        this.splitClearBtn.addEventListener('click', () => this.clearSplit());
        this.splitBtn.addEventListener('click', () => this.splitPDF());

        // Images events
        this.imagesUploadZone.addEventListener('click', () => this.imagesFileInput.click());
        this.imagesUploadZone.addEventListener('dragover', (e) => this.handleDragOver(e, this.imagesUploadZone));
        this.imagesUploadZone.addEventListener('dragleave', (e) => this.handleDragLeave(e, this.imagesUploadZone));
        this.imagesUploadZone.addEventListener('drop', (e) => this.handleDrop(e, 'images'));
        this.imagesFileInput.addEventListener('change', (e) => this.handleFileSelect(e, 'images'));
        this.imagesClearBtn.addEventListener('click', () => this.clearImages());
        this.imagesToPdfBtn.addEventListener('click', () => this.imagesToPDF());

        // Compress events
        this.compressUploadZone.addEventListener('click', () => this.compressFileInput.click());
        this.compressUploadZone.addEventListener('dragover', (e) => this.handleDragOver(e, this.compressUploadZone));
        this.compressUploadZone.addEventListener('dragleave', (e) => this.handleDragLeave(e, this.compressUploadZone));
        this.compressUploadZone.addEventListener('drop', (e) => this.handleDrop(e, 'compress'));
        this.compressFileInput.addEventListener('change', (e) => this.handleFileSelect(e, 'compress'));
        this.qualityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.qualityBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.compressQuality = btn.dataset.quality;
            });
        });
        this.compressClearBtn.addEventListener('click', () => this.clearCompress());
        this.compressBtn.addEventListener('click', () => this.compressPDF());

        // Download result
        this.downloadResultBtn.addEventListener('click', () => this.downloadResult());
    }

    initSortables() {
        if (typeof Sortable !== 'undefined') {
            new Sortable(this.mergeFilesList, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                onEnd: (evt) => {
                    const item = this.mergeFiles.splice(evt.oldIndex, 1)[0];
                    this.mergeFiles.splice(evt.newIndex, 0, item);
                }
            });

            new Sortable(this.imagesFilesList, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                onEnd: (evt) => {
                    const item = this.imageFiles.splice(evt.oldIndex, 1)[0];
                    this.imageFiles.splice(evt.newIndex, 0, item);
                }
            });
        }
    }

    switchTool(tool) {
        this.currentTool = tool;
        this.toolTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tool === tool);
        });
        this.toolPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tool}-panel`);
        });
        this.resultSection.classList.remove('show');
    }

    handleDragOver(e, zone) {
        e.preventDefault();
        zone.classList.add('drag-over');
    }

    handleDragLeave(e, zone) {
        e.preventDefault();
        zone.classList.remove('drag-over');
    }

    handleDrop(e, type) {
        e.preventDefault();
        const zone = e.currentTarget;
        zone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        this.processFiles(files, type);
    }

    handleFileSelect(e, type) {
        const files = Array.from(e.target.files);
        this.processFiles(files, type);
        e.target.value = '';
    }

    processFiles(files, type) {
        switch (type) {
            case 'merge':
                const pdfs = files.filter(f => f.type === 'application/pdf');
                pdfs.forEach(file => {
                    this.mergeFiles.push({ file, id: this.generateId() });
                });
                this.updateMergeUI();
                break;
            case 'split':
                const pdf = files.find(f => f.type === 'application/pdf');
                if (pdf) this.loadSplitFile(pdf);
                break;
            case 'images':
                const imgs = files.filter(f => f.type.startsWith('image/'));
                imgs.forEach(file => {
                    this.imageFiles.push({ file, id: this.generateId(), preview: null });
                });
                this.updateImagesUI();
                break;
            case 'compress':
                const compressPdf = files.find(f => f.type === 'application/pdf');
                if (compressPdf) this.loadCompressFile(compressPdf);
                break;
        }
    }

    generateId() {
        return Date.now() + Math.random().toString(36).substr(2, 9);
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Merge Functions
    updateMergeUI() {
        this.mergeFileCount.textContent = this.mergeFiles.length;
        this.mergeFilesSection.classList.toggle('show', this.mergeFiles.length > 0);
        this.renderMergeFiles();
    }

    renderMergeFiles() {
        this.mergeFilesList.innerHTML = '';
        this.mergeFiles.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `
                <div class="file-icon">PDF</div>
                <div class="file-info">
                    <div class="file-name">${item.file.name}</div>
                    <div class="file-size">${this.formatSize(item.file.size)}</div>
                </div>
                <button class="file-remove" data-id="${item.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `;
            this.mergeFilesList.appendChild(div);
            div.querySelector('.file-remove').addEventListener('click', () => {
                this.mergeFiles = this.mergeFiles.filter(f => f.id !== item.id);
                this.updateMergeUI();
            });
        });
    }

    clearMerge() {
        this.mergeFiles = [];
        this.updateMergeUI();
    }

    async mergePDFs() {
        if (this.mergeFiles.length < 2) {
            this.showToast('Please add at least 2 PDF files');
            return;
        }

        this.showProgress('Merging PDFs...');

        try {
            const mergedPdf = await PDFDocument.create();

            for (const item of this.mergeFiles) {
                const arrayBuffer = await item.file.arrayBuffer();
                const pdf = await PDFDocument.load(arrayBuffer);
                const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                pages.forEach(page => mergedPdf.addPage(page));
            }

            const pdfBytes = await mergedPdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });

            this.resultBlobs = [{ blob, name: 'merged.pdf' }];
            this.showResult('PDFs Merged Successfully!', `Combined ${this.mergeFiles.length} files into one PDF`);
        } catch (error) {
            console.error('Merge error:', error);
            this.showToast('Error merging PDFs');
        }

        this.hideProgress();
    }

    // Split Functions
    async loadSplitFile(file) {
        this.splitFile = file;
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await PDFDocument.load(arrayBuffer);
            const pageCount = pdf.getPageCount();

            this.splitPdfName.textContent = file.name;
            this.splitPdfPages.textContent = `${pageCount} pages`;
            this.splitOptions.classList.add('show');

            document.getElementById('rangeEnd').max = pageCount;
            document.getElementById('rangeStart').max = pageCount;
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.showToast('Error loading PDF');
        }
    }

    updateSplitMode() {
        const mode = document.querySelector('input[name="splitMode"]:checked').value;
        this.rangeInputs.style.display = mode === 'range' ? 'flex' : 'none';
        this.customInput.style.display = mode === 'custom' ? 'flex' : 'none';
    }

    clearSplit() {
        this.splitFile = null;
        this.splitOptions.classList.remove('show');
        this.splitFileInput.value = '';
    }

    async splitPDF() {
        if (!this.splitFile) return;

        this.showProgress('Splitting PDF...');

        try {
            const arrayBuffer = await this.splitFile.arrayBuffer();
            const pdf = await PDFDocument.load(arrayBuffer);
            const pageCount = pdf.getPageCount();
            const mode = document.querySelector('input[name="splitMode"]:checked').value;

            let pagesToExtract = [];

            if (mode === 'all') {
                pagesToExtract = Array.from({ length: pageCount }, (_, i) => i);
            } else if (mode === 'range') {
                const start = parseInt(document.getElementById('rangeStart').value) - 1;
                const end = parseInt(document.getElementById('rangeEnd').value) - 1;
                for (let i = start; i <= end && i < pageCount; i++) {
                    pagesToExtract.push(i);
                }
            } else if (mode === 'custom') {
                const customStr = document.getElementById('customPages').value;
                pagesToExtract = this.parsePageRange(customStr, pageCount);
            }

            this.resultBlobs = [];

            if (mode === 'all') {
                // Create separate PDF for each page
                for (const pageIndex of pagesToExtract) {
                    const newPdf = await PDFDocument.create();
                    const [page] = await newPdf.copyPages(pdf, [pageIndex]);
                    newPdf.addPage(page);
                    const pdfBytes = await newPdf.save();
                    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                    this.resultBlobs.push({ blob, name: `page_${pageIndex + 1}.pdf` });
                }
            } else {
                // Create single PDF with selected pages
                const newPdf = await PDFDocument.create();
                const pages = await newPdf.copyPages(pdf, pagesToExtract);
                pages.forEach(page => newPdf.addPage(page));
                const pdfBytes = await newPdf.save();
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                this.resultBlobs.push({ blob, name: 'extracted_pages.pdf' });
            }

            this.showResult('PDF Split Successfully!', `Extracted ${pagesToExtract.length} pages`);
        } catch (error) {
            console.error('Split error:', error);
            this.showToast('Error splitting PDF');
        }

        this.hideProgress();
    }

    parsePageRange(str, maxPages) {
        const pages = new Set();
        const parts = str.split(',').map(s => s.trim());

        for (const part of parts) {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(n => parseInt(n));
                for (let i = start; i <= end && i <= maxPages; i++) {
                    if (i > 0) pages.add(i - 1);
                }
            } else {
                const num = parseInt(part);
                if (num > 0 && num <= maxPages) pages.add(num - 1);
            }
        }

        return Array.from(pages).sort((a, b) => a - b);
    }

    // Images to PDF Functions
    updateImagesUI() {
        this.imagesFileCount.textContent = this.imageFiles.length;
        this.imagesFilesSection.classList.toggle('show', this.imageFiles.length > 0);
        this.renderImageFiles();
    }

    renderImageFiles() {
        this.imagesFilesList.innerHTML = '';
        this.imageFiles.forEach(item => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `
                <img class="file-preview" src="" alt="Preview" id="img-${item.id}">
                <div class="file-info">
                    <div class="file-name">${item.file.name}</div>
                    <div class="file-size">${this.formatSize(item.file.size)}</div>
                </div>
                <button class="file-remove" data-id="${item.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `;
            this.imagesFilesList.appendChild(div);

            // Load preview
            const reader = new FileReader();
            reader.onload = (e) => {
                item.preview = e.target.result;
                document.getElementById(`img-${item.id}`).src = e.target.result;
            };
            reader.readAsDataURL(item.file);

            div.querySelector('.file-remove').addEventListener('click', () => {
                this.imageFiles = this.imageFiles.filter(f => f.id !== item.id);
                this.updateImagesUI();
            });
        });
    }

    clearImages() {
        this.imageFiles = [];
        this.updateImagesUI();
    }

    async imagesToPDF() {
        if (this.imageFiles.length === 0) return;

        this.showProgress('Creating PDF...');

        try {
            const pdf = await PDFDocument.create();
            const pageSize = document.getElementById('pageSize').value;
            const orientation = document.getElementById('orientation').value;
            const margin = parseInt(document.getElementById('margin').value);

            for (const item of this.imageFiles) {
                const imgBytes = await item.file.arrayBuffer();
                let image;

                if (item.file.type === 'image/png') {
                    image = await pdf.embedPng(imgBytes);
                } else if (item.file.type === 'image/jpeg' || item.file.type === 'image/jpg') {
                    image = await pdf.embedJpg(imgBytes);
                } else {
                    // Convert other formats to PNG via canvas
                    const dataUrl = await this.convertToDataUrl(item.file);
                    const pngBytes = await fetch(dataUrl).then(r => r.arrayBuffer());
                    image = await pdf.embedPng(pngBytes);
                }

                let pageWidth, pageHeight;

                if (pageSize === 'fit') {
                    pageWidth = image.width + margin * 2;
                    pageHeight = image.height + margin * 2;
                } else {
                    if (pageSize === 'a4') {
                        pageWidth = 595;
                        pageHeight = 842;
                    } else {
                        pageWidth = 612;
                        pageHeight = 792;
                    }

                    if (orientation === 'landscape' || (orientation === 'auto' && image.width > image.height)) {
                        [pageWidth, pageHeight] = [pageHeight, pageWidth];
                    }
                }

                const page = pdf.addPage([pageWidth, pageHeight]);

                // Calculate image dimensions to fit page
                const availWidth = pageWidth - margin * 2;
                const availHeight = pageHeight - margin * 2;
                const scale = Math.min(availWidth / image.width, availHeight / image.height, 1);
                const imgWidth = image.width * scale;
                const imgHeight = image.height * scale;
                const x = (pageWidth - imgWidth) / 2;
                const y = (pageHeight - imgHeight) / 2;

                page.drawImage(image, { x, y, width: imgWidth, height: imgHeight });
            }

            const pdfBytes = await pdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });

            this.resultBlobs = [{ blob, name: 'images.pdf' }];
            this.showResult('PDF Created Successfully!', `Converted ${this.imageFiles.length} images to PDF`);
        } catch (error) {
            console.error('Error creating PDF:', error);
            this.showToast('Error creating PDF');
        }

        this.hideProgress();
    }

    convertToDataUrl(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // Compress Functions
    async loadCompressFile(file) {
        this.compressFile = file;
        this.compressPdfName.textContent = file.name;
        this.compressPdfSize.textContent = this.formatSize(file.size);
        this.compressOptions.classList.add('show');
    }

    clearCompress() {
        this.compressFile = null;
        this.compressOptions.classList.remove('show');
        this.compressFileInput.value = '';
    }

    async compressPDF() {
        if (!this.compressFile) return;

        this.showProgress('Compressing PDF...');

        try {
            const arrayBuffer = await this.compressFile.arrayBuffer();
            const pdf = await PDFDocument.load(arrayBuffer);

            // Note: pdf-lib doesn't have built-in compression
            // This recreates the PDF which can sometimes reduce size
            const newPdf = await PDFDocument.create();
            const pages = await newPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => newPdf.addPage(page));

            const pdfBytes = await newPdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });

            const originalSize = this.compressFile.size;
            const newSize = blob.size;
            const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(1);

            this.resultBlobs = [{ blob, name: `compressed_${this.compressFile.name}` }];
            this.showResult('PDF Compressed!',
                `${this.formatSize(originalSize)} → ${this.formatSize(newSize)} (${reduction}% reduction)`);
        } catch (error) {
            console.error('Compress error:', error);
            this.showToast('Error compressing PDF');
        }

        this.hideProgress();
    }

    // Result Functions
    showResult(title, message) {
        this.resultTitle.textContent = title;
        this.resultMessage.textContent = message;
        this.resultFiles.innerHTML = '';

        this.resultBlobs.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'result-file';
            div.innerHTML = `
                <div class="result-file-info">
                    <div class="file-icon">PDF</div>
                    <div class="file-info">
                        <div class="file-name">${item.name}</div>
                        <div class="file-size">${this.formatSize(item.blob.size)}</div>
                    </div>
                </div>
            `;
            this.resultFiles.appendChild(div);
        });

        this.downloadResultBtn.textContent = this.resultBlobs.length > 1 ? 'Download All as ZIP' : 'Download';
        this.resultSection.classList.add('show');
    }

    async downloadResult() {
        if (this.resultBlobs.length === 0) return;

        if (this.resultBlobs.length === 1) {
            const item = this.resultBlobs[0];
            const url = URL.createObjectURL(item.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = item.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            const zip = new JSZip();
            this.resultBlobs.forEach(item => {
                zip.file(item.name, item.blob);
            });
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'pdf_files.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        this.showToast('Downloaded!');
    }

    showProgress(message) {
        this.progressMessage.textContent = message;
        this.progressOverlay.classList.add('show');
    }

    hideProgress() {
        this.progressOverlay.classList.remove('show');
    }

    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new PDFTools();
});
