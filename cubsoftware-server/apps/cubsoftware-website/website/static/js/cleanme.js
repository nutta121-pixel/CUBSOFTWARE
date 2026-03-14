// CleanMe Website JavaScript
class CleanMeApp {
    constructor() {
        this.user = null;
        this.servers = [];
        this.votedServers = JSON.parse(localStorage.getItem('cleanme_voted') || '[]');
        this.init();
    }

    init() {
        this.checkAuth();
        this.bindEvents();
        this.loadPageData();
    }

    // Authentication
    checkAuth() {
        const userCookie = this.getCookie('cleanme_user');
        if (userCookie) {
            try {
                this.user = JSON.parse(decodeURIComponent(userCookie));
                this.updateAuthUI();
            } catch (e) {
                console.error('Failed to parse user cookie');
            }
        }
    }

    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    updateAuthUI() {
        const loginBtn = document.querySelector('.login-btn');
        const userMenu = document.querySelector('.user-menu');

        if (this.user && loginBtn) {
            loginBtn.style.display = 'none';
            if (userMenu) {
                userMenu.style.display = 'flex';
                const avatar = userMenu.querySelector('.user-avatar');
                const name = userMenu.querySelector('.user-name');
                if (avatar) {
                    avatar.src = this.user.avatar || '/static/images/default-avatar.png';
                }
                if (name) {
                    name.textContent = this.user.username;
                }
            }
        }
    }

    login() {
        window.location.href = '/cleanme/auth/discord';
    }

    logout() {
        document.cookie = 'cleanme_user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'cleanme_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        this.user = null;
        window.location.href = '/cleanme';
    }

    // Event Binding
    bindEvents() {
        // Login button
        document.querySelectorAll('.login-btn').forEach(btn => {
            btn.addEventListener('click', () => this.login());
        });

        // Logout button
        document.querySelectorAll('.logout-btn').forEach(btn => {
            btn.addEventListener('click', () => this.logout());
        });

        // User menu dropdown
        const userMenuBtn = document.querySelector('.user-menu-btn');
        if (userMenuBtn) {
            userMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelector('.user-dropdown').classList.toggle('active');
            });
        }

        // Close dropdown on outside click
        document.addEventListener('click', () => {
            const dropdown = document.querySelector('.user-dropdown');
            if (dropdown) dropdown.classList.remove('active');
        });

        // Vote buttons
        document.querySelectorAll('.vote-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleVote(e));
        });

        // Copy template button
        document.querySelectorAll('.copy-template-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.copyTemplate(e));
        });

        // Search form
        const searchForm = document.querySelector('.search-form');
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => this.handleSearch(e));
        }

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFilter(e));
        });

        // Category filter
        const categoryFilter = document.querySelector('.category-filter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => this.handleCategoryChange(e));
        }

        // Sort filter
        const sortFilter = document.querySelector('.sort-filter');
        if (sortFilter) {
            sortFilter.addEventListener('change', (e) => this.handleSortChange(e));
        }

        // Server submit form
        const submitForm = document.querySelector('.server-submit-form');
        if (submitForm) {
            submitForm.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        // Server ID preview
        const serverIdInput = document.querySelector('#server-id');
        if (serverIdInput) {
            serverIdInput.addEventListener('blur', (e) => this.previewServer(e.target.value));
        }

        // Tab switching for server detail
        document.querySelectorAll('.server-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e));
        });

        // Mobile menu
        const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                document.querySelector('.nav-links').classList.toggle('active');
            });
        }

        // Infinite scroll for browse page
        if (document.querySelector('.servers-grid.browse')) {
            window.addEventListener('scroll', () => this.handleScroll());
        }
    }

    // Page Data Loading
    loadPageData() {
        const page = document.body.dataset.page;

        switch(page) {
            case 'home':
                this.loadHomeData();
                break;
            case 'browse':
                this.loadBrowseData();
                break;
            case 'server':
                this.loadServerData();
                break;
            case 'dashboard':
                this.loadDashboardData();
                break;
        }
    }

    async loadHomeData() {
        try {
            // Load featured servers
            const featuredRes = await fetch('/cleanme/api/servers/featured');
            const featured = await featuredRes.json();
            this.renderServerCards(featured, '.featured-servers .servers-grid');

            // Load popular servers
            const popularRes = await fetch('/cleanme/api/servers/popular');
            const popular = await popularRes.json();
            this.renderServerCards(popular, '.popular-servers .servers-grid');

            // Load latest servers
            const latestRes = await fetch('/cleanme/api/servers/latest');
            const latest = await latestRes.json();
            this.renderServerCards(latest, '.latest-servers .servers-grid');
        } catch (error) {
            console.error('Failed to load home data:', error);
        }
    }

    async loadBrowseData(page = 1, search = '', category = '', sort = 'popular') {
        const grid = document.querySelector('.servers-grid.browse');
        if (!grid) return;

        try {
            const params = new URLSearchParams({
                page,
                search,
                category,
                sort,
                limit: 12
            });

            const res = await fetch(`/cleanme/api/servers?${params}`);
            const data = await res.json();

            if (page === 1) {
                grid.innerHTML = '';
            }

            this.renderServerCards(data.servers, '.servers-grid.browse', true);

            this.currentPage = data.page;
            this.totalPages = data.total_pages;
            this.hasMore = data.page < data.total_pages;

            // Update results count
            const countEl = document.querySelector('.results-count');
            if (countEl) {
                countEl.textContent = `${data.total} servers found`;
            }
        } catch (error) {
            console.error('Failed to load browse data:', error);
            this.showToast('Failed to load servers', 'error');
        }
    }

    async loadServerData() {
        const serverId = document.body.dataset.serverId;
        if (!serverId) return;

        try {
            const res = await fetch(`/cleanme/api/servers/${serverId}`);
            const server = await res.json();

            if (server.error) {
                this.showToast(server.error, 'error');
                return;
            }

            this.renderServerDetail(server);
        } catch (error) {
            console.error('Failed to load server data:', error);
            this.showToast('Failed to load server details', 'error');
        }
    }

    async loadDashboardData() {
        if (!this.user) {
            window.location.href = '/cleanme/auth/discord';
            return;
        }

        try {
            const res = await fetch('/cleanme/api/my-servers');
            const servers = await res.json();

            this.renderDashboardServers(servers);
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            this.showToast('Failed to load your servers', 'error');
        }
    }

    // Rendering
    renderServerCards(servers, containerSelector, append = false) {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        if (!append) {
            container.innerHTML = '';
        }

        if (servers.length === 0 && !append) {
            container.innerHTML = '<p class="no-results">No servers found</p>';
            return;
        }

        servers.forEach(server => {
            const hasVoted = this.votedServers.includes(server.id);
            const card = document.createElement('div');
            card.className = 'server-card';
            card.innerHTML = `
                <div class="server-card-header">
                    <img src="${server.icon || '/static/images/default-server.png'}" alt="${server.name}" class="server-icon">
                    <div class="server-info">
                        <h3 class="server-name">${this.escapeHtml(server.name)}</h3>
                        <span class="server-category">${this.escapeHtml(server.category || 'General')}</span>
                    </div>
                </div>
                <p class="server-description">${this.escapeHtml(server.description || 'No description')}</p>
                <div class="server-stats">
                    <span class="stat"><i class="icon-channel"></i> ${server.channel_count || 0} channels</span>
                    <span class="stat"><i class="icon-role"></i> ${server.role_count || 0} roles</span>
                    <span class="stat"><i class="icon-category"></i> ${server.category_count || 0} categories</span>
                </div>
                <div class="server-card-footer">
                    <button class="vote-btn ${hasVoted ? 'voted' : ''}" data-server-id="${server.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 19V6M5 12l7-7 7 7"/>
                        </svg>
                        <span class="vote-count">${server.votes || 0}</span>
                    </button>
                    <a href="/cleanme/server/${server.id}" class="view-btn">View Template</a>
                </div>
            `;
            container.appendChild(card);
        });

        // Re-bind vote buttons
        container.querySelectorAll('.vote-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleVote(e));
        });
    }

    renderServerDetail(server) {
        // Update header
        const icon = document.querySelector('.server-detail-icon');
        const name = document.querySelector('.server-detail-name');
        const category = document.querySelector('.server-detail-category');
        const description = document.querySelector('.server-detail-description');

        if (icon) icon.src = server.icon || '/static/images/default-server.png';
        if (name) name.textContent = server.name;
        if (category) category.textContent = server.category || 'General';
        if (description) description.textContent = server.description || 'No description provided';

        // Update stats
        const channelCount = document.querySelector('.stat-channels');
        const roleCount = document.querySelector('.stat-roles');
        const categoryCount = document.querySelector('.stat-categories');
        const voteCount = document.querySelector('.stat-votes');
        const copyCount = document.querySelector('.stat-copies');

        if (channelCount) channelCount.textContent = server.channel_count || 0;
        if (roleCount) roleCount.textContent = server.role_count || 0;
        if (categoryCount) categoryCount.textContent = server.category_count || 0;
        if (voteCount) voteCount.textContent = server.votes || 0;
        if (copyCount) copyCount.textContent = server.copies || 0;

        // Render channels
        this.renderChannelList(server.channels || []);

        // Render roles
        this.renderRoleList(server.roles || []);

        // Render categories
        this.renderCategoryList(server.categories || []);

        // Update vote button
        const voteBtn = document.querySelector('.vote-btn-large');
        if (voteBtn) {
            voteBtn.dataset.serverId = server.id;
            if (this.votedServers.includes(server.id)) {
                voteBtn.classList.add('voted');
            }
        }

        // Update owner info
        const ownerAvatar = document.querySelector('.owner-avatar');
        const ownerName = document.querySelector('.owner-name');
        if (ownerAvatar && server.owner) {
            ownerAvatar.src = server.owner.avatar || '/static/images/default-avatar.png';
        }
        if (ownerName && server.owner) {
            ownerName.textContent = server.owner.username || 'Unknown';
        }
    }

    renderChannelList(channels) {
        const container = document.querySelector('.channels-list');
        if (!container) return;

        container.innerHTML = '';

        if (channels.length === 0) {
            container.innerHTML = '<p class="empty-message">No channels</p>';
            return;
        }

        // Group by category
        const grouped = {};
        channels.forEach(ch => {
            const catId = ch.parent_id || 'uncategorized';
            if (!grouped[catId]) grouped[catId] = [];
            grouped[catId].push(ch);
        });

        Object.entries(grouped).forEach(([catId, chs]) => {
            chs.forEach(ch => {
                const icon = ch.type === 2 ? 'voice' : ch.type === 5 ? 'announcement' : ch.type === 15 ? 'forum' : 'text';
                const div = document.createElement('div');
                div.className = 'channel-item';
                div.innerHTML = `
                    <span class="channel-icon ${icon}"></span>
                    <span class="channel-name">${this.escapeHtml(ch.name)}</span>
                `;
                container.appendChild(div);
            });
        });
    }

    renderRoleList(roles) {
        const container = document.querySelector('.roles-list');
        if (!container) return;

        container.innerHTML = '';

        if (roles.length === 0) {
            container.innerHTML = '<p class="empty-message">No roles</p>';
            return;
        }

        roles.forEach(role => {
            const color = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#99aab5';
            const div = document.createElement('div');
            div.className = 'role-item';
            div.innerHTML = `
                <span class="role-color" style="background-color: ${color}"></span>
                <span class="role-name">${this.escapeHtml(role.name)}</span>
            `;
            container.appendChild(div);
        });
    }

    renderCategoryList(categories) {
        const container = document.querySelector('.categories-list');
        if (!container) return;

        container.innerHTML = '';

        if (categories.length === 0) {
            container.innerHTML = '<p class="empty-message">No categories</p>';
            return;
        }

        categories.forEach(cat => {
            const div = document.createElement('div');
            div.className = 'category-item';
            div.innerHTML = `
                <span class="category-icon"></span>
                <span class="category-name">${this.escapeHtml(cat.name)}</span>
            `;
            container.appendChild(div);
        });
    }

    renderDashboardServers(servers) {
        const container = document.querySelector('.my-servers-grid');
        if (!container) return;

        container.innerHTML = '';

        if (servers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>You haven't submitted any servers yet.</p>
                    <a href="/cleanme/submit" class="btn-primary">Submit a Server</a>
                </div>
            `;
            return;
        }

        servers.forEach(server => {
            const card = document.createElement('div');
            card.className = 'dashboard-server-card';
            card.innerHTML = `
                <img src="${server.icon || '/static/images/default-server.png'}" alt="${server.name}" class="server-icon">
                <div class="server-info">
                    <h3>${this.escapeHtml(server.name)}</h3>
                    <div class="server-stats-mini">
                        <span>${server.votes || 0} votes</span>
                        <span>${server.copies || 0} copies</span>
                    </div>
                </div>
                <div class="server-actions">
                    <a href="/cleanme/server/${server.id}" class="btn-small">View</a>
                    <button class="btn-small btn-edit" data-server-id="${server.id}">Edit</button>
                    <button class="btn-small btn-danger btn-delete" data-server-id="${server.id}">Delete</button>
                </div>
            `;
            container.appendChild(card);
        });

        // Bind delete buttons
        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleDelete(e));
        });

        // Bind edit buttons
        container.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                window.location.href = `/cleanme/edit/${e.target.dataset.serverId}`;
            });
        });
    }

    // Event Handlers
    async handleVote(e) {
        e.preventDefault();
        e.stopPropagation();

        const btn = e.currentTarget;
        const serverId = btn.dataset.serverId;

        if (!this.user) {
            this.showToast('Please login to vote', 'warning');
            return;
        }

        if (this.votedServers.includes(serverId)) {
            this.showToast('You already voted for this server', 'info');
            return;
        }

        try {
            const res = await fetch(`/cleanme/api/servers/${serverId}/vote`, {
                method: 'POST'
            });
            const data = await res.json();

            if (data.success) {
                this.votedServers.push(serverId);
                localStorage.setItem('cleanme_voted', JSON.stringify(this.votedServers));
                btn.classList.add('voted');
                const countEl = btn.querySelector('.vote-count');
                if (countEl) countEl.textContent = data.votes;
                this.showToast('Vote recorded!', 'success');
            } else if (data.error && data.error.includes('already voted')) {
                if (!this.votedServers.includes(serverId)) {
                    this.votedServers.push(serverId);
                    localStorage.setItem('cleanme_voted', JSON.stringify(this.votedServers));
                }
                btn.classList.add('voted');
                this.showToast('You already voted for this server', 'info');
            } else {
                this.showToast(data.error || 'Failed to vote', 'error');
            }
        } catch (error) {
            console.error('Vote error:', error);
            this.showToast('Failed to vote', 'error');
        }
    }

    copyTemplate(e) {
        const serverId = e.currentTarget.dataset.serverId;
        const copyText = `/copy template:${serverId}`;

        navigator.clipboard.writeText(copyText).then(() => {
            this.showToast('Command copied! Paste in your Discord server', 'success');
        }).catch(() => {
            this.showToast('Failed to copy command', 'error');
        });
    }

    handleSearch(e) {
        e.preventDefault();
        const input = e.target.querySelector('input[name="search"]');
        const search = input.value.trim();

        const params = new URLSearchParams(window.location.search);
        params.set('search', search);
        params.set('page', '1');

        window.location.search = params.toString();
    }

    handleFilter(e) {
        const filter = e.target.dataset.filter;

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        e.target.classList.add('active');

        const params = new URLSearchParams(window.location.search);
        params.set('filter', filter);
        params.set('page', '1');

        this.loadBrowseData(1, params.get('search') || '', params.get('category') || '', filter);
    }

    handleCategoryChange(e) {
        const category = e.target.value;
        const params = new URLSearchParams(window.location.search);
        params.set('category', category);
        params.set('page', '1');

        window.location.search = params.toString();
    }

    handleSortChange(e) {
        const sort = e.target.value;
        const params = new URLSearchParams(window.location.search);
        params.set('sort', sort);
        params.set('page', '1');

        window.location.search = params.toString();
    }

    handleScroll() {
        if (this.loading || !this.hasMore) return;

        const scrollTop = window.scrollY;
        const windowHeight = window.innerHeight;
        const docHeight = document.documentElement.scrollHeight;

        if (scrollTop + windowHeight >= docHeight - 500) {
            this.loading = true;
            const params = new URLSearchParams(window.location.search);
            this.loadBrowseData(
                this.currentPage + 1,
                params.get('search') || '',
                params.get('category') || '',
                params.get('sort') || 'popular'
            ).then(() => {
                this.loading = false;
            });
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (!this.user) {
            this.showToast('Please login to submit a server', 'warning');
            return;
        }

        const form = e.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        try {
            const res = await fetch('/cleanme/api/servers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await res.json();

            if (result.success) {
                this.showToast('Server submitted successfully!', 'success');
                setTimeout(() => {
                    window.location.href = `/cleanme/server/${result.server_id}`;
                }, 1500);
            } else {
                this.showToast(result.error || 'Failed to submit server', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Server';
            }
        } catch (error) {
            console.error('Submit error:', error);
            this.showToast('Failed to submit server', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Server';
        }
    }

    async handleDelete(e) {
        const serverId = e.target.dataset.serverId;

        if (!confirm('Are you sure you want to delete this server listing? This cannot be undone.')) {
            return;
        }

        try {
            const res = await fetch(`/cleanme/api/servers/${serverId}`, {
                method: 'DELETE'
            });
            const result = await res.json();

            if (result.success) {
                this.showToast('Server deleted successfully', 'success');
                e.target.closest('.dashboard-server-card').remove();
            } else {
                this.showToast(result.error || 'Failed to delete server', 'error');
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showToast('Failed to delete server', 'error');
        }
    }

    async previewServer(serverId) {
        if (!serverId || serverId.length < 17) return;

        const preview = document.querySelector('.server-preview');
        if (!preview) return;

        preview.innerHTML = '<div class="loading">Loading server info...</div>';
        preview.style.display = 'block';

        try {
            const res = await fetch(`/cleanme/api/preview/${serverId}`);
            const data = await res.json();

            if (data.error) {
                preview.innerHTML = `<div class="error">${this.escapeHtml(data.error)}</div>`;
                return;
            }

            preview.innerHTML = `
                <div class="server-preview-header">
                    <img src="${data.icon || '/static/images/default-server.png'}" alt="${this.escapeHtml(data.name)}" class="server-preview-icon">
                    <div class="server-preview-info">
                        <h3>${this.escapeHtml(data.name)}</h3>
                        <div class="server-preview-stats">
                            <span class="preview-stat">📺 ${data.channel_count} channels</span>
                            <span class="preview-stat">🎭 ${data.role_count} roles</span>
                            <span class="preview-stat">📁 ${data.category_count} categories</span>
                        </div>
                        <p class="preview-verified">✅ Bot verified — ready to submit</p>
                    </div>
                </div>
            `;
        } catch (error) {
            preview.innerHTML = '<div class="error">Failed to load server info. Make sure the bot is in the server.</div>';
        }
    }

    switchTab(e) {
        const tab = e.target.dataset.tab;

        document.querySelectorAll('.server-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        e.target.classList.add('active');
        document.querySelector(`.tab-content[data-tab="${tab}"]`).classList.add('active');
    }

    // Utilities
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message, type = 'info') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.cleanmeApp = new CleanMeApp();
});
