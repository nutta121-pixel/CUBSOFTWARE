/**
 * StreamAvatars Sprite Editor
 * Pixel-art editor: 32×48 canvas at 12× zoom, 5 animation states, multiple frames.
 */

const CANVAS_W  = 32;
const CANVAS_H  = 48;
let   zoom      = 12;
const ZOOM_MIN  = 4;
const ZOOM_MAX  = 28;
const STATES    = ['idle', 'walk', 'run', 'jump', 'talk'];
const STATE_FPS = { idle: 2, walk: 4, run: 6, jump: 4, talk: 3 };

const PALETTE = [
    '#ffffff','#e0e0e0','#a0a0a0','#606060','#303030','#101010','#000000','#00000000',
    '#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899',
    '#fca5a5','#fdba74','#fde68a','#86efac','#67e8f9','#93c5fd','#c4b5fd','#f9a8d4',
    '#7f1d1d','#7c2d12','#78350f','#14532d','#164e63','#1e3a8a','#4c1d95','#831843',
];

let currentState   = 'idle';
let currentFrame   = 0;
let frames         = {};     // { state: HTMLCanvasElement[] }
let tool           = 'pencil';
let color          = '#5865f2';
let isDrawing      = false;
let charId         = null;
let previewInterval = null;
let previewIdx     = 0;
let previewFlipped  = false;
let previewFpsOverride = null;  // null = use STATE_FPS default

// ── Canvas setup ──────────────────────────────────────────────────────────────

const displayCanvas = document.getElementById('editorCanvas');
const dCtx          = displayCanvas.getContext('2d');
displayCanvas.width  = CANVAS_W * zoom;
displayCanvas.height = CANVAS_H * zoom;

function setZoom(n) {
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, n));
    displayCanvas.width  = CANVAS_W * zoom;
    displayCanvas.height = CANVAS_H * zoom;
    render();
}

function createFrameCanvas() {
    const c = document.createElement('canvas');
    c.width  = CANVAS_W;
    c.height = CANVAS_H;
    return c;
}

function getCurrentSrc() {
    return frames[currentState]?.[currentFrame];
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
    dCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);

    const src = getCurrentSrc();
    if (src) {
        dCtx.imageSmoothingEnabled = false;
        dCtx.drawImage(src, 0, 0, CANVAS_W * zoom, CANVAS_H * zoom);
    }

    // Grid (hide at very low zoom to avoid clutter)
    if (zoom >= 6) {
        dCtx.strokeStyle = 'rgba(255,255,255,0.07)';
        dCtx.lineWidth   = 0.5;
        for (let x = 0; x <= CANVAS_W; x++) {
            dCtx.beginPath();
            dCtx.moveTo(x * zoom, 0);
            dCtx.lineTo(x * zoom, CANVAS_H * zoom);
            dCtx.stroke();
        }
        for (let y = 0; y <= CANVAS_H; y++) {
            dCtx.beginPath();
            dCtx.moveTo(0, y * zoom);
            dCtx.lineTo(CANVAS_W * zoom, y * zoom);
            dCtx.stroke();
        }
    }
}

// ── Tools ─────────────────────────────────────────────────────────────────────

function getLogicalPos(e) {
    const rect   = displayCanvas.getBoundingClientRect();
    const scaleX = displayCanvas.width  / rect.width;
    const scaleY = displayCanvas.height / rect.height;
    const lx = Math.floor((e.clientX - rect.left) * scaleX / zoom);
    const ly = Math.floor((e.clientY - rect.top)  * scaleY / zoom);
    return {
        x: Math.max(0, Math.min(CANVAS_W - 1, lx)),
        y: Math.max(0, Math.min(CANVAS_H - 1, ly)),
    };
}

function applyTool(e, forceTool) {
    const t    = forceTool || tool;
    const { x, y } = getLogicalPos(e);
    const src  = getCurrentSrc();
    if (!src) return;
    const ctx  = src.getContext('2d');

    if (t === 'pencil') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
    } else if (t === 'eraser') {
        ctx.clearRect(x, y, 1, 1);
    } else if (t === 'eyedropper') {
        const d = ctx.getImageData(x, y, 1, 1).data;
        if (d[3] > 0) {
            color = `#${d[0].toString(16).padStart(2,'0')}${d[1].toString(16).padStart(2,'0')}${d[2].toString(16).padStart(2,'0')}`;
            document.getElementById('colorPicker').value = color;
        }
        setTool('pencil');
        return;
    } else if (t === 'fill') {
        floodFill(ctx, x, y, color);
    }
    render();
}

function floodFill(ctx, sx, sy, fillHex) {
    if (fillHex === 'transparent' || fillHex === '#00000000') {
        floodFillClear(ctx, sx, sy);
        return;
    }
    const img = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    const px  = img.data;

    const fr = parseInt(fillHex.slice(1, 3), 16);
    const fg = parseInt(fillHex.slice(3, 5), 16);
    const fb = parseInt(fillHex.slice(5, 7), 16);

    function idx(x, y) { return (y * CANVAS_W + x) * 4; }
    const ti = idx(sx, sy);
    const tr = px[ti], tg = px[ti+1], tb = px[ti+2], ta = px[ti+3];
    if (tr===fr && tg===fg && tb===fb && ta===255) return;

    const stack = [[sx, sy]];
    while (stack.length) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cx >= CANVAS_W || cy < 0 || cy >= CANVAS_H) continue;
        const i = idx(cx, cy);
        if (px[i]!==tr || px[i+1]!==tg || px[i+2]!==tb || px[i+3]!==ta) continue;
        px[i]=fr; px[i+1]=fg; px[i+2]=fb; px[i+3]=255;
        stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
    }
    ctx.putImageData(img, 0, 0);
}

function floodFillClear(ctx, sx, sy) {
    const img = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    const px  = img.data;
    function idx(x, y) { return (y * CANVAS_W + x) * 4; }
    const ti = idx(sx, sy);
    const tr = px[ti], tg = px[ti+1], tb = px[ti+2], ta = px[ti+3];
    if (ta === 0) return;
    const stack = [[sx, sy]];
    while (stack.length) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cx >= CANVAS_W || cy < 0 || cy >= CANVAS_H) continue;
        const i = idx(cx, cy);
        if (px[i]!==tr || px[i+1]!==tg || px[i+2]!==tb || px[i+3]!==ta) continue;
        px[i+3] = 0;
        stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
    }
    ctx.putImageData(img, 0, 0);
}

function clearFrame() {
    const src = getCurrentSrc();
    if (!src) return;
    src.getContext('2d').clearRect(0, 0, CANVAS_W, CANVAS_H);
    render();
}

function setTransparent() {
    const prevColor = color;
    color = 'transparent';
    // Only used with fill; pencil still uses hex
    showToast('Use Fill bucket to erase region (transparent)', false);
    color = prevColor;
}

// ── Mouse events ──────────────────────────────────────────────────────────────

displayCanvas.addEventListener('mousedown', e => {
    e.preventDefault();
    isDrawing = true;
    applyTool(e);
});
displayCanvas.addEventListener('mousemove', e => {
    if (!isDrawing) return;
    if (tool === 'fill' || tool === 'eyedropper') return;
    applyTool(e);
});
displayCanvas.addEventListener('mouseup',    () => isDrawing = false);
displayCanvas.addEventListener('mouseleave', () => isDrawing = false);
displayCanvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    applyTool(e, 'eraser');
});

// Touch support
displayCanvas.addEventListener('touchstart', e => {
    e.preventDefault();
    isDrawing = true;
    applyTool(e.touches[0]);
}, { passive: false });
displayCanvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!isDrawing) return;
    if (tool === 'fill' || tool === 'eyedropper') return;
    applyTool(e.touches[0]);
}, { passive: false });
displayCanvas.addEventListener('touchend', () => isDrawing = false);

// Keyboard shortcuts
window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const map = { p: 'pencil', e: 'eraser', f: 'fill', i: 'eyedropper' };
    if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCharacter(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); } // TODO: undo
    if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(zoom + 2); }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(zoom - 2); }
});

// ── Tool UI ───────────────────────────────────────────────────────────────────

function setTool(t) {
    tool = t;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => {
        b.classList.toggle('active', b.dataset.tool === t && b.id !== 'btnEraseAll');
    });
}

document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    if (btn.id === 'btnEraseAll') return;
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
});

document.getElementById('colorPicker').addEventListener('input', e => {
    color = e.target.value;
});

// ── State tabs ────────────────────────────────────────────────────────────────

function switchState(state) {
    currentState = state;
    currentFrame = Math.min(currentFrame, (frames[state]?.length || 1) - 1);
    document.querySelectorAll('.state-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.state === state));
    // Reset FPS to state default unless user has manually chosen one
    if (!previewFpsOverride) {
        const slider = document.getElementById('previewFpsSlider');
        if (slider) slider.value = STATE_FPS[state] || 2;
    }
    updateFrameList();
    render();
    restartPreview();
}

document.querySelectorAll('.state-btn').forEach(btn =>
    btn.addEventListener('click', () => switchState(btn.dataset.state)));

// ── Frame management ──────────────────────────────────────────────────────────

function switchFrame(idx) {
    currentFrame = idx;
    updateFrameList();
    render();
}

function addFrame() {
    if ((frames[currentState]?.length || 0) >= 8) { showToast('Max 8 frames'); return; }
    frames[currentState].push(createFrameCanvas());
    currentFrame = frames[currentState].length - 1;
    updateFrameList();
    render();
}

function deleteFrame() {
    if ((frames[currentState]?.length || 0) <= 1) { showToast('Need at least 1 frame'); return; }
    frames[currentState].splice(currentFrame, 1);
    currentFrame = Math.min(currentFrame, frames[currentState].length - 1);
    updateFrameList();
    render();
}

function updateFrameList() {
    const list = document.getElementById('frameList');
    list.innerHTML = '';
    (frames[currentState] || []).forEach((fc, i) => {
        const thumb = document.createElement('canvas');
        thumb.width  = CANVAS_W;
        thumb.height = CANVAS_H;
        thumb.getContext('2d').drawImage(fc, 0, 0);
        thumb.className = 'frame-thumb' + (i === currentFrame ? ' active' : '');
        thumb.title     = `Frame ${i + 1}`;
        thumb.onclick   = () => switchFrame(i);
        const wrap = document.createElement('div');
        wrap.className  = 'frame-thumb-wrap';
        wrap.appendChild(thumb);
        list.appendChild(wrap);
    });
}

document.getElementById('btnAddFrame').addEventListener('click', addFrame);
document.getElementById('btnDelFrame').addEventListener('click', deleteFrame);

// ── Animation preview ─────────────────────────────────────────────────────────

function restartPreview() {
    if (previewInterval) clearInterval(previewInterval);
    previewIdx = 0;
    const fps  = previewFpsOverride ?? STATE_FPS[currentState] ?? 2;
    const slider = document.getElementById('previewFpsSlider');
    const label  = document.getElementById('previewFpsLabel');
    if (slider && !previewFpsOverride) slider.value = fps;
    if (label) label.textContent = fps;

    const pv = document.getElementById('previewCanvas');
    const pc = pv.getContext('2d');

    function drawFrame() {
        const frs = frames[currentState] || [];
        if (!frs.length) return;
        const src = frs[previewIdx % frs.length];
        pc.clearRect(0, 0, pv.width, pv.height);
        pc.save();
        if (previewFlipped) {
            pc.translate(pv.width, 0);
            pc.scale(-1, 1);
        }
        pc.imageSmoothingEnabled = false;
        pc.drawImage(src, 0, 0, pv.width, pv.height);
        pc.restore();
    }

    drawFrame();
    previewInterval = setInterval(() => {
        const frs = frames[currentState] || [];
        if (!frs.length) return;
        previewIdx = (previewIdx + 1) % frs.length;
        drawFrame();
    }, 1000 / fps);
}

// FPS slider
document.getElementById('previewFpsSlider')?.addEventListener('input', function () {
    previewFpsOverride = parseInt(this.value);
    document.getElementById('previewFpsLabel').textContent = previewFpsOverride;
    restartPreview();
});

// Flip button
document.getElementById('btnFlipPreview')?.addEventListener('click', function () {
    previewFlipped = !previewFlipped;
    this.style.borderColor = previewFlipped ? '#5865f2' : '#1e1e2e';
    this.style.color       = previewFlipped ? '#5865f2' : '#666';
    restartPreview();
});

// ── Palette ───────────────────────────────────────────────────────────────────

(function buildPalette() {
    const container = document.getElementById('palette');
    PALETTE.forEach(hex => {
        const swatch = document.createElement('div');
        swatch.className = 'palette-swatch';
        if (hex === '#00000000' || hex === 'transparent') {
            swatch.style.background = 'transparent';
            swatch.style.border = '1px dashed #555';
            swatch.title = 'Transparent';
            swatch.onclick = () => {
                // treat as eraser briefly
                tool === 'fill'
                    ? (color = 'transparent')
                    : setTool('eraser');
            };
        } else {
            swatch.style.background = hex;
            swatch.title = hex;
            swatch.onclick = () => {
                color = hex;
                document.getElementById('colorPicker').value = hex;
            };
        }
        container.appendChild(swatch);
    });
})();

// ── Preset sprite generators (side-profile, facing right) ────────────────────
// All characters are drawn facing right; the overlay flips them for leftward movement.

function hexToHue(hex) {
    const rv=parseInt(hex.slice(1,3),16)/255, gv=parseInt(hex.slice(3,5),16)/255, bv=parseInt(hex.slice(5,7),16)/255;
    const mx=Math.max(rv,gv,bv), mn=Math.min(rv,gv,bv), d=mx-mn;
    if(d===0) return 0;
    let h; if(mx===rv) h=((gv-bv)/d)%6; else if(mx===gv) h=(bv-rv)/d+2; else h=(rv-gv)/d+4;
    return Math.round(h*60+360)%360;
}

function _p(ctx,x,y,c){if(x<0||x>=CANVAS_W||y<0||y>=CANVAS_H)return;ctx.fillStyle=c;ctx.fillRect(x,y,1,1);}
function _r(ctx,x,y,w,h,c){const x1=Math.max(x,0),y1=Math.max(y,0),x2=Math.min(x+w,CANVAS_W),y2=Math.min(y+h,CANVAS_H);if(x2<=x1||y2<=y1)return;ctx.fillStyle=c;ctx.fillRect(x1,y1,x2-x1,y2-y1);}

// ── Kitsune Fox (5 tails, kimono) ─────────────────────────────────────────────
// Preset colour defaults (used when loading a preset without explicit hue)
const PRESET_DEFAULTS = {
    wolf:    { hex: '#202838', hue: 220 },
    onion:   { hex: '#d4b060', hue: 40  },
    leopard: { hex: '#c8d8f0', hue: 210 },
    kitsune: { hex: '#d04020', hue: 30  },
};
let lastPreset = 'wolf';

// ── Kitsune (5-tailed fox spirit, kimono, bipedal side-profile) ───────────────
function generateKitsuneSprite(state, frame, hue) {
    const fc  = createFrameCanvas();
    const ctx = fc.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const f  = frame % 2;
    const p  = (x,y,c)     => _p(ctx,x,y,c);
    const r  = (x,y,w,h,c) => _r(ctx,x,y,w,h,c);

    const fur    = `hsl(${hue},80%,52%)`;
    const furD   = `hsl(${hue},82%,30%)`;
    const furH   = `hsl(${hue},55%,76%)`;
    const cream  = '#f8e8d0';
    const creamD = '#e8c8a8';
    const earPk  = '#e87898';
    const eyeA   = '#c88800';
    const eyeD   = '#100800';
    const robe   = '#2e1868';
    const robeL  = '#5030a8';
    const belt   = '#c8a818';
    const beltH  = '#f0d840';
    const tailTp = '#f0ece4';

    let yOff = 0;
    if (state === 'jump') yOff = f === 0 ? 2 : -5;
    else if (state === 'idle' && f === 1) yOff = 1;

    const hy = 3  + yOff;   // head top y
    const by = 19 + yOff;   // body top y
    const ly = 33 + yOff;   // leg top y

    // ── 5 TAILS (drawn first — behind body) ────────────────────────────────
    // Each tail: dark shadow band → main fur → highlight → cream tip at far left
    function tail5(tyArr) {
        for (let i = 0; i < 5; i++) {
            const ty = tyArr[i];
            r(0, ty+1, 12-i, 3, furD);
            r(1, ty,   11-i, 3, fur);
            r(3, ty,    6-i, 2, furH);
            r(0, ty,    3,   3, tailTp);
            p(1, ty-1, tailTp);
        }
    }
    if (state === 'run') {
        // All 5 stream backward horizontally, stacked tightly
        tail5([by-1, by+2, by+5, by+8, by+11]);
    } else if (state === 'jump' && f === 1) {
        // Airborne — all tails fly upward/back
        tail5([hy, hy+4, hy+8, hy+12, hy+16]);
    } else if (state === 'jump' && f === 0) {
        // Crouch — tails droop down behind
        tail5([by+2, by+5, by+8, by+11, by+14]);
    } else {
        // Idle/walk/talk — fan spreading from mid-back upward
        const sw = (state === 'walk' && f === 1) ? 1 : 0;
        tail5([hy+1, hy+5, hy+10, by+2+sw, by+6+sw]);
    }

    // ── EARS ────────────────────────────────────────────────────────────────
    // Far ear (darker, behind head)
    r(17, hy+1, 3, 5, furD); r(18, hy,   2, 3, furD); r(18, hy+1, 1, 4, earPk);
    // Near ear (tall, sharp point, front)
    p(23, hy-2, fur); r(22, hy-1, 3, 2, fur);
    r(21, hy,   4, 5, fur);  r(22, hy,   2, 5, furH);
    r(22, hy,   2, 4, earPk);

    // ── HEAD (large chibi, side-profile facing right) ───────────────────────
    r(14, hy+3, 14, 13, fur); r(15, hy+2, 13, 14, fur); r(16, hy+1, 11, 2, fur);
    r(16, hy+2,  9,  4, furH);     // forehead highlight
    r(22, hy+5,  6,  9, furH);     // cheek puff (face side)

    // Muzzle — wide fox snout extending right
    r(22, hy+10, 8,  5, cream); r(23, hy+9,  7,  6, cream);
    r(25, hy+8,  5,  6, cream); r(27, hy+8,  2,  5, cream);
    r(22, hy+10, 8,  1, creamD);   // muzzle top edge
    // Nose
    r(27, hy+8, 2, 2, '#280e08'); p(27, hy+8, '#7a3018'); p(28, hy+9, '#3c1808');
    // Nostril crease
    p(26, hy+10, creamD); p(27, hy+10, creamD);

    // Eye (large amber)
    r(17, hy+5, 5, 5, eyeA); r(18, hy+6, 4, 4, eyeD);
    p(17, hy+5, '#ffffa0'); p(18, hy+5, '#ffffa0'); p(17, hy+6, '#ffe060');
    // Brow line above eye
    r(17, hy+4, 5, 1, furD);

    // Mouth
    if (state === 'talk' && f === 0) {
        r(23, hy+13, 5, 3, '#301010'); p(24, hy+14, '#d05050'); p(26, hy+14, '#d05050');
    } else {
        r(24, hy+13, 3, 1, `hsl(${hue},45%,38%)`);
        p(23, hy+12, `hsl(${hue},45%,38%)`);
    }
    // Chin
    r(16, hy+15, 6, 1, furD);

    // ── KIMONO BODY ─────────────────────────────────────────────────────────
    const ay = by + 2;
    // Collar
    r(13, by,   5, 2, cream); r(17, by,   5, 2, robe);
    // Torso
    r(12, by+2, 10, 10, robe); r(14, by+2, 8, 10, robeL);
    r(17, by+2,  5,  9, cream);           // chest fur
    r(12, by+2,  2,  9, '#1a0c3a');       // back shadow
    r(20, by+2,  2,  9, '#1a0c3a');       // front edge shadow
    // Obi belt
    r(11, by+11, 11, 3, belt); r(11, by+11, 11, 1, beltH);
    r(15, by+10,  4,  4, belt); p(16, by+11, beltH); p(17, by+11, beltH);
    // Lower robe
    r(10, by+14, 13, 9, robe); r(12, by+14, 9, 7, robeL);
    r(10, by+21, 13, 1, robeL);

    // ── ARMS (kimono sleeves) ────────────────────────────────────────────────
    if (state === 'walk') {
        const wo = f === 0 ? 0 : 2;
        r(9,  ay+wo,   3, 7, robe); r(9,  ay+wo+6, 3, 2, fur);
        r(21, ay+2-wo, 3, 7, robe); r(21, ay+8-wo, 3, 2, fur);
    } else if (state === 'run') {
        if (f === 0) { r(8,ay+4,3,8,robe); r(8,ay+11,3,2,fur); r(21,ay-1,3,8,robe); r(21,ay+6,3,2,fur); }
        else         { r(8,ay-1,3,8,robe); r(8,ay+6, 3,2,fur); r(21,ay+4,3,8,robe); r(21,ay+11,3,2,fur); }
    } else if (state === 'jump') {
        if (f === 0) { r(9,ay+3,3,7,robe); r(9,ay+9,3,2,fur);   r(21,ay+3,3,7,robe); r(21,ay+9,3,2,fur); }
        else         { r(8,ay-3,3,8,robe); r(8,ay+4,3,2,fur);   r(21,ay-3,3,8,robe); r(21,ay+4,3,2,fur); }
    } else {
        r(9, ay+1, 3, 8, robe); r(9, ay+8, 3, 2, fur);
        r(21,ay+1, 3, 8, robe); r(21,ay+8, 3, 2, fur);
    }

    // ── LEGS (bipedal, poke from under robe) ─────────────────────────────────
    function kitLeg(lx2, ly2) {
        r(lx2,   ly2,    3, 9, robe);
        r(lx2,   ly2+9,  4, 3, fur);
        r(lx2-1, ly2+11, 5, 2, furD);
    }
    if (state === 'walk') {
        if (f === 0) { kitLeg(11, ly); kitLeg(16, ly-3); }
        else         { kitLeg(16, ly); kitLeg(11, ly-3); }
    } else if (state === 'run') {
        if (f === 0) { kitLeg(10, ly);  kitLeg(17, ly-5); }
        else         { kitLeg(17, ly);  kitLeg(10, ly-5); }
    } else if (state === 'jump') {
        if (f === 0) {
            r(11,ly+1,3,6,robe); r(11,ly+7,4,2,fur); r(10,ly+8,5,2,furD);
            r(16,ly+1,3,6,robe); r(16,ly+7,4,2,fur); r(15,ly+8,5,2,furD);
        } else {
            r(10,ly-2,3,7,robe); r(10,ly+5,4,2,fur); r(9, ly+6,5,2,furD);
            r(17,ly-2,3,7,robe); r(17,ly+5,4,2,fur); r(16,ly+6,5,2,furD);
        }
    } else {
        kitLeg(11, ly); kitLeg(16, ly);
    }

    return fc;
}

// ── Wolf (dark fur, red scarf + headphones, orange-red eyes) ──────────────────
function generateWolfSprite(state, frame, hue) {
    const fc  = createFrameCanvas();
    const ctx = fc.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const f  = frame % 2;
    const p  = (x,y,c)     => _p(ctx,x,y,c);
    const r  = (x,y,w,h,c) => _r(ctx,x,y,w,h,c);

    const fur  = `hsl(${hue},22%,22%)`;
    const furM = `hsl(${hue},18%,34%)`;
    const furL = `hsl(${hue},14%,50%)`;
    const wh   = '#eeeef8';
    const ow   = '#c8c8e0';
    const sc   = '#cc1818';
    const scD  = '#8a0a0a';
    const ey   = '#d84818';
    const eyD  = '#080400';
    const eaP  = '#8a1820';
    let yOff = 0;
    if (state === 'jump') yOff = f === 0 ? 2 : -5;
    else if (state === 'idle' && f === 1) yOff = 1;
    const hy = 4 + yOff, by = 17 + yOff, ly = 28 + yOff;

    // TAIL
    if (state === 'run') {
        r(0,by+1,13,3,furM); r(0,by-1,14,3,furL); r(0,by-2,7,3,wh);
    } else {
        const sw = (state==='walk'&&f===1)?1:0;
        r(0,hy+11+sw,7,14,fur); r(1,hy+9+sw,7,12,furM); r(2,hy+8+sw,5,9,furL);
        r(2,hy+7+sw,4,6,wh); p(3,hy+6+sw,'#ffffff');
    }
    // BODY
    r(8,by+1,15,10,fur); r(7,by+2,16,8,fur); r(9,by,13,12,fur);
    r(10,by,12,3,furM); r(18,by+2,6,8,wh); r(19,by+1,5,9,wh);
    p(18,by+9,ow); p(23,by+2,ow);
    // SCARF
    r(15,hy+14,9,4,sc); r(16,hy+13,8,5,sc); r(16,hy+17,8,1,scD);
    r(22,hy+14,3,7,sc); r(22,hy+20,2,2,scD);
    // EARS
    r(17,hy+1,3,4,furM); r(18,hy,2,2,furM); r(18,hy+1,1,3,eaP);  // far
    r(20,hy,4,5,fur); r(21,hy-1,3,3,fur); p(22,hy-2,fur); r(21,hy,2,4,eaP);  // near
    // HEAD
    r(14,hy+2,13,12,fur); r(15,hy+1,12,13,fur); r(15,hy+2,9,3,furM); r(20,hy+3,6,9,furM);
    r(21,hy+7,7,6,wh); r(22,hy+6,6,7,wh); r(25,hy+5,2,7,wh); r(21,hy+7,7,1,ow);
    r(26,hy+5,2,2,'#100a06'); p(26,hy+5,'#382010');  // nose
    r(17,hy+4,5,4,ey); r(18,hy+5,4,3,eyD); p(17,hy+4,'#ffffff'); p(18,hy+4,'#ffffff');  // eye
    if (state==='talk'&&f===0){r(23,hy+10,4,2,'#201008');p(24,hy+11,'#c04040');}
    else r(23,hy+10,3,1,'#403020');
    // LEGS (4-legged)
    function leg(lx,ly2,col,paw){r(lx,ly2,3,9,col);r(lx-1,ly2+8,5,2,paw);}
    const fa=`hsl(${hue},22%,12%)`, fp=`hsl(${hue},18%,18%)`;
    if (state==='walk'){
        if(f===0){leg(10,ly+2,fa,fp);leg(19,ly,fa,fp);   leg(12,ly,fur,furM);   leg(21,ly+2,fur,furM);}
        else     {leg(10,ly,fa,fp);  leg(19,ly+2,fa,fp); leg(12,ly+2,fur,furM); leg(21,ly,fur,furM);}
    } else if (state==='run'){
        if(f===0){leg(9,ly+4,fa,fp); leg(20,ly-2,fa,fp); leg(11,ly-2,fur,furM); leg(22,ly+4,fur,furM);}
        else     {leg(9,ly-2,fa,fp); leg(20,ly+4,fa,fp); leg(11,ly+4,fur,furM); leg(22,ly-2,fur,furM);}
    } else if (state==='jump'){
        if(f===0){leg(10,ly+2,fa,fp);leg(19,ly+2,fa,fp);leg(12,ly+2,fur,furM);leg(21,ly+2,fur,furM);}
        else{r(9,ly-3,3,6,fa);r(8,ly+3,5,2,fp);r(19,ly-3,3,6,fa);r(18,ly+3,5,2,fp);
             r(11,ly-3,3,6,fur);r(10,ly+3,5,2,furM);r(21,ly-3,3,6,fur);r(20,ly+3,5,2,furM);}
    } else { leg(10,ly,fa,fp); leg(19,ly,fa,fp); leg(12,ly,fur,furM); leg(21,ly,fur,furM); }
    return fc;
}

// ── Onion DJ (round body, green sprout, blue headphones + mic) ────────────────
function generateOnionSprite(state, frame, hue) {
    const fc  = createFrameCanvas();
    const ctx = fc.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const f  = frame % 2;
    const p  = (x,y,c)     => _p(ctx,x,y,c);
    const r  = (x,y,w,h,c) => _r(ctx,x,y,w,h,c);

    const bn1 = `hsl(${hue},52%,72%)`;
    const bn2 = `hsl(${hue},48%,58%)`;
    const bn3 = `hsl(${hue},50%,40%)`;
    const bnH = `hsl(${hue},38%,92%)`;
    const bnS = `hsl(${hue},50%,36%)`;
    const grn = '#3a8818', grd = '#1e5008', grH = '#68c828';
    const ey  = '#181820';
    const ch  = '#e07080';

    let yOff = 0;
    if (state === 'jump') yOff = f === 0 ? 2 : -5;
    else if (state === 'idle' && f === 1) yOff = 1;
    const cx = 15, cy = 24 + yOff;

    // LEAVES (3, fanning from top of onion)
    r(cx-3, cy-22, 2, 9, grd); r(cx-4, cy-23, 2, 8, grn); p(cx-4, cy-24, grH); // left
    r(cx-1, cy-25, 3,13, grn); r(cx,   cy-26, 1,13, grH); p(cx,   cy-27, grH); // center
    r(cx+2, cy-22, 2, 9, grn); r(cx+3, cy-23, 1, 8, grH); p(cx+3, cy-24, grH); // right

    // BODY (rounded teardrop, wider in middle)
    r(cx-2, cy-13,  6,  2, bn1);
    r(cx-5, cy-11, 12,  3, bn1); r(cx-4, cy-12, 10, 2, bn1);
    r(cx-7, cy-8,  16,  6, bn1);
    r(cx-8, cy-2,  18,  7, bn1);
    r(cx-7, cy+5,  16,  5, bn1);
    r(cx-5, cy+10, 12,  3, bn1);
    r(cx-3, cy+13,  8,  2, bn2);

    // SHADOW (left side)
    r(cx-8, cy-1,  3, 8, bn2);
    r(cx-7, cy-7,  2, 6, bn2);
    r(cx-5, cy-11, 2, 3, bn2);
    r(cx-5, cy+11, 9, 2, bn2);

    // HIGHLIGHT (upper right)
    r(cx+4, cy-10, 5, 8, bnH);
    r(cx+2, cy-11, 5, 3, bnH);
    p(cx+6, cy-10, '#ffffff'); p(cx+7, cy-8, '#ffffff');

    // LAYER LINES (left side only, stop before face at x=18)
    r(cx-8, cy-4,  11, 1, bn3);
    r(cx-8, cy+1,  11, 1, bn3);
    r(cx-7, cy+6,  10, 1, bn3);

    // FACE (right side, facing right)
    // Eye white
    r(cx+3, cy-7, 6, 6, '#ffffff'); r(cx+2, cy-6, 7, 5, '#ffffff');
    // Iris (tinted by hue)
    r(cx+3, cy-6, 5, 4, `hsl(${hue},55%,58%)`);
    // Pupil
    r(cx+4, cy-5, 3, 3, ey);
    // Eye highlights
    p(cx+3, cy-5, '#ffffff'); p(cx+4, cy-6, '#ffffff');
    // Eyelid / lash
    r(cx+3, cy-7, 6, 1, bn3); p(cx+3, cy-8, bn3); p(cx+7, cy-8, bn3);

    // Nose
    p(cx+8, cy-2, bn3); p(cx+9, cy-2, bn3); p(cx+8, cy-1, bn2);

    // Cheek blush
    r(cx+5, cy+1, 4, 2, ch);

    // Mouth
    if (state === 'talk' && f === 0) {
        r(cx+3, cy+4, 5, 3, '#301008'); p(cx+4, cy+5, '#d06060'); p(cx+6, cy+5, '#d06060');
    } else {
        r(cx+4, cy+5, 4, 1, bn3); p(cx+3, cy+4, bn3); p(cx+8, cy+4, bn3);
    }

    // ARMS (small rounded stubs at sides)
    const aw = (state === 'walk' || state === 'run') ? (f === 0 ? -2 : 2) : 0;
    r(cx+8,  cy-3+aw, 4, 6, bn2); r(cx+9,  cy-4+aw, 3, 7, bn1); p(cx+9, cy+2+aw, bn3);
    r(cx-10, cy-2-aw, 3, 5, bnS); r(cx-11, cy-1-aw, 3, 5, bn2); p(cx-10,cy+2-aw, bn3);
    if (state === 'jump' && f === 1) {
        r(cx+8, cy-8, 4, 5, bn2); r(cx-11, cy-8, 3, 5, bnS);
    }

    // LEGS
    const legY = cy + 15, lx1 = cx - 3, lx2 = cx + 2;
    if (state === 'walk' || state === 'run') {
        const st = state === 'run' ? 3 : 2;
        if (f === 0) {
            r(lx1,    legY,    3, 7, bn2); r(lx1-1, legY+6,    5, 2, bn3);
            r(lx2+st, legY-st, 3, 7, bn2); r(lx2+st-1, legY-st+6, 5, 2, bn3);
        } else {
            r(lx1+st, legY-st, 3, 7, bn2); r(lx1+st-1, legY-st+6, 5, 2, bn3);
            r(lx2,    legY,    3, 7, bn2); r(lx2-1, legY+6,    5, 2, bn3);
        }
    } else if (state === 'jump') {
        if (f === 0) {
            r(lx1-1, legY+1, 3, 4, bn2); r(lx1-2, legY+4, 5, 2, bn3);
            r(lx2+1, legY+1, 3, 4, bn2); r(lx2,   legY+4, 5, 2, bn3);
        } else {
            r(lx1-2, legY-3, 3, 6, bn2); r(lx1-3, legY+2, 5, 2, bn3);
            r(lx2+2, legY-3, 3, 6, bn2); r(lx2+1, legY+2, 5, 2, bn3);
        }
    } else {
        r(lx1, legY, 3, 7, bn2); r(lx1-1, legY+6, 5, 2, bn3);
        r(lx2, legY, 3, 7, bn2); r(lx2-1, legY+6, 5, 2, bn3);
    }
    return fc;
}

// ── Snow Leopard cub (pale fur, dark rosettes, big blue eyes) ─────────────────
function generateLeopardSprite(state, frame, hue) {
    const fc  = createFrameCanvas();
    const ctx = fc.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const f  = frame % 2;
    const p  = (x,y,c)     => _p(ctx,x,y,c);
    const r  = (x,y,w,h,c) => _r(ctx,x,y,w,h,c);

    const fur  = `hsl(${hue},35%,82%)`;
    const furD = `hsl(${hue},35%,62%)`;
    const furH = `hsl(${hue},20%,94%)`;
    const sp   = '#1a1a2a';
    const ey   = '#3090e8', eyD = '#080820';
    const ns   = '#e06080', nsD = '#a03050';
    const eaP  = '#e8a0b0';

    let yOff = 0;
    if (state === 'jump') yOff = f === 0 ? 2 : -5;
    else if (state === 'idle' && f === 1) yOff = 1;
    const hy = 4 + yOff, by = 17 + yOff, ly = 28 + yOff;

    // TAIL (long, spotted)
    if (state === 'run') {
        r(0,by+1,13,3,furD); r(0,by-1,14,3,fur); r(0,by-2,8,3,furH);
        p(3,by,sp); p(7,by-1,sp); p(11,by,sp);
    } else {
        const sw = (state==='walk'&&f===1)?1:0;
        r(0,hy+10+sw,7,14,furD); r(1,hy+8+sw,8,14,fur); r(2,hy+9+sw,5,10,furH);
        r(1,hy+20+sw,7,4,furH); r(2,hy+22+sw,5,2,'#ffffff');
        p(2,hy+10+sw,sp); p(3,hy+13+sw,sp); p(2,hy+16+sw,sp);
    }
    // BODY
    r(8,by+1,15,10,fur); r(7,by+2,16,8,fur); r(9,by,13,12,fur);
    r(10,by,12,3,furH); r(16,by+4,8,6,furH); r(9,by+9,13,2,furD);
    p(11,by+1,sp);p(12,by+2,sp);p(11,by+3,sp);  // spots
    p(14,by+4,sp);p(15,by+5,sp);p(14,by+6,sp);
    p(11,by+6,sp);p(12,by+7,sp);
    // EARS
    r(17,hy+1,4,4,furD);r(18,hy,3,2,furD);r(18,hy+1,2,2,eaP);  // far
    r(20,hy-1,4,5,fur); r(21,hy-2,3,3,fur); r(21,hy,2,3,eaP);  // near
    // HEAD (large round chibi)
    r(13,hy+2,14,12,fur); r(14,hy+1,13,13,fur); r(15,hy+1,10,3,furH);
    r(22,hy+5,5,7,furH); p(15,hy+4,sp);p(16,hy+5,sp);p(17,hy+2,sp);  // spots
    r(20,hy+7,7,7,furH); r(21,hy+6,6,8,furH); r(24,hy+5,3,7,furH);  // white face
    r(25,hy+5,3,2,ns); r(25,hy+6,3,2,nsD); p(26,hy+5,'#ff9090');  // nose
    r(16,hy+4,5,5,'#ffffff'); r(17,hy+4,4,5,ey); r(18,hy+5,3,4,eyD);  // eye
    p(16,hy+4,'#ffffff'); p(17,hy+4,'#ffffff'); r(16,hy+3,5,1,sp);  // lash
    if(state==='talk'&&f===0){r(22,hy+10,4,2,'#301010');p(23,hy+11,'#e08080');}
    else r(22,hy+10,3,1,'#c07070');
    r(17,hy+2,5,1,fur);
    // LEGS (4-legged)
    function leg(lx,ly2,col,paw){r(lx,ly2,3,8,col);r(lx-1,ly2+7,5,2,paw);}
    const fa=furD, fp=`hsl(${hue},35%,55%)`;
    if (state==='walk'){
        if(f===0){leg(10,ly+2,fa,fp);leg(19,ly,fa,fp);   leg(12,ly,fur,furH);   leg(21,ly+2,fur,furH);}
        else     {leg(10,ly,fa,fp);  leg(19,ly+2,fa,fp); leg(12,ly+2,fur,furH); leg(21,ly,fur,furH);}
    } else if (state==='run'){
        if(f===0){leg(9,ly+4,fa,fp); leg(20,ly-2,fa,fp); leg(11,ly-2,fur,furH); leg(22,ly+4,fur,furH);}
        else     {leg(9,ly-2,fa,fp); leg(20,ly+4,fa,fp); leg(11,ly+4,fur,furH); leg(22,ly-2,fur,furH);}
    } else if (state==='jump'){
        if(f===0){leg(10,ly+2,fa,fp);leg(19,ly+2,fa,fp);leg(12,ly+2,fur,furH);leg(21,ly+2,fur,furH);}
        else{r(9,ly-3,3,6,fa);r(8,ly+3,5,2,fp);r(19,ly-3,3,6,fa);r(18,ly+3,5,2,fp);
             r(11,ly-3,3,6,fur);r(10,ly+3,5,2,furH);r(21,ly-3,3,6,fur);r(20,ly+3,5,2,furH);}
    } else { leg(10,ly,fa,fp); leg(19,ly,fa,fp); leg(12,ly,fur,furH); leg(21,ly,fur,furH); }
    return fc;
}

// ── Preset system ─────────────────────────────────────────────────────────────

function generatePresetSprite(type, state, frame, hue) {
    if (type === 'wolf')    return generateWolfSprite(state, frame, hue);
    if (type === 'onion')   return generateOnionSprite(state, frame, hue);
    if (type === 'leopard') return generateLeopardSprite(state, frame, hue);
    return generateKitsuneSprite(state, frame, hue);
}

function loadPreset(type, customHue) {
    const def = PRESET_DEFAULTS[type] || PRESET_DEFAULTS.kitsune;
    const hue = customHue !== undefined ? customHue : def.hue;
    if (customHue === undefined) {
        const cel = document.getElementById('presetColor');
        if (cel) cel.value = def.hex;
    }
    STATES.forEach(state => {
        frames[state] = [
            generatePresetSprite(type, state, 0, hue),
            generatePresetSprite(type, state, 1, hue),
        ];
    });
    lastPreset = type;
    currentState = 'idle'; currentFrame = 0;
    updateFrameList(); render(); restartPreview();
}

function loadDefaultCharacter() { loadPreset('wolf'); }

// Zoom buttons
document.getElementById('btnZoomIn')?.addEventListener('click',  () => setZoom(zoom + 2));
document.getElementById('btnZoomOut')?.addEventListener('click', () => setZoom(zoom - 2));

// Recolor button (re-applies current color picker hue to current preset)
document.getElementById('btnRecolor')?.addEventListener('click', () => {
    const cel = document.getElementById('presetColor');
    if (!cel) return;
    loadPreset(lastPreset, hexToHue(cel.value));
});

// ── Save / Load ───────────────────────────────────────────────────────────────

async function saveCharacter() {
    const name = document.getElementById('charName').value.trim() || 'My Character';
    const spritesData = {};
    STATES.forEach(state => {
        spritesData[state] = (frames[state] || []).map(fc => fc.toDataURL('image/png'));
    });
    const thumbnail = frames['idle']?.[0]?.toDataURL('image/png') || null;

    const resp = await fetch('/streamavatars/api/character/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sprites: spritesData, thumbnail, char_id: charId }),
    });
    const data = await resp.json();
    if (data.ok) {
        charId = data.char_id;
        showToast('Character saved!');
        // Update URL so refresh edits the same character
        history.replaceState({}, '', `/streamavatars/editor?id=${charId}`);
    } else {
        showToast('Save failed: ' + (data.error || 'unknown'), true);
    }
}

async function loadCharacter(id) {
    const resp = await fetch(`/streamavatars/api/character/${id}`);
    const data = await resp.json();
    if (!data.ok) { showToast('Could not load character', true); return; }

    charId = id;
    document.getElementById('charName').value = data.name || 'My Character';

    const promises = [];
    STATES.forEach(state => {
        frames[state] = [];
        const stateFrames = data.sprites?.[state] || [];
        stateFrames.forEach(dataUrl => {
            const fc  = createFrameCanvas();
            const img = new Image();
            const p   = new Promise(resolve => {
                img.onload = () => {
                    fc.getContext('2d').drawImage(img, 0, 0);
                    resolve();
                };
                img.onerror = resolve;
                img.src = dataUrl;
            });
            frames[state].push(fc);
            promises.push(p);
        });
        if (!frames[state].length) {
            frames[state] = [createFrameCanvas(), createFrameCanvas()];
        }
    });

    await Promise.all(promises);
    currentState = 'idle';
    currentFrame = 0;
    updateFrameList();
    render();
    restartPreview();
}

document.getElementById('btnSave').addEventListener('click', saveCharacter);

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, err = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className   = 'toast show' + (err ? ' error' : '');
    setTimeout(() => t.className = 'toast', 2500);
}

// ── Init ──────────────────────────────────────────────────────────────────────

STATES.forEach(s => { frames[s] = [createFrameCanvas(), createFrameCanvas()]; });
updateFrameList();
render();
restartPreview();
