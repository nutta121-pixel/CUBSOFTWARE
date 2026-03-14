// Discord Permission Calculator

const PERMISSIONS = [
    // General
    { name: 'Create Invite',              key: 'CREATE_INSTANT_INVITE',            value: 0x1n,              cat: 'general', desc: 'Allows creation of instant invites.' },
    { name: 'Kick Members',               key: 'KICK_MEMBERS',                     value: 0x2n,              cat: 'general', desc: 'Allows kicking members from the server.' },
    { name: 'Ban Members',                key: 'BAN_MEMBERS',                      value: 0x4n,              cat: 'general', desc: 'Allows banning and unbanning members.' },
    { name: 'Administrator',              key: 'ADMINISTRATOR',                    value: 0x8n,              cat: 'general', desc: 'Grants ALL permissions and bypasses channel overrides. Never grant lightly.', danger: true },
    { name: 'Manage Channels',            key: 'MANAGE_CHANNELS',                  value: 0x10n,             cat: 'general', desc: 'Allows creating, editing, and deleting channels.' },
    { name: 'Manage Server',              key: 'MANAGE_GUILD',                     value: 0x20n,             cat: 'general', desc: 'Allows editing the server name, region, icon, and other settings.' },
    { name: 'Add Reactions',              key: 'ADD_REACTIONS',                    value: 0x40n,             cat: 'text',    desc: 'Allows adding reactions to messages.' },
    { name: 'View Audit Log',             key: 'VIEW_AUDIT_LOG',                   value: 0x80n,             cat: 'general', desc: 'Allows viewing the server audit log.' },
    { name: 'Priority Speaker',           key: 'PRIORITY_SPEAKER',                 value: 0x100n,            cat: 'voice',   desc: 'Reduces volume of other members when this person speaks.' },
    { name: 'Stream / Go Live',           key: 'STREAM',                           value: 0x200n,            cat: 'voice',   desc: 'Allows sharing screen in voice channels.' },
    { name: 'View Channels',              key: 'VIEW_CHANNEL',                     value: 0x400n,            cat: 'text',    desc: 'Allows viewing channels (excluding private channels).' },
    { name: 'Send Messages',              key: 'SEND_MESSAGES',                    value: 0x800n,            cat: 'text',    desc: 'Allows sending messages in text channels and creating threads.' },
    { name: 'Send TTS Messages',          key: 'SEND_TTS_MESSAGES',                value: 0x1000n,           cat: 'text',    desc: 'Allows sending text-to-speech messages.' },
    { name: 'Manage Messages',            key: 'MANAGE_MESSAGES',                  value: 0x2000n,           cat: 'text',    desc: 'Allows deleting others\' messages and pinning messages.' },
    { name: 'Embed Links',                key: 'EMBED_LINKS',                      value: 0x4000n,           cat: 'text',    desc: 'Links in messages will be shown as rich embeds.' },
    { name: 'Attach Files',               key: 'ATTACH_FILES',                     value: 0x8000n,           cat: 'text',    desc: 'Allows attaching files to messages.' },
    { name: 'Read Message History',       key: 'READ_MESSAGE_HISTORY',             value: 0x10000n,          cat: 'text',    desc: 'Allows viewing messages sent before the member joined.' },
    { name: 'Mention @everyone',          key: 'MENTION_EVERYONE',                 value: 0x20000n,          cat: 'text',    desc: 'Allows using @everyone, @here, and all role mentions.' },
    { name: 'Use External Emojis',        key: 'USE_EXTERNAL_EMOJIS',              value: 0x40000n,          cat: 'text',    desc: 'Allows using custom emojis from other servers.' },
    { name: 'View Server Insights',       key: 'VIEW_GUILD_INSIGHTS',              value: 0x80000n,          cat: 'general', desc: 'Allows viewing server analytics and insights.' },
    { name: 'Connect',                    key: 'CONNECT',                          value: 0x100000n,         cat: 'voice',   desc: 'Allows connecting to voice and stage channels.' },
    { name: 'Speak',                      key: 'SPEAK',                            value: 0x200000n,         cat: 'voice',   desc: 'Allows speaking in voice channels.' },
    { name: 'Mute Members',               key: 'MUTE_MEMBERS',                     value: 0x400000n,         cat: 'voice',   desc: 'Allows server-muting other members in voice channels.' },
    { name: 'Deafen Members',             key: 'DEAFEN_MEMBERS',                   value: 0x800000n,         cat: 'voice',   desc: 'Allows server-deafening other members in voice channels.' },
    { name: 'Move Members',               key: 'MOVE_MEMBERS',                     value: 0x1000000n,        cat: 'voice',   desc: 'Allows moving members between voice channels.' },
    { name: 'Use Voice Activity',         key: 'USE_VAD',                          value: 0x2000000n,        cat: 'voice',   desc: 'Allows using voice-activity detection (no push-to-talk).' },
    { name: 'Change Nickname',            key: 'CHANGE_NICKNAME',                  value: 0x4000000n,        cat: 'general', desc: 'Allows changing own nickname.' },
    { name: 'Manage Nicknames',           key: 'MANAGE_NICKNAMES',                 value: 0x8000000n,        cat: 'general', desc: 'Allows changing other members\' nicknames.' },
    { name: 'Manage Roles',               key: 'MANAGE_ROLES',                     value: 0x10000000n,       cat: 'general', desc: 'Allows creating, editing, and deleting roles below own role.' },
    { name: 'Manage Webhooks',            key: 'MANAGE_WEBHOOKS',                  value: 0x20000000n,       cat: 'general', desc: 'Allows creating, editing, and deleting webhooks.' },
    { name: 'Manage Emojis & Stickers',   key: 'MANAGE_GUILD_EXPRESSIONS',         value: 0x40000000n,       cat: 'general', desc: 'Allows managing server emojis and stickers.' },
    { name: 'Use Slash Commands',         key: 'USE_APPLICATION_COMMANDS',         value: 0x80000000n,       cat: 'text',    desc: 'Allows using application commands (slash commands, context menus).' },
    { name: 'Request to Speak',           key: 'REQUEST_TO_SPEAK',                 value: 0x100000000n,      cat: 'voice',   desc: 'Allows requesting to speak in stage channels.' },
    { name: 'Manage Events',              key: 'MANAGE_EVENTS',                    value: 0x200000000n,      cat: 'general', desc: 'Allows managing scheduled guild events.' },
    { name: 'Manage Threads',             key: 'MANAGE_THREADS',                   value: 0x400000000n,      cat: 'text',    desc: 'Allows deleting and archiving threads, viewing private threads.' },
    { name: 'Create Public Threads',      key: 'CREATE_PUBLIC_THREADS',            value: 0x800000000n,      cat: 'text',    desc: 'Allows creating public and announcement threads.' },
    { name: 'Create Private Threads',     key: 'CREATE_PRIVATE_THREADS',           value: 0x1000000000n,     cat: 'text',    desc: 'Allows creating private threads.' },
    { name: 'Use External Stickers',      key: 'USE_EXTERNAL_STICKERS',            value: 0x2000000000n,     cat: 'text',    desc: 'Allows using stickers from other servers.' },
    { name: 'Send in Threads',            key: 'SEND_MESSAGES_IN_THREADS',         value: 0x4000000000n,     cat: 'text',    desc: 'Allows sending messages in threads.' },
    { name: 'Use Activities',             key: 'USE_EMBEDDED_ACTIVITIES',          value: 0x8000000000n,     cat: 'voice',   desc: 'Allows using Activities (embedded apps) in voice channels.' },
    { name: 'Moderate Members',           key: 'MODERATE_MEMBERS',                 value: 0x10000000000n,    cat: 'general', desc: 'Allows timing out members.' },
    { name: 'Use Soundboard',             key: 'USE_SOUNDBOARD',                   value: 0x40000000000n,    cat: 'voice',   desc: 'Allows using the soundboard in voice channels.' },
    { name: 'Create Expressions',         key: 'CREATE_GUILD_EXPRESSIONS',         value: 0x80000000000n,    cat: 'general', desc: 'Allows creating emojis, stickers, and sounds (own ones).' },
    { name: 'Create Events',              key: 'CREATE_EVENTS',                    value: 0x100000000000n,   cat: 'voice',   desc: 'Allows creating events in voice/stage channels.' },
    { name: 'Use External Sounds',        key: 'USE_EXTERNAL_SOUNDS',              value: 0x200000000000n,   cat: 'voice',   desc: 'Allows using sounds from other servers in soundboard.' },
    { name: 'Send Voice Messages',        key: 'SEND_VOICE_MESSAGES',              value: 0x400000000000n,   cat: 'voice',   desc: 'Allows sending voice messages in text channels.' },
    { name: 'Set Voice Status',           key: 'SET_VOICE_CHANNEL_STATUS',         value: 0x1000000000000n,  cat: 'voice',   desc: 'Allows setting a status on voice channels.' },
    { name: 'Send Polls',                 key: 'SEND_POLLS',                       value: 0x2000000000000n,  cat: 'text',    desc: 'Allows sending polls in text channels.' },
];

const PRESETS = {
    bot: 0x1n | 0x2n | 0x4n | 0x10n | 0x20n | 0x40n | 0x80n | 0x400n | 0x800n | 0x2000n | 0x4000n | 0x8000n | 0x10000n | 0x40000n |
         0x100000n | 0x200000n | 0x400000n | 0x800000n | 0x1000000n | 0x10000000n | 0x20000000n | 0x40000000n | 0x80000000n |
         0x400000000n | 0x800000000n | 0x1000000000n | 0x4000000000n | 0x10000000000n,
    mod: 0x2n | 0x4n | 0x2000n | 0x10000n | 0x8000000n | 0x10000000000n | 0x400000n | 0x800000n | 0x1000000n,
    readOnly: 0x400n | 0x10000n,
    admin: 0x8n,
};

let currentValue = 0n;
let currentCat = 'all';

function init() {
    renderGrid();
    updateDisplay();
}

function renderGrid() {
    const grid = document.getElementById('permGrid');
    grid.innerHTML = '';

    PERMISSIONS.forEach(p => {
        const card = document.createElement('div');
        card.className = 'perm-card' + (p.danger ? ' danger-perm' : '') + (currentCat !== 'all' && p.cat !== currentCat ? ' hidden' : '');
        card.dataset.key = p.key;
        card.onclick = () => togglePerm(p.value, p.key);

        const checked = (currentValue & p.value) === p.value;
        if (checked) card.classList.add('checked');

        const hexStr = '0x' + p.value.toString(16).toUpperCase();

        card.innerHTML = `
            <div class="perm-checkbox">${checked ? '✓' : ''}</div>
            <div class="perm-info">
                <div class="perm-name">${p.name}</div>
                <div class="perm-hex">${hexStr}</div>
                <div class="perm-desc">${p.desc}</div>
            </div>`;
        grid.appendChild(card);
    });
}

function togglePerm(value, key) {
    if ((currentValue & value) === value) {
        currentValue &= ~value;
    } else {
        currentValue |= value;
    }
    updateDisplay();
    updateCardState(key, (currentValue & value) === value);
}

function updateCardState(key, checked) {
    const card = document.querySelector(`.perm-card[data-key="${key}"]`);
    if (!card) return;
    card.classList.toggle('checked', checked);
    card.querySelector('.perm-checkbox').textContent = checked ? '✓' : '';
}

function updateDisplay() {
    document.getElementById('permValue').value = currentValue.toString();
    document.getElementById('hexDisplay').textContent = '0x' + currentValue.toString(16).toUpperCase();
    const count = PERMISSIONS.filter(p => (currentValue & p.value) === p.value).length;
    document.getElementById('permCount').textContent = count + ' permission' + (count !== 1 ? 's' : '') + ' selected';
    updateInviteLink();
}

function applyValue(str) {
    str = str.trim();
    if (!str) { currentValue = 0n; renderGrid(); updateDisplay(); return; }
    try {
        currentValue = str.startsWith('0x') || str.startsWith('0X') ? BigInt(str) : BigInt(str);
        renderGrid();
        updateDisplay();
    } catch (e) {
        // invalid input — ignore silently
    }
}

function copyValue() {
    navigator.clipboard.writeText(currentValue.toString()).then(() => showToast('Copied!'));
}

function clearAll() {
    currentValue = 0n;
    renderGrid();
    updateDisplay();
}

function applyPreset(name) {
    currentValue = PRESETS[name] || 0n;
    renderGrid();
    updateDisplay();
}

function filterCat(cat, btn) {
    currentCat = cat;
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.perm-card').forEach(card => {
        const perm = PERMISSIONS.find(p => p.key === card.dataset.key);
        if (!perm) return;
        card.classList.toggle('hidden', cat !== 'all' && perm.cat !== cat);
    });
}

function generateInvite() {
    document.getElementById('inviteModal').style.display = 'flex';
    updateInviteLink();
}

function updateInviteLink() {
    const clientId = document.getElementById('clientIdInput')?.value?.trim();
    const output = document.getElementById('inviteLinkOutput');
    if (!output) return;
    if (!clientId) { output.value = ''; return; }
    output.value = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${currentValue}&scope=bot%20applications.commands`;
}

function openInvite() {
    const link = document.getElementById('inviteLinkOutput').value;
    if (!link) { showToast('Enter a Client ID first', 'error'); return; }
    window.open(link, '_blank');
}

function copyInviteLink() {
    const link = document.getElementById('inviteLinkOutput').value;
    if (!link) { showToast('Enter a Client ID first', 'error'); return; }
    navigator.clipboard.writeText(link).then(() => showToast('Link copied!'));
}

function closeInvite() {
    document.getElementById('inviteModal').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    init();

    document.getElementById('clientIdInput')?.addEventListener('input', updateInviteLink);

    // Close modal on backdrop click
    document.getElementById('inviteModal')?.addEventListener('click', function(e) {
        if (e.target === this) closeInvite();
    });

    // Check URL param
    const params = new URLSearchParams(window.location.search);
    if (params.get('value')) {
        applyValue(params.get('value'));
    }
});

function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.background = type === 'error' ? '#ef4444' : '#5865f2';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}
