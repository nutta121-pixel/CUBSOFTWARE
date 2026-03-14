// Wheel Spinner - CUB SOFTWARE
// A customizable spinning wheel for giveaways, decisions, and games

class WheelSpinner {
    constructor() {
        this.canvas = document.getElementById('wheelCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.entries = [];
        this.rotation = 0;
        this.isSpinning = false;
        this.spinDuration = 5000;
        this.soundEnabled = true;
        this.eliminateWinner = false;
        this.confettiEnabled = true;
        this.history = [];
        this.currentTheme = 'default';
        this.isSharedMode = false; // View-only mode for shared wheels
        this.logoImage = null; // Center logo image

        // Theme color palettes (50 themes)
        this.themes = {
            default: ['#5865f2', '#7c3aed', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4', '#8b5cf6', '#ef4444'],
            neon: ['#ff006e', '#00f5d4', '#fee440', '#9b5de5', '#00bbf9', '#f15bb5', '#00ff87', '#fb5607'],
            pastel: ['#ffc8dd', '#bde0fe', '#a2d2ff', '#cdb4db', '#ffd6a5', '#caffbf', '#9bf6ff', '#fdffb6'],
            rainbow: ['#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#8000ff', '#ff00ff'],
            monochrome: ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#5865f2', '#7c3aed', '#4a5568', '#2d3748'],
            sunset: ['#ff6b6b', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd', '#ff6b6b', '#feca57', '#48dbfb'],
            ocean: ['#0077b6', '#00b4d8', '#90e0ef', '#caf0f8', '#023e8a', '#0096c7', '#48cae4', '#ade8f4'],
            forest: ['#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2', '#b7e4c7', '#1b4332', '#081c15'],
            candy: ['#ff6b6b', '#ff8e72', '#ffd93d', '#6bcb77', '#4d96ff', '#9b59b6', '#ff6b9d', '#c44569'],
            retro: ['#e74c3c', '#e67e22', '#f39c12', '#27ae60', '#2980b9', '#8e44ad', '#2c3e50', '#16a085'],
            cyberpunk: ['#ff00ff', '#00ffff', '#ff0080', '#80ff00', '#0080ff', '#ff8000', '#8000ff', '#00ff80'],
            autumn: ['#d35400', '#e74c3c', '#c0392b', '#8e44ad', '#9b59b6', '#f39c12', '#e67e22', '#a04000'],
            winter: ['#a8d8ea', '#aa96da', '#fcbad3', '#ffffd2', '#b8e0d2', '#d6eadf', '#eac7c7', '#d0bdf4'],
            spring: ['#a8e6cf', '#dcedc1', '#ffd3b6', '#ffaaa5', '#ff8b94', '#98d8c8', '#f7dc6f', '#bb8fce'],
            halloween: ['#ff6600', '#000000', '#8b00ff', '#00ff00', '#ff0000', '#ffff00', '#ff6600', '#1a1a1a'],
            christmas: ['#c41e3a', '#006400', '#ffd700', '#ffffff', '#c41e3a', '#006400', '#ffd700', '#ff0000'],
            galaxy: ['#0c0c1e', '#1a1a3e', '#2e1a47', '#4a1a6b', '#6b2d8e', '#8e44ad', '#9b59b6', '#bb8fce'],
            fire: ['#ff0000', '#ff3300', '#ff6600', '#ff9900', '#ffcc00', '#ffff00', '#ff6600', '#ff3300'],
            ice: ['#e0ffff', '#b0e0e6', '#87ceeb', '#00bfff', '#1e90ff', '#4169e1', '#00ffff', '#40e0d0'],
            earth: ['#8b4513', '#a0522d', '#cd853f', '#deb887', '#d2691e', '#8b0000', '#556b2f', '#6b8e23'],
            berry: ['#8e4585', '#c71585', '#db7093', '#ff69b4', '#ff1493', '#dc143c', '#b22222', '#800020'],
            tropical: ['#ff6f61', '#ffcc5c', '#88d8b0', '#96ceb4', '#ffeead', '#ff6f69', '#ffcc5c', '#2ab7ca'],
            lavender: ['#e6e6fa', '#d8bfd8', '#dda0dd', '#da70d6', '#ba55d3', '#9932cc', '#9400d3', '#8b008b'],
            gold: ['#ffd700', '#ffcc00', '#ffb300', '#ff9900', '#ff8000', '#cc6600', '#b8860b', '#daa520'],
            midnight: ['#191970', '#000080', '#00008b', '#0000cd', '#4169e1', '#6495ed', '#1e90ff', '#87ceeb'],
            bubblegum: ['#ff69b4', '#ff1493', '#db7093', '#ffb6c1', '#ffc0cb', '#ff85a2', '#ff69b4', '#ee82ee'],
            mint: ['#98ff98', '#90ee90', '#00fa9a', '#00ff7f', '#3cb371', '#2e8b57', '#20b2aa', '#66cdaa'],
            coffee: ['#6f4e37', '#8b4513', '#a0522d', '#d2691e', '#cd853f', '#deb887', '#f5deb3', '#ffe4c4'],
            wine: ['#722f37', '#8b0000', '#800000', '#a52a2a', '#b22222', '#cd5c5c', '#dc143c', '#c71585'],
            slate: ['#2f4f4f', '#708090', '#778899', '#696969', '#808080', '#a9a9a9', '#c0c0c0', '#d3d3d3'],
            royal: ['#4169e1', '#0000cd', '#00008b', '#000080', '#191970', '#6a5acd', '#7b68ee', '#9370db'],
            coral: ['#ff7f50', '#ff6347', '#ff4500', '#ff8c00', '#ffa07a', '#fa8072', '#e9967a', '#f08080'],
            jungle: ['#228b22', '#006400', '#008000', '#2e8b57', '#3cb371', '#90ee90', '#32cd32', '#7cfc00'],
            desert: ['#edc9af', '#d2b48c', '#deb887', '#f5deb3', '#ffe4c4', '#ffdab9', '#ffefd5', '#faf0e6'],
            aurora: ['#00ff00', '#00ffff', '#ff00ff', '#ffff00', '#00ff7f', '#7fffd4', '#40e0d0', '#9400d3'],
            vintage: ['#704214', '#a67b5b', '#c19a6b', '#d4a574', '#e8c39e', '#f5deb3', '#8b7355', '#6b4423'],
            electric: ['#7df9ff', '#00ffff', '#00bfff', '#1e90ff', '#4169e1', '#0000ff', '#8a2be2', '#9400d3'],
            peach: ['#ffcba4', '#ffdab9', '#ffefd5', '#ffe4e1', '#fff0f5', '#ffc0cb', '#ffb6c1', '#ff69b4'],
            moss: ['#8a9a5b', '#6b8e23', '#808000', '#556b2f', '#2e8b57', '#228b22', '#006400', '#004d00'],
            plum: ['#dda0dd', '#da70d6', '#ba55d3', '#9932cc', '#9400d3', '#8b008b', '#800080', '#4b0082'],
            sahara: ['#c2b280', '#c19a6b', '#cd853f', '#d2691e', '#8b4513', '#a0522d', '#deb887', '#f4a460'],
            arctic: ['#f0ffff', '#e0ffff', '#afeeee', '#b0e0e6', '#add8e6', '#87ceeb', '#87cefa', '#00bfff'],
            volcanic: ['#8b0000', '#b22222', '#cd5c5c', '#f08080', '#ff6347', '#ff4500', '#ff8c00', '#2f2f2f'],
            meadow: ['#7cfc00', '#7fff00', '#adff2f', '#9acd32', '#6b8e23', '#556b2f', '#228b22', '#008000'],
            dusk: ['#483d8b', '#6a5acd', '#7b68ee', '#9370db', '#8a2be2', '#9400d3', '#ff8c00', '#ff6347'],
            cherry: ['#de3163', '#ff007f', '#ff0090', '#dc143c', '#c71585', '#db7093', '#ff69b4', '#ffb6c1'],
            steel: ['#71797e', '#848884', '#a9a9a9', '#b0c4de', '#778899', '#708090', '#4682b4', '#5f9ea0'],
            tangerine: ['#ff9966', '#ff7f50', '#ff6347', '#ff4500', '#ff8c00', '#ffa500', '#ffb347', '#ffcc00'],
            sapphire: ['#0f52ba', '#0066cc', '#0047ab', '#082567', '#000080', '#00008b', '#191970', '#4169e1']
        };

        // Audio context for sounds
        this.audioCtx = null;
        this.tickSound = null;
        this.winSound = null;

        this.init();
    }

    init() {
        this.loadFromURL();
        this.bindEvents();
        this.loadFromStorage();
        this.loadLogo();
        this.draw();
        this.updateEntryCount();
        this.initAudio();
    }

    loadLogo() {
        this.logoImage = new Image();
        this.logoImage.onload = () => {
            this.draw(); // Redraw when logo loads
        };
        this.logoImage.src = '/static/images/company-logo.png';
    }

    initAudio() {
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Audio not supported');
        }
    }

    playTick() {
        if (!this.soundEnabled || !this.audioCtx) return;
        try {
            const oscillator = this.audioCtx.createOscillator();
            const gainNode = this.audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.05);
            oscillator.start(this.audioCtx.currentTime);
            oscillator.stop(this.audioCtx.currentTime + 0.05);
        } catch (e) {}
    }

    playWinSound() {
        if (!this.soundEnabled || !this.audioCtx) return;
        try {
            const frequencies = [523.25, 659.25, 783.99, 1046.50];
            frequencies.forEach((freq, i) => {
                setTimeout(() => {
                    const oscillator = this.audioCtx.createOscillator();
                    const gainNode = this.audioCtx.createGain();
                    oscillator.connect(gainNode);
                    gainNode.connect(this.audioCtx.destination);
                    oscillator.frequency.value = freq;
                    oscillator.type = 'sine';
                    gainNode.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);
                    oscillator.start(this.audioCtx.currentTime);
                    oscillator.stop(this.audioCtx.currentTime + 0.3);
                }, i * 100);
            });
        } catch (e) {}
    }

    bindEvents() {
        // Add entries button
        document.getElementById('addEntriesBtn').addEventListener('click', () => this.addEntries());
        document.getElementById('entriesInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) this.addEntries();
        });

        // Clear entries
        document.getElementById('clearEntriesBtn').addEventListener('click', () => this.clearEntries());

        // Spin button
        document.getElementById('spinBtn').addEventListener('click', () => this.spin());

        // Settings
        document.getElementById('themeSelect').addEventListener('change', (e) => {
            this.changeTheme(e.target.value);
        });

        document.getElementById('durationSelect').addEventListener('change', (e) => {
            this.spinDuration = parseInt(e.target.value) * 1000;
            this.saveToStorage();
        });

        document.getElementById('eliminateWinner').addEventListener('click', (e) => {
            this.eliminateWinner = !this.eliminateWinner;
            e.target.classList.toggle('active', this.eliminateWinner);
            this.saveToStorage();
        });

        document.getElementById('confettiEnabled').addEventListener('click', (e) => {
            this.confettiEnabled = !this.confettiEnabled;
            e.target.classList.toggle('active', this.confettiEnabled);
            this.saveToStorage();
        });

        // Sound toggle
        document.getElementById('soundBtn').addEventListener('click', () => this.toggleSound());

        // Fullscreen
        document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());

        // History
        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());

        // Share
        document.getElementById('copyLinkBtn').addEventListener('click', () => this.copyShareLink());
        document.getElementById('embedBtn').addEventListener('click', () => this.showEmbedModal());

        // Import/Export
        document.getElementById('importBtn').addEventListener('click', () => document.getElementById('csvInput').click());
        document.getElementById('csvInput').addEventListener('change', (e) => this.importCSV(e));
        document.getElementById('exportBtn').addEventListener('click', () => this.exportEntries());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.isSpinning && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                this.spin();
            }
            if (e.code === 'Escape') {
                document.body.classList.remove('fullscreen-mode');
                closeWinnerModal();
                closeEmbedModal();
            }
        });

        // Resume audio context on interaction
        document.addEventListener('click', () => {
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
        }, { once: true });
    }

    addEntries() {
        if (this.isSharedMode) return; // Can't edit shared wheel
        const input = document.getElementById('entriesInput');
        const text = input.value.trim();
        if (!text) return;

        const newEntries = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        newEntries.forEach(entry => {
            this.entries.push({
                name: entry,
                color: this.getColorForIndex(this.entries.length)
            });
        });

        input.value = '';
        this.renderEntryList();
        this.draw();
        this.updateEntryCount();
        this.saveToStorage();
        this.showToast(`Added ${newEntries.length} entries`);
    }

    getColorForIndex(index) {
        const colors = this.themes[this.currentTheme];
        return colors[index % colors.length];
    }

    updateColors() {
        this.entries.forEach((entry, index) => {
            entry.color = this.getColorForIndex(index);
        });
    }

    changeTheme(theme) {
        this.currentTheme = theme;
        // Update all entry colors with the new theme
        for (let i = 0; i < this.entries.length; i++) {
            this.entries[i].color = this.themes[theme][i % this.themes[theme].length];
        }
        this.renderEntryList();
        // Force canvas redraw on next frame
        requestAnimationFrame(() => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.draw();
        });
        this.saveToStorage();
    }

    renderEntryList() {
        const list = document.getElementById('entriesList');
        list.innerHTML = '';

        this.entries.forEach((entry, index) => {
            const item = document.createElement('div');
            item.className = 'entry-item';
            // Only show remove button if not in shared mode
            const removeBtn = this.isSharedMode ? '' : `
                <button class="entry-remove" onclick="wheel.removeEntry(${index})" title="Remove">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            `;
            item.innerHTML = `
                <div class="entry-color" style="background: ${entry.color}"></div>
                <span class="entry-name">${this.escapeHtml(entry.name)}</span>
                ${removeBtn}
            `;
            list.appendChild(item);
        });
    }

    removeEntry(index) {
        if (this.isSharedMode) return; // Can't edit shared wheel
        this.entries.splice(index, 1);
        this.updateColors();
        this.renderEntryList();
        this.draw();
        this.updateEntryCount();
        this.saveToStorage();
    }

    clearEntries() {
        if (this.isSharedMode) return; // Can't edit shared wheel
        if (this.entries.length === 0) return;
        if (!confirm('Clear all entries?')) return;
        this.entries = [];
        this.renderEntryList();
        this.draw();
        this.updateEntryCount();
        this.saveToStorage();
        this.showToast('All entries cleared');
    }

    updateEntryCount() {
        document.querySelector('.entry-count').textContent = `${this.entries.length} entries`;
    }

    draw() {
        const ctx = this.ctx;
        const canvas = this.canvas;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (this.entries.length === 0) {
            // Draw empty wheel
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.fillStyle = '#1a1a2e';
            ctx.fill();
            ctx.strokeStyle = '#5865f2';
            ctx.lineWidth = 4;
            ctx.stroke();

            ctx.fillStyle = '#666';
            ctx.font = '20px Poppins, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Add entries to spin!', centerX, centerY);
            return;
        }

        const sliceAngle = (2 * Math.PI) / this.entries.length;

        // Draw wheel segments
        this.entries.forEach((entry, index) => {
            const startAngle = this.rotation + index * sliceAngle;
            const endAngle = startAngle + sliceAngle;

            // Draw segment
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = entry.color;
            ctx.fill();

            // Draw segment border
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw text
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(startAngle + sliceAngle / 2);
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';

            // Determine text color based on background
            const brightness = this.getColorBrightness(entry.color);
            ctx.fillStyle = brightness > 128 ? '#000' : '#fff';

            // Adjust font size based on number of entries
            let fontSize = 16;
            if (this.entries.length > 12) fontSize = 12;
            if (this.entries.length > 20) fontSize = 10;
            ctx.font = `bold ${fontSize}px Poppins, sans-serif`;

            // Truncate text if too long
            const maxWidth = radius - 40;
            let text = entry.name;
            while (ctx.measureText(text).width > maxWidth && text.length > 3) {
                text = text.substring(0, text.length - 1);
            }
            if (text !== entry.name) text += '...';

            ctx.fillText(text, radius - 20, 0);
            ctx.restore();
        });

        // Draw center circle with logo
        const centerRadius = 40;
        ctx.beginPath();
        ctx.arc(centerX, centerY, centerRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#1a1a2e';
        ctx.fill();
        ctx.strokeStyle = '#5865f2';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Draw logo in center
        if (this.logoImage && this.logoImage.complete) {
            const logoSize = centerRadius * 1.5;
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, centerRadius - 2, 0, 2 * Math.PI);
            ctx.clip();
            ctx.drawImage(
                this.logoImage,
                centerX - logoSize / 2,
                centerY - logoSize / 2,
                logoSize,
                logoSize
            );
            ctx.restore();
        }

        // Draw outer ring
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#5865f2';
        ctx.lineWidth = 6;
        ctx.stroke();
    }

    getColorBrightness(color) {
        // Convert hex to RGB and calculate brightness
        let r, g, b;
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            r = parseInt(hex.substr(0, 2), 16);
            g = parseInt(hex.substr(2, 2), 16);
            b = parseInt(hex.substr(4, 2), 16);
        } else {
            return 128; // Default for non-hex colors
        }
        return (r * 299 + g * 587 + b * 114) / 1000;
    }

    spin() {
        if (this.isSpinning || this.entries.length < 2) {
            if (this.entries.length < 2) {
                this.showToast('Add at least 2 entries to spin!', 'error');
            }
            return;
        }

        this.isSpinning = true;
        const spinBtn = document.getElementById('spinBtn');
        spinBtn.disabled = true;
        spinBtn.classList.add('spinning');
        spinBtn.textContent = 'SPINNING...';

        // Random number of full rotations (5-10) plus random position
        const fullRotations = 5 + Math.random() * 5;
        const targetRotation = fullRotations * 2 * Math.PI + Math.random() * 2 * Math.PI;

        const startRotation = this.rotation;
        const startTime = performance.now();
        let lastTickAngle = 0;
        const sliceAngle = (2 * Math.PI) / this.entries.length;
        const pointer = document.querySelector('.wheel-pointer');

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / this.spinDuration, 1);

            // Easing function for smooth slowdown
            const easeOut = 1 - Math.pow(1 - progress, 4);
            this.rotation = startRotation + targetRotation * easeOut;

            // Play tick sound and bounce pointer when passing segment boundaries
            const normalizedRotation = this.rotation % (2 * Math.PI);
            const currentSlice = Math.floor(normalizedRotation / sliceAngle);
            if (currentSlice !== lastTickAngle) {
                this.playTick();
                // Bounce the pointer
                pointer.classList.remove('bounce');
                void pointer.offsetWidth; // Trigger reflow to restart animation
                pointer.classList.add('bounce');
                lastTickAngle = currentSlice;
            }

            this.draw();

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                pointer.classList.remove('bounce');
                this.onSpinComplete();
            }
        };

        requestAnimationFrame(animate);
    }

    onSpinComplete() {
        this.isSpinning = false;
        const spinBtn = document.getElementById('spinBtn');
        spinBtn.disabled = false;
        spinBtn.classList.remove('spinning');
        spinBtn.textContent = 'SPIN';

        // ============ WINNER CALCULATION ============
        // Pointer is at TOP (270° = 3π/2 radians in canvas coordinates)
        // Segment i is drawn from: rotation + i*sliceAngle to rotation + (i+1)*sliceAngle
        // Formula: winnerIndex = floor((pointerAngle - rotation) / sliceAngle) mod n

        const n = this.entries.length;
        const sliceAngle = (2 * Math.PI) / n;
        const pointerAngle = 3 * Math.PI / 2; // 270° = TOP

        // Calculate angle from segment 0's start to the pointer
        let angleToPointer = pointerAngle - this.rotation;

        // Normalize to [0, 2π)
        angleToPointer = ((angleToPointer % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

        // The segment at the pointer
        const winnerIndex = Math.floor(angleToPointer / sliceAngle) % n;
        const winner = this.entries[winnerIndex];

        // Play win sound
        this.playWinSound();

        // Show confetti
        if (this.confettiEnabled) {
            this.launchConfetti();
        }

        // Update winner display
        const winnerDisplay = document.getElementById('winnerDisplay');
        winnerDisplay.classList.add('has-winner');
        winnerDisplay.innerHTML = `<span class="winner-name">${this.escapeHtml(winner.name)}</span>`;

        // Show winner modal
        document.getElementById('modalWinnerName').textContent = winner.name;
        document.getElementById('winnerModal').classList.add('active');

        // Add to history
        this.addToHistory(winner.name);

        // Remove winner if elimination mode
        if (this.eliminateWinner) {
            setTimeout(() => {
                this.entries.splice(winnerIndex, 1);
                this.updateColors();
                this.renderEntryList();
                this.draw();
                this.updateEntryCount();
                this.saveToStorage();
            }, 500);
        }
    }

    addToHistory(name) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.history.unshift({ name, time: timeStr });
        if (this.history.length > 20) this.history.pop();
        this.renderHistory();
        this.saveToStorage();
    }

    renderHistory() {
        const list = document.getElementById('historyList');
        if (this.history.length === 0) {
            list.innerHTML = '<span class="history-placeholder">No spins yet</span>';
            return;
        }

        list.innerHTML = this.history.map(item => `
            <div class="history-item">
                <span class="name">${this.escapeHtml(item.name)}</span>
                <span class="time">${item.time}</span>
            </div>
        `).join('');
    }

    clearHistory() {
        this.history = [];
        this.renderHistory();
        this.saveToStorage();
        this.showToast('History cleared');
    }

    launchConfetti() {
        const canvas = document.getElementById('confettiCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const particles = [];
        const colors = this.themes[this.currentTheme];

        for (let i = 0; i < 150; i++) {
            particles.push({
                x: canvas.width / 2,
                y: canvas.height / 2,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 0.5) * 20 - 10,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 10 + 5,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 10
            });
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let activeParticles = 0;
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.5; // gravity
                p.rotation += p.rotationSpeed;
                p.vx *= 0.99;

                if (p.y < canvas.height + 50) {
                    activeParticles++;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rotation * Math.PI / 180);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size / 2);
                    ctx.restore();
                }
            });

            if (activeParticles > 0) {
                requestAnimationFrame(animate);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        };

        animate();
    }

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        const btn = document.getElementById('soundBtn');
        btn.classList.toggle('active', this.soundEnabled);
        btn.innerHTML = this.soundEnabled
            ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>'
            : '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
        this.saveToStorage();
    }

    toggleFullscreen() {
        document.body.classList.toggle('fullscreen-mode');
    }

    copyShareLink() {
        const url = this.generateShareURL();
        navigator.clipboard.writeText(url).then(() => {
            this.showToast('Link copied to clipboard!', 'success');
        }).catch(() => {
            this.showToast('Failed to copy link', 'error');
        });
    }

    generateShareURL() {
        const data = {
            e: this.entries.map(e => e.name),
            t: this.currentTheme
        };
        const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
        return `${window.location.origin}${window.location.pathname}?w=${encoded}`;
    }

    showEmbedModal() {
        const url = this.generateShareURL();
        const embedCode = `<iframe src="${url}" width="800" height="600" frameborder="0" allowfullscreen></iframe>`;
        document.getElementById('embedCode').value = embedCode;
        document.getElementById('embedModal').classList.add('active');
    }

    importCSV(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/[\r\n]+/).filter(line => line.trim());

            lines.forEach(line => {
                // Handle CSV with commas
                const name = line.split(',')[0].trim().replace(/^["']|["']$/g, '');
                if (name) {
                    this.entries.push({
                        name: name,
                        color: this.getColorForIndex(this.entries.length)
                    });
                }
            });

            this.renderEntryList();
            this.draw();
            this.updateEntryCount();
            this.saveToStorage();
            this.showToast(`Imported ${lines.length} entries`);
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    exportEntries() {
        if (this.entries.length === 0) {
            this.showToast('No entries to export', 'error');
            return;
        }

        const csv = this.entries.map(e => e.name).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'wheel-entries.csv';
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Entries exported!', 'success');
    }

    loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        const data = params.get('w');
        if (data) {
            try {
                const decoded = JSON.parse(decodeURIComponent(atob(data)));
                if (decoded.e && Array.isArray(decoded.e)) {
                    this.entries = decoded.e.map((name, index) => ({
                        name,
                        color: this.getColorForIndex(index)
                    }));
                }
                if (decoded.t) {
                    this.currentTheme = decoded.t;
                    document.getElementById('themeSelect').value = decoded.t;
                }
                // Enable shared/view-only mode
                this.isSharedMode = true;
                this.enableSharedMode();
                this.renderEntryList();
            } catch (e) {
                console.error('Failed to load from URL:', e);
            }
        }
    }

    enableSharedMode() {
        // Disable editing controls
        document.getElementById('entriesInput').disabled = true;
        document.getElementById('entriesInput').placeholder = 'This is a shared wheel (view-only)';
        document.getElementById('addEntriesBtn').disabled = true;
        document.getElementById('clearEntriesBtn').disabled = true;
        document.getElementById('importBtn').disabled = true;
        document.getElementById('themeSelect').disabled = true;
        document.getElementById('durationSelect').disabled = true;

        // Hide eliminate winner option in shared mode
        const eliminateBtn = document.getElementById('eliminateWinner');
        if (eliminateBtn) eliminateBtn.disabled = true;

        // Add visual indicator
        const header = document.querySelector('.panel-header');
        if (header) {
            const badge = document.createElement('span');
            badge.className = 'shared-badge';
            badge.textContent = 'SHARED';
            badge.style.cssText = 'background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; margin-left: 10px;';
            header.querySelector('h2').appendChild(badge);
        }

        // Show toast notification
        this.showToast('Viewing shared wheel (read-only)', 'info');
    }

    saveToStorage() {
        // Don't save to storage in shared mode - keeps owner's wheel intact
        if (this.isSharedMode) return;

        const data = {
            entries: this.entries.map(e => e.name),
            theme: this.currentTheme,
            duration: this.spinDuration,
            eliminate: this.eliminateWinner,
            confetti: this.confettiEnabled,
            sound: this.soundEnabled,
            history: this.history
        };
        localStorage.setItem('wheelSpinner', JSON.stringify(data));
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem('wheelSpinner');
            if (saved) {
                const data = JSON.parse(saved);

                // Only load from storage if URL didn't provide entries
                if (this.entries.length === 0 && data.entries) {
                    this.entries = data.entries.map((name, index) => ({
                        name,
                        color: this.getColorForIndex(index)
                    }));
                }

                if (data.theme) {
                    this.currentTheme = data.theme;
                    document.getElementById('themeSelect').value = data.theme;
                    this.updateColors();
                }
                if (data.duration) {
                    this.spinDuration = data.duration;
                    document.getElementById('durationSelect').value = data.duration / 1000;
                }
                if (data.eliminate !== undefined) {
                    this.eliminateWinner = data.eliminate;
                    document.getElementById('eliminateWinner').classList.toggle('active', data.eliminate);
                }
                if (data.confetti !== undefined) {
                    this.confettiEnabled = data.confetti;
                    document.getElementById('confettiEnabled').classList.toggle('active', data.confetti);
                }
                if (data.sound !== undefined) {
                    this.soundEnabled = data.sound;
                    document.getElementById('soundBtn').classList.toggle('active', data.sound);
                }
                if (data.history) {
                    this.history = data.history;
                }

                this.renderEntryList();
                this.renderHistory();
            }
        } catch (e) {
            console.error('Failed to load from storage:', e);
        }
    }

    showToast(message, type = '') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast show' + (type ? ` ${type}` : '');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global functions for onclick handlers
function closeWinnerModal() {
    document.getElementById('winnerModal').classList.remove('active');
}

function closeEmbedModal() {
    document.getElementById('embedModal').classList.remove('active');
}

function copyEmbedCode() {
    const code = document.getElementById('embedCode');
    code.select();
    navigator.clipboard.writeText(code.value).then(() => {
        wheel.showToast('Embed code copied!', 'success');
    });
}

// Initialize
let wheel;
document.addEventListener('DOMContentLoaded', () => {
    wheel = new WheelSpinner();
});
