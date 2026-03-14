// Diff Checker JavaScript

class DiffChecker {
    constructor() {
        this.viewMode = 'unified';
        this.initElements();
        this.bindEvents();
    }

    initElements() {
        this.leftText = document.getElementById('leftText');
        this.rightText = document.getElementById('rightText');
        this.compareBtn = document.getElementById('compareBtn');
        this.swapBtn = document.getElementById('swapBtn');
        this.clearLeftBtn = document.getElementById('clearLeft');
        this.clearRightBtn = document.getElementById('clearRight');
        this.ignoreWhitespace = document.getElementById('ignoreWhitespace');
        this.ignoreCase = document.getElementById('ignoreCase');
        this.stats = document.getElementById('stats');
        this.addedCount = document.getElementById('addedCount');
        this.removedCount = document.getElementById('removedCount');
        this.unchangedCount = document.getElementById('unchangedCount');
        this.resultPanel = document.getElementById('resultPanel');
        this.diffOutput = document.getElementById('diffOutput');
        this.noDiff = document.getElementById('noDiff');
        this.viewBtns = document.querySelectorAll('.view-btn');
    }

    bindEvents() {
        this.compareBtn.addEventListener('click', () => this.compare());
        this.swapBtn.addEventListener('click', () => this.swap());
        this.clearLeftBtn.addEventListener('click', () => {
            this.leftText.value = '';
            this.hideResults();
        });
        this.clearRightBtn.addEventListener('click', () => {
            this.rightText.value = '';
            this.hideResults();
        });

        this.viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.viewBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.viewMode = btn.dataset.view;
                this.compare();
            });
        });

        // Auto-compare on option change
        this.ignoreWhitespace.addEventListener('change', () => {
            if (this.leftText.value && this.rightText.value) this.compare();
        });
        this.ignoreCase.addEventListener('change', () => {
            if (this.leftText.value && this.rightText.value) this.compare();
        });
    }

    swap() {
        const temp = this.leftText.value;
        this.leftText.value = this.rightText.value;
        this.rightText.value = temp;
        if (this.leftText.value || this.rightText.value) {
            this.compare();
        }
    }

    hideResults() {
        this.stats.style.display = 'none';
        this.resultPanel.style.display = 'none';
        this.noDiff.style.display = 'none';
    }

    compare() {
        let left = this.leftText.value;
        let right = this.rightText.value;

        if (!left && !right) {
            this.hideResults();
            return;
        }

        // Apply options
        if (this.ignoreWhitespace.checked) {
            left = left.replace(/\s+/g, ' ').trim();
            right = right.replace(/\s+/g, ' ').trim();
        }

        if (this.ignoreCase.checked) {
            left = left.toLowerCase();
            right = right.toLowerCase();
        }

        // Split into lines
        const leftLines = left.split('\n');
        const rightLines = right.split('\n');

        // Compute diff using Myers algorithm (simplified LCS approach)
        const diff = this.computeDiff(leftLines, rightLines);

        // Count stats
        let added = 0, removed = 0, unchanged = 0;
        diff.forEach(d => {
            if (d.type === 'added') added++;
            else if (d.type === 'removed') removed++;
            else unchanged++;
        });

        this.addedCount.textContent = added;
        this.removedCount.textContent = removed;
        this.unchangedCount.textContent = unchanged;
        this.stats.style.display = 'flex';

        // Check if identical
        if (added === 0 && removed === 0) {
            this.resultPanel.style.display = 'none';
            this.noDiff.style.display = 'block';
            return;
        }

        this.noDiff.style.display = 'none';
        this.resultPanel.style.display = 'block';

        // Render diff
        if (this.viewMode === 'unified') {
            this.renderUnified(diff);
        } else {
            this.renderSplit(diff);
        }
    }

    computeDiff(left, right) {
        // LCS-based diff algorithm
        const m = left.length;
        const n = right.length;

        // Build LCS table
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (left[i - 1] === right[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        // Backtrack to build diff
        const diff = [];
        let i = m, j = n;

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && left[i - 1] === right[j - 1]) {
                diff.unshift({
                    type: 'unchanged',
                    leftLine: i,
                    rightLine: j,
                    content: left[i - 1]
                });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                diff.unshift({
                    type: 'added',
                    rightLine: j,
                    content: right[j - 1]
                });
                j--;
            } else {
                diff.unshift({
                    type: 'removed',
                    leftLine: i,
                    content: left[i - 1]
                });
                i--;
            }
        }

        return diff;
    }

    renderUnified(diff) {
        this.diffOutput.classList.remove('split');
        this.diffOutput.innerHTML = diff.map(d => {
            const prefix = d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' ';
            const lineNum = d.type === 'removed' ? d.leftLine : d.rightLine || '';
            return `<div class="diff-line ${d.type}"><span class="line-number">${lineNum}</span><span class="prefix">${prefix}</span>${this.escapeHtml(d.content)}</div>`;
        }).join('');
    }

    renderSplit(diff) {
        this.diffOutput.classList.add('split');

        const leftLines = [];
        const rightLines = [];

        diff.forEach(d => {
            if (d.type === 'unchanged') {
                leftLines.push(`<div class="diff-line unchanged"><span class="line-number">${d.leftLine}</span>${this.escapeHtml(d.content)}</div>`);
                rightLines.push(`<div class="diff-line unchanged"><span class="line-number">${d.rightLine}</span>${this.escapeHtml(d.content)}</div>`);
            } else if (d.type === 'removed') {
                leftLines.push(`<div class="diff-line removed"><span class="line-number">${d.leftLine}</span>${this.escapeHtml(d.content)}</div>`);
                rightLines.push(`<div class="diff-line" style="opacity: 0.3;"><span class="line-number"></span></div>`);
            } else {
                leftLines.push(`<div class="diff-line" style="opacity: 0.3;"><span class="line-number"></span></div>`);
                rightLines.push(`<div class="diff-line added"><span class="line-number">${d.rightLine}</span>${this.escapeHtml(d.content)}</div>`);
            }
        });

        this.diffOutput.innerHTML = `
            <div class="split-panel">${leftLines.join('')}</div>
            <div class="split-panel">${rightLines.join('')}</div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new DiffChecker();
});
