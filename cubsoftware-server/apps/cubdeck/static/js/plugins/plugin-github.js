/* ─── GitHub Plugin ─── */

const _ghCache = {};

async function _ghApi(path, token) {
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const r = await fetch('https://api.github.com' + path, { headers });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || 'GitHub API error: ' + r.status); }
    return r.json();
}

CubDeck.registerPlugin({
    id: 'github',
    name: 'GitHub',
    icon: '🐙',
    actions: [
        {
            id: 'repo-stats',
            name: 'Repo Stats Display',
            icon: '🐙',
            settings: [
                { key: 'repo', label: 'owner/repo', type: 'text', placeholder: 'torvalds/linux' },
                { key: 'token', label: 'GitHub token (optional)', type: 'text', placeholder: 'ghp_...' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.repo) throw new Error('Repo required (owner/repo)');
                    const data = await _ghApi('/repos/' + s.repo, s.token || null);
                    _ghCache['stats_' + s.repo] = { stars: data.stargazers_count, forks: data.forks_count, fetched: Date.now() };
                    ctx.showToast(s.repo + ': ' + data.stargazers_count + '★ ' + data.forks_count + ' forks', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                const key = 'stats_' + s.repo;
                const now = Date.now();
                if (s.repo && (now - (_ghCache[key]?.fetched || 0) > 60000)) {
                    _ghCache[key] = Object.assign(_ghCache[key] || {}, { fetched: now });
                    _ghApi('/repos/' + s.repo, s.token || null)
                        .then(data => {
                            _ghCache[key] = { stars: data.stargazers_count, forks: data.forks_count, fetched: Date.now() };
                        })
                        .catch(() => {});
                }
                const cached = _ghCache[key];
                return {
                    label: cached && cached.stars != null ? cached.stars + '★ ' + cached.forks + ' forks' : (s.repo || 'GitHub'),
                    icon: '🐙'
                };
            }
        },
        {
            id: 'create-issue',
            name: 'Create GitHub Issue',
            icon: '🐛',
            settings: [
                { key: 'repo', label: 'owner/repo', type: 'text', placeholder: 'owner/repo' },
                { key: 'token', label: 'GitHub Token', type: 'text', placeholder: 'ghp_...' },
                { key: 'title', label: 'Issue title', type: 'text', placeholder: 'Bug: something is broken' },
                { key: 'body', label: 'Issue body', type: 'textarea', placeholder: 'Describe the issue...' },
                { key: 'labels', label: 'Labels (comma separated)', type: 'text', placeholder: 'bug,help wanted' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.repo) throw new Error('Repo required');
                    if (!s.token) throw new Error('GitHub token required');
                    if (!s.title) throw new Error('Issue title required');
                    const headers = {
                        'Accept': 'application/vnd.github+json',
                        'Authorization': 'Bearer ' + s.token,
                        'Content-Type': 'application/json'
                    };
                    const body = { title: s.title, body: s.body || '' };
                    if (s.labels) body.labels = s.labels.split(',').map(l => l.trim()).filter(Boolean);
                    const r = await fetch('https://api.github.com/repos/' + s.repo + '/issues', {
                        method: 'POST', headers, body: JSON.stringify(body)
                    });
                    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || 'Create failed'); }
                    const issue = await r.json();
                    ctx.showToast('Issue created: #' + issue.number, 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'trigger-workflow',
            name: 'Trigger GitHub Actions Workflow',
            icon: '⚙️',
            settings: [
                { key: 'repo', label: 'owner/repo', type: 'text', placeholder: 'owner/repo' },
                { key: 'token', label: 'GitHub Token', type: 'text', placeholder: 'ghp_...' },
                { key: 'workflow', label: 'Workflow filename', type: 'text', placeholder: 'deploy.yml' },
                { key: 'branch', label: 'Branch', type: 'text', default: 'main' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.repo) throw new Error('Repo required');
                    if (!s.token) throw new Error('GitHub token required');
                    if (!s.workflow) throw new Error('Workflow filename required');
                    const r = await fetch('https://api.github.com/repos/' + s.repo + '/actions/workflows/' + encodeURIComponent(s.workflow) + '/dispatches', {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/vnd.github+json',
                            'Authorization': 'Bearer ' + s.token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ ref: s.branch || 'main' })
                    });
                    if (!r.ok && r.status !== 204) { const e = await r.json().catch(() => ({})); throw new Error(e.message || 'Dispatch failed'); }
                    ctx.showToast('Workflow triggered: ' + s.workflow, 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'latest-release',
            name: 'Display Latest Release',
            icon: '🏷️',
            settings: [
                { key: 'repo', label: 'owner/repo', type: 'text', placeholder: 'owner/repo' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.repo) throw new Error('Repo required');
                    const data = await _ghApi('/repos/' + s.repo + '/releases/latest', null);
                    _ghCache['release_' + s.repo] = { tag: data.tag_name, fetched: Date.now() };
                    ctx.showToast('Latest: ' + data.tag_name, 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                const key = 'release_' + s.repo;
                const now = Date.now();
                if (s.repo && (now - (_ghCache[key]?.fetched || 0) > 300000)) {
                    _ghCache[key] = Object.assign(_ghCache[key] || {}, { fetched: now });
                    _ghApi('/repos/' + s.repo + '/releases/latest', null)
                        .then(data => { _ghCache[key] = { tag: data.tag_name, fetched: Date.now() }; })
                        .catch(() => {});
                }
                const cached = _ghCache[key];
                return {
                    label: (cached && cached.tag) ? cached.tag : 'No release',
                    icon: '🐙'
                };
            }
        },
        {
            id: 'merge-status',
            name: 'PR/Build Status Display',
            icon: '✅',
            settings: [
                { key: 'repo', label: 'owner/repo', type: 'text', placeholder: 'owner/repo' },
                { key: 'token', label: 'GitHub Token', type: 'text', placeholder: 'ghp_...' },
                { key: 'branch', label: 'Branch', type: 'text', default: 'main' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.repo) throw new Error('Repo required');
                    const data = await _ghApi('/repos/' + s.repo + '/commits/' + (s.branch || 'main') + '/status', s.token || null);
                    _ghCache['status_' + s.repo + '_' + (s.branch || 'main')] = { state: data.state, fetched: Date.now() };
                    ctx.showToast('Build status: ' + data.state, 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                const key = 'status_' + s.repo + '_' + (s.branch || 'main');
                const now = Date.now();
                if (s.repo && (now - (_ghCache[key]?.fetched || 0) > 30000)) {
                    _ghCache[key] = Object.assign(_ghCache[key] || {}, { fetched: now });
                    _ghApi('/repos/' + s.repo + '/commits/' + (s.branch || 'main') + '/status', s.token || null)
                        .then(data => { _ghCache[key] = { state: data.state, fetched: Date.now() }; })
                        .catch(() => {});
                }
                const cached = _ghCache[key];
                const state = cached?.state || 'unknown';
                return {
                    label: state,
                    icon: '🐙',
                    color: state === 'success' ? '#16a34a' : state === 'failure' ? '#dc2626' : '#d97706'
                };
            }
        }
    ]
});
