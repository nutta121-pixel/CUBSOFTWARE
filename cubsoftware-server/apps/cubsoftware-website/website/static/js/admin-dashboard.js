// Admin Dashboard - CUB SOFTWARE
(function() {
    'use strict';

    // ==================== STATE ====================
    let processes = [];
    let refreshInterval = null;
    let refreshRate = 5000;
    let selectedProcess = null;
    let logsBuffer = [];
    let lastLogTimestamp = null;
    let autoScrollLogs = true;
    let currentSection = 'processes';
    let currentReport = null;
    let currentLink = null;
    let ipBansTab = 'global';

    // ==================== DOM ELEMENTS ====================
    const elements = {
        // Sidebar
        sidebar: document.getElementById('adminSidebar'),
        sidebarOverlay: document.getElementById('sidebarOverlay'),
        mobileMenuBtn: document.getElementById('mobileMenuBtn'),
        navItems: document.querySelectorAll('.nav-item'),

        // Sections
        sections: document.querySelectorAll('.content-section'),

        // Processes
        processesGrid: document.getElementById('processesGrid'),
        processSelect: document.getElementById('processSelect'),
        refreshBtn: document.getElementById('refreshBtn'),
        autoRefreshCheckbox: document.getElementById('autoRefresh'),
        refreshRateSelect: document.getElementById('refreshRate'),
        statusDot: document.getElementById('statusDot'),
        lastUpdate: document.getElementById('lastUpdate'),

        // Logs
        logsContainer: document.getElementById('logsContainer'),
        logType: document.getElementById('logType'),
        autoScrollCheckbox: document.getElementById('autoScrollLogs'),
        clearLogsBtn: document.getElementById('clearLogsBtn'),

        // Reports
        reportsList: document.getElementById('reportsList'),
        reportStatusFilter: document.getElementById('reportStatusFilter'),
        refreshReportsBtn: document.getElementById('refreshReportsBtn'),
        reportModal: document.getElementById('reportModal'),
        reportModalBody: document.getElementById('reportModalBody'),
        reportsBadge: document.getElementById('reportsBadge'),
        pendingCount: document.getElementById('pendingCount'),
        investigatingCount: document.getElementById('investigatingCount'),
        resolvedCount: document.getElementById('resolvedCount'),
        closedCount: document.getElementById('closedCount'),

        // Links
        linksList: document.getElementById('linksList'),
        linkSearch: document.getElementById('linkSearch'),
        refreshLinksBtn: document.getElementById('refreshLinksBtn'),
        totalLinksCount: document.getElementById('totalLinksCount'),
        totalClicksCount: document.getElementById('totalClicksCount'),
        linkModal: document.getElementById('linkModal'),
        linkModalBody: document.getElementById('linkModalBody'),

        // Features
        featuresGrid: document.getElementById('featuresGrid'),
        refreshFeaturesBtn: document.getElementById('refreshFeaturesBtn'),

        // Whitelist
        whitelistList: document.getElementById('whitelistList'),
        newUserId: document.getElementById('newUserId'),

        // IP Bans
        ipbansList: document.getElementById('ipbansList'),
        refreshIpBansBtn: document.getElementById('refreshIpBansBtn'),
        banIpAddress: document.getElementById('banIpAddress'),
        banType: document.getElementById('banType'),
        banReason: document.getElementById('banReason'),
        tempBanIp: document.getElementById('tempBanIp'),
        tempBanDuration: document.getElementById('tempBanDuration'),
        tempBanReason: document.getElementById('tempBanReason'),

        // Toast
        toast: document.getElementById('toast')
    };

    // ==================== INITIALIZATION ====================
    function init() {
        setupNavigation();
        setupEventListeners();
        loadInitialData();
        startAutoRefresh();

        // Check URL hash for section
        const hash = window.location.hash.slice(1);
        if (hash && document.querySelector(`[data-section="${hash}"]`)) {
            switchSection(hash);
        }
    }

    // ==================== NAVIGATION ====================
    function setupNavigation() {
        // Sidebar navigation
        elements.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                switchSection(section);
                closeMobileSidebar();
            });
        });

        // Mobile menu
        elements.mobileMenuBtn?.addEventListener('click', toggleMobileSidebar);
        elements.sidebarOverlay?.addEventListener('click', closeMobileSidebar);

        // IP Bans tabs
        document.querySelectorAll('.ipbans-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ipbans-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                ipBansTab = btn.dataset.tab;
                loadIpBans();
            });
        });
    }

    function switchSection(section) {
        currentSection = section;

        // Update nav items
        elements.navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.section === section);
        });

        // Update sections
        elements.sections.forEach(sec => {
            sec.classList.toggle('active', sec.dataset.section === section);
        });

        // Update URL hash
        window.location.hash = section;

        // Load section data
        loadSectionData(section);
    }

    function toggleMobileSidebar() {
        elements.sidebar?.classList.toggle('active');
        elements.sidebarOverlay?.classList.toggle('active');
    }

    function closeMobileSidebar() {
        elements.sidebar?.classList.remove('active');
        elements.sidebarOverlay?.classList.remove('active');
    }

    // ==================== DATA LOADING ====================
    function loadInitialData() {
        loadProcesses();
        loadReports();
    }

    function loadSectionData(section) {
        switch (section) {
            case 'processes':
                loadProcesses();
                break;
            case 'logs':
                // Logs loaded on process select
                break;
            case 'reports':
                loadReports();
                break;
            case 'links':
                loadLinks();
                break;
            case 'features':
                loadFeatures();
                break;
            case 'whitelist':
                loadWhitelist();
                loadAppWhitelist('streamavatars');
                loadAppWhitelist('marbles');
                loadTranslateWhitelist();
                break;
            case 'ipbans':
                loadIpBans();
                break;
            case 'botowners':
                loadBotOwners();
                break;
            case 'cubai-servers':
                loadCubAiServers();
                break;
            case 'message-reactions':
                loadMessageReactions();
                break;
            case 'passwords':
                loadPasswords();
                break;
            case 'api-status':
                loadApiStatus();
                break;
            case 'custom-bots':
                loadCustomBots();
                break;
            case 'cubassist':
                loadCubAssist();
                break;
            case 'marbles':
                loadMarblesAdmin();
                break;
        }
    }

    // ==================== EVENT LISTENERS ====================
    function setupEventListeners() {
        // Processes
        elements.refreshBtn?.addEventListener('click', () => {
            elements.refreshBtn.classList.add('spinning');
            loadProcesses().then(() => {
                setTimeout(() => elements.refreshBtn.classList.remove('spinning'), 500);
            });
        });

        elements.autoRefreshCheckbox?.addEventListener('change', () => {
            if (elements.autoRefreshCheckbox.checked) {
                startAutoRefresh();
            } else {
                stopAutoRefresh();
            }
        });

        elements.refreshRateSelect?.addEventListener('change', () => {
            refreshRate = parseInt(elements.refreshRateSelect.value);
            if (elements.autoRefreshCheckbox?.checked) {
                startAutoRefresh();
            }
        });

        // Logs
        elements.processSelect?.addEventListener('change', () => {
            selectedProcess = elements.processSelect.value;
            logsBuffer = [];
            lastLogTimestamp = null;
            if (selectedProcess) {
                loadLogs();
            } else {
                elements.logsContainer.innerHTML = '<div class="logs-placeholder">Select a process to view logs</div>';
            }
        });

        elements.logType?.addEventListener('change', () => {
            logsBuffer = [];
            lastLogTimestamp = null;
            if (selectedProcess) loadLogs();
        });

        elements.autoScrollCheckbox?.addEventListener('change', () => {
            autoScrollLogs = elements.autoScrollCheckbox.checked;
        });

        elements.clearLogsBtn?.addEventListener('click', () => {
            logsBuffer = [];
            elements.logsContainer.innerHTML = '<div class="logs-placeholder">Logs cleared</div>';
        });

        // Reports
        elements.refreshReportsBtn?.addEventListener('click', loadReports);
        elements.reportStatusFilter?.addEventListener('change', loadReports);

        // Links
        elements.refreshLinksBtn?.addEventListener('click', loadLinks);
        elements.linkSearch?.addEventListener('input', debounce(loadLinks, 300));

        // Features
        elements.refreshFeaturesBtn?.addEventListener('click', loadFeatures);

        // Whitelist
        elements.newUserId?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addToWhitelist();
        });

        // IP Bans
        elements.refreshIpBansBtn?.addEventListener('click', loadIpBans);

        // Bot Owners
        document.getElementById('refreshBotOwnersBtn')?.addEventListener('click', loadBotOwners);
        document.getElementById('newOwnerId')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addBotOwner();
        });

        // CubAI Servers
        document.getElementById('refreshCubAiServersBtn')?.addEventListener('click', loadCubAiServers);
        document.getElementById('newCubAiGuildId')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addCubAiServer();
        });
    }

    // ==================== AUTO REFRESH ====================
    function startAutoRefresh() {
        stopAutoRefresh();
        refreshInterval = setInterval(() => {
            if (currentSection === 'processes') {
                loadProcesses();
            }
            if (selectedProcess && currentSection === 'logs') {
                loadLogs(true);
            }
        }, refreshRate);
    }

    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    // ==================== PROCESSES ====================
    async function loadProcesses() {
        try {
            const response = await fetch('/api/pm2/processes');
            if (!response.ok) throw new Error('Failed to fetch');

            const data = await response.json();
            processes = data.processes || [];

            elements.statusDot?.classList.remove('error');
            renderProcesses();
            updateProcessSelect();
            updateLastUpdate();

        } catch (error) {
            console.error('Error loading processes:', error);
            elements.statusDot?.classList.add('error');
            showToast('Connection error', 'error');
        }
    }

    function renderProcesses() {
        if (!elements.processesGrid) return;

        if (processes.length === 0) {
            elements.processesGrid.innerHTML = '<div class="loading">No processes found</div>';
            return;
        }

        elements.processesGrid.innerHTML = processes.map(proc => `
            <div class="process-card">
                <div class="process-header">
                    <span class="process-name">${escapeHtml(proc.name)}</span>
                    <span class="process-status ${proc.status}">${proc.status}</span>
                </div>
                <div class="process-stats">
                    <div class="stat-item">
                        <span class="stat-label">CPU</span>
                        <span class="stat-value">${(proc.cpu || 0).toFixed(1)}%</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Memory</span>
                        <span class="stat-value">${formatBytes(proc.memory || 0)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Uptime</span>
                        <span class="stat-value">${formatUptime(proc.uptime)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Restarts</span>
                        <span class="stat-value">${proc.restarts || 0}</span>
                    </div>
                </div>
                <div class="process-actions">
                    <button class="restart" onclick="restartProcess('${proc.name}')">Restart</button>
                    ${proc.status === 'online'
                        ? `<button class="stop" onclick="stopProcess('${proc.name}')">Stop</button>`
                        : `<button class="start" onclick="startProcess('${proc.name}')">Start</button>`
                    }
                </div>
            </div>
        `).join('');
    }

    function updateProcessSelect() {
        if (!elements.processSelect) return;

        const current = elements.processSelect.value;
        elements.processSelect.innerHTML = '<option value="">Select a process...</option>' +
            processes.map(p => `<option value="${p.name}" ${p.name === current ? 'selected' : ''}>${p.name}</option>`).join('');
    }

    function updateLastUpdate() {
        if (elements.lastUpdate) {
            elements.lastUpdate.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
        }
    }

    // Process actions
    window.restartProcess = async function(name) {
        try {
            const res = await fetch(`/api/pm2/restart/${name}`, { method: 'POST' });
            if (res.ok) {
                showToast(`Restarting ${name}...`, 'success');
                setTimeout(loadProcesses, 1000);
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast(`Failed to restart ${name}`, 'error');
        }
    };

    window.stopProcess = async function(name) {
        try {
            const res = await fetch(`/api/pm2/stop/${name}`, { method: 'POST' });
            if (res.ok) {
                showToast(`Stopping ${name}...`, 'success');
                setTimeout(loadProcesses, 1000);
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast(`Failed to stop ${name}`, 'error');
        }
    };

    window.startProcess = async function(name) {
        try {
            const res = await fetch(`/api/pm2/start/${name}`, { method: 'POST' });
            if (res.ok) {
                showToast(`Starting ${name}...`, 'success');
                setTimeout(loadProcesses, 1000);
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast(`Failed to start ${name}`, 'error');
        }
    };

    // ==================== LOGS ====================
    async function loadLogs(append = false) {
        if (!selectedProcess || !elements.logsContainer) return;

        try {
            const type = elements.logType?.value || 'out';
            let url = `/api/pm2/logs/${selectedProcess}?type=${type}&lines=100`;
            if (append && lastLogTimestamp) {
                url += `&since=${lastLogTimestamp}`;
            }

            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed');

            const data = await res.json();
            const lines = data.logs || [];

            if (!append) {
                logsBuffer = lines;
            } else {
                logsBuffer = [...logsBuffer, ...lines].slice(-500);
            }

            if (lines.length > 0) {
                lastLogTimestamp = Date.now();
            }

            renderLogs();

        } catch (e) {
            console.error('Error loading logs:', e);
        }
    }

    function renderLogs() {
        if (!elements.logsContainer) return;

        if (logsBuffer.length === 0) {
            elements.logsContainer.innerHTML = '<div class="logs-placeholder">No logs available</div>';
            return;
        }

        elements.logsContainer.innerHTML = logsBuffer.map(line => {
            const text = typeof line === 'object' ? (line.timestamp ? `${line.timestamp} | ${line.content}` : line.content || JSON.stringify(line)) : String(line);
            const isError = /error|fail|exception/i.test(text);
            const isWarn = /warn|warning/i.test(text);
            const className = isError ? 'error' : (isWarn ? 'warn' : '');
            return `<div class="log-line ${className}"><span class="log-content">${escapeHtml(text)}</span></div>`;
        }).join('');

        if (autoScrollLogs) {
            elements.logsContainer.scrollTop = elements.logsContainer.scrollHeight;
        }
    }

    // ==================== REPORTS ====================
    async function loadReports() {
        if (!elements.reportsList) return;

        try {
            const status = elements.reportStatusFilter?.value || 'all';
            const res = await fetch(`/api/reports?status=${status}`);
            if (!res.ok) throw new Error('Failed');

            const data = await res.json();
            const reports = data.reports || [];
            const stats = data.stats || {};

            // Update stats
            if (elements.pendingCount) elements.pendingCount.textContent = stats.pending || 0;
            if (elements.investigatingCount) elements.investigatingCount.textContent = stats.investigating || 0;
            if (elements.resolvedCount) elements.resolvedCount.textContent = stats.resolved || 0;
            if (elements.closedCount) elements.closedCount.textContent = stats.closed || 0;

            // Update badge
            if (elements.reportsBadge) {
                const pending = stats.pending || 0;
                if (pending > 0) {
                    elements.reportsBadge.textContent = pending;
                    elements.reportsBadge.style.display = 'inline';
                } else {
                    elements.reportsBadge.style.display = 'none';
                }
            }

            renderReports(reports);

        } catch (e) {
            console.error('Error loading reports:', e);
            elements.reportsList.innerHTML = '<div class="loading">Failed to load reports</div>';
        }
    }

    function renderReports(reports) {
        if (reports.length === 0) {
            elements.reportsList.innerHTML = '<div class="empty-state">No reports found</div>';
            return;
        }

        elements.reportsList.innerHTML = reports.map(r => `
            <div class="report-item" onclick="openReportModal('${r.id}')">
                <div class="report-type"><span>${r.type || 'general'}</span></div>
                <div class="report-info">
                    <div class="report-subject">${escapeHtml(r.subject || 'No subject')}</div>
                    <div class="report-meta">${formatDate(r.timestamp)} &bull; ${escapeHtml(r.contact || 'Anonymous')}</div>
                </div>
                <span class="report-status ${r.status}">${r.status}</span>
            </div>
        `).join('');
    }

    window.openReportModal = async function(reportId) {
        try {
            const res = await fetch(`/api/reports/${reportId}`);
            if (!res.ok) throw new Error('Failed');

            const report = await res.json();
            currentReport = report;

            elements.reportModalBody.innerHTML = `
                <div class="report-detail-grid">
                    <div class="report-field">
                        <label>Report ID</label>
                        <div class="value mono">${report.id}</div>
                    </div>
                    <div class="report-field">
                        <label>Type</label>
                        <div class="value">${report.type || 'General'}</div>
                    </div>
                    <div class="report-field">
                        <label>Status</label>
                        <div class="value"><span class="report-status ${report.status}">${report.status}</span></div>
                    </div>
                    <div class="report-field">
                        <label>Date</label>
                        <div class="value">${formatDate(report.timestamp)}</div>
                    </div>
                    <div class="report-field full-width">
                        <label>Subject</label>
                        <div class="value">${escapeHtml(report.subject || 'N/A')}</div>
                    </div>
                    <div class="report-field full-width">
                        <label>Description</label>
                        <div class="value">${escapeHtml(report.description || 'N/A')}</div>
                    </div>
                    <div class="report-field full-width">
                        <label>URL</label>
                        <div class="value mono">${escapeHtml(report.url || 'N/A')}</div>
                    </div>
                    <div class="report-field">
                        <label>Contact</label>
                        <div class="value">${escapeHtml(report.contact || 'Anonymous')}</div>
                    </div>
                    <div class="report-field">
                        <label>IP Address</label>
                        <div class="value mono">${report.ip || 'Unknown'}</div>
                    </div>
                    <div class="report-field full-width">
                        <label>User Agent</label>
                        <div class="value mono" style="font-size: 0.8rem;">${escapeHtml(report.user_agent || 'Unknown')}</div>
                    </div>
                    <div class="report-field">
                        <label>Fingerprint</label>
                        <div class="value mono">${report.fingerprint || 'N/A'}</div>
                    </div>
                </div>
            `;

            elements.reportModal.style.display = 'flex';

        } catch (e) {
            showToast('Failed to load report', 'error');
        }
    };

    window.closeReportModal = function() {
        elements.reportModal.style.display = 'none';
        currentReport = null;
    };

    window.updateReportStatus = async function(status) {
        if (!currentReport) return;

        try {
            const res = await fetch(`/api/reports/${currentReport.id}/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });

            if (res.ok) {
                showToast(`Report marked as ${status}`, 'success');
                closeReportModal();
                loadReports();
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast('Failed to update report', 'error');
        }
    };

    window.deleteReport = async function() {
        if (!currentReport || !confirm('Delete this report?')) return;

        try {
            const res = await fetch(`/api/reports/${currentReport.id}/delete`, { method: 'DELETE' });
            if (res.ok) {
                showToast('Report deleted', 'success');
                closeReportModal();
                loadReports();
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast('Failed to delete report', 'error');
        }
    };

    // ==================== LINKS ====================
    async function loadLinks() {
        if (!elements.linksList) return;

        try {
            const res = await fetch('/api/admin/links');
            if (!res.ok) throw new Error('Failed');

            const data = await res.json();
            let links = data.links || [];

            // Client-side search filter
            const search = (elements.linkSearch?.value || '').toLowerCase();
            if (search) {
                links = links.filter(l =>
                    l.code.toLowerCase().includes(search) ||
                    (l.url && l.url.toLowerCase().includes(search))
                );
            }

            // Compute totals
            const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
            if (elements.totalLinksCount) elements.totalLinksCount.textContent = links.length;
            if (elements.totalClicksCount) elements.totalClicksCount.textContent = totalClicks;

            renderLinks(links);

        } catch (e) {
            console.error('Error loading links:', e);
            elements.linksList.innerHTML = '<div class="loading">Failed to load links</div>';
        }
    }

    function renderLinks(links) {
        if (links.length === 0) {
            elements.linksList.innerHTML = '<div class="empty-state">No links found</div>';
            return;
        }

        elements.linksList.innerHTML = links.map(l => `
            <div class="link-item" onclick="openLinkModal('${l.code}')">
                <span class="link-code">${l.code}</span>
                <span class="link-url">${escapeHtml(l.url)}</span>
                <div class="link-stats">
                    <span class="link-stat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                        ${l.clicks || 0}
                    </span>
                </div>
            </div>
        `).join('');
    }

    window.openLinkModal = async function(code) {
        try {
            const res = await fetch(`/api/admin/links/${code}`);
            if (!res.ok) throw new Error('Failed');

            const data = await res.json();
            const link = data.link || data;
            currentLink = link;

            elements.linkModalBody.innerHTML = `
                <div class="report-detail-grid">
                    <div class="report-field">
                        <label>Short Code</label>
                        <div class="value mono">${link.code}</div>
                    </div>
                    <div class="report-field">
                        <label>Clicks</label>
                        <div class="value">${link.clicks || 0}</div>
                    </div>
                    <div class="report-field full-width">
                        <label>Destination URL</label>
                        <div class="value mono" style="word-break: break-all;">${escapeHtml(link.url)}</div>
                    </div>
                    <div class="report-field">
                        <label>Created</label>
                        <div class="value">${formatDate(link.created_at ? link.created_at : (link.created ? link.created * 1000 : null))}</div>
                    </div>
                    <div class="report-field">
                        <label>Created By</label>
                        <div class="value mono">${escapeHtml(link.created_by || link.ip || 'Unknown')}</div>
                    </div>
                </div>
            `;

            elements.linkModal.style.display = 'flex';

        } catch (e) {
            showToast('Failed to load link details', 'error');
        }
    };

    window.closeLinkModal = function() {
        elements.linkModal.style.display = 'none';
        currentLink = null;
    };

    window.deleteLink = async function() {
        if (!currentLink) return;
        const code = currentLink.code;
        if (!confirm(`Delete link ${code}?`)) return;

        try {
            const res = await fetch(`/api/admin/links/${code}`, { method: 'DELETE' });
            if (res.ok) {
                showToast('Link deleted', 'success');
                closeLinkModal();
                loadLinks();
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast('Failed to delete link', 'error');
        }
    };

    window.banLinkCreator = async function() {
        const ip = currentLink?.created_by || currentLink?.ip;
        if (!ip) {
            showToast('No IP/creator info available', 'error');
            return;
        }

        elements.banIpAddress.value = ip;
        if (elements.banReason) elements.banReason.value = 'Suspicious link activity';

        closeLinkModal();
        switchSection('ipbans');
    };

    // ==================== FEATURES ====================
    async function loadFeatures() {
        if (!elements.featuresGrid) return;

        try {
            const res = await fetch('/api/admin/features');
            if (!res.ok) throw new Error('Failed');

            const data = await res.json();
            renderFeatures(data.features || []);

        } catch (e) {
            console.error('Error loading features:', e);
            elements.featuresGrid.innerHTML = '<div class="loading">Failed to load features</div>';
        }
    }

    function renderFeatures(features) {
        if (features.length === 0) {
            elements.featuresGrid.innerHTML = '<div class="empty-state">No features found</div>';
            return;
        }

        elements.featuresGrid.innerHTML = features.map(f => `
            <div class="feature-card">
                <div class="feature-info">
                    <div class="feature-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                            <polyline points="2 17 12 22 22 17"></polyline>
                            <polyline points="2 12 12 17 22 12"></polyline>
                        </svg>
                    </div>
                    <span class="feature-name">${f.name}</span>
                </div>
                <div class="feature-toggle ${f.enabled ? 'enabled' : ''}" onclick="toggleFeature('${f.id}', ${!f.enabled})"></div>
            </div>
        `).join('');
    }

    window.toggleFeature = async function(feature, enable) {
        try {
            const action = enable ? 'enable' : 'disable';
            const res = await fetch(`/api/admin/features/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feature })
            });

            if (res.ok) {
                showToast(`${feature} ${enable ? 'enabled' : 'disabled'}`, 'success');
                loadFeatures();
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast('Failed to update feature', 'error');
        }
    };

    // ==================== WHITELIST ====================
    async function loadWhitelist() {
        if (!elements.whitelistList) return;

        try {
            const res = await fetch('/api/pm2/whitelist');
            if (!res.ok) throw new Error('Failed');

            const data = await res.json();
            const users = data.allowed_users || [];

            if (users.length === 0) {
                elements.whitelistList.innerHTML = '<div class="empty-state">No users whitelisted</div>';
                return;
            }

            elements.whitelistList.innerHTML = users.map(id => `
                <div class="whitelist-user">
                    <span class="whitelist-user-id">${id}</span>
                    <button class="whitelist-remove" onclick="removeFromWhitelist('${id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `).join('');

        } catch (e) {
            console.error('Error loading whitelist:', e);
            elements.whitelistList.innerHTML = '<div class="loading">Failed to load whitelist</div>';
        }
    }

    window.addToWhitelist = async function() {
        const userId = elements.newUserId?.value?.trim();
        if (!userId) {
            showToast('Please enter a user ID', 'error');
            return;
        }

        try {
            const res = await fetch('/api/pm2/whitelist/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });

            if (res.ok) {
                showToast('User added to whitelist', 'success');
                elements.newUserId.value = '';
                loadWhitelist();
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast('Failed to add user', 'error');
        }
    };

    window.removeFromWhitelist = async function(userId) {
        if (!confirm(`Remove ${userId} from whitelist?`)) return;

        try {
            const res = await fetch('/api/pm2/whitelist/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });

            if (res.ok) {
                showToast('User removed from whitelist', 'success');
                loadWhitelist();
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast('Failed to remove user', 'error');
        }
    };

    window.switchWhitelistTab = function(tab) {
        document.querySelectorAll('.wl-panel').forEach(p => p.style.display = 'none');
        document.querySelectorAll('.wl-tab-btn').forEach(b => b.classList.remove('active'));
        const panel = document.getElementById(`wl-${tab}-panel`);
        if (panel) panel.style.display = '';
        const btn = document.querySelector(`.wl-tab-btn[data-wl="${tab}"]`);
        if (btn) btn.classList.add('active');
    };

    const _appWlListIds = { streamavatars: 'saWhitelistList', marbles: 'mbWhitelistList' };
    const _appWlInputIds = { streamavatars: 'newSaUserId', marbles: 'newMbUserId' };

    async function loadAppWhitelist(app) {
        const listEl = document.getElementById(_appWlListIds[app]);
        if (!listEl) return;
        try {
            const res = await fetch(`/api/admin/app-whitelist/${app}`);
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            const users = data.allowed_users || [];
            if (users.length === 0) {
                listEl.innerHTML = '<div class="empty-state" style="color:var(--text-muted);font-size:0.85rem;">No users whitelisted — feature is open to everyone</div>';
                return;
            }
            listEl.innerHTML = users.map(id => `
                <div class="whitelist-user">
                    <span class="whitelist-user-id">${id}</span>
                    <button class="whitelist-remove" onclick="removeFromAppWhitelist('${app}', '${id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `).join('');
        } catch (e) {
            listEl.innerHTML = '<div class="loading">Failed to load</div>';
        }
    }

    window.addToAppWhitelist = async function(app) {
        const inputEl = document.getElementById(_appWlInputIds[app]);
        const userId = inputEl?.value?.trim();
        if (!userId) { showToast('Please enter a user ID', 'error'); return; }
        try {
            const res = await fetch(`/api/admin/app-whitelist/${app}/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            if (res.ok) {
                showToast('User added to whitelist', 'success');
                if (inputEl) inputEl.value = '';
                loadAppWhitelist(app);
            } else throw new Error('Failed');
        } catch (e) { showToast('Failed to add user', 'error'); }
    };

    window.removeFromAppWhitelist = async function(app, userId) {
        if (!confirm(`Remove ${userId} from ${app} whitelist?`)) return;
        try {
            const res = await fetch(`/api/admin/app-whitelist/${app}/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            if (res.ok) {
                showToast('User removed from whitelist', 'success');
                loadAppWhitelist(app);
            } else throw new Error('Failed');
        } catch (e) { showToast('Failed to remove user', 'error'); }
    };

    // ==================== TRANSLATE WHITELIST ====================
    async function loadTranslateWhitelist() {
        const listEl = document.getElementById('translateWhitelistList');
        if (!listEl) return;
        try {
            const res = await fetch('/api/admin/translate-whitelist');
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            const guilds = data.guilds || [];
            if (guilds.length === 0) {
                listEl.innerHTML = '<div class="empty-state" style="color:var(--text-muted);font-size:0.85rem;">No servers whitelisted — translation is disabled for all servers</div>';
                return;
            }
            listEl.innerHTML = guilds.map(id => `
                <div class="whitelist-user">
                    <span class="whitelist-user-id">${id}</span>
                    <button class="whitelist-remove" onclick="removeFromTranslateWhitelist('${id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `).join('');
        } catch (e) {
            listEl.innerHTML = '<div class="loading">Failed to load</div>';
        }
    }

    window.addToTranslateWhitelist = async function() {
        const input = document.getElementById('newTranslateGuildId');
        const guildId = input?.value?.trim();
        if (!guildId) { showToast('Please enter a guild ID', 'error'); return; }
        if (!/^\d{17,19}$/.test(guildId)) { showToast('Invalid Discord Server ID format', 'error'); return; }
        try {
            const res = await fetch('/api/admin/translate-whitelist/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guild_id: guildId })
            });
            if (res.ok) {
                showToast('Server added to translate whitelist', 'success');
                if (input) input.value = '';
                loadTranslateWhitelist();
            } else throw new Error('Failed');
        } catch (e) { showToast('Failed to add server', 'error'); }
    };

    window.removeFromTranslateWhitelist = async function(guildId) {
        if (!confirm(`Remove guild ${guildId} from translate whitelist?`)) return;
        try {
            const res = await fetch('/api/admin/translate-whitelist/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guild_id: guildId })
            });
            if (res.ok) {
                showToast('Server removed from translate whitelist', 'success');
                loadTranslateWhitelist();
            } else throw new Error('Failed');
        } catch (e) { showToast('Failed to remove server', 'error'); }
    };

    // ==================== IP BANS ====================
    async function loadIpBans() {
        if (!elements.ipbansList) return;

        try {
            const res = await fetch('/api/admin/ipbans');
            if (!res.ok) throw new Error('Failed');

            const data = await res.json();
            renderIpBans(data.bans || {});

        } catch (e) {
            console.error('Error loading IP bans:', e);
            elements.ipbansList.innerHTML = '<div class="loading">Failed to load IP bans</div>';
        }
    }

    function renderIpBans(bansData) {
        let bans = [];

        if (ipBansTab === 'global') {
            bans = (bansData.global || []).map(b => ({ ...b, type: 'global' }));
        } else if (ipBansTab === 'feature') {
            Object.entries(bansData.features || {}).forEach(([feature, featureBans]) => {
                featureBans.forEach(b => bans.push({ ...b, type: 'feature', feature }));
            });
        } else if (ipBansTab === 'temp') {
            // Server uses seconds, JS uses milliseconds
            const nowSec = Date.now() / 1000;
            bans = (bansData.temp || []).filter(b => b.expires > nowSec).map(b => ({ ...b, type: 'temp' }));
        } else if (ipBansTab === 'auto') {
            bans = (bansData.auto || []).map(b => ({ ...b, type: 'auto' }));
        }

        if (bans.length === 0) {
            elements.ipbansList.innerHTML = '<div class="empty-state">No bans in this category</div>';
            return;
        }

        elements.ipbansList.innerHTML = bans.map(b => {
            const probeList = b.probes && b.probes.length ? `<br><span style="font-size:0.75rem;opacity:0.7;">Probes: ${b.probes.join(', ')}</span>` : '';
            const expiresStr = b.expires_at ? ` — Expires: ${formatDate(new Date(b.expires_at).getTime())}` : (b.expires ? ` — Expires: ${formatDate(b.expires * 1000)}` : '');
            return `
            <div class="ipban-item">
                <div class="ipban-info">
                    <span class="ipban-ip">${b.ip}</span>
                    <span class="ipban-meta">
                        ${b.reason || 'No reason'}
                        ${b.feature ? `(${b.feature})` : ''}
                        ${expiresStr}
                        ${probeList}
                    </span>
                </div>
                <div class="ipban-actions">
                    <span class="ipban-type ${b.type}">${b.type}</span>
                    <button class="unban-btn" onclick="unbanIp('${b.ip}', '${b.type}'${b.feature ? `, '${b.feature}'` : ''})">Unban</button>
                </div>
            </div>`;
        }).join('');
    }

    window.banIpAddress = async function() {
        const ip = elements.banIpAddress?.value?.trim();
        const banTypeValue = elements.banType?.value || 'global';
        const reason = elements.banReason?.value?.trim() || 'No reason';

        if (!ip) {
            showToast('Please enter an IP address', 'error');
            return;
        }

        // Map select value to API params
        const isGlobal = banTypeValue === 'global';
        const payload = {
            ip,
            type: isGlobal ? 'global' : 'feature',
            reason
        };
        if (!isGlobal) {
            payload.feature = banTypeValue;
        }

        try {
            const res = await fetch('/api/admin/ipbans/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                showToast(`IP ${ip} banned`, 'success');
                elements.banIpAddress.value = '';
                elements.banReason.value = '';
                loadIpBans();
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast('Failed to ban IP', 'error');
        }
    };

    function parseDuration(str) {
        // Parse human-readable duration strings like "1h", "30m", "7d", "3600"
        const match = str.match(/^(\d+)\s*(s|m|h|d)?$/i);
        if (!match) return null;
        const value = parseInt(match[1]);
        const unit = (match[2] || 's').toLowerCase();
        const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
        return value * (multipliers[unit] || 1);
    }

    window.tempBanIp = async function() {
        const ip = elements.tempBanIp?.value?.trim();
        const durationStr = elements.tempBanDuration?.value?.trim();
        const reason = elements.tempBanReason?.value?.trim() || 'Temporary ban';

        if (!ip || !durationStr) {
            showToast('Please enter IP and duration', 'error');
            return;
        }

        const duration = parseDuration(durationStr);
        if (!duration || duration <= 0) {
            showToast('Invalid duration. Use: 30m, 1h, 7d, or seconds', 'error');
            return;
        }

        try {
            const res = await fetch('/api/admin/ipbans/temp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip, duration, reason })
            });

            if (res.ok) {
                showToast(`IP ${ip} temporarily banned`, 'success');
                elements.tempBanIp.value = '';
                elements.tempBanDuration.value = '';
                elements.tempBanReason.value = '';
                loadIpBans();
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast('Failed to temp ban IP', 'error');
        }
    };

    window.unbanIp = async function(ip, type, feature) {
        if (!confirm(`Unban ${ip}?`)) return;

        try {
            const payload = { ip, type: type || 'global' };
            if (feature) payload.feature = feature;

            const res = await fetch('/api/admin/ipbans/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                showToast(`IP ${ip} unbanned`, 'success');
                loadIpBans();
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast('Failed to unban IP', 'error');
        }
    };

    // ==================== BOT OWNERS ====================
    async function loadBotOwners() {
        const list = document.getElementById('botOwnersList');
        if (!list) return;
        try {
            const res = await fetch('/api/admin/bot-owners');
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            renderBotOwners(data.owners || []);
        } catch (e) {
            list.innerHTML = '<div class="loading">Failed to load bot owners</div>';
        }
    }

    const PROTECTED_OWNER_ID = '378501056008683530';

    function renderBotOwners(owners) {
        const list = document.getElementById('botOwnersList');
        if (!list) return;
        if (!owners.length) {
            list.innerHTML = '<div class="empty-state">No bot owners configured</div>';
            return;
        }
        list.innerHTML = owners.map(id => {
            const isProtected = id === PROTECTED_OWNER_ID;
            const action = isProtected
                ? `<span style="font-size:0.75rem;color:var(--text-muted);display:flex;align-items:center;gap:0.25rem;">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                       Protected
                   </span>`
                : `<button class="whitelist-remove" onclick="removeBotOwner('${id}')" title="Remove owner">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                   </button>`;
            return `
            <div class="whitelist-user">
                <span class="whitelist-user-id">${id}${isProtected ? ' <span style="font-size:0.7rem;color:var(--primary);margin-left:0.5rem;">(primary)</span>' : ''}</span>
                ${action}
            </div>`;
        }).join('');
    }

    window.addBotOwner = async function() {
        const input = document.getElementById('newOwnerId');
        const id = input?.value?.trim();
        if (!id || !/^\d+$/.test(id)) {
            showToast('Please enter a valid Discord user ID (numbers only)', 'error');
            return;
        }
        try {
            const res = await fetch('/api/admin/bot-owners');
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            const owners = data.owners || [];
            if (owners.includes(id)) {
                showToast('That ID is already a bot owner', 'error');
                return;
            }
            owners.push(id);
            const saveRes = await fetch('/api/admin/bot-owners', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ owners })
            });
            if (saveRes.ok) {
                showToast(`Added bot owner: ${id}`, 'success');
                if (input) input.value = '';
                loadBotOwners();
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast('Failed to add bot owner', 'error');
        }
    };

    window.removeBotOwner = async function(id) {
        if (id === PROTECTED_OWNER_ID) {
            showToast('This owner is protected and cannot be removed', 'error');
            return;
        }
        if (!confirm(`Remove ${id} as a bot owner?`)) return;
        try {
            const res = await fetch('/api/admin/bot-owners');
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            const owners = (data.owners || []).filter(o => o !== id);
            if (!owners.length) {
                showToast('Cannot remove the last bot owner', 'error');
                return;
            }
            const saveRes = await fetch('/api/admin/bot-owners', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ owners })
            });
            if (saveRes.ok) {
                showToast(`Removed bot owner: ${id}`, 'success');
                loadBotOwners();
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast('Failed to remove bot owner', 'error');
        }
    };

    // ==================== CUBAI SERVERS ====================
    async function loadCubAiServers() {
        const list = document.getElementById('cubAiServersList');
        if (!list) return;
        try {
            const res = await fetch('/api/admin/cubai-servers');
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            renderCubAiServers(data.guilds || []);
        } catch (e) {
            list.innerHTML = '<div class="loading">Failed to load CubAI servers</div>';
        }
    }

    function renderCubAiServers(guilds) {
        const list = document.getElementById('cubAiServersList');
        if (!list) return;
        if (!guilds.length) {
            list.innerHTML = '<div class="empty-state">No servers have CubAI enabled</div>';
            return;
        }
        list.innerHTML = guilds.map(id => `
            <div class="whitelist-user">
                <span class="whitelist-id">${id}</span>
                <button class="whitelist-remove" onclick="removeCubAiServer('${id}')" title="Remove server">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
            </div>`).join('');
    }

    window.addCubAiServer = async function() {
        const input = document.getElementById('newCubAiGuildId');
        const id = input?.value?.trim();
        if (!id || !/^\d+$/.test(id)) {
            showToast('Please enter a valid Discord server ID (numbers only)', 'error');
            return;
        }
        try {
            const res = await fetch('/api/admin/cubai-servers/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guild_id: id })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(`CubAI enabled for server: ${id}`, 'success');
                if (input) input.value = '';
                loadCubAiServers();
            } else {
                showToast(data.error || 'Failed to add server', 'error');
            }
        } catch (e) {
            showToast('Failed to add server', 'error');
        }
    };

    window.removeCubAiServer = async function(id) {
        if (!confirm(`Remove server ${id} from CubAI servers? The /cubai command will disappear from that Discord.`)) return;
        try {
            const res = await fetch('/api/admin/cubai-servers/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guild_id: id })
            });
            if (res.ok) {
                showToast(`CubAI disabled for server: ${id}`, 'success');
                loadCubAiServers();
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            showToast('Failed to remove server', 'error');
        }
    };

    // ==================== MESSAGE REACTIONS ====================
    window.loadMessageReactions = async function() {
        const list = document.getElementById('mrTrackedList');
        if (!list) return;
        list.innerHTML = '<div class="loading">Loading…</div>';
        try {
            const res = await fetch('/api/admin/message-reactions');
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            const cfg = data.config || {};
            // Populate config fields
            const enabled = document.getElementById('mrEnabled');
            const guildId = document.getElementById('mrGuildId');
            const monitor = document.getElementById('mrMonitorChannels');
            const digestCh = document.getElementById('mrDigestChannel');
            const interval = document.getElementById('mrInterval');
            const hour = document.getElementById('mrHour');
            const minR = document.getElementById('mrMinReactions');
            const topN = document.getElementById('mrTopCount');
            if (enabled) enabled.checked = cfg.enabled || false;
            if (guildId) guildId.value = cfg.guild_id || '';
            if (monitor) monitor.value = (cfg.monitor_channels || []).join(', ');
            if (digestCh) digestCh.value = cfg.digest_channel || '';
            if (interval) interval.value = cfg.digest_interval || 'daily';
            if (hour) hour.value = cfg.digest_hour ?? 9;
            if (minR) minR.value = cfg.min_reactions ?? 3;
            if (topN) topN.value = cfg.top_count ?? 5;

            // Render stats
            const stats = data.stats || {};
            const countEl = document.getElementById('mrTrackedCount');
            if (countEl) countEl.textContent = `(${stats.tracked_count || 0} tracked)`;
            const lastDigestEl = document.getElementById('mrLastDigestLabel');
            if (lastDigestEl && stats.last_digest) {
                const d = new Date(stats.last_digest);
                lastDigestEl.textContent = `Last digest: ${d.toLocaleString()}`;
            }
            const top = stats.top_messages || [];
            if (!top.length) {
                list.innerHTML = '<div class="empty-state">No tracked messages yet</div>';
            } else {
                list.innerHTML = top.map(m => `
                    <div class="whitelist-user" style="flex-direction:column;align-items:flex-start;gap:0.2rem;padding:0.6rem 0.75rem;">
                        <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
                            <a href="${m.url}" target="_blank" rel="noopener" style="font-size:0.8rem;color:var(--accent);text-decoration:none;word-break:break-all;">#${m.channel_id}</a>
                            <span style="font-size:0.8rem;font-weight:600;color:var(--text-primary);">${m.total} 👍</span>
                        </div>
                        ${m.content ? `<div style="font-size:0.75rem;color:var(--text-muted);word-break:break-all;">${escapeHtml(m.content.slice(0, 100))}</div>` : ''}
                        <div style="font-size:0.7rem;color:rgba(255,255,255,0.25);">by ${escapeHtml(m.author_name || 'Unknown')}</div>
                    </div>`).join('');
            }
        } catch (e) {
            if (list) list.innerHTML = '<div class="loading">Failed to load</div>';
        }
    };

    window.saveMessageReactions = async function() {
        const cfg = {
            enabled: document.getElementById('mrEnabled')?.checked || false,
            guild_id: document.getElementById('mrGuildId')?.value?.trim() || '',
            monitor_channels: (document.getElementById('mrMonitorChannels')?.value || '')
                .split(',').map(s => s.trim()).filter(Boolean),
            digest_channel: document.getElementById('mrDigestChannel')?.value?.trim() || '',
            digest_interval: document.getElementById('mrInterval')?.value || 'daily',
            digest_hour: parseInt(document.getElementById('mrHour')?.value) || 9,
            min_reactions: parseInt(document.getElementById('mrMinReactions')?.value) || 3,
            top_count: parseInt(document.getElementById('mrTopCount')?.value) || 5,
        };
        try {
            const res = await fetch('/api/admin/message-reactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: cfg }),
            });
            if (res.ok) {
                showToast('Message Reactions config saved', 'success');
            } else {
                showToast('Failed to save', 'error');
            }
        } catch (e) {
            showToast('Failed to save', 'error');
        }
    };

    window.clearMsgReactionsTracked = async function() {
        if (!confirm('Clear all currently tracked messages? The next digest will have no data.')) return;
        try {
            const res = await fetch('/api/admin/message-reactions/clear', { method: 'POST' });
            if (res.ok) {
                showToast('Tracked messages cleared', 'success');
                loadMessageReactions();
            } else {
                showToast('Failed to clear', 'error');
            }
        } catch (e) {
            showToast('Failed to clear', 'error');
        }
    };

    // ==================== PASSWORDS ====================
    async function loadPasswords() {
        const list = document.getElementById('passwordsList');
        if (!list) return;

        try {
            const response = await fetch('/api/pm2/keraplast/passwords');
            if (!response.ok) throw new Error('Failed to load passwords');
            const data = await response.json();

            if (!data.passwords || data.passwords.length === 0) {
                list.innerHTML = '<div class="empty-state">No passwords configured</div>';
                return;
            }

            list.innerHTML = data.passwords.map(p => {
                const created = p.created_at ? new Date(p.created_at * 1000).toLocaleDateString() : 'Unknown';
                const adminBadge = p.role === 'admin' ? '<span class="password-admin-badge">Admin</span>' : '';
                return `
                    <div class="password-item">
                        <div class="password-info">
                            <span class="password-value"><code>${escapeHtml(p.password)}</code></span>
                            <span class="password-label">${escapeHtml(p.label) || 'No label'} ${adminBadge}</span>
                            <span class="password-date">Created: ${created}</span>
                        </div>
                        <button class="delete-btn small" onclick="deletePassword('${escapeHtml(p.password)}')">Delete</button>
                    </div>
                `;
            }).join('');
        } catch (err) {
            list.innerHTML = `<div class="error-state">Failed to load passwords: ${err.message}</div>`;
        }
    }
    window.loadPasswords = loadPasswords;

    window.createPassword = async function() {
        const passwordInput = document.getElementById('newPassword');
        const labelInput = document.getElementById('newPasswordLabel');
        const adminCheckbox = document.getElementById('newPasswordAdmin');
        const password = passwordInput.value.trim();
        const label = labelInput.value.trim();
        const role = adminCheckbox && adminCheckbox.checked ? 'admin' : 'user';

        if (!password) {
            showToast('Password is required', 'error');
            return;
        }

        try {
            const response = await fetch('/api/pm2/keraplast/passwords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, label, role })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create password');
            }

            passwordInput.value = '';
            labelInput.value = '';
            if (adminCheckbox) adminCheckbox.checked = false;
            showToast('Password created successfully');
            loadPasswords();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    window.deletePassword = async function(password) {
        if (!confirm(`Delete password "${password}"?`)) return;

        try {
            const response = await fetch(`/api/pm2/keraplast/passwords/${encodeURIComponent(password)}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to delete password');
            }

            showToast('Password deleted');
            loadPasswords();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    // ==================== UTILITIES ====================
    function showToast(message, type = 'success') {
        if (!elements.toast) return;

        elements.toast.textContent = message;
        elements.toast.className = `toast show ${type}`;

        setTimeout(() => {
            elements.toast.classList.remove('show');
        }, 3000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatUptime(ms) {
        if (!ms) return 'N/A';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    function formatDate(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleString();
    }

    // ==================== API STATUS ====================
    let apiStatusData = null;
    let apiStatusInterval = null;

    function startApiStatusRefresh() {
        stopApiStatusRefresh();
        apiStatusInterval = setInterval(() => {
            if (currentSection === 'api-status') loadApiStatus();
        }, 30000); // refresh every 30s while on the section
    }

    function stopApiStatusRefresh() {
        if (apiStatusInterval) { clearInterval(apiStatusInterval); apiStatusInterval = null; }
    }

    window.loadApiStatus = async function() {
        if (!apiStatusInterval) startApiStatusRefresh();
        const grid = document.getElementById('apiStatusGrid');
        if (!grid) return;
        try {
            const res = await fetch('/api/admin/api-status');
            const data = await res.json();
            apiStatusData = data;

            // Update counters
            const total = data.total || 0;
            const online = data.online || 0;
            const errored = data.errored || 0;
            const idle = data.idle || 0;
            document.getElementById('apiTotalCount').textContent = total;
            document.getElementById('apiOnlineCount').textContent = online;
            const onlineStat = document.getElementById('apiOnlineStat');
            const errorStat = document.getElementById('apiErrorStat');
            if (onlineStat) onlineStat.textContent = online;
            if (errorStat) errorStat.textContent = errored;

            // Uptime - start a live ticker
            startUptimeTicker(data.uptime_seconds || 0);

            renderApiEndpoints(data.categories || {});
        } catch (e) {
            grid.innerHTML = '<div class="api-error-message">Failed to load API status. Server may be offline.</div>';
            document.getElementById('apiOnlineCount').textContent = '0';
        }
    };

    let uptimeTickerInterval = null;
    let uptimeBase = 0;
    let uptimeFetchedAt = 0;

    function startUptimeTicker(serverUptime) {
        uptimeBase = serverUptime;
        uptimeFetchedAt = Date.now();
        if (uptimeTickerInterval) clearInterval(uptimeTickerInterval);
        updateUptimeDisplay();
        uptimeTickerInterval = setInterval(updateUptimeDisplay, 1000);
    }

    function updateUptimeDisplay() {
        const elapsed = Math.floor((Date.now() - uptimeFetchedAt) / 1000);
        const upSec = uptimeBase + elapsed;
        const days = Math.floor(upSec / 86400);
        const hours = Math.floor((upSec % 86400) / 3600);
        const mins = Math.floor((upSec % 3600) / 60);
        const secs = upSec % 60;
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        parts.push(`${mins}m`);
        parts.push(`${secs}s`);
        const el = document.getElementById('serverUptime');
        if (el) el.textContent = parts.join(' ');
    }

    function timeAgo(timestamp) {
        const now = Date.now() / 1000;
        const diff = Math.floor(now - timestamp);
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    function renderApiEndpoints(categories, filter = '') {
        const grid = document.getElementById('apiStatusGrid');
        if (!grid) return;

        const filterLower = filter.toLowerCase();
        let html = '';

        const catOrder = ['Admin Dashboard', 'CUB SOFTWARE Website', 'CUB SOFTWARE Tools', 'Stream Overlays', 'CUB PROTECTOR', 'CleanMe', 'CubReactive', 'CubPresence', 'Bot Dashboard', 'Affiliate Program', 'Keraplast'];
        const sortedCats = Object.keys(categories).sort((a, b) => {
            const ai = catOrder.indexOf(a);
            const bi = catOrder.indexOf(b);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });

        for (const cat of sortedCats) {
            let eps = categories[cat];
            if (filterLower) {
                eps = eps.filter(e => e.path.toLowerCase().includes(filterLower) || e.methods.join(' ').toLowerCase().includes(filterLower));
            }
            if (eps.length === 0) continue;

            html += `<div class="api-category">
                <div class="api-category-header">
                    <h3 class="api-category-title">${cat}</h3>
                    <span class="api-category-count">${eps.length}</span>
                </div>`;

            for (const ep of eps) {
                const isError = ep.status === 'error';
                const dotClass = isError ? 'error' : 'online';
                const rowClass = isError ? 'status-error' : 'status-online';
                const lastCalledStr = ep.last_called ? timeAgo(ep.last_called) : '';
                const statusTitle = isError ? `Error ${ep.last_status_code} - ${lastCalledStr}` : ep.last_called ? `Online (${ep.last_status_code}) - ${lastCalledStr}` : 'Online';

                const methodBadges = ep.methods.map(m =>
                    `<span class="api-method-badge ${m.toLowerCase()}">${m}</span>`
                ).join('');

                html += `<div class="api-endpoint ${rowClass}" title="${statusTitle}">
                    <span class="api-endpoint-dot ${dotClass}"></span>
                    <div class="api-method-badges">${methodBadges}</div>
                    <span class="api-endpoint-path">${ep.path}</span>
                    <span class="api-endpoint-time">${lastCalledStr}</span>
                </div>`;
            }

            html += '</div>';
        }

        if (!html) {
            html = '<div class="api-no-results">No endpoints match your search.</div>';
        }

        grid.innerHTML = html;
    }

    // Search filtering for API status
    document.getElementById('apiSearchInput')?.addEventListener('input', function() {
        if (apiStatusData) {
            renderApiEndpoints(apiStatusData.categories || {}, this.value);
        }
    });

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ==================== CUSTOM BOTS ====================
    window.launchCustomBot = async function(guildId) {
        try {
            const res = await fetch(`/api/pm2/custom-bots/${guildId}/launch`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast('Custom bot started', 'success');
                setTimeout(loadCustomBots, 1500);
            } else {
                showToast(data.error || 'Failed to start bot', 'error');
            }
        } catch (e) {
            showToast('Failed to start bot', 'error');
        }
    };

    window.launchAllCustomBots = async function() {
        const btn = document.getElementById('launchAllBotsBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Launching...'; }
        try {
            const res = await fetch('/api/pm2/custom-bots/launch-all', { method: 'POST' });
            const data = await res.json();
            const results = data.results || [];
            const started = results.filter(r => r.status === 'started').length;
            const errors = results.filter(r => r.status === 'error');
            if (errors.length > 0) {
                showToast(`Launched ${started}/${results.length} bots. ${errors.length} error(s) — check console.`, 'error');
                errors.forEach(e => console.warn(`[CustomBot] ${e.name}: ${e.message}`));
            } else {
                showToast(`Launched ${started} custom bot${started !== 1 ? 's' : ''} successfully`, 'success');
            }
            setTimeout(loadCustomBots, 1500);
        } catch (e) {
            showToast('Failed to launch custom bots', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="5 3 19 12 5 21 5 3"/></svg> Launch All`;
            }
        }
    };

    window.loadCustomBots = async function() {
        const grid = document.getElementById('customBotsGrid');
        if (!grid) return;
        grid.innerHTML = '<div class="loading">Loading custom bots...</div>';
        try {
            const res = await fetch('/api/pm2/custom-bots');
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();
            const bots = data.bots || [];

            const badge = document.getElementById('customBotsBadge');
            if (badge) {
                badge.textContent = bots.length;
                badge.style.display = bots.length > 0 ? '' : 'none';
            }

            if (bots.length === 0) {
                grid.innerHTML = '<div class="loading">No custom bots running.</div>';
                return;
            }

            grid.innerHTML = bots.map(bot => {
                const avatarHtml = bot.avatar_url
                    ? `<img src="${escapeHtml(bot.avatar_url)}" alt="" style="width:40px;height:40px;border-radius:50%;margin-right:10px;flex-shrink:0;">`
                    : `<div style="width:40px;height:40px;border-radius:50%;background:rgba(88,101,242,0.3);display:flex;align-items:center;justify-content:center;margin-right:10px;flex-shrink:0;font-size:1.1rem;">🤖</div>`;
                const statusClass = bot.status === 'online' ? 'online' : (bot.status === 'stopped' ? 'stopped' : 'errored');
                return `
                <div class="process-card">
                    <div class="process-header">
                        <div style="display:flex;align-items:center;">
                            ${avatarHtml}
                            <div>
                                <div class="process-name">${escapeHtml(bot.display_name)}</div>
                                ${bot.discord_username ? `<div style="font-size:0.75rem;color:var(--text-muted);">@${escapeHtml(bot.discord_username)}</div>` : ''}
                            </div>
                        </div>
                        <span class="process-status ${statusClass}">${bot.status}</span>
                    </div>
                    <div class="process-stats">
                        <div class="stat-item">
                            <span class="stat-label">CPU</span>
                            <span class="stat-value">${(bot.cpu || 0).toFixed(1)}%</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Memory</span>
                            <span class="stat-value">${formatBytes(bot.memory || 0)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Uptime</span>
                            <span class="stat-value">${formatUptime(bot.uptime)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Restarts</span>
                            <span class="stat-value">${bot.restarts || 0}</span>
                        </div>
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:10px;">
                        Guild: <span style="font-family:monospace;">${escapeHtml(bot.guild_id)}</span>
                        ${bot.client_id ? ` &bull; App ID: <span style="font-family:monospace;">${escapeHtml(bot.client_id)}</span>` : ''}
                    </div>
                    <div class="process-actions">
                        <button class="restart" onclick="launchCustomBot('${escapeHtml(bot.guild_id)}')">Restart</button>
                        ${bot.status === 'online'
                            ? `<button class="stop" onclick="stopProcess('${escapeHtml(bot.name)}')">Stop</button>`
                            : `<button class="start" onclick="launchCustomBot('${escapeHtml(bot.guild_id)}')">Start</button>`
                        }
                    </div>
                </div>`;
            }).join('');
        } catch (e) {
            grid.innerHTML = `<div class="loading">Error loading custom bots: ${escapeHtml(e.message)}</div>`;
        }
    };

    // ==================== AFFILIATES ====================

    let affiliatesData = [];

    window.loadAffiliates = async function() {
        try {
            const res = await fetch('/api/admin/affiliates');
            const data = await res.json();
            affiliatesData = data.affiliates || [];
            renderAffiliatesTable(affiliatesData);
            updateAffSummary(affiliatesData);
        } catch (e) {
            showToast('Failed to load affiliates', 'error');
        }
    };

    function updateAffSummary(affs) {
        document.getElementById('affSumTotal').textContent = affs.length;
        document.getElementById('affSumActive').textContent = affs.filter(a => a.enabled).length;
        document.getElementById('affSumClicks').textContent = affs.reduce((s, a) => s + a.unique_clicks, 0);
        document.getElementById('affSumEarnings').textContent = '$' + affs.reduce((s, a) => s + (a.pending_payout || 0), 0).toFixed(2);
    }

    function renderAffiliatesTable(affs) {
        const tbody = document.getElementById('affTbody');
        const empty = document.getElementById('affEmpty');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (affs.length === 0) { empty.style.display = 'block'; return; }
        empty.style.display = 'none';
        affs.forEach(aff => {
            const tr = document.createElement('tr');
            const avatarSrc = aff.discord_avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
            tr.innerHTML = `
                <td style="padding:.8rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <div style="display:flex;align-items:center;gap:.5rem;">
                        <img src="${avatarSrc}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" style="width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,0.1);" alt="">
                        <div>
                            <div style="font-weight:500;font-size:.85rem;">${escapeHtml(aff.discord_username || 'Unknown')}</div>
                            <div style="font-size:.7rem;color:var(--text-muted);font-family:monospace;">${escapeHtml(aff.discord_id)}</div>
                        </div>
                    </div>
                </td>
                <td style="padding:.8rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <span style="font-family:monospace;font-size:.78rem;background:rgba(0,157,255,.1);color:#009dff;padding:2px 7px;border-radius:5px;border:1px solid rgba(0,157,255,.2);">/r/${escapeHtml(aff.code)}</span>
                </td>
                <td style="padding:.8rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <span style="font-size:.7rem;font-weight:600;padding:3px 9px;border-radius:20px;${aff.enabled ? 'background:rgba(87,242,135,.12);color:#57F287;border:1px solid rgba(87,242,135,.3);' : 'background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.25);'}">${aff.enabled ? 'Active' : 'Disabled'}</span>
                </td>
                <td style="padding:.8rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.04);color:#009dff;font-weight:600;">${aff.unique_clicks}</td>
                <td style="padding:.8rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.04);color:var(--text-muted);">${aff.total_clicks}</td>
                <td style="padding:.8rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.04);">$${Number(aff.commission_rate).toFixed(2)}</td>
                <td style="padding:.8rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <div style="font-weight:600;${aff.payout_eligible ? 'color:#57F287;' : 'color:var(--text-secondary);'}">$${Number(aff.pending_payout || 0).toFixed(2)}</div>
                    <div style="font-size:.68rem;color:var(--text-muted);">of $${Number(aff.total_earned || 0).toFixed(2)} total</div>
                </td>
                <td style="padding:.8rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <div style="display:flex;gap:.4rem;flex-wrap:wrap;">
                        <button class="control-btn" style="padding:.28rem .65rem;font-size:.72rem;" onclick="openAffEdit('${escapeHtml(aff.id)}')">Edit</button>
                        ${!aff.discord_avatar ? `<button class="control-btn secondary" style="padding:.28rem .65rem;font-size:.72rem;" onclick="fetchAffAvatar('${escapeHtml(aff.id)}')">Fetch Avatar</button>` : ''}
                        ${aff.payout_eligible ? `<button class="control-btn start" style="padding:.28rem .65rem;font-size:.72rem;" onclick="markAffPaid('${escapeHtml(aff.id)}')">Mark Paid</button>` : ''}
                        <button class="control-btn ${aff.enabled ? 'stop' : 'start'}" style="padding:.28rem .65rem;font-size:.72rem;" onclick="toggleAffiliateAdmin('${escapeHtml(aff.id)}',${!aff.enabled})">${aff.enabled ? 'Disable' : 'Enable'}</button>
                        <button class="control-btn stop" style="padding:.28rem .65rem;font-size:.72rem;" onclick="deleteAffiliateAdmin('${escapeHtml(aff.id)}')">Delete</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.filterAffiliatesTable = function() {
        const q = (document.getElementById('affSearch').value || '').toLowerCase();
        const filtered = affiliatesData.filter(a =>
            (a.discord_username || '').toLowerCase().includes(q) ||
            a.discord_id.includes(q) ||
            a.code.includes(q)
        );
        renderAffiliatesTable(filtered);
    };

    window.createAffiliateAdmin = async function() {
        const btn = document.getElementById('affCreateBtn');
        const err = document.getElementById('affCreateError');
        err.style.display = 'none';

        const discord_id = document.getElementById('affInId').value.trim();
        const discord_username = document.getElementById('affInUser').value.trim();
        const code = document.getElementById('affInCode').value.trim().toLowerCase();
        const commission_rate = parseFloat(document.getElementById('affInRate').value) || 0;
        const notes = document.getElementById('affInNotes').value.trim();

        if (!discord_id || !code) { err.textContent = 'Discord ID and vanity code are required.'; err.style.display = 'block'; return; }

        btn.disabled = true;
        try {
            const res = await fetch('/api/admin/affiliates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ discord_id, discord_username, code, commission_rate, notes })
            });
            const data = await res.json();
            if (!res.ok) { err.textContent = data.error || 'Failed.'; err.style.display = 'block'; }
            else {
                showToast('Affiliate created!', 'success');
                ['affInId','affInUser','affInCode','affInNotes'].forEach(id => document.getElementById(id).value = '');
                document.getElementById('affInRate').value = '0';
                await loadAffiliates();
            }
        } catch (e) { err.textContent = 'Network error.'; err.style.display = 'block'; }
        btn.disabled = false;
    };

    window.openAffEdit = function(id) {
        const aff = affiliatesData.find(a => a.id === id);
        if (!aff) return;
        document.getElementById('affEditId').value = id;
        document.getElementById('affEditCode').value = aff.code;
        document.getElementById('affEditRate').value = aff.commission_rate;
        document.getElementById('affEditNotes').value = aff.notes || '';
        document.getElementById('affEditError').style.display = 'none';
        document.getElementById('affEditModal').style.display = 'flex';
    };

    window.closeAffModal = function() {
        document.getElementById('affEditModal').style.display = 'none';
    };

    window.saveAffEdit = async function() {
        const id = document.getElementById('affEditId').value;
        const code = document.getElementById('affEditCode').value.trim().toLowerCase();
        const commission_rate = parseFloat(document.getElementById('affEditRate').value) || 0;
        const notes = document.getElementById('affEditNotes').value.trim();
        const err = document.getElementById('affEditError');
        err.style.display = 'none';

        try {
            const res = await fetch(`/api/admin/affiliates/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, commission_rate, notes })
            });
            const data = await res.json();
            if (!res.ok) { err.textContent = data.error || 'Failed.'; err.style.display = 'block'; }
            else { closeAffModal(); showToast('Affiliate updated!', 'success'); await loadAffiliates(); }
        } catch (e) { err.textContent = 'Network error.'; err.style.display = 'block'; }
    };

    window.toggleAffiliateAdmin = async function(id, enabled) {
        try {
            const res = await fetch(`/api/admin/affiliates/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
            if (res.ok) { showToast(enabled ? 'Enabled.' : 'Disabled.', 'success'); await loadAffiliates(); }
        } catch (e) { showToast('Failed.', 'error'); }
    };

    window.deleteAffiliateAdmin = async function(id) {
        const aff = affiliatesData.find(a => a.id === id);
        if (!confirm(`Delete affiliate "${aff?.discord_username || id}"? This cannot be undone.`)) return;
        try {
            const res = await fetch(`/api/admin/affiliates/${id}`, { method: 'DELETE' });
            if (res.ok) { showToast('Deleted.', 'success'); await loadAffiliates(); }
        } catch (e) { showToast('Failed.', 'error'); }
    };

    window.fetchAffAvatar = async function(id) {
        try {
            const res = await fetch(`/api/admin/affiliates/${id}/fetch-avatar`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'Failed to fetch avatar.', 'error'); }
            else { showToast('Avatar updated!', 'success'); await loadAffiliates(); }
        } catch (e) { showToast('Network error.', 'error'); }
    };

    window.markAffPaid = async function(id) {
        const aff = affiliatesData.find(a => a.id === id);
        if (!aff) return;
        const note = prompt(`Mark $${Number(aff.pending_payout).toFixed(2)} as paid for ${aff.discord_username || aff.discord_id}?\n\nOptional note (e.g. PayPal, bank transfer):`, '');
        if (note === null) return; // cancelled
        try {
            const res = await fetch(`/api/admin/affiliates/${id}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note })
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'Failed to record payment.', 'error'); }
            else { showToast(`Payment of $${Number(data.amount_paid).toFixed(2)} recorded!`, 'success'); await loadAffiliates(); }
        } catch (e) { showToast('Network error.', 'error'); }
    };

    // ── Withdrawal requests ──

    window.loadWithdrawals = async function() {
        try {
            const res = await fetch('/api/admin/affiliates/withdrawals');
            const data = await res.json();
            renderWithdrawals(data.withdrawals || []);
        } catch (e) { /* silently ignore */ }
    };

    function renderWithdrawals(withdrawals) {
        const tbody  = document.getElementById('wdTbody');
        const empty  = document.getElementById('wdEmpty');
        const table  = document.getElementById('wdTable');
        const badge  = document.getElementById('wdPendingBadge');
        if (!tbody) return;

        const pending = withdrawals.filter(w => w.status === 'pending');
        if (pending.length) {
            badge.textContent = `${pending.length} pending`;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }

        if (!withdrawals.length) {
            table.style.display = 'none';
            empty.style.display = 'block';
            return;
        }
        table.style.display = 'table';
        empty.style.display = 'none';

        tbody.innerHTML = withdrawals.map(w => {
            const date = new Date(w.created_at * 1000).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
            let statusHtml;
            if (w.status === 'pending') {
                statusHtml = `<span style="background:rgba(255,196,0,0.12);color:#ffc400;border:1px solid rgba(255,196,0,0.25);padding:2px 9px;border-radius:20px;font-size:.7rem;font-weight:700;">Pending</span>`;
            } else if (w.status === 'paid') {
                statusHtml = `<span style="background:rgba(87,242,135,0.1);color:#57F287;border:1px solid rgba(87,242,135,0.25);padding:2px 9px;border-radius:20px;font-size:.7rem;font-weight:700;">Paid${w.invoice_id ? ' · ' + escapeHtml(w.invoice_id) : ''}</span>`;
            } else {
                statusHtml = `<span style="background:rgba(237,66,69,0.1);color:#ed4245;border:1px solid rgba(237,66,69,0.25);padding:2px 9px;border-radius:20px;font-size:.7rem;font-weight:700;">Rejected</span>`;
            }
            const deleteBtn = `<button class="control-btn stop" onclick="deleteWithdrawal('${escapeHtml(w.id)}', '${w.status}')" style="margin-left:4px;">Delete</button>`;
            const actions = w.status === 'pending'
                ? `<button class="control-btn start" onclick="payWithdrawal('${escapeHtml(w.id)}')">Mark Paid</button>
                   <button class="control-btn stop" onclick="rejectWithdrawal('${escapeHtml(w.id)}')" style="margin-left:4px;">Reject</button>
                   ${deleteBtn}`
                : deleteBtn;

            return `<tr>
                <td style="padding:.65rem 1.25rem;font-size:.82rem;color:var(--text-light);border-bottom:1px solid rgba(255,255,255,0.04);"><strong>${escapeHtml(w.discord_username || 'Unknown')}</strong></td>
                <td style="padding:.65rem 1.25rem;font-size:.82rem;color:#57F287;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04);">NZ$${parseFloat(w.amount).toFixed(2)}</td>
                <td style="padding:.65rem 1.25rem;font-size:.82rem;color:var(--text-muted);border-bottom:1px solid rgba(255,255,255,0.04);">${escapeHtml(w.paypal_email)}</td>
                <td style="padding:.65rem 1.25rem;font-size:.82rem;color:var(--text-muted);border-bottom:1px solid rgba(255,255,255,0.04);">${date}</td>
                <td style="padding:.65rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.04);">${statusHtml}</td>
                <td style="padding:.65rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.04);">${actions}</td>
            </tr>`;
        }).join('');
    }

    window.payWithdrawal = async function(wdId) {
        if (!confirm('Confirm you have sent the PayPal payment and want to mark this as paid?')) return;
        try {
            const res = await fetch(`/api/admin/affiliates/withdrawals/${wdId}/pay`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'Failed', 'error'); }
            else { showToast(`Marked as paid — ${data.invoice_id}`, 'success'); await loadWithdrawals(); await loadAffiliates(); }
        } catch (e) { showToast('Network error.', 'error'); }
    };

    window.deleteWithdrawal = async function(wdId, status) {
        const warn = status === 'paid' ? ' This will reverse the paid amount from the affiliate\'s balance.' : '';
        if (!confirm(`Delete this withdrawal record?${warn}`)) return;
        try {
            const res = await fetch(`/api/admin/affiliates/withdrawals/${wdId}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'Failed', 'error'); }
            else { showToast('Withdrawal deleted.', 'success'); await loadWithdrawals(); await loadAffiliates(); }
        } catch (e) { showToast('Network error.', 'error'); }
    };

    window.rejectWithdrawal = async function(wdId) {
        const note = prompt('Reason for rejection (optional):');
        if (note === null) return;
        try {
            const res = await fetch(`/api/admin/affiliates/withdrawals/${wdId}/reject`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note })
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'Failed', 'error'); }
            else { showToast('Withdrawal rejected.', 'success'); await loadWithdrawals(); }
        } catch (e) { showToast('Network error.', 'error'); }
    };

    // Load affiliates when section becomes active
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            if (this.dataset.section === 'affiliates') { loadAffiliates(); loadWithdrawals(); }
        });
    });

})();

// ── CubAssist bot token management ─────────────────────────────────────────────

window.loadCubAssist = async function() {
    const nick     = document.getElementById('cubassistNick');
    const dot      = document.getElementById('cubassistDot');
    const warnings = document.getElementById('cubassistWarnings');
    if (!nick) return;
    nick.textContent = 'Loading…';
    try {
        const r = await fetch('/cubassist/api/admin/bot-status');
        if (!r.ok) throw new Error('Not available');
        const d = await r.json();

        nick.textContent = d.bot_nick || 'Not configured';

        if (d.connected) {
            dot.style.background = '#57f287';
            dot.style.boxShadow  = '0 0 8px #57f287';
        } else if (d.running) {
            dot.style.background = '#f59e0b';
            dot.style.boxShadow  = 'none';
        } else {
            dot.style.background = '#ed4245';
            dot.style.boxShadow  = 'none';
        }

        if (warnings) {
            if (d.warnings && d.warnings.length) {
                warnings.innerHTML = d.warnings.map(w =>
                    `<div style="color:#f59e0b;font-size:11px;margin-top:6px;">⚠ ${w}</div>`
                ).join('');
                warnings.style.display = '';
            } else {
                warnings.style.display = 'none';
            }
        }
    } catch {
        nick.textContent = 'Unavailable';
        dot.style.background = 'var(--text-muted)';
    }
};

window.cubassistConnect = async function() {
    const btn  = document.getElementById('cubassistConnectBtn');
    const hint = document.getElementById('cubassistActionHint');
    btn.disabled = true;
    hint.textContent = 'Opening Twitch…';
    try {
        const r = await fetch('/cubassist/api/admin/start-bot-setup', { method: 'POST' });
        const d = await r.json();
        if (d.url) {
            hint.textContent = 'Redirecting to Twitch — log in as the bot account…';
            window.location.href = d.url;
        } else {
            hint.textContent = 'Failed to start setup.';
            btn.disabled = false;
        }
    } catch (e) {
        hint.textContent = 'Error: ' + e.message;
        btn.disabled = false;
    }
};

window.cubassistRefreshToken = async function() {
    const btn  = document.getElementById('cubassistRefreshBtn');
    const hint = document.getElementById('cubassistActionHint');
    btn.disabled = true;
    hint.textContent = 'Refreshing…';
    try {
        const r = await fetch('/cubassist/api/admin/refresh-bot-token', { method: 'POST' });
        const d = await r.json();
        if (d.ok) {
            hint.textContent = '✓ Token refreshed — bot account: ' + (d.bot_nick || '');
            await loadCubAssist();
        } else {
            hint.textContent = d.error || 'Refresh failed — try Connect instead.';
        }
    } catch (e) {
        hint.textContent = 'Error: ' + e.message;
    }
    btn.disabled = false;
};

// ==================== MARBLES ADMIN ====================
let _marblesAllMaps = [];

function _marblesEsc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _marblesFormatDate(ts) {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

window.loadMarblesAdmin = async function() {
    const [sessRes, mapsRes, racesRes] = await Promise.all([
        fetch('/marbles/api/admin/sessions'),
        fetch('/marbles/api/admin/maps'),
        fetch('/marbles/api/admin/races'),
    ]);

    // IRC Status
    if (sessRes.ok) {
        const d = await sessRes.json();
        const irc = d.irc || {};
        const dot = document.getElementById('marblesIrcDot');
        const txt = document.getElementById('marblesIrcText');
        if (dot && txt) {
            dot.style.background = irc.connected ? '#22c55e' : '#ef4444';
            txt.textContent = irc.connected
                ? `IRC connected · ${(irc.channels || []).length} channel(s) · ${irc.sessions} active session(s)`
                : 'IRC disconnected';
        }
        // Sessions table
        const sessions = d.sessions || [];
        const badge = document.getElementById('marblesBadge');
        const active = sessions.filter(s => s.state !== 'ended');
        if (badge) { badge.textContent = active.length; badge.style.display = active.length ? '' : 'none'; }
        const tbody = document.getElementById('marblesSessionsBody');
        if (tbody) {
            if (!sessions.length) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No sessions.</td></tr>';
            } else {
                tbody.innerHTML = sessions.map(s => `
                <tr>
                    <td><code style="font-size:11px;">${_marblesEsc(s.id)}</code></td>
                    <td>#${_marblesEsc(s.channel)}</td>
                    <td><span style="padding:2px 8px;border-radius:10px;font-size:10px;background:${s.state==='running'?'#22c55e20':s.state==='lobby'?'#5865f220':'#44444420'};color:${s.state==='running'?'#22c55e':s.state==='lobby'?'#818cf8':'#888'};">${s.state}</span></td>
                    <td>${s.player_count}</td>
                    <td>${_marblesFormatDate(s.created_at)}</td>
                    <td>
                        <a href="/marbles/obs/${_marblesEsc(s.id)}" target="_blank" style="font-size:11px;color:#5865f2;margin-right:8px;">OBS</a>
                        <a href="/marbles/watch/${_marblesEsc(s.id)}" target="_blank" style="font-size:11px;color:#818cf8;margin-right:8px;">Watch</a>
                        ${s.state !== 'ended' ? `<button onclick="marblesEndSession('${_marblesEsc(s.id)}')" style="padding:2px 8px;border-radius:4px;border:1px solid #ef444440;background:transparent;color:#ef4444;font-size:11px;cursor:pointer;">End</button>` : ''}
                    </td>
                </tr>`).join('');
            }
        }
    }

    // Maps table
    if (mapsRes.ok) {
        _marblesAllMaps = await mapsRes.json();
        _renderMarblesAdminMaps();
    }

    // Race history
    if (racesRes.ok) {
        const races = await racesRes.json();
        const tbody = document.getElementById('marblesRaceBody');
        if (tbody) {
            if (!races.length) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No races yet.</td></tr>';
            } else {
                tbody.innerHTML = races.map(r => `
                <tr>
                    <td><code style="font-size:11px;">${_marblesEsc(r.race_id)}</code></td>
                    <td title="${_marblesEsc(r.map_id)}">${_marblesEsc(r.map_name || 'Untitled')}</td>
                    <td>#${_marblesEsc(r.channel || '—')}</td>
                    <td>${_marblesEsc(r.winner || '—')}</td>
                    <td>${r.player_count}</td>
                    <td>${_marblesFormatDate(r.played_at)}</td>
                </tr>`).join('');
            }
        }
    }
    // Also refresh banned players list and seasons
    _loadBannedPlayers();
    _loadSeasons();
};

function _renderMarblesAdminMaps() {
    const q = (document.getElementById('marblesMapSearch')?.value || '').trim().toLowerCase();
    const maps = _marblesAllMaps.filter(m =>
        !q ||
        (m.name || '').toLowerCase().includes(q) ||
        (m.author_login || '').toLowerCase().includes(q)
    );
    const tbody = document.getElementById('marblesMapBody');
    if (!tbody) return;
    if (!maps.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No maps.</td></tr>';
        return;
    }
    tbody.innerHTML = maps.map(m => `
    <tr>
        <td>${_marblesEsc(m.name)}</td>
        <td>${_marblesEsc(m.author_login)}</td>
        <td>${m.piece_count || 0}</td>
        <td>${m.play_count || 0}</td>
        <td style="color:#22c55e;">+${m.upvotes} <span style="color:#ef4444;">-${m.downvotes}</span></td>
        <td>
            <button onclick="marblesToggleFeatured('${_marblesEsc(m.map_id)}', ${m.featured ? 'false' : 'true'})"
                style="padding:2px 8px;border-radius:4px;border:1px solid ${m.featured?'#f59e0b40':'#2a2a3a'};background:${m.featured?'#f59e0b20':'transparent'};color:${m.featured?'#f59e0b':'#666'};font-size:11px;cursor:pointer;">
                ${m.featured ? '⭐ Featured' : 'Feature'}
            </button>
        </td>
        <td>
            <a href="/apps/marble-editor?load=${encodeURIComponent(m.map_id)}" target="_blank" style="font-size:11px;color:#5865f2;margin-right:8px;">Load</a>
            <button onclick="marblesDeleteMap('${_marblesEsc(m.map_id)}', '${_marblesEsc(m.name)}')"
                style="padding:2px 8px;border-radius:4px;border:1px solid #ef444440;background:transparent;color:#ef4444;font-size:11px;cursor:pointer;">Delete</button>
        </td>
    </tr>`).join('');
}

window.filterMarblesAdminMaps = _renderMarblesAdminMaps;

window.marblesEndSession = async function(sessionId) {
    if (!confirm(`Force-end session ${sessionId}?`)) return;
    const res = await fetch(`/marbles/api/admin/sessions/${encodeURIComponent(sessionId)}/end`, { method: 'POST' });
    if (res.ok) { showToast('Session ended', 'success'); await loadMarblesAdmin(); }
    else showToast('Failed to end session', 'error');
};

window.marblesToggleFeatured = async function(mapId, featured) {
    const res = await fetch(`/marbles/api/map/${encodeURIComponent(mapId)}/feature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured }),
    });
    if (res.ok) { showToast(featured ? 'Map featured' : 'Map unfeatured', 'success'); await loadMarblesAdmin(); }
    else showToast('Failed to update featured status', 'error');
};

window.marblesDeleteMap = async function(mapId, name) {
    if (!confirm(`Delete map "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/marbles/api/admin/maps/${encodeURIComponent(mapId)}`, { method: 'DELETE' });
    if (res.ok) { showToast('Map deleted', 'success'); await loadMarblesAdmin(); }
    else showToast('Failed to delete map', 'error');
};

// ── Leaderboard admin ─────────────────────────────────────────────────────────

async function _loadBannedPlayers() {
    const res = await fetch('/marbles/api/admin/players/banned');
    if (!res.ok) return;
    const players = await res.json();
    const tbody = document.getElementById('marblesBannedBody');
    if (!tbody) return;
    if (!players.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No banned players</td></tr>';
        return;
    }
    tbody.innerHTML = players.map(p => `
        <tr>
            <td><a href="/marbles/player/${_marblesEsc(p.twitch_login)}" target="_blank" style="color:var(--accent-primary);">${_marblesEsc(p.twitch_login)}</a></td>
            <td>${p.points}</td>
            <td>${p.wins}</td>
            <td>${p.races_played}</td>
            <td>
                <button onclick="marblesAdminUnbanByName('${_marblesEsc(p.twitch_login)}')" style="padding:2px 8px;border-radius:4px;border:1px solid #22c55e40;background:transparent;color:#22c55e;font-size:11px;cursor:pointer;">Unban</button>
            </td>
        </tr>`).join('');
}

window.marblesAdminBanPlayer = async function() {
    const login = (document.getElementById('marblesAdminPlayerInput')?.value || '').trim().toLowerCase();
    if (!login) return;
    if (!confirm(`Ban "${login}" from leaderboards?`)) return;
    const res = await fetch(`/marbles/api/admin/players/${encodeURIComponent(login)}/ban`, { method: 'POST' });
    const d = await res.json();
    if (d.ok) { showToast(`${login} banned`, 'success'); _loadBannedPlayers(); }
    else showToast('Player not found or failed', 'error');
};

window.marblesAdminUnbanPlayer = async function() {
    const login = (document.getElementById('marblesAdminPlayerInput')?.value || '').trim().toLowerCase();
    if (!login) return;
    const res = await fetch(`/marbles/api/admin/players/${encodeURIComponent(login)}/unban`, { method: 'POST' });
    const d = await res.json();
    if (d.ok) { showToast(`${login} unbanned`, 'success'); _loadBannedPlayers(); }
    else showToast('Player not found or failed', 'error');
};

window.marblesAdminUnbanByName = async function(login) {
    const res = await fetch(`/marbles/api/admin/players/${encodeURIComponent(login)}/unban`, { method: 'POST' });
    const d = await res.json();
    if (d.ok) { showToast(`${login} unbanned`, 'success'); _loadBannedPlayers(); }
    else showToast('Unban failed', 'error');
};

window.marblesAdminResetPoints = async function() {
    const login = (document.getElementById('marblesAdminPlayerInput')?.value || '').trim().toLowerCase();
    if (!login) return;
    if (!confirm(`Reset all points and win streak for "${login}"? This cannot be undone.`)) return;
    const res = await fetch(`/marbles/api/admin/players/${encodeURIComponent(login)}/reset-points`, { method: 'POST' });
    const d = await res.json();
    if (d.ok) showToast(`${login} points reset`, 'success');
    else showToast('Player not found or failed', 'error');
};

window.marblesResetAllRecords = async function() {
    if (!confirm('Reset ALL track records? This cannot be undone.')) return;
    const res = await fetch('/marbles/api/admin/records/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    });
    const d = await res.json();
    if (d.ok) showToast(`Deleted ${d.deleted} track record(s)`, 'success');
    else showToast('Reset failed', 'error');
};

// ── Season management ─────────────────────────────────────────────────────────

async function _loadSeasons() {
    const [seasonsRes, currentRes] = await Promise.all([
        fetch('/marbles/api/seasons'),
        fetch('/marbles/api/seasons/current'),
    ]);
    if (!seasonsRes.ok) return;
    const seasons = await seasonsRes.json();
    const current = currentRes.ok ? await currentRes.json() : {};

    const statusEl = document.getElementById('marblesSeasonStatus');
    if (statusEl) {
        statusEl.textContent = current.season_id
            ? `Active: ${current.name}`
            : 'No active season';
        statusEl.style.color = current.season_id ? '#22c55e' : 'var(--text-muted)';
    }

    const tbody = document.getElementById('marblesSeasonsBody');
    if (!tbody) return;
    if (!seasons.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:1rem;">No seasons yet</td></tr>';
        return;
    }
    tbody.innerHTML = seasons.map(s => `
        <tr>
            <td><code style="font-size:11px;">${_marblesEsc(s.season_id)}</code></td>
            <td>${_marblesEsc(s.name)}</td>
            <td>${_marblesFormatDate(s.started_at)}</td>
            <td>${s.ended_at ? _marblesFormatDate(s.ended_at) : '—'}</td>
            <td>${s.winner ? _marblesEsc(s.winner) : '—'}</td>
            <td><span style="color:${s.active ? '#22c55e' : 'var(--text-muted)'};">${s.active ? '🟢 Active' : 'Ended'}</span></td>
        </tr>`).join('');
}

window.marblesStartSeason = async function() {
    const name = (document.getElementById('marblesSeasonNameInput')?.value || '').trim() || 'Season';
    if (!confirm(`Start new season "${name}"? Any currently active season will be deactivated.`)) return;
    const res = await fetch('/marbles/api/admin/seasons/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
    const d = await res.json();
    if (d.ok) { showToast(`Season "${d.name}" started`, 'success'); _loadSeasons(); }
    else showToast('Failed to start season', 'error');
};

window.marblesEndSeason = async function() {
    if (!confirm('End the current season? This will finalize rankings and cannot be undone.')) return;
    const res = await fetch('/marbles/api/admin/seasons/end', { method: 'POST' });
    const d = await res.json();
    if (d.ok) { showToast(`Season ended. Winner: ${d.winner || 'none'}`, 'success'); _loadSeasons(); }
    else showToast(d.error || 'Failed to end season', 'error');
};
