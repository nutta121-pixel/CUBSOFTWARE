// overlays-effects.js — Shared effects for all overlay source templates

// ─── Auto-inject decorative frame into every overlay ───
(function() {
    function injectFrame() {
        const overlay = document.getElementById('overlay');
        if (!overlay || overlay.querySelector('.frame-corners')) return;
        // 4 corner brackets
        const corners = document.createElement('div');
        corners.className = 'frame-corners';
        corners.innerHTML = '<i></i><i></i><i></i><i></i>';
        overlay.appendChild(corners);
        // Diagonal stripe panels (used by esports + broadcast templates)
        const diag = document.createElement('div');
        diag.className = 'overlay-diag';
        diag.innerHTML = '<span></span><span></span>';
        overlay.appendChild(diag);
        // Cinematic letterbox bars
        const box = document.createElement('div');
        box.className = 'overlay-letterbox';
        box.innerHTML = '<b></b><b></b>';
        overlay.appendChild(box);
        // Edge accent lines (top + bottom)
        const edge = document.createElement('div');
        edge.className = 'overlay-edge-lines';
        edge.innerHTML = '<s></s><s></s>';
        overlay.appendChild(edge);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectFrame);
    } else {
        injectFrame();
    }
})();

// ─── Font Loading ───
function applyFontConfig(cfg, el) {
    const fontName = (cfg.custom_font && cfg.custom_font.trim())
        ? cfg.custom_font.trim()
        : (cfg.font || 'Orbitron');
    if (cfg.custom_font && cfg.custom_font.trim()) {
        const enc = cfg.custom_font.trim().replace(/ /g, '+');
        let lk = document.getElementById('_custom_font_lk');
        if (lk) {
            lk.href = `https://fonts.googleapis.com/css2?family=${enc}&display=swap`;
        } else {
            lk = document.createElement('link');
            lk.id = '_custom_font_lk';
            lk.rel = 'stylesheet';
            lk.href = `https://fonts.googleapis.com/css2?family=${enc}&display=swap`;
            document.head.appendChild(lk);
        }
    }
    el.style.setProperty('--font', `'${fontName}'`);
    el.style.fontFamily = `'${fontName}', sans-serif`;
}

// ─── Scene Animations ───
const OV_ANIM_MAP = {
    'none': '', 'fade': '',
    // Legacy names (kept for backward compat)
    'float':       'float-anim',
    'slide':       'slide-anim',
    'bounce':      'bounce-anim',
    'pulse':       'pulse-anim',
    'glitch':      'glitch-anim',
    // Entry / Basic
    'zoom':        'anim-zoom',
    'spin-in':     'anim-spin-in',
    'blur-in':     'anim-blur-in',
    'shake':       'anim-shake',
    'flicker':     'anim-flicker',
    'rubber-band': 'anim-rubber-band',
    'swing':       'anim-swing',
    'flip':        'anim-flip',
    'roll-in':     'anim-roll-in',
    'typewriter':  'anim-typewriter',
    'drop':        'anim-drop',
    'pop':         'anim-pop',
    // New animations
    'wipe':        'anim-wipe',
    'flip-3d':     'anim-flip-3d',
    'spiral':      'anim-spiral',
    'glitch-in':   'anim-glitch-in',
    'pixel-in':    'anim-pixel-in',
    'zoom-blur':   'anim-zoom-blur',
    'shatter':     'anim-shatter',
    'cinematic':   'anim-cinematic',
    // Expanded animations
    'morph':       'anim-morph',
    'levitate':    'anim-levitate',
    'scan-reveal': 'anim-scan-reveal',
    'neon-boot':   'anim-neon-boot',
    'cascade':     'anim-cascade',
};
const OV_ALL_ANIM_CLASSES = Object.values(OV_ANIM_MAP).filter(Boolean);

function applyAnimationClass(cfg, el) {
    OV_ALL_ANIM_CLASSES.forEach(c => el.classList.remove(c));
    const cls = OV_ANIM_MAP[cfg.animation || 'fade'];
    if (cls) el.classList.add(cls);

    // Typewriter JS effect on scene title
    if (cfg.animation === 'typewriter') {
        const titleEl = el.querySelector('.scene-title');
        if (titleEl) {
            const full = titleEl.textContent;
            titleEl.textContent = '';
            let i = 0;
            const iv = setInterval(() => {
                titleEl.textContent += full[i++] || '';
                if (i >= full.length) clearInterval(iv);
            }, 80);
        }
    }
}

// ─── Text Effects ───
const OV_TEXT_FX = ['text-fx-glow','text-fx-neon-flicker','text-fx-rainbow','text-fx-gradient','text-fx-outline','text-fx-shadow-pulse','text-fx-blur','text-fx-glitch','text-fx-wave','text-fx-fire','text-fx-hologram','text-fx-stamp'];

function applyTextEffect(cfg, el) {
    OV_TEXT_FX.forEach(c => el.classList.remove(c));
    const fx = cfg.text_effect;
    if (fx && fx !== 'none') el.classList.add('text-fx-' + fx);
    // Text effect speed — override animation-duration on title elements
    const spd = parseFloat(cfg.text_effect_speed) || 1.0;
    el.querySelectorAll('.scene-title').forEach(e => {
        e.style.animationDuration = (spd !== 1.0 && fx && fx !== 'none') ? (2 / spd).toFixed(1) + 's' : '';
    });
}

// ─── Logo Effects ───
const OV_LOGO_FX = ['logo-fx-float','logo-fx-pulse-glow','logo-fx-spin','logo-fx-bounce','logo-fx-shake','logo-fx-fade-pulse','logo-fx-swing','logo-fx-glitch','logo-fx-rainbow-glow','logo-fx-heartbeat'];

function applyLogoEffect(cfg, el) {
    OV_LOGO_FX.forEach(c => el.classList.remove(c));
    const fx = cfg.logo_effect;
    if (fx && fx !== 'none') el.classList.add('logo-fx-' + fx);
}

// ─── Background Effects (canvas) ───
let _bgAnimId = null;
let _bgCtx = null;
let _bgCanvas = null;
let _bgParticles = [];
let _bgDrops = null;
let _bgSpeed = 1.0;
let _bgCount = 100;
let _bgColor2 = '';
let _bgDensity = 50;
let _bgDirection = 'none';
let _bgLastSig = '';

function _stopBgEffect() {
    if (_bgAnimId) { cancelAnimationFrame(_bgAnimId); _bgAnimId = null; }
    if (_bgCtx && _bgCanvas) _bgCtx.clearRect(0, 0, _bgCanvas.width, _bgCanvas.height);
    _bgParticles = [];
    _bgDrops = null;
    const aurora = document.getElementById('_aurora');
    if (aurora) aurora.remove();
}

function applyBackgroundEffect(cfg) {
    _bgCanvas = document.getElementById('bg-effects');
    if (!_bgCanvas) return;

    const fx = cfg.background_effect;
    const sig = [fx, cfg.bg_effect_speed, cfg.bg_effect_count, cfg.bg_effect_color_2,
                 cfg.bg_effect_density, cfg.bg_effect_direction, cfg.accent_color,
                 cfg.bg_effect_opacity ?? 80].join('|');
    if (sig === _bgLastSig) return;
    _bgLastSig = sig;

    _bgCtx = _bgCanvas.getContext('2d');
    _stopBgEffect();

    if (!fx || fx === 'none') return;

    _bgSpeed = parseFloat(cfg.bg_effect_speed) || 1.0;
    _bgCount = parseInt(cfg.bg_effect_count) || 100;
    _bgColor2 = cfg.bg_effect_color_2 || '';
    _bgDensity = parseInt(cfg.bg_effect_density) || 50;
    _bgDirection = cfg.bg_effect_direction || 'none';

    const W = _bgCanvas.width;
    const H = _bgCanvas.height;
    const accent = cfg.accent_color || '#7c3aed';

    if (fx === 'starfield')      _startStarfield(W, H);
    else if (fx === 'matrix')    _startMatrix(W, H);
    else if (fx === 'rain')      _startRain(W, H, accent);
    else if (fx === 'snow')      _startSnow(W, H);
    else if (fx === 'bokeh')     _startBokeh(W, H, accent);
    else if (fx === 'aurora')    _startAurora(cfg);
    else if (fx === 'waves')     _startWaves(W, H, accent);
    else if (fx === 'fire')      _startFire(W, H, accent);
    else if (fx === 'hexagons')  _startHexagons(W, H, accent);
    else if (fx === 'confetti')  _startConfetti(W, H);
    else if (fx === 'lightning') _startLightning(W, H, accent);
    // New backgrounds
    else if (fx === 'particle-web') _startParticleWeb(W, H, accent);
    else if (fx === 'bubbles')   _startBubbles(W, H, accent);
    else if (fx === 'geometric') _startGeometric(W, H, accent);
    else if (fx === 'vortex')    _startVortex(W, H, accent);
    else if (fx === 'circuit')   _startCircuit(W, H, accent);
    else if (fx === 'smoke')     _startSmoke(W, H, accent);
    else if (fx === 'fireflies')    _startFireflies(W, H, accent);
    else if (fx === 'lava-lamp')    _startLavaLamp(W, H, accent);
    else if (fx === 'ripple')       _startRipple(W, H, accent);
    else if (fx === 'neon-grid')    _startNeonGrid(W, H, accent);
    else if (fx === 'meteors')      _startMeteors(W, H, accent);
    else if (fx === 'dna')          _startDNA(W, H, accent);
    else if (fx === 'triangles')    _startTriangles(W, H, accent);
    else if (fx === 'glitch-static')_startGlitchStatic(W, H, accent);
    else if (fx === 'pulse-rings')  _startPulseRings(W, H, accent);
    else if (fx === 'flow-field')   _startFlowField(W, H, accent);
    else if (fx === 'plasma')       _startPlasma(W, H, accent);
    else if (fx === 'audio-bars')   _startAudioBars(W, H, accent);
    else if (fx === 'hex-grid')     _startHexGrid(W, H, accent);
    else if (fx === 'laser')        _startLaser(W, H, accent);
    else if (fx === 'nebula')       _startNebula(W, H, accent);
    else if (fx === 'wormhole')     _startWormhole(W, H, accent);
    else if (fx === 'sand')         _startSand(W, H, accent);
    else if (fx === 'ink')          _startInk(W, H, accent);
    else if (fx === 'crystal')      _startCrystal(W, H, accent);
    else if (fx === 'constellation')_startConstellation(W, H, accent);
    else if (fx === 'spinning-rings')_startSpinningRings(W, H, accent);
    // New background effects
    else if (fx === 'magnetic-field') _startMagneticField(W, H, accent);
    else if (fx === 'pendulum-waves') _startPendulumWaves(W, H, accent);
    else if (fx === 'liquid-metal')   _startLiquidMetal(W, H, accent);
    else if (fx === 'tv-static')      _startTVStatic(W, H);
    else if (fx === 'radar-sweep')    _startRadarSweep(W, H, accent);
    else if (fx === 'solar-wind')     _startSolarWind(W, H, accent);
    else if (fx === 'lightning-storm') _startLightningStorm(W, H, accent);
    else if (fx === 'prism')          _startPrism(W, H, accent);
    else if (fx === 'topo-map')       _startTopoMap(W, H, accent);
}

// Starfield — 200 twinkling stars
function _startStarfield(W, H) {
    for (let i = 0; i < 200; i++) {
        _bgParticles.push({ x: Math.random()*W, y: Math.random()*H, r: Math.random()*2+0.5, op: Math.random(), dop: (Math.random()-0.5)*0.02 });
    }
    function draw() {
        _bgCtx.clearRect(0, 0, W, H);
        _bgParticles.forEach(s => {
            s.op += s.dop * _bgSpeed;
            if (s.op <= 0.05 || s.op >= 1) s.dop *= -1;
            _bgCtx.globalAlpha = Math.max(0.05, s.op);
            _bgCtx.fillStyle = '#fff';
            _bgCtx.beginPath();
            _bgCtx.arc(s.x, s.y, s.r, 0, Math.PI*2);
            _bgCtx.fill();
        });
        _bgCtx.globalAlpha = 1;
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

// Matrix Rain — falling green characters
function _startMatrix(W, H) {
    const cols = Math.floor(W / 20);
    _bgDrops = Array(cols).fill(1);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*()01';
    function draw() {
        _bgCtx.fillStyle = 'rgba(0,0,0,0.05)';
        _bgCtx.fillRect(0, 0, W, H);
        _bgCtx.font = '16px Share Tech Mono, monospace';
        _bgDrops.forEach((y, i) => {
            _bgCtx.fillStyle = i % 5 === 0 ? '#9f9' : '#0f0';
            _bgCtx.globalAlpha = 0.8;
            _bgCtx.fillText(chars[Math.floor(Math.random()*chars.length)], i*20, y*20);
            if (y*20 > H && Math.random() > 0.975 / _bgSpeed) _bgDrops[i] = 0;
            _bgDrops[i] += _bgSpeed;
        });
        _bgCtx.globalAlpha = 1;
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

// Rain — diagonal streaks
function _startRain(W, H, color) {
    for (let i = 0; i < 120; i++) {
        _bgParticles.push({ x: Math.random()*W, y: Math.random()*H, speed: Math.random()*6+4, len: Math.random()*25+10, op: Math.random()*0.4+0.15 });
    }
    function draw() {
        _bgCtx.clearRect(0, 0, W, H);
        _bgParticles.forEach(r => {
            r.y += r.speed * _bgSpeed; r.x += r.speed * 0.2 * _bgSpeed;
            if (r.y > H) { r.y = -r.len; r.x = Math.random()*W; }
            _bgCtx.strokeStyle = color;
            _bgCtx.globalAlpha = r.op;
            _bgCtx.lineWidth = 1;
            _bgCtx.beginPath();
            _bgCtx.moveTo(r.x, r.y);
            _bgCtx.lineTo(r.x - r.speed*0.2, r.y - r.len);
            _bgCtx.stroke();
        });
        _bgCtx.globalAlpha = 1;
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

// Snow — floating flakes
function _startSnow(W, H) {
    for (let i = 0; i < 150; i++) {
        _bgParticles.push({ x: Math.random()*W, y: Math.random()*H, r: Math.random()*3+1, speed: Math.random()*1.5+0.5, drift: (Math.random()-0.5)*0.8, angle: Math.random()*Math.PI*2 });
    }
    function draw() {
        _bgCtx.clearRect(0, 0, W, H);
        _bgParticles.forEach(s => {
            s.angle += 0.01 * _bgSpeed;
            s.y += s.speed * _bgSpeed;
            s.x += (s.drift + Math.sin(s.angle)*0.3) * _bgSpeed;
            if (s.y > H) s.y = -5;
            if (s.x > W) s.x = 0;
            if (s.x < 0) s.x = W;
            _bgCtx.globalAlpha = 0.75;
            _bgCtx.fillStyle = '#fff';
            _bgCtx.beginPath();
            _bgCtx.arc(s.x, s.y, s.r, 0, Math.PI*2);
            _bgCtx.fill();
        });
        _bgCtx.globalAlpha = 1;
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

// Bokeh — soft glowing circles
function _startBokeh(W, H, color) {
    for (let i = 0; i < 30; i++) {
        _bgParticles.push({
            x: Math.random()*W, y: Math.random()*H,
            r: Math.random()*60+20,
            speed: (Math.random()-0.5)*0.4,
            dspeed: (Math.random()-0.5)*0.1,
            op: Math.random()*0.3+0.05,
            dop: (Math.random()-0.5)*0.005
        });
    }
    function draw() {
        _bgCtx.clearRect(0, 0, W, H);
        _bgParticles.forEach(b => {
            b.y += b.speed * _bgSpeed; b.speed += b.dspeed * _bgSpeed;
            if (b.speed > 0.8 || b.speed < -0.8) b.dspeed *= -1;
            if (b.y > H+b.r) b.y = -b.r;
            if (b.y < -b.r) b.y = H+b.r;
            b.op += b.dop;
            if (b.op <= 0.02 || b.op >= 0.35) b.dop *= -1;
            const g = _bgCtx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
            g.addColorStop(0, color + Math.round(b.op*255).toString(16).padStart(2,'0'));
            g.addColorStop(1, 'transparent');
            _bgCtx.fillStyle = g;
            _bgCtx.beginPath();
            _bgCtx.arc(b.x, b.y, b.r, 0, Math.PI*2);
            _bgCtx.fill();
        });
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

// Waves — smooth layered sine wave bands
function _startWaves(W, H, color) {
    let tick = 0;
    function draw() {
        _bgCtx.clearRect(0, 0, W, H);
        for (let b = 0; b < 4; b++) {
            const yBase = H * (0.45 + b * 0.14);
            const amp = 50 + b * 20;
            const freq = 0.0018 + b * 0.0008;
            const speed = 0.018 + b * 0.005;
            _bgCtx.beginPath();
            for (let x = 0; x <= W; x += 6) {
                const y = yBase
                    + Math.sin(x * freq + tick * speed) * amp
                    + Math.sin(x * freq * 1.6 + tick * speed * 0.7) * amp * 0.35;
                x === 0 ? _bgCtx.moveTo(x, y) : _bgCtx.lineTo(x, y);
            }
            _bgCtx.lineTo(W, H); _bgCtx.lineTo(0, H); _bgCtx.closePath();
            _bgCtx.globalAlpha = 0.07 - b * 0.01;
            _bgCtx.fillStyle = color;
            _bgCtx.fill();
        }
        _bgCtx.globalAlpha = 1;
        tick += _bgSpeed;
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

// Fire — upward rising particles
function _startFire(W, H, color) {
    for (let i = 0; i < 90; i++) {
        _bgParticles.push({
            x: W * 0.15 + Math.random() * W * 0.7,
            y: H + Math.random() * 80,
            vx: (Math.random() - 0.5) * 1.5,
            vy: -(Math.random() * 3 + 1.5),
            r: Math.random() * 22 + 6,
            life: Math.random(),
        });
    }
    function draw() {
        _bgCtx.clearRect(0, 0, W, H);
        _bgParticles.forEach(p => {
            p.life -= 0.013 * _bgSpeed;
            p.x += (p.vx + (Math.random() - 0.5) * 0.4) * _bgSpeed;
            p.y += p.vy * _bgSpeed;
            if (p.life <= 0) {
                p.x = W * 0.15 + Math.random() * W * 0.7;
                p.y = H + Math.random() * 20;
                p.vx = (Math.random() - 0.5) * 1.5;
                p.vy = -(Math.random() * 3 + 1.5);
                p.r = Math.random() * 22 + 6;
                p.life = 1;
            }
            _bgCtx.globalAlpha = p.life * 0.28;
            _bgCtx.fillStyle = color;
            _bgCtx.beginPath();
            _bgCtx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
            _bgCtx.fill();
        });
        _bgCtx.globalAlpha = 1;
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

// Hexagons — pulsing HUD-style hex grid
function _startHexagons(W, H, color) {
    const S = 72;
    const hexes = [];
    const cols = Math.ceil(W / (S * 1.5)) + 2;
    const rows = Math.ceil(H / (S * 1.732)) + 2;
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            hexes.push({
                x: c * S * 1.5 - S,
                y: r * S * 1.732 + (c % 2) * S * 0.866 - S,
                phase: Math.random() * Math.PI * 2,
                spd: Math.random() * 0.012 + 0.004,
            });
        }
    }
    let tick = 0;
    function draw() {
        _bgCtx.clearRect(0, 0, W, H);
        _bgCtx.strokeStyle = color;
        _bgCtx.lineWidth = 1;
        hexes.forEach(h => {
            const a = (Math.sin(tick * h.spd * _bgSpeed + h.phase) + 1) / 2 * 0.22 + 0.03;
            _bgCtx.globalAlpha = a;
            _bgCtx.beginPath();
            for (let i = 0; i < 6; i++) {
                const ang = Math.PI / 3 * i;
                const px = h.x + S * 0.88 * Math.cos(ang);
                const py = h.y + S * 0.88 * Math.sin(ang);
                i === 0 ? _bgCtx.moveTo(px, py) : _bgCtx.lineTo(px, py);
            }
            _bgCtx.closePath();
            _bgCtx.stroke();
        });
        _bgCtx.globalAlpha = 1;
        tick += _bgSpeed;
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

// Confetti — colorful falling rectangles
function _startConfetti(W, H) {
    const colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b','#cc5de8','#20c997','#f06595'];
    for (let i = 0; i < 130; i++) {
        _bgParticles.push({
            x: Math.random() * W,
            y: Math.random() * H - H,
            w: Math.random() * 14 + 5,
            h: Math.random() * 7 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            speed: Math.random() * 2.5 + 0.8,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.08,
            drift: (Math.random() - 0.5) * 1.2,
        });
    }
    function draw() {
        _bgCtx.clearRect(0, 0, W, H);
        _bgParticles.forEach(p => {
            p.y += p.speed * _bgSpeed; p.x += p.drift * _bgSpeed; p.angle += p.spin * _bgSpeed;
            if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W; }
            _bgCtx.save();
            _bgCtx.translate(p.x, p.y);
            _bgCtx.rotate(p.angle);
            _bgCtx.globalAlpha = 0.75;
            _bgCtx.fillStyle = p.color;
            _bgCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            _bgCtx.restore();
        });
        _bgCtx.globalAlpha = 1;
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

// Lightning — periodic electric bolts
function _startLightning(W, H, color) {
    let bolts = [];
    let timer = 0;
    function makeBolt() {
        const segs = [];
        let cx = Math.random() * W, cy = 0;
        while (cy < H) {
            const nx = cx + (Math.random() - 0.5) * 110;
            const ny = cy + Math.random() * 65 + 30;
            segs.push([cx, cy, nx, Math.min(ny, H)]);
            cx = nx; cy = ny;
        }
        return { segs, life: 1 };
    }
    function draw() {
        _bgCtx.clearRect(0, 0, W, H);
        if (++timer % Math.max(1, Math.round(48 / _bgSpeed)) === 0) {
            bolts.push(makeBolt());
            if (Math.random() > 0.55) bolts.push(makeBolt());
        }
        bolts = bolts.filter(b => { b.life -= 0.055 * _bgSpeed; return b.life > 0; });
        bolts.forEach(b => {
            _bgCtx.globalAlpha = b.life * 0.65;
            _bgCtx.strokeStyle = color;
            _bgCtx.lineWidth = Math.max(0.5, b.life * 2.5);
            b.segs.forEach(([x1, y1, x2, y2]) => {
                _bgCtx.beginPath();
                _bgCtx.moveTo(x1, y1);
                _bgCtx.lineTo(x2, y2);
                _bgCtx.stroke();
            });
        });
        _bgCtx.globalAlpha = 1;
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

// ─── Featured People ───
function applyFeaturedPeople(cfg) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    const people = (cfg.featured_people || []).filter(p => p && p.name);
    let el = document.getElementById('_ov_featured_people');
    if (!people.length) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = '_ov_featured_people'; el.className = 'ov-featured-people'; overlay.appendChild(el); }
    el.innerHTML = people.map(p => `
        <div class="ov-fp-card">
            ${p.avatar ? `<img class="ov-fp-avatar" src="${p.avatar}" alt="">` : ''}
            <div class="ov-fp-info">
                <span class="ov-fp-name">${p.name}</span>
                ${p.role ? `<span class="ov-fp-role">${p.role}</span>` : ''}
            </div>
        </div>`).join('');
}

// ─── Games List ───
function applyGames(cfg) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    const games = (cfg.games || []).filter(g => g && g.name);
    let el = document.getElementById('_ov_games');
    if (!games.length) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = '_ov_games'; el.className = 'ov-games-list'; overlay.appendChild(el); }
    el.innerHTML = games.map(g => `
        <div class="ov-game-item">
            <span class="ov-game-icon">🎮</span>
            <span class="ov-game-name">${g.name}</span>
        </div>`).join('');
}

// ─── Branding Bar ───
function applyBranding(cfg) {
    let el = document.getElementById('_ov_branding');
    if (cfg.show_branding === false) { if (el) el.remove(); return; }
    if (!el) {
        el = document.createElement('div');
        el.id = '_ov_branding';
        // Inline styles so positioning works regardless of whether the CSS file loaded
        Object.assign(el.style, {
            position: 'fixed', bottom: '0', left: '0', right: '0', width: '100%',
            height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '10px', zIndex: '99999',
            background: 'transparent',
            fontFamily: 'Poppins, sans-serif', fontSize: '13px',
            color: 'rgba(255,255,255,.45)', letterSpacing: '.5px',
            whiteSpace: 'nowrap', overflow: 'hidden', pointerEvents: 'none',
            boxSizing: 'border-box'
        });
        document.body.appendChild(el);
    }
    el.innerHTML = `<span style="font-family:Orbitron,sans-serif;font-size:12px;font-weight:700;color:#e53e3e;letter-spacing:1.5px;white-space:nowrap">Powered by CUB SOFTWARE</span><span style="opacity:.3;flex-shrink:0">·</span><span style="font-family:Orbitron,sans-serif;font-size:12px;font-weight:700;color:#e53e3e;letter-spacing:1.5px;white-space:nowrap">https://cubsoftware.site</span>`;
}

// Aurora — CSS animated blobs (no canvas)
function _startAurora(cfg) {
    const el = document.getElementById('overlay');
    if (!el) return;
    const c1 = cfg.accent_color || '#7c3aed';
    const c2 = cfg.bg_gradient_to || '#1a0a2e';
    let auroraEl = document.getElementById('_aurora');
    if (!auroraEl) {
        auroraEl = document.createElement('div');
        auroraEl.id = '_aurora';
        el.prepend(auroraEl);
    }
    Object.assign(auroraEl.style, { position:'absolute', inset:'0', zIndex:'0', overflow:'hidden', pointerEvents:'none' });
    auroraEl.innerHTML = `
        <div style="position:absolute;width:160%;height:160%;top:-30%;left:-30%;
            background:radial-gradient(ellipse 60% 40% at 25% 50%, ${c1}55 0%, transparent 55%),
                       radial-gradient(ellipse 50% 60% at 75% 40%, ${c2}55 0%, transparent 55%),
                       radial-gradient(ellipse 40% 30% at 50% 80%, ${c1}33 0%, transparent 50%);
            animation:_auroraMove 10s ease-in-out infinite alternate;"></div>
    `;
    if (!document.getElementById('_aurora_ks')) {
        const s = document.createElement('style');
        s.id = '_aurora_ks';
        s.textContent = '@keyframes _auroraMove{from{transform:translateX(-8%) rotate(-4deg) scale(1)}to{transform:translateX(8%) rotate(4deg) scale(1.05)}}';
        document.head.appendChild(s);
    }
}

// ─── Scene Alerts Overlay ───
// Module-level cfg store so initSceneAlerts can read design options set via applyVisualFX
let _sceneAlertCfg = {};

// Call initSceneAlerts(discordUserId) from any scene source template when cfg.show_alerts is true.
// Creates a fully-styled, queued alert card that receives events from the shared alerts SSE stream.
function initSceneAlerts(discordUserId, position) {
    if (!discordUserId || window._sceneAlertsInit) return;
    window._sceneAlertsInit = true;

    const LABELS = {
        follow: 'NEW FOLLOWER', sub: 'NEW SUBSCRIBER', gift_sub: 'GIFT SUBSCRIPTION',
        bits: 'BITS / CHEER', raid: 'INCOMING RAID', points: 'CHANNEL POINTS'
    };
    const TYPE_COLORS = {
        follow: 'scene_alert_follow_color', sub: 'scene_alert_sub_color',
        gift_sub: 'scene_alert_gift_sub_color', bits: 'scene_alert_bits_color',
        raid: 'scene_alert_raid_color', points: 'scene_alert_points_color',
    };
    const TYPE_ICONS = {
        follow: '♥', sub: '★', gift_sub: '🎁', bits: '💎', raid: '⚔', points: '✦',
    };
    const ANIMS = {
        'slide-in': 'translateX(120%)', 'slide-up': 'translateY(120%)', 'slide-down': 'translateY(-120%)',
        fade: 'opacity 0.4s ease', bounce: 'scale(0.1)', pop: 'scale(0)',
        'zoom-in': 'scale(0.2)', 'glitch-in': 'skewX(20deg) scale(0.8)',
    };

    // Wrapper handles absolute positioning (including center transform); card handles animation transforms
    let cardWrap = document.getElementById('_sceneAlertWrap');
    if (!cardWrap) {
        cardWrap = document.createElement('div');
        cardWrap.id = '_sceneAlertWrap';
        Object.assign(cardWrap.style, {position:'absolute', zIndex:'9999', pointerEvents:'none'});
        (document.getElementById('overlay') || document.body).appendChild(cardWrap);
    }

    let card = document.getElementById('sceneAlertCard');
    if (!card) {
        card = document.createElement('div');
        card.id = 'sceneAlertCard';
        cardWrap.appendChild(card);
    }

    function repositionWrap() {
        _widgetPos(cardWrap, _sceneAlertCfg.scene_alert_position || position || 'top-center', '20px');
    }
    repositionWrap();

    function applyCardStyle(typeColor) {
        const c = _sceneAlertCfg;
        const accent = typeColor || c.accent_color || '#7c3aed';
        const bg = c.scene_alert_card_bg || '#0a0a1a';
        const opacity = (c.scene_alert_card_opacity ?? 92) / 100;
        const blur = c.scene_alert_card_blur ?? 8;
        const br = c.scene_alert_border_radius ?? 12;
        const bw = c.scene_alert_border_width ?? 1;
        const glow = c.scene_alert_glow ?? 20;
        const bStyle = c.scene_alert_border_style || 'solid';
        const bColor = c.scene_alert_border_color || accent;
        const minW = c.scene_alert_min_width || 320;
        const maxW = c.scene_alert_max_width || 500;
        const pad = c.scene_alert_padding || 16;

        // Parse hex to rgba
        function ha(hex, a) { const r=parseInt((hex||'#0a0a1a').slice(1,3)||'0a',16),g=parseInt((hex||'#0a0a1a').slice(3,5)||'0a',16),b=parseInt((hex||'#0a0a1a').slice(5,7)||'1a',16); return `rgba(${r},${g},${b},${a.toFixed(2)})`; }

        const bgRgba = ha(bg, opacity);
        repositionWrap();
        Object.assign(card.style, {
            display: 'block',
            minWidth: minW + 'px',
            maxWidth: maxW + 'px',
            padding: `${Math.round(pad * 0.65)}px ${pad}px`,
            borderRadius: br + 'px',
            border: `${bw}px ${bStyle} ${bColor}`,
            background: c.scene_alert_gradient_bg
                ? `linear-gradient(135deg, ${ha(bg, opacity)}, ${ha(accent, 0.3)})`
                : bgRgba,
            backdropFilter: blur > 0 ? `blur(${blur}px)` : '',
            boxShadow: glow > 0
                ? `0 0 ${glow}px ${accent}88, 0 4px 20px rgba(0,0,0,0.5)${c.scene_alert_inner_glow ? `, inset 0 0 ${glow/2}px ${accent}44` : ''}`
                : '0 4px 20px rgba(0,0,0,0.5)',
            transition: 'opacity 0.4s ease, transform 0.4s ease',
            pointerEvents: 'none',
            zIndex: '9999',
            fontFamily: `'${c.scene_alert_font || 'Orbitron'}', sans-serif`,
            textAlign: 'center',
        });
        // Shape overrides
        const st = c.scene_alert_style || 'standard';
        if (st === 'pill') { card.style.borderRadius = '999px'; card.style.padding = `${pad/2}px ${pad*1.5}px`; }
        else if (st === 'banner') { card.style.borderRadius = '0'; card.style.width = '100%'; card.style.maxWidth = '100%'; }
        else if (st === 'badge') { card.style.borderRadius = '50%'; card.style.width = maxW/4 + 'px'; card.style.height = maxW/4 + 'px'; card.style.display = 'flex'; card.style.flexDirection = 'column'; card.style.alignItems = 'center'; card.style.justifyContent = 'center'; }

        // Theme overrides (applied after base styles so they win)
        const theme = c.scene_alert_theme || 'glass';
        if (theme === 'neon') {
            Object.assign(card.style, { background:'rgba(0,0,0,0.97)', border:`2px solid ${accent}`, borderRadius:'4px', backdropFilter:'none', boxShadow:`0 0 12px ${accent}, 0 0 50px ${accent}66, inset 0 0 24px ${accent}14` });
        } else if (theme === 'retro') {
            Object.assign(card.style, { background:'#000', border:`4px solid ${accent}`, borderRadius:'0', backdropFilter:'none', boxShadow:`6px 6px 0 ${accent}`, fontFamily:"'Press Start 2P',monospace", fontSize:'10px' });
        } else if (theme === 'minimal') {
            Object.assign(card.style, { background:'transparent', border:'none', borderLeft:`4px solid ${accent}`, borderRadius:'0', backdropFilter:'none', boxShadow:'none' });
        } else if (theme === 'split') {
            Object.assign(card.style, { background:`linear-gradient(90deg,${accent} 44px,rgba(10,10,26,.94) 44px)`, border:`1px solid ${accent}66`, borderLeft:'none', borderRadius:'6px', paddingLeft:'60px' });
        } else if (theme === 'comic') {
            Object.assign(card.style, { background:'#fff', border:'3px solid #000', borderRadius:'8px', backdropFilter:'none', boxShadow:'6px 6px 0 #000', color:'#111' });
        } else if (theme === 'terminal') {
            Object.assign(card.style, { background:'rgba(0,8,0,.97)', border:'1px solid #00ff41', borderRadius:'0', backdropFilter:'none', boxShadow:'0 0 20px #00ff4133', fontFamily:"'Share Tech Mono',monospace" });
        } else if (theme === 'hologram') {
            Object.assign(card.style, { background:'rgba(0,180,255,.07)', border:'1px solid rgba(0,200,255,.55)', borderRadius:'4px', backdropFilter:'blur(14px)', boxShadow:'0 0 35px rgba(0,200,255,.25), inset 0 0 50px rgba(0,200,255,.07)' });
        } else if (theme === 'luxury') {
            Object.assign(card.style, { background:'linear-gradient(135deg,#110e00,#1e1800)', border:'1px solid #c8a84b', borderRadius:'8px', backdropFilter:'none', boxShadow:'0 0 30px rgba(200,168,75,.2)' });
        } else if (theme === 'sticker') {
            Object.assign(card.style, { background:accent, border:'3px solid rgba(255,255,255,.55)', borderRadius:'24px', backdropFilter:'none', boxShadow:'0 10px 35px rgba(0,0,0,.4)' });
        } else if (theme === 'cyberpunk') {
            Object.assign(card.style, { background:'rgba(0,0,16,.97)', border:`1px solid ${accent}`, borderTop:`3px solid ${accent}`, borderBottom:'3px solid #ff0066', borderRadius:'0', boxShadow:`0 0 25px ${accent}55`, clipPath:'polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px))' });
        } else if (theme === 'pastel') {
            Object.assign(card.style, { background:'rgba(250,240,255,.94)', border:`2px solid ${accent}88`, borderRadius:'18px', backdropFilter:'blur(6px)', boxShadow:'0 8px 30px rgba(0,0,0,.12)' });
        } else if (theme === 'dark-gamer') {
            Object.assign(card.style, { background:'rgba(4,4,12,.99)', border:'1px solid rgba(255,255,255,.06)', borderTop:`2px solid ${accent}`, borderRadius:'10px', boxShadow:`0 24px 80px rgba(0,0,0,.85), 0 0 50px ${accent}33`, backdropFilter:'blur(4px)' });
        } else if (theme === 'frosted') {
            Object.assign(card.style, { background:'rgba(255,255,255,.10)', border:'1px solid rgba(255,255,255,.22)', borderRadius:'18px', backdropFilter:'blur(22px) saturate(200%)', boxShadow:'0 8px 40px rgba(0,0,0,.35)' });
        }
    }

    function esc(s) { const d = document.createElement('div'); d.textContent = String(s || ''); return d.innerHTML; }

    function showConfetti(accent) {
        const cc = document.createElement('canvas');
        Object.assign(cc.style, {position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'9'});
        card.appendChild(cc);
        cc.width = card.offsetWidth || 400; cc.height = card.offsetHeight || 100;
        const ctx = cc.getContext('2d');
        const pieces = Array.from({length:40}, () => ({x:Math.random()*cc.width,y:-10,vx:(Math.random()-.5)*2,vy:Math.random()*1.5+0.8,r:Math.random()*4+2,c:[accent,'#ff0','#0f0','#f0f','#0ff','#f80'][Math.floor(Math.random()*6)],rot:Math.random()*360}));
        let frame = 0;
        function draw() { ctx.clearRect(0,0,cc.width,cc.height); pieces.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.rot+=1.5;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot*Math.PI/180);ctx.fillStyle=p.c;ctx.fillRect(-p.r,-p.r/2,p.r*2,p.r);ctx.restore();}); if(++frame<180) requestAnimationFrame(draw); else cc.remove(); }
        draw();
    }

    let queue = [], showing = false;

    function showNext() {
        if (!queue.length || showing) return;
        showing = true;
        const d = queue.shift();
        const c = _sceneAlertCfg;
        const typeColor = c[TYPE_COLORS[d.type]] || c.accent_color || '#7c3aed';
        const label = LABELS[d.type] || d.type.toUpperCase();
        const rawName = d.name || d.gifter || 'Someone';
        const name = esc(rawName);
        const showExtra = c.scene_alert_show_extra !== false;
        const extra = showExtra ? (
            d.type === 'bits' ? ` · ${esc(d.amount)} bits`
            : d.type === 'raid' ? ` · ${esc(d.count)} viewers`
            : d.type === 'gift_sub' ? ` · ${esc(d.count)} subs`
            : d.type === 'points' ? ` · ${esc(d.reward)}` : ''
        ) : '';
        const icon = c.scene_alert_show_icon !== false ? `<span style="margin-right:6px;opacity:0.8">${TYPE_ICONS[d.type]||''}</span>` : '';
        const labelColor = c.scene_alert_label_color || typeColor;
        const msgColor = c.scene_alert_msg_color || '#ffffff';
        const labelSize = c.scene_alert_label_size || 12;
        const msgSize = c.scene_alert_msg_size || 22;
        const msgWeight = c.scene_alert_msg_weight || '600';
        const labelTrans = c.scene_alert_label_uppercase !== false ? 'uppercase' : 'none';
        const msgItalic = c.scene_alert_msg_italic ? 'italic' : 'normal';

        applyCardStyle(typeColor);
        card.innerHTML = `<div style="font-size:${labelSize}px;color:${labelColor};letter-spacing:2px;text-transform:${labelTrans};margin-bottom:4px;font-family:'${c.scene_alert_font||'Orbitron'}',sans-serif;text-align:center;line-height:1.1">${icon}${label}</div><div style="font-size:${msgSize}px;color:${msgColor};font-weight:${msgWeight};font-style:${msgItalic};font-family:'${c.scene_alert_font||'Orbitron'}',sans-serif;text-align:center;line-height:1.1">${name}${extra}</div>${c.scene_alert_progress_bar ? `<div style="margin-top:8px;height:3px;background:${typeColor}33;border-radius:2px;overflow:hidden"><div style="height:100%;background:${typeColor};animation:_saPbAnim ${c.scene_alert_duration||5}s linear forwards" id="_saPb"></div></div>` : ''}`;

        // Inject all keyframes once
        if (!document.getElementById('_saKf')) {
            const ks = document.createElement('style'); ks.id = '_saKf';
            ks.textContent = `
                @keyframes _saSlideR{from{transform:translateX(110%);opacity:0}to{transform:none;opacity:1}}
                @keyframes _saSlideL{from{transform:translateX(-110%);opacity:0}to{transform:none;opacity:1}}
                @keyframes _saSlideU{from{transform:translateY(80%);opacity:0}to{transform:none;opacity:1}}
                @keyframes _saSlideD{from{transform:translateY(-80%);opacity:0}to{transform:none;opacity:1}}
                @keyframes _saFade{from{opacity:0}to{opacity:1}}
                @keyframes _saBounce{0%{transform:scale(.1);opacity:0}55%{transform:scale(1.12);opacity:1}75%{transform:scale(.95)}90%{transform:scale(1.04)}100%{transform:none;opacity:1}}
                @keyframes _saPop{0%{transform:scale(0);opacity:0}65%{transform:scale(1.18);opacity:1}85%{transform:scale(.94)}100%{transform:none;opacity:1}}
                @keyframes _saZoom{0%{transform:scale(.2);opacity:0}70%{transform:scale(1.06);opacity:1}100%{transform:none;opacity:1}}
                @keyframes _saGlitch{0%{opacity:0;transform:translateX(-8px) skewX(-10deg);filter:hue-rotate(90deg)}20%{opacity:1;transform:translateX(6px) skewX(5deg);filter:hue-rotate(-45deg)}40%{transform:translateX(-4px) skewX(-2deg)}60%{transform:translateX(2px)}80%{transform:translateX(-1px)}100%{transform:none;filter:none;opacity:1}}
                @keyframes _saShake{0%{transform:translateX(-40px);opacity:0}20%{transform:translateX(30px);opacity:1}40%{transform:translateX(-20px)}60%{transform:translateX(12px)}80%{transform:translateX(-6px)}100%{transform:none;opacity:1}}
                @keyframes _saFloat{from{transform:translateY(18px);opacity:0}to{transform:none;opacity:1}}
                @keyframes _saFlip{from{transform:perspective(600px) rotateY(90deg);opacity:0}to{transform:perspective(600px) rotateY(0);opacity:1}}
                @keyframes _saElastic{0%{transform:scaleX(0);opacity:0}50%{transform:scaleX(1.15);opacity:1}70%{transform:scaleX(.95)}85%{transform:scaleX(1.05)}100%{transform:none;opacity:1}}
                @keyframes _saSpiral{0%{transform:rotate(-360deg) scale(0);opacity:0}65%{transform:rotate(15deg) scale(1.05);opacity:1}100%{transform:none;opacity:1}}
                @keyframes _saNeon{0%{opacity:0}10%{opacity:1}15%{opacity:.1}20%{opacity:1}30%{opacity:.5}40%{opacity:1;filter:brightness(2)}70%{filter:brightness(1.4)}100%{opacity:1;filter:none}}
                @keyframes _saSweep{from{opacity:0;transform:skewX(-15deg) translateX(-60px)}to{opacity:1;transform:none}}
                @keyframes _saExitR{from{transform:none;opacity:1}to{transform:translateX(110%);opacity:0}}
                @keyframes _saExitL{from{transform:none;opacity:1}to{transform:translateX(-110%);opacity:0}}
                @keyframes _saExitU{from{transform:none;opacity:1}to{transform:translateY(-80%);opacity:0}}
                @keyframes _saExitD{from{transform:none;opacity:1}to{transform:translateY(80%);opacity:0}}
                @keyframes _saExitFade{from{opacity:1;transform:none}to{opacity:0;transform:scale(.9)}}
                @keyframes _saExitShrink{from{opacity:1;transform:none}to{opacity:0;transform:scale(0)}}
                @keyframes _saExitFlip{from{opacity:1;transform:none}to{opacity:0;transform:perspective(600px) rotateY(90deg)}}
                @keyframes _saExitDissolve{from{opacity:1;filter:none}to{opacity:0;filter:blur(12px)}}
                @keyframes _saExitBounce{0%{transform:none;opacity:1}40%{transform:scale(1.15)}60%{transform:scale(.85)}80%{transform:scale(1.05)}100%{transform:scale(0);opacity:0}}
                @keyframes _saExitGlitch{0%{transform:none;opacity:1;filter:none}20%{transform:translateX(8px) skewX(10deg);filter:hue-rotate(90deg)}40%{transform:translateX(-6px) skewX(-6deg);filter:hue-rotate(-45deg)}60%{transform:translateX(4px);opacity:.6}80%{transform:translateX(-2px);opacity:.3}100%{transform:none;opacity:0;filter:none}}
                @keyframes _saExitSpiral{from{transform:none;opacity:1}to{transform:rotate(360deg) scale(0);opacity:0}}
                @keyframes _saExitSweep{from{transform:none;opacity:1}to{transform:skewX(15deg) translateX(80px);opacity:0}}
                @keyframes _saExitZoom{from{transform:none;opacity:1}to{transform:scale(2);opacity:0}}
                @keyframes _saPbAnim{from{width:100%}to{width:0%}}
            `;
            document.head.appendChild(ks);
        }

        // Entry animation via @keyframes — each type is truly distinct
        const anim = c.scene_alert_animation || 'slide-in';
        const ENTRY_ANIMS = {
            'slide-in':  '_saSlideR .5s cubic-bezier(.22,1,.36,1) forwards',
            'slide-up':  '_saSlideU .5s cubic-bezier(.22,1,.36,1) forwards',
            'slide-down':'_saSlideD .5s cubic-bezier(.22,1,.36,1) forwards',
            'fade':      '_saFade .45s ease forwards',
            'bounce':    '_saBounce .65s cubic-bezier(.36,.07,.19,.97) forwards',
            'pop':       '_saPop .55s cubic-bezier(.36,.07,.19,.97) forwards',
            'zoom-in':   '_saZoom .5s cubic-bezier(.17,.67,.35,1.3) forwards',
            'glitch-in': '_saGlitch .55s steps(1) forwards',
            'shake-in':  '_saShake .6s ease forwards',
            'float-in':  '_saFloat .6s ease forwards',
            'flip-x':    '_saFlip .6s ease forwards',
            'elastic':   '_saElastic .7s cubic-bezier(.36,.07,.19,.97) forwards',
            'spiral-in': '_saSpiral .8s ease forwards',
            'neon-flash':'_saNeon .8s steps(1) forwards',
            'sweep-up':  '_saSweep .5s cubic-bezier(.22,1,.36,1) forwards',
        };
        const EXIT_ANIMS = {
            'slide-out':   '_saExitR .4s ease forwards',
            'slide-left':  '_saExitL .4s ease forwards',
            'slide-up':    '_saExitU .4s ease forwards',
            'slide-down':  '_saExitD .4s ease forwards',
            'fade-out':    '_saExitFade .4s ease forwards',
            'shrink':      '_saExitShrink .35s ease forwards',
            'flip-out':    '_saExitFlip .4s ease forwards',
            'dissolve':    '_saExitDissolve .45s ease forwards',
            'bounce-out':  '_saExitBounce .55s ease forwards',
            'glitch-out':  '_saExitGlitch .5s steps(1) forwards',
            'spiral-out':  '_saExitSpiral .6s ease forwards',
            'sweep-out':   '_saExitSweep .4s cubic-bezier(.22,1,.36,1) forwards',
            'zoom-out':    '_saExitZoom .4s ease forwards',
        };

        // Reset, then trigger — double rAF ensures browser paints opacity:0 before animating
        card.style.transition = 'none';
        card.style.animation = 'none';
        card.style.opacity = '0';
        requestAnimationFrame(() => requestAnimationFrame(() => {
            card.style.animation = ENTRY_ANIMS[anim] || ENTRY_ANIMS['slide-in'];
        }));

        if (c.scene_alert_confetti) showConfetti(typeColor);

        const dur = (c.scene_alert_duration || 5) * 1000;
        setTimeout(() => {
            const exitAnim = c.scene_alert_exit || 'slide-out';
            card.style.animation = EXIT_ANIMS[exitAnim] || EXIT_ANIMS['slide-out'];
            setTimeout(() => { card.style.opacity = '0'; card.style.animation = ''; showing = false; showNext(); }, 450);
        }, dur);
    }

    // Start from now so reconnects don't replay previously-seen alerts
    let lastTs = Math.floor(Date.now() / 1000);
    function connect() {
        const es = new EventSource('/overlays/alerts/' + discordUserId + '/events?since=' + lastTs);
        es.onmessage = e => {
            try {
                const m = JSON.parse(e.data);
                if (m.type === 'alert') {
                    if (m.ts) lastTs = m.ts;
                    queue.push(m.data);
                    if (!showing) showNext();
                }
            } catch (_) {}
        };
        es.onerror = () => { es.close(); setTimeout(connect, 3000); };
    }
    connect();
}

// ─── New Canvas Background Effects ───

function _startParticleWeb(W, H, accent) {
    const pts = Array.from({length:80}, () => ({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.4,vy:(Math.random()-.5)*.4}));
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    function draw() {
        _bgCtx.clearRect(0,0,W,H);
        for (let i=0;i<pts.length;i++) {
            pts[i].x+=pts[i].vx*_bgSpeed; pts[i].y+=pts[i].vy*_bgSpeed;
            if(pts[i].x<0)pts[i].x=W; if(pts[i].x>W)pts[i].x=0;
            if(pts[i].y<0)pts[i].y=H; if(pts[i].y>H)pts[i].y=0;
            for (let j=i+1;j<pts.length;j++) {
                const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=Math.sqrt(dx*dx+dy*dy);
                if (d<160) { _bgCtx.strokeStyle=`rgba(${r},${g},${b},${(1-d/160)*.35})`; _bgCtx.lineWidth=0.8; _bgCtx.beginPath(); _bgCtx.moveTo(pts[i].x,pts[i].y); _bgCtx.lineTo(pts[j].x,pts[j].y); _bgCtx.stroke(); }
            }
            _bgCtx.beginPath(); _bgCtx.arc(pts[i].x,pts[i].y,1.5,0,Math.PI*2); _bgCtx.fillStyle=`rgba(${r},${g},${b},.7)`; _bgCtx.fill();
        }
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

function _startBubbles(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const bubs = Array.from({length:30}, () => ({x:Math.random()*W,y:H+60,r:10+Math.random()*50,vy:-.2-Math.random()*.4,a:Math.random()*.25+.05}));
    function draw() {
        _bgCtx.clearRect(0,0,W,H);
        bubs.forEach(b2 => {
            b2.y+=b2.vy*_bgSpeed; if(b2.y+b2.r<0){b2.y=H+60;b2.x=Math.random()*W;}
            _bgCtx.beginPath(); _bgCtx.arc(b2.x,b2.y,b2.r,0,Math.PI*2);
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},${b2.a*1.5})`; _bgCtx.lineWidth=1.5; _bgCtx.stroke();
            _bgCtx.fillStyle=`rgba(${r},${g},${b},${b2.a*.4})`; _bgCtx.fill();
        });
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

function _startGeometric(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const shapes = Array.from({length:12}, () => ({x:Math.random()*W,y:Math.random()*H,s:40+Math.random()*100,sides:3+Math.floor(Math.random()*5),rot:Math.random()*Math.PI*2,vr:.003+Math.random()*.006,a:.04+Math.random()*.08}));
    function poly(ctx,x,y,s,n,rot){ctx.beginPath();for(let i=0;i<n;i++){const a=rot+i*Math.PI*2/n;i===0?ctx.moveTo(x+s*Math.cos(a),y+s*Math.sin(a)):ctx.lineTo(x+s*Math.cos(a),y+s*Math.sin(a));}ctx.closePath();}
    function draw() {
        _bgCtx.clearRect(0,0,W,H);
        shapes.forEach(sh => {
            sh.rot+=sh.vr*_bgSpeed;
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},${sh.a*2})`; _bgCtx.lineWidth=1.5;
            _bgCtx.fillStyle=`rgba(${r},${g},${b},${sh.a*.5})`;
            poly(_bgCtx,sh.x,sh.y,sh.s,sh.sides,sh.rot); _bgCtx.fill(); _bgCtx.stroke();
        });
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

function _startVortex(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const pts = Array.from({length:200}, (_, i) => ({angle:i*0.2,radius:i*4,speed:.008+i*.00005}));
    function draw() {
        _bgCtx.clearRect(0,0,W,H);
        pts.forEach(p => {
            p.angle+=p.speed*_bgSpeed; p.radius=Math.max(0,p.radius*.999);
            if(p.radius<2){p.radius=400+Math.random()*200;p.angle=Math.random()*Math.PI*2;}
            const x=W/2+Math.cos(p.angle)*p.radius, y=H/2+Math.sin(p.angle)*p.radius;
            const a=Math.max(0, .5-p.radius/700);
            _bgCtx.beginPath(); _bgCtx.arc(x,y,1.2,0,Math.PI*2); _bgCtx.fillStyle=`rgba(${r},${g},${b},${a})`; _bgCtx.fill();
        });
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

function _startCircuit(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const step=60, nodes=[];
    for(let x=step;x<W;x+=step) for(let y=step;y<H;y+=step) if(Math.random()>.6) nodes.push({x,y});
    const lines=[];
    nodes.forEach(n=>{const nb=nodes.filter(m=>Math.abs(m.x-n.x)+Math.abs(m.y-n.y)===step&&Math.random()>.4);nb.forEach(m=>lines.push([n,m]));});
    let t=0;
    function draw() {
        _bgCtx.clearRect(0,0,W,H); t+=0.8*_bgSpeed;
        lines.forEach(([a2,b2],i) => {
            const phase=(t+i*3)%120, prog=phase/120;
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},.12)`; _bgCtx.lineWidth=1; _bgCtx.beginPath(); _bgCtx.moveTo(a2.x,a2.y); _bgCtx.lineTo(b2.x,b2.y); _bgCtx.stroke();
            if(prog<1){const px=a2.x+(b2.x-a2.x)*prog,py=a2.y+(b2.y-a2.y)*prog;_bgCtx.beginPath();_bgCtx.arc(px,py,3,0,Math.PI*2);_bgCtx.fillStyle=`rgba(${r},${g},${b},.9)`;_bgCtx.fill();}
        });
        nodes.forEach(n=>{_bgCtx.beginPath();_bgCtx.arc(n.x,n.y,2.5,0,Math.PI*2);_bgCtx.fillStyle=`rgba(${r},${g},${b},.4)`;_bgCtx.fill();});
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

function _startSmoke(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const particles=Array.from({length:40},()=>({x:W*.3+Math.random()*W*.4,y:H,vx:(Math.random()-.5)*.4,vy:-.3-Math.random()*.6,r:30+Math.random()*60,a:.05+Math.random()*.08,da:-.0004-Math.random()*.0003}));
    function draw() {
        _bgCtx.clearRect(0,0,W,H);
        particles.forEach(p=>{
            p.x+=p.vx*_bgSpeed;p.y+=p.vy*_bgSpeed;p.r+=.5*_bgSpeed;p.a+=p.da*_bgSpeed;p.vx+=(Math.random()-.5)*.05;
            if(p.a<=0||p.y<-p.r){p.y=H+50;p.x=W*.2+Math.random()*W*.6;p.r=30+Math.random()*40;p.a=.05+Math.random()*.06;p.vx=(Math.random()-.5)*.4;p.vy=-.3-Math.random()*.5;}
            const g2=_bgCtx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
            g2.addColorStop(0,`rgba(${r},${g},${b},${p.a})`);g2.addColorStop(1,`rgba(${r},${g},${b},0)`);
            _bgCtx.beginPath();_bgCtx.arc(p.x,p.y,p.r,0,Math.PI*2);_bgCtx.fillStyle=g2;_bgCtx.fill();
        });
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

function _startFireflies(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const flies=Array.from({length:50},()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.6,vy:(Math.random()-.5)*.6,phase:Math.random()*Math.PI*2,freq:.02+Math.random()*.04}));
    function draw() {
        _bgCtx.clearRect(0,0,W,H);
        flies.forEach(f=>{
            f.x+=(f.vx+(Math.random()-.5)*.3)*_bgSpeed;f.y+=(f.vy+(Math.random()-.5)*.3)*_bgSpeed;f.phase+=f.freq*_bgSpeed;
            if(f.x<0)f.x=W;if(f.x>W)f.x=0;if(f.y<0)f.y=H;if(f.y>H)f.y=0;
            const bright=(.5+.5*Math.sin(f.phase));
            const grd=_bgCtx.createRadialGradient(f.x,f.y,0,f.x,f.y,12);
            grd.addColorStop(0,`rgba(${r},${g},${b},${bright*.9})`);grd.addColorStop(1,`rgba(${r},${g},${b},0)`);
            _bgCtx.beginPath();_bgCtx.arc(f.x,f.y,12,0,Math.PI*2);_bgCtx.fillStyle=grd;_bgCtx.fill();
            _bgCtx.beginPath();_bgCtx.arc(f.x,f.y,2,0,Math.PI*2);_bgCtx.fillStyle=`rgba(255,255,255,${bright*.8})`;_bgCtx.fill();
        });
        _bgAnimId = requestAnimationFrame(draw);
    }
    draw();
}

// ─── Visual Effects (color grading, film grain, bloom, bg image) ───
function applyVisualFX(cfg, el) {
    if (!el) return;
    _sceneAlertCfg = cfg; // Share cfg with initSceneAlerts for card styling
    // Reposition alert wrap immediately whenever config updates
    const _sceneAlertWrap = document.getElementById('_sceneAlertWrap');
    if (_sceneAlertWrap) _widgetPos(_sceneAlertWrap, cfg.scene_alert_position || 'top-center', '20px');
    // Background image
    if (cfg.bg_image_url) {
        const fit = cfg.bg_image_fit || 'cover';
        el.style.backgroundImage = `url('${cfg.bg_image_url}')`;
        el.style.backgroundSize = fit === 'tile' ? 'auto' : (fit === 'contain' ? 'contain' : 'cover');
        el.style.backgroundRepeat = fit === 'tile' ? 'repeat' : 'no-repeat';
        el.style.backgroundPosition = 'center';
        // Dim overlay for bg_image_opacity
        let imgDim = document.getElementById('_bg_img_dim');
        const imgOp = (cfg.bg_image_opacity ?? 100) / 100;
        if (imgOp < 0.99) {
            if (!imgDim) {
                imgDim = document.createElement('div');
                imgDim.id = '_bg_img_dim';
                Object.assign(imgDim.style, {position:'absolute',inset:'0',zIndex:'0',pointerEvents:'none',transition:'background .3s'});
                el.insertBefore(imgDim, el.firstChild);
            }
            imgDim.style.background = `rgba(0,0,0,${(1 - imgOp).toFixed(2)})`;
        } else if (imgDim) { imgDim.remove(); }
    } else {
        el.style.backgroundImage = '';
        const imgDim = document.getElementById('_bg_img_dim');
        if (imgDim) imgDim.remove();
    }
    // Background image blur — render image in a separate blurred div
    const _bgBlurAmt = parseFloat(cfg.bg_image_blur) || 0;
    let _bgBlurDiv = document.getElementById('_bg_img_blur');
    if (cfg.bg_image_url && _bgBlurAmt > 0) {
        el.style.backgroundImage = ''; // move to blur div
        if (!_bgBlurDiv) {
            _bgBlurDiv = document.createElement('div');
            _bgBlurDiv.id = '_bg_img_blur';
            Object.assign(_bgBlurDiv.style, { position:'absolute', inset:'0', zIndex:'0', pointerEvents:'none' });
            el.insertBefore(_bgBlurDiv, el.firstChild);
        }
        const _bfit = cfg.bg_image_fit || 'cover';
        _bgBlurDiv.style.backgroundImage = `url('${cfg.bg_image_url}')`;
        _bgBlurDiv.style.backgroundSize = _bfit === 'tile' ? 'auto' : _bfit === 'contain' ? 'contain' : 'cover';
        _bgBlurDiv.style.backgroundRepeat = _bfit === 'tile' ? 'repeat' : 'no-repeat';
        _bgBlurDiv.style.backgroundPosition = (cfg.bg_image_position || 'center').replace('-', ' ');
        _bgBlurDiv.style.filter = `blur(${_bgBlurAmt}px)`;
        _bgBlurDiv.style.transform = 'scale(1.05)';
        _bgBlurDiv.style.transformOrigin = 'center';
    } else if (_bgBlurDiv) { _bgBlurDiv.remove(); }
    // Font weight
    const fw = cfg.font_weight || '700';
    el.style.setProperty('--font-weight', fw);
    el.querySelectorAll('.scene-title,.scene-subtitle').forEach(e => e.style.fontWeight = fw);
    // CSS Filter: color grading + bloom + contrast/brightness/saturation
    const hue = parseFloat(cfg.color_grading) || 0;
    const bloom = cfg.bloom_glow ? 'brightness(1.08) saturate(1.2)' : '';
    const contrast = cfg.contrast && cfg.contrast !== 100 ? `contrast(${cfg.contrast}%)` : '';
    const brightness = cfg.brightness && cfg.brightness !== 100 ? `brightness(${cfg.brightness}%)` : '';
    const saturation = cfg.saturation && cfg.saturation !== 100 ? `saturate(${cfg.saturation}%)` : '';
    el.style.filter = [hue !== 0 ? `hue-rotate(${hue}deg)` : '', contrast, brightness, saturation, bloom].filter(Boolean).join(' ') || '';
    // Film grain
    let grain = document.getElementById('_film_grain');
    if (cfg.film_grain) {
        if (!grain) {
            grain = document.createElement('canvas');
            grain.id = '_film_grain';
            Object.assign(grain.style, {position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'9',pointerEvents:'none',opacity:'.18',mixBlendMode:'overlay'});
            el.appendChild(grain);
        }
        grain.width = 320; grain.height = 180;
        const gctx = grain.getContext('2d');
        function drawGrain() {
            const d = gctx.createImageData(320,180);
            for (let i=0;i<d.data.length;i+=4){const v=Math.random()*255;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}
            gctx.putImageData(d,0,0);
            requestAnimationFrame(drawGrain);
        }
        if (!grain._running) { grain._running=true; drawGrain(); }
    } else if (grain) { grain.remove(); }
    // Vignette
    let vig = document.getElementById('_vignette');
    const vigAmt = parseFloat(cfg.vignette) || 0;
    if (vigAmt > 0) {
        if (!vig) {
            vig = document.createElement('div');
            vig.id = '_vignette';
            Object.assign(vig.style, {position:'absolute',inset:'0',zIndex:'8',pointerEvents:'none'});
            el.appendChild(vig);
        }
        const vigAlpha = Math.min(0.95, vigAmt / 100 * 0.92).toFixed(2);
        vig.style.background = `radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${vigAlpha}) 100%)`;
    } else if (vig) { vig.remove(); }
    // Border frame
    const frame = cfg.border_frame || 'none';
    const accent = cfg.accent_color || '#7c3aed';
    if (frame === 'simple') {
        el.style.outline = `2px solid ${accent}`;
        el.style.outlineOffset = '-2px';
        el.style.boxShadow = '';
    } else if (frame === 'glow') {
        el.style.outline = `2px solid ${accent}`;
        el.style.outlineOffset = '-2px';
        el.style.boxShadow = `inset 0 0 40px ${accent}44, inset 0 0 80px ${accent}22`;
    } else if (frame === 'double') {
        el.style.outline = `4px double ${accent}`;
        el.style.outlineOffset = '-4px';
        el.style.boxShadow = '';
    } else if (frame === 'neon') {
        el.style.outline = `2px solid ${accent}`;
        el.style.outlineOffset = '-2px';
        el.style.boxShadow = `0 0 20px ${accent}88, inset 0 0 20px ${accent}33, 0 0 60px ${accent}44`;
    } else {
        el.style.outline = '';
        el.style.boxShadow = '';
    }
    // Text shadow + glow (combined)
    const tShadow = parseFloat(cfg.text_shadow) || 0;
    const tGlow = parseFloat(cfg.text_glow) || 0;
    const glowAccent = cfg.accent_color || '#7c3aed';
    el.querySelectorAll('.scene-title,.scene-subtitle').forEach(e => {
        const shadowPart = tShadow > 0 ? `0 2px ${Math.round(tShadow/6)}px rgba(0,0,0,${Math.min(0.9,tShadow/100).toFixed(2)})` : '';
        const glowPart = tGlow > 0 ? `0 0 ${Math.round(tGlow/5)+4}px ${glowAccent}cc, 0 0 ${Math.round(tGlow/2)+8}px ${glowAccent}55` : '';
        e.style.textShadow = [shadowPart, glowPart].filter(Boolean).join(', ');
    });
    // Background effect opacity
    const bgEffCanvas = document.getElementById('bg-effects');
    if (bgEffCanvas) bgEffCanvas.style.opacity = ((cfg.bg_effect_opacity ?? 80) / 100).toFixed(2);

    // Colour overlay
    let colorOv = document.getElementById('_color_overlay');
    if (cfg.overlay_color) {
        if (!colorOv) { colorOv=document.createElement('div');colorOv.id='_color_overlay';Object.assign(colorOv.style,{position:'absolute',inset:'0',zIndex:'1',pointerEvents:'none'});el.appendChild(colorOv); }
        const opa = (cfg.overlay_opacity ?? 20) / 100;
        colorOv.style.background = cfg.overlay_color;
        colorOv.style.opacity = opa.toFixed(2);
        colorOv.style.mixBlendMode = cfg.overlay_blend_mode || 'normal';
    } else if (colorOv) colorOv.remove();

    // Scanlines
    let sl = document.getElementById('_scanlines');
    if (cfg.scanlines) {
        if (!sl) { sl=document.createElement('div');sl.id='_scanlines';Object.assign(sl.style,{position:'absolute',inset:'0',zIndex:'9',pointerEvents:'none'});el.appendChild(sl); }
        const sop = (cfg.scanline_opacity ?? 20) / 100;
        sl.style.background = `repeating-linear-gradient(0deg,rgba(0,0,0,${sop}) 0px,rgba(0,0,0,${sop}) 1px,transparent 1px,transparent 3px)`;
    } else if (sl) sl.remove();

    // Video background
    if (cfg.background_type === 'video' && cfg.bg_video_url) {
        let vid = document.getElementById('_bg_video');
        if (!vid || vid.src !== cfg.bg_video_url) {
            if (vid) vid.remove();
            vid = document.createElement('video');
            vid.id = '_bg_video';
            vid.src = cfg.bg_video_url;
            vid.autoplay = vid.loop = vid.muted = true;
            vid.playsInline = true;
            Object.assign(vid.style, {position:'absolute',inset:'0',width:'100%',height:'100%',objectFit:'cover',zIndex:'-1'});
            el.insertBefore(vid, el.firstChild);
            vid.play().catch(()=>{});
        }
    } else { const vid=document.getElementById('_bg_video'); if(vid) vid.remove(); }

    // Mesh gradient
    if (cfg.background_type === 'mesh-gradient') {
        const c1=cfg.bg_mesh_color_1||'#7c3aed',c2=cfg.bg_mesh_color_2||'#0ea5e9',c3=cfg.bg_mesh_color_3||'#f59e0b',c4=cfg.bg_mesh_color_4||'#10b981';
        el.style.backgroundImage = `radial-gradient(at 0% 0%, ${c1} 0px, transparent 60%), radial-gradient(at 100% 0%, ${c2} 0px, transparent 60%), radial-gradient(at 100% 100%, ${c3} 0px, transparent 60%), radial-gradient(at 0% 100%, ${c4} 0px, transparent 60%)`;
        el.style.backgroundSize = '100% 100%';
    }

    // Scene opacity
    el.style.opacity = (cfg.scene_opacity !== undefined && cfg.scene_opacity < 100) ? (cfg.scene_opacity / 100).toFixed(2) : '';

    // Content alignment (horizontal)
    const contentAlignEl = el.querySelector('.overlay-content,.scene-content,.overlay-text');
    if (contentAlignEl) {
        const ca = cfg.content_align || 'center';
        contentAlignEl.style.textAlign = ca;
        contentAlignEl.style.alignItems = ca === 'left' ? 'flex-start' : ca === 'right' ? 'flex-end' : 'center';
    }
    // Content vertical position — shift .scene-card / main content block vertically
    const cv = cfg.content_vertical || 'center';
    el.style.alignItems = cv === 'top' ? 'flex-start' : cv === 'bottom' ? 'flex-end' : 'center';
    if (cv === 'top') el.style.paddingTop = '60px';
    else if (cv === 'bottom') el.style.paddingBottom = '60px';
    else { el.style.paddingTop = ''; el.style.paddingBottom = ''; }

    // Letter spacing
    const ls = parseFloat(cfg.letter_spacing) || 0;
    el.querySelectorAll('.scene-title,.scene-subtitle').forEach(e => { e.style.letterSpacing = ls > 0 ? ls + 'px' : ''; });

    // Line height
    const tlh = parseFloat(cfg.title_line_height) || 0;
    const slh = parseFloat(cfg.subtitle_line_height) || 0;
    el.querySelectorAll('.scene-title').forEach(e => { e.style.lineHeight = tlh >= 0.8 ? String(tlh) : ''; });
    el.querySelectorAll('.scene-subtitle').forEach(e => { e.style.lineHeight = slh >= 0.8 ? String(slh) : ''; });

    // Title uppercase
    el.querySelectorAll('.scene-title').forEach(e => { e.style.textTransform = cfg.title_uppercase ? 'uppercase' : ''; });

    // Font size overrides
    const tfs = parseInt(cfg.title_font_size) || 0;
    const sfs = parseInt(cfg.subtitle_font_size) || 0;
    el.querySelectorAll('.scene-title').forEach(e => { e.style.fontSize = tfs > 0 ? tfs + 'px' : ''; });
    el.querySelectorAll('.scene-subtitle').forEach(e => { e.style.fontSize = sfs > 0 ? sfs + 'px' : ''; });

    // Logo size/opacity
    const logoImgEl = el.querySelector('img.overlay-logo,img.scene-logo,.overlay-logo img,.scene-logo img,.logo-image');
    if (logoImgEl) {
        const lsz = parseInt(cfg.logo_size) || 100;
        logoImgEl.style.transform = lsz !== 100 ? `scale(${lsz / 100})` : '';
        logoImgEl.style.opacity = (cfg.logo_opacity !== undefined && cfg.logo_opacity < 100) ? (cfg.logo_opacity / 100).toFixed(2) : '';
    }
    // Logo position override
    const logoWrap = el.querySelector('.overlay-logo-wrap,.scene-logo-wrap,.logo-wrap');
    if (logoWrap && cfg.logo_position && cfg.logo_position !== 'default') {
        const posMap = {
            'top-left':      {top:'20px',left:'20px',bottom:'',right:'',transform:''},
            'top-center':    {top:'20px',left:'50%',bottom:'',right:'',transform:'translateX(-50%)'},
            'top-right':     {top:'20px',right:'20px',bottom:'',left:'',transform:''},
            'center':        {top:'50%',left:'50%',bottom:'',right:'',transform:'translate(-50%,-50%)'},
            'bottom-left':   {bottom:'20px',left:'20px',top:'',right:'',transform:''},
            'bottom-center': {bottom:'20px',left:'50%',top:'',right:'',transform:'translateX(-50%)'},
            'bottom-right':  {bottom:'20px',right:'20px',top:'',left:'',transform:''},
        };
        const pos = posMap[cfg.logo_position];
        if (pos) { logoWrap.style.position = 'absolute'; Object.assign(logoWrap.style, pos); }
    }

    // Corner arrows — show only when explicitly enabled
    el.classList.toggle('ov-frame-show', !!cfg.show_corners);
    el.classList.toggle('ov-frame-hide', !cfg.show_corners);

    // Border width + border radius
    const bw = parseInt(cfg.border_width) || 2;
    const bRadius = parseInt(cfg.border_radius) || 0;
    if (cfg.border_frame && cfg.border_frame !== 'none') { el.style.outlineWidth = bw + 'px'; }
    el.style.borderRadius = bRadius > 0 ? bRadius + 'px' : '';

    // Background image position
    if (cfg.bg_image_url && cfg.bg_image_position) {
        el.style.backgroundPosition = cfg.bg_image_position.replace('-', ' ');
    }

    // 3-color gradient mid-stop
    if ((cfg.background_type === 'gradient' || cfg.background_type === 'animated-gradient') && cfg.bg_gradient_mid) {
        const gFrom = cfg.bg_gradient_from || '#0a0a1a';
        const gMid = cfg.bg_gradient_mid;
        const gTo = cfg.bg_gradient_to || '#1a0a2e';
        const gAngle = cfg.bg_gradient_angle || 135;
        el.style.backgroundImage = `linear-gradient(${gAngle}deg, ${gFrom}, ${gMid}, ${gTo})`;
    }

    // Radial gradient background
    if (cfg.background_type === 'radial-gradient') {
        const rFrom = cfg.bg_gradient_from || '#0a0a1a';
        const rTo = cfg.bg_gradient_to || '#1a0a2e';
        el.style.backgroundImage = `radial-gradient(ellipse at center, ${rFrom}, ${rTo})`;
        el.style.backgroundSize = '';
    }

    // Background pattern overlay
    let bgPat = document.getElementById('_bg_pattern');
    if (cfg.bg_pattern && cfg.bg_pattern !== 'none') {
        if (!bgPat) { bgPat=document.createElement('div');bgPat.id='_bg_pattern';Object.assign(bgPat.style,{position:'absolute',inset:'0',zIndex:'0',pointerEvents:'none'});el.insertBefore(bgPat, el.firstChild); }
        const pc = cfg.bg_pattern_color || '#ffffff';
        const po = (cfg.bg_pattern_opacity ?? 15) / 100;
        const ps = (parseInt(cfg.bg_pattern_size) || 20) + 'px';
        function _hexToRgba(hex, a) { const r=parseInt(hex.slice(1,3)||'ff',16),g=parseInt(hex.slice(3,5)||'ff',16),b=parseInt(hex.slice(5,7)||'ff',16); return `rgba(${r},${g},${b},${a.toFixed(2)})`; }
        const rgba = _hexToRgba(pc.length===7?pc:'#ffffff', po);
        const patCSS = {
            dots:     `radial-gradient(circle, ${rgba} 1px, transparent 1px)`,
            grid:     `linear-gradient(${rgba} 1px, transparent 1px), linear-gradient(90deg, ${rgba} 1px, transparent 1px)`,
            lines:    `repeating-linear-gradient(0deg, ${rgba} 0px, ${rgba} 1px, transparent 1px, transparent ${ps})`,
            hexagons: `radial-gradient(circle at 50% 50%, ${rgba} 2px, transparent 2px)`,
            diagonal: `repeating-linear-gradient(45deg, ${rgba} 0, ${rgba} 1px, transparent 0, transparent 50%)`,
            crosses:  `repeating-linear-gradient(0deg, ${rgba} 0, ${rgba} 1px, transparent 1px, transparent ${ps}), repeating-linear-gradient(90deg, ${rgba} 0, ${rgba} 1px, transparent 1px, transparent ${ps})`,
        };
        bgPat.style.backgroundImage = patCSS[cfg.bg_pattern] || '';
        bgPat.style.backgroundSize = ps + ' ' + ps;
    } else if (bgPat) bgPat.remove();

    // Noise texture overlay (SVG fractalNoise)
    let noiseEl = document.getElementById('_noise_overlay');
    if (cfg.noise_overlay) {
        if (!noiseEl) {
            noiseEl = document.createElement('div');
            noiseEl.id = '_noise_overlay';
            Object.assign(noiseEl.style, {position:'absolute',inset:'0',zIndex:'8',pointerEvents:'none',mixBlendMode:'overlay'});
            el.appendChild(noiseEl);
        }
        noiseEl.style.opacity = ((cfg.noise_opacity ?? 15) / 100).toFixed(2);
        noiseEl.style.backgroundImage = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
        noiseEl.style.backgroundSize = '200px 200px';
    } else if (noiseEl) noiseEl.remove();

    // Uptime widget (bundled here to avoid updating every scene template)
    applyUptime(cfg);
    // New widgets
    applyTicker(cfg);
    applyNowPlaying(cfg);
    applyCounterWidget(cfg);
    applyQrWidget(cfg);
    applyLastfm(cfg);
    // Background music
    applyBgMusic(cfg);
}

// ─── Background Music ───
function _extractYouTubeId(url) {
    const m = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
}

// True only when running inside OBS browser source
const _isOBS = /OBS\/|OBSBrowser/i.test(navigator.userAgent);

function applyBgMusic(cfg) {
    const url = cfg.bg_music_url || '';

    // Remove any existing music elements when URL changes or is cleared
    const existing = document.getElementById('_bg_music');
    const existingYt = document.getElementById('_bg_music_yt');
    const existingSrc = existing ? existing.dataset.src : (existingYt ? existingYt.dataset.src : '');

    if (!url || !_isOBS) {
        if (existing) { existing.pause(); existing.src = ''; existing.remove(); }
        if (existingYt) existingYt.remove();
        return;
    }

    const ytId = _extractYouTubeId(url);

    if (ytId) {
        // YouTube embed approach
        if (existing) { existing.pause(); existing.src = ''; existing.remove(); }
        if (existingSrc === url && existingYt) return; // already playing
        if (existingYt) existingYt.remove();

        const vol = Math.round((cfg.bg_music_volume ?? 50));
        const loop = cfg.bg_music_loop !== false ? 1 : 0;
        const yt = document.createElement('iframe');
        yt.id = '_bg_music_yt';
        yt.dataset.src = url;
        yt.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&loop=${loop}&playlist=${ytId}&controls=0&modestbranding=1&volume=${vol}`;
        Object.assign(yt.style, { position: 'absolute', width: '1px', height: '1px', opacity: '0.01', left: '-9999px', top: '-9999px', pointerEvents: 'none' });
        yt.allow = 'autoplay';
        document.body.appendChild(yt);
        return;
    }

    // Direct audio URL (MP3 / OGG / etc.)
    if (existingYt) existingYt.remove();
    let audio = existing;
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = '_bg_music';
        audio.style.display = 'none';
        document.body.appendChild(audio);
    }

    if (audio.dataset.src !== url) {
        audio.dataset.src = url;
        audio.src = url;
        audio.loop = cfg.bg_music_loop !== false;
        const vol = (cfg.bg_music_volume ?? 50) / 100;
        const fadeIn = parseFloat(cfg.bg_music_fade_in) || 0;
        if (fadeIn > 0) {
            audio.volume = 0;
            audio.play().then(() => {
                const startTime = Date.now();
                const duration = fadeIn * 1000;
                function tick() {
                    const elapsed = Date.now() - startTime;
                    if (elapsed >= duration) { audio.volume = vol; return; }
                    audio.volume = (elapsed / duration) * vol;
                    requestAnimationFrame(tick);
                }
                tick();
            }).catch(() => {});
        } else {
            audio.volume = vol;
            audio.play().catch(() => {});
        }
    } else {
        audio.loop = cfg.bg_music_loop !== false;
        const targetVol = (cfg.bg_music_volume ?? 50) / 100;
        if (Math.abs(audio.volume - targetVol) > 0.01) audio.volume = targetVol;
    }
}

// ─── Clock Widget ───
let _clockInterval = null;
function applyClock(cfg) {
    let cw = document.getElementById('_clock_widget');
    if (!cfg.clock_widget) { if (cw) cw.remove(); if (_clockInterval) { clearInterval(_clockInterval); _clockInterval=null; } return; }
    if (!cw) {
        cw = document.createElement('div');
        cw.id = '_clock_widget';
        Object.assign(cw.style, {position:'absolute',zIndex:'50',fontFamily:"'Orbitron',sans-serif",pointerEvents:'none',textAlign:'center'});
        (document.getElementById('overlay')||document.body).appendChild(cw);
    }
    _widgetPos(cw, cfg.clock_position || 'bottom-left', '20px');
    const clkColor = cfg.clock_color || cfg.accent_color || '#7c3aed';
    const clkSize = parseInt(cfg.clock_size) || 28;
    cw.style.color = clkColor;
    cw.style.fontSize = clkSize + 'px';
    cw.style.textShadow = `0 0 12px ${clkColor}99`;
    cw.style.letterSpacing = '4px';
    const fmt = cfg.clock_format || '24h';
    const showDate = cfg.clock_show_date;
    function tick() {
        const now = new Date();
        let h=now.getHours(),m=now.getMinutes(),s=now.getSeconds(),suf='';
        if(fmt==='12h'){suf=h>=12?' PM':' AM';h=h%12||12;}
        const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${suf}`;
        if (showDate) {
            const dateStr = now.toLocaleDateString(undefined, {weekday:'short',month:'short',day:'numeric'});
            cw.innerHTML = `<div>${timeStr}</div><div style="font-size:${Math.round(clkSize*0.5)}px;letter-spacing:2px;opacity:0.7;margin-top:3px">${dateStr}</div>`;
        } else {
            cw.textContent = timeStr;
        }
    }
    tick();
    if (_clockInterval) clearInterval(_clockInterval);
    _clockInterval = setInterval(tick, 1000);
}

// ─── 20 new background effects ───

function _startLavaLamp(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const blobs=Array.from({length:6},()=>({x:Math.random()*W,y:Math.random()*H,rad:80+Math.random()*130,vx:(Math.random()-.5)*.6,vy:(Math.random()-.5)*.5}));
    function draw(){
        _bgCtx.clearRect(0,0,W,H);
        blobs.forEach(bl=>{
            bl.x+=bl.vx*_bgSpeed; bl.y+=bl.vy*_bgSpeed;
            if(bl.x<-bl.rad||bl.x>W+bl.rad) bl.vx*=-1;
            if(bl.y<-bl.rad||bl.y>H+bl.rad) bl.vy*=-1;
            const grd=_bgCtx.createRadialGradient(bl.x,bl.y,0,bl.x,bl.y,bl.rad);
            grd.addColorStop(0,`rgba(${r},${g},${b},.38)`);
            grd.addColorStop(.5,`rgba(${r},${g},${b},.14)`);
            grd.addColorStop(1,`rgba(${r},${g},${b},0)`);
            _bgCtx.beginPath();_bgCtx.arc(bl.x,bl.y,bl.rad,0,Math.PI*2);_bgCtx.fillStyle=grd;_bgCtx.fill();
        });
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startRipple(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const rings=[];
    let t=0;
    function draw(){
        _bgCtx.clearRect(0,0,W,H); t++;
        if(t%Math.max(1,Math.round(70/_bgSpeed))===0||rings.length===0) rings.push({x:Math.random()*W,y:Math.random()*H,r:0,a:.55});
        for(let i=rings.length-1;i>=0;i--){
            rings[i].r+=2.5*_bgSpeed; rings[i].a-=.003*_bgSpeed;
            if(rings[i].a<=0){rings.splice(i,1);continue;}
            _bgCtx.beginPath();_bgCtx.arc(rings[i].x,rings[i].y,rings[i].r,0,Math.PI*2);
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},${rings[i].a})`;_bgCtx.lineWidth=1.5;_bgCtx.stroke();
        }
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startNeonGrid(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    let off=0;
    function draw(){
        _bgCtx.clearRect(0,0,W,H); off=(off+_bgSpeed)%80;
        const vpy=H*.5, n=14;
        for(let i=0;i<n;i++){
            const z=((i/n+off/80)%1);
            const y=vpy+H*.5*Math.pow(z,2);
            const spread=W*.55*z, a=z*.35;
            _bgCtx.beginPath();_bgCtx.moveTo(W/2-spread,y);_bgCtx.lineTo(W/2+spread,y);
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},${a})`;_bgCtx.lineWidth=.8;_bgCtx.stroke();
        }
        for(let v=-7;v<=7;v++){
            _bgCtx.beginPath();_bgCtx.moveTo(W/2,vpy);_bgCtx.lineTo(W/2+v*(W/14),H);
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},.15)`;_bgCtx.lineWidth=.8;_bgCtx.stroke();
        }
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startMeteors(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const meteors=Array.from({length:12},()=>({x:Math.random()*W*1.5,y:-Math.random()*H,len:80+Math.random()*120,spd:8+Math.random()*8}));
    function draw(){
        _bgCtx.clearRect(0,0,W,H);
        meteors.forEach(m=>{
            m.x-=m.spd*.6*_bgSpeed; m.y+=m.spd*_bgSpeed;
            if(m.y>H+50){m.y=-Math.random()*H;m.x=W+Math.random()*W*.5;}
            const grd=_bgCtx.createLinearGradient(m.x,m.y,m.x+m.len*.6,m.y-m.len);
            grd.addColorStop(0,`rgba(${r},${g},${b},.9)`);
            grd.addColorStop(.3,`rgba(${r},${g},${b},.35)`);
            grd.addColorStop(1,`rgba(${r},${g},${b},0)`);
            _bgCtx.beginPath();_bgCtx.moveTo(m.x,m.y);_bgCtx.lineTo(m.x+m.len*.6,m.y-m.len);
            _bgCtx.strokeStyle=grd;_bgCtx.lineWidth=1.5;_bgCtx.stroke();
        });
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startDNA(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    let t=0;
    function draw(){
        _bgCtx.clearRect(0,0,W,H); t+=.5*_bgSpeed;
        const cx=W/2, amp=90, freq=.025, step=14;
        for(let y=0;y<H+step;y+=step){
            const phase=y*freq-t*.04;
            const x1=cx+amp*Math.sin(phase), x2=cx+amp*Math.sin(phase+Math.PI);
            const a=.12+.08*Math.sin(phase*.7+t*.02);
            _bgCtx.beginPath();_bgCtx.arc(x1,y,4,0,Math.PI*2);_bgCtx.fillStyle=`rgba(${r},${g},${b},${a*2.5})`;_bgCtx.fill();
            _bgCtx.beginPath();_bgCtx.arc(x2,y,4,0,Math.PI*2);_bgCtx.fillStyle=`rgba(${r},${g},${b},${a*2.5})`;_bgCtx.fill();
            if(.5+.5*Math.cos(phase*2)>.3){
                _bgCtx.beginPath();_bgCtx.moveTo(x1,y);_bgCtx.lineTo(x2,y);
                _bgCtx.strokeStyle=`rgba(${r},${g},${b},${a})`;_bgCtx.lineWidth=1;_bgCtx.stroke();
            }
        }
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startTriangles(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const pts=Array.from({length:21},()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.35,vy:(Math.random()-.5)*.35}));
    function draw(){
        _bgCtx.clearRect(0,0,W,H);
        pts.forEach(p=>{p.x+=p.vx*_bgSpeed;p.y+=p.vy*_bgSpeed;if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;});
        for(let i=0;i<pts.length-2;i+=3){
            const [a2,b2,c2]=[pts[i],pts[i+1],pts[i+2]];
            _bgCtx.beginPath();_bgCtx.moveTo(a2.x,a2.y);_bgCtx.lineTo(b2.x,b2.y);_bgCtx.lineTo(c2.x,c2.y);_bgCtx.closePath();
            _bgCtx.fillStyle=`rgba(${r},${g},${b},.05)`;_bgCtx.fill();
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},.15)`;_bgCtx.lineWidth=.8;_bgCtx.stroke();
        }
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startGlitchStatic(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    function draw(){
        _bgCtx.clearRect(0,0,W,H);
        for(let i=0;i<10;i++){
            const y=Math.random()*H, h=1+Math.random()*3;
            const xOff=Math.random()*W*.2, w=Math.random()*W*.7+W*.15;
            _bgCtx.fillStyle=`rgba(${r},${g},${b},${.04+Math.random()*.1})`;
            _bgCtx.fillRect(xOff,y,w,h);
        }
        if(Math.random()<.06){
            const y=Math.random()*H;
            _bgCtx.fillStyle=`rgba(${r},${g},${b},.22)`;
            _bgCtx.fillRect(0,y,W,1);
        }
        if(Math.random()<.02){
            const y=Math.random()*H, h=4+Math.random()*20;
            _bgCtx.fillStyle=`rgba(${r},${g},${b},.08)`;
            _bgCtx.fillRect(0,y,W,h);
        }
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startPulseRings(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const rings=[];
    let t=0;
    function draw(){
        _bgCtx.clearRect(0,0,W,H); t++;
        if(t%Math.max(1,Math.round(90/_bgSpeed))===0||rings.length===0) rings.push({r:0,a:.5,spd:1.8+Math.random()});
        for(let i=rings.length-1;i>=0;i--){
            rings[i].r+=rings[i].spd*_bgSpeed; rings[i].a-=.003*_bgSpeed;
            if(rings[i].a<=0){rings.splice(i,1);continue;}
            _bgCtx.beginPath();_bgCtx.arc(W/2,H/2,rings[i].r,0,Math.PI*2);
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},${rings[i].a})`;_bgCtx.lineWidth=2;_bgCtx.stroke();
        }
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startFlowField(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const pts=Array.from({length:220},()=>({x:Math.random()*W,y:Math.random()*H}));
    let t=0;
    function draw(){
        _bgCtx.fillStyle='rgba(0,0,0,.04)';_bgCtx.fillRect(0,0,W,H); t+=.005*_bgSpeed;
        pts.forEach(p=>{
            const angle=Math.sin(p.x*.004+t)*Math.cos(p.y*.004+t)*Math.PI*2;
            p.x+=Math.cos(angle)*1.3*_bgSpeed; p.y+=Math.sin(angle)*1.3*_bgSpeed;
            if(p.x<0)p.x=W;if(p.x>W)p.x=0;if(p.y<0)p.y=H;if(p.y>H)p.y=0;
            _bgCtx.beginPath();_bgCtx.arc(p.x,p.y,1,0,Math.PI*2);_bgCtx.fillStyle=`rgba(${r},${g},${b},.45)`;_bgCtx.fill();
        });
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startPlasma(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    let t=0;
    function draw(){
        _bgCtx.clearRect(0,0,W,H); t+=.018*_bgSpeed;
        const centers=[
            {x:W*.3+W*.22*Math.sin(t),y:H*.3+H*.22*Math.cos(t*.7)},
            {x:W*.7+W*.18*Math.cos(t*.8),y:H*.4+H*.2*Math.sin(t*.9)},
            {x:W*.5+W*.25*Math.sin(t*.6),y:H*.72+H*.15*Math.cos(t*.5)},
            {x:W*.5+W*.2*Math.cos(t*1.1),y:H*.5+H*.18*Math.sin(t*1.3)},
        ];
        for(let ring=1;ring<=10;ring++){
            centers.forEach(c=>{
                _bgCtx.beginPath();_bgCtx.arc(c.x,c.y,ring*110,0,Math.PI*2);
                _bgCtx.strokeStyle=`rgba(${r},${g},${b},.038)`;_bgCtx.lineWidth=44;_bgCtx.stroke();
            });
        }
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startAudioBars(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const N=40;
    const bars=Array.from({length:N},(_,i)=>({h:0,phase:i*.28+Math.random()*.5}));
    let t=0;
    function draw(){
        _bgCtx.clearRect(0,0,W,H); t+=.05*_bgSpeed;
        const bw=W/N*.72, gap=W/N*.28;
        bars.forEach((bar,i)=>{
            const target=H*.05+H*.48*Math.abs(Math.sin(t+bar.phase)*Math.sin(t*.65+i*.18));
            bar.h+=(target-bar.h)*.15;
            const x=i*(bw+gap)+gap/2;
            const grd=_bgCtx.createLinearGradient(x,H,x,H-bar.h);
            grd.addColorStop(0,`rgba(${r},${g},${b},.7)`);
            grd.addColorStop(1,`rgba(${r},${g},${b},.12)`);
            _bgCtx.fillStyle=grd;_bgCtx.fillRect(x,H-bar.h,bw,bar.h);
        });
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startHexGrid(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const sz=58, h3=sz*Math.sqrt(3), cells=[];
    for(let col=0;col<W/sz*1.5;col++) for(let row=0;row<H/h3*1.3;row++)
        cells.push({x:col*sz*1.5,y:row*h3+(col%2?h3/2:0),phase:Math.random()*Math.PI*2,spd:.01+Math.random()*.03});
    function hex(x,y,s){_bgCtx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;i===0?_bgCtx.moveTo(x+s*Math.cos(a),y+s*Math.sin(a)):_bgCtx.lineTo(x+s*Math.cos(a),y+s*Math.sin(a))}_bgCtx.closePath();}
    function draw(){
        _bgCtx.clearRect(0,0,W,H);
        cells.forEach(c=>{
            c.phase+=c.spd*_bgSpeed;
            const bright=.5+.5*Math.sin(c.phase);
            hex(c.x,c.y,sz*.88);
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},${bright*.22})`;_bgCtx.lineWidth=1;_bgCtx.stroke();
            if(bright>.82){_bgCtx.fillStyle=`rgba(${r},${g},${b},${(bright-.82)*1.6*.12})`;_bgCtx.fill();}
        });
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startLaser(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const beams=Array.from({length:3},(_,i)=>({angle:Math.random()*Math.PI*2,spd:.005+i*.003,x:W*.2+Math.random()*W*.6,y:H*.2+Math.random()*H*.6}));
    function draw(){
        _bgCtx.clearRect(0,0,W,H);
        beams.forEach(bm=>{
            bm.angle+=bm.spd*_bgSpeed;
            const len=Math.max(W,H)*1.5;
            const x2=bm.x+Math.cos(bm.angle)*len, y2=bm.y+Math.sin(bm.angle)*len;
            const x3=bm.x+Math.cos(bm.angle+Math.PI)*len, y3=bm.y+Math.sin(bm.angle+Math.PI)*len;
            const grd=_bgCtx.createLinearGradient(x3,y3,x2,y2);
            grd.addColorStop(0,`rgba(${r},${g},${b},0)`);
            grd.addColorStop(.47,`rgba(${r},${g},${b},.05)`);
            grd.addColorStop(.5,`rgba(${r},${g},${b},.38)`);
            grd.addColorStop(.53,`rgba(${r},${g},${b},.05)`);
            grd.addColorStop(1,`rgba(${r},${g},${b},0)`);
            _bgCtx.beginPath();_bgCtx.moveTo(x3,y3);_bgCtx.lineTo(x2,y2);
            _bgCtx.strokeStyle=grd;_bgCtx.lineWidth=3;_bgCtx.stroke();
        });
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startNebula(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const clouds=Array.from({length:8},()=>({x:Math.random()*W,y:Math.random()*H,rad:160+Math.random()*200,vx:(Math.random()-.5)*.18,vy:(Math.random()-.5)*.14,a:.06+Math.random()*.08}));
    function draw(){
        _bgCtx.clearRect(0,0,W,H);
        clouds.forEach(c=>{
            c.x+=c.vx*_bgSpeed; c.y+=c.vy*_bgSpeed;
            if(c.x<-c.rad)c.x=W+c.rad; if(c.x>W+c.rad)c.x=-c.rad;
            if(c.y<-c.rad)c.y=H+c.rad; if(c.y>H+c.rad)c.y=-c.rad;
            const grd=_bgCtx.createRadialGradient(c.x,c.y,0,c.x,c.y,c.rad);
            grd.addColorStop(0,`rgba(${r},${g},${b},${c.a})`);
            grd.addColorStop(.4,`rgba(${r},${g},${b},${c.a*.5})`);
            grd.addColorStop(1,`rgba(${r},${g},${b},0)`);
            _bgCtx.beginPath();_bgCtx.arc(c.x,c.y,c.rad,0,Math.PI*2);_bgCtx.fillStyle=grd;_bgCtx.fill();
        });
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startWormhole(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    let t=0;
    function draw(){
        _bgCtx.clearRect(0,0,W,H); t+=.03*_bgSpeed;
        const cx=W/2, cy=H/2, maxR=Math.min(W,H)*.52;
        for(let ring=1;ring<=16;ring++){
            const rad=ring*(maxR/16);
            const a=(.38-ring*.02)*Math.abs(Math.sin(t-ring*.28));
            _bgCtx.beginPath();_bgCtx.arc(cx,cy,rad,0,Math.PI*2);
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},${Math.max(0,a)})`;_bgCtx.lineWidth=1+ring*.12;_bgCtx.stroke();
        }
        for(let spoke=0;spoke<8;spoke++){
            const angle=t+spoke*Math.PI*.25;
            _bgCtx.beginPath();_bgCtx.moveTo(cx,cy);_bgCtx.lineTo(cx+Math.cos(angle)*maxR,cy+Math.sin(angle)*maxR);
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},.05)`;_bgCtx.lineWidth=1;_bgCtx.stroke();
        }
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startSand(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const grains=Array.from({length:320},()=>({x:Math.random()*W,y:Math.random()*-H,vy:1.2+Math.random()*2,vx:(Math.random()-.5)*.3,a:.25+Math.random()*.45}));
    function draw(){
        _bgCtx.clearRect(0,0,W,H);
        grains.forEach(gn=>{
            gn.x+=gn.vx*_bgSpeed; gn.y+=gn.vy*_bgSpeed;
            if(gn.y>H) gn.y=-Math.random()*H*.5;
            _bgCtx.beginPath();_bgCtx.arc(gn.x,gn.y,1.2,0,Math.PI*2);
            _bgCtx.fillStyle=`rgba(${r},${g},${b},${gn.a})`;_bgCtx.fill();
        });
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startInk(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const tendrils=Array.from({length:6},()=>({
        pts:[{x:Math.random()*W,y:Math.random()*H}],
        angle:Math.random()*Math.PI*2, spd:1.8+Math.random()*1.5, spread:.28+Math.random()*.28
    }));
    function draw(){
        _bgCtx.clearRect(0,0,W,H);
        tendrils.forEach(td=>{
            td.angle+=(Math.random()-.5)*td.spread;
            const last=td.pts[td.pts.length-1];
            td.pts.push({x:last.x+Math.cos(td.angle)*td.spd*_bgSpeed,y:last.y+Math.sin(td.angle)*td.spd*_bgSpeed});
            if(td.pts.length>180) td.pts.shift();
            if(last.x<0||last.x>W||last.y<0||last.y>H){td.pts=[{x:Math.random()*W,y:Math.random()*H}];td.angle=Math.random()*Math.PI*2;}
            if(td.pts.length<2) return;
            _bgCtx.beginPath();_bgCtx.moveTo(td.pts[0].x,td.pts[0].y);
            td.pts.forEach(p=>_bgCtx.lineTo(p.x,p.y));
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},.13)`;_bgCtx.lineWidth=2;_bgCtx.stroke();
        });
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startCrystal(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    let t=0;
    function branch(x,y,angle,length,depth){
        if(depth===0||length<8) return;
        const x2=x+Math.cos(angle)*length, y2=y+Math.sin(angle)*length;
        _bgCtx.beginPath();_bgCtx.moveTo(x,y);_bgCtx.lineTo(x2,y2);
        _bgCtx.strokeStyle=`rgba(${r},${g},${b},${depth*.042})`;_bgCtx.lineWidth=depth*.5;_bgCtx.stroke();
        branch(x2,y2,angle-.42,length*.7,depth-1);
        branch(x2,y2,angle+.42,length*.7,depth-1);
    }
    function draw(){
        _bgCtx.clearRect(0,0,W,H); t+=.004*_bgSpeed;
        const sway=Math.sin(t)*.07;
        branch(W*.25,H,Math.PI*1.5+sway,85,6);
        branch(W*.5, H,Math.PI*1.5,      95,7);
        branch(W*.75,H,Math.PI*1.5-sway,85,6);
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startConstellation(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const stars=Array.from({length:110},()=>({x:Math.random()*W,y:Math.random()*H,s:.5+Math.random()*1.5,phase:Math.random()*Math.PI*2,spd:.02+Math.random()*.03}));
    let t=0;
    function draw(){
        _bgCtx.clearRect(0,0,W,H); t+=.004*_bgSpeed;
        for(let i=0;i<stars.length;i++){
            for(let j=i+1;j<stars.length;j++){
                const dx=stars[i].x-stars[j].x, dy=stars[i].y-stars[j].y, d=Math.sqrt(dx*dx+dy*dy);
                if(d<130&&Math.sin(t+i*.5+j*.3)>.55){
                    _bgCtx.beginPath();_bgCtx.moveTo(stars[i].x,stars[i].y);_bgCtx.lineTo(stars[j].x,stars[j].y);
                    _bgCtx.strokeStyle=`rgba(${r},${g},${b},${.07*(1-d/130)})`;_bgCtx.lineWidth=.5;_bgCtx.stroke();
                }
            }
        }
        stars.forEach(s=>{
            s.phase+=s.spd*_bgSpeed;
            const bright=.3+.55*Math.sin(s.phase);
            _bgCtx.beginPath();_bgCtx.arc(s.x,s.y,s.s,0,Math.PI*2);
            _bgCtx.fillStyle=`rgba(${r},${g},${b},${bright})`;_bgCtx.fill();
        });
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startSpinningRings(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const rings=Array.from({length:8},(_,i)=>({rad:(i+1)*70,spd:(.003+i*.001)*(i%2?1:-1),angle:i*Math.PI*.4,arc:Math.PI*1.35+i*.1}));
    function draw(){
        _bgCtx.clearRect(0,0,W,H);
        rings.forEach(ring=>{
            ring.angle+=ring.spd*_bgSpeed;
            _bgCtx.beginPath();_bgCtx.arc(W/2,H/2,ring.rad,ring.angle,ring.angle+ring.arc);
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},.22)`;_bgCtx.lineWidth=1+rings.indexOf(ring)*.25;_bgCtx.stroke();
            _bgCtx.beginPath();_bgCtx.arc(W/2,H/2,ring.rad,ring.angle+Math.PI,ring.angle+Math.PI+ring.arc*.55);
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},.1)`;_bgCtx.lineWidth=.6;_bgCtx.stroke();
        });
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

// ─── New Background Effect Functions ───

function _startMagneticField(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const poles=[{x:W*0.35,y:H*0.5,c:1},{x:W*0.65,y:H*0.5,c:-1}];
    let t=0;
    function draw(){
        _bgCtx.clearRect(0,0,W,H); t+=0.005*_bgSpeed;
        poles[0].x=W*0.35+Math.sin(t)*50; poles[1].x=W*0.65+Math.cos(t)*50;
        for(let angle=0;angle<Math.PI*2;angle+=Math.PI/18){
            let x=poles[0].x+Math.cos(angle)*20,y=poles[0].y+Math.sin(angle)*20;
            _bgCtx.beginPath(); _bgCtx.moveTo(x,y);
            for(let step=0;step<120;step++){
                let fx=0,fy=0;
                poles.forEach(p=>{const dx=x-p.x,dy=y-p.y,d=Math.sqrt(dx*dx+dy*dy)+1;fx+=p.c*dx/(d*d*d);fy+=p.c*dy/(d*d*d);});
                const len=Math.sqrt(fx*fx+fy*fy)+0.0001;
                x+=fx/len*6; y+=fy/len*6;
                if(x<0||x>W||y<0||y>H) break;
                _bgCtx.lineTo(x,y);
            }
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},.18)`;_bgCtx.lineWidth=1;_bgCtx.stroke();
        }
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startRadarSweep(W, H, accent) {
    const cx=W/2,cy=H/2,rad=Math.min(W,H)*0.45;
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    let angle=0;
    const dots=Array.from({length:20},()=>({a:Math.random()*Math.PI*2,r:Math.random()*rad*0.85,life:0}));
    function draw(){
        _bgCtx.clearRect(0,0,W,H);
        [0.25,0.5,0.75,1].forEach(f=>{ _bgCtx.beginPath();_bgCtx.arc(cx,cy,rad*f,0,Math.PI*2);_bgCtx.strokeStyle=`rgba(${r},${g},${b},.15)`;_bgCtx.lineWidth=1;_bgCtx.stroke(); });
        _bgCtx.strokeStyle=`rgba(${r},${g},${b},.1)`;_bgCtx.beginPath();_bgCtx.moveTo(cx-rad,cy);_bgCtx.lineTo(cx+rad,cy);_bgCtx.moveTo(cx,cy-rad);_bgCtx.lineTo(cx,cy+rad);_bgCtx.stroke();
        _bgCtx.save();_bgCtx.translate(cx,cy);
        for(let da=0;da<Math.PI/2;da+=0.05){
            const a=angle-da,alpha=Math.max(0,0.3-da*0.6);
            _bgCtx.beginPath();_bgCtx.moveTo(0,0);_bgCtx.arc(0,0,rad,a-0.05,a);_bgCtx.fillStyle=`rgba(${r},${g},${b},${alpha})`;_bgCtx.fill();
        }
        _bgCtx.restore();
        _bgCtx.beginPath();_bgCtx.moveTo(cx,cy);_bgCtx.lineTo(cx+Math.cos(angle)*rad,cy+Math.sin(angle)*rad);_bgCtx.strokeStyle=`rgba(${r},${g},${b},.8)`;_bgCtx.lineWidth=2;_bgCtx.stroke();
        dots.forEach(d=>{
            const da=((angle-d.a)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
            if(da<0.1) d.life=1;
            d.life=Math.max(0,d.life-0.015);
            if(d.life>0){const dx=cx+Math.cos(d.a)*d.r,dy=cy+Math.sin(d.a)*d.r;_bgCtx.beginPath();_bgCtx.arc(dx,dy,3,0,Math.PI*2);_bgCtx.fillStyle=`rgba(${r},${g},${b},${d.life})`;_bgCtx.fill();}
        });
        angle+=0.015*_bgSpeed; _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startTVStatic(W, H) {
    function draw(){
        const imgd=_bgCtx.createImageData(W,H);
        for(let i=0;i<imgd.data.length;i+=4){
            const v=Math.random()*255*0.3;
            imgd.data[i]=imgd.data[i+1]=imgd.data[i+2]=v;imgd.data[i+3]=180;
        }
        if(Math.random()<0.1){
            const gy=Math.random()*H|0,gh=(Math.random()*20+5)|0;
            for(let y=gy;y<Math.min(gy+gh,H);y++)for(let x=0;x<W;x++){
                const i=(y*W+x)*4;imgd.data[i]=imgd.data[i+1]=imgd.data[i+2]=Math.random()*255;imgd.data[i+3]=220;
            }
        }
        _bgCtx.putImageData(imgd,0,0);
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startLightningStorm(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    let bolts=[],flash=0;
    function bolt(x,y,dx,len,depth){
        if(depth>6||len<10) return;
        _bgCtx.beginPath();_bgCtx.moveTo(x,y);
        const nx=x+dx+(Math.random()-0.5)*60,ny=y+len;
        _bgCtx.lineTo(nx,ny);_bgCtx.stroke();
        if(Math.random()<0.4) bolt(nx,ny,(Math.random()-0.5)*40,len*0.6,depth+1);
        bolt(nx,ny,dx,len*0.7,depth+1);
    }
    function draw(){
        _bgCtx.clearRect(0,0,W,H);
        if(flash>0){_bgCtx.fillStyle=`rgba(${r},${g},${b},${flash*.2})`;_bgCtx.fillRect(0,0,W,H);flash-=0.05;}
        if(Math.random()<0.01*_bgSpeed){
            bolts.push({x:Math.random()*W,life:1});flash=Math.min(1,flash+0.5);
        }
        bolts.forEach((bl)=>{
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},${bl.life})`;
            _bgCtx.lineWidth=Math.max(0.5,bl.life*2);_bgCtx.shadowBlur=20;_bgCtx.shadowColor=accent;
            bolt(bl.x,0,0,H*0.6,0);
            bl.life-=0.08*_bgSpeed;
        });
        _bgCtx.shadowBlur=0;
        bolts=bolts.filter(b=>b.life>0);
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startPrism(W, H, accent) {
    let angle=0;
    function draw(){
        _bgCtx.clearRect(0,0,W,H); angle+=0.005*_bgSpeed;
        const cx=W/2,cy=H/2,sides=6,rad=Math.min(W,H)*0.35;
        _bgCtx.save();_bgCtx.translate(cx,cy);_bgCtx.rotate(angle);
        _bgCtx.beginPath();
        for(let i=0;i<sides;i++){_bgCtx.lineTo(Math.cos(i*Math.PI*2/sides)*rad,Math.sin(i*Math.PI*2/sides)*rad);}
        _bgCtx.closePath();_bgCtx.strokeStyle=`${accent}44`;_bgCtx.lineWidth=2;_bgCtx.stroke();_bgCtx.restore();
        for(let i=0;i<12;i++){
            const a=angle+i*Math.PI/6,hue=i*30;
            const x1=cx+Math.cos(a)*50,y1=cy+Math.sin(a)*50;
            const x2=cx+Math.cos(a)*rad*1.2,y2=cy+Math.sin(a)*rad*1.2;
            const grd=_bgCtx.createLinearGradient(x1,y1,x2,y2);
            grd.addColorStop(0,`hsla(${hue},100%,60%,.4)`);grd.addColorStop(1,`hsla(${hue},100%,60%,0)`);
            _bgCtx.beginPath();_bgCtx.moveTo(x1,y1);_bgCtx.lineTo(x2,y2);
            _bgCtx.strokeStyle=grd;_bgCtx.lineWidth=3;_bgCtx.stroke();
        }
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startSolarWind(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const pts=Array.from({length:300},()=>({x:Math.random()*W,y:Math.random()*H,v:Math.random()*3+1,angle:(Math.random()-0.5)*0.4}));
    function draw(){
        _bgCtx.fillStyle='rgba(0,0,0,0.15)';_bgCtx.fillRect(0,0,W,H);
        pts.forEach(p=>{
            p.x+=Math.cos(p.angle)*p.v*_bgSpeed;p.y+=Math.sin(p.angle)*p.v*_bgSpeed*0.3;
            if(p.x>W+10){p.x=-10;p.y=Math.random()*H;}
            _bgCtx.beginPath();_bgCtx.arc(p.x,p.y,0.8,0,Math.PI*2);
            _bgCtx.fillStyle=`rgba(${r},${g},${b},${0.3+Math.random()*0.3})`;_bgCtx.fill();
        });
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startPendulumWaves(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    const n=15,len=H*0.4,t0=Date.now();
    function draw(){
        _bgCtx.clearRect(0,0,W,H);
        const t=(Date.now()-t0)/1000*_bgSpeed;
        for(let i=0;i<n;i++){
            const period=1.5+i*0.1,x=W/(n+1)*(i+1);
            const angle=Math.sin(t*2*Math.PI/period)*0.8;
            const bx=x+Math.sin(angle)*len,by=H*0.25+Math.cos(angle)*len;
            _bgCtx.beginPath();_bgCtx.moveTo(x,H*0.05);_bgCtx.lineTo(bx,by);
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},.25)`;_bgCtx.lineWidth=1;_bgCtx.stroke();
            _bgCtx.beginPath();_bgCtx.arc(bx,by,6,0,Math.PI*2);
            const alpha=0.4+0.4*((i%5)/5);
            _bgCtx.fillStyle=`rgba(${r},${g},${b},${alpha})`;_bgCtx.fill();
        }
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startTopoMap(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    let t=0;
    function noise2(x,y,z){return Math.sin(x*0.5+z)*Math.cos(y*0.5+z*0.7)*Math.sin((x+y)*0.3+z*1.3);}
    function draw(){
        _bgCtx.clearRect(0,0,W,H); t+=0.008*_bgSpeed;
        const levels=8;
        for(let lv=0;lv<levels;lv++){
            const thresh=-1+(lv/levels)*2;
            _bgCtx.beginPath();
            for(let x=0;x<=W;x+=12){
                let lastAbove=false;
                for(let y=0;y<=H;y+=12){
                    const v=noise2(x/W*4,y/H*4,t);
                    if(Math.abs(v-thresh)<0.07){
                        if(!lastAbove){_bgCtx.moveTo(x,y);lastAbove=true;}
                        else _bgCtx.lineTo(x,y);
                    } else lastAbove=false;
                }
            }
            _bgCtx.strokeStyle=`rgba(${r},${g},${b},${0.08+lv*0.04})`;_bgCtx.lineWidth=1;_bgCtx.stroke();
        }
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

function _startLiquidMetal(W, H, accent) {
    const r=parseInt(accent.slice(1,3)||'7c',16),g=parseInt(accent.slice(3,5)||'3a',16),b=parseInt(accent.slice(5,7)||'ed',16);
    let t=0;
    function field(x,y,t){return Math.sin(x*0.004+t)*Math.cos(y*0.004+t*0.7)+Math.sin((x+y)*0.003+t*1.3)*0.5;}
    function draw(){
        _bgCtx.clearRect(0,0,W,H); t+=0.02*_bgSpeed;
        const step=20;
        for(let x=0;x<W;x+=step)for(let y=0;y<H;y+=step){
            const v=(field(x,y,t)+1.5)/3;
            const bright=0.3+v*0.7;
            _bgCtx.fillStyle=`rgba(${Math.round(r*bright)},${Math.round(g*bright)},${Math.round(b*bright)},${0.15+v*0.2})`;
            _bgCtx.fillRect(x,y,step,step);
        }
        _bgAnimId=requestAnimationFrame(draw);
    }
    draw();
}

// ─── Shared widget position helper ───
function _widgetPos(el, pos, margin) {
    const m = margin || '24px';
    Object.assign(el.style, {top:'', bottom:'', left:'', right:'', transform:''});
    if (pos === 'center') {
        el.style.top = '50%'; el.style.left = '50%'; el.style.transform = 'translate(-50%,-50%)';
        return;
    }
    if (pos.includes('top')) el.style.top = m; else el.style.bottom = m;
    if (pos.includes('left')) el.style.left = m;
    else if (pos.includes('right')) el.style.right = m;
    else { el.style.left = '50%'; el.style.transform = 'translateX(-50%)'; }
}

// ─── Goal Bar Widget ───
function applyGoalBar(cfg) {
    let gb = document.getElementById('_goal_bar_widget');
    if (!cfg.goal_bar) { if (gb) gb.remove(); return; }
    if (!gb) {
        gb = document.createElement('div');
        gb.id = '_goal_bar_widget';
        Object.assign(gb.style, {position:'absolute',zIndex:'50',width:'700px',pointerEvents:'none'});
        (document.getElementById('overlay')||document.body).appendChild(gb);
    }
    _widgetPos(gb, cfg.goal_bar_position || 'bottom-center', '40px');
    const accent = cfg.goal_bar_color || cfg.accent_color || '#7c3aed';
    const cur = parseFloat(cfg.goal_bar_current)||0, max=parseFloat(cfg.goal_bar_max)||100;
    const pct = Math.min(100, Math.round(cur/max*100));
    const style = cfg.goal_bar_style || 'gradient';

    // Segmented style
    if (style === 'segmented') {
        const segs = 10, filled = Math.round(pct / 10);
        gb.innerHTML = `
            <div style="font-family:'Orbitron',sans-serif;font-size:13px;letter-spacing:2px;color:${accent};text-align:center;margin-bottom:6px;text-transform:uppercase;">${cfg.goal_bar_title||'Goal'}</div>
            <div style="display:flex;gap:4px;">${Array.from({length:segs},(_,i)=>`<div style="flex:1;height:18px;border-radius:3px;background:${i<filled?accent:'rgba(255,255,255,.08)'};box-shadow:${i<filled?'0 0 8px '+accent+'88':''};transition:all .3s;"></div>`).join('')}</div>
            <div style="font-family:'Orbitron',sans-serif;font-size:11px;color:#aaa;text-align:center;margin-top:5px;">${cur} / ${max} (${pct}%)</div>
            ${cfg.goal_bar_show_milestone ? '<div style="position:relative;height:8px;"><div style="position:absolute;left:50%;top:-6px;width:2px;height:14px;background:gold;"></div></div>' : ''}`;
        return;
    }

    let fillBg, fillExtra = '';
    if (style === 'solid') fillBg = accent;
    else if (style === 'striped') fillBg = `repeating-linear-gradient(45deg,${accent},${accent} 10px,${accent}aa 10px,${accent}aa 20px)`;
    else if (style === 'neon-pulse') {
        fillBg = accent;
        let gks = document.getElementById('_gb_kf');
        if (!gks) { gks=document.createElement('style');gks.id='_gb_kf';document.head.appendChild(gks); }
        gks.textContent = `@keyframes goalPulse{0%,100%{box-shadow:0 0 12px ${accent}88}50%{box-shadow:0 0 30px ${accent}ff,0 0 60px ${accent}44}}`;
        fillExtra = 'animation:goalPulse 1.5s ease-in-out infinite;';
    }
    else fillBg = `linear-gradient(90deg,${accent},${accent}cc)`;

    const milestoneHtml = cfg.goal_bar_show_milestone ? `
        <div style="position:relative;height:8px;">
            <div style="position:absolute;left:50%;top:-6px;width:2px;height:14px;background:gold;"></div>
        </div>` : '';

    gb.innerHTML = `
        <div style="font-family:'Orbitron',sans-serif;font-size:13px;letter-spacing:2px;color:${accent};text-align:center;margin-bottom:6px;text-transform:uppercase;">${cfg.goal_bar_title||'Goal'}</div>
        <div style="background:rgba(255,255,255,.08);border-radius:20px;height:18px;overflow:hidden;border:1px solid ${accent}44;">
            <div style="width:${pct}%;height:100%;background:${fillBg};border-radius:20px;transition:width .5s ease;box-shadow:0 0 12px ${accent}88;${fillExtra}"></div>
        </div>
        ${milestoneHtml}
        <div style="font-family:'Orbitron',sans-serif;font-size:11px;color:#aaa;text-align:center;margin-top:5px;">${cur} / ${max} (${pct}%)</div>`;
}

// ─── Viewer Queue Widget ───
function applyViewerQueue(cfg) {
    let vq = document.getElementById('_viewer_queue_widget');
    const queue = cfg.viewer_queue || [];
    if (!queue.length) { if (vq) vq.remove(); return; }
    if (!vq) {
        vq = document.createElement('div');
        vq.id = '_viewer_queue_widget';
        Object.assign(vq.style, {position:'absolute',zIndex:'50',width:'260px',pointerEvents:'none'});
        (document.getElementById('overlay')||document.body).appendChild(vq);
    }
    _widgetPos(vq, cfg.viewer_queue_position || 'top-right');
    const accent = cfg.accent_color || '#7c3aed';
    vq.innerHTML = `<div style="font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:2px;color:${accent};text-transform:uppercase;margin-bottom:8px;">${cfg.viewer_queue_title||'Queue'}</div>` +
        queue.map((name,i)=>`<div style="font-family:'Poppins',sans-serif;font-size:14px;color:#ddd;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.06);"><span style="color:${accent};font-size:11px;margin-right:6px;">#${i+1}</span>${name}</div>`).join('');
}

// ─── Uptime Widget ───
let _uptimeStart = null;
let _uptimeInterval = null;
function applyUptime(cfg) {
    let uw = document.getElementById('_uptime_widget');
    if (!cfg.uptime_widget) {
        if (uw) uw.remove();
        if (_uptimeInterval) { clearInterval(_uptimeInterval); _uptimeInterval = null; }
        return;
    }
    if (!_uptimeStart) _uptimeStart = Date.now();
    if (!uw) {
        uw = document.createElement('div');
        uw.id = '_uptime_widget';
        Object.assign(uw.style, {position:'absolute',zIndex:'50',fontFamily:"'Orbitron',sans-serif",pointerEvents:'none',textAlign:'center'});
        (document.getElementById('overlay')||document.body).appendChild(uw);
    }
    _widgetPos(uw, cfg.uptime_position || 'top-left', '20px');
    const accent = cfg.accent_color || '#7c3aed';
    uw.style.color = accent;
    uw.style.fontSize = '20px';
    uw.style.letterSpacing = '3px';
    uw.style.textShadow = `0 0 10px ${accent}88`;
    function tickUptime() {
        const elapsed = Math.floor((Date.now() - _uptimeStart) / 1000);
        const h = Math.floor(elapsed / 3600), m = Math.floor((elapsed % 3600) / 60), s = elapsed % 60;
        uw.innerHTML = `<div style="font-size:9px;letter-spacing:2px;opacity:0.6;margin-bottom:2px">UPTIME</div>${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    tickUptime();
    if (_uptimeInterval) clearInterval(_uptimeInterval);
    _uptimeInterval = setInterval(tickUptime, 1000);
}

// ─── Ticker Widget ───
let _tickerEvents = [];
let _tickerSSE = null;
let _tickerLastTs = Math.floor(Date.now() / 1000);
let _tickerActiveCfg = null;

function _tickerFormat(evt) {
    const icons = { follow:'♥', sub:'★', gift_sub:'🎁', bits:'💎', raid:'⚔', points:'✦' };
    const icon = icons[evt.type] || '•';
    const name = evt.name || evt.gifter || 'Someone';
    if (evt.type === 'follow')    return `${icon} ${name} just followed`;
    if (evt.type === 'sub')       return `${icon} ${name} subscribed`;
    if (evt.type === 'gift_sub')  return `${icon} ${name} gifted ${evt.count || 1} sub${(evt.count||1)>1?'s':''}`;
    if (evt.type === 'bits')      return `${icon} ${name} cheered ${evt.amount||''} bits`.replace(/ +/g,' ').trim();
    if (evt.type === 'raid')      return `${icon} ${name} raided with ${evt.count||''} viewers`.replace(/ +/g,' ').trim();
    if (evt.type === 'points')    return `${icon} ${name} redeemed ${evt.reward||'channel points'}`;
    return `${icon} ${name}`;
}

function _tickerRebuild() {
    const cfg = _tickerActiveCfg;
    if (!cfg) return;
    const tw = document.getElementById('_ticker_widget');
    if (!tw) return;
    const accent = cfg.accent_color || '#7c3aed';
    const speed = parseInt(cfg.ticker_speed) || 60;
    const label = cfg.ticker_label || 'Recent Events';
    const liveItems = _tickerEvents.map(_tickerFormat);
    const staticItems = (cfg.ticker_names || []).filter(Boolean);
    const items = liveItems.length ? liveItems : staticItems;
    const content = items.length ? items.join('  ·  ') : '─ No events yet ─';
    tw.innerHTML = `
        <div style="flex-shrink:0;padding:0 20px;font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:2px;color:${accent};text-transform:uppercase;border-right:2px solid ${accent}44;">${label}</div>
        <div style="overflow:hidden;flex:1;position:relative;height:24px;">
            <div id="_ticker_scroll" style="position:absolute;white-space:nowrap;font-family:'Poppins',sans-serif;font-size:14px;color:#eee;animation:tickerScroll ${Math.max(10, Math.round(content.length * 0.25 / speed * 1000))}s linear infinite;">${content}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${content}</div>
        </div>`;
}

function _tickerConnectSSE() {
    const cfg = _tickerActiveCfg;
    if (!cfg || !cfg.user_id) return;
    _tickerSSE = new EventSource('/overlays/alerts/' + cfg.user_id + '/events?since=' + _tickerLastTs);
    _tickerSSE.onmessage = e => {
        try {
            const m = JSON.parse(e.data);
            if (m.type !== 'alert') return;
            if (m.ts) _tickerLastTs = m.ts;
            const d = m.data;
            const allowed = {
                follow:   cfg.ticker_show_follows !== false,
                sub:      cfg.ticker_show_subs !== false,
                bits:     cfg.ticker_show_bits !== false,
                raid:     cfg.ticker_show_raids !== false,
                gift_sub: cfg.ticker_show_gift_subs !== false,
                points:   cfg.ticker_show_points === true,
            };
            if (!allowed[d.type]) return;
            _tickerEvents.unshift(d);
            _tickerEvents = _tickerEvents.slice(0, cfg.ticker_max_events || 10);
            _tickerRebuild();
        } catch (_) {}
    };
    _tickerSSE.onerror = () => { _tickerSSE.close(); _tickerSSE = null; setTimeout(_tickerConnectSSE, 3000); };
}

function applyTicker(cfg) {
    let tw = document.getElementById('_ticker_widget');
    if (!cfg.ticker_widget) {
        if (tw) tw.remove();
        if (_tickerSSE) { _tickerSSE.close(); _tickerSSE = null; }
        _tickerActiveCfg = null;
        return;
    }
    _tickerActiveCfg = cfg;
    if (!tw) {
        tw = document.createElement('div');
        tw.id = '_ticker_widget';
        Object.assign(tw.style, {
            position:'absolute', zIndex:'60', left:'0', right:'0', overflow:'hidden',
            pointerEvents:'none', display:'flex', alignItems:'center'
        });
        if ((cfg.ticker_position || 'bottom-center').includes('top')) tw.style.top = '0'; else tw.style.bottom = '0';
        (document.getElementById('overlay')||document.body).appendChild(tw);
    }
    tw.style.background = cfg.ticker_bg || 'rgba(0,0,0,0.75)';
    tw.style.padding = '10px 0';

    // Start live SSE if enabled and not already running
    if (cfg.ticker_live && cfg.user_id && !_tickerSSE) _tickerConnectSSE();
    // Stop SSE if live mode turned off
    if (!cfg.ticker_live && _tickerSSE) { _tickerSSE.close(); _tickerSSE = null; _tickerEvents = []; }

    _tickerRebuild();

    let ks = document.getElementById('_ticker_kf');
    if (!ks) { ks = document.createElement('style'); ks.id = '_ticker_kf'; document.head.appendChild(ks); }
    ks.textContent = `@keyframes tickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`;
}

// ─── Now Playing Widget ───
function applyNowPlaying(cfg) {
    let np = document.getElementById('_nowplaying_widget');
    if (!cfg.nowplaying_widget) { if (np) np.remove(); return; }
    if (!np) {
        np = document.createElement('div');
        np.id = '_nowplaying_widget';
        Object.assign(np.style, {position:'absolute',zIndex:'50',pointerEvents:'none',maxWidth:'320px'});
        (document.getElementById('overlay')||document.body).appendChild(np);
    }
    _widgetPos(np, cfg.nowplaying_position || 'bottom-left', '24px');
    const accent = cfg.accent_color || '#7c3aed';
    const text = cfg.nowplaying_text || '';
    const showBar = cfg.nowplaying_show_bar !== false;
    const bars = showBar ? '<div style="display:flex;gap:3px;align-items:flex-end;margin-right:8px;">' +
        [0.4,0.7,1,0.6,0.8].map((h,i)=>`<div style="width:4px;background:${accent};animation:barPulse ${0.4+i*0.1}s ease-in-out infinite alternate;"></div>`).join('') +
        '</div>' : '';
    let bks = document.getElementById('_np_kf');
    if (!bks) { bks=document.createElement('style');bks.id='_np_kf';document.head.appendChild(bks); }
    bks.textContent = '@keyframes barPulse{from{height:6px}to{height:20px}}';
    np.innerHTML = `
        <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:${accent};margin-bottom:4px;text-transform:uppercase;">${cfg.nowplaying_title||'Now Playing'}</div>
        <div style="display:flex;align-items:center;background:rgba(0,0,0,0.6);border:1px solid ${accent}44;border-radius:8px;padding:8px 12px;">
            ${bars}
            <div data-np-text style="font-family:'Poppins',sans-serif;font-size:13px;color:#eee;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${text||'─'}</div>
        </div>`;
}

// ─── Counter Widget ───
function applyCounterWidget(cfg) {
    let ctr = document.getElementById('_counter_widget');
    if (!cfg.counter_widget) { if (ctr) ctr.remove(); return; }
    if (!ctr) {
        ctr = document.createElement('div');
        ctr.id = '_counter_widget';
        Object.assign(ctr.style, {position:'absolute',zIndex:'50',pointerEvents:'none',textAlign:'center'});
        (document.getElementById('overlay')||document.body).appendChild(ctr);
    }
    _widgetPos(ctr, cfg.counter_position || 'top-right', '24px');
    const accent = cfg.counter_color || cfg.accent_color || '#7c3aed';
    const val = parseInt(cfg.counter_value) || 0;
    ctr.innerHTML = `
        <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:${accent};text-transform:uppercase;margin-bottom:2px;">${cfg.counter_label||'Followers'}</div>
        <div id="_counter_val" style="font-family:'Orbitron',sans-serif;font-size:36px;font-weight:900;color:${accent};text-shadow:0 0 20px ${accent}88;line-height:1;">${val}</div>`;
    if (cfg.counter_animate && !ctr._counted) {
        ctr._counted = true;
        let n=0,step=Math.max(1,Math.ceil(val/60));
        const iv=setInterval(()=>{n=Math.min(n+step,val);const el=document.getElementById('_counter_val');if(el)el.textContent=n;if(n>=val)clearInterval(iv);},16);
    }
}

// ─── QR Code Widget ───
function applyQrWidget(cfg) {
    let qr = document.getElementById('_qr_widget');
    if (!cfg.qr_widget || !cfg.qr_url) { if (qr) qr.remove(); return; }
    if (!qr) {
        qr = document.createElement('div');
        qr.id = '_qr_widget';
        Object.assign(qr.style, {position:'absolute',zIndex:'50',pointerEvents:'none',textAlign:'center'});
        (document.getElementById('overlay')||document.body).appendChild(qr);
    }
    _widgetPos(qr, cfg.qr_position || 'bottom-right', '24px');
    const size = Math.max(80, Math.min(300, parseInt(cfg.qr_size) || 180));
    const accent = cfg.accent_color || '#7c3aed';
    const encoded = encodeURIComponent(cfg.qr_url);
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?data=${encoded}&size=${size}x${size}&color=ffffff&bgcolor=00000000&format=png&margin=0`;
    const label = cfg.qr_label ? `<div style="font-family:'Poppins',sans-serif;font-size:11px;color:#ccc;margin-top:6px;text-align:center;">${cfg.qr_label}</div>` : '';
    qr.innerHTML = `<div style="background:rgba(0,0,0,0.7);border:1px solid ${accent}44;border-radius:10px;padding:10px;display:inline-block;"><img src="${qrSrc}" width="${size}" height="${size}" style="display:block;border-radius:6px;">${label}</div>`;
}

// ─── Last.fm Auto Now Playing ───
let _lastfmInterval = null;
function applyLastfm(cfg) {
    if (_lastfmInterval) { clearInterval(_lastfmInterval); _lastfmInterval = null; }
    if (!cfg.nowplaying_widget || !cfg.lastfm_username || !cfg.lastfm_api_key) return;
    function fetchTrack() {
        fetch(`/overlays/api/lastfm/${encodeURIComponent(cfg.lastfm_username)}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data || !data.track || !data.track.now_playing) return;
                const t = data.track;
                const text = `${t.name} — ${t.artist}`;
                const np = document.getElementById('_nowplaying_widget');
                if (np) { const el = np.querySelector('[data-np-text]'); if (el) el.textContent = text; }
            }).catch(() => {});
    }
    fetchTrack();
    _lastfmInterval = setInterval(fetchTrack, 15000);
}

// ─── Channel Points Reaction Handler ───
function handleChannelPointsReaction(reaction, event) {
    const effect = reaction.effect || 'color_flash';
    const duration = (parseFloat(reaction.duration) || 3) * 1000;
    const color = reaction.color || '#7c3aed';
    const overlay = document.getElementById('overlay') || document.body;

    if (effect === 'color_flash') {
        const flash = document.createElement('div');
        flash.style.cssText = `position:absolute;inset:0;background:${color};opacity:0;z-index:200;pointer-events:none;transition:opacity 0.15s;border-radius:inherit;`;
        overlay.appendChild(flash);
        requestAnimationFrame(() => { flash.style.opacity = '0.35'; });
        setTimeout(() => { flash.style.opacity = '0'; setTimeout(() => flash.remove(), 200); }, duration);
    } else if (effect === 'particle_burst') {
        const canvas = document.getElementById('particles') || document.getElementById('bg-effects');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const cx = canvas.width / 2, cy = canvas.height / 2;
            const bursts = Array.from({length:60}, () => ({
                x: cx, y: cy, vx: (Math.random()-.5)*12, vy: (Math.random()-.5)*12,
                r: Math.random()*4+2, life: 1
            }));
            function drawBurst() {
                bursts.forEach(p => {
                    p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.02;
                    if (p.life <= 0) return;
                    const rr=parseInt(color.slice(1,3),16), gg=parseInt(color.slice(3,5),16), bb=parseInt(color.slice(5,7),16);
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
                    ctx.fillStyle = `rgba(${rr},${gg},${bb},${p.life})`; ctx.fill();
                });
                if (bursts.some(p => p.life > 0)) requestAnimationFrame(drawBurst);
            }
            drawBurst();
        }
    } else if (effect === 'text_banner') {
        const text = reaction.text || event?.reward || 'Redeemed!';
        const name = event?.name || '';
        const banner = document.createElement('div');
        banner.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);z-index:200;pointer-events:none;text-align:center;transition:transform 0.3s cubic-bezier(.34,1.56,.64,1);`;
        banner.innerHTML = `<div style="background:rgba(0,0,0,0.85);border:2px solid ${color};border-radius:16px;padding:24px 48px;box-shadow:0 0 40px ${color}66;"><div style="font-family:'Orbitron',sans-serif;font-size:14px;letter-spacing:4px;color:${color};margin-bottom:6px;text-transform:uppercase;">${text}</div>${name ? `<div style="font-family:'Poppins',sans-serif;font-size:22px;color:#fff;font-weight:600;">${name}</div>` : ''}</div>`;
        overlay.appendChild(banner);
        requestAnimationFrame(() => { banner.style.transform = 'translate(-50%,-50%) scale(1)'; });
        setTimeout(() => { banner.style.transform = 'translate(-50%,-50%) scale(0)'; setTimeout(() => banner.remove(), 350); }, duration);
    }
}

