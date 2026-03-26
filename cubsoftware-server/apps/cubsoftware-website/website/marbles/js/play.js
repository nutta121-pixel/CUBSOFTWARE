/**
 * play.js — Marble Race Engine
 * Three.js rendering + cannon-es physics, full race lifecycle.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';
import { buildColliders, makeContactMaterials, MAT_MARBLE, MAT_TRACK, MAT_TRAMPOLINE, MAT_STICKY } from './colliderBuilder.js';

// ── URL params ────────────────────────────────────────────────────────────────
const PARAMS       = new URLSearchParams(location.search);
const OBS_MODE     = PARAMS.has('obs') || !!window.__MARBLES_OBS;
const TRANSPARENT  = PARAMS.has('transparent') || OBS_MODE;
const OBS_SESSION  = PARAMS.get('session') || (window.__MARBLES_OBS ? window.__MARBLES_SESSION : null);
const WATCH_SESSION = window.__MARBLES_WATCH ? window.__MARBLES_SESSION : (PARAMS.get('watch') ? PARAMS.get('session') : null);
const REDUCED_MOTION = PARAMS.has('reduced') ||       // ?reduced=1 — explicit flag
    window.matchMedia('(prefers-reduced-motion: reduce)').matches; // honour OS/browser setting
const HIGH_CONTRAST  = PARAMS.has('hc') ||             // ?hc=1 — high-contrast colourblind-safe palette
    window.matchMedia('(prefers-contrast: more)').matches;
const PERF_MODE    = PARAMS.has('perf') || REDUCED_MOTION;  // ?perf=1 — disable shadows/trails/particles

// Colourblind-safe palette — distinguishable for deuteranopia, protanopia & tritanopia
// Based on Wong (2011) and IBM colour-blind safe palette
const HC_PALETTE = [
    0xe69f00, // Orange
    0x56b4e9, // Sky Blue
    0x009e73, // Bluish Green
    0xf0e442, // Yellow
    0x0072b2, // Blue
    0xd55e00, // Vermillion
    0xcc79a7, // Reddish Purple
    0xffffff, // White
];
const BG_COLOR     = PARAMS.get('bg');                // ?bg=RRGGBB hex — custom clear colour
const FORCE_CAM    = PARAMS.get('cam');               // ?cam=leader|overview|side|free
const HUD_MODE     = PARAMS.get('hud');               // ?hud=0|leaderboard|timer
const HIDE_RESULTS = PARAMS.get('results') === '0';   // ?results=0 — suppress results overlay
const RENDER_W     = parseInt(PARAMS.get('width')  || '0');  // ?width=1920
const RENDER_H     = parseInt(PARAMS.get('height') || '0');  // ?height=1080
const PREVIEW_MODE = PARAMS.has('preview');           // ?preview=1 — solo editor test run

if (OBS_MODE) document.body.classList.add('obs-mode');

// ── Load race data ────────────────────────────────────────────────────────────
let MAP_DATA          = null;
let SESSION_ID        = null;
let PLAYER_LIST       = [];
let MAP_NAME          = '';
let MARBLE_TYPES      = [];   // [{slot, name, color, icon, restriction, enabled}]
let MARBLE_SELECTIONS = {};   // username → slot int
let RACE_SETTINGS     = {     // defaults — overridden by session settings
    fall_mode: 'respawn', max_respawns: -1, timeout_mins: 3,
    gravity: 'normal', marble_friction: 'normal',
    announce_winner: false, camera_lock: 'off',
    late_join: false, abilities_enabled: true, cosmetics_enabled: true,
    handicap_enabled: false, handicap_strength: 0.2,
    team_mode: false, elimination_rounds: false,
    ghost_marble: false, gauntlet_mode: false,
};

// ── Ghost marble state ────────────────────────────────────────────────────────
const GHOST_SAMPLE_MS  = 100;   // position recording interval
let _ghostRecorder     = {};    // login → [[x,y,z], ...]
let _ghostRecordTimer  = null;
let _ghostMarbleMesh   = null;
let _ghostMarblePath   = null;  // [[x,y,z], ...] from track record
let _ghostPathTime     = 0;     // elapsed seconds since race start
let _ghostActive       = false;
let _ghostHolder       = '';
let _ghostTimeMs       = 0;
let _teamAssignments  = {};   // login (lower) → 'red' | 'blue'

function showError(msg) {
    document.getElementById('errorMsg').textContent = msg;
    document.getElementById('overlayError').classList.remove('hidden');
}

async function loadRaceData() {
    // Preview mode: load map from editor sessionStorage, single marble, no session
    if (PREVIEW_MODE) {
        const raw = sessionStorage.getItem('marbles_preview');
        if (!raw) { showError('No preview map found. Click Preview in the editor first.'); return false; }
        MAP_DATA    = JSON.parse(raw);
        SESSION_ID  = null;
        PLAYER_LIST = [{ name: 'Preview', slot: 0 }];
        return true;
    }

    // Watch / OBS mode: session passed via URL or injected by Flask; map fetched from API
    const _remoteSession = OBS_SESSION || WATCH_SESSION;
    if (_remoteSession) {
        SESSION_ID = _remoteSession;
        const res  = await fetch(`/marbles/api/game/${SESSION_ID}`);
        if (!res.ok) { showError('Session not found.'); return false; }
        const data = await res.json();
        PLAYER_LIST       = data.players || [];
        MARBLE_TYPES      = data.marble_types || [];
        MARBLE_SELECTIONS = data.player_selections || {};
        if (data.settings) Object.assign(RACE_SETTINGS, data.settings);
        if (data.teams)    _teamAssignments = data.teams;
        const pending = sessionStorage.getItem('marbles_obs_map_' + SESSION_ID);
        if (pending) {
            MAP_DATA = JSON.parse(pending);
        } else {
            showError('No map data for this session.');
            return false;
        }
        return true;
    }

    // Normal mode: read sessionStorage
    const raw = sessionStorage.getItem('marbles_pending_race');
    if (!raw) { showError('No race session found. Start a race from the editor.'); return false; }
    sessionStorage.removeItem('marbles_pending_race');

    const pending = JSON.parse(raw);
    SESSION_ID  = pending.session_id;
    MAP_DATA    = pending.map;

    const res  = await fetch(`/marbles/api/game/${SESSION_ID}`);
    if (!res.ok) { showError('Could not load session.'); return false; }
    const data = await res.json();
    PLAYER_LIST       = data.players || [];
    MARBLE_TYPES      = data.marble_types || [];
    MARBLE_SELECTIONS = data.player_selections || {};
    if (data.settings) Object.assign(RACE_SETTINGS, data.settings);
    if (data.teams)    _teamAssignments = data.teams;

    // Fetch player cosmetics (non-blocking — fall back to default if fails)
    if (RACE_SETTINGS.cosmetics_enabled !== false) {
        try {
            const cr = await fetch(`/marbles/api/game/${SESSION_ID}/cosmetics`);
            if (cr.ok) _playerCosmetics = await cr.json();
        } catch (_) {}
    }
    return true;
}

async function _fetchGhostForMap(mapData) {
    if (!RACE_SETTINGS.ghost_marble || PREVIEW_MODE || !mapData) return;
    try {
        const mapId = await computeMapId(mapData);
        const gr    = await fetch(`/marbles/api/map/${mapId}/ghost`);
        if (!gr.ok) return;
        const gd = await gr.json();
        if (gd.ok && gd.path && gd.path.length > 1) {
            _ghostMarblePath = gd.path;
            _ghostHolder     = gd.holder || '';
            _ghostTimeMs     = gd.time_ms || 0;
        }
    } catch (_) {}
}

// ── Three.js globals ──────────────────────────────────────────────────────────
let renderer, scene, camera, controls;
let ambientLight, sunLight;

// ── cannon-es globals ─────────────────────────────────────────────────────────
let world;
let _lastTime = null;
const FIXED_STEP = 1 / 60;
const MAX_SUB    = 3;

// ── Marble state ──────────────────────────────────────────────────────────────
const marbles = [];   // { body, mesh, nametag, username, color, finished, finishTime, rank, respawns, trailPoints }
let finishCount = 0;
let lowestTrackY = Infinity;
let startPiece  = null;
let finishAABB  = null;
let checkpoints = [];  // { aabb, id } — ordered checkpoints
let waypoints   = [];  // { aabb, order, id } — designer-placed progress waypoints

// ── Race state ────────────────────────────────────────────────────────────────
const STATE = { LOADING: 0, COUNTDOWN: 1, RACING: 2, FINISHING: 3, RESULTS: 4 };
let raceState = STATE.LOADING;
let raceStartTime = 0;
let raceTimeout   = null;
let sessionPollInterval = null;
let lastMarbleCount = -1;

// ── Chat Abilities ─────────────────────────────────────────────────────────────
let _abilityPollTimer = null;
// Active effects: Map<username, [{key, label, until (performance.now), type}]>
const _activeEffects = new Map();

// ── Player Cosmetics ───────────────────────────────────────────────────────────
let _playerCosmetics = {};   // login (lowercase) → {skin, trail, accessory}

// ── Comeback King tracking ─────────────────────────────────────────────────────
let _halfwayLast    = '';     // username of last-place marble at the halfway mark
let _halfwaySnapped = false;  // true once the snapshot has been taken

// ── Finish timer (60 s after first marble finishes) ───────────────────────────
let _finishTimerEnd = 0;      // performance.now() target
let _finishTimerActive = false;

// ── Spectate ──────────────────────────────────────────────────────────────────
let _spectateIndex = 0;       // index into marbles[] when in SPECTATE cam mode

// ── Camera ────────────────────────────────────────────────────────────────────
const CAM = { LEADER: 0, OVERVIEW: 1, SPECTATE: 2, FREE: 3, SIDE: 4 };
let camMode = CAM.LEADER;
let camTarget  = new THREE.Vector3();
let camDesired = new THREE.Vector3();

// ── Trail system ─────────────────────────────────────────────────────────────
const TRAIL_LEN    = 20;
const trailGeo     = {};   // username → THREE.BufferGeometry
const trailLine    = {};   // username → THREE.Line

// Trail type configs: {colors[], size, countPerTick, maxLife, vy, gravity, scatter, transparent, expand, hue}
const TRAIL_DEFS = {
    sparkle:        { colors:[0xffffff,0xffff88,0x88ffff,0xff88ff], size:0.055, cnt:2, maxLife:0.7,  vy:0.6,  grav:4,   scatter:0.8 },
    fire_trail:     { colors:[0xff4400,0xff8800,0xffcc00,0xff2200], size:0.09,  cnt:3, maxLife:0.45, vy:1.8,  grav:-3,  scatter:0.5 },
    rainbow_trail:  { colors:null,                                  size:0.07,  cnt:2, maxLife:0.6,  vy:0.4,  grav:3,   scatter:0.5, hue:true },
    smoke:          { colors:[0x777777,0x999999,0xaaaaaa],          size:0.13,  cnt:2, maxLife:0.9,  vy:1.0,  grav:0.5, scatter:0.4, expand:true },
    lightning:      { colors:[0xaaddff,0xffffff,0x88aaff],          size:0.045, cnt:3, maxLife:0.25, vy:0.2,  grav:0,   scatter:2.5 },
    hearts:         { colors:[0xff4488,0xff88aa,0xff2266],          size:0.09,  cnt:1, maxLife:0.85, vy:1.6,  grav:-1.5, scatter:0.4 },
    stars:          { colors:[0xffee00,0xffffff,0xffaa00],          size:0.065, cnt:2, maxLife:0.65, vy:0.8,  grav:2.5, scatter:0.7 },
    bubbles:        { colors:[0x88ccff,0xaaddff],                   size:0.11,  cnt:1, maxLife:1.1,  vy:0.9,  grav:-0.8, scatter:0.3, transparent:0.35 },
    money:          { colors:[0x22cc55,0x44ff88,0xffcc00],          size:0.07,  cnt:2, maxLife:0.7,  vy:1.1,  grav:3.5, scatter:0.6 },
    cherry:         { colors:[0xffaacc,0xff88bb,0xffccdd],          size:0.075, cnt:2, maxLife:0.95, vy:0.6,  grav:1.2, scatter:0.5 },
    dark_matter:    { colors:[0x6600cc,0x440088,0x220044],          size:0.095, cnt:2, maxLife:0.5,  vy:0.2,  grav:5,   scatter:0.6 },
    ice_crystals:   { colors:[0x88eeff,0xaaffff,0xccffff],          size:0.065, cnt:2, maxLife:0.75, vy:0.3,  grav:3,   scatter:0.5 },
    lava_drip:      { colors:[0xff3300,0xcc2200,0xff6600,0x882200], size:0.095, cnt:2, maxLife:0.6,  vy:-0.8, grav:9,   scatter:0.3 },
    electric:       { colors:[0x44ffff,0x00ccff,0xffffff],          size:0.045, cnt:3, maxLife:0.3,  vy:0.5,  grav:1.5, scatter:2.2 },
    dna:            { colors:[0xff4444,0x4444ff],                   size:0.07,  cnt:2, maxLife:0.7,  vy:0.5,  grav:2.5, scatter:0.5 },
    classic:        null,   // classic → uses THREE.Line path
};
const _trailParticles = [];   // {mesh, life, maxLife, vel:{x,y,z}, expand, vy0}
let   _trailHueOffset = 0;    // incremented each frame for rainbow cycling

// ── Accessory system ──────────────────────────────────────────────────────────
const ACC_Y_OFFSET = {
    crown: 0.55, halo: 0.95, party_hat: 0.7, bow: 0.62,
    propeller: 0.7, wings: 0.55, sunglasses: 0.52,
};

// ── Kinematic bodies (obstacles) ──────────────────────────────────────────────
const kinematicBodies = [];  // { body, piece }
const bongoPadBodies  = new Set();   // CANNON bodies belonging to bongo pads
const bongoPadMeshes  = new Map();   // CANNON.Body → THREE.Mesh for squish animation
const _bongoSquish    = new Map();   // THREE.Mesh → { t: 0..1 } squish progress
const boostPads      = [];
const windZones      = [];
const noGravZones    = [];
const laserDefs      = [];      // { piece, beamMesh, timer, active }
const springs        = [];      // { body, piece }
const teleporters    = {};      // pairId → [pieceA, pieceB]
const speedLimiters  = [];      // piece[]
const conveyorBelts  = [];      // piece[]
const gravFlipZones  = [];      // piece[]
const spikeStrips    = [];      // piece[]
const earthquakePads = [];      // piece[]
const glueTrapDefs   = [];      // piece[]
const magnets        = [];      // piece[]
const reversePads    = [];      // piece[]
const blackHoles     = [];      // piece[]
const cannonDefs     = [];      // piece[]
const shrinkZones    = [];      // piece[]
const giantZones     = [];      // piece[]
const rotatingRings  = [];      // { body, piece }
const pendulumDefs   = [];      // { body, piece }
const bumperRings    = [];      // piece[]

// ── Particle system ───────────────────────────────────────────────────────────
const particles = [];  // { mesh, life, maxLife, vel }

// ── Visual meshes for obstacles ───────────────────────────────────────────────
const obstacleMeshes = [];

// ============================================================================
// PIECE CATALOG (mirrors editor.js — needed for visual mesh building)
// ============================================================================
const PIECES = {
    straight:    { w:4,  d:16, h:0.4,  color:0x5865f2, cat:'track'    },
    corner_l:    { w:12, d:12, h:0.4,  color:0x7c3aed, cat:'track'    },
    corner_r:    { w:12, d:12, h:0.4,  color:0x7c3aed, cat:'track'    },
    ramp_up:     { w:4,  d:12, h:0.4,  color:0x2563eb, cat:'track',   defaultProps: { angle: 15 } },
    ramp_down:   { w:4,  d:12, h:0.4,  color:0x2563eb, cat:'track',   defaultProps: { angle: 15 } },
    bank_dl:     { w:12, d:12, h:0.4,  color:0x0f52ba, cat:'track',   defaultProps: { angle: 15 } },
    bank_dr:     { w:12, d:12, h:0.4,  color:0x0f52ba, cat:'track',   defaultProps: { angle: 15 } },
    bank_ul:     { w:12, d:12, h:0.4,  color:0x0f52ba, cat:'track',   defaultProps: { angle: 15 } },
    bank_ur:     { w:12, d:12, h:0.4,  color:0x0f52ba, cat:'track',   defaultProps: { angle: 15 } },
    funnel:          { w:10, d:10, h:4,    color:0x0891b2, cat:'track'    },
    straight_wide:   { w:8,  d:16, h:0.4,  color:0x3b82f6, cat:'track'    },
    straight_narrow: { w:2,  d:16, h:0.4,  color:0x818cf8, cat:'track'    },
    half_pipe:       { w:6,  d:16, h:2.5,  color:0x0ea5e9, cat:'track'    },
    crossroads:      { w:16, d:16, h:0.4,  color:0x8b5cf6, cat:'track'    },
    staircase:       { w:4,  d:10, h:3.0,  color:0x64748b, cat:'track'    },
    s_curve:         { w:12, d:16, h:0.4,  color:0xa855f7, cat:'track'    },
    tube_curve_l:    { w:12, d:12, h:4,    color:0x475569, cat:'track'    },
    tube_curve_r:    { w:12, d:12, h:4,    color:0x475569, cat:'track'    },
    vertical_drop:   { w:4,  d:6,  h:0.4,  color:0xef4444, cat:'track',   defaultProps: { angle: 65 } },
    corkscrew:       { w:12, d:16, h:0.4,  color:0xc084fc, cat:'track',   defaultProps: { drop: 4 } },
    pinball_lane:    { w:6,  d:16, h:1,    color:0xfbbf24, cat:'track'    },
    finish_ramp:     { w:10, d:12, h:0.4,  color:0xe11d48, cat:'track',   defaultProps: { angle: 8 } },
    bowl:            { w:8,  d:8,  h:4,    color:0x0891b2, cat:'track'    },
    wall_jump:       { w:4,  d:8,  h:4,    color:0xf97316, cat:'track'    },
    bank_turn_l:     { w:12, d:12, h:0.4,  color:0x22d3ee, cat:'track'    },
    bank_turn_r:     { w:12, d:12, h:0.4,  color:0x22d3ee, cat:'track'    },
    ramp_spiral:     { w:16, d:16, h:0.4,  color:0xa78bfa, cat:'track',   defaultProps: { rise: 6 } },
    drawbridge:      { w:6,  d:12, h:0.3,  color:0x78716c, cat:'track',   defaultProps: { delay: 3 } },
    catapult:        { w:6,  d:6,  h:0.4,  color:0xf59e0b, cat:'track'    },
    diving_board:    { w:1.5, d:10, h:0.3, color:0x3b82f6, cat:'track'    },
    start:       { w:4,  d:6,  h:1,    color:0x16a34a, cat:'start'    },
    finish:      { w:4,  d:6,  h:1,    color:0xe11d48, cat:'finish'   },
    boost_pad:   { w:4,  d:4,  h:0.2,  color:0xf59e0b, cat:'obstacle' },
    bongo_pad:   { w:4,  d:4,  h:0.4,  color:0xef4444, cat:'obstacle' },
    hammer:      { w:2,  d:6,  h:0.8,  color:0xdc2626, cat:'obstacle' },
    laser:       { w:1,  d:8,  h:1,    color:0xf43f5e, cat:'obstacle' },
    wind_box:    { w:6,  d:6,  h:6,    color:0x06b6d4, cat:'obstacle' },
    no_gravity:  { w:8,  d:8,  h:8,    color:0x8b5cf6, cat:'obstacle' },
    destruct_cube: { w:2, d:2, h:2,    color:0xf97316, cat:'obstacle' },
    rotating_post: { w:1, d:8, h:1,    color:0xa855f7, cat:'obstacle' },
    bumper:      { w:2,  d:2,  h:2,    color:0xfbbf24, cat:'obstacle' },
    pipe:        { w:4,  d:16, h:4,    color:0x475569, cat:'track'    },
    loop:        { w:4,  d:16, h:8,    color:0x5865f2, cat:'track'    },
    bridge:      { w:4,  d:16, h:0.4,  color:0x5865f2, cat:'track'    },
    spring:      { w:4,  d:4,  h:1,    color:0x22c55e, cat:'obstacle' },
    moving_platform: { w:6, d:6, h:0.4, color:0xf59e0b, cat:'obstacle' },
    teleporter:  { w:3,  d:3,  h:0.4,  color:0xa855f7, cat:'obstacle' },
    checkpoint:  { w:6,  d:1,  h:3,    color:0x3b82f6, cat:'track'    },
    ice_zone:      { w:6,  d:6,  h:0.2,  color:0x93c5fd, cat:'obstacle' },
    mud_zone:      { w:6,  d:6,  h:0.2,  color:0x92400e, cat:'obstacle' },
    trampoline:    { w:6,  d:6,  h:0.5,  color:0x4ade80, cat:'obstacle' },
    slippery_slope:{ w:4,  d:12, h:0.3,  color:0xbae6fd, cat:'obstacle', defaultProps: { angle: 15 } },
    sticky_pad:    { w:4,  d:4,  h:0.2,  color:0x854d0e, cat:'obstacle' },
    ghost_block:   { w:4,  d:4,  h:4,    color:0xa78bfa, cat:'obstacle' },
    speed_limiter: { w:6,  d:6,  h:4,    color:0xfbbf24, cat:'obstacle', defaultProps: { max_speed: 5 } },
    spike_strip:   { w:6,  d:2,  h:0.3,  color:0xef4444, cat:'obstacle' },
    conveyor_belt: { w:4,  d:8,  h:0.4,  color:0x0ea5e9, cat:'obstacle', defaultProps: { speed: 1.0, direction: 'forward' } },
    gravity_flip:  { w:8,  d:8,  h:6,    color:0x8b5cf6, cat:'obstacle', defaultProps: { duration: 3 } },
    earthquake_pad:{ w:4,  d:4,  h:0.2,  color:0xf97316, cat:'obstacle' },
    glue_trap:     { w:3,  d:3,  h:0.2,  color:0x78350f, cat:'obstacle', defaultProps: { duration: 1.5 } },
    magnet:             { w:2,  d:2,  h:3,    color:0xec4899, cat:'obstacle', defaultProps: { radius: 8, polarity: 1, strength: 1.0 } },
    reverse_pad:        { w:4,  d:4,  h:0.2,  color:0xdc2626, cat:'obstacle' },
    black_hole:         { w:2,  d:2,  h:2,    color:0x0f0f0f, cat:'obstacle', defaultProps: { radius: 10, strength: 2.0 } },
    cannon:             { w:3,  d:5,  h:3,    color:0x374151, cat:'obstacle', defaultProps: { strength: 40, angle: 0 } },
    shrink_zone:        { w:8,  d:8,  h:8,    color:0x6d28d9, cat:'obstacle', defaultProps: { scale: 0.3, duration: 5 } },
    giant_zone:         { w:8,  d:8,  h:8,    color:0x0891b2, cat:'obstacle', defaultProps: { scale: 2.5, duration: 5 } },
    rotating_ring:      { w:6,  d:6,  h:5,    color:0xf59e0b, cat:'obstacle', defaultProps: { speed: 1.0 } },
    pendulum:           { w:2,  d:2,  h:8,    color:0x78716c, cat:'obstacle', defaultProps: { period: 3.0, reach: 5 } },
    pinball_bumper_ring:{ w:8,  d:8,  h:2,    color:0xfbbf24, cat:'obstacle' },
};

// ============================================================================
// INIT
// ============================================================================
async function init() {
    const ok = await loadRaceData();
    if (!ok) return;

    MAP_NAME = MAP_DATA.name || 'Untitled Map';
    document.getElementById('hudMapName').textContent = MAP_NAME;
    document.getElementById('resultsMapName').textContent = MAP_NAME;

    // Load local player settings (sound volume, etc.)
    if (window.__MARBLES_LOGIN) {
        try {
            const sr = await fetch(`/marbles/api/player/${window.__MARBLES_LOGIN}/settings`);
            if (sr.ok) {
                const ps = await sr.json();
                if (ps.sound_volume !== undefined) SFX.setVolume(ps.sound_volume / 100);
            }
        } catch (_) {}
    }

    setupRenderer();
    setupScene();
    setupPhysics();
    buildMap();
    await _fetchGhostForMap(MAP_DATA);

    if (PREVIEW_MODE) {
        // Preview mode: show badge, skip polling/session, start immediately
        const badge = document.createElement('div');
        badge.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#f59e0b;color:#000;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;z-index:9999;pointer-events:none;letter-spacing:1px;';
        badge.textContent = '⚡ PREVIEW MODE — 1 marble, no session';
        document.body.appendChild(badge);
        spawnMarbles();
        bindUI();
        startCountdown();
        requestAnimationFrame(loop);
        return;
    }

    // Watch / OBS mode: wait for session to start; show spectator badge for watch mode
    if (OBS_SESSION || WATCH_SESSION) {
        await waitForSessionRunning();
        if (WATCH_SESSION) {
            const badge = document.createElement('div');
            badge.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#5865f2;color:#fff;font-size:12px;font-weight:700;padding:4px 14px;border-radius:20px;z-index:9999;pointer-events:none;letter-spacing:1px;opacity:0.9;';
            badge.textContent = '👁 SPECTATING';
            document.body.appendChild(badge);
        }
    }

    // Check if character select is open; if so wait for it to close first
    const sessionRes = await fetch(`/marbles/api/game/${SESSION_ID}`);
    if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        PLAYER_LIST       = sessionData.players || [];
        MARBLE_TYPES      = sessionData.marble_types || [];
        MARBLE_SELECTIONS = sessionData.player_selections || {};
        if (sessionData.selection_open) {
            await waitForCharacterSelect();
        }
    }

    spawnMarbles();
    if (_ghostMarblePath) _spawnGhostMarble();
    bindUI();
    startCountdown();
    requestAnimationFrame(loop);
}

async function waitForSessionRunning() {
    const waitEl = document.getElementById('overlayCountdown');
    const numEl  = document.getElementById('countdownText');
    const subEl  = document.querySelector('.countdown-sub');
    waitEl.classList.remove('hidden');
    numEl.textContent = '⏳';
    numEl.style.fontSize = '80px';
    subEl.textContent = 'Waiting for race to start…';

    return new Promise(resolve => {
        const iv = setInterval(async () => {
            try {
                const r = await fetch(`/marbles/api/game/${SESSION_ID}`);
                if (!r.ok) return;
                const d = await r.json();
                PLAYER_LIST = d.players || [];
                if (d.state === 'running') {
                    clearInterval(iv);
                    waitEl.classList.add('hidden');
                    numEl.style.fontSize = '';
                    subEl.textContent = 'Get ready!';
                    resolve();
                }
            } catch (_) {}
        }, 2000);
    });
}

// ============================================================================
// CHARACTER SELECT
// ============================================================================
function resolveMarbleType(username) {
    const slot = MARBLE_SELECTIONS[username.toLowerCase()];
    if (slot == null) return null;
    return MARBLE_TYPES.find(m => m.slot === slot && m.enabled) || null;
}

function renderCharSelectGrid() {
    const grid = document.getElementById('csGrid');
    if (!grid) return;
    // Count picks per slot
    const counts = {};
    for (const slot of Object.values(MARBLE_SELECTIONS)) {
        counts[slot] = (counts[slot] || 0) + 1;
    }
    grid.innerHTML = MARBLE_TYPES.filter(m => m.enabled).map(m => {
        const restr = m.restriction ? `<div class="csp-slot-restriction">${m.restriction}</div>` : '';
        const n = counts[m.slot] || 0;
        return `<div class="csp-slot available">
            <div class="csp-slot-num">Slot ${m.slot}</div>
            <div class="csp-slot-swatch" style="background:${m.color}"></div>
            <div class="csp-slot-name">${m.icon || ''} ${m.name}</div>
            ${restr}
            <div class="csp-slot-count">${n} player${n !== 1 ? 's' : ''}</div>
        </div>`;
    }).join('');
}

function renderCharSelectPlayers() {
    const el = document.getElementById('csPlayers');
    if (!el) return;
    const entries = Object.entries(MARBLE_SELECTIONS);
    if (entries.length === 0) {
        el.innerHTML = '<span style="font-size:11px;color:#555;">No one has chosen yet…</span>';
        return;
    }
    el.innerHTML = entries.map(([name, slot]) => {
        const mt = MARBLE_TYPES.find(m => m.slot === slot);
        const icon = mt ? (mt.icon || '●') : '●';
        return `<span class="csp-player-tag"><span class="csp-player-icon">${icon}</span>${name}</span>`;
    }).join('');
}

function showCharacterSelect() {
    document.getElementById('overlayCharSelect').classList.remove('hidden');
    renderCharSelectGrid();
    renderCharSelectPlayers();
}

function hideCharacterSelect() {
    document.getElementById('overlayCharSelect').classList.add('hidden');
}

async function waitForCharacterSelect() {
    showCharacterSelect();
    return new Promise(resolve => {
        const iv = setInterval(async () => {
            try {
                const r = await fetch(`/marbles/api/game/${SESSION_ID}`);
                if (!r.ok) { clearInterval(iv); resolve(); return; }
                const d = await r.json();
                MARBLE_TYPES      = d.marble_types || [];
                MARBLE_SELECTIONS = d.player_selections || {};
                PLAYER_LIST       = d.players || [];
                renderCharSelectGrid();
                renderCharSelectPlayers();
                if (!d.selection_open) {
                    clearInterval(iv);
                    hideCharacterSelect();
                    resolve();
                }
            } catch (_) { /* network blip */ }
        }, 1500);
    });
}

// ============================================================================
// RENDERER
// ============================================================================
function setupRenderer() {
    const canvas = document.getElementById('race-canvas');
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: TRANSPARENT,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !PERF_MODE;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const bgHex = BG_COLOR ? parseInt(BG_COLOR.replace('#', ''), 16) : 0x050508;
    renderer.setClearColor(TRANSPARENT ? 0x000000 : bgHex, TRANSPARENT ? 0 : 1);
    window.addEventListener('resize', onResize);
    onResize();
}

function onResize() {
    const w = RENDER_W || window.innerWidth;
    const h = RENDER_H || window.innerHeight;
    renderer.setSize(w, h);
    if (camera) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
}

// ============================================================================
// SCENE SETUP
// ============================================================================
function setupScene() {
    scene = new THREE.Scene();
    if (!TRANSPARENT) scene.fog = new THREE.FogExp2(0x050508, 0.006);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.set(0, 40, 60);
    camera.lookAt(0, 0, 0);

    // Free-cam controls (only used in FREE cam mode)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enabled = false;

    // Ambient
    ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    // Sun
    sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
    sunLight.position.set(80, 120, 60);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 800;
    const sc = sunLight.shadow.camera;
    sc.left = sc.bottom = -250;
    sc.right = sc.top   =  250;
    scene.add(sunLight);

    // Hemisphere fill
    scene.add(new THREE.HemisphereLight(0x334466, 0x221100, 0.4));

    // Ground plane (visual reference only)
    if (!TRANSPARENT) {
        const groundGeo = new THREE.PlaneGeometry(800, 800);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x0a0a12 });
        const ground    = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -5;
        ground.receiveShadow = true;
        scene.add(ground);
    }

    buildSkybox();
}

// ============================================================================
// PHYSICS WORLD
// ============================================================================
function setupPhysics() {
    const gravValues = { low: -12, normal: -35, high: -60 };
    const gravY      = gravValues[RACE_SETTINGS.gravity] ?? -35;
    world = new CANNON.World({ gravity: new CANNON.Vec3(0, gravY, 0) });
    world.broadphase  = new CANNON.SAPBroadphase(world);
    world.allowSleep  = true;

    const frictionScale = { low: 0.25, normal: 1.0, high: 2.5 }[RACE_SETTINGS.marble_friction] ?? 1.0;
    makeContactMaterials().forEach(cm => {
        // Scale marble ↔ track friction by the session setting
        const [m0, m1] = cm.materials ?? [];
        const isMarbleTrack = (m0 === MAT_MARBLE || m1 === MAT_MARBLE) &&
                              (m0 === MAT_TRACK  || m1 === MAT_TRACK);
        if (isMarbleTrack) cm.friction *= frictionScale;
        world.addContactMaterial(cm);
    });

    world.addEventListener('beginContact', e => {
        SFX.collision();
        if (bongoPadBodies.has(e.bodyA) || bongoPadBodies.has(e.bodyB)) {
            SFX.bongoBoink();
            // Spawn ring particles at contact point
            const pos = e.bodyA.position;
            spawnParticles(pos.x, pos.y + 0.5, pos.z, 0xef4444, 10);
            // Trigger squish animation on the bongo pad mesh
            const bMesh = bongoPadMeshes.get(e.bodyA) || bongoPadMeshes.get(e.bodyB);
            if (bMesh) _bongoSquish.set(bMesh, { t: 1.0 });
        }
    });
}

// ============================================================================
// MAP BUILDING
// ============================================================================
function buildMap() {
    if (!MAP_DATA?.pieces) return;

    MAP_DATA.pieces.forEach(piece => {
        const def = PIECES[piece.pieceId];
        if (!def) return;

        // Compute lowest Y for fall-off detection
        if (piece.pos.y < lowestTrackY) lowestTrackY = piece.pos.y;

        // Build visual mesh
        const mesh = buildPieceMesh(piece, def);
        if (mesh) {
            mesh.position.set(piece.pos.x, piece.pos.y + def.h / 2, piece.pos.z);
            mesh.rotation.y = THREE.MathUtils.degToRad(piece.rot || 0);
            mesh.receiveShadow = true;
            mesh.castShadow = true;
            scene.add(mesh);
        }

        // Build physics colliders
        const bodies = buildColliders(piece);
        bodies.forEach(b => world.addBody(b));

        // Tag bongo pad bodies for contact sound + squish animation
        if (piece.pieceId === 'bongo_pad') bodies.forEach(b => {
            bongoPadBodies.add(b);
            if (mesh) bongoPadMeshes.set(b, mesh);
        });

        // Track special pieces
        if (piece.pieceId === 'start') {
            startPiece = piece;
        }

        if (piece.pieceId === 'finish') {
            const fd = PIECES['finish'] ?? { w: 4, d: 6, h: 1 };
            finishAABB = {
                minX: piece.pos.x - fd.w / 2, maxX: piece.pos.x + fd.w / 2,
                minY: piece.pos.y - 1,        maxY: piece.pos.y + 6,
                minZ: piece.pos.z - fd.d / 2, maxZ: piece.pos.z + fd.d / 2,
                cx: piece.pos.x, cy: piece.pos.y, cz: piece.pos.z,
            };
        }

        if (piece.pieceId === 'checkpoint') {
            checkpoints.push({ aabb: {
                minX: piece.pos.x - 3, maxX: piece.pos.x + 3,
                minY: piece.pos.y - 1, maxY: piece.pos.y + 4,
                minZ: piece.pos.z - 1, maxZ: piece.pos.z + 1,
            }, id: piece.id });
        }

        if (piece.pieceId === 'waypoint') {
            waypoints.push({ aabb: {
                minX: piece.pos.x - 2, maxX: piece.pos.x + 2,
                minY: piece.pos.y - 1, maxY: piece.pos.y + 3,
                minZ: piece.pos.z - 2, maxZ: piece.pos.z + 2,
            }, order: piece.props?.order ?? 1, id: piece.id });
        }

        // Register interactive pieces for effectsHandler
        if (piece.pieceId === 'boost_pad')      boostPads.push(piece);
        if (piece.pieceId === 'wind_box')        windZones.push(piece);
        if (piece.pieceId === 'no_gravity')      noGravZones.push(piece);
        if (piece.pieceId === 'speed_limiter')   speedLimiters.push(piece);
        if (piece.pieceId === 'conveyor_belt')   conveyorBelts.push(piece);
        if (piece.pieceId === 'gravity_flip')    gravFlipZones.push(piece);
        if (piece.pieceId === 'spike_strip')     spikeStrips.push(piece);
        if (piece.pieceId === 'earthquake_pad')  earthquakePads.push(piece);
        if (piece.pieceId === 'glue_trap')       glueTrapDefs.push(piece);
        if (piece.pieceId === 'magnet')               magnets.push(piece);
        if (piece.pieceId === 'reverse_pad')          reversePads.push(piece);
        if (piece.pieceId === 'black_hole')           blackHoles.push(piece);
        if (piece.pieceId === 'cannon')               cannonDefs.push(piece);
        if (piece.pieceId === 'shrink_zone')          shrinkZones.push(piece);
        if (piece.pieceId === 'giant_zone')           giantZones.push(piece);
        if (piece.pieceId === 'pinball_bumper_ring')  bumperRings.push(piece);

        if (piece.pieceId === 'rotating_ring' || piece.pieceId === 'pendulum') {
            const body = bodies[0];
            if (body) kinematicBodies.push({ body, piece, mesh });
        }

        if (piece.pieceId === 'laser') {
            const beamMesh = buildLaserBeam(piece);
            scene.add(beamMesh);
            laserDefs.push({ piece, beamMesh, timer: 0, active: false });
        }

        if (piece.pieceId === 'hammer' || piece.pieceId === 'rotating_post') {
            const body = bodies[0];
            if (body) kinematicBodies.push({ body, piece });
        }

        if (piece.pieceId === 'moving_platform') {
            const body = bodies[0];
            if (body) kinematicBodies.push({ body, piece });
        }

        if (piece.pieceId === 'drawbridge' || piece.pieceId === 'catapult' || piece.pieceId === 'diving_board') {
            const body = bodies[0];
            if (body) kinematicBodies.push({ body, piece, mesh });
        }

        if (piece.pieceId === 'spring') {
            const body = bodies[0];
            if (body) springs.push({ body, piece });
        }

        if (piece.pieceId === 'teleporter' && piece.props?.pairId) {
            const pid = piece.props.pairId;
            if (!teleporters[pid]) teleporters[pid] = [];
            teleporters[pid].push(piece);
        }
    });

    if (lowestTrackY === Infinity) lowestTrackY = -10;
}

// ============================================================================
// PIECE VISUAL MESH BUILDERS — tube-based to match editor
// ============================================================================
const TUBE_R = 2;

function _tubeMat(color) {
    return new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
}

function buildStraightTubeMesh(def) {
    const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, -def.d/2), new THREE.Vector3(0, 0, def.d/2));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 2, TUBE_R, 8, false), _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

function buildCornerTubeMesh(def, leftTurn) {
    const sign = leftTurn ? 1 : -1;
    const pts = [];
    for (let i = 0; i <= 20; i++) {
        const t = (i / 20) * (Math.PI / 2);
        pts.push(new THREE.Vector3(sign * 8 * (1 - Math.cos(t)), 0, 8 * Math.sin(t)));
    }
    const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, TUBE_R, 8, false),
        _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

function buildRampTubeMesh(def, isUp) {
    const d = def.d;
    const rise = d * Math.tan(THREE.MathUtils.degToRad((def.defaultProps ?? def.props)?.angle ?? 15));
    const curve = new THREE.LineCurve3(
        new THREE.Vector3(0, isUp ? 0 : rise, -d/2),
        new THREE.Vector3(0, isUp ? rise : 0,  d/2)
    );
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 2, TUBE_R, 8, false), _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

function buildBankedCornerTubeMesh(def, leftTurn, goingUp) {
    const sign = leftTurn ? 1 : -1;
    const rise = 8 * (Math.PI / 2) * Math.tan(THREE.MathUtils.degToRad((def.defaultProps ?? def.props)?.angle ?? 15));
    const pts = [];
    for (let i = 0; i <= 20; i++) {
        const t = (i / 20) * (Math.PI / 2);
        const y = goingUp ? rise * (i / 20) : rise * (1 - i / 20);
        pts.push(new THREE.Vector3(sign * 8 * (1 - Math.cos(t)), y, 8 * Math.sin(t)));
    }
    const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, TUBE_R, 8, false),
        _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

function buildPlatformMesh_play(def, trackW, wallH) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(trackW, 0.4, def.d), mat));
    const lw = new THREE.Mesh(new THREE.BoxGeometry(0.25, wallH, def.d), mat);
    lw.position.set(-(trackW / 2 + 0.125), wallH / 2, 0);
    group.add(lw);
    const rw = new THREE.Mesh(new THREE.BoxGeometry(0.25, wallH, def.d), mat);
    rw.position.set(trackW / 2 + 0.125, wallH / 2, 0);
    group.add(rw);
    group.castShadow = true;
    return group;
}

function buildHalfPipeMesh_play(def) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.4, def.d), mat));
    const wallH = 2.5;
    const lw = new THREE.Mesh(new THREE.BoxGeometry(0.35, wallH, def.d), mat);
    lw.position.set(-1.925, wallH / 2, 0);
    group.add(lw);
    const rw = new THREE.Mesh(new THREE.BoxGeometry(0.35, wallH, def.d), mat);
    rw.position.set(1.925, wallH / 2, 0);
    group.add(rw);
    group.castShadow = true;
    return group;
}

function buildCrossroadsMesh_play(def) {
    const group = new THREE.Group();
    const straightDef = { ...def, d: def.w };
    const m1 = buildStraightTubeMesh(straightDef);
    group.add(m1);
    const m2 = buildStraightTubeMesh(straightDef);
    m2.rotation.y = Math.PI / 2;
    group.add(m2);
    return group;
}

function buildStaircaseMesh_play(def) {
    const group    = new THREE.Group();
    const mat      = _tubeMat(def.color);
    const numSteps = 5;
    const stepD    = def.d / numSteps;
    const stepDrop = 0.55;
    for (let i = 0; i < numSteps; i++) {
        const stepZ = -def.d / 2 + (i + 0.5) * stepD;
        const stepY = -i * stepDrop;
        const step  = new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.4, stepD + 0.05), mat);
        step.position.set(0, stepY, stepZ);
        group.add(step);
        const wallH = stepDrop + 0.4;
        const lw = new THREE.Mesh(new THREE.BoxGeometry(0.25, wallH, stepD + 0.05), mat);
        lw.position.set(-(def.w / 2 + 0.125), stepY + wallH / 2 - 0.2, stepZ);
        group.add(lw);
        const rw = new THREE.Mesh(new THREE.BoxGeometry(0.25, wallH, stepD + 0.05), mat);
        rw.position.set(def.w / 2 + 0.125, stepY + wallH / 2 - 0.2, stepZ);
        group.add(rw);
    }
    group.castShadow = true;
    return group;
}

function buildSCurveMesh_play(def) {
    const d = def.d, bulge = 4;
    const pts = [];
    for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        pts.push(new THREE.Vector3(bulge * Math.sin(Math.PI * t), 0, -d / 2 + t * d));
    }
    const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, TUBE_R, 8, false),
        _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

function buildTubeCurveMesh_play(def, leftTurn) {
    const sign = leftTurn ? 1 : -1, arcR = 8;
    const pts = [];
    for (let i = 0; i <= 20; i++) {
        const t = (i / 20) * (Math.PI / 2);
        pts.push(new THREE.Vector3(sign * arcR * (1 - Math.cos(t)), 0, arcR * Math.sin(t)));
    }
    const geo   = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, TUBE_R * 1.1, 10, false);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        color: def.color, side: THREE.BackSide, transparent: true, opacity: 0.9 })));
    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        color: def.color, transparent: true, opacity: 0.4 })));
    group.castShadow = true;
    return group;
}

function buildDrawbridgeMesh_play(def) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.3, def.d), mat));
    const postMat = new THREE.MeshLambertMaterial({ color: 0x57534e });
    [-1, 1].forEach(sign => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2, 0.4), postMat);
        post.position.set(sign * (def.w / 2 - 0.2), 1, -def.d / 2);
        group.add(post);
    });
    return group;
}

function buildCatapultMesh_play(def) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.4, def.d), mat));
    const springMat = new THREE.MeshLambertMaterial({ color: 0x6b7280 });
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
        const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.5, 6), springMat);
        spring.position.set(sx * (def.w / 2 - 0.6), -0.2, sz * (def.d / 2 - 0.6));
        group.add(spring);
    });
    return group;
}

function buildDivingBoardMesh_play(def) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.3, def.d), mat));
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.5), mat);
    post.position.set(0, -0.75, -def.d / 2);
    group.add(post);
    return group;
}

function buildBankedTurnMesh_play(def, leftTurn) {
    const sign  = leftTurn ? 1 : -1;
    const R     = 8, bankDeg = 20, segs = 12;
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    for (let i = 0; i < segs; i++) {
        const t0 = (i / segs) * Math.PI / 2;
        const t1 = ((i + 1) / segs) * Math.PI / 2;
        const tm = (t0 + t1) * 0.5;
        const cx = sign * R * (1 - Math.cos(tm));
        const cz = R * Math.sin(tm);
        const len = R * (t1 - t0) + 0.1;
        const floor = new THREE.Mesh(new THREE.BoxGeometry(4, 0.35, len), mat);
        floor.position.set(cx, 0, cz);
        floor.rotation.order = 'YZX';
        floor.rotation.y = -sign * tm;
        floor.rotation.z = sign * THREE.MathUtils.degToRad(bankDeg);
        group.add(floor);
        const outerR = R + 2.5;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, len), mat);
        wall.position.set(sign * outerR * (1 - Math.cos(tm)), 0.7, outerR * Math.sin(tm));
        wall.rotation.y = -sign * tm;
        group.add(wall);
    }
    return group;
}

function buildRampSpiralMesh_play(def) {
    const d    = def.d;
    const R    = 6;
    const rise = def.defaultProps?.rise ?? 6;
    const N    = 32;
    const pts  = [];
    for (let i = 0; i <= N; i++) {
        const t = (i / N) * Math.PI * 2;
        pts.push(new THREE.Vector3(
            -R * (1 - Math.cos(t)),
            rise * (t / (Math.PI * 2)),
            -d / 2 + (i / N) * d
        ));
    }
    const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, TUBE_R, 8, false),
        _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

function buildVerticalDropMesh_play(def) { return buildRampTubeMesh(def, false); }

function buildCorkscrewMesh_play(def) {
    const d    = def.d;
    const R    = 4;
    const drop = def.defaultProps?.drop ?? 4;
    const N    = 32;
    const pts  = [];
    for (let i = 0; i <= N; i++) {
        const t = (i / N) * Math.PI * 2;
        pts.push(new THREE.Vector3(
            -R * (1 - Math.cos(t)),
            -drop * (t / (Math.PI * 2)),
            -d / 2 + (i / N) * d
        ));
    }
    const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, TUBE_R, 8, false),
        _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

function buildPinballLaneMesh_play(def) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.4, def.d), mat));
    const wallH = 0.8;
    ['l', 'r'].forEach(side => {
        const wx = (def.w / 2 + 0.125) * (side === 'l' ? -1 : 1);
        const wm = new THREE.Mesh(new THREE.BoxGeometry(0.25, wallH, def.d), mat);
        wm.position.set(wx, wallH / 2, 0);
        group.add(wm);
    });
    const bumperMat = new THREE.MeshLambertMaterial({ color: 0xfbbf24 });
    const bumpR = 0.5, spacing = def.d / 5;
    for (let i = 0; i < 4; i++) {
        const bz = -def.d / 2 + spacing * (i + 1);
        const bx = (i % 2 === 0 ? 1 : -1) * (def.w / 2 - 1.2);
        [bx, -bx].forEach(x => {
            const bm = new THREE.Mesh(new THREE.SphereGeometry(bumpR, 8, 8), bumperMat);
            bm.position.set(x, bumpR, bz);
            group.add(bm);
        });
    }
    return group;
}

function buildFinishRampMesh_play(def) {
    const d     = def.d;
    const angle = def.defaultProps?.angle ?? 8;
    const rise  = d * Math.tan(THREE.MathUtils.degToRad(angle));
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.4, d), mat);
    ramp.rotation.x = THREE.MathUtils.degToRad(-angle);
    ramp.position.set(0, -rise / 2, 0);
    group.add(ramp);
    [-1, 1].forEach(sign => {
        const wm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, d), mat);
        wm.position.set(sign * (def.w / 2 + 0.15), 0.6 - rise / 2, 0);
        wm.rotation.x = THREE.MathUtils.degToRad(-angle);
        group.add(wm);
    });
    return group;
}

function buildBowlMesh_play(def) {
    const group  = new THREE.Group();
    const mat    = _tubeMat(def.color);
    const panels = 8;
    const R      = def.w / 2;
    const wallH  = def.h;
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.3, 12), mat));
    for (let i = 0; i < panels; i++) {
        const a  = (i / panels) * Math.PI * 2;
        const am = a + (Math.PI * 2 / panels) / 2;
        const px = Math.cos(am) * (R - 0.5);
        const pz = Math.sin(am) * (R - 0.5);
        const wm = new THREE.Mesh(new THREE.BoxGeometry(R * 0.85, 0.3, wallH), mat);
        wm.position.set(px, wallH / 2, pz);
        wm.rotation.y = -am;
        wm.rotation.x = THREE.MathUtils.degToRad(90 - 50);
        group.add(wm);
    }
    return group;
}

function buildWallJumpMesh_play(def) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    const gap   = 1.8, wallW = 0.5;
    const wallH = def.h;
    [-1, 1].forEach(sign => {
        const wm = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, def.d), mat);
        wm.position.set(sign * (gap / 2 + wallW / 2), wallH / 2, 0);
        group.add(wm);
    });
    group.add(new THREE.Mesh(new THREE.BoxGeometry(gap, 0.3, def.d), mat));
    return group;
}

function buildBlackHoleMesh_play(def) {
    const group = new THREE.Group();
    // Dark core sphere
    const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 16, 16),
        new THREE.MeshLambertMaterial({ color: 0x1a0030, transparent: true, opacity: 0.95 })
    );
    group.add(core);
    // Glow ring
    const ringGeo = new THREE.TorusGeometry(1.8, 0.25, 8, 24);
    const ringMat = new THREE.MeshLambertMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.7 });
    group.add(new THREE.Mesh(ringGeo, ringMat));
    return group;
}

function buildCannonMesh_play(def) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x374151 });
    // Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 4.5, 12), mat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 1.2, 0);
    group.add(barrel);
    // Base
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.0, 2.5), mat);
    group.add(base);
    return group;
}

function buildShrinkZoneMesh_play(def) {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(def.w, def.h, def.d);
    const mat = new THREE.MeshLambertMaterial({ color: 0x6d28d9, transparent: true, opacity: 0.12 });
    group.add(new THREE.Mesh(geo, mat));
    group.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0xc4b5fd })
    ));
    return group;
}

function buildGiantZoneMesh_play(def) {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(def.w, def.h, def.d);
    const mat = new THREE.MeshLambertMaterial({ color: 0x0891b2, transparent: true, opacity: 0.12 });
    group.add(new THREE.Mesh(geo, mat));
    group.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x67e8f9 })
    ));
    return group;
}

function buildRotatingRingMesh_play(def) {
    const ringGeo = new THREE.TorusGeometry(2.5, 0.4, 8, 24);
    return new THREE.Mesh(ringGeo, new THREE.MeshLambertMaterial({ color: 0xf59e0b }));
}

function buildPendulumMesh_play(def) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x78716c });
    // Pivot post
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2, 8), mat);
    post.position.y = 6;
    group.add(post);
    // Chain (thin cylinder)
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 6), mat);
    chain.position.set(0, 4, 0);
    group.add(chain);
    // Ball
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 12),
        new THREE.MeshLambertMaterial({ color: 0xd1d5db }));
    ball.position.set(0, 1.5, 0);
    group.add(ball);
    return group;
}

function buildPinballBumperRingMesh_play(def) {
    const group = new THREE.Group();
    const R = 3, count = 6;
    const mat = new THREE.MeshLambertMaterial({ color: 0xfbbf24 });
    for (let i = 0; i < count; i++) {
        const t    = (i / count) * Math.PI * 2;
        const bump = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 10), mat);
        bump.position.set(R * Math.sin(t), 0.6, R * Math.cos(t));
        group.add(bump);
    }
    return group;
}

function buildTrampolineMesh_play(def) {
    const group = new THREE.Group();
    // Wide platform
    const baseGeo = new THREE.BoxGeometry(def.w, 0.3, def.d);
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x4ade80 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.15;
    // Spring coils at corners
    const coilMat = new THREE.MeshLambertMaterial({ color: 0xd1fae5 });
    for (const [cx, cz] of [[-2.5,-2.5],[-2.5,2.5],[2.5,-2.5],[2.5,2.5]]) {
        const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 6), coilMat);
        coil.position.set(cx, -0.05, cz);
        group.add(coil);
    }
    group.add(base);
    return group;
}

function buildSlipperySlopeMesh_play(def) {
    const angle = (def.defaultProps?.angle ?? 15) * Math.PI / 180;
    const group = new THREE.Group();
    const rampGeo = new THREE.BoxGeometry(def.w, 0.3, def.d);
    const rampMat = new THREE.MeshLambertMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.8 });
    const ramp = new THREE.Mesh(rampGeo, rampMat);
    ramp.rotation.x = -angle;
    group.add(ramp);
    return group;
}

function buildStickyPadMesh_play(def) {
    const group = new THREE.Group();
    const padGeo = new THREE.BoxGeometry(def.w, 0.2, def.d);
    const padMat = new THREE.MeshLambertMaterial({ color: 0x854d0e });
    group.add(new THREE.Mesh(padGeo, padMat));
    // Dark overlay for tar look
    const overlayGeo = new THREE.BoxGeometry(def.w * 0.9, 0.22, def.d * 0.9);
    const overlayMat = new THREE.MeshLambertMaterial({ color: 0x3b1a00, transparent: true, opacity: 0.6 });
    const overlay = new THREE.Mesh(overlayGeo, overlayMat);
    overlay.position.y = 0.01;
    group.add(overlay);
    return group;
}

function buildGhostBlockMesh_play(def) {
    const geo   = new THREE.BoxGeometry(def.w, def.h, def.d);
    const mat   = new THREE.MeshLambertMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.18 });
    const mesh  = new THREE.Mesh(geo, mat);
    const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0xc4b5fd })
    );
    const group = new THREE.Group();
    group.add(mesh); group.add(edges);
    return group;
}

function buildSpeedLimiterMesh_play(def) {
    const group = new THREE.Group();
    const geo   = new THREE.BoxGeometry(def.w, def.h, def.d);
    const mat   = new THREE.MeshLambertMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.15 });
    group.add(new THREE.Mesh(geo, mat));
    group.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0xfde68a })
    ));
    return group;
}

function buildSpikeStripMesh_play(def) {
    const group = new THREE.Group();
    const baseGeo = new THREE.BoxGeometry(def.w, 0.15, def.d);
    const baseMat = new THREE.MeshLambertMaterial({ color: 0xef4444 });
    group.add(new THREE.Mesh(baseGeo, baseMat));
    // Spikes
    const spikeMat = new THREE.MeshLambertMaterial({ color: 0xfca5a5 });
    for (let i = -2; i <= 2; i++) {
        const spikeGeo = new THREE.ConeGeometry(0.2, 0.6, 4);
        const spike = new THREE.Mesh(spikeGeo, spikeMat);
        spike.position.set(i * 1.1, 0.45, 0);
        group.add(spike);
    }
    return group;
}

function buildConveyorBeltMesh_play(def) {
    const group = new THREE.Group();
    // Main belt surface
    const beltGeo = new THREE.BoxGeometry(def.w, 0.4, def.d);
    const beltMat = new THREE.MeshLambertMaterial({ color: 0x0369a1 });
    group.add(new THREE.Mesh(beltGeo, beltMat));
    // Belt strips (arrow pattern suggestion — ridges)
    const ridgeMat = new THREE.MeshLambertMaterial({ color: 0x38bdf8 });
    for (let z = -3; z <= 3; z += 1.5) {
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(def.w * 0.9, 0.45, 0.15), ridgeMat);
        ridge.position.set(0, 0, z);
        group.add(ridge);
    }
    // Side rails
    const railMat = new THREE.MeshLambertMaterial({ color: 0x0ea5e9 });
    for (const rx of [-def.w / 2 - 0.15, def.w / 2 + 0.15]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, def.d), railMat);
        rail.position.set(rx, 0.1, 0);
        group.add(rail);
    }
    return group;
}

function buildGravFlipMesh_play(def) {
    const group = new THREE.Group();
    const geo   = new THREE.BoxGeometry(def.w, def.h, def.d);
    const mat   = new THREE.MeshLambertMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.15 });
    group.add(new THREE.Mesh(geo, mat));
    group.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0xc4b5fd })
    ));
    return group;
}

function buildEarthquakePadMesh_play(def) {
    const group = new THREE.Group();
    const padGeo = new THREE.BoxGeometry(def.w, 0.2, def.d);
    const padMat = new THREE.MeshLambertMaterial({ color: 0xf97316 });
    group.add(new THREE.Mesh(padGeo, padMat));
    // Crack lines
    const crackMat = new THREE.LineBasicMaterial({ color: 0xfed7aa });
    const pts = [new THREE.Vector3(-1.5, 0.11, -1.5), new THREE.Vector3(0.5, 0.11, 0.5), new THREE.Vector3(1.8, 0.11, 1.2)];
    const crackGeo = new THREE.BufferGeometry().setFromPoints(pts);
    group.add(new THREE.Line(crackGeo, crackMat));
    return group;
}

function buildGlueTrapMesh_play(def) {
    const group = new THREE.Group();
    const padGeo = new THREE.BoxGeometry(def.w, 0.15, def.d);
    const padMat = new THREE.MeshLambertMaterial({ color: 0x92400e });
    group.add(new THREE.Mesh(padGeo, padMat));
    // Ooze look — slightly raised centre
    const oozeMat = new THREE.MeshLambertMaterial({ color: 0x78350f, transparent: true, opacity: 0.9 });
    const ooze = new THREE.Mesh(new THREE.SphereGeometry(def.w * 0.35, 8, 4), oozeMat);
    ooze.scale.y = 0.12;
    ooze.position.y = 0.09;
    group.add(ooze);
    return group;
}

function buildMagnetMesh_play(def) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xec4899 });
    // Post
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8), mat);
    post.position.y = 0.75;
    group.add(post);
    // Horseshoe arms
    const armMat = new THREE.MeshLambertMaterial({ color: 0xf9a8d4 });
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), armMat);
    armL.position.set(-0.8, 2.1, 0);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), armMat);
    armR.position.set( 0.8, 2.1, 0);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.3), armMat);
    crossbar.position.y = 2.7;
    group.add(armL, armR, crossbar);
    return group;
}

function buildReversePadMesh_play(def) {
    const group = new THREE.Group();
    const padGeo = new THREE.BoxGeometry(def.w, 0.2, def.d);
    const padMat = new THREE.MeshLambertMaterial({ color: 0xb91c1c });
    group.add(new THREE.Mesh(padGeo, padMat));
    // Arrow indicator
    const arrowMat = new THREE.MeshLambertMaterial({ color: 0xfca5a5 });
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 4), arrowMat);
    tip.rotation.z = Math.PI; // point backward
    tip.position.set(0, 0.3, -0.8);
    group.add(tip);
    return group;
}

function buildPieceMesh(piece, def) {
    const color = def.color ?? 0x5865f2;
    const id = piece.pieceId;

    // Tube-based track pieces — match editor appearance
    if (id === 'straight')  return buildStraightTubeMesh(def);
    if (id === 'corner_l')  return buildCornerTubeMesh(def, true);
    if (id === 'corner_r')  return buildCornerTubeMesh(def, false);
    if (id === 'ramp_up')   return buildRampTubeMesh(def, true);
    if (id === 'ramp_down') return buildRampTubeMesh(def, false);
    if (id === 'bank_dl')   return buildBankedCornerTubeMesh(def, true,  false);
    if (id === 'bank_dr')   return buildBankedCornerTubeMesh(def, false, false);
    if (id === 'bank_ul')          return buildBankedCornerTubeMesh(def, true,  true);
    if (id === 'bank_ur')          return buildBankedCornerTubeMesh(def, false, true);
    if (id === 'straight_wide')    return buildPlatformMesh_play(def, 8, 0.8);
    if (id === 'straight_narrow')  return buildPlatformMesh_play(def, 2, 1.2);
    if (id === 'half_pipe')        return buildHalfPipeMesh_play(def);
    if (id === 'crossroads')       return buildCrossroadsMesh_play(def);
    if (id === 'staircase')        return buildStaircaseMesh_play(def);
    if (id === 's_curve')          return buildSCurveMesh_play(def);
    if (id === 'tube_curve_l')     return buildTubeCurveMesh_play(def, true);
    if (id === 'tube_curve_r')     return buildTubeCurveMesh_play(def, false);
    if (id === 'vertical_drop')    return buildVerticalDropMesh_play(def);
    if (id === 'corkscrew')        return buildCorkscrewMesh_play(def);
    if (id === 'pinball_lane')     return buildPinballLaneMesh_play(def);
    if (id === 'finish_ramp')      return buildFinishRampMesh_play(def);
    if (id === 'bowl')             return buildBowlMesh_play(def);
    if (id === 'wall_jump')        return buildWallJumpMesh_play(def);
    if (id === 'bank_turn_l')      return buildBankedTurnMesh_play(def, true);
    if (id === 'bank_turn_r')      return buildBankedTurnMesh_play(def, false);
    if (id === 'ramp_spiral')      return buildRampSpiralMesh_play(def);
    if (id === 'drawbridge')       return buildDrawbridgeMesh_play(def);
    if (id === 'catapult')         return buildCatapultMesh_play(def);
    if (id === 'diving_board')     return buildDivingBoardMesh_play(def);

    // Start / Finish — invisible trigger zones (physics floor kept separately)
    if (id === 'start' || id === 'finish') return null;

    if (id === 'trampoline')          return buildTrampolineMesh_play(def);
    if (id === 'slippery_slope')      return buildSlipperySlopeMesh_play(def);
    if (id === 'sticky_pad')          return buildStickyPadMesh_play(def);
    if (id === 'ghost_block')         return buildGhostBlockMesh_play(def);
    if (id === 'speed_limiter')       return buildSpeedLimiterMesh_play(def);
    if (id === 'spike_strip')         return buildSpikeStripMesh_play(def);
    if (id === 'conveyor_belt')       return buildConveyorBeltMesh_play(def);
    if (id === 'gravity_flip')        return buildGravFlipMesh_play(def);
    if (id === 'earthquake_pad')      return buildEarthquakePadMesh_play(def);
    if (id === 'glue_trap')           return buildGlueTrapMesh_play(def);
    if (id === 'magnet')              return buildMagnetMesh_play(def);
    if (id === 'reverse_pad')         return buildReversePadMesh_play(def);
    if (id === 'black_hole')          return buildBlackHoleMesh_play(def);
    if (id === 'cannon')              return buildCannonMesh_play(def);
    if (id === 'shrink_zone')         return buildShrinkZoneMesh_play(def);
    if (id === 'giant_zone')          return buildGiantZoneMesh_play(def);
    if (id === 'rotating_ring')       return buildRotatingRingMesh_play(def);
    if (id === 'pendulum')            return buildPendulumMesh_play(def);
    if (id === 'pinball_bumper_ring') return buildPinballBumperRingMesh_play(def);

    if (id === 'wind_box' || id === 'no_gravity' ||
        id === 'ice_zone' || id === 'mud_zone') {
        const geo   = new THREE.BoxGeometry(def.w, def.h, def.d);
        const mat   = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.2 });
        const mesh  = new THREE.Mesh(geo, mat);
        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color }));
        const group = new THREE.Group();
        group.add(mesh); group.add(edges);
        return group;
    }

    if (id === 'laser') {
        const geo = new THREE.BoxGeometry(def.w, def.h, def.w);
        return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    }

    if (id === 'checkpoint') {
        const group   = new THREE.Group();
        const postMat = new THREE.MeshLambertMaterial({ color: 0x3b82f6 });
        const beam    = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 0.3), postMat);
        beam.position.y = 3;
        const postGeo = new THREE.BoxGeometry(0.3, 3, 0.3);
        const postL   = new THREE.Mesh(postGeo, postMat);
        postL.position.set(-3, 1.5, 0);
        const postR   = new THREE.Mesh(postGeo, postMat);
        postR.position.set( 3, 1.5, 0);
        group.add(beam, postL, postR);
        return group;
    }

    // Funnel / default: box
    const geo = new THREE.BoxGeometry(def.w, def.h, def.d);
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
}

// kept for compatibility with darken() references below
function buildTrackMesh(def, color) {
    return buildStraightTubeMesh(def);
}

function buildCornerMesh(def, leftTurn, color) {
    return buildCornerTubeMesh(def, leftTurn);
}


function buildLaserBeam(piece) {
    const geo  = new THREE.CylinderGeometry(0.05, 0.05, piece.props?.d ?? 8, 6);
    const mat  = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(piece.pos.x, piece.pos.y + 0.5, piece.pos.z);
    mesh.rotation.x = Math.PI / 2;  // lay along Z
    mesh.rotation.y = THREE.MathUtils.degToRad(piece.rot || 0);
    mesh.visible = false;
    return mesh;
}

function darken(hex, f) {
    return ((Math.round(((hex>>16)&0xff)*f)<<16)|
            (Math.round(((hex>>8)&0xff)*f)<<8)|
             Math.round((hex&0xff)*f));
}

// ============================================================================
// MARBLE SPAWNING
// ============================================================================
function usernameToColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return new THREE.Color().setHSL(hue / 360, 0.75, 0.58);
}

function spawnMarbles() {
    const spawnCenter = startPiece
        ? { x: startPiece.pos.x, y: startPiece.pos.y + 4, z: startPiece.pos.z }
        : { x: 0, y: 6, z: 0 };

    const COLS = 8;
    PLAYER_LIST.forEach((username, i) => {
        const col   = i % COLS;
        const row   = Math.floor(i / COLS);
        const jx    = (Math.random() - 0.5) * 0.5;
        const jz    = (Math.random() - 0.5) * 0.5;
        const sx    = spawnCenter.x + (col - (COLS - 1) / 2) * 1.4 + jx;
        const sy    = spawnCenter.y + row * 1.2;
        const sz    = spawnCenter.z + row * 1.4 + jz;

        // Physics body
        const body = new CANNON.Body({
            mass: 1,
            material: MAT_MARBLE,
            linearDamping: 0.04,
            angularDamping: 0.08,
        });
        body.addShape(new CANNON.Sphere(0.5));
        body.position.set(sx, sy, sz);
        body.type = CANNON.Body.STATIC;  // frozen until countdown ends
        body.allowSleep = false;
        world.addBody(body);

        // Visual mesh — use marble type color if player picked one, else hash-derived (or HC palette)
        const marbleType = resolveMarbleType(username);
        const _teamColor = RACE_SETTINGS.team_mode && _teamAssignments[username.toLowerCase()]
            ? (_teamAssignments[username.toLowerCase()] === 'red' ? new THREE.Color(0xee3333) : new THREE.Color(0x3388ee))
            : null;
        const color = _teamColor || (HIGH_CONTRAST
            ? new THREE.Color(HC_PALETTE[i % HC_PALETTE.length])
            : marbleType
                ? new THREE.Color(marbleType.color)
                : usernameToColor(username));
        const geo = new THREE.SphereGeometry(0.5, PERF_MODE ? 6 : 16, PERF_MODE ? 6 : 16);
        const pCosm        = _playerCosmetics[username.toLowerCase()] || {};
        const equippedSkin = RACE_SETTINGS.cosmetics_enabled !== false
            ? (pCosm.skin || 'solid')
            : 'solid';
        const marbleScale  = RACE_SETTINGS.cosmetics_enabled !== false
            ? (parseFloat(pCosm.size) || 1.0)
            : 1.0;
        const skinTex = !PERF_MODE ? buildSkinTexture(equippedSkin, color) : null;
        const matOpts = skinTex
            ? { map: skinTex, color: 0xffffff }
            : { color };
        const mat  = new THREE.MeshLambertMaterial(matOpts);
        // Transparent skin — make marble semi-transparent
        if (equippedSkin === 'transparent') { mat.transparent = true; mat.opacity = 0.25; }
        const mesh = new THREE.Mesh(geo, mat);
        if (marbleScale !== 1.0) mesh.scale.setScalar(marbleScale);
        mesh.castShadow = true;
        scene.add(mesh);

        // Nametag sprite
        const nametag = buildNametag(username, color);
        scene.add(nametag);

        // Trail
        const equippedTrail = RACE_SETTINGS.cosmetics_enabled !== false
            ? (pCosm.trail || 'classic') : 'classic';
        if (!PERF_MODE) initTrail(username, color, equippedTrail);

        // Blob shadow disk
        let shadowDisk = null;
        if (!PERF_MODE) {
            const sdGeo = new THREE.CircleGeometry(0.5, 16);
            const sdMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
            shadowDisk = new THREE.Mesh(sdGeo, sdMat);
            shadowDisk.rotation.x = -Math.PI / 2;
            scene.add(shadowDisk);
        }

        const equippedAccessory = RACE_SETTINGS.cosmetics_enabled !== false
            ? (pCosm.accessory || 'none') : 'none';
        const accessoryMesh = (!PERF_MODE && equippedAccessory && equippedAccessory !== 'none')
            ? _buildAccessoryMesh(equippedAccessory) : null;
        if (accessoryMesh) scene.add(accessoryMesh);

        marbles.push({
            body, mesh, nametag, shadowDisk,
            username, color,
            finished: false, finishTime: null, rank: null,
            respawns: 0,
            lastCheckpoint: null,
            trailPositions: [],
            trailType: equippedTrail,
            _trailTimer: 0,
            accessoryMesh, accessoryKey: equippedAccessory,
            team: _teamAssignments[username.toLowerCase()] || null,
            _baseMass: 1,
        });
    });
}

function buildNametag(name, color) {
    const canvas = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.fill();

    ctx.fillStyle = '#' + color.getHexString();
    ctx.font = 'bold 28px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.substring(0, 18), 128, 32);

    const tex  = new THREE.CanvasTexture(canvas);
    const mat  = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3, 0.75, 1);
    return sprite;
}

// ── Procedural skin texture builder ──────────────────────────────────────────
function _applySkinToCtx(ctx, skinKey, W, H, hexColor) {
    const color = hexColor;
    switch (skinKey) {
        case 'striped': {
            ctx.fillStyle = color; ctx.fillRect(0,0,W,H);
            ctx.save(); ctx.translate(W/2,H/2); ctx.rotate(-Math.PI/4); ctx.translate(-W/2,-H/2);
            ctx.fillStyle = 'rgba(255,255,255,0.32)';
            for (let i = -H; i < W+H; i += 18) ctx.fillRect(i, 0, 9, H+W);
            ctx.restore();
            break;
        }
        case 'polka_dot': {
            ctx.fillStyle = color; ctx.fillRect(0,0,W,H);
            ctx.fillStyle = 'rgba(255,255,255,0.38)';
            for (let y = 8; y < H; y += 20) for (let x = 8; x < W; x += 20) { ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill(); }
            break;
        }
        case 'checker': {
            const sq = Math.round(W / 5);
            for (let cy = 0; cy < H; cy += sq) for (let cx = 0; cx < W; cx += sq) {
                ctx.fillStyle = (Math.floor(cx/sq)+Math.floor(cy/sq)) % 2 === 0 ? color : '#111';
                ctx.fillRect(cx, cy, sq, sq);
            }
            break;
        }
        case 'swirl': {
            const g = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W/2);
            g.addColorStop(0,'#fff'); g.addColorStop(0.4,color); g.addColorStop(1,'#111');
            ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
            break;
        }
        case 'galaxy': case 'nebula': {
            ctx.fillStyle = skinKey==='galaxy' ? '#060618' : '#1a0630'; ctx.fillRect(0,0,W,H);
            const rng = n => { let h=n; h=((h>>16)^h)*0x45d9f3b; return ((h>>16)^h)&0xff; };
            for (let i=0;i<60;i++) { ctx.fillStyle=`rgba(255,255,255,${(rng(i*17)%40+30)/100})`; ctx.beginPath(); ctx.arc(rng(i*7)%W,rng(i*13)%H,rng(i*3)%2+0.5,0,Math.PI*2); ctx.fill(); }
            const ng = ctx.createRadialGradient(W*0.55,H*0.4,2,W/2,H/2,W*0.5);
            ng.addColorStop(0, skinKey==='galaxy' ? 'rgba(88,101,242,0.55)' : 'rgba(200,80,242,0.55)');
            ng.addColorStop(1,'transparent'); ctx.fillStyle=ng; ctx.fillRect(0,0,W,H);
            break;
        }
        case 'lava': {
            const lg = ctx.createRadialGradient(W*0.4,H*0.4,4,W/2,H/2,W*0.6);
            lg.addColorStop(0,'#ffdd00'); lg.addColorStop(0.4,'#ff4400'); lg.addColorStop(1,'#1a0000');
            ctx.fillStyle=lg; ctx.fillRect(0,0,W,H);
            break;
        }
        case 'ice': {
            const ig = ctx.createRadialGradient(W*0.38,H*0.38,3,W/2,H/2,W*0.55);
            ig.addColorStop(0,'#e8f8ff'); ig.addColorStop(0.5,'#7ec8e3'); ig.addColorStop(1,'#003060');
            ctx.fillStyle=ig; ctx.fillRect(0,0,W,H);
            ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=1;
            for (let a=0;a<6;a++) { ctx.beginPath(); ctx.moveTo(W/2,H/2); const an=a*Math.PI/3; ctx.lineTo(W/2+Math.cos(an)*W*0.45,H/2+Math.sin(an)*H*0.45); ctx.stroke(); }
            break;
        }
        case 'ocean': {
            const og = ctx.createLinearGradient(0,0,0,H);
            og.addColorStop(0,'#006994'); og.addColorStop(1,'#00264d');
            ctx.fillStyle=og; ctx.fillRect(0,0,W,H);
            ctx.strokeStyle='rgba(100,200,255,0.2)'; ctx.lineWidth=2;
            for (let y=0;y<H;y+=12) { ctx.beginPath(); ctx.moveTo(0,y+4*Math.sin(y*0.3)); ctx.bezierCurveTo(W/3,y-4,W*2/3,y+4,W,y+2*Math.sin(y*0.2+1)); ctx.stroke(); }
            break;
        }
        case 'gold': {
            const gg = ctx.createRadialGradient(W*0.38,H*0.38,2,W/2,H/2,W*0.55);
            gg.addColorStop(0,'#fffacd'); gg.addColorStop(0.4,'#ffd700'); gg.addColorStop(1,'#a67c00');
            ctx.fillStyle=gg; ctx.fillRect(0,0,W,H);
            break;
        }
        case 'silver': {
            const sg = ctx.createRadialGradient(W*0.38,H*0.38,2,W/2,H/2,W*0.55);
            sg.addColorStop(0,'#fff'); sg.addColorStop(0.4,'#c0c0c0'); sg.addColorStop(1,'#505050');
            ctx.fillStyle=sg; ctx.fillRect(0,0,W,H);
            break;
        }
        case 'holographic': {
            const hg = ctx.createLinearGradient(0,0,W,H);
            hg.addColorStop(0,'#ff0088'); hg.addColorStop(0.25,'#ffaa00'); hg.addColorStop(0.5,'#00ff88');
            hg.addColorStop(0.75,'#0088ff'); hg.addColorStop(1,'#cc00ff');
            ctx.fillStyle=hg; ctx.fillRect(0,0,W,H);
            ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.fillRect(0,0,W,H);
            break;
        }
        case 'neon': {
            ctx.fillStyle='#111'; ctx.fillRect(0,0,W,H);
            const ng2 = ctx.createRadialGradient(W/2,H/2,3,W/2,H/2,W*0.5);
            ng2.addColorStop(0,'rgba(0,255,180,0.9)'); ng2.addColorStop(0.5,'rgba(0,180,255,0.5)'); ng2.addColorStop(1,'transparent');
            ctx.fillStyle=ng2; ctx.fillRect(0,0,W,H);
            break;
        }
        case 'rainbow': {
            const rg = ctx.createLinearGradient(0,0,W,H);
            ['#f00','#f80','#ff0','#0f0','#08f','#80f','#f08'].forEach((c,i)=>rg.addColorStop(i/6,c));
            ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);
            break;
        }
        case 'fire': {
            const fr = ctx.createRadialGradient(W/2,H*0.7,2,W/2,H/2,W*0.55);
            fr.addColorStop(0,'#ffff00'); fr.addColorStop(0.35,'#ff6600'); fr.addColorStop(0.7,'#cc0000'); fr.addColorStop(1,'#1a0000');
            ctx.fillStyle=fr; ctx.fillRect(0,0,W,H);
            break;
        }
        case 'void': {
            ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
            const vg = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W*0.5);
            vg.addColorStop(0,'rgba(40,0,80,0.8)'); vg.addColorStop(0.5,'rgba(10,0,30,0.5)'); vg.addColorStop(1,'transparent');
            ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
            break;
        }
        case 'transparent': {
            ctx.fillStyle = 'rgba(200,220,255,0.18)'; ctx.fillRect(0,0,W,H);
            break;
        }
        case 'diamond': {
            const dg = ctx.createRadialGradient(W*0.35,H*0.35,2,W/2,H/2,W*0.6);
            dg.addColorStop(0,'#fff'); dg.addColorStop(0.2,'#b9f2ff'); dg.addColorStop(0.6,'#0070a0'); dg.addColorStop(1,'#001820');
            ctx.fillStyle=dg; ctx.fillRect(0,0,W,H);
            break;
        }
        case 'obsidian': {
            const ob = ctx.createRadialGradient(W*0.38,H*0.35,2,W/2,H/2,W*0.55);
            ob.addColorStop(0,'#555'); ob.addColorStop(0.5,'#1a1a2e'); ob.addColorStop(1,'#000');
            ctx.fillStyle=ob; ctx.fillRect(0,0,W,H);
            break;
        }
        case 'forest': {
            const fg = ctx.createLinearGradient(0,0,0,H);
            fg.addColorStop(0,'#1a4a1a'); fg.addColorStop(1,'#0a2a0a');
            ctx.fillStyle=fg; ctx.fillRect(0,0,W,H);
            break;
        }
        default: // 'solid' + anything unknown
            ctx.fillStyle = color; ctx.fillRect(0,0,W,H);
    }
}

function buildSkinTexture(skinKey, threeColor) {
    if (!skinKey || skinKey === 'solid') return null; // use vertex color, no texture needed
    const S = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d');
    const hexColor = '#' + threeColor.getHexString();
    _applySkinToCtx(ctx, skinKey, S, S, hexColor);
    // Specular/shading overlay
    const g = ctx.createRadialGradient(S*0.35,S*0.3,2,S/2,S/2,S*0.55);
    g.addColorStop(0,'rgba(255,255,255,0.35)');
    g.addColorStop(0.5,'rgba(255,255,255,0.04)');
    g.addColorStop(1,'rgba(0,0,0,0.22)');
    ctx.fillStyle=g; ctx.fillRect(0,0,S,S);
    return new THREE.CanvasTexture(canvas);
}

function initTrail(username, color, trailType) {
    // Only create the classic line for 'classic' or unrecognised types
    const useClassic = !trailType || trailType === 'classic' || trailType === 'none' || !TRAIL_DEFS[trailType];
    if (!useClassic) return;  // particle trails are spawned dynamically in tickTrails
    const geo = new THREE.BufferGeometry();
    const pts = new Float32Array(TRAIL_LEN * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const mat  = new THREE.LineBasicMaterial({
        color: color, transparent: true, opacity: 0.5, linewidth: 1,
    });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    trailGeo[username]  = geo;
    trailLine[username] = line;
}

// ============================================================================
// ACCESSORY MESHES
// ============================================================================
function _buildAccessoryMesh(key) {
    const g = new THREE.Group();
    const L = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    switch (key) {
    case 'crown': {
        const gold = L(0xf59e0b, 0x3a2800);
        g.add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 8, 12), gold));
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 4), gold);
            spike.position.set(Math.cos(a) * 0.28, 0.14, Math.sin(a) * 0.28);
            g.add(spike);
        }
        break;
    }
    case 'halo': {
        const mat = L(0xfbbf24, 0x6b4800);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 8, 20), mat);
        ring.rotation.x = Math.PI * 0.15;
        g.add(ring);
        break;
    }
    case 'party_hat': {
        const hat = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.48, 8), L(0xe91e8c));
        hat.position.y = 0.24;
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), L(0xffffff));
        tip.position.y = 0.5;
        g.add(hat, tip);
        break;
    }
    case 'bow': {
        const bMat = L(0xff4488);
        const lw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.07), bMat);
        lw.position.set(-0.17, 0, 0); lw.rotation.z = 0.35;
        const rw = lw.clone(); rw.position.set(0.17, 0, 0); rw.rotation.z = -0.35;
        const knot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), L(0xff88aa));
        g.add(lw, rw, knot);
        break;
    }
    case 'propeller': {
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8), L(0x888888)));
        const bMat = L(0x4488ff, 0x001133);
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.11), bMat);
            blade.rotation.y = a;
            blade.position.set(Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19);
            g.add(blade);
        }
        break;
    }
    case 'wings': {
        const wMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        const lw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.26), wMat);
        lw.position.set(-0.32, 0.05, 0); lw.rotation.z = 0.5;
        const rw = lw.clone(); rw.position.set(0.32, 0.05, 0); rw.rotation.z = -0.5;
        g.add(lw, rw);
        break;
    }
    case 'sunglasses': {
        const gMat = L(0x111111);
        const ll = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 12), gMat);
        ll.position.set(-0.18, 0, 0.3);
        const rl = ll.clone(); rl.position.set(0.18, 0, 0.3);
        const br = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.025), gMat);
        br.position.set(0, 0, 0.3);
        g.add(ll, rl, br);
        break;
    }
    default: return null;
    }
    return g;
}

// ============================================================================
// COUNTDOWN
// ============================================================================
function startCountdown() {
    raceState = STATE.COUNTDOWN;
    const overlay = document.getElementById('overlayCountdown');
    const text    = document.getElementById('countdownText');
    overlay.classList.remove('hidden');

    const steps = [
        { label: '3', delay: 0 },
        { label: '2', delay: 1000 },
        { label: '1', delay: 2000 },
        { label: 'GO!', delay: 3000, go: true },
    ];

    steps.forEach(({ label, delay, go }) => {
        setTimeout(() => {
            text.textContent = label;
            text.className   = 'countdown-number' + (go ? ' go' : '');
            // Reset animation
            void text.offsetWidth;
            text.style.animation = 'none';
            void text.offsetWidth;
            text.style.animation = '';
            if (go) SFX.goBeep(); else SFX.countdownBeep(parseInt(label));
        }, delay);
    });

    setTimeout(() => {
        overlay.classList.add('hidden');
        startRace();
    }, 3800);
}

function startRace() {
    raceState     = STATE.RACING;
    raceStartTime = performance.now();

    // Unfreeze marbles
    marbles.forEach(m => {
        m.body.type = CANNON.Body.DYNAMIC;
        m.body.wakeUp();
    });

    SFX.startRolling();

    // Apply forced camera mode — URL param takes priority, then session camera_lock setting
    const _camLockSrc = FORCE_CAM || (RACE_SETTINGS.camera_lock !== 'off' ? RACE_SETTINGS.camera_lock : null);
    if (_camLockSrc === 'overview') camMode = CAM.OVERVIEW;
    else if (_camLockSrc === 'side') camMode = CAM.SIDE;
    else if (_camLockSrc === 'free') camMode = CAM.FREE;
    // 'leader' is default (CAM.LEADER = 0)

    // Show HUD
    const hudEl = document.getElementById('hud');
    if (HUD_MODE === '0') {
        // hide entirely
    } else {
        hudEl.classList.remove('hidden');
        if (HUD_MODE === 'leaderboard') {
            hudEl.querySelector('.hud-left').style.display = 'none';
            hudEl.querySelector('.hud-center').style.display = 'none';
        } else if (HUD_MODE === 'timer') {
            hudEl.querySelector('.hud-center').style.display = 'none';
            document.getElementById('hudLeaderboard').style.display = 'none';
            document.getElementById('hudMarbles').style.display = 'none';
        }
    }
    const _camLocked = RACE_SETTINGS.camera_lock !== 'off' && !FORCE_CAM;
    if (!OBS_MODE && !_camLocked) document.getElementById('camBtn').classList.remove('hidden');

    // Show elimination HUD if in fall elimination or gauntlet mode
    if (RACE_SETTINGS.fall_mode === 'elimination' || RACE_SETTINGS.gauntlet_mode) {
        const elHud = document.getElementById('hudEliminatedCount');
        if (elHud) elHud.style.display = '';
        _updateEliminatedHUD();
    }

    // Poll session for external stop (skip in preview/watch modes)
    if (!PREVIEW_MODE && !WATCH_SESSION) sessionPollInterval = setInterval(pollSession, 5000);

    // Poll abilities from chat (skip in preview mode)
    if (!PREVIEW_MODE && SESSION_ID && RACE_SETTINGS.abilities_enabled !== false) {
        _abilityPollTimer = setInterval(_pollAbilities, 1000);
    }

    // Race timeout — configurable (default 3 min)
    raceTimeout = setTimeout(endRace, (RACE_SETTINGS.timeout_mins ?? 3) * 60 * 1000);

    // Ghost marble
    _startGhostRecording();
    if (_ghostMarblePath) { _ghostActive = true; _ghostPathTime = 0; }
}

// ============================================================================
// MAIN LOOP
// ============================================================================
function loop(now) {
    requestAnimationFrame(loop);

    if (raceState === STATE.LOADING) return;

    const elapsed = _lastTime !== null ? (now - _lastTime) / 1000 : FIXED_STEP;
    _lastTime = now;

    if (raceState === STATE.RACING || raceState === STATE.FINISHING) {
        // Apply drama slow-mo
        const dt = getDramaSlowmo() ? elapsed * 0.3 : elapsed;

        world.step(FIXED_STEP, dt, MAX_SUB);

        tickKinematics(dt);
        tickEffects(dt);
        _tickAbilityEffects(dt);
        tickMarbles(dt);
        _tickGhostMarble(dt);
        tickBongoSquish(dt);
        if (!PERF_MODE) tickTrails(dt);
        if (!PERF_MODE) tickTrailParticles(dt);
        if (!PERF_MODE) tickParticles(dt);
        checkFinish();
        checkFallOff();
        updateHUD();
        _updateAbilityHUD();
    }

    updateCamera(elapsed);
    renderer.render(scene, camera);
}

// ============================================================================
// MARBLE TICK — sync physics → visuals
// ============================================================================
function tickMarbles(dt = 0) {
    marbles.forEach(m => {
        const p = m.body.position;
        m.mesh.position.set(p.x, p.y, p.z);
        const q = m.body.quaternion;
        m.mesh.quaternion.set(q.x, q.y, q.z, q.w);
        m.nametag.position.set(p.x, p.y + 1.4, p.z);
        m.nametag.visible = !m.finished;

        // Blob shadow
        if (!PERF_MODE && m.shadowDisk) {
            const heightAboveGround = Math.max(0, p.y + 5);
            m.shadowDisk.position.set(p.x, -4.9, p.z);
            m.shadowDisk.material.opacity = Math.max(0, 0.45 - heightAboveGround * 0.008);
            const s = Math.max(0.2, 1.0 - heightAboveGround * 0.012);
            m.shadowDisk.scale.set(s, s, s);
            m.shadowDisk.visible = !m.eliminated;
        }

        // Accessory
        if (!PERF_MODE && m.accessoryMesh) {
            const yOff = ACC_Y_OFFSET[m.accessoryKey] ?? 0.7;
            m.accessoryMesh.position.set(p.x, p.y + yOff, p.z);
            m.accessoryMesh.visible = !m.finished;
            if (m.accessoryKey === 'propeller') m.accessoryMesh.rotation.y += 9 * dt;
            else if (m.accessoryKey === 'halo')  m.accessoryMesh.rotation.y += 0.9 * dt;
        }
    });

    // Rolling sound — track fastest active marble
    if (!PERF_MODE) {
        const active = marbles.filter(m => !m.finished && !m.eliminated);
        if (active.length > 0) {
            const maxSpeed = Math.max(...active.map(m => m.body.velocity.length()));
            SFX.updateRolling(maxSpeed);
        }
    }

    // Handicap boost — nudge trailing marbles forward
    if (RACE_SETTINGS.handicap_enabled && finishAABB && dt > 0) {
        const active = marbles.filter(m => !m.finished && !m.eliminated);
        const n = active.length;
        if (n > 2) {
            active.sort((a, b) =>
                dist3(a.body.position, finishAABB) - dist3(b.body.position, finishAABB)
            );
            const strength = Math.max(0, Math.min(1, RACE_SETTINGS.handicap_strength ?? 0.2));
            active.forEach((m, rank) => {
                if (rank < Math.ceil(n / 2)) return;  // only boost bottom half
                const factor = ((rank - Math.ceil(n / 2)) / Math.max(1, n - Math.ceil(n / 2)));
                const vel = m.body.velocity;
                const spd = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
                if (spd < 0.5) return;
                const forceMag = factor * strength * 20;
                m.body.applyForce(
                    new CANNON.Vec3((vel.x / spd) * forceMag, 0, (vel.z / spd) * forceMag),
                    m.body.position
                );
            });
        }
    }
}

// ============================================================================
// BONGO PAD SQUISH TICK
// ============================================================================
function tickBongoSquish(dt) {
    _bongoSquish.forEach((state, mesh) => {
        state.t = Math.max(0, state.t - dt * 4.5);  // decay over ~0.22s
        const sq = state.t;                           // 1 = peak squish, 0 = rest
        // Squish: compress Y, expand XZ (volume-preserving feel)
        const scaleY = 1 - sq * 0.35;
        const scaleXZ = 1 + sq * 0.18;
        mesh.scale.set(scaleXZ, scaleY, scaleXZ);
        if (state.t <= 0) _bongoSquish.delete(mesh);
    });
}

// ============================================================================
// TRAIL TICK
// ============================================================================
function tickTrails(dt) {
    _trailHueOffset = (_trailHueOffset + 180 * dt) % 360;  // ~180°/s hue shift for rainbow
    marbles.forEach(m => {
        if (m.finished) return;
        const pos  = m.body.position;
        const type = m.trailType || 'classic';

        if (type === 'none') return;

        // ── Classic line trail ───────────────────────────────────────────────
        if (type === 'classic' || !TRAIL_DEFS[type]) {
            const tp = m.trailPositions;
            tp.unshift({ x: pos.x, y: pos.y, z: pos.z });
            if (tp.length > TRAIL_LEN) tp.pop();
            const geo  = trailGeo[m.username];
            if (!geo) return;
            const attr = geo.attributes.position;
            tp.forEach((p, i) => attr.setXYZ(i, p.x, p.y, p.z));
            for (let i = tp.length; i < TRAIL_LEN; i++) {
                const last = tp[tp.length - 1] || { x: 0, y: 0, z: 0 };
                attr.setXYZ(i, last.x, last.y, last.z);
            }
            attr.needsUpdate = true;
            geo.computeBoundingSphere();
            trailLine[m.username].material.opacity = 0.4;
            return;
        }

        // ── Particle trail ──────────────────────────────────────────────────
        const def = TRAIL_DEFS[type];
        const vel = m.body.velocity;
        const speed = Math.sqrt(vel.x*vel.x + vel.y*vel.y + vel.z*vel.z);
        if (speed < 0.2) return;  // no trail when barely moving

        // Emit rate scales with speed: emit every 0.04s at base, halved when fast
        const emitInterval = Math.max(0.025, 0.06 - speed * 0.003);
        m._trailTimer = (m._trailTimer || 0) + dt;
        if (m._trailTimer < emitInterval) return;
        m._trailTimer -= emitInterval;

        const cnt = def.cnt;
        for (let i = 0; i < cnt; i++) {
            let hexColor;
            if (def.hue) {
                // Rainbow: cycle through hue per particle
                const h = (_trailHueOffset + i * (360 / cnt)) % 360;
                hexColor = new THREE.Color().setHSL(h / 360, 1, 0.55).getHex();
            } else {
                hexColor = def.colors[Math.floor(Math.random() * def.colors.length)];
            }

            const geo  = new THREE.SphereGeometry(def.size, 4, 4);
            const matOpts = { color: hexColor, transparent: true, opacity: 0.85 };
            if (def.transparent) { matOpts.opacity = def.transparent; }
            const mat  = new THREE.MeshBasicMaterial(matOpts);
            const mesh = new THREE.Mesh(geo, mat);

            const sc = def.scatter || 0.5;
            mesh.position.set(
                pos.x + (Math.random() - 0.5) * sc,
                pos.y + (Math.random() - 0.5) * sc,
                pos.z + (Math.random() - 0.5) * sc,
            );
            scene.add(mesh);
            _trailParticles.push({
                mesh,
                life: 0,
                maxLife: def.maxLife * (0.8 + Math.random() * 0.4),
                vel: {
                    x: (Math.random() - 0.5) * sc * 2,
                    y: def.vy * (0.7 + Math.random() * 0.6),
                    z: (Math.random() - 0.5) * sc * 2,
                },
                grav:  def.grav   ?? 4,
                expand: def.expand ?? false,
                origSize: def.size,
            });
        }
    });
}

function tickTrailParticles(dt) {
    for (let i = _trailParticles.length - 1; i >= 0; i--) {
        const p = _trailParticles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            _trailParticles.splice(i, 1);
            continue;
        }
        const t = p.life / p.maxLife;
        p.mesh.position.x += p.vel.x * dt;
        p.mesh.position.y += p.vel.y * dt - 0.5 * p.grav * dt * dt;
        p.mesh.position.z += p.vel.z * dt;
        p.vel.y -= p.grav * dt;
        p.mesh.material.opacity = (1 - t) * (p.mesh.material.opacity > 0.5 ? 0.85 : 0.4);
        if (p.expand) p.mesh.scale.setScalar(1 + t * 1.5);
    }
}

// ============================================================================
// KINEMATIC OBSTACLE TICK
// ============================================================================
function tickKinematics(dt) {
    const now = performance.now() / 1000;

    kinematicBodies.forEach(kn => {
        const { body, piece } = kn;

        if (piece.pieceId === 'hammer' || piece.pieceId === 'rotating_post') {
            const speed = (piece.props?.speed ?? 1.0) * Math.PI;
            const angle = now * speed;
            const q = new CANNON.Quaternion();
            q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
            body.quaternion.copy(q);

        } else if (piece.pieceId === 'moving_platform') {
            const amplitude = (piece.props?.amplitude ?? 5);
            const freq      = (piece.props?.speed ?? 0.5) * Math.PI * 2;
            const axis      = piece.props?.axis ?? 'x';
            const base      = piece._basePos || (body._basePos = {
                x: body.position.x, y: body.position.y, z: body.position.z
            });
            const offset    = Math.sin(now * freq) * amplitude;
            body.position.set(
                base.x + (axis === 'x' ? offset : 0),
                base.y + (axis === 'y' ? offset : 0),
                base.z + (axis === 'z' ? offset : 0),
            );
            body.velocity.set(0, 0, 0);

        } else if (piece.pieceId === 'drawbridge') {
            // Record when race entered RACING state
            if (!piece._bridgeStart && raceState === STATE.RACING) piece._bridgeStart = now;
            if (piece._bridgeStart) {
                const delay    = piece.props?.delay ?? 3;
                const elapsed  = now - piece._bridgeStart;
                const t        = Math.max(0, Math.min(1, (elapsed - delay) / 1.0));
                const θ        = (Math.PI / 2) * (1 - t);   // π/2 (blocking) → 0 (flat)
                const d2       = 6;                           // d=12 / 2
                const flatY    = piece.pos.y + 0.15;
                const rotRad   = (piece.rot ?? 0) * Math.PI / 180;
                const cosT     = Math.cos(θ), sinT = Math.sin(θ);
                body.position.set(
                    piece.pos.x + Math.sin(rotRad) * d2 * (1 - cosT),
                    flatY + d2 * sinT,
                    piece.pos.z - Math.cos(rotRad) * d2 * (1 - cosT)
                );
                const yQ2 = new CANNON.Quaternion();
                yQ2.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotRad);
                const tQ = new CANNON.Quaternion();
                tQ.setFromAxisAngle(new CANNON.Vec3(-Math.cos(rotRad), 0, Math.sin(rotRad)), -θ);
                tQ.mult(yQ2, body.quaternion);
            }

        } else if (piece.pieceId === 'catapult') {
            const period = 5.0, upTime = 0.15, downTime = 0.8, launchH = 3;
            const t = now % period;
            let yOff = 0;
            if      (t < upTime)             yOff = (t / upTime) * launchH;
            else if (t < upTime + downTime)  yOff = (1 - (t - upTime) / downTime) * launchH;
            const rotRad = (piece.rot ?? 0) * Math.PI / 180;
            const yQ2 = new CANNON.Quaternion();
            yQ2.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotRad);
            body.position.set(piece.pos.x, piece.pos.y + 0.2 + yOff, piece.pos.z);
            body.quaternion.copy(yQ2);

        } else if (piece.pieceId === 'diving_board') {
            const yOff = Math.sin(now * 1.2 * Math.PI * 2) * 0.35;
            const rotRad = (piece.rot ?? 0) * Math.PI / 180;
            const yQ2 = new CANNON.Quaternion();
            yQ2.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotRad);
            body.position.set(piece.pos.x, piece.pos.y + 0.15 + yOff, piece.pos.z);
            body.quaternion.copy(yQ2);

        } else if (piece.pieceId === 'rotating_ring') {
            const speed = (piece.props?.speed ?? 1.0) * Math.PI;
            const q = new CANNON.Quaternion();
            q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), now * speed);
            body.quaternion.copy(q);
            body.position.set(piece.pos.x, piece.pos.y + 2.5, piece.pos.z);

        } else if (piece.pieceId === 'pendulum') {
            const period = piece.props?.period ?? 3.0;
            const reach  = piece.props?.reach  ?? 5;
            const angle  = Math.sin(now * (Math.PI * 2) / period) * (Math.PI / 4);
            const rotRad = (piece.rot ?? 0) * Math.PI / 180;
            // Pivot is at top (pos.y + h); ball hangs down on a chain of length reach
            const pivotY = piece.pos.y + 7;
            body.position.set(
                piece.pos.x + Math.sin(angle + rotRad) * reach,
                pivotY - Math.cos(angle) * reach,
                piece.pos.z
            );
            body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotRad);
        }

        // Sync visual mesh to physics body position/rotation
        if (kn.mesh) {
            kn.mesh.position.set(body.position.x, body.position.y, body.position.z);
            kn.mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
        }
    });
}

// ============================================================================
// EFFECTS TICK
// ============================================================================
function tickEffects(dt) {
    const g = world.gravity;
    const baseGravity = world.gravity.y;

    marbles.forEach(m => {
        if (m.finished) return;
        const p = m.body.position;

        // ── Boost pads ──
        boostPads.forEach(pad => {
            if (inAABB(p, padAABB(pad))) {
                const strength = (pad.props?.strength ?? 1.0) * 18;
                const fwd = dirFromRot(pad.rot || 0);
                m.body.applyImpulse(new CANNON.Vec3(fwd.x * strength, 2, fwd.z * strength));
                spawnParticles(p.x, p.y, p.z, 0xf59e0b, 12);  // boost sparks
                const now = performance.now();
                if (!m._boostSfxAt || now - m._boostSfxAt > 600) {
                    SFX.boostWhoosh();
                    m._boostSfxAt = now;
                }
            }
        });

        // ── Wind zones ──
        windZones.forEach(zone => {
            if (inAABB(p, zoneAABB(zone))) {
                const str = (zone.props?.strength ?? 1.0) * 25;
                const dir = zone.props?.direction ?? 'up';
                const fv  = { up:[0,str,0], down:[0,-str,0], north:[0,0,-str], south:[0,0,str], east:[str,0,0], west:[-str,0,0] }[dir] ?? [0,str,0];
                m.body.applyForce(new CANNON.Vec3(...fv));
            }
        });

        // ── No-gravity zones ──
        noGravZones.forEach(zone => {
            if (inAABB(p, zoneAABB(zone))) {
                // Counter gravity this frame
                m.body.applyForce(new CANNON.Vec3(0, -baseGravity * 1, 0));
                // Slight damping so marbles float rather than shoot up
                m.body.velocity.scale(0.97, m.body.velocity);
            }
        });

        // ── Speed limiter zones ──
        speedLimiters.forEach(zone => {
            if (inAABB(p, zoneAABB(zone))) {
                const maxSpd = (zone.props?.max_speed ?? 5);
                const v = m.body.velocity;
                const spd = Math.sqrt(v.x**2 + v.y**2 + v.z**2);
                if (spd > maxSpd) {
                    const scale = maxSpd / spd;
                    m.body.velocity.set(v.x * scale, v.y * scale, v.z * scale);
                }
            }
        });

        // ── Conveyor belts ──
        conveyorBelts.forEach(belt => {
            if (inAABB(p, padAABB(belt))) {
                const speed  = (belt.props?.speed ?? 1.0) * 20;
                const dir    = belt.props?.direction ?? 'forward';
                const rotRad = (belt.rot || 0) * Math.PI / 180;
                let fx = 0, fz = 0, fy = 0;
                if (dir === 'forward') { fx = -Math.sin(rotRad) * speed; fz = -Math.cos(rotRad) * speed; }
                else if (dir === 'backward') { fx = Math.sin(rotRad) * speed; fz = Math.cos(rotRad) * speed; }
                else if (dir === 'left')  { fx = -Math.cos(rotRad) * speed; fz = Math.sin(rotRad) * speed; }
                else if (dir === 'right') { fx = Math.cos(rotRad) * speed; fz = -Math.sin(rotRad) * speed; }
                m.body.applyForce(new CANNON.Vec3(fx, fy, fz));
            }
        });

        // ── Gravity flip zones ──
        gravFlipZones.forEach(zone => {
            if (inAABB(p, zoneAABB(zone))) {
                // Invert gravity: counter the -35 and add +35 upward
                m.body.applyForce(new CANNON.Vec3(0, -baseGravity * 2, 0));
                if (!m._gravFlipActive) {
                    m._gravFlipActive = true;
                    spawnParticles(p.x, p.y, p.z, 0x8b5cf6, 5);
                }
            } else {
                m._gravFlipActive = false;
            }
        });

        // ── Spike strips (respawn or eliminate in gauntlet mode) ──
        spikeStrips.forEach(strip => {
            if (inAABB(p, padAABB(strip))) {
                if (!strip._stripCooldown) strip._stripCooldown = 0;
                const now = performance.now();
                if (now > strip._stripCooldown) {
                    strip._stripCooldown = now + 2000;
                    spawnParticles(p.x, p.y, p.z, 0xef4444, 8);
                    if (RACE_SETTINGS.gauntlet_mode) {
                        eliminateMarble(m);
                    } else {
                        respawnMarble(m, 'spike');
                    }
                }
            }
        });

        // ── Earthquake pads ──
        earthquakePads.forEach(pad => {
            if (inAABB(p, padAABB(pad))) {
                const now = performance.now();
                if (!m._quakeUntil) m._quakeUntil = 0;
                if (now > m._quakeUntil) {
                    m._quakeUntil = now + 2000;
                    spawnParticles(p.x, p.y, p.z, 0xf97316, 6);
                }
            }
            if (m._quakeUntil && performance.now() < m._quakeUntil) {
                const strength = 8;
                m.body.applyImpulse(new CANNON.Vec3(
                    (Math.random() - 0.5) * strength,
                    (Math.random() * 0.5) * strength,
                    (Math.random() - 0.5) * strength,
                ));
            }
        });

        // ── Glue traps ──
        glueTrapDefs.forEach(trap => {
            if (inAABB(p, padAABB(trap))) {
                const now = performance.now();
                const duration = (trap.props?.duration ?? 1.5) * 1000;
                if (!m._glueUntil) m._glueUntil = 0;
                if (!m._glueFreeAt) m._glueFreeAt = 0;
                if (now > m._glueFreeAt && now > m._glueUntil - duration) {
                    m._glueUntil  = now + duration;
                    m._glueFreeAt = m._glueUntil + 500;
                    spawnParticles(p.x, p.y, p.z, 0x78350f, 5);
                }
            }
            if (m._glueUntil && performance.now() < m._glueUntil) {
                m.body.velocity.scale(0.1, m.body.velocity);
                m.body.angularVelocity.scale(0.1, m.body.angularVelocity);
            }
        });

        // ── Magnets ──
        magnets.forEach(mag => {
            const mp = mag.pos;
            const radius   = mag.props?.radius   ?? 8;
            const polarity = mag.props?.polarity  ?? 1;   // 1=attract, -1=repel
            const strength = (mag.props?.strength ?? 1.0) * 30;
            const dx = mp.x - p.x, dy = mp.y - p.y, dz = mp.z - p.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (dist < radius && dist > 0.1) {
                const falloff = 1 - dist / radius;
                const force   = strength * falloff * polarity;
                m.body.applyForce(new CANNON.Vec3(
                    (dx / dist) * force,
                    (dy / dist) * force,
                    (dz / dist) * force,
                ));
            }
        });

        // ── Reverse pads ──
        reversePads.forEach(pad => {
            if (inAABB(p, padAABB(pad))) {
                if (!pad._revCooldown) pad._revCooldown = {};
                const now = performance.now();
                const key = m.username;
                if (!pad._revCooldown[key] || now > pad._revCooldown[key]) {
                    pad._revCooldown[key] = now + 1500;
                    const v = m.body.velocity;
                    m.body.applyImpulse(new CANNON.Vec3(-v.x * 2.5, Math.abs(v.y) + 3, -v.z * 2.5));
                    spawnParticles(p.x, p.y, p.z, 0xdc2626, 8);
                }
            }
        });

        // ── Black holes ──
        blackHoles.forEach(bh => {
            const bhp    = bh.pos;
            const radius = (bh.props?.radius   ?? 10);
            const str    = (bh.props?.strength ?? 2.0) * 60;
            const dx = bhp.x - p.x, dy = (bhp.y + 1) - p.y, dz = bhp.z - p.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (dist < radius && dist > 0.5) {
                const falloff = (1 - dist / radius) ** 2;
                m.body.applyForce(new CANNON.Vec3(
                    (dx / dist) * str * falloff,
                    (dy / dist) * str * falloff * 0.5,
                    (dz / dist) * str * falloff,
                ));
                // If very close, fling out in random direction
                if (dist < 1.5) {
                    m.body.applyImpulse(new CANNON.Vec3(
                        (Math.random() - 0.5) * 40,
                        15 + Math.random() * 10,
                        (Math.random() - 0.5) * 40,
                    ));
                    spawnParticles(p.x, p.y, p.z, 0x7c3aed, 12);
                }
            }
        });

        // ── Cannon ──
        cannonDefs.forEach(cannon => {
            if (inAABB(p, padAABB(cannon))) {
                if (!cannon._cooldown) cannon._cooldown = {};
                const now = performance.now();
                const key = m.username;
                if (!cannon._cooldown[key] || now > cannon._cooldown[key]) {
                    cannon._cooldown[key] = now + 3000;
                    const strength = cannon.props?.strength ?? 40;
                    const rotRad   = (cannon.rot ?? 0) * Math.PI / 180;
                    // Launch in cannon's forward direction
                    m.body.velocity.set(0, 0, 0);
                    m.body.applyImpulse(new CANNON.Vec3(
                        -Math.sin(rotRad) * strength,
                        strength * 0.3,
                        -Math.cos(rotRad) * strength,
                    ));
                    spawnParticles(p.x, p.y, p.z, 0x9ca3af, 12);
                }
            }
        });

        // ── Shrink zones ──
        shrinkZones.forEach(zone => {
            if (inAABB(p, zoneAABB(zone))) {
                const targetScale = zone.props?.scale ?? 0.3;
                if (!m._shrinkActive) {
                    m._shrinkActive = true;
                    m._shrinkDuration = (zone.props?.duration ?? 5) * 1000;
                    m._shrinkUntil = performance.now() + m._shrinkDuration;
                    if (m.mesh) m.mesh.scale.setScalar(targetScale);
                    spawnParticles(p.x, p.y, p.z, 0x6d28d9, 6);
                }
            }
        });
        if (m._shrinkActive && performance.now() > m._shrinkUntil) {
            m._shrinkActive = false;
            if (m.mesh) m.mesh.scale.setScalar(1.0);
        }

        // ── Giant zones ──
        giantZones.forEach(zone => {
            if (inAABB(p, zoneAABB(zone))) {
                if (!m._giantActive) {
                    m._giantActive = true;
                    m._giantDuration = (zone.props?.duration ?? 5) * 1000;
                    m._giantUntil = performance.now() + m._giantDuration;
                    m.body.mass = (m._baseMass ?? 1) * 1.5;
                    m.body.updateMassProperties();
                    const targetScale = zone.props?.scale ?? 2.5;
                    if (m.mesh) m.mesh.scale.setScalar(targetScale);
                    spawnParticles(p.x, p.y, p.z, 0x0891b2, 8);
                }
            }
        });
        if (m._giantActive && performance.now() > m._giantUntil) {
            m._giantActive = false;
            m.body.mass = m._baseMass ?? 1;
            m.body.updateMassProperties();
            if (m.mesh) m.mesh.scale.setScalar(1.0);
        }

        // ── Springs (launch) ──
        springs.forEach(({ body: sb, piece }) => {
            const sp = sb.position;
            const dist = Math.sqrt(
                (p.x - sp.x)**2 + (p.y - sp.y)**2 + (p.z - sp.z)**2
            );
            if (dist < 1.5 && !piece._cooled) {
                const strength = (piece.props?.strength ?? 1.0) * 30;
                m.body.applyImpulse(new CANNON.Vec3(0, strength, 0));
                piece._cooled = true;
                setTimeout(() => { piece._cooled = false; }, 800);
                spawnParticles(p.x, p.y, p.z, 0x22c55e, 8);
            }
        });

        // ── Teleporters ──
        Object.values(teleporters).forEach(pair => {
            if (pair.length !== 2) return;
            const [a, b] = pair;
            const aabb_a = padAABB(a);
            const aabb_b = padAABB(b);
            if (!m._teleportCooldown) m._teleportCooldown = 0;
            const now = performance.now();
            if (now > m._teleportCooldown) {
                if (inAABB(p, aabb_a)) {
                    m.body.position.set(b.pos.x, b.pos.y + 2, b.pos.z);
                    m._teleportCooldown = now + 1000;
                    spawnParticles(p.x, p.y, p.z, 0xa855f7, 10);
                } else if (inAABB(p, aabb_b)) {
                    m.body.position.set(a.pos.x, a.pos.y + 2, a.pos.z);
                    m._teleportCooldown = now + 1000;
                    spawnParticles(p.x, p.y, p.z, 0xa855f7, 10);
                }
            }
        });
    });

    // ── Lasers ──
    const elapsed = (performance.now() - raceStartTime) / 1000;
    laserDefs.forEach(laser => {
        const interval = laser.piece.props?.interval ?? 2.0;
        const cycle    = elapsed % (interval * 2);
        laser.active   = cycle < interval;
        laser.beamMesh.visible = laser.active;

        if (laser.active) {
            const lp  = laser.piece.pos;
            const len = laser.piece.d ?? 8;
            marbles.forEach(m => {
                if (m.finished) return;
                const p = m.body.position;
                const dist = Math.abs(p.z - lp.z);
                if (dist < len / 2 && Math.abs(p.x - lp.x) < 1 && Math.abs(p.y - lp.y) < 1.5) {
                    SFX.laserZap();
                    spawnParticles(p.x, p.y, p.z, 0xf43f5e, 10);
                    respawnMarble(m, 'laser');
                }
            });
        }
    });
}

// ============================================================================
// FINISH LINE CHECK
// ============================================================================
function checkFinish() {
    if (!finishAABB) return;

    marbles.forEach(m => {
        if (m.finished) return;
        const p = m.body.position;
        if (inAABB(p, finishAABB)) {
            const elapsed = performance.now() - raceStartTime;
            m.finished    = true;
            m.finishTime  = elapsed;
            m.rank        = ++finishCount;

            // Freeze this marble
            m.body.type = CANNON.Body.STATIC;
            m.body.velocity.set(0, 0, 0);

            showFinishAnnouncement(m);
            SFX.finish(m.rank);
            triggerFinishFlash();
            checkPhotoFinish(m);

            // Start 60-second countdown after first finisher
            if (m.rank === 1 && !_finishTimerActive) {
                _finishTimerActive = true;
                _finishTimerEnd = performance.now() + 60000;
                raceState = STATE.FINISHING;
                _showFinishCountdown();
            }

            checkAllDone();
        }
    });

    // Update live checkpoint progress
    checkpoints.forEach(cp => {
        marbles.forEach(m => {
            if (m.finished) return;
            if (!m._passedCheckpoints) m._passedCheckpoints = new Set();
            if (!m._passedCheckpoints.has(cp.id) && inAABB(m.body.position, cp.aabb)) {
                m._passedCheckpoints.add(cp.id);
                m.lastCheckpoint = cp;
            }
        });
    });
}

function checkPhotoFinish(finishing) {
    // If previous finisher was within 0.6 seconds, trigger photo finish banner
    const prev = marbles.find(m => m.finished && m.rank === finishing.rank - 1);
    if (prev && (finishing.finishTime - prev.finishTime) < 600) {
        const el = document.createElement('div');
        el.className = 'photo-finish';
        el.textContent = 'PHOTO FINISH';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2500);
    }
}

function checkAllDone() {
    const unfinished = marbles.filter(m => !m.finished && !m.eliminated);
    if (unfinished.length === 0) {
        endRace();
    } else if (unfinished.length === 1 && marbles.length > 2) {
        // Last marble drama mode — slow-mo kicks in via getDramaSlowmo()
        const el = document.createElement('div');
        el.className = 'slowmo-badge';
        el.textContent = '🎬 LAST MARBLE';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 20000);
    }
}

// ============================================================================
// FALL-OFF RECOVERY
// ============================================================================
function checkFallOff() {
    marbles.forEach(m => {
        if (m.finished) return;
        if (m.body.position.y < lowestTrackY - 25) {
            const maxR = RACE_SETTINGS.max_respawns;
            const overLimit = maxR >= 0 && m.respawns >= maxR;
            if (RACE_SETTINGS.fall_mode === 'elimination' || overLimit) {
                eliminateMarble(m);
            } else {
                respawnMarble(m, 'falloff');
            }
        }
    });
}

function eliminateMarble(m) {
    if (m.eliminated) return;
    m.eliminated = true;
    m.finished   = true;
    m.finishTime = null;
    m.rank       = null;

    // Remove physics body + visuals
    world.removeBody(m.body);
    if (m.mesh)    { scene.remove(m.mesh);    m.mesh.geometry?.dispose(); }
    if (m.nametag) scene.remove(m.nametag);

    // Show elimination message
    const el = document.createElement('div');
    el.className  = 'finish-announcement';
    el.textContent = `❌ ${m.username} eliminated`;
    el.style.color = '#ef4444';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);

    // Update HUD eliminated count if in elimination mode
    _updateEliminatedHUD();
    checkAllDone();
}

function _updateEliminatedHUD() {
    if (RACE_SETTINGS.fall_mode !== 'elimination' && !RACE_SETTINGS.gauntlet_mode) return;
    const eliminated = marbles.filter(m => m.eliminated).length;
    const racing     = marbles.filter(m => !m.finished && !m.eliminated).length;
    const hudEl = document.getElementById('hudEliminatedCount');
    if (hudEl) hudEl.textContent = `${eliminated} elim · ${racing} racing`;
}

function respawnMarble(m, reason) {
    m.respawns++;
    let target;
    if (m.lastCheckpoint) {
        const cp = m.lastCheckpoint.aabb;
        target = { x: (cp.minX + cp.maxX) / 2, y: cp.maxY + 1, z: (cp.minZ + cp.maxZ) / 2 };
    } else if (startPiece) {
        target = { x: startPiece.pos.x + (Math.random()-0.5)*2, y: startPiece.pos.y + 4, z: startPiece.pos.z + (Math.random()-0.5)*2 };
    } else {
        target = { x: 0, y: 8, z: 0 };
    }
    m.body.position.set(target.x, target.y, target.z);
    m.body.velocity.set(0, 0, 0);
    m.body.angularVelocity.set(0, 0, 0);
    m.body.wakeUp();
}

// ============================================================================
// DRAMA SLOW-MO
// ============================================================================
function getDramaSlowmo() {
    if (REDUCED_MOTION) return false;  // skip slow-mo when reduced-motion is enabled
    if (raceState !== STATE.FINISHING && raceState !== STATE.RACING) return false;
    const unfinished = marbles.filter(m => !m.finished);
    return unfinished.length === 1 && marbles.length > 2;
}

// ============================================================================
// PARTICLES
// ============================================================================
function spawnParticles(x, y, z, color, count = 6) {
    if (PERF_MODE) return;
    for (let i = 0; i < count; i++) {
        const geo  = new THREE.SphereGeometry(0.08 + Math.random() * 0.08, 4, 4);
        const mat  = new THREE.MeshBasicMaterial({ color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        particles.push({
            mesh, life: 0, maxLife: 0.5 + Math.random() * 0.5,
            vel: {
                x: (Math.random() - 0.5) * 6,
                y:  Math.random() * 6 + 2,
                z: (Math.random() - 0.5) * 6,
            },
        });
    }
}

function tickParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
            continue;
        }
        const t = p.life / p.maxLife;
        p.mesh.position.x += p.vel.x * dt;
        p.mesh.position.y += p.vel.y * dt - 0.5 * 35 * dt * dt;
        p.mesh.position.z += p.vel.z * dt;
        p.mesh.material.opacity = 1 - t;
        p.mesh.material.transparent = true;
    }
}

// ============================================================================
// ANNOUNCEMENTS
// ============================================================================
function showFinishAnnouncement(m) {
    const rankLabels = ['1st 🥇', '2nd 🥈', '3rd 🥉'];
    const label = rankLabels[m.rank - 1] ?? `${m.rank}th`;
    const el    = document.createElement('div');
    el.className = 'announcement';
    el.innerHTML = `
        <div class="announce-name" style="color:#${m.color.getHexString()}">${escHtml(m.username)}</div>
        <div class="announce-place">${label}</div>
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
    spawnParticles(m.body.position.x, m.body.position.y, m.body.position.z, m.color.getHex(), 12);
}

function triggerFinishFlash() {
    const el = document.createElement('div');
    el.className = 'finish-flash';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 600);
}

// ============================================================================
// HUD UPDATE
// ============================================================================
function updateHUD() {
    if (raceState !== STATE.RACING && raceState !== STATE.FINISHING) return;

    const elapsed = performance.now() - raceStartTime;
    document.getElementById('hudTimer').textContent = formatTime(elapsed);

    // Finish countdown ticker
    if (_finishTimerActive) {
        const rem = _finishTimerEnd - performance.now();
        const el = document.getElementById('hudFinishTimer');
        if (el) el.textContent = `Race ends in ${Math.max(0, Math.ceil(rem / 1000))}s`;
        if (rem <= 0) { _finishTimerActive = false; endRace(); return; }
    }

    const total    = marbles.length;
    const done     = marbles.filter(m => m.finished).length;
    document.getElementById('hudMarbles').textContent = `${total - done} racing · ${done} finished`;

    // Leaderboard — sort active marbles by proximity to finish
    const active   = marbles.filter(m => !m.finished);
    const finished = marbles.filter(m => m.finished).sort((a, b) => a.rank - b.rank);

    let sorted;
    if (finishAABB) {
        active.sort((a, b) => {
            const da = dist3(a.body.position, finishAABB);
            const db = dist3(b.body.position, finishAABB);
            return da - db;
        });
        sorted = [...finished, ...active];
    } else {
        sorted = [...finished, ...active];
    }

    // Halfway snapshot — take once when elapsed reaches half the race timeout
    if (!_halfwaySnapped && raceState === STATE.RACING) {
        const timeoutMs = (RACE_SETTINGS.timeout_mins ?? 3) * 60 * 1000;
        const elapsed   = performance.now() - raceStartTime;
        if (elapsed >= timeoutMs / 2 && sorted.length > 0) {
            const lastMarble = sorted[sorted.length - 1];
            _halfwayLast    = lastMarble.username;
            _halfwaySnapped = true;
        }
    }

    const top5 = sorted.slice(0, 5);
    const lb   = document.getElementById('hudLeaderboard');
    lb.innerHTML = '';

    top5.forEach((m, i) => {
        const rank   = m.finished ? m.rank : i + 1;
        const rankCl = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
        const teamBadge = (RACE_SETTINGS.team_mode && m.team)
            ? `<span style="font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700;background:${m.team === 'red' ? '#ee3333' : '#3388ee'};color:#fff;">${m.team.toUpperCase()}</span>`
            : '';
        const row    = document.createElement('div');
        row.className = 'lb-row';
        row.innerHTML = `
            <span class="lb-rank ${rankCl}">#${rank}</span>
            <span class="lb-dot" style="background:#${m.color.getHexString()}"></span>
            <span class="lb-name">${escHtml(m.username)}</span>
            ${teamBadge}
            ${m.finished ? `<span class="lb-finished">✓</span>` : ''}
        `;
        lb.appendChild(row);
    });

    // Ghost marble HUD entry
    if (_ghostMarblePath && _ghostHolder) {
        const ghostRow = document.createElement('div');
        ghostRow.className = 'lb-row';
        ghostRow.style.cssText = 'opacity:0.55;border-top:1px solid #333;margin-top:2px;padding-top:2px;';
        const recStr = _ghostTimeMs ? ` ${(_ghostTimeMs / 1000).toFixed(2)}s` : '';
        ghostRow.innerHTML = `<span class="lb-rank" style="color:#aaccff">👻</span><span class="lb-name" style="color:#aaccff">${escHtml(_ghostHolder)} (rec${recStr})</span>`;
        lb.appendChild(ghostRow);
    }

    // Team score strip
    if (RACE_SETTINGS.team_mode) {
        let _tHud = document.getElementById('_teamHud');
        if (!_tHud) {
            _tHud = document.createElement('div');
            _tHud.id = '_teamHud';
            _tHud.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);display:flex;gap:12px;z-index:150;pointer-events:none;';
            document.body.appendChild(_tHud);
        }
        const redFin  = marbles.filter(m => m.team === 'red'  && m.finished).length;
        const blueFin = marbles.filter(m => m.team === 'blue' && m.finished).length;
        const redTot  = marbles.filter(m => m.team === 'red').length;
        const blueTot = marbles.filter(m => m.team === 'blue').length;
        _tHud.innerHTML = `
            <div style="background:#ee333388;border:2px solid #ee3333;border-radius:8px;padding:4px 14px;font-family:Orbitron,sans-serif;font-size:14px;font-weight:900;color:#fff;">🔴 RED ${redFin}/${redTot}</div>
            <div style="background:#3388ee88;border:2px solid #3388ee;border-radius:8px;padding:4px 14px;font-family:Orbitron,sans-serif;font-size:14px;font-weight:900;color:#fff;">🔵 BLUE ${blueFin}/${blueTot}</div>
        `;
    }
}

// ============================================================================
// CAMERA
// ============================================================================
function updateCamera(dt) {
    if (camMode === CAM.FREE) {
        controls.enabled = true;
        controls.update();
        return;
    }
    controls.enabled = false;

    if (camMode === CAM.OVERVIEW) {
        // Track the centroid of all active marbles from high above
        const active = marbles.filter(m => !m.finished);
        const targets = active.length ? active : marbles;
        if (targets.length) {
            const cx = targets.reduce((s, m) => s + m.body.position.x, 0) / targets.length;
            const cz = targets.reduce((s, m) => s + m.body.position.z, 0) / targets.length;
            const cy = targets.reduce((s, m) => s + m.body.position.y, 0) / targets.length;
            camDesired.set(cx, cy + 70, cz + 40);
            camera.position.lerp(camDesired, dt * 1.5);
            camTarget.lerp(new THREE.Vector3(cx, cy, cz), dt * 2);
            camera.lookAt(camTarget);
        }
        return;
    }

    if (camMode === CAM.SIDE) {
        // Side view — tracks marble centroid from the side (+X axis)
        const active = marbles.filter(m => !m.finished);
        const targets = active.length ? active : marbles;
        if (targets.length) {
            const cx = targets.reduce((s, m) => s + m.body.position.x, 0) / targets.length;
            const cz = targets.reduce((s, m) => s + m.body.position.z, 0) / targets.length;
            const cy = targets.reduce((s, m) => s + m.body.position.y, 0) / targets.length;
            camDesired.set(cx + 80, cy + 15, cz);
            camera.position.lerp(camDesired, dt * 1.5);
            camTarget.lerp(new THREE.Vector3(cx, cy, cz), dt * 2);
            camera.lookAt(camTarget);
        }
        return;
    }

    if (camMode === CAM.SPECTATE) {
        // Follow a specific marble — cycle with [ and ] keys
        const idx = Math.min(_spectateIndex, marbles.length - 1);
        const m = marbles[idx];
        if (m) _chaseCam(m, dt);
        _updateCamLabel();
        return;
    }

    // LEADER cam — chase the leading marble
    const leader = getLeader();
    if (!leader) return;
    _chaseCam(leader, dt);
}

function _chaseCam(target, dt) {
    const lp = target.body.position;
    const lv = target.body.velocity;
    const speed = Math.sqrt(lv.x**2 + lv.y**2 + lv.z**2);

    const vNorm = speed > 0.5
        ? new THREE.Vector3(lv.x, 0, lv.z).normalize()
        : new THREE.Vector3(0, 0, 1);

    const dist   = 14 + speed * 0.3;
    const height = 6 + speed * 0.15;

    camDesired.set(lp.x - vNorm.x * dist, lp.y + height, lp.z - vNorm.z * dist);
    camera.position.lerp(camDesired, dt * 4);
    camTarget.lerp(new THREE.Vector3(lp.x, lp.y + 1, lp.z), dt * 6);
    camera.lookAt(camTarget);

    sunLight.position.set(camera.position.x + 60, camera.position.y + 80, camera.position.z + 40);
}

function getLeader() {
    const unfinished = marbles.filter(m => !m.finished);
    if (unfinished.length === 0) return marbles[0];
    if (!finishAABB) return unfinished[0];
    return unfinished.reduce((best, m) => {
        const da = dist3(m.body.position, finishAABB);
        const db = dist3(best.body.position, finishAABB);
        return da < db ? m : best;
    });
}

// ============================================================================
// END RACE / RESULTS
// ============================================================================
async function endRace() {
    if (raceState === STATE.RESULTS) return;
    raceState = STATE.RESULTS;

    clearInterval(sessionPollInterval);
    clearInterval(_chatPollTimer);
    clearInterval(_abilityPollTimer);
    _abilityPollTimer = null;
    _activeEffects.clear();
    if (_abilityHudRoot) { _abilityHudRoot.remove(); _abilityHudRoot = null; _abilityHudNodes.clear(); }
    _trailParticles.forEach(p => { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
    _trailParticles.length = 0;
    marbles.forEach(m => { if (m.accessoryMesh) scene.remove(m.accessoryMesh); });
    _cleanupGhostMarble();
    const _tHud = document.getElementById('_teamHud');
    if (_tHud) _tHud.remove();
    clearTimeout(raceTimeout);

    SFX.stopRolling();

    // Rank unfinished marbles by proximity to finish
    const unfinished = marbles.filter(m => !m.finished).sort((a, b) => {
        if (!finishAABB) return 0;
        return dist3(a.body.position, finishAABB) - dist3(b.body.position, finishAABB);
    });
    unfinished.forEach(m => {
        m.rank = ++finishCount;
        m.finishTime = null;
    });

    showResults();
    submitResults();
}

function showResults() {
    const list  = document.getElementById('resultsList');
    const total = marbles.length;

    const sorted = [...marbles].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

    // Semantic table for accessibility; visual styling preserved via class names
    // Team score summary
    let teamBanner = '';
    if (RACE_SETTINGS.team_mode) {
        let redScore = 0, blueScore = 0;
        marbles.forEach(m => {
            if (!m.rank) return;
            const pts = Math.max(0, marbles.length - m.rank + 1);
            if (m.team === 'red')  redScore  += pts;
            if (m.team === 'blue') blueScore += pts;
        });
        const teamWinner = redScore > blueScore ? '🔴 RED' : blueScore > redScore ? '🔵 BLUE' : 'TIE';
        const winColor   = redScore > blueScore ? '#ee3333' : blueScore > redScore ? '#3388ee' : '#888';
        teamBanner = `<div style="text-align:center;margin-bottom:12px;padding:10px;border-radius:8px;background:#0d0d1a;border:1px solid #1e1e2e;">
            <div style="font-family:Orbitron,sans-serif;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Team Result</div>
            <div style="font-family:Orbitron,sans-serif;font-size:18px;font-weight:900;color:${winColor};margin-top:4px;">${teamWinner} WINS</div>
            <div style="font-size:11px;color:#888;margin-top:4px;">🔴 ${redScore} pts &nbsp;·&nbsp; 🔵 ${blueScore} pts</div>
        </div>`;
    }

    const tbody = sorted.map(m => {
        const rankCl    = m.rank === 1 ? 'top1' : m.rank === 2 ? 'top2' : m.rank === 3 ? 'top3' : '';
        const rankLabel = m.rank === 1 ? 'gold' : m.rank === 2 ? 'silver' : m.rank === 3 ? 'bronze' : 'other';
        const timeTxt   = m.finishTime !== null ? formatTime(m.finishTime) : 'DNF';
        const timeCl    = m.finishTime !== null ? (m.rank === 1 ? 'winner' : '') : 'dnf';
        const badge     = m.rank === 1 ? '🥇' : m.rank === 2 ? '🥈' : m.rank === 3 ? '🥉' : '';
        const teamCell  = RACE_SETTINGS.team_mode && m.team
            ? `<td><span style="font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700;background:${m.team === 'red' ? '#ee3333' : '#3388ee'};color:#fff;">${m.team.toUpperCase()}</span></td>`
            : '';
        return `<tr class="result-row ${rankCl}" aria-label="Position ${m.rank}: ${escHtml(m.username)}, time ${timeTxt}">
            <td class="result-rank ${rankLabel}" aria-label="Position">#${m.rank}</td>
            <td aria-hidden="true"><span class="result-dot" style="background:#${m.color.getHexString()}"></span></td>
            <td class="result-name">${escHtml(m.username)}</td>
            ${teamCell}
            <td class="result-time ${timeCl}" aria-label="Time">${timeTxt}</td>
            <td aria-label="Medal">${badge}</td>
        </tr>`;
    }).join('');

    list.innerHTML = teamBanner + `<table class="results-table" role="table" aria-label="Race results">
        <thead class="sr-only"><tr><th scope="col">Position</th><th scope="col">Colour</th><th scope="col">Player</th><th scope="col">Time</th><th scope="col">Medal</th></tr></thead>
        <tbody>${tbody}</tbody>
    </table>`;

    if (!HIDE_RESULTS) {
        const overlay = document.getElementById('overlayResults');
        overlay.classList.remove('hidden');

        // Mobile swipe-to-dismiss (swipe down on the results panel)
        if ('ontouchstart' in window) {
            const panel = overlay.querySelector('.results-panel');
            if (panel) {
                // Add swipe hint on mobile
                const hint = document.createElement('div');
                hint.className = 'results-swipe-hint';
                hint.textContent = '↓ Swipe down to dismiss';
                panel.prepend(hint);

                let touchStartY = 0;
                panel.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
                panel.addEventListener('touchend', e => {
                    const dy = e.changedTouches[0].clientY - touchStartY;
                    if (dy > 80) {
                        panel.classList.add('swipe-dismiss');
                        setTimeout(() => overlay.classList.add('hidden'), 320);
                    }
                }, { passive: true });
            }
        }
    }
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('camBtn').classList.add('hidden');
}

async function computeMapId(mapData) {
    if (!mapData || !mapData.pieces) return 'unknown';
    try {
        const stable = JSON.stringify(
            mapData.pieces.map(p => ({
                t: p.pieceId,
                x: Math.round(p.pos?.x ?? 0),
                y: Math.round(p.pos?.y ?? 0),
                z: Math.round(p.pos?.z ?? 0),
                r: p.rot || 0,
            })).sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z)
        );
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
        return Array.from(new Uint8Array(buf)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
        return 'unknown';
    }
}

async function submitResults() {
    if (PREVIEW_MODE) return;  // no session to report to
    const results = marbles
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
        .map(m => ({
            rank:           m.rank,
            username:       m.username,
            finish_time_ms: m.finishTime != null ? Math.round(m.finishTime * 1000) : null,
            respawns:       m.respawns,
        }));

    const map_id   = await computeMapId(MAP_DATA);
    const map_name = MAP_DATA?.name || 'Untitled';

    // Include ghost paths for finishers (server stores only the record setter)
    const ghost_paths = {};
    for (const m of marbles) {
        if (m.rank != null && _ghostRecorder[m.username]?.length) {
            ghost_paths[m.username] = _ghostRecorder[m.username];
        }
    }

    try {
        const res  = await fetch(`/marbles/api/game/${SESSION_ID}/results`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ results, map_id, map_name, halfway_last: _halfwayLast, race_duration_ms: Math.round(performance.now() - raceStartTime), ghost_paths }),
        });
        const data = await res.json();
        const summary = data.summary || {};
        const recordHolder = Object.keys(summary).find(u => summary[u]?.record);
        if (recordHolder) _showNewRecord(recordHolder, map_name);

        // Achievement toast notifications
        const achQueue = [];
        for (const [username, s] of Object.entries(summary)) {
            for (const ach of (s.achievements || [])) {
                achQueue.push({ username, ach });
            }
        }
        if (achQueue.length) _showAchievementToasts(achQueue);

        // Cosmetic unlock toasts for the local player
        const localLogin = window.__MARBLES_LOGIN || '';
        if (localLogin && summary[localLogin]?.new_cosmetics?.length) {
            for (const nc of summary[localLogin].new_cosmetics) {
                setTimeout(() => _showCosmeticUnlockToast(nc), 500 + achQueue.length * 500);
            }
        }

        if (RACE_SETTINGS.announce_winner) {
            const winner = results.find(r => r.rank === 1);
            if (winner) {
                const timeStr = winner.finish_time_ms != null
                    ? ` (${(winner.finish_time_ms / 1000).toFixed(2)}s)`
                    : '';
                const msg = `🏆 ${winner.username} wins the marble race on "${map_name}"!${timeStr} | cubsoftware.site/marbles`;
                fetch('/cubassist/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msg }),
                }).catch(() => {});
            }
        }

        // Tournament overlay
        if (data.tournament) _showTournamentOverlay(data.tournament);

        // Push stream alerts (record broken, achievements) to the OBS alert source
        if (SESSION_ID) {
            const streamAlerts = [];
            const resultsByUser = Object.fromEntries(results.map(r => [r.username, r]));
            for (const [username, ps] of Object.entries(summary)) {
                if (ps.record) {
                    const time_ms = resultsByUser[username]?.finish_time_ms ?? null;
                    streamAlerts.push({ type: 'record', username, map_name, time_ms });
                }
                for (const ach of (ps.achievements || [])) {
                    streamAlerts.push({ type: 'achievement', username, ach_name: ach.name || String(ach), ach_icon: ach.icon || '🏅' });
                }
            }
            if (streamAlerts.length) {
                fetch(`/marbles/api/game/${SESSION_ID}/alerts/push`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ alerts: streamAlerts }),
                }).catch(() => {});
            }
        }

        // Elimination overlay
        if (data.elimination) _showEliminationOverlay(data.elimination);

    } catch (_) { /* non-fatal */ }
}

// ============================================================================
// GHOST MARBLE
// ============================================================================
function _spawnGhostMarble() {
    if (!_ghostMarblePath || _ghostMarbleMesh) return;
    const geo = new THREE.SphereGeometry(MARBLE_RADIUS, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
        color: 0xaaccff, transparent: true, opacity: 0.38,
        roughness: 0.3, metalness: 0.3,
    });
    _ghostMarbleMesh = new THREE.Mesh(geo, mat);
    _ghostMarbleMesh.castShadow = false;
    scene.add(_ghostMarbleMesh);
    const [x, y, z] = _ghostMarblePath[0];
    _ghostMarbleMesh.position.set(x, y, z);
}

function _tickGhostMarble(dt) {
    if (!_ghostMarbleMesh || !_ghostMarblePath || !_ghostActive) return;
    _ghostPathTime += dt;
    const idx = Math.min(
        Math.floor(_ghostPathTime * (1000 / GHOST_SAMPLE_MS)),
        _ghostMarblePath.length - 1
    );
    const [x, y, z] = _ghostMarblePath[idx];
    _ghostMarbleMesh.position.set(x, y, z);
    if (idx >= _ghostMarblePath.length - 1) {
        // Ghost reached end — fade and remove after 2s
        _ghostActive = false;
        setTimeout(() => {
            if (_ghostMarbleMesh) {
                scene.remove(_ghostMarbleMesh);
                _ghostMarbleMesh.geometry.dispose();
                _ghostMarbleMesh.material.dispose();
                _ghostMarbleMesh = null;
            }
        }, 2000);
    }
}

function _startGhostRecording() {
    _ghostRecorder = {};
    _ghostRecordTimer = setInterval(() => {
        for (const m of marbles) {
            if (!m.body || m.eliminated) continue;
            if (!_ghostRecorder[m.username]) _ghostRecorder[m.username] = [];
            const p = m.body.position;
            _ghostRecorder[m.username].push([
                Math.round(p.x * 100) / 100,
                Math.round(p.y * 100) / 100,
                Math.round(p.z * 100) / 100,
            ]);
        }
    }, GHOST_SAMPLE_MS);
}

function _stopGhostRecording() {
    clearInterval(_ghostRecordTimer);
    _ghostRecordTimer = null;
}

function _cleanupGhostMarble() {
    _stopGhostRecording();
    _ghostActive = false;
    if (_ghostMarbleMesh) {
        scene.remove(_ghostMarbleMesh);
        _ghostMarbleMesh.geometry.dispose();
        _ghostMarbleMesh.material.dispose();
        _ghostMarbleMesh = null;
    }
}

function _showEliminationOverlay(e) {
    const existing = document.getElementById('_elimOverlay');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = '_elimOverlay';
    el.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#0d0d1a;border:2px solid #ef4444;border-radius:12px;padding:16px 22px;z-index:600;min-width:280px;max-width:400px;text-align:center;';

    if (e.final) {
        const winner = e.remaining[0] || '???';
        el.innerHTML = `
            <div style="font-family:Orbitron,sans-serif;font-size:16px;font-weight:900;color:#ef4444;margin-bottom:8px;">🏆 Last Marble Standing!</div>
            <div style="font-size:13px;color:#e0e0f0;margin-bottom:4px;">Survivor: <strong style="color:#fbbf24">${escHtml(winner)}</strong></div>
            <div style="font-size:11px;color:#888;">${e.all_eliminated.length} marble${e.all_eliminated.length !== 1 ? 's' : ''} eliminated</div>
        `;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 12000);
    } else {
        let countdown = 8;
        const remainText = e.remaining.length === 1
            ? `<strong style="color:#fbbf24">${escHtml(e.remaining[0])}</strong> remains`
            : `${e.remaining.length} marbles remain`;
        el.innerHTML = `
            <div style="font-family:Orbitron,sans-serif;font-size:14px;font-weight:700;color:#ef4444;margin-bottom:8px;">❌ Round ${e.round} — Eliminated!</div>
            <div style="font-size:13px;color:#e0e0f0;margin-bottom:4px;"><strong style="color:#ef4444">${escHtml(e.eliminated_this_round)}</strong> is out!</div>
            <div style="font-size:11px;color:#888;margin-bottom:8px;">${remainText}</div>
            <div style="font-size:11px;color:#888;">Next round in <span id="_elimCd">${countdown}</span>s…</div>
        `;
        document.body.appendChild(el);
        const iv = setInterval(() => {
            countdown--;
            const cdEl = document.getElementById('_elimCd');
            if (cdEl) cdEl.textContent = countdown;
            if (countdown <= 0) { clearInterval(iv); el.remove(); }
        }, 1000);
    }
}

function _showTournamentOverlay(t) {
    const existing = document.getElementById('_tournamentOverlay');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = '_tournamentOverlay';
    el.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#0d0d1a;border:2px solid #5865f2;border-radius:12px;padding:16px 22px;z-index:600;min-width:280px;max-width:400px;text-align:center;';

    const standingsHTML = (t.standings || []).slice(0, 8).map((s, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
        return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;"><span>${medal} ${escHtml(s.login)}</span><span style="color:#fbbf24;font-family:Orbitron,sans-serif;font-size:11px;">${s.points} pts</span></div>`;
    }).join('');

    if (t.final) {
        el.innerHTML = `
            <div style="font-family:Orbitron,sans-serif;font-size:16px;font-weight:900;color:#5865f2;margin-bottom:8px;">🏆 Tournament Complete!</div>
            <div style="font-size:11px;color:#888;margin-bottom:12px;">${t.total_races}-race tournament final standings</div>
            ${standingsHTML}
        `;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 12000);
    } else {
        let countdown = 8;
        el.innerHTML = `
            <div style="font-family:Orbitron,sans-serif;font-size:13px;font-weight:700;color:#5865f2;margin-bottom:4px;">Race ${t.race_num} of ${t.total_races} complete</div>
            <div style="font-size:11px;color:#888;margin-bottom:10px;">Tournament Standings</div>
            ${standingsHTML}
            <div style="margin-top:12px;font-size:11px;color:#888;">Next race in <span id="_tourCd">${countdown}</span>s…</div>
        `;
        document.body.appendChild(el);
        const iv = setInterval(() => {
            countdown--;
            const cdEl = document.getElementById('_tourCd');
            if (cdEl) cdEl.textContent = countdown;
            if (countdown <= 0) { clearInterval(iv); el.remove(); }
        }, 1000);
    }
}

function _showNewRecord(username, mapName) {
    SFX.recordBroken();
    const el = document.createElement('div');
    el.style.cssText = [
        'position:fixed', 'top:50%', 'left:50%',
        'transform:translate(-50%,-50%) scale(0.8)',
        'background:linear-gradient(135deg,#0a0a14,#1a1a2e)',
        'border:2px solid #fbbf24',
        'border-radius:14px',
        'padding:24px 36px',
        'text-align:center',
        'z-index:9999',
        'pointer-events:none',
        'opacity:0',
        'transition:opacity 0.35s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        'box-shadow:0 0 40px rgba(251,191,36,0.35)',
        'font-family:Poppins,sans-serif',
    ].join(';');
    el.innerHTML = `
        <div style="font-size:32px;margin-bottom:4px">🏆</div>
        <div style="font-size:11px;font-weight:700;letter-spacing:0.2em;color:#fbbf24;text-transform:uppercase;">New Track Record!</div>
        <div style="font-size:22px;font-weight:800;color:#fff;margin:6px 0 4px">${username}</div>
        <div style="font-size:11px;color:#888">${mapName}</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translate(-50%,-50%) scale(1)';
    });
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%,-50%) scale(0.85)';
        setTimeout(() => el.remove(), 400);
    }, 5000);
}

function _showCosmeticUnlockToast({ type, key }) {
    const typeLabel = type === 'skin' ? 'Skin' : type === 'trail' ? 'Trail' : 'Accessory';
    const name = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;bottom:60px;right:20px;background:#a78bfa;color:#fff;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:700;z-index:9000;box-shadow:0 4px 20px rgba(167,139,250,0.5);animation:slideInRight 0.3s ease;';
    div.innerHTML = `🎨 Cosmetic Unlocked!<br><span style="font-weight:400;font-size:11px;">${typeLabel}: ${name}</span>`;
    document.body.appendChild(div);
    setTimeout(() => { div.style.transition='opacity 0.5s'; div.style.opacity='0'; setTimeout(()=>div.remove(),500); }, 3500);
}

function _showAchievementToasts(queue) {
    const feed = document.getElementById('achievementFeed') || (() => {
        const d = document.createElement('div');
        d.id = 'achievementFeed';
        d.style.cssText = 'position:fixed;bottom:80px;left:20px;z-index:9998;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(d);
        return d;
    })();

    queue.forEach(({ username, ach }, i) => {
        setTimeout(() => {
            const toast = document.createElement('div');
            toast.className = 'ach-toast';
            toast.innerHTML = `<span class="ach-toast-icon">${ach.icon || '🏆'}</span><div class="ach-toast-body"><div class="ach-toast-name">${escHtml(ach.name)}</div><div class="ach-toast-user">${escHtml(username)} unlocked an achievement!</div></div>`;
            feed.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('ach-toast--in'));
            setTimeout(() => {
                toast.classList.remove('ach-toast--in');
                toast.classList.add('ach-toast--out');
                setTimeout(() => toast.remove(), 400);
            }, 4500);
        }, i * 900);
    });
}

// ── Chat ability polling & effect application ──────────────────────────────────

async function _pollAbilities() {
    if (raceState !== STATE.RACING && raceState !== STATE.FINISHING) return;
    try {
        const res  = await fetch(`/marbles/api/game/${SESSION_ID}/abilities`);
        if (!res.ok) return;
        const data = await res.json();
        for (const ev of (data.abilities || [])) {
            _applyAbility(ev);
        }
    } catch (_) {}
}

function _applyAbility(ev) {
    const { ability, label, type, caster, target, duration } = ev;
    const now = performance.now();
    const until = duration > 0 ? now + duration * 1000 : 0;

    // Session-modifier abilities (no physics effect, show banner)
    if (type === 'session') {
        if (ability === 'double_coins') {
            const banner = document.createElement('div');
            banner.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);color:#fbbf24;font-family:Orbitron,sans-serif;font-size:22px;font-weight:900;padding:14px 28px;border-radius:12px;border:2px solid #fbbf24;z-index:500;pointer-events:none;text-align:center;';
            banner.innerHTML = `🪙 DOUBLE COINS!<div style="font-size:12px;font-weight:400;color:#aaa;margin-top:4px;">by @${escHtml(caster)} — everyone earns 2× coins this race</div>`;
            document.body.appendChild(banner);
            setTimeout(() => banner.remove(), 4000);
        }
        return;
    }

    // Find target marbles
    let targets = [];
    if (type === 'global') {
        targets = marbles.filter(m => !m.finished);
    } else if (type === 'buff') {
        targets = marbles.filter(m => m.username.toLowerCase() === caster);
    } else if (type === 'sabotage') {
        targets = marbles.filter(m => m.username.toLowerCase() === target);
    }
    if (!targets.length) return;

    for (const m of targets) {
        const login = m.username.toLowerCase();
        // Track effect for HUD and duration
        if (!_activeEffects.has(login)) _activeEffects.set(login, []);
        const effects = _activeEffects.get(login);
        // Enforce max 3 simultaneous effects per marble — evict the soonest-expiring one
        if (effects.length >= 3) {
            let evictIdx = 0;
            for (let i = 1; i < effects.length; i++) {
                const u = effects[i].until;
                if (u > 0 && (effects[evictIdx].until === 0 || u < effects[evictIdx].until)) evictIdx = i;
            }
            const ev2 = effects.splice(evictIdx, 1)[0];
            if (ev2.frozen) { m.body.type = CANNON.Body.DYNAMIC; m.body.wakeUp(); }
            if (ev2.origScale !== undefined) m.mesh.scale.setScalar(ev2.origScale);
            if (ev2.origMass !== undefined) { m.body.mass = ev2.origMass; m.body.updateMassProperties(); }
            if (ev2.origFriction !== undefined && m.body.material) m.body.material.friction = ev2.origFriction;
            if (ev2.origRestitution !== undefined && m.body.material) m.body.material.restitution = ev2.origRestitution;
        }
        // Apply physics effect immediately
        switch (ability) {
            case 'speed_burst':
            case 'speed_all': {
                const v = m.body.velocity;
                m.body.velocity.set(v.x * 1.5, v.y * 1.5, v.z * 1.5);
                effects.push({ key: ability, label, until, icon: '⚡' });
                break;
            }
            case 'shield':
                effects.push({ key: 'shield', label: 'Shield', until, icon: '🛡️', shielded: true });
                break;
            case 'mega_bounce':
                if (m.body.material) m.body.material.restitution = 3.0;
                effects.push({ key: 'mega_bounce', label, until, icon: '🏀', origRestitution: 0.5 });
                break;
            case 'shrink':
                m.mesh.scale.setScalar(0.6);
                m.body.mass = m.body.mass * 0.5;
                m.body.updateMassProperties();
                effects.push({ key: 'shrink', label, until, icon: '🔽', origScale: 1.0, origMass: m.body.mass * 2 });
                break;
            case 'jump': {
                m.body.applyImpulse(new CANNON.Vec3(0, 25, 0));
                _showAbilityLabel(m, '⬆ Jump!');
                break;
            }
            case 'sticky_wheels':
                effects.push({ key: 'sticky_wheels', label, until, icon: '🧲', origFriction: m.body.material?.friction });
                if (m.body.material) m.body.material.friction = 5.0;
                break;
            case 'freeze':
            case 'glue': {
                // Check if target has shield
                const shield = _getEffect(login, 'shield');
                if (shield) { _consumeShield(login); break; }
                m.body.velocity.set(0, 0, 0);
                m.body.angularVelocity.set(0, 0, 0);
                m.body.type = CANNON.Body.STATIC;
                effects.push({ key: ability, label, until, icon: '❄️', frozen: true });
                _showAbilityLabel(m, ability === 'freeze' ? '❄ Frozen!' : '🧲 Glued!');
                break;
            }
            case 'ice_blast': {
                const shield2 = _getEffect(login, 'shield');
                if (shield2) { _consumeShield(login); break; }
                if (m.body.material) m.body.material.friction = 0.0;
                effects.push({ key: 'ice_blast', label, until, icon: '🧊', origFriction: m.body.material?.friction ?? 0.3 });
                break;
            }
            case 'tp_home': {
                const shield3 = _getEffect(login, 'shield');
                if (shield3) { _consumeShield(login); break; }
                if (startPos) m.body.position.set(startPos.x, startPos.y + 2, startPos.z);
                m.body.velocity.set(0, 0, 0);
                _showAbilityLabel(m, '🏠 Sent home!');
                break;
            }
            case 'reverse': {
                const shield4 = _getEffect(login, 'shield');
                if (shield4) { _consumeShield(login); break; }
                const v2 = m.body.velocity;
                m.body.velocity.set(-v2.x, -v2.y, -v2.z);
                _showAbilityLabel(m, '↩ Reversed!');
                break;
            }
            case 'earthquake':
            case 'global_quake': {
                const shield5 = _getEffect(login, 'shield');
                if (shield5) { _consumeShield(login); break; }
                effects.push({ key: ability, label, until, icon: '🌋', quaking: true });
                break;
            }
            case 'gravity_flip':
            case 'global_grav': {
                const shield6 = _getEffect(login, 'shield');
                if (shield6) { _consumeShield(login); break; }
                effects.push({ key: ability, label, until, icon: '🔃', gravFlipped: true });
                break;
            }
            case 'size_up': {
                const shield7 = _getEffect(login, 'shield');
                if (shield7) { _consumeShield(login); break; }
                m.mesh.scale.setScalar(2.0);
                m.body.mass = m.body.mass * 4;
                m.body.updateMassProperties();
                effects.push({ key: 'size_up', label, until, icon: '⬆', origScale: 1.0, origMass: m.body.mass / 4 });
                break;
            }
            case 'swap': {
                // Swap positions of caster and target
                const casterM = marbles.find(x => x.username.toLowerCase() === caster);
                if (casterM && casterM !== m) {
                    const cp = casterM.body.position.clone();
                    casterM.body.position.copy(m.body.position);
                    m.body.position.copy(cp);
                    const cv = casterM.body.velocity.clone();
                    casterM.body.velocity.copy(m.body.velocity);
                    m.body.velocity.copy(cv);
                    _showAbilityLabel(m, '🔄 Swapped!');
                }
                break;
            }
            case 'chaos': {
                const abilityList = ['speed_burst', 'freeze', 'jump', 'reverse', 'earthquake'];
                const rndKey = abilityList[Math.floor(Math.random() * abilityList.length)];
                _applyAbility({ ...ev, ability: rndKey, type: 'sabotage', target: login, label: `Chaos → ${rndKey}`, duration: 2.0 });
                continue;
            }
        }
        _updateAbilityHUD();
    }
}

function _getEffect(login, key) {
    return (_activeEffects.get(login) || []).find(e => e.key === key && e.until > performance.now());
}

function _consumeShield(login) {
    const effects = _activeEffects.get(login) || [];
    const idx = effects.findIndex(e => e.key === 'shield');
    if (idx !== -1) effects.splice(idx, 1);
}

function _showAbilityLabel(marble, text) {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);font-size:18px;font-weight:700;color:#fff;text-shadow:0 2px 8px #000;pointer-events:none;z-index:500;opacity:1;transition:opacity 1s,transform 1s;';
    div.textContent = `${marble.username}: ${text}`;
    document.body.appendChild(div);
    requestAnimationFrame(() => { div.style.opacity = '0'; div.style.transform = 'translate(-50%,-80%)'; });
    setTimeout(() => div.remove(), 1200);
}

function _tickAbilityEffects(dt) {
    const now = performance.now();
    for (const [login, effects] of _activeEffects) {
        const expired = effects.filter(e => e.until > 0 && e.until <= now);
        for (const e of expired) {
            // Restore state on expiry
            const m = marbles.find(x => x.username.toLowerCase() === login);
            if (m) {
                if (e.frozen) { m.body.type = CANNON.Body.DYNAMIC; m.body.wakeUp(); }
                if (e.origScale !== undefined) m.mesh.scale.setScalar(e.origScale);
                if (e.origMass !== undefined) { m.body.mass = e.origMass; m.body.updateMassProperties(); }
                if (e.origFriction !== undefined && m.body.material) m.body.material.friction = e.origFriction;
                if (e.origRestitution !== undefined && m.body.material) m.body.material.restitution = e.origRestitution;
            }
            if (e.quaking && m) {
                // Apply random impulse this frame during earthquake
                m.body.applyImpulse(new CANNON.Vec3((Math.random()-0.5)*15, Math.random()*5, (Math.random()-0.5)*15));
            }
        }
        // Ongoing earthquake
        for (const e of effects.filter(e => e.quaking && e.until > now)) {
            const m = marbles.find(x => x.username.toLowerCase() === login);
            if (m) m.body.applyImpulse(new CANNON.Vec3((Math.random()-0.5)*4*dt*60, Math.random()*2*dt*60, (Math.random()-0.5)*4*dt*60));
        }
        // Ongoing gravity flip
        for (const e of effects.filter(e => e.gravFlipped && e.until > now)) {
            const m = marbles.find(x => x.username.toLowerCase() === login);
            if (m) m.body.applyForce(new CANNON.Vec3(0, 70, 0)); // counter gravity + upward
        }
        // Remove expired
        const remaining = effects.filter(e => e.until === 0 || e.until > now);
        _activeEffects.set(login, remaining);
    }
}

// Ability HUD — DOM overlay icons projected onto screen space above each marble's nametag.
// One entry per marble; re-uses existing elements to avoid GC churn.
let _abilityHudRoot = null;
const _abilityHudNodes = new Map(); // login → div

// Icons for each effect type (shown while active)
const _EFFECT_ICONS = {
    speed:       '⚡',
    shield:      '🛡️',
    bounce:      '🏀',
    ghost:       '👻',
    shrunk:      '🔬',
    jump:        '🦘',
    sticky:      '🍯',
    frozen:      '❄️',
    reversed:    '🔄',
    quaking:     '🌋',
    gravFlipped: '🔃',
    glued:       '🦶',
    big:         '🔴',
};

function _getAbilityHudRoot() {
    if (!_abilityHudRoot) {
        _abilityHudRoot = document.createElement('div');
        _abilityHudRoot.id = 'abilityHUD';
        _abilityHudRoot.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:200;overflow:hidden;';
        document.body.appendChild(_abilityHudRoot);
    }
    return _abilityHudRoot;
}

function _updateAbilityHUD() {
    if (!camera || !renderer) return;
    const root = _getAbilityHudRoot();
    const now  = performance.now();
    const w = renderer.domElement.clientWidth  || window.innerWidth;
    const h = renderer.domElement.clientHeight || window.innerHeight;
    const seen = new Set();

    for (const m of marbles) {
        if (m.finished) continue;
        const login  = m.username.toLowerCase();
        const effects = _activeEffects.get(login);
        const active  = effects ? effects.filter(e => e.until === 0 || e.until > now) : [];
        if (!active.length) {
            // Remove stale node
            const node = _abilityHudNodes.get(login);
            if (node) { node.style.display = 'none'; }
            continue;
        }

        seen.add(login);

        // Project marble's world position to NDC then to CSS pixels
        const pos3 = m.body.position;
        const vec  = new THREE.Vector3(pos3.x, pos3.y + 2.4, pos3.z); // slightly above nametag
        vec.project(camera);
        if (vec.z > 1) continue; // behind camera
        const sx = ( vec.x * 0.5 + 0.5) * w;
        const sy = (-vec.y * 0.5 + 0.5) * h;

        // Build icon string
        const icons = [...new Set(active.flatMap(e => {
            const out = [];
            if (e.speedUp)      out.push(_EFFECT_ICONS.speed);
            if (e.shield)       out.push(_EFFECT_ICONS.shield);
            if (e.bouncy)       out.push(_EFFECT_ICONS.bounce);
            if (e.ghost)        out.push(_EFFECT_ICONS.ghost);
            if (e.shrunk)       out.push(_EFFECT_ICONS.shrunk);
            if (e.jump)         out.push(_EFFECT_ICONS.jump);
            if (e.sticky)       out.push(_EFFECT_ICONS.sticky);
            if (e.frozen)       out.push(_EFFECT_ICONS.frozen);
            if (e.reversed)     out.push(_EFFECT_ICONS.reversed);
            if (e.quaking)      out.push(_EFFECT_ICONS.quaking);
            if (e.gravFlipped)  out.push(_EFFECT_ICONS.gravFlipped);
            if (e.glued)        out.push(_EFFECT_ICONS.glued);
            if (e.big)          out.push(_EFFECT_ICONS.big);
            return out;
        }))].join('');
        if (!icons) continue;

        let node = _abilityHudNodes.get(login);
        if (!node) {
            node = document.createElement('div');
            node.style.cssText = 'position:absolute;font-size:14px;line-height:1;background:rgba(0,0,0,0.5);border-radius:6px;padding:2px 4px;transform:translate(-50%,-100%);white-space:nowrap;transition:opacity 0.15s;';
            root.appendChild(node);
            _abilityHudNodes.set(login, node);
        }
        node.style.display = '';
        node.style.left    = sx + 'px';
        node.style.top     = sy + 'px';
        node.textContent   = icons;
    }
}

let _reconnecting = false;

async function pollSession() {
    try {
        const res  = await fetch(`/marbles/api/game/${SESSION_ID}`);
        if (!res.ok) {
            // Session gone — show reconnect overlay in OBS mode
            if (OBS_MODE && !_reconnecting) _startReconnect();
            return;
        }
        if (_reconnecting) _stopReconnect();
        const data = await res.json();
        if (data.state === 'ended' && raceState !== STATE.RESULTS) endRace();

        // Late join — spawn any new players that joined during the race
        if (RACE_SETTINGS.late_join && (raceState === STATE.RACING || raceState === STATE.FINISHING)) {
            const knownNames = new Set(marbles.map(m => m.username.toLowerCase()));
            const sessionPlayers = data.players || [];
            for (const name of sessionPlayers) {
                if (!knownNames.has(name.toLowerCase())) {
                    _spawnLatecomer(name, data.player_selections?.[name.toLowerCase()]);
                }
            }
        }
    } catch (_) {
        if (OBS_MODE && !_reconnecting) _startReconnect();
    }
}

function _spawnLatecomer(username, marbleSlot) {
    const spawnCenter = startPiece
        ? { x: startPiece.pos.x, y: startPiece.pos.y + 4, z: startPiece.pos.z }
        : { x: 0, y: 6, z: 0 };

    const body = new CANNON.Body({
        mass: 1, material: MAT_MARBLE,
        linearDamping: 0.04, angularDamping: 0.08,
    });
    body.addShape(new CANNON.Sphere(0.5));
    body.position.set(spawnCenter.x + (Math.random() - 0.5) * 2, spawnCenter.y, spawnCenter.z + (Math.random() - 0.5) * 2);
    body.allowSleep = false;
    world.addBody(body);

    const marbleType = marbleSlot != null ? MARBLE_TYPES.find(mt => mt.slot === marbleSlot && mt.enabled) : null;
    const color = marbleType ? new THREE.Color(marbleType.color) : usernameToColor(username);
    const geo   = new THREE.SphereGeometry(0.5, PERF_MODE ? 6 : 16, PERF_MODE ? 6 : 16);
    const mat   = new THREE.MeshLambertMaterial({ color });
    const mesh  = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    scene.add(mesh);

    const nametag = buildNametag(username, color);
    scene.add(nametag);

    const _lateTrail = RACE_SETTINGS.cosmetics_enabled !== false
        ? ((_playerCosmetics[username.toLowerCase()] || {}).trail || 'classic') : 'classic';
    if (!PERF_MODE) initTrail(username, color, _lateTrail);

    let shadowDisk = null;
    if (!PERF_MODE) {
        const sdGeo = new THREE.CircleGeometry(0.5, 16);
        const sdMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
        shadowDisk = new THREE.Mesh(sdGeo, sdMat);
        shadowDisk.rotation.x = -Math.PI / 2;
        scene.add(shadowDisk);
    }

    const _lateAcc = RACE_SETTINGS.cosmetics_enabled !== false
        ? ((_playerCosmetics[username.toLowerCase()] || {}).accessory || 'none') : 'none';
    const _lateAccMesh = (!PERF_MODE && _lateAcc && _lateAcc !== 'none')
        ? _buildAccessoryMesh(_lateAcc) : null;
    if (_lateAccMesh) scene.add(_lateAccMesh);

    marbles.push({
        body, mesh, nametag, shadowDisk,
        username, color,
        finished: false, finishTime: null, rank: null,
        respawns: 0, lastCheckpoint: null,
        trailPositions: [], trailType: _lateTrail, _trailTimer: 0,
        accessoryMesh: _lateAccMesh, accessoryKey: _lateAcc,
        _baseMass: 1,
    });

    PLAYER_LIST.push(username);
    MARBLE_SELECTIONS[username.toLowerCase()] = marbleSlot ?? null;
}

function _startReconnect() {
    _reconnecting = true;
    // Inject a subtle reconnecting badge
    if (!document.getElementById('_obsReconn')) {
        const el = document.createElement('div');
        el.id = '_obsReconn';
        el.style.cssText = 'position:fixed;bottom:12px;right:12px;background:rgba(0,0,0,0.75);color:#fbbf24;font-family:sans-serif;font-size:11px;font-weight:700;padding:5px 10px;border-radius:5px;z-index:9999;letter-spacing:0.05em;';
        el.textContent = '⚠ Reconnecting…';
        document.body.appendChild(el);
    }
    // Poll every 3s; when session reappears, reload the OBS page to restart cleanly
    const iv = setInterval(async () => {
        try {
            const r = await fetch(`/marbles/api/game/${SESSION_ID}`);
            if (r.ok) { clearInterval(iv); location.reload(); }
        } catch (_) {}
    }, 3000);
}

function _stopReconnect() {
    _reconnecting = false;
    const el = document.getElementById('_obsReconn');
    if (el) el.remove();
}

// ============================================================================
// UI BINDINGS
// ============================================================================
function bindUI() {
    // Chat overlay — show Twitch chat during race (hidden in OBS mode, preview mode, or perf mode)
    if (SESSION_ID && !OBS_MODE && !PREVIEW_MODE && !PERF_MODE) {
        _setupChatOverlay();
    }

    document.getElementById('btnRaceAgain').addEventListener('click', async () => {
        try {
            await fetch(`/marbles/api/game/${SESSION_ID}/reset`, { method: 'POST' });
        } catch (_) {}
        // Persist session + map so editor restores the lobby for another round
        const restore = { session_id: SESSION_ID, map: MAP_DATA };
        sessionStorage.setItem('marbles_restore', JSON.stringify(restore));
        window.location.href = '/apps/marble-editor';
    });

    document.getElementById('btnBackEditor').addEventListener('click', () => {
        // Let editor restore the session (show results / lobby state)
        const restore = { session_id: SESSION_ID, map: MAP_DATA };
        sessionStorage.setItem('marbles_restore', JSON.stringify(restore));
        window.location.href = '/apps/marble-editor';
    });

    document.getElementById('camBtn').addEventListener('click', () => {
        camMode = (camMode + 1) % 4;
        if (camMode === CAM.FREE) {
            controls.enabled = true;
            controls.target.copy(camTarget);
        }
        _updateCamLabel();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'c' || e.key === 'C') document.getElementById('camBtn').click();
        // Spectate cycle — [ ] keys
        if (e.key === ']' && marbles.length) {
            _spectateIndex = (_spectateIndex + 1) % marbles.length;
            if (camMode !== CAM.SPECTATE) { camMode = CAM.SPECTATE; _updateCamLabel(); }
        }
        if (e.key === '[' && marbles.length) {
            _spectateIndex = (_spectateIndex - 1 + marbles.length) % marbles.length;
            if (camMode !== CAM.SPECTATE) { camMode = CAM.SPECTATE; _updateCamLabel(); }
        }
    });

    // Click leaderboard name to spectate that marble
    document.getElementById('hudLeaderboard').addEventListener('click', e => {
        const row = e.target.closest('.lb-row');
        if (!row) return;
        const name = row.querySelector('.lb-name')?.textContent;
        if (!name) return;
        const idx = marbles.findIndex(m => m.username === name);
        if (idx >= 0) { _spectateIndex = idx; camMode = CAM.SPECTATE; _updateCamLabel(); }
    });
}

function _updateCamLabel() {
    const labels = ['🎥 Leader', '🌐 Overview', '👁 Spectate', '🖱 Free'];
    const btn = document.getElementById('camBtn');
    if (btn) {
        btn.title = labels[camMode];
        if (camMode === CAM.SPECTATE && marbles.length) {
            const m = marbles[Math.min(_spectateIndex, marbles.length - 1)];
            btn.title = `👁 ${m.username}`;
        }
    }
}

function _showFinishCountdown() {
    // Inject a finish-timer element into the HUD if not already there
    const hud = document.getElementById('hud');
    if (!hud || document.getElementById('hudFinishTimer')) return;
    const el = document.createElement('div');
    el.id = 'hudFinishTimer';
    el.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);' +
        'background:rgba(0,0,0,0.7);color:#f59e0b;font-family:Orbitron,sans-serif;' +
        'font-size:18px;padding:8px 20px;border-radius:8px;letter-spacing:.05em;z-index:100;';
    document.body.appendChild(el);
}

// ============================================================================
// HELPERS
// ============================================================================
function inAABB(pos, aabb) {
    return pos.x >= aabb.minX && pos.x <= aabb.maxX &&
           pos.y >= aabb.minY && pos.y <= aabb.maxY &&
           pos.z >= aabb.minZ && pos.z <= aabb.maxZ;
}

function padAABB(piece) {
    const def = PIECES[piece.pieceId] ?? { w: 4, d: 4, h: 0.4 };
    return {
        minX: piece.pos.x - def.w / 2, maxX: piece.pos.x + def.w / 2,
        minY: piece.pos.y - 0.5,       maxY: piece.pos.y + def.h + 1,
        minZ: piece.pos.z - def.d / 2, maxZ: piece.pos.z + def.d / 2,
    };
}

function zoneAABB(piece) {
    const def = PIECES[piece.pieceId] ?? { w: 6, d: 6, h: 6 };
    return {
        minX: piece.pos.x - def.w / 2, maxX: piece.pos.x + def.w / 2,
        minY: piece.pos.y,             maxY: piece.pos.y + def.h,
        minZ: piece.pos.z - def.d / 2, maxZ: piece.pos.z + def.d / 2,
    };
}

function dirFromRot(rotDeg) {
    const r = rotDeg * Math.PI / 180;
    return { x: Math.sin(r), z: Math.cos(r) };
}

function dist3(pos, target) {
    return Math.sqrt(
        (pos.x - target.cx)**2 +
        (pos.y - target.cy)**2 +
        (pos.z - target.cz)**2
    );
}

function formatTime(ms) {
    const s   = ms / 1000;
    const m   = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1).padStart(4, '0');
    return `${m}:${sec}`;
}

function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ============================================================================
// CHAT OVERLAY — polls Twitch chat for the session channel
// ============================================================================
let _chatLastTs = 0;
let _chatPollTimer = null;

function _setupChatOverlay() {
    // Create panel
    const panel = document.createElement('div');
    panel.id = 'chatOverlay';
    panel.style.cssText = [
        'position:fixed', 'bottom:60px', 'right:12px', 'width:220px',
        'max-height:200px', 'overflow:hidden', 'pointer-events:none',
        'display:flex', 'flex-direction:column', 'gap:3px',
        'z-index:200', 'opacity:0.85',
    ].join(';');
    document.body.appendChild(panel);

    async function pollChat() {
        try {
            const res = await fetch(`/marbles/api/game/${SESSION_ID}/chat?since=${_chatLastTs}`);
            if (!res.ok) return;
            const data = await res.json();
            (data.messages || []).forEach(msg => {
                if (msg.ts <= _chatLastTs) return;
                _chatLastTs = msg.ts;
                const row = document.createElement('div');
                row.style.cssText = 'background:rgba(0,0,0,0.55);border-radius:4px;padding:3px 7px;font-size:11px;font-family:Poppins,sans-serif;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                const nameSpan = document.createElement('span');
                nameSpan.style.cssText = 'font-weight:700;margin-right:5px;';
                nameSpan.style.color = _chatNameColor(msg.user);
                nameSpan.textContent = msg.user + ':';
                row.appendChild(nameSpan);
                row.appendChild(document.createTextNode(msg.text));
                panel.appendChild(row);
                // Keep only last 8 messages visible
                while (panel.children.length > 8) panel.removeChild(panel.firstChild);
                // Fade row out after 8s
                setTimeout(() => { if (row.parentNode) row.style.opacity = '0'; row.style.transition = 'opacity 1s'; }, 8000);
                setTimeout(() => { if (row.parentNode) panel.removeChild(row); }, 9000);
            });
        } catch (_) {}
    }

    _chatPollTimer = setInterval(pollChat, 2000);
    pollChat();
}

function _chatNameColor(username) {
    let h = 0;
    for (let i = 0; i < username.length; i++) h = ((h << 5) - h + username.charCodeAt(i)) | 0;
    return `hsl(${Math.abs(h) % 360},70%,65%)`;
}

// ============================================================================
// SOUND FX — Web Audio API (synthesized, no external files)
// ============================================================================
const SFX = (() => {
    let ctx = null;
    let _masterGain  = null;
    let _rollingOsc  = null;
    let _rollingGain = null;
    let _lastCollisionMs = 0;
    let _volumeScale = 0.8;   // 0–1, loaded from player settings

    function _ac() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            _masterGain = ctx.createGain();
            _masterGain.gain.value = _volumeScale;
            _masterGain.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function _dest() { _ac(); return _masterGain; }

    function beep(freq, dur = 0.12, vol = 0.28, type = 'sine', delay = 0) {
        try {
            const ac = _ac();
            const osc = ac.createOscillator();
            const g   = ac.createGain();
            const t   = ac.currentTime + delay;
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(vol, t + 0.005);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            osc.connect(g);
            g.connect(_dest());
            osc.start(t);
            osc.stop(t + dur + 0.02);
        } catch (_) {}
    }

    function noise(dur = 0.07, cutoff = 180, vol = 0.22) {
        try {
            const ac   = _ac();
            const sr   = ac.sampleRate;
            const buf  = ac.createBuffer(1, Math.ceil(sr * dur), sr);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            const src = ac.createBufferSource();
            src.buffer = buf;
            const filt = ac.createBiquadFilter();
            filt.type = 'lowpass';
            filt.frequency.setValueAtTime(cutoff, ac.currentTime);
            const g = ac.createGain();
            g.gain.setValueAtTime(vol, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
            src.connect(filt);
            filt.connect(g);
            g.connect(_dest());
            src.start();
        } catch (_) {}
    }

    return {
        countdownBeep(n) {
            // n = 3, 2, 1 — short beep, pitch rises
            const freq = n === 3 ? 440 : n === 2 ? 523 : 659;
            beep(freq, 0.12, 0.28);
        },
        goBeep() {
            // C major chord burst — GO!
            beep(523, 0.3, 0.3);
            beep(659, 0.3, 0.22, 'sine', 0.02);
            beep(784, 0.3, 0.18, 'sine', 0.04);
        },
        finish(rank) {
            if (rank === 1) {
                // Ascending arpeggio fanfare
                [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 0.28, 'sine', i * 0.08));
            } else if (rank <= 3) {
                beep(659, 0.1, 0.2, 'sine', 0);
            } else {
                beep(440, 0.08, 0.14, 'sine', 0);
            }
        },
        collision() {
            const now = Date.now();
            if (now - _lastCollisionMs < 80) return;
            _lastCollisionMs = now;
            noise(0.07, 220, 0.18);
        },
        recordBroken() {
            // Ascending 5-note jingle
            [523, 659, 784, 1047, 1568].forEach((f, i) => beep(f, 0.15, 0.24, 'sine', i * 0.07));
        },
        boostWhoosh() {
            // Short ascending whoosh — filtered noise + pitch sweep
            try {
                const ac = _ac();
                const sr = ac.sampleRate;
                const dur = 0.18;
                const buf = ac.createBuffer(1, Math.ceil(sr * dur), sr);
                const d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
                const src = ac.createBufferSource();
                src.buffer = buf;
                const filt = ac.createBiquadFilter();
                filt.type = 'bandpass';
                filt.frequency.setValueAtTime(300, ac.currentTime);
                filt.frequency.linearRampToValueAtTime(2400, ac.currentTime + dur);
                filt.Q.value = 2;
                const g = ac.createGain();
                g.gain.setValueAtTime(0.28, ac.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
                src.connect(filt);
                filt.connect(g);
                g.connect(_dest());
                src.start();
            } catch (_) {}
        },
        bongoBoink() {
            // Spring boing: quick chirp + harmonics
            try {
                const ac = _ac();
                const osc1 = ac.createOscillator();
                const osc2 = ac.createOscillator();
                const g = ac.createGain();
                const t = ac.currentTime;
                osc1.type = 'sine';
                osc2.type = 'sine';
                osc1.frequency.setValueAtTime(400, t);
                osc1.frequency.exponentialRampToValueAtTime(120, t + 0.25);
                osc2.frequency.setValueAtTime(800, t);
                osc2.frequency.exponentialRampToValueAtTime(240, t + 0.25);
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(0.3, t + 0.01);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
                osc1.connect(g);
                osc2.connect(g);
                g.connect(_dest());
                osc1.start(t); osc1.stop(t + 0.3);
                osc2.start(t); osc2.stop(t + 0.3);
            } catch (_) {}
        },
        laserZap() {
            // Fast descending sci-fi zap
            try {
                const ac = _ac();
                const osc = ac.createOscillator();
                const g = ac.createGain();
                const t = ac.currentTime;
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(1200, t);
                osc.frequency.exponentialRampToValueAtTime(80, t + 0.2);
                g.gain.setValueAtTime(0.22, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
                osc.connect(g);
                g.connect(_dest());
                osc.start(t);
                osc.stop(t + 0.25);
            } catch (_) {}
        },
        startRolling() {
            if (PERF_MODE || _rollingOsc) return;
            try {
                const ac = _ac();
                _rollingOsc  = ac.createOscillator();
                _rollingGain = ac.createGain();
                _rollingOsc.type = 'sawtooth';
                _rollingOsc.frequency.setValueAtTime(50, ac.currentTime);
                _rollingGain.gain.setValueAtTime(0, ac.currentTime);
                _rollingOsc.connect(_rollingGain);
                _rollingGain.connect(_dest());
                _rollingOsc.start();
            } catch (_) {}
        },
        updateRolling(speed) {
            if (!_rollingOsc || !ctx) return;
            const freq = 40 + Math.min(speed * 18, 140);
            const vol  = Math.min(speed * 0.07, 0.10);
            _rollingOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.15);
            _rollingGain.gain.setTargetAtTime(vol,  ctx.currentTime, 0.15);
        },
        stopRolling() {
            try { if (_rollingOsc) { _rollingOsc.stop(); } } catch (_) {}
            _rollingOsc = null;
            _rollingGain = null;
        },
        setVolume(v) {
            _volumeScale = Math.max(0, Math.min(1, v));
            if (_masterGain) _masterGain.gain.setTargetAtTime(_volumeScale, ctx.currentTime, 0.05);
        },
    };
})();

// ============================================================================
// SKYBOX — gradient sphere (dark bottom → deep-space blue top)
// ============================================================================
function buildSkybox() {
    if (TRANSPARENT) return;
    const geo = new THREE.SphereGeometry(1500, 32, 16);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            topColor:    { value: new THREE.Color(0x0d1128) },
            bottomColor: { value: new THREE.Color(0x050508) },
        },
        vertexShader: `
            varying vec3 vWorldPos;
            void main() {
                vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            varying vec3 vWorldPos;
            void main() {
                float t = clamp((normalize(vWorldPos).y + 0.2) * 1.4, 0.0, 1.0);
                gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
            }
        `,
        side: THREE.BackSide,
        depthWrite: false,
    });
    scene.add(new THREE.Mesh(geo, mat));
}

// ============================================================================
// BOOT
// ============================================================================
init();
