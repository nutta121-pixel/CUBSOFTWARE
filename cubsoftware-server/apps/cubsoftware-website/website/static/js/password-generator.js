// Password Generator JavaScript

class PasswordGenerator {
    constructor() {
        this.history = [];
        this.maxHistory = 10;

        this.charSets = {
            uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            lowercase: 'abcdefghijklmnopqrstuvwxyz',
            numbers: '0123456789',
            symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
        };

        this.ambiguous = 'l1IO0';
        this.similar = 'il1Lo0O';

        this.initElements();
        this.bindEvents();
        this.loadHistory();
        this.generatePassword();
    }

    initElements() {
        this.passwordOutput = document.getElementById('passwordOutput');
        this.copyBtn = document.getElementById('copyBtn');
        this.refreshBtn = document.getElementById('refreshBtn');
        this.generateBtn = document.getElementById('generateBtn');
        this.lengthSlider = document.getElementById('passwordLength');
        this.lengthValue = document.getElementById('lengthValue');
        this.strengthBar = document.getElementById('strengthBar');
        this.strengthLabel = document.getElementById('strengthLabel');
        this.historyList = document.getElementById('historyList');
        this.clearHistoryBtn = document.getElementById('clearHistoryBtn');

        this.includeUppercase = document.getElementById('includeUppercase');
        this.includeLowercase = document.getElementById('includeLowercase');
        this.includeNumbers = document.getElementById('includeNumbers');
        this.includeSymbols = document.getElementById('includeSymbols');
        this.excludeAmbiguous = document.getElementById('excludeAmbiguous');
        this.excludeSimilar = document.getElementById('excludeSimilar');

        this.toast = document.getElementById('toast');
    }

    bindEvents() {
        this.generateBtn.addEventListener('click', () => this.generatePassword());
        this.refreshBtn.addEventListener('click', () => this.generatePassword());
        this.copyBtn.addEventListener('click', () => this.copyPassword());
        this.clearHistoryBtn.addEventListener('click', () => this.clearHistory());

        this.lengthSlider.addEventListener('input', () => {
            this.lengthValue.textContent = this.lengthSlider.value;
            this.generatePassword();
        });

        // Checkbox events
        const checkboxes = [
            this.includeUppercase,
            this.includeLowercase,
            this.includeNumbers,
            this.includeSymbols,
            this.excludeAmbiguous,
            this.excludeSimilar
        ];

        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => this.generatePassword());
        });
    }

    generatePassword() {
        let chars = '';

        if (this.includeUppercase.checked) chars += this.charSets.uppercase;
        if (this.includeLowercase.checked) chars += this.charSets.lowercase;
        if (this.includeNumbers.checked) chars += this.charSets.numbers;
        if (this.includeSymbols.checked) chars += this.charSets.symbols;

        if (chars === '') {
            this.passwordOutput.value = 'Select at least one option';
            this.updateStrength('');
            return;
        }

        // Remove excluded characters
        if (this.excludeAmbiguous.checked) {
            chars = chars.split('').filter(c => !this.ambiguous.includes(c)).join('');
        }
        if (this.excludeSimilar.checked) {
            chars = chars.split('').filter(c => !this.similar.includes(c)).join('');
        }

        if (chars === '') {
            this.passwordOutput.value = 'No characters available';
            this.updateStrength('');
            return;
        }

        const length = parseInt(this.lengthSlider.value);
        let password = '';

        // Use crypto API for better randomness
        const array = new Uint32Array(length);
        crypto.getRandomValues(array);

        for (let i = 0; i < length; i++) {
            password += chars[array[i] % chars.length];
        }

        this.passwordOutput.value = password;
        this.updateStrength(password);
        this.addToHistory(password);
    }

    updateStrength(password) {
        if (!password) {
            this.strengthBar.className = 'strength-bar';
            this.strengthLabel.className = 'strength-label';
            this.strengthLabel.textContent = 'Password Strength: --';
            return;
        }

        let score = 0;

        // Length scoring
        if (password.length >= 8) score += 1;
        if (password.length >= 12) score += 1;
        if (password.length >= 16) score += 1;
        if (password.length >= 24) score += 1;

        // Character variety scoring
        if (/[a-z]/.test(password)) score += 1;
        if (/[A-Z]/.test(password)) score += 1;
        if (/[0-9]/.test(password)) score += 1;
        if (/[^a-zA-Z0-9]/.test(password)) score += 1;

        // Determine strength
        let strength, className;
        if (score <= 3) {
            strength = 'Weak';
            className = 'weak';
        } else if (score <= 5) {
            strength = 'Fair';
            className = 'fair';
        } else if (score <= 7) {
            strength = 'Good';
            className = 'good';
        } else {
            strength = 'Strong';
            className = 'strong';
        }

        this.strengthBar.className = `strength-bar ${className}`;
        this.strengthLabel.className = `strength-label ${className}`;
        this.strengthLabel.textContent = `Password Strength: ${strength}`;
    }

    async copyPassword() {
        const password = this.passwordOutput.value;
        if (!password || password === 'Select at least one option' || password === 'No characters available') {
            return;
        }

        try {
            await navigator.clipboard.writeText(password);
            this.showToast('Copied to clipboard!');
        } catch (err) {
            // Fallback for older browsers
            this.passwordOutput.select();
            document.execCommand('copy');
            this.showToast('Copied to clipboard!');
        }
    }

    addToHistory(password) {
        // Don't add duplicates
        if (this.history.includes(password)) return;

        this.history.unshift(password);
        if (this.history.length > this.maxHistory) {
            this.history.pop();
        }

        this.saveHistory();
        this.renderHistory();
    }

    renderHistory() {
        if (this.history.length === 0) {
            this.historyList.innerHTML = '<p class="no-history">No passwords generated yet</p>';
            return;
        }

        this.historyList.innerHTML = this.history.map(password => `
            <div class="history-item">
                <span class="password">${this.escapeHtml(password)}</span>
                <button class="copy-small" onclick="passwordGen.copyFromHistory('${this.escapeHtml(password)}')" title="Copy">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                </button>
            </div>
        `).join('');
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async copyFromHistory(password) {
        try {
            await navigator.clipboard.writeText(password);
            this.showToast('Copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }

    saveHistory() {
        try {
            localStorage.setItem('password-history', JSON.stringify(this.history));
        } catch (e) {
            console.log('Could not save history');
        }
    }

    loadHistory() {
        try {
            const saved = localStorage.getItem('password-history');
            if (saved) {
                this.history = JSON.parse(saved);
                this.renderHistory();
            }
        } catch (e) {
            console.log('Could not load history');
        }
    }

    clearHistory() {
        this.history = [];
        this.saveHistory();
        this.renderHistory();
        this.showToast('History cleared');
    }

    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), 2000);
    }
}

// Initialize
let passwordGen;
document.addEventListener('DOMContentLoaded', () => {
    passwordGen = new PasswordGenerator();
});
