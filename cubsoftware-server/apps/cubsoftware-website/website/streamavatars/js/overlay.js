/**
 * StreamAvatars — OBS Overlay Engine
 * Manages sprite instances for all active chatters.
 */

const SPRITE_W     = 32;
const SPRITE_H     = 48;
const GROUND_FRAC  = 0.88;   // sprites sit at 88% of screen height
const STATE_FPS    = { idle: 2, walk: 4, run: 6, jump: 4, talk: 3 };

let settings = {
    show_bubbles: true,
    sprite_scale: 3,
    walk_speed:   1.0,
    max_sprites:  50,
    idle_time:    5,
};

let sprites  = {};    // login → SpriteInstance
let lastSeq  = 0;
let lastTime = performance.now();

// ── Sprite Instance ───────────────────────────────────────────────────────────

class SpriteInstance {
    constructor(login, display, spriteData) {
        this.login   = login;
        this.display = display;
        this.images  = {};   // { state: [HTMLImageElement, ...] }

        this._loadImages(spriteData);

        const scale   = settings.sprite_scale;
        const groundY = window.innerHeight * GROUND_FRAC - SPRITE_H * scale;
        this.x        = Math.random() * Math.max(0, window.innerWidth - SPRITE_W * scale);
        this.y        = groundY;
        this.groundY  = groundY;
        this.dir      = Math.random() > 0.5 ? 1 : -1;

        this.state      = 'idle';
        this.frame      = 0;
        this.frameTimer = 0;
        this.stateTimer = 2000 + Math.random() * 6000;

        this.jumpVel    = 0;
        this.isJumping  = false;

        this.bubble     = null;   // { text, timer }
        this.prevState  = 'idle'; // state before talk/jump

        // DOM
        this.wrap   = document.createElement('div');
        this.wrap.className = 'sprite-wrap';

        this.bubbleEl = document.createElement('div');
        this.bubbleEl.className = 'sprite-bubble';
        this.bubbleEl.style.display = 'none';

        this.canvas  = document.createElement('canvas');
        this.canvas.className = 'sprite-canvas';
        this.canvas.width  = SPRITE_W * scale;
        this.canvas.height = SPRITE_H * scale;
        this.ctx     = this.canvas.getContext('2d');

        this.labelEl = document.createElement('div');
        this.labelEl.className  = 'sprite-label';
        this.labelEl.textContent = display;

        this.wrap.appendChild(this.bubbleEl);
        this.wrap.appendChild(this.canvas);
        this.wrap.appendChild(this.labelEl);
        document.getElementById('overlay').appendChild(this.wrap);

        this._updatePos();
    }

    _loadImages(spriteData) {
        if (!spriteData) return;
        for (const [state, frames] of Object.entries(spriteData)) {
            this.images[state] = frames.map(dataUrl => {
                const img = new Image();
                img.src = dataUrl;
                return img;
            });
        }
    }

    setState(newState) {
        if (this.state === newState) return;
        this.state      = newState;
        this.frame      = 0;
        this.frameTimer = 0;
    }

    showBubble(text) {
        if (!settings.show_bubbles) return;
        this.prevState   = this.state !== 'talk' ? this.state : this.prevState;
        this.bubble      = { text: esc(text), timer: 6000 };
        this.bubbleEl.innerHTML = this.bubble.text;
        this.bubbleEl.style.display = '';
        this.setState('talk');
    }

    triggerJump() {
        if (this.isJumping) return;
        this.prevState  = this.state;
        this.jumpVel    = -(window.innerHeight * 0.25);
        this.isJumping  = true;
        this.setState('jump');
    }

    triggerRun() {
        this.setState('run');
        this.stateTimer = 3000 + Math.random() * 3000;
    }

    update(dt) {
        const scale  = settings.sprite_scale;
        const speed  = settings.walk_speed;

        // ── Animation frame ───────────────────────────────────────────────
        this.frameTimer += dt;
        const fps    = STATE_FPS[this.state] || 2;
        const dur    = 1000 / fps;
        if (this.frameTimer >= dur) {
            this.frameTimer -= dur;
            const frames = this.images[this.state];
            const count  = frames?.length || 1;
            this.frame   = (this.frame + 1) % count;
            // Non-looping: jump → return to prev state after one cycle
            if (this.state === 'jump' && this.frame === 0 && !this.isJumping) {
                this.setState(this.prevState || 'idle');
            }
        }

        // ── Movement ──────────────────────────────────────────────────────
        const pxPerSec = speed * 80;
        if (this.state === 'walk' || this.state === 'run') {
            const mult = this.state === 'run' ? 2.2 : 1;
            this.x += this.dir * pxPerSec * mult * dt / 1000;
        }

        // ── Jump physics ──────────────────────────────────────────────────
        if (this.isJumping) {
            const gravity = window.innerHeight * 0.8;
            this.jumpVel += gravity * dt / 1000;
            this.y       += this.jumpVel * dt / 1000;
            if (this.y >= this.groundY) {
                this.y      = this.groundY;
                this.jumpVel = 0;
                this.isJumping = false;
                if (this.state === 'jump') this.setState(this.prevState || 'idle');
            }
        }

        // ── Bounce at screen edges ────────────────────────────────────────
        const maxX = window.innerWidth - SPRITE_W * scale;
        if (this.x < 0)    { this.x = 0;    this.dir = 1;  }
        if (this.x > maxX) { this.x = maxX; this.dir = -1; }

        // ── Random state changes ──────────────────────────────────────────
        this.stateTimer -= dt;
        if (this.stateTimer <= 0 && this.state !== 'talk' && !this.isJumping) {
            const r = Math.random();
            if      (r < 0.40) this.setState('walk');
            else if (r < 0.55) this.setState('run');
            else               this.setState('idle');
            if (Math.random() < 0.3) this.dir *= -1;
            this.stateTimer = 3000 + Math.random() * 8000;
        }

        // ── Chat bubble decay ─────────────────────────────────────────────
        if (this.bubble) {
            this.bubble.timer -= dt;
            if (this.bubble.timer <= 0) {
                this.bubble = null;
                this.bubbleEl.style.display = 'none';
                if (this.state === 'talk') this.setState(this.prevState || 'idle');
            }
        }

        this._updatePos();
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const imgs   = this.images[this.state] || this.images['idle'] || [];
        const img    = imgs[Math.min(this.frame, imgs.length - 1)];
        if (img?.complete && img.naturalWidth) {
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            // Fallback placeholder
            const scale = settings.sprite_scale;
            this.ctx.fillStyle = 'rgba(168,85,247,0.4)';
            this.ctx.fillRect(8*scale, 0, 16*scale, 16*scale);   // head
            this.ctx.fillRect(10*scale, 16*scale, 12*scale, 16*scale); // body
            this.ctx.fillStyle = '#a855f7';
            this.ctx.fillRect(10*scale, 32*scale, 5*scale, 14*scale); // left leg
            this.ctx.fillRect(17*scale, 32*scale, 5*scale, 14*scale); // right leg
        }
    }

    _updatePos() {
        const scale = settings.sprite_scale;
        this.wrap.style.position = 'absolute';
        this.wrap.style.left     = this.x + 'px';
        this.wrap.style.top      = this.y - (this.bubble ? 60 : 0) + 'px';
        this.canvas.style.transform = this.dir < 0 ? 'scaleX(-1)' : '';
    }

    destroy() {
        this.wrap.remove();
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
    return String(s)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;');
}

// ── Main loop ─────────────────────────────────────────────────────────────────

function loop(now) {
    const dt = Math.min(now - lastTime, 100);   // cap at 100ms
    lastTime = now;

    for (const sp of Object.values(sprites)) {
        sp.update(dt);
        sp.draw();
    }
    requestAnimationFrame(loop);
}

// ── API polling ───────────────────────────────────────────────────────────────

async function poll() {
    try {
        const res  = await fetch(`/streamavatars/api/overlay/${CHANNEL}/events?after=${lastSeq}`);
        if (!res.ok) return;
        const data = await res.json();

        // Update settings
        if (data.settings) {
            settings = { ...settings, ...data.settings };
            // Update ground Y for all sprites when scale changes
            for (const sp of Object.values(sprites)) {
                sp.groundY = window.innerHeight * GROUND_FRAC - SPRITE_H * settings.sprite_scale;
                sp.canvas.width  = SPRITE_W * settings.sprite_scale;
                sp.canvas.height = SPRITE_H * settings.sprite_scale;
                sp.ctx = sp.canvas.getContext('2d');
            }
        }

        // Process events
        for (const ev of (data.events || [])) {
            lastSeq = Math.max(lastSeq, ev.seq);
            await handleEvent(ev);
        }

        // Remove chatters who went inactive
        for (const login of Object.keys(sprites)) {
            if (!(data.active_chatters || {})[login]) {
                sprites[login].destroy();
                delete sprites[login];
            }
        }

    } catch (_) {}
}

async function handleEvent(ev) {
    const login   = ev.login;
    const display = ev.display || login;

    // Ensure sprite exists
    if (!sprites[login]) {
        // Load sprite data
        let spriteData = null;
        try {
            const r = await fetch(`/streamavatars/api/user/${login}/sprites`);
            if (r.ok) {
                const d = await r.json();
                spriteData = d.sprites || null;
            }
        } catch (_) {}
        sprites[login] = new SpriteInstance(login, display, spriteData);
    }

    const sp = sprites[login];

    if (ev.type === 'message') {
        sp.showBubble(ev.text);
    } else if (ev.type === 'jump') {
        sp.triggerJump();
    } else if (ev.type === 'run') {
        sp.triggerRun();
    }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

requestAnimationFrame(loop);
setInterval(poll, POLL_MS);
poll();
