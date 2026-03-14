// Timer Tools JavaScript

class TimerTools {
    constructor() {
        // Stopwatch state
        this.stopwatchRunning = false;
        this.stopwatchTime = 0;
        this.stopwatchInterval = null;
        this.laps = [];
        this.lastLapTime = 0;

        // Countdown state
        this.countdownRunning = false;
        this.countdownTime = 0;
        this.countdownInterval = null;
        this.countdownTotal = 0;

        // Pomodoro state
        this.pomodoroRunning = false;
        this.pomodoroTime = 0;
        this.pomodoroInterval = null;
        this.pomodoroPhase = 'focus'; // 'focus', 'shortBreak', 'longBreak'
        this.pomodoroSession = 1;
        this.pomodoroTotal = 0;

        // Audio context for notifications
        this.audioContext = null;

        this.initElements();
        this.bindEvents();
        this.updatePomodoroSettings();
    }

    initElements() {
        // Tab elements
        this.tabs = document.querySelectorAll('.timer-tab');
        this.panels = document.querySelectorAll('.timer-panel');

        // Stopwatch elements
        this.stopwatchDisplay = document.getElementById('stopwatchDisplay');
        this.stopwatchStartBtn = document.getElementById('stopwatchStart');
        this.stopwatchLapBtn = document.getElementById('stopwatchLap');
        this.stopwatchResetBtn = document.getElementById('stopwatchReset');
        this.lapsList = document.getElementById('lapsList');

        // Countdown elements
        this.countdownSetup = document.getElementById('countdownSetup');
        this.countdownDisplayEl = document.getElementById('countdownDisplay');
        this.countdownTimeEl = document.getElementById('countdownTime');
        this.countdownHours = document.getElementById('countdownHours');
        this.countdownMinutes = document.getElementById('countdownMinutes');
        this.countdownSeconds = document.getElementById('countdownSeconds');
        this.countdownStartBtn = document.getElementById('countdownStart');
        this.countdownPauseBtn = document.getElementById('countdownPause');
        this.countdownResetBtn = document.getElementById('countdownReset');

        // Pomodoro elements
        this.pomodoroTimeEl = document.getElementById('pomodoroTime');
        this.pomodoroStatus = document.getElementById('pomodoroStatus');
        this.pomodoroProgress = document.getElementById('pomodoroProgress');
        this.sessionCountEl = document.getElementById('sessionCount');
        this.totalSessionsEl = document.getElementById('totalSessions');
        this.pomodoroStartBtn = document.getElementById('pomodoroStart');
        this.pomodoroPauseBtn = document.getElementById('pomodoroPause');
        this.pomodoroSkipBtn = document.getElementById('pomodoroSkip');
        this.pomodoroResetBtn = document.getElementById('pomodoroReset');

        // Pomodoro settings
        this.focusDurationEl = document.getElementById('focusDuration');
        this.shortBreakEl = document.getElementById('shortBreak');
        this.longBreakEl = document.getElementById('longBreak');
        this.sessionsUntilLongEl = document.getElementById('sessionsUntilLong');

        this.toast = document.getElementById('toast');
    }

    bindEvents() {
        // Tab switching
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Stopwatch
        this.stopwatchStartBtn.addEventListener('click', () => this.toggleStopwatch());
        this.stopwatchLapBtn.addEventListener('click', () => this.recordLap());
        this.stopwatchResetBtn.addEventListener('click', () => this.resetStopwatch());

        // Countdown
        this.countdownStartBtn.addEventListener('click', () => this.startCountdown());
        this.countdownPauseBtn.addEventListener('click', () => this.pauseCountdown());
        this.countdownResetBtn.addEventListener('click', () => this.resetCountdown());

        // Countdown presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const minutes = parseInt(btn.dataset.minutes);
                this.countdownHours.value = Math.floor(minutes / 60);
                this.countdownMinutes.value = minutes % 60;
                this.countdownSeconds.value = 0;
            });
        });

        // Pomodoro
        this.pomodoroStartBtn.addEventListener('click', () => this.startPomodoro());
        this.pomodoroPauseBtn.addEventListener('click', () => this.pausePomodoro());
        this.pomodoroSkipBtn.addEventListener('click', () => this.skipPomodoro());
        this.pomodoroResetBtn.addEventListener('click', () => this.resetPomodoro());

        // Pomodoro settings
        [this.focusDurationEl, this.shortBreakEl, this.longBreakEl, this.sessionsUntilLongEl].forEach(el => {
            el.addEventListener('change', () => {
                if (!this.pomodoroRunning) {
                    this.updatePomodoroSettings();
                }
            });
        });
    }

    switchTab(tabName) {
        this.tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        this.panels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}-panel`);
        });
    }

    // === Stopwatch ===
    toggleStopwatch() {
        if (this.stopwatchRunning) {
            this.pauseStopwatch();
        } else {
            this.startStopwatch();
        }
    }

    startStopwatch() {
        this.stopwatchRunning = true;
        this.stopwatchStartBtn.textContent = 'Pause';
        this.stopwatchStartBtn.classList.remove('start');
        this.stopwatchStartBtn.classList.add('secondary');

        const startTime = Date.now() - this.stopwatchTime;
        this.stopwatchInterval = setInterval(() => {
            this.stopwatchTime = Date.now() - startTime;
            this.updateStopwatchDisplay();
        }, 10);
    }

    pauseStopwatch() {
        this.stopwatchRunning = false;
        this.stopwatchStartBtn.textContent = 'Resume';
        this.stopwatchStartBtn.classList.add('start');
        this.stopwatchStartBtn.classList.remove('secondary');
        clearInterval(this.stopwatchInterval);
    }

    resetStopwatch() {
        this.stopwatchRunning = false;
        this.stopwatchTime = 0;
        this.laps = [];
        this.lastLapTime = 0;
        clearInterval(this.stopwatchInterval);
        this.stopwatchStartBtn.textContent = 'Start';
        this.stopwatchStartBtn.classList.add('start');
        this.stopwatchStartBtn.classList.remove('secondary');
        this.updateStopwatchDisplay();
        this.lapsList.innerHTML = '';
    }

    updateStopwatchDisplay() {
        this.stopwatchDisplay.textContent = this.formatTime(this.stopwatchTime, true);
    }

    recordLap() {
        if (!this.stopwatchRunning && this.stopwatchTime === 0) return;

        const lapTime = this.stopwatchTime;
        const lapDiff = lapTime - this.lastLapTime;
        this.lastLapTime = lapTime;

        this.laps.unshift({
            number: this.laps.length + 1,
            time: lapTime,
            diff: lapDiff
        });

        this.renderLaps();
    }

    renderLaps() {
        this.lapsList.innerHTML = this.laps.map((lap, index) => `
            <div class="lap-item">
                <span class="lap-number">Lap ${this.laps.length - index}</span>
                <span class="lap-diff">+${this.formatTime(lap.diff, true)}</span>
                <span class="lap-time">${this.formatTime(lap.time, true)}</span>
            </div>
        `).join('');
    }

    // === Countdown ===
    startCountdown() {
        if (this.countdownRunning) return;

        if (this.countdownTime === 0) {
            const hours = parseInt(this.countdownHours.value) || 0;
            const minutes = parseInt(this.countdownMinutes.value) || 0;
            const seconds = parseInt(this.countdownSeconds.value) || 0;
            this.countdownTime = (hours * 3600 + minutes * 60 + seconds) * 1000;
            this.countdownTotal = this.countdownTime;
        }

        if (this.countdownTime <= 0) return;

        this.countdownRunning = true;
        this.countdownSetup.style.display = 'none';
        this.countdownDisplayEl.style.display = 'block';
        this.countdownStartBtn.style.display = 'none';
        this.countdownPauseBtn.style.display = 'inline-block';

        const endTime = Date.now() + this.countdownTime;
        this.countdownInterval = setInterval(() => {
            this.countdownTime = endTime - Date.now();
            if (this.countdownTime <= 0) {
                this.countdownTime = 0;
                this.countdownComplete();
            }
            this.updateCountdownDisplay();
        }, 100);
    }

    pauseCountdown() {
        this.countdownRunning = false;
        clearInterval(this.countdownInterval);
        this.countdownStartBtn.textContent = 'Resume';
        this.countdownStartBtn.style.display = 'inline-block';
        this.countdownPauseBtn.style.display = 'none';
    }

    resetCountdown() {
        this.countdownRunning = false;
        this.countdownTime = 0;
        clearInterval(this.countdownInterval);
        this.countdownSetup.style.display = 'block';
        this.countdownDisplayEl.style.display = 'none';
        this.countdownStartBtn.textContent = 'Start';
        this.countdownStartBtn.style.display = 'inline-block';
        this.countdownPauseBtn.style.display = 'none';
    }

    updateCountdownDisplay() {
        this.countdownTimeEl.textContent = this.formatTime(this.countdownTime, false);
    }

    countdownComplete() {
        this.countdownRunning = false;
        clearInterval(this.countdownInterval);
        this.playSound();
        this.showToast("Time's up!");
        this.countdownStartBtn.textContent = 'Start';
        this.countdownStartBtn.style.display = 'inline-block';
        this.countdownPauseBtn.style.display = 'none';
    }

    // === Pomodoro ===
    updatePomodoroSettings() {
        this.totalSessionsEl.textContent = this.sessionsUntilLongEl.value;
        this.pomodoroPhase = 'focus';
        this.pomodoroSession = 1;
        this.sessionCountEl.textContent = this.pomodoroSession;
        this.pomodoroTime = parseInt(this.focusDurationEl.value) * 60 * 1000;
        this.pomodoroTotal = this.pomodoroTime;
        this.updatePomodoroDisplay();
        this.updatePomodoroStatus();
    }

    startPomodoro() {
        if (this.pomodoroRunning) return;

        this.pomodoroRunning = true;
        this.pomodoroStartBtn.style.display = 'none';
        this.pomodoroPauseBtn.style.display = 'inline-block';

        const endTime = Date.now() + this.pomodoroTime;
        this.pomodoroInterval = setInterval(() => {
            this.pomodoroTime = endTime - Date.now();
            if (this.pomodoroTime <= 0) {
                this.pomodoroTime = 0;
                this.pomodoroComplete();
            }
            this.updatePomodoroDisplay();
            this.updatePomodoroProgress();
        }, 100);
    }

    pausePomodoro() {
        this.pomodoroRunning = false;
        clearInterval(this.pomodoroInterval);
        this.pomodoroStartBtn.textContent = 'Resume';
        this.pomodoroStartBtn.style.display = 'inline-block';
        this.pomodoroPauseBtn.style.display = 'none';
    }

    skipPomodoro() {
        this.pomodoroTime = 0;
        this.pomodoroComplete();
    }

    resetPomodoro() {
        this.pomodoroRunning = false;
        clearInterval(this.pomodoroInterval);
        this.pomodoroStartBtn.textContent = 'Start Focus';
        this.pomodoroStartBtn.style.display = 'inline-block';
        this.pomodoroPauseBtn.style.display = 'none';
        this.updatePomodoroSettings();
        this.pomodoroProgress.style.width = '0%';
    }

    pomodoroComplete() {
        this.pomodoroRunning = false;
        clearInterval(this.pomodoroInterval);
        this.playSound();

        const sessionsUntilLong = parseInt(this.sessionsUntilLongEl.value);

        if (this.pomodoroPhase === 'focus') {
            if (this.pomodoroSession >= sessionsUntilLong) {
                this.pomodoroPhase = 'longBreak';
                this.pomodoroTime = parseInt(this.longBreakEl.value) * 60 * 1000;
                this.showToast('Great work! Take a long break.');
            } else {
                this.pomodoroPhase = 'shortBreak';
                this.pomodoroTime = parseInt(this.shortBreakEl.value) * 60 * 1000;
                this.showToast('Good job! Take a short break.');
            }
        } else {
            this.pomodoroPhase = 'focus';
            this.pomodoroTime = parseInt(this.focusDurationEl.value) * 60 * 1000;
            if (this.pomodoroSession >= sessionsUntilLong) {
                this.pomodoroSession = 1;
            } else {
                this.pomodoroSession++;
            }
            this.sessionCountEl.textContent = this.pomodoroSession;
            this.showToast('Break over! Time to focus.');
        }

        this.pomodoroTotal = this.pomodoroTime;
        this.updatePomodoroDisplay();
        this.updatePomodoroStatus();
        this.pomodoroProgress.style.width = '0%';

        this.pomodoroStartBtn.textContent = this.pomodoroPhase === 'focus' ? 'Start Focus' : 'Start Break';
        this.pomodoroStartBtn.style.display = 'inline-block';
        this.pomodoroPauseBtn.style.display = 'none';
    }

    updatePomodoroDisplay() {
        this.pomodoroTimeEl.textContent = this.formatTime(this.pomodoroTime, false);
    }

    updatePomodoroProgress() {
        const progress = ((this.pomodoroTotal - this.pomodoroTime) / this.pomodoroTotal) * 100;
        this.pomodoroProgress.style.width = `${progress}%`;
        this.pomodoroProgress.classList.toggle('break', this.pomodoroPhase !== 'focus');
    }

    updatePomodoroStatus() {
        const statusLabel = this.pomodoroStatus.querySelector('.status-label');
        if (this.pomodoroPhase === 'focus') {
            statusLabel.textContent = 'Focus Time';
            statusLabel.classList.remove('break');
        } else if (this.pomodoroPhase === 'shortBreak') {
            statusLabel.textContent = 'Short Break';
            statusLabel.classList.add('break');
        } else {
            statusLabel.textContent = 'Long Break';
            statusLabel.classList.add('break');
        }
    }

    // === Utilities ===
    formatTime(ms, showMs) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = Math.floor((ms % 1000) / 10);

        if (showMs) {
            if (hours > 0) {
                return `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(seconds)}.${this.pad(milliseconds)}`;
            }
            return `${this.pad(minutes)}:${this.pad(seconds)}.${this.pad(milliseconds)}`;
        } else {
            if (hours > 0) {
                return `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(seconds)}`;
            }
            return `${this.pad(minutes)}:${this.pad(seconds)}`;
        }
    }

    pad(num) {
        return num.toString().padStart(2, '0');
    }

    playSound() {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const ctx = this.audioContext;
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            // Play a pleasant notification sound
            const now = ctx.currentTime;
            for (let i = 0; i < 3; i++) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 800;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.3, now + i * 0.2);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.2 + 0.15);
                osc.start(now + i * 0.2);
                osc.stop(now + i * 0.2 + 0.15);
            }
        } catch (e) {
            console.log('Audio not supported');
        }
    }

    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new TimerTools();
});
