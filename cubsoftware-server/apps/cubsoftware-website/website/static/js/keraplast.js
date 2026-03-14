// Keraplast Digestion Calculator

// Password Protection (server-side validation)
async function checkPassword() {
    const input = document.getElementById('passwordInput');
    const error = document.getElementById('passwordError');

    if (!input.value.trim()) {
        error.textContent = 'Please enter a password';
        return;
    }

    try {
        const response = await fetch('/api/keraplast/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: input.value.trim() })
        });

        const data = await response.json();

        if (data.valid) {
            document.body.classList.add('authenticated');
            sessionStorage.setItem('keraplast-auth', input.value.trim());
            sessionStorage.setItem('keraplast-is-admin', data.is_admin ? '1' : '0');
            error.textContent = '';
            startSync();
            loadOffsets();
            if (data.is_admin) renderAdminPanels();
        } else {
            error.textContent = 'Incorrect password';
            input.value = '';
            input.focus();
        }
    } catch (err) {
        error.textContent = 'Failed to verify password';
    }
}

// Focus password input on load
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('passwordInput').focus();
});

// ============================================================
// Calculator Definitions
// ============================================================

const calcs = {
    keraplast: {
        steps: [
            { id: 'time-start',   offset: 0,   name: 'Recirculation Start Time' },
            { id: 'time-ph1',     offset: 5,   name: 'PH Test' },
            { id: 'time-25hz',    offset: 25,  name: 'Mixer Consistently 25hz' },
            { id: 'time-ph2',     offset: 30,  name: 'PH Test' },
            { id: 'time-30hz',    offset: 45,  name: 'Mixer Consistently 30hz' },
            { id: 'time-testph',  offset: 80,  name: 'Wool Test & PH Test' },
            { id: 'time-test1',   offset: 120, name: 'Wool Test' },
            { id: 'time-test2',   offset: 180, name: 'Wool Test' },
            { id: 'time-finish',  offset: 210, name: 'Finish & Transfer Digestion Liquor' }
        ],
        startTimeId:   'startTime',
        finishTimeId:  'finishTime',
        finishSummaryId:'keraplast-finishSummary',
        finishDurationId:'keraplast-finishDuration',
        finishStepId:  'keraplast-finishStep',
        timerStatusId: 'timerStatus',
        startBtnId:    'startTimerBtn',
        stopBtnId:     'stopTimerBtn',
        tabPaneId:     'tab-keraplast',
        storageKey:    'keraplast-start-time',
        batchNumberId: 'batchNumber',
        operatorId:    'keraplast-operator',
        totalTimeId:   'keraplast-totalTime',
        state: {
            timerInterval:   null,
            active:          false,
            triggeredSteps:  new Set()
        }
    },
    okl: {
        steps: [
            { id: 'okl-time-start',  offset: 0,   name: 'Start' },
            { id: 'okl-time-rinse',  offset: 0,   name: 'Rinse Lid & Sparge' },
            { id: 'okl-time-35hz',   offset: 15,  name: 'Mixer 35 Hz' },
            { id: 'okl-time-temp',   offset: 30,  name: 'Temperature Check' },
            { id: 'okl-time-ph',     offset: 50,  name: 'PH Test' },
            { id: 'okl-time-80min',  offset: 80,  name: '80 Minute Wool Test 1' },
            { id: 'okl-time-test1',  offset: 95,  name: 'Wool Test 2' },
            { id: 'okl-time-test2',  offset: 110, name: 'Wool Test 3' },
            { id: 'okl-time-test3',  offset: 125, name: 'Wool Test 4' }
        ],
        startTimeId:   'okl-startTime',
        finishTimeId:  'okl-finishTime',
        finishSummaryId:'okl-finishSummary',
        finishDurationId:'okl-finishDuration',
        finishStepId:  'okl-finishStep',
        timerStatusId: 'okl-timerStatus',
        startBtnId:    'okl-startTimerBtn',
        stopBtnId:     'okl-stopTimerBtn',
        tabPaneId:     'tab-okl',
        storageKey:    'okl-start-time',
        batchNumberId: 'okl-batchNumber',
        operatorId:    'okl-operator',
        totalTimeId:   'okl-totalTime',
        state: {
            timerInterval:   null,
            active:          false,
            triggeredSteps:  new Set()
        }
    }
};

// ============================================================
// Real-time Shared State Sync
// ============================================================

let lastServerUpdate = 0;
let syncingFromServer = false;
const syncDebounceTimers = {};

function _buildStatePayload(calcId, password) {
    const calc = calcs[calcId];
    return {
        password,
        calc_type: calcId,
        start_time: document.getElementById(calc.startTimeId).value,
        finish_time: document.getElementById(calc.finishTimeId).value,
        batch_number: document.getElementById(calc.batchNumberId).value,
        operator: document.getElementById(calc.operatorId).value,
        timer_active: calc.state.active,
        triggered_steps: [...calc.state.triggeredSteps]
    };
}

// Debounced push — for field input changes
function pushState(calcId) {
    if (syncingFromServer) return;
    const password = sessionStorage.getItem('keraplast-auth');
    if (!password) return;
    clearTimeout(syncDebounceTimers[calcId]);
    syncDebounceTimers[calcId] = setTimeout(() => {
        fetch('/api/keraplast/state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(_buildStatePayload(calcId, password))
        }).catch(() => {});
    }, 800);
}

// Immediate push — for timer start/stop/step events
function pushStateNow(calcId) {
    if (syncingFromServer) return;
    const password = sessionStorage.getItem('keraplast-auth');
    if (!password) return;
    clearTimeout(syncDebounceTimers[calcId]); // Cancel any pending debounce
    fetch('/api/keraplast/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(_buildStatePayload(calcId, password))
    }).catch(() => {});
}

async function pollState() {
    const password = sessionStorage.getItem('keraplast-auth');
    if (!password) return;
    try {
        const response = await fetch('/api/keraplast/state', {
            headers: { 'X-Keraplast-Password': password }
        });
        if (!response.ok) return;
        const data = await response.json();
        if (data.last_updated <= lastServerUpdate) return;
        lastServerUpdate = data.last_updated;
        syncingFromServer = true;
        ['keraplast', 'okl'].forEach(calcId => {
            const s = data[calcId];
            if (!s) return;
            const calc = calcs[calcId];

            // Sync fields
            const startEl  = document.getElementById(calc.startTimeId);
            const finishEl = document.getElementById(calc.finishTimeId);
            const batchEl  = document.getElementById(calc.batchNumberId);
            const opEl     = document.getElementById(calc.operatorId);
            if (startEl.value !== s.start_time) {
                startEl.value = s.start_time;
                calculateTimes(calcId);
            }
            if (finishEl.value !== s.finish_time) {
                finishEl.value = s.finish_time;
                calculateFinish(calcId);
            }
            if (batchEl && batchEl.value !== s.batch_number) batchEl.value = s.batch_number;
            if (opEl && opEl.value !== s.operator) opEl.value = s.operator;

            // Sync triggered steps BEFORE syncing timer (prevents re-alerting already-done steps)
            if (Array.isArray(s.triggered_steps)) {
                s.triggered_steps.forEach(id => calc.state.triggeredSteps.add(id));
            }

            // Sync timer active state
            if (s.timer_active && !calc.state.active) {
                startTimer(calcId); // syncingFromServer=true so won't clear triggeredSteps or push back
            } else if (!s.timer_active && calc.state.active) {
                stopTimer(calcId);
            }
        });
        syncingFromServer = false;
    } catch (e) { /* silently ignore */ }
}

let syncInterval = null;
function startSync() {
    if (syncInterval) return;
    pollState();
    syncInterval = setInterval(pollState, 2000);
}

// ============================================================
// Tab Switching
// ============================================================

function switchTab(tabId) {
    document.querySelectorAll('.calc-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.calc-tab[data-tab="${tabId}"]`).classList.add('active');

    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

// ============================================================
// Shared Audio System
// ============================================================

let audioContext = null;
let soundLoopInterval = null;
let pendingAcknowledgement = null;
let currentSound = 'chime';

const sounds = {
    chime: {
        name: 'Chime',
        play: (ctx) => {
            const now = ctx.currentTime;
            playTone(ctx, 523.25, now, 0.15, 'sine');
            playTone(ctx, 659.25, now + 0.15, 0.15, 'sine');
            playTone(ctx, 783.99, now + 0.3, 0.3, 'sine');
        }
    },
    alert: {
        name: 'Alert',
        play: (ctx) => {
            const now = ctx.currentTime;
            playTone(ctx, 880, now, 0.1, 'square');
            playTone(ctx, 880, now + 0.15, 0.1, 'square');
            playTone(ctx, 880, now + 0.3, 0.1, 'square');
        }
    },
    bell: {
        name: 'Bell',
        play: (ctx) => {
            const now = ctx.currentTime;
            playTone(ctx, 1200, now, 0.4, 'sine');
            playTone(ctx, 600, now, 0.5, 'sine');
        }
    },
    alarm: {
        name: 'Alarm',
        play: (ctx) => {
            const now = ctx.currentTime;
            for (let i = 0; i < 3; i++) {
                playTone(ctx, 800, now + i * 0.2, 0.1, 'sawtooth');
                playTone(ctx, 600, now + i * 0.2 + 0.1, 0.1, 'sawtooth');
            }
        }
    },
    gentle: {
        name: 'Gentle',
        play: (ctx) => {
            const now = ctx.currentTime;
            playTone(ctx, 392, now, 0.3, 'sine');
            playTone(ctx, 440, now + 0.3, 0.3, 'sine');
        }
    },
    urgent: {
        name: 'Urgent',
        play: (ctx) => {
            const now = ctx.currentTime;
            for (let i = 0; i < 5; i++) {
                playTone(ctx, 1000, now + i * 0.12, 0.06, 'square');
            }
        }
    }
};

function playTone(ctx, frequency, startTime, duration, type) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(0.3, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
}

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
}

function playNotificationSound() {
    try {
        const ctx = initAudioContext();
        sounds[currentSound].play(ctx);
    } catch (e) {
        console.log('Audio not supported:', e);
    }
}

function startSoundLoop(stepName, stepTime) {
    stopSoundLoop();
    pendingAcknowledgement = { stepName, stepTime };
    playNotificationSound();
    soundLoopInterval = setInterval(() => {
        playNotificationSound();
    }, 2000);
    showAcknowledgeModal(stepName, stepTime);
}

function stopSoundLoop() {
    if (soundLoopInterval) {
        clearInterval(soundLoopInterval);
        soundLoopInterval = null;
    }
    pendingAcknowledgement = null;
    hideAcknowledgeModal();
}

function acknowledgeAlert() {
    stopSoundLoop();
}

function showAcknowledgeModal(stepName, stepTime) {
    const modal = document.getElementById('acknowledgeModal');
    document.getElementById('alertStepName').textContent = stepName;
    document.getElementById('alertStepTime').textContent = stepTime;
    modal.classList.add('show');
}

function hideAcknowledgeModal() {
    document.getElementById('acknowledgeModal').classList.remove('show');
}

function changeSound(value) {
    currentSound = value;
    localStorage.setItem('keraplast-sound', value);
    // Keep both selectors in sync
    const k = document.getElementById('soundSelect');
    const o = document.getElementById('okl-soundSelect');
    if (k) k.value = value;
    if (o) o.value = value;
}

function testSound() {
    playNotificationSound();
}

// ============================================================
// Time Utilities
// ============================================================

function addMinutes(time, minutes) {
    const [hours, mins] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + mins + minutes;
    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMins = totalMinutes % 60;
    return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

function timeToMinutes(time) {
    const [hours, mins] = time.split(':').map(Number);
    return hours * 60 + mins;
}

function getCurrentTimeString() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// ============================================================
// Calculator Logic (per-calculator via calcId)
// ============================================================

function calculateTimes(calcId) {
    const calc = calcs[calcId];
    const startTime = document.getElementById(calc.startTimeId).value;

    if (!startTime) return;

    calc.steps.forEach((step, i) => {
        const calculatedTime = addMinutes(startTime, step.offset);
        const element = document.getElementById(step.id);
        if (element) {
            element.textContent = calculatedTime;
            element.classList.add('updated');
            setTimeout(() => element.classList.remove('updated'), 300);

            // Keep the offset column and data-offset in sync with actual offsets
            const row = element.closest('.step-row');
            if (row) {
                row.dataset.offset = step.offset;
                const offsetSpan = row.querySelector('.step-offset');
                if (offsetSpan) {
                    if (i === 0) {
                        offsetSpan.textContent = '-';
                    } else {
                        const relative = step.offset - calc.steps[i - 1].offset;
                        offsetSpan.textContent = relative >= 0 ? `+${relative}` : `${relative}`;
                    }
                }
            }
        }
    });

    // Update total duration display
    const totalEl = document.getElementById(calc.totalTimeId);
    if (totalEl) {
        const totalMins = calc.steps[calc.steps.length - 1].offset - calc.steps[0].offset;
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        const humanText = h > 0
            ? `${h} hour${h !== 1 ? 's' : ''} ${m} minute${m !== 1 ? 's' : ''}`
            : `${m} minute${m !== 1 ? 's' : ''}`;
        totalEl.querySelector('strong').textContent = humanText;
        totalEl.querySelector('.total-minutes').textContent = `${totalMins} minutes`;
    }

    localStorage.setItem(calc.storageKey, startTime);

    if (calc.state.active) {
        calc.state.triggeredSteps.clear();
        updateStepHighlights(calcId);
    }

    calculateFinish(calcId);
}

function calculateFinish(calcId) {
    const calc = calcs[calcId];
    const startEl  = document.getElementById(calc.startTimeId);
    const finishEl = document.getElementById(calc.finishTimeId);
    const summaryEl = document.getElementById(calc.finishSummaryId);

    // Remove any existing finish marker
    document.getElementById(calc.tabPaneId).querySelectorAll('.step-row').forEach(row => {
        row.classList.remove('step-finish-marker');
    });

    if (!finishEl.value || !startEl.value) {
        summaryEl.classList.remove('visible');
        return;
    }

    const startMins  = timeToMinutes(startEl.value);
    let   finishMins = timeToMinutes(finishEl.value);

    // Handle overnight wrap
    if (finishMins < startMins) finishMins += 24 * 60;

    const elapsed = finishMins - startMins;
    if (elapsed <= 0) {
        summaryEl.classList.remove('visible');
        return;
    }

    const hours = Math.floor(elapsed / 60);
    const mins  = elapsed % 60;
    const durationText = hours > 0
        ? `${hours}h ${mins}m (${elapsed} minutes)`
        : `${elapsed} minutes`;

    // Find the last step whose offset <= elapsed (i.e. step in progress at finish)
    let lastStep = null;
    for (const step of calc.steps) {
        if (step.offset <= elapsed) lastStep = step;
    }

    // Highlight that step row
    if (lastStep) {
        const el = document.getElementById(lastStep.id);
        if (el) el.closest('.step-row').classList.add('step-finish-marker');
    }

    document.getElementById(calc.finishDurationId).textContent = durationText;
    document.getElementById(calc.finishStepId).textContent     = lastStep ? lastStep.name : 'Before first step';
    summaryEl.classList.add('visible');
}

function updateStepHighlights(calcId) {
    const calc = calcs[calcId];
    const startTime = document.getElementById(calc.startTimeId).value;
    const currentTime = getCurrentTimeString();
    const currentMinutes = timeToMinutes(currentTime);

    calc.steps.forEach(step => {
        const stepTime = addMinutes(startTime, step.offset);
        const stepMinutes = timeToMinutes(stepTime);
        const row = document.getElementById(step.id).closest('.step-row');

        row.classList.remove('step-active', 'step-completed', 'step-upcoming');

        if (calc.state.triggeredSteps.has(step.id) || currentMinutes >= stepMinutes) {
            row.classList.add('step-completed');
        } else {
            const nextStep = calc.steps.find(s => {
                const sTime = addMinutes(startTime, s.offset);
                return timeToMinutes(sTime) > currentMinutes && !calc.state.triggeredSteps.has(s.id);
            });
            if (nextStep && nextStep.id === step.id) {
                row.classList.add('step-active');
            } else {
                row.classList.add('step-upcoming');
            }
        }
    });
}

function checkTimers(calcId) {
    const calc = calcs[calcId];
    const startTime = document.getElementById(calc.startTimeId).value;
    const currentTime = getCurrentTimeString();
    const currentMinutes = timeToMinutes(currentTime);

    calc.steps.forEach(step => {
        const stepTime = addMinutes(startTime, step.offset);
        const stepMinutes = timeToMinutes(stepTime);

        if (currentMinutes === stepMinutes && !calc.state.triggeredSteps.has(step.id)) {
            calc.state.triggeredSteps.add(step.id);
            startSoundLoop(step.name, stepTime);
            showNotification(step.name, stepTime);
            highlightStep(step.id);
            pushStateNow(calcId); // Tell other devices this step has fired
        }
    });

    updateStepHighlights(calcId);
    updateTimerDisplay(calcId);
}

function highlightStep(stepId) {
    const element = document.getElementById(stepId);
    if (element) {
        const row = element.closest('.step-row');
        row.classList.add('step-triggered');
        setTimeout(() => row.classList.remove('step-triggered'), 3000);
    }
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.toggle('toast-error', isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), isError ? 4000 : 5000);
}

function showNotification(stepName, time) {
    showToast(`${stepName} - ${time}`);

    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Keraplast Timer', {
            body: `${stepName} - ${time}`,
            icon: '/static/images/company-logo.png'
        });
    }
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Format a Date object → "05/March/2026"
function formatDate(dateObj) {
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${day}/${MONTH_NAMES[dateObj.getMonth()]}/${dateObj.getFullYear()}`;
}

// Convert an already-saved numeric date string "05/03/2026" → "05/March/2026"
// Leaves already-named dates (e.g. "05/March/2026") unchanged
function normaliseDateStr(str) {
    if (!str || str === '—') return str;
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
        const monthIdx = parseInt(m[2], 10) - 1;
        if (monthIdx >= 0 && monthIdx < 12) {
            return `${m[1].padStart(2,'0')}/${MONTH_NAMES[monthIdx]}/${m[3]}`;
        }
    }
    return str;
}

async function saveToHistory(calcId) {
    const calc = calcs[calcId];
    const startTime = document.getElementById(calc.startTimeId).value;
    const finishTime = document.getElementById(calc.finishTimeId).value;
    const batchNumber = document.getElementById(calc.batchNumberId).value.trim();
    const operator = document.getElementById(calc.operatorId).value.trim();

    if (!startTime) { showToast('Please enter a start time', true); return; }
    if (!batchNumber) { showToast('Please enter a batch number', true); return; }
    if (!operator) { showToast('Please enter an operator name', true); return; }

    const password = sessionStorage.getItem('keraplast-auth');
    if (!password) { showToast('Authentication required — please refresh', true); return; }

    const calcLabel = calcId === 'keraplast' ? 'Keraplast Digestion' : 'OKL Digestion';
    let results = `${calcLabel} | Start: ${startTime}`;
    const durationEl = document.getElementById(calc.finishDurationId);
    if (finishTime) {
        results += ` → Finish: ${finishTime}`;
        if (durationEl && durationEl.textContent !== '--') {
            results += ` (${durationEl.textContent})`;
        }
    }

    // Build step times for the detail page
    const stepTimes = calc.steps.map(step => ({
        name: step.name,
        offset: step.offset,
        time: addMinutes(startTime, step.offset)
    }));

    const now = new Date();
    const date = formatDate(now);

    try {
        const response = await fetch('/api/keraplast/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, calc_type: calcId, batch_number: batchNumber, operator, start_time: startTime, finish_time: finishTime || null, results, date, step_times: stepTimes })
        });
        const data = await response.json();
        if (data.success) {
            showToast('Saved to history!');
        } else {
            showToast(data.error || 'Failed to save', true);
        }
    } catch (err) {
        showToast('Failed to save to history', true);
    }
}

function updateTimerDisplay(calcId) {
    const calc = calcs[calcId];
    const timerStatus = document.getElementById(calc.timerStatusId);
    if (!timerStatus) return;

    if (calc.state.active) {
        const startTime = document.getElementById(calc.startTimeId).value;
        const currentTime = getCurrentTimeString();

        const nextStep = calc.steps.find(step => {
            const stepTime = addMinutes(startTime, step.offset);
            return timeToMinutes(stepTime) > timeToMinutes(currentTime) && !calc.state.triggeredSteps.has(step.id);
        });

        if (nextStep) {
            const stepTime = addMinutes(startTime, nextStep.offset);
            const minutesUntil = timeToMinutes(stepTime) - timeToMinutes(currentTime);
            timerStatus.innerHTML = `<span class="status-active">Timer Active</span> - Next: <strong>${nextStep.name}</strong> in <strong>${minutesUntil} min</strong>`;
        } else {
            timerStatus.innerHTML = `<span class="status-complete">All steps completed!</span>`;
        }
    } else {
        timerStatus.innerHTML = `<span class="status-inactive">Timer inactive</span>`;
    }
}

function startTimer(calcId) {
    const calc = calcs[calcId];
    if (calc.state.active) return;

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    initAudioContext();
    requestWakeLock();

    calc.state.active = true;
    // Only clear triggered steps for a fresh local start, not when syncing from server
    // (server already sent the correct triggered_steps, cleared above in pollState)
    if (!syncingFromServer) calc.state.triggeredSteps.clear();

    checkTimers(calcId);
    calc.state.timerInterval = setInterval(() => checkTimers(calcId), 1000);

    document.getElementById(calc.startBtnId).style.display = 'none';
    document.getElementById(calc.stopBtnId).style.display = 'inline-block';

    updateTimerDisplay(calcId);
    pushStateNow(calcId); // Sync timer start to other devices
}

function stopTimer(calcId) {
    const calc = calcs[calcId];
    calc.state.active = false;

    if (calc.state.timerInterval) {
        clearInterval(calc.state.timerInterval);
        calc.state.timerInterval = null;
    }

    stopSoundLoop();
    releaseWakeLock();

    calc.state.triggeredSteps.clear();

    document.getElementById(calc.tabPaneId).querySelectorAll('.step-row').forEach(row => {
        row.classList.remove('step-active', 'step-completed', 'step-upcoming', 'step-triggered');
        // Preserve step-finish-marker — it belongs to the finish time input, not the timer
    });

    document.getElementById(calc.startBtnId).style.display = 'inline-block';
    document.getElementById(calc.stopBtnId).style.display = 'none';

    updateTimerDisplay(calcId);
    pushStateNow(calcId); // Sync timer stop to other devices
}

function resetTimer(calcId) {
    stopTimer(calcId);

    const calc = calcs[calcId];
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    document.getElementById(calc.startTimeId).value = currentTime;

    // Clear batch number and operator
    document.getElementById(calc.batchNumberId).value = '';
    document.getElementById(calc.operatorId).value = '';

    // Clear finish time and summary
    const finishEl = document.getElementById(calc.finishTimeId);
    if (finishEl) finishEl.value = '';
    document.getElementById(calc.finishSummaryId).classList.remove('visible');
    document.getElementById(calc.tabPaneId).querySelectorAll('.step-row').forEach(row => {
        row.classList.remove('step-finish-marker');
    });

    calculateTimes(calcId);
    startTimer(calcId);
    // startTimer already calls pushStateNow, but we also need to push the new start time
    pushStateNow(calcId);
}

// ============================================================
// Wake Lock
// ============================================================

let wakeLock = null;

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                console.log('Wake lock released');
            });
        } catch (e) {
            console.log('Wake lock not available:', e);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
}

// ============================================================
// Offsets (custom step timings)
// ============================================================

async function loadOffsets() {
    const password = sessionStorage.getItem('keraplast-auth');
    if (!password) return;
    try {
        const response = await fetch('/api/keraplast/offsets', {
            headers: { 'X-Keraplast-Password': password }
        });
        if (!response.ok) return;
        const data = await response.json();
        if (data && Object.keys(data).length > 0) applyOffsets(data);
    } catch (e) {}
}

function applyOffsets(offsetData) {
    ['keraplast', 'okl'].forEach(calcId => {
        const calcOffsets = offsetData[calcId];
        if (!calcOffsets) return;
        calcs[calcId].steps.forEach(step => {
            if (calcOffsets[step.id] !== undefined) {
                step.offset = Number(calcOffsets[step.id]);
            }
        });
        calculateTimes(calcId);
    });
}

async function saveOffsets(calcId) {
    const password = sessionStorage.getItem('keraplast-auth');
    if (!password) return;

    const offsets = {};
    offsets[calcId] = {};
    const panel = document.getElementById(`${calcId}-adminPanel`);
    panel.querySelectorAll('.offset-input').forEach(input => {
        offsets[calcId][input.dataset.stepId] = parseInt(input.value, 10) || 0;
    });

    try {
        const response = await fetch('/api/keraplast/offsets', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, offsets })
        });
        const data = await response.json();
        if (data.success) {
            applyOffsets(offsets);
            showToast('Offsets saved!');
        } else {
            showToast(data.error || 'Failed to save offsets', true);
        }
    } catch (e) {
        showToast('Failed to save offsets', true);
    }
}

async function resetOffsets(calcId) {
    if (!confirm('Reset offsets to defaults?')) return;
    const password = sessionStorage.getItem('keraplast-auth');
    if (!password) return;
    try {
        await fetch('/api/keraplast/offsets', {
            method: 'DELETE',
            headers: { 'X-Keraplast-Password': password }
        });
        // Restore JS defaults
        const defaults = { keraplast: [0,5,25,30,45,80,120,180,210], okl: [0,0,15,30,50,80,95,110,125] };
        calcs[calcId].steps.forEach((step, i) => {
            step.offset = defaults[calcId][i];
        });
        calculateTimes(calcId);
        renderAdminPanels();
        showToast('Offsets reset to defaults');
    } catch (e) {
        showToast('Failed to reset offsets', true);
    }
}

// ============================================================
// Admin Panel
// ============================================================

function renderAdminPanels() {
    ['keraplast', 'okl'].forEach(calcId => renderAdminPanel(calcId));
}

function renderAdminPanel(calcId) {
    const panel = document.getElementById(`${calcId}-adminPanel`);
    if (!panel) return;
    const calc = calcs[calcId];

    let rows = calc.steps.map((step, i) => {
        const prevOffset = i > 0 ? calc.steps[i - 1].offset : 0;
        const relative = step.offset - prevOffset;
        return `
        <div class="admin-offset-row">
            <span class="admin-step-name">${step.name}</span>
            <div class="admin-offset-inputs">
                <label>From start (min)</label>
                <input type="number" class="offset-input admin-input" data-step-id="${step.id}"
                    value="${step.offset}" min="0" max="999"
                    oninput="previewOffset('${calcId}', this)">
                <span class="admin-offset-relative">(+${relative} from prev)</span>
            </div>
        </div>`;
    }).join('');

    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="admin-panel-header">
            <span class="admin-badge">Admin</span>
            <span class="admin-panel-title">Edit Step Offsets — ${calcId === 'keraplast' ? 'Digestion' : 'OKL'}</span>
        </div>
        <div class="admin-offsets-list">${rows}</div>
        <div class="admin-panel-actions">
            <button class="action-btn save-btn admin-save-btn" onclick="saveOffsets('${calcId}')">Save Offsets</button>
            <button class="action-btn secondary" onclick="resetOffsets('${calcId}')">Reset to Defaults</button>
        </div>`;
}

function previewOffset(calcId, input) {
    const stepId = input.dataset.stepId;
    const calc = calcs[calcId];
    const stepIndex = calc.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) return;

    const newOffset = parseInt(input.value, 10) || 0;
    const delta = newOffset - calc.steps[stepIndex].offset;

    // Update this step
    calc.steps[stepIndex].offset = newOffset;

    // Cascade: shift all subsequent steps by the same delta to keep relative gaps intact
    const panel = document.getElementById(`${calcId}-adminPanel`);
    const offsetInputs = panel.querySelectorAll('.offset-input');
    for (let i = stepIndex + 1; i < calc.steps.length; i++) {
        calc.steps[i].offset = Math.max(0, calc.steps[i].offset + delta);
        if (offsetInputs[i]) offsetInputs[i].value = calc.steps[i].offset;
    }

    calculateTimes(calcId);

    // Update "(+X from prev)" labels
    const relativeSpans = panel.querySelectorAll('.admin-offset-relative');
    calc.steps.forEach((s, i) => {
        const prevOffset = i > 0 ? calc.steps[i - 1].offset : 0;
        const relative = s.offset - prevOffset;
        if (relativeSpans[i]) relativeSpans[i].textContent = `(+${relative} from prev)`;
    });

    // If no start time entered, show offset values in step rows as feedback
    const startTime = document.getElementById(calc.startTimeId).value;
    if (!startTime) {
        calc.steps.forEach(s => {
            const el = document.getElementById(s.id);
            if (el) el.textContent = `+${s.offset}m`;
        });
    }
}

// ============================================================
// Initialisation
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('passwordInput').focus();

    // Load saved start times
    const savedKeraplast = localStorage.getItem('keraplast-start-time');
    if (savedKeraplast) {
        document.getElementById('startTime').value = savedKeraplast;
    }
    calculateTimes('keraplast');

    const savedOkl = localStorage.getItem('okl-start-time');
    if (savedOkl) {
        document.getElementById('okl-startTime').value = savedOkl;
    }
    calculateTimes('okl');

    // Load shared sound preference
    const savedSound = localStorage.getItem('keraplast-sound');
    if (savedSound && sounds[savedSound]) {
        currentSound = savedSound;
        document.getElementById('soundSelect').value = savedSound;
        document.getElementById('okl-soundSelect').value = savedSound;
    }

    updateTimerDisplay('keraplast');
    updateTimerDisplay('okl');

    // Auto-calculate when time inputs change + sync
    document.getElementById('startTime').addEventListener('change', () => { calculateTimes('keraplast'); pushState('keraplast'); });
    document.getElementById('okl-startTime').addEventListener('change', () => { calculateTimes('okl'); pushState('okl'); });

    // Finish time inputs + sync
    document.getElementById('finishTime').addEventListener('change', () => { calculateFinish('keraplast'); pushState('keraplast'); });
    document.getElementById('okl-finishTime').addEventListener('change', () => { calculateFinish('okl'); pushState('okl'); });

    // Batch/operator inputs sync
    ['batchNumber', 'keraplast-operator'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => pushState('keraplast'));
    });
    ['okl-batchNumber', 'okl-operator'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => pushState('okl'));
    });

    // Start sync if session is already authenticated (e.g. page refresh)
    if (sessionStorage.getItem('keraplast-auth')) {
        document.body.classList.add('authenticated');
        startSync();
        loadOffsets();
        if (sessionStorage.getItem('keraplast-is-admin') === '1') renderAdminPanels();
    }

    // Keep page alive hint when timer is running
    document.addEventListener('visibilitychange', () => {
        if ((calcs.keraplast.state.active || calcs.okl.state.active) && document.hidden) {
            console.log('Page hidden - timer still active');
        }
    });
});
