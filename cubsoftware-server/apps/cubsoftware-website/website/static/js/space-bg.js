/**
 * space-bg.js — Galaxy background
 * Rotating Earth centred; all 8 real planets + Moon + ISS pass in front.
 * Planet order, directions, y-positions and sizes randomised on every page load.
 * 10 ships (fighters / UFOs) fly in random directions with Discord member names.
 */
(function () {
    'use strict';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const CYCLE          = 300;
    const MOBILE         = window.innerWidth < 768;
    const DISCORD_INVITE = 'https://discord.gg/ngQXHUbnKg';

    /* ── Canvas ───────────────────────────────────────────── */
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;';
    document.body.appendChild(canvas);
    let W, H;
    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize);
    resize();

    /* ── Seeded RNG (stars only — deterministic) ──────────── */
    let _s = 42;
    function srng() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 0xFFFFFFFF; }

    /* ── Stars ────────────────────────────────────────────── */
    const TP = [3,4,5,6,10,12,15,25];
    const stars = Array.from({length: MOBILE ? 220 : 500}, () => ({
        x:srng(), y:srng(), r:srng()*2.2+0.4,
        tp:TP[0|srng()*TP.length], to:srng()*Math.PI*2,
        base:srng()*0.45+0.38,
        warm:srng()<0.10, cool:srng()<0.22, bright:srng()<0.06,
        fp:15+srng()*35, fph:srng()*Math.PI*2,  // slow fade-in/out cycle
    }));

    /* ── Nebulae ──────────────────────────────────────────── */
    const nebulae = [
        {x:0.22,y:0.24,r:0.55,rgb:'88,101,242', period:150,phase:0.0},
        {x:0.78,y:0.76,r:0.60,rgb:'124,58,237', period:100,phase:1.8},
        {x:0.50,y:0.50,r:0.44,rgb:'180,55,120', period: 75,phase:3.2},
        {x:0.72,y:0.18,r:0.44,rgb:'40,100,210', period: 50,phase:2.0},
        {x:0.20,y:0.72,r:0.42,rgb:'60,140,255', period:150,phase:1.2},
        {x:0.80,y:0.32,r:0.38,rgb:'100,50,200', period: 75,phase:4.1},
    ];

    /* ── Real planet colours ──────────────────────────────── */
    const BAND_SETS = {
        // Mercury — charcoal grey, Moon-like
        MERCURY: ['#8a8080','#787272','#968e8e','#6c6666','#a09898','#747070'],
        // Venus — uniform thick pale-yellow clouds (no surface visible)
        VENUS:   ['#f5e8b8','#f8ecc8','#f2e0a8','#faf4d0','#ece4b0','#f6ecbc','#f0e6b4'],
        // Mars — rust red-orange
        MARS:    ['#c04030','#d85848','#b02e20','#e06848','#9e2010','#cc5038','#b83828'],
        // Jupiter — cream/amber bands with equatorial orange belts
        JUPITER: ['#c86028','#f0c870','#a84e18','#f8dea0','#903c10','#e0b060','#b85030','#f4d088'],
        // Saturn — warm golden/amber banding
        SATURN:  ['#e8c864','#f8e898','#d4aa50','#fff2b8','#c09840','#ead878','#f2e090'],
        // Uranus — pale aqua/blue-green, nearly featureless
        URANUS:  ['#7de8d8','#96f0e6','#6ad4c4','#aafaf2','#5cc0b0','#88eade','#72dccf'],
        // Neptune — vivid deep cobalt blue
        NEPTUNE: ['#1038c0','#1848d8','#0c2cb0','#2058e8','#0820a0','#1540cc','#1030b8'],
        // Pluto — dark brownish grey with lighter patches
        PLUTO:   ['#8a6c60','#786050','#9a7c70','#6a4c40','#aa8880','#785a4c','#927060'],
    };

    const ATM = {
        MERCURY: '135,125,115',   // barely any
        VENUS:   '248,228,155',   // thick yellowish glow
        MARS:    '215,85,50',     // thin reddish-orange dust haze
        JUPITER: '215,130,45',
        SATURN:  '235,205,100',
        URANUS:  '120,228,220',   // aqua tint
        NEPTUNE: '20,60,225',     // deep blue
        PLUTO:   '120,100,90',    // almost none
    };

    /* ── Planet / Earth / Moon images ────────────────────── */
    const PLANET_IMGS = {};
    [['SUN',     '/static/images/Planets/sun.png'],
     ['EARTH',   '/static/images/Planets/earth.jpg'],
     ['MERCURY', '/static/images/Planets/mercury.png'],
     ['VENUS',   '/static/images/Planets/venus.png'],
     ['MARS',    '/static/images/Planets/mars.png'],
     ['JUPITER', '/static/images/Planets/jupiter.png'],
     ['SATURN',  '/static/images/Planets/saturn.png'],
     ['URANUS',  '/static/images/Planets/uranus.png'],
     ['NEPTUNE', '/static/images/Planets/neptune.png'],
     ['MOON',    '/static/images/Planets/moon.png'],
    ].forEach(([k,src])=>{ const i=new Image(); i.src=src; PLANET_IMGS[k]=i; });

    /* ── Draw planet ──────────────────────────────────────── */
    function drawPlanet(type, x, y, R) {
        const img = PLANET_IMGS[type];
        const atm = ATM[type] || '200,200,200';
        const atmStr = type==='MERCURY'||type==='PLUTO' ? 0.10 : type==='VENUS' ? 0.45 : 0.26;

        if (type==='SATURN') {
            // Saturn PNG has a dark background — use 'screen' blend mode so dark pixels
            // disappear, leaving only the planet body and rings visible.
            if (img && img.complete && img.naturalWidth) {
                const aspect = img.naturalHeight / img.naturalWidth;
                const iw = R * 4.4;
                const ih = iw * aspect;
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                ctx.drawImage(img, x - iw*0.5, y - ih*0.5, iw, ih);
                ctx.restore();
            }
            return;
        }

        // All other planets: everything inside the clipped circle — no outer ring
        // Draw image much larger than clip radius — crops the dark shadow/halo
        // baked into the planet PNGs so only the bare sphere shows
        const d = R * 3.8;
        ctx.save();
        ctx.beginPath(); ctx.arc(x,y,R,0,Math.PI*2); ctx.clip();
        if (img && img.complete && img.naturalWidth) {
            ctx.drawImage(img, x - d*0.5, y - d*0.5, d, d);
        } else {
            ctx.fillStyle='#334'; ctx.fillRect(x-R,y-R,R*2,R*2);
        }
        ctx.restore();
    }

    /* ── Draw Moon ────────────────────────────────────────── */
    function drawMoon(x, y, R, redAmount) {
        const img = PLANET_IMGS.MOON;
        const md = R * 3.8;
        ctx.save(); ctx.beginPath(); ctx.arc(x,y,R,0,Math.PI*2); ctx.clip();
        if (img && img.complete && img.naturalWidth) {
            ctx.drawImage(img, x - md*0.5, y - md*0.5, md, md);
        } else {
            ctx.fillStyle='#c4bcac'; ctx.fillRect(x-R,y-R,R*2,R*2);
        }
        if (redAmount > 0) {
            // Blood moon tint — opacity driven by redAmount (0→1)
            ctx.fillStyle = `rgba(180,30,0,${(0.62 * redAmount).toFixed(3)})`;
            ctx.fillRect(x-R, y-R, R*2, R*2);
        }
        ctx.restore();
    }

    /* ── Draw Earth (centred, rotating) ──────────────────── */
    function earthR() { return Math.min(W,H) * (MOBILE ? 0.22 : 0.32); }

    function drawEarth(t) {
        const cx=W*0.5, cy=H*0.5, R=earthR();
        const img = PLANET_IMGS.EARTH;

        // Scroll flat map texture horizontally — one full revolution per 120s
        // The map is drawn at R*2 height (fills the sphere diameter).
        // Width = R*2 * (naturalWidth/naturalHeight) to preserve the map's aspect ratio.
        // Two copies placed side-by-side ensure seamless wrapping.
        ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.clip();

        if (img && img.complete && img.naturalWidth) {
            // Draw taller than the clip circle so the poles (most distorted area of
            // equirectangular maps) are cropped out — only mid-latitudes (~±65°) show,
            // which is how a real globe looks. Equator stays centred on cy.
            const mapH  = R * 2.8;
            const mapW  = mapH * (img.naturalWidth / img.naturalHeight);
            const scrollX = ((t % 120) / 120) * mapW;
            const x0 = cx - mapW * 0.5 + scrollX;
            const y0 = cy - mapH * 0.5;   // centre equator on sphere centre
            ctx.drawImage(img, x0,            y0, mapW + 2, mapH);
            ctx.drawImage(img, x0 - mapW + 2, y0, mapW + 2, mapH);
        } else {
            ctx.fillStyle='#1a5fa0'; ctx.fillRect(cx-R,cy-R,R*2,R*2);
        }

        // Sphere shading — dark limb, light highlight (gives 3D look)
        const shade=ctx.createRadialGradient(cx-R*0.32,cy-R*0.30,R*0.06,cx+R*0.18,cy+R*0.18,R);
        shade.addColorStop(0,'rgba(255,255,255,0.14)'); shade.addColorStop(0.5,'rgba(0,0,0,0)'); shade.addColorStop(1,'rgba(0,0,0,0.55)');
        ctx.fillStyle=shade; ctx.fillRect(cx-R,cy-R,R*2,R*2);

        // Night-side shadow — sun is top-right, so left side is in shadow.
        // Linear gradient from dark-left to transparent-right creates a terminator line.
        const night=ctx.createLinearGradient(cx-R, cy, cx+R*0.25, cy);
        night.addColorStop(0,   'rgba(0,0,15,0.88)');
        night.addColorStop(0.30,'rgba(0,0,10,0.60)');
        night.addColorStop(0.55,'rgba(0,0,5,0.15)');
        night.addColorStop(0.68,'rgba(0,0,0,0)');
        ctx.fillStyle=night; ctx.fillRect(cx-R,cy-R,R*2,R*2);

        // Atmosphere edge — thin blue glow around the rim, drawn inside the clip
        const rim=ctx.createRadialGradient(cx,cy,R*0.82,cx,cy,R);
        rim.addColorStop(0,'rgba(80,160,255,0)'); rim.addColorStop(1,'rgba(80,160,255,0.35)');
        ctx.fillStyle=rim; ctx.fillRect(cx-R,cy-R,R*2,R*2);

        ctx.restore();
    }

    /* ── Moon always orbiting Earth ──────────────────────── */
    // Orbit is a wide flat ellipse — like a tilted ring around Earth.
    // sin(ang) < 0  →  upper arc  →  behind Earth
    // sin(ang) > 0  →  lower arc  →  in front of Earth
    const MOON_ORB_H = () => earthR() * 2.1;   // horizontal radius
    const MOON_ORB_V = () => earthR() * 0.55;  // vertical radius (flat perspective)
    function moonAngle(t) { return (t / 120) * Math.PI * 2; }
    function moonIsBehind(t) { return Math.sin(moonAngle(t)) < 0; }

    // Draw the orbit ring — pass front=false for the back arc (drawn before Earth),
    // front=true for the front arc (drawn after Earth)
    function drawOrbitRing(front) {
        const cx = W*0.5, cy = H*0.5;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.30)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        // front arc: angles 0→π (sin > 0, below centre = in front)
        // back arc:  angles π→2π (sin < 0, above centre = behind)
        ctx.ellipse(cx, cy, MOON_ORB_H(), MOON_ORB_V(), 0,
                    front ? 0 : Math.PI,
                    front ? Math.PI : Math.PI*2);
        ctx.stroke();
        ctx.restore();
    }

    let _moonWasBehind  = false;
    let _moonRedTarget  = 0;      // 0 = normal, 1 = full blood moon
    let _moonRedAmount  = 0;      // current interpolated intensity
    // Step per frame — at ~30fps a full transition takes ~110 seconds,
    // so the moon is still mid-fade when it reappears from behind Earth (~60s hidden).
    const MOON_RED_STEP = 0.0003;

    function drawOrbitingMoon(t) {
        const behind = moonIsBehind(t);

        if (behind && !_moonWasBehind) {
            // Moon just slipped behind Earth — decide this orbit's colour
            if (_moonRedTarget < 0.5) {
                // Currently normal: 1 in 10 chance of a blood moon
                if (Math.random() < 1 / 10) _moonRedTarget = 1;
            } else {
                // Currently red: end the blood moon next pass
                _moonRedTarget = 0;
            }
        }
        _moonWasBehind = behind;

        // Smoothly slide intensity toward target each frame
        if (_moonRedAmount < _moonRedTarget) {
            _moonRedAmount = Math.min(1, _moonRedAmount + MOON_RED_STEP);
        } else if (_moonRedAmount > _moonRedTarget) {
            _moonRedAmount = Math.max(0, _moonRedAmount - MOON_RED_STEP);
        }

        const cx  = W*0.5, cy = H*0.5;
        const ang = moonAngle(t);
        const mx  = cx + Math.cos(ang) * MOON_ORB_H();
        const my  = cy + Math.sin(ang) * MOON_ORB_V();
        drawMoon(mx, my, earthR() * 0.18, _moonRedAmount);
    }

    /* ── ISS orbiting Earth (fast, tight) ───────────────── */
    // ISS orbit is much tighter than the Moon and 4× faster
    const ISS_ORB_H = () => earthR() * 1.18;
    const ISS_ORB_V = () => earthR() * 0.32;
    function issAngle(t) { return (t / 28) * Math.PI * 2; }
    function issIsBehind(t) { return Math.sin(issAngle(t)) < 0; }

    function drawOrbitingISS(t) {
        const cx  = W*0.5, cy = H*0.5;
        const ang = issAngle(t);
        const ix  = cx + Math.cos(ang) * ISS_ORB_H();
        const iy  = cy + Math.sin(ang) * ISS_ORB_V();
        // Tangent direction so ISS faces the way it's travelling
        const tx  = -ISS_ORB_H() * Math.sin(ang);
        const ty  =  ISS_ORB_V() * Math.cos(ang);
        drawISS(ix, iy, Math.atan2(ty, tx));
    }

    /* ── Randomised pass events (different every page load) ── */
    // Sizes as fraction of min(W,H) — proportional to Earth (0.32),
    // capped so giants don't swamp the screen
    const PLANET_SIZES = {
        MERCURY:0.022, VENUS:0.058, MARS:0.034,
        JUPITER:0.180, SATURN:0.155,
        URANUS:0.090,  NEPTUNE:0.086, PLUTO:0.016,
        MOON:0.030,
    };

    /* ── Planet transit system ───────────────────────────── */
    // One planet at a time crosses the back arc (behind Earth/Moon).
    // It enters off-screen from one side, arcs over the top, exits off-screen
    // the other side. Fades in/out at the edges so there's no pop-in.
    const ORB_V_RATIO = 0.55 / 2.1; // same perspective tilt as Moon

    const PLANET_QUEUE = (() => {
        const all = ['MERCURY','VENUS','MARS','JUPITER','SATURN','URANUS','NEPTUNE','PLUTO'];
        all.sort(() => Math.random() - 0.5);
        const count = 4 + Math.floor(Math.random() * 3);
        return all.slice(0, count).map((type, i, arr) => {
            const frac   = arr.length > 1 ? i / (arr.length - 1) : 0;
            const hMult  = 4.0 + frac * 3.0 + (Math.random() - 0.5) * 0.3; // 3.9–7.1× earthR (further back)
            const arcDur = 45  + frac * 65   + Math.random() * 15;           // 45–125s crossing
            return { type, hMult, arcDur, dir: 1 }; // always left→right
        });
    })();

    let _pIdx      = 0;
    let _pStartMs  = performance.now();
    let _pGapMs    = 2000 + Math.random() * 6000;
    let _pInGap    = false;

    function drawActivePlanet() {
        const now     = performance.now();
        const def     = PLANET_QUEUE[_pIdx];
        const arcMs   = def.arcDur * 1000;
        const elapsed = now - _pStartMs;

        if (_pInGap) {
            if (elapsed >= _pGapMs) {
                _pIdx     = (_pIdx + 1) % PLANET_QUEUE.length;
                _pStartMs = now;
                _pGapMs   = 2000 + Math.random() * 6000;
                _pInGap   = false;
            }
            return;
        }

        if (elapsed >= arcMs) {
            _pStartMs = now;
            _pInGap   = true;
            return;
        }

        const progress = elapsed / arcMs;
        // Always left → right: angle sweeps π → 2π over the top (back arc)
        const ang    = Math.PI + progress * Math.PI;
        const sinAng = Math.sin(ang);
        // Fade over the first/last 30% of the sin range to avoid pop-in at edges
        const alpha  = Math.min(1, Math.abs(sinAng) / 0.30);

        const cx   = W * 0.5, cy = H * 0.5;
        const eR   = earthR();
        const orbH = eR * def.hMult;
        const orbV = orbH * ORB_V_RATIO;
        const px   = cx + Math.cos(ang) * orbH;
        const py   = cy + Math.sin(ang) * orbV;

        ctx.save();
        ctx.globalAlpha = alpha;
        drawPlanet(def.type, px, py, Math.min(W, H) * PLANET_SIZES[def.type]);
        ctx.restore();
    }

    /* ── ISS ──────────────────────────────────────────────── */
    const ISS_S = MOBILE ? 0.7 : 1.2;

    function drawISS(x, y, angle) {
        const s=ISS_S;
        ctx.save(); ctx.translate(x,y); ctx.rotate(angle !== undefined ? angle : -0.04);
        const tg=ctx.createLinearGradient(0,-s*0.42,0,s*0.42);
        tg.addColorStop(0,'#b8c2d4'); tg.addColorStop(0.5,'#dce6f4'); tg.addColorStop(1,'#8892a4');
        [-6.8,-3.4,3.4,6.8].forEach(px=>{
            [-1,1].forEach(side=>{
                const py0=side<0?-s*5.2:s*0.5;
                ctx.fillStyle='#1c2c44'; ctx.fillRect(s*px-s*0.72,py0,s*1.44,s*4.7);
                ctx.strokeStyle='#283c58'; ctx.lineWidth=0.9;
                for(let r=0;r<7;r++){ const yr=py0+r*s*0.67; ctx.beginPath(); ctx.moveTo(s*px-s*0.72,yr); ctx.lineTo(s*px+s*0.72,yr); ctx.stroke(); }
                ctx.beginPath(); ctx.moveTo(s*px,py0); ctx.lineTo(s*px,py0+s*4.7); ctx.stroke();
                ctx.fillStyle='rgba(180,148,52,0.14)'; ctx.fillRect(s*px-s*0.72,py0,s*1.44,s*4.7);
            });
        });
        ctx.fillStyle=tg; ctx.fillRect(-s*9,-s*0.42,s*18,s*0.84);
        [{x:-2.6,w:1.3,h:2.4,c:'#9ca4b4'},{x:-1.3,w:1.5,h:2.8,c:'#acb4c4'},
         {x:0.2,w:2.2,h:2.5,c:'#9098a8'},{x:2.4,w:1.3,h:2.2,c:'#a0a8b8'},{x:3.7,w:1.0,h:2.0,c:'#8890a0'}]
        .forEach(m=>{
            ctx.fillStyle=m.c; ctx.fillRect(s*m.x,-s*m.h*0.5,s*m.w,s*m.h);
            const mg=ctx.createLinearGradient(s*m.x,0,s*(m.x+m.w),0);
            mg.addColorStop(0,'rgba(255,255,255,0.20)'); mg.addColorStop(0.4,'rgba(255,255,255,0.06)'); mg.addColorStop(1,'rgba(0,0,0,0.24)');
            ctx.fillStyle=mg; ctx.fillRect(s*m.x,-s*m.h*0.5,s*m.w,s*m.h);
        });
        ctx.restore();
    }

    /* ── Ships: 2 on screen at a time, random paths ─────── */
    let memberData   = [
        {name:'EXPLORER',joinedAt:''},{name:'VOYAGER',joinedAt:''},
    ];
    let lastShuffle  = 0;

    function generateShipDefs() {
        const defs = [];
        const periods = [75, 100];
        for (let i=0; i<2; i++) {
            const phase    = Math.random();
            const sz       = MOBILE ? 5 : 10;
            const pathType = Math.floor(Math.random()*8);
            let x0,y0,x1,y1;
            switch(pathType) {
                case 0: x0=-0.12;y0=0.05+Math.random()*0.22;x1=1.12;y1=0.05+Math.random()*0.22; break;
                case 1: x0=1.12; y0=0.05+Math.random()*0.22;x1=-0.12;y1=0.05+Math.random()*0.22; break;
                case 2: x0=-0.12;y0=0.72+Math.random()*0.22;x1=1.12;y1=0.72+Math.random()*0.22; break;
                case 3: x0=1.12; y0=0.72+Math.random()*0.22;x1=-0.12;y1=0.72+Math.random()*0.22; break;
                case 4: x0=-0.12;y0=0.05+Math.random()*0.22;x1=1.12;y1=0.72+Math.random()*0.22; break;
                case 5: x0=1.12; y0=0.05+Math.random()*0.22;x1=-0.12;y1=0.72+Math.random()*0.22; break;
                case 6: x0=-0.12;y0=0.72+Math.random()*0.22;x1=1.12;y1=0.05+Math.random()*0.22; break;
                case 7: default: x0=1.12;y0=0.72+Math.random()*0.22;x1=-0.12;y1=0.05+Math.random()*0.22; break;
            }
            const wAmp = 0.012 + Math.random()*0.030;
            const STYPES=['ROCKET','UFO','SHUTTLE','SATELLITE','COMET','ASTEROID','PROBE'];
            defs.push({period:periods[i], phase, x0, y0, x1, y1, wAmp, s:sz, type:STYPES[Math.floor(Math.random()*STYPES.length)]});
        }
        return defs;
    }

    const SHIP_DEFS = generateShipDefs();
    const ships = SHIP_DEFS.map((def,i)=>({
        ...def,
        name:     memberData[i % memberData.length].name,
        joinedAt: memberData[i % memberData.length].joinedAt,
    }));

    function reshuffleShips() {
        lastShuffle = Date.now();
        const shuffled = [...memberData].sort(()=>Math.random()-0.5);
        ships.forEach((sh,i)=>{
            const m   = shuffled[i % shuffled.length] || {name:'???',joinedAt:''};
            sh.name   = m.name;
            sh.joinedAt = m.joinedAt;
            const _st=['ROCKET','UFO','SHUTTLE','SATELLITE','COMET','ASTEROID','PROBE'];
            sh.type   = _st[Math.floor(Math.random()*_st.length)];
        });
    }

    fetch('/api/space-members')
        .then(r=>r.json())
        .then(data=>{
            if (!Array.isArray(data)||!data.length) return;
            // API may return [{name,joinedAt}] or legacy [string]
            memberData = data.map(d=> typeof d==='string' ? {name:d,joinedAt:''} : d);
            reshuffleShips();
        })
        .catch(()=>{});

    function maybeReshuffle() {
        if (Date.now()-lastShuffle > 600000) reshuffleShips();
    }

    /* ── Hover card (HTML overlay above canvas) ───────────── */
    const hoverCard = document.createElement('div');
    hoverCard.style.cssText = [
        'position:fixed',
        'z-index:200',
        'pointer-events:none',
        'background:rgba(4,8,32,0.94)',
        'border:1.5px solid rgba(88,101,242,0.70)',
        'border-radius:10px',
        'padding:10px 16px',
        'font-family:"Courier New",monospace',
        'color:#fff',
        'font-size:13px',
        'display:none',
        'min-width:160px',
        'backdrop-filter:blur(12px)',
        'box-shadow:0 4px 28px rgba(0,0,0,0.70),0 0 18px rgba(88,101,242,0.25)',
        'line-height:1.5',
    ].join(';');
    document.body.appendChild(hoverCard);

    function formatJoinDate(iso) {
        if (!iso) return 'Unknown';
        try {
            return new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
        } catch(e) { return 'Unknown'; }
    }

    /* ── Ship click / hover ───────────────────────────────── */
    const activeShipRects = [];
    let hoveredShipIdx = -1;

    window.addEventListener('click', e=>{
        if (e.target.closest('a,button,input,select,textarea,[role="button"]')) return;
        const mx=e.clientX, my=e.clientY;
        if (activeShipRects.some(r=>Math.abs(mx-r.x)<r.hw&&Math.abs(my-r.y)<r.hh))
            window.open(DISCORD_INVITE,'_blank');
    });

    window.addEventListener('mousemove', e=>{
        const mx=e.clientX, my=e.clientY;
        const hit = activeShipRects.find(r=>Math.abs(mx-r.x)<r.hw&&Math.abs(my-r.y)<r.hh);
        if (hit) {
            hoveredShipIdx = hit.idx;
            document.body.style.cursor = 'pointer';
            const sh = ships[hit.idx];
            const typeAccent = {ROCKET:'#88aaff',UFO:'#66ffaa',SHUTTLE:'#aaddff',SATELLITE:'#ffdd88',COMET:'#88ccff',ASTEROID:'#cc9966',PROBE:'#88ddff'};
            const typeIcon   = {ROCKET:'🚀',UFO:'👾',SHUTTLE:'🛸',SATELLITE:'📡',COMET:'☄️',ASTEROID:'🪨',PROBE:'🔭'};
            const accent = typeAccent[sh.type] || '#88aaff';
            const icon   = typeIcon[sh.type]   || '🚀';
            hoverCard.innerHTML = `
                <div style="font-size:11px;color:${accent};letter-spacing:1.5px;margin-bottom:4px">${icon} ${sh.type}</div>
                <div style="font-size:15px;font-weight:bold;color:#fff;margin-bottom:6px">${sh.name}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.55)">Joined server</div>
                <div style="font-size:12px;color:${accent}">${formatJoinDate(sh.joinedAt)}</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:6px">Click to join Discord</div>`;
            // Position card above cursor, keep on screen
            const cw = 190, ch = 100;
            let cx2 = mx + 14;
            let cy2 = my - ch - 12;
            if (cx2 + cw > window.innerWidth)  cx2 = mx - cw - 14;
            if (cy2 < 8) cy2 = my + 14;
            hoverCard.style.left  = cx2 + 'px';
            hoverCard.style.top   = cy2 + 'px';
            hoverCard.style.display = 'block';
        } else {
            hoveredShipIdx = -1;
            document.body.style.cursor = '';
            hoverCard.style.display = 'none';
        }
    },{passive:true});

    /* ── Draw Rocket ─────────────────────────────────────── */
    function drawRocket(x, y, a, s, name, hovered) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);

        /* ── Exhaust plume ── */
        // Soft pink/purple outer glow
        const eg = ctx.createRadialGradient(-s*0.65, 0, 0, -s*0.65, 0, s*3.0);
        eg.addColorStop(0,   'rgba(255,200,240,0.65)');
        eg.addColorStop(0.30,'rgba(220,100,200,0.22)');
        eg.addColorStop(0.65,'rgba(150,60,180,0.08)');
        eg.addColorStop(1,   'rgba(100,40,160,0)');
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.arc(-s*0.65, 0, s*3.0, 0, Math.PI*2); ctx.fill();
        // Tapered plume body
        const pc = ctx.createLinearGradient(-s*3.2, 0, -s*0.62, 0);
        pc.addColorStop(0,    'rgba(255,255,255,0)');
        pc.addColorStop(0.35, 'rgba(255,230,240,0.28)');
        pc.addColorStop(0.72, 'rgba(255,190,230,0.72)');
        pc.addColorStop(1,    'rgba(255,255,255,1.0)');
        ctx.beginPath();
        ctx.moveTo(-s*0.62, -s*0.26);
        ctx.bezierCurveTo(-s*1.6, -s*0.50, -s*2.9, -s*0.22, -s*3.2, 0);
        ctx.bezierCurveTo(-s*2.9,  s*0.22, -s*1.6,  s*0.50, -s*0.62, s*0.26);
        ctx.closePath();
        ctx.fillStyle = pc; ctx.fill();
        // Bright hot core
        const ic = ctx.createLinearGradient(-s*2.0, 0, -s*0.62, 0);
        ic.addColorStop(0, 'rgba(255,255,255,0)');
        ic.addColorStop(1, 'rgba(255,252,220,0.92)');
        ctx.beginPath();
        ctx.moveTo(-s*0.62, -s*0.11);
        ctx.lineTo(-s*2.00, 0);
        ctx.lineTo(-s*0.62,  s*0.11);
        ctx.closePath();
        ctx.fillStyle = ic; ctx.fill();

        /* ── Swept fins (drawn behind body) ── */
        const fg = ctx.createLinearGradient(-s*0.62, -s*0.40, s*0.15, s*0.40);
        fg.addColorStop(0,   '#b040c8');
        fg.addColorStop(0.5, '#9050d8');
        fg.addColorStop(1,   '#c870e8');
        // Top fin
        ctx.beginPath();
        ctx.moveTo( s*0.10, -s*0.40);
        ctx.bezierCurveTo(s*0.02, -s*0.85, -s*0.20, -s*1.20, -s*0.62, -s*1.08);
        ctx.lineTo(-s*0.62, -s*0.40);
        ctx.closePath();
        ctx.fillStyle = fg; ctx.fill();
        // Bottom fin
        ctx.beginPath();
        ctx.moveTo( s*0.10,  s*0.40);
        ctx.bezierCurveTo(s*0.02,  s*0.85, -s*0.20,  s*1.20, -s*0.62,  s*1.08);
        ctx.lineTo(-s*0.62,  s*0.40);
        ctx.closePath();
        ctx.fillStyle = fg; ctx.fill();
        // Fin highlight sheen
        ctx.strokeStyle = 'rgba(220,160,255,0.40)';
        ctx.lineWidth   = s * 0.04;
        ctx.beginPath();
        ctx.moveTo(s*0.05, -s*0.40);
        ctx.bezierCurveTo(s*0.00, -s*0.75, -s*0.18, -s*1.0, -s*0.58, -s*0.95);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s*0.05,  s*0.40);
        ctx.bezierCurveTo(s*0.00,  s*0.75, -s*0.18,  s*1.0, -s*0.58,  s*0.95);
        ctx.stroke();

        /* ── Body (white-lavender cylinder) ── */
        const bg = ctx.createLinearGradient(0, -s*0.40, 0, s*0.40);
        bg.addColorStop(0,    '#ede8ff');
        bg.addColorStop(0.22, '#ffffff');
        bg.addColorStop(0.62, '#dcd4f8');
        bg.addColorStop(1,    '#b8a8e8');
        ctx.beginPath();
        ctx.moveTo( s*0.62, -s*0.40);
        ctx.lineTo(-s*0.62, -s*0.40);
        ctx.arc(-s*0.62, 0, s*0.40, -Math.PI/2, Math.PI/2); // rounded rear
        ctx.lineTo( s*0.62,  s*0.40);
        ctx.closePath();
        ctx.fillStyle = bg; ctx.fill();

        /* ── Nose dome (blue-purple) ── */
        const ng = ctx.createLinearGradient(s*0.62, -s*0.40, s*1.70, s*0.40);
        ng.addColorStop(0,    '#d0c8ff');
        ng.addColorStop(0.28, '#9080f0');
        ng.addColorStop(0.65, '#6858e8');
        ng.addColorStop(1,    '#4040b8');
        ctx.beginPath();
        ctx.moveTo(s*0.62, -s*0.40);
        ctx.bezierCurveTo(s*1.22, -s*0.40, s*1.70, -s*0.20, s*1.70, 0);
        ctx.bezierCurveTo(s*1.70,  s*0.20, s*1.22,  s*0.40, s*0.62, s*0.40);
        ctx.closePath();
        ctx.fillStyle = ng; ctx.fill();
        // Dome specular highlight (bright star flare)
        const nh = ctx.createRadialGradient(s*1.28, -s*0.20, 0, s*1.28, -s*0.20, s*0.30);
        nh.addColorStop(0,   'rgba(255,255,255,0.95)');
        nh.addColorStop(0.35,'rgba(200,210,255,0.45)');
        nh.addColorStop(1,   'rgba(130,150,255,0)');
        ctx.fillStyle = nh;
        ctx.beginPath(); ctx.arc(s*1.28, -s*0.20, s*0.30, 0, Math.PI*2); ctx.fill();

        /* ── Separation rings ── */
        ctx.strokeStyle = 'rgba(160,130,220,0.65)';
        ctx.lineWidth   = s * 0.06;
        ctx.beginPath(); ctx.moveTo(s*0.62, -s*0.40); ctx.lineTo(s*0.62, s*0.40); ctx.stroke();
        ctx.lineWidth   = s * 0.04;
        ctx.beginPath(); ctx.moveTo(-s*0.05, -s*0.40); ctx.lineTo(-s*0.05, s*0.40); ctx.stroke();

        /* ── Body top-edge specular sheen ── */
        const sh2 = ctx.createLinearGradient(0, -s*0.40, 0, -s*0.18);
        sh2.addColorStop(0, 'rgba(255,255,255,0.52)');
        sh2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.moveTo( s*0.62, -s*0.40);
        ctx.lineTo(-s*0.62, -s*0.40);
        ctx.lineTo(-s*0.62, -s*0.18);
        ctx.lineTo( s*0.62, -s*0.18);
        ctx.closePath();
        ctx.fillStyle = sh2; ctx.fill();

        /* ── Name label ── */
        if (name) {
            const fs = Math.max(12, s*1.4);
            ctx.save(); ctx.rotate(-a);
            ctx.font        = `bold ${fs}px 'Courier New',monospace`;
            ctx.textAlign   = 'center';
            const tw = ctx.measureText(name).width;
            ctx.shadowColor = '#c090ff';
            ctx.shadowBlur  = hovered ? 22 : 8;
            ctx.fillStyle   = hovered ? 'rgba(4,4,32,0.92)' : 'rgba(4,4,24,0.80)';
            ctx.beginPath(); ctx.roundRect(-(tw/2+7), -s*2.8-fs, tw+14, fs+9, 5); ctx.fill();
            ctx.strokeStyle = hovered ? 'rgba(190,150,255,0.90)' : 'rgba(190,150,255,0.55)';
            ctx.lineWidth   = hovered ? 1.8 : 1.0; ctx.stroke();
            ctx.fillStyle   = hovered ? '#ffffff' : '#ddc0ff';
            ctx.fillText(name, 0, -s*2.8);
            ctx.shadowBlur  = 0;
            ctx.restore();
        }
        ctx.restore();
    }

    /* ── Draw UFO ─────────────────────────────────────────── */
    function drawUFO(x, y, a, s, name, t, hovered) {
        ctx.save(); ctx.translate(x, y);

        /* ── Outer glow field ── */
        const gf = ctx.createRadialGradient(0, 0, 0, 0, 0, s*2.4);
        gf.addColorStop(0,   'rgba(30,80,255,0.20)');
        gf.addColorStop(0.5, 'rgba(10,50,200,0.07)');
        gf.addColorStop(1,   'rgba(0,30,160,0)');
        ctx.fillStyle = gf;
        ctx.beginPath(); ctx.arc(0, 0, s*2.4, 0, Math.PI*2); ctx.fill();

        /* ── Tractor beam ── */
        const tb = ctx.createLinearGradient(0, s*0.28, 0, s*2.6);
        tb.addColorStop(0,   'rgba(0,200,255,0.30)');
        tb.addColorStop(0.5, 'rgba(0,140,255,0.12)');
        tb.addColorStop(1,   'rgba(0,80,220,0)');
        ctx.beginPath();
        ctx.moveTo(-s*0.30, s*0.28);
        ctx.lineTo(-s*1.20, s*2.6);
        ctx.lineTo( s*1.20, s*2.6);
        ctx.lineTo( s*0.30, s*0.28);
        ctx.closePath();
        ctx.fillStyle = tb; ctx.fill();

        /* ── Main disc body ── */
        ctx.save(); ctx.scale(1, 0.36);
        const dg = ctx.createRadialGradient(-s*0.30, -s*0.40, 0, 0, 0, s*1.18);
        dg.addColorStop(0,   '#4a6ee0');
        dg.addColorStop(0.35,'#1a3aa8');
        dg.addColorStop(0.72,'#0d2278');
        dg.addColorStop(1,   '#070f48');
        ctx.beginPath(); ctx.arc(0, 0, s*1.18, 0, Math.PI*2);
        ctx.fillStyle = dg; ctx.fill();
        ctx.strokeStyle = 'rgba(60,140,255,0.60)'; ctx.lineWidth = s*0.14; ctx.stroke();
        ctx.restore();

        /* ── Disc rim inner ring ── */
        ctx.save(); ctx.scale(1, 0.36);
        ctx.beginPath(); ctx.arc(0, 0, s*0.92, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(0,200,255,0.30)'; ctx.lineWidth = s*0.08; ctx.stroke();
        ctx.restore();

        /* ── Bottom hull bowl ── */
        ctx.save(); ctx.scale(1, 0.52);
        const bowl = ctx.createRadialGradient(0, s*0.40, 0, 0, s*0.40, s*0.58);
        bowl.addColorStop(0,   '#2244b8');
        bowl.addColorStop(0.6, '#0c1c70');
        bowl.addColorStop(1,   '#050c3a');
        ctx.beginPath(); ctx.arc(0, s*0.54, s*0.54, 0, Math.PI*2);
        ctx.fillStyle = bowl; ctx.fill();
        ctx.strokeStyle = 'rgba(0,180,255,0.45)'; ctx.lineWidth = s*0.08; ctx.stroke();
        ctx.restore();

        /* ── Bottom bowl glow panels (3 windows) ── */
        for (let i = 0; i < 3; i++) {
            const bx = (i - 1) * s * 0.38;
            const by = s * 0.32;
            const wg = ctx.createRadialGradient(bx, by, 0, bx, by, s*0.14);
            wg.addColorStop(0,   'rgba(0,235,255,0.95)');
            wg.addColorStop(0.5, 'rgba(0,160,255,0.55)');
            wg.addColorStop(1,   'rgba(0,100,220,0)');
            ctx.fillStyle = wg;
            ctx.beginPath(); ctx.ellipse(bx, by, s*0.13, s*0.08, 0, 0, Math.PI*2); ctx.fill();
        }

        /* ── Rim windows (6 rotating glowing ovals) ── */
        const rimAng = (t / 10) * Math.PI * 2;
        for (let i = 0; i < 6; i++) {
            const ra    = rimAng + (i / 6) * Math.PI * 2;
            const wx    = Math.cos(ra) * s * 0.84;
            const wy    = Math.sin(ra) * s * 0.84 * 0.36;
            const pulse = 0.60 + Math.sin(rimAng * 2 + i * 1.05) * 0.28;
            const ww    = ctx.createRadialGradient(wx, wy, 0, wx, wy, s*0.15);
            ww.addColorStop(0,   `rgba(0,230,255,${pulse.toFixed(2)})`);
            ww.addColorStop(0.5, `rgba(0,150,240,${(pulse*0.45).toFixed(2)})`);
            ww.addColorStop(1,   'rgba(0,90,200,0)');
            ctx.fillStyle = ww;
            ctx.beginPath(); ctx.ellipse(wx, wy, s*0.15, s*0.09, 0, 0, Math.PI*2); ctx.fill();
        }

        /* ── Dome ── */
        const dome = ctx.createRadialGradient(-s*0.20, -s*0.54, 0, 0, -s*0.28, s*0.58);
        dome.addColorStop(0,    'rgba(150,205,255,0.95)');
        dome.addColorStop(0.28, 'rgba(50,120,230,0.92)');
        dome.addColorStop(0.68, 'rgba(12,55,185,0.94)');
        dome.addColorStop(1,    'rgba(4,18,90,0.96)');
        ctx.beginPath(); ctx.ellipse(0, -s*0.08, s*0.58, s*0.60, 0, Math.PI, 0);
        ctx.fillStyle = dome; ctx.fill();
        ctx.strokeStyle = 'rgba(70,150,255,0.50)'; ctx.lineWidth = s*0.05; ctx.stroke();

        /* ── Dome specular highlight ── */
        const dh = ctx.createRadialGradient(-s*0.18, -s*0.50, 0, -s*0.18, -s*0.50, s*0.24);
        dh.addColorStop(0,   'rgba(255,255,255,0.90)');
        dh.addColorStop(0.40,'rgba(180,215,255,0.38)');
        dh.addColorStop(1,   'rgba(100,160,255,0)');
        ctx.fillStyle = dh;
        ctx.beginPath(); ctx.arc(-s*0.18, -s*0.50, s*0.24, 0, Math.PI*2); ctx.fill();

        /* ── Name label ── */
        if (name) {
            const fs = Math.max(12, s*1.4);
            ctx.font        = `bold ${fs}px 'Courier New',monospace`;
            ctx.textAlign   = 'center';
            const tw = ctx.measureText(name).width;
            ctx.shadowColor = '#00d4ff';
            ctx.shadowBlur  = hovered ? 22 : 8;
            ctx.fillStyle   = hovered ? 'rgba(4,4,32,0.92)' : 'rgba(4,4,24,0.80)';
            ctx.beginPath(); ctx.roundRect(-(tw/2+7), -s*2.4-fs, tw+14, fs+9, 5); ctx.fill();
            ctx.strokeStyle = hovered ? 'rgba(0,210,255,0.90)' : 'rgba(0,210,255,0.50)';
            ctx.lineWidth   = hovered ? 1.8 : 1.0; ctx.stroke();
            ctx.fillStyle   = hovered ? '#ffffff' : '#80e8ff';
            ctx.fillText(name, 0, -s*2.4);
            ctx.shadowBlur  = 0;
        }
        ctx.restore();
    }

    /* ── Draw Space Shuttle ──────────────────────────────── */
    function drawShuttle(x, y, a, s, name, hovered) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);

        /* ── Delta wings ── */
        const wg = ctx.createLinearGradient(0, -s*1.6, 0, s*1.6);
        wg.addColorStop(0,'#c8ccd8'); wg.addColorStop(1,'#8890a8');
        // Upper (top) wing
        ctx.beginPath();
        ctx.moveTo( s*1.2, -s*0.28);
        ctx.lineTo(-s*1.8, -s*0.28);
        ctx.lineTo(-s*1.8, -s*1.8);
        ctx.closePath();
        ctx.fillStyle=wg; ctx.fill();
        // Lower wing (mirror)
        ctx.beginPath();
        ctx.moveTo( s*1.2,  s*0.28);
        ctx.lineTo(-s*1.8,  s*0.28);
        ctx.lineTo(-s*1.8,  s*1.8);
        ctx.closePath();
        ctx.fillStyle=wg; ctx.fill();

        /* ── Fuselage ── */
        const bg = ctx.createLinearGradient(0,-s*0.55,0,s*0.55);
        bg.addColorStop(0,'#f2f4ff'); bg.addColorStop(0.45,'#e8ecf8'); bg.addColorStop(1,'#b8bcd0');
        ctx.beginPath();
        ctx.moveTo( s*2.2, 0);
        ctx.bezierCurveTo( s*2.2,-s*0.28, s*1.8,-s*0.55, s*1.2,-s*0.55);
        ctx.lineTo(-s*1.8,-s*0.55);
        ctx.arc(-s*1.8, 0, s*0.55, -Math.PI/2, Math.PI/2);
        ctx.lineTo( s*1.2, s*0.55);
        ctx.bezierCurveTo( s*1.8, s*0.55, s*2.2, s*0.28, s*2.2, 0);
        ctx.closePath();
        ctx.fillStyle=bg; ctx.fill();

        /* ── Black thermal tiles (underside) ── */
        ctx.beginPath();
        ctx.moveTo( s*2.2, 0);
        ctx.bezierCurveTo( s*2.2, s*0.14, s*2.0, s*0.36, s*1.6, s*0.46);
        ctx.lineTo(-s*1.6, s*0.46);
        ctx.lineTo(-s*1.6, s*0.55);
        ctx.lineTo( s*1.2, s*0.55);
        ctx.bezierCurveTo( s*1.8, s*0.55, s*2.2, s*0.28, s*2.2, 0);
        ctx.closePath();
        ctx.fillStyle='#1c1e2e'; ctx.fill();

        /* ── Vertical tail fin ── */
        ctx.beginPath();
        ctx.moveTo(-s*0.7,-s*0.55); ctx.lineTo(-s*1.8,-s*0.55); ctx.lineTo(-s*1.8,-s*1.4); ctx.closePath();
        ctx.fillStyle='#dde0f0'; ctx.fill();

        /* ── Engine nozzles (3) ── */
        [-s*0.26, 0, s*0.26].forEach(oy=>{
            ctx.beginPath(); ctx.ellipse(-s*1.8, oy, s*0.14, s*0.20, 0, 0, Math.PI*2);
            ctx.fillStyle='#1a2240'; ctx.fill();
            ctx.strokeStyle='#344460'; ctx.lineWidth=s*0.04; ctx.stroke();
            const eg=ctx.createRadialGradient(-s*1.8,oy,0,-s*1.8,oy,s*0.10);
            eg.addColorStop(0,'rgba(200,160,255,0.95)'); eg.addColorStop(1,'rgba(100,80,200,0)');
            ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(-s*1.8,oy,s*0.10,0,Math.PI*2); ctx.fill();
        });

        /* ── Cargo bay outline ── */
        ctx.strokeStyle='rgba(160,180,220,0.45)'; ctx.lineWidth=s*0.03;
        ctx.beginPath(); ctx.roundRect(-s*0.8,-s*0.50,s*1.6,s*0.22,s*0.04); ctx.stroke();

        /* ── Cockpit window ── */
        ctx.beginPath(); ctx.ellipse(s*1.48,-s*0.19,s*0.19,s*0.14,0.3,0,Math.PI*2);
        ctx.fillStyle='#4a80cc'; ctx.fill();
        ctx.strokeStyle='rgba(180,220,255,0.55)'; ctx.lineWidth=s*0.03; ctx.stroke();

        /* ── Top sheen ── */
        const sh2=ctx.createLinearGradient(0,-s*0.55,0,-s*0.22);
        sh2.addColorStop(0,'rgba(255,255,255,0.45)'); sh2.addColorStop(1,'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.moveTo( s*1.2,-s*0.55); ctx.lineTo(-s*1.8,-s*0.55);
        ctx.lineTo(-s*1.8,-s*0.28); ctx.lineTo( s*1.2,-s*0.28);
        ctx.closePath(); ctx.fillStyle=sh2; ctx.fill();

        /* ── Label ── */
        if (name) {
            const fs=Math.max(12,s*1.4);
            ctx.save(); ctx.rotate(-a);
            ctx.font=`bold ${fs}px 'Courier New',monospace`; ctx.textAlign='center';
            const tw=ctx.measureText(name).width;
            ctx.shadowColor='#aaddff'; ctx.shadowBlur=hovered?22:8;
            ctx.fillStyle=hovered?'rgba(4,4,32,0.92)':'rgba(4,4,24,0.80)';
            ctx.beginPath(); ctx.roundRect(-(tw/2+7),-s*3.2-fs,tw+14,fs+9,5); ctx.fill();
            ctx.strokeStyle=hovered?'rgba(170,210,255,0.90)':'rgba(170,210,255,0.55)';
            ctx.lineWidth=hovered?1.8:1.0; ctx.stroke();
            ctx.fillStyle=hovered?'#ffffff':'#c8e8ff';
            ctx.fillText(name,0,-s*3.2); ctx.shadowBlur=0;
            ctx.restore();
        }
        ctx.restore();
    }

    /* ── Draw Satellite ──────────────────────────────────── */
    function drawSatellite(x, y, a, s, name, t, hovered) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);

        /* ── Label (before tumble, stays upright) ── */
        if (name) {
            const fs=Math.max(12,s*1.4);
            ctx.save(); ctx.rotate(-a);
            ctx.font=`bold ${fs}px 'Courier New',monospace`; ctx.textAlign='center';
            const tw=ctx.measureText(name).width;
            ctx.shadowColor='#ffdd88'; ctx.shadowBlur=hovered?22:8;
            ctx.fillStyle=hovered?'rgba(4,4,32,0.92)':'rgba(4,4,24,0.80)';
            ctx.beginPath(); ctx.roundRect(-(tw/2+7),-s*4.0-fs,tw+14,fs+9,5); ctx.fill();
            ctx.strokeStyle=hovered?'rgba(255,220,100,0.90)':'rgba(255,220,100,0.55)';
            ctx.lineWidth=hovered?1.8:1.0; ctx.stroke();
            ctx.fillStyle=hovered?'#ffffff':'#ffe8a0';
            ctx.fillText(name,0,-s*4.0); ctx.shadowBlur=0;
            ctx.restore();
        }

        /* ── Tumble rotation ── */
        ctx.rotate((t/30)*Math.PI*2);

        /* ── Solar panels ── */
        const pw=s*2.4, ph=s*0.7;
        const panG=ctx.createLinearGradient(0,-ph*0.5,0,ph*0.5);
        panG.addColorStop(0,'#1a3a6a'); panG.addColorStop(0.5,'#1e4a88'); panG.addColorStop(1,'#0d2248');
        [-1,1].forEach(side=>{
            const ox=side*(s*0.5);
            const ex=side>0?ox:ox-pw;
            ctx.beginPath(); ctx.rect(ex,-ph*0.5,pw,ph);
            ctx.fillStyle=panG; ctx.fill();
            // Grid lines
            ctx.strokeStyle='rgba(60,120,200,0.40)'; ctx.lineWidth=s*0.025;
            for(let c=1;c<4;c++){
                const px2=ex+c*(pw/4);
                ctx.beginPath(); ctx.moveTo(px2,-ph*0.5); ctx.lineTo(px2,ph*0.5); ctx.stroke();
            }
            ctx.beginPath(); ctx.moveTo(ex,0); ctx.lineTo(ex+pw,0); ctx.stroke();
            ctx.strokeStyle='rgba(80,160,255,0.50)'; ctx.lineWidth=s*0.04;
            ctx.beginPath(); ctx.rect(ex,-ph*0.5,pw,ph); ctx.stroke();
        });

        /* ── Main body (gold foil) ── */
        const bodyG=ctx.createLinearGradient(-s*0.5,-s*0.5,s*0.5,s*0.5);
        bodyG.addColorStop(0,'#f0c850'); bodyG.addColorStop(0.4,'#e8a830'); bodyG.addColorStop(1,'#a06010');
        ctx.beginPath(); ctx.rect(-s*0.5,-s*0.5,s,s);
        ctx.fillStyle=bodyG; ctx.fill();
        ctx.strokeStyle='rgba(255,200,80,0.55)'; ctx.lineWidth=s*0.05; ctx.stroke();
        // Detail lines
        ctx.strokeStyle='rgba(200,150,40,0.45)'; ctx.lineWidth=s*0.03;
        for(let i=1;i<4;i++){
            const bx=-s*0.5+i*(s/4);
            ctx.beginPath(); ctx.moveTo(bx,-s*0.5); ctx.lineTo(bx,s*0.5); ctx.stroke();
        }
        // Body sheen
        const shG=ctx.createLinearGradient(-s*0.5,-s*0.5,s*0.5,-s*0.1);
        shG.addColorStop(0,'rgba(255,255,200,0.35)'); shG.addColorStop(1,'rgba(255,255,200,0)');
        ctx.fillStyle=shG; ctx.beginPath(); ctx.rect(-s*0.5,-s*0.5,s,s); ctx.fill();

        /* ── Dish ── */
        ctx.beginPath(); ctx.ellipse(0,-s*0.5,s*0.34,s*0.20,0,Math.PI,0);
        ctx.fillStyle='rgba(200,210,230,0.85)'; ctx.fill();
        ctx.strokeStyle='#c0c4d0'; ctx.lineWidth=s*0.06; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0,-s*0.5); ctx.lineTo(0,-s*0.82);
        ctx.strokeStyle='#a0a8b8'; ctx.lineWidth=s*0.04; ctx.stroke();

        /* ── Antenna ── */
        ctx.beginPath();
        ctx.moveTo(0,s*0.5); ctx.lineTo(0,s*1.0); ctx.lineTo(s*0.30,s*1.4);
        ctx.strokeStyle='#c0c8d8'; ctx.lineWidth=s*0.04; ctx.stroke();

        ctx.restore();
    }

    /* ── Draw Comet ──────────────────────────────────────── */
    function drawComet(x, y, a, s, name, hovered) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);

        const tl=s*8.0;

        /* ── Dust tail ── */
        const dustG=ctx.createLinearGradient(-tl,0,-s*0.8,0);
        dustG.addColorStop(0,'rgba(255,255,255,0)');
        dustG.addColorStop(0.5,'rgba(200,230,255,0.10)');
        dustG.addColorStop(0.85,'rgba(230,245,255,0.32)');
        dustG.addColorStop(1,'rgba(255,255,255,0.58)');
        ctx.beginPath();
        ctx.moveTo(-s*0.8,-s*0.30);
        ctx.bezierCurveTo(-s*3.0,-s*0.65,-tl,-s*0.18,-tl,0);
        ctx.bezierCurveTo(-tl, s*0.18,-s*3.0, s*0.65,-s*0.8, s*0.30);
        ctx.closePath();
        ctx.fillStyle=dustG; ctx.fill();

        /* ── Ion tail (blue, narrower) ── */
        const ionG=ctx.createLinearGradient(-tl*0.80,0,-s*0.8,0);
        ionG.addColorStop(0,'rgba(100,180,255,0)');
        ionG.addColorStop(0.6,'rgba(140,200,255,0.13)');
        ionG.addColorStop(1,'rgba(160,220,255,0.38)');
        ctx.beginPath();
        ctx.moveTo(-s*0.8,-s*0.12);
        ctx.bezierCurveTo(-s*2.5,-s*0.26,-tl*0.80,-s*0.08,-tl*0.80,0);
        ctx.bezierCurveTo(-tl*0.80, s*0.08,-s*2.5, s*0.26,-s*0.8, s*0.12);
        ctx.closePath();
        ctx.fillStyle=ionG; ctx.fill();

        /* ── Coma glow ── */
        const comaG=ctx.createRadialGradient(0,0,0,0,0,s*1.6);
        comaG.addColorStop(0,'rgba(220,240,255,0.80)');
        comaG.addColorStop(0.4,'rgba(160,210,255,0.32)');
        comaG.addColorStop(0.8,'rgba(80,160,255,0.10)');
        comaG.addColorStop(1,'rgba(40,120,255,0)');
        ctx.fillStyle=comaG; ctx.beginPath(); ctx.arc(0,0,s*1.6,0,Math.PI*2); ctx.fill();

        /* ── Nucleus ── */
        const nucG=ctx.createRadialGradient(-s*0.22,-s*0.22,0,0,0,s*0.7);
        nucG.addColorStop(0,'#ffffff'); nucG.addColorStop(0.3,'#d0e8ff');
        nucG.addColorStop(0.7,'#8ab8e8'); nucG.addColorStop(1,'#3060a0');
        ctx.beginPath(); ctx.arc(0,0,s*0.7,0,Math.PI*2);
        ctx.fillStyle=nucG; ctx.fill();
        // Specular
        const sp=ctx.createRadialGradient(-s*0.24,-s*0.24,0,-s*0.24,-s*0.24,s*0.24);
        sp.addColorStop(0,'rgba(255,255,255,0.95)'); sp.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=sp; ctx.beginPath(); ctx.arc(-s*0.24,-s*0.24,s*0.24,0,Math.PI*2); ctx.fill();

        /* ── Label ── */
        if (name) {
            const fs=Math.max(12,s*1.4);
            ctx.save(); ctx.rotate(-a);
            ctx.font=`bold ${fs}px 'Courier New',monospace`; ctx.textAlign='center';
            const tw=ctx.measureText(name).width;
            ctx.shadowColor='#88ccff'; ctx.shadowBlur=hovered?22:8;
            ctx.fillStyle=hovered?'rgba(4,4,32,0.92)':'rgba(4,4,24,0.80)';
            ctx.beginPath(); ctx.roundRect(-(tw/2+7),-s*2.8-fs,tw+14,fs+9,5); ctx.fill();
            ctx.strokeStyle=hovered?'rgba(150,200,255,0.90)':'rgba(150,200,255,0.55)';
            ctx.lineWidth=hovered?1.8:1.0; ctx.stroke();
            ctx.fillStyle=hovered?'#ffffff':'#c0e4ff';
            ctx.fillText(name,0,-s*2.8); ctx.shadowBlur=0;
            ctx.restore();
        }
        ctx.restore();
    }

    /* ── Draw Asteroid ───────────────────────────────────── */
    function drawAsteroid(x, y, a, s, name, t, hovered) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);

        /* ── Tumbling rock ── */
        ctx.save();
        ctx.rotate((t/45)*Math.PI*2);

        const rockG=ctx.createRadialGradient(-s*0.2,-s*0.3,0,0,0,s*1.2);
        rockG.addColorStop(0,'#a09080'); rockG.addColorStop(0.4,'#786858');
        rockG.addColorStop(0.8,'#504540'); rockG.addColorStop(1,'#302820');

        // Irregular outline
        ctx.beginPath();
        ctx.moveTo( s*1.0, 0);
        ctx.bezierCurveTo( s*1.1,-s*0.5,  s*0.6,-s*0.9,  s*0.1,-s*0.85);
        ctx.bezierCurveTo(-s*0.4,-s*0.8, -s*0.9,-s*0.6, -s*1.0,-s*0.2);
        ctx.bezierCurveTo(-s*1.15,s*0.2, -s*0.8, s*0.7, -s*0.3, s*0.9);
        ctx.bezierCurveTo( s*0.2, s*1.1,  s*0.7, s*0.8,  s*1.0, s*0.4);
        ctx.bezierCurveTo( s*1.2, s*0.1,  s*1.0, 0,      s*1.0, 0);
        ctx.closePath();
        ctx.fillStyle=rockG; ctx.fill();

        // Dark surface patches
        ctx.fillStyle='rgba(20,15,10,0.40)';
        ctx.beginPath(); ctx.ellipse(-s*0.3,-s*0.2,s*0.28,s*0.22,0.8,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse( s*0.4, s*0.3,s*0.20,s*0.16,-0.5,0,Math.PI*2); ctx.fill();

        // Craters
        [[-s*0.30,-s*0.20,s*0.16],[s*0.40,s*0.28,s*0.12],[-s*0.55,s*0.30,s*0.10],[s*0.10,-s*0.55,s*0.08]].forEach(([cx2,cy2,cr])=>{
            ctx.beginPath(); ctx.arc(cx2,cy2,cr,0,Math.PI*2);
            ctx.fillStyle='rgba(40,30,25,0.35)'; ctx.fill();
            ctx.strokeStyle='rgba(20,15,10,0.55)'; ctx.lineWidth=s*0.04; ctx.stroke();
        });

        // Highlight
        const hl=ctx.createRadialGradient(-s*0.3,-s*0.4,0,-s*0.3,-s*0.4,s*0.8);
        hl.addColorStop(0,'rgba(200,185,170,0.42)'); hl.addColorStop(1,'rgba(200,185,170,0)');
        ctx.beginPath();
        ctx.moveTo( s*1.0, 0);
        ctx.bezierCurveTo( s*1.1,-s*0.5,  s*0.6,-s*0.9,  s*0.1,-s*0.85);
        ctx.bezierCurveTo(-s*0.4,-s*0.8, -s*0.9,-s*0.6, -s*1.0,-s*0.2);
        ctx.bezierCurveTo(-s*1.15,s*0.2, -s*0.8, s*0.7, -s*0.3, s*0.9);
        ctx.bezierCurveTo( s*0.2, s*1.1,  s*0.7, s*0.8,  s*1.0, s*0.4);
        ctx.bezierCurveTo( s*1.2, s*0.1,  s*1.0, 0,      s*1.0, 0);
        ctx.closePath(); ctx.fillStyle=hl; ctx.fill();

        ctx.restore(); // undo tumble

        /* ── Label ── */
        if (name) {
            const fs=Math.max(12,s*1.4);
            ctx.save(); ctx.rotate(-a);
            ctx.font=`bold ${fs}px 'Courier New',monospace`; ctx.textAlign='center';
            const tw=ctx.measureText(name).width;
            ctx.shadowColor='#c0a080'; ctx.shadowBlur=hovered?22:8;
            ctx.fillStyle=hovered?'rgba(4,4,32,0.92)':'rgba(4,4,24,0.80)';
            ctx.beginPath(); ctx.roundRect(-(tw/2+7),-s*2.5-fs,tw+14,fs+9,5); ctx.fill();
            ctx.strokeStyle=hovered?'rgba(200,160,100,0.90)':'rgba(200,160,100,0.55)';
            ctx.lineWidth=hovered?1.8:1.0; ctx.stroke();
            ctx.fillStyle=hovered?'#ffffff':'#e0c090';
            ctx.fillText(name,0,-s*2.5); ctx.shadowBlur=0;
            ctx.restore();
        }
        ctx.restore();
    }

    /* ── Draw Probe (Voyager-style) ──────────────────────── */
    function drawProbe(x, y, a, s, name, hovered) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);

        /* ── RTG power pack (angled arm + cylinder) ── */
        ctx.save(); ctx.rotate(Math.PI*0.35);
        ctx.fillStyle='#606880';
        ctx.beginPath(); ctx.rect(s*0.3,-s*0.10,s*1.6,s*0.20); ctx.fill();
        const rtgG=ctx.createLinearGradient(s*1.6,-s*0.30,s*1.6,s*0.30);
        rtgG.addColorStop(0,'#888090'); rtgG.addColorStop(1,'#404048');
        ctx.beginPath(); ctx.ellipse(s*1.9,0,s*0.18,s*0.30,0,0,Math.PI*2);
        ctx.fillStyle=rtgG; ctx.fill();
        ctx.strokeStyle='#505060'; ctx.lineWidth=s*0.04; ctx.stroke();
        const rtgGl=ctx.createRadialGradient(s*1.9,0,0,s*1.9,0,s*0.40);
        rtgGl.addColorStop(0,'rgba(255,120,40,0.48)'); rtgGl.addColorStop(1,'rgba(255,80,20,0)');
        ctx.fillStyle=rtgGl; ctx.beginPath(); ctx.arc(s*1.9,0,s*0.40,0,Math.PI*2); ctx.fill();
        ctx.restore();

        /* ── Magnetometer boom (forward) ── */
        ctx.save(); ctx.rotate(-Math.PI*0.15);
        ctx.strokeStyle='#808898'; ctx.lineWidth=s*0.04;
        ctx.beginPath(); ctx.moveTo(s*0.4,0); ctx.lineTo(s*2.4,0); ctx.stroke();
        ctx.beginPath(); ctx.arc(s*2.4,0,s*0.12,0,Math.PI*2);
        ctx.fillStyle='#a8b0c0'; ctx.fill();
        ctx.restore();

        /* ── Science boom ── */
        ctx.save(); ctx.rotate(Math.PI*0.12);
        ctx.strokeStyle='#909aa8'; ctx.lineWidth=s*0.035;
        ctx.beginPath(); ctx.moveTo(s*0.4,0); ctx.lineTo(s*1.8,0); ctx.stroke();
        ctx.beginPath(); ctx.arc(s*1.8,0,s*0.09,0,Math.PI*2);
        ctx.fillStyle='#c0c8d0'; ctx.fill();
        ctx.restore();

        /* ── Dish struts ── */
        [-0.3,0,0.3].forEach(off=>{
            ctx.beginPath();
            ctx.moveTo(-s*0.5,off*s*0.6); ctx.lineTo(s*0.4,0);
            ctx.strokeStyle='#909aa8'; ctx.lineWidth=s*0.04; ctx.stroke();
        });

        /* ── Central bus (gold foil) ── */
        const busG=ctx.createLinearGradient(-s*0.5,-s*0.5,s*0.5,s*0.5);
        busG.addColorStop(0,'#f0c850'); busG.addColorStop(0.5,'#d49820'); busG.addColorStop(1,'#906010');
        ctx.beginPath(); ctx.rect(-s*0.5,-s*0.38,s*0.90,s*0.76);
        ctx.fillStyle=busG; ctx.fill();
        ctx.strokeStyle='rgba(255,200,80,0.50)'; ctx.lineWidth=s*0.04; ctx.stroke();
        ctx.strokeStyle='rgba(200,150,40,0.45)'; ctx.lineWidth=s*0.03;
        for(let i=1;i<4;i++){
            const bx=-s*0.5+i*(s*0.9/4);
            ctx.beginPath(); ctx.moveTo(bx,-s*0.38); ctx.lineTo(bx,s*0.38); ctx.stroke();
        }
        const busSheen=ctx.createLinearGradient(-s*0.5,-s*0.38,s*0.5,-s*0.10);
        busSheen.addColorStop(0,'rgba(255,255,200,0.30)'); busSheen.addColorStop(1,'rgba(255,255,200,0)');
        ctx.fillStyle=busSheen; ctx.beginPath(); ctx.rect(-s*0.5,-s*0.38,s*0.90,s*0.76); ctx.fill();

        /* ── Main dish (parabolic) ── */
        const dR=s*1.3;
        const dishG=ctx.createRadialGradient(s*0.4,0,0,s*0.4,0,dR);
        dishG.addColorStop(0,'rgba(220,230,240,0.95)'); dishG.addColorStop(0.6,'rgba(180,195,215,0.88)');
        dishG.addColorStop(1,'rgba(120,140,170,0.90)');
        ctx.save(); ctx.scale(1,0.50);
        ctx.beginPath();
        ctx.arc(s*0.4,0,dR,-Math.PI*0.55,Math.PI*0.55);
        ctx.lineTo(s*0.4,0); ctx.closePath();
        ctx.fillStyle=dishG; ctx.fill();
        ctx.strokeStyle='rgba(160,180,210,0.60)'; ctx.lineWidth=s*0.06; ctx.stroke();
        ctx.strokeStyle='rgba(150,170,200,0.35)'; ctx.lineWidth=s*0.03;
        [0.4,0.7].forEach(fr=>{
            ctx.beginPath(); ctx.arc(s*0.4,0,dR*fr,-Math.PI*0.5,Math.PI*0.5); ctx.stroke();
        });
        ctx.restore();
        // Dish specular
        const dSpec=ctx.createRadialGradient(s*0.6,-s*0.14,0,s*0.6,-s*0.14,s*0.5);
        dSpec.addColorStop(0,'rgba(255,255,255,0.58)'); dSpec.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=dSpec; ctx.beginPath(); ctx.arc(s*0.6,-s*0.14,s*0.5,0,Math.PI*2); ctx.fill();
        // Feed horn
        ctx.beginPath(); ctx.arc(s*0.4,0,s*0.10,0,Math.PI*2);
        ctx.fillStyle='#606870'; ctx.fill();

        /* ── Label ── */
        if (name) {
            const fs=Math.max(12,s*1.4);
            ctx.save(); ctx.rotate(-a);
            ctx.font=`bold ${fs}px 'Courier New',monospace`; ctx.textAlign='center';
            const tw=ctx.measureText(name).width;
            ctx.shadowColor='#88ddff'; ctx.shadowBlur=hovered?22:8;
            ctx.fillStyle=hovered?'rgba(4,4,32,0.92)':'rgba(4,4,24,0.80)';
            ctx.beginPath(); ctx.roundRect(-(tw/2+7),-s*3.0-fs,tw+14,fs+9,5); ctx.fill();
            ctx.strokeStyle=hovered?'rgba(130,210,255,0.90)':'rgba(130,210,255,0.55)';
            ctx.lineWidth=hovered?1.8:1.0; ctx.stroke();
            ctx.fillStyle=hovered?'#ffffff':'#a0e0ff';
            ctx.fillText(name,0,-s*3.0); ctx.shadowBlur=0;
            ctx.restore();
        }
        ctx.restore();
    }

    /* ── Draw all 10 ships ────────────────────────────────── */
    function drawShips(t) {
        activeShipRects.length=0;

        ships.forEach((sh,idx)=>{
            if (!sh.s) return;
            const lT = ((t/sh.period)+sh.phase) % 1;

            // Detect when ship completes a loop (lT wraps 1→0) — assign new random name/type
            if (sh._prevLT !== undefined && lT < sh._prevLT) {
                const m = memberData[Math.floor(Math.random()*memberData.length)] || {name:'???',joinedAt:''};
                sh.name     = m.name;
                sh.joinedAt = m.joinedAt;
                const _st2=['ROCKET','UFO','SHUTTLE','SATELLITE','COMET','ASTEROID','PROBE'];
                sh.type     = _st2[Math.floor(Math.random()*_st2.length)];
            }
            sh._prevLT = lT;

            // Direction vector for this ship's path
            const dx = sh.x1-sh.x0;
            const dy = sh.y1-sh.y0;
            const len = Math.sqrt(dx*dx+dy*dy) || 1;
            // Perpendicular unit vector (for sine wobble)
            const px = -dy/len, py = dx/len;
            const wob = Math.sin(lT*Math.PI*2) * sh.wAmp;

            const x = (sh.x0+dx*lT)*W + px*wob*W;
            const y = (sh.y0+dy*lT)*H + py*wob*H;
            if (x<-150||x>W+150||y<-150||y>H+150) return;

            // Velocity direction (tangent of path)
            const vx = dx*W + px*Math.cos(lT*Math.PI*2)*sh.wAmp*Math.PI*2*W;
            const vy = dy*H + py*Math.cos(lT*Math.PI*2)*sh.wAmp*Math.PI*2*H;
            const a  = Math.atan2(vy, vx);

            const hovered = hoveredShipIdx===idx;

            if      (sh.type==='UFO')      { drawUFO(x,y,a,sh.s,sh.name,t,hovered); }
            else if (sh.type==='SHUTTLE')  { drawShuttle(x,y,a,sh.s,sh.name,hovered); }
            else if (sh.type==='SATELLITE'){ drawSatellite(x,y,a,sh.s,sh.name,t,hovered); }
            else if (sh.type==='COMET')    { drawComet(x,y,a,sh.s,sh.name,hovered); }
            else if (sh.type==='ASTEROID') { drawAsteroid(x,y,a,sh.s,sh.name,t,hovered); }
            else if (sh.type==='PROBE')    { drawProbe(x,y,a,sh.s,sh.name,hovered); }
            else                           { drawRocket(x,y,a,sh.s,sh.name,hovered); }

            activeShipRects.push({x, y, hw:sh.s*3.5, hh:sh.s*2.5, idx});
        });
    }

    /* ── Shooting stars / meteors ─────────────────────────── */
    const shoots = [
        {t:  8,dur:0.9, x0:0.72,y0:0.04,x1:0.96,y1:0.18},
        {t: 24,dur:1.2, x0:0.10,y0:0.06,x1:0.42,y1:0.24},
        {t: 58,dur:0.8, x0:0.60,y0:0.02,x1:0.88,y1:0.16},
        {t: 88,dur:1.1, x0:0.04,y0:0.08,x1:0.36,y1:0.26},
        {t:120,dur:1.4, x0:0.50,y0:0.03,x1:0.82,y1:0.20},
        {t:160,dur:0.9, x0:0.18,y0:0.05,x1:0.50,y1:0.22},
        {t:205,dur:1.0, x0:0.78,y0:0.04,x1:0.98,y1:0.14},
        {t:248,dur:1.3, x0:0.06,y0:0.07,x1:0.40,y1:0.28},
    ];

    /* ── Draw helpers ─────────────────────────────────────── */
    function drawNebulae(t) {
        nebulae.forEach(n=>{
            const pulse=1+Math.sin((t/n.period)*Math.PI*2+n.phase)*0.12;
            const R=n.r*Math.max(W,H)*pulse;
            const g=ctx.createRadialGradient(n.x*W,n.y*H,0,n.x*W,n.y*H,R);
            g.addColorStop(0,`rgba(${n.rgb},0.22)`); g.addColorStop(0.4,`rgba(${n.rgb},0.08)`); g.addColorStop(1,`rgba(${n.rgb},0)`);
            ctx.fillStyle=g; ctx.beginPath(); ctx.arc(n.x*W,n.y*H,R,0,Math.PI*2); ctx.fill();
        });
    }

    function drawStars(t) {
        stars.forEach(s=>{
            // Slow fade-in/out per star (15–50s period, all out of phase)
            const fadeFactor = 0.08 + 0.92 * (0.5 + 0.5 * Math.sin((t/s.fp)*Math.PI*2 + s.fph));
            const alpha=Math.max(0.04,(s.base+Math.sin((t/s.tp)*Math.PI*2+s.to)*0.22)*fadeFactor);
            if(s.bright){
                const px=s.x*W,py=s.y*H;
                ctx.strokeStyle=s.cool?`rgba(185,205,255,${alpha*0.35})`:`rgba(255,240,200,${alpha*0.35})`;
                ctx.lineWidth=0.5;
                [0,Math.PI*0.5].forEach(a=>{
                    ctx.beginPath(); ctx.moveTo(px+Math.cos(a)*s.r*3.5,py+Math.sin(a)*s.r*3.5);
                    ctx.lineTo(px-Math.cos(a)*s.r*3.5,py-Math.sin(a)*s.r*3.5); ctx.stroke();
                });
            }
            ctx.beginPath(); ctx.arc(s.x*W,s.y*H,s.r,0,Math.PI*2);
            const a2=Math.min(1,alpha*1.6);
            ctx.fillStyle=s.warm?`rgba(255,235,185,${a2})`:s.cool?`rgba(185,205,255,${a2})`:`rgba(255,255,255,${a2})`;
            ctx.fill();
        });
    }

    function drawShoots(t) {
        shoots.forEach(sh=>{
            const el=t-sh.t;
            if(el<0||el>sh.dur) return;
            const p=el/sh.dur;
            const alpha=p<0.12?p/0.12:p>0.70?(1-p)/0.30:1;
            const x0=sh.x0*W,y0=sh.y0*H;
            const x1=(sh.x0+(sh.x1-sh.x0)*p)*W,y1=(sh.y0+(sh.y1-sh.y0)*p)*H;
            const g=ctx.createLinearGradient(x0,y0,x1,y1);
            g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(0.55,`rgba(220,235,255,${alpha*0.45})`); g.addColorStop(1,`rgba(255,255,255,${alpha})`);
            ctx.lineWidth=2.2; ctx.strokeStyle=g;
            ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
            ctx.beginPath(); ctx.arc(x1,y1,2.4,0,Math.PI*2); ctx.fillStyle=`rgba(255,255,255,${alpha})`; ctx.fill();
            const hg=ctx.createRadialGradient(x1,y1,0,x1,y1,6);
            hg.addColorStop(0,`rgba(200,220,255,${alpha*0.70})`); hg.addColorStop(1,'rgba(200,220,255,0)');
            ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(x1,y1,6,0,Math.PI*2); ctx.fill();
        });
    }

    /* ── Draw Sun (fixed top-right corner, partially off-screen) ── */
    function drawSun() {
        const img = PLANET_IMGS.SUN;
        const R   = Math.min(W,H) * 0.30;
        const sx  = W + R * 0.10;   // mostly off-screen right
        const sy  = -R * 0.10;      // mostly off-screen top

        // Outer corona glow
        const glow = ctx.createRadialGradient(sx,sy,R*0.5,sx,sy,R*2.8);
        glow.addColorStop(0,'rgba(255,210,80,0.30)');
        glow.addColorStop(0.4,'rgba(255,160,20,0.10)');
        glow.addColorStop(1,'rgba(255,120,0,0)');
        ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(sx,sy,R*2.8,0,Math.PI*2); ctx.fill();

        // Sun image clipped to circle
        const d = R * 2.0;
        ctx.save(); ctx.beginPath(); ctx.arc(sx,sy,R,0,Math.PI*2); ctx.clip();
        if (img && img.complete && img.naturalWidth) {
            ctx.drawImage(img, sx-R, sy-R, d, d);
        } else {
            ctx.fillStyle='#ffcc00'; ctx.fillRect(sx-R,sy-R,d,d);
        }
        ctx.restore();
    }

    /* ── Render loop ──────────────────────────────────────── */
    let lastTs=0;
    function render(ts) {
        requestAnimationFrame(render);
        if (ts-lastTs<34) return;
        lastTs=ts;

        const t=(performance.now()/1000) % CYCLE;

        ctx.fillStyle='rgba(4,4,20,1)';
        ctx.fillRect(0,0,W,H);

        drawSun();
        drawNebulae(t);
        drawStars(t);

        // 1. One planet at a time — back arc only, behind Earth/Moon/ISS
        drawActivePlanet();

        // 2. Back arc of orbit ring + ISS/Moon behind Earth
        drawOrbitRing(false);
        if (issIsBehind(t)) drawOrbitingISS(t);
        if (moonIsBehind(t)) drawOrbitingMoon(t);

        // 3. Earth — always centred
        drawEarth(t);

        // 4. Front arc of orbit ring + ISS/Moon in front of Earth
        drawOrbitRing(true);
        if (!issIsBehind(t)) drawOrbitingISS(t);
        if (!moonIsBehind(t)) drawOrbitingMoon(t);

        drawShips(t);
        drawShoots(t);
    }

    requestAnimationFrame(render);
}());
