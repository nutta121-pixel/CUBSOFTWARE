let ws = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectInterval = 5000;
let isConnecting = false;

function connectWebSocket() {
    // Prevent multiple simultaneous connection attempts
    if (isConnecting) {
        return;
    }

    // Stop reconnecting after max attempts
    if (reconnectAttempts >= maxReconnectAttempts) {
        console.log('Max reconnection attempts reached. Stopped reconnecting.');
        return;
    }

    isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connected');
            reconnectAttempts = 0; // Reset on successful connection
            isConnecting = false;
            loadInitialActivity();
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                switch(message.type) {
                    case 'activity':
                        addActivityItem(message.data);
                        break;
                    case 'stats':
                        updateStats(message.data);
                        break;
                    case 'leaderboard':
                        updateLeaderboard(message.data);
                        break;
                    case 'staff':
                        updateStaff(message.data);
                        break;
                    default:
                        addActivityItem(message);
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };

        ws.onclose = (event) => {
            isConnecting = false;

            // Don't reconnect if close was intentional (code 1000)
            if (event.code === 1000) {
                console.log('WebSocket closed normally');
                return;
            }

            reconnectAttempts++;
            console.log(`WebSocket disconnected. Reconnect attempt ${reconnectAttempts}/${maxReconnectAttempts} in ${reconnectInterval/1000}s...`);

            setTimeout(() => {
                connectWebSocket();
            }, reconnectInterval);
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            isConnecting = false;
        };
    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        isConnecting = false;
    }
}

// Clean up WebSocket on page unload
window.addEventListener('beforeunload', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Page unload');
    }
});

async function loadInitialActivity() {
    try {
        const response = await fetch('/api/activity?limit=3');
        const activities = await response.json();

        const feedElement = document.getElementById('activity-feed');
        feedElement.innerHTML = '';

        if (activities.length === 0) {
            feedElement.innerHTML = '<div class="activity-item">No recent activity</div>';
            return;
        }

        activities.reverse().forEach(activity => {
            addActivityItem(activity, false);
        });
    } catch (error) {
        console.error('Error loading activity:', error);
    }
}

function addActivityItem(activity, prepend = true) {
    const feedElement = document.getElementById('activity-feed');
    const activityElement = document.createElement('div');
    activityElement.className = 'activity-item';
    activityElement.dataset.timestamp = activity.timestamp;

    const timeAgo = getTimeAgo(activity.timestamp);

    activityElement.innerHTML = `
        <div class="activity-username">${escapeHtml(activity.username)}</div>
        <div class="activity-action">${escapeHtml(activity.action)}</div>
        <div class="activity-time">${timeAgo}</div>
    `;

    if (prepend) {
        feedElement.insertBefore(activityElement, feedElement.firstChild);

        const items = feedElement.children;
        if (items.length > 3) {
            feedElement.removeChild(items[items.length - 1]);
        }
    } else {
        feedElement.appendChild(activityElement);
    }
}

function getTimeAgo(timestamp) {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatLargeNumber(num) {
    if (num === undefined || num === null) {
        return '0';
    }
    if (num >= 1e15) {
        return (num / 1e15).toFixed(1).replace(/\.0$/, '') + 'Q';
    }
    if (num >= 1e12) {
        return (num / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
    }
    if (num >= 1e9) {
        return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    }
    if (num >= 1e6) {
        return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1e3) {
        return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toLocaleString();
}

function updateStats(stats) {
    const serverStat = document.querySelector('.stat-card:nth-child(1) .stat-value');
    const userStat = document.querySelector('.stat-card:nth-child(2) .stat-value');
    const questStat = document.querySelector('.stat-card:nth-child(3) .stat-value');
    const currencyStat = document.querySelector('.stat-card:nth-child(4) .stat-value');
    const gemsStat = document.querySelector('.stat-card:nth-child(5) .stat-value');

    if (serverStat && stats.totalServers !== undefined) serverStat.textContent = stats.totalServers.toLocaleString();
    if (userStat && stats.totalUsers !== undefined) userStat.textContent = stats.totalUsers.toLocaleString();
    if (questStat && stats.totalQuestsCompleted !== undefined) questStat.textContent = stats.totalQuestsCompleted.toLocaleString();
    if (currencyStat && stats.totalCurrency !== undefined) currencyStat.textContent = formatLargeNumber(stats.totalCurrency);
    if (gemsStat && stats.totalGems !== undefined) gemsStat.textContent = formatLargeNumber(stats.totalGems);
}

function updateLeaderboard(players) {
    const container = document.querySelector('.leaderboard-container');
    if (!container) return;

    container.innerHTML = '';

    if (players.length === 0) {
        container.innerHTML = '<p class="empty-state">No rankings yet. Be the first to compete!</p>';
        return;
    }

    const topThree = document.createElement('div');
    topThree.className = 'leaderboard-top-three';

    players.slice(0, 3).forEach((player, index) => {
        const item = document.createElement('div');
        item.className = `leaderboard-item rank-${index + 1}`;

        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';

        item.innerHTML = `
            <div class="rank-badge">${medal}</div>
            <div class="player-info">
                <div class="player-name">${escapeHtml(player.username)}</div>
                <div class="player-score">${player.score.toLocaleString()} pts</div>
            </div>
        `;

        topThree.appendChild(item);
    });

    container.appendChild(topThree);
}

function updateStaff(staff) {
    const container = document.querySelector('.staff-grid');
    if (!container) return;

    container.innerHTML = '';

    staff.forEach(member => {
        const card = document.createElement('div');
        card.className = 'staff-card';

        const avatarHtml = member.avatar_url ? `<img src="${escapeHtml(member.avatar_url)}" alt="${escapeHtml(member.username)}" class="staff-avatar">` : '';

        card.innerHTML = `
            ${avatarHtml}
            <div class="staff-name">${escapeHtml(member.username)}</div>
            <div class="staff-role ${member.role.toLowerCase()}">${escapeHtml(member.role)}</div>
        `;

        container.appendChild(card);
    });
}

connectWebSocket();

setInterval(() => {
    const items = document.querySelectorAll('.activity-time');
    items.forEach(item => {
        const activityElement = item.closest('.activity-item');
        if (activityElement.dataset.timestamp) {
            item.textContent = getTimeAgo(parseInt(activityElement.dataset.timestamp));
        }
    });
}, 60000);
