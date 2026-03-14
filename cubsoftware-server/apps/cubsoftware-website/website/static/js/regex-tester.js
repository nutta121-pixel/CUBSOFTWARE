// Regex Tester JavaScript

class RegexTester {
    constructor() {
        this.initElements();
        this.bindEvents();
    }

    initElements() {
        this.patternInput = document.getElementById('regexPattern');
        this.flagsInput = document.getElementById('regexFlags');
        this.testString = document.getElementById('testString');
        this.highlightedOutput = document.getElementById('highlightedOutput');
        this.errorMessage = document.getElementById('errorMessage');
        this.resultsSection = document.getElementById('resultsSection');
        this.matchCount = document.getElementById('matchCount');
        this.matchesList = document.getElementById('matchesList');
        this.flagCheckboxes = document.querySelectorAll('.flag-option input[data-flag]');
    }

    bindEvents() {
        // Real-time testing
        this.patternInput.addEventListener('input', () => this.test());
        this.flagsInput.addEventListener('input', () => {
            this.syncFlagsToCheckboxes();
            this.test();
        });
        this.testString.addEventListener('input', () => this.test());

        // Flag checkboxes
        this.flagCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                this.syncCheckboxesToFlags();
                this.test();
            });
        });

        // Sync textarea scroll with highlighted output
        this.testString.addEventListener('scroll', () => {
            this.highlightedOutput.scrollTop = this.testString.scrollTop;
            this.highlightedOutput.scrollLeft = this.testString.scrollLeft;
        });
    }

    syncFlagsToCheckboxes() {
        const flags = this.flagsInput.value;
        this.flagCheckboxes.forEach(cb => {
            cb.checked = flags.includes(cb.dataset.flag);
        });
    }

    syncCheckboxesToFlags() {
        let flags = '';
        this.flagCheckboxes.forEach(cb => {
            if (cb.checked) flags += cb.dataset.flag;
        });
        this.flagsInput.value = flags;
    }

    test() {
        const pattern = this.patternInput.value;
        const flags = this.flagsInput.value;
        const text = this.testString.value;

        // Clear previous state
        this.errorMessage.classList.remove('show');
        this.errorMessage.textContent = '';

        if (!pattern) {
            this.highlightedOutput.innerHTML = this.escapeHtml(text);
            this.resultsSection.style.display = 'none';
            return;
        }

        try {
            const regex = new RegExp(pattern, flags);
            this.highlightMatches(regex, text);
        } catch (e) {
            this.errorMessage.textContent = e.message;
            this.errorMessage.classList.add('show');
            this.highlightedOutput.innerHTML = this.escapeHtml(text);
            this.resultsSection.style.display = 'none';
        }
    }

    highlightMatches(regex, text) {
        const matches = [];
        let match;
        let highlighted = '';
        let lastIndex = 0;

        // Handle non-global regex
        if (!regex.global) {
            match = regex.exec(text);
            if (match) {
                matches.push({
                    value: match[0],
                    index: match.index,
                    groups: match.slice(1)
                });
            }
        } else {
            // Reset lastIndex for global regex
            regex.lastIndex = 0;

            while ((match = regex.exec(text)) !== null) {
                // Prevent infinite loops with empty matches
                if (match.index === regex.lastIndex) {
                    regex.lastIndex++;
                }

                matches.push({
                    value: match[0],
                    index: match.index,
                    groups: match.slice(1)
                });

                // Safety limit
                if (matches.length > 10000) break;
            }
        }

        // Build highlighted text
        if (matches.length === 0) {
            highlighted = this.escapeHtml(text);
        } else {
            let pos = 0;
            matches.forEach(m => {
                // Text before match
                highlighted += this.escapeHtml(text.substring(pos, m.index));
                // Match itself
                highlighted += `<span class="match">${this.escapeHtml(m.value)}</span>`;
                pos = m.index + m.value.length;
            });
            // Remaining text
            highlighted += this.escapeHtml(text.substring(pos));
        }

        this.highlightedOutput.innerHTML = highlighted;

        // Update results
        this.updateResults(matches);
    }

    updateResults(matches) {
        if (matches.length === 0) {
            this.resultsSection.style.display = 'none';
            return;
        }

        this.resultsSection.style.display = 'block';
        this.matchCount.textContent = `${matches.length} match${matches.length !== 1 ? 'es' : ''}`;

        this.matchesList.innerHTML = matches.slice(0, 100).map((m, i) => {
            let groupsHtml = '';
            if (m.groups && m.groups.length > 0 && m.groups.some(g => g !== undefined)) {
                groupsHtml = `
                    <div class="match-groups">
                        ${m.groups.map((g, gi) => g !== undefined ? `
                            <span class="match-group">
                                <span class="group-name">Group ${gi + 1}:</span>
                                <span class="group-value">${this.escapeHtml(g)}</span>
                            </span>
                        ` : '').join('')}
                    </div>
                `;
            }

            return `
                <div class="match-item">
                    <span class="match-index">#${i + 1}</span>
                    <div class="match-details">
                        <div class="match-value">${this.escapeHtml(m.value) || '<em>(empty)</em>'}</div>
                        ${groupsHtml}
                        <span class="match-position">Index: ${m.index}</span>
                    </div>
                </div>
            `;
        }).join('');

        if (matches.length > 100) {
            this.matchesList.innerHTML += `
                <div class="match-item" style="justify-content: center;">
                    <span class="match-position">... and ${matches.length - 100} more matches</span>
                </div>
            `;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new RegexTester();
});
