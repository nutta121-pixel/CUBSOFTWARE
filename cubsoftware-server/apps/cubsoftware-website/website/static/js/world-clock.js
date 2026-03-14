// World Clock JavaScript

class WorldClock {
    constructor() {
        this.clocks = [];
        this.updateInterval = null;

        this.initElements();
        this.bindEvents();
        this.loadSavedClocks();
        this.startUpdating();
        this.initPlannerTimezone();
        this.setDefaultPlannerDate();
    }

    initElements() {
        // Local time elements
        this.localTimeEl = document.getElementById('localTime');
        this.localDateEl = document.getElementById('localDate');
        this.localTimezoneEl = document.getElementById('localTimezone');

        // Add clock elements
        this.timezoneSelect = document.getElementById('timezoneSelect');
        this.addClockBtn = document.getElementById('addClockBtn');
        this.clocksGrid = document.getElementById('clocksGrid');

        // Meeting planner elements
        this.plannerDate = document.getElementById('plannerDate');
        this.plannerTime = document.getElementById('plannerTime');
        this.plannerTimezone = document.getElementById('plannerTimezone');
        this.plannerResults = document.getElementById('plannerResults');

        // Timezone data for city names
        this.timezoneNames = {
            'America/New_York': 'New York',
            'America/Chicago': 'Chicago',
            'America/Denver': 'Denver',
            'America/Los_Angeles': 'Los Angeles',
            'America/Toronto': 'Toronto',
            'America/Vancouver': 'Vancouver',
            'America/Mexico_City': 'Mexico City',
            'Europe/London': 'London',
            'Europe/Paris': 'Paris',
            'Europe/Berlin': 'Berlin',
            'Europe/Rome': 'Rome',
            'Europe/Madrid': 'Madrid',
            'Europe/Amsterdam': 'Amsterdam',
            'Europe/Moscow': 'Moscow',
            'Asia/Tokyo': 'Tokyo',
            'Asia/Shanghai': 'Shanghai',
            'Asia/Hong_Kong': 'Hong Kong',
            'Asia/Singapore': 'Singapore',
            'Asia/Seoul': 'Seoul',
            'Asia/Dubai': 'Dubai',
            'Asia/Kolkata': 'Mumbai',
            'Asia/Bangkok': 'Bangkok',
            'Australia/Sydney': 'Sydney',
            'Australia/Melbourne': 'Melbourne',
            'Australia/Perth': 'Perth',
            'Pacific/Auckland': 'Auckland',
            'Pacific/Fiji': 'Fiji',
            'America/Sao_Paulo': 'Sao Paulo',
            'America/Buenos_Aires': 'Buenos Aires',
            'America/Lima': 'Lima',
            'America/Bogota': 'Bogota',
            'Africa/Cairo': 'Cairo',
            'Africa/Johannesburg': 'Johannesburg',
            'Africa/Lagos': 'Lagos',
            'Africa/Nairobi': 'Nairobi'
        };
    }

    bindEvents() {
        this.addClockBtn.addEventListener('click', () => this.addClock());

        // Allow adding with Enter key
        this.timezoneSelect.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addClock();
        });

        // Meeting planner updates
        this.plannerDate.addEventListener('change', () => this.updatePlannerResults());
        this.plannerTime.addEventListener('change', () => this.updatePlannerResults());
        this.plannerTimezone.addEventListener('change', () => this.updatePlannerResults());
    }

    loadSavedClocks() {
        try {
            const saved = localStorage.getItem('worldClocks');
            if (saved) {
                this.clocks = JSON.parse(saved);
            }

            // If no saved clocks, add Auckland (NZ) as default
            if (this.clocks.length === 0) {
                this.clocks = ['Pacific/Auckland'];
                this.saveClocks();
            }

            this.renderClocks();
        } catch (e) {
            console.error('Error loading saved clocks:', e);
            // Add Auckland as fallback
            this.clocks = ['Pacific/Auckland'];
            this.renderClocks();
        }
    }

    saveClocks() {
        try {
            localStorage.setItem('worldClocks', JSON.stringify(this.clocks));
        } catch (e) {
            console.error('Error saving clocks:', e);
        }
    }

    startUpdating() {
        this.updateAllTimes();
        this.updateInterval = setInterval(() => this.updateAllTimes(), 1000);
    }

    updateAllTimes() {
        this.updateLocalTime();
        this.updateClockCards();
    }

    updateLocalTime() {
        const now = new Date();

        // Format time
        this.localTimeEl.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        // Format date
        this.localDateEl.textContent = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Get timezone name
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const offset = this.getTimezoneOffset(now, timezone);
        this.localTimezoneEl.textContent = `${timezone} (${offset})`;
    }

    getTimezoneOffset(date, timezone) {
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                timeZoneName: 'shortOffset'
            });
            const parts = formatter.formatToParts(date);
            const offsetPart = parts.find(p => p.type === 'timeZoneName');
            return offsetPart ? offsetPart.value : '';
        } catch (e) {
            return '';
        }
    }

    addClock() {
        const timezone = this.timezoneSelect.value;
        if (!timezone) return;

        // Check if already added
        if (this.clocks.includes(timezone)) {
            this.timezoneSelect.value = '';
            return;
        }

        this.clocks.push(timezone);
        this.saveClocks();
        this.renderClocks();
        this.updatePlannerTimezoneOptions();
        this.updatePlannerResults();
        this.timezoneSelect.value = '';
    }

    removeClock(timezone) {
        this.clocks = this.clocks.filter(tz => tz !== timezone);
        this.saveClocks();
        this.renderClocks();
        this.updatePlannerTimezoneOptions();
        this.updatePlannerResults();
    }

    renderClocks() {
        this.clocksGrid.innerHTML = this.clocks.map(timezone => `
            <div class="clock-card" data-timezone="${timezone}">
                <button class="remove-btn" onclick="worldClock.removeClock('${timezone}')" title="Remove">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                <div class="clock-city">${this.timezoneNames[timezone] || timezone.split('/').pop().replace(/_/g, ' ')}</div>
                <div class="clock-timezone">${timezone}</div>
                <div class="clock-time">--:--:--</div>
                <div class="clock-date">--</div>
                <div class="clock-diff">--</div>
            </div>
        `).join('');

        this.updateClockCards();
    }

    updateClockCards() {
        const now = new Date();
        const localOffset = now.getTimezoneOffset();

        document.querySelectorAll('.clock-card').forEach(card => {
            const timezone = card.dataset.timezone;
            if (!timezone) return;

            try {
                // Get time in timezone
                const timeStr = now.toLocaleTimeString('en-US', {
                    timeZone: timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });

                const dateStr = now.toLocaleDateString('en-US', {
                    timeZone: timezone,
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                });

                // Calculate offset difference
                const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
                const localDate = new Date(now.toLocaleString('en-US'));
                const diffMs = tzDate - localDate;
                const diffHours = Math.round(diffMs / (1000 * 60 * 60) * 2) / 2; // Round to half hours

                let diffText = '';
                if (diffHours === 0) {
                    diffText = 'Same as local';
                } else if (diffHours > 0) {
                    diffText = `+${diffHours}h ahead`;
                } else {
                    diffText = `${diffHours}h behind`;
                }

                // Update card
                card.querySelector('.clock-time').textContent = timeStr;
                card.querySelector('.clock-date').textContent = dateStr;

                const diffEl = card.querySelector('.clock-diff');
                diffEl.textContent = diffText;
                diffEl.classList.toggle('behind', diffHours < 0);

                // Check if night time (between 8pm and 6am)
                const hour = parseInt(timeStr.split(':')[0]);
                card.classList.toggle('night', hour >= 20 || hour < 6);

            } catch (e) {
                console.error(`Error updating timezone ${timezone}:`, e);
            }
        });
    }

    initPlannerTimezone() {
        // Populate planner timezone select with local timezone first
        const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.plannerTimezone.innerHTML = `<option value="${localTz}">Local (${this.timezoneNames[localTz] || localTz})</option>`;
        this.updatePlannerTimezoneOptions();
    }

    updatePlannerTimezoneOptions() {
        const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        let options = `<option value="${localTz}">Local (${this.timezoneNames[localTz] || localTz})</option>`;

        this.clocks.forEach(tz => {
            options += `<option value="${tz}">${this.timezoneNames[tz] || tz}</option>`;
        });

        this.plannerTimezone.innerHTML = options;
    }

    setDefaultPlannerDate() {
        const today = new Date();
        this.plannerDate.value = today.toISOString().split('T')[0];
    }

    updatePlannerResults() {
        if (this.clocks.length === 0) {
            this.plannerResults.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Add clocks above to see meeting times across time zones</p>';
            return;
        }

        const date = this.plannerDate.value;
        const time = this.plannerTime.value;
        const sourceTz = this.plannerTimezone.value;

        if (!date || !time) return;

        // Create date in source timezone
        const dateTimeStr = `${date}T${time}:00`;
        const sourceDate = new Date(dateTimeStr);

        // Get the offset for the source timezone to calculate correct UTC time
        const sourceFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: sourceTz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        // Use a reference date to calculate
        const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const refDate = new Date(`${date}T${time}:00`);

        // Calculate local time from source timezone time
        const results = [];

        // Add source timezone first
        results.push({
            timezone: sourceTz,
            city: this.timezoneNames[sourceTz] || sourceTz,
            time: time,
            date: date,
            isSource: true,
            isDifferentDay: false
        });

        // Calculate for each saved clock
        this.clocks.forEach(tz => {
            if (tz === sourceTz) return;

            try {
                // Create a date object interpreting the input as the source timezone
                const tzTime = this.convertTime(date, time, sourceTz, tz);

                results.push({
                    timezone: tz,
                    city: this.timezoneNames[tz] || tz,
                    time: tzTime.time,
                    date: tzTime.date,
                    isSource: false,
                    isDifferentDay: tzTime.date !== date
                });
            } catch (e) {
                console.error(`Error converting to ${tz}:`, e);
            }
        });

        this.plannerResults.innerHTML = results.map(r => `
            <div class="planner-result ${r.isDifferentDay ? 'different-day' : ''}">
                <div class="city">${r.city}${r.isSource ? ' (Source)' : ''}</div>
                <div class="time">${r.time}</div>
                <div class="date">${this.formatPlannerDate(r.date)}</div>
            </div>
        `).join('');
    }

    convertTime(date, time, fromTz, toTz) {
        // Create a date string and parse it
        const dateStr = `${date}T${time}:00`;

        // Create formatter for source timezone
        const sourceDate = new Date(dateStr);

        // Get the source timezone offset
        const sourceOffset = this.getOffsetMinutes(sourceDate, fromTz);
        const localOffset = sourceDate.getTimezoneOffset();

        // Adjust to get correct UTC time
        const adjustedDate = new Date(sourceDate.getTime() + (localOffset - sourceOffset) * 60000);

        // Format in target timezone
        const targetTime = adjustedDate.toLocaleTimeString('en-US', {
            timeZone: toTz,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        const targetDate = adjustedDate.toLocaleDateString('en-CA', {
            timeZone: toTz
        }); // en-CA gives YYYY-MM-DD format

        return { time: targetTime, date: targetDate };
    }

    getOffsetMinutes(date, timezone) {
        // Get offset in minutes for a timezone
        const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
        const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
        return (tzDate - utcDate) / 60000;
    }

    formatPlannerDate(dateStr) {
        const date = new Date(dateStr + 'T12:00:00');
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    }
}

// Initialize
let worldClock;
document.addEventListener('DOMContentLoaded', () => {
    worldClock = new WorldClock();
});
