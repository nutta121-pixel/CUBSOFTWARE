/* ─── CubDeck Engine ─── */
const CUBDECK_VERSION = '1.3.19';
const CubDeck = (() => {
    let config = {};
    let activePage = 0;
    const DECK_NAME = (typeof CUBDECK_DECK_NAME !== 'undefined') ? CUBDECK_DECK_NAME : 'main';
    const DECK_API_SUFFIX = `?deck=${encodeURIComponent(DECK_NAME)}`;
    let editMode = false;
    let editingBtn = null; // { pageIdx, row, col }
    let _dragSrc = null;  // { row, col } while dragging in edit mode
    const plugins = {};
    const COLOR_PRESETS = ['#5865f2','#7c3aed','#059669','#dc2626','#d97706','#0891b2','#db2777','#65a30d','#ea580c','#6366f1','#14b8a6','#f43f5e'];
    const EMOJI_CATS = {
        'Common':  ['😀','😂','😍','😎','🤩','😤','😱','🤔','🥳','😴','🤣','😭','😊','😄','😆','🙃','🥲','😇','😈','👻','💀','🤖','👽','🎭'],
        'React':   ['👋','👍','👎','🙌','👏','💪','✌️','🤝','🖐️','☝️','🤜','🤛','💯','❤️','🧡','💛','💚','💙','💜','🖤','💔','🔥','💯','⭐'],
        'Stream':  ['🎬','🎮','🎯','🎲','🎵','🎶','🎤','🎧','📱','💻','🖥️','📺','📡','🔴','▶️','⏸️','⏹️','⏺️','⏩','⏪','🔊','🔇','🔔','🎥','🎙️','📸','🕹️','👾','🎪','🎠','🏆','🥇'],
        'Objects': ['⚙️','🔧','🔌','📋','📝','📌','💡','🔑','💎','⚡','🎁','📦','🗂️','💾','💿','📊','📈','📉','🖨️','⌨️','🖱️','🔓','🔐','🛡️','⚔️','🧩','🔭','🔬','⏱️','⏰'],
        'Symbols': ['✅','❌','⚠️','ℹ️','➕','➖','✖️','🔄','↩️','🔁','🔃','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🔶','🔷','🔸','🔹','▪️','◼️','🏁','🚩','📍','💠'],
        'Nature':  ['🌙','🌟','🌈','☀️','💧','🌊','❄️','🌸','🍀','🌲','🌴','🦁','🐯','🦊','🦋','🐬','🌍','🍎','🍕','☕','🎃','🎄','🎆','🌺','🌻','🍄','🌪️','⛈️'],
        'Numbers': ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','💯','#️⃣','*️⃣','🅰️','🅱️','🆎','🆑','🆒','🆓','🆔','🆕','🆖','🆗','🆘','🆙','🆚'],
    };

    let _localSaveTime = 0; // timestamp of last save from THIS instance

    // ─── Init ───
    function init(cfg) {
        config = cfg;
        activePage = cfg.active_page || 0;
        _localSaveTime = cfg._saved_at || 0;

        // Ensure pages exist
        if (!config.pages || !config.pages.length) {
            config.pages = [{ id: 'page-1', name: 'Main', buttons: [] }];
        }

        // OBS connection
        setupOBS();

        // Build UI
        renderPageTabs();
        renderGrid();
        bindUI();

        // Load all plugins after DOMContentLoaded (they self-register)
        setTimeout(refreshInstalledPlugins, 100);

        // Poll for config changes from other instances (browser ↔ dock sync)
        setInterval(_pollConfig, 10000);
    }

    function _pollConfig() {
        fetch('/cubdeck/api/config' + DECK_API_SUFFIX)
            .then(r => r.json())
            .then(remote => {
                const remoteTime = remote._saved_at || 0;
                // Only reload if the remote was saved MORE recently than our last save
                // and it's meaningfully newer (>1s gap to avoid race)
                if (remoteTime > _localSaveTime + 1000) {
                    config = remote;
                    _localSaveTime = remoteTime;
                    activePage = Math.min(activePage, (config.pages || []).length - 1);
                    renderPageTabs();
                    renderGrid();
                }
            }).catch(() => {});
    }

    // ─── OBS Helpers ───
    function isObsBlocked(host, proto) {
        if (location.protocol !== 'https:') return false;
        if (proto === 'wss') return false;
        const h = (host || '').toLowerCase();
        return h !== 'localhost' && h !== '127.0.0.1' && h !== '[::1]';
    }

    // ─── OBS Setup ───
    function setupOBS() {
        const obs = config.obs || {};
        const dot = document.getElementById('obsDot');
        const label = document.getElementById('obsLabel');

        obsClient.on('connecting', () => {
            dot.className = 'cd-obs-dot connecting';
            label.textContent = 'Connecting…';
        });
        obsClient.on('connected', () => {
            dot.className = 'cd-obs-dot connected';
            label.textContent = 'OBS ✓';
            showToast('Connected to OBS', 'success');
            const s = document.getElementById('obsConnectStatus');
            if (s) { s.textContent = 'Connected ✓'; s.style.color = '#4ade80'; }
        });
        obsClient.on('disconnected', () => {
            dot.className = 'cd-obs-dot';
            label.textContent = 'OBS';
        });
        obsClient.on('error', (msg) => {
            dot.className = 'cd-obs-dot error';
            label.textContent = 'OBS ✗';
            const s = document.getElementById('obsConnectStatus');
            if (s) {
                const isBlocked = msg && msg.includes('wss://');
                s.textContent = isBlocked
                    ? msg
                    : 'Could not connect — In OBS: Tools → WebSocket Server Settings → Enable WebSocket server';
                s.style.color = '#f87171';
            }
        });
        obsClient.on('sceneChanged', () => refreshAllButtons());
        obsClient.on('streamStateChanged', () => refreshAllButtons());
        obsClient.on('recordStateChanged', () => refreshAllButtons());
        obsClient.on('replayBufferStateChanged', () => refreshAllButtons());

        if (obs.host && obs.port !== undefined) {
            if (isObsBlocked(obs.host, obs.protocol || 'ws')) {
                dot.className = 'cd-obs-dot error';
                label.textContent = 'OBS (HTTPS)';
                label.title = 'OBS WebSocket is blocked on HTTPS with a non-localhost host. Use OBS Browser Dock (localhost) or enable WSS in OBS settings.';
            } else {
                obsClient.connect(obs.host, obs.port, obs.password, obs.protocol || 'ws');
            }
        }

        // Status click → settings
        document.getElementById('obsStatus').addEventListener('click', () => openSettings());
    }

    // ─── Grid ───
    function renderGrid() {
        const grid = document.getElementById('cdGrid');
        const { rows, cols } = config.grid || { rows: 3, cols: 5 };
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        grid.innerHTML = '';

        const page = config.pages[activePage];
        const buttonMap = {};
        if (page) {
            (page.buttons || []).forEach(b => { buttonMap[`${b.row},${b.col}`] = b; });
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const btn = buttonMap[`${r},${c}`];
                grid.appendChild(createCell(r, c, btn));
            }
        }
    }

    function createCell(row, col, btnData) {
        const el = document.createElement('button');
        el.className = 'cd-deck-btn' + (btnData ? '' : ' cd-btn-empty');
        el.dataset.row = row;
        el.dataset.col = col;

        const indicator = document.createElement('span');
        indicator.className = 'cd-edit-indicator';
        el.appendChild(indicator);

        if (btnData) {
            el.style.setProperty('--btn-bg', btnData.color || '#5865f2');
            el.style.setProperty('--btn-text', btnData.textColor || '#ffffff');
            el.style.background = btnData.color || '#5865f2';
            el.style.color = btnData.textColor || '#ffffff';

            const icon = document.createElement('span');
            icon.className = 'cd-deck-btn-icon';
            icon.textContent = btnData.icon || '';
            el.appendChild(icon);

            const label = document.createElement('span');
            label.className = 'cd-deck-btn-label';
            label.textContent = btnData.label || '';
            el.appendChild(label);

            const sub = document.createElement('span');
            sub.className = 'cd-deck-btn-sub';
            sub.id = `sub-${activePage}-${row}-${col}`;
            el.appendChild(sub);

            if (btnData.hotkey) {
                const hk = document.createElement('span');
                hk.className = 'cd-deck-btn-hotkey';
                hk.textContent = btnData.hotkey;
                el.appendChild(hk);
            }

            el.addEventListener('click', () => handleButtonClick(row, col, btnData, el));
            refreshButtonState(el, btnData);

            // Drag source — only active in edit mode
            el.draggable = true;
            el.addEventListener('dragstart', e => {
                if (!editMode) { e.preventDefault(); return; }
                _dragSrc = { row, col };
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => el.classList.add('cd-dragging'), 0);
            });
            el.addEventListener('dragend', () => {
                el.classList.remove('cd-dragging');
                document.querySelectorAll('.cd-drag-over').forEach(x => x.classList.remove('cd-drag-over'));
                _dragSrc = null;
            });
        } else {
            el.innerHTML += '<span style="font-size:20px;color:rgba(255,255,255,.15)">+</span>';
            el.addEventListener('click', () => {
                if (editMode) openEditor(row, col, null);
            });
        }

        // Drop target — all cells
        el.addEventListener('dragover', e => {
            if (!_dragSrc) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            el.classList.add('cd-drag-over');
        });
        el.addEventListener('dragleave', () => el.classList.remove('cd-drag-over'));
        el.addEventListener('drop', e => {
            e.preventDefault();
            el.classList.remove('cd-drag-over');
            if (!_dragSrc) return;
            const dstRow = parseInt(el.dataset.row);
            const dstCol = parseInt(el.dataset.col);
            if (_dragSrc.row === dstRow && _dragSrc.col === dstCol) return;
            moveButton(_dragSrc.row, _dragSrc.col, dstRow, dstCol);
            _dragSrc = null;
        });

        return el;
    }

    function refreshAllButtons() {
        const grid = document.getElementById('cdGrid');
        const page = config.pages[activePage];
        if (!page) return;
        const buttonMap = {};
        (page.buttons || []).forEach(b => { buttonMap[`${b.row},${b.col}`] = b; });
        grid.querySelectorAll('.cd-deck-btn:not(.cd-btn-empty)').forEach(el => {
            const r = el.dataset.row, c = el.dataset.col;
            const b = buttonMap[`${r},${c}`];
            if (b) refreshButtonState(el, b);
        });
    }

    function refreshButtonState(el, btnData) {
        const btnActions = btnData.actions?.length > 0
            ? btnData.actions
            : (btnData.plugin ? [{ plugin: btnData.plugin, action: btnData.action, settings: btnData.settings || {} }] : []);
        for (const a of btnActions) {
            const plugin = plugins[a.plugin];
            if (!plugin) continue;
            const action = (plugin.actions || []).find(act => act.id === a.action);
            if (action?.getState) {
                const state = action.getState(a.settings || {}, getCtx());
                el.classList.toggle('cd-btn-active', !!state.active);
                const sub = el.querySelector('.cd-deck-btn-sub');
                if (sub && state.sub !== undefined) sub.textContent = state.sub;
                break; // use first action with getState for display
            }
        }
    }

    // ─── Button Click ───
    async function handleButtonClick(row, col, btnData, el) {
        if (editMode) {
            openEditor(row, col, btnData);
            return;
        }

        // Support both multi-action (btnData.actions[]) and legacy single-action
        const btnActions = btnData.actions?.length > 0
            ? btnData.actions
            : (btnData.plugin ? [{ plugin: btnData.plugin, action: btnData.action, settings: btnData.settings || {} }] : []);

        if (btnActions.length === 0) { showToast('No actions configured', 'error'); return; }

        el.style.filter = 'brightness(1.3)';
        setTimeout(() => el.style.filter = '', 150);

        for (const a of btnActions) {
            const plugin = plugins[a.plugin];
            if (!plugin) { showToast('Plugin "' + (a.plugin || '?') + '" not installed', 'error'); continue; }
            const action = (plugin.actions || []).find(act => act.id === a.action);
            if (!action) { showToast('Action not found: ' + (a.action || '?'), 'error'); continue; }
            try {
                await action.execute(a.settings || {}, getCtx());
            } catch(e) {
                showToast(e.message || 'Action failed', 'error');
            }
        }
        setTimeout(() => refreshButtonState(el, btnData), 300);
    }

    function sendToOverlay(effect) {
        fetch('/cubdeck/api/overlay/push' + DECK_API_SUFFIX, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(effect)
        }).catch(() => {});
    }

    function getCtx() {
        return {
            obs: obsClient,
            config,
            showToast,
            refreshAllButtons,
            saveConfig,
            getCounterValue,
            setCounterValue,
            sendToOverlay,
        };
    }

    // ─── Page Tabs ───
    function renderPageTabs() {
        const tabs = document.getElementById('pageTabs');
        const bottom = document.getElementById('cdBottombar');
        tabs.innerHTML = '';
        bottom.innerHTML = '';

        config.pages.forEach((page, i) => {
            const tab = document.createElement('button');
            tab.className = 'cd-page-tab' + (i === activePage ? ' active' : '');
            tab.textContent = page.name;
            if (config.pages.length > 1) {
                const close = document.createElement('span');
                close.className = 'cd-page-tab-close';
                close.textContent = '✕';
                close.addEventListener('click', (e) => { e.stopPropagation(); removePage(i); });
                tab.appendChild(close);
            }
            tab.addEventListener('click', () => switchPage(i));
            tab.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const newName = prompt('Rename page:', page.name);
                if (newName && newName.trim()) {
                    config.pages[i].name = newName.trim();
                    renderPageTabs();
                    saveConfig(true);
                }
            });
            tabs.appendChild(tab);

            const bTab = tab.cloneNode(true);
            bTab.querySelectorAll('.cd-page-tab-close').forEach(el => {
                el.addEventListener('click', (e) => { e.stopPropagation(); removePage(i); });
            });
            bTab.addEventListener('click', () => switchPage(i));
            bottom.appendChild(bTab);
        });
    }

    function switchPage(i) {
        activePage = i;
        config.active_page = i;
        renderPageTabs();
        renderGrid();
    }

    function addPage() {
        const name = prompt('Page name:', 'Page ' + (config.pages.length + 1));
        if (!name) return;
        config.pages.push({ id: 'page-' + Date.now(), name, buttons: [] });
        switchPage(config.pages.length - 1);
        saveConfig();
    }

    function removePage(i) {
        if (config.pages.length <= 1) { showToast('Cannot remove last page'); return; }
        if (!confirm('Remove page "' + config.pages[i].name + '"?')) return;
        config.pages.splice(i, 1);
        if (activePage >= config.pages.length) activePage = config.pages.length - 1;
        config.active_page = activePage;
        renderPageTabs();
        renderGrid();
        saveConfig();
    }

    // ─── Edit Mode ───
    function toggleEditMode() {
        editMode = !editMode;
        document.body.classList.toggle('cd-edit-mode', editMode);
        document.getElementById('editModeBtn').classList.toggle('active', editMode);
        showToast(editMode ? 'Edit mode ON — tap any button to edit' : 'Edit mode OFF');
    }

    // ─── Button Editor ───
    function openEditor(row, col, btnData) {
        editingBtn = { row, col, existing: btnData };
        const modal = document.getElementById('editorModal');
        modal.classList.add('open');
        document.getElementById('editorTitle').textContent = btnData ? 'Edit Button' : 'Add Button';

        // Close emoji picker if open
        const pickerPanel = document.getElementById('emojiPickerPanel');
        if (pickerPanel) pickerPanel.style.display = 'none';

        // Appearance
        document.getElementById('btnIcon').value = btnData?.icon || '';
        document.getElementById('btnLabel').value = btnData?.label || '';
        document.getElementById('btnHotkey').value = btnData?.hotkey || '';
        const color = btnData?.color || '#5865f2';
        const textColor = btnData?.textColor || '#ffffff';
        document.getElementById('btnColor').value = color;
        document.getElementById('btnTextColor').value = textColor;

        // Preview
        updatePreview();

        // Color presets
        const presetsEl = document.getElementById('colorPresets');
        presetsEl.innerHTML = '';
        COLOR_PRESETS.forEach(c => {
            const sw = document.createElement('div');
            sw.className = 'cd-color-swatch' + (c === color ? ' selected' : '');
            sw.style.background = c;
            sw.addEventListener('click', () => {
                document.getElementById('btnColor').value = c;
                presetsEl.querySelectorAll('.cd-color-swatch').forEach(s => s.classList.remove('selected'));
                sw.classList.add('selected');
                updatePreview();
            });
            presetsEl.appendChild(sw);
        });

        // Action tab
        buildActionTab(btnData);

        // Switch to appearance tab
        switchEditorTab('appearance');

        document.getElementById('btnDelete').style.display = btnData ? '' : 'none';
    }

    function buildActionTab(btnData) {
        const list = document.getElementById('actionsList');
        list.innerHTML = '';

        const existingActions = (() => {
            if (btnData?.actions?.length > 0) return btnData.actions;
            if (btnData?.plugin) return [{ plugin: btnData.plugin, action: btnData.action, settings: btnData.settings || {} }];
            return [{ plugin: '', action: '', settings: {} }];
        })();

        existingActions.forEach(a => appendActionCard(list, a));
        updateActionNumbers(list);

        const oldBtn = document.getElementById('addActionBtn');
        const btn = oldBtn.cloneNode(true);
        oldBtn.replaceWith(btn);
        btn.addEventListener('click', () => {
            appendActionCard(list, { plugin: '', action: '', settings: {} });
            updateActionNumbers(list);
        });
    }

    function appendActionCard(list, actionData) {
        const card = document.createElement('div');
        card.className = 'cd-action-card';

        const header = document.createElement('div');
        header.className = 'cd-action-card-header';
        const numSpan = document.createElement('span');
        numSpan.className = 'cd-action-card-num';
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'cd-action-card-del';
        delBtn.innerHTML = '&times;';
        delBtn.addEventListener('click', () => { card.remove(); updateActionNumbers(list); });
        header.appendChild(numSpan);
        header.appendChild(delBtn);
        card.appendChild(header);

        const pRow = document.createElement('div');
        pRow.className = 'cd-form-row';
        const pLbl = document.createElement('label'); pLbl.textContent = 'Plugin';
        const pSel = document.createElement('select');
        pSel.className = 'cd-select cd-action-plugin-sel';
        pSel.innerHTML = '<option value="">— Select Plugin —</option>';
        (config.installed_plugins || []).forEach(pid => {
            const p = plugins[pid]; if (!p) return;
            const opt = document.createElement('option');
            opt.value = pid; opt.textContent = p.name;
            if (actionData.plugin === pid) opt.selected = true;
            pSel.appendChild(opt);
        });
        pRow.appendChild(pLbl); pRow.appendChild(pSel);
        card.appendChild(pRow);

        const aRow = document.createElement('div');
        aRow.className = 'cd-form-row';
        const aLbl = document.createElement('label'); aLbl.textContent = 'Action';
        const aSel = document.createElement('select');
        aSel.className = 'cd-select cd-action-type-sel';
        aRow.appendChild(aLbl); aRow.appendChild(aSel);
        card.appendChild(aRow);

        const settingsCont = document.createElement('div');
        settingsCont.className = 'cd-action-settings cd-action-settings-inner';
        card.appendChild(settingsCont);

        function refreshActionSelect(pluginId, selectedAction) {
            aSel.innerHTML = '<option value="">— Select Action —</option>';
            const p = plugins[pluginId]; if (!p) return;
            (p.actions || []).forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.id; opt.textContent = a.name;
                if (a.id === selectedAction) opt.selected = true;
                aSel.appendChild(opt);
            });
        }

        refreshActionSelect(actionData.plugin, actionData.action);
        buildActionSettingsInto(settingsCont, actionData.plugin, actionData.action, actionData.settings || {});

        pSel.addEventListener('change', () => {
            refreshActionSelect(pSel.value, null);
            buildActionSettingsInto(settingsCont, pSel.value, null, {});
        });
        aSel.addEventListener('change', () => {
            buildActionSettingsInto(settingsCont, pSel.value, aSel.value, {});
        });

        list.appendChild(card);
    }

    function updateActionNumbers(list) {
        list.querySelectorAll('.cd-action-card-num').forEach((el, i) => {
            el.textContent = 'Action ' + (i + 1);
        });
    }

    function buildActionSettingsInto(container, pluginId, actionId, currentSettings) {
        container.innerHTML = '';
        const p = plugins[pluginId];
        if (!p) return;
        const action = (p.actions || []).find(a => a.id === actionId);
        if (!action || !action.settings) return;

        action.settings.forEach(s => {
            const row = document.createElement('div');
            row.className = 'cd-action-setting-row';
            const lbl = document.createElement('label');
            lbl.textContent = s.label;
            row.appendChild(lbl);

            let input;
            if (s.type === 'obs-scene') {
                input = document.createElement('select');
                input.className = 'cd-select';
                input.dataset.key = s.key;
                const empty = document.createElement('option');
                empty.value = ''; empty.textContent = '— Select Scene —';
                input.appendChild(empty);
                obsClient.scenes.forEach(sc => {
                    const o = document.createElement('option');
                    o.value = sc.sceneName; o.textContent = sc.sceneName;
                    if ((currentSettings || {})[s.key] === sc.sceneName) o.selected = true;
                    input.appendChild(o);
                });
                // Also allow text fallback
                const manual = document.createElement('input');
                manual.className = 'cd-input';
                manual.placeholder = 'Or type scene name…';
                manual.dataset.key = s.key + '_manual';
                manual.value = (currentSettings || {})[s.key] || '';
                manual.style.marginTop = '6px';
                row.appendChild(input);
                row.appendChild(manual);
                input.onchange = () => { manual.value = input.value; };
                container.appendChild(row);
                return;
            } else if (s.type === 'obs-input') {
                input = document.createElement('select');
                input.className = 'cd-select';
                input.dataset.key = s.key;
                const empty = document.createElement('option');
                empty.value = ''; empty.textContent = '— Select Input —';
                input.appendChild(empty);
                obsClient.inputs.forEach(inp => {
                    const o = document.createElement('option');
                    o.value = inp.inputName; o.textContent = inp.inputName;
                    if ((currentSettings || {})[s.key] === inp.inputName) o.selected = true;
                    input.appendChild(o);
                });
            } else if (s.type === 'select' && s.options) {
                input = document.createElement('select');
                input.className = 'cd-select';
                input.dataset.key = s.key;
                s.options.forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt.value || opt; o.textContent = opt.label || opt;
                    if ((currentSettings || {})[s.key] === (opt.value || opt)) o.selected = true;
                    input.appendChild(o);
                });
            } else if (s.type === 'number') {
                input = document.createElement('input');
                input.type = 'number';
                input.className = 'cd-input';
                input.dataset.key = s.key;
                input.value = (currentSettings || {})[s.key] ?? (s.default ?? '');
                input.min = s.min ?? '';
                input.max = s.max ?? '';
                input.step = s.step ?? 1;
                input.placeholder = s.placeholder || '';
            } else if (s.type === 'range') {
                input = document.createElement('input');
                input.type = 'range';
                input.className = 'cd-input';
                input.dataset.key = s.key;
                input.value = (currentSettings || {})[s.key] ?? (s.default ?? 50);
                input.min = s.min ?? 0;
                input.max = s.max ?? 100;
                input.step = s.step ?? 1;
            } else if (s.type === 'checkbox') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.dataset.key = s.key;
                input.checked = (currentSettings || {})[s.key] ?? false;
            } else if (s.type === 'textarea') {
                input = document.createElement('textarea');
                input.className = 'cd-input';
                input.dataset.key = s.key;
                input.value = (currentSettings || {})[s.key] || '';
                input.placeholder = s.placeholder || '';
                input.rows = s.rows || 4;
                input.style.resize = 'vertical';
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'cd-input';
                input.dataset.key = s.key;
                input.value = (currentSettings || {})[s.key] || '';
                input.placeholder = s.placeholder || '';
            }

            row.appendChild(input);
            container.appendChild(row);
        });
    }

    function collectEditorData() {
        const list = document.getElementById('actionsList');
        const actions = [];
        list.querySelectorAll('.cd-action-card').forEach(card => {
            const plugin = card.querySelector('.cd-action-plugin-sel').value;
            const action = card.querySelector('.cd-action-type-sel').value;
            const settings = {};
            card.querySelectorAll('[data-key]').forEach(el => {
                const key = el.dataset.key;
                if (key.endsWith('_manual')) return;
                if (el.type === 'checkbox') settings[key] = el.checked;
                else settings[key] = el.value;
            });
            card.querySelectorAll('[data-key$="_manual"]').forEach(el => {
                const baseKey = el.dataset.key.replace('_manual', '');
                if (el.value) settings[baseKey] = el.value;
            });
            if (plugin) actions.push({ plugin, action, settings });
        });

        return {
            icon: document.getElementById('btnIcon').value.trim() || '',
            label: document.getElementById('btnLabel').value.trim() || 'Button',
            color: document.getElementById('btnColor').value,
            textColor: document.getElementById('btnTextColor').value,
            hotkey: document.getElementById('btnHotkey').value.trim(),
            actions,
            // Legacy compat for old saved buttons
            plugin: actions[0]?.plugin || '',
            action: actions[0]?.action || '',
            settings: actions[0]?.settings || {}
        };
    }

    function saveEditorBtn() {
        if (!editingBtn) return;
        const { row, col } = editingBtn;
        const data = collectEditorData();
        const page = config.pages[activePage];
        if (!page.buttons) page.buttons = [];
        // Remove existing button at this position
        page.buttons = page.buttons.filter(b => !(b.row === row && b.col === col));
        page.buttons.push({ id: 'btn-' + Date.now(), row, col, ...data });
        closeEditor();
        renderGrid();
        saveConfig();
    }

    function deleteEditorBtn() {
        if (!editingBtn) return;
        const { row, col } = editingBtn;
        const page = config.pages[activePage];
        page.buttons = (page.buttons || []).filter(b => !(b.row === row && b.col === col));
        closeEditor();
        renderGrid();
        saveConfig();
    }

    function moveButton(srcRow, srcCol, dstRow, dstCol) {
        const page = config.pages[activePage];
        if (!page) return;
        const buttons = page.buttons || [];
        const srcIdx = buttons.findIndex(b => b.row === srcRow && b.col === srcCol);
        if (srcIdx === -1) return;
        const dstIdx = buttons.findIndex(b => b.row === dstRow && b.col === dstCol);
        if (dstIdx !== -1) {
            // Swap positions
            buttons[srcIdx].row = dstRow; buttons[srcIdx].col = dstCol;
            buttons[dstIdx].row = srcRow; buttons[dstIdx].col = srcCol;
        } else {
            // Move to empty cell
            buttons[srcIdx].row = dstRow;
            buttons[srcIdx].col = dstCol;
        }
        renderGrid();
        saveConfig();
    }

    function closeEditor() {
        document.getElementById('editorModal').classList.remove('open');
        editingBtn = null;
    }

    function switchEditorTab(name) {
        document.querySelectorAll('.cd-editor-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
        document.querySelectorAll('.cd-editor-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    }

    function updatePreview() {
        const icon = document.getElementById('btnIcon').value || '⭐';
        const label = document.getElementById('btnLabel').value || 'Button';
        const color = document.getElementById('btnColor').value;
        const textColor = document.getElementById('btnTextColor').value;
        const preview = document.getElementById('btnPreview');
        preview.style.background = color;
        preview.style.color = textColor;
        document.getElementById('previewIcon').textContent = icon;
        document.getElementById('previewLabel').textContent = label;
    }

    // ─── Settings ───
    function openSettings() {
        const obs = config.obs || {};
        document.getElementById('obsDockUrl').value = location.href.split('?')[0];
        document.getElementById('obsOverlayUrl').value = location.origin + '/cubdeck/deck/' + CUBDECK_USER.id + '/' + encodeURIComponent(CUBDECK_DECK_NAME) + '/overlay';
        document.getElementById('obsProtocol').value = obs.protocol || 'ws';
        document.getElementById('obsHost').value = obs.host || 'localhost';
        document.getElementById('obsPort').value = obs.port || 4455;
        document.getElementById('obsQuickPort').value = obs.port || 4455;
        document.getElementById('obsPassword').value = obs.password || '';
        if (location.protocol === 'https:') {
            document.getElementById('obsHttpsWarning').style.display = 'block';
        }
        document.getElementById('twitchChannel').value = config.twitch_channel || '';
        document.getElementById('twitchOauth').value = config.twitch_oauth || '';
        const _hasTwitch = !!(config.twitch_oauth && config.twitch_channel);
        document.getElementById('twitchConnectedRow').style.display = _hasTwitch ? 'flex' : 'none';
        document.getElementById('twitchDisconnectedRow').style.display = _hasTwitch ? 'none' : 'flex';
        if (_hasTwitch) document.getElementById('twitchConnectedName').textContent = config.twitch_channel;
        document.getElementById('gridRows').value = config.grid?.rows || 3;
        document.getElementById('gridCols').value = config.grid?.cols || 5;
        document.getElementById('settingsModal').classList.add('open');
    }

    function saveSettings() {
        config.obs = {
            protocol: document.getElementById('obsProtocol').value || 'ws',
            host: document.getElementById('obsHost').value || 'localhost',
            port: parseInt(document.getElementById('obsPort').value) || 4455,
            password: document.getElementById('obsPassword').value
        };
        config.twitch_channel = document.getElementById('twitchChannel').value.trim().toLowerCase();
        config.twitch_oauth = document.getElementById('twitchOauth').value.trim();
        config.grid = {
            rows: Math.max(1, Math.min(8, parseInt(document.getElementById('gridRows').value) || 3)),
            cols: Math.max(1, Math.min(10, parseInt(document.getElementById('gridCols').value) || 5))
        };
        document.getElementById('settingsModal').classList.remove('open');
        renderGrid();
        saveConfig();
        showToast('Settings saved', 'success');
    }

    // ─── Plugin Manager ───
    function openPlugins() {
        fetch('/cubdeck/api/available-plugins')
            .then(r => r.json())
            .then(available => {
                const body = document.getElementById('pluginsBody');
                body.innerHTML = '';
                available.forEach(p => {
                    const installed = (config.installed_plugins || []).includes(p.id);
                    const card = document.createElement('div');
                    card.className = 'cd-plugin-card';
                    card.innerHTML = `
                        <div class="cd-plugin-icon">${p.icon}</div>
                        <div class="cd-plugin-info">
                            <div class="cd-plugin-name">${p.name}</div>
                            <div class="cd-plugin-desc">${p.description}</div>
                        </div>
                        <label class="cd-plugin-toggle">
                            <input type="checkbox" ${installed ? 'checked' : ''} data-plugin="${p.id}">
                            <span class="cd-plugin-toggle-slider"></span>
                        </label>`;
                    body.appendChild(card);
                });
                document.getElementById('pluginsModal').classList.add('open');
            });
    }

    function savePlugins() {
        const installed = [];
        document.querySelectorAll('#pluginsBody input[data-plugin]').forEach(cb => {
            if (cb.checked) installed.push(cb.dataset.plugin);
        });
        config.installed_plugins = installed;
        document.getElementById('pluginsModal').classList.remove('open');
        saveConfig();
        showToast('Plugins saved', 'success');
    }

    function refreshInstalledPlugins() {
        // Plugins self-register — nothing to do here beyond triggering initial render
    }

    // ─── Counter helpers ───
    const _counters = {};
    function getCounterValue(btnId) { return _counters[btnId] || 0; }
    function setCounterValue(btnId, v) {
        _counters[btnId] = v;
        // Persist via API
        fetch('/cubdeck/api/counter/' + btnId + DECK_API_SUFFIX, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'set', value: v })
        }).catch(() => {});
    }

    // Fetch counter values on init
    function loadCounters() {
        const page = config.pages[activePage];
        if (!page) return;
        (page.buttons || []).filter(b => b.plugin === 'counter').forEach(b => {
            fetch('/cubdeck/api/counter/' + b.id + DECK_API_SUFFIX)
                .then(r => r.json())
                .then(d => {
                    _counters[b.id] = d.value;
                    refreshAllButtons();
                }).catch(() => {});
        });
    }

    // ─── Save Config ───
    function saveConfig(silent) {
        _localSaveTime = Date.now();
        config._saved_at = _localSaveTime;
        fetch('/cubdeck/api/config' + DECK_API_SUFFIX, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        }).then(() => {
            if (!silent) showToast('Saved', 'success');
        }).catch(() => showToast('Save failed', 'error'));
    }

    // ─── Toast ───
    let toastTimer;
    function showToast(msg, type) {
        const el = document.getElementById('cdToast');
        el.textContent = msg;
        el.className = 'cd-toast show' + (type ? ' ' + type : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
    }

    // ─── Bind UI ───
    function bindUI() {
        document.getElementById('addPageBtn').addEventListener('click', addPage);
        document.getElementById('editModeBtn').addEventListener('click', toggleEditMode);
        document.getElementById('settingsBtn').addEventListener('click', openSettings);
        document.getElementById('pluginsBtn').addEventListener('click', openPlugins);

        document.getElementById('editorClose').addEventListener('click', closeEditor);
        document.getElementById('btnCancel').addEventListener('click', closeEditor);
        document.getElementById('btnSave').addEventListener('click', saveEditorBtn);
        document.getElementById('btnDelete').addEventListener('click', deleteEditorBtn);

        document.querySelectorAll('.cd-editor-tab').forEach(t => {
            t.addEventListener('click', () => switchEditorTab(t.dataset.tab));
        });

        ['btnIcon','btnLabel','btnColor','btnTextColor'].forEach(id => {
            document.getElementById(id).addEventListener('input', updatePreview);
        });

        document.getElementById('settingsClose').addEventListener('click', () => document.getElementById('settingsModal').classList.remove('open'));
        document.getElementById('settingsCancel').addEventListener('click', () => document.getElementById('settingsModal').classList.remove('open'));
        document.getElementById('settingsSave').addEventListener('click', saveSettings);

        // ── Quick Connect (one-click, localhost) ──
        function setObsStatus(msg, color) {
            const s = document.getElementById('obsConnectStatus');
            if (!s) return;
            s.textContent = msg;
            s.style.color = color || '';
        }

        obsClient.on('authFail', () => {
            setObsStatus('Wrong password — check OBS WebSocket Server Settings', '#f87171');
        });
        obsClient.on('scanning', (addr) => {
            setObsStatus('Trying ' + addr + '…', '#a0aec0');
        });

        document.getElementById('obsQuickConnectBtn').addEventListener('click', () => {
            const pass = document.getElementById('obsPassword').value;
            const port = parseInt(document.getElementById('obsQuickPort').value) || 4455;
            // Use 127.0.0.1 — more reliable in OBS CEF than 'localhost' (avoids PNA issues)
            document.getElementById('obsHost').value = '127.0.0.1';
            document.getElementById('obsPort').value = String(port);
            document.getElementById('obsProtocol').value = 'ws';
            config.obs = { protocol: 'ws', host: '127.0.0.1', port, password: pass };
            saveConfig(true);
            setObsStatus('Scanning… trying 127.0.0.1:' + port, '#a0aec0');
            obsClient.connect('127.0.0.1', port, pass, 'ws');
        });

        // ── Advanced Connect ──
        document.getElementById('obsConnectBtn').addEventListener('click', () => {
            const proto = document.getElementById('obsProtocol').value || 'ws';
            const host = document.getElementById('obsHost').value || 'localhost';
            const port = parseInt(document.getElementById('obsPort').value) || 4455;
            const pass = document.getElementById('obsPassword').value;
            if (isObsBlocked(host, proto)) {
                setObsStatus('Blocked on HTTPS — use localhost or wss://', '#f59e0b');
                return;
            }
            obsClient.connect(host, port, pass, proto);
            setObsStatus('Connecting…', '#a0aec0');
        });
        document.getElementById('obsDisconnectBtn').addEventListener('click', () => {
            obsClient.disconnect();
            setObsStatus('Disconnected', '#a0aec0');
        });

        document.getElementById('twitchConnectBtn').addEventListener('click', () => {
            window.location.href = '/cubdeck/auth/twitch?mode=chat&return=' + encodeURIComponent(window.location.pathname);
        });

        document.getElementById('pluginsClose').addEventListener('click', () => {
            savePlugins();
        });

        // Close modals on backdrop click
        document.querySelectorAll('.cd-modal').forEach(m => {
            m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('open'); });
        });

        // ─── Hotkey capture ───
        let _capturingHotkey = false;
        document.getElementById('hotkeyCapture').addEventListener('click', function() {
            _capturingHotkey = true;
            this.textContent = 'Press keys...';
            this.style.borderColor = 'var(--accent)';
            this.style.color = 'var(--accent)';
            document.getElementById('btnHotkey').focus();
        });
        document.getElementById('hotkeyClear').addEventListener('click', () => {
            document.getElementById('btnHotkey').value = '';
            _capturingHotkey = false;
            const cap = document.getElementById('hotkeyCapture');
            cap.textContent = 'Capture';
            cap.style.borderColor = '';
            cap.style.color = '';
        });
        document.getElementById('btnHotkey').addEventListener('keydown', e => {
            if (!_capturingHotkey) return;
            e.preventDefault();
            e.stopPropagation();
            const parts = [];
            if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
            if (e.altKey) parts.push('Alt');
            if (e.shiftKey) parts.push('Shift');
            const k = e.key;
            if (!['Control','Alt','Shift','Meta'].includes(k)) {
                parts.push(k.length === 1 ? k.toUpperCase() : k);
            }
            if (parts.length >= 1 && !['Control','Alt','Shift','Meta'].includes(parts[parts.length - 1]) === false ? false : parts.length > 1) {
                // need at least one non-modifier
            }
            const hasNonMod = parts.some(p => !['Ctrl','Alt','Shift'].includes(p));
            if (hasNonMod) {
                document.getElementById('btnHotkey').value = parts.join('+');
                _capturingHotkey = false;
                const cap = document.getElementById('hotkeyCapture');
                cap.textContent = 'Capture';
                cap.style.borderColor = '';
                cap.style.color = '';
            }
        });

        // ─── Global keyboard shortcuts ───
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.cd-modal.open').forEach(m => m.classList.remove('open'));
                return;
            }
            if (document.querySelector('.cd-modal.open')) return;
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            const parts = [];
            if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
            if (e.altKey) parts.push('Alt');
            if (e.shiftKey) parts.push('Shift');
            if (!['Control','Alt','Shift','Meta'].includes(e.key)) {
                parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
            }
            const combo = parts.join('+');
            const hasNonMod = parts.some(p => !['Ctrl','Alt','Shift'].includes(p));
            if (!hasNonMod) return;
            const page = config.pages[activePage];
            const btn = (page?.buttons || []).find(b => b.hotkey === combo);
            if (btn) {
                e.preventDefault();
                const el = document.querySelector(`[data-row="${btn.row}"][data-col="${btn.col}"]`);
                if (el) handleButtonClick(btn.row, btn.col, btn, el);
            }
        });

        // ─── Emoji picker ───
        setupEmojiPicker();
    }

    // ─── Emoji Picker ───
    function setupEmojiPicker() {
        const panel = document.getElementById('emojiPickerPanel');
        const btn = document.getElementById('emojiPickerBtn');
        if (!panel || !btn) return;

        let currentCat = Object.keys(EMOJI_CATS)[0];

        panel.innerHTML = `
            <div class="cd-emoji-search"><input type="text" id="emojiSearchInput" placeholder="Search..." autocomplete="off"></div>
            <div class="cd-emoji-cats" id="emojiCatBtns"></div>
            <div class="cd-emoji-grid" id="emojiGridItems"></div>`;

        const catBtns = panel.querySelector('#emojiCatBtns');
        Object.keys(EMOJI_CATS).forEach((cat, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'cd-emoji-cat-btn' + (i === 0 ? ' active' : '');
            b.textContent = cat;
            b.addEventListener('click', () => {
                currentCat = cat;
                panel.querySelector('#emojiSearchInput').value = '';
                catBtns.querySelectorAll('.cd-emoji-cat-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                renderEmojis('');
            });
            catBtns.appendChild(b);
        });

        panel.querySelector('#emojiSearchInput').addEventListener('input', e => renderEmojis(e.target.value.trim()));

        function renderEmojis(query) {
            const grid = panel.querySelector('#emojiGridItems');
            grid.innerHTML = '';
            const emojis = query
                ? Object.values(EMOJI_CATS).flat()
                : (EMOJI_CATS[currentCat] || []);
            emojis.forEach(emoji => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'cd-emoji-item';
                b.textContent = emoji;
                b.title = emoji;
                b.addEventListener('click', e => {
                    e.stopPropagation();
                    document.getElementById('btnIcon').value = emoji;
                    updatePreview();
                    panel.style.display = 'none';
                });
                grid.appendChild(b);
            });
        }
        renderEmojis('');

        btn.addEventListener('click', e => {
            e.stopPropagation();
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', e => {
            if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                panel.style.display = 'none';
            }
        });
    }

    // ─── Plugin Registration API ───
    function registerPlugin(def) {
        plugins[def.id] = def;
    }

    return { init, registerPlugin, showToast, refreshAllButtons, sendToOverlay, obs: () => obsClient, getCtx: () => ({
        obs: obsClient, config, showToast, refreshAllButtons, saveConfig,
        getCounterValue, setCounterValue, sendToOverlay,
    })};
})();
