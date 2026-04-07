/**
 * space-bg.js  —  Galaxy background  (seamless 300-second loop)
 * All animation periods are divisors of 300: 25,50,60,75,100,150,300
 */
(function () {
    'use strict';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const CYCLE  = 300;
    const MOBILE = window.innerWidth < 768;

    /* ── Canvas ──────────────────────────────────────────── */
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;';
    document.body.appendChild(canvas);
    let W, H;
    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize);
    resize();

    /* ── Seeded RNG ──────────────────────────────────────── */
    let _s = 42;
    function rng() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 0xFFFFFFFF; }

    /* ── Stars ───────────────────────────────────────────── */
    const TP = [3,4,5,6,10,12,15,25];
    const stars = Array.from({length: MOBILE ? 160 : 340}, () => ({
        x: rng(), y: rng(),
        r: rng() * 1.6 + 0.2,
        tp: TP[0|rng()*TP.length],
        to: rng() * Math.PI * 2,
        base: rng() * 0.35 + 0.20,
        warm:   rng() < 0.08,
        cool:   rng() < 0.20,
        bright: rng() < 0.04,
    }));

    /* ── Nebulae ─────────────────────────────────────────── */
    const nebulae = [
        { x:0.04, y:0.08, r:0.48, rgb:'88,101,242',  period:150, phase:0.0 },
        { x:0.88, y:0.82, r:0.56, rgb:'124,58,237',  period:100, phase:1.8 },
        { x:0.46, y:0.50, r:0.36, rgb:'180,55,120',  period: 75, phase:3.2 },
        { x:0.70, y:0.14, r:0.38, rgb:'40,100,210',  period: 50, phase:2.0 },
    ];

    /* ── Planets ─────────────────────────────────────────── */
    // radius ≈ 1/4 of screen width (so diameter ≈ half-screen)
    function pR() { return Math.min(W, H) * (MOBILE ? 0.18 : 0.24); }

    // crossTime=50s each; tStart every 60s → only one planet visible at a time
    const PLANET_DEFS = [
        { type:'JUPITER',   tStart:  0, dir: 1, yFrac:0.38, yd:0.04 },
        { type:'SATURN',    tStart: 60, dir:-1, yFrac:0.62, yd:0.03 },
        { type:'ICE',       tStart:120, dir: 1, yFrac:0.72, yd:0.05 },
        { type:'ROCKY',     tStart:180, dir:-1, yFrac:0.30, yd:0.03 },
        { type:'OCEAN',     tStart:240, dir: 1, yFrac:0.55, yd:0.04 },
    ];
    const P_CROSS = 50; // seconds

    function getPlanetPos(def, t) {
        const R = pR();
        const rel = ((t - def.tStart) % 300 + 300) % 300;
        if (rel > P_CROSS) return null;
        const p  = rel / P_CROSS;
        const m  = R + 120;
        const x  = def.dir > 0 ? -m + p*(W+2*m) : W+m - p*(W+2*m);
        const y  = def.yFrac*H + Math.sin(p*Math.PI)*def.yd*H;
        return { x, y, p };
    }

    const BAND_SETS = {
        JUPITER: ['#c87838','#d49060','#b06830','#e0a870','#a85828','#d09058','#c47030','#dea868'],
        SATURN:  ['#ead0a0','#d4ba88','#f0e0b8','#c8a878','#e4cc98','#ddc496'],
        ICE:     ['#3a96b0','#50add0','#3088a8','#60bcd8','#2880a0','#48a8c8'],
        ROCKY:   ['#c06040','#a84e30','#c87848','#b05838','#a84e30','#c06040'],
        OCEAN:   ['#1a5898','#205eb0','#1660a8','#246cb8','#1a5898','#246cb8'],
    };
    const ATM = { JUPITER:'200,120,60', SATURN:'220,185,120', ICE:'80,160,200', ROCKY:'180,85,55', OCEAN:'40,100,185' };

    function drawPlanet(def, pos) {
        const R  = pR();
        const {x, y} = pos;
        const bands  = BAND_SETS[def.type];
        const bh     = (R * 2) / bands.length;

        /* Atmosphere glow */
        const ag = ctx.createRadialGradient(x, y, R*0.82, x, y, R*1.45);
        ag.addColorStop(0,   `rgba(${ATM[def.type]},0.24)`);
        ag.addColorStop(0.55,`rgba(${ATM[def.type]},0.08)`);
        ag.addColorStop(1,   `rgba(${ATM[def.type]},0)`);
        ctx.fillStyle = ag;
        ctx.beginPath(); ctx.arc(x, y, R*1.45, 0, Math.PI*2); ctx.fill();

        /* Saturn ring — back half (arc π → 2π = top arc = far side) */
        if (def.type === 'SATURN') {
            ctx.save();
            ctx.translate(x, y); ctx.scale(1, 0.22);
            ctx.beginPath();
            ctx.ellipse(0,0, R*2.10,R*2.10, 0, Math.PI, Math.PI*2);
            ctx.strokeStyle = 'rgba(220,185,110,0.42)'; ctx.lineWidth = R*0.58; ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(0,0, R*1.58,R*1.58, 0, Math.PI, Math.PI*2);
            ctx.strokeStyle = 'rgba(185,145,75,0.28)'; ctx.lineWidth = R*0.28; ctx.stroke();
            ctx.restore();
        }

        /* Surface — clipped to sphere */
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI*2); ctx.clip();

        /* Bands */
        bands.forEach((col, i) => {
            ctx.fillStyle = col;
            ctx.fillRect(x-R, y-R + i*bh, R*2, bh+1);
        });

        /* Type details */
        if (def.type === 'JUPITER') {
            /* Great Red Spot */
            ctx.fillStyle = 'rgba(185,68,35,0.88)';
            ctx.beginPath(); ctx.ellipse(x+R*0.22, y+R*0.10, R*0.21, R*0.13, -0.08, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'rgba(215,130,70,0.50)';
            ctx.beginPath(); ctx.ellipse(x+R*0.19, y+R*0.08, R*0.11, R*0.065, -0.08, 0, Math.PI*2); ctx.fill();
            /* Band turbulence wisps */
            ctx.strokeStyle = 'rgba(160,75,28,0.28)'; ctx.lineWidth = R*0.030;
            for (let i=0; i<4; i++) {
                ctx.beginPath();
                ctx.moveTo(x-R, y+R*(i*0.24-0.30));
                ctx.bezierCurveTo(x-R*0.35, y+R*(i*0.24-0.40), x+R*0.35, y+R*(i*0.24-0.18), x+R, y+R*(i*0.24-0.30));
                ctx.stroke();
            }
        }
        if (def.type === 'ICE') {
            /* Polar cap */
            ctx.fillStyle = 'rgba(190,235,255,0.32)';
            ctx.beginPath(); ctx.ellipse(x, y-R*0.78, R*0.58, R*0.24, 0, 0, Math.PI*2); ctx.fill();
            /* South cap */
            ctx.fillStyle = 'rgba(190,235,255,0.22)';
            ctx.beginPath(); ctx.ellipse(x, y+R*0.82, R*0.40, R*0.16, 0, 0, Math.PI*2); ctx.fill();
        }
        if (def.type === 'ROCKY') {
            const craters = [{cx:-0.28,cy:-0.18,r:0.14},{cx:0.22,cy:0.34,r:0.09},{cx:-0.10,cy:0.08,r:0.18},{cx:0.36,cy:-0.12,r:0.07},{cx:-0.40,cy:0.28,r:0.06}];
            craters.forEach(c => {
                ctx.strokeStyle = 'rgba(82,32,12,0.58)'; ctx.lineWidth = R*0.022;
                ctx.beginPath(); ctx.arc(x+c.cx*R, y+c.cy*R, c.r*R, 0, Math.PI*2); ctx.stroke();
                ctx.fillStyle = 'rgba(75,28,10,0.22)'; ctx.fill();
            });
            /* Thin atmosphere tint */
            const rAtm = ctx.createRadialGradient(x,y, R*0.90, x,y, R);
            rAtm.addColorStop(0, 'rgba(200,140,80,0)');
            rAtm.addColorStop(1, 'rgba(200,140,80,0.20)');
            ctx.fillStyle = rAtm; ctx.fillRect(x-R,y-R,R*2,R*2);
        }
        if (def.type === 'OCEAN') {
            /* Swirl storms */
            ctx.strokeStyle = 'rgba(60,130,210,0.52)'; ctx.lineWidth = R*0.038;
            ctx.beginPath(); ctx.arc(x+R*0.12, y-R*0.05, R*0.32, 0.3, Math.PI*1.5); ctx.stroke();
            ctx.beginPath(); ctx.arc(x-R*0.28, y+R*0.22, R*0.20, 0.6, Math.PI*1.9); ctx.stroke();
            /* Polar ice */
            ctx.fillStyle = 'rgba(200,240,255,0.38)';
            ctx.beginPath(); ctx.ellipse(x, y-R*0.82, R*0.44, R*0.20, 0, 0, Math.PI*2); ctx.fill();
        }

        /* Sphere lighting */
        const shade = ctx.createRadialGradient(x-R*0.28, y-R*0.26, R*0.06, x+R*0.16, y+R*0.16, R);
        shade.addColorStop(0,   'rgba(255,255,255,0.11)');
        shade.addColorStop(0.5, 'rgba(0,0,0,0.00)');
        shade.addColorStop(1,   'rgba(0,0,0,0.54)');
        ctx.fillStyle = shade; ctx.fillRect(x-R, y-R, R*2, R*2);

        ctx.restore(); /* end sphere clip */

        /* Saturn ring — front half (arc 0 → π = bottom arc = near side) */
        if (def.type === 'SATURN') {
            ctx.save();
            ctx.translate(x, y); ctx.scale(1, 0.22);
            ctx.beginPath();
            ctx.ellipse(0,0, R*2.10,R*2.10, 0, 0, Math.PI);
            ctx.strokeStyle = 'rgba(220,185,110,0.42)'; ctx.lineWidth = R*0.58; ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(0,0, R*1.58,R*1.58, 0, 0, Math.PI);
            ctx.strokeStyle = 'rgba(185,145,75,0.28)'; ctx.lineWidth = R*0.28; ctx.stroke();
            ctx.restore();
        }
    }

    /* ── Spaceships ──────────────────────────────────────── */
    function linePath(yF, dir, wAmp) {
        return function(t) {
            const x  = dir>0 ? -0.09+t*1.18 : 1.09-t*1.18;
            const dx = dir>0 ? 1.18 : -1.18;
            const y  = yF + Math.sin(t*Math.PI*2)*wAmp;
            const dy = Math.cos(t*Math.PI*2)*wAmp*Math.PI*2;
            return { x, y, a: Math.atan2(dy*H, dx*W) };
        };
    }
    function curvePath(yF, wAmp) {
        return function(t) {
            const x  = -0.09 + t*1.18;
            const y  = yF + Math.sin(t*Math.PI*2)*wAmp + Math.cos(t*Math.PI)*0.04;
            const dy = Math.cos(t*Math.PI*2)*wAmp*Math.PI*2 - Math.sin(t*Math.PI)*0.04*Math.PI;
            return { x, y, a: Math.atan2(dy*H, 1.18*W) };
        };
    }

    // periods: 25,50,75,100 — all divide 300
    const ships = MOBILE ? [] : [
        { type:'FIGHTER',   period: 25, phase:0.08, size: 8,  path: linePath(0.72,  1, 0.040) },
        { type:'SHUTTLE',   period: 50, phase:0.55, size:12,  path: linePath(0.30, -1, 0.055) },
        { type:'FREIGHTER', period: 75, phase:0.30, size:10,  path: linePath(0.55,  1, 0.045) },
        { type:'FIGHTER',   period: 25, phase:0.44, size: 7,  path: linePath(0.18, -1, 0.030) },
        { type:'ALIEN',     period:100, phase:0.70, size:11,  path: curvePath(0.44, 0.07)      },
    ];

    /* Fighter — needle-nosed with swept wings */
    function drawFighter(x, y, a, s) {
        ctx.save(); ctx.translate(x,y); ctx.rotate(a);
        /* Exhaust */
        const fl=ctx.createLinearGradient(-s*2.4,0,-s*0.4,0);
        fl.addColorStop(0,'rgba(100,180,255,0)');
        fl.addColorStop(0.5,'rgba(140,200,255,0.52)');
        fl.addColorStop(1,'rgba(200,230,255,0.90)');
        ctx.beginPath();
        ctx.moveTo(-s*0.4,-s*0.15);
        ctx.bezierCurveTo(-s*1.4,-s*0.06,-s*2.0,s*0.08,-s*2.4,0);
        ctx.bezierCurveTo(-s*2.0,-s*0.08,-s*1.4,s*0.06,-s*0.4,s*0.15);
        ctx.fillStyle=fl; ctx.fill();
        /* Body */
        const bg=ctx.createLinearGradient(0,-s*0.22,0,s*0.22);
        bg.addColorStop(0,'#b8c8e8'); bg.addColorStop(0.5,'#eaf0ff'); bg.addColorStop(1,'#8890b0');
        ctx.beginPath();
        ctx.moveTo(s*1.2,0); ctx.lineTo(s*0.3,-s*0.18); ctx.lineTo(-s*0.5,-s*0.22);
        ctx.lineTo(-s*0.5,s*0.22); ctx.lineTo(s*0.3,s*0.18); ctx.closePath();
        ctx.fillStyle=bg; ctx.fill();
        /* Wings */
        ctx.fillStyle='#9098b8';
        ctx.beginPath(); ctx.moveTo(s*0.2,-s*0.22); ctx.lineTo(-s*0.4,-s*0.90); ctx.lineTo(-s*0.55,-s*0.22); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(s*0.2,s*0.22);  ctx.lineTo(-s*0.4,s*0.90);  ctx.lineTo(-s*0.55,s*0.22);  ctx.closePath(); ctx.fill();
        /* Cockpit */
        ctx.beginPath(); ctx.arc(s*0.55,0,s*0.13,0,Math.PI*2); ctx.fillStyle='#3a58a8'; ctx.fill();
        ctx.restore();
    }

    /* Shuttle — Space Shuttle silhouette */
    function drawShuttle(x, y, a, s) {
        ctx.save(); ctx.translate(x,y); ctx.rotate(a);
        /* Engine glow */
        const fl=ctx.createRadialGradient(-s*0.6,0,0,-s*0.6,0,s*1.0);
        fl.addColorStop(0,'rgba(255,165,55,0.72)');
        fl.addColorStop(0.5,'rgba(255,100,20,0.28)');
        fl.addColorStop(1,'rgba(255,80,10,0)');
        ctx.fillStyle=fl; ctx.beginPath(); ctx.arc(-s*0.6,0,s*1.0,0,Math.PI*2); ctx.fill();
        /* External tank */
        ctx.fillStyle='#e8d0a0';
        ctx.beginPath(); ctx.ellipse(-s*0.15,0,s*0.68,s*0.27,0,0,Math.PI*2); ctx.fill();
        /* Orbiter body */
        ctx.beginPath();
        ctx.moveTo(s*0.92,0);
        ctx.bezierCurveTo(s*0.60,-s*0.20,s*0.10,-s*0.20,-s*0.52,-s*0.20);
        ctx.lineTo(-s*0.72,-s*0.10); ctx.lineTo(-s*0.72,s*0.10);
        ctx.lineTo(-s*0.52,s*0.20);
        ctx.bezierCurveTo(s*0.10,s*0.20,s*0.60,s*0.20,s*0.92,0);
        ctx.fillStyle='#ccd4ec'; ctx.fill();
        /* Delta wing */
        ctx.beginPath(); ctx.moveTo(s*0.38,-s*0.20); ctx.lineTo(-s*0.42,-s*0.68); ctx.lineTo(-s*0.56,-s*0.20); ctx.closePath();
        ctx.fillStyle='#9ca4c4'; ctx.fill();
        /* Cockpit windows */
        ctx.fillStyle='#3050a0'; ctx.fillRect(s*0.54,-s*0.13,s*0.22,s*0.11);
        ctx.restore();
    }

    /* Freighter — boxy cargo ship */
    function drawFreighter(x, y, a, s) {
        ctx.save(); ctx.translate(x,y); ctx.rotate(a);
        /* Engine plumes (3) */
        [-s*0.26, 0, s*0.26].forEach(ey => {
            const fl=ctx.createLinearGradient(-s*2.1,0,-s*0.7,0);
            fl.addColorStop(0,'rgba(255,120,40,0)');
            fl.addColorStop(0.65,'rgba(255,160,55,0.44)');
            fl.addColorStop(1,'rgba(255,210,80,0.82)');
            ctx.beginPath(); ctx.moveTo(-s*0.7,ey-s*0.09); ctx.lineTo(-s*2.1,ey); ctx.lineTo(-s*0.7,ey+s*0.09); ctx.closePath();
            ctx.fillStyle=fl; ctx.fill();
        });
        /* Cargo body */
        ctx.fillStyle='#7a8292'; ctx.fillRect(-s*0.7,-s*0.42,s*1.55,s*0.84);
        /* Panel seams */
        ctx.strokeStyle='rgba(55,60,70,0.55)'; ctx.lineWidth=1;
        [-s*0.14,s*0.14].forEach(ly=>{ ctx.beginPath(); ctx.moveTo(-s*0.7,ly); ctx.lineTo(s*0.85,ly); ctx.stroke(); });
        [s*0.15,s*0.50].forEach(lx=>{ ctx.beginPath(); ctx.moveTo(s*lx/s*s,-s*0.42); ctx.lineTo(s*lx/s*s,s*0.42); });
        /* Nose */
        ctx.beginPath(); ctx.moveTo(s*0.85,-s*0.42); ctx.lineTo(s*1.22,0); ctx.lineTo(s*0.85,s*0.42); ctx.closePath();
        ctx.fillStyle='#8a92a2'; ctx.fill();
        /* Engine block */
        ctx.fillStyle='#5c6472'; ctx.fillRect(-s*0.7,-s*0.42,s*0.28,s*0.84);
        /* Nozzles */
        [-s*0.26,0,s*0.26].forEach(ey=>{
            ctx.beginPath(); ctx.arc(-s*0.7,ey,s*0.11,0,Math.PI*2); ctx.fillStyle='#3c4450'; ctx.fill();
            ctx.beginPath(); ctx.arc(-s*0.7,ey,s*0.06,0,Math.PI*2); ctx.fillStyle='#ff8828'; ctx.fill();
        });
        /* Bridge window */
        ctx.fillStyle='#3880b8'; ctx.fillRect(s*0.88,-s*0.11,s*0.18,s*0.12);
        ctx.restore();
    }

    /* Alien saucer */
    function drawAlien(x, y, a, s) {
        ctx.save(); ctx.translate(x,y); ctx.rotate(a);
        /* Propulsion field */
        const gl=ctx.createRadialGradient(0,0,0,0,0,s*1.25);
        gl.addColorStop(0,'rgba(90,255,140,0.28)'); gl.addColorStop(0.5,'rgba(50,200,100,0.08)'); gl.addColorStop(1,'rgba(20,180,80,0)');
        ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(0,0,s*1.25,0,Math.PI*2); ctx.fill();
        /* Saucer disc */
        ctx.save(); ctx.scale(1,0.34);
        const dg=ctx.createRadialGradient(-s*0.2,-s*0.2,0,0,0,s*1.0);
        dg.addColorStop(0,'#c4cce0'); dg.addColorStop(1,'#6c7488');
        ctx.beginPath(); ctx.arc(0,0,s*1.0,0,Math.PI*2); ctx.fillStyle=dg; ctx.fill();
        ctx.restore();
        /* Dome */
        ctx.beginPath(); ctx.arc(0,-s*0.08,s*0.40,0,Math.PI*2);
        const dome=ctx.createRadialGradient(-s*0.10,-s*0.22,0,0,-s*0.08,s*0.40);
        dome.addColorStop(0,'rgba(160,225,255,0.92)'); dome.addColorStop(0.5,'rgba(55,158,205,0.82)'); dome.addColorStop(1,'rgba(18,75,125,0.92)');
        ctx.fillStyle=dome; ctx.fill();
        /* Running lights */
        for (let i=0;i<8;i++){
            const ra=(i/8)*Math.PI*2;
            ctx.beginPath(); ctx.arc(Math.cos(ra)*s*0.76, Math.sin(ra)*s*0.28, s*0.065, 0, Math.PI*2);
            ctx.fillStyle = i%2===0 ? '#ffee44' : '#ff8844'; ctx.fill();
        }
        ctx.restore();
    }

    function drawShip(sh, t) {
        const lT = ((t/sh.period)+sh.phase)%1;
        const p  = sh.path(lT);
        const sx = p.x*W, sy = p.y*H;
        if (sx<-120||sx>W+120||sy<-120||sy>H+120) return;
        switch(sh.type) {
            case 'FIGHTER':   drawFighter(sx,sy,p.a,sh.size);   break;
            case 'SHUTTLE':   drawShuttle(sx,sy,p.a,sh.size);   break;
            case 'FREIGHTER': drawFreighter(sx,sy,p.a,sh.size); break;
            case 'ALIEN':     drawAlien(sx,sy,p.a,sh.size);     break;
        }
    }

    /* ── International Space Station ────────────────────── */
    // period=150 (passes twice per 300s cycle)
    const ISS_S = MOBILE ? 8 : 13;

    function drawISS(t) {
        const lT = ((t/150) + 0.25) % 1;
        const x  = -0.09*W + lT*(W*1.18);
        const y  = 0.40*H;
        if (x < -320 || x > W+320) return;

        const s = ISS_S;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-0.04); // very slight tilt

        /* Integrated Truss Structure (ITS) — long horizontal spine */
        const tg = ctx.createLinearGradient(0,-s*0.42,0,s*0.42);
        tg.addColorStop(0,'#b8c2d4'); tg.addColorStop(0.5,'#dce6f4'); tg.addColorStop(1,'#8892a4');
        ctx.fillStyle = tg;
        ctx.fillRect(-s*9, -s*0.42, s*18, s*0.84);

        /* 4 pairs of solar panel arrays */
        const panelXPositions = [-6.8, -3.4, 3.4, 6.8];
        panelXPositions.forEach(px => {
            /* Upper panel */
            ctx.fillStyle = '#1c2c44';
            ctx.fillRect(s*px - s*0.72, -s*5.2, s*1.44, s*4.7);
            /* Cell grid */
            ctx.strokeStyle = '#283c58'; ctx.lineWidth = 0.9;
            for (let r=0; r<7; r++) {
                ctx.beginPath();
                ctx.moveTo(s*px-s*0.72, -s*5.2+r*s*0.67);
                ctx.lineTo(s*px+s*0.72, -s*5.2+r*s*0.67);
                ctx.stroke();
            }
            ctx.beginPath(); ctx.moveTo(s*px,-s*5.2); ctx.lineTo(s*px,-s*0.5); ctx.stroke();
            /* Gold tint */
            ctx.fillStyle='rgba(180,148,52,0.14)';
            ctx.fillRect(s*px-s*0.72,-s*5.2,s*1.44,s*4.7);

            /* Lower panel (mirror) */
            ctx.fillStyle = '#1c2c44';
            ctx.fillRect(s*px - s*0.72, s*0.5, s*1.44, s*4.7);
            ctx.strokeStyle = '#283c58'; ctx.lineWidth = 0.9;
            for (let r=0; r<7; r++) {
                ctx.beginPath();
                ctx.moveTo(s*px-s*0.72, s*0.5+r*s*0.67);
                ctx.lineTo(s*px+s*0.72, s*0.5+r*s*0.67);
                ctx.stroke();
            }
            ctx.beginPath(); ctx.moveTo(s*px,s*0.5); ctx.lineTo(s*px,s*5.2); ctx.stroke();
            ctx.fillStyle='rgba(180,148,52,0.14)';
            ctx.fillRect(s*px-s*0.72,s*0.5,s*1.44,s*4.7);
        });

        /* Redraw truss on top of panels */
        ctx.fillStyle = tg;
        ctx.fillRect(-s*9, -s*0.42, s*18, s*0.84);

        /* Central pressurised modules */
        const mods = [
            {x:-2.6, w:1.3, h:2.4, c:'#9ca4b4'},
            {x:-1.3, w:1.5, h:2.8, c:'#acb4c4'},
            {x: 0.2, w:2.2, h:2.5, c:'#9098a8'},  // Harmony / main node
            {x: 2.4, w:1.3, h:2.2, c:'#a0a8b8'},
            {x: 3.7, w:1.0, h:2.0, c:'#8890a0'},
        ];
        mods.forEach(m => {
            ctx.fillStyle = m.c;
            ctx.fillRect(s*m.x, -s*m.h*0.5, s*m.w, s*m.h);
            /* Cylinder highlight */
            const mg = ctx.createLinearGradient(s*m.x,0, s*(m.x+m.w),0);
            mg.addColorStop(0,  'rgba(255,255,255,0.20)');
            mg.addColorStop(0.4,'rgba(255,255,255,0.06)');
            mg.addColorStop(1,  'rgba(0,0,0,0.24)');
            ctx.fillStyle = mg;
            ctx.fillRect(s*m.x, -s*m.h*0.5, s*m.w, s*m.h);
        });

        /* Russian segment mini solar arrays */
        ctx.save();
        ctx.translate(-s*1.8, -s*1.4); ctx.rotate(-0.42);
        ctx.fillStyle='#1c2c44';
        ctx.fillRect(-s*2.2,-s*0.44,s*2.2,s*0.44);
        ctx.strokeStyle='#283c58'; ctx.lineWidth=0.8;
        for (let i=0;i<3;i++){
            ctx.beginPath(); ctx.moveTo(-s*2.2+i*s*0.72,-s*0.44); ctx.lineTo(-s*2.2+i*s*0.72,0); ctx.stroke();
        }
        ctx.fillStyle='rgba(180,148,52,0.12)'; ctx.fillRect(-s*2.2,-s*0.44,s*2.2,s*0.44);
        ctx.restore();

        ctx.restore();
    }

    /* ── Shooting stars ──────────────────────────────────── */
    const shoots = [
        {t: 18, dur:1.1, x0:0.18, y0:0.04, x1:0.46, y1:0.20},
        {t: 72, dur:0.9, x0:0.66, y0:0.06, x1:0.91, y1:0.22},
        {t:128, dur:1.3, x0:0.08, y0:0.10, x1:0.43, y1:0.30},
        {t:186, dur:1.0, x0:0.56, y0:0.02, x1:0.83, y1:0.18},
        {t:244, dur:1.2, x0:0.28, y0:0.07, x1:0.61, y1:0.24},
    ];

    /* ── Draw routines ───────────────────────────────────── */
    function drawNebulae(t) {
        nebulae.forEach(n => {
            const pulse = 1 + Math.sin((t/n.period)*Math.PI*2+n.phase)*0.10;
            const R = n.r * Math.max(W,H) * pulse;
            const g = ctx.createRadialGradient(n.x*W,n.y*H,0, n.x*W,n.y*H,R);
            g.addColorStop(0,  `rgba(${n.rgb},0.06)`);
            g.addColorStop(0.5,`rgba(${n.rgb},0.025)`);
            g.addColorStop(1,  `rgba(${n.rgb},0)`);
            ctx.fillStyle=g; ctx.beginPath(); ctx.arc(n.x*W,n.y*H,R,0,Math.PI*2); ctx.fill();
        });
    }

    function drawStars(t) {
        stars.forEach(s => {
            const alpha = Math.max(0.04, s.base + Math.sin((t/s.tp)*Math.PI*2+s.to)*0.22);
            if (s.bright) {
                const px=s.x*W, py=s.y*H;
                ctx.strokeStyle = s.cool ? `rgba(185,205,255,${alpha*0.35})` : `rgba(255,240,200,${alpha*0.35})`;
                ctx.lineWidth=0.5;
                [0,Math.PI*0.5].forEach(a=>{
                    ctx.beginPath();
                    ctx.moveTo(px+Math.cos(a)*s.r*3.5, py+Math.sin(a)*s.r*3.5);
                    ctx.lineTo(px-Math.cos(a)*s.r*3.5, py-Math.sin(a)*s.r*3.5);
                    ctx.stroke();
                });
            }
            ctx.beginPath(); ctx.arc(s.x*W, s.y*H, s.r, 0, Math.PI*2);
            ctx.fillStyle = s.warm ? `rgba(255,235,185,${alpha})`
                          : s.cool ? `rgba(185,205,255,${alpha})`
                          :           `rgba(255,255,255,${alpha})`;
            ctx.fill();
        });
    }

    function drawShoots(t) {
        shoots.forEach(sh => {
            const el = t - sh.t;
            if (el<0||el>sh.dur) return;
            const p = el/sh.dur;
            const alpha = p<0.15 ? p/0.15 : p>0.72 ? (1-p)/0.28 : 1;
            const x0=sh.x0*W, y0=sh.y0*H;
            const x1=(sh.x0+(sh.x1-sh.x0)*p)*W;
            const y1=(sh.y0+(sh.y1-sh.y0)*p)*H;
            const g=ctx.createLinearGradient(x0,y0,x1,y1);
            g.addColorStop(0,'rgba(255,255,255,0)');
            g.addColorStop(0.65,`rgba(210,225,255,${alpha*0.5})`);
            g.addColorStop(1,`rgba(255,255,255,${alpha})`);
            ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1);
            ctx.strokeStyle=g; ctx.lineWidth=1.5; ctx.stroke();
            ctx.beginPath(); ctx.arc(x1,y1,1.8,0,Math.PI*2);
            ctx.fillStyle=`rgba(255,255,255,${alpha})`; ctx.fill();
        });
    }

    /* ── Render loop ─────────────────────────────────────── */
    let lastTs = 0;
    function render(ts) {
        requestAnimationFrame(render);
        if (ts - lastTs < 34) return;
        lastTs = ts;

        const t = (performance.now()/1000) % CYCLE;

        // Deep space background
        ctx.fillStyle='rgba(4,4,20,1)';
        ctx.fillRect(0,0,W,H);

        drawNebulae(t);
        drawStars(t);

        // Planets (only 1 visible at a time)
        PLANET_DEFS.forEach(def => {
            const pos = getPlanetPos(def, t);
            if (pos) drawPlanet(def, pos);
        });

        // Spaceships
        if (!MOBILE) ships.forEach(sh => drawShip(sh, t));

        // ISS
        drawISS(t);

        drawShoots(t);
    }

    requestAnimationFrame(render);
}());
