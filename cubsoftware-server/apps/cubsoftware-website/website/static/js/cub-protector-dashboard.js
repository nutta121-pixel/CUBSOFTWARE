// CUB PROTECTOR Dashboard
(function() {
    'use strict';

    // ==================== STATE ====================
    let currentSection = 'overview';
    let selectedGuild = null;  // full guild object
    let guilds = [];
    let setupGuilds = [];  // guilds where user is admin/owner but bot isn't installed
    let cachedChannels = null;   // cached channels for selected guild
    let cachedChannelsTTL = 0;   // expiry timestamp for channel cache
    let cachedRoles = null;      // cached roles for selected guild
    let cachedRolesTTL = 0;      // expiry timestamp for roles cache
    let channelsLoading = null;  // promise while loading
    let _sectionLoading = false; // guard to prevent autosave during load
    let rolesLoading = null;     // promise while loading
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    // ==================== SECTION GROUPS (combined tab sections) ====================
    const sectionGroups = {
        'anti-abuse': { subtabs: [
            { id: 'anti-raid', label: 'Anti-Raid' },
            { id: 'anti-nuke', label: 'Anti-Nuke' },
            { id: 'alt-detection', label: 'Alt Detection' },
            { id: 'anti-phishing', label: 'Anti-Phishing' },
            { id: 'quarantine', label: 'Quarantine' },
        ]},
        'filters': { subtabs: [
            { id: 'word-filter', label: 'Word Filter' },
            { id: 'link-filter', label: 'Link Filter' },
            { id: 'mention-protection', label: 'Mentions' },
            { id: 'anti-hoist', label: 'Anti-Hoist' },
            { id: 'keyword-alerts', label: 'Keywords' },
        ]},
        'server-control': { subtabs: [
            { id: 'slowmode', label: 'Slowmode' },
            { id: 'lockdown', label: 'Lockdown' },
            { id: 'purge', label: 'Purge' },
            { id: 'verification', label: 'Verification' },
        ]},
        'rewards': { subtabs: [
            { id: 'leveling', label: 'Leveling' },
            { id: 'economy', label: 'Economy' },
            { id: 'boost-rewards', label: 'Boost Rewards' },
        ]},
        'social': { subtabs: [
            { id: 'welcome', label: 'Welcome' },
            { id: 'giveaways', label: 'Giveaways' },
            { id: 'reaction-roles', label: 'Reactions' },
            { id: 'birthdays', label: 'Birthdays' },
        ]},
        'community-fun': { subtabs: [
            { id: 'starboard', label: 'Starboard' },
            { id: 'suggestions', label: 'Suggestions' },
            { id: 'polls', label: 'Polls' },
            { id: 'afk', label: 'AFK' },
            { id: 'reaction-board', label: 'React Board' },
        ]},
        'messaging': { subtabs: [
            { id: 'custom-commands', label: 'Commands' },
            { id: 'auto-responder', label: 'Auto Reply' },
            { id: 'announcements', label: 'Announce' },
            { id: 'scheduled-messages', label: 'Scheduled' },
        ]},
        'content-tools': { subtabs: [
            { id: 'custom-embeds', label: 'Embeds' },
            { id: 'social-feeds', label: 'Social Feeds' },
            { id: 'auto-thread', label: 'Auto Thread' },
            { id: 'server-rules', label: 'Server Rules' },
        ]},
        'role-tools': { subtabs: [
            { id: 'role-manager', label: 'Role Manager' },
            { id: 'autoroles', label: 'Auto-Roles' },
            { id: 'temp-roles', label: 'Temp Roles' },
            { id: 'color-roles', label: 'Color Roles' },
            { id: 'self-roles', label: 'Self Roles' },
        ]},
        'channel-tools': { subtabs: [
            { id: 'counters', label: 'Counters' },
            { id: 'sticky-messages', label: 'Sticky Msgs' },
            { id: 'media-channels', label: 'Media Only' },
        ]},
        'utilities': { subtabs: [
            { id: 'nicknames', label: 'Nicknames' },
            { id: 'invite-tracker', label: 'Invites' },
            { id: 'backups', label: 'Backups' },
            { id: 'reminders', label: 'Reminders' },
        ]},
    };
    const subsectionParent = {};
    for (const [gid, g] of Object.entries(sectionGroups)) {
        for (const st of g.subtabs) subsectionParent[st.id] = gid;
    }

    // ==================== DOM ELEMENTS ====================
    const elements = {
        pickerScreen: document.getElementById('serverPickerScreen'),
        pickerGrid: document.getElementById('serverPickerGrid'),
        dashboardLayout: document.getElementById('dashboardLayout'),
        sidebar: document.getElementById('adminSidebar'),
        sidebarOverlay: document.getElementById('sidebarOverlay'),
        mobileMenuBtn: document.getElementById('dashboardMobileBtn'),
        navItems: document.querySelectorAll('.nav-item'),
        sections: document.querySelectorAll('.content-section'),
    };

    // ==================== INITIALIZATION ====================
    function init() {
        setupNavigation();
        setupMobileSidebar();
        loadServers();
    }

    // ==================== SERVER PICKER ====================
    const BOT_INVITE_URL = 'https://discord.com/oauth2/authorize?client_id=1044032842352574554&permissions=1109107535350&scope=bot%20applications.commands';

    function serverIcon(g) {
        return g.icon
            ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${g.icon.startsWith('a_') ? 'gif' : 'png'}?size=128`
            : '/static/images/default-avatar.png';
    }

    function renderServerCard(g) {
        const icon = serverIcon(g);
        const customBotBadge = g.has_custom_bot
            ? `<span class="server-custom-bot-badge" title="Running a custom bot">Custom Bot</span>`
            : '';
        return `
            <div class="server-picker-card" onclick="window.cpSelectServer('${g.id}')">
                <div class="server-picker-card-top" style="--icon-url: url('${icon}')"></div>
                <div class="server-picker-body">
                    <img src="${icon}" alt="" class="server-picker-icon" onerror="this.src='/static/images/default-avatar.png'">
                    <div class="server-picker-name">${escapeHtml(g.name)}</div>
                    <div class="server-picker-meta">${escapeHtml(g.role_label)}${customBotBadge}</div>
                    <button class="server-picker-go-btn">Go</button>
                </div>
            </div>`;
    }

    function renderSetupCard(g) {
        const icon = serverIcon(g);
        const inviteUrl = `${BOT_INVITE_URL}&guild_id=${g.id}`;
        const roleLabel = g.owner ? 'Owner' : 'Admin';
        return `
            <div class="server-picker-card">
                <div class="server-picker-card-top" style="--icon-url: url('${icon}')"></div>
                <div class="server-picker-body">
                    <img src="${icon}" alt="" class="server-picker-icon" onerror="this.src='/static/images/default-avatar.png'">
                    <div class="server-picker-name">${escapeHtml(g.name)}</div>
                    <div class="server-picker-meta">${roleLabel}</div>
                    <a href="${inviteUrl}" target="_blank" class="server-picker-setup-btn" onclick="event.stopPropagation()">Setup</a>
                </div>
            </div>`;
    }

    async function loadServers() {
        try {
            const res = await fetch('/api/cub-protector/guilds');
            const data = await res.json();

            if (data.error) {
                elements.pickerGrid.innerHTML = `<div class="server-picker-empty"><p>${escapeHtml(data.error)}</p></div>`;
                return;
            }

            guilds = data.guilds || [];
            setupGuilds = data.setup_guilds || [];

            if (guilds.length === 0 && setupGuilds.length === 0) {
                elements.pickerGrid.innerHTML = `
                    <div class="server-picker-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48" style="color: var(--text-muted); margin-bottom: 1rem;"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
                        <h3>No Servers Found</h3>
                        <p>You need to own or admin a server to use CUB PROTECTOR.</p>
                        <a href="${BOT_INVITE_URL}" target="_blank" class="control-btn primary" style="margin-top: 1rem;">Add to Server</a>
                    </div>`;
                return;
            }

            // Single unified grid — "Go" cards first, then "Setup" cards
            elements.pickerGrid.innerHTML =
                guilds.map(renderServerCard).join('') +
                setupGuilds.map(renderSetupCard).join('');

        } catch (e) {
            console.error('Failed to load servers:', e);
            elements.pickerGrid.innerHTML = `<div class="server-picker-empty"><p>Failed to load servers. Please refresh the page.</p></div>`;
        }
    }

    window.cpRefreshServers = async function() {
        const btn = document.getElementById('cpRefreshBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 0.8s linear infinite"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refreshing…`;
        }
        try {
            await fetch('/api/cub-protector/guilds/force-refresh', { method: 'POST' });
        } catch (e) { /* ignore */ }
        await loadServers();
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refresh`;
        }
    };

    window.cpSelectServer = function(guildId) {
        const guild = guilds.find(g => g.id === guildId);
        if (!guild) return;

        selectedGuild = guild;

        // Clear and pre-fetch channels/roles cache for this guild
        cachedChannels = null;
        cachedChannelsTTL = 0;
        cachedRoles = null;
        cachedRolesTTL = 0;
        channelsLoading = null;
        rolesLoading = null;
        // Channels and roles are fetched lazily by the section that needs them,
        // not pre-fetched here — avoids firing 3+ Discord API calls simultaneously.

        // Update sidebar server info
        const icon = guild.icon
            ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${guild.icon.startsWith('a_') ? 'gif' : 'png'}?size=128`
            : '/static/images/default-avatar.png';
        const sidebarIcon = document.getElementById('sidebar-server-icon');
        sidebarIcon.src = icon;
        sidebarIcon.onerror = () => { sidebarIcon.src = '/static/images/default-avatar.png'; };
        document.getElementById('sidebar-server-name').textContent = guild.name;
        document.getElementById('sidebar-server-role').textContent = guild.role_label;
        document.getElementById('sidebar-server-role').className = `sidebar-server-role ${guild.role_class}`;

        // Update mobile title
        document.getElementById('mobileTitle').textContent = guild.name;

        // Switch from picker to dashboard (hide site header — sidebar replaces nav)
        const siteHeader = document.querySelector('.site-header');
        if (siteHeader) siteHeader.style.display = 'none';
        elements.pickerScreen.style.display = 'none';
        elements.dashboardLayout.style.display = '';

        // Load overview for this server
        switchSection('overview');
    };

    window.cpBackToServerPicker = function() {
        selectedGuild = null;
        elements.dashboardLayout.style.display = 'none';
        elements.pickerScreen.style.display = '';
        // Restore site header on the server picker screen
        const siteHeader = document.querySelector('.site-header');
        if (siteHeader) siteHeader.style.display = '';
        closeMobileSidebar();
        window.clearNavSearch();
    };

    // ==================== NAV SEARCH ====================
    window.filterNav = function(query) {
        const q = query.trim().toLowerCase();
        const clearBtn = document.getElementById('navSearchClear');
        const nav = document.querySelector('.sidebar-nav');
        if (clearBtn) clearBtn.classList.toggle('visible', q.length > 0);

        // Remove old empty message
        const old = nav.querySelector('.nav-search-empty');
        if (old) old.remove();

        const sections = nav.querySelectorAll('.nav-section');
        let anyVisible = false;

        sections.forEach(section => {
            const items = section.querySelectorAll('.nav-item');
            let sectionHasVisible = false;
            items.forEach(item => {
                const label = item.querySelector('span')?.textContent?.toLowerCase() || '';
                const matches = !q || label.includes(q);
                item.classList.toggle('nav-hidden', !matches);
                if (matches) sectionHasVisible = true;
            });
            section.classList.toggle('nav-section-hidden', !sectionHasVisible);
            if (sectionHasVisible) anyVisible = true;
        });

        if (q && !anyVisible) {
            const msg = document.createElement('p');
            msg.className = 'nav-search-empty';
            msg.textContent = 'No results found';
            nav.appendChild(msg);
        }
    };

    window.clearNavSearch = function() {
        const input = document.getElementById('navSearchInput');
        const clearBtn = document.getElementById('navSearchClear');
        if (input) { input.value = ''; }
        if (clearBtn) clearBtn.classList.remove('visible');
        window.filterNav('');
    };

    window.cpSwitchSection = function(section) {
        switchSection(section);
        closeMobileSidebar();
    };

    // ==================== NAVIGATION ====================
    function setupNavigation() {
        elements.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                if (section) switchSection(section);
                closeMobileSidebar();
            });
        });
    }

    function switchSection(section) {
        currentSection = section;

        // Clear all section states
        elements.sections.forEach(sec => {
            sec.classList.remove('active', 'sub-section-active');
        });

        const parentGroup = subsectionParent[section];

        if (sectionGroups[section]) {
            // Group section - show tab bar + active sub-section
            const group = sectionGroups[section];
            const activeSubId = group._activeTab || group.subtabs[0].id;

            const groupSec = document.querySelector(`.content-section[data-section="${section}"]`);
            const subSecEl = document.querySelector(`.content-section[data-section="${activeSubId}"]`);
            if (groupSec) {
                groupSec.classList.add('active');
                groupSec.querySelectorAll('.sub-tab').forEach(t => {
                    t.classList.toggle('active', t.dataset.subtab === activeSubId);
                });
            }
            if (subSecEl) {
                subSecEl.classList.add('sub-section-active');
                // Ensure tab bar is always before the sub-section content in the DOM
                if (groupSec && groupSec.parentNode === subSecEl.parentNode) {
                    subSecEl.parentNode.insertBefore(groupSec, subSecEl);
                }
            }

            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.section === section);
            });
            window.location.hash = section;
            loadSectionData(activeSubId);
        } else if (parentGroup) {
            // Sub-section of a group — check whether the hub wrapper still exists in the DOM
            const groupSec = document.querySelector(`.content-section[data-section="${parentGroup}"]`);
            if (!groupSec) {
                // Hub wrapper removed: treat this section as a regular standalone section
                document.querySelector(`.content-section[data-section="${section}"]`)?.classList.add('active');
                document.querySelectorAll('.nav-item').forEach(item => {
                    item.classList.toggle('active', item.dataset.section === section);
                });
                window.location.hash = section;
                loadSectionData(section);
            } else {
            // Hub wrapper still present — original sub-tab logic
            sectionGroups[parentGroup]._activeTab = section;

            const subSecEl = document.querySelector(`.content-section[data-section="${section}"]`);
            groupSec.classList.add('active');
            groupSec.querySelectorAll('.sub-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.subtab === section);
            });
            if (subSecEl) {
                subSecEl.classList.add('sub-section-active');
                if (groupSec.parentNode === subSecEl.parentNode) {
                    subSecEl.parentNode.insertBefore(groupSec, subSecEl);
                }
            }

            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.section === parentGroup);
            });
            window.location.hash = parentGroup;
            loadSectionData(section);
            }
        } else {
            // Regular standalone section
            document.querySelector(`.content-section[data-section="${section}"]`)?.classList.add('active');
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.section === section);
            });
            window.location.hash = section;
            loadSectionData(section);
        }
    }

    function setupMobileSidebar() {
        elements.mobileMenuBtn?.addEventListener('click', toggleMobileSidebar);
        elements.sidebarOverlay?.addEventListener('click', closeMobileSidebar);
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
    async function loadSectionData(section) {
        if (!selectedGuild) return;
        _sectionLoading = true;
        try { await _loadSectionSwitch(section); } finally { _sectionLoading = false; }
    }
    async function _loadSectionSwitch(section) {
        switch (section) {
            case 'overview': await loadOverviewData(); break;
            case 'hubs': await loadHubs(); break;
            case 'active-channels': await loadActiveChannels(); break;
            case 'voice-mods': await loadVoiceMods(); break;
            case 'moderation': await loadModLogs(); break;
            case 'automod': await loadAutoMod(); break;
            case 'logging': await loadLogging(); break;
            case 'welcome': await loadWelcome(); break;
            case 'leveling': await loadLeveling(); break;
            case 'economy': await loadEconomy(); break;
            case 'games': await loadGames(); break;
            case 'tickets': await loadTickets(); break;
            case 'giveaways': await loadGiveaways(); break;
            case 'stats': await loadStats(); break;
            case 'autoroles': await loadAutoRoles(); break;
            case 'scheduled-messages': await loadScheduledMessages(); break;
            case 'custom-embeds': await loadCustomEmbeds(); break;
            case 'social-feeds': await loadSocialFeeds(); break;
            case 'live-alerts': await loadLiveAlerts(); break;
            case 'backups': await loadBackups(); break;
            case 'reaction-roles': await loadReactionRoles(); break;
            case 'custom-commands': await loadCustomCommands(); break;
            case 'starboard': await loadStarboard(); break;
            case 'afk': await loadAFK(); break;
            case 'suggestions': await loadSuggestions(); break;
            case 'anti-raid': await loadAntiRaid(); break;
            case 'audit-log': await window.cpLoadAuditLog(); break;
            case 'role-manager': await loadRoleManager(); break;
            case 'warnings': await loadWarnings(); break;
            case 'announcements': await loadAnnouncements(); break;
            case 'counters': await loadCounters(); break;
            case 'slowmode': await loadSlowmode(); break;
            case 'lockdown': await loadLockdown(); break;
            case 'purge': await loadPurge(); break;
            case 'nicknames': await loadNicknames(); break;
            case 'invite-tracker': await loadInviteTracker(); break;
            case 'alt-detection': await loadAltDetection(); break;
            case 'anti-phishing': await loadAntiPhishing(); break;
            case 'word-filter': await loadWordFilter(); break;
            case 'mention-protection': await loadMentionProtection(); break;
            case 'verification': await loadVerification(); break;
            case 'quarantine': await loadQuarantine(); break;
            case 'anti-nuke': await loadAntiNuke(); break;
            case 'modmail': await loadModmail(); break;
            case 'reports': await loadReports(); break;
            case 'ban-appeals': await loadBanAppeals(); break;
            case 'user-notes': await loadUserNotes(); break;
            case 'birthdays': await loadBirthdays(); break;
            case 'boost-rewards': await loadBoostRewards(); break;
            case 'auto-responder': await loadAutoResponder(); break;
            case 'keyword-alerts': await loadKeywordAlerts(); break;
            case 'temp-roles': await loadTempRoles(); break;
            case 'auto-thread': await loadAutoThread(); break;
            case 'server-rules': await loadServerRules(); break;
            case 'polls': await loadPolls(); break;
            case 'reaction-board': await loadReactionBoard(); break;
            case 'reminders': await loadReminders(); break;
            case 'color-roles': await loadColorRoles(); break;
            case 'self-roles': await loadSelfRoles(); break;
            // Grouped interactive sections
            case 'profiles': await loadProfiles(); await loadMoods(); break;
            case 'rep-social': await loadReputation(); await loadRelationships(); break;
            case 'community': await loadCounting(); await loadQuotes(); await loadConfessions(); break;
            case 'tournaments': await loadTournaments(); break;
            case 'debate': await loadDebate(); break;
            // Grouped feeds section
            case 'content-feeds': await loadRedditFeed(); await loadNewsFeed(); await loadMemeOfDay(); await loadQuoteOfDay(); break;
            case 'sticky-messages': await loadStickyMessages(); break;
            case 'anti-hoist': await loadAntiHoist(); break;
            case 'link-filter': await loadLinkFilter(); break;
            case 'translate': await loadTranslate(); break;
            case 'media-channels': await loadMediaChannels(); break;
            case 'bot-masters': await loadBotMasters(); break;
            case 'custom-bot': await loadCustomBot(); break;
        }
    }

    async function loadOverviewData() {
        try {
            const res = await fetch(`/api/cub-protector/overview`);
            const data = await res.json();

            if (data.error) {
                showToast(data.error, 'error');
                return;
            }

            document.getElementById('stat-hubs').textContent = (data.total_hubs || 0).toLocaleString();
            document.getElementById('stat-active-channels').textContent = (data.total_active_channels || 0).toLocaleString();
            document.getElementById('stat-members').textContent = (data.total_members || 0).toLocaleString();
            document.getElementById('stat-uptime').textContent = data.bot_status || 'Unknown';

            renderQuickAccess();
        } catch (e) {
            console.error('Failed to load overview:', e);
        }
    }

    // ==================== QUICK ACCESS SYSTEM ====================
    const allModules = [
        { id: 'hubs', name: 'Voice Hubs', desc: 'Manage temp voice channels', icon: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>', bg: 'rgba(87,242,135,0.15)', color: '#57f287' },
        { id: 'moderation', name: 'Mod Logs', desc: 'View moderation actions', icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', bg: 'rgba(237,66,69,0.15)', color: '#ed4245' },
        { id: 'automod', name: 'Auto-Mod', desc: 'Configure auto-moderation', icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>', bg: 'rgba(235,69,158,0.15)', color: '#eb459e' },
        { id: 'logging', name: 'Logging', desc: 'Set up event logging', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>', bg: 'rgba(88,101,242,0.15)', color: '#5865f2' },
        { id: 'welcome', name: 'Welcome', desc: 'Join & leave messages', icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', bg: 'rgba(254,231,92,0.15)', color: '#fee75c' },
        { id: 'leveling', name: 'Leveling', desc: 'XP & level rewards', icon: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
        { id: 'economy', name: 'Economy', desc: 'Server currency system', icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', bg: 'rgba(87,242,135,0.15)', color: '#57f287' },
        { id: 'tickets', name: 'Tickets', desc: 'Support ticket system', icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', bg: 'rgba(88,101,242,0.15)', color: '#5865f2' },
        { id: 'giveaways', name: 'Giveaways', desc: 'Run server giveaways', icon: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>', bg: 'rgba(87,242,135,0.15)', color: '#57f287' },
        { id: 'stats', name: 'Stats', desc: 'Server analytics', icon: '<path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>', bg: 'rgba(88,101,242,0.15)', color: '#5865f2' },
        { id: 'autoroles', name: 'Auto-Roles', desc: 'Auto assign roles', icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
        { id: 'reaction-roles', name: 'Reaction Roles', desc: 'Self-assign roles', icon: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/>', bg: 'rgba(235,69,158,0.15)', color: '#eb459e' },
        { id: 'starboard', name: 'Starboard', desc: 'Highlight best posts', icon: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', bg: 'rgba(254,231,92,0.15)', color: '#fee75c' },
        { id: 'anti-raid', name: 'Anti-Raid', desc: 'Raid protection', icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/>', bg: 'rgba(237,66,69,0.15)', color: '#ed4245' },
        { id: 'announcements', name: 'Announce', desc: 'Server announcements', icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>', bg: 'rgba(88,101,242,0.15)', color: '#5865f2' },
        { id: 'counters', name: 'Counters', desc: 'Live stat channels', icon: '<path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>', bg: 'rgba(87,242,135,0.15)', color: '#57f287' },
        { id: 'custom-commands', name: 'Custom Cmds', desc: 'Custom commands', icon: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>', bg: 'rgba(88,101,242,0.15)', color: '#5865f2' },
        { id: 'suggestions', name: 'Suggestions', desc: 'Member suggestions', icon: '<line x1="9" y1="18" x2="15" y2="18"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5"/>', bg: 'rgba(254,231,92,0.15)', color: '#fee75c' },
        { id: 'scheduled-messages', name: 'Scheduled', desc: 'Schedule messages', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
        { id: 'custom-embeds', name: 'Embeds', desc: 'Custom embed builder', icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/>', bg: 'rgba(88,101,242,0.15)', color: '#5865f2' },
        { id: 'social-feeds', name: 'Social Feeds', desc: 'Content notifications', icon: '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>', bg: 'rgba(235,69,158,0.15)', color: '#eb459e' },
        { id: 'backups', name: 'Backups', desc: 'Server backups', icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', bg: 'rgba(87,242,135,0.15)', color: '#57f287' },
        { id: 'warnings', name: 'Warnings', desc: 'Member warnings', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>', bg: 'rgba(237,66,69,0.15)', color: '#ed4245' },
        { id: 'verification', name: 'Verification', desc: 'Member verification', icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', bg: 'rgba(87,242,135,0.15)', color: '#57f287' },
        { id: 'modmail', name: 'Modmail', desc: 'Private support DMs', icon: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>', bg: 'rgba(88,101,242,0.15)', color: '#5865f2' },
        { id: 'anti-nuke', name: 'Anti-Nuke', desc: 'Prevent server destruction', icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', bg: 'rgba(237,66,69,0.15)', color: '#ed4245' },
        { id: 'afk', name: 'AFK', desc: 'AFK status system', icon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
        { id: 'invite-tracker', name: 'Invites', desc: 'Track invitations', icon: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>', bg: 'rgba(88,101,242,0.15)', color: '#5865f2' },
        { id: 'slowmode', name: 'Slowmode', desc: 'Channel slowmode', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
        { id: 'lockdown', name: 'Lockdown', desc: 'Emergency lockdown', icon: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', bg: 'rgba(237,66,69,0.15)', color: '#ed4245' },
    ];

    function getQuickAccessModules() {
        const storageKey = `cp_quick_access_${selectedGuild?.id}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try { return JSON.parse(saved); } catch(e) {}
        }
        // Daily rotation at midnight NZ time (UTC+13)
        const now = new Date();
        const nzOffset = 13 * 60;
        const nzTime = new Date(now.getTime() + (nzOffset + now.getTimezoneOffset()) * 60000);
        const daysSinceEpoch = Math.floor(nzTime.getTime() / 86400000);
        // Seed-based shuffle for the day
        let seed = daysSinceEpoch;
        const shuffled = [...allModules];
        for (let i = shuffled.length - 1; i > 0; i--) {
            seed = (seed * 16807 + 0) % 2147483647;
            const j = seed % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, 12).map(m => m.id);
    }

    function renderQuickAccess() {
        const grid = document.getElementById('quick-access-grid');
        if (!grid) return;
        const moduleIds = getQuickAccessModules();
        grid.innerHTML = moduleIds.map(id => {
            const m = allModules.find(mod => mod.id === id);
            if (!m) return '';
            return `<div class="module-card" onclick="window.cpSwitchSection('${m.id}')">
                <div class="module-icon" style="background:${m.bg};color:${m.color};">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">${m.icon}</svg>
                </div>
                <h4>${escapeHtml(m.name)}</h4>
                <p>${escapeHtml(m.desc)}</p>
            </div>`;
        }).join('');
    }

    window.cpEditQuickAccess = function() {
        const storageKey = `cp_quick_access_${selectedGuild?.id}`;
        const current = getQuickAccessModules();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'quickAccessModal';
        modal.style.display = 'flex';
        modal.innerHTML = `<div class="modal" style="max-width:600px;">
            <div class="modal-header"><h3>Customize Quick Access</h3><button class="modal-close" onclick="document.getElementById('quickAccessModal').remove()">&times;</button></div>
            <div class="modal-body" style="max-height:60vh;overflow-y:auto;">
                <p style="color:var(--text-muted);margin-bottom:1rem;font-size:0.85rem;">Select up to 12 modules for your quick access panel. Leave unchecked to use daily rotation.</p>
                ${allModules.map(m => `<label style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;cursor:pointer;">
                    <input type="checkbox" value="${m.id}" ${current.includes(m.id) ? 'checked' : ''} class="qa-check">
                    <span style="color:${m.color};font-size:0.85rem;">${escapeHtml(m.name)}</span>
                    <span style="color:var(--text-muted);font-size:0.75rem;margin-left:auto;">${escapeHtml(m.desc)}</span>
                </label>`).join('')}
            </div>
            <div class="modal-footer">
                <button class="control-btn secondary" onclick="localStorage.removeItem('${storageKey}');document.getElementById('quickAccessModal').remove();renderQuickAccess();showToast('Reset to daily rotation','success');">Reset to Daily</button>
                <button class="control-btn primary" onclick="window.cpSaveQuickAccess()">Save</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    };

    window.cpSaveQuickAccess = function() {
        const checks = document.querySelectorAll('#quickAccessModal .qa-check:checked');
        const selected = Array.from(checks).map(c => c.value);
        if (selected.length === 0 || selected.length > 12) {
            showToast('Select 1-12 modules', 'error');
            return;
        }
        const storageKey = `cp_quick_access_${selectedGuild?.id}`;
        localStorage.setItem(storageKey, JSON.stringify(selected));
        document.getElementById('quickAccessModal').remove();
        renderQuickAccess();
        showToast('Quick access updated!', 'success');
    };

    async function loadHubs() {
        if (!selectedGuild) return;

        const listEl = document.getElementById('hubs-list');
        listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Loading hubs...</p>';

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/hubs`);
            const data = await res.json();

            if (!data.hubs || data.hubs.length === 0) {
                currentHubs = [];
                listEl.innerHTML = '<div class="empty-state"><h3>No Hubs</h3><p>No voice channel hubs configured. Click "Create Hub" to add one.</p></div>';
                return;
            }

            currentHubs = data.hubs;

            listEl.innerHTML = data.hubs.map(hub => `
                <div class="hub-card">
                    <div class="hub-card-header">
                        <h4>
                            <svg viewBox="0 0 24 24" fill="none" stroke="#5865f2" stroke-width="2" width="20" height="20"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                            ${escapeHtml(hub.hub_name || 'Hub')}
                        </h4>
                        <div class="hub-card-actions">
                            <button onclick="window.cpEditHub('${hub.hub_id}');">Edit</button>
                            <button onclick="window.cpDeleteHub('${hub.hub_id}');" class="delete">Delete</button>
                        </div>
                    </div>
                    <div class="hub-settings-grid">
                        <div class="hub-setting">
                            <div class="hub-setting-label">Name Template</div>
                            <div class="hub-setting-value">${escapeHtml(hub.name_template || '{username}')}</div>
                        </div>
                        <div class="hub-setting">
                            <div class="hub-setting-label">User Limit</div>
                            <div class="hub-setting-value">${hub.user_limit === 0 ? 'Unlimited' : hub.user_limit}</div>
                        </div>
                        <div class="hub-setting">
                            <div class="hub-setting-label">Bitrate</div>
                            <div class="hub-setting-value">${hub.bitrate || 64} kbps</div>
                        </div>
                        <div class="hub-setting">
                            <div class="hub-setting-label">Keep Alive</div>
                            <div class="hub-setting-value">${hub.keep_alive === -1 ? 'Never' : hub.keep_alive === 0 ? 'Immediate' : hub.keep_alive + ' min'}</div>
                        </div>
                        <div class="hub-setting">
                            <div class="hub-setting-label">Ownership Lock</div>
                            <div class="hub-setting-value">${hub.ownership_lock === -1 ? 'Never' : hub.ownership_lock === 0 ? 'Immediate' : hub.ownership_lock + ' min'}</div>
                        </div>
                        <div class="hub-setting">
                            <div class="hub-setting-label">Active Channels</div>
                            <div class="hub-setting-value">${hub.active_count || 0}</div>
                        </div>
                    </div>
                </div>
            `).join('');

        } catch (e) {
            listEl.innerHTML = '<div class="empty-state"><p>Failed to load hubs.</p></div>';
        }
    }

    async function loadActiveChannels() {
        if (!selectedGuild) return;

        const listEl = document.getElementById('active-channels-list');
        listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Loading channels...</p>';

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/active-channels`);
            const data = await res.json();

            if (!data.channels || data.channels.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><h3>No Active Channels</h3><p>No temporary voice channels are currently active.</p></div>';
                return;
            }

            listEl.innerHTML = data.channels.map(ch => {
                const permittedHtml = ch.permitted_users && ch.permitted_users.length > 0
                    ? `<div class="channel-permitted">
                        <div class="permitted-label">Permitted Users:</div>
                        <div class="permitted-list">
                            ${ch.permitted_users.map(u => `
                                <span class="permitted-user">
                                    ${escapeHtml(u.name)}
                                    <button class="unpermit-btn" onclick="unpermitUser('${ch.id}', '${u.id}')" title="Remove permit">✕</button>
                                </span>
                            `).join('')}
                        </div>
                    </div>`
                    : '';
                return `
                <div class="channel-item" id="channel-item-${ch.id}">
                    <div class="channel-info">
                        <div>
                            <div class="channel-name">${escapeHtml(ch.name || 'Unknown')}</div>
                            <div class="channel-owner">Owner: ${escapeHtml(ch.owner_name || ch.owner_id)}</div>
                        </div>
                    </div>
                    <div class="channel-badges">
                        ${ch.hidden ? '<span class="channel-badge hidden">Hidden</span>' : ''}
                        ${ch.locked ? '<span class="channel-badge locked">Locked</span>' : ''}
                    </div>
                    ${permittedHtml}
                </div>`;
            }).join('');

        } catch (e) {
            listEl.innerHTML = '<div class="empty-state"><p>Failed to load active channels.</p></div>';
        }
    }

    window.unpermitUser = async function(channelId, userId) {
        if (!selectedGuild) return;
        if (!confirm('Remove this user\'s permission to access the channel?')) return;

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/active-channels/${channelId}/permit/${userId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                showToast('User un-permitted from channel', 'success');
                await loadActiveChannels();
            } else {
                showToast(data.error || 'Failed to un-permit user', 'error');
            }
        } catch (e) {
            showToast('Failed to un-permit user', 'error');
        }
    };

    // ==================== HUB MANAGEMENT ====================
    window.showCreateHubModal = function() {
        if (!selectedGuild) {
            showToast('No server selected', 'error');
            return;
        }
        loadCategories();
        document.getElementById('createHubModal').style.display = '';
    };

    window.closeCreateHubModal = function() {
        document.getElementById('createHubModal').style.display = 'none';
    };

    async function loadCategories() {
        const select = document.getElementById('hub-category');
        select.innerHTML = '<option value="">Loading categories...</option>';

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/categories`);
            const data = await res.json();

            select.innerHTML = '<option value="">-- Select a category --</option>';
            if (data.categories) {
                data.categories.forEach(cat => {
                    const opt = document.createElement('option');
                    opt.value = cat.id;
                    opt.textContent = cat.name;
                    select.appendChild(opt);
                });
            }
        } catch (e) {
            select.innerHTML = '<option value="">Failed to load categories</option>';
        }
    }

    window.createHub = async function() {
        if (!selectedGuild) return;

        const categoryId = document.getElementById('hub-category').value;
        if (!categoryId) {
            showToast('Select a category', 'error');
            return;
        }

        const payload = {
            guild_id: selectedGuild.id,
            category_id: categoryId,
            hub_name: document.getElementById('hub-name').value || 'Join to Create',
            name_template: document.getElementById('hub-template').value || '{username}',
            user_limit: parseInt(document.getElementById('hub-user-limit').value) || 0,
            bitrate: parseInt(document.getElementById('hub-bitrate').value) || 64,
            keep_alive: parseInt(document.getElementById('hub-keep-alive').value),
            ownership_lock: parseInt(document.getElementById('hub-ownership-lock').value),
        };

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/hubs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success) {
                showToast('Hub created!', 'success');
                closeCreateHubModal();
                loadHubs();
                loadOverviewData();
            } else {
                showToast(data.error || 'Failed to create hub', 'error');
            }
        } catch (e) {
            showToast('Failed to create hub', 'error');
        }
    };

    window.cpDeleteHub = async function(hubId) {
        if (!confirm('Delete this hub and all its active temp channels?')) return;

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/hubs/${hubId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                showToast('Hub deleted', 'success');
                loadHubs();
                loadOverviewData();
            } else {
                showToast(data.error || 'Failed to delete hub', 'error');
            }
        } catch (e) {
            showToast('Failed to delete hub', 'error');
        }
    };

    // ==================== HUB EDITING ====================
    let currentHubs = [];

    window.cpEditHub = function(hubId) {
        const hub = currentHubs.find(h => h.hub_id === hubId);
        if (!hub) return;

        document.getElementById('edit-hub-id').value = hubId;
        document.getElementById('edit-hub-name').value = hub.hub_name || '';
        document.getElementById('edit-hub-template').value = hub.name_template || '{username}';
        document.getElementById('edit-hub-user-limit').value = String(hub.user_limit || 0);
        document.getElementById('edit-hub-bitrate').value = String(hub.bitrate || 64);
        document.getElementById('edit-hub-keep-alive').value = String(hub.keep_alive !== undefined ? hub.keep_alive : 0);
        document.getElementById('edit-hub-ownership-lock').value = String(hub.ownership_lock !== undefined ? hub.ownership_lock : 0);

        document.getElementById('editHubModal').style.display = '';
    };

    window.closeEditHubModal = function() {
        document.getElementById('editHubModal').style.display = 'none';
    };

    window.saveHubEdit = async function() {
        if (!selectedGuild) return;

        const hubId = document.getElementById('edit-hub-id').value;
        if (!hubId) return;

        const payload = {
            hub_name: document.getElementById('edit-hub-name').value,
            name_template: document.getElementById('edit-hub-template').value || '{username}',
            user_limit: parseInt(document.getElementById('edit-hub-user-limit').value) || 0,
            bitrate: parseInt(document.getElementById('edit-hub-bitrate').value) || 64,
            keep_alive: parseInt(document.getElementById('edit-hub-keep-alive').value),
            ownership_lock: parseInt(document.getElementById('edit-hub-ownership-lock').value),
        };

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/hubs/${hubId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success) {
                showToast('Hub updated!', 'success');
                closeEditHubModal();
                loadHubs();
            } else {
                showToast(data.error || 'Failed to update hub', 'error');
            }
        } catch (e) {
            showToast('Failed to update hub', 'error');
        }
    };

    window.refreshActiveChannels = function() {
        loadActiveChannels();
    };

    // ==================== VOICE MODERATORS ====================
    async function loadVoiceMods() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/voice-mods`);
            const data = await res.json();
            const mods = data.voice_moderators || { roles: [], users: [] };

            // Render roles list
            const rolesList = document.getElementById('voicemods-roles-list');
            if (mods.roles.length === 0) {
                rolesList.innerHTML = '<div style="color:var(--text-muted);padding:0.5rem;">No moderator roles configured</div>';
            } else {
                rolesList.innerHTML = mods.roles.map(r =>
                    `<div class="list-item"><span>@${escapeHtml(r.name || r.id)}</span>
                    <button class="btn btn-sm btn-danger" onclick="window.cpRemoveVoiceModRole('${r.id}')">Remove</button></div>`
                ).join('');
            }

            // Render users list
            const usersList = document.getElementById('voicemods-users-list');
            if (mods.users.length === 0) {
                usersList.innerHTML = '<div style="color:var(--text-muted);padding:0.5rem;">No individual moderators configured</div>';
            } else {
                usersList.innerHTML = mods.users.map(u =>
                    `<div class="list-item"><span>${escapeHtml(u.username || u.id)} (${u.id})</span>
                    <button class="btn btn-sm btn-danger" onclick="window.cpRemoveVoiceModUser('${u.id}')">Remove</button></div>`
                ).join('');
            }

            // Populate role selector
            populateRoleSelectGeneric('voicemods-add-role', '');

        } catch (e) { showToast('Failed to load voice moderators', 'error'); }
    }

    window.cpAddVoiceModRole = async function() {
        const roleId = document.getElementById('voicemods-add-role').value;
        if (!roleId) return showToast('Select a role first', 'error');
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/voice-mods/roles`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ role_id: roleId })
            });
            const data = await res.json();
            if (data.success) { showToast('Moderator role added!', 'success'); loadVoiceMods(); }
            else showToast(data.error || 'Failed to add role', 'error');
        } catch (e) { showToast('Failed to add role', 'error'); }
    };

    window.cpRemoveVoiceModRole = async function(roleId) {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/voice-mods/roles`, {
                method: 'DELETE', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ role_id: roleId })
            });
            const data = await res.json();
            if (data.success) { showToast('Moderator role removed', 'success'); loadVoiceMods(); }
            else showToast(data.error || 'Failed to remove role', 'error');
        } catch (e) { showToast('Failed to remove role', 'error'); }
    };

    window.cpAddVoiceModUser = async function() {
        const userId = document.getElementById('voicemods-add-user').value.trim();
        if (!userId) return showToast('Enter a user ID first', 'error');
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/voice-mods/users`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ user_id: userId })
            });
            const data = await res.json();
            if (data.success) { showToast('Moderator added!', 'success'); document.getElementById('voicemods-add-user').value = ''; loadVoiceMods(); }
            else showToast(data.error || 'Failed to add user', 'error');
        } catch (e) { showToast('Failed to add user', 'error'); }
    };

    window.cpRemoveVoiceModUser = async function(userId) {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/voice-mods/users`, {
                method: 'DELETE', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ user_id: userId })
            });
            const data = await res.json();
            if (data.success) { showToast('Moderator removed', 'success'); loadVoiceMods(); }
            else showToast(data.error || 'Failed to remove user', 'error');
        } catch (e) { showToast('Failed to remove user', 'error'); }
    };

    // ==================== BOT MASTERS ====================
    async function loadBotMasters() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/bot-masters`);
            const data = await res.json();
            const masters = data.bot_masters || [];

            const list = document.getElementById('botmasters-list');
            if (masters.length === 0) {
                list.innerHTML = '<div style="color:var(--text-muted);padding:0.5rem;">No bot masters configured</div>';
            } else {
                list.innerHTML = masters.map(u =>
                    `<div class="list-item"><span>${escapeHtml(u.username || u.id)} (${u.id})</span>
                    <button class="btn btn-sm btn-danger" onclick="window.cpRemoveBotMaster('${u.id}')">Remove</button></div>`
                ).join('');
            }

            // Check if user is owner or admin - if not, hide add/remove controls
            const guild = selectedGuild;
            const isOwner = guild.owner;
            const perms = parseInt(guild.permissions || '0');
            const isAdmin = (perms & 0x8) === 0x8;
            if (!isOwner && !isAdmin) {
                document.getElementById('botmasters-no-permission').style.display = 'block';
                document.querySelectorAll('#botMastersSection .control-btn, #botMastersSection .btn-danger').forEach(b => b.style.display = 'none');
            } else {
                document.getElementById('botmasters-no-permission').style.display = 'none';
            }
        } catch (e) { showToast('Failed to load bot masters', 'error'); }
    }

    window.cpAddBotMaster = async function() {
        const userId = document.getElementById('botmasters-add-user').value.trim();
        if (!userId) return showToast('Enter a user ID first', 'error');
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/bot-masters`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ user_id: userId })
            });
            const data = await res.json();
            if (data.success) { showToast('Bot master added!', 'success'); document.getElementById('botmasters-add-user').value = ''; loadBotMasters(); }
            else showToast(data.error || 'Failed to add bot master', 'error');
        } catch (e) { showToast('Failed to add bot master', 'error'); }
    };

    window.cpRemoveBotMaster = async function(userId) {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/bot-masters`, {
                method: 'DELETE', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ user_id: userId })
            });
            const data = await res.json();
            if (data.success) { showToast('Bot master removed', 'success'); loadBotMasters(); }
            else showToast(data.error || 'Failed to remove bot master', 'error');
        } catch (e) { showToast('Failed to remove bot master', 'error'); }
    };

    // ==================== MODERATION LOGS ====================
    async function loadModLogs() {
        const el = document.getElementById('mod-logs-list');
        const activeEl = document.getElementById('mod-active-punishments');
        const warningsEl = document.getElementById('mod-warnings-list');
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/moderation`);
            const data = await res.json();
            const cases = data.cases || [];
            const warnings = data.warnings || [];
            const userCache = data.users || {};

            // Active punishments (temp bans not yet expired, active mutes)
            const now = Date.now() / 1000;
            const activeBans = cases.filter(c => c.type === 'ban' && c.expires_at && c.expires_at > now && !c.unbanned);
            const activeMutes = cases.filter(c => c.type === 'mute' && c.expires_at && c.expires_at > now && !c.unmuted);
            const allActive = [
                ...activeBans.map(c => ({ ...c, punishType: 'TEMP BAN', color: '#ed4245', bgColor: 'rgba(237,66,69,0.1)', borderColor: 'rgba(237,66,69,0.3)' })),
                ...activeMutes.map(c => ({ ...c, punishType: 'MUTE', color: '#fee75c', bgColor: 'rgba(254,231,92,0.1)', borderColor: 'rgba(254,231,92,0.3)' }))
            ];
            if (allActive.length === 0) {
                activeEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No active timed punishments</p>';
            } else {
                activeEl.innerHTML = allActive.map(c => {
                    const expiresIn = Math.round((c.expires_at - now) / 60);
                    const timeLeft = expiresIn > 60 ? `${Math.round(expiresIn / 60)}h ${expiresIn % 60}m` : `${expiresIn}m`;
                    const unmuteBtn = c.type === 'mute' ? `<button onclick="window.cpExecuteModAction('unmute','${c.target_id}','Unmuted from dashboard')" style="background:#57F287;color:#000;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.8rem;font-weight:600;margin-left:8px;">Unmute</button>` : '';
                    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem;background:${c.bgColor};border:1px solid ${c.borderColor};border-radius:8px;margin-bottom:0.5rem;">
                        <div><span style="color:${c.color};font-weight:600;">${c.punishType}</span> User: ${c.target_id} | Reason: ${escapeHtml(c.reason || 'No reason')}</div>
                        <div style="display:flex;align-items:center;"><span style="color:#fee75c;font-weight:600;">Expires in ${timeLeft}</span>${unmuteBtn}</div>
                    </div>`;
                }).join('');
            }

            // Warnings
            if (warnings.length === 0) {
                warningsEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No warnings recorded</p>';
            } else {
                warningsEl.innerHTML = warnings.slice(-15).reverse().map(w => `
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem;background:rgba(255,255,255,0.03);border-radius:6px;margin-bottom:0.4rem;">
                        <div><span style="color:#fee75c;">Warning</span> User: ${w.user_id} | By: ${w.moderator_id} | ${escapeHtml(w.reason || 'No reason')}</div>
                        <div style="color:var(--text-muted);font-size:0.8rem;">${new Date(w.timestamp * 1000).toLocaleDateString()}</div>
                    </div>`).join('');
            }

            // Moderator stats
            const modStatsEl = document.getElementById('mod-stats');
            const modCounts = {};
            cases.forEach(c => {
                const mod = c.moderator_id === 'dashboard' ? 'Dashboard' : c.moderator_id;
                modCounts[mod] = (modCounts[mod] || 0) + 1;
            });
            const sortedMods = Object.entries(modCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
            if (sortedMods.length === 0) {
                modStatsEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No moderator activity</p>';
            } else {
                const maxActions = sortedMods[0][1];
                modStatsEl.innerHTML = sortedMods.map(([mod, count]) => {
                    const pct = (count / maxActions) * 100;
                    return `<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem;">
                        <div style="min-width:120px;font-size:0.85rem;color:var(--text-secondary);">${mod}</div>
                        <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:4px;height:18px;">
                            <div style="width:${pct}%;background:#5865F2;border-radius:4px;height:100%;"></div>
                        </div>
                        <div style="min-width:40px;text-align:right;font-size:0.85rem;font-weight:600;">${count}</div>
                    </div>`;
                }).join('');
            }

            // Store cases for filtering
            allModCases = cases;
            modUserCache = userCache;
            renderModCases(cases);
        } catch (e) {
            el.innerHTML = '<div class="empty-state"><p>Failed to load mod logs.</p></div>';
        }
    }

    // Mod log filtering
    let allModCases = [];
    let modUserCache = {};
    window.cpFilterModLogs = function() {
        const userId = document.getElementById('mod-search-user')?.value?.trim() || '';
        const type = document.getElementById('mod-search-type')?.value || '';
        let filtered = allModCases;
        if (userId) filtered = filtered.filter(c => c.target_id === userId || c.moderator_id === userId);
        if (type) filtered = filtered.filter(c => c.type === type);
        renderModCases(filtered);
    };

    function renderModCases(cases) {
        const el = document.getElementById('mod-logs-list');
        if (cases.length === 0) {
            el.innerHTML = '<div class="empty-state"><p>No matching mod cases.</p></div>';
            return;
        }
        const typeColors = { ban: '#ed4245', unban: '#57f287', kick: '#fee75c', mute: '#eb459e', unmute: '#57f287', warn: '#fee75c', softban: '#e67e22', purge: '#5865f2', lock: '#ed4245', unlock: '#57f287' };
        const typeLabels = { ban: 'Ban', unban: 'Unban', kick: 'Kick', mute: 'Timeout', unmute: 'Remove Timeout', warn: 'Warning', softban: 'Soft Ban', purge: 'Purge', lock: 'Lock Channel', unlock: 'Unlock Channel' };
        const now = Date.now() / 1000;
        const defaultAvatar = idx => `https://cdn.discordapp.com/embed/avatars/${idx % 6}.png`;

        el.innerHTML = cases.slice(-50).reverse().map(c => {
            const targetUser = modUserCache[c.target_id];
            const modUser = c.moderator_id !== 'dashboard' ? modUserCache[c.moderator_id] : null;
            const targetName = targetUser?.username || c.target_id;
            const targetAvatar = targetUser?.avatar || defaultAvatar(parseInt(c.target_id.slice(-2), 16) || 0);
            const modName = modUser?.username || (c.moderator_id === 'dashboard' ? 'Dashboard' : c.moderator_id);

            let extra = '';
            if (c.duration) {
                const mins = Math.round(c.duration / 60000);
                extra = ` · ${mins > 60 ? Math.round(mins / 60) + 'h' : mins + 'm'}`;
            }
            let actionBtn = '';
            if (c.type === 'mute' && c.expires_at && c.expires_at > now && !c.unmuted) {
                actionBtn = `<button class="mod-log-action-btn" onclick="window.cpExecuteModAction('unmute','${c.target_id}','Untimeout from mod logs')">Untimeout</button>`;
            }
            if (c.type === 'ban' && !c.unbanned) {
                actionBtn = `<button class="mod-log-action-btn mod-log-action-unban" onclick="window.cpExecuteModAction('unban','${c.target_id}','Unbanned from mod logs')">Unban</button>`;
            }

            const dateStr = new Date(c.timestamp * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
                + ' · ' + new Date(c.timestamp * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            return `<div class="mod-log-card">
                <img class="mod-log-avatar" src="${targetAvatar}" alt="" onerror="this.src='${defaultAvatar(0)}'">
                <div class="mod-log-body">
                    <div class="mod-log-username">${escapeHtml(targetName)}</div>
                    <div class="mod-log-action" style="color:${typeColors[c.type] || '#5865f2'}">
                        Case #${c.case_id} — ${typeLabels[c.type] || c.type.toUpperCase()}${extra}
                    </div>
                    <div class="mod-log-reason">${escapeHtml(c.reason || 'No reason')} · by ${escapeHtml(modName)}</div>
                    <div class="mod-log-date">${dateStr}</div>
                </div>
                ${actionBtn}
            </div>`;
        }).join('');
    }

    // Mod action modal
    window.cpShowModAction = function(action) {
        const labels = { ban: 'Ban User', kick: 'Kick User', mute: 'Timeout User', unban: 'Unban User' };
        const colors = { ban: '#ed4245', kick: '#fee75c', mute: '#eb459e', unban: '#57f287' };
        const extraFields = action === 'ban' ? `<div class="form-group"><label>Delete Messages (days)</label><select id="mod-action-delete-days" class="form-select"><option value="0">None</option><option value="1">1 day</option><option value="7">7 days</option></select></div>` :
            action === 'mute' ? `<div class="form-group"><label>Duration</label><select id="mod-action-duration" class="form-select"><option value="300">5 minutes</option><option value="600">10 minutes</option><option value="3600" selected>1 hour</option><option value="86400">1 day</option><option value="604800">7 days</option><option value="2419200">28 days</option></select></div>` : '';

        const html = `<div class="modal-overlay" id="modActionModal" style="display:flex;">
            <div class="modal" style="max-width:400px;">
                <div class="modal-header"><h3 style="color:${colors[action]}">${labels[action]}</h3><button class="modal-close" onclick="document.getElementById('modActionModal').remove()">&times;</button></div>
                <div class="modal-body">
                    <div class="form-group"><label>User ID</label><input type="text" id="mod-action-user" placeholder="Enter Discord user ID"></div>
                    <div class="form-group"><label>Reason</label><input type="text" id="mod-action-reason" placeholder="Reason for action" value="Dashboard action"></div>
                    ${extraFields}
                </div>
                <div class="modal-footer"><button class="control-btn primary" style="background:${colors[action]}" onclick="cpExecuteModAction('${action}')">Confirm ${labels[action]}</button></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    };

    window.cpExecuteModAction = async function(action, directUserId, directReason) {
        const userId = directUserId || document.getElementById('mod-action-user')?.value?.trim();
        if (!userId) { showToast('Enter a user ID', 'error'); return; }
        const payload = {
            action,
            user_id: userId,
            reason: directReason || document.getElementById('mod-action-reason')?.value || 'Dashboard action'
        };
        if (action === 'ban') payload.delete_days = parseInt(document.getElementById('mod-action-delete-days')?.value || '0');
        if (action === 'mute') payload.duration = parseInt(document.getElementById('mod-action-duration')?.value || '3600');

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/mod-action`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast(`${action} successful`, 'success');
                document.getElementById('modActionModal')?.remove();
                loadModLogs();
            } else {
                showToast(data.error || `Failed to ${action}`, 'error');
            }
        } catch (e) { showToast(`Failed to ${action}`, 'error'); }
    };

    // ==================== AUTO-MOD CONFIG ====================
    let currentAutoModConfig = {};

    async function loadAutoMod() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/automod`);
            const data = await res.json();
            const am = data.config || {};
            currentAutoModConfig = am;

            document.getElementById('am-enabled').checked = am.enabled || false;
            document.getElementById('am-badwords').checked = am.bad_words?.enabled || false;
            document.getElementById('am-spam').checked = am.spam?.enabled || false;
            document.getElementById('am-invites').checked = am.invites?.enabled || false;
            document.getElementById('am-links').checked = am.links?.enabled || false;
            document.getElementById('am-caps').checked = am.caps?.enabled || false;
            document.getElementById('am-mentions').checked = am.mass_mentions?.enabled || false;
            document.getElementById('am-duplicates').checked = am.duplicates?.enabled || false;
            document.getElementById('am-emojis').checked = am.emojis?.enabled || false;
            document.getElementById('am-newlines').checked = am.newlines?.enabled || false;

            // Populate filter settings
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = String(val || ''); };
            setVal('am-bad_words-action', am.bad_words?.action || 'delete');
            setVal('am-spam-max', am.spam?.max_messages || 5);
            setVal('am-spam-interval', am.spam?.interval || 5);
            setVal('am-spam-action', am.spam?.action || 'mute');
            setVal('am-invites-action', am.invites?.action || 'delete');
            setVal('am-links-action', am.links?.action || 'delete');
            setVal('am-caps-min', am.caps?.min_length || 8);
            setVal('am-caps-max', am.caps?.max_percentage || 70);
            setVal('am-caps-action', am.caps?.action || 'delete');
            setVal('am-mentions-max', am.mass_mentions?.max_mentions || 5);
            setVal('am-mentions-action', am.mass_mentions?.action || 'mute');
            setVal('am-duplicates-action', am.duplicates?.action || 'delete');
            setVal('am-emojis-max', am.emojis?.max_emojis || 10);
            setVal('am-emojis-action', am.emojis?.action || 'delete');
            setVal('am-newlines-max', am.newlines?.max_newlines || 10);
            setVal('am-newlines-action', am.newlines?.action || 'delete');

            // Render bad words tags
            renderBadWords(am.bad_words?.words || []);
            // Render link whitelist tags
            renderLinkDomains(am.links?.whitelist || []);

            // Load exempt roles/channels and log channel
            const [rolesRes, channelsRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`)
            ]);
            const rolesData = await rolesRes.json();
            const chData = await channelsRes.json();
            amRoles = rolesData.roles || [];
            amChannels = (chData.channels || []).filter(c => c.type === 0);

            renderAMExemptRoles(am.exempt_roles || []);
            renderAMExemptChannels(am.exempt_channels || []);

            // Log channel
            const logChSelect = document.getElementById('am-log-channel');
            logChSelect.innerHTML = '<option value="">-- None --</option>' + amChannels.map(c =>
                `<option value="${c.id}" ${c.id === am.log_channel ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`
            ).join('');
        } catch (e) { console.error('Failed to load automod config:', e); }
    }

    function renderBadWords(words) {
        const el = document.getElementById('am-bad_words-list');
        if (!el) return;
        el.innerHTML = words.map(w => `<span class="tag">${escapeHtml(w)}<button class="tag-remove" onclick="window.cpRemoveBadWord('${escapeHtml(w)}')">&times;</button></span>`).join('');
    }

    function renderLinkDomains(domains) {
        const el = document.getElementById('am-links-whitelist');
        if (!el) return;
        el.innerHTML = domains.map(d => `<span class="tag">${escapeHtml(d)}<button class="tag-remove" onclick="window.cpRemoveLinkDomain('${escapeHtml(d)}')">&times;</button></span>`).join('');
    }

    window.cpToggleAutoMod = async function() {
        const enabled = document.getElementById('am-enabled').checked;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/automod`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
            showToast(`Auto-mod ${enabled ? 'enabled' : 'disabled'}`, 'success');
        } catch (e) { showToast('Failed to update', 'error'); }
    };

    window.cpToggleAMFilter = async function(filter) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/automod`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toggle_filter: filter })
            });
            showToast('Filter updated', 'success');
        } catch (e) { showToast('Failed to update', 'error'); }
    };

    window.cpExpandFilter = function(filter) {
        const el = document.getElementById(`am-settings-${filter}`);
        if (!el) return;
        el.style.display = el.style.display === 'none' ? '' : 'none';
    };

    window.cpSaveAMFilter = async function(filter) {
        const payload = { update_filter: filter };

        if (filter === 'bad_words') {
            payload.action = document.getElementById('am-bad_words-action').value;
        } else if (filter === 'spam') {
            payload.max_messages = parseInt(document.getElementById('am-spam-max').value) || 5;
            payload.interval = parseInt(document.getElementById('am-spam-interval').value) || 5;
            payload.action = document.getElementById('am-spam-action').value;
        } else if (filter === 'invites') {
            payload.action = document.getElementById('am-invites-action').value;
        } else if (filter === 'links') {
            payload.action = document.getElementById('am-links-action').value;
        } else if (filter === 'caps') {
            payload.min_length = parseInt(document.getElementById('am-caps-min').value) || 8;
            payload.max_percentage = parseInt(document.getElementById('am-caps-max').value) || 70;
            payload.action = document.getElementById('am-caps-action').value;
        } else if (filter === 'mass_mentions') {
            payload.max_mentions = parseInt(document.getElementById('am-mentions-max').value) || 5;
            payload.action = document.getElementById('am-mentions-action').value;
        } else if (filter === 'duplicates') {
            payload.action = document.getElementById('am-duplicates-action').value;
        } else if (filter === 'emojis') {
            payload.max_emojis = parseInt(document.getElementById('am-emojis-max').value) || 10;
            payload.action = document.getElementById('am-emojis-action').value;
        } else if (filter === 'newlines') {
            payload.max_newlines = parseInt(document.getElementById('am-newlines-max').value) || 10;
            payload.action = document.getElementById('am-newlines-action').value;
        }

        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/automod`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            showToast('Filter settings saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    window.cpAddBadWord = async function() {
        const input = document.getElementById('am-bad_words-input');
        const word = input.value.trim().toLowerCase();
        if (!word) return;
        input.value = '';

        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/automod`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ add_bad_word: word })
            });
            loadAutoMod();
            showToast('Word added', 'success');
        } catch (e) { showToast('Failed to add word', 'error'); }
    };

    window.cpRemoveBadWord = async function(word) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/automod`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ remove_bad_word: word })
            });
            loadAutoMod();
            showToast('Word removed', 'success');
        } catch (e) { showToast('Failed to remove word', 'error'); }
    };

    window.cpAddLinkDomain = async function(listType) {
        const input = document.getElementById(`am-links-${listType}-input`);
        const domain = input.value.trim().toLowerCase();
        if (!domain) return;
        input.value = '';

        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/automod`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ add_link_whitelist: domain })
            });
            loadAutoMod();
            showToast('Domain added', 'success');
        } catch (e) { showToast('Failed to add domain', 'error'); }
    };

    window.cpRemoveLinkDomain = async function(domain) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/automod`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ remove_link_whitelist: domain })
            });
            loadAutoMod();
            showToast('Domain removed', 'success');
        } catch (e) { showToast('Failed to remove domain', 'error'); }
    };

    // Auto-mod exempt roles/channels
    let amRoles = [];
    let amChannels = [];

    function renderAMExemptRoles(exemptRoles) {
        const container = document.getElementById('am-exempt-roles');
        if (!container) return;
        if (exemptRoles.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No exempt roles</p>';
            return;
        }
        container.innerHTML = exemptRoles.map((rid, i) => {
            const role = amRoles.find(r => r.id === rid);
            return `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                <select class="form-select am-exempt-role-select" data-index="${i}">
                    <option value="">-- Select --</option>
                    ${amRoles.map(r => `<option value="${r.id}" ${r.id === rid ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                </select>
                <button class="control-btn danger" onclick="this.parentElement.remove()" style="padding:0.4rem 0.6rem;">✕</button>
            </div>`;
        }).join('');
    }

    function renderAMExemptChannels(exemptChannels) {
        const container = document.getElementById('am-exempt-channels');
        if (!container) return;
        if (exemptChannels.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No exempt channels</p>';
            return;
        }
        container.innerHTML = exemptChannels.map((cid, i) => {
            return `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                <select class="form-select am-exempt-channel-select" data-index="${i}">
                    <option value="">-- Select --</option>
                    ${amChannels.map(c => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('')}
                </select>
                <button class="control-btn danger" onclick="this.parentElement.remove()" style="padding:0.4rem 0.6rem;">✕</button>
            </div>`;
        }).join('');
    }

    window.cpAddAMExemptRole = function() {
        const container = document.getElementById('am-exempt-roles');
        if (container.querySelector('p')) container.innerHTML = '';
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;';
        div.innerHTML = `<select class="form-select am-exempt-role-select"><option value="">-- Select --</option>${amRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}</select>
            <button class="control-btn danger" onclick="this.parentElement.remove()" style="padding:0.4rem 0.6rem;">✕</button>`;
        container.appendChild(div);
    };

    window.cpAddAMExemptChannel = function() {
        const container = document.getElementById('am-exempt-channels');
        if (container.querySelector('p')) container.innerHTML = '';
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;';
        div.innerHTML = `<select class="form-select am-exempt-channel-select"><option value="">-- Select --</option>${amChannels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('')}</select>
            <button class="control-btn danger" onclick="this.parentElement.remove()" style="padding:0.4rem 0.6rem;">✕</button>`;
        container.appendChild(div);
    };

    window.cpSaveAMExemptions = async function() {
        const exemptRoles = [...document.querySelectorAll('.am-exempt-role-select')].map(s => s.value).filter(v => v);
        const exemptChannels = [...document.querySelectorAll('.am-exempt-channel-select')].map(s => s.value).filter(v => v);
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/automod`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exempt_roles: exemptRoles, exempt_channels: exemptChannels })
            });
            showToast('Exemptions saved', 'success');
            loadAutoMod();
        } catch (e) { showToast('Failed to save exemptions', 'error'); }
    };

    window.cpSaveAMLogChannel = async function() {
        const logChannel = document.getElementById('am-log-channel').value;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/automod`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ log_channel: logChannel })
            });
            showToast('Log channel saved', 'success');
        } catch (e) { showToast('Failed to save log channel', 'error'); }
    };

    // ==================== LOGGING CONFIG ====================
    let loggingTextChannels = [];

    function syncLogChannels() {
        const get = id => document.getElementById(id)?.value || '';
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        set('msglog-channel', get('log-ch-messageDelete') || get('log-ch-messageEdit'));
        set('voicelog-channel', get('log-ch-voiceActivity'));
        set('joinlog-channel', get('log-ch-memberJoin') || get('log-ch-memberLeave'));
        set('namelog-channel', get('log-ch-memberUpdate'));
        set('rolelog-channel', get('log-ch-roleChanges'));
    }

    function updateLogInlinePanels() {
        const allSet = !!document.getElementById('log-ch-all')?.value;
        const has = id => !!document.getElementById(id)?.value;
        const show = (id, cond) => {
            const p = document.getElementById(id);
            if (p) p.style.display = (!allSet && cond) ? '' : 'none';
        };
        show('log-inline-message', has('log-ch-messageDelete') || has('log-ch-messageEdit'));
        show('log-inline-voice', has('log-ch-voiceActivity'));
        show('log-inline-joinleave', has('log-ch-memberJoin') || has('log-ch-memberLeave'));
        show('log-inline-names', has('log-ch-memberUpdate'));
        show('log-inline-roles', has('log-ch-roleChanges'));
    }

    async function loadLogging() {
        const el = document.getElementById('logging-channels-list');
        try {
            const gid = selectedGuild.id;
            const [configRes, channelsRes, rolesRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${gid}/logging`),
                fetch(`/api/cub-protector/guilds/${gid}/channels`),
                fetch(`/api/cub-protector/guilds/${gid}/roles`)
            ]);
            const data = await configRes.json();
            const chData = await channelsRes.json();
            const rolesData = await rolesRes.json();
            const config = data.config || {};
            const channels = config.channels || {};
            loggingTextChannels = (chData.channels || []).filter(c => c.type === 0);
            const loggingVoiceChannels = (chData.channels || []).filter(c => c.type === 2);
            const loggingRoles = (rolesData.roles || []).filter(r => r.name !== '@everyone');

            // Fetch sub-logger configs (silent failures use defaults)
            const [ms, vs, js, ns, rs] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${gid}/message-logger`).then(r=>r.json()).then(d=>d.settings||d).catch(()=>({})),
                fetch(`/api/cub-protector/guilds/${gid}/voice-logger`).then(r=>r.json()).then(d=>d.settings||d).catch(()=>({})),
                fetch(`/api/cub-protector/guilds/${gid}/join-leave-logger`).then(r=>r.json()).then(d=>d.settings||d).catch(()=>({})),
                fetch(`/api/cub-protector/guilds/${gid}/name-logger`).then(r=>r.json()).then(d=>d.settings||d).catch(()=>({})),
                fetch(`/api/cub-protector/guilds/${gid}/role-logger`).then(r=>r.json()).then(d=>d.settings||d).catch(()=>({})),
            ]);

            document.getElementById('log-enabled').checked = config.enabled || false;
            document.getElementById('log-bot-actions').checked = config.log_bot_actions || false;
            document.getElementById('log-compact-mode').checked = config.compact_mode || false;

            const events = [
                { key: 'all', label: 'All Events', desc: 'Log everything to one channel' },
                { key: 'messageDelete', label: 'Message Delete', desc: 'Deleted messages & bulk deletes' },
                { key: 'messageEdit', label: 'Message Edit', desc: 'Edited messages' },
                { key: 'memberJoin', label: 'Member Join', desc: 'New member joins' },
                { key: 'memberLeave', label: 'Member Leave', desc: 'Member departures' },
                { key: 'memberBan', label: 'Member Ban/Unban', desc: 'Bans and unbans' },
                { key: 'memberUpdate', label: 'Member Updates', desc: 'Nicknames, timeouts, avatar changes' },
                { key: 'voiceActivity', label: 'Voice Activity', desc: 'Voice joins, leaves, moves' },
                { key: 'roleChanges', label: 'Role Changes', desc: 'Roles added/removed, role create/delete/update, permissions' },
                { key: 'channelChanges', label: 'Channel Changes', desc: 'Channel create/delete/update, permissions, threads, webhooks' },
                { key: 'serverChanges', label: 'Server Settings', desc: 'Server name, icon, verification level, etc.' },
                { key: 'emojiChanges', label: 'Emoji & Stickers', desc: 'Emoji/sticker create, delete, rename' },
                { key: 'inviteChanges', label: 'Invites', desc: 'Invite created/deleted' },
                { key: 'modActions', label: 'Mod Actions', desc: 'Bot moderation commands' },
            ];

            const channelOptions = '<option value="">-- None --</option>' +
                loggingTextChannels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');

            // Build event channel rows
            let html = events.map(evt => `
                <div class="settings-row log-ch-row" style="flex-wrap:wrap;gap:0.5rem;">
                    <div class="settings-info" style="min-width:180px;"><h4>${evt.label}</h4><p>${evt.desc}</p></div>
                    <select id="log-ch-${evt.key}" class="form-select log-ch-select" style="max-width:220px;">${channelOptions}</select>
                </div>`).join('');

            // Helper builders for inline panel content
            const inlinePanel = (id, title, content) =>
                `<div id="${id}" class="log-inline-extras" style="display:none;margin:0.25rem 0 0.5rem 1.5rem;padding:0.85rem 1rem;background:var(--bg-tertiary);border-radius:8px;border-left:3px solid var(--accent-color);">
                    <p style="color:var(--text-muted);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.75rem;font-weight:600;">${title}</p>
                    ${content}
                </div>`;
            const row = (label, desc, id, checked) =>
                `<div class="settings-row"><div class="settings-info"><h4>${label}</h4><p>${desc}</p></div><label class="toggle"><input type="checkbox" id="${id}" ${checked?'checked':''}><span class="toggle-slider"></span></label></div>`;
            const mkChk = (items, sel) => items.map(c =>
                `<label class="multi-check-item"><input type="checkbox" value="${c.id}" ${(sel||[]).includes(c.id)?'checked':''}><span>#${escapeHtml(c.name)}</span></label>`
            ).join('') || '<span style="color:var(--text-muted);font-size:0.85rem;">None</span>';
            const mkRoleChk = (items, sel) => items.map(r =>
                `<label class="multi-check-item"><input type="checkbox" value="${r.id}" ${(sel||[]).includes(r.id)?'checked':''}><span>@${escapeHtml(r.name)}</span></label>`
            ).join('') || '<span style="color:var(--text-muted);font-size:0.85rem;">None</span>';

            // Message logger inline panel
            html += inlinePanel('log-inline-message', 'Message Logging Options',
                `<input type="checkbox" id="msglog-enabled" checked style="display:none">
                <input type="hidden" id="msglog-channel" value="">
                ${row('Log Edits','Log when messages are edited','msglog-edits',ms.edits!==false)}
                ${row('Log Deletes','Log when messages are deleted','msglog-deletes',ms.deletes!==false)}
                ${row('Log Bulk Deletes','Log bulk message deletions (purge)','msglog-bulk',ms.bulk||false)}
                ${row('Log Pin/Unpin','Log when messages are pinned or unpinned','msglog-pins',ms.pins||false)}
                ${row('Include Message Content','Include the message content in logs','msglog-content',ms.content!==false)}
                <div class="form-group" style="margin-top:0.75rem;"><label>Ignore Channels</label><div id="msglog-ignore-channels" class="multi-check-list">${mkChk(loggingTextChannels,ms.ignore_channels)}</div></div>
                <div class="form-group"><label>Ignore Roles</label><div id="msglog-ignore-roles" class="multi-check-list">${mkRoleChk(loggingRoles,ms.ignore_roles)}</div></div>
                <button class="btn btn-primary btn-sm" style="margin-top:0.5rem;" onclick="window.cpSaveMessageLogger()">Save Message Logging</button>`
            );

            // Voice logger inline panel
            html += inlinePanel('log-inline-voice', 'Voice Logging Options',
                `<input type="checkbox" id="voicelog-enabled" checked style="display:none">
                <input type="hidden" id="voicelog-channel" value="">
                ${row('Log Joins/Leaves','Log when members join or leave voice channels','voicelog-joins',vs.joins!==false)}
                ${row('Log Moves','Log when members move between voice channels','voicelog-moves',vs.moves!==false)}
                ${row('Log Mute/Deafen','Log when members mute or deafen','voicelog-mute',vs.mute||false)}
                ${row('Log Streaming','Log when members start or stop streaming','voicelog-stream',vs.stream||false)}
                <div class="form-group" style="margin-top:0.75rem;"><label>Ignore Voice Channels</label><div id="voicelog-ignore-channels" class="multi-check-list">${mkChk(loggingVoiceChannels,vs.ignore_channels)}</div></div>
                <button class="btn btn-primary btn-sm" style="margin-top:0.5rem;" onclick="window.cpSaveVoiceLogger()">Save Voice Logging</button>`
            );

            // Join/leave logger inline panel
            html += inlinePanel('log-inline-joinleave', 'Join/Leave Logging Options',
                `<input type="checkbox" id="joinlog-enabled" checked style="display:none">
                <input type="hidden" id="joinlog-channel" value="">
                ${row('Show Account Age','Display how old the account is when joining','joinlog-account-age',js.account_age!==false)}
                ${row('Show Invite Used','Show which invite link was used to join','joinlog-invite',js.invite||false)}
                ${row('Show Member Count','Display the current member count on join/leave','joinlog-member-count',js.member_count||false)}
                ${row('Flag New Accounts','Highlight accounts created recently','joinlog-flag-new',js.flag_new||false)}
                <div class="form-group"><label>New Account Threshold (days)</label><input type="number" id="joinlog-threshold" class="form-input" value="${js.threshold||7}" min="0" style="max-width:100px;"></div>
                <button class="btn btn-primary btn-sm" style="margin-top:0.5rem;" onclick="window.cpSaveJoinLeaveLogger()">Save Join/Leave Logging</button>`
            );

            // Member updates logger inline panel
            html += inlinePanel('log-inline-names', 'Member Update Logging Options',
                `<input type="checkbox" id="namelog-enabled" checked style="display:none">
                <input type="hidden" id="namelog-channel" value="">
                ${row('Log Username Changes','Log when members change their username','namelog-usernames',ns.usernames!==false)}
                ${row('Log Nickname Changes','Log when members change their server nickname','namelog-nicknames',ns.nicknames!==false)}
                ${row('Log Avatar Changes','Log when members change their avatar','namelog-avatars',ns.avatars||false)}
                ${row('Log Discriminator Changes','Log when members change their discriminator','namelog-discriminators',ns.discriminators||false)}
                <button class="btn btn-primary btn-sm" style="margin-top:0.5rem;" onclick="window.cpSaveNameLogger()">Save Member Update Logging</button>`
            );

            // Role logger inline panel
            html += inlinePanel('log-inline-roles', 'Role Logging Options',
                `<input type="checkbox" id="rolelog-enabled" checked style="display:none">
                <input type="hidden" id="rolelog-channel" value="">
                ${row('Log Role Creates','Log when new roles are created','rolelog-creates',rs.creates!==false)}
                ${row('Log Role Deletes','Log when roles are deleted','rolelog-deletes',rs.deletes!==false)}
                ${row('Log Role Edits','Log when roles are edited (name, color, permissions)','rolelog-edits',rs.edits!==false)}
                ${row('Log Member Role Changes','Log when roles are added or removed from members','rolelog-member-changes',rs.member_changes!==false)}
                <div class="form-group" style="margin-top:0.75rem;"><label>Ignore Roles</label><div id="rolelog-ignore-roles" class="multi-check-list">${mkRoleChk(loggingRoles,rs.ignore_roles)}</div></div>
                <button class="btn btn-primary btn-sm" style="margin-top:0.5rem;" onclick="window.cpSaveRoleLogger()">Save Role Logging</button>`
            );

            el.innerHTML = html;

            // Set selected values on event channel selects
            events.forEach(evt => {
                const sel = document.getElementById(`log-ch-${evt.key}`);
                if (sel && channels[evt.key]) sel.value = channels[evt.key];
            });

            // Populate general ignore lists
            const ignoreChEl = document.getElementById('log-ignore-channels');
            if (ignoreChEl) ignoreChEl.innerHTML = loggingTextChannels.map(c =>
                `<label class="multi-check-item"><input type="checkbox" value="${c.id}" ${(config.ignore_channels||[]).includes(c.id)?'checked':''}><span>#${escapeHtml(c.name)}</span></label>`
            ).join('');
            const ignoreRoleEl = document.getElementById('log-ignore-roles');
            if (ignoreRoleEl) ignoreRoleEl.innerHTML = loggingRoles.map(r =>
                `<label class="multi-check-item"><input type="checkbox" value="${r.id}" ${(config.ignore_roles||[]).includes(r.id)?'checked':''}><span>@${escapeHtml(r.name)}</span></label>`
            ).join('');

            // Sync hidden channel fields and show/hide inline panels
            syncLogChannels();
            updateLogInlinePanels();

            // Re-evaluate on every channel select change
            el.querySelectorAll('.log-ch-select').forEach(sel => {
                sel.addEventListener('change', () => {
                    syncLogChannels();
                    updateLogInlinePanels();
                });
            });

        } catch (e) { el.innerHTML = '<p>Failed to load logging config.</p>'; }
    }

    window.cpSaveLogging = async function() {
        const events = ['all', 'messageDelete', 'messageEdit', 'memberJoin', 'memberLeave', 'memberBan', 'memberUpdate', 'voiceActivity', 'roleChanges', 'channelChanges', 'serverChanges', 'emojiChanges', 'inviteChanges', 'modActions'];
        const channels = {};
        events.forEach(evt => {
            const sel = document.getElementById(`log-ch-${evt}`);
            if (sel && sel.value) channels[evt] = sel.value;
        });

        const payload = {
            enabled: document.getElementById('log-enabled').checked,
            channels: channels,
            log_bot_actions: document.getElementById('log-bot-actions').checked,
            compact_mode: document.getElementById('log-compact-mode').checked,
            ignore_channels: getMultiSelectValues('log-ignore-channels'),
            ignore_roles: getMultiSelectValues('log-ignore-roles'),
        };

        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/logging`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            showToast('Logging config saved', 'success');
        } catch (e) { showToast('Failed to save logging config', 'error'); }
    };

    // ==================== WELCOME CONFIG ====================
    let welcomeAutoRoles = [];
    let allServerRoles = [];

    async function loadWelcome() {
        try {
            const [configRes, channelsRes, rolesRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/welcome`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`)
            ]);
            const data = await configRes.json();
            const chData = await channelsRes.json();
            const rolesData = await rolesRes.json();
            const config = data.config || {};
            const textChannels = (chData.channels || []).filter(c => c.type === 0);
            allServerRoles = rolesData.roles || [];

            // Welcome fields
            document.getElementById('welcome-enabled').checked = config.welcome?.enabled || false;
            document.getElementById('welcome-message').value = config.welcome?.message || 'Welcome to {server}, {user}!';
            document.getElementById('welcome-dm').value = config.welcome?.dm_message || '';
            document.getElementById('welcome-format').value = config.welcome?.format || 'embed';
            document.getElementById('welcome-embed-title').value = config.welcome?.embed_title || '';
            document.getElementById('welcome-embed-color').value = config.welcome?.embed_color || '#5865f2';
            document.getElementById('welcome-embed-image').value = config.welcome?.embed_image || '';
            document.getElementById('welcome-embed-thumbnail').value = config.welcome?.embed_thumbnail || '';
            document.getElementById('welcome-embed-footer').value = config.welcome?.embed_footer || '';
            document.getElementById('welcome-mention').checked = config.welcome?.mention || false;
            document.getElementById('welcome-autodelete').value = String(config.welcome?.autodelete || 0);
            document.getElementById('welcome-show-count').checked = config.welcome?.show_count || false;
            document.getElementById('welcome-banner-url').value = config.welcome?.banner_url || '';

            // Auto-role fields
            document.getElementById('welcome-autorole-enabled').checked = config.welcome?.autorole_enabled || false;
            document.getElementById('welcome-autorole-delay').value = config.welcome?.autorole_delay || 0;
            welcomeAutoRoles = config.welcome?.auto_roles || [];
            renderAutoRoles();
            populateRoleSelect();

            // Show/hide embed options based on format
            toggleEmbedOptions('welcome');

            // Goodbye fields
            document.getElementById('goodbye-enabled').checked = config.goodbye?.enabled || false;
            document.getElementById('goodbye-message').value = config.goodbye?.message || 'Goodbye {user}!';
            document.getElementById('goodbye-format').value = config.goodbye?.format || 'embed';
            document.getElementById('goodbye-embed-title').value = config.goodbye?.embed_title || '';
            document.getElementById('goodbye-embed-color').value = config.goodbye?.embed_color || '#ed4245';
            document.getElementById('goodbye-embed-image').value = config.goodbye?.embed_image || '';
            document.getElementById('goodbye-autodelete').value = String(config.goodbye?.autodelete || 0);
            document.getElementById('goodbye-show-count').checked = config.goodbye?.show_count || false;

            toggleEmbedOptions('goodbye');

            // Channel selects
            const populateSelect = (id, selected) => {
                const sel = document.getElementById(id);
                sel.innerHTML = '<option value="">-- Select channel --</option>' +
                    textChannels.map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('');
            };
            populateSelect('welcome-channel', config.welcome?.channel_id);
            populateSelect('goodbye-channel', config.goodbye?.channel_id);
        } catch (e) { console.error('Failed to load welcome config:', e); }
    }

    function toggleEmbedOptions(type) {
        const format = document.getElementById(`${type}-format`).value;
        const embedEl = document.getElementById(`${type}-embed-options`);
        if (embedEl) embedEl.style.display = format === 'embed' ? '' : 'none';
    }

    // Listen for format changes
    ['welcome-format', 'goodbye-format'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => toggleEmbedOptions(id.split('-')[0]));
    });

    function renderAutoRoles() {
        const container = document.getElementById('welcome-autorole-list');
        if (!container) return;
        if (welcomeAutoRoles.length === 0) {
            container.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">No roles added yet</span>';
            return;
        }
        container.innerHTML = welcomeAutoRoles.map(roleId => {
            const role = allServerRoles.find(r => r.id === roleId);
            const name = role ? escapeHtml(role.name) : roleId;
            const color = role && role.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#5865f2';
            return `<span class="tag" style="border-color:${color}40;background:${color}20;color:${color};">${name}<button class="tag-remove" onclick="window.cpRemoveWelcomeRole('${roleId}')">&times;</button></span>`;
        }).join('');
    }

    function populateRoleSelect() {
        const sel = document.getElementById('welcome-autorole-select');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Select a role --</option>' +
            allServerRoles
                .filter(r => !welcomeAutoRoles.includes(r.id))
                .map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    }

    window.cpAddAutoRole = function() {
        const sel = document.getElementById('welcome-autorole-select');
        const roleId = sel.value;
        if (!roleId || welcomeAutoRoles.includes(roleId)) return;
        welcomeAutoRoles.push(roleId);
        renderAutoRoles();
        populateRoleSelect();
        window.cpSaveWelcome();
    };

    window.cpRemoveWelcomeRole = function(roleId) {
        welcomeAutoRoles = welcomeAutoRoles.filter(r => r !== roleId);
        renderAutoRoles();
        populateRoleSelect();
        window.cpSaveWelcome();
    };

    window.cpSaveWelcome = async function() {
        const payload = {
            welcome: {
                enabled: document.getElementById('welcome-enabled').checked,
                channel_id: document.getElementById('welcome-channel').value || null,
                message: document.getElementById('welcome-message').value,
                dm_message: document.getElementById('welcome-dm').value || null,
                format: document.getElementById('welcome-format').value,
                embed_title: document.getElementById('welcome-embed-title').value || '',
                embed_color: document.getElementById('welcome-embed-color').value || '#5865f2',
                embed_image: document.getElementById('welcome-embed-image').value || '',
                embed_thumbnail: document.getElementById('welcome-embed-thumbnail').value || '',
                embed_footer: document.getElementById('welcome-embed-footer').value || '',
                mention: document.getElementById('welcome-mention').checked,
                autodelete: parseInt(document.getElementById('welcome-autodelete').value) || 0,
                show_count: document.getElementById('welcome-show-count').checked,
                autorole_enabled: document.getElementById('welcome-autorole-enabled').checked,
                auto_roles: welcomeAutoRoles,
                autorole_delay: parseInt(document.getElementById('welcome-autorole-delay').value) || 0,
                banner_url: document.getElementById('welcome-banner-url').value || '',
            },
            goodbye: {
                enabled: document.getElementById('goodbye-enabled').checked,
                channel_id: document.getElementById('goodbye-channel').value || null,
                message: document.getElementById('goodbye-message').value,
                format: document.getElementById('goodbye-format').value,
                embed_title: document.getElementById('goodbye-embed-title').value || '',
                embed_color: document.getElementById('goodbye-embed-color').value || '#ed4245',
                embed_image: document.getElementById('goodbye-embed-image').value || '',
                autodelete: parseInt(document.getElementById('goodbye-autodelete').value) || 0,
                show_count: document.getElementById('goodbye-show-count').checked,
            }
        };
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/welcome`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) showToast('Welcome config saved', 'success');
            else showToast('Failed to save welcome config', 'error');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    window.cpTestWelcome = async function() {
        if (!selectedGuild) { showToast('No server selected', 'error'); return; }
        const channelId = document.getElementById('welcome-channel').value;
        if (!channelId) { showToast('Select a welcome channel first', 'error'); return; }
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/welcome/test`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel_id: channelId })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Test welcome message sent!', 'success');
            } else {
                showToast(data.error || 'Failed to send test message', 'error');
            }
        } catch (e) { showToast('Failed to send test message', 'error'); }
    };

    // ==================== LEVELING CONFIG ====================
    let levelingChannels = [];
    let levelingRoles = [];

    async function loadLeveling() {
        try {
            const [res, channelsRes, rolesRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/leveling`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`)
            ]);
            const data = await res.json();
            const chData = await channelsRes.json();
            const rolesData = await rolesRes.json();
            const config = data.config || {};
            levelingChannels = chData.channels || [];
            levelingRoles = rolesData.roles || [];

            document.getElementById('leveling-enabled').checked = config.enabled || false;
            document.getElementById('leveling-multiplier').value = String(config.xp_multiplier || 1);
            document.getElementById('leveling-announce').value = config.announce_type || 'current';
            document.getElementById('leveling-xp-min').value = config.xp_min || 15;
            document.getElementById('leveling-xp-max').value = config.xp_max || 25;
            document.getElementById('leveling-cooldown').value = (config.xp_cooldown || 60000) / 1000;
            document.getElementById('leveling-level-msg').value = config.level_up_message || '';
            document.getElementById('leveling-stack').checked = config.stack_rewards || false;

            renderLevelingRoleRewards(config.role_rewards, levelingRoles);
            renderNoXPChannels(config.no_xp_channels, levelingChannels);
            renderNoXPRoles(config.no_xp_roles, levelingRoles);

            const lb = data.leaderboard || [];
            document.getElementById('leveling-leaderboard').innerHTML = lb.length === 0
                ? '<p style="color: var(--text-muted);">No data yet.</p>'
                : lb.map((u, i) => `<div class="channel-item"><div class="channel-info"><div><div class="channel-name">#${i + 1} ${escapeHtml(u.username || u.user_id)}</div><div class="channel-owner">Level ${u.level} - ${u.xp} XP</div></div></div></div>`).join('');
        } catch (e) { console.error('Failed to load leveling config:', e); }
    }

    function renderLevelingRoleRewards(rewards, roles) {
        const container = document.getElementById('leveling-role-rewards');
        const entries = Object.entries(rewards || {});
        if (entries.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No role rewards configured</p>';
            return;
        }
        container.innerHTML = entries.sort((a,b) => parseInt(a[0]) - parseInt(b[0])).map(([level, roleId]) => {
            const role = roles.find(r => r.id === roleId);
            return `<div class="channel-item" style="margin-bottom:0.5rem;"><div class="channel-info"><div><div class="channel-name">Level ${escapeHtml(level)}</div><div class="channel-owner">${role ? escapeHtml(role.name) : roleId}</div></div></div><button class="control-btn danger small" onclick="window.cpRemoveRoleReward('${escapeHtml(level)}')">Remove</button></div>`;
        }).join('');
    }

    function renderNoXPChannels(channelIds, channels) {
        const container = document.getElementById('leveling-no-xp-channels');
        if (!channelIds || channelIds.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No excluded channels</p>';
            return;
        }
        container.innerHTML = channelIds.map(cid => {
            const ch = channels.find(c => c.id === cid);
            return `<span class="tag-pill">#${ch ? escapeHtml(ch.name) : cid} <button onclick="window.cpRemoveNoXPChannel('${cid}')">&times;</button></span>`;
        }).join(' ');
    }

    function renderNoXPRoles(roleIds, roles) {
        const container = document.getElementById('leveling-no-xp-roles');
        if (!roleIds || roleIds.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No excluded roles</p>';
            return;
        }
        container.innerHTML = roleIds.map(rid => {
            const role = roles.find(r => r.id === rid);
            return `<span class="tag-pill">${role ? escapeHtml(role.name) : rid} <button onclick="window.cpRemoveNoXPRole('${rid}')">&times;</button></span>`;
        }).join(' ');
    }

    function collectRoleRewards() {
        const rewards = {};
        document.querySelectorAll('#leveling-role-rewards .channel-item').forEach(item => {
            const levelText = item.querySelector('.channel-name')?.textContent || '';
            const match = levelText.match(/Level (\d+)/);
            if (match) {
                const roleText = item.querySelector('.channel-owner')?.textContent || '';
                const role = levelingRoles.find(r => r.name === roleText);
                if (role) rewards[match[1]] = role.id;
                else if (/^\d+$/.test(roleText)) rewards[match[1]] = roleText;
            }
        });
        return rewards;
    }

    function collectNoXPChannels() {
        const channels = [];
        document.querySelectorAll('#leveling-no-xp-channels .tag-pill').forEach(pill => {
            const btn = pill.querySelector('button');
            if (btn) {
                const onclick = btn.getAttribute('onclick') || '';
                const match = onclick.match(/'(\d+)'/);
                if (match) channels.push(match[1]);
            }
        });
        return channels;
    }

    function collectNoXPRoles() {
        const roles = [];
        document.querySelectorAll('#leveling-no-xp-roles .tag-pill').forEach(pill => {
            const btn = pill.querySelector('button');
            if (btn) {
                const onclick = btn.getAttribute('onclick') || '';
                const match = onclick.match(/'(\d+)'/);
                if (match) roles.push(match[1]);
            }
        });
        return roles;
    }

    window.cpSaveLeveling = async function() {
        const payload = {
            enabled: document.getElementById('leveling-enabled').checked,
            xp_multiplier: parseFloat(document.getElementById('leveling-multiplier').value) || 1,
            announce_type: document.getElementById('leveling-announce').value,
            xp_min: parseInt(document.getElementById('leveling-xp-min').value) || 15,
            xp_max: parseInt(document.getElementById('leveling-xp-max').value) || 25,
            xp_cooldown: (parseInt(document.getElementById('leveling-cooldown').value) || 60) * 1000,
            level_up_message: document.getElementById('leveling-level-msg').value,
            stack_rewards: document.getElementById('leveling-stack').checked,
            role_rewards: collectRoleRewards(),
            no_xp_channels: collectNoXPChannels(),
            no_xp_roles: collectNoXPRoles(),
        };
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/leveling`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            showToast('Leveling config saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    window.cpAddRoleReward = function() {
        const level = prompt('Enter level number:');
        if (!level || isNaN(parseInt(level))) return;
        const roleOptions = levelingRoles.map(r => `${r.name} (${r.id})`).join('\n');
        const roleInput = prompt('Enter role ID:\n\nAvailable roles:\n' + roleOptions);
        if (!roleInput) return;
        const roleId = roleInput.match(/\d+/)?.[0];
        if (!roleId) return;
        const existing = collectRoleRewards();
        existing[level] = roleId;
        renderLevelingRoleRewards(existing, levelingRoles);
        window.cpSaveLeveling();
    };

    window.cpRemoveRoleReward = function(level) {
        const rewards = collectRoleRewards();
        delete rewards[level];
        renderLevelingRoleRewards(rewards, levelingRoles);
        window.cpSaveLeveling();
    };

    window.cpAddNoXPChannel = function() {
        const options = levelingChannels.filter(c => c.type === 0).map(c => `#${c.name} (${c.id})`).join('\n');
        const input = prompt('Enter channel ID:\n\n' + options);
        if (!input) return;
        const id = input.match(/\d+/)?.[0];
        if (!id) return;
        const current = collectNoXPChannels();
        if (!current.includes(id)) current.push(id);
        renderNoXPChannels(current, levelingChannels);
        window.cpSaveLeveling();
    };

    window.cpRemoveNoXPChannel = function(channelId) {
        const current = collectNoXPChannels().filter(c => c !== channelId);
        renderNoXPChannels(current, levelingChannels);
        window.cpSaveLeveling();
    };

    window.cpAddNoXPRole = function() {
        const options = levelingRoles.map(r => `${r.name} (${r.id})`).join('\n');
        const input = prompt('Enter role ID:\n\n' + options);
        if (!input) return;
        const id = input.match(/\d+/)?.[0];
        if (!id) return;
        const current = collectNoXPRoles();
        if (!current.includes(id)) current.push(id);
        renderNoXPRoles(current, levelingRoles);
        window.cpSaveLeveling();
    };

    window.cpRemoveNoXPRole = function(roleId) {
        const current = collectNoXPRoles().filter(r => r !== roleId);
        renderNoXPRoles(current, levelingRoles);
        window.cpSaveLeveling();
    };

    // ==================== ECONOMY CONFIG ====================
    let economyRoles = [];

    async function loadEconomy() {
        try {
            const [res, rolesRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/economy`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`)
            ]);
            const data = await res.json();
            const rolesData = await rolesRes.json();
            const config = data.config || {};
            economyRoles = rolesData.roles || [];

            document.getElementById('eco-currency-name').value = config.currency_name || 'Coins';
            document.getElementById('eco-currency-emoji').value = config.currency_emoji || '';
            document.getElementById('eco-daily-amount').value = config.daily_amount || 100;
            document.getElementById('eco-work-min').value = config.work_min || 50;
            document.getElementById('eco-work-max').value = config.work_max || 150;
            document.getElementById('eco-work-cooldown').value = (config.work_cooldown || 3600000) / 1000;
            document.getElementById('eco-rob-enabled').checked = config.rob_enabled || false;
            document.getElementById('eco-rob-chance').value = config.rob_chance || 40;
            document.getElementById('eco-rob-fine').value = config.rob_fine || 25;
            document.getElementById('eco-starting-balance').value = config.starting_balance || 0;

            renderShopItems(config.shop, economyRoles);

            const lb = data.leaderboard || [];
            document.getElementById('economy-leaderboard').innerHTML = lb.length === 0
                ? '<p style="color: var(--text-muted);">No data yet.</p>'
                : lb.map((u, i) => `<div class="channel-item"><div class="channel-info"><div><div class="channel-name">#${i + 1} ${escapeHtml(u.username || u.user_id)}</div><div class="channel-owner">${config.currency_emoji || ''} ${u.balance} ${config.currency_name || 'Coins'}</div></div></div></div>`).join('');
        } catch (e) { console.error('Failed to load economy config:', e); }
    }

    function renderShopItems(shop, roles) {
        const container = document.getElementById('eco-shop-items');
        if (!shop || shop.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No shop items</p>';
            return;
        }
        container.innerHTML = shop.map((item, i) => {
            const role = item.role_id ? roles.find(r => r.id === item.role_id) : null;
            return `<div class="channel-item" style="margin-bottom:0.5rem;" data-index="${i}">
                <div class="channel-info"><div>
                    <div class="channel-name">${escapeHtml(item.name)} - ${item.price} coins</div>
                    <div class="channel-owner">${escapeHtml(item.description || 'No description')}${role ? ' | Role: ' + escapeHtml(role.name) : ''}</div>
                </div></div>
                <button class="control-btn danger small" onclick="window.cpRemoveShopItem(${i})">Remove</button>
            </div>`;
        }).join('');
    }

    function collectShopItems() {
        const items = [];
        document.querySelectorAll('#eco-shop-items .channel-item').forEach(item => {
            const nameText = item.querySelector('.channel-name')?.textContent || '';
            const descText = item.querySelector('.channel-owner')?.textContent || '';
            const match = nameText.match(/^(.+?) - (\d+) coins$/);
            if (match) {
                const roleMatch = descText.match(/\| Role: (.+)$/);
                const desc = roleMatch ? descText.replace(/ \| Role: .+$/, '') : descText;
                const roleName = roleMatch ? roleMatch[1] : '';
                const role = roleName ? economyRoles.find(r => r.name === roleName) : null;
                items.push({
                    name: match[1],
                    price: parseInt(match[2]),
                    description: desc === 'No description' ? '' : desc,
                    role_id: role ? role.id : ''
                });
            }
        });
        return items;
    }

    window.cpSaveEconomy = async function() {
        const payload = {
            currency_name: document.getElementById('eco-currency-name').value,
            currency_emoji: document.getElementById('eco-currency-emoji').value,
            daily_amount: parseInt(document.getElementById('eco-daily-amount').value) || 100,
            work_min: parseInt(document.getElementById('eco-work-min').value) || 50,
            work_max: parseInt(document.getElementById('eco-work-max').value) || 150,
            work_cooldown: (parseInt(document.getElementById('eco-work-cooldown').value) || 3600) * 1000,
            rob_enabled: document.getElementById('eco-rob-enabled').checked,
            rob_chance: parseInt(document.getElementById('eco-rob-chance').value) || 40,
            rob_fine: parseInt(document.getElementById('eco-rob-fine').value) || 25,
            starting_balance: parseInt(document.getElementById('eco-starting-balance').value) || 0,
            shop: collectShopItems(),
        };
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/economy`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            showToast('Economy config saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    window.cpAddShopItem = function() {
        const name = prompt('Item name:');
        if (!name) return;
        const price = prompt('Item price:');
        if (!price || isNaN(parseInt(price))) return;
        const description = prompt('Item description (optional):') || '';
        const roleInput = prompt('Role ID to grant (optional, leave empty for none):') || '';
        const roleId = roleInput.match(/\d+/)?.[0] || '';
        const shop = collectShopItems();
        shop.push({ name, price: parseInt(price), description, role_id: roleId });
        renderShopItems(shop, economyRoles);
    };

    window.cpRemoveShopItem = function(index) {
        const shop = collectShopItems();
        shop.splice(index, 1);
        renderShopItems(shop, economyRoles);
    };

    // ==================== GAMES ====================
    const GAMES_META = {
        economy:   [
            { id: 'slots',      label: '🎰 Slots' },
            { id: 'blackjack',  label: '🃏 Blackjack' },
            { id: 'roulette',   label: '🎡 Roulette' },
            { id: 'crash',      label: '📈 Crash' },
            { id: 'scratch',    label: '🎟️ Scratch Card' },
            { id: 'coinbet',    label: '🪙 CoinBet' },
            { id: 'highlow',    label: '🃏 High-Low' },
        ],
        pvp: [
            { id: 'tictactoe',  label: '❌⭕ Tic-Tac-Toe' },
            { id: 'connect4',   label: '🟡🔴 Connect 4' },
            { id: 'rps',        label: '✊ Rock Paper Scissors' },
        ],
        knowledge: [
            { id: 'trivia',     label: '🧠 Trivia' },
            { id: 'hangman',    label: '🔤 Hangman' },
            { id: 'wordle',     label: '🟩 Wordle' },
            { id: 'riddle',     label: '🤔 Riddle' },
        ],
        channel: [
            { id: 'scramble',   label: '🔀 Scramble' },
            { id: 'typerace',   label: '⌨️ Type Race' },
            { id: 'mathrace',   label: '🧮 Math Race' },
        ],
        visual: [
            { id: 'minesweeper',label: '💣 Minesweeper' },
            { id: 'memory',     label: '🃏 Memory' },
            { id: 'numguess',   label: '🔢 Number Guess' },
        ],
    };

    let gamesChannels = [];
    let gamesRoles = [];
    let gamesConfig = {};

    async function loadGames() {
        if (!selectedGuild) return;
        try {
            const [cfgRes, chRes, rolesRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/games`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`),
            ]);
            const cfgData = await cfgRes.json();
            const chData = await chRes.json();
            const rolesData = await rolesRes.json();

            gamesConfig = cfgData.config || {};
            gamesChannels = (chData.channels || []).filter(c => c.type === 0 || c.type === 5);
            gamesRoles = rolesData.roles || [];

            // General
            document.getElementById('games-enabled').checked = gamesConfig.enabled !== false;
            document.getElementById('games-min-bet').value = gamesConfig.min_bet ?? 1;
            document.getElementById('games-max-bet').value = gamesConfig.max_bet ?? 10000;
            document.getElementById('games-bet-cooldown').value = gamesConfig.bet_cooldown ?? 0;
            document.getElementById('games-channel-reward').value = gamesConfig.channel_game_reward ?? 50;
            document.getElementById('games-channel-max-reward').value = gamesConfig.channel_game_max_reward ?? 500;

            // Populate channel dropdown
            const chanSel = document.getElementById('games-channel-add');
            chanSel.innerHTML = '<option value="">— Select a channel to add —</option>';
            gamesChannels.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id; opt.textContent = `#${c.name}`;
                chanSel.appendChild(opt);
            });

            // Populate role dropdown
            const roleSel = document.getElementById('games-role-add');
            roleSel.innerHTML = '<option value="">— Select a role to block —</option>';
            gamesRoles.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id; opt.textContent = r.name;
                roleSel.appendChild(opt);
            });

            // Render allowed channels chips
            renderGamesChannels(gamesConfig.allowed_channels || []);
            renderGamesRoles(gamesConfig.blocked_roles || []);

            // Render game toggles
            renderGameToggles('games-toggles-economy', GAMES_META.economy, gamesConfig.games || {});
            renderGameToggles('games-toggles-pvp', GAMES_META.pvp, gamesConfig.games || {});
            renderGameToggles('games-toggles-knowledge', GAMES_META.knowledge, gamesConfig.games || {});
            renderGameToggles('games-toggles-channel', GAMES_META.channel, gamesConfig.games || {});
            renderGameToggles('games-toggles-visual', GAMES_META.visual, gamesConfig.games || {});
        } catch (e) {
            console.error('Failed to load games config:', e);
        }
    }

    function renderGameToggles(containerId, list, gameStates) {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = list.map(g => `
            <div class="settings-row" style="padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                <div class="settings-info" style="padding:0;">
                    <h4 style="font-size:0.85rem;">${escapeHtml(g.label)}</h4>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="game-toggle-${g.id}" ${gameStates[g.id] !== false ? 'checked' : ''} onchange="window.cpSaveGames()">
                    <span class="toggle-slider"></span>
                </label>
            </div>
        `).join('');
    }

    function renderGamesChannels(ids) {
        const el = document.getElementById('games-allowed-channels');
        if (!el) return;
        if (!ids || ids.length === 0) { el.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">All channels (none restricted)</span>'; return; }
        el.innerHTML = ids.map(id => {
            const ch = gamesChannels.find(c => c.id === id);
            const name = ch ? `#${ch.name}` : id;
            return `<span class="tag-pill">${escapeHtml(name)}<button onclick="cpGamesRemoveChannel('${id}')" style="background:none;border:none;color:inherit;cursor:pointer;margin-left:4px;padding:0;">×</button></span>`;
        }).join('');
    }

    function renderGamesRoles(ids) {
        const el = document.getElementById('games-blocked-roles');
        if (!el) return;
        if (!ids || ids.length === 0) { el.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">No blocked roles</span>'; return; }
        el.innerHTML = ids.map(id => {
            const r = gamesRoles.find(r => r.id === id);
            const name = r ? r.name : id;
            return `<span class="tag-pill" style="background:rgba(237,66,69,0.12);border-color:rgba(237,66,69,0.3);color:#ed4245;">${escapeHtml(name)}<button onclick="cpGamesRemoveRole('${id}')" style="background:none;border:none;color:inherit;cursor:pointer;margin-left:4px;padding:0;">×</button></span>`;
        }).join('');
    }

    window.cpGamesAddChannel = function(sel) {
        const id = sel.value;
        if (!id) return;
        sel.value = '';
        if (!gamesConfig.allowed_channels) gamesConfig.allowed_channels = [];
        if (!gamesConfig.allowed_channels.includes(id)) {
            gamesConfig.allowed_channels.push(id);
            renderGamesChannels(gamesConfig.allowed_channels);
            window.cpSaveGames();
        }
    };

    window.cpGamesRemoveChannel = function(id) {
        if (!gamesConfig.allowed_channels) return;
        gamesConfig.allowed_channels = gamesConfig.allowed_channels.filter(c => c !== id);
        renderGamesChannels(gamesConfig.allowed_channels);
        window.cpSaveGames();
    };

    window.cpGamesAddRole = function(sel) {
        const id = sel.value;
        if (!id) return;
        sel.value = '';
        if (!gamesConfig.blocked_roles) gamesConfig.blocked_roles = [];
        if (!gamesConfig.blocked_roles.includes(id)) {
            gamesConfig.blocked_roles.push(id);
            renderGamesRoles(gamesConfig.blocked_roles);
            window.cpSaveGames();
        }
    };

    window.cpGamesRemoveRole = function(id) {
        if (!gamesConfig.blocked_roles) return;
        gamesConfig.blocked_roles = gamesConfig.blocked_roles.filter(r => r !== id);
        renderGamesRoles(gamesConfig.blocked_roles);
        window.cpSaveGames();
    };

    window.cpSaveGames = async function() {
        if (!selectedGuild) return;
        const allGameIds = Object.values(GAMES_META).flat().map(g => g.id);
        const gameToggles = {};
        allGameIds.forEach(id => {
            const el = document.getElementById(`game-toggle-${id}`);
            if (el) gameToggles[id] = el.checked;
        });

        const payload = {
            enabled: document.getElementById('games-enabled').checked,
            allowed_channels: gamesConfig.allowed_channels || [],
            blocked_roles: gamesConfig.blocked_roles || [],
            min_bet: parseInt(document.getElementById('games-min-bet').value) || 1,
            max_bet: parseInt(document.getElementById('games-max-bet').value) || 10000,
            bet_cooldown: parseInt(document.getElementById('games-bet-cooldown').value) || 0,
            channel_game_reward: parseInt(document.getElementById('games-channel-reward').value) || 50,
            channel_game_max_reward: parseInt(document.getElementById('games-channel-max-reward').value) || 500,
            games: gameToggles,
        };

        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/games`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            showToast('Games config saved', 'success');
        } catch (e) {
            showToast('Failed to save games config', 'error');
        }
    };

    // ==================== TICKETS ====================
    let ticketTextChannels = [];
    let ticketRoles = [];
    let ticketCategories = [];
    let ticketPanels = [];
    let panelButtons = [];

    async function loadTickets() {
        if (!selectedGuild) return;
        try {
            const [configRes, channelsRes, rolesRes, catsRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/tickets`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/categories`)
            ]);
            const data = await configRes.json();
            const chData = await channelsRes.json();
            const rolesData = await rolesRes.json();
            const catsData = await catsRes.json();
            const config = data.config || {};
            ticketTextChannels = (chData.channels || []).filter(c => c.type === 0);
            ticketRoles = rolesData.roles || [];
            ticketCategories = catsData.categories || [];

            // Populate support role dropdown
            const roleSelect = document.getElementById('ticket-support-role');
            roleSelect.innerHTML = '<option value="">-- No support role --</option>' +
                ticketRoles.map(r => `<option value="${r.id}" ${r.id === config.support_role ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');

            // Populate transcript channel dropdown
            const chSelect = document.getElementById('ticket-transcript-channel');
            chSelect.innerHTML = '<option value="">-- No transcript channel --</option>' +
                ticketTextChannels.map(c => `<option value="${c.id}" ${c.id === config.transcript_channel ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('');

            // Populate log channel dropdown
            const logSelect = document.getElementById('ticket-log-channel');
            logSelect.innerHTML = '<option value="">-- No log channel --</option>' +
                ticketTextChannels.map(c => `<option value="${c.id}" ${c.id === config.log_channel ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('');

            // Set max per user
            const maxPerUser = document.getElementById('ticket-max-per-user');
            maxPerUser.value = String(config.max_per_user ?? 1);

            // Set ping support
            const pingSupport = document.getElementById('ticket-ping-support');
            pingSupport.value = config.ping_support === true ? 'true' : 'false';

            // Set naming format
            const namingFormat = document.getElementById('ticket-naming-format');
            namingFormat.value = config.naming_format || 'type-ticket-id';

            // Set new ticket settings
            document.getElementById('ticket-auto-close').value = config.auto_close_hours || 0;
            document.getElementById('ticket-close-confirm').checked = config.close_confirm !== false;
            document.getElementById('ticket-user-close').checked = config.user_can_close !== false;
            document.getElementById('ticket-feedback').checked = config.feedback || false;
            document.getElementById('ticket-thread-mode').checked = config.thread_mode || false;

            // Render panels
            ticketPanels = config.panels || [];
            const panelsEl = document.getElementById('panels-list');
            document.getElementById('panel-count').textContent = `${ticketPanels.length} panel${ticketPanels.length !== 1 ? 's' : ''}`;

            if (ticketPanels.length === 0) {
                panelsEl.innerHTML = '<div class="empty-state"><p>No ticket panels created yet. Click "Create Panel" to add one.</p></div>';
            } else {
                panelsEl.innerHTML = ticketPanels.map(p => {
                    const ch = ticketTextChannels.find(c => c.id === p.channel_id);
                    const channelName = ch ? `#${escapeHtml(ch.name)}` : `#${p.channel_id}`;
                    const buttonTags = (p.buttons || []).map(b =>
                        `<span style="display:inline-flex;align-items:center;gap:0.25rem;background:rgba(88,101,242,0.15);color:#a5b4fc;padding:0.15rem 0.5rem;border-radius:4px;font-size:0.8rem;">${b.emoji || ''} ${escapeHtml(b.label)}</span>`
                    ).join(' ');
                    return `
                        <div class="channel-item" style="flex-wrap:wrap;gap:0.5rem;">
                            <div class="channel-info" style="flex:1;min-width:200px;">
                                <div>
                                    <div class="channel-name">${escapeHtml(p.title || 'Ticket Panel')}</div>
                                    <div class="channel-owner">Channel: ${channelName}</div>
                                    <div style="margin-top:0.4rem;display:flex;gap:0.3rem;flex-wrap:wrap;">${buttonTags}</div>
                                </div>
                            </div>
                            <div class="channel-badges" style="display:flex;gap:0.4rem;align-items:center;">
                                <button class="control-btn small" onclick="window.cpEditPanel('${p.message_id}')">Edit</button>
                                <button class="control-btn small" style="background:rgba(237,66,69,0.15);color:#ed4245;border-color:rgba(237,66,69,0.3);" onclick="window.cpDeletePanel('${p.message_id}')">Delete</button>
                            </div>
                        </div>`;
                }).join('');
            }

            // Render open tickets
            const tickets = data.tickets || {};
            const ticketEntries = Object.entries(tickets);
            const ticketsEl = document.getElementById('tickets-list');
            document.getElementById('ticket-count').textContent = `${ticketEntries.length} open`;

            if (ticketEntries.length === 0) {
                ticketsEl.innerHTML = '<div class="empty-state"><p>No open tickets.</p></div>';
            } else {
                ticketsEl.innerHTML = ticketEntries.map(([chId, t]) => {
                    const typeName = (t.type || 'support').charAt(0).toUpperCase() + (t.type || 'support').slice(1).replace(/-/g, ' ');
                    const claimedBadge = t.claimed_by
                        ? `<span style="background:rgba(87,242,135,0.15);color:#57f287;padding:0.15rem 0.5rem;border-radius:4px;font-size:0.75rem;font-weight:600;">Claimed</span>`
                        : `<span style="background:rgba(250,166,26,0.15);color:#faa61a;padding:0.15rem 0.5rem;border-radius:4px;font-size:0.75rem;font-weight:600;">Unclaimed</span>`;
                    const claimedInfo = t.claimed_by ? ` | Claimed by: ${t.claimed_by}` : '';
                    return `
                        <div class="channel-item" style="flex-wrap:wrap;gap:0.5rem;">
                            <div class="channel-info" style="flex:1;min-width:200px;">
                                <div>
                                    <div class="channel-name">${escapeHtml(typeName)} Ticket #${t.id}</div>
                                    <div class="channel-owner">Creator: ${t.creator_id}${claimedInfo}</div>
                                </div>
                            </div>
                            <div class="channel-badges" style="display:flex;gap:0.4rem;align-items:center;">
                                ${claimedBadge}
                                <span class="channel-badge" style="background:rgba(88,101,242,0.15);color:#a5b4fc;">${new Date(t.created_at * 1000).toLocaleDateString()}</span>
                            </div>
                        </div>`;
                }).join('');
            }
        } catch (e) {
            console.error('Failed to load tickets:', e);
        }
    }

    window.cpSaveTickets = async function() {
        const payload = {
            support_role: document.getElementById('ticket-support-role').value || null,
            transcript_channel: document.getElementById('ticket-transcript-channel').value || null,
            log_channel: document.getElementById('ticket-log-channel').value || null,
            max_per_user: parseInt(document.getElementById('ticket-max-per-user').value) || 1,
            ping_support: document.getElementById('ticket-ping-support').value === 'true',
            naming_format: document.getElementById('ticket-naming-format').value || 'type-ticket-id',
            auto_close_hours: parseInt(document.getElementById('ticket-auto-close').value) || 0,
            close_confirm: document.getElementById('ticket-close-confirm').checked,
            user_can_close: document.getElementById('ticket-user-close').checked,
            feedback: document.getElementById('ticket-feedback').checked,
            thread_mode: document.getElementById('ticket-thread-mode').checked,
        };
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/tickets`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            showToast('Ticket settings saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    // --- Panel Modal ---
    window.cpShowCreatePanelModal = async function() {
        if (!selectedGuild) { showToast('No server selected', 'error'); return; }

        // Fetch channels if not loaded yet
        if (ticketTextChannels.length === 0) {
            try {
                const chRes = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`);
                const chData = await chRes.json();
                ticketTextChannels = (chData.channels || []).filter(c => c.type === 0);
            } catch (e) { console.error('Failed to fetch channels:', e); }
        }

        // Populate channel dropdown
        const chSelect = document.getElementById('panel-channel');
        chSelect.innerHTML = '<option value="">-- Select a channel --</option>' +
            ticketTextChannels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
        // Reset form
        document.getElementById('panel-title').value = 'Support Tickets';
        document.getElementById('panel-description').value = 'Click a button below to create a ticket.';
        document.getElementById('panel-embed-color').value = '#5865F2';
        document.getElementById('panel-embed-image').value = '';
        document.getElementById('panel-embed-thumbnail').value = '';
        document.getElementById('panel-embed-footer').value = 'CUB PROTECTOR Tickets';
        panelButtons = [{ type_id: 'support', label: 'Create Ticket', emoji: '\uD83C\uDFAB', style: 'Primary' }];
        renderPanelButtons();
        document.getElementById('createPanelModal').style.display = '';
    };

    window.cpCloseCreatePanelModal = function() {
        document.getElementById('createPanelModal').style.display = 'none';
    };

    function renderPanelButtons() {
        const el = document.getElementById('panel-buttons-list');
        const addBtn = document.getElementById('add-panel-btn-btn');
        if (addBtn) addBtn.style.display = panelButtons.length >= 5 ? 'none' : '';

        const catOptions = '<option value="">-- No category (default) --</option>' +
            ticketCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

        el.innerHTML = panelButtons.map((btn, i) => `
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:0.75rem;margin-bottom:0.5rem;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
                    <span style="font-weight:600;font-size:0.85rem;">Button ${i + 1}</span>
                    ${panelButtons.length > 1 ? `<button class="control-btn small" style="background:rgba(237,66,69,0.15);color:#ed4245;border-color:rgba(237,66,69,0.3);padding:0.15rem 0.4rem;font-size:0.75rem;" onclick="window.cpRemovePanelButton(${i})">Remove</button>` : ''}
                </div>
                <div class="form-row" style="gap:0.5rem;">
                    <div class="form-group" style="flex:2;">
                        <label style="font-size:0.8rem;">Label</label>
                        <input type="text" value="${escapeHtml(btn.label)}" onchange="window.cpUpdatePanelButton(${i},'label',this.value)" placeholder="Button text">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label style="font-size:0.8rem;">Emoji</label>
                        <input type="text" value="${btn.emoji || ''}" onchange="window.cpUpdatePanelButton(${i},'emoji',this.value)" placeholder="\uD83C\uDFAB" style="text-align:center;">
                    </div>
                </div>
                <div class="form-row" style="gap:0.5rem;">
                    <div class="form-group" style="flex:2;">
                        <label style="font-size:0.8rem;">Type ID</label>
                        <input type="text" value="${escapeHtml(btn.type_id)}" onchange="window.cpUpdatePanelButton(${i},'type_id',this.value)" placeholder="support">
                        <small style="color:var(--text-muted);font-size:0.7rem;">Unique name for this ticket type (lowercase, no spaces)</small>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label style="font-size:0.8rem;">Color</label>
                        <select class="form-select" onchange="window.cpUpdatePanelButton(${i},'style',this.value)">
                            <option value="Primary" ${btn.style === 'Primary' ? 'selected' : ''}>Blue</option>
                            <option value="Success" ${btn.style === 'Success' ? 'selected' : ''}>Green</option>
                            <option value="Danger" ${btn.style === 'Danger' ? 'selected' : ''}>Red</option>
                            <option value="Secondary" ${btn.style === 'Secondary' ? 'selected' : ''}>Gray</option>
                        </select>
                    </div>
                </div>
                <div class="form-row" style="gap:0.5rem;margin-top:0.25rem;">
                    <div class="form-group" style="flex:1;">
                        <label style="font-size:0.8rem;">Open Category</label>
                        <select class="form-select" onchange="window.cpUpdatePanelButton(${i},'category_id',this.value)">
                            ${catOptions}
                        </select>
                        <small style="color:var(--text-muted);font-size:0.7rem;">Where new tickets are created</small>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label style="font-size:0.8rem;">Closed Category</label>
                        <select class="form-select" onchange="window.cpUpdatePanelButton(${i},'closed_category_id',this.value)">
                            ${catOptions}
                        </select>
                        <small style="color:var(--text-muted);font-size:0.7rem;">Tickets move here when closed</small>
                    </div>
                </div>
                <div class="form-group" style="margin-top:0.25rem;">
                    <label style="font-size:0.8rem;">Welcome Message <span style="color:var(--text-muted);font-weight:400;">(optional)</span></label>
                    <textarea class="form-textarea" rows="2" onchange="window.cpUpdatePanelButton(${i},'welcome_message',this.value)" placeholder="Custom welcome message for this ticket type">${escapeHtml(btn.welcome_message || '')}</textarea>
                    <small style="color:var(--text-muted);font-size:0.7rem;">Shown when a ticket of this type is opened</small>
                </div>
                <div class="form-group" style="margin-top:0.25rem;">
                    <label style="font-size:0.8rem;">Close Message <span style="color:var(--text-muted);font-weight:400;">(optional)</span></label>
                    <textarea class="form-textarea" rows="2" onchange="window.cpUpdatePanelButton(${i},'close_message',this.value)" placeholder="Custom message shown when this ticket type is closed">${escapeHtml(btn.close_message || '')}</textarea>
                    <small style="color:var(--text-muted);font-size:0.7rem;">Shown in the closed ticket embed</small>
                </div>
            </div>
        `).join('');

        // Fix selected state for category/closed category dropdowns
        panelButtons.forEach((btn, i) => {
            const btnEl = el.children[i];
            if (!btnEl) return;
            const selects = btnEl.querySelectorAll('select');
            // selects: [0]=color, [1]=category, [2]=closed category
            if (btn.category_id && selects[1]) selects[1].value = btn.category_id;
            if (btn.closed_category_id && selects[2]) selects[2].value = btn.closed_category_id;
        });
    }

    window.cpAddPanelButton = function() {
        if (panelButtons.length >= 5) return;
        panelButtons.push({ type_id: '', label: 'New Ticket', emoji: '', style: 'Primary' });
        renderPanelButtons();
    };

    window.cpRemovePanelButton = function(index) {
        panelButtons.splice(index, 1);
        renderPanelButtons();
    };

    window.cpUpdatePanelButton = function(index, field, value) {
        panelButtons[index][field] = value;
    };

    window.cpCreatePanel = async function() {
        if (!selectedGuild) return;
        const channelId = document.getElementById('panel-channel').value;
        if (!channelId) { showToast('Select a channel', 'error'); return; }

        // Validate buttons
        for (let i = 0; i < panelButtons.length; i++) {
            if (!panelButtons[i].label.trim()) { showToast(`Button ${i + 1} needs a label`, 'error'); return; }
            if (!panelButtons[i].type_id.trim()) { showToast(`Button ${i + 1} needs a type ID`, 'error'); return; }
        }

        // Check for duplicate type_ids
        const typeIds = panelButtons.map(b => b.type_id.toLowerCase().replace(/[^a-z0-9-]/g, ''));
        if (new Set(typeIds).size !== typeIds.length) { showToast('Each button must have a unique type ID', 'error'); return; }

        const payload = {
            channel_id: channelId,
            title: document.getElementById('panel-title').value || 'Support Tickets',
            description: document.getElementById('panel-description').value || 'Click a button below to create a ticket.',
            embed_color: document.getElementById('panel-embed-color').value || '#5865F2',
            embed_image: document.getElementById('panel-embed-image').value.trim() || null,
            embed_thumbnail: document.getElementById('panel-embed-thumbnail').value.trim() || null,
            embed_footer: document.getElementById('panel-embed-footer').value || 'CUB PROTECTOR Tickets',
            buttons: panelButtons.map(b => ({
                type_id: b.type_id.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                label: b.label,
                emoji: b.emoji,
                style: b.style,
                category_id: b.category_id || '',
                closed_category_id: b.closed_category_id || '',
                welcome_message: b.welcome_message || '',
                close_message: b.close_message || '',
            })),
        };

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/tickets/panels`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast('Ticket panel created!', 'success');
                window.cpCloseCreatePanelModal();
                loadTickets();
            } else {
                showToast(data.error || 'Failed to create panel', 'error');
            }
        } catch (e) { showToast('Failed to create panel', 'error'); }
    };

    window.cpDeletePanel = async function(messageId) {
        if (!confirm('Delete this ticket panel? The message will be removed from Discord.')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/tickets/panels/${messageId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                showToast('Panel deleted', 'success');
                loadTickets();
            } else {
                showToast(data.error || 'Failed to delete panel', 'error');
            }
        } catch (e) { showToast('Failed to delete panel', 'error'); }
    };

    // --- Edit Panel ---
    let editingPanelId = null;

    window.cpEditPanel = function(messageId) {
        const panel = ticketPanels.find(p => p.message_id === messageId);
        if (!panel) return;
        editingPanelId = messageId;

        document.getElementById('edit-panel-title').value = panel.title || 'Support Tickets';
        document.getElementById('edit-panel-description').value = panel.description || '';
        document.getElementById('edit-panel-embed-color').value = panel.embed_color || '#5865F2';
        document.getElementById('edit-panel-embed-image').value = panel.embed_image || '';
        document.getElementById('edit-panel-embed-thumbnail').value = panel.embed_thumbnail || '';
        document.getElementById('edit-panel-embed-footer').value = panel.embed_footer || 'CUB PROTECTOR Tickets';

        const ch = ticketTextChannels.find(c => c.id === panel.channel_id);
        document.getElementById('edit-panel-channel-display').textContent = ch ? `#${ch.name}` : `#${panel.channel_id}`;

        panelButtons = (panel.buttons || []).map(b => ({ ...b }));
        renderEditPanelButtons();
        document.getElementById('editPanelModal').style.display = '';
    };

    window.cpCloseEditPanelModal = function() {
        document.getElementById('editPanelModal').style.display = 'none';
        editingPanelId = null;
    };

    function renderEditPanelButtons() {
        const el = document.getElementById('edit-panel-buttons-list');
        const addBtn = document.getElementById('edit-add-panel-btn-btn');
        if (addBtn) addBtn.style.display = panelButtons.length >= 5 ? 'none' : '';

        const catOptions = '<option value="">-- No category (default) --</option>' +
            ticketCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

        el.innerHTML = panelButtons.map((btn, i) => `
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:0.75rem;margin-bottom:0.5rem;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
                    <span style="font-weight:600;font-size:0.85rem;">Button ${i + 1}</span>
                    ${panelButtons.length > 1 ? `<button class="control-btn small" style="background:rgba(237,66,69,0.15);color:#ed4245;border-color:rgba(237,66,69,0.3);padding:0.15rem 0.4rem;font-size:0.75rem;" onclick="window.cpRemoveEditPanelButton(${i})">Remove</button>` : ''}
                </div>
                <div class="form-row" style="gap:0.5rem;">
                    <div class="form-group" style="flex:2;">
                        <label style="font-size:0.8rem;">Label</label>
                        <input type="text" value="${escapeHtml(btn.label)}" onchange="window.cpUpdatePanelButton(${i},'label',this.value)" placeholder="Button text">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label style="font-size:0.8rem;">Emoji</label>
                        <input type="text" value="${btn.emoji || ''}" onchange="window.cpUpdatePanelButton(${i},'emoji',this.value)" placeholder="\uD83C\uDFAB" style="text-align:center;">
                    </div>
                </div>
                <div class="form-row" style="gap:0.5rem;">
                    <div class="form-group" style="flex:2;">
                        <label style="font-size:0.8rem;">Type ID</label>
                        <input type="text" value="${escapeHtml(btn.type_id)}" onchange="window.cpUpdatePanelButton(${i},'type_id',this.value)" placeholder="support">
                        <small style="color:var(--text-muted);font-size:0.7rem;">Unique name for this ticket type (lowercase, no spaces)</small>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label style="font-size:0.8rem;">Color</label>
                        <select class="form-select" onchange="window.cpUpdatePanelButton(${i},'style',this.value)">
                            <option value="Primary" ${btn.style === 'Primary' ? 'selected' : ''}>Blue</option>
                            <option value="Success" ${btn.style === 'Success' ? 'selected' : ''}>Green</option>
                            <option value="Danger" ${btn.style === 'Danger' ? 'selected' : ''}>Red</option>
                            <option value="Secondary" ${btn.style === 'Secondary' ? 'selected' : ''}>Gray</option>
                        </select>
                    </div>
                </div>
                <div class="form-row" style="gap:0.5rem;margin-top:0.25rem;">
                    <div class="form-group" style="flex:1;">
                        <label style="font-size:0.8rem;">Open Category</label>
                        <select class="form-select" onchange="window.cpUpdatePanelButton(${i},'category_id',this.value)">
                            ${catOptions}
                        </select>
                        <small style="color:var(--text-muted);font-size:0.7rem;">Where new tickets are created</small>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label style="font-size:0.8rem;">Closed Category</label>
                        <select class="form-select" onchange="window.cpUpdatePanelButton(${i},'closed_category_id',this.value)">
                            ${catOptions}
                        </select>
                        <small style="color:var(--text-muted);font-size:0.7rem;">Tickets move here when closed</small>
                    </div>
                </div>
                <div class="form-group" style="margin-top:0.25rem;">
                    <label style="font-size:0.8rem;">Welcome Message <span style="color:var(--text-muted);font-weight:400;">(optional)</span></label>
                    <textarea class="form-textarea" rows="2" onchange="window.cpUpdatePanelButton(${i},'welcome_message',this.value)" placeholder="Custom welcome message for this ticket type">${escapeHtml(btn.welcome_message || '')}</textarea>
                    <small style="color:var(--text-muted);font-size:0.7rem;">Shown when a ticket of this type is opened</small>
                </div>
                <div class="form-group" style="margin-top:0.25rem;">
                    <label style="font-size:0.8rem;">Close Message <span style="color:var(--text-muted);font-weight:400;">(optional)</span></label>
                    <textarea class="form-textarea" rows="2" onchange="window.cpUpdatePanelButton(${i},'close_message',this.value)" placeholder="Custom message shown when this ticket type is closed">${escapeHtml(btn.close_message || '')}</textarea>
                    <small style="color:var(--text-muted);font-size:0.7rem;">Shown in the closed ticket embed</small>
                </div>
            </div>
        `).join('');

        // Fix selected state for category/closed category dropdowns
        panelButtons.forEach((btn, i) => {
            const btnEl = el.children[i];
            if (!btnEl) return;
            const selects = btnEl.querySelectorAll('select');
            // selects: [0]=color, [1]=category, [2]=closed category
            if (btn.category_id && selects[1]) selects[1].value = btn.category_id;
            if (btn.closed_category_id && selects[2]) selects[2].value = btn.closed_category_id;
        });
    }

    window.cpAddEditPanelButton = function() {
        if (panelButtons.length >= 5) return;
        panelButtons.push({ type_id: '', label: 'New Ticket', emoji: '', style: 'Primary' });
        renderEditPanelButtons();
    };

    window.cpRemoveEditPanelButton = function(index) {
        panelButtons.splice(index, 1);
        renderEditPanelButtons();
    };

    window.cpSavePanelEdit = async function() {
        if (!selectedGuild || !editingPanelId) return;

        for (let i = 0; i < panelButtons.length; i++) {
            if (!panelButtons[i].label.trim()) { showToast(`Button ${i + 1} needs a label`, 'error'); return; }
            if (!panelButtons[i].type_id.trim()) { showToast(`Button ${i + 1} needs a type ID`, 'error'); return; }
        }

        const typeIds = panelButtons.map(b => b.type_id.toLowerCase().replace(/[^a-z0-9-]/g, ''));
        if (new Set(typeIds).size !== typeIds.length) { showToast('Each button must have a unique type ID', 'error'); return; }

        const payload = {
            title: document.getElementById('edit-panel-title').value || 'Support Tickets',
            description: document.getElementById('edit-panel-description').value || 'Click a button below to create a ticket.',
            embed_color: document.getElementById('edit-panel-embed-color').value || '#5865F2',
            embed_image: document.getElementById('edit-panel-embed-image').value.trim() || null,
            embed_thumbnail: document.getElementById('edit-panel-embed-thumbnail').value.trim() || null,
            embed_footer: document.getElementById('edit-panel-embed-footer').value || 'CUB PROTECTOR Tickets',
            buttons: panelButtons.map(b => ({
                type_id: b.type_id.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                label: b.label,
                emoji: b.emoji,
                style: b.style,
                category_id: b.category_id || '',
                closed_category_id: b.closed_category_id || '',
                welcome_message: b.welcome_message || '',
                close_message: b.close_message || '',
            })),
        };

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/tickets/panels/${editingPanelId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast('Panel updated!', 'success');
                window.cpCloseEditPanelModal();
                loadTickets();
            } else {
                showToast(data.error || 'Failed to update panel', 'error');
            }
        } catch (e) { showToast('Failed to update panel', 'error'); }
    };

    // ==================== GIVEAWAYS ====================
    let giveawayTextChannels = [];
    let giveawayRoles = [];

    async function loadGiveaways() {
        if (!selectedGuild) return;
        try {
            const [giveawaysRes, channelsRes, rolesRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/giveaways`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`)
            ]);
            const data = await giveawaysRes.json();
            const chData = await channelsRes.json();
            const rolesData = await rolesRes.json();
            giveawayTextChannels = (chData.channels || []).filter(c => c.type === 0);
            giveawayRoles = rolesData.roles || [];

            // Populate giveaway global settings
            const settings = data.settings || {};
            document.getElementById('giveaway-settings-dm-winners').checked = settings.dm_winners || false;
            document.getElementById('giveaway-settings-end-message').value = settings.end_message || '';

            const giveaways = data.giveaways || [];
            const active = giveaways.filter(g => !g.ended);
            const ended = giveaways.filter(g => g.ended);

            document.getElementById('giveaway-active-count').textContent = `${active.length} active`;
            document.getElementById('giveaway-ended-count').textContent = `${ended.length} ended`;

            const listEl = document.getElementById('giveaways-list');
            if (giveaways.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><p>No giveaways yet. Click "Create Giveaway" or use <code style="background:rgba(88,101,242,0.15);color:#a5b4fc;padding:0.15rem 0.4rem;border-radius:4px;font-family:\'JetBrains Mono\',monospace;font-size:0.82rem;">/giveaway start</code> in your server.</p></div>';
                return;
            }

            // Show active first, then ended
            const sorted = [...active, ...ended];
            listEl.innerHTML = sorted.map(g => {
                const ch = giveawayTextChannels.find(c => c.id === g.channel_id);
                const channelName = ch ? `#${escapeHtml(ch.name)}` : `#${g.channel_id}`;
                const isActive = !g.ended;
                const endsDate = new Date(g.ends_at);
                const now = Date.now();
                const timeLeft = g.ends_at - now;

                let timeStr;
                if (!isActive) {
                    timeStr = 'Ended';
                } else if (timeLeft <= 0) {
                    timeStr = 'Ending...';
                } else if (timeLeft > 86400000) {
                    timeStr = `${Math.ceil(timeLeft / 86400000)}d left`;
                } else if (timeLeft > 3600000) {
                    timeStr = `${Math.ceil(timeLeft / 3600000)}h left`;
                } else {
                    timeStr = `${Math.ceil(timeLeft / 60000)}m left`;
                }

                const statusBadge = isActive
                    ? `<span style="background:rgba(87,242,135,0.15);color:#57f287;padding:0.15rem 0.5rem;border-radius:4px;font-size:0.75rem;font-weight:600;">Active</span>`
                    : `<span style="background:rgba(255,255,255,0.06);color:var(--text-muted);padding:0.15rem 0.5rem;border-radius:4px;font-size:0.75rem;font-weight:600;">Ended</span>`;

                const actions = isActive
                    ? `<button class="control-btn small" style="padding:0.15rem 0.5rem;font-size:0.75rem;" onclick="window.cpEditGiveaway('${g.message_id}')">Edit</button>
                       <button class="control-btn small" style="background:rgba(237,66,69,0.15);color:#ed4245;border-color:rgba(237,66,69,0.3);padding:0.15rem 0.5rem;font-size:0.75rem;" onclick="window.cpEndGiveaway('${g.message_id}')">End Now</button>`
                    : `<button class="control-btn small" style="padding:0.15rem 0.5rem;font-size:0.75rem;" onclick="window.cpRerollGiveaway('${g.message_id}')">Reroll</button>
                       <button class="control-btn small" style="background:rgba(237,66,69,0.15);color:#ed4245;border-color:rgba(237,66,69,0.3);padding:0.15rem 0.5rem;font-size:0.75rem;" onclick="window.cpDeleteGiveaway('${g.message_id}')">Delete</button>`;

                const reqRole = g.required_role ? ` | Role required` : '';
                const winnersInfo = g.winner_ids && g.winner_ids.length > 0 ? ` | Winners: ${g.winner_ids.length}` : '';

                return `
                    <div class="channel-item" style="flex-wrap:wrap;gap:0.5rem;">
                        <div class="channel-info" style="flex:1;min-width:200px;">
                            <div>
                                <div class="channel-name" style="color:${isActive ? '#57f287' : 'var(--text-muted)'};">${escapeHtml(g.prize)}</div>
                                <div class="channel-owner">${channelName} | ${g.entries?.length || 0} entries | ${g.winners} winner${g.winners !== 1 ? 's' : ''} | ${timeStr}${reqRole}${winnersInfo}</div>
                            </div>
                        </div>
                        <div class="channel-badges" style="display:flex;gap:0.4rem;align-items:center;">
                            ${statusBadge}
                            ${actions}
                        </div>
                    </div>`;
            }).join('');
        } catch (e) {
            console.error('Failed to load giveaways:', e);
            document.getElementById('giveaways-list').innerHTML = '<div class="empty-state"><p>Failed to load giveaways.</p></div>';
        }
    }

    // Save giveaway global settings
    window.cpSaveGiveawaySettings = async function() {
        if (!selectedGuild) return;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/giveaways/settings`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dm_winners: document.getElementById('giveaway-settings-dm-winners').checked,
                    end_message: document.getElementById('giveaway-settings-end-message').value.trim() || '',
                })
            });
            showToast('Giveaway settings saved', 'success');
        } catch (e) { showToast('Failed to save giveaway settings', 'error'); }
    };

    // Auto-save giveaway settings on change
    ['giveaway-settings-dm-winners', 'giveaway-settings-end-message'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => window.cpSaveGiveawaySettings());
    });

    // --- Giveaway Modal ---
    window.cpShowCreateGiveawayModal = async function() {
        if (!selectedGuild) { showToast('No server selected', 'error'); return; }

        // Fetch channels and roles if not loaded yet
        if (giveawayTextChannels.length === 0 || giveawayRoles.length === 0) {
            try {
                const [chRes, rolesRes] = await Promise.all([
                    fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
                    fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`)
                ]);
                const chData = await chRes.json();
                const rolesData = await rolesRes.json();
                giveawayTextChannels = (chData.channels || []).filter(c => c.type === 0);
                giveawayRoles = rolesData.roles || [];
            } catch (e) { console.error('Failed to fetch channels/roles:', e); }
        }

        // Populate channel dropdown
        const chSelect = document.getElementById('giveaway-channel');
        chSelect.innerHTML = '<option value="">-- Select a channel --</option>' +
            giveawayTextChannels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
        // Populate role dropdown
        const roleSelect = document.getElementById('giveaway-required-role');
        roleSelect.innerHTML = '<option value="">-- No requirement --</option>' +
            giveawayRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
        // Reset form
        document.getElementById('giveaway-prize').value = '';
        document.getElementById('giveaway-duration').value = '1d';
        document.getElementById('giveaway-winners').value = '1';
        document.getElementById('giveaway-embed-title').value = '';
        document.getElementById('giveaway-embed-description').value = '';
        document.getElementById('giveaway-embed-color').value = '#57f287';
        document.getElementById('giveaway-embed-image').value = '';
        document.getElementById('giveaway-embed-thumbnail').value = '';
        document.getElementById('giveaway-embed-footer').value = '';
        document.getElementById('giveaway-button-label').value = '';

        // Populate advanced options
        const blacklistSelect = document.getElementById('giveaway-blacklisted-roles');
        blacklistSelect.innerHTML = giveawayRoles.map(r => `<label class="multi-check-item"><input type="checkbox" value="${r.id}"><span>@${escapeHtml(r.name)}</span></label>`).join('');

        const bonusSelect = document.getElementById('giveaway-bonus-role');
        bonusSelect.innerHTML = '<option value="">-- No bonus entries --</option>' +
            giveawayRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');

        // Populate ping role with server roles
        const pingSelect = document.getElementById('giveaway-ping-role');
        pingSelect.innerHTML = '<option value="">-- No ping --</option><option value="@everyone">@everyone</option><option value="@here">@here</option>' +
            giveawayRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');

        document.getElementById('giveaway-bonus-entries').value = '2';
        document.getElementById('giveaway-max-entries').value = '0';
        document.getElementById('giveaway-dm-winners').value = 'false';
        document.getElementById('giveaway-winner-message').value = '';
        document.getElementById('giveaway-allow-multiple').checked = false;

        updateGiveawayPreview();
        document.getElementById('createGiveawayModal').style.display = '';
    };

    window.cpCloseCreateGiveawayModal = function() {
        document.getElementById('createGiveawayModal').style.display = 'none';
    };

    function updateGiveawayPreview() {
        const prize = document.getElementById('giveaway-prize').value || 'Your Prize Here';
        const title = document.getElementById('giveaway-embed-title').value || '\uD83C\uDF89 GIVEAWAY';
        const desc = document.getElementById('giveaway-embed-description').value;
        const color = document.getElementById('giveaway-embed-color').value || '#57f287';
        const image = document.getElementById('giveaway-embed-image').value;
        const thumbnail = document.getElementById('giveaway-embed-thumbnail').value;
        const footer = document.getElementById('giveaway-embed-footer').value;
        const winners = document.getElementById('giveaway-winners').value || '1';
        const duration = document.getElementById('giveaway-duration').value || '1d';

        const previewEl = document.getElementById('giveaway-embed-preview');
        previewEl.style.borderLeftColor = color;

        let html = `<div style="font-weight:700;font-size:0.95rem;margin-bottom:0.5rem;">${escapeHtml(title)}</div>`;

        // Description
        let descText = desc ? escapeHtml(desc) + '\n\n' : '';
        descText += `<strong>${escapeHtml(prize)}</strong>\n\nClick the button below to enter!\n\n<strong>Winners:</strong> ${escapeHtml(winners)}\n<strong>Ends:</strong> in ${escapeHtml(duration)}`;

        html += `<div style="font-size:0.85rem;color:var(--text-secondary);white-space:pre-line;line-height:1.5;">${descText}</div>`;

        if (thumbnail) {
            html = `<div style="display:flex;gap:1rem;"><div style="flex:1;">${html}</div><img src="${escapeHtml(thumbnail)}" style="width:64px;height:64px;border-radius:4px;object-fit:cover;" onerror="this.style.display='none'"></div>`;
        }

        if (image) {
            html += `<img src="${escapeHtml(image)}" style="max-width:100%;border-radius:4px;margin-top:0.75rem;" onerror="this.style.display='none'">`;
        }

        if (footer) {
            html += `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.75rem;border-top:1px solid rgba(255,255,255,0.06);padding-top:0.5rem;">${escapeHtml(footer)}</div>`;
        }

        previewEl.innerHTML = html;
    }

    // Live preview updates
    ['giveaway-prize', 'giveaway-embed-title', 'giveaway-embed-description', 'giveaway-embed-color',
     'giveaway-embed-image', 'giveaway-embed-thumbnail', 'giveaway-embed-footer', 'giveaway-winners', 'giveaway-duration'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateGiveawayPreview);
            el.addEventListener('change', updateGiveawayPreview);
        }
    });

    window.cpCreateGiveaway = async function() {
        if (!selectedGuild) return;
        const prize = document.getElementById('giveaway-prize').value.trim();
        const channelId = document.getElementById('giveaway-channel').value;
        const duration = document.getElementById('giveaway-duration').value;
        const winners = parseInt(document.getElementById('giveaway-winners').value) || 1;
        const requiredRole = document.getElementById('giveaway-required-role').value || null;

        // Embed customization
        const embedTitle = document.getElementById('giveaway-embed-title').value.trim() || null;
        const embedDescription = document.getElementById('giveaway-embed-description').value.trim() || null;
        const embedColor = document.getElementById('giveaway-embed-color').value || '#57f287';
        const embedImage = document.getElementById('giveaway-embed-image').value.trim() || null;
        const embedThumbnail = document.getElementById('giveaway-embed-thumbnail').value.trim() || null;
        const embedFooter = document.getElementById('giveaway-embed-footer').value.trim() || null;
        const buttonLabel = document.getElementById('giveaway-button-label').value.trim() || null;

        if (!prize) { showToast('Enter a prize', 'error'); return; }
        if (!channelId) { showToast('Select a channel', 'error'); return; }

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/giveaways`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prize, channel_id: channelId, duration, winners, required_role: requiredRole,
                    embed_title: embedTitle, embed_description: embedDescription,
                    embed_color: embedColor, embed_image: embedImage,
                    embed_thumbnail: embedThumbnail, embed_footer: embedFooter,
                    button_label: buttonLabel,
                    blacklisted_roles: getMultiSelectValues('giveaway-blacklisted-roles'),
                    bonus_role: document.getElementById('giveaway-bonus-role').value || null,
                    bonus_entries: parseInt(document.getElementById('giveaway-bonus-entries').value) || 2,
                    max_entries: parseInt(document.getElementById('giveaway-max-entries').value) || 0,
                    ping_role: document.getElementById('giveaway-ping-role').value || null,
                    dm_winners: document.getElementById('giveaway-dm-winners').value === 'true',
                    winner_message: document.getElementById('giveaway-winner-message').value.trim() || null,
                    allow_multiple: document.getElementById('giveaway-allow-multiple').checked,
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Giveaway started!', 'success');
                window.cpCloseCreateGiveawayModal();
                loadGiveaways();
            } else {
                showToast(data.error || 'Failed to create giveaway', 'error');
            }
        } catch (e) { showToast('Failed to create giveaway', 'error'); }
    };

    window.cpEndGiveaway = async function(messageId) {
        if (!confirm('End this giveaway early?')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/giveaways/${messageId}/end`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                showToast('Giveaway ended!', 'success');
                loadGiveaways();
            } else {
                showToast(data.error || 'Failed to end giveaway', 'error');
            }
        } catch (e) { showToast('Failed to end giveaway', 'error'); }
    };

    window.cpRerollGiveaway = async function(messageId) {
        if (!confirm('Reroll this giveaway?')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/giveaways/${messageId}/reroll`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                showToast('Giveaway rerolled!', 'success');
            } else {
                showToast(data.error || 'Failed to reroll', 'error');
            }
        } catch (e) { showToast('Failed to reroll', 'error'); }
    };

    // --- Delete Giveaway ---
    window.cpDeleteGiveaway = async function(messageId) {
        if (!confirm('Delete this giveaway? The message will be removed from Discord.')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/giveaways/${messageId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                showToast('Giveaway deleted', 'success');
                loadGiveaways();
            } else {
                showToast(data.error || 'Failed to delete giveaway', 'error');
            }
        } catch (e) { showToast('Failed to delete giveaway', 'error'); }
    };

    // --- Edit Giveaway ---
    let editingGiveawayId = null;
    let editingGiveawayData = null;

    window.cpEditGiveaway = async function(messageId) {
        if (!selectedGuild) return;

        // Fetch latest giveaway data
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/giveaways`);
            const data = await res.json();
            const giveaway = (data.giveaways || []).find(g => g.message_id === messageId && !g.ended);
            if (!giveaway) { showToast('Active giveaway not found', 'error'); return; }

            editingGiveawayId = messageId;
            editingGiveawayData = giveaway;

            // Populate form
            document.getElementById('edit-giveaway-prize').value = giveaway.prize || '';
            const ch = giveawayTextChannels.find(c => c.id === giveaway.channel_id);
            document.getElementById('edit-giveaway-channel-display').textContent = ch ? `#${ch.name}` : `#${giveaway.channel_id}`;
            document.getElementById('edit-giveaway-duration').value = '';
            document.getElementById('edit-giveaway-winners').value = String(giveaway.winners || 1);
            document.getElementById('edit-giveaway-button-label').value = giveaway.button_label || '';

            // Populate roles
            const roleSelect = document.getElementById('edit-giveaway-required-role');
            roleSelect.innerHTML = '<option value="">-- No requirement --</option>' +
                giveawayRoles.map(r => `<option value="${r.id}" ${r.id === giveaway.required_role ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');

            // Populate embed fields
            document.getElementById('edit-giveaway-embed-title').value = giveaway.embed_title || '';
            document.getElementById('edit-giveaway-embed-description').value = giveaway.embed_description || '';
            document.getElementById('edit-giveaway-embed-color').value = giveaway.embed_color || '#57f287';
            document.getElementById('edit-giveaway-embed-image').value = giveaway.embed_image || '';
            document.getElementById('edit-giveaway-embed-thumbnail').value = giveaway.embed_thumbnail || '';
            document.getElementById('edit-giveaway-embed-footer').value = giveaway.embed_footer || '';

            // Populate advanced options
            const blacklistSelect = document.getElementById('edit-giveaway-blacklisted-roles');
            const blRoles = giveaway.blacklisted_roles || [];
            blacklistSelect.innerHTML = giveawayRoles.map(r => `<label class="multi-check-item"><input type="checkbox" value="${r.id}" ${blRoles.includes(r.id) ? 'checked' : ''}><span>@${escapeHtml(r.name)}</span></label>`).join('');

            const bonusSelect = document.getElementById('edit-giveaway-bonus-role');
            bonusSelect.innerHTML = '<option value="">-- No bonus entries --</option>' +
                giveawayRoles.map(r => `<option value="${r.id}" ${r.id === giveaway.bonus_role ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');

            document.getElementById('edit-giveaway-bonus-entries').value = String(giveaway.bonus_entries || 2);
            document.getElementById('edit-giveaway-max-entries').value = String(giveaway.max_entries || 0);
            document.getElementById('edit-giveaway-dm-winners').value = giveaway.dm_winners ? 'true' : 'false';
            document.getElementById('edit-giveaway-winner-message').value = giveaway.winner_message || '';

            updateEditGiveawayPreview();
            document.getElementById('editGiveawayModal').style.display = '';
        } catch (e) {
            showToast('Failed to load giveaway data', 'error');
        }
    };

    window.cpCloseEditGiveawayModal = function() {
        document.getElementById('editGiveawayModal').style.display = 'none';
        editingGiveawayId = null;
        editingGiveawayData = null;
    };

    function updateEditGiveawayPreview() {
        const prize = document.getElementById('edit-giveaway-prize').value || 'Your Prize Here';
        const title = document.getElementById('edit-giveaway-embed-title').value || '\uD83C\uDF89 GIVEAWAY';
        const desc = document.getElementById('edit-giveaway-embed-description').value;
        const color = document.getElementById('edit-giveaway-embed-color').value || '#57f287';
        const image = document.getElementById('edit-giveaway-embed-image').value;
        const thumbnail = document.getElementById('edit-giveaway-embed-thumbnail').value;
        const footer = document.getElementById('edit-giveaway-embed-footer').value;
        const winners = document.getElementById('edit-giveaway-winners').value || '1';
        const entries = editingGiveawayData ? (editingGiveawayData.entries || []).length : 0;

        const previewEl = document.getElementById('edit-giveaway-embed-preview');
        previewEl.style.borderLeftColor = color;

        let html = `<div style="font-weight:700;font-size:0.95rem;margin-bottom:0.5rem;">${escapeHtml(title)}</div>`;
        let descText = desc ? escapeHtml(desc) + '\n\n' : '';
        descText += `<strong>${escapeHtml(prize)}</strong>\n\nClick the button below to enter!\n\n<strong>Winners:</strong> ${escapeHtml(winners)}\n<strong>Entries:</strong> ${entries}`;
        html += `<div style="font-size:0.85rem;color:var(--text-secondary);white-space:pre-line;line-height:1.5;">${descText}</div>`;

        if (thumbnail) {
            html = `<div style="display:flex;gap:1rem;"><div style="flex:1;">${html}</div><img src="${escapeHtml(thumbnail)}" style="width:64px;height:64px;border-radius:4px;object-fit:cover;" onerror="this.style.display='none'"></div>`;
        }
        if (image) {
            html += `<img src="${escapeHtml(image)}" style="max-width:100%;border-radius:4px;margin-top:0.75rem;" onerror="this.style.display='none'">`;
        }
        if (footer) {
            html += `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.75rem;border-top:1px solid rgba(255,255,255,0.06);padding-top:0.5rem;">${escapeHtml(footer)}</div>`;
        }
        previewEl.innerHTML = html;
    }

    // Live preview for edit giveaway
    ['edit-giveaway-prize', 'edit-giveaway-embed-title', 'edit-giveaway-embed-description', 'edit-giveaway-embed-color',
     'edit-giveaway-embed-image', 'edit-giveaway-embed-thumbnail', 'edit-giveaway-embed-footer', 'edit-giveaway-winners'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateEditGiveawayPreview);
            el.addEventListener('change', updateEditGiveawayPreview);
        }
    });

    window.cpSaveGiveawayEdit = async function() {
        if (!selectedGuild || !editingGiveawayId) return;
        const prize = document.getElementById('edit-giveaway-prize').value.trim();
        if (!prize) { showToast('Enter a prize', 'error'); return; }

        const payload = {
            prize,
            winners: parseInt(document.getElementById('edit-giveaway-winners').value) || 1,
            required_role: document.getElementById('edit-giveaway-required-role').value || null,
            embed_title: document.getElementById('edit-giveaway-embed-title').value.trim() || null,
            embed_description: document.getElementById('edit-giveaway-embed-description').value.trim() || null,
            embed_color: document.getElementById('edit-giveaway-embed-color').value || '#57f287',
            embed_image: document.getElementById('edit-giveaway-embed-image').value.trim() || null,
            embed_thumbnail: document.getElementById('edit-giveaway-embed-thumbnail').value.trim() || null,
            embed_footer: document.getElementById('edit-giveaway-embed-footer').value.trim() || null,
            button_label: document.getElementById('edit-giveaway-button-label').value.trim() || null,
            blacklisted_roles: getMultiSelectValues('edit-giveaway-blacklisted-roles'),
            bonus_role: document.getElementById('edit-giveaway-bonus-role').value || null,
            bonus_entries: parseInt(document.getElementById('edit-giveaway-bonus-entries').value) || 2,
            max_entries: parseInt(document.getElementById('edit-giveaway-max-entries').value) || 0,
            dm_winners: document.getElementById('edit-giveaway-dm-winners').value === 'true',
            winner_message: document.getElementById('edit-giveaway-winner-message').value.trim() || null,
        };

        // Only include duration if user selected a new one
        const duration = document.getElementById('edit-giveaway-duration').value;
        if (duration) payload.duration = duration;

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/giveaways/${editingGiveawayId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast('Giveaway updated!', 'success');
                window.cpCloseEditGiveawayModal();
                loadGiveaways();
            } else {
                showToast(data.error || 'Failed to update giveaway', 'error');
            }
        } catch (e) { showToast('Failed to update giveaway', 'error'); }
    };

    // ==================== STATS ====================
    async function loadStats() {
        if (!selectedGuild) return;
        try {
            const dateRange = document.getElementById('stats-date-range')?.value || '7d';
            const showCommands = document.getElementById('stats-show-commands')?.checked !== false;
            const showVoice = document.getElementById('stats-show-voice')?.checked !== false;
            const [statsRes, channelsRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/stats?range=${dateRange}&commands=${showCommands}&voice=${showVoice}`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`)
            ]);
            const data = await statsRes.json();
            const chData = await channelsRes.json();
            const channels = chData.channels || [];
            const stats = data.stats || {};
            const messages = stats.messages || { daily: {}, channels: {}, users: {}, total: 0 };
            const members = stats.members || { daily: {}, total_joins: 0, total_leaves: 0 };

            // Summary stats
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('stat-total-messages').textContent = (messages.total || 0).toLocaleString();
            document.getElementById('stat-today-messages').textContent = (messages.daily[today] || 0).toLocaleString();
            document.getElementById('stat-total-joins').textContent = (members.total_joins || 0).toLocaleString();
            document.getElementById('stat-total-leaves').textContent = (members.total_leaves || 0).toLocaleString();

            // Build days array based on date range
            const rangeDays = dateRange === '24h' ? 1 : dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 14;
            const days = [];
            for (let i = rangeDays - 1; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                days.push(d.toISOString().split('T')[0]);
            }

            // Message chart (bar chart using divs)
            const msgCounts = days.map(d => messages.daily[d] || 0);
            const maxMsg = Math.max(...msgCounts, 1);
            document.getElementById('stats-message-chart').innerHTML = `<div class="chart-bars">${days.map((d, i) => {
                const pct = Math.max((msgCounts[i] / maxMsg) * 100, 2);
                const label = d.slice(5);
                return `<div class="chart-bar-item"><div class="chart-bar-value">${msgCounts[i]}</div><div class="chart-bar" style="height:${pct}%"></div><div class="chart-bar-label">${label}</div></div>`;
            }).join('')}</div>`;

            // Member chart
            const joinCounts = days.map(d => (members.daily[d]?.joins || 0));
            const leaveCounts = days.map(d => (members.daily[d]?.leaves || 0));
            const maxMember = Math.max(...joinCounts, ...leaveCounts, 1);
            document.getElementById('stats-member-chart').innerHTML = `<div class="chart-bars">${days.map((d, i) => {
                const joinPct = Math.max((joinCounts[i] / maxMember) * 100, 1);
                const label = d.slice(5);
                return `<div class="chart-bar-item"><div class="chart-bar-value" style="color:#57f287;">+${joinCounts[i]}</div><div class="chart-bar" style="height:${joinPct}%;background:linear-gradient(to top, rgba(87,242,135,0.6), rgba(87,242,135,0.3));"></div><div class="chart-bar-label">${label}</div></div>`;
            }).join('')}</div>`;

            // Top channels
            const channelEntries = Object.entries(messages.channels || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
            const topChMax = channelEntries.length > 0 ? channelEntries[0][1] : 1;
            if (channelEntries.length === 0) {
                document.getElementById('stats-top-channels').innerHTML = '<div class="empty-state"><p>No message data yet.</p></div>';
            } else {
                document.getElementById('stats-top-channels').innerHTML = channelEntries.map(([chId, count]) => {
                    const ch = channels.find(c => c.id === chId);
                    const name = ch ? `#${escapeHtml(ch.name)}` : `#${chId}`;
                    const pct = (count / topChMax) * 100;
                    return `<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem;">
                        <div style="min-width:120px;font-size:0.85rem;color:var(--text-secondary);">${name}</div>
                        <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:4px;height:20px;">
                            <div style="width:${pct}%;background:#5865F2;border-radius:4px;height:100%;"></div>
                        </div>
                        <div style="min-width:50px;text-align:right;font-size:0.85rem;font-weight:600;">${count.toLocaleString()}</div>
                    </div>`;
                }).join('');
            }

            // Top users
            const userEntries = Object.entries(messages.users || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
            const topUserMax = userEntries.length > 0 ? userEntries[0][1] : 1;
            if (userEntries.length === 0) {
                document.getElementById('stats-top-users').innerHTML = '<div class="empty-state"><p>No message data yet.</p></div>';
            } else {
                document.getElementById('stats-top-users').innerHTML = userEntries.map(([userId, count]) => {
                    const pct = (count / topUserMax) * 100;
                    return `<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem;">
                        <div style="min-width:120px;font-size:0.85rem;color:var(--text-secondary);">${userId}</div>
                        <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:4px;height:20px;">
                            <div style="width:${pct}%;background:#fee75c;border-radius:4px;height:100%;"></div>
                        </div>
                        <div style="min-width:50px;text-align:right;font-size:0.85rem;font-weight:600;">${count.toLocaleString()}</div>
                    </div>`;
                }).join('');
            }
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    }

    // ==================== AUTO-ROLES ====================
    let autorolesRoles = [];

    async function loadAutoRoles() {
        if (!selectedGuild) return;
        try {
            const [arRes, rolesRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/autoroles`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`)
            ]);
            const arData = await arRes.json();
            const rolesData = await rolesRes.json();
            autorolesRoles = rolesData.roles || [];
            const ar = arData.autoroles || {};

            document.getElementById('autoroles-enabled').checked = ar.enabled || false;
            document.getElementById('autoroles-sticky').checked = ar.sticky_roles || false;
            document.getElementById('autoroles-verification-type').value = ar.verification_type || 'none';

            // Populate verification role select
            const verifySelect = document.getElementById('autoroles-verification-role');
            verifySelect.innerHTML = '<option value="">-- None --</option>' +
                autorolesRoles.map(r => `<option value="${r.id}" ${r.id === (ar.verification_role || '') ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');

            renderAutoRolesList('autoroles-join-roles', ar.join_roles || [], 'join');
            renderAutoRolesList('autoroles-bot-roles', ar.bot_roles || [], 'bot');
            renderAgeRoles(ar.age_roles || []);
            renderDelayRoles(ar.delay_roles || []);
        } catch (e) { console.error('Failed to load autoroles:', e); }
    }

    function roleSelectHtml(selectedId, namePrefix, index) {
        return `<select class="form-select" data-name="${namePrefix}" data-index="${index}">
            <option value="">-- Select Role --</option>
            ${autorolesRoles.map(r => `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
        </select>`;
    }

    function renderAutoRolesList(containerId, roleIds, type) {
        const container = document.getElementById(containerId);
        if (roleIds.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No roles configured</p>';
            return;
        }
        container.innerHTML = roleIds.map((rid, i) => `
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                ${roleSelectHtml(rid, type + '-role', i)}
                <button class="control-btn danger" onclick="cpRemoveAutoRole('${type}', ${i})" style="padding:0.4rem 0.6rem;">✕</button>
            </div>
        `).join('');
    }

    function renderAgeRoles(ageRoles) {
        const container = document.getElementById('autoroles-age-roles');
        if (ageRoles.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No age rules configured</p>';
            return;
        }
        container.innerHTML = ageRoles.map((rule, i) => `
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                ${roleSelectHtml(rule.role_id, 'age-role', i)}
                <span style="color:var(--text-muted);white-space:nowrap;">min</span>
                <input type="number" class="form-input" data-name="age-days" data-index="${i}" value="${rule.min_days || 0}" min="0" max="3650" style="width:80px;">
                <span style="color:var(--text-muted);white-space:nowrap;">days old</span>
                <button class="control-btn danger" onclick="cpRemoveAutoRole('age', ${i})" style="padding:0.4rem 0.6rem;">✕</button>
            </div>
        `).join('');
    }

    function renderDelayRoles(delayRoles) {
        const container = document.getElementById('autoroles-delay-roles');
        if (delayRoles.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No delay rules configured</p>';
            return;
        }
        container.innerHTML = delayRoles.map((rule, i) => `
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                ${roleSelectHtml(rule.role_id, 'delay-role', i)}
                <span style="color:var(--text-muted);white-space:nowrap;">after</span>
                <input type="number" class="form-input" data-name="delay-seconds" data-index="${i}" value="${rule.delay_seconds || 10}" min="1" max="86400" style="width:80px;">
                <span style="color:var(--text-muted);white-space:nowrap;">seconds</span>
                <button class="control-btn danger" onclick="cpRemoveAutoRole('delay', ${i})" style="padding:0.4rem 0.6rem;">✕</button>
            </div>
        `).join('');
    }

    window.cpAddJoinRole = function() {
        const container = document.getElementById('autoroles-join-roles');
        if (container.querySelector('p')) container.innerHTML = '';
        const idx = container.children.length;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;';
        div.innerHTML = `${roleSelectHtml('', 'join-role', idx)}
            <button class="control-btn danger" onclick="this.parentElement.remove()" style="padding:0.4rem 0.6rem;">✕</button>`;
        container.appendChild(div);
    };

    window.cpAddBotRole = function() {
        const container = document.getElementById('autoroles-bot-roles');
        if (container.querySelector('p')) container.innerHTML = '';
        const idx = container.children.length;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;';
        div.innerHTML = `${roleSelectHtml('', 'bot-role', idx)}
            <button class="control-btn danger" onclick="this.parentElement.remove()" style="padding:0.4rem 0.6rem;">✕</button>`;
        container.appendChild(div);
    };

    window.cpAddAgeRole = function() {
        const container = document.getElementById('autoroles-age-roles');
        if (container.querySelector('p')) container.innerHTML = '';
        const idx = container.children.length;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;';
        div.innerHTML = `${roleSelectHtml('', 'age-role', idx)}
            <span style="color:var(--text-muted);white-space:nowrap;">min</span>
            <input type="number" class="form-input" data-name="age-days" data-index="${idx}" value="7" min="0" max="3650" style="width:80px;">
            <span style="color:var(--text-muted);white-space:nowrap;">days old</span>
            <button class="control-btn danger" onclick="this.parentElement.remove()" style="padding:0.4rem 0.6rem;">✕</button>`;
        container.appendChild(div);
    };

    window.cpAddDelayRole = function() {
        const container = document.getElementById('autoroles-delay-roles');
        if (container.querySelector('p')) container.innerHTML = '';
        const idx = container.children.length;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;';
        div.innerHTML = `${roleSelectHtml('', 'delay-role', idx)}
            <span style="color:var(--text-muted);white-space:nowrap;">after</span>
            <input type="number" class="form-input" data-name="delay-seconds" data-index="${idx}" value="10" min="1" max="86400" style="width:80px;">
            <span style="color:var(--text-muted);white-space:nowrap;">seconds</span>
            <button class="control-btn danger" onclick="this.parentElement.remove()" style="padding:0.4rem 0.6rem;">✕</button>`;
        container.appendChild(div);
    };

    window.cpRemoveAutoRole = function(type, index) {
        const containerMap = { join: 'autoroles-join-roles', bot: 'autoroles-bot-roles', age: 'autoroles-age-roles', delay: 'autoroles-delay-roles' };
        const container = document.getElementById(containerMap[type]);
        if (container) {
            const items = container.children;
            if (items[index]) items[index].remove();
            if (container.children.length === 0) container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No roles configured</p>';
        }
        window.cpSaveAutoRoles();
    };

    window.cpSaveAutoRoles = async function() {
        if (!selectedGuild) return;
        const joinRoles = [...document.querySelectorAll('[data-name="join-role"]')].map(s => s.value).filter(v => v);
        const botRoles = [...document.querySelectorAll('[data-name="bot-role"]')].map(s => s.value).filter(v => v);
        const ageRoles = [...document.querySelectorAll('[data-name="age-role"]')].map((s, i) => {
            const daysInput = document.querySelector(`[data-name="age-days"][data-index="${i}"]`);
            return { role_id: s.value, min_days: parseInt(daysInput?.value || '0') };
        }).filter(r => r.role_id);
        const delayRoles = [...document.querySelectorAll('[data-name="delay-role"]')].map((s, i) => {
            const secInput = document.querySelector(`[data-name="delay-seconds"][data-index="${i}"]`);
            return { role_id: s.value, delay_seconds: parseInt(secInput?.value || '10') };
        }).filter(r => r.role_id);

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/autoroles`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: document.getElementById('autoroles-enabled').checked,
                    join_roles: joinRoles,
                    bot_roles: botRoles,
                    age_roles: ageRoles,
                    delay_roles: delayRoles,
                    sticky_roles: document.getElementById('autoroles-sticky').checked,
                    verification_role: document.getElementById('autoroles-verification-role').value || null,
                    verification_type: document.getElementById('autoroles-verification-type').value || 'none',
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Auto-roles saved!', 'success');
                loadAutoRoles();
            } else {
                showToast(data.error || 'Failed to save', 'error');
            }
        } catch (e) { showToast('Failed to save auto-roles', 'error'); }
    };

    // ==================== SCHEDULED MESSAGES ====================
    async function loadScheduledMessages() {
        if (!selectedGuild) return;
        try {
            const [msgRes, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/scheduled-messages`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`)
            ]);
            const msgData = await msgRes.json();
            const chData = await chRes.json();
            const messages = msgData.scheduled_messages || [];
            const channels = chData.channels || [];

            const container = document.getElementById('scheduled-messages-list');
            if (messages.length === 0) {
                container.innerHTML = '<div class="empty-state"><p>No scheduled messages yet. Create one to get started!</p></div>';
                return;
            }
            container.innerHTML = messages.map(m => {
                const ch = channels.find(c => c.id === m.channel_id);
                const chName = ch ? `#${escapeHtml(ch.name)}` : `#${m.channel_id}`;
                const intervalLabel = { once: 'Once', hourly: 'Every Hour', daily: 'Daily', weekly: 'Weekly' }[m.interval] || m.interval;
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:0.5rem;">
                    <div style="flex:1;">
                        <div style="font-weight:600;margin-bottom:0.25rem;">${chName} - ${intervalLabel}</div>
                        <div style="color:var(--text-muted);font-size:0.8rem;">${escapeHtml((m.content || '').slice(0, 80))}${m.embed ? ' [Embed]' : ''}</div>
                        <div style="color:var(--text-muted);font-size:0.75rem;">Status: ${m.enabled ? '<span style="color:#57f287;">Active</span>' : '<span style="color:#ed4245;">Disabled</span>'}</div>
                    </div>
                    <div style="display:flex;gap:0.5rem;">
                        <button class="control-btn secondary" onclick="cpToggleScheduledMsg('${m.id}', ${!m.enabled})">${m.enabled ? 'Disable' : 'Enable'}</button>
                        <button class="control-btn danger" onclick="cpDeleteScheduledMsg('${m.id}')">Delete</button>
                    </div>
                </div>`;
            }).join('');
        } catch (e) { console.error('Failed to load scheduled messages:', e); }
    }

    window.cpShowCreateScheduledMsg = async function() {
        if (document.getElementById('createScheduledMsgModal')) return;
        const channels = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`).then(r => r.json()).then(d => d.channels || []);
        const textChannels = channels.filter(c => c.type === 0);
        const html = `<div class="modal-overlay" id="createScheduledMsgModal" style="display:flex;">
            <div class="modal" style="max-width:500px;">
                <div class="modal-header"><h3>Create Scheduled Message</h3><button class="modal-close" onclick="document.getElementById('createScheduledMsgModal').remove()">&times;</button></div>
                <div class="modal-body">
                    <div class="form-group"><label>Channel</label><select id="sched-channel" class="form-select">
                        ${textChannels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('')}
                    </select></div>
                    <div class="form-group"><label>Message Content</label><textarea id="sched-content" rows="3" placeholder="Message text..." maxlength="2000"></textarea></div>
                    <div class="form-group"><label>Interval</label><select id="sched-interval" class="form-select">
                        <option value="once">Once</option><option value="hourly">Every Hour</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
                    </select></div>
                    <div class="form-row">
                        <div class="form-group"><label>Hour (0-23)</label><input type="number" id="sched-hour" value="12" min="0" max="23"></div>
                        <div class="form-group"><label>Minute</label><input type="number" id="sched-minute" value="0" min="0" max="59"></div>
                    </div>
                </div>
                <div class="modal-footer"><button class="control-btn primary" onclick="cpCreateScheduledMsg()">Create</button></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    };

    window.cpCreateScheduledMsg = async function() {
        if (!selectedGuild) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/scheduled-messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel_id: document.getElementById('sched-channel').value,
                    content: document.getElementById('sched-content').value,
                    interval: document.getElementById('sched-interval').value,
                    cron_hour: parseInt(document.getElementById('sched-hour').value),
                    cron_minute: parseInt(document.getElementById('sched-minute').value),
                    enabled: true
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Scheduled message created!', 'success');
                document.getElementById('createScheduledMsgModal')?.remove();
                loadScheduledMessages();
            } else {
                showToast(data.error || 'Failed to create', 'error');
            }
        } catch (e) { showToast('Failed to create scheduled message', 'error'); }
    };

    window.cpToggleScheduledMsg = async function(msgId, enabled) {
        if (!selectedGuild) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/scheduled-messages/${msgId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
            const data = await res.json();
            if (data.success) {
                showToast(enabled ? 'Message enabled' : 'Message disabled', 'success');
                loadScheduledMessages();
            }
        } catch (e) { showToast('Failed to update', 'error'); }
    };

    window.cpDeleteScheduledMsg = async function(msgId) {
        if (!confirm('Delete this scheduled message?')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/scheduled-messages/${msgId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast('Scheduled message deleted', 'success');
                loadScheduledMessages();
            }
        } catch (e) { showToast('Failed to delete', 'error'); }
    };

    // ==================== CUSTOM EMBEDS ====================
    async function loadCustomEmbeds() {
        if (!selectedGuild) return;
        try {
            const [embedsRes, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-embeds`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`)
            ]);
            const embedsData = await embedsRes.json();
            const chData = await chRes.json();
            const embeds = embedsData.embeds || [];
            const channels = chData.channels || [];
            const textChannels = channels.filter(c => c.type === 0);

            // Populate channel dropdown
            const channelSelect = document.getElementById('embed-channel');
            channelSelect.innerHTML = textChannels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');

            // Sent embeds list
            const listContainer = document.getElementById('custom-embeds-list');
            if (embeds.length === 0) {
                listContainer.innerHTML = '<div class="empty-state"><p>No custom embeds sent yet.</p></div>';
            } else {
                listContainer.innerHTML = embeds.map(e => {
                    const ch = channels.find(c => c.id === e.channel_id);
                    const chName = ch ? `#${escapeHtml(ch.name)}` : `#${e.channel_id}`;
                    const title = e.embed?.title || 'Untitled';
                    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:0.5rem;">
                        <div><span style="font-weight:600;">${escapeHtml(title)}</span> <span style="color:var(--text-muted);">in ${chName}</span></div>
                        <button class="control-btn danger" onclick="cpDeleteEmbed('${e.id}')">Delete</button>
                    </div>`;
                }).join('');
            }

            // Setup live preview listeners
            setupEmbedPreview();
        } catch (e) { console.error('Failed to load custom embeds:', e); }
    }

    function setupEmbedPreview() {
        const fields = ['embed-title', 'embed-description', 'embed-color', 'embed-author', 'embed-footer', 'embed-image', 'embed-thumbnail'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateEmbedPreview);
        });
        updateEmbedPreview();
    }

    function updateEmbedPreview() {
        const title = document.getElementById('embed-title')?.value || '';
        const desc = document.getElementById('embed-description')?.value || '';
        const color = document.getElementById('embed-color')?.value || '#5865F2';
        const author = document.getElementById('embed-author')?.value || '';
        const footer = document.getElementById('embed-footer')?.value || '';
        const image = document.getElementById('embed-image')?.value || '';
        const thumbnail = document.getElementById('embed-thumbnail')?.value || '';

        const preview = document.getElementById('embed-preview');
        if (!preview) return;
        preview.style.borderLeftColor = color;

        let html = '';
        if (author) html += `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;">${escapeHtml(author)}</div>`;
        if (title) html += `<div style="font-weight:700;font-size:1rem;margin-bottom:0.5rem;">${escapeHtml(title)}</div>`;
        if (desc) html += `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.75rem;white-space:pre-wrap;">${escapeHtml(desc)}</div>`;

        // Fields — show any field with at least a name (value defaults to zero-width space when empty)
        const fieldEls = document.querySelectorAll('.embed-field-row');
        const validFields = [];
        fieldEls.forEach(row => {
            row.style.opacity = '';
            row.title = '';
            const name = row.querySelector('.embed-field-name')?.value || '';
            const value = row.querySelector('.embed-field-value')?.value || '';
            const inline = row.querySelector('.embed-field-inline')?.checked;
            if (name) validFields.push({ name, value, inline });
        });
        if (validFields.length > 0) {
            html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-bottom:0.75rem;">';
            validFields.forEach(f => {
                html += `<div style="grid-column:${f.inline ? 'span 1' : '1 / -1'};">
                    <div style="font-weight:600;font-size:0.8rem;">${escapeHtml(f.name)}</div>
                    ${f.value ? `<div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(f.value)}</div>` : ''}
                </div>`;
            });
            html += '</div>';
        }

        if (image) html += `<div style="margin-bottom:0.5rem;"><img src="${escapeHtml(image)}" style="max-width:100%;border-radius:4px;max-height:200px;" onerror="this.style.display='none'"></div>`;
        if (footer) html += `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.5rem;">${escapeHtml(footer)}</div>`;
        if (thumbnail) {
            html = `<div style="display:flex;gap:1rem;"><div style="flex:1;">${html}</div><img src="${escapeHtml(thumbnail)}" style="width:80px;height:80px;border-radius:4px;object-fit:cover;" onerror="this.style.display='none'"></div>`;
        }

        document.getElementById('embed-preview-content').innerHTML = html || '<span style="color:var(--text-muted);">Fill in fields to see preview</span>';
    }

    window.cpAddEmbedField = function() {
        const container = document.getElementById('embed-fields');
        const div = document.createElement('div');
        div.className = 'embed-field-row';
        div.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:center;';
        div.innerHTML = `<input type="text" class="embed-field-name" placeholder="Field name" style="flex:1;" oninput="window.cpUpdateEmbedPreview()">
            <input type="text" class="embed-field-value" placeholder="Field value" style="flex:1;" oninput="window.cpUpdateEmbedPreview()">
            <label style="display:flex;align-items:center;gap:0.25rem;white-space:nowrap;font-size:0.8rem;"><input type="checkbox" class="embed-field-inline" checked onchange="window.cpUpdateEmbedPreview()"> Inline</label>
            <button class="control-btn danger" onclick="this.parentElement.remove();window.cpUpdateEmbedPreview();" style="padding:0.3rem 0.5rem;">✕</button>`;
        container.appendChild(div);
    };

    window.cpUpdateEmbedPreview = updateEmbedPreview;

    window.cpSendEmbed = async function() {
        if (!selectedGuild) return;
        const channelId = document.getElementById('embed-channel').value;
        if (!channelId) { showToast('Select a channel', 'error'); return; }

        const embed = {
            title: document.getElementById('embed-title').value,
            description: document.getElementById('embed-description').value,
            color: document.getElementById('embed-color').value,
            author: document.getElementById('embed-author').value,
            footer: document.getElementById('embed-footer').value,
            image: document.getElementById('embed-image').value,
            thumbnail: document.getElementById('embed-thumbnail').value,
            fields: []
        };

        document.querySelectorAll('.embed-field-row').forEach(row => {
            const name = row.querySelector('.embed-field-name')?.value;
            const value = row.querySelector('.embed-field-value')?.value;
            const inline = row.querySelector('.embed-field-inline')?.checked || false;
            if (name) embed.fields.push({ name, value: value || '\u200b', inline });
        });

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-embeds`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel_id: channelId,
                    content: document.getElementById('embed-content').value,
                    embed
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Embed sent!', 'success');
                // Clear fields
                ['embed-title', 'embed-description', 'embed-author', 'embed-footer', 'embed-image', 'embed-thumbnail', 'embed-content'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = el.type === 'color' ? '#5865F2' : '';
                });
                document.getElementById('embed-fields').innerHTML = '';
                updateEmbedPreview();
                loadCustomEmbeds();
            } else {
                showToast(data.error || 'Failed to send embed', 'error');
            }
        } catch (e) { showToast('Failed to send embed', 'error'); }
    };

    window.cpDeleteEmbed = async function(embedId) {
        if (!confirm('Delete this embed message from Discord?')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-embeds/${embedId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast('Embed deleted', 'success');
                loadCustomEmbeds();
            }
        } catch (e) { showToast('Failed to delete embed', 'error'); }
    };

    // ==================== SOCIAL FEEDS ====================
    async function loadSocialFeeds() {
        if (!selectedGuild) return;
        try {
            const [feedsRes, chRes, rolesRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/social-feeds`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`)
            ]);
            const feedsData = await feedsRes.json();
            const chData = await chRes.json();
            const feeds = feedsData.feeds || [];
            const channels = (chData.channels || []).filter(c => c.type === 0);

            const container = document.getElementById('social-feeds-list');
            if (feeds.length === 0) {
                container.innerHTML = '<div class="empty-state"><p>No social feeds configured. Add one to get started!</p></div>';
                return;
            }
            const platformIcons = { youtube: '🔴', twitch: '🟣', rss: '🟠' };
            container.innerHTML = feeds.map(f => {
                const ch = channels.find(c => c.id === f.channel_id);
                const chName = ch ? `#${escapeHtml(ch.name)}` : 'No channel';
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:0.5rem;">
                    <div>
                        <div style="font-weight:600;">${platformIcons[f.platform] || '📡'} ${escapeHtml(f.name || 'Unknown')} <span style="color:var(--text-muted);font-size:0.8rem;">(${f.platform})</span></div>
                        <div style="color:var(--text-muted);font-size:0.8rem;">Posts to ${chName} | ${f.enabled ? '<span style="color:#57f287;">Active</span>' : '<span style="color:#ed4245;">Disabled</span>'}</div>
                    </div>
                    <div style="display:flex;gap:0.5rem;">
                        <button class="control-btn secondary" onclick="cpToggleFeed('${f.id}', ${!f.enabled})">${f.enabled ? 'Disable' : 'Enable'}</button>
                        <button class="control-btn danger" onclick="cpDeleteFeed('${f.id}')">Delete</button>
                    </div>
                </div>`;
            }).join('');
        } catch (e) { console.error('Failed to load social feeds:', e); }
    }

    // ==================== LIVE ALERTS ====================
    let _laEditingId = null;

    async function loadLiveAlerts() {
        if (!selectedGuild) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/live-alerts`);
            const data = await res.json();
            document.getElementById('live-alerts-enabled').checked = data.enabled || false;
            populateChannelSelect('live-alerts-channel', data.alert_channel || null);

            const roles = await fetchGuildRoles();
            const streamers = data.streamers || [];
            const list = document.getElementById('live-alerts-list');
            if (streamers.length === 0) {
                list.innerHTML = '<div class="empty-state"><p style="color:var(--text-muted);">No streamers tracked yet. Click <strong>+ Add Streamer</strong> to get started.</p></div>';
                return;
            }

            const platformColors = { twitch: '#9146FF', youtube: '#FF0000', kick: '#53FC18' };
            const platformNames = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick' };
            const platformEmojis = { twitch: '🟣', youtube: '🔴', kick: '🟢' };

            list.innerHTML = streamers.map(s => {
                const role = s.ping_role === 'everyone' ? '@everyone' : s.ping_role === 'here' ? '@here' : (roles.find(r => r.id === s.ping_role)?.name ? '@' + roles.find(r => r.id === s.ping_role).name : '');
                const emoji = platformEmojis[s.platform] || '📺';
                const color = platformColors[s.platform] || '#5865F2';
                const pname = platformNames[s.platform] || s.platform;
                const platformBadge = `<span style="background:${color}22;color:${color};padding:0.15rem 0.5rem;border-radius:4px;font-size:0.75rem;font-weight:600;">${emoji} ${pname}</span>`;
                const liveBadge = s.is_live
                    ? `<span style="background:rgba(237,66,69,0.15);color:#ed4245;padding:0.15rem 0.5rem;border-radius:4px;font-size:0.75rem;font-weight:600;">● LIVE</span>`
                    : `<span style="background:rgba(255,255,255,0.06);color:var(--text-muted);padding:0.15rem 0.5rem;border-radius:4px;font-size:0.75rem;">Offline</span>`;
                const msgPreview = s.message ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.2rem;font-style:italic;">"${escapeHtml(s.message.substring(0, 60))}${s.message.length > 60 ? '…' : ''}"</div>` : '';
                const pingLabel = role ? `<span style="font-size:0.75rem;color:var(--text-muted);">pings ${escapeHtml(role)}</span>` : '';
                const autoDeleteLabel = s.auto_delete ? `<span style="font-size:0.75rem;color:var(--text-muted);">🗑 auto-delete</span>` : '';
                return `<div class="channel-item" style="flex-wrap:wrap;gap:0.5rem;">
                    <div class="channel-info" style="flex:1;min-width:180px;">
                        <div class="channel-name">${escapeHtml(s.display_name || s.username)}</div>
                        <div class="channel-owner" style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">${platformBadge} ${liveBadge} ${pingLabel} ${autoDeleteLabel}</div>
                        ${msgPreview}
                    </div>
                    <div style="display:flex;gap:0.4rem;align-items:center;">
                        <label class="toggle" style="margin:0;">
                            <input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="window.cpToggleStreamer('${s.id}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                        <button class="control-btn small" onclick="window.cpEditStreamer('${s.id}')">Edit</button>
                        <button class="control-btn small" style="background:rgba(88,101,242,0.15);color:#7289da;" onclick="window.cpTestStreamer('${s.id}')">Test</button>
                        <button class="control-btn small" style="background:rgba(237,66,69,0.15);color:#ed4245;" onclick="window.cpDeleteStreamer('${s.id}')">Delete</button>
                    </div>
                </div>`;
            }).join('');
        } catch (e) { showToast('Failed to load live alerts', 'error'); }
    }

    window.cpSaveLiveAlertsSettings = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/live-alerts`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('live-alerts-enabled').checked,
                    alert_channel: document.getElementById('live-alerts-channel').value
                })
            });
            const data = await res.json();
            if (data.success) showToast('Settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save settings', 'error'); }
    };

    async function _laPopulateRoles() {
        const roles = await fetchGuildRoles();
        const sel = document.getElementById('la-ping-role');
        while (sel.options.length > 3) sel.remove(3);
        (roles || []).filter(r => r.name !== '@everyone').forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = '@' + r.name;
            sel.appendChild(opt);
        });
    }

    window.cpShowAddStreamer = function() {
        _laEditingId = null;
        document.getElementById('live-alerts-form-title').textContent = 'Add Streamer';
        document.getElementById('la-submit-btn').textContent = 'Add Streamer';
        document.getElementById('la-platform').disabled = false;
        document.getElementById('la-username').disabled = false;
        document.getElementById('la-platform').value = 'twitch';
        document.getElementById('la-username').value = '';
        document.getElementById('la-platform-id').value = '';
        document.getElementById('la-message').value = '';
        document.getElementById('la-ping-role').value = '';
        document.getElementById('la-auto-delete').checked = false;
        window.cpLAUpdatePlatformHelp();
        document.getElementById('la-test-btn').style.display = 'none';
        document.getElementById('live-alerts-form').style.display = 'block';
        _laPopulateRoles();
    };

    window._laEditingIdProxy = function() { return _laEditingId; };

    window.cpHideLAForm = function() {
        document.getElementById('live-alerts-form').style.display = 'none';
        _laEditingId = null;
    };

    window.cpLAUpdatePlatformHelp = function() {
        const platform = document.getElementById('la-platform')?.value;
        const group = document.getElementById('la-platform-id-group');
        if (group) group.style.display = platform === 'youtube' ? 'block' : 'none';
        const hint = document.getElementById('la-username-hint');
        if (hint) {
            if (platform === 'twitch') hint.textContent = 'Twitch username (e.g. HexEchoTV)';
            else if (platform === 'youtube') hint.textContent = 'YouTube channel handle (for display only)';
            else if (platform === 'kick') hint.textContent = 'Kick channel name (e.g. xqc)';
        }
    };

    window.cpSubmitLAForm = async function() {
        const platform = document.getElementById('la-platform').value;
        const username = document.getElementById('la-username').value.trim();
        const platformId = document.getElementById('la-platform-id').value.trim();
        const pingRole = document.getElementById('la-ping-role').value;
        const message = document.getElementById('la-message').value.trim();

        if (!username) return showToast('Username is required', 'error');
        if (platform === 'youtube' && !platformId) return showToast('YouTube Channel ID is required', 'error');

        try {
            if (_laEditingId) {
                const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/live-alerts/streamers/${_laEditingId}`, {
                    method: 'PATCH', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ ping_role: pingRole, message: message || undefined, auto_delete: document.getElementById('la-auto-delete').checked })
                });
                const data = await res.json();
                if (data.success) { showToast('Streamer updated!', 'success'); window.cpHideLAForm(); loadLiveAlerts(); }
                else showToast(data.error || 'Failed to update', 'error');
            } else {
                const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/live-alerts/streamers`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ platform, username, platform_id: platformId, ping_role: pingRole, message: message || undefined, auto_delete: document.getElementById('la-auto-delete').checked })
                });
                const data = await res.json();
                if (data.success) { showToast('Streamer added!', 'success'); window.cpHideLAForm(); loadLiveAlerts(); }
                else showToast(data.error || 'Failed to add', 'error');
            }
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    window.cpEditStreamer = async function(streamerId) {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/live-alerts`);
            const data = await res.json();
            const s = (data.streamers || []).find(x => x.id === streamerId);
            if (!s) return;
            _laEditingId = streamerId;
            document.getElementById('live-alerts-form-title').textContent = `Edit — ${s.display_name || s.username}`;
            document.getElementById('la-submit-btn').textContent = 'Save Changes';
            document.getElementById('la-platform').value = s.platform;
            document.getElementById('la-platform').disabled = true;
            document.getElementById('la-username').value = s.username;
            document.getElementById('la-username').disabled = true;
            document.getElementById('la-platform-id').value = s.platform_id || '';
            document.getElementById('la-message').value = s.message || '';
            document.getElementById('la-auto-delete').checked = s.auto_delete || false;
            window.cpLAUpdatePlatformHelp();
            document.getElementById('la-test-btn').style.display = '';
            document.getElementById('live-alerts-form').style.display = 'block';
            await _laPopulateRoles();
            document.getElementById('la-ping-role').value = s.ping_role || '';
        } catch (e) { showToast('Failed to load streamer', 'error'); }
    };

    window.cpTestStreamer = async function(streamerId) {
        try {
            showToast('Sending test alert…', 'info');
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/live-alerts/streamers/${streamerId}/test`, { method: 'POST' });
            const data = await res.json();
            if (data.success) showToast('Test alert sent! Check the configured alert channel.', 'success');
            else showToast(data.error || 'Failed to send test', 'error');
        } catch (e) { showToast('Failed to send test alert', 'error'); }
    };

    window.cpDeleteStreamer = async function(streamerId) {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/live-alerts/streamers/${streamerId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) { showToast('Streamer removed', 'success'); loadLiveAlerts(); }
            else showToast(data.error || 'Failed to delete', 'error');
        } catch (e) { showToast('Failed to delete streamer', 'error'); }
    };

    window.cpToggleStreamer = async function(streamerId, enabled) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/live-alerts/streamers/${streamerId}`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ enabled })
            });
        } catch (e) {}
    };

    window.cpShowCreateFeed = async function() {
        if (document.getElementById('createFeedModal')) return;
        const [chRes, rolesRes] = await Promise.all([
            fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
            fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`)
        ]);
        const channels = ((await chRes.json()).channels || []).filter(c => c.type === 0);
        const roles = (await rolesRes.json()).roles || [];

        const html = `<div class="modal-overlay" id="createFeedModal" style="display:flex;">
            <div class="modal" style="max-width:500px;">
                <div class="modal-header"><h3>Add Social Feed</h3><button class="modal-close" onclick="document.getElementById('createFeedModal').remove()">&times;</button></div>
                <div class="modal-body">
                    <div class="form-group"><label>Platform</label><select id="feed-platform" class="form-select" onchange="document.getElementById('feed-url-group').style.display=this.value==='rss'?'':'none';document.getElementById('feed-platform-id-group').style.display=this.value==='youtube'?'':'none';">
                        <option value="youtube">YouTube</option><option value="rss">Custom RSS Feed</option>
                    </select></div>
                    <div class="form-group"><label>Creator Name</label><input type="text" id="feed-name" placeholder="e.g. PewDiePie" maxlength="100"></div>
                    <div class="form-group" id="feed-platform-id-group"><label>YouTube Channel ID</label><input type="text" id="feed-platform-id" placeholder="e.g. UC-lHJZR3Gqxm24_Vd_AJ5Yw"><small style="color:var(--text-muted);">Find this on the channel's About page or URL</small></div>
                    <div class="form-group" id="feed-url-group" style="display:none;"><label>RSS Feed URL</label><input type="text" id="feed-url" placeholder="https://..."></div>
                    <div class="form-group"><label>Notification Channel</label><select id="feed-channel" class="form-select">
                        ${channels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('')}
                    </select></div>
                    <div class="form-group"><label>Ping Role (optional)</label><select id="feed-ping-role" class="form-select">
                        <option value="">None</option><option value="everyone">@everyone</option>
                        ${roles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
                    </select></div>
                    <div class="form-group"><label>Custom Message</label><textarea id="feed-message" rows="2" placeholder="{name} posted: **{title}**\n{link}" maxlength="500"></textarea>
                    <small style="color:var(--text-muted);">Placeholders: {name}, {title}, {link}</small></div>
                </div>
                <div class="modal-footer"><button class="control-btn primary" onclick="cpCreateFeed()">Add Feed</button></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    };

    window.cpCreateFeed = async function() {
        if (!selectedGuild) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/social-feeds`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: document.getElementById('feed-platform').value,
                    name: document.getElementById('feed-name').value,
                    platform_id: document.getElementById('feed-platform-id').value,
                    url: document.getElementById('feed-url').value,
                    channel_id: document.getElementById('feed-channel').value,
                    ping_role: document.getElementById('feed-ping-role').value,
                    message: document.getElementById('feed-message').value || '{name} posted: **{title}**\n{link}'
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Feed added!', 'success');
                document.getElementById('createFeedModal')?.remove();
                loadSocialFeeds();
            } else {
                showToast(data.error || 'Failed to add feed', 'error');
            }
        } catch (e) { showToast('Failed to add feed', 'error'); }
    };

    window.cpToggleFeed = async function(feedId, enabled) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/social-feeds/${feedId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
            showToast(enabled ? 'Feed enabled' : 'Feed disabled', 'success');
            loadSocialFeeds();
        } catch (e) { showToast('Failed to update', 'error'); }
    };

    window.cpDeleteFeed = async function(feedId) {
        if (!confirm('Delete this social feed?')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/social-feeds/${feedId}`, { method: 'DELETE' });
            if ((await res.json()).success) {
                showToast('Feed deleted', 'success');
                loadSocialFeeds();
            }
        } catch (e) { showToast('Failed to delete', 'error'); }
    };

    // ==================== BACKUPS ====================
    async function loadBackups() {
        if (!selectedGuild) return;
        const container = document.getElementById('backups-list');
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/backups`);
            const data = await res.json();
            const backups = data.backups || [];
            if (backups.length === 0) {
                container.innerHTML = '<div class="empty-state"><p>No backups yet. Create one to get started!</p></div>';
                return;
            }
            container.innerHTML = backups.reverse().map(b => {
                const date = new Date(b.created_at).toLocaleString();
                const roleCount = (b.roles || []).length;
                const channelCount = (b.channels || []).length;
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:0.5rem;">
                    <div>
                        <div style="font-weight:600;">${escapeHtml(b.name || 'Backup')}</div>
                        <div style="color:var(--text-muted);font-size:0.8rem;">${date} | ${roleCount} roles, ${channelCount} channels</div>
                    </div>
                    <div style="display:flex;gap:0.5rem;">
                        <button class="control-btn secondary" onclick="cpRestoreBackup('${b.id}', 'configs')" title="Restore bot configs only">Restore Configs</button>
                        <button class="control-btn primary" onclick="cpRestoreBackup('${b.id}', 'all')" title="Restore everything">Restore All</button>
                        <button class="control-btn danger" onclick="cpDeleteBackup('${b.id}')">Delete</button>
                    </div>
                </div>`;
            }).join('');
        } catch (e) { container.innerHTML = '<div class="empty-state"><p>Failed to load backups</p></div>'; }
    }

    window.cpCreateBackup = async function() {
        if (!selectedGuild) return;
        const name = document.getElementById('backup-name').value || `Backup ${new Date().toLocaleDateString()}`;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/backups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Backup created!', 'success');
                document.getElementById('backup-name').value = '';
                loadBackups();
            } else {
                showToast(data.error || 'Failed to create backup', 'error');
            }
        } catch (e) { showToast('Failed to create backup', 'error'); }
    };

    window.cpRestoreBackup = async function(backupId, scope) {
        const msg = scope === 'all' ? 'This will restore roles, channels, and all bot configs. Continue?' : 'This will restore bot configurations (auto-mod, welcome, logging, leveling, auto-roles). Continue?';
        if (!confirm(msg)) return;
        const restore = scope === 'all' ? ['configs', 'roles', 'channels'] : ['configs'];
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/backups/${backupId}/restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ restore })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Restored: ${data.restored.join(', ')}`, 'success');
            } else {
                showToast(data.error || 'Restore failed', 'error');
            }
        } catch (e) { showToast('Restore failed', 'error'); }
    };

    window.cpDeleteBackup = async function(backupId) {
        if (!confirm('Delete this backup?')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/backups/${backupId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast('Backup deleted', 'success');
                loadBackups();
            }
        } catch (e) { showToast('Failed to delete backup', 'error'); }
    };

    // ==================== REACTION ROLES ====================
    let rrChannels = [];
    let rrRoles = [];

    async function loadReactionRoles() {
        if (!selectedGuild) return;
        try {
            const [rrRes, chRes, rolesRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reaction-roles`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`)
            ]);
            const data = await rrRes.json();
            const chData = await chRes.json();
            const rolesData = await rolesRes.json();
            rrChannels = (chData.channels || []).filter(c => c.type === 0);
            rrRoles = rolesData.roles || [];
            const messages = data.messages || [];
            const list = document.getElementById('rr-list');
            if (messages.length === 0) {
                list.innerHTML = '<p style="color:var(--text-muted);">No reaction role messages configured.</p>';
                return;
            }
            list.innerHTML = messages.map(m => {
                const ch = rrChannels.find(c => c.id === m.channel_id);
                const pairs = (m.pairs || []).map(p => {
                    const role = rrRoles.find(r => r.id === p.role_id);
                    return `<span class="tag-pill">${escapeHtml(p.emoji)} → ${role ? escapeHtml(role.name) : p.role_id}</span>`;
                }).join(' ');
                return `<div class="channel-item" style="margin-bottom:0.75rem;">
                    <div class="channel-info"><div>
                        <div class="channel-name">${ch ? '#' + escapeHtml(ch.name) : m.channel_id}</div>
                        <div class="channel-owner" style="margin-top:0.25rem;">${escapeHtml((m.message_text || '').substring(0, 80))}</div>
                        <div style="margin-top:0.35rem;">${pairs}</div>
                    </div></div>
                    <button class="control-btn danger small" onclick="window.cpDeleteRR('${m.id}')">Delete</button>
                </div>`;
            }).join('');
        } catch (e) { console.error('Failed to load reaction roles:', e); }
    }

    window.cpShowCreateRR = function() {
        const modal = document.getElementById('createRRModal');
        const chSelect = document.getElementById('rr-channel');
        chSelect.innerHTML = '<option value="">-- Select --</option>' + rrChannels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
        document.getElementById('rr-message').value = '';
        document.getElementById('rr-pairs').innerHTML = '';
        window.cpAddRRPair();
        modal.style.display = 'flex';
    };

    window.cpCloseCreateRRModal = function() { document.getElementById('createRRModal').style.display = 'none'; };

    window.cpAddRRPair = function() {
        const container = document.getElementById('rr-pairs');
        const div = document.createElement('div');
        div.className = 'form-row';
        div.style.marginBottom = '0.5rem';
        div.innerHTML = `<div class="form-group"><label>Emoji</label><input type="text" class="rr-emoji" placeholder="⭐ or custom emoji"></div>
            <div class="form-group"><label>Role</label><select class="form-select rr-role"><option value="">-- Select --</option>${rrRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}</select></div>
            <button class="control-btn danger small" onclick="this.parentElement.remove()" style="align-self:flex-end;margin-bottom:0.5rem;">&times;</button>`;
        container.appendChild(div);
    };

    window.cpCreateReactionRole = async function() {
        const channel_id = document.getElementById('rr-channel').value;
        const message_text = document.getElementById('rr-message').value;
        if (!channel_id || !message_text) return showToast('Channel and message required', 'error');
        const pairs = [];
        document.querySelectorAll('#rr-pairs .form-row').forEach(row => {
            const emoji = row.querySelector('.rr-emoji')?.value?.trim();
            const role_id = row.querySelector('.rr-role')?.value;
            if (emoji && role_id) pairs.push({ emoji, role_id });
        });
        if (pairs.length === 0) return showToast('Add at least one emoji-role pair', 'error');
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reaction-roles`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel_id, message_text, pairs })
            });
            const data = await res.json();
            if (data.success) { showToast('Reaction role created', 'success'); window.cpCloseCreateRRModal(); loadReactionRoles(); }
            else showToast(data.error || 'Failed', 'error');
        } catch (e) { showToast('Failed to create reaction role', 'error'); }
    };

    window.cpDeleteRR = async function(id) {
        if (!confirm('Delete this reaction role message?')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reaction-roles/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) { showToast('Deleted', 'success'); loadReactionRoles(); }
        } catch (e) { showToast('Failed to delete', 'error'); }
    };

    // ==================== CUSTOM COMMANDS ====================
    let cmdRoles = [];

    async function loadCustomCommands() {
        if (!selectedGuild) return;
        try {
            const [ccRes, rolesRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-commands`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`)
            ]);
            const data = await ccRes.json();
            const rolesData = await rolesRes.json();
            cmdRoles = rolesData.roles || [];
            const commands = data.commands || [];
            const list = document.getElementById('cc-list');
            if (commands.length === 0) {
                list.innerHTML = '<p style="color:var(--text-muted);">No custom commands.</p>';
                return;
            }
            list.innerHTML = commands.map(cmd => {
                const role = cmd.required_role ? cmdRoles.find(r => r.id === cmd.required_role) : null;
                return `<div class="channel-item" style="margin-bottom:0.5rem;">
                    <div class="channel-info"><div>
                        <div class="channel-name" style="display:flex;align-items:center;gap:0.5rem;">!${escapeHtml(cmd.name)}
                            <span class="tag-pill" style="font-size:0.75rem;">${cmd.trigger || 'prefix'}</span>
                            <span class="tag-pill" style="font-size:0.75rem;">${cmd.response_type || 'text'}</span>
                            ${cmd.enabled === false ? '<span class="tag-pill" style="background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.3);font-size:0.75rem;">disabled</span>' : ''}
                        </div>
                        <div class="channel-owner">${escapeHtml((cmd.response || '').substring(0, 60))}${role ? ' | Role: ' + escapeHtml(role.name) : ''}${cmd.cooldown ? ' | ' + cmd.cooldown + 's cooldown' : ''}</div>
                    </div></div>
                    <div style="display:flex;gap:0.35rem;">
                        <button class="control-btn secondary small" onclick="window.cpToggleCommand('${escapeHtml(cmd.name)}')">${cmd.enabled === false ? 'Enable' : 'Disable'}</button>
                        <button class="control-btn danger small" onclick="window.cpDeleteCommand('${escapeHtml(cmd.name)}')">Delete</button>
                    </div>
                </div>`;
            }).join('');
        } catch (e) { console.error('Failed to load custom commands:', e); }
    }

    window.cpShowCreateCmd = function() {
        const modal = document.getElementById('createCmdModal');
        const roleSelect = document.getElementById('cmd-required-role');
        roleSelect.innerHTML = '<option value="">-- None --</option>' + cmdRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
        document.getElementById('cmd-name').value = '';
        document.getElementById('cmd-response').value = '';
        document.getElementById('cmd-cooldown').value = '0';
        modal.style.display = 'flex';
    };

    window.cpCloseCreateCmdModal = function() { document.getElementById('createCmdModal').style.display = 'none'; };

    window.cpCreateCommand = async function() {
        const name = document.getElementById('cmd-name').value.trim().toLowerCase();
        if (!name) return showToast('Command name required', 'error');
        const payload = {
            name, trigger: document.getElementById('cmd-trigger').value,
            response_type: document.getElementById('cmd-response-type').value,
            response: document.getElementById('cmd-response').value,
            required_role: document.getElementById('cmd-required-role').value,
            cooldown: parseInt(document.getElementById('cmd-cooldown').value) || 0,
            enabled: true
        };
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-commands`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) { showToast('Command created', 'success'); window.cpCloseCreateCmdModal(); loadCustomCommands(); }
            else showToast(data.error || 'Failed', 'error');
        } catch (e) { showToast('Failed to create command', 'error'); }
    };

    window.cpToggleCommand = async function(name) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-commands/${encodeURIComponent(name)}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toggle: true })
            });
            showToast('Command toggled', 'success');
            loadCustomCommands();
        } catch (e) { showToast('Failed', 'error'); }
    };

    window.cpDeleteCommand = async function(name) {
        if (!confirm(`Delete command !${name}?`)) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-commands/${encodeURIComponent(name)}`, { method: 'DELETE' });
            if ((await res.json()).success) { showToast('Deleted', 'success'); loadCustomCommands(); }
        } catch (e) { showToast('Failed', 'error'); }
    };

    // ==================== STARBOARD ====================
    async function loadStarboard() {
        if (!selectedGuild) return;
        try {
            const [sbRes, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/starboard`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`)
            ]);
            const data = await sbRes.json();
            const chData = await chRes.json();
            const config = data.config || {};
            const channels = (chData.channels || []).filter(c => c.type === 0);
            document.getElementById('starboard-enabled').checked = config.enabled || false;
            const chSelect = document.getElementById('starboard-channel');
            chSelect.innerHTML = '<option value="">-- Select --</option>' + channels.map(c => `<option value="${c.id}" ${c.id === config.channel ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('');
            document.getElementById('starboard-emoji').value = config.emoji || '⭐';
            document.getElementById('starboard-threshold').value = config.threshold || 3;
            document.getElementById('starboard-self-star').checked = config.self_star || false;
            document.getElementById('starboard-ignore-nsfw').checked = config.ignore_nsfw !== false;
            document.getElementById('starboard-bots').checked = config.allow_bots || false;
            const recent = data.recent || [];
            document.getElementById('starboard-recent').innerHTML = recent.length === 0
                ? '<p style="color:var(--text-muted);">No starred messages yet.</p>'
                : recent.map(m => `<div class="channel-item" style="margin-bottom:0.5rem;"><div class="channel-info"><div><div class="channel-name">${config.emoji || '⭐'} ${m.stars} stars</div><div class="channel-owner">by ${escapeHtml(m.author || m.author_id)} in #${escapeHtml(m.channel_name || m.channel_id)}</div></div></div></div>`).join('');
        } catch (e) { console.error('Failed to load starboard:', e); }
    }

    window.cpSaveStarboard = async function() {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/starboard`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: document.getElementById('starboard-enabled').checked,
                    channel: document.getElementById('starboard-channel').value,
                    emoji: document.getElementById('starboard-emoji').value || '⭐',
                    threshold: parseInt(document.getElementById('starboard-threshold').value) || 3,
                    self_star: document.getElementById('starboard-self-star').checked,
                    ignore_nsfw: document.getElementById('starboard-ignore-nsfw').checked,
                    allow_bots: document.getElementById('starboard-bots').checked
                })
            });
            showToast('Starboard saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    // ==================== AFK ====================
    async function loadAFK() {
        if (!selectedGuild) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/afk`);
            const data = await res.json();
            const config = data.config || {};
            document.getElementById('afk-enabled').checked = config.enabled || false;
            document.getElementById('afk-message').value = config.message_template || '';
            document.getElementById('afk-max-duration').value = config.max_duration_hours || 0;
            const users = data.afk_users || [];
            const list = document.getElementById('afk-users-list');
            list.innerHTML = users.length === 0
                ? '<p style="color:var(--text-muted);">No one is AFK.</p>'
                : users.map(u => `<div class="channel-item" style="margin-bottom:0.5rem;"><div class="channel-info"><div><div class="channel-name">${escapeHtml(u.user_id)}</div><div class="channel-owner">${escapeHtml(u.reason || 'No reason')} - since <t:${Math.floor((u.timestamp || 0) / 1000)}:R></div></div></div></div>`).join('');
        } catch (e) { console.error('Failed to load AFK:', e); }
    }

    window.cpSaveAFK = async function() {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/afk`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: document.getElementById('afk-enabled').checked,
                    message_template: document.getElementById('afk-message').value,
                    max_duration_hours: parseInt(document.getElementById('afk-max-duration').value) || 0
                })
            });
            showToast('AFK settings saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    window.cpClearAllAFK = async function() {
        if (!confirm('Clear all AFK statuses?')) return;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/afk/clear`, { method: 'DELETE' });
            showToast('All AFK cleared', 'success');
            loadAFK();
        } catch (e) { showToast('Failed', 'error'); }
    };

    // ==================== SUGGESTIONS ====================
    async function loadSuggestions() {
        if (!selectedGuild) return;
        try {
            const [sugRes, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/suggestions`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`)
            ]);
            const data = await sugRes.json();
            const chData = await chRes.json();
            const config = data.config || {};
            const channels = (chData.channels || []).filter(c => c.type === 0);
            document.getElementById('suggestions-enabled').checked = config.enabled || false;
            ['suggestions-channel', 'suggestions-approved-channel', 'suggestions-denied-channel'].forEach((id, i) => {
                const keys = ['channel', 'approved_channel', 'denied_channel'];
                const defaults = ['-- Select --', '-- None --', '-- None --'];
                const el = document.getElementById(id);
                el.innerHTML = `<option value="">${defaults[i]}</option>` + channels.map(c => `<option value="${c.id}" ${c.id === config[keys[i]] ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('');
            });
            document.getElementById('suggestions-anonymous').checked = config.anonymous || false;
            document.getElementById('suggestions-auto-react').checked = config.auto_react !== false;
            const suggestions = data.suggestions || [];
            const list = document.getElementById('suggestions-list');
            list.innerHTML = suggestions.length === 0
                ? '<p style="color:var(--text-muted);">No suggestions yet.</p>'
                : suggestions.slice(0, 20).map(s => {
                    const statusColors = { pending: '#f59e0b', approved: '#22c55e', denied: '#ef4444' };
                    const color = statusColors[s.status] || statusColors.pending;
                    const idea = escapeHtml(s.idea || s.content || '');
                    const author = s.anonymous ? 'Anonymous' : (s.author_id || 'unknown');
                    return `<div class="channel-item" style="margin-bottom:0.5rem;flex-direction:column;align-items:flex-start;gap:0.4rem;padding:0.75rem;">
                        <div style="display:flex;align-items:center;gap:0.5rem;width:100%;justify-content:space-between;">
                            <div style="display:flex;align-items:center;gap:0.5rem;">
                                <span style="font-weight:700;color:var(--text-muted);font-size:0.8rem;">#${s.id}</span>
                                <span class="tag-pill" style="font-size:0.7rem;background:${color}22;border-color:${color}55;color:${color};">${s.status || 'pending'}</span>
                                <span style="font-size:0.75rem;color:var(--text-muted);">by ${escapeHtml(author)}</span>
                            </div>
                            <div style="display:flex;gap:0.35rem;">
                                ${s.status === 'pending' ? `<button class="control-btn primary small" onclick="window.cpApproveSuggestion('${s.id}')">Approve</button><button class="control-btn danger small" onclick="window.cpDenySuggestion('${s.id}')">Deny</button>` : ''}
                                <button class="control-btn small" style="background:#ef444422;border-color:#ef444455;color:#ef4444;" onclick="window.cpDeleteSuggestion('${s.id}')">Delete</button>
                            </div>
                        </div>
                        <div style="font-size:0.9rem;color:var(--text-primary);word-break:break-word;">${idea}</div>
                    </div>`;
                }).join('');
        } catch (e) { console.error('Failed to load suggestions:', e); }
    }

    window.cpSaveSuggestions = async function() {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/suggestions`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: document.getElementById('suggestions-enabled').checked,
                    channel: document.getElementById('suggestions-channel').value,
                    approved_channel: document.getElementById('suggestions-approved-channel').value,
                    denied_channel: document.getElementById('suggestions-denied-channel').value,
                    anonymous: document.getElementById('suggestions-anonymous').checked,
                    auto_react: document.getElementById('suggestions-auto-react').checked
                })
            });
            showToast('Suggestions config saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    window.cpApproveSuggestion = async function(id) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/suggestions/${id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' })
            });
            showToast('Suggestion approved', 'success'); loadSuggestions();
        } catch (e) { showToast('Failed', 'error'); }
    };

    window.cpDenySuggestion = async function(id) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/suggestions/${id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'denied' })
            });
            showToast('Suggestion denied', 'success'); loadSuggestions();
        } catch (e) { showToast('Failed', 'error'); }
    };

    window.cpDeleteSuggestion = async function(id) {
        if (!confirm(`Delete suggestion #${id}? This will also remove the message from Discord.`)) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/suggestions/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast(`Suggestion #${id} deleted`, 'success');
            } else {
                showToast(data.error || 'Failed to delete', 'error');
            }
            loadSuggestions();
        } catch (e) { showToast('Failed', 'error'); }
    };

    // ==================== ANTI-RAID ====================
    async function loadAntiRaid() {
        if (!selectedGuild) return;
        try {
            const [arRes, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/anti-raid`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`)
            ]);
            const data = await arRes.json();
            const chData = await chRes.json();
            const config = data.config || {};
            const channels = (chData.channels || []).filter(c => c.type === 0);
            document.getElementById('antiraid-enabled').checked = config.enabled || false;
            document.getElementById('antiraid-max-joins').value = config.max_joins || 10;
            document.getElementById('antiraid-window').value = config.join_window || 10;
            document.getElementById('antiraid-action').value = config.action || 'alert';
            const alertCh = document.getElementById('antiraid-alert-channel');
            alertCh.innerHTML = '<option value="">-- Select --</option>' + channels.map(c => `<option value="${c.id}" ${c.id === config.alert_channel ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('');
            document.getElementById('antiraid-min-age').value = config.min_account_age_days || 0;
            document.getElementById('antiraid-lockdown-duration').value = config.lockdown_duration || 0;
            document.getElementById('antiraid-require-avatar').checked = config.require_avatar || false;
        } catch (e) { console.error('Failed to load anti-raid:', e); }
    }

    window.cpSaveAntiRaid = async function() {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/anti-raid`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: document.getElementById('antiraid-enabled').checked,
                    max_joins: parseInt(document.getElementById('antiraid-max-joins').value) || 10,
                    join_window: parseInt(document.getElementById('antiraid-window').value) || 10,
                    action: document.getElementById('antiraid-action').value,
                    alert_channel: document.getElementById('antiraid-alert-channel').value,
                    min_account_age_days: parseInt(document.getElementById('antiraid-min-age').value) || 0,
                    lockdown_duration: parseInt(document.getElementById('antiraid-lockdown-duration').value) || 0,
                    require_avatar: document.getElementById('antiraid-require-avatar').checked
                })
            });
            showToast('Anti-raid settings saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    // ==================== AUDIT LOG ====================
    window.cpLoadAuditLog = async function() {
        if (!selectedGuild) return;
        const filter = document.getElementById('audit-filter')?.value || 'all';
        const list = document.getElementById('audit-log-list');
        list.innerHTML = '<p style="color:var(--text-muted);">Loading...</p>';
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/audit-log?type=${filter}&limit=50`);
            const data = await res.json();
            const entries = data.entries || [];
            if (entries.length === 0) { list.innerHTML = '<p style="color:var(--text-muted);">No audit log entries found.</p>'; return; }
            const PERMS = {
                1:'Create Invite',2:'Kick Members',4:'Ban Members',8:'Administrator',
                16:'Manage Channels',32:'Manage Server',64:'Add Reactions',128:'View Audit Log',
                256:'Priority Speaker',512:'Video',1024:'View Channel',2048:'Send Messages',
                4096:'Send TTS Messages',8192:'Manage Messages',16384:'Embed Links',32768:'Attach Files',
                65536:'Read Message History',131072:'Mention Everyone',262144:'Use External Emojis',
                524288:'View Guild Insights',1048576:'Connect',2097152:'Speak',4194304:'Mute Members',
                8388608:'Deafen Members',16777216:'Move Members',33554432:'Use Voice Activity',
                67108864:'Change Nickname',134217728:'Manage Nicknames',268435456:'Manage Roles',
                536870912:'Manage Webhooks',1073741824:'Manage Emojis',2147483648:'Use App Commands',
                4294967296:'Request to Speak',17179869184:'Manage Events',34359738368:'Manage Threads',
                68719476736:'Create Public Threads',137438953472:'Create Private Threads',
                274877906944:'Use External Stickers',549755813888:'Send Messages in Threads',
                1099511627776:'Use Embedded Activities',2199023255552:'Moderate Members'
            };
            function decodePerms(bits) {
                if (!bits || bits === '0') return [];
                const n = BigInt(bits);
                return Object.entries(PERMS).filter(([bit]) => (n & BigInt(bit)) !== 0n).map(([,name]) => name);
            }
            function renderChanges(changes, options, actionCode) {
                if (!changes || changes.length === 0) return '';
                const lines = [];
                for (const c of changes) {
                    const key = c.key || '';
                    // Permission overwrites (channel updates)
                    if (key === 'permission_overwrites') {
                        const oldMap = {};
                        for (const o of (c.old_value || [])) oldMap[o.id] = o;
                        for (const nv of (c.new_value || [])) {
                            const old = oldMap[nv.id] || {};
                            const typeLabel = nv.type == 1 ? 'User' : 'Role';
                            const idLabel = nv.id;
                            const allowNow = decodePerms(nv.allow);
                            const denyNow  = decodePerms(nv.deny);
                            const allowOld = decodePerms(old.allow || '0');
                            const denyOld  = decodePerms(old.deny  || '0');
                            const added   = allowNow.filter(p => !allowOld.includes(p));
                            const removed = allowOld.filter(p => !allowNow.includes(p));
                            const denied  = denyNow.filter(p  => !denyOld.includes(p));
                            const undenied= denyOld.filter(p  => !denyNow.includes(p));
                            if (added.length)   lines.push(`<span style="color:#57f287;">✓ Allowed: ${added.join(', ')}</span> for ${typeLabel} <code>${idLabel}</code>`);
                            if (denied.length)  lines.push(`<span style="color:#ed4245;">✗ Denied: ${denied.join(', ')}</span> for ${typeLabel} <code>${idLabel}</code>`);
                            if (removed.length) lines.push(`<span style="color:var(--text-muted);">↩ Removed allow: ${removed.join(', ')}</span> for ${typeLabel} <code>${idLabel}</code>`);
                            if (undenied.length)lines.push(`<span style="color:var(--text-muted);">↩ Removed deny: ${undenied.join(', ')}</span> for ${typeLabel} <code>${idLabel}</code>`);
                        }
                        // Removed overwrites
                        for (const old of (c.old_value || [])) {
                            const stillExists = (c.new_value || []).some(nv => nv.id === old.id);
                            if (!stillExists) lines.push(`<span style="color:var(--text-muted);">🗑 Removed overwrite for ${old.type == 1 ? 'User' : 'Role'} <code>${old.id}</code></span>`);
                        }
                        continue;
                    }
                    // Role add/remove (Member Role Update — action 25)
                    if (key === '$add' || key === '$remove') {
                        const roles = Array.isArray(c.new_value) ? c.new_value : (Array.isArray(c.old_value) ? c.old_value : []);
                        const names = roles.map(r => (r && r.name) ? r.name : r).join(', ');
                        const color = key === '$add' ? '#57f287' : '#ed4245';
                        const verb  = key === '$add' ? 'Role added' : 'Role removed';
                        if (names) lines.push(`<span style="color:${color};">${verb}: ${escapeHtml(names)}</span>`);
                        continue;
                    }
                    // Generic field changes
                    function _valStr(v) {
                        if (v === undefined || v === null) return null;
                        if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object') ? (x.name || JSON.stringify(x)) : String(x)).join(', ');
                        if (typeof v === 'object') return v.name || JSON.stringify(v);
                        return String(v);
                    }
                    const oldVal = c.old_value !== undefined ? _valStr(c.old_value) : null;
                    const newVal = c.new_value !== undefined ? _valStr(c.new_value) : null;
                    const label = key.replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase());
                    if (oldVal !== null && newVal !== null) lines.push(`<span style="color:var(--text-muted);">${escapeHtml(label)}:</span> <span style="color:#ed4245;">${escapeHtml(oldVal.slice(0,80))}</span> → <span style="color:#57f287;">${escapeHtml(newVal.slice(0,80))}</span>`);
                    else if (newVal !== null) lines.push(`<span style="color:var(--text-muted);">${escapeHtml(label)}:</span> <span style="color:#57f287;">${escapeHtml(newVal.slice(0,80))}</span>`);
                }
                if (lines.length === 0) return '';
                return `<div style="margin-top:0.35rem;padding:0.4rem 0.6rem;background:rgba(255,255,255,0.03);border-radius:6px;font-size:0.78rem;display:flex;flex-direction:column;gap:0.2rem;">${lines.join('')}</div>`;
            }
            list.innerHTML = entries.map(e => `<div class="channel-item" style="margin-bottom:0.5rem;">
                <div class="channel-info"><div style="width:100%;">
                    <div class="channel-name" style="display:flex;align-items:center;gap:0.5rem;">${escapeHtml(e.action_type)}<span style="color:var(--text-muted);font-size:0.8rem;">${e.timestamp ? new Date(e.timestamp).toLocaleString() : ''}</span></div>
                    <div class="channel-owner">By: <strong>${escapeHtml(e.executor || 'Unknown')}</strong> → ${escapeHtml(e.target || 'N/A')}${e.reason ? ' <span style="color:var(--text-muted);">| ' + escapeHtml(e.reason) + '</span>' : ''}</div>
                    ${renderChanges(e.changes, e.options, e.action_code)}
                </div></div>
            </div>`).join('');
        } catch (e) { list.innerHTML = '<p style="color:var(--text-muted);">Failed to load audit log.</p>'; }
    };

    // ==================== ROLE MANAGER ====================
    let rmRoles = [];

    async function loadRoleManager() {
        if (!selectedGuild) return;
        try {
            const rolesRes = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`);
            const rolesData = await rolesRes.json();
            rmRoles = rolesData.roles || [];
            const bulkSelect = document.getElementById('rm-bulk-role');
            bulkSelect.innerHTML = '<option value="">-- Select Role --</option>' + rmRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
            document.getElementById('rm-member-result').innerHTML = '';
        } catch (e) { console.error('Failed to load role manager:', e); }
    }

    window.cpSearchMember = async function() {
        const query = document.getElementById('rm-search').value.trim();
        if (!query) return showToast('Enter a username or ID', 'error');
        const container = document.getElementById('rm-member-result');
        container.innerHTML = '<p style="color:var(--text-muted);">Searching...</p>';
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/members/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            const members = data.members || [];
            if (members.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);">No members found.</p>'; return; }
            container.innerHTML = members.slice(0, 5).map(m => {
                const memberRoles = (m.roles || []).map(rid => {
                    const role = rmRoles.find(r => r.id === rid);
                    return role ? `<span class="tag-pill">${escapeHtml(role.name)} <button onclick="window.cpRemoveMemberRole('${m.id}','${rid}')">&times;</button></span>` : '';
                }).filter(Boolean).join(' ');
                return `<div class="settings-card" style="margin-bottom:0.75rem;">
                    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
                        <img src="${m.avatar || '/static/images/default-avatar.png'}" style="width:40px;height:40px;border-radius:50%;" alt="">
                        <div><div class="channel-name">${escapeHtml(m.username || m.id)}</div><div class="channel-owner">Joined: ${m.joined_at ? new Date(m.joined_at).toLocaleDateString() : 'Unknown'}</div></div>
                    </div>
                    <div style="margin-bottom:0.5rem;">${memberRoles || '<span style="color:var(--text-muted);">No roles</span>'}</div>
                    <div style="display:flex;gap:0.5rem;">
                        <select class="form-select" id="rm-add-role-${m.id}" style="width:auto;flex:1;">${rmRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}</select>
                        <button class="control-btn primary small" onclick="window.cpAddMemberRole('${m.id}',document.getElementById('rm-add-role-${m.id}').value)">Add Role</button>
                    </div>
                </div>`;
            }).join('');
        } catch (e) { container.innerHTML = '<p style="color:var(--text-muted);">Search failed.</p>'; }
    };

    window.cpAddMemberRole = async function(userId, roleId) {
        if (!roleId) return;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/members/${userId}/roles/${roleId}`, { method: 'PUT' });
            showToast('Role added', 'success'); window.cpSearchMember();
        } catch (e) { showToast('Failed', 'error'); }
    };

    window.cpRemoveMemberRole = async function(userId, roleId) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/members/${userId}/roles/${roleId}`, { method: 'DELETE' });
            showToast('Role removed', 'success'); window.cpSearchMember();
        } catch (e) { showToast('Failed', 'error'); }
    };

    window.cpBulkRoleAction = async function() {
        const roleId = document.getElementById('rm-bulk-role').value;
        const action = document.getElementById('rm-bulk-action').value;
        if (!roleId) return showToast('Select a role', 'error');
        const role = rmRoles.find(r => r.id === roleId);
        if (!confirm(`${action === 'add' ? 'Add' : 'Remove'} "${role?.name}" ${action === 'add' ? 'to' : 'from'} ALL members? This may take a while.`)) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/bulk-role`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role_id: roleId, action, exclude_bots: document.getElementById('rm-exclude-bots').checked })
            });
            const data = await res.json();
            showToast(data.message || 'Bulk action queued', 'success');
        } catch (e) { showToast('Failed', 'error'); }
    };

    // ==================== WARNINGS ====================
    let allWarnings = [];

    async function loadWarnings() {
        if (!selectedGuild) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/warnings`);
            const data = await res.json();
            const settings = data.settings || {};
            document.getElementById('warn-points').value = settings.points_per_warn || 1;
            document.getElementById('warn-mute-threshold').value = settings.mute_threshold || 3;
            document.getElementById('warn-kick-threshold').value = settings.kick_threshold || 5;
            document.getElementById('warn-ban-threshold').value = settings.ban_threshold || 7;
            document.getElementById('warn-expiry').value = settings.expiry_days || 0;
            allWarnings = data.warnings || [];
            renderWarnings(allWarnings);
        } catch (e) { console.error('Failed to load warnings:', e); }
    }

    function renderWarnings(warnings) {
        const list = document.getElementById('warnings-list');
        if (warnings.length === 0) { list.innerHTML = '<p style="color:var(--text-muted);">No active warnings.</p>'; return; }
        list.innerHTML = warnings.map(w => `<div class="channel-item" style="margin-bottom:0.5rem;">
            <div class="channel-info"><div>
                <div class="channel-name">User: ${escapeHtml(w.user_id)} | ${w.points || 1} point(s)</div>
                <div class="channel-owner">${escapeHtml(w.reason || 'No reason')} - by ${escapeHtml(w.moderator_id || 'Unknown')} - ${w.timestamp ? new Date(w.timestamp).toLocaleString() : ''}</div>
            </div></div>
            <button class="control-btn danger small" onclick="window.cpDeleteWarning('${w.id}')">Delete</button>
        </div>`).join('');
    }

    window.cpFilterWarnings = function() {
        const q = (document.getElementById('warn-search').value || '').toLowerCase();
        renderWarnings(q ? allWarnings.filter(w => (w.user_id || '').toLowerCase().includes(q)) : allWarnings);
    };

    window.cpSaveWarnSettings = async function() {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/warnings/settings`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    points_per_warn: parseInt(document.getElementById('warn-points').value) || 1,
                    mute_threshold: parseInt(document.getElementById('warn-mute-threshold').value) || 0,
                    kick_threshold: parseInt(document.getElementById('warn-kick-threshold').value) || 0,
                    ban_threshold: parseInt(document.getElementById('warn-ban-threshold').value) || 0,
                    expiry_days: parseInt(document.getElementById('warn-expiry').value) || 0
                })
            });
            showToast('Warning settings saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    window.cpDeleteWarning = async function(id) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/warnings/${id}`, { method: 'DELETE' });
            showToast('Warning deleted', 'success'); loadWarnings();
        } catch (e) { showToast('Failed', 'error'); }
    };

    window.cpClearAllWarnings = async function() {
        if (!confirm('Clear ALL warnings for this server?')) return;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/warnings/all`, { method: 'DELETE' });
            showToast('All warnings cleared', 'success'); loadWarnings();
        } catch (e) { showToast('Failed', 'error'); }
    };

    // ==================== ANNOUNCEMENTS ====================
    async function loadAnnouncements() {
        if (!selectedGuild) return;
        try {
            const [annRes, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/announcements`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`)
            ]);
            const data = await annRes.json();
            const chData = await chRes.json();
            const channels = (chData.channels || []).filter(c => c.type === 0);
            const chSelect = document.getElementById('announce-channel');
            chSelect.innerHTML = '<option value="">-- Select --</option>' + channels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
            const history = data.history || [];
            const histEl = document.getElementById('announcements-history');
            histEl.innerHTML = history.length === 0
                ? '<p style="color:var(--text-muted);">No announcements sent yet.</p>'
                : history.slice(0, 10).map(a => {
                    const ch = channels.find(c => c.id === a.channel_id);
                    return `<div class="channel-item" style="margin-bottom:0.5rem;">
                        <div class="channel-info"><div>
                            <div class="channel-name">${a.type === 'embed' ? 'Embed' : 'Text'} → ${ch ? '#' + escapeHtml(ch.name) : a.channel_id}</div>
                            <div class="channel-owner">${escapeHtml((a.content || a.title || '').substring(0, 60))} - ${a.timestamp ? new Date(a.timestamp).toLocaleString() : ''}</div>
                        </div></div>
                        <div style="display:flex;gap:0.5rem;">
                            <button class="control-btn secondary small" onclick="window.cpResendAnnouncement('${a.id}')">Resend</button>
                            <button class="control-btn small" style="color:#ed4245;border-color:#ed4245;" onclick="window.cpDeleteAnnouncement('${a.id}')">Delete</button>
                        </div>
                    </div>`;
                }).join('');
        } catch (e) { console.error('Failed to load announcements:', e); }
    }

    window.cpToggleAnnounceType = function() {
        const type = document.getElementById('announce-type').value;
        document.getElementById('announce-text-fields').style.display = type === 'text' ? '' : 'none';
        document.getElementById('announce-embed-fields').style.display = type === 'embed' ? '' : 'none';
    };

    window.cpSendAnnouncement = async function() {
        const channel_id = document.getElementById('announce-channel').value;
        if (!channel_id) return showToast('Select a channel', 'error');
        if (!confirm('Send this announcement?')) return;
        const type = document.getElementById('announce-type').value;
        const payload = { channel_id, type, mention_everyone: document.getElementById('announce-mention-everyone').checked, mention_here: document.getElementById('announce-mention-here').checked };
        if (type === 'text') {
            payload.content = document.getElementById('announce-message').value;
            if (!payload.content) return showToast('Write a message', 'error');
        } else {
            payload.title = document.getElementById('announce-embed-title').value;
            payload.description = document.getElementById('announce-embed-desc').value;
            payload.color = document.getElementById('announce-embed-color').value;
            payload.footer = document.getElementById('announce-embed-footer').value;
            payload.thumbnail = document.getElementById('announce-embed-thumb').value;
            payload.image = document.getElementById('announce-embed-image').value;
            if (!payload.title && !payload.description) return showToast('Title or description required', 'error');
        }
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/announcements`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) { showToast('Announcement sent!', 'success'); loadAnnouncements(); }
            else showToast(data.error || 'Failed to send', 'error');
        } catch (e) { showToast('Failed to send', 'error'); }
    };

    window.cpResendAnnouncement = async function(id) {
        if (!confirm('Resend this announcement?')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/announcements/${id}/resend`, { method: 'POST' });
            const data = await res.json();
            if (data.success) showToast('Resent!', 'success');
            else showToast(data.error || 'Failed', 'error');
        } catch (e) { showToast('Failed', 'error'); }
    };

    window.cpDeleteAnnouncement = async function(id) {
        if (!confirm('Delete this announcement from history?')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/announcements/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) { showToast('Deleted', 'success'); loadAnnouncements(); }
            else showToast(data.error || 'Failed', 'error');
        } catch (e) { showToast('Failed to delete', 'error'); }
    };

    // ==================== COUNTERS ====================
    let counterCategories = [];
    let counterRoles = [];

    async function loadCounters() {
        if (!selectedGuild) return;
        try {
            const [cRes, catRes, roleRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/counters`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/categories`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`)
            ]);
            const cData = await cRes.json();
            const catData = await catRes.json();
            const roleData = await roleRes.json();
            counterCategories = catData.categories || [];
            counterRoles = roleData.roles || [];

            const counters = cData.counters || [];
            const listEl = document.getElementById('counters-list');

            if (counters.length === 0) {
                listEl.innerHTML = '<p style="color:var(--text-muted);">No counters configured yet. Click "Create Counter" to add one.</p>';
                return;
            }

            const typeLabels = {
                total_members: 'Total Members', online_members: 'Online Members', bots: 'Bots',
                humans: 'Humans', roles: 'Roles', channels: 'Channels', boosts: 'Boosts',
                boost_tier: 'Boost Tier', role_members: 'Role Members', youtube_subs: 'YouTube Subs',
                twitch_followers: 'Twitch Followers', goal: 'Custom Goal', date: 'Date', clock: 'Clock'
            };
            const typeIcons = {
                total_members: '👥', online_members: '🟢', bots: '🤖', humans: '🧑',
                roles: '🏷️', channels: '📁', boosts: '🚀', boost_tier: '⭐',
                role_members: '👤', youtube_subs: '▶️', twitch_followers: '💜',
                goal: '🎯', date: '📅', clock: '🕐'
            };
            const intervalLabels = {
                300000: '5 min', 600000: '10 min', 1800000: '30 min', 3600000: '1 hour'
            };

            listEl.innerHTML = counters.map(c => {
                const icon = typeIcons[c.type] || '📊';
                const label = typeLabels[c.type] || c.type;
                const interval = intervalLabels[c.interval] || `${Math.round(c.interval / 60000)} min`;
                const channelStatus = c.channel_id
                    ? `<span style="color:#57f287;font-size:0.8rem;">Active</span>`
                    : `<span style="color:#ed4245;font-size:0.8rem;">No Channel</span>`;
                const editBtn = c.type === 'goal'
                    ? `<button class="control-btn secondary small" onclick="window.cpEditCounterGoal('${c.id}')" style="margin-right:0.5rem;">Edit Goal</button>`
                    : '';
                return `<div class="channel-item" style="margin-bottom:0.5rem;">
                    <div class="channel-info"><div>
                        <div class="channel-name">${icon} ${escapeHtml(c.template || '{count}')}</div>
                        <div class="channel-owner">${escapeHtml(label)} &bull; Updates every ${interval} &bull; ${channelStatus}</div>
                    </div></div>
                    <div style="display:flex;align-items:center;">
                        ${editBtn}
                        <button class="control-btn danger small" onclick="window.cpDeleteCounter('${c.id}')">Delete</button>
                    </div>
                </div>`;
            }).join('');
        } catch (e) {
            console.error('Failed to load counters:', e);
            document.getElementById('counters-list').innerHTML = '<p style="color:#ed4245;">Failed to load counters.</p>';
        }
    }

    window.cpShowCreateCounter = function() {
        const modal = document.getElementById('createCounterModal');
        modal.style.display = 'flex';
        // Populate categories
        const catSelect = document.getElementById('counter-category');
        catSelect.innerHTML = '<option value="">-- No Category --</option>' +
            counterCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        // Populate roles
        const roleSelect = document.getElementById('counter-role');
        roleSelect.innerHTML = '<option value="">-- Select Role --</option>' +
            counterRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
        // Set default template
        document.getElementById('counter-template').value = '';
        document.getElementById('counter-type').value = 'total_members';
        document.getElementById('counter-interval').value = '300000';
        window.cpCounterTypeChanged();
    };

    window.cpCloseCreateCounterModal = function() {
        document.getElementById('createCounterModal').style.display = 'none';
    };

    window.cpCounterTypeChanged = function() {
        const type = document.getElementById('counter-type').value;
        document.getElementById('counter-role-group').style.display = type === 'role_members' ? '' : 'none';
        document.getElementById('counter-youtube-group').style.display = type === 'youtube_subs' ? '' : 'none';
        document.getElementById('counter-twitch-group').style.display = type === 'twitch_followers' ? '' : 'none';
        document.getElementById('counter-goal-group').style.display = type === 'goal' ? '' : 'none';
        document.getElementById('counter-timezone-group').style.display = type === 'clock' ? '' : 'none';
        // Set default template based on type
        const templates = {
            total_members: '📊 {count} Members', online_members: '🟢 {count} Online',
            bots: '🤖 {count} Bots', humans: '🧑 {count} Humans',
            roles: '🏷️ {count} Roles', channels: '📁 {count} Channels',
            boosts: '🚀 {count} Boosts', boost_tier: '⭐ Tier {count}',
            role_members: '👤 {count} in Role', youtube_subs: '▶️ YT: {count} Subs',
            twitch_followers: '💜 Twitch: {count}', goal: '🎯 Goal: {count}',
            date: '📅 {count}', clock: '🕐 {count}'
        };
        const templateInput = document.getElementById('counter-template');
        if (!templateInput.value || Object.values(templates).includes(templateInput.value)) {
            templateInput.value = templates[type] || '{count}';
        }
    };

    window.cpCreateCounter = async function() {
        if (!selectedGuild) return;
        const type = document.getElementById('counter-type').value;
        const template = document.getElementById('counter-template').value.trim();
        const category_id = document.getElementById('counter-category').value;
        const interval = parseInt(document.getElementById('counter-interval').value);

        if (!template) return showToast('Display template is required', 'error');
        if (!template.includes('{count}')) return showToast('Template must include {count}', 'error');

        const extra = {};
        if (type === 'role_members') {
            extra.role_id = document.getElementById('counter-role').value;
            if (!extra.role_id) return showToast('Select a role', 'error');
        }
        if (type === 'youtube_subs') {
            extra.youtube_id = document.getElementById('counter-youtube-id').value.trim();
            if (!extra.youtube_id) return showToast('YouTube Channel ID is required', 'error');
        }
        if (type === 'twitch_followers') {
            extra.twitch_username = document.getElementById('counter-twitch-username').value.trim();
            if (!extra.twitch_username) return showToast('Twitch username is required', 'error');
        }
        if (type === 'goal') {
            extra.current = parseInt(document.getElementById('counter-goal-current').value) || 0;
            extra.target = parseInt(document.getElementById('counter-goal-target').value) || 100;
        }
        if (type === 'clock') {
            extra.timezone = document.getElementById('counter-timezone').value || 'UTC';
        }

        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/counters`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, template, category_id, interval, extra })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Counter created!', 'success');
                window.cpCloseCreateCounterModal();
                loadCounters();
            } else {
                showToast(data.error || 'Failed to create counter', 'error');
            }
        } catch (e) {
            showToast('Failed to create counter', 'error');
        }
    };

    window.cpDeleteCounter = async function(id) {
        if (!selectedGuild) return;
        if (!confirm('Delete this counter? The voice channel will also be removed.')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/counters/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast('Counter deleted', 'success');
                loadCounters();
            } else {
                showToast(data.error || 'Failed to delete', 'error');
            }
        } catch (e) {
            showToast('Failed to delete counter', 'error');
        }
    };

    window.cpEditCounterGoal = async function(id) {
        if (!selectedGuild) return;
        const newCurrent = prompt('Enter new current value:');
        if (newCurrent === null) return;
        const val = parseInt(newCurrent);
        if (isNaN(val) || val < 0) return showToast('Invalid value', 'error');
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/counters/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current: val })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Goal updated', 'success');
                loadCounters();
            } else {
                showToast(data.error || 'Failed to update', 'error');
            }
        } catch (e) {
            showToast('Failed to update goal', 'error');
        }
    };

    // ==================== GUILD DATA CACHE ====================
    async function fetchGuildChannels() {
        if (cachedChannels && Date.now() < cachedChannelsTTL) return cachedChannels;
        if (channelsLoading) return channelsLoading;
        cachedChannels = null;
        channelsLoading = fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`)
            .then(r => r.json())
            .then(data => {
                cachedChannels = data.channels || [];
                cachedChannelsTTL = Date.now() + CACHE_TTL_MS;
                channelsLoading = null;
                return cachedChannels;
            })
            .catch(() => { channelsLoading = null; return []; });
        return channelsLoading;
    }

    window.cpRefreshChannels = async function() {
        cachedChannels = null;
        cachedChannelsTTL = 0;
        cachedRoles = null;
        cachedRolesTTL = 0;
        channelsLoading = null;
        rolesLoading = null;
        await fetchGuildChannels();
        await fetchGuildRoles();
        await loadSectionData(currentSection);
        showToast('Channel list refreshed', 'success');
    };

    async function fetchGuildRoles() {
        if (cachedRoles && Date.now() < cachedRolesTTL) return cachedRoles;
        if (rolesLoading) return rolesLoading;
        cachedRoles = null;
        rolesLoading = fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`)
            .then(r => r.json())
            .then(data => {
                cachedRoles = data.roles || [];
                cachedRolesTTL = Date.now() + CACHE_TTL_MS;
                rolesLoading = null;
                return cachedRoles;
            })
            .catch(() => { rolesLoading = null; return []; });
        return rolesLoading;
    }

    // ==================== SELECT HELPERS ====================
    function populateChannelSelect(selectId, selectedValue) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = '<option value="">Loading...</option>';
        fetchGuildChannels().then(channels => {
            sel.innerHTML = '<option value="">-- Select --</option>';
            channels.forEach(ch => {
                if (ch.type === 0 || ch.type === 5) {
                    const opt = document.createElement('option');
                    opt.value = ch.id;
                    opt.textContent = '#' + ch.name;
                    if (ch.id === selectedValue) opt.selected = true;
                    sel.appendChild(opt);
                }
            });
        });
    }
    function populateRoleSelectGeneric(selectId, selectedValue) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = '<option value="">Loading...</option>';
        fetchGuildRoles().then(roles => {
            sel.innerHTML = '<option value="">-- Select --</option>';
            roles.forEach(r => {
                if (r.name !== '@everyone') {
                    const opt = document.createElement('option');
                    opt.value = r.id;
                    opt.textContent = '@' + r.name;
                    if (r.id === selectedValue) opt.selected = true;
                    sel.appendChild(opt);
                }
            });
        });
    }
    function populateCategorySelect(selectId, selectedValue) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = '<option value="">Loading...</option>';
        fetchGuildChannels().then(channels => {
            sel.innerHTML = '<option value="">-- Select --</option>';
            channels.forEach(ch => {
                if (ch.type === 4) {
                    const opt = document.createElement('option');
                    opt.value = ch.id;
                    opt.textContent = ch.name;
                    if (ch.id === selectedValue) opt.selected = true;
                    sel.appendChild(opt);
                }
            });
        });
    }
    function populateMultiSelect(selectId, items, selectedValues) {
        const container = document.getElementById(selectId);
        if (!container) return;
        const selected = selectedValues || [];
        if (!items || items.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted);padding:0.4rem;font-size:0.85rem;">No items available</div>';
            return;
        }
        container.innerHTML = items.map(item => {
            const label = item.name.startsWith('@') ? item.name : (item.type !== undefined ? '#' + item.name : '@' + item.name);
            const checked = selected.includes(item.id) ? 'checked' : '';
            return `<label class="multi-check-item">
                <input type="checkbox" value="${item.id}" ${checked}>
                <span>${escapeHtml(label)}</span>
            </label>`;
        }).join('');
    }
    function getMultiSelectValues(selectId) {
        const container = document.getElementById(selectId);
        if (!container) return [];
        return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    }

    // ==================== SLOWMODE ====================
    const SLOWMODE_DURATION_OPTIONS = [
        {v:0,l:'Off'},{v:5,l:'5 seconds'},{v:10,l:'10 seconds'},{v:15,l:'15 seconds'},
        {v:30,l:'30 seconds'},{v:60,l:'1 minute'},{v:120,l:'2 minutes'},{v:300,l:'5 minutes'},
        {v:600,l:'10 minutes'},{v:900,l:'15 minutes'},{v:1800,l:'30 minutes'},
        {v:3600,l:'1 hour'},{v:7200,l:'2 hours'},{v:21600,l:'6 hours'}
    ];

    function _smDurationSelect(selected) {
        return SLOWMODE_DURATION_OPTIONS.map(o =>
            `<option value="${o.v}"${o.v === selected ? ' selected' : ''}>${o.l}</option>`
        ).join('');
    }

    const SLOWMODE_OFF_AFTER_OPTIONS = [
        {v:30,l:'30 seconds'},{v:60,l:'1 minute'},{v:120,l:'2 minutes'},
        {v:300,l:'5 minutes'},{v:600,l:'10 minutes'},{v:900,l:'15 minutes'},
        {v:1800,l:'30 minutes'},{v:3600,l:'1 hour'}
    ];
    function _smOffAfterSelect(selected) {
        return SLOWMODE_OFF_AFTER_OPTIONS.map(o =>
            `<option value="${o.v}"${o.v === selected ? ' selected' : ''}>${o.l}</option>`
        ).join('');
    }

    async function loadSlowmode() {
        try {
            const [res, roles] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/slowmode`),
                fetchGuildRoles()
            ]);
            const data = await res.json();
            const channels = data.channels || [];
            const container = document.getElementById('slowmode-channels-list');
            container.innerHTML = '';
            if (channels.length === 0) {
                await addSlowmodeChannel(null, roles);
            } else {
                for (const ch of channels) {
                    await addSlowmodeChannel(ch, roles);
                }
            }
        } catch (e) { showToast('Failed to load slowmode', 'error'); }
    }

    window.addSlowmodeChannel = async function(data = null, roles = null) {
        if (!roles) roles = await fetchGuildRoles();
        const container = document.getElementById('slowmode-channels-list');
        const card = document.createElement('div');
        card.className = 'settings-card slowmode-channel-card';
        card.style.marginBottom = '1rem';
        const autoEnabled = data?.auto_enabled || false;
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <h4 style="margin:0;font-size:1rem;">Channel Configuration</h4>
                <button class="control-btn small btn-danger" onclick="removeSlowmodeChannel(this)">Remove</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Target Channel</label>
                    <select class="form-select sm-channel"><option value="">-- Select Channel --</option></select>
                </div>
                <div class="form-group">
                    <label>Manual Slowmode Duration</label>
                    <select class="form-select sm-duration">${_smDurationSelect(data?.duration || 0)}</select>
                </div>
            </div>
            <div style="margin-top:.75rem;">
                <button class="control-btn secondary small" onclick="applyManualSlowmode(this)">Apply Slowmode Now</button>
            </div>
            <div class="settings-row" style="margin-top:1.25rem;">
                <div class="settings-info"><h4>Auto-Slowmode on Spam</h4><p>Bot automatically enables slowmode when spam is detected in this channel</p></div>
                <label class="toggle"><input type="checkbox" class="sm-auto-enabled" onchange="toggleSmAutoSettings(this)"${autoEnabled ? ' checked' : ''}><span class="toggle-slider"></span></label>
            </div>
            <div class="sm-auto-settings"${autoEnabled ? '' : ' style="display:none"'}>
                <div class="form-row" style="margin-top:1rem;">
                    <div class="form-group">
                        <label>Spam Threshold (messages / 10s)</label>
                        <input type="number" class="form-input sm-auto-threshold" value="${data?.auto_threshold ?? 10}" min="2" max="100">
                    </div>
                    <div class="form-group">
                        <label>Slowmode Rate (seconds between messages)</label>
                        <input type="number" class="form-input sm-auto-duration" value="${data?.auto_duration ?? 30}" min="1" max="21600">
                    </div>
                </div>
                <div class="form-row" style="margin-top:1rem;">
                    <div class="form-group">
                        <label>Keep Slowmode On For</label>
                        <select class="form-select sm-auto-off-after">${_smOffAfterSelect(data?.auto_off_after ?? 60)}</select>
                    </div>
                </div>
                <div class="form-group" style="margin-top:1rem;">
                    <label>Exempt Roles <span style="font-size:.8em;opacity:.6">(these roles won't count toward the threshold)</span></label>
                    <div class="multi-check-list sm-exempt-roles"></div>
                </div>
            </div>
            <div style="margin-top:1rem;">
                <button class="control-btn primary" onclick="saveSlowmodeChannel(this)">Save</button>
            </div>`;

        // Populate channel select
        const chSelect = card.querySelector('.sm-channel');
        const allChannels = await fetchGuildChannels();
        (allChannels || []).filter(c => c.type === 0 || c.type === 5).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `# ${c.name}`;
            if (c.id === data?.channel) opt.selected = true;
            chSelect.appendChild(opt);
        });

        // Populate exempt roles
        const rolesList = (roles || []).filter(r => r.name !== '@everyone');
        const exemptContainer = card.querySelector('.sm-exempt-roles');
        rolesList.forEach(role => {
            const checked = (data?.exempt_roles || []).includes(role.id);
            const item = document.createElement('label');
            item.className = 'multi-check-item';
            item.innerHTML = `<input type="checkbox" value="${role.id}"${checked ? ' checked' : ''}><span class="role-dot" style="background:${role.color ? '#' + role.color.toString(16).padStart(6,'0') : '#99aab5'}"></span>${role.name}`;
            exemptContainer.appendChild(item);
        });

        container.appendChild(card);
    };

    window.toggleSmAutoSettings = function(checkbox) {
        const settings = checkbox.closest('.slowmode-channel-card').querySelector('.sm-auto-settings');
        settings.style.display = checkbox.checked ? '' : 'none';
    };

    window.removeSlowmodeChannel = function(btn) {
        btn.closest('.slowmode-channel-card').remove();
        window.cpSaveSlowmode?.();
    };

    window.applyManualSlowmode = async function(btn) {
        const card = btn.closest('.slowmode-channel-card');
        const channelId = card.querySelector('.sm-channel').value;
        const duration = Number(card.querySelector('.sm-duration').value);
        if (!channelId) { showToast('Select a channel first', 'error'); return; }
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/slowmode/apply`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ channel: channelId, duration })
            });
            const data = await res.json();
            if (data.success) showToast(`Slowmode ${duration > 0 ? 'set to ' + formatDuration(duration) : 'disabled'}!`, 'success');
            else showToast(data.error || 'Failed to apply slowmode', 'error');
        } catch (e) { showToast('Failed to apply slowmode', 'error'); }
    };

    window.saveSlowmodeChannel = async function() {
        await window.cpSaveSlowmode?.();
    };

    window.cpSaveSlowmode = async function() {
        try {
            const cards = document.querySelectorAll('.slowmode-channel-card');
            const channels = [];
            cards.forEach(card => {
                const channel = card.querySelector('.sm-channel')?.value;
                if (!channel) return;
                const exemptRoles = [];
                card.querySelectorAll('.sm-exempt-roles input[type=checkbox]:checked').forEach(cb => exemptRoles.push(cb.value));
                channels.push({
                    channel,
                    duration: Number(card.querySelector('.sm-duration')?.value || 0),
                    auto_enabled: card.querySelector('.sm-auto-enabled')?.checked || false,
                    auto_threshold: Number(card.querySelector('.sm-auto-threshold')?.value || 10),
                    auto_duration: Number(card.querySelector('.sm-auto-duration')?.value || 30),
                    auto_off_after: Number(card.querySelector('.sm-auto-off-after')?.value || 60),
                    exempt_roles: exemptRoles
                });
            });
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/slowmode`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ channels })
            });
            const data = await res.json();
            if (data.success) showToast('Slowmode settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save slowmode', 'error'); }
    };

    function formatDuration(seconds) {
        if (seconds >= 3600) return (seconds / 3600) + ' hour' + (seconds >= 7200 ? 's' : '');
        if (seconds >= 60) return (seconds / 60) + ' minute' + (seconds >= 120 ? 's' : '');
        return seconds + ' second' + (seconds !== 1 ? 's' : '');
    }

    // ==================== LOCKDOWN ====================
    async function loadLockdown() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/lockdown`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('lockdown-active').checked = s.active || false;
            document.getElementById('lockdown-all').checked = s.lock_all || false;
            document.getElementById('lockdown-message').value = s.message || '';
            document.getElementById('lockdown-auto-unlock').checked = s.auto_unlock || false;
            document.getElementById('lockdown-duration').value = s.duration || '';
            document.getElementById('lockdown-dm-users').checked = s.dm_users || false;
            const channels = await fetchGuildChannels();
            populateMultiSelect('lockdown-channels', (channels || []).filter(c => c.type === 0 || c.type === 5), s.channels || []);
            const roles = await fetchGuildRoles();
            populateMultiSelect('lockdown-exempt-roles', (roles || []).filter(r => r.name !== '@everyone'), s.exempt_roles || []);
        } catch (e) { showToast('Failed to load lockdown', 'error'); }
    }
    window.cpSaveLockdown = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/lockdown`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    active: document.getElementById('lockdown-active').checked,
                    channels: getMultiSelectValues('lockdown-channels'),
                    lock_all: document.getElementById('lockdown-all').checked,
                    message: document.getElementById('lockdown-message').value,
                    auto_unlock: document.getElementById('lockdown-auto-unlock').checked,
                    duration: document.getElementById('lockdown-duration').value,
                    exempt_roles: getMultiSelectValues('lockdown-exempt-roles'),
                    dm_users: document.getElementById('lockdown-dm-users').checked
                })
            });
            const data = await res.json();
            if (data.success) showToast('Lockdown settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save lockdown', 'error'); }
    };
    window.cpLockdown = async function() {
        try {
            showToast('Activating lockdown...', 'info');
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/lockdown/activate`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'
            });
            const data = await res.json();
            if (data.success) { showToast(`Lockdown activated! Locked ${data.locked || 0} channel(s)${data.failed ? `, ${data.failed} failed` : ''}`, 'success'); loadLockdown(); }
            else showToast(data.error || 'Failed to activate', 'error');
        } catch (e) { showToast('Failed to activate lockdown', 'error'); }
    };
    window.cpUnlockAll = async function() {
        try {
            showToast('Deactivating lockdown...', 'info');
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/lockdown/deactivate`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'
            });
            const data = await res.json();
            if (data.success) { showToast(`Lockdown deactivated! Unlocked ${data.unlocked || 0} channel(s)`, 'success'); loadLockdown(); }
            else showToast(data.error || 'Failed to deactivate', 'error');
        } catch (e) { showToast('Failed to deactivate lockdown', 'error'); }
    };

    // ==================== PURGE ====================
    async function loadPurge() {
        try {
            populateChannelSelect('purge-channel', '');
        } catch (e) { showToast('Failed to load purge', 'error'); }
    }
    window.cpPurgeMessages = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/purge/execute`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    channel: document.getElementById('purge-channel').value,
                    count: Number(document.getElementById('purge-count').value),
                    filter: document.getElementById('purge-filter').value,
                    user_id: document.getElementById('purge-user-id').value,
                    text: document.getElementById('purge-text').value,
                    log: document.getElementById('purge-log').checked
                })
            });
            const data = await res.json();
            if (data.success) showToast(`Purged ${data.deleted || ''} messages!`, 'success');
            else showToast(data.error || 'Failed to purge', 'error');
        } catch (e) { showToast('Failed to purge messages', 'error'); }
    };

    // ==================== NICKNAMES ====================
    async function loadNicknames() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/nicknames`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('nicknames-filter-enabled').checked = s.filter_enabled || false;
            document.getElementById('nicknames-block-special').checked = s.block_special || false;
            document.getElementById('nicknames-block-zalgo').checked = s.block_zalgo || false;
            document.getElementById('nicknames-block-hoist').checked = s.block_hoist || false;
            document.getElementById('nicknames-blocked-words').value = (s.blocked_words || []).join('\n');
            document.getElementById('nicknames-default').value = s.default_nickname || '';
            document.getElementById('nicknames-action').value = s.action || 'rename';
            const roles = await fetchGuildRoles();
            populateMultiSelect('nicknames-exempt-roles', (roles || []).filter(r => r.name !== '@everyone'), s.exempt_roles || []);
        } catch (e) { showToast('Failed to load nicknames', 'error'); }
    }
    window.cpSaveNicknames = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/nicknames`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    filter_enabled: document.getElementById('nicknames-filter-enabled').checked,
                    block_special: document.getElementById('nicknames-block-special').checked,
                    block_zalgo: document.getElementById('nicknames-block-zalgo').checked,
                    block_hoist: document.getElementById('nicknames-block-hoist').checked,
                    blocked_words: document.getElementById('nicknames-blocked-words').value.split('\n').filter(l => l.trim()),
                    default_nickname: document.getElementById('nicknames-default').value,
                    action: document.getElementById('nicknames-action').value,
                    exempt_roles: getMultiSelectValues('nicknames-exempt-roles')
                })
            });
            const data = await res.json();
            if (data.success) showToast('Nickname settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save nicknames', 'error'); }
    };
    window.cpBulkRename = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/nicknames/bulk-rename`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    search: document.getElementById('nicknames-bulk-search').value,
                    replace: document.getElementById('nicknames-bulk-replace').value
                })
            });
            const data = await res.json();
            if (data.success) showToast(`Renamed ${data.count || 0} members!`, 'success');
            else showToast(data.error || 'Failed to bulk rename', 'error');
        } catch (e) { showToast('Failed to bulk rename', 'error'); }
    };

    // ==================== INVITE TRACKER ====================
    async function loadInviteTracker() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/invite-tracker`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('invites-enabled').checked = s.enabled || false;
            populateChannelSelect('invites-log-channel', s.log_channel);
            document.getElementById('invites-show-on-join').checked = s.show_on_join || false;
            document.getElementById('invites-track-fake').checked = s.track_fake || false;
            document.getElementById('invites-min-age').value = s.min_age || 0;
            const roles = await fetchGuildRoles();
            populateMultiSelect('invites-exempt-roles', (roles || []).filter(r => r.name !== '@everyone'), s.exempt_roles || []);
            // Load leaderboard
            try {
                const lbRes = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/invite-tracker/leaderboard`);
                const lb = await lbRes.json();
                const list = document.getElementById('invites-leaderboard');
                if (list) {
                    list.innerHTML = (lb.leaderboard || []).map((e, i) =>
                        `<div class="list-item"><span>#${i + 1} ${escapeHtml(e.username || e.user_id)}</span><span>${e.invites || 0} invites</span></div>`
                    ).join('') || '<div class="text-muted">No invite data yet</div>';
                }
            } catch (e) {}
        } catch (e) { showToast('Failed to load invite tracker', 'error'); }
    }
    window.cpSaveInviteTracker = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/invite-tracker`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('invites-enabled').checked,
                    log_channel: document.getElementById('invites-log-channel').value,
                    show_on_join: document.getElementById('invites-show-on-join').checked,
                    track_fake: document.getElementById('invites-track-fake').checked,
                    min_age: Number(document.getElementById('invites-min-age').value),
                    exempt_roles: getMultiSelectValues('invites-exempt-roles')
                })
            });
            const data = await res.json();
            if (data.success) showToast('Invite tracker settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save invite tracker', 'error'); }
    };

    // ==================== ALT DETECTION ====================
    async function loadAltDetection() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/alt-detection`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('alt-enabled').checked = s.enabled || false;
            document.getElementById('alt-min-age').value = s.min_age || 7;
            document.getElementById('alt-action').value = s.action || 'alert';
            populateChannelSelect('alt-alert-channel', s.alert_channel);
            document.getElementById('alt-auto-quarantine').checked = s.auto_quarantine || false;
            document.getElementById('alt-creation-threshold').value = s.creation_threshold || 24;
            document.getElementById('alt-check-usernames').checked = s.check_usernames || false;
            const roles = await fetchGuildRoles();
            populateMultiSelect('alt-exempt-roles', (roles || []).filter(r => r.name !== '@everyone'), s.exempt_roles || []);
        } catch (e) { showToast('Failed to load alt detection', 'error'); }
    }
    window.cpSaveAltDetection = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/alt-detection`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('alt-enabled').checked,
                    min_age: Number(document.getElementById('alt-min-age').value),
                    action: document.getElementById('alt-action').value,
                    alert_channel: document.getElementById('alt-alert-channel').value,
                    auto_quarantine: document.getElementById('alt-auto-quarantine').checked,
                    creation_threshold: Number(document.getElementById('alt-creation-threshold').value),
                    check_usernames: document.getElementById('alt-check-usernames').checked,
                    exempt_roles: getMultiSelectValues('alt-exempt-roles')
                })
            });
            const data = await res.json();
            if (data.success) showToast('Alt detection settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save alt detection', 'error'); }
    };

    // ==================== ANTI-PHISHING ====================
    async function loadAntiPhishing() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/anti-phishing`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('phishing-enabled').checked = s.enabled || false;
            document.getElementById('phishing-action').value = s.action || 'delete';
            document.getElementById('phishing-mute-duration').value = s.mute_duration || 60;
            document.getElementById('phishing-external-db').checked = s.external_db !== false;
            document.getElementById('phishing-custom-domains').value = (s.custom_domains || []).join('\n');
            document.getElementById('phishing-block-impersonation').checked = s.block_impersonation || false;
            document.getElementById('phishing-block-shorteners').checked = s.block_shorteners || false;
            document.getElementById('phishing-log').checked = s.log || false;
            populateChannelSelect('phishing-log-channel', s.log_channel);
            const roles = await fetchGuildRoles();
            populateMultiSelect('phishing-exempt-roles', (roles || []).filter(r => r.name !== '@everyone'), s.exempt_roles || []);
        } catch (e) { showToast('Failed to load anti-phishing', 'error'); }
    }
    window.cpSaveAntiPhishing = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/anti-phishing`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('phishing-enabled').checked,
                    action: document.getElementById('phishing-action').value,
                    mute_duration: Number(document.getElementById('phishing-mute-duration').value),
                    external_db: document.getElementById('phishing-external-db').checked,
                    custom_domains: document.getElementById('phishing-custom-domains').value.split('\n').filter(l => l.trim()),
                    block_impersonation: document.getElementById('phishing-block-impersonation').checked,
                    block_shorteners: document.getElementById('phishing-block-shorteners').checked,
                    log: document.getElementById('phishing-log').checked,
                    log_channel: document.getElementById('phishing-log-channel').value,
                    exempt_roles: getMultiSelectValues('phishing-exempt-roles')
                })
            });
            const data = await res.json();
            if (data.success) showToast('Anti-phishing settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save anti-phishing', 'error'); }
    };

    // ==================== WORD FILTER ====================
    async function loadWordFilter() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/word-filter`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('wordfilter-enabled').checked = s.enabled || false;
            document.getElementById('wordfilter-words').value = (s.words || []).join('\n');
            document.getElementById('wordfilter-regex').value = (s.regex || []).join('\n');
            document.getElementById('wordfilter-nicknames').checked = s.filter_nicknames || false;
            document.getElementById('wordfilter-status').checked = s.filter_status || false;
            document.getElementById('wordfilter-wildcard').checked = s.wildcard || false;
            document.getElementById('wordfilter-action').value = s.action || 'delete';
            document.getElementById('wordfilter-warn-message').value = s.warn_message || '';
            document.getElementById('wordfilter-log').checked = s.log || false;
            populateChannelSelect('wordfilter-log-channel', s.log_channel);
            const channels = await fetchGuildChannels();
            const roles = await fetchGuildRoles();
            populateMultiSelect('wordfilter-exempt-channels', (channels || []).filter(c => c.type === 0), s.exempt_channels || []);
            populateMultiSelect('wordfilter-exempt-roles', (roles || []).filter(r => r.name !== '@everyone'), s.exempt_roles || []);
        } catch (e) { showToast('Failed to load word filter', 'error'); }
    }
    window.cpSaveWordFilter = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/word-filter`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('wordfilter-enabled').checked,
                    words: document.getElementById('wordfilter-words').value.split('\n').filter(l => l.trim()),
                    regex: document.getElementById('wordfilter-regex').value.split('\n').filter(l => l.trim()),
                    filter_nicknames: document.getElementById('wordfilter-nicknames').checked,
                    filter_status: document.getElementById('wordfilter-status').checked,
                    wildcard: document.getElementById('wordfilter-wildcard').checked,
                    action: document.getElementById('wordfilter-action').value,
                    warn_message: document.getElementById('wordfilter-warn-message').value,
                    exempt_channels: getMultiSelectValues('wordfilter-exempt-channels'),
                    exempt_roles: getMultiSelectValues('wordfilter-exempt-roles'),
                    log: document.getElementById('wordfilter-log').checked,
                    log_channel: document.getElementById('wordfilter-log-channel').value
                })
            });
            const data = await res.json();
            if (data.success) showToast('Word filter settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save word filter', 'error'); }
    };

    // ==================== MENTION PROTECTION ====================
    async function loadMentionProtection() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/mention-protection`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('mentions-enabled').checked = s.enabled || false;
            document.getElementById('mentions-max').value = s.max_mentions || 5;
            document.getElementById('mentions-max-roles').value = s.max_role_mentions || 3;
            document.getElementById('mentions-block-everyone').checked = s.block_everyone || false;
            document.getElementById('mentions-action').value = s.action || 'mute';
            document.getElementById('mentions-mute-duration').value = s.mute_duration || 300;
            document.getElementById('mentions-escalate').checked = s.escalate || false;
            document.getElementById('mentions-log').checked = s.log || false;
            populateChannelSelect('mentions-log-channel', s.log_channel);
            const roles = await fetchGuildRoles();
            populateMultiSelect('mentions-exempt-roles', (roles || []).filter(r => r.name !== '@everyone'), s.exempt_roles || []);
        } catch (e) { showToast('Failed to load mention protection', 'error'); }
    }
    window.cpSaveMentionProtection = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/mention-protection`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('mentions-enabled').checked,
                    max_mentions: Number(document.getElementById('mentions-max').value),
                    max_role_mentions: Number(document.getElementById('mentions-max-roles').value),
                    block_everyone: document.getElementById('mentions-block-everyone').checked,
                    action: document.getElementById('mentions-action').value,
                    mute_duration: Number(document.getElementById('mentions-mute-duration').value),
                    escalate: document.getElementById('mentions-escalate').checked,
                    exempt_roles: getMultiSelectValues('mentions-exempt-roles'),
                    log: document.getElementById('mentions-log').checked,
                    log_channel: document.getElementById('mentions-log-channel').value
                })
            });
            const data = await res.json();
            if (data.success) showToast('Mention protection settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save mention protection', 'error'); }
    };

    // ==================== VERIFICATION ====================
    async function loadVerification() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/verification`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('verify-enabled').checked = s.enabled || false;
            document.getElementById('verify-type').value = s.type || 'button';
            populateRoleSelectGeneric('verify-role', s.role);
            populateRoleSelectGeneric('verify-unverified-role', s.unverified_role);
            populateChannelSelect('verify-channel', s.channel);
            document.getElementById('verify-message').value = s.message || '';
            document.getElementById('verify-question').value = s.question || '';
            document.getElementById('verify-answer').value = s.answer || '';
            document.getElementById('verify-color').value = s.color || '#5865f2';
            document.getElementById('verify-log').checked = s.log || false;
            populateChannelSelect('verify-log-channel', s.log_channel);
            document.getElementById('verify-timeout').value = s.timeout || 300;
        } catch (e) { showToast('Failed to load verification', 'error'); }
    }
    window.cpSaveVerification = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/verification`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('verify-enabled').checked,
                    type: document.getElementById('verify-type').value,
                    role: document.getElementById('verify-role').value,
                    unverified_role: document.getElementById('verify-unverified-role').value,
                    channel: document.getElementById('verify-channel').value,
                    message: document.getElementById('verify-message').value,
                    question: document.getElementById('verify-question').value,
                    answer: document.getElementById('verify-answer').value,
                    color: document.getElementById('verify-color').value,
                    log: document.getElementById('verify-log').checked,
                    log_channel: document.getElementById('verify-log-channel').value,
                    timeout: Number(document.getElementById('verify-timeout').value)
                })
            });
            const data = await res.json();
            if (data.success) showToast('Verification settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save verification', 'error'); }
    };
    window.cpSendVerifyPanel = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/verification/send-panel`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'
            });
            const data = await res.json();
            if (data.success) showToast('Verification panel sent!', 'success');
            else showToast(data.error || 'Failed to send panel', 'error');
        } catch (e) { showToast('Failed to send verification panel', 'error'); }
    };

    // ==================== QUARANTINE ====================
    async function loadQuarantine() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/quarantine`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('quarantine-enabled').checked = s.enabled || false;
            populateRoleSelectGeneric('quarantine-role', s.role);
            populateChannelSelect('quarantine-channel', s.channel);
            document.getElementById('quarantine-message').value = s.message || '';
            document.getElementById('quarantine-auto-new').checked = s.auto_new || false;
            document.getElementById('quarantine-age-threshold').value = s.age_threshold || 7;
            document.getElementById('quarantine-auto-flagged').checked = s.auto_flagged || false;
            document.getElementById('quarantine-notify').checked = s.notify || false;
            populateChannelSelect('quarantine-notify-channel', s.notify_channel);
            const roles = await fetchGuildRoles();
            populateMultiSelect('quarantine-exempt-roles', (roles || []).filter(r => r.name !== '@everyone'), s.exempt_roles || []);
            // Load quarantined members
            try {
                const mRes = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/quarantine/members`);
                const members = await mRes.json();
                const list = document.getElementById('quarantine-members-list');
                if (list) {
                    list.innerHTML = (members.members || []).map(m =>
                        `<div class="list-item"><span>${escapeHtml(m.username || m.user_id)}</span><span>${m.reason || 'No reason'}</span></div>`
                    ).join('') || '<div class="text-muted">No quarantined members</div>';
                }
            } catch (e) {}
        } catch (e) { showToast('Failed to load quarantine', 'error'); }
    }
    window.cpSaveQuarantine = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/quarantine`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('quarantine-enabled').checked,
                    role: document.getElementById('quarantine-role').value,
                    channel: document.getElementById('quarantine-channel').value,
                    message: document.getElementById('quarantine-message').value,
                    auto_new: document.getElementById('quarantine-auto-new').checked,
                    age_threshold: Number(document.getElementById('quarantine-age-threshold').value),
                    auto_flagged: document.getElementById('quarantine-auto-flagged').checked,
                    notify: document.getElementById('quarantine-notify').checked,
                    notify_channel: document.getElementById('quarantine-notify-channel').value,
                    exempt_roles: getMultiSelectValues('quarantine-exempt-roles')
                })
            });
            const data = await res.json();
            if (data.success) showToast('Quarantine settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save quarantine', 'error'); }
    };

    // ==================== ANTI-NUKE ====================
    async function loadAntiNuke() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/anti-nuke`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('antinuke-enabled').checked = s.enabled || false;
            document.getElementById('antinuke-max-channel-delete').value = s.max_channel_delete || 3;
            document.getElementById('antinuke-max-channel-create').value = s.max_channel_create || 5;
            document.getElementById('antinuke-max-role-delete').value = s.max_role_delete || 3;
            document.getElementById('antinuke-max-role-create').value = s.max_role_create || 5;
            document.getElementById('antinuke-max-bans').value = s.max_bans || 5;
            document.getElementById('antinuke-max-kicks').value = s.max_kicks || 5;
            document.getElementById('antinuke-action').value = s.action || 'ban';
            document.getElementById('antinuke-protect-icon').checked = s.protect_icon || false;
            document.getElementById('antinuke-protect-name').checked = s.protect_name || false;
            document.getElementById('antinuke-protect-vanity').checked = s.protect_vanity || false;
            document.getElementById('antinuke-whitelist').value = (s.whitelist || []).join('\n');
            document.getElementById('antinuke-notify-owner').checked = s.notify_owner !== false;
            populateChannelSelect('antinuke-alert-channel', s.alert_channel);
        } catch (e) { showToast('Failed to load anti-nuke', 'error'); }
    }
    window.cpSaveAntiNuke = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/anti-nuke`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('antinuke-enabled').checked,
                    max_channel_delete: Number(document.getElementById('antinuke-max-channel-delete').value),
                    max_channel_create: Number(document.getElementById('antinuke-max-channel-create').value),
                    max_role_delete: Number(document.getElementById('antinuke-max-role-delete').value),
                    max_role_create: Number(document.getElementById('antinuke-max-role-create').value),
                    max_bans: Number(document.getElementById('antinuke-max-bans').value),
                    max_kicks: Number(document.getElementById('antinuke-max-kicks').value),
                    action: document.getElementById('antinuke-action').value,
                    protect_icon: document.getElementById('antinuke-protect-icon').checked,
                    protect_name: document.getElementById('antinuke-protect-name').checked,
                    protect_vanity: document.getElementById('antinuke-protect-vanity').checked,
                    whitelist: document.getElementById('antinuke-whitelist').value.split('\n').filter(l => l.trim()),
                    notify_owner: document.getElementById('antinuke-notify-owner').checked,
                    alert_channel: document.getElementById('antinuke-alert-channel').value
                })
            });
            const data = await res.json();
            if (data.success) showToast('Anti-nuke settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save anti-nuke', 'error'); }
    };

    // ==================== MODMAIL ====================
    async function loadModmail() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/modmail`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('modmail-enabled').checked = s.enabled || false;
            populateCategorySelect('modmail-category', s.category);
            populateRoleSelectGeneric('modmail-staff-role', s.staff_role);
            document.getElementById('modmail-welcome-msg').value = s.welcome_msg || '';
            document.getElementById('modmail-close-msg').value = s.close_msg || '';
            document.getElementById('modmail-anonymous').checked = s.anonymous || false;
            document.getElementById('modmail-log-transcripts').checked = s.log_transcripts || false;
            populateChannelSelect('modmail-transcript-channel', s.transcript_channel);
            document.getElementById('modmail-auto-close').checked = s.auto_close || false;
            document.getElementById('modmail-auto-close-hours').value = s.auto_close_hours || 48;
            populateChannelSelect('modmail-panel-channel', s.panel_channel);
        } catch (e) { showToast('Failed to load modmail', 'error'); }
    }
    window.cpSaveModmail = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/modmail`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('modmail-enabled').checked,
                    category: document.getElementById('modmail-category').value,
                    staff_role: document.getElementById('modmail-staff-role').value,
                    welcome_msg: document.getElementById('modmail-welcome-msg').value,
                    close_msg: document.getElementById('modmail-close-msg').value,
                    anonymous: document.getElementById('modmail-anonymous').checked,
                    log_transcripts: document.getElementById('modmail-log-transcripts').checked,
                    transcript_channel: document.getElementById('modmail-transcript-channel').value,
                    auto_close: document.getElementById('modmail-auto-close').checked,
                    auto_close_hours: Number(document.getElementById('modmail-auto-close-hours').value)
                })
            });
            const data = await res.json();
            if (data.success) showToast('Modmail settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save modmail', 'error'); }
    };
    window.cpSendModmailPanel = async function() {
        const channelId = document.getElementById('modmail-panel-channel').value;
        if (!channelId) { showToast('Please select a channel to send the panel to', 'error'); return; }
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/modmail/send-panel`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ channel_id: channelId })
            });
            const data = await res.json();
            if (data.success) showToast('Modmail panel sent!', 'success');
            else showToast(data.error || 'Failed to send panel', 'error');
        } catch (e) { showToast('Failed to send modmail panel', 'error'); }
    };

    // ==================== REPORTS ====================
    async function loadReports() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reports`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('reports-enabled').checked = s.enabled || false;
            populateChannelSelect('reports-channel', s.channel);
            populateRoleSelectGeneric('reports-staff-role', s.staff_role);
            document.getElementById('reports-anonymous').checked = s.anonymous || false;
            document.getElementById('reports-dm-updates').checked = s.dm_updates || false;
            document.getElementById('reports-categories').value = (s.categories || []).join('\n');
            document.getElementById('reports-cooldown').value = s.cooldown || 60;
            // Load reports list
            try {
                const lRes = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reports/list`);
                const list = await lRes.json();
                const el = document.getElementById('reports-list');
                if (el) {
                    el.innerHTML = (list.reports || []).map(r =>
                        `<div class="list-item"><span>#${r.id} - ${escapeHtml(r.category || 'General')}</span><span class="badge">${r.status || 'open'}</span></div>`
                    ).join('') || '<div class="text-muted">No reports</div>';
                }
            } catch (e) {}
        } catch (e) { showToast('Failed to load reports', 'error'); }
    }
    window.cpSaveReports = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reports`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('reports-enabled').checked,
                    channel: document.getElementById('reports-channel').value,
                    staff_role: document.getElementById('reports-staff-role').value,
                    anonymous: document.getElementById('reports-anonymous').checked,
                    dm_updates: document.getElementById('reports-dm-updates').checked,
                    categories: document.getElementById('reports-categories').value.split('\n').filter(l => l.trim()),
                    cooldown: Number(document.getElementById('reports-cooldown').value)
                })
            });
            const data = await res.json();
            if (data.success) showToast('Reports settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save reports', 'error'); }
    };

    // ==================== BAN APPEALS ====================
    async function loadBanAppeals() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/ban-appeals`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('appeals-enabled').checked = s.enabled || false;
            populateChannelSelect('appeals-channel', s.channel);
            populateRoleSelectGeneric('appeals-review-role', s.review_role);
            document.getElementById('appeals-questions').value = (s.questions || []).join('\n');
            document.getElementById('appeals-min-days').value = s.min_days ?? 7;
            document.getElementById('appeals-max-per-user').value = s.max_per_user || 1;
            document.getElementById('appeals-dm-user').checked = s.dm_user || false;
        } catch (e) { showToast('Failed to load ban appeals', 'error'); }

        // Load appeals list
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/appeal/list`);
            const appeals = await res.json();
            const list = document.getElementById('appeals-list');
            if (!list) return;
            if (!appeals || appeals.length === 0) {
                list.innerHTML = '<div class="text-muted">No appeals submitted yet</div>';
                return;
            }
            list.innerHTML = appeals.sort((a, b) => (b.submitted_at || 0) - (a.submitted_at || 0)).map(a => {
                const date = a.submitted_at ? new Date(a.submitted_at * 1000).toLocaleString() : 'Unknown';
                const statusColor = a.status === 'approved' ? '#57F287' : a.status === 'declined' ? '#ED4245' : '#FEE75C';
                const statusLabel = (a.status || 'pending').charAt(0).toUpperCase() + (a.status || 'pending').slice(1);
                let actions = '';
                if (a.status === 'pending') {
                    actions = `<div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                        <button class="control-btn success" style="font-size:0.8rem;padding:0.3rem 0.75rem;" onclick="window.cpReviewAppeal('${a.id}','approve')">Approve</button>
                        <button class="control-btn danger" style="font-size:0.8rem;padding:0.3rem 0.75rem;" onclick="window.cpReviewAppeal('${a.id}','decline')">Decline</button>
                    </div>`;
                }
                return `<div class="list-item" style="flex-direction:column;align-items:flex-start;gap:0.5rem;">
                    <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
                        <strong>${escapeHtml(a.username || a.user_id)}</strong>
                        <span style="color:${statusColor};font-size:0.85rem;font-weight:600;">${statusLabel}</span>
                    </div>
                    <div style="color:rgba(255,255,255,0.5);font-size:0.85rem;">Case #${a.case_id || '?'} &bull; ${date}</div>
                    <div style="color:rgba(255,255,255,0.7);font-size:0.9rem;">${escapeHtml(a.message || '').substring(0, 200)}</div>
                    ${actions}
                </div>`;
            }).join('');
        } catch (e) {}
    }

    window.cpReviewAppeal = async function(appealId, action) {
        const note = prompt(`${action === 'approve' ? 'Approve' : 'Decline'} this appeal? Optionally add a note:`, '') ?? '';
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/appeal/${appealId}/review`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ action, note })
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message || 'Appeal reviewed!', 'success');
                loadBanAppeals();
            } else {
                showToast(data.error || 'Failed to review appeal', 'error');
            }
        } catch (e) { showToast('Failed to review appeal', 'error'); }
    };
    window.cpSaveBanAppeals = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/ban-appeals`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('appeals-enabled').checked,
                    channel: document.getElementById('appeals-channel').value,
                    review_role: document.getElementById('appeals-review-role').value,
                    questions: document.getElementById('appeals-questions').value.split('\n').filter(l => l.trim()),
                    min_days: Number(document.getElementById('appeals-min-days').value),
                    max_per_user: Number(document.getElementById('appeals-max-per-user').value),
                    dm_user: document.getElementById('appeals-dm-user').checked
                })
            });
            const data = await res.json();
            if (data.success) showToast('Ban appeals settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save ban appeals', 'error'); }
    };

    // ==================== USER NOTES ====================
    async function loadUserNotes() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/user-notes`);
            const data = await res.json();
            const list = document.getElementById('notes-list');
            if (list) {
                list.innerHTML = (data.notes || []).slice(0, 50).map(n =>
                    `<div class="list-item"><span>${escapeHtml(n.username || n.user_id)} - ${escapeHtml(n.content || '')}</span><span class="text-muted">${n.date || ''}</span></div>`
                ).join('') || '<div class="text-muted">No notes yet</div>';
            }
        } catch (e) { showToast('Failed to load user notes', 'error'); }
    }
    window.cpSearchNotes = async function() {
        try {
            const q = document.getElementById('notes-search').value;
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/user-notes/search?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            const list = document.getElementById('notes-list');
            if (list) {
                list.innerHTML = (data.notes || []).map(n =>
                    `<div class="list-item"><span>${escapeHtml(n.username || n.user_id)} - ${escapeHtml(n.content || '')}</span><span class="text-muted">${n.date || ''}</span></div>`
                ).join('') || '<div class="text-muted">No matching notes</div>';
            }
        } catch (e) { showToast('Failed to search notes', 'error'); }
    };
    window.cpAddNote = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/user-notes`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    user_id: document.getElementById('notes-user-id').value,
                    content: document.getElementById('notes-content').value
                })
            });
            const data = await res.json();
            if (data.success) { showToast('Note added!', 'success'); loadUserNotes(); }
            else showToast(data.error || 'Failed to add note', 'error');
        } catch (e) { showToast('Failed to add note', 'error'); }
    };

    // ==================== BIRTHDAYS ====================
    async function loadBirthdays() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/birthdays`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('bday-enabled').checked = s.enabled || false;
            populateChannelSelect('bday-channel', s.channel);
            document.getElementById('bday-message').value = s.message || '';
            populateRoleSelectGeneric('bday-role', s.role);
            document.getElementById('bday-auto-remove').checked = s.auto_remove !== false;
            document.getElementById('bday-hour').value = s.hour || 9;
            document.getElementById('bday-timezone').value = s.timezone || 'UTC';
        } catch (e) { showToast('Failed to load birthdays', 'error'); }
    }
    window.cpSaveBirthdays = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/birthdays`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('bday-enabled').checked,
                    channel: document.getElementById('bday-channel').value,
                    message: document.getElementById('bday-message').value,
                    role: document.getElementById('bday-role').value,
                    auto_remove: document.getElementById('bday-auto-remove').checked,
                    hour: Number(document.getElementById('bday-hour').value),
                    timezone: document.getElementById('bday-timezone').value
                })
            });
            const data = await res.json();
            if (data.success) showToast('Birthday settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save birthdays', 'error'); }
    };

    // ==================== BOOST REWARDS ====================
    async function loadBoostRewards() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/boost-rewards`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('boost-enabled').checked = s.enabled || false;
            populateChannelSelect('boost-channel', s.channel);
            document.getElementById('boost-message').value = s.message || '';
            populateRoleSelectGeneric('boost-role', s.role);
            document.getElementById('boost-dm').checked = s.dm || false;
            document.getElementById('boost-dm-message').value = s.dm_message || '';
            document.getElementById('boost-bonus-xp').value = s.bonus_xp || 0;
            document.getElementById('boost-bonus-coins').value = s.bonus_coins || 0;
        } catch (e) { showToast('Failed to load boost rewards', 'error'); }
    }
    window.cpSaveBoostRewards = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/boost-rewards`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('boost-enabled').checked,
                    channel: document.getElementById('boost-channel').value,
                    message: document.getElementById('boost-message').value,
                    role: document.getElementById('boost-role').value,
                    dm: document.getElementById('boost-dm').checked,
                    dm_message: document.getElementById('boost-dm-message').value,
                    bonus_xp: Number(document.getElementById('boost-bonus-xp').value),
                    bonus_coins: Number(document.getElementById('boost-bonus-coins').value)
                })
            });
            const data = await res.json();
            if (data.success) showToast('Boost rewards settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save boost rewards', 'error'); }
    };

    // ==================== AUTO RESPONDER ====================
    async function loadAutoResponder() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/auto-responder`);
            const data = await res.json();
            const triggers = data.triggers || data.list || [];
            const list = document.getElementById('autorespond-list');
            if (list) {
                list.innerHTML = triggers.map((t, i) =>
                    `<div class="list-item">
                        <span><strong>${escapeHtml(t.trigger)}</strong> &rarr; ${escapeHtml(t.response || '')}</span>
                        <button class="btn btn-sm btn-danger" onclick="window.cpDeleteAutoResponder(${i})">Delete</button>
                    </div>`
                ).join('') || '<div class="text-muted">No auto-responders configured</div>';
            }
        } catch (e) { showToast('Failed to load auto-responder', 'error'); }
    }
    window.cpSaveAutoResponder = async function() {
        try {
            const rows = document.querySelectorAll('#autorespond-list .list-item');
            const triggers = [];
            rows.forEach(row => {
                const inputs = row.querySelectorAll('input');
                if (inputs.length >= 2) triggers.push({ trigger: inputs[0].value, response: inputs[1].value });
            });
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/auto-responder`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ triggers })
            });
            const data = await res.json();
            if (data.success) showToast('Auto-responder saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save auto-responder', 'error'); }
    };
    window.cpAddAutoResponder = function() {
        const list = document.getElementById('autorespond-list');
        if (!list) return;
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `<input type="text" placeholder="Trigger" class="form-input" style="width:40%"> <input type="text" placeholder="Response" class="form-input" style="width:40%"> <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">Remove</button>`;
        list.appendChild(div);
    };
    window.cpDeleteAutoResponder = async function(index) {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/auto-responder`, {
                method: 'DELETE', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ index })
            });
            const data = await res.json();
            if (data.success) { showToast('Auto-responder deleted!', 'success'); loadAutoResponder(); }
            else showToast(data.error || 'Failed to delete', 'error');
        } catch (e) { showToast('Failed to delete auto-responder', 'error'); }
    };

    // ==================== KEYWORD ALERTS ====================
    async function loadKeywordAlerts() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/keyword-alerts`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('alerts-enabled').checked = s.enabled || false;
            populateChannelSelect('alerts-channel', s.channel);
            document.getElementById('alerts-keywords').value = (s.keywords || []).join('\n');
            document.getElementById('alerts-case-sensitive').checked = s.case_sensitive || false;
            document.getElementById('alerts-on-edit').checked = s.on_edit || false;
            const channels = await fetchGuildChannels();
            const roles = await fetchGuildRoles();
            populateMultiSelect('alerts-exempt-channels', (channels || []).filter(c => c.type === 0), s.exempt_channels || []);
            populateMultiSelect('alerts-exempt-roles', (roles || []).filter(r => r.name !== '@everyone'), s.exempt_roles || []);
        } catch (e) { showToast('Failed to load keyword alerts', 'error'); }
    }
    window.cpSaveKeywordAlerts = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/keyword-alerts`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('alerts-enabled').checked,
                    channel: document.getElementById('alerts-channel').value,
                    keywords: document.getElementById('alerts-keywords').value.split('\n').filter(l => l.trim()),
                    case_sensitive: document.getElementById('alerts-case-sensitive').checked,
                    on_edit: document.getElementById('alerts-on-edit').checked,
                    exempt_channels: getMultiSelectValues('alerts-exempt-channels'),
                    exempt_roles: getMultiSelectValues('alerts-exempt-roles')
                })
            });
            const data = await res.json();
            if (data.success) showToast('Keyword alerts settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save keyword alerts', 'error'); }
    };

    // ==================== TEMP ROLES ====================
    async function loadTempRoles() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/temp-roles`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('temproles-enabled').checked = s.enabled || false;
            document.getElementById('temproles-dm').checked = s.dm || false;
            document.getElementById('temproles-log').checked = s.log || false;
            populateChannelSelect('temproles-log-channel', s.log_channel);
            // Load active temp roles
            const list = document.getElementById('temproles-list');
            if (list) {
                list.innerHTML = (data.active || []).map(t =>
                    `<div class="list-item"><span>${escapeHtml(t.username || t.user_id)} - ${escapeHtml(t.role_name || t.role_id)}</span><span>Expires: ${t.expires || 'N/A'}</span></div>`
                ).join('') || '<div class="text-muted">No active temp roles</div>';
            }
        } catch (e) { showToast('Failed to load temp roles', 'error'); }
    }
    window.cpSaveTempRoles = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/temp-roles`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('temproles-enabled').checked,
                    dm: document.getElementById('temproles-dm').checked,
                    log: document.getElementById('temproles-log').checked,
                    log_channel: document.getElementById('temproles-log-channel').value
                })
            });
            const data = await res.json();
            if (data.success) showToast('Temp roles settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save temp roles', 'error'); }
    };
    window.cpAssignTempRole = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/temp-roles/assign`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    user_id: document.getElementById('temprole-user').value,
                    role_id: document.getElementById('temprole-role').value,
                    duration: document.getElementById('temprole-duration').value
                })
            });
            const data = await res.json();
            if (data.success) { showToast('Temp role assigned!', 'success'); loadTempRoles(); }
            else showToast(data.error || 'Failed to assign', 'error');
        } catch (e) { showToast('Failed to assign temp role', 'error'); }
    };

    // ==================== AUTO THREAD ====================
    async function loadAutoThread() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/auto-thread`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('autothread-enabled').checked = s.enabled || false;
            const list = document.getElementById('autothread-list');
            if (list) {
                list.innerHTML = (data.rules || []).map((r, i) =>
                    `<div class="list-item"><span>#${escapeHtml(r.channel_name || r.channel)} - Template: ${escapeHtml(r.template || 'default')}</span>
                    <button class="btn btn-sm btn-danger" onclick="window.cpDeleteAutoThread(${i})">Delete</button></div>`
                ).join('') || '<div class="text-muted">No auto-thread rules</div>';
            }
        } catch (e) { showToast('Failed to load auto-thread', 'error'); }
    }
    window.cpSaveAutoThread = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/auto-thread`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ enabled: document.getElementById('autothread-enabled').checked })
            });
            const data = await res.json();
            if (data.success) showToast('Auto-thread settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save auto-thread', 'error'); }
    };
    window.cpAddAutoThread = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/auto-thread/rules`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    channel: document.getElementById('autothread-channel').value,
                    template: document.getElementById('autothread-template').value,
                    archive: document.getElementById('autothread-archive').value,
                    slowmode: Number(document.getElementById('autothread-slowmode').value || 0)
                })
            });
            const data = await res.json();
            if (data.success) { showToast('Auto-thread rule added!', 'success'); loadAutoThread(); }
            else showToast(data.error || 'Failed to add rule', 'error');
        } catch (e) { showToast('Failed to add auto-thread rule', 'error'); }
    };
    window.cpDeleteAutoThread = async function(index) {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/auto-thread/rules`, {
                method: 'DELETE', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ index })
            });
            const data = await res.json();
            if (data.success) { showToast('Rule deleted!', 'success'); loadAutoThread(); }
            else showToast(data.error || 'Failed to delete', 'error');
        } catch (e) { showToast('Failed to delete rule', 'error'); }
    };

    // ==================== SERVER RULES ====================
    async function loadServerRules() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/server-rules`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('rules-enabled').checked = s.enabled || false;
            document.getElementById('rules-content').value = s.content || '';
            populateChannelSelect('rules-channel', s.channel);
            document.getElementById('rules-embed').checked = s.embed !== false;
            document.getElementById('rules-color').value = s.color || '#5865f2';
            document.getElementById('rules-footer').value = s.footer || '';
        } catch (e) { showToast('Failed to load server rules', 'error'); }
    }
    window.cpSaveServerRules = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/server-rules`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('rules-enabled').checked,
                    content: document.getElementById('rules-content').value,
                    channel: document.getElementById('rules-channel').value,
                    embed: document.getElementById('rules-embed').checked,
                    color: document.getElementById('rules-color').value,
                    footer: document.getElementById('rules-footer').value
                })
            });
            const data = await res.json();
            if (data.success) showToast('Server rules saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save server rules', 'error'); }
    };

    // ==================== POLLS ====================
    async function loadPolls() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/polls`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('polls-enabled').checked = s.enabled || false;
            document.getElementById('polls-member-create').checked = s.member_create || false;
            populateRoleSelectGeneric('polls-create-role', s.create_role);
            document.getElementById('polls-max-duration').value = s.max_duration || 168;
            document.getElementById('polls-multiple-choice').checked = s.multiple_choice || false;
            document.getElementById('polls-show-results').checked = s.show_results !== false;
            populateChannelSelect('polls-channel', s.channel);
            // Load active polls
            const list = document.getElementById('polls-list');
            if (list) {
                list.innerHTML = (data.polls || []).map(p =>
                    `<div class="list-item"><span>${escapeHtml(p.question || p.title)}</span><span>${p.votes || 0} votes</span></div>`
                ).join('') || '<div class="text-muted">No active polls</div>';
            }
        } catch (e) { showToast('Failed to load polls', 'error'); }
    }
    window.cpSavePolls = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/polls`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('polls-enabled').checked,
                    member_create: document.getElementById('polls-member-create').checked,
                    create_role: document.getElementById('polls-create-role').value,
                    max_duration: Number(document.getElementById('polls-max-duration').value),
                    multiple_choice: document.getElementById('polls-multiple-choice').checked,
                    show_results: document.getElementById('polls-show-results').checked,
                    channel: document.getElementById('polls-channel').value
                })
            });
            const data = await res.json();
            if (data.success) showToast('Polls settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save polls', 'error'); }
    };

    // ==================== MESSAGE LOGGER ====================
    async function loadMessageLogger() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/message-logger`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('msglog-enabled').checked = s.enabled || false;
            populateChannelSelect('msglog-channel', s.channel);
            document.getElementById('msglog-edits').checked = s.edits !== false;
            document.getElementById('msglog-deletes').checked = s.deletes !== false;
            document.getElementById('msglog-bulk').checked = s.bulk || false;
            document.getElementById('msglog-pins').checked = s.pins || false;
            document.getElementById('msglog-content').checked = s.content !== false;
            const channels = await fetchGuildChannels();
            const roles = await fetchGuildRoles();
            populateMultiSelect('msglog-ignore-channels', (channels || []).filter(c => c.type === 0), s.ignore_channels || []);
            populateMultiSelect('msglog-ignore-roles', (roles || []).filter(r => r.name !== '@everyone'), s.ignore_roles || []);
        } catch (e) { showToast('Failed to load message logger', 'error'); }
    }
    window.cpSaveMessageLogger = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/message-logger`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('msglog-enabled').checked,
                    channel: document.getElementById('msglog-channel').value,
                    edits: document.getElementById('msglog-edits').checked,
                    deletes: document.getElementById('msglog-deletes').checked,
                    bulk: document.getElementById('msglog-bulk').checked,
                    pins: document.getElementById('msglog-pins').checked,
                    content: document.getElementById('msglog-content').checked,
                    ignore_channels: getMultiSelectValues('msglog-ignore-channels'),
                    ignore_roles: getMultiSelectValues('msglog-ignore-roles')
                })
            });
            const data = await res.json();
            if (data.success) showToast('Message logger settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save message logger', 'error'); }
    };

    // ==================== VOICE LOGGER ====================
    async function loadVoiceLogger() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/voice-logger`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('voicelog-enabled').checked = s.enabled || false;
            populateChannelSelect('voicelog-channel', s.channel);
            document.getElementById('voicelog-joins').checked = s.joins !== false;
            document.getElementById('voicelog-moves').checked = s.moves !== false;
            document.getElementById('voicelog-mute').checked = s.mute || false;
            document.getElementById('voicelog-stream').checked = s.stream || false;
            const channels = await fetchGuildChannels();
            populateMultiSelect('voicelog-ignore-channels', (channels || []).filter(c => c.type === 2), s.ignore_channels || []);
        } catch (e) { showToast('Failed to load voice logger', 'error'); }
    }
    window.cpSaveVoiceLogger = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/voice-logger`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('voicelog-enabled').checked,
                    channel: document.getElementById('voicelog-channel').value,
                    joins: document.getElementById('voicelog-joins').checked,
                    moves: document.getElementById('voicelog-moves').checked,
                    mute: document.getElementById('voicelog-mute').checked,
                    stream: document.getElementById('voicelog-stream').checked,
                    ignore_channels: getMultiSelectValues('voicelog-ignore-channels')
                })
            });
            const data = await res.json();
            if (data.success) showToast('Voice logger settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save voice logger', 'error'); }
    };

    // ==================== JOIN/LEAVE LOGGER ====================
    async function loadJoinLeaveLogger() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/join-leave-logger`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('joinlog-enabled').checked = s.enabled || false;
            populateChannelSelect('joinlog-channel', s.channel);
            document.getElementById('joinlog-account-age').checked = s.account_age !== false;
            document.getElementById('joinlog-invite').checked = s.invite || false;
            document.getElementById('joinlog-member-count').checked = s.member_count || false;
            document.getElementById('joinlog-flag-new').checked = s.flag_new || false;
            document.getElementById('joinlog-threshold').value = s.threshold || 7;
        } catch (e) { showToast('Failed to load join/leave logger', 'error'); }
    }
    window.cpSaveJoinLeaveLogger = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/join-leave-logger`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('joinlog-enabled').checked,
                    channel: document.getElementById('joinlog-channel').value,
                    account_age: document.getElementById('joinlog-account-age').checked,
                    invite: document.getElementById('joinlog-invite').checked,
                    member_count: document.getElementById('joinlog-member-count').checked,
                    flag_new: document.getElementById('joinlog-flag-new').checked,
                    threshold: Number(document.getElementById('joinlog-threshold').value)
                })
            });
            const data = await res.json();
            if (data.success) showToast('Join/leave logger settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save join/leave logger', 'error'); }
    };

    // ==================== NAME LOGGER ====================
    async function loadNameLogger() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/name-logger`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('namelog-enabled').checked = s.enabled || false;
            populateChannelSelect('namelog-channel', s.channel);
            document.getElementById('namelog-usernames').checked = s.usernames !== false;
            document.getElementById('namelog-nicknames').checked = s.nicknames !== false;
            document.getElementById('namelog-avatars').checked = s.avatars || false;
            document.getElementById('namelog-discriminators').checked = s.discriminators || false;
        } catch (e) { showToast('Failed to load name logger', 'error'); }
    }
    window.cpSaveNameLogger = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/name-logger`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('namelog-enabled').checked,
                    channel: document.getElementById('namelog-channel').value,
                    usernames: document.getElementById('namelog-usernames').checked,
                    nicknames: document.getElementById('namelog-nicknames').checked,
                    avatars: document.getElementById('namelog-avatars').checked,
                    discriminators: document.getElementById('namelog-discriminators').checked
                })
            });
            const data = await res.json();
            if (data.success) showToast('Name logger settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save name logger', 'error'); }
    };

    // ==================== EMOJI STATS ====================
    async function loadEmojiStats() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/emoji-stats`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('emojistats-enabled').checked = s.enabled || false;
            document.getElementById('emojistats-period').value = s.period || '30d';
            document.getElementById('emojistats-reactions').checked = s.reactions !== false;
            document.getElementById('emojistats-stickers').checked = s.stickers || false;
            const list = document.getElementById('emojistats-list');
            if (list) {
                list.innerHTML = (data.top || []).map((e, i) =>
                    `<div class="list-item"><span>#${i + 1} ${escapeHtml(e.emoji || e.name)}</span><span>${e.count || 0} uses</span></div>`
                ).join('') || '<div class="text-muted">No emoji data yet</div>';
            }
        } catch (e) { showToast('Failed to load emoji stats', 'error'); }
    }
    window.cpSaveEmojiStats = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/emoji-stats`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('emojistats-enabled').checked,
                    period: document.getElementById('emojistats-period').value,
                    reactions: document.getElementById('emojistats-reactions').checked,
                    stickers: document.getElementById('emojistats-stickers').checked
                })
            });
            const data = await res.json();
            if (data.success) showToast('Emoji stats settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save emoji stats', 'error'); }
    };

    // ==================== CHANNEL ACTIVITY ====================
    async function loadChannelActivity() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channel-activity`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('activity-period').value = s.period || '7d';
            document.getElementById('activity-threads').checked = s.threads || false;
            document.getElementById('activity-voice').checked = s.voice || false;
            const list = document.getElementById('activity-list');
            if (list) {
                list.innerHTML = (data.activity || []).map(a =>
                    `<div class="list-item"><span>#${escapeHtml(a.name || a.channel)}</span><span>${a.messages || 0} messages</span></div>`
                ).join('') || '<div class="text-muted">No activity data</div>';
            }
        } catch (e) { showToast('Failed to load channel activity', 'error'); }
    }
    window.cpSaveChannelActivity = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channel-activity`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    period: document.getElementById('activity-period').value,
                    threads: document.getElementById('activity-threads').checked,
                    voice: document.getElementById('activity-voice').checked
                })
            });
            const data = await res.json();
            if (data.success) showToast('Channel activity settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save channel activity', 'error'); }
    };

    // ==================== REMINDERS ====================
    async function loadReminders() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reminders`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('reminders-enabled').checked = s.enabled || false;
            document.getElementById('reminders-member-create').checked = s.member_create || false;
            document.getElementById('reminders-max').value = s.max || 10;
            document.getElementById('reminders-max-days').value = s.max_days || 365;
            const list = document.getElementById('reminders-list');
            if (list) {
                list.innerHTML = (data.active || []).map(r =>
                    `<div class="list-item"><span>${escapeHtml(r.username || r.user_id)} - ${escapeHtml(r.content || '')}</span><span>${r.time || ''}</span></div>`
                ).join('') || '<div class="text-muted">No active reminders</div>';
            }
        } catch (e) { showToast('Failed to load reminders', 'error'); }
    }
    window.cpSaveReminders = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reminders`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('reminders-enabled').checked,
                    member_create: document.getElementById('reminders-member-create').checked,
                    max: Number(document.getElementById('reminders-max').value),
                    max_days: Number(document.getElementById('reminders-max-days').value)
                })
            });
            const data = await res.json();
            if (data.success) showToast('Reminders settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save reminders', 'error'); }
    };

    // ==================== STICKY MESSAGES ====================
    async function loadStickyMessages() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/sticky-messages`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('sticky-enabled').checked = s.enabled || false;
            populateChannelSelect('sticky-channel', null);
            const list = document.getElementById('sticky-list');
            if (list) {
                list.innerHTML = (data.stickies || []).map((st, i) =>
                    `<div class="list-item"><span>#${escapeHtml(st.channel_name || st.channel)} - ${escapeHtml((st.content || '').substring(0, 50))}</span>
                    <button class="btn btn-sm btn-danger" onclick="window.cpDeleteSticky(${i})">Delete</button></div>`
                ).join('') || '<div class="text-muted">No sticky messages</div>';
            }
        } catch (e) { showToast('Failed to load sticky messages', 'error'); }
    }
    window.cpSaveStickyMessages = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/sticky-messages`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ enabled: document.getElementById('sticky-enabled').checked })
            });
            const data = await res.json();
            if (data.success) showToast('Sticky messages settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save sticky messages', 'error'); }
    };
    window.cpCreateSticky = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/sticky-messages`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    channel: document.getElementById('sticky-channel').value,
                    content: document.getElementById('sticky-content').value,
                    embed: document.getElementById('sticky-embed').checked
                })
            });
            const data = await res.json();
            if (data.success) { showToast('Sticky message created!', 'success'); loadStickyMessages(); }
            else showToast(data.error || 'Failed to create', 'error');
        } catch (e) { showToast('Failed to create sticky message', 'error'); }
    };
    window.cpDeleteSticky = async function(index) {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/sticky-messages`, {
                method: 'DELETE', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ index })
            });
            const data = await res.json();
            if (data.success) { showToast('Sticky deleted!', 'success'); loadStickyMessages(); }
            else showToast(data.error || 'Failed to delete', 'error');
        } catch (e) { showToast('Failed to delete sticky', 'error'); }
    };

    // ==================== ANTI-HOIST ====================
    async function loadAntiHoist() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/anti-hoist`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('antihoist-enabled').checked = s.enabled || false;
            document.getElementById('antihoist-replacement').value = s.replacement || 'Member';
            document.getElementById('antihoist-on-join').checked = s.on_join !== false;
            document.getElementById('antihoist-on-change').checked = s.on_change !== false;
            document.getElementById('antihoist-chars').value = s.chars || '!@#$%^&*()';
            const roles = await fetchGuildRoles();
            populateMultiSelect('antihoist-exempt-roles', (roles || []).filter(r => r.name !== '@everyone'), s.exempt_roles || []);
        } catch (e) { showToast('Failed to load anti-hoist', 'error'); }
    }
    window.cpSaveAntiHoist = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/anti-hoist`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('antihoist-enabled').checked,
                    replacement: document.getElementById('antihoist-replacement').value,
                    on_join: document.getElementById('antihoist-on-join').checked,
                    on_change: document.getElementById('antihoist-on-change').checked,
                    chars: document.getElementById('antihoist-chars').value,
                    exempt_roles: getMultiSelectValues('antihoist-exempt-roles')
                })
            });
            const data = await res.json();
            if (data.success) showToast('Anti-hoist settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save anti-hoist', 'error'); }
    };

    // ==================== LINK FILTER ====================
    async function loadLinkFilter() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/link-filter`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('linkfilter-enabled').checked = s.enabled || false;
            document.getElementById('linkfilter-mode').value = s.mode || 'blacklist';
            document.getElementById('linkfilter-domains').value = (s.domains || []).join('\n');
            document.getElementById('linkfilter-invites').checked = s.invites || false;
            document.getElementById('linkfilter-all').checked = s.all || false;
            document.getElementById('linkfilter-action').value = s.action || 'delete';
            document.getElementById('linkfilter-log').checked = s.log || false;
            populateChannelSelect('linkfilter-log-channel', s.log_channel);
            const channels = await fetchGuildChannels();
            const roles = await fetchGuildRoles();
            populateMultiSelect('linkfilter-exempt-channels', (channels || []).filter(c => c.type === 0), s.exempt_channels || []);
            populateMultiSelect('linkfilter-exempt-roles', (roles || []).filter(r => r.name !== '@everyone'), s.exempt_roles || []);
        } catch (e) { showToast('Failed to load link filter', 'error'); }
    }
    window.cpSaveLinkFilter = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/link-filter`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('linkfilter-enabled').checked,
                    mode: document.getElementById('linkfilter-mode').value,
                    domains: document.getElementById('linkfilter-domains').value.split('\n').filter(l => l.trim()),
                    invites: document.getElementById('linkfilter-invites').checked,
                    all: document.getElementById('linkfilter-all').checked,
                    action: document.getElementById('linkfilter-action').value,
                    exempt_channels: getMultiSelectValues('linkfilter-exempt-channels'),
                    exempt_roles: getMultiSelectValues('linkfilter-exempt-roles'),
                    log: document.getElementById('linkfilter-log').checked,
                    log_channel: document.getElementById('linkfilter-log-channel').value
                })
            });
            const data = await res.json();
            if (data.success) showToast('Link filter settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save link filter', 'error'); }
    };

    // ==================== MEDIA CHANNELS ====================
    async function loadMediaChannels() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/media-channels`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('media-enabled').checked = s.enabled || false;
            document.getElementById('media-warning').value = s.warning || '';
            populateChannelSelect('media-add-channel', null);
            const list = document.getElementById('media-list');
            if (list) {
                list.innerHTML = (data.items || []).map((mc) =>
                    `<div class="list-item"><span>#${escapeHtml(mc.channel_name || mc.channel)}</span>
                    <button class="btn btn-sm btn-danger" onclick="window.cpDeleteMediaChannel('${escapeHtml(mc.id)}')">Delete</button></div>`
                ).join('') || '<div class="text-muted">No media channels</div>';
            }
        } catch (e) { showToast('Failed to load media channels', 'error'); }
    }
    window.cpSaveMediaChannels = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/media-channels`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('media-enabled').checked,
                    warning: document.getElementById('media-warning').value
                })
            });
            const data = await res.json();
            if (data.success) showToast('Media channels settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save media channels', 'error'); }
    };
    window.cpAddMediaChannel = async function() {
        try {
            const channelId = document.getElementById('media-add-channel').value;
            const channels = await fetchGuildChannels();
            const channelObj = channels.find(c => c.id === channelId);
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/media-channels/add`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    channel: channelId,
                    channel_name: channelObj ? channelObj.name : channelId,
                    require_image: document.getElementById('media-require-image').checked,
                    require_video: document.getElementById('media-require-video').checked,
                    allow_text: document.getElementById('media-allow-text').checked
                })
            });
            const data = await res.json();
            if (data.success) { showToast('Media channel added!', 'success'); loadMediaChannels(); }
            else showToast(data.error || 'Failed to add', 'error');
        } catch (e) { showToast('Failed to add media channel', 'error'); }
    };
    window.cpDeleteMediaChannel = async function(id) {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/media-channels/${id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) { showToast('Media channel deleted!', 'success'); loadMediaChannels(); }
            else showToast(data.error || 'Failed to delete', 'error');
        } catch (e) { showToast('Failed to delete media channel', 'error'); }
    };

    // ==================== AUTO-TRANSLATION ====================
    const TR_LANGUAGES = [
        { name: 'Auto-Detect', value: 'auto' },
        { name: 'Afrikaans', value: 'af' }, { name: 'Albanian', value: 'sq' },
        { name: 'Amharic', value: 'am' }, { name: 'Arabic', value: 'ar' },
        { name: 'Armenian', value: 'hy' }, { name: 'Azerbaijani', value: 'az' },
        { name: 'Basque', value: 'eu' }, { name: 'Belarusian', value: 'be' },
        { name: 'Bengali', value: 'bn' }, { name: 'Bosnian', value: 'bs' },
        { name: 'Bulgarian', value: 'bg' }, { name: 'Catalan', value: 'ca' },
        { name: 'Chinese (Simplified)', value: 'zh-CN' }, { name: 'Chinese (Traditional)', value: 'zh-TW' },
        { name: 'Croatian', value: 'hr' }, { name: 'Czech', value: 'cs' },
        { name: 'Danish', value: 'da' }, { name: 'Dutch', value: 'nl' },
        { name: 'English', value: 'en' }, { name: 'Esperanto', value: 'eo' },
        { name: 'Estonian', value: 'et' }, { name: 'Finnish', value: 'fi' },
        { name: 'French', value: 'fr' }, { name: 'Galician', value: 'gl' },
        { name: 'Georgian', value: 'ka' }, { name: 'German', value: 'de' },
        { name: 'Greek', value: 'el' }, { name: 'Gujarati', value: 'gu' },
        { name: 'Haitian Creole', value: 'ht' }, { name: 'Hausa', value: 'ha' },
        { name: 'Hebrew', value: 'he' }, { name: 'Hindi', value: 'hi' },
        { name: 'Hungarian', value: 'hu' }, { name: 'Icelandic', value: 'is' },
        { name: 'Indonesian', value: 'id' }, { name: 'Irish', value: 'ga' },
        { name: 'Italian', value: 'it' }, { name: 'Japanese', value: 'ja' },
        { name: 'Javanese', value: 'jv' }, { name: 'Kannada', value: 'kn' },
        { name: 'Kazakh', value: 'kk' }, { name: 'Khmer', value: 'km' },
        { name: 'Korean', value: 'ko' }, { name: 'Kurdish', value: 'ku' },
        { name: 'Kyrgyz', value: 'ky' }, { name: 'Lao', value: 'lo' },
        { name: 'Latin', value: 'la' }, { name: 'Latvian', value: 'lv' },
        { name: 'Lithuanian', value: 'lt' }, { name: 'Macedonian', value: 'mk' },
        { name: 'Malagasy', value: 'mg' }, { name: 'Malay', value: 'ms' },
        { name: 'Malayalam', value: 'ml' }, { name: 'Maltese', value: 'mt' },
        { name: 'Maori', value: 'mi' }, { name: 'Marathi', value: 'mr' },
        { name: 'Mongolian', value: 'mn' }, { name: 'Myanmar (Burmese)', value: 'my' },
        { name: 'Nepali', value: 'ne' }, { name: 'Norwegian', value: 'no' },
        { name: 'Pashto', value: 'ps' }, { name: 'Persian', value: 'fa' },
        { name: 'Polish', value: 'pl' }, { name: 'Portuguese', value: 'pt' },
        { name: 'Punjabi', value: 'pa' }, { name: 'Romanian', value: 'ro' },
        { name: 'Russian', value: 'ru' }, { name: 'Samoan', value: 'sm' },
        { name: 'Serbian', value: 'sr' }, { name: 'Sesotho', value: 'st' },
        { name: 'Shona', value: 'sn' }, { name: 'Sinhala', value: 'si' },
        { name: 'Slovak', value: 'sk' }, { name: 'Slovenian', value: 'sl' },
        { name: 'Somali', value: 'so' }, { name: 'Spanish', value: 'es' },
        { name: 'Swahili', value: 'sw' }, { name: 'Swedish', value: 'sv' },
        { name: 'Tajik', value: 'tg' }, { name: 'Tamil', value: 'ta' },
        { name: 'Telugu', value: 'te' }, { name: 'Thai', value: 'th' },
        { name: 'Turkish', value: 'tr' }, { name: 'Ukrainian', value: 'uk' },
        { name: 'Urdu', value: 'ur' }, { name: 'Uzbek', value: 'uz' },
        { name: 'Vietnamese', value: 'vi' }, { name: 'Welsh', value: 'cy' },
        { name: 'Xhosa', value: 'xh' }, { name: 'Yiddish', value: 'yi' },
        { name: 'Yoruba', value: 'yo' }, { name: 'Zulu', value: 'zu' },
    ];
    function _trPopulateLangSelect(selectId, selectedValue, includeAuto) {
        const el = document.getElementById(selectId);
        if (!el) return;
        const pool = includeAuto ? TR_LANGUAGES : TR_LANGUAGES.filter(l => l.value !== 'auto');
        el.innerHTML = pool.map(l => `<option value="${l.value}"${l.value === selectedValue ? ' selected' : ''}>${escapeHtml(l.name)}</option>`).join('');
    }
    async function loadTranslate() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/translate`);
            const data = await res.json();
            const s = data.settings || {};
            document.getElementById('tr-enabled').checked = s.enabled !== false;
            _trPopulateLangSelect('tr-add-from', 'auto', true);
            _trPopulateLangSelect('tr-add-to', 'en', false);
            populateChannelSelect('tr-add-channel', null);
            _trRenderList(data.items || []);
        } catch (e) { showToast('Failed to load translation settings', 'error'); }
    }
    function _trRenderList(items) {
        const list = document.getElementById('tr-list');
        if (!list) return;
        if (!items.length) { list.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.875rem;">No channels configured. Use the form below to add one.</p>'; return; }
        list.innerHTML = items.map(item => {
            const fromName = TR_LANGUAGES.find(l => l.value === item.from)?.name || item.from || 'Auto-Detect';
            const toName = TR_LANGUAGES.find(l => l.value === item.to)?.name || item.to || item.to;
            const status = item.enabled === false ? '🔴' : '🟢';
            return `<div class="list-item" style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:0.6rem 0.8rem;background:rgba(255,255,255,0.04);border-radius:8px;">
                <span style="font-size:0.875rem;">${status} <strong>#${escapeHtml(item.channel_name || item.channel_id)}</strong> &nbsp;—&nbsp; ${escapeHtml(fromName)} → ${escapeHtml(toName)}</span>
                <div style="display:flex;gap:0.5rem;">
                    <button class="control-btn small" onclick="window.cpToggleTranslateChannel('${escapeHtml(item.id)}', ${item.enabled !== false ? 'false' : 'true'})">${item.enabled === false ? 'Enable' : 'Disable'}</button>
                    <button class="control-btn small" style="background:rgba(239,68,68,0.15);color:#ef4444;" onclick="window.cpDeleteTranslateChannel('${escapeHtml(item.id)}')">Remove</button>
                </div>
            </div>`;
        }).join('');
    }
    window.cpToggleTranslate = async function() {
        try {
            const enabled = document.getElementById('tr-enabled').checked;
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/translate`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
            const data = await res.json();
            if (data.success) showToast(`Auto-translation ${enabled ? 'enabled' : 'disabled'}`, 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save', 'error'); }
    };
    window.cpAddTranslateChannel = async function() {
        try {
            const channelId = document.getElementById('tr-add-channel').value;
            const from = document.getElementById('tr-add-from').value;
            const to = document.getElementById('tr-add-to').value;
            if (!channelId) return showToast('Please select a channel', 'error');
            if (from === to) return showToast('Source and target language must be different', 'error');
            const channels = await fetchGuildChannels();
            const channelObj = channels.find(c => c.id === channelId);
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/translate/add`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel_id: channelId, channel_name: channelObj ? channelObj.name : channelId, from, to, enabled: true })
            });
            const data = await res.json();
            if (data.success) { showToast('Translation channel added!', 'success'); loadTranslate(); }
            else showToast(data.error || 'Failed to add', 'error');
        } catch (e) { showToast('Failed to add translation channel', 'error'); }
    };
    window.cpToggleTranslateChannel = async function(id, newEnabled) {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/translate/${id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: newEnabled === 'true' || newEnabled === true })
            });
            const data = await res.json();
            if (data.success) { showToast('Channel updated', 'success'); loadTranslate(); }
            else showToast(data.error || 'Failed to update', 'error');
        } catch (e) { showToast('Failed to update channel', 'error'); }
    };
    window.cpDeleteTranslateChannel = async function(id) {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/translate/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) { showToast('Channel removed', 'success'); loadTranslate(); }
            else showToast(data.error || 'Failed to remove', 'error');
        } catch (e) { showToast('Failed to remove channel', 'error'); }
    };

    // ==================== BOOST TRACKER ====================
    async function loadBoostTracker() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/boost-tracker`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('boosttrack-enabled').checked = s.enabled || false;
            populateChannelSelect('boosttrack-channel', s.channel);
            document.getElementById('boosttrack-new').checked = s.new_boosts !== false;
            document.getElementById('boosttrack-removed').checked = s.removed !== false;
            document.getElementById('boosttrack-tier').checked = s.tier || false;
            const list = document.getElementById('boosttrack-list');
            if (list) {
                list.innerHTML = (data.history || []).map(h =>
                    `<div class="list-item"><span>${escapeHtml(h.username || h.user_id)} - ${h.action || ''}</span><span class="text-muted">${h.date || ''}</span></div>`
                ).join('') || '<div class="text-muted">No boost history</div>';
            }
        } catch (e) { showToast('Failed to load boost tracker', 'error'); }
    }
    window.cpSaveBoostTracker = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/boost-tracker`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('boosttrack-enabled').checked,
                    channel: document.getElementById('boosttrack-channel').value,
                    new_boosts: document.getElementById('boosttrack-new').checked,
                    removed: document.getElementById('boosttrack-removed').checked,
                    tier: document.getElementById('boosttrack-tier').checked
                })
            });
            const data = await res.json();
            if (data.success) showToast('Boost tracker settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save boost tracker', 'error'); }
    };

    // ==================== ROLE LOGGER ====================
    async function loadRoleLogger() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/role-logger`);
            const data = await res.json();
            const s = data.settings || data;
            document.getElementById('rolelog-enabled').checked = s.enabled || false;
            populateChannelSelect('rolelog-channel', s.channel);
            document.getElementById('rolelog-creates').checked = s.creates !== false;
            document.getElementById('rolelog-deletes').checked = s.deletes !== false;
            document.getElementById('rolelog-edits').checked = s.edits !== false;
            document.getElementById('rolelog-member-changes').checked = s.member_changes !== false;
            const roles = await fetchGuildRoles();
            populateMultiSelect('rolelog-ignore-roles', (roles || []).filter(r => r.name !== '@everyone'), s.ignore_roles || []);
        } catch (e) { showToast('Failed to load role logger', 'error'); }
    }
    window.cpSaveRoleLogger = async function() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/role-logger`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    enabled: document.getElementById('rolelog-enabled').checked,
                    channel: document.getElementById('rolelog-channel').value,
                    creates: document.getElementById('rolelog-creates').checked,
                    deletes: document.getElementById('rolelog-deletes').checked,
                    edits: document.getElementById('rolelog-edits').checked,
                    member_changes: document.getElementById('rolelog-member-changes').checked,
                    ignore_roles: getMultiSelectValues('rolelog-ignore-roles')
                })
            });
            const data = await res.json();
            if (data.success) showToast('Role logger settings saved!', 'success');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Failed to save role logger', 'error'); }
    };

    // ==================== CUSTOM BOT ====================
    let _customBotInviteUrl = null;

    async function loadCustomBot() {
        if (!selectedGuild) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-bot`);
            const data = await res.json();
            const hero = document.getElementById('custom-bot-hero');
            const setupCard = document.getElementById('custom-bot-setup-card');
            if (data.enabled && data.has_token) {
                hero.style.display = '';
                setupCard.style.display = 'none';
                // Display name (user's label > discord username > fallback)
                const shownName = data.display_name || data.discord_username || 'Custom Bot';
                document.getElementById('custom-bot-hero-name').textContent = shownName;
                // Show Discord username below if different from display name
                const discordNameEl = document.getElementById('custom-bot-hero-discord-name');
                if (data.discord_username && data.discord_username !== data.display_name && data.display_name) {
                    discordNameEl.textContent = `@${data.discord_username}`;
                    discordNameEl.style.display = '';
                } else {
                    discordNameEl.style.display = 'none';
                }
                // Client ID
                const cidEl = document.getElementById('custom-bot-client-id-display');
                if (cidEl) cidEl.textContent = data.client_id ? `ID: ${data.client_id}` : '';
                _customBotInviteUrl = data.invite_url || null;
                if (data.presence) _customBotPresence = data.presence;
                // Avatar
                const avatarImg = document.getElementById('custom-bot-avatar');
                const fallback = document.getElementById('custom-bot-avatar-fallback');
                if (avatarImg && data.bot_avatar_url) {
                    avatarImg.src = data.bot_avatar_url;
                    avatarImg.style.display = 'block';
                    if (fallback) fallback.style.display = 'none';
                } else {
                    if (avatarImg) avatarImg.style.display = 'none';
                    if (fallback) fallback.style.display = 'flex';
                }
                // PM2 process status
                try {
                    const sRes = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-bot/status`);
                    const sData = await sRes.json();
                    const dot = document.getElementById('custom-bot-status-dot');
                    const txt = document.getElementById('custom-bot-status-text');
                    const ring = document.getElementById('custom-bot-status-ring');
                    const intentErr = document.getElementById('custom-bot-intent-error');
                    const startBtn = document.getElementById('custom-bot-start-btn');
                    const stopBtn = document.getElementById('custom-bot-stop-btn');
                    const restartBtn = document.getElementById('custom-bot-restart-btn');
                    if (sData.status === 'online') {
                        if (dot) dot.style.background = '#57f287';
                        if (txt) txt.textContent = 'Online';
                        if (ring) ring.className = 'custom-bot-status-ring online';
                        if (intentErr) intentErr.style.display = 'none';
                        if (startBtn) startBtn.style.display = 'none';
                        if (stopBtn) stopBtn.style.display = '';
                        if (restartBtn) restartBtn.style.display = '';
                    } else if (sData.status === 'intent_error') {
                        if (dot) dot.style.background = '#ed4245';
                        if (txt) txt.textContent = 'Error — Intents';
                        if (ring) ring.className = 'custom-bot-status-ring offline';
                        if (intentErr) intentErr.style.display = '';
                        if (startBtn) startBtn.style.display = 'none';
                        if (stopBtn) stopBtn.style.display = 'none';
                        if (restartBtn) restartBtn.style.display = 'none';
                    } else if (sData.status === 'stopped') {
                        if (dot) dot.style.background = '#faa61a';
                        if (txt) txt.textContent = 'Stopped';
                        if (ring) ring.className = 'custom-bot-status-ring stopped';
                        if (intentErr) intentErr.style.display = 'none';
                        if (startBtn) startBtn.style.display = '';
                        if (stopBtn) stopBtn.style.display = 'none';
                        if (restartBtn) restartBtn.style.display = 'none';
                    } else {
                        if (dot) dot.style.background = '#ed4245';
                        if (txt) txt.textContent = 'Offline';
                        if (ring) ring.className = 'custom-bot-status-ring offline';
                        if (intentErr) intentErr.style.display = 'none';
                        if (startBtn) startBtn.style.display = '';
                        if (stopBtn) stopBtn.style.display = 'none';
                        if (restartBtn) restartBtn.style.display = 'none';
                    }
                } catch (e) {}
            } else {
                hero.style.display = 'none';
                setupCard.style.display = '';
                if (data.display_name) {
                    const nameInput = document.getElementById('custom-bot-name');
                    if (nameInput) nameInput.value = data.display_name;
                }
            }
        } catch (e) { showToast('Failed to load custom bot settings', 'error'); }
    }

    window.cpSaveCustomBot = async function() {
        const token = document.getElementById('custom-bot-token').value.trim();
        const displayName = document.getElementById('custom-bot-name').value.trim();
        if (!token) { showToast('Bot token is required', 'error'); return; }
        try {
            showToast('Activating custom bot...', 'info');
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-bot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, display_name: displayName })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Custom bot activated! Opening invite page...', 'success');
                document.getElementById('custom-bot-token').value = '';
                loadCustomBot();
                if (data.invite_url) {
                    setTimeout(() => window.open(data.invite_url, '_blank'), 800);
                }
            } else {
                showToast(data.error || 'Failed to activate', 'error');
            }
        } catch (e) { showToast('Failed to activate custom bot', 'error'); }
    };

    let _customBotPresence = { status: 'online', activity_type: 'playing', activity_text: '' };

    window.cpEditCustomBot = function() {
        const editForm = document.getElementById('custom-bot-edit-form');
        if (!editForm) return;
        const currentName = document.getElementById('custom-bot-hero-name').textContent;
        const editNameInput = document.getElementById('custom-bot-edit-name');
        if (editNameInput) editNameInput.value = currentName === 'Custom Bot' ? '' : currentName;
        // Pre-fill presence fields
        const statusSel = document.getElementById('custom-bot-edit-status');
        const actTypeSel = document.getElementById('custom-bot-edit-activity-type');
        const actText = document.getElementById('custom-bot-edit-activity');
        if (statusSel) statusSel.value = _customBotPresence.status || 'online';
        if (actTypeSel) actTypeSel.value = _customBotPresence.activity_type || 'playing';
        if (actText) actText.value = _customBotPresence.activity_text || '';
        editForm.style.display = '';
        editForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    window.cpCancelEdit = function() {
        const editForm = document.getElementById('custom-bot-edit-form');
        if (editForm) editForm.style.display = 'none';
        const tokenInput = document.getElementById('custom-bot-edit-token');
        if (tokenInput) tokenInput.value = '';
    };

    window.cpUpdateCustomBot = async function() {
        const displayName = document.getElementById('custom-bot-edit-name').value.trim();
        const newToken = document.getElementById('custom-bot-edit-token').value.trim();
        try {
            showToast('Saving changes...', 'info');
            if (newToken) {
                // Full re-activate with new token
                const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-bot`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: newToken, display_name: displayName })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Bot updated and restarted!', 'success');
                    window.cpCancelEdit();
                    loadCustomBot();
                } else {
                    showToast(data.error || 'Failed to update', 'error');
                }
            } else {
                // Update display name + presence via PATCH
                const presenceStatus = document.getElementById('custom-bot-edit-status')?.value || 'online';
                const activityType = document.getElementById('custom-bot-edit-activity-type')?.value || 'playing';
                const activityText = document.getElementById('custom-bot-edit-activity')?.value.trim() || '';
                const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-bot`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        display_name: displayName,
                        presence_status: presenceStatus,
                        activity_type: activityType,
                        activity_text: activityText,
                    })
                });
                const data = await res.json();
                if (data.success) {
                    if (data.warning) {
                        showToast(`Saved, but: ${data.warning}`, 'warning');
                    } else {
                        showToast('Bot renamed on Discord!', 'success');
                    }
                    window.cpCancelEdit();
                    loadCustomBot();
                } else {
                    showToast(data.error || 'Failed to update', 'error');
                }
            }
        } catch (e) { showToast('Failed to update custom bot', 'error'); }
    };

    window.cpOpenInvite = function() {
        if (!_customBotInviteUrl) return;
        window.open(_customBotInviteUrl, '_blank');
    };

    window.cpRemoveCustomBot = async function() {
        if (!confirm('Remove the custom bot? The process will be stopped and the token deleted.')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-bot`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast('Custom bot removed', 'success');
                _customBotInviteUrl = null;
                loadCustomBot();
            } else {
                showToast(data.error || 'Failed to remove', 'error');
            }
        } catch (e) { showToast('Failed to remove custom bot', 'error'); }
    };

    window.cpStartBot = async function() {
        try {
            showToast('Starting bot...', 'info');
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-bot/start`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast('Bot started', 'success');
                setTimeout(loadCustomBot, 2000);
            } else {
                showToast(data.error || 'Failed to start bot', 'error');
            }
        } catch (e) { showToast('Failed to start bot', 'error'); }
    };

    window.cpStopBot = async function() {
        if (!confirm('Stop the custom bot? It will go offline until restarted.')) return;
        try {
            showToast('Stopping bot...', 'info');
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-bot/stop`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast('Bot stopped', 'success');
                setTimeout(loadCustomBot, 1500);
            } else {
                showToast(data.error || 'Failed to stop bot', 'error');
            }
        } catch (e) { showToast('Failed to stop bot', 'error'); }
    };

    window.cpRestartBot = async function() {
        try {
            showToast('Restarting bot...', 'info');
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-bot/restart`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast('Bot restarted', 'success');
                setTimeout(loadCustomBot, 2000);
            } else {
                showToast(data.error || 'Failed to restart bot', 'error');
            }
        } catch (e) { showToast('Failed to restart bot', 'error'); }
    };

    window.cpRetryBot = async function() {
        try {
            showToast('Retrying bot start...', 'info');
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/custom-bot/start`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast('Bot restarted — checking status...', 'success');
                setTimeout(loadCustomBot, 3000);
            } else {
                showToast(data.error || 'Failed to restart bot', 'error');
            }
        } catch (e) { showToast('Failed to retry bot', 'error'); }
    };

    // ==================== UTILITIES ====================
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3000);
    }

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeCreateHubModal();
            closeEditHubModal();
            window.cpCloseCreatePanelModal?.();
            window.cpCloseEditPanelModal?.();
            window.cpCloseCreateGiveawayModal?.();
            window.cpCloseEditGiveawayModal?.();
            document.getElementById('createScheduledMsgModal')?.remove();
            document.getElementById('createFeedModal')?.remove();
            document.getElementById('modActionModal')?.remove();
            window.cpCloseCreateRRModal?.();
            window.cpCloseCreateCmdModal?.();
        }
    });

    // ==================== AUTO-SAVE SYSTEM ====================
    const autoSaveMap = {
        'welcome': () => window.cpSaveWelcome?.(),
        'leveling': () => window.cpSaveLeveling?.(),
        'economy': () => window.cpSaveEconomy?.(),
        'tickets': () => window.cpSaveTickets?.(),
        'starboard': () => window.cpSaveStarboard?.(),
        'suggestions': () => window.cpSaveSuggestions?.(),
        'anti-raid': () => window.cpSaveAntiRaid?.(),
        'lockdown': () => window.cpSaveLockdown?.(),
        'autoroles': () => cpSaveAutoRoles?.(),
        'slowmode': () => window.cpSaveSlowmode?.(),
        'nicknames': () => window.cpSaveNicknames?.(),
        'invite-tracker': () => window.cpSaveInviteTracker?.(),
        'alt-detection': () => window.cpSaveAltDetection?.(),
        'anti-phishing': () => window.cpSaveAntiPhishing?.(),
        'word-filter': () => window.cpSaveWordFilter?.(),
        'mention-protection': () => window.cpSaveMentionProtection?.(),
        'verification': () => window.cpSaveVerification?.(),
        'quarantine': () => window.cpSaveQuarantine?.(),
        'anti-nuke': () => window.cpSaveAntiNuke?.(),
        'modmail': () => window.cpSaveModmail?.(),
        'reports': () => window.cpSaveReports?.(),
        'ban-appeals': () => window.cpSaveBanAppeals?.(),
        'birthdays': () => window.cpSaveBirthdays?.(),
        'boost-rewards': () => window.cpSaveBoostRewards?.(),
        'auto-responder': () => window.cpSaveAutoResponder?.(),
        'keyword-alerts': () => window.cpSaveKeywordAlerts?.(),
        'temp-roles': () => window.cpSaveTempRoles?.(),
        'auto-thread': () => window.cpSaveAutoThread?.(),
        'server-rules': () => window.cpSaveServerRules?.(),
        'polls': () => window.cpSavePolls?.(),
        'logging': () => window.cpSaveLogging?.(),
        'log-general': () => window.cpSaveLogging?.(),
        'log-messages': () => window.cpSaveMessageLogger?.(),
        'log-voice': () => window.cpSaveVoiceLogger?.(),
        'log-joinleave': () => window.cpSaveJoinLeaveLogger?.(),
        'log-names': () => window.cpSaveNameLogger?.(),
        'log-emoji': () => window.cpSaveEmojiStats?.(),
        'log-activity': () => window.cpSaveChannelActivity?.(),
        'reminders': () => window.cpSaveReminders?.(),
        'color-roles': () => window.cpSaveColorRoles?.(),
        'sticky-messages': () => window.cpSaveStickyMessages?.(),
        'anti-hoist': () => window.cpSaveAntiHoist?.(),
        'link-filter': () => window.cpSaveLinkFilter?.(),
        'media-channels': () => window.cpSaveMediaChannels?.(),
        'log-boosts': () => window.cpSaveBoostTracker?.(),
        'log-roles': () => window.cpSaveRoleLogger?.(),
    };

    const _autoSaveTimers = {};
    document.querySelector('.admin-content')?.addEventListener('change', function(e) {
        if (_sectionLoading) return; // Don't autosave while loading section data
        if (e.target.getAttribute('onchange')) return;
        const section = e.target.closest('.content-section');
        if (!section) return;
        // Check for sub-tab-content first for more specific save
        const subTab = e.target.closest('.sub-tab-content');
        let saveKey = section.dataset.section;
        if (subTab && subTab.id && autoSaveMap[subTab.id]) {
            saveKey = subTab.id;
        }
        const saveFn = autoSaveMap[saveKey];
        if (!saveFn) return;
        clearTimeout(_autoSaveTimers[saveKey]);
        _autoSaveTimers[saveKey] = setTimeout(() => saveFn(), 800);
    });

    // ==================== SUB-TAB SWITCHING ====================
    document.querySelector('.admin-content')?.addEventListener('click', function(e) {
        const tab = e.target.closest('.sub-tab');
        if (!tab) return;
        const tabContainer = tab.closest('.sub-tabs');
        const section = tab.closest('.content-section');
        if (!tabContainer || !section) return;
        const targetId = tab.dataset.subtab;
        const groupId = section.dataset.section;

        // Update active tab button
        tabContainer.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (sectionGroups[groupId]) {
            // Group sub-tab - swap visible content-section
            sectionGroups[groupId]._activeTab = targetId;
            sectionGroups[groupId].subtabs.forEach(st => {
                document.querySelector(`.content-section[data-section="${st.id}"]`)?.classList.remove('sub-section-active');
            });
            const newSubSec = document.querySelector(`.content-section[data-section="${targetId}"]`);
            if (newSubSec) {
                newSubSec.classList.add('sub-section-active');
                // Keep tab bar before the newly shown sub-section
                if (section.parentNode === newSubSec.parentNode) {
                    newSubSec.parentNode.insertBefore(section, newSubSec);
                }
            }
            _sectionLoading = true;
            _loadSectionSwitch(targetId).finally(() => { _sectionLoading = false; });
        } else {
            // Inline sub-tab (like logging) - swap sub-tab-content inside section
            section.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
            const target = document.getElementById(targetId);
            if (target) target.classList.add('active');
        }
    });

    // ==================== COUNTING CHANNEL ====================
    async function loadCounting() {
        try {
            const [res, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/counting`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
            ]);
            const data = await res.json();
            const chData = await chRes.json();
            const config = data.config || {};
            const channels = (chData.channels || []).filter(c => c.type === 0);
            document.getElementById('counting-enabled').checked = config.enabled || false;
            document.getElementById('counting-current').textContent = config.current_count ?? 0;
            document.getElementById('counting-highscore').textContent = config.high_score ?? 0;
            document.getElementById('counting-mode').value = config.mode || 'strict';
            document.getElementById('counting-delete-non-numbers').checked = config.delete_non_numbers || false;
            document.getElementById('counting-max-consecutive').value = config.max_consecutive ?? 1;
            document.getElementById('counting-show-reaction').checked = config.show_reaction !== false;
            document.getElementById('counting-allow-math').checked = config.allow_math || false;
            document.getElementById('counting-count-by').value = config.count_by || 1;
            document.getElementById('counting-cooldown').value = config.cooldown_seconds || 0;
            document.getElementById('counting-milestone').value = config.milestone_interval || 0;
            document.getElementById('counting-goal').value = config.goal || 0;
            document.getElementById('counting-goal-reset').checked = config.goal_reset || false;
            const channelOpts = '<option value="">-- Select Channel --</option>' + channels.map(c =>
                `<option value="${c.id}" ${c.id === config.channel_id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`
            ).join('');
            document.getElementById('counting-channel').innerHTML = channelOpts;
            const failLogOpts = '<option value="">-- None --</option>' + channels.map(c =>
                `<option value="${c.id}" ${c.id === config.fail_log_channel_id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`
            ).join('');
            document.getElementById('counting-fail-log-channel').innerHTML = failLogOpts;
        } catch (e) { console.error('Failed to load counting config:', e); }
    }

    window.cpSaveCounting = async function() {
        try {
            const payload = {
                enabled: document.getElementById('counting-enabled').checked,
                channel_id: document.getElementById('counting-channel').value || null,
                fail_log_channel_id: document.getElementById('counting-fail-log-channel').value || null,
                mode: document.getElementById('counting-mode').value,
                delete_non_numbers: document.getElementById('counting-delete-non-numbers').checked,
                max_consecutive: Math.max(0, parseInt(document.getElementById('counting-max-consecutive').value) || 0),
                show_reaction: document.getElementById('counting-show-reaction').checked,
                allow_math: document.getElementById('counting-allow-math').checked,
                count_by: Math.max(1, parseInt(document.getElementById('counting-count-by').value) || 1),
                cooldown_seconds: Math.max(0, parseInt(document.getElementById('counting-cooldown').value) || 0),
                milestone_interval: Math.max(0, parseInt(document.getElementById('counting-milestone').value) || 0),
                goal: Math.max(0, parseInt(document.getElementById('counting-goal').value) || 0),
                goal_reset: document.getElementById('counting-goal-reset').checked,
            };
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/counting`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            showToast('Counting settings saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    window.cpResetCount = async function() {
        if (!confirm('Reset the count back to 0?')) return;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/counting`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }),
            });
            document.getElementById('counting-current').textContent = '0';
            showToast('Count reset to 0', 'success');
        } catch (e) { showToast('Failed to reset', 'error'); }
    };

    // ==================== QUOTES ====================
    async function loadQuotes() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/quotes`);
            const data = await res.json();
            const quotes = data.quotes || [];
            document.getElementById('quotes-count').textContent = quotes.length;
            const list = document.getElementById('quotes-list');
            if (quotes.length === 0) {
                list.innerHTML = '<p style="color:var(--text-muted);">No quotes yet. Use <code>/quote add</code> in Discord to add quotes.</p>';
                return;
            }
            list.innerHTML = quotes.slice().reverse().map(q => `
                <div class="channel-item" style="flex-wrap:wrap;gap:0.25rem;">
                    <div class="channel-info" style="flex:1;min-width:0;">
                        <div class="channel-name">"${escapeHtml(q.content.substring(0, 120))}${q.content.length > 120 ? '…' : ''}"</div>
                        <div class="channel-owner">— <@${q.author_id}> &nbsp;|&nbsp; #${q.id} &nbsp;|&nbsp; <t:${q.timestamp}:D></div>
                    </div>
                    <button class="control-btn danger small" onclick="window.cpDeleteQuote(${q.id})">Delete</button>
                </div>`).join('');
        } catch (e) { console.error('Failed to load quotes:', e); }
    }

    window.cpDeleteQuote = async function(id) {
        if (!confirm(`Delete quote #${id}?`)) return;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/quotes/${id}`, { method: 'DELETE' });
            showToast(`Quote #${id} deleted`, 'success');
            loadQuotes();
        } catch (e) { showToast('Failed to delete', 'error'); }
    };

    // ==================== CONFESSIONS ====================
    async function loadConfessions() {
        try {
            const [res, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/confessions`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
            ]);
            const data = await res.json();
            const chData = await chRes.json();
            const config = data.config || {};
            const channels = (chData.channels || []).filter(c => c.type === 0);
            document.getElementById('confessions-enabled').checked = config.enabled || false;
            const chSel = document.getElementById('confessions-channel');
            const logSel = document.getElementById('confessions-log-channel');
            const opts = channels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
            chSel.innerHTML = '<option value="">-- Select Channel --</option>' + opts;
            logSel.innerHTML = '<option value="">-- None --</option>' + opts;
            chSel.value = config.channel_id || '';
            logSel.value = config.log_channel_id || '';
        } catch (e) { console.error('Failed to load confessions config:', e); }
    }

    window.cpSaveConfessions = async function() {
        try {
            const payload = {
                enabled: document.getElementById('confessions-enabled').checked,
                channel_id: document.getElementById('confessions-channel').value || null,
                log_channel_id: document.getElementById('confessions-log-channel').value || null,
            };
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/confessions`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            showToast('Confession settings saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    // ==================== COLOR ROLES ====================
    async function loadColorRoles() {
        try {
            const [res, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/color-roles`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
            ]);
            const data = await res.json();
            const chData = await chRes.json();
            const config = data.config || {};
            const channels = (chData.channels || []).filter(c => c.type === 0);
            document.getElementById('color-roles-enabled').checked = config.enabled || false;
            const sel = document.getElementById('color-roles-channel');
            sel.innerHTML = '<option value="">-- Select Channel --</option>' + channels.map(c =>
                `<option value="${c.id}" ${c.id === config.channel_id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`
            ).join('');
            renderColorRolesList(config.colors || []);
        } catch (e) { console.error('Failed to load color roles:', e); }
    }

    function renderColorRolesList(colors) {
        const el = document.getElementById('color-roles-list');
        if (colors.length === 0) {
            el.innerHTML = '<p style="color:var(--text-muted);">No colors yet. Add one above.</p>';
            return;
        }
        el.innerHTML = colors.map(c => `
            <div class="channel-item">
                <div style="width:20px;height:20px;border-radius:50%;background:${escapeHtml(c.hex)};flex-shrink:0;border:1px solid rgba(255,255,255,0.15);"></div>
                <div class="channel-info">
                    <div class="channel-name">${c.emoji ? escapeHtml(c.emoji) + ' ' : ''}${escapeHtml(c.name)}</div>
                    <div class="channel-owner">${escapeHtml(c.hex)}</div>
                </div>
                <button class="control-btn danger small" onclick="window.cpDeleteColorRole('${c.role_id}')">Remove</button>
            </div>`).join('');
    }

    window.cpSaveColorRoles = async function() {
        try {
            const payload = {
                enabled: document.getElementById('color-roles-enabled').checked,
                channel_id: document.getElementById('color-roles-channel').value || null,
            };
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/color-roles`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            showToast('Color roles settings saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    window.cpAddColorRole = async function() {
        const name = document.getElementById('cr-add-name').value.trim();
        const hex = document.getElementById('cr-add-hex').value.trim();
        const emoji = document.getElementById('cr-add-emoji').value.trim();
        if (!name || !hex) return showToast('Name and hex color are required', 'error');
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/color-roles/colors`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, hex, emoji: emoji || null }),
            });
            const data = await res.json();
            if (!res.ok) return showToast(data.error || 'Failed to add color', 'error');
            document.getElementById('cr-add-name').value = '';
            document.getElementById('cr-add-hex').value = '';
            document.getElementById('cr-add-emoji').value = '';
            showToast(`Color "${name}" added!`, 'success');
            loadColorRoles();
        } catch (e) { showToast('Failed to add color', 'error'); }
    };

    window.cpDeleteColorRole = async function(roleId) {
        if (!confirm('Remove this color role? The Discord role will be deleted.')) return;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/color-roles/colors/${roleId}`, { method: 'DELETE' });
            showToast('Color removed', 'success');
            loadColorRoles();
        } catch (e) { showToast('Failed to remove', 'error'); }
    };

    // ==================== SELF ROLES ====================
    let selfRolesData = null;
    let selfRolesGuildRoles = [];

    async function loadSelfRoles() {
        try {
            const [res, chRes, rolesRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/self-roles`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/roles`),
            ]);
            const data = await res.json();
            const chData = await chRes.json();
            const rolesData = await rolesRes.json();
            const config = data.config || {};
            selfRolesData = config;
            selfRolesGuildRoles = rolesData.roles || [];
            const channels = (chData.channels || []).filter(c => c.type === 0);
            document.getElementById('self-roles-enabled').checked = config.enabled || false;
            const sel = document.getElementById('self-roles-channel');
            sel.innerHTML = '<option value="">-- Select Channel --</option>' + channels.map(c =>
                `<option value="${c.id}" ${c.id === config.channel_id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`
            ).join('');
            renderSelfRolesCategories(config.categories || []);
        } catch (e) { console.error('Failed to load self roles:', e); }
    }

    function renderSelfRolesCategories(categories) {
        const el = document.getElementById('self-roles-categories');
        if (categories.length === 0) {
            el.innerHTML = '<p style="color:var(--text-muted);">No categories yet. Add one above to get started.</p>';
            return;
        }
        el.innerHTML = categories.map(cat => {
            const isReaction = cat.style === 'reaction';
            return `<div class="settings-card" style="margin-bottom:0.75rem;background:var(--bg-tertiary);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;flex-wrap:wrap;gap:0.5rem;">
                    <div>
                        <strong>${cat.emoji ? escapeHtml(cat.emoji) + ' ' : ''}${escapeHtml(cat.name)}</strong>
                        <span style="color:var(--text-muted);font-size:0.85rem;margin-left:0.5rem;">${cat.roles.length} role(s)${cat.preset ? ' · preset: ' + escapeHtml(cat.preset) : ''}</span>
                    </div>
                    <div style="display:flex;gap:0.5rem;">
                        <button class="control-btn small" onclick="window.cpRepublishSelfRoleCategory('${cat.id}')">Republish</button>
                        <button class="control-btn danger small" onclick="window.cpDeleteSelfRoleCategory('${cat.id}')">Remove</button>
                    </div>
                </div>
                <div style="display:flex;gap:0.75rem;margin-bottom:0.75rem;flex-wrap:wrap;align-items:center;">
                    <div>
                        <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:2px;">Emoji <span style="font-weight:400;">(optional)</span></label>
                        <input type="text" class="form-input" value="${escapeHtml(cat.emoji || '')}" placeholder="None" maxlength="64" style="width:90px;" onchange="window.cpUpdateSelfRoleCategory('${cat.id}','emoji',this.value.trim())">
                    </div>
                    <div>
                        <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:2px;">Embed Colour</label>
                        <input type="color" value="#${cat.embed_color || '5865f2'}" style="width:42px;height:34px;padding:2px;border-radius:6px;border:1px solid var(--border-color);cursor:pointer;background:none;" onchange="window.cpUpdateSelfRoleCategory('${cat.id}','embed_color',this.value.slice(1))">
                    </div>
                    <div>
                        <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:2px;">Style</label>
                        <select class="form-select" style="width:160px;" onchange="window.cpUpdateSelfRoleCategory('${cat.id}','style',this.value)">
                            <option value="select" ${!isReaction ? 'selected' : ''}>Dropdown Menu</option>
                            <option value="reaction" ${isReaction ? 'selected' : ''}>Reaction Roles</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:2px;">Max Selections <small>(0 = unlimited)</small></label>
                        <input type="number" class="form-input" value="${cat.max_select || 0}" min="0" max="25" style="width:80px;" onchange="window.cpUpdateSelfRoleCategory('${cat.id}','max_select',parseInt(this.value)||0)">
                    </div>
                    ${isReaction ? '<small style="color:var(--text-muted);align-self:flex-end;padding-bottom:4px;">Each role needs an emoji set below</small>' : ''}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">
                    ${cat.roles.map(r => {
                        const roleName = selfRolesGuildRoles.find(gr => gr.id === r.role_id)?.name || r.role_id;
                        return `<span class="tag">${r.emoji ? escapeHtml(r.emoji) + ' ' : ''}${escapeHtml(r.label || roleName)}<button class="tag-remove" onclick="window.cpRemoveSelfRoleFromCategory('${cat.id}','${r.role_id}')">&times;</button></span>`;
                    }).join('')}
                    ${cat.roles.length === 0 ? '<span style="color:var(--text-muted);font-size:0.85rem;">No roles yet</span>' : ''}
                </div>
                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
                    <select id="sr-role-sel-${cat.id}" class="form-select" style="flex:1;min-width:150px;max-width:250px;">
                        <option value="">-- Add a role --</option>
                        ${selfRolesGuildRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
                    </select>
                    <input type="text" id="sr-label-${cat.id}" placeholder="Label (optional)" style="width:130px;" maxlength="25">
                    <input type="text" id="sr-emoji-${cat.id}" placeholder="Emoji${isReaction ? ' (required)' : ''}" style="width:90px;" maxlength="64">
                    <button class="control-btn primary small" onclick="window.cpAddRoleToSelfCategory('${cat.id}')">Add Role</button>
                </div>
            </div>`;
        }).join('');
    }

    window.cpSaveSelfRoles = async function() {
        try {
            const payload = {
                enabled: document.getElementById('self-roles-enabled').checked,
                channel_id: document.getElementById('self-roles-channel').value || null,
            };
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/self-roles`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            showToast('Self roles settings saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    window.cpUpdateSelfRoleCategory = async function(catId, field, value) {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/self-roles/categories/${catId}`, {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({[field]: value})
            });
            const data = await res.json();
            if (data.success) { if (field === 'style' || field === 'emoji') loadSelfRoles(); }
            else showToast(data.error || 'Failed to update', 'error');
        } catch (e) { showToast('Failed to update category', 'error'); }
    };

    window.cpPublishSelfRoles = async function() {
        try {
            showToast('Publishing panel…', 'info');
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/self-roles/publish`, { method: 'POST' });
            const data = await res.json();
            if (data.success) showToast(data.message || 'Panel published!', 'success');
            else showToast(data.error || data.message || 'Failed to publish', 'error');
        } catch (e) { showToast('Failed to publish panel', 'error'); }
    };

    window.cpRepublishAllSelfRoles = async function() {
        if (!confirm('Republish all categories? All existing Discord messages will be updated in place — no messages will be deleted.')) return;
        try {
            showToast('Republishing all categories…', 'info');
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/self-roles/publish`, { method: 'POST' });
            const data = await res.json();
            if (data.success) showToast(data.message || 'All categories republished!', 'success');
            else showToast(data.error || data.message || 'Failed to republish', 'error');
        } catch (e) { showToast('Failed to republish', 'error'); }
    };

    window.cpRecreateAllSelfRoles = async function() {
        if (!confirm('Recreate all category messages? The existing Discord messages will be deleted and brand new ones posted. Use this to fix broken panels.')) return;
        try {
            showToast('Recreating all categories…', 'info');
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/self-roles/recreate`, { method: 'POST' });
            const data = await res.json();
            if (data.success) showToast(data.message || 'All categories recreated!', 'success');
            else showToast(data.error || data.message || 'Failed to recreate', 'error');
        } catch (e) { showToast('Failed to recreate', 'error'); }
    };

    window.cpAddSelfRoleCategory = async function() {
        const name = document.getElementById('sr-add-name').value.trim();
        const desc = document.getElementById('sr-add-desc').value.trim();
        const emoji = document.getElementById('sr-add-emoji').value.trim();
        const color = (document.getElementById('sr-add-color')?.value || '#5865f2').slice(1);
        if (!name) return showToast('Category name is required', 'error');
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/self-roles/categories`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description: desc, emoji, embed_color: color }),
            });
            const data = await res.json();
            if (!res.ok) return showToast(data.error || 'Failed to add category', 'error');
            document.getElementById('sr-add-name').value = '';
            document.getElementById('sr-add-desc').value = '';
            document.getElementById('sr-add-emoji').value = '';
            document.getElementById('sr-add-color').value = '#5865f2';
            showToast(`Category "${name}" added!`, 'success');
            loadSelfRoles();
        } catch (e) { showToast('Failed to add category', 'error'); }
    };

    window.cpDeleteSelfRoleCategory = async function(catId) {
        if (!confirm('Remove this category?')) return;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/self-roles/categories/${catId}`, { method: 'DELETE' });
            showToast('Category removed', 'success');
            loadSelfRoles();
        } catch (e) { showToast('Failed to remove', 'error'); }
    };

    window.cpRepublishSelfRoleCategory = async function(catId) {
        if (!confirm('Republish this category? The existing Discord message will be updated in place.')) return;
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/self-roles/categories/${catId}/republish`, { method: 'POST' });
            const data = await res.json();
            if (data.success) { showToast('Category republished', 'success'); loadSelfRoles(); }
            else showToast(data.error || 'Failed to republish', 'error');
        } catch (e) { showToast('Failed to republish', 'error'); }
    };

    window.cpAddRoleToSelfCategory = async function(catId) {
        const sel = document.getElementById(`sr-role-sel-${catId}`);
        const roleId = sel?.value;
        const label = document.getElementById(`sr-label-${catId}`)?.value.trim();
        const emoji = document.getElementById(`sr-emoji-${catId}`)?.value.trim();
        if (!roleId) return showToast('Select a role first', 'error');
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/self-roles/categories/${catId}/roles`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role_id: roleId, label: label || '', emoji: emoji || null }),
            });
            const data = await res.json();
            if (!res.ok) return showToast(data.error || 'Failed to add role', 'error');
            showToast('Role added to category', 'success');
            loadSelfRoles();
        } catch (e) { showToast('Failed to add role', 'error'); }
    };

    window.cpRemoveSelfRoleFromCategory = async function(catId, roleId) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/self-roles/categories/${catId}/roles/${roleId}`, { method: 'DELETE' });
            showToast('Role removed', 'success');
            loadSelfRoles();
        } catch (e) { showToast('Failed to remove', 'error'); }
    };

    // ==================== PROFILES ====================
    async function loadProfiles() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/profiles`);
            const data = await res.json();
            const users = data.users || {};
            const el = document.getElementById('profiles-list');
            if (!el) return;
            const entries = Object.entries(users);
            if (entries.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);">No profiles yet. Members use <code>/profile bio</code> or <code>/profile link</code> in Discord.</p>'; return; }
            el.innerHTML = entries.map(([uid, p]) => `
                <div class="channel-item">
                    <div class="channel-info">
                        <div class="channel-name"><@${uid}></div>
                        <div class="channel-owner">${escapeHtml(p.bio || 'No bio')}${p.mood ? ` &nbsp;|&nbsp; ${escapeHtml(p.mood)}` : ''}${p.color ? ` &nbsp;|&nbsp; <span style="color:${escapeHtml(p.color)}">${escapeHtml(p.color)}</span>` : ''}</div>
                    </div>
                    <button class="control-btn danger small" onclick="window.cpDeleteProfile('${uid}')">Reset</button>
                </div>`).join('');
        } catch (e) { console.error('Failed to load profiles:', e); }
    }
    window.cpDeleteProfile = async function(userId) {
        if (!confirm('Reset this user\'s profile?')) return;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/profiles/${userId}`, { method: 'DELETE' });
            showToast('Profile reset', 'success'); loadProfiles();
        } catch (e) { showToast('Failed to reset', 'error'); }
    };

    // ==================== REPUTATION ====================
    async function loadReputation() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reputation`);
            const data = await res.json();
            const el = document.getElementById('rep-cooldown');
            if (el) el.value = data.cooldown_hours ?? 24;
            const lb = document.getElementById('rep-leaderboard');
            if (!lb) return;
            const sorted = Object.entries(data.users || {})
                .map(([id, v]) => ({ id, rep: v.rep || 0 }))
                .filter(u => u.rep > 0)
                .sort((a, b) => b.rep - a.rep)
                .slice(0, 10);
            if (sorted.length === 0) { lb.innerHTML = '<p style="color:var(--text-muted);">No rep given yet.</p>'; return; }
            lb.innerHTML = sorted.map((u, i) => `
                <div class="channel-item">
                    <div class="channel-name" style="width:2rem;text-align:center;font-weight:700;">#${i + 1}</div>
                    <div class="channel-info"><div class="channel-name">&lt;@${u.id}&gt;</div></div>
                    <strong style="color:var(--accent);">${u.rep} rep</strong>
                </div>`).join('');
        } catch (e) { console.error('Failed to load reputation:', e); }
    }
    window.cpSaveRepSettings = async function() {
        const cooldown = parseInt(document.getElementById('rep-cooldown')?.value) || 24;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reputation`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cooldown_hours: cooldown }),
            });
            showToast('Rep settings saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    // ==================== RELATIONSHIPS ====================
    async function loadRelationships() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/relationships`);
            const data = await res.json();
            const el = document.getElementById('relationships-list');
            if (!el) return;
            const entries = Object.entries(data.relationships || {});
            if (entries.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);">No marriages or friendships yet.</p>'; return; }
            el.innerHTML = entries.map(([key, r]) => {
                const [id1, id2] = key.split(':');
                const icon = r.type === 'married' ? '💍' : '🤝';
                const label = r.type === 'married' ? 'Married' : 'Friends';
                const since = r.since ? new Date(r.since).toLocaleDateString() : 'Unknown';
                return `<div class="channel-item">
                    <div class="channel-info">
                        <div class="channel-name">${icon} &lt;@${id1}&gt; &amp; &lt;@${id2}&gt;</div>
                        <div class="channel-owner">${label} since ${since}</div>
                    </div>
                    <button class="control-btn danger small" onclick="window.cpDeleteRelationship('${key}')">Remove</button>
                </div>`;
            }).join('');
        } catch (e) { console.error('Failed to load relationships:', e); }
    }
    window.cpDeleteRelationship = async function(key) {
        if (!confirm('Remove this relationship?')) return;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/relationships?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
            showToast('Relationship removed', 'success'); loadRelationships();
        } catch (e) { showToast('Failed to remove', 'error'); }
    };

    // ==================== MOODS ====================
    async function loadMoods() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/moods`);
            const data = await res.json();
            const el = document.getElementById('moods-list');
            if (!el) return;
            const entries = Object.entries(data.moods || {});
            if (entries.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);">No moods set. Members use <code>/mood set</code> in Discord.</p>'; return; }
            el.innerHTML = entries.map(([uid, m]) => `
                <div class="channel-item">
                    <div style="font-size:1.4rem;">${escapeHtml(m.mood || '😶')}</div>
                    <div class="channel-info">
                        <div class="channel-name">&lt;@${uid}&gt;</div>
                        <div class="channel-owner">${escapeHtml(m.mood_text || '')}</div>
                    </div>
                    <button class="control-btn danger small" onclick="window.cpClearMood('${uid}')">Clear</button>
                </div>`).join('');
        } catch (e) { console.error('Failed to load moods:', e); }
    }
    window.cpClearMood = async function(userId) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/moods/${userId}`, { method: 'DELETE' });
            showToast('Mood cleared', 'success'); loadMoods();
        } catch (e) { showToast('Failed to clear', 'error'); }
    };

    // ==================== TOURNAMENTS ====================
    async function loadTournaments() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/tournaments`);
            const data = await res.json();
            const el = document.getElementById('tournaments-list');
            if (!el) return;
            const tournaments = data.tournaments || [];
            if (tournaments.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);">No tournaments yet. Use <code>/tournament create</code> in Discord.</p>'; return; }
            el.innerHTML = tournaments.map(t => `
                <div class="settings-card" style="margin-bottom:0.75rem;">
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
                        <div>
                            <strong>🏆 ${escapeHtml(t.name)}</strong>
                            <span style="color:var(--text-muted);font-size:0.85rem;margin-left:0.5rem;">${t.type} · ${t.participants?.length || 0} players · ${t.status}</span>
                        </div>
                        <button class="control-btn danger small" onclick="window.cpDeleteTournament(${t.id})">Delete</button>
                    </div>
                </div>`).join('');
        } catch (e) { console.error('Failed to load tournaments:', e); }
    }
    window.cpDeleteTournament = async function(id) {
        if (!confirm('Delete this tournament?')) return;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/tournaments/${id}`, { method: 'DELETE' });
            showToast('Tournament deleted', 'success'); loadTournaments();
        } catch (e) { showToast('Failed to delete', 'error'); }
    };
    window.cpCreateTournament = async function() {
        const name = document.getElementById('t-create-name')?.value.trim();
        const max = parseInt(document.getElementById('t-create-max')?.value) || 16;
        if (!name) return showToast('Tournament name required', 'error');
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/tournaments`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, max }),
            });
            const data = await res.json();
            if (!res.ok) return showToast(data.error || 'Failed to create', 'error');
            document.getElementById('t-create-name').value = '';
            showToast(`Tournament "${name}" created! (ID: ${data.tournament?.id})`, 'success');
            loadTournaments();
        } catch (e) { showToast('Failed to create tournament', 'error'); }
    };

    // ==================== REDDIT FEED ====================
    async function loadRedditFeed() {
        try {
            const [res, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reddit-feed`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
            ]);
            const data = await res.json();
            const chData = await chRes.json();
            const feeds = data.feeds || [];
            const channels = (chData.channels || []).filter(c => c.type === 0);
            const chSel = document.getElementById('reddit-channel');
            if (chSel) chSel.innerHTML = '<option value="">-- Select Channel --</option>' + channels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
            const el = document.getElementById('reddit-feeds-list');
            if (!el) return;
            if (feeds.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);">No Reddit feeds yet.</p>'; return; }
            el.innerHTML = feeds.map(f => `
                <div class="channel-item">
                    <div class="channel-info">
                        <div class="channel-name">r/${escapeHtml(f.subreddit)}</div>
                        <div class="channel-owner">#${escapeHtml(f.channel_name || f.channel_id)} · ${f.type || 'hot'}</div>
                    </div>
                    <button class="control-btn danger small" onclick="window.cpDeleteRedditFeed('${f.id}')">Remove</button>
                </div>`).join('');
        } catch (e) { console.error('Failed to load reddit feeds:', e); }
    }
    window.cpAddRedditFeed = async function() {
        const sub = document.getElementById('reddit-subreddit')?.value.trim().replace(/^r\//i, '');
        const channelId = document.getElementById('reddit-channel')?.value;
        const type = document.getElementById('reddit-type')?.value || 'hot';
        if (!sub || !channelId) return showToast('Subreddit and channel required', 'error');
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reddit-feed`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subreddit: sub, channel_id: channelId, type }),
            });
            const data = await res.json();
            if (!res.ok) return showToast(data.error || 'Failed to add feed', 'error');
            document.getElementById('reddit-subreddit').value = '';
            showToast(`r/${sub} feed added!`, 'success'); loadRedditFeed();
        } catch (e) { showToast('Failed to add feed', 'error'); }
    };
    window.cpDeleteRedditFeed = async function(id) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reddit-feed/${id}`, { method: 'DELETE' });
            showToast('Feed removed', 'success'); loadRedditFeed();
        } catch (e) { showToast('Failed to remove', 'error'); }
    };

    // ==================== NEWS FEED ====================
    async function loadNewsFeed() {
        try {
            const [res, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/news-feed`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
            ]);
            const data = await res.json();
            const chData = await chRes.json();
            const feeds = data.feeds || [];
            const channels = (chData.channels || []).filter(c => c.type === 0);
            const chSel = document.getElementById('news-channel');
            if (chSel) chSel.innerHTML = '<option value="">-- Select Channel --</option>' + channels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
            const el = document.getElementById('news-feeds-list');
            if (!el) return;
            if (feeds.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);">No RSS feeds yet.</p>'; return; }
            el.innerHTML = feeds.map(f => `
                <div class="channel-item">
                    <div class="channel-info">
                        <div class="channel-name">${escapeHtml(f.name || f.url)}</div>
                        <div class="channel-owner">#${escapeHtml(f.channel_name || f.channel_id)}</div>
                    </div>
                    <button class="control-btn danger small" onclick="window.cpDeleteNewsFeed('${f.id}')">Remove</button>
                </div>`).join('');
        } catch (e) { console.error('Failed to load news feeds:', e); }
    }
    window.cpAddNewsFeed = async function() {
        const url = document.getElementById('news-url')?.value.trim();
        const channelId = document.getElementById('news-channel')?.value;
        const name = document.getElementById('news-name')?.value.trim();
        if (!url || !channelId) return showToast('URL and channel required', 'error');
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/news-feed`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, channel_id: channelId, name: name || null }),
            });
            const data = await res.json();
            if (!res.ok) return showToast(data.error || 'Failed to add feed', 'error');
            document.getElementById('news-url').value = '';
            showToast('News feed added!', 'success'); loadNewsFeed();
        } catch (e) { showToast('Failed to add feed', 'error'); }
    };
    window.cpDeleteNewsFeed = async function(id) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/news-feed/${id}`, { method: 'DELETE' });
            showToast('Feed removed', 'success'); loadNewsFeed();
        } catch (e) { showToast('Failed to remove', 'error'); }
    };

    // ==================== MEME OF THE DAY ====================
    async function loadMemeOfDay() {
        try {
            const [res, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/meme-of-day`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
            ]);
            const data = await res.json();
            const chData = await chRes.json();
            const channels = (chData.channels || []).filter(c => c.type === 0);
            const chSel = document.getElementById('meme-channel');
            if (chSel) chSel.innerHTML = '<option value="">-- Disabled --</option>' + channels.map(c => `<option value="${c.id}" ${c.id === data.channel_id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('');
            const lastEl = document.getElementById('meme-last-date');
            if (lastEl) lastEl.textContent = data.last_date ? `Last posted: ${data.last_date}` : 'Not posted yet';
        } catch (e) { console.error('Failed to load meme of day:', e); }
    }
    window.cpSaveMemeOfDay = async function() {
        const channel_id = document.getElementById('meme-channel')?.value || null;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/meme-of-day`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel_id }),
            });
            showToast(channel_id ? 'Meme of the Day enabled!' : 'Meme of the Day disabled.', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    // ==================== QUOTE OF THE DAY ====================
    async function loadQuoteOfDay() {
        try {
            const [res, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/quote-of-day`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
            ]);
            const data = await res.json();
            const chData = await chRes.json();
            const channels = (chData.channels || []).filter(c => c.type === 0);
            const chSel = document.getElementById('qotd-channel');
            if (chSel) chSel.innerHTML = '<option value="">-- Disabled --</option>' + channels.map(c => `<option value="${c.id}" ${c.id === data.channel_id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('');
            const lastEl = document.getElementById('qotd-last-date');
            if (lastEl) lastEl.textContent = data.last_date ? `Last posted: ${data.last_date}` : 'Not posted yet';
        } catch (e) { console.error('Failed to load quote of day:', e); }
    }
    window.cpSaveQuoteOfDay = async function() {
        const channel_id = document.getElementById('qotd-channel')?.value || null;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/quote-of-day`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel_id }),
            });
            showToast(channel_id ? 'Quote of the Day enabled!' : 'Quote of the Day disabled.', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    // ==================== DEBATE ====================
    async function loadDebate() {
        try {
            const [res, chRes] = await Promise.all([
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/debate`),
                fetch(`/api/cub-protector/guilds/${selectedGuild.id}/channels`),
            ]);
            const data = await res.json();
            const chData = await chRes.json();
            const channels = (chData.channels || []).filter(c => c.type === 0);
            const chSel = document.getElementById('debate-log-channel');
            if (chSel) chSel.innerHTML = '<option value="">-- None --</option>' + channels.map(c => `<option value="${c.id}" ${c.id === data.log_channel_id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('');
            const el = document.getElementById('debate-active-list');
            if (!el) return;
            el.innerHTML = '<p style="color:var(--text-muted);">Active debates are tracked live in the bot — use <code>/debate start @user1 @user2 topic</code> in Discord.</p>';
        } catch (e) { console.error('Failed to load debate:', e); }
    }
    window.cpSaveDebate = async function() {
        const payload = { log_channel_id: document.getElementById('debate-log-channel')?.value || null };
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/debate`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            showToast('Debate settings saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    // ==================== REACTION BOARD ====================
    let _rbLiveInterval = null;

    async function loadReactionBoard() {
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reaction-board`);
            const data = await res.json();
            const s = data.settings || {};
            document.getElementById('rb-enabled').checked = s.enabled !== false;
            const items = data.items || [];
            const list = document.getElementById('rb-items-list');
            list.innerHTML = '';
            if (!items.length) {
                list.innerHTML = '<p style="color:var(--text-muted);padding:1rem 0;">No channels configured. Add one below.</p>';
            } else {
                for (const item of items) renderRBItem(item, list);
            }
            // Stop any previous live interval
            if (_rbLiveInterval) { clearInterval(_rbLiveInterval); _rbLiveInterval = null; }
        } catch (e) { showToast('Failed to load Reaction Board', 'error'); }
    }

    function renderRBItem(item, container) {
        const card = document.createElement('div');
        card.className = 'settings-card';
        card.dataset.rbId = item.id;
        card.style.marginBottom = '1rem';
        const statsEnabled = item.stats?.enabled || false;
        const labels = (item.stats?.reaction_labels || []);
        const labelsHtml = labels.map((rl, i) => `
            <div class="rb-label-row" style="display:flex;gap:.5rem;align-items:center;margin-bottom:.4rem;">
                <input class="form-input" style="width:70px;" placeholder="😀" value="${escapeHtml(rl.emoji || '')}" oninput="window.cpRBUpdateLabels('${item.id}')">
                <input class="form-input" style="flex:1;" placeholder="Meaning (e.g. Love it)" value="${escapeHtml(rl.label || '')}" oninput="window.cpRBUpdateLabels('${item.id}')">
                <button class="control-btn danger small" onclick="this.closest('.rb-label-row').remove();window.cpRBUpdateLabels('${item.id}')">✕</button>
            </div>`).join('');
        card.innerHTML = `
            <div class="settings-row">
                <div class="settings-info"><h4>#${escapeHtml(item.channel_name || item.channel_id)}</h4>
                    <p>Reactions: ${(item.auto_reactions||[]).join(' ')}${item.filter ? ` • Filter: <code>${escapeHtml(item.filter)}</code>` : ''}</p></div>
                <div style="display:flex;gap:.5rem;align-items:center;">
                    <label class="toggle"><input type="checkbox" ${item.enabled !== false ? 'checked' : ''} onchange="window.cpRBToggleItem('${item.id}',this.checked)"><span class="toggle-slider"></span></label>
                    <button class="control-btn danger small" onclick="window.cpRBDeleteItem('${item.id}')">Remove</button>
                </div>
            </div>
            <div class="settings-row" style="margin-top:1rem;">
                <div class="settings-info"><h4>📊 Stats & Leaderboard</h4><p>Track reactions and post ranked results at a set time each day</p></div>
                <label class="toggle"><input type="checkbox" id="rb-stats-${item.id}" ${statsEnabled ? 'checked' : ''} onchange="window.cpRBToggleStats('${item.id}',this.checked)"><span class="toggle-slider"></span></label>
            </div>
            <div id="rb-stats-cfg-${item.id}" ${statsEnabled ? '' : 'style="display:none"'}>
                <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:1rem;align-items:flex-end;">
                    <div class="form-group" style="flex:1;min-width:160px;">
                        <label class="form-label">Frequency</label>
                        <select class="form-select" id="rb-freq-${item.id}" onchange="window.cpRBToggleFreqOptions('${item.id}')">
                            <option value="manual" ${(item.stats?.frequency||'daily') === 'manual' ? 'selected' : ''}>Manual only</option>
                            <option value="daily" ${(item.stats?.frequency||'daily') === 'daily' ? 'selected' : ''}>Daily</option>
                            <option value="weekly" ${(item.stats?.frequency) === 'weekly' ? 'selected' : ''}>Weekly</option>
                        </select>
                    </div>
                    <div class="form-group" id="rb-day-group-${item.id}" style="flex:1;min-width:140px;${(item.stats?.frequency) === 'weekly' ? '' : 'display:none'}">
                        <label class="form-label">Day of Week</label>
                        <select class="form-select" id="rb-day-${item.id}">
                            <option value="0" ${(item.stats?.day_of_week??1) == 0 ? 'selected' : ''}>Sunday</option>
                            <option value="1" ${(item.stats?.day_of_week??1) == 1 ? 'selected' : ''}>Monday</option>
                            <option value="2" ${(item.stats?.day_of_week) == 2 ? 'selected' : ''}>Tuesday</option>
                            <option value="3" ${(item.stats?.day_of_week) == 3 ? 'selected' : ''}>Wednesday</option>
                            <option value="4" ${(item.stats?.day_of_week) == 4 ? 'selected' : ''}>Thursday</option>
                            <option value="5" ${(item.stats?.day_of_week) == 5 ? 'selected' : ''}>Friday</option>
                            <option value="6" ${(item.stats?.day_of_week) == 6 ? 'selected' : ''}>Saturday</option>
                        </select>
                    </div>
                    <div class="form-group" id="rb-time-group-${item.id}" style="flex:1;min-width:140px;${(item.stats?.frequency||'daily') === 'manual' ? 'display:none' : ''}">
                        <label class="form-label">Time (UTC)</label>
                        <input type="time" class="form-input" id="rb-time-${item.id}" value="${escapeHtml(item.stats?.display_time||'')}">
                    </div>
                    <div class="form-group" style="flex:1;min-width:140px;">
                        <label class="form-label">Show in Results</label>
                        <select class="form-select" id="rb-topn-${item.id}">
                            <option value="0" ${(item.stats?.top_n??10) == 0 ? 'selected' : ''}>All entries</option>
                            <option value="3" ${(item.stats?.top_n) == 3 ? 'selected' : ''}>Top 3</option>
                            <option value="5" ${(item.stats?.top_n) == 5 ? 'selected' : ''}>Top 5</option>
                            <option value="10" ${(item.stats?.top_n??10) == 10 ? 'selected' : ''}>Top 10</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <button class="control-btn primary small" onclick="window.cpRBSaveStats('${item.id}')">Save Settings</button>
                    </div>
                </div>
                <div style="margin-top:1rem;">
                    <label class="form-label">Reaction Labels <span style="color:var(--text-muted);font-size:.8em;">(emoji → meaning shown in results)</span></label>
                    <div id="rb-labels-${item.id}">${labelsHtml}</div>
                    <button class="control-btn secondary small" style="margin-top:.5rem;" onclick="window.cpRBAddLabel('${item.id}')">+ Add Label</button>
                </div>
                <div style="margin-top:1.25rem;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;">
                        <strong style="font-size:.95em;">📡 Live Standings</strong>
                        <button class="control-btn secondary small" onclick="window.cpRBRefreshLive('${item.id}')">Refresh</button>
                    </div>
                    <div id="rb-live-${item.id}" style="background:var(--bg-tertiary);border-radius:8px;padding:.75rem;font-size:.88em;color:var(--text-muted);">No data yet — refresh to load.</div>
                </div>
            </div>`;
        container.appendChild(card);
        if (statsEnabled) window.cpRBRefreshLive(item.id);
    }

    window.cpRBSaveEnabled = async function() {
        const enabled = document.getElementById('rb-enabled').checked;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reaction-board`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
            });
            showToast('Reaction Board ' + (enabled ? 'enabled' : 'disabled'), 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    window.cpRBToggleItem = async function(itemId, enabled) {
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reaction-board/${itemId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
            });
        } catch (e) { showToast('Failed to update', 'error'); }
    };

    window.cpRBToggleStats = async function(itemId, enabled) {
        document.getElementById(`rb-stats-cfg-${itemId}`).style.display = enabled ? '' : 'none';
        try {
            const stats = _rbGetStats(itemId);
            stats.enabled = enabled;
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reaction-board/${itemId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stats }),
            });
        } catch (e) { showToast('Failed to save stats', 'error'); }
    };

    window.cpRBSaveStats = async function(itemId) {
        try {
            const stats = _rbGetStats(itemId);
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reaction-board/${itemId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stats }),
            });
            showToast('Stats settings saved', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    function _rbGetStats(itemId) {
        const enabled = document.getElementById(`rb-stats-${itemId}`)?.checked || false;
        const frequency = document.getElementById(`rb-freq-${itemId}`)?.value || 'daily';
        const day_of_week = parseInt(document.getElementById(`rb-day-${itemId}`)?.value ?? '1', 10);
        const display_time = document.getElementById(`rb-time-${itemId}`)?.value || '';
        const top_n = document.getElementById(`rb-topn-${itemId}`)?.value || 'all';
        const labelRows = document.querySelectorAll(`#rb-labels-${itemId} .rb-label-row`);
        const reaction_labels = [];
        labelRows.forEach(row => {
            const inputs = row.querySelectorAll('input');
            const emoji = inputs[0]?.value?.trim();
            const label = inputs[1]?.value?.trim();
            if (emoji && label) reaction_labels.push({ emoji, label });
        });
        return { enabled, frequency, day_of_week, display_time, top_n, reaction_labels };
    }

    window.cpRBToggleFreqOptions = function(itemId) {
        const freq = document.getElementById(`rb-freq-${itemId}`)?.value || 'daily';
        const dayGroup = document.getElementById(`rb-day-group-${itemId}`);
        const timeGroup = document.getElementById(`rb-time-group-${itemId}`);
        if (dayGroup) dayGroup.style.display = freq === 'weekly' ? '' : 'none';
        if (timeGroup) timeGroup.style.display = freq === 'manual' ? 'none' : '';
    };

    window.cpRBAddLabel = function(itemId) {
        const container = document.getElementById(`rb-labels-${itemId}`);
        const row = document.createElement('div');
        row.className = 'rb-label-row';
        row.style.cssText = 'display:flex;gap:.5rem;align-items:center;margin-bottom:.4rem;';
        row.innerHTML = `
            <input class="form-input" style="width:70px;" placeholder="😀" oninput="window.cpRBUpdateLabels('${itemId}')">
            <input class="form-input" style="flex:1;" placeholder="Meaning (e.g. Love it)" oninput="window.cpRBUpdateLabels('${itemId}')">
            <button class="control-btn danger small" onclick="this.closest('.rb-label-row').remove();window.cpRBUpdateLabels('${itemId}')">✕</button>`;
        container.appendChild(row);
    };

    window.cpRBUpdateLabels = async function(itemId) {
        try {
            const stats = _rbGetStats(itemId);
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reaction-board/${itemId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stats }),
            });
        } catch (_) {}
    };

    window.cpRBDeleteItem = async function(itemId) {
        if (!confirm('Remove this channel from the reaction board?')) return;
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reaction-board/${itemId}`, { method: 'DELETE' });
            showToast('Channel removed', 'success');
            await loadReactionBoard();
        } catch (e) { showToast('Failed to remove', 'error'); }
    };

    window.cpRBAddChannel = async function() {
        const channels = await fetchGuildChannels();
        const channelSel = document.getElementById('rb-add-channel').value;
        const reactions = document.getElementById('rb-add-reactions').value.trim();
        const filter = document.getElementById('rb-add-filter').value.trim();
        if (!channelSel) return showToast('Select a channel', 'error');
        if (!reactions) return showToast('Enter at least one reaction emoji', 'error');
        const auto_reactions = reactions.split(',').map(e => e.trim()).filter(Boolean);
        const ch = channels.find(c => c.id === channelSel);
        try {
            await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reaction-board/add`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel_id: channelSel, channel_name: ch?.name || channelSel, auto_reactions, filter, enabled: true, stats: { enabled: false, reaction_labels: [], display_time: '', top_n: 10, last_reset: null }, tracked_messages: {} }),
            });
            showToast('Channel added', 'success');
            document.getElementById('rb-add-channel').value = '';
            document.getElementById('rb-add-reactions').value = '';
            document.getElementById('rb-add-filter').value = '';
            await loadReactionBoard();
        } catch (e) { showToast('Failed to add channel', 'error'); }
    };

    window.cpRBRefreshLive = async function(itemId) {
        const container = document.getElementById(`rb-live-${itemId}`);
        if (!container) return;
        container.textContent = 'Loading...';
        try {
            const res = await fetch(`/api/cub-protector/guilds/${selectedGuild.id}/reaction-board/${itemId}/live`);
            const data = await res.json();
            const entries = data.entries || [];
            const labels = data.labels || {};
            if (!entries.length) { container.textContent = 'No entries yet.'; return; }
            container.innerHTML = entries.slice(0, 20).map((e, i) => {
                const reactionStr = Object.entries(e.reactions || {}).filter(([,c]) => c > 0)
                    .map(([em, c]) => `${em} <strong>${c}</strong>${labels[em] ? ` <em>(${escapeHtml(labels[em])})</em>` : ''}`).join(' &bull; ') || 'No reactions';
                return `<div style="padding:.4rem 0;border-bottom:1px solid var(--border-color);"><strong>#${i+1}</strong> <a href="${escapeHtml(e.url)}" target="_blank" rel="noopener" style="color:var(--accent-color);word-break:break-all;">${escapeHtml(e.url)}</a><br><span style="color:var(--text-secondary);">👤 ${escapeHtml(e.author_display)}</span> &mdash; ${reactionStr}</div>`;
            }).join('');
        } catch (e) { container.textContent = 'Failed to load live standings.'; }
    };

    // Populate channel select in add form when section is loaded
    const _rbOrigLoadReactionBoard = loadReactionBoard;
    loadReactionBoard = async function() {
        await _rbOrigLoadReactionBoard();
        const sel = document.getElementById('rb-add-channel');
        if (!sel) return;
        const channels = await fetchGuildChannels();
        sel.innerHTML = '<option value="">Select channel...</option>' +
            channels.filter(c => c.type === 0).map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
    };

    // ==================== INIT ====================
    init();
})();
