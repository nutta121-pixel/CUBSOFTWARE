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
            // Saturn image includes rings — draw full image unclipped, centred on x,y
            if (img && img.complete && img.naturalWidth) {
                const aspect = img.naturalHeight / img.naturalWidth;
                const iw = R * 4.4;
                const ih = iw * aspect;
                ctx.drawImage(img, x - iw*0.5, y - ih*0.5, iw, ih);
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
            ctx.drawImage(img, x0,        y0, mapW, mapH);
            ctx.drawImage(img, x0 - mapW, y0, mapW, mapH);
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
                // Currently normal: 1 in 10,000 chance of a blood moon
                if (Math.random() < 1 / 10000) _moonRedTarget = 1;
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
            defs.push({period:periods[i], phase, x0, y0, x1, y1, wAmp, s:sz, type:Math.random()>0.45?'ROCKET':'UFO'});
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
            sh.type   = Math.random()>0.45 ? 'ROCKET' : 'UFO';
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
            const isUFO = sh.type==='UFO';
            const accent = isUFO ? '#66ffaa' : '#88aaff';
            hoverCard.innerHTML = `
                <div style="font-size:11px;color:${accent};letter-spacing:1.5px;margin-bottom:4px">${isUFO?'👾 UFO':'🚀 ROCKET'}</div>
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

    /* ── Draw Fighter ─────────────────────────────────────── */
    function drawRocket(x, y, a, s, name, hovered) {
        ctx.save(); ctx.translate(x,y); ctx.rotate(a);

        /* ── Engine exhaust plume ── */
        // outer glow
        const eg = ctx.createRadialGradient(-s*0.55,0,0,-s*0.55,0,s*2.2);
        eg.addColorStop(0,'rgba(255,160,40,0.70)');
        eg.addColorStop(0.35,'rgba(255,80,20,0.22)');
        eg.addColorStop(1,'rgba(255,60,10,0)');
        ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(-s*0.55,0,s*2.2,0,Math.PI*2); ctx.fill();
        // inner hot cone
        const pc = ctx.createLinearGradient(-s*2.6,0,-s*0.5,0);
        pc.addColorStop(0,'rgba(255,255,200,0)');
        pc.addColorStop(0.45,'rgba(255,200,60,0.55)');
        pc.addColorStop(0.80,'rgba(255,120,20,0.82)');
        pc.addColorStop(1,'rgba(255,255,255,0.95)');
        ctx.beginPath();
        ctx.moveTo(-s*0.50,-s*0.22); ctx.lineTo(-s*2.60,0); ctx.lineTo(-s*0.50,s*0.22);
        ctx.closePath(); ctx.fillStyle=pc; ctx.fill();
        // secondary flickering inner jet
        const ic = ctx.createLinearGradient(-s*1.6,0,-s*0.50,0);
        ic.addColorStop(0,'rgba(255,255,255,0)');
        ic.addColorStop(1,'rgba(255,255,220,0.80)');
        ctx.beginPath();
        ctx.moveTo(-s*0.50,-s*0.10); ctx.lineTo(-s*1.60,0); ctx.lineTo(-s*0.50,s*0.10);
        ctx.closePath(); ctx.fillStyle=ic; ctx.fill();

        /* ── Main body ── */
        const bg = ctx.createLinearGradient(0,-s*0.38,0,s*0.38);
        bg.addColorStop(0,'#dce8ff');
        bg.addColorStop(0.3,'#ffffff');
        bg.addColorStop(0.7,'#c8d8f0');
        bg.addColorStop(1,'#8898c8');
        // cylindrical fuselage
        ctx.beginPath();
        ctx.moveTo(s*0.60, -s*0.36);
        ctx.lineTo(-s*0.50,-s*0.36);
        ctx.lineTo(-s*0.50, s*0.36);
        ctx.lineTo(s*0.60,  s*0.36);
        ctx.closePath();
        ctx.fillStyle=bg; ctx.fill();
        ctx.strokeStyle='rgba(80,110,200,0.35)'; ctx.lineWidth=0.8; ctx.stroke();

        /* ── Nose cone ── */
        const ng = ctx.createLinearGradient(s*0.60,0,s*1.60,0);
        ng.addColorStop(0,'#e8f0ff');
        ng.addColorStop(0.5,'#ffffff');
        ng.addColorStop(1,'#5865f2');
        ctx.beginPath();
        ctx.moveTo(s*0.60,-s*0.36);
        ctx.bezierCurveTo(s*1.20,-s*0.36, s*1.65,-s*0.14, s*1.65,0);
        ctx.bezierCurveTo(s*1.65, s*0.14, s*1.20, s*0.36, s*0.60, s*0.36);
        ctx.fillStyle=ng; ctx.fill();
        ctx.strokeStyle='rgba(80,110,200,0.30)'; ctx.lineWidth=0.8; ctx.stroke();

        /* ── Fins (3 swept rocket fins) ── */
        // top fin
        ctx.beginPath();
        ctx.moveTo( s*0.20,-s*0.36);
        ctx.lineTo(-s*0.10,-s*1.10);
        ctx.lineTo(-s*0.50,-s*0.90);
        ctx.lineTo(-s*0.50,-s*0.36);
        ctx.closePath();
        ctx.fillStyle='#7080b8'; ctx.fill();
        ctx.strokeStyle='rgba(60,80,160,0.35)'; ctx.lineWidth=0.7; ctx.stroke();
        // bottom fin (mirror)
        ctx.beginPath();
        ctx.moveTo( s*0.20, s*0.36);
        ctx.lineTo(-s*0.10, s*1.10);
        ctx.lineTo(-s*0.50, s*0.90);
        ctx.lineTo(-s*0.50, s*0.36);
        ctx.closePath();
        ctx.fillStyle='#7080b8'; ctx.fill();
        ctx.strokeStyle='rgba(60,80,160,0.35)'; ctx.lineWidth=0.7; ctx.stroke();
        // small rear fin (side view third fin)
        ctx.beginPath();
        ctx.moveTo(-s*0.10,-s*0.36);
        ctx.lineTo(-s*0.42,-s*0.70);
        ctx.lineTo(-s*0.50,-s*0.36);
        ctx.closePath();
        ctx.fillStyle='#6070a8'; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s*0.10, s*0.36);
        ctx.lineTo(-s*0.42, s*0.70);
        ctx.lineTo(-s*0.50, s*0.36);
        ctx.closePath();
        ctx.fillStyle='#6070a8'; ctx.fill();

        /* ── Engine bell ── */
        ctx.beginPath();
        ctx.moveTo(-s*0.50,-s*0.36);
        ctx.lineTo(-s*0.70,-s*0.48);
        ctx.lineTo(-s*0.70, s*0.48);
        ctx.lineTo(-s*0.50, s*0.36);
        ctx.closePath();
        const eb = ctx.createLinearGradient(-s*0.70,0,-s*0.50,0);
        eb.addColorStop(0,'#4a5070'); eb.addColorStop(1,'#8898c0');
        ctx.fillStyle=eb; ctx.fill();
        ctx.strokeStyle='rgba(40,50,100,0.50)'; ctx.lineWidth=0.8; ctx.stroke();

        /* ── Porthole window ── */
        const wg = ctx.createRadialGradient(s*0.32,-s*0.06,0,s*0.32,0,s*0.20);
        wg.addColorStop(0,'rgba(180,230,255,0.95)');
        wg.addColorStop(0.5,'rgba(60,160,230,0.88)');
        wg.addColorStop(1,'rgba(10,60,160,0.90)');
        ctx.beginPath(); ctx.arc(s*0.32,0,s*0.20,0,Math.PI*2);
        ctx.fillStyle=wg; ctx.fill();
        ctx.strokeStyle='rgba(120,160,220,0.60)'; ctx.lineWidth=1.2; ctx.stroke();
        // glint
        ctx.fillStyle='rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.ellipse(s*0.24,-s*0.07,s*0.07,s*0.04,-0.4,0,Math.PI*2); ctx.fill();

        /* ── CUB SOFTWARE accent stripe ── */
        ctx.strokeStyle='rgba(88,101,242,0.65)'; ctx.lineWidth=1.6;
        ctx.beginPath(); ctx.moveTo(s*0.58,-s*0.36); ctx.lineTo(-s*0.10,-s*0.36); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s*0.58, s*0.36); ctx.lineTo(-s*0.10, s*0.36); ctx.stroke();

        /* ── Name label ── */
        if (name) {
            const fs = Math.max(12, s*1.4);
            ctx.save(); ctx.rotate(-a);
            ctx.font = `bold ${fs}px 'Courier New',monospace`;
            ctx.textAlign = 'center';
            const tw = ctx.measureText(name).width;
            ctx.shadowColor = '#88aaff';
            ctx.shadowBlur  = hovered ? 22 : 8;
            ctx.fillStyle   = hovered ? 'rgba(4,4,32,0.92)' : 'rgba(4,4,24,0.78)';
            ctx.beginPath(); ctx.roundRect(-(tw/2+7),-s*2.6-fs,tw+14,fs+9,5); ctx.fill();
            ctx.strokeStyle = hovered ? 'rgba(136,170,255,0.90)' : 'rgba(136,170,255,0.55)';
            ctx.lineWidth   = hovered ? 1.8 : 1.0; ctx.stroke();
            ctx.fillStyle   = hovered ? '#ffffff' : '#aaccff';
            ctx.fillText(name, 0, -s*2.6);
            ctx.shadowBlur  = 0;
            ctx.restore();
        }
        ctx.restore();
    }

    /* ── Draw UFO ─────────────────────────────────────────── */
    function drawUFO(x, y, a, s, name, t, hovered) {
        ctx.save(); ctx.translate(x,y);

        const gf=ctx.createRadialGradient(0,0,0,0,0,s*1.5);
        gf.addColorStop(0,'rgba(80,255,120,0.22)'); gf.addColorStop(0.5,'rgba(40,200,80,0.07)'); gf.addColorStop(1,'rgba(20,180,60,0)');
        ctx.fillStyle=gf; ctx.beginPath(); ctx.arc(0,0,s*1.5,0,Math.PI*2); ctx.fill();

        const tb=ctx.createLinearGradient(0,s*0.25,0,s*2.2);
        tb.addColorStop(0,'rgba(100,255,140,0.22)'); tb.addColorStop(1,'rgba(100,255,140,0)');
        ctx.beginPath(); ctx.moveTo(-s*0.30,s*0.25); ctx.lineTo(-s*0.90,s*2.2); ctx.lineTo(s*0.90,s*2.2); ctx.lineTo(s*0.30,s*0.25); ctx.closePath();
        ctx.fillStyle=tb; ctx.fill();

        ctx.save(); ctx.scale(1,0.32);
        const dg=ctx.createRadialGradient(-s*0.25,-s*0.25,0,0,0,s*1.08);
        dg.addColorStop(0,'#d0d8f0'); dg.addColorStop(0.5,'#8898b8'); dg.addColorStop(1,'#505878');
        ctx.beginPath(); ctx.arc(0,0,s*1.08,0,Math.PI*2); ctx.fillStyle=dg; ctx.fill();
        ctx.strokeStyle='rgba(140,160,200,0.45)'; ctx.lineWidth=1.2; ctx.stroke();
        ctx.restore();

        ctx.save(); ctx.scale(1,0.32);
        ctx.beginPath(); ctx.arc(0,0,s*0.82,0,Math.PI*2);
        ctx.strokeStyle='rgba(200,220,255,0.35)'; ctx.lineWidth=2.5; ctx.stroke();
        ctx.restore();

        const dome=ctx.createRadialGradient(-s*0.14,-s*0.34,0,0,-s*0.28,s*0.46);
        dome.addColorStop(0,'rgba(180,240,255,0.95)'); dome.addColorStop(0.45,'rgba(60,170,220,0.88)'); dome.addColorStop(1,'rgba(15,80,140,0.92)');
        ctx.beginPath(); ctx.ellipse(0,-s*0.24,s*0.44,s*0.46,0,Math.PI,0);
        ctx.fillStyle=dome; ctx.fill();
        ctx.fillStyle='rgba(255,255,255,0.45)';
        ctx.beginPath(); ctx.ellipse(-s*0.10,-s*0.40,s*0.12,s*0.07,-0.4,0,Math.PI*2); ctx.fill();

        const rimAngle=(t/8)*Math.PI*2;
        const rimColors=['#ff4444','#44ff88','#4488ff'];
        for(let i=0;i<10;i++){
            const ra=rimAngle+(i/10)*Math.PI*2;
            const alpha=0.55+Math.sin(rimAngle*3+i)*0.30;
            ctx.globalAlpha=alpha; ctx.fillStyle=rimColors[i%3];
            ctx.beginPath(); ctx.arc(Math.cos(ra)*s*0.85,Math.sin(ra)*s*0.28,s*0.075,0,Math.PI*2); ctx.fill();
            ctx.globalAlpha=1;
        }

        if (name) {
            const fs = Math.max(12, s*1.4);
            ctx.font = `bold ${fs}px 'Courier New',monospace`;
            ctx.textAlign = 'center';
            const tw = ctx.measureText(name).width;
            ctx.shadowColor = '#66ffaa';
            ctx.shadowBlur  = hovered ? 22 : 8;
            ctx.fillStyle   = hovered ? 'rgba(4,4,32,0.92)' : 'rgba(4,4,24,0.78)';
            ctx.beginPath(); ctx.roundRect(-(tw/2+7), -s*2.2-fs, tw+14, fs+9, 5); ctx.fill();
            ctx.strokeStyle = hovered ? 'rgba(102,255,170,0.90)' : 'rgba(102,255,170,0.55)';
            ctx.lineWidth   = hovered ? 1.8 : 1.0; ctx.stroke();
            ctx.fillStyle   = hovered ? '#ffffff' : '#99ffcc';
            ctx.fillText(name, 0, -s*2.2);
            ctx.shadowBlur  = 0;
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
                sh.type     = Math.random()>0.45 ? 'ROCKET' : 'UFO';
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

            if (sh.type==='UFO') {
                drawUFO(x,y,a,sh.s,sh.name,t,hovered);
            } else {
                drawRocket(x,y,a,sh.s,sh.name,hovered);
            }

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
            const alpha=Math.max(0.04,s.base+Math.sin((t/s.tp)*Math.PI*2+s.to)*0.22);
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
