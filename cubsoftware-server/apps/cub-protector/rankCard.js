/**
 * CUB PROTECTOR Rank Card Generator
 * Generates stunning, fully-customizable rank card images using @napi-rs/canvas
 */

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// ─── Card dimensions ──────────────────────────────────────────────────────────
const W = 934;
const H = 282;
const RADIUS = 20;      // card corner radius
const PAD = 28;         // outer padding
const AVA_R = 88;       // avatar radius
const AVA_CX = PAD + 14 + AVA_R;   // avatar center x
const AVA_CY = H / 2;              // avatar center y
const INFO_X = AVA_CX + AVA_R + 36; // info column start x
const BAR_H = 26;
const BAR_RADIUS = 13;

// ─── Preset themes ────────────────────────────────────────────────────────────
const PRESETS = {
    default: {
        bg_type: 'gradient', bg1: '#1e1f2e', bg2: '#13141f',
        accent: '#5865F2', bar: '#5865F2', bar_glow: true,
        text1: '#ffffff', text2: '#8891aa',
        avatar_border: '#5865F2', avatar_ring: true, avatar_glow: false,
    },
    carbon: {
        bg_type: 'gradient', bg1: '#1c1c1c', bg2: '#121212',
        accent: '#00d4ff', bar: '#00d4ff', bar_glow: true,
        text1: '#ffffff', text2: '#aaaaaa',
        avatar_border: '#00d4ff', avatar_ring: true, avatar_glow: false,
    },
    sunset: {
        bg_type: 'gradient', bg1: '#1a0a08', bg2: '#2d1210',
        accent: '#ff6b35', bar: '#ff9f1c', bar_glow: true,
        text1: '#fff4ee', text2: '#cc7755',
        avatar_border: '#ff6b35', avatar_ring: true, avatar_glow: false,
    },
    forest: {
        bg_type: 'gradient', bg1: '#0a160a', bg2: '#0e2010',
        accent: '#56c454', bar: '#8bc34a', bar_glow: true,
        text1: '#f0fff0', text2: '#7bb87a',
        avatar_border: '#56c454', avatar_ring: true, avatar_glow: false,
    },
    ocean: {
        bg_type: 'gradient', bg1: '#001a2e', bg2: '#002440',
        accent: '#00bcd4', bar: '#00acc1', bar_glow: true,
        text1: '#e0f7fa', text2: '#4dd0e1',
        avatar_border: '#00bcd4', avatar_ring: true, avatar_glow: false,
    },
    crimson: {
        bg_type: 'gradient', bg1: '#1a0008', bg2: '#250010',
        accent: '#f44336', bar: '#e91e63', bar_glow: true,
        text1: '#ffe0e3', text2: '#ef9a9a',
        avatar_border: '#f44336', avatar_ring: true, avatar_glow: false,
    },
    midnight: {
        bg_type: 'gradient', bg1: '#0d0d1a', bg2: '#15153a',
        accent: '#7c4dff', bar: '#b388ff', bar_glow: true,
        text1: '#ede7f6', text2: '#9575cd',
        avatar_border: '#7c4dff', avatar_ring: true, avatar_glow: true,
    },
    rose: {
        bg_type: 'gradient', bg1: '#1a0d12', bg2: '#260e18',
        accent: '#e91e8c', bar: '#ff80ab', bar_glow: true,
        text1: '#fce4ec', text2: '#f48fb1',
        avatar_border: '#e91e8c', avatar_ring: true, avatar_glow: false,
    },
    gold: {
        bg_type: 'gradient', bg1: '#1a1400', bg2: '#261d00',
        accent: '#ffd700', bar: '#ffb300', bar_glow: true,
        text1: '#fffde7', text2: '#ffe082',
        avatar_border: '#ffd700', avatar_ring: true, avatar_glow: true,
    },
    minimal: {
        bg_type: 'solid', bg1: '#23272a',
        accent: '#99aab5', bar: '#7289da', bar_glow: false,
        text1: '#ffffff', text2: '#99aab5',
        avatar_border: '#36393f', avatar_ring: true, avatar_glow: false,
        bar_style: 'sharp',
    },
};

const DEFAULT_THEME = PRESETS.default;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha = 1) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function lighten(hex, amt) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    const r = Math.min(255, parseInt(hex.slice(0,2), 16) + amt);
    const g = Math.min(255, parseInt(hex.slice(2,4), 16) + amt);
    const b = Math.min(255, parseInt(hex.slice(4,6), 16) + amt);
    return `rgb(${r},${g},${b})`;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    while (text.length > 1) {
        text = text.slice(0, -1);
        if (ctx.measureText(text + '…').width <= maxWidth) return text + '…';
    }
    return '…';
}

// ─── Main render ──────────────────────────────────────────────────────────────
async function generateRankCard(opts) {
    const {
        username, displayName, avatarURL,
        level, rank, currentXP, requiredXP, totalXP,
        messages = 0, voiceMinutes = 0,
        theme: rawTheme = {},
    } = opts;

    // Merge: default → preset → user overrides
    const preset = PRESETS[rawTheme.preset] || DEFAULT_THEME;
    const t = { ...DEFAULT_THEME, ...preset, ...rawTheme };

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ── 1. Background ──────────────────────────────────────────────────────────
    ctx.save();
    roundRect(ctx, 0, 0, W, H, RADIUS);
    ctx.clip();

    if (t.bg_type === 'image' && t.bg_image) {
        try {
            const img = await loadImage(t.bg_image);
            const scale = Math.max(W / img.width, H / img.height);
            const iw = img.width * scale;
            const ih = img.height * scale;
            const ix = (W - iw) / 2;
            const iy = (H - ih) / 2;
            ctx.filter = t.bg_blur ? `blur(${t.bg_blur}px)` : 'none';
            ctx.drawImage(img, ix - (t.bg_blur || 0) * 2, iy - (t.bg_blur || 0) * 2,
                iw + (t.bg_blur || 0) * 4, ih + (t.bg_blur || 0) * 4);
            ctx.filter = 'none';
            // Dark overlay for readability
            ctx.fillStyle = hexToRgba('#000000', t.bg_overlay ?? 0.55);
            ctx.fillRect(0, 0, W, H);
        } catch {
            drawGradientBg(ctx, t);
        }
    } else if (t.bg_type === 'solid') {
        ctx.fillStyle = t.bg1 || '#23272a';
        ctx.fillRect(0, 0, W, H);
    } else {
        drawGradientBg(ctx, t);
    }
    ctx.restore();

    // ── 2. Subtle card border ─────────────────────────────────────────────────
    ctx.save();
    roundRect(ctx, 0.5, 0.5, W - 1, H - 1, RADIUS);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // ── 3. Accent left stripe ─────────────────────────────────────────────────
    ctx.save();
    const stripeGrad = ctx.createLinearGradient(0, 0, 0, H);
    stripeGrad.addColorStop(0, t.accent + 'ff');
    stripeGrad.addColorStop(0.5, t.accent + 'cc');
    stripeGrad.addColorStop(1, t.accent + '00');
    ctx.fillStyle = stripeGrad;
    roundRect(ctx, 0, 0, 4, H, RADIUS);
    ctx.fill();
    ctx.restore();

    // ── 4. Avatar ─────────────────────────────────────────────────────────────
    if (t.avatar_glow) {
        ctx.save();
        ctx.shadowColor = t.avatar_border || t.accent;
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(AVA_CX, AVA_CY, AVA_R + 5, 0, Math.PI * 2);
        ctx.fillStyle = t.avatar_border || t.accent;
        ctx.fill();
        ctx.restore();
    }

    if (t.avatar_ring !== false) {
        const ringGrad = ctx.createLinearGradient(
            AVA_CX - AVA_R, AVA_CY - AVA_R,
            AVA_CX + AVA_R, AVA_CY + AVA_R
        );
        ringGrad.addColorStop(0, t.avatar_border || t.accent);
        ringGrad.addColorStop(1, hexToRgba(t.avatar_border || t.accent, 0.5));
        ctx.save();
        ctx.beginPath();
        ctx.arc(AVA_CX, AVA_CY, AVA_R + 4, 0, Math.PI * 2);
        ctx.fillStyle = ringGrad;
        ctx.fill();
        ctx.restore();
    }

    // Avatar image
    try {
        const ava = await loadImage(avatarURL);
        ctx.save();
        ctx.beginPath();
        ctx.arc(AVA_CX, AVA_CY, AVA_R, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(ava, AVA_CX - AVA_R, AVA_CY - AVA_R, AVA_R * 2, AVA_R * 2);
        ctx.restore();
    } catch {
        ctx.save();
        ctx.beginPath();
        ctx.arc(AVA_CX, AVA_CY, AVA_R, 0, Math.PI * 2);
        ctx.fillStyle = '#36393f';
        ctx.fill();
        ctx.restore();
    }

    // Level badge on avatar
    const badgeX = AVA_CX + Math.cos(Math.PI * 0.75) * (AVA_R + 4) + (AVA_R + 4) * 0.42;
    const badgeY = AVA_CY + Math.sin(Math.PI * 0.75) * (AVA_R + 4) + (AVA_R + 4) * 0.42;
    const badgeR = 20;
    const levelStr = level > 999 ? '∞' : String(level);
    const badgeFontSize = levelStr.length > 2 ? 12 : 14;

    ctx.save();
    ctx.beginPath();
    ctx.arc(AVA_CX + AVA_R * 0.62, AVA_CY + AVA_R * 0.62, badgeR + 3, 0, Math.PI * 2);
    ctx.fillStyle = '#0d0d14';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(AVA_CX + AVA_R * 0.62, AVA_CY + AVA_R * 0.62, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = t.accent;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${badgeFontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(levelStr, AVA_CX + AVA_R * 0.62, AVA_CY + AVA_R * 0.62 + 1);
    ctx.restore();

    // ── 5. Rank + Level labels (top right) ───────────────────────────────────
    const rightEdge = W - PAD;
    const topY = PAD + 10;

    // LEVEL
    const levelLabelX = rightEdge;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = t.text2;
    ctx.font = `600 11px sans-serif`;
    ctx.fillText('LEVEL', levelLabelX, topY + 2);
    ctx.fillStyle = t.accent;
    ctx.font = `bold 38px sans-serif`;
    ctx.fillText(String(level), levelLabelX, topY + 40);
    ctx.restore();

    // RANK
    const rankLabelX = rightEdge - 90;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = t.text2;
    ctx.font = `600 11px sans-serif`;
    ctx.fillText('RANK', rankLabelX, topY + 2);
    ctx.fillStyle = t.text1;
    ctx.font = `bold 38px sans-serif`;
    ctx.fillText(rank ? `#${rank}` : '—', rankLabelX, topY + 40);
    ctx.restore();

    // ── 6. Username / display name ────────────────────────────────────────────
    const maxNameWidth = rankLabelX - INFO_X - 20;
    const nameToShow = displayName || username;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = t.text1;
    ctx.font = `bold 28px sans-serif`;
    const truncatedName = truncateText(ctx, nameToShow, maxNameWidth);
    ctx.fillText(truncatedName, INFO_X, topY + 10);

    if (displayName && username !== displayName) {
        ctx.fillStyle = t.text2;
        ctx.font = `500 15px sans-serif`;
        ctx.fillText('@' + username, INFO_X, topY + 32);
    }
    ctx.restore();

    // ── 7. Stats row (messages + voice) ──────────────────────────────────────
    const barY = H - PAD - BAR_H - 38;
    const statsY = barY - 28;
    const voiceH = Math.floor(voiceMinutes / 60);
    const voiceM = voiceMinutes % 60;
    const msgStr = `💬 ${messages.toLocaleString()}`;
    const voiceStr = `🎙️ ${voiceH}h ${voiceM}m`;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.text2;
    ctx.font = `500 14px sans-serif`;
    ctx.fillText(msgStr, INFO_X, statsY);
    const msgW = ctx.measureText(msgStr).width;
    ctx.fillText(voiceStr, INFO_X + msgW + 20, statsY);
    ctx.restore();

    // ── 8. XP Progress bar ────────────────────────────────────────────────────
    const barX = INFO_X;
    const barW = W - INFO_X - PAD;
    const progress = requiredXP > 0 ? Math.min(currentXP / requiredXP, 1) : 0;
    const barStyle = t.bar_style || 'rounded';

    // Track
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    roundRect(ctx, barX, barY, barW, BAR_H, barStyle === 'sharp' ? 2 : BAR_RADIUS);
    ctx.fill();
    ctx.restore();

    // Fill
    if (progress > 0) {
        const fillW = Math.max(barStyle === 'sharp' ? 2 : BAR_RADIUS * 2, barW * progress);
        ctx.save();

        if (t.bar_glow) {
            ctx.shadowColor = t.bar || t.accent;
            ctx.shadowBlur = 12;
        }

        if (barStyle === 'striped') {
            // Clip to bar shape, then draw stripes
            ctx.save();
            roundRect(ctx, barX, barY, fillW, BAR_H, BAR_RADIUS);
            ctx.clip();
            const g = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
            g.addColorStop(0, hexToRgba(t.bar || t.accent, 0.9));
            g.addColorStop(1, t.bar || t.accent);
            ctx.fillStyle = g;
            ctx.fillRect(barX, barY, fillW, BAR_H);
            // Stripe overlay
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            for (let sx = barX - BAR_H; sx < barX + fillW + BAR_H; sx += 22) {
                ctx.beginPath();
                ctx.moveTo(sx, barY);
                ctx.lineTo(sx + BAR_H, barY);
                ctx.lineTo(sx + BAR_H - 14, barY + BAR_H);
                ctx.lineTo(sx - 14, barY + BAR_H);
                ctx.fill();
            }
            ctx.restore();
        } else {
            const g = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
            g.addColorStop(0, hexToRgba(t.bar || t.accent, 0.85));
            g.addColorStop(0.5, t.bar || t.accent);
            g.addColorStop(1, lighten(t.bar || t.accent, 25));
            ctx.fillStyle = g;
            roundRect(ctx, barX, barY, fillW, BAR_H, barStyle === 'sharp' ? 2 : BAR_RADIUS);
            ctx.fill();
        }
        ctx.restore();
    }

    // Shine on bar
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(ctx, barX + 2, barY + 2, barW - 4, BAR_H / 2 - 2, BAR_RADIUS);
    ctx.fill();
    ctx.restore();

    // Percent text inside bar
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `bold 13px sans-serif`;
    ctx.fillText(`${Math.round(progress * 100)}%`, barX + barW / 2, barY + BAR_H / 2 + 1);
    ctx.restore();

    // ── 9. XP text below bar ─────────────────────────────────────────────────
    const xpBelowY = barY + BAR_H + 9;
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.fillStyle = t.text2;
    ctx.font = `500 12px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`${currentXP.toLocaleString()} / ${requiredXP.toLocaleString()} XP`, barX, xpBelowY);
    ctx.textAlign = 'right';
    ctx.fillText(`${totalXP.toLocaleString()} total`, barX + barW, xpBelowY);
    ctx.restore();

    return canvas.toBuffer('image/png');
}

function drawGradientBg(ctx, t) {
    const angle = ((t.bg_angle || 135) * Math.PI) / 180;
    const cx = W / 2, cy = H / 2;
    const len = Math.sqrt(W * W + H * H) / 2;
    const grad = ctx.createLinearGradient(
        cx - Math.cos(angle) * len, cy - Math.sin(angle) * len,
        cx + Math.cos(angle) * len, cy + Math.sin(angle) * len
    );
    grad.addColorStop(0, t.bg1 || '#1e1f2e');
    grad.addColorStop(1, t.bg2 || '#13141f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
}

module.exports = { generateRankCard, PRESETS, DEFAULT_THEME };
