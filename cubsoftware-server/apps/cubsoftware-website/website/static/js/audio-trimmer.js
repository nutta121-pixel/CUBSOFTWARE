// Audio Trimmer JavaScript

class AudioTrimmer {
    constructor() {
        this.audioContext = null;
        this.audioBuffer = null;
        this.sourceNode = null;
        this.gainNode = null;
        this.isPlaying = false;
        this.startTime = 0;
        this.pausedAt = 0;
        this.trimStart = 0;
        this.trimEnd = 0;
        this.fileName = '';
        this.animationFrame = null;

        this.initElements();
        this.bindEvents();
    }

    initElements() {
        // Upload
        this.uploadSection = document.getElementById('uploadSection');
        this.uploadBox = document.getElementById('uploadBox');
        this.audioInput = document.getElementById('audioInput');

        // Editor
        this.editorSection = document.getElementById('editorSection');
        this.fileNameEl = document.getElementById('fileName');
        this.fileDurationEl = document.getElementById('fileDuration');
        this.changeFileBtn = document.getElementById('changeFileBtn');

        // Waveform
        this.waveformCanvas = document.getElementById('waveformCanvas');
        this.waveformCtx = this.waveformCanvas.getContext('2d');
        this.playhead = document.getElementById('playhead');
        this.trimLeft = document.getElementById('trimLeft');
        this.trimRight = document.getElementById('trimRight');
        this.handleLeft = document.getElementById('handleLeft');
        this.handleRight = document.getElementById('handleRight');
        this.startTimeEl = document.getElementById('startTime');
        this.endTimeEl = document.getElementById('endTime');

        // Trim inputs
        this.trimStartInput = document.getElementById('trimStartInput');
        this.trimEndInput = document.getElementById('trimEndInput');
        this.selectionDuration = document.getElementById('selectionDuration');

        // Playback
        this.playSelectionBtn = document.getElementById('playSelectionBtn');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.currentTimeDisplay = document.getElementById('currentTimeDisplay');

        // Options
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeValue = document.getElementById('volumeValue');
        this.fadeInSlider = document.getElementById('fadeInSlider');
        this.fadeInValue = document.getElementById('fadeInValue');
        this.fadeOutSlider = document.getElementById('fadeOutSlider');
        this.fadeOutValue = document.getElementById('fadeOutValue');

        // Export
        this.exportFormat = document.getElementById('exportFormat');
        this.qualityGroup = document.getElementById('qualityGroup');
        this.exportQuality = document.getElementById('exportQuality');
        this.exportBtn = document.getElementById('exportBtn');

        // Processing
        this.processing = document.getElementById('processing');
        this.processingText = document.getElementById('processingText');

        // Toast
        this.toast = document.getElementById('toast');
    }

    bindEvents() {
        // Upload
        this.uploadBox.addEventListener('click', () => this.audioInput.click());
        this.audioInput.addEventListener('change', (e) => this.handleFile(e.target.files[0]));
        this.uploadBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadBox.classList.add('dragover');
        });
        this.uploadBox.addEventListener('dragleave', () => {
            this.uploadBox.classList.remove('dragover');
        });
        this.uploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadBox.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });

        // Change file
        this.changeFileBtn.addEventListener('click', () => {
            this.stop();
            this.uploadSection.style.display = 'block';
            this.editorSection.style.display = 'none';
            this.audioInput.value = '';
        });

        // Playback
        this.playPauseBtn.addEventListener('click', () => this.togglePlay());
        this.playSelectionBtn.addEventListener('click', () => this.playSelection());
        this.stopBtn.addEventListener('click', () => this.stop());

        // Trim handles
        this.setupTrimHandles();

        // Trim inputs
        this.trimStartInput.addEventListener('change', () => this.onTrimInputChange('start'));
        this.trimEndInput.addEventListener('change', () => this.onTrimInputChange('end'));

        // Options
        this.volumeSlider.addEventListener('input', () => {
            this.volumeValue.textContent = this.volumeSlider.value + '%';
            if (this.gainNode) {
                this.gainNode.gain.value = this.volumeSlider.value / 100;
            }
        });

        this.fadeInSlider.addEventListener('input', () => {
            this.fadeInValue.textContent = this.fadeInSlider.value + 'ms';
        });

        this.fadeOutSlider.addEventListener('input', () => {
            this.fadeOutValue.textContent = this.fadeOutSlider.value + 'ms';
        });

        this.exportFormat.addEventListener('change', () => {
            this.qualityGroup.style.display = this.exportFormat.value === 'mp3' ? 'flex' : 'none';
        });

        // Export
        this.exportBtn.addEventListener('click', () => this.export());

        // Canvas resize
        window.addEventListener('resize', () => {
            if (this.audioBuffer) {
                this.drawWaveform();
                this.updateTrimUI();
            }
        });

        // Waveform click to seek
        this.waveformCanvas.addEventListener('click', (e) => {
            if (!this.audioBuffer) return;
            const rect = this.waveformCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;
            const time = percent * this.audioBuffer.duration;

            if (time >= this.trimStart && time <= this.trimEnd) {
                this.seekTo(time);
            }
        });
    }

    setupTrimHandles() {
        let isDragging = null;
        let startX = 0;
        let startValue = 0;

        const onMouseDown = (e, handle) => {
            isDragging = handle;
            startX = e.clientX || e.touches[0].clientX;
            startValue = handle === 'left' ? this.trimStart : this.trimEnd;
            document.body.style.cursor = 'ew-resize';
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isDragging || !this.audioBuffer) return;

            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const rect = this.waveformCanvas.getBoundingClientRect();
            const deltaX = clientX - startX;
            const deltaPct = deltaX / rect.width;
            const deltaTime = deltaPct * this.audioBuffer.duration;

            if (isDragging === 'left') {
                const newStart = Math.max(0, Math.min(this.trimEnd - 0.1, startValue + deltaTime));
                this.trimStart = newStart;
            } else {
                const newEnd = Math.min(this.audioBuffer.duration, Math.max(this.trimStart + 0.1, startValue + deltaTime));
                this.trimEnd = newEnd;
            }

            this.updateTrimUI();
        };

        const onMouseUp = () => {
            isDragging = null;
            document.body.style.cursor = '';
        };

        this.handleLeft.addEventListener('mousedown', (e) => onMouseDown(e, 'left'));
        this.handleRight.addEventListener('mousedown', (e) => onMouseDown(e, 'right'));
        this.handleLeft.addEventListener('touchstart', (e) => onMouseDown(e, 'left'));
        this.handleRight.addEventListener('touchstart', (e) => onMouseDown(e, 'right'));

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('touchmove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('touchend', onMouseUp);
    }

    async handleFile(file) {
        if (!file) return;

        if (!file.type.startsWith('audio/')) {
            this.showToast('Please select an audio file');
            return;
        }

        this.fileName = file.name;
        this.showProcessing('Loading audio...');

        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const arrayBuffer = await file.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            this.trimStart = 0;
            this.trimEnd = this.audioBuffer.duration;

            this.fileNameEl.textContent = this.fileName;
            this.fileDurationEl.textContent = this.formatTime(this.audioBuffer.duration);
            this.startTimeEl.textContent = '0:00';
            this.endTimeEl.textContent = this.formatTime(this.audioBuffer.duration);

            this.uploadSection.style.display = 'none';
            this.editorSection.style.display = 'block';

            this.drawWaveform();
            this.updateTrimUI();
            this.hideProcessing();

        } catch (e) {
            console.error('Error loading audio:', e);
            this.hideProcessing();
            this.showToast('Error loading audio file');
        }
    }

    drawWaveform() {
        const canvas = this.waveformCanvas;
        const ctx = this.waveformCtx;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;
        ctx.scale(dpr, dpr);

        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        const data = this.audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#5865f2';
        ctx.beginPath();

        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            const y1 = (1 + min) * amp;
            const y2 = (1 + max) * amp;
            ctx.fillRect(i, y1, 1, Math.max(1, y2 - y1));
        }
    }

    updateTrimUI() {
        if (!this.audioBuffer) return;

        const duration = this.audioBuffer.duration;
        const leftPct = (this.trimStart / duration) * 100;
        const rightPct = ((duration - this.trimEnd) / duration) * 100;

        this.trimLeft.style.width = leftPct + '%';
        this.trimRight.style.width = rightPct + '%';
        this.handleLeft.style.left = leftPct + '%';
        this.handleRight.style.right = rightPct + '%';

        this.trimStartInput.value = this.formatTimeMs(this.trimStart);
        this.trimEndInput.value = this.formatTimeMs(this.trimEnd);
        this.selectionDuration.textContent = this.formatTimeMs(this.trimEnd - this.trimStart);
    }

    onTrimInputChange(type) {
        const input = type === 'start' ? this.trimStartInput : this.trimEndInput;
        const time = this.parseTimeMs(input.value);

        if (time === null) {
            this.updateTrimUI();
            return;
        }

        if (type === 'start') {
            this.trimStart = Math.max(0, Math.min(this.trimEnd - 0.1, time));
        } else {
            this.trimEnd = Math.min(this.audioBuffer.duration, Math.max(this.trimStart + 0.1, time));
        }

        this.updateTrimUI();
    }

    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play(from = null) {
        if (!this.audioBuffer || !this.audioContext) return;

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        this.stop(false);

        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;

        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this.volumeSlider.value / 100;

        this.sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);

        const startPos = from !== null ? from : (this.pausedAt || 0);
        this.startTime = this.audioContext.currentTime - startPos;
        this.sourceNode.start(0, startPos);

        this.isPlaying = true;
        this.updatePlayButton();
        this.startPlayheadAnimation();

        this.sourceNode.onended = () => {
            if (this.isPlaying) {
                this.stop();
            }
        };
    }

    playSelection() {
        this.pausedAt = this.trimStart;
        this.play(this.trimStart);
    }

    pause() {
        if (!this.isPlaying) return;

        this.pausedAt = this.audioContext.currentTime - this.startTime;
        this.sourceNode.stop();
        this.isPlaying = false;
        this.updatePlayButton();
        cancelAnimationFrame(this.animationFrame);
    }

    stop(resetPosition = true) {
        if (this.sourceNode) {
            try {
                this.sourceNode.stop();
            } catch (e) {}
            this.sourceNode = null;
        }

        this.isPlaying = false;
        if (resetPosition) {
            this.pausedAt = 0;
            this.playhead.style.left = '0%';
            this.currentTimeDisplay.textContent = '0:00.000';
        }
        this.updatePlayButton();
        cancelAnimationFrame(this.animationFrame);
    }

    seekTo(time) {
        const wasPlaying = this.isPlaying;
        this.stop(false);
        this.pausedAt = time;
        this.updatePlayheadPosition(time);
        if (wasPlaying) {
            this.play(time);
        }
    }

    updatePlayButton() {
        const playIcon = this.playPauseBtn.querySelector('.play-icon');
        const pauseIcon = this.playPauseBtn.querySelector('.pause-icon');
        if (this.isPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
    }

    startPlayheadAnimation() {
        const update = () => {
            if (!this.isPlaying) return;

            const currentTime = this.audioContext.currentTime - this.startTime;
            this.updatePlayheadPosition(currentTime);

            if (currentTime >= this.trimEnd) {
                this.stop();
                return;
            }

            this.animationFrame = requestAnimationFrame(update);
        };
        update();
    }

    updatePlayheadPosition(time) {
        if (!this.audioBuffer) return;
        const pct = (time / this.audioBuffer.duration) * 100;
        this.playhead.style.left = pct + '%';
        this.currentTimeDisplay.textContent = this.formatTimeMs(time);
    }

    async export() {
        if (!this.audioBuffer) return;

        this.showProcessing('Processing audio...');
        this.exportBtn.disabled = true;

        try {
            const sampleRate = this.audioBuffer.sampleRate;
            const startSample = Math.floor(this.trimStart * sampleRate);
            const endSample = Math.floor(this.trimEnd * sampleRate);
            const length = endSample - startSample;

            const offlineCtx = new OfflineAudioContext(
                this.audioBuffer.numberOfChannels,
                length,
                sampleRate
            );

            const source = offlineCtx.createBufferSource();
            const trimmedBuffer = offlineCtx.createBuffer(
                this.audioBuffer.numberOfChannels,
                length,
                sampleRate
            );

            for (let channel = 0; channel < this.audioBuffer.numberOfChannels; channel++) {
                const sourceData = this.audioBuffer.getChannelData(channel);
                const destData = trimmedBuffer.getChannelData(channel);
                for (let i = 0; i < length; i++) {
                    destData[i] = sourceData[startSample + i];
                }
            }

            // Apply volume
            const volume = this.volumeSlider.value / 100;
            if (volume !== 1) {
                for (let channel = 0; channel < trimmedBuffer.numberOfChannels; channel++) {
                    const data = trimmedBuffer.getChannelData(channel);
                    for (let i = 0; i < data.length; i++) {
                        data[i] *= volume;
                    }
                }
            }

            // Apply fades
            const fadeIn = parseInt(this.fadeInSlider.value) / 1000 * sampleRate;
            const fadeOut = parseInt(this.fadeOutSlider.value) / 1000 * sampleRate;

            if (fadeIn > 0) {
                for (let channel = 0; channel < trimmedBuffer.numberOfChannels; channel++) {
                    const data = trimmedBuffer.getChannelData(channel);
                    for (let i = 0; i < fadeIn && i < data.length; i++) {
                        data[i] *= i / fadeIn;
                    }
                }
            }

            if (fadeOut > 0) {
                for (let channel = 0; channel < trimmedBuffer.numberOfChannels; channel++) {
                    const data = trimmedBuffer.getChannelData(channel);
                    const start = Math.max(0, data.length - fadeOut);
                    for (let i = start; i < data.length; i++) {
                        data[i] *= (data.length - i) / fadeOut;
                    }
                }
            }

            this.showProcessing('Encoding...');

            let blob;
            const format = this.exportFormat.value;

            if (format === 'wav') {
                blob = this.encodeWav(trimmedBuffer);
            } else {
                blob = await this.encodeMp3(trimmedBuffer);
            }

            // Download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const baseName = this.fileName.replace(/\.[^/.]+$/, '');
            a.href = url;
            a.download = `${baseName}_trimmed.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.hideProcessing();
            this.showToast('Audio exported successfully');

        } catch (e) {
            console.error('Export error:', e);
            this.hideProcessing();
            this.showToast('Error exporting audio');
        }

        this.exportBtn.disabled = false;
    }

    encodeWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;

        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;

        const samples = buffer.length;
        const dataSize = samples * blockAlign;
        const bufferSize = 44 + dataSize;

        const arrayBuffer = new ArrayBuffer(bufferSize);
        const view = new DataView(arrayBuffer);

        // RIFF header
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, bufferSize - 8, true);
        this.writeString(view, 8, 'WAVE');

        // fmt chunk
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);

        // data chunk
        this.writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // Interleave channels and write samples
        const channels = [];
        for (let i = 0; i < numChannels; i++) {
            channels.push(buffer.getChannelData(i));
        }

        let offset = 44;
        for (let i = 0; i < samples; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = Math.max(-1, Math.min(1, channels[ch][i]));
                const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, int16, true);
                offset += 2;
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    async encodeMp3(buffer) {
        const channels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const kbps = parseInt(this.exportQuality.value);

        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
        const mp3Data = [];

        const left = buffer.getChannelData(0);
        const right = channels > 1 ? buffer.getChannelData(1) : left;

        const sampleBlockSize = 1152;
        const leftInt = new Int16Array(left.length);
        const rightInt = new Int16Array(right.length);

        for (let i = 0; i < left.length; i++) {
            leftInt[i] = left[i] < 0 ? left[i] * 0x8000 : left[i] * 0x7FFF;
            rightInt[i] = right[i] < 0 ? right[i] * 0x8000 : right[i] * 0x7FFF;
        }

        for (let i = 0; i < leftInt.length; i += sampleBlockSize) {
            const leftChunk = leftInt.subarray(i, i + sampleBlockSize);
            const rightChunk = rightInt.subarray(i, i + sampleBlockSize);
            const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }

        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }

        return new Blob(mp3Data, { type: 'audio/mp3' });
    }

    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatTimeMs(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    parseTimeMs(str) {
        const match = str.match(/^(\d+):(\d{2})\.(\d{3})$/);
        if (!match) return null;
        return parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 1000;
    }

    showProcessing(text) {
        this.processingText.textContent = text;
        this.processing.style.display = 'flex';
    }

    hideProcessing() {
        this.processing.style.display = 'none';
    }

    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new AudioTrimmer();
});
