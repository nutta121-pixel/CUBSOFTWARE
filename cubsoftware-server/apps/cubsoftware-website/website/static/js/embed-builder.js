// Discord Embed Builder

let fields = [];

function update() {
    updatePreview();
    updateWebhookLink();
}

function getState() {
    return {
        author: {
            name:    v('authorName'),
            iconUrl: v('authorIcon'),
            url:     v('authorUrl'),
        },
        title:     v('embedTitle'),
        titleUrl:  v('titleUrl'),
        color:     v('embedColorHex') || '#5865f2',
        description: v('embedDesc'),
        thumbnail: v('embedThumb'),
        image:     v('embedImage'),
        fields:    fields.map((_, i) => ({
            name:   v('fn_' + i),
            value:  v('fv_' + i),
            inline: document.getElementById('fi_' + i)?.checked || false,
        })).filter(f => f.name || f.value),
        footer: {
            text:    v('footerText'),
            iconUrl: v('footerIcon'),
        },
        timestamp: document.getElementById('embedTimestamp')?.checked || false,
    };
}

function v(id) {
    return (document.getElementById(id)?.value || '').trim();
}

function updatePreview() {
    const s = getState();
    const preview = document.getElementById('embedPreview');
    const color = s.color || '#5865f2';

    const hasContent = s.title || s.description || s.author.name || s.fields.length ||
                       s.footer.text || s.image || s.thumbnail;

    if (!hasContent) {
        preview.style.borderLeftColor = color;
        preview.innerHTML = '<div class="embed-placeholder">Your embed will appear here</div>';
        return;
    }

    preview.style.borderLeftColor = color;

    let html = '<div class="embed-inner">';
    html += '<div class="embed-main">';

    // Author
    if (s.author.name) {
        html += '<div class="embed-author-row">';
        if (s.author.iconUrl) html += `<img class="embed-author-icon" src="${esc(s.author.iconUrl)}" onerror="this.style.display='none'">`;
        const aTag = s.author.url ? `a href="${esc(s.author.url)}" target="_blank"` : 'span';
        const aClose = s.author.url ? 'a' : 'span';
        html += `<${aTag} class="embed-author-name">${esc(s.author.name)}</${aClose}>`;
        html += '</div>';
    }

    // Title
    if (s.title) {
        if (s.titleUrl) {
            html += `<a href="${esc(s.titleUrl)}" target="_blank" class="embed-title">${esc(s.title)}</a>`;
        } else {
            html += `<div class="embed-title">${esc(s.title)}</div>`;
        }
    }

    // Description
    if (s.description) {
        html += `<div class="embed-desc">${esc(s.description)}</div>`;
    }

    // Fields
    if (s.fields.length) {
        html += '<div class="embed-fields">';
        s.fields.forEach(f => {
            const cls = f.inline ? 'embed-field inline' : 'embed-field';
            html += `<div class="${cls}">`;
            if (f.name) html += `<div class="embed-field-name">${esc(f.name)}</div>`;
            if (f.value) html += `<div class="embed-field-value">${esc(f.value)}</div>`;
            html += '</div>';
        });
        html += '</div>';
    }

    // Image
    if (s.image) {
        html += `<div class="embed-image"><img src="${esc(s.image)}" onerror="this.style.display='none'" alt=""></div>`;
    }

    // Footer
    if (s.footer.text || s.timestamp) {
        html += '<div class="embed-footer-row">';
        if (s.footer.iconUrl) html += `<img class="embed-footer-icon" src="${esc(s.footer.iconUrl)}" onerror="this.style.display='none'">`;
        if (s.footer.text) html += `<span class="embed-footer-text">${esc(s.footer.text)}</span>`;
        if (s.footer.text && s.timestamp) html += `<span class="embed-footer-sep">•</span>`;
        if (s.timestamp) html += `<span class="embed-footer-text">${new Date().toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'})}</span>`;
        html += '</div>';
    }

    html += '</div>'; // end embed-main

    // Thumbnail
    if (s.thumbnail) {
        html += `<div class="embed-thumbnail"><img src="${esc(s.thumbnail)}" onerror="this.parentElement.style.display='none'" alt=""></div>`;
    }

    html += '</div>'; // end embed-inner
    preview.innerHTML = html;
}

function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
}

function addField() {
    if (fields.length >= 25) { showToast('Maximum 25 fields', 'error'); return; }
    const i = fields.length;
    fields.push({});
    renderFields();
    update();
}

function removeField(i) {
    fields.splice(i, 1);
    renderFields();
    update();
}

function renderFields() {
    const container = document.getElementById('fieldsContainer');
    document.getElementById('fieldCount').textContent = `(${fields.length}/25)`;

    if (!fields.length) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = fields.map((_, i) => `
        <div class="eb-field-row">
            <div class="field-name">
                <label>Name</label>
                <input type="text" id="fn_${i}" placeholder="Field name" maxlength="256" oninput="update()">
            </div>
            <div class="field-value">
                <label>Value</label>
                <textarea id="fv_${i}" rows="2" maxlength="1024" placeholder="Field value" oninput="update()"></textarea>
            </div>
            <div class="eb-field-inline">
                <label>Inline</label>
                <input type="checkbox" id="fi_${i}" onchange="update()">
            </div>
            <button class="eb-field-delete" onclick="removeField(${i})" title="Remove field">×</button>
        </div>
    `).join('');
}

function countChars(el, counterId, max) {
    document.getElementById(counterId).textContent = el.value.length;
}

function syncColorHex() {
    const hex = document.getElementById('embedColor').value;
    document.getElementById('embedColorHex').value = hex;
    update();
}

function syncColorPicker() {
    const hex = document.getElementById('embedColorHex').value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        document.getElementById('embedColor').value = hex;
    }
    update();
}

function toEmbedJSON() {
    const s = getState();
    const obj = {};
    if (s.title)       obj.title = s.title;
    if (s.titleUrl)    obj.url = s.titleUrl;
    if (s.description) obj.description = s.description;
    if (s.color)       obj.color = parseInt(s.color.replace('#', ''), 16);
    if (s.author.name) {
        obj.author = { name: s.author.name };
        if (s.author.iconUrl) obj.author.icon_url = s.author.iconUrl;
        if (s.author.url)     obj.author.url = s.author.url;
    }
    if (s.thumbnail)   obj.thumbnail = { url: s.thumbnail };
    if (s.image)       obj.image = { url: s.image };
    if (s.fields.length) obj.fields = s.fields;
    if (s.footer.text || s.footer.iconUrl) {
        obj.footer = {};
        if (s.footer.text)    obj.footer.text = s.footer.text;
        if (s.footer.iconUrl) obj.footer.icon_url = s.footer.iconUrl;
    }
    if (s.timestamp)   obj.timestamp = new Date().toISOString();
    return obj;
}

function copyJSON() {
    navigator.clipboard.writeText(JSON.stringify(toEmbedJSON(), null, 2))
        .then(() => showToast('JSON copied!'));
}

function copyDJS() {
    const s = getState();
    const e = toEmbedJSON();
    let code = `const { EmbedBuilder } = require('discord.js');\n\nconst embed = new EmbedBuilder()\n`;
    if (e.color !== undefined)  code += `    .setColor(${e.color})\n`;
    if (s.author.name) {
        let authorStr = `{ name: '${s.author.name}'`;
        if (s.author.iconUrl) authorStr += `, iconURL: '${s.author.iconUrl}'`;
        if (s.author.url)     authorStr += `, url: '${s.author.url}'`;
        authorStr += ' }';
        code += `    .setAuthor(${authorStr})\n`;
    }
    if (s.title)       code += `    .setTitle('${s.title}')\n`;
    if (s.titleUrl)    code += `    .setURL('${s.titleUrl}')\n`;
    if (s.description) code += `    .setDescription('${s.description.replace(/'/g, "\\'").replace(/\n/g, '\\n')}')\n`;
    if (s.thumbnail)   code += `    .setThumbnail('${s.thumbnail}')\n`;
    if (s.fields.length) {
        const fieldsStr = s.fields.map(f =>
            `        { name: '${f.name}', value: '${f.value}', inline: ${f.inline} }`
        ).join(',\n');
        code += `    .addFields(\n${fieldsStr}\n    )\n`;
    }
    if (s.image)       code += `    .setImage('${s.image}')\n`;
    if (s.footer.text || s.footer.iconUrl) {
        let footerStr = `{ text: '${s.footer.text}'`;
        if (s.footer.iconUrl) footerStr += `, iconURL: '${s.footer.iconUrl}'`;
        footerStr += ' }';
        code += `    .setFooter(${footerStr})\n`;
    }
    if (s.timestamp)   code += `    .setTimestamp()\n`;
    code = code.trimEnd().replace(/\n$/, ';\n');
    navigator.clipboard.writeText(code).then(() => showToast('discord.js code copied!'));
}

function copyDPY() {
    const s = getState();
    const color = parseInt((s.color || '#5865f2').replace('#', ''), 16);
    let code = `import discord\n\nembed = discord.Embed(\n`;
    if (s.title)       code += `    title="${s.title}",\n`;
    if (s.description) code += `    description="${s.description.replace(/"/g, '\\"').replace(/\n/g, '\\n')}",\n`;
    if (s.titleUrl)    code += `    url="${s.titleUrl}",\n`;
    code += `    color=0x${color.toString(16)},\n`;
    if (s.timestamp)   code += `    timestamp=discord.utils.utcnow(),\n`;
    code += `)\n`;
    if (s.author.name) {
        code += `embed.set_author(name="${s.author.name}"`;
        if (s.author.iconUrl) code += `, icon_url="${s.author.iconUrl}"`;
        if (s.author.url)     code += `, url="${s.author.url}"`;
        code += `)\n`;
    }
    if (s.thumbnail)   code += `embed.set_thumbnail(url="${s.thumbnail}")\n`;
    if (s.image)       code += `embed.set_image(url="${s.image}")\n`;
    s.fields.forEach(f => {
        code += `embed.add_field(name="${f.name}", value="${f.value}", inline=${f.inline ? 'True' : 'False'})\n`;
    });
    if (s.footer.text || s.footer.iconUrl) {
        code += `embed.set_footer(text="${s.footer.text || ''}"`;
        if (s.footer.iconUrl) code += `, icon_url="${s.footer.iconUrl}"`;
        code += `)\n`;
    }
    navigator.clipboard.writeText(code).then(() => showToast('discord.py code copied!'));
}

function resetAll() {
    ['authorName','authorIcon','authorUrl','embedTitle','titleUrl','embedColorHex',
     'embedDesc','embedThumb','embedImage','footerText','footerIcon'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = id === 'embedColorHex' ? '#5865f2' : '';
    });
    document.getElementById('embedColor').value = '#5865f2';
    document.getElementById('embedTimestamp').checked = false;
    document.getElementById('descCount').textContent = '0';
    fields = [];
    renderFields();
    update();
}

function updateWebhookLink() {
    const json = JSON.stringify(toEmbedJSON());
    const encoded = btoa(unescape(encodeURIComponent(json)));
    document.getElementById('webhookLink').href = `/apps/webhook-sender?embed=${encoded}`;
}

function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.background = type === 'error' ? '#ef4444' : '#5865f2';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

document.addEventListener('DOMContentLoaded', () => {
    renderFields();
    update();
});
