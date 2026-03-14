/* ─── Utility Plugin ─── */
CubDeck.registerPlugin({
    id: 'utility',
    name: 'Utility',
    icon: '🔧',
    actions: [
        {
            id: 'open-url',
            name: 'Open URL',
            icon: '🌐',
            settings: [
                { key: 'url', label: 'URL', type: 'text', placeholder: 'https://...' },
                { key: 'new_tab', label: 'Open in new tab', type: 'checkbox' }
            ],
            async execute(s) {
                if (!s.url) throw new Error('No URL set');
                window.open(s.url, s.new_tab ? '_blank' : '_self');
            }
        },
        {
            id: 'copy-text',
            name: 'Copy Text to Clipboard',
            icon: '📋',
            settings: [{ key: 'text', label: 'Text to Copy', type: 'text', placeholder: 'Any text' }],
            async execute(s, ctx) {
                if (!s.text) throw new Error('No text set');
                await navigator.clipboard.writeText(s.text);
                ctx.showToast('Copied!', 'success');
            }
        },
        {
            id: 'wait',
            name: 'Wait / Delay',
            icon: '⏳',
            settings: [
                { key: 'hours',   label: 'Hours',   type: 'number', min: 0, max: 23, default: 0 },
                { key: 'minutes', label: 'Minutes', type: 'number', min: 0, max: 59, default: 5 },
                { key: 'seconds', label: 'Seconds', type: 'number', min: 0, max: 59, default: 0 }
            ],
            async execute(s, ctx) {
                const h   = parseInt(s.hours)   || 0;
                const m   = parseInt(s.minutes) || 0;
                const sec = parseInt(s.seconds) || 0;
                const totalMs = (h * 3600 + m * 60 + sec) * 1000;
                if (totalMs <= 0) return;

                // Show a live countdown toast that updates every second
                let remaining = Math.round(totalMs / 1000);

                function fmtRemaining(secs) {
                    const rh = Math.floor(secs / 3600);
                    const rm = Math.floor((secs % 3600) / 60);
                    const rs = secs % 60;
                    const parts = [];
                    if (rh) parts.push(`${rh}h`);
                    if (rm || rh) parts.push(`${rm}m`);
                    parts.push(`${rs}s`);
                    return parts.join(' ');
                }

                // Create a persistent toast element for the countdown
                const toastId = '_wait_toast_' + Date.now();
                const toastEl = document.createElement('div');
                toastEl.id = toastId;
                toastEl.className = 'cd-toast cd-toast-info';
                toastEl.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;background:rgba(30,30,50,.95);border:1px solid rgba(88,101,242,.5);color:#a5b4fc;pointer-events:none;white-space:nowrap;';
                toastEl.textContent = '⏳ ' + fmtRemaining(remaining);
                document.body.appendChild(toastEl);

                const tick = setInterval(() => {
                    remaining--;
                    if (remaining <= 0) {
                        clearInterval(tick);
                        toastEl.remove();
                    } else {
                        toastEl.textContent = '⏳ ' + fmtRemaining(remaining);
                    }
                }, 1000);

                await new Promise(resolve => setTimeout(resolve, totalMs));
                clearInterval(tick);
                toastEl.remove();
            }
        },
        {
            id: 'label',
            name: 'Label / Separator',
            icon: '🏷️',
            settings: [],
            async execute() { /* non-interactive */ }
        },
        {
            id: 'blank',
            name: 'Blank Button',
            icon: '⬜',
            settings: [],
            async execute() { }
        },
        {
            id: 'refresh-deck',
            name: 'Reload Page',
            icon: '🔄',
            settings: [],
            async execute() {
                if (confirm('Reload CubDeck?')) window.location.reload();
            }
        },
        {
            id: 'fullscreen',
            name: 'Toggle Fullscreen',
            icon: '⛶',
            settings: [],
            async execute() {
                if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
                else document.exitFullscreen().catch(() => {});
            }
        },
        {
            id: 'lock',
            name: 'Lock Deck (go to landing)',
            icon: '🔒',
            settings: [],
            async execute() {
                if (confirm('Go back to the CubDeck home page?')) window.location.href = '/cubdeck/auth/logout';
            }
        },
        {
            id: 'obs-settings',
            name: 'Open OBS Settings',
            icon: '⚙️',
            settings: [],
            async execute(s, ctx) {
                document.getElementById('settingsModal').classList.add('open');
            }
        },
        {
            id: 'switch-page',
            name: 'Switch Page',
            icon: '📄',
            settings: [{ key: 'page_index', label: 'Page Number (starting at 1)', type: 'number', min: 1, default: 1 }],
            async execute(s, ctx) {
                const idx = (parseInt(s.page_index) || 1) - 1;
                const tab = document.querySelectorAll('.cd-page-tab')[idx];
                if (tab) tab.click();
                else throw new Error('Page ' + (idx + 1) + ' does not exist');
            }
        },
        {
            id: 'show-time',
            name: 'Show Current Time',
            icon: '🕐',
            settings: [{ key: 'format', label: 'Format', type: 'select', options: [{value:'24h',label:'24-hour'},{value:'12h',label:'12-hour'}], default: '24h' }],
            getState(s) {
                const now = new Date();
                let t;
                if (s.format === '12h') {
                    t = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                } else {
                    t = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                }
                return { sub: t };
            },
            async execute() { }
        },
        {
            id: 'show-date',
            name: 'Show Current Date',
            icon: '📅',
            settings: [],
            getState() {
                const now = new Date();
                return { sub: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) };
            },
            async execute() { }
        }
    ]
});

// Tick clock buttons every second
setInterval(() => {
    // Clock buttons update via getState on next refresh cycle
}, 1000);
