/**
 * Marble Map Editor — CUBSOFTWARE
 * Three.js ES module, browser-based editor for Marbles on Stream .CMapV4 maps
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ===================================================================
// PIECE CATALOG
// type_id values from CMapV4 format research
// ===================================================================
const PIECES = [
    // --- TRACK ---
    { id: 'straight',     label: 'Straight',       cat: 'track',    color: 0x5865f2, icon: '━', type_id: 1000,
      w: 4, d: 16, h: 0.4,
      defaultProps: { length: 1 } },
    { id: 'corner_l',     label: 'Corner Left',    cat: 'track',    color: 0x7c3aed, icon: '↰', type_id: 1002,
      w: 12, d: 12, h: 0.4,
      defaultProps: {} },
    { id: 'corner_r',     label: 'Corner Right',   cat: 'track',    color: 0x7c3aed, icon: '↱', type_id: 1003,
      w: 12, d: 12, h: 0.4,
      defaultProps: {} },
    { id: 'ramp_up',      label: 'Ramp Up',        cat: 'track',    color: 0x2563eb, icon: '↗', type_id: 1010,
      w: 4, d: 12, h: 0.4,
      defaultProps: { angle: 15 } },
    { id: 'ramp_down',    label: 'Ramp Down',      cat: 'track',    color: 0x2563eb, icon: '↘', type_id: 1011,
      w: 4, d: 12, h: 0.4,
      defaultProps: { angle: 15 } },
    { id: 'bank_dl',      label: 'Bank Down-Left', cat: 'track',    color: 0x0f52ba, icon: '↙', type_id: 1012,
      w: 12, d: 12, h: 0.4,
      defaultProps: { angle: 15 } },
    { id: 'bank_dr',      label: 'Bank Down-Right',cat: 'track',    color: 0x0f52ba, icon: '↘', type_id: 1013,
      w: 12, d: 12, h: 0.4,
      defaultProps: { angle: 15 } },
    { id: 'bank_ul',      label: 'Bank Up-Left',   cat: 'track',    color: 0x0f52ba, icon: '↖', type_id: 1014,
      w: 12, d: 12, h: 0.4,
      defaultProps: { angle: 15 } },
    { id: 'bank_ur',      label: 'Bank Up-Right',  cat: 'track',    color: 0x0f52ba, icon: '↗', type_id: 1015,
      w: 12, d: 12, h: 0.4,
      defaultProps: { angle: 15 } },
    { id: 'funnel',          label: 'Funnel',          cat: 'track',    color: 0x0891b2, icon: '▽', type_id: 1020,
      w: 10, d: 10, h: 4,
      defaultProps: {} },
    { id: 'straight_wide',   label: 'Wide Straight',   cat: 'track',    color: 0x3b82f6, icon: '⬛', type_id: 1001,
      w: 8,  d: 16, h: 0.4,
      defaultProps: {} },
    { id: 'straight_narrow', label: 'Narrow Straight', cat: 'track',    color: 0x818cf8, icon: '—', type_id: 1005,
      w: 2,  d: 16, h: 0.4,
      defaultProps: {} },
    { id: 'half_pipe',       label: 'Half-Pipe',       cat: 'track',    color: 0x0ea5e9, icon: '∪', type_id: 1030,
      w: 6,  d: 16, h: 2.5,
      defaultProps: {} },
    { id: 'crossroads',      label: 'Crossroads',      cat: 'track',    color: 0x8b5cf6, icon: '┼', type_id: 1040,
      w: 16, d: 16, h: 0.4,
      defaultProps: {} },
    { id: 'staircase',       label: 'Staircase',       cat: 'track',    color: 0x64748b, icon: '≡', type_id: 1050,
      w: 4,  d: 10, h: 3.0,
      defaultProps: {} },
    { id: 's_curve',         label: 'S-Curve',         cat: 'track',    color: 0xa855f7, icon: '∿', type_id: 1060,
      w: 12, d: 16, h: 0.4,
      defaultProps: {} },
    { id: 'tube_curve_l',    label: 'Tube Curve Left', cat: 'track',    color: 0x475569, icon: '◐', type_id: 1070,
      w: 12, d: 12, h: 4,
      defaultProps: {} },
    { id: 'tube_curve_r',    label: 'Tube Curve Right',cat: 'track',    color: 0x475569, icon: '◑', type_id: 1071,
      w: 12, d: 12, h: 4,
      defaultProps: {} },
    { id: 'vertical_drop',   label: 'Vertical Drop',   cat: 'track',    color: 0xef4444, icon: '↓', type_id: 1110,
      w: 4,  d: 6,  h: 0.4,
      defaultProps: { angle: 65 } },
    { id: 'corkscrew',       label: 'Corkscrew',       cat: 'track',    color: 0xc084fc, icon: '⌘', type_id: 1120,
      w: 12, d: 16, h: 0.4,
      defaultProps: { drop: 4 } },
    { id: 'pinball_lane',    label: 'Pinball Lane',    cat: 'track',    color: 0xfbbf24, icon: '⊕', type_id: 1130,
      w: 6,  d: 16, h: 1,
      defaultProps: {} },
    { id: 'finish_ramp',     label: 'Finish Ramp',     cat: 'track',    color: 0xe11d48, icon: '⬇', type_id: 1140,
      w: 10, d: 12, h: 0.4,
      defaultProps: { angle: 8 } },
    { id: 'bowl',            label: 'Bowl',            cat: 'track',    color: 0x0891b2, icon: '⌣', type_id: 1150,
      w: 8,  d: 8,  h: 4,
      defaultProps: {} },
    { id: 'wall_jump',       label: 'Wall Jump',       cat: 'track',    color: 0xf97316, icon: '⇑', type_id: 1160,
      w: 4,  d: 8,  h: 4,
      defaultProps: {} },
    { id: 'bank_turn_l',     label: 'Bank Turn Left',  cat: 'track',    color: 0x22d3ee, icon: '↰', type_id: 1190,
      w: 12, d: 12, h: 0.4,
      defaultProps: {} },
    { id: 'bank_turn_r',     label: 'Bank Turn Right', cat: 'track',    color: 0x22d3ee, icon: '↱', type_id: 1191,
      w: 12, d: 12, h: 0.4,
      defaultProps: {} },
    { id: 'ramp_spiral',     label: 'Ramp Spiral',     cat: 'track',    color: 0xa78bfa, icon: '🌀', type_id: 1200,
      w: 16, d: 16, h: 0.4,
      defaultProps: { rise: 6 } },
    { id: 'drawbridge',    label: 'Drawbridge',      cat: 'track',    color: 0x78716c, icon: '🌉', type_id: 1210,
      w: 6, d: 12, h: 0.3,
      defaultProps: { delay: 3 } },
    { id: 'catapult',      label: 'Catapult',        cat: 'track',    color: 0xf59e0b, icon: '⬆', type_id: 1220,
      w: 6,  d: 6,  h: 0.4,
      defaultProps: {} },
    { id: 'diving_board',  label: 'Diving Board',    cat: 'track',    color: 0x3b82f6, icon: '⌇', type_id: 1230,
      w: 1.5, d: 10, h: 0.3,
      defaultProps: {} },
    { id: 'split_track',   label: 'Split Track',     cat: 'track',    color: 0x6366f1, icon: 'Y', type_id: 1300,
      w: 12, d: 16, h: 0.4,
      defaultProps: { angle: 30 } },
    { id: 'merge_track',   label: 'Merge Track',     cat: 'track',    color: 0x818cf8, icon: '⑂', type_id: 1301,
      w: 12, d: 16, h: 0.4,
      defaultProps: { angle: 30 } },
    { id: 'start',        label: 'Start',          cat: 'track',    color: 0x16a34a, icon: '▶', type_id: 2500,
      w: 4, d: 6, h: 1,
      defaultProps: { marbles: 32 } },
    { id: 'finish',       label: 'Finish',         cat: 'track',    color: 0xe11d48, icon: '⛳', type_id: 2501,
      w: 4, d: 6, h: 1,
      defaultProps: {} },

    { id: 'pipe',          label: 'Pipe Tunnel',     cat: 'track',    color: 0x475569, icon: '◉', type_id: 1080,
      w: 4,  d: 16, h: 4,
      defaultProps: {} },
    { id: 'loop',          label: 'Loop',            cat: 'track',    color: 0x5865f2, icon: '⊙', type_id: 1090,
      w: 4,  d: 8,  h: 8,
      defaultProps: {} },
    { id: 'bridge',        label: 'Bridge',          cat: 'track',    color: 0x6b7280, icon: '⌒', type_id: 1100,
      w: 4,  d: 16, h: 0.4,
      defaultProps: {} },

    // --- OBSTACLES ---
    { id: 'boost_pad',    label: 'Boost Pad',      cat: 'obstacle', color: 0xf59e0b, icon: '⚡', type_id: 100,
      w: 4, d: 4, h: 0.2,
      defaultProps: { strength: 1.0 } },
    { id: 'bongo_pad',    label: 'Bongo Pad',      cat: 'obstacle', color: 0xef4444, icon: '🥁', type_id: 110,
      w: 4, d: 4, h: 0.4,
      defaultProps: { bounce: 2.0 } },
    { id: 'hammer',       label: 'Hammer',         cat: 'obstacle', color: 0xdc2626, icon: '🔨', type_id: 200,
      w: 2, d: 2, h: 6,
      defaultProps: { speed: 1.0, enabled: true } },
    { id: 'laser',        label: 'Laser',          cat: 'obstacle', color: 0xf43f5e, icon: '🔴', type_id: 210,
      w: 1, d: 8, h: 1,
      defaultProps: { interval: 2.0, enabled: true } },
    { id: 'wind_box',     label: 'Wind Box',       cat: 'obstacle', color: 0x06b6d4, icon: '💨', type_id: 300,
      w: 6, d: 6, h: 6,
      defaultProps: { strength: 1.0, direction: 'up' } },
    { id: 'no_gravity',   label: 'No Gravity Zone',cat: 'obstacle', color: 0x8b5cf6, icon: '🌀', type_id: 310,
      w: 8, d: 8, h: 8,
      defaultProps: {} },

    { id: 'bumper',        label: 'Bumper',          cat: 'obstacle', color: 0xfbbf24, icon: '⭕', type_id: 120,
      w: 2,  d: 2, h: 2,
      defaultProps: {} },
    { id: 'spring',        label: 'Spring',          cat: 'obstacle', color: 0x22c55e, icon: '🌀', type_id: 130,
      w: 4,  d: 4, h: 1,
      defaultProps: { strength: 15 } },
    { id: 'moving_platform', label: 'Moving Platform', cat: 'obstacle', color: 0xf59e0b, icon: '⬜', type_id: 140,
      w: 6, d: 6, h: 0.4,
      defaultProps: { axis: 'x', range: 4, speed: 1.0 } },
    { id: 'teleporter',    label: 'Teleporter',      cat: 'obstacle', color: 0xa855f7, icon: '🔮', type_id: 150,
      w: 3,  d: 3, h: 0.4,
      defaultProps: { pairId: '' } },
    { id: 'checkpoint',    label: 'Checkpoint',      cat: 'obstacle', color: 0x3b82f6, icon: '⚑', type_id: 160,
      w: 6,  d: 1, h: 3,
      defaultProps: {} },
    { id: 'ice_zone',      label: 'Ice Zone',        cat: 'obstacle', color: 0x93c5fd, icon: '❄', type_id: 320,
      w: 6,  d: 6, h: 0.2,
      defaultProps: {} },
    { id: 'mud_zone',      label: 'Mud Zone',        cat: 'obstacle', color: 0x92400e, icon: '🟫', type_id: 330,
      w: 6,  d: 6, h: 0.2,
      defaultProps: {} },
    { id: 'trampoline',    label: 'Trampoline',      cat: 'obstacle', color: 0x4ade80, icon: '🟩', type_id: 340,
      w: 6,  d: 6, h: 0.5,
      defaultProps: {} },
    { id: 'slippery_slope',label: 'Slippery Slope',  cat: 'obstacle', color: 0xbae6fd, icon: '🧊', type_id: 350,
      w: 4,  d: 12, h: 0.3,
      defaultProps: { angle: 15 } },
    { id: 'sticky_pad',    label: 'Sticky Pad',      cat: 'obstacle', color: 0x854d0e, icon: '🟤', type_id: 360,
      w: 4,  d: 4, h: 0.2,
      defaultProps: {} },
    { id: 'ghost_block',   label: 'Ghost Block',     cat: 'obstacle', color: 0xa78bfa, icon: '👻', type_id: 370,
      w: 4,  d: 4, h: 4,
      defaultProps: {} },
    { id: 'speed_limiter', label: 'Speed Limiter',   cat: 'obstacle', color: 0xfbbf24, icon: '🔻', type_id: 380,
      w: 6,  d: 6, h: 4,
      defaultProps: { max_speed: 5 } },
    { id: 'spike_strip',   label: 'Spike Strip',     cat: 'obstacle', color: 0xef4444, icon: '⚠', type_id: 390,
      w: 6,  d: 2, h: 0.3,
      defaultProps: {} },
    { id: 'conveyor_belt', label: 'Conveyor Belt',   cat: 'obstacle', color: 0x0ea5e9, icon: '➡', type_id: 500,
      w: 4,  d: 8, h: 0.4,
      defaultProps: { speed: 1.0, direction: 'forward' } },
    { id: 'gravity_flip',  label: 'Gravity Flip',    cat: 'obstacle', color: 0x8b5cf6, icon: '🔃', type_id: 510,
      w: 8,  d: 8, h: 6,
      defaultProps: { duration: 3 } },
    { id: 'earthquake_pad',label: 'Earthquake Pad',  cat: 'obstacle', color: 0xf97316, icon: '💢', type_id: 520,
      w: 4,  d: 4, h: 0.2,
      defaultProps: {} },
    { id: 'glue_trap',     label: 'Glue Trap',       cat: 'obstacle', color: 0x78350f, icon: '🕷', type_id: 530,
      w: 3,  d: 3, h: 0.2,
      defaultProps: { duration: 1.5 } },
    { id: 'magnet',        label: 'Magnet',          cat: 'obstacle', color: 0xec4899, icon: '🧲', type_id: 540,
      w: 2,  d: 2, h: 3,
      defaultProps: { radius: 8, polarity: 1, strength: 1.0 } },
    { id: 'reverse_pad',   label: 'Reverse Pad',     cat: 'obstacle', color: 0xdc2626, icon: '↩', type_id: 550,
      w: 4,  d: 4, h: 0.2,
      defaultProps: {} },
    { id: 'black_hole',    label: 'Black Hole',      cat: 'obstacle', color: 0x0f0f0f, icon: '⬤', type_id: 560,
      w: 2,  d: 2, h: 2,
      defaultProps: { radius: 10, strength: 2.0 } },
    { id: 'cannon',        label: 'Cannon',          cat: 'obstacle', color: 0x374151, icon: '💥', type_id: 570,
      w: 3,  d: 5, h: 3,
      defaultProps: { strength: 40 } },
    { id: 'shrink_zone',   label: 'Shrink Zone',     cat: 'obstacle', color: 0x6d28d9, icon: '🔽', type_id: 580,
      w: 8,  d: 8, h: 8,
      defaultProps: { scale: 0.3, duration: 5 } },
    { id: 'giant_zone',    label: 'Giant Zone',      cat: 'obstacle', color: 0x0891b2, icon: '🔼', type_id: 590,
      w: 8,  d: 8, h: 8,
      defaultProps: { scale: 2.5, duration: 5 } },
    { id: 'rotating_ring', label: 'Rotating Ring',   cat: 'obstacle', color: 0xf59e0b, icon: '⭕', type_id: 600,
      w: 6,  d: 6, h: 5,
      defaultProps: { speed: 1.0 } },
    { id: 'pendulum',      label: 'Pendulum',        cat: 'obstacle', color: 0x78716c, icon: '🕰', type_id: 610,
      w: 2,  d: 2, h: 8,
      defaultProps: { period: 3.0, reach: 5 } },
    { id: 'pinball_bumper_ring', label: 'Bumper Ring', cat: 'obstacle', color: 0xfbbf24, icon: '⭕', type_id: 620,
      w: 8,  d: 8, h: 2,
      defaultProps: {} },

    // --- SPECIAL ---
    { id: 'destruct_cube',label: 'Destruct. Cube', cat: 'special',  color: 0xf97316, icon: '📦', type_id: 400,
      w: 2, d: 2, h: 2,
      defaultProps: { respawn: false } },
    { id: 'rotating_post',label: 'Rotating Post',  cat: 'special',  color: 0xa855f7, icon: '🔄', type_id: 410,
      w: 1, d: 8, h: 1,
      defaultProps: { speed: 1.0 } },
    { id: 'waypoint',     label: 'Waypoint',       cat: 'special',  color: 0x38bdf8, icon: '◈', type_id: 500,
      w: 4, d: 4, h: 2,
      defaultProps: { order: 1 } },
];

const PIECE_BY_ID = Object.fromEntries(PIECES.map(p => [p.id, p]));

// ===================================================================
// STATE
// ===================================================================
let scene, camera, renderer, controls;
let ghostMesh = null;
let placedObjects = [];        // { id, mesh, pieceId, pos, rot, props }
let selectedObj = null;
let selectedObjects = [];      // multi-select set (includes selectedObj when non-null)
let activeTool = 'place';      // 'select' | 'place' | 'delete'
let activePieceId = 'straight';
let pendingRotation = 0;       // degrees Y, increments of 90
let undoStack = [];
let redoStack = [];
let clipboard  = null;   // copy/paste buffer — stores last copied piece definition
let _nextGroupId = 1;    // counter for generating unique group IDs
const camBookmarks = new Array(5).fill(null);  // Shift+1–5 camera positions
let heightRulerLine = null;   // Three.js Line shown from selected piece to ground
const _keysHeld = new Set();
let placeLayer  = 0;   // current Y placement height (steps of 4 units)

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let snapIncrement = 4; // world units to snap to (0 = free placement, no snap)
const layerStep = 4;     // Y units per layer step

// ===================================================================
// INIT
// ===================================================================
function init() {
    const canvas = document.getElementById('editor-canvas');
    const viewport = document.getElementById('meViewport');

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0a0a12);

    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a12, 0.008);

    // Camera
    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    camera.position.set(0, 60, 80);
    camera.lookAt(0, 0, 0);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.mouseButtons = { RIGHT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, LEFT: null };
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 800;
    controls.maxPolarAngle = Math.PI * 0.48;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(60, 100, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 600;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -200;
    sun.shadow.camera.right = sun.shadow.camera.top = 200;
    scene.add(sun);

    // Grid
    const grid = new THREE.GridHelper(400, 100, 0x1a1a2e, 0x1a1a2e);
    grid.material.transparent = true;
    grid.material.opacity = 0.6;
    scene.add(grid);

    // Origin marker
    const originGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const originMat = new THREE.MeshBasicMaterial({ color: 0x5865f2 });
    scene.add(new THREE.Mesh(originGeo, originMat));

    resize();
    window.addEventListener('resize', resize);
    setupUI();
    setupEvents(viewport);
    buildGhost();
    render();
    startAutoSave();
    _checkLibraryLoad();
}

// ===================================================================
// RESIZE
// ===================================================================
function resize() {
    const viewport = document.getElementById('meViewport');
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}

// ===================================================================
// RENDER LOOP
// ===================================================================
function render() {
    requestAnimationFrame(render);
    if (_keysHeld.size) {
        const panSpd = 0.5;
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        fwd.y = 0;
        if (fwd.lengthSq() > 0) fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
        const delta = new THREE.Vector3();
        if (_keysHeld.has('w')) delta.addScaledVector(fwd,    panSpd);
        if (_keysHeld.has('s')) delta.addScaledVector(fwd,   -panSpd);
        if (_keysHeld.has('a')) delta.addScaledVector(right, -panSpd);
        if (_keysHeld.has('d')) delta.addScaledVector(right,  panSpd);
        if (_keysHeld.has('q')) delta.y += panSpd;
        if (_keysHeld.has('e')) delta.y -= panSpd;
        controls.target.add(delta);
        camera.position.add(delta);
    }
    controls.update();
    renderer.render(scene, camera);
}

// ===================================================================
// GEOMETRY BUILDERS
// ===================================================================
const TUBE_R   = 2;    // track tube radius — matches half track width
const TUBE_EXT = 0.8;  // extend tube past piece boundary on each end to hide junction gaps

function _tubeMat(color) {
    return new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
}

function buildStraightTube(def) {
    const curve = new THREE.LineCurve3(
        new THREE.Vector3(0, 0, -(def.d / 2 + TUBE_EXT)),
        new THREE.Vector3(0, 0,   def.d / 2 + TUBE_EXT)
    );
    const geo = new THREE.TubeGeometry(curve, 2, TUBE_R, 8, false);
    const mesh = new THREE.Mesh(geo, _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

function buildCornerTube(def, leftTurn) {
    const sign = leftTurn ? 1 : -1;
    const arcR = 8;
    const pts = [];
    // Extend slightly past the 0–90° arc to overlap adjacent straight pieces
    const startT = -TUBE_EXT / arcR;
    const endT   = Math.PI / 2 + TUBE_EXT / arcR;
    for (let i = 0; i <= 24; i++) {
        const t = startT + (i / 24) * (endT - startT);
        pts.push(new THREE.Vector3(sign * arcR * (1 - Math.cos(t)), 0, arcR * Math.sin(t)));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, TUBE_R, 8, false);
    const mesh = new THREE.Mesh(geo, _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

function buildRampTube(def, isUp) {
    const d = def.d;
    const rise  = d * Math.tan(THREE.MathUtils.degToRad(def.defaultProps?.angle || 15));
    const yF    = isUp ? 0    : rise;
    const yB    = isUp ? rise : 0;
    const slope = (yB - yF) / d;  // Δy per Δz along the centerline
    const curve = new THREE.LineCurve3(
        new THREE.Vector3(0, yF - TUBE_EXT * slope, -(d / 2 + TUBE_EXT)),
        new THREE.Vector3(0, yB + TUBE_EXT * slope,   d / 2 + TUBE_EXT)
    );
    const geo = new THREE.TubeGeometry(curve, 2, TUBE_R, 8, false);
    const mesh = new THREE.Mesh(geo, _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

function buildBankedCornerTube(def, leftTurn, goingUp) {
    const sign = leftTurn ? 1 : -1;
    const arcR = 8;
    const rise = arcR * (Math.PI / 2) * Math.tan(THREE.MathUtils.degToRad(def.defaultProps?.angle || 15));
    const pts = [];
    const startT = -TUBE_EXT / arcR;
    const endT   = Math.PI / 2 + TUBE_EXT / arcR;
    for (let i = 0; i <= 24; i++) {
        const t = startT + (i / 24) * (endT - startT);
        const frac = (t - startT) / (endT - startT);
        const y = goingUp ? rise * frac : rise * (1 - frac);
        pts.push(new THREE.Vector3(sign * arcR * (1 - Math.cos(t)), y, arcR * Math.sin(t)));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, TUBE_R, 8, false);
    const mesh = new THREE.Mesh(geo, _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

// ── New track pieces ────────────────────────────────────────────────────────

// Flat platform with side walls — used for wide/narrow straights
function buildPlatformMesh(def, trackW, wallH = 0.8) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(trackW, 0.4, def.d), mat));
    const lw = new THREE.Mesh(new THREE.BoxGeometry(0.25, wallH, def.d), mat);
    lw.position.set(-(trackW / 2 + 0.125), wallH / 2, 0);
    group.add(lw);
    const rw = new THREE.Mesh(new THREE.BoxGeometry(0.25, wallH, def.d), mat);
    rw.position.set(trackW / 2 + 0.125, wallH / 2, 0);
    group.add(rw);
    return group;
}

// U-trough (half-pipe): wide flat floor + two tall walls, open top
function buildHalfPipeMesh(def) {
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
    return group;
}

// Two perpendicular straights crossing in the centre
function buildCrossroadsMesh(def) {
    const group = new THREE.Group();
    const m1    = buildStraightTube({ ...def, d: def.w });  // along Z
    group.add(m1);
    const m2    = buildStraightTube({ ...def, d: def.w });  // along X
    m2.rotation.y = Math.PI / 2;
    group.add(m2);
    return group;
}

// 5-step descending staircase
function buildStaircaseMesh(def) {
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
    return group;
}

// S-shaped curve — entry and exit both face +Z, bulges sideways by ~4 units
function buildSCurveMesh(def) {
    const d = def.d;
    const bulge = 4;
    const pts = [];
    for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        pts.push(new THREE.Vector3(bulge * Math.sin(Math.PI * t), 0, -d / 2 + t * d));
    }
    const geo  = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, TUBE_R, 8, false);
    const mesh = new THREE.Mesh(geo, _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

// Enclosed pipe section that turns 90° left or right
function buildTubeCurveMesh(def, leftTurn) {
    const sign = leftTurn ? 1 : -1;
    const arcR = 8;
    const pts  = [];
    for (let i = 0; i <= 20; i++) {
        const t = (i / 20) * (Math.PI / 2);
        pts.push(new THREE.Vector3(sign * arcR * (1 - Math.cos(t)), 0, arcR * Math.sin(t)));
    }
    // Use a slightly larger tube radius to look like an enclosed pipe
    const pipeR = TUBE_R * 1.1;
    const geo   = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, pipeR, 10, false);
    const mesh  = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        color: def.color, side: THREE.BackSide, transparent: true, opacity: 0.9 }));
    mesh.castShadow = true;
    // Add a darker outer shell to make it look enclosed
    const outer = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        color: def.color, transparent: true, opacity: 0.4, side: THREE.FrontSide }));
    const group = new THREE.Group();
    group.add(mesh);
    group.add(outer);
    return group;
}

// Vertical drop — reuses ramp builder with steep angle from defaultProps
function buildVerticalDropMesh(def) { return buildRampTube(def, false); }

// Corkscrew — full-turn helix descending in Y as it advances in Z
// Path: x = -R*(1-cos t), y = -drop*(t/2π), z = -d/2 + t*d/(2π)
function buildCorkscrewMesh(def) {
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
    const geo  = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, TUBE_R, 8, false);
    const mesh = new THREE.Mesh(geo, _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

// Pinball Lane — straight track + 4 bumper pairs along each side
function buildPinballLaneMesh(def) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    // Floor
    group.add(new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.4, def.d), mat));
    // Side walls
    const wallH = 0.8;
    ['l', 'r'].forEach(side => {
        const wx = (def.w / 2 + 0.125) * (side === 'l' ? -1 : 1);
        const wm = new THREE.Mesh(new THREE.BoxGeometry(0.25, wallH, def.d), mat);
        wm.position.set(wx, wallH / 2, 0);
        group.add(wm);
    });
    // 4 bumper pairs — alternate sides
    const bumperMat = new THREE.MeshLambertMaterial({ color: 0xfbbf24 });
    const bumpR = 0.5;
    const spacing = def.d / 5;
    for (let i = 0; i < 4; i++) {
        const bz = -def.d / 2 + spacing * (i + 1);
        const bx = (i % 2 === 0 ? 1 : -1) * (def.w / 2 - 1.2);
        const bm = new THREE.Mesh(new THREE.SphereGeometry(bumpR, 8, 8), bumperMat);
        bm.position.set(bx, bumpR, bz);
        group.add(bm);
        // Partner bumper on other side
        const bm2 = new THREE.Mesh(new THREE.SphereGeometry(bumpR, 8, 8), bumperMat);
        bm2.position.set(-bx, bumpR, bz);
        group.add(bm2);
    }
    return group;
}

// Finish Ramp — wide funnel ramp; converging walls guide marbles to centre
function buildFinishRampMesh(def) {
    const d     = def.d;
    const angle = def.defaultProps?.angle ?? 8;
    const rise  = d * Math.tan(THREE.MathUtils.degToRad(angle));
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    // Floor — wide, tilted ramp
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.4, d), mat);
    ramp.rotation.x = THREE.MathUtils.degToRad(-angle);
    ramp.position.set(0, -rise / 2, 0);
    group.add(ramp);
    // Converging side walls (trapezoidal — tall at entry, shorter at exit)
    const wallH = 1.2;
    [-1, 1].forEach(sign => {
        const wallGeo = new THREE.BoxGeometry(0.3, wallH, d);
        const wm = new THREE.Mesh(wallGeo, mat);
        wm.position.set(sign * (def.w / 2 + 0.15), wallH / 2 - rise / 2, 0);
        wm.rotation.x = THREE.MathUtils.degToRad(-angle);
        group.add(wm);
    });
    return group;
}

// Bowl — smooth parabolic concave dish using LatheGeometry (surface of revolution)
function buildBowlMesh(def) {
    const mat   = _tubeMat(def.color);
    const R     = def.w / 2;   // outer rim radius = 4
    const dep   = 3.5;         // bowl depth
    const wallT = 0.4;         // wall thickness
    const N     = 20;          // profile resolution
    const segs  = 36;          // lathe segments
    const pts   = [];

    // Inner parabolic surface: bottom-center (0,-dep) → rim (R, 0)
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        pts.push(new THREE.Vector2(R * t,         dep * (t * t - 1)));
    }
    // Outer surface: rim-outer (R+wallT, 0) → outer-bottom (wallT,-dep)
    for (let i = N; i >= 0; i--) {
        const t = i / N;
        pts.push(new THREE.Vector2(R * t + wallT, dep * (t * t - 1)));
    }
    // Close the bottom strip back to center
    pts.push(new THREE.Vector2(0, -dep));

    const geo = new THREE.LatheGeometry(pts, segs);
    return new THREE.Mesh(geo, mat);
}

// Wall Jump — two tall parallel walls forming a tight vertical channel
function buildWallJumpMesh(def) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    const gap   = 1.8;   // gap between walls
    const wallW = 0.5;
    const wallH = def.h; // 4
    [-1, 1].forEach(sign => {
        const wm = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, def.d), mat);
        wm.position.set(sign * (gap / 2 + wallW / 2), wallH / 2, 0);
        group.add(wm);
    });
    // Small floor strip in the gap
    const floor = new THREE.Mesh(new THREE.BoxGeometry(gap, 0.3, def.d), mat);
    group.add(floor);
    return group;
}

// Drawbridge — flat bridge shown in open (flat) state; posts at hinge end
function buildDrawbridgeMesh(def) {
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

// Catapult — flat platform with four spring cylinders underneath
function buildCatapultMesh(def) {
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

// Diving Board — long narrow beam anchored by a post at the entry end
function buildDivingBoardMesh(def) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.3, def.d), mat));
    const postMat = new THREE.MeshLambertMaterial({ color: def.color });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.5), postMat);
    post.position.set(0, -0.75, -def.d / 2);
    group.add(post);
    return group;
}

// Banked corner — arc track with floor tilted inward ~20° so marbles hug the curve
function buildBankedTurnMesh(def, leftTurn) {
    const sign  = leftTurn ? 1 : -1;
    const R     = 8, bankDeg = 20, segs = 12;
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    for (let i = 0; i < segs; i++) {
        const t0 = (i / segs) * Math.PI / 2;
        const t1 = ((i + 1) / segs) * Math.PI / 2;
        const tm = (t0 + t1) * 0.5;
        const cx  = sign * R * (1 - Math.cos(tm));
        const cz  = R * Math.sin(tm);
        const len = R * (t1 - t0) + 0.1;
        const floor = new THREE.Mesh(new THREE.BoxGeometry(4, 0.35, len), mat);
        floor.position.set(cx, 0, cz);
        floor.rotation.order = 'YZX';
        floor.rotation.y = -sign * tm;
        floor.rotation.z = sign * THREE.MathUtils.degToRad(bankDeg);
        group.add(floor);
        // Outer guardrail
        const outerR = R + 2.5;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, len), mat);
        wall.position.set(sign * outerR * (1 - Math.cos(tm)), 0.7, outerR * Math.sin(tm));
        wall.rotation.y = -sign * tm;
        group.add(wall);
    }
    return group;
}

// Ramp Spiral — ascending helix; marble spirals upward one full turn
// Path: x = -R*(1-cos t), y = +rise*(t/2π), z = -d/2 + t*d/(2π)
function buildRampSpiralMesh(def) {
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
    const geo  = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, TUBE_R, 8, false);
    const mesh = new THREE.Mesh(geo, _tubeMat(def.color));
    mesh.castShadow = true;
    return mesh;
}

// Funnel — wide top opening tapering to a narrow bottom exit (four trapezoidal walls)
function buildFunnelMesh(def) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    const wT = def.w, dT = def.d, h = def.h;
    const wB = 3.0, dB = 3.0;   // narrow bottom opening
    const yT = h / 2, yB = -h / 2;

    function addQuad(a, b, c, d) {
        const pos = new Float32Array([
            ...a, ...b, ...c,
            ...a, ...c, ...d,
        ]);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        group.add(new THREE.Mesh(geo, mat));
    }

    // Four sloped walls: front, back, left, right
    addQuad([-wT/2,yT,-dT/2], [ wT/2,yT,-dT/2], [ wB/2,yB,-dB/2], [-wB/2,yB,-dB/2]);
    addQuad([ wT/2,yT, dT/2], [-wT/2,yT, dT/2], [-wB/2,yB, dB/2], [ wB/2,yB, dB/2]);
    addQuad([-wT/2,yT, dT/2], [-wT/2,yT,-dT/2], [-wB/2,yB,-dB/2], [-wB/2,yB, dB/2]);
    addQuad([ wT/2,yT,-dT/2], [ wT/2,yT, dT/2], [ wB/2,yB, dB/2], [ wB/2,yB,-dB/2]);

    // Rim frame at top opening
    const rimT = 0.25, rimH = 0.3;
    [[-dT/2], [dT/2]].forEach(([rz]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(wT, rimH, rimT), mat);
        m.position.set(0, yT + rimH / 2, rz);
        group.add(m);
    });
    [[-wT/2], [wT/2]].forEach(([rx]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(rimT, rimH, dT), mat);
        m.position.set(rx, yT + rimH / 2, 0);
        group.add(m);
    });

    return group;
}

// Split Track — entry from -Z, splits into left and right exits at ~30°
function buildSplitTrackMesh(def) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    const ang   = (def.defaultProps?.angle ?? 30) * Math.PI / 180;
    const forkLen = 8;
    const wallH = 0.6, wallT = 0.22;

    // Entry straight (first half of piece, -z to 0)
    const entry = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 8), mat);
    entry.position.set(0, 0, -4);
    group.add(entry);

    // Left fork floor (starts at origin, angles to left)
    const lFork = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, forkLen), mat);
    lFork.rotation.y = ang;
    lFork.position.set(-Math.sin(ang) * forkLen / 2, 0, Math.cos(ang) * forkLen / 2);
    group.add(lFork);

    // Right fork floor
    const rFork = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, forkLen), mat);
    rFork.rotation.y = -ang;
    rFork.position.set(Math.sin(ang) * forkLen / 2, 0, Math.cos(ang) * forkLen / 2);
    group.add(rFork);

    // Entry outer walls
    [-1, 1].forEach(sign => {
        const w = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 8), mat);
        w.position.set(sign * 1.65, wallH / 2, -4);
        group.add(w);
    });

    // Left fork outer wall (left side)
    const lwL = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, forkLen), mat);
    lwL.rotation.y = ang;
    lwL.position.set(
        -Math.sin(ang) * forkLen / 2 - Math.cos(ang) * 1.65,
        wallH / 2,
        Math.cos(ang) * forkLen / 2 + Math.sin(ang) * 1.65
    );
    group.add(lwL);

    // Right fork outer wall (right side)
    const rwR = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, forkLen), mat);
    rwR.rotation.y = -ang;
    rwR.position.set(
        Math.sin(ang) * forkLen / 2 + Math.cos(ang) * 1.65,
        wallH / 2,
        Math.cos(ang) * forkLen / 2 + Math.sin(ang) * 1.65
    );
    group.add(rwR);

    // Central divider wedge at the split point
    const div = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, 2.5), mat);
    div.position.set(0, wallH / 2, 1);
    group.add(div);

    return group;
}

// Merge Track — two entries at ~30° angle converge into single exit at +Z
function buildMergeTrackMesh(def) {
    const group = new THREE.Group();
    const mat   = _tubeMat(def.color);
    const ang   = (def.defaultProps?.angle ?? 30) * Math.PI / 180;
    const forkLen = 8;
    const wallH = 0.6, wallT = 0.22;

    // Exit straight (second half, 0 to +z)
    const exit = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 8), mat);
    exit.position.set(0, 0, 4);
    group.add(exit);

    // Left entry (comes in from -Z left side)
    const lEntry = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, forkLen), mat);
    lEntry.rotation.y = ang;
    lEntry.position.set(-Math.sin(ang) * forkLen / 2, 0, -Math.cos(ang) * forkLen / 2);
    group.add(lEntry);

    // Right entry
    const rEntry = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, forkLen), mat);
    rEntry.rotation.y = -ang;
    rEntry.position.set(Math.sin(ang) * forkLen / 2, 0, -Math.cos(ang) * forkLen / 2);
    group.add(rEntry);

    // Exit outer walls
    [-1, 1].forEach(sign => {
        const w = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 8), mat);
        w.position.set(sign * 1.65, wallH / 2, 4);
        group.add(w);
    });

    // Left entry outer wall
    const lwL = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, forkLen), mat);
    lwL.rotation.y = ang;
    lwL.position.set(
        -Math.sin(ang) * forkLen / 2 - Math.cos(ang) * 1.65,
        wallH / 2,
        -Math.cos(ang) * forkLen / 2 + Math.sin(ang) * 1.65
    );
    group.add(lwL);

    // Right entry outer wall
    const rwR = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, forkLen), mat);
    rwR.rotation.y = -ang;
    rwR.position.set(
        Math.sin(ang) * forkLen / 2 + Math.cos(ang) * 1.65,
        wallH / 2,
        -Math.cos(ang) * forkLen / 2 + Math.sin(ang) * 1.65
    );
    group.add(rwR);

    // Central merge wedge
    const div = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, 2.5), mat);
    div.position.set(0, wallH / 2, -1);
    group.add(div);

    return group;
}

function buildBlackHoleMesh(def) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 12, 12),
        new THREE.MeshLambertMaterial({ color: 0x1a0030 })
    ));
    group.add(new THREE.Mesh(
        new THREE.TorusGeometry(1.8, 0.25, 8, 24),
        new THREE.MeshLambertMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.7 })
    ));
    return group;
}

function buildCannonMesh(def) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: def.color });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 4.5, 12), mat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 1.2, 0);
    group.add(barrel);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.0, 2.5), mat));
    return group;
}

function buildRotatingRingMesh(def) {
    return new THREE.Mesh(
        new THREE.TorusGeometry(2.5, 0.4, 8, 24),
        new THREE.MeshLambertMaterial({ color: def.color })
    );
}

function buildPendulumMesh(def) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: def.color });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2, 8), mat);
    post.position.y = 6;
    group.add(post);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 6), mat);
    chain.position.y = 4;
    group.add(chain);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 10),
        new THREE.MeshLambertMaterial({ color: 0xd1d5db }));
    ball.position.y = 1.5;
    group.add(ball);
    return group;
}

function buildBumperRingMesh(def) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: def.color });
    const R = 3, count = 6;
    for (let i = 0; i < count; i++) {
        const t = (i / count) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 10), mat);
        b.position.set(R * Math.sin(t), 0.6, R * Math.cos(t));
        group.add(b);
    }
    return group;
}

// Start / Finish are invisible trigger zones — shown as wireframe in editor
// Waypoint — translucent floating diamond frame visible only in editor
function buildWaypointMesh(def) {
    const geo = new THREE.OctahedronGeometry(1.2, 0);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geo,
        new THREE.MeshLambertMaterial({ color: def.color, transparent: true, opacity: 0.18 })));
    group.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: def.color })));
    return group;
}

function buildTriggerZone(def) {
    const geo = new THREE.BoxGeometry(def.w, def.h * 8, def.d);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geo,
        new THREE.MeshLambertMaterial({ color: def.color, transparent: true, opacity: 0.10 })));
    group.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: def.color })));
    return group;
}

function buildObstacleGeometry(def) {
    const geo = new THREE.BoxGeometry(def.w, def.h, def.d);
    const mat = new THREE.MeshLambertMaterial({ color: def.color, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function buildSpecialGeometry(def) {
    if (def.id === 'no_gravity' || def.id === 'wind_box') {
        const geo = new THREE.BoxGeometry(def.w, def.h, def.d);
        const group = new THREE.Group();
        group.add(new THREE.Mesh(geo,
            new THREE.MeshLambertMaterial({ color: def.color, transparent: true, opacity: 0.25 })));
        group.add(new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: def.color })));
        return group;
    }
    const geo = new THREE.BoxGeometry(def.w, def.h, def.d);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: def.color }));
    mesh.castShadow = true;
    return mesh;
}

function buildMeshForPiece(def) {
    if (def.id === 'straight')  return buildStraightTube(def);
    if (def.id === 'corner_l')  return buildCornerTube(def, true);
    if (def.id === 'corner_r')  return buildCornerTube(def, false);
    if (def.id === 'ramp_up')   return buildRampTube(def, true);
    if (def.id === 'ramp_down') return buildRampTube(def, false);
    if (def.id === 'bank_dl')   return buildBankedCornerTube(def, true,  false);
    if (def.id === 'bank_dr')   return buildBankedCornerTube(def, false, false);
    if (def.id === 'bank_ul')          return buildBankedCornerTube(def, true,  true);
    if (def.id === 'bank_ur')          return buildBankedCornerTube(def, false, true);
    if (def.id === 'funnel')           return buildFunnelMesh(def);
    if (def.id === 'straight_wide')    return buildPlatformMesh(def, 8, 0.8);
    if (def.id === 'straight_narrow')  return buildPlatformMesh(def, 2, 1.2);
    if (def.id === 'half_pipe')        return buildHalfPipeMesh(def);
    if (def.id === 'crossroads')       return buildCrossroadsMesh(def);
    if (def.id === 'staircase')        return buildStaircaseMesh(def);
    if (def.id === 's_curve')          return buildSCurveMesh(def);
    if (def.id === 'tube_curve_l')     return buildTubeCurveMesh(def, true);
    if (def.id === 'tube_curve_r')     return buildTubeCurveMesh(def, false);
    if (def.id === 'vertical_drop')    return buildVerticalDropMesh(def);
    if (def.id === 'corkscrew')        return buildCorkscrewMesh(def);
    if (def.id === 'pinball_lane')     return buildPinballLaneMesh(def);
    if (def.id === 'finish_ramp')      return buildFinishRampMesh(def);
    if (def.id === 'bowl')             return buildBowlMesh(def);
    if (def.id === 'wall_jump')        return buildWallJumpMesh(def);
    if (def.id === 'bank_turn_l')      return buildBankedTurnMesh(def, true);
    if (def.id === 'bank_turn_r')      return buildBankedTurnMesh(def, false);
    if (def.id === 'ramp_spiral')      return buildRampSpiralMesh(def);
    if (def.id === 'split_track')      return buildSplitTrackMesh(def);
    if (def.id === 'merge_track')      return buildMergeTrackMesh(def);
    if (def.id === 'drawbridge')       return buildDrawbridgeMesh(def);
    if (def.id === 'catapult')         return buildCatapultMesh(def);
    if (def.id === 'diving_board')     return buildDivingBoardMesh(def);
    if (def.id === 'pipe') {
        // Hollow tube — open circle cross-section along Z
        const pts = [new THREE.Vector3(0, 0, -def.d / 2), new THREE.Vector3(0, 0, def.d / 2)];
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 2, 2.2, 10, false);
        const g = new THREE.Group();
        g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: def.color, side: THREE.BackSide, opacity: 0.9, transparent: true })));
        g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: def.color, opacity: 0.3, transparent: true })));
        return g;
    }
    if (def.id === 'loop') {
        // Loop-de-loop: nearly-full vertical circle with open gap at bottom for entry/exit
        const group  = new THREE.Group();
        const mat    = _tubeMat(def.color);
        const R      = 3.5;   // loop radius
        const rT     = 0.9;   // tube radius
        const gap    = 0.35;  // gap half-angle in radians (opening at bottom)
        const legLen = 5;     // length of approach/exit legs

        // Main arc — from gap to 2π-gap (open at bottom, t=0)
        const arcPts = [];
        const arcN   = 48;
        for (let i = 0; i <= arcN; i++) {
            const t = gap + (i / arcN) * (Math.PI * 2 - gap * 2);
            arcPts.push(new THREE.Vector3(0, -Math.cos(t) * R, Math.sin(t) * R));
        }
        group.add(new THREE.Mesh(
            new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPts, false), arcN, rT, 8, false),
            mat
        ));

        // Entry leg: leads tangentially into arc start (at t=gap, +Z side)
        const tA  = gap;
        const pA  = new THREE.Vector3(0, -Math.cos(tA) * R, Math.sin(tA) * R);
        const tgA = new THREE.Vector3(0, Math.sin(tA), Math.cos(tA));
        group.add(new THREE.Mesh(
            new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
                pA.clone().sub(tgA.clone().multiplyScalar(legLen)), pA
            ]), 6, rT, 8, false), mat
        ));

        // Exit leg: continues tangentially from arc end (at t=2π-gap, -Z side)
        const tB  = Math.PI * 2 - gap;
        const pB  = new THREE.Vector3(0, -Math.cos(tB) * R, Math.sin(tB) * R);
        const tgB = new THREE.Vector3(0, Math.sin(tB), Math.cos(tB));
        group.add(new THREE.Mesh(
            new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
                pB, pB.clone().add(tgB.clone().multiplyScalar(legLen))
            ]), 6, rT, 8, false), mat
        ));

        return group;
    }
    if (def.id === 'bridge') {
        // Sagging bridge — 3 angled segments
        const group = new THREE.Group();
        const mat   = _tubeMat(def.color);
        const segs = [{ z: -5.3, a: -5 }, { z: 0, a: 0 }, { z: 5.3, a: 5 }];
        segs.forEach(({ z, a }) => {
            const s = new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.3, 3), mat);
            s.position.set(0, 0, z);
            s.rotation.x = THREE.MathUtils.degToRad(a);
            group.add(s);
        });
        return group;
    }
    if (def.id === 'start' || def.id === 'finish') return buildTriggerZone(def);
    if (def.id === 'waypoint') return buildWaypointMesh(def);

    if (def.id === 'black_hole')         return buildBlackHoleMesh(def);
    if (def.id === 'cannon')             return buildCannonMesh(def);
    if (def.id === 'rotating_ring')      return buildRotatingRingMesh(def);
    if (def.id === 'pendulum')           return buildPendulumMesh(def);
    if (def.id === 'pinball_bumper_ring')return buildBumperRingMesh(def);

    // Zone-type obstacles — transparent box + wireframe edge
    if (def.id === 'ghost_block' || def.id === 'speed_limiter' || def.id === 'gravity_flip' ||
        def.id === 'shrink_zone' || def.id === 'giant_zone') {
        return buildSpecialGeometry({ ...def, id: 'no_gravity' }); // reuse zone style
    }

    // Spike strip — flat box with spike indicators
    if (def.id === 'spike_strip') {
        const group = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: def.color });
        group.add(new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.15, def.d), mat));
        const spikeMat = new THREE.MeshLambertMaterial({ color: 0xfca5a5 });
        for (let i = -2; i <= 2; i++) {
            const s = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 4), spikeMat);
            s.position.set(i * 1.1, 0.45, 0);
            group.add(s);
        }
        return group;
    }

    // Trampoline — flat pad with spring coil hints
    if (def.id === 'trampoline') {
        const group = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: def.color });
        group.add(new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.3, def.d), mat));
        const coilMat = new THREE.MeshLambertMaterial({ color: 0xd1fae5 });
        for (const [cx, cz] of [[-2.5,-2.5],[-2.5,2.5],[2.5,-2.5],[2.5,2.5]]) {
            const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 6), coilMat);
            c.position.set(cx, -0.2, cz);
            group.add(c);
        }
        return group;
    }

    // Magnet — post + horseshoe
    if (def.id === 'magnet') {
        const group = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: def.color });
        group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8), mat));
        const armMat = new THREE.MeshLambertMaterial({ color: 0xf9a8d4 });
        const aL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), armMat);
        aL.position.set(-0.8, 1.35, 0);
        const aR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), armMat);
        aR.position.set( 0.8, 1.35, 0);
        const cb = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.3), armMat);
        cb.position.y = 1.95;
        group.add(aL, aR, cb);
        return group;
    }

    if (def.cat === 'obstacle') return buildObstacleGeometry(def);
    return buildSpecialGeometry(def);
}

function darken(hex, factor) {
    const r = ((hex >> 16) & 0xff) * factor;
    const g = ((hex >> 8)  & 0xff) * factor;
    const b =  (hex        & 0xff) * factor;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

// ===================================================================
// ENDPOINT SNAP — snaps piece entry/exit to nearest placed endpoint
// ===================================================================
const ENDPOINT_SNAP_DIST = 10;

function _pieceLocalEndpoints(pieceId) {
    const def = PIECE_BY_ID[pieceId];
    if (!def) return [];
    const isCornerL = (pieceId === 'corner_l' || pieceId === 'bank_dl' || pieceId === 'bank_ul' || pieceId === 'tube_curve_l' || pieceId === 'bank_turn_l');
    const isCornerR = (pieceId === 'corner_r' || pieceId === 'bank_dr' || pieceId === 'bank_ur' || pieceId === 'tube_curve_r' || pieceId === 'bank_turn_r');
    if (isCornerL) return [{ x: 0, z: 0, dy: 0 }, { x: 8, z: 8, dy: 0 }];
    if (isCornerR) return [{ x: 0, z: 0, dy: 0 }, { x: -8, z: 8, dy: 0 }];
    const rise = def.d * Math.tan(THREE.MathUtils.degToRad(def.defaultProps?.angle || 15));
    if (pieceId === 'ramp_up')       return [{ x: 0, z: -def.d / 2, dy: 0 }, { x: 0, z: def.d / 2, dy: rise }];
    if (pieceId === 'ramp_down')     return [{ x: 0, z: -def.d / 2, dy: rise }, { x: 0, z: def.d / 2, dy: 0 }];
    if (pieceId === 'vertical_drop') return [{ x: 0, z: -def.d / 2, dy: rise }, { x: 0, z: def.d / 2, dy: 0 }];
    if (pieceId === 'staircase')     return [{ x: 0, z: -def.d / 2, dy: 0 }, { x: 0, z: def.d / 2, dy: -2.75 }];
    if (pieceId === 'corkscrew')     { const drop = def.defaultProps?.drop ?? 4; return [{ x: 0, z: -def.d / 2, dy: 0 }, { x: 0, z: def.d / 2, dy: -drop }]; }
    if (pieceId === 'finish_ramp')   return [{ x: 0, z: -def.d / 2, dy: rise }, { x: 0, z: def.d / 2, dy: 0 }];
    if (pieceId === 'ramp_spiral')   { const r2 = def.defaultProps?.rise ?? 6; return [{ x: 0, z: -def.d / 2, dy: 0 }, { x: 0, z: def.d / 2, dy: r2 }]; }
    return [{ x: 0, z: -def.d / 2, dy: 0 }, { x: 0, z: def.d / 2, dy: 0 }];
}

// Three.js Y-rotation: x' = lx*cos + lz*sin, z' = -lx*sin + lz*cos
function _rotXZ(lx, lz, angleDeg) {
    const r = THREE.MathUtils.degToRad(angleDeg);
    const c = Math.cos(r), s = Math.sin(r);
    return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

function _worldEndpoints(obj) {
    const local = _pieceLocalEndpoints(obj.pieceId);
    return local.map(ep => {
        const d = _rotXZ(ep.x, ep.z, obj.rot);
        return { x: obj.pos.x + d.x, z: obj.pos.z + d.z, y: obj.pos.y + ep.dy };
    });
}

function _snapToEndpoint(ghostCx, ghostCz) {
    const newLocal = _pieceLocalEndpoints(activePieceId);
    if (!newLocal.length) return null;

    let best = null, bestDist = ENDPOINT_SNAP_DIST;
    for (const obj of placedObjects) {
        for (const wep of _worldEndpoints(obj)) {
            for (const lep of newLocal) {
                const wd = _rotXZ(lep.x, lep.z, pendingRotation);
                const wepX = ghostCx + wd.x;
                const wepZ = ghostCz + wd.z;
                const dist = Math.hypot(wep.x - wepX, wep.z - wepZ);
                if (dist < bestDist) {
                    bestDist = dist;
                    // wep.y is the world height at the existing endpoint
                    // lep.dy is the height offset of the new piece's matching endpoint
                    // so the new piece's base Y = wep.y - lep.dy
                    best = { x: ghostCx + (wep.x - wepX), z: ghostCz + (wep.z - wepZ), y: wep.y - lep.dy };
                }
            }
        }
    }
    return best;
}

// ===================================================================
// GHOST MESH (preview while placing)
// ===================================================================
function buildGhost() {
    if (ghostMesh) { scene.remove(ghostMesh); ghostMesh = null; }
    if (activeTool !== 'place') return;

    const def = PIECE_BY_ID[activePieceId];
    if (!def) return;

    ghostMesh = buildMeshForPiece(def);
    setGhostOpacity(ghostMesh, 0.45);
    ghostMesh.rotation.y = THREE.MathUtils.degToRad(pendingRotation);
    scene.add(ghostMesh);
}

function setGhostOpacity(obj, alpha) {
    obj.traverse(child => {
        if (child.isMesh) {
            child.material = child.material.clone();
            child.material.transparent = true;
            child.material.opacity = alpha;
        }
    });
}

// ===================================================================
// SNAP
// ===================================================================
function snap(v) {
    if (!snapIncrement) return v;
    return Math.round(v / snapIncrement) * snapIncrement;
}

// Snap so that the piece's edge (not center) aligns with a grid line.
// halfSize = def.w/2 or def.d/2
function snapEdge(v, halfSize) {
    if (!snapIncrement) return v;
    return Math.round((v - halfSize) / snapIncrement) * snapIncrement + halfSize;
}

function setLayer(delta) {
    placeLayer = Math.max(0, Math.min(placeLayer + delta, 200));
    groundPlane.constant = -placeLayer;
    updateStatusBar();
    toast(`Layer Y: ${placeLayer}`);
}

function getGroundPoint(event, viewport) {
    groundPlane.constant = -placeLayer;
    const rect = viewport.getBoundingClientRect();
    mouse.x =  ((event.clientX - rect.left)  / rect.width)  * 2 - 1;
    mouse.y = -((event.clientY - rect.top)   / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, target);
    return target;
}

// ===================================================================
// PLACE / SELECT / DELETE
// ===================================================================
function placePiece(worldPos) {
    const def = PIECE_BY_ID[activePieceId];
    if (!def) return;

    let sx = snapEdge(worldPos.x, def.w / 2);
    let sz = snapEdge(worldPos.z, def.d / 2);
    let sy = placeLayer;
    const epSnap = _snapToEndpoint(sx, sz);
    if (epSnap) { sx = epSnap.x; sz = epSnap.z; sy = epSnap.y; }
    const pos = { x: sx, y: sy, z: sz };
    const rot = pendingRotation;

    const mesh = buildMeshForPiece(def);
    mesh.position.set(pos.x, pos.y + def.h / 2, pos.z);
    mesh.rotation.y = THREE.MathUtils.degToRad(rot);
    scene.add(mesh);

    const obj = {
        id: genId(),
        mesh,
        pieceId: activePieceId,
        pos,
        rot,
        locked: false,
        note: '',
        group: '',
        props: { ...def.defaultProps }
    };
    placedObjects.push(obj);

    pushUndo({ type: 'add', obj });
    redoStack = [];

    updateStatusBar();
    return obj;
}

function pickObject(event, viewport) {
    const rect = viewport.getBoundingClientRect();
    mouse.x =  ((event.clientX - rect.left)  / rect.width)  * 2 - 1;
    mouse.y = -((event.clientY - rect.top)   / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const meshes = [];
    placedObjects.forEach(o => {
        o.mesh.traverse(c => { if (c.isMesh) meshes.push(c); });
    });

    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;

    const hitMesh = hits[0].object;
    return placedObjects.find(o => {
        let found = false;
        o.mesh.traverse(c => { if (c === hitMesh) found = true; });
        return found;
    });
}

function selectObject(obj, addToSelection = false) {
    if (addToSelection && obj) {
        // Shift+click: toggle in multi-select
        const idx = selectedObjects.indexOf(obj);
        if (idx !== -1) {
            // Deselect this one
            highlightMesh(obj.mesh, false);
            selectedObjects.splice(idx, 1);
            if (selectedObj === obj) {
                selectedObj = selectedObjects[selectedObjects.length - 1] || null;
            }
        } else {
            selectedObjects.push(obj);
            highlightMesh(obj.mesh, true);
            selectedObj = obj;
        }
        if (selectedObjects.length > 1) {
            _showMultiSelectPanel();
        } else if (selectedObjects.length === 1) {
            showPropsPanel(selectedObjects[0]);
            _showHeightRuler(selectedObjects[0]);
        } else {
            deselectObject();
            return;
        }
        updateStatusBar();
        return;
    }

    // Normal click — clear multi-select, select single
    selectedObjects.forEach(o => { if (o !== obj) highlightMesh(o.mesh, false); });
    selectedObjects = [];
    _hideHeightRuler();

    if (!obj) {
        selectedObj = null;
        document.getElementById('propsEmpty').style.display = '';
        document.getElementById('propsBody').style.display = 'none';
        updateStatusBar();
        return;
    }
    selectedObj = obj;
    selectedObjects = [obj];
    highlightMesh(obj.mesh, true);

    // If piece belongs to a group, auto-select all other group members
    if (obj.group) {
        placedObjects.forEach(p => {
            if (p.group === obj.group && p !== obj) {
                selectedObjects.push(p);
                highlightMesh(p.mesh, true);
            }
        });
        if (selectedObjects.length > 1) {
            _showMultiSelectPanel();
            updateStatusBar();
            return;
        }
    }

    showPropsPanel(obj);
    _showHeightRuler(obj);
    updateStatusBar();
}

function _showMultiSelectPanel() {
    _hideHeightRuler();
    const empty = document.getElementById('propsEmpty');
    const body  = document.getElementById('propsBody');
    const fields = document.getElementById('propsFields');
    empty.style.display = 'none';
    body.style.display = '';
    fields.innerHTML = '';
    const info = document.createElement('div');
    info.style.cssText = 'font-size:12px;color:#a0a0c0;padding:8px 0 4px;text-align:center;';
    // Show group status if all selected are in the same group
    const groups = [...new Set(selectedObjects.map(o => o.group).filter(Boolean))];
    const allGrouped = groups.length === 1 && selectedObjects.every(o => o.group === groups[0]);
    info.textContent = `${selectedObjects.length} pieces selected${allGrouped ? ` (Group ${groups[0]})` : ''}`;
    fields.appendChild(info);

    // Group / Ungroup buttons
    const gRow = document.createElement('div');
    gRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
    const gBtn = document.createElement('button');
    gBtn.className = 'me-btn';
    gBtn.style.cssText = 'flex:1;font-size:11px;padding:4px 0;';
    gBtn.textContent = '⬡ Group';
    gBtn.title = 'Group selected pieces (G)';
    gBtn.addEventListener('click', _groupSelection);
    const ugBtn = document.createElement('button');
    ugBtn.className = 'me-btn';
    ugBtn.style.cssText = 'flex:1;font-size:11px;padding:4px 0;';
    ugBtn.textContent = '⬢ Ungroup';
    ugBtn.title = 'Ungroup selected pieces (U)';
    ugBtn.addEventListener('click', _ungroupSelection);
    gRow.appendChild(gBtn);
    gRow.appendChild(ugBtn);
    fields.appendChild(gRow);

    // Lock/unlock all
    const lockBtn = document.getElementById('btnLockPiece');
    if (lockBtn) lockBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Lock All';
}

function _groupSelection() {
    const targets = selectedObjects.length > 1 ? selectedObjects : [];
    if (targets.length < 2) { toast('Select 2+ pieces to group', true); return; }
    const gid = 'g' + (_nextGroupId++);
    targets.forEach(o => { o.group = gid; });
    toast(`Grouped ${targets.length} pieces as ${gid}`);
    _showMultiSelectPanel();
}

function _ungroupSelection() {
    const targets = selectedObjects.length > 0 ? selectedObjects : (selectedObj ? [selectedObj] : []);
    if (!targets.length) return;
    const groups = new Set(targets.map(o => o.group).filter(Boolean));
    if (!groups.size) { toast('No groups to ungroup', true); return; }
    let count = 0;
    placedObjects.forEach(o => { if (groups.has(o.group)) { o.group = ''; count++; } });
    toast(`Ungrouped ${count} pieces`);
    if (selectedObjects.length > 1) _showMultiSelectPanel();
    else if (selectedObj) showPropsPanel(selectedObj);
}

function deselectObject() {
    selectedObjects.forEach(o => highlightMesh(o.mesh, false));
    selectedObjects = [];
    selectedObj = null;
    _hideHeightRuler();
    document.getElementById('propsEmpty').style.display = '';
    document.getElementById('propsBody').style.display = 'none';
    updateStatusBar();
}

function deleteObject(obj) {
    if (!obj) return;
    if (obj.locked) { toast('🔒 Piece is locked', true); return; }
    if (selectedObj === obj) deselectObject();
    scene.remove(obj.mesh);
    placedObjects = placedObjects.filter(o => o !== obj);
    pushUndo({ type: 'remove', obj });
    redoStack = [];
    updateStatusBar();
}

function highlightMesh(mesh, on) {
    mesh.traverse(child => {
        if (child.isMesh && child.material) {
            if (on) {
                child.userData._origEmissive = child.material.emissive
                    ? child.material.emissive.clone()
                    : new THREE.Color(0);
                if (child.material.emissive) {
                    child.material.emissive.setHex(0x333355);
                }
            } else {
                if (child.material.emissive && child.userData._origEmissive) {
                    child.material.emissive.copy(child.userData._origEmissive);
                }
            }
        }
    });
}

// ===================================================================
// PROPERTIES PANEL
// ===================================================================
function showPropsPanel(obj) {
    const def = PIECE_BY_ID[obj.pieceId];
    const empty = document.getElementById('propsEmpty');
    const body  = document.getElementById('propsBody');
    const fields = document.getElementById('propsFields');
    empty.style.display = 'none';
    body.style.display = '';
    fields.innerHTML = '';

    addPropField(fields, 'Type', def.label, 'text', true);

    addPropField(fields, 'Pos X', obj.pos.x, 'number', false, v => {
        obj.pos.x = parseFloat(v) || 0;
        obj.mesh.position.x = obj.pos.x;
    });
    addPropField(fields, 'Pos Y', obj.pos.y, 'number', false, v => {
        obj.pos.y = parseFloat(v) || 0;
        obj.mesh.position.y = obj.pos.y + (PIECE_BY_ID[obj.pieceId].h / 2);
    });
    addPropField(fields, 'Pos Z', obj.pos.z, 'number', false, v => {
        obj.pos.z = parseFloat(v) || 0;
        obj.mesh.position.z = obj.pos.z;
    });
    addPropField(fields, 'Rotation', obj.rot, 'number', false, v => {
        obj.rot = parseFloat(v) || 0;
        obj.mesh.rotation.y = THREE.MathUtils.degToRad(obj.rot);
    });

    Object.entries(obj.props).forEach(([key, val]) => {
        if (key === 'customColor') return; // handled separately below
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        if (typeof val === 'boolean') {
            addPropCheck(fields, label, val, v => { obj.props[key] = v; });
        } else {
            addPropField(fields, label, val, typeof val === 'number' ? 'number' : 'text', false, v => {
                obj.props[key] = typeof val === 'number' ? parseFloat(v) : v;
            });
        }
    });

    // Custom piece colour picker
    const colorRow = document.createElement('div');
    colorRow.className = 'me-prop-row';
    const colorLbl = document.createElement('label');
    colorLbl.className = 'me-prop-label';
    colorLbl.textContent = 'Piece Color';
    const colorInp = document.createElement('input');
    colorInp.type = 'color';
    colorInp.className = 'me-prop-color';
    const defColor = '#' + (PIECE_BY_ID[obj.pieceId]?.color ?? 0x888888).toString(16).padStart(6, '0');
    colorInp.value = obj.props.customColor || defColor;
    colorInp.title = 'Custom colour — overrides default piece colour';
    colorInp.addEventListener('input', e => {
        obj.props.customColor = e.target.value;
        applyMeshColor(obj.mesh, e.target.value);
    });
    // Reset button
    const resetColorBtn = document.createElement('button');
    resetColorBtn.type = 'button';
    resetColorBtn.className = 'me-btn';
    resetColorBtn.style.cssText = 'font-size:10px;padding:2px 7px;margin-top:2px;';
    resetColorBtn.textContent = 'Reset colour';
    resetColorBtn.addEventListener('click', () => {
        delete obj.props.customColor;
        colorInp.value = defColor;
        applyMeshColor(obj.mesh, defColor);
    });
    colorRow.appendChild(colorLbl);
    colorRow.appendChild(colorInp);
    colorRow.appendChild(resetColorBtn);
    fields.appendChild(colorRow);

    // Piece note textarea
    const noteRow = document.createElement('div');
    noteRow.className = 'me-prop-row';
    noteRow.style.flexDirection = 'column';
    noteRow.style.gap = '3px';
    const noteLbl = document.createElement('label');
    noteLbl.className = 'me-prop-label';
    noteLbl.textContent = 'Note';
    const noteArea = document.createElement('textarea');
    noteArea.className = 'me-prop-input';
    noteArea.style.cssText = 'height:46px;resize:vertical;font-size:11px;padding:4px 6px;';
    noteArea.placeholder = 'Add a note for this piece…';
    noteArea.value = obj.note || '';
    noteArea.addEventListener('input', e => { obj.note = e.target.value.trim(); });
    noteRow.appendChild(noteLbl);
    noteRow.appendChild(noteArea);
    fields.appendChild(noteRow);

    // Lock status indicator
    const lockBtn = document.getElementById('btnLockPiece');
    if (lockBtn) {
        lockBtn.innerHTML = obj.locked
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Unlock Piece'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Lock Piece';
    }
}

function addPropField(container, label, value, type, readOnly, onChange) {
    const row = document.createElement('div');
    row.className = 'me-prop-row';
    const lbl = document.createElement('label');
    lbl.className = 'me-prop-label';
    lbl.textContent = label;
    const inp = document.createElement('input');
    inp.type = type;
    inp.className = 'me-prop-input';
    inp.value = value;
    if (readOnly) inp.readOnly = true;
    if (onChange) inp.addEventListener('input', e => onChange(e.target.value));
    row.appendChild(lbl);
    row.appendChild(inp);
    container.appendChild(row);
}

function addPropCheck(container, label, value, onChange) {
    const row = document.createElement('div');
    row.className = 'me-prop-row';
    const lbl = document.createElement('label');
    lbl.className = 'me-prop-check';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = value;
    chk.addEventListener('change', e => onChange(e.target.checked));
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode(' ' + label));
    row.appendChild(lbl);
    container.appendChild(row);
}

// ===================================================================
// UNDO / REDO
// ===================================================================
function pushUndo(action) {
    undoStack.push(action);
    if (undoStack.length > 100) undoStack.shift();
}

function doUndo() {
    const action = undoStack.pop();
    if (!action) return;
    if (action.type === 'add') {
        scene.remove(action.obj.mesh);
        placedObjects = placedObjects.filter(o => o !== action.obj);
        if (selectedObj === action.obj) deselectObject();
        redoStack.push(action);
    } else if (action.type === 'remove') {
        scene.add(action.obj.mesh);
        placedObjects.push(action.obj);
        redoStack.push(action);
    }
    updateStatusBar();
}

function doRedo() {
    const action = redoStack.pop();
    if (!action) return;
    if (action.type === 'add') {
        scene.add(action.obj.mesh);
        placedObjects.push(action.obj);
        undoStack.push(action);
    } else if (action.type === 'remove') {
        scene.remove(action.obj.mesh);
        placedObjects = placedObjects.filter(o => o !== action.obj);
        if (selectedObj === action.obj) deselectObject();
        undoStack.push(action);
    }
    updateStatusBar();
}

// ===================================================================
// TOOL SWITCH
// ===================================================================
function setTool(tool) {
    activeTool = tool;
    document.getElementById('btnSelect').classList.toggle('active', tool === 'select');
    document.getElementById('btnPlace').classList.toggle('active', tool === 'place');
    document.getElementById('btnDelete').classList.toggle('active', tool === 'delete');
    document.getElementById('sbTool').textContent = tool;
    buildGhost();
    updateHint();
}

function updateHint() {
    const hint = document.getElementById('meHint');
    if (activeTool === 'select') {
        hint.textContent = 'LMB: Select  |  RMB: Orbit  |  WASD: Pan  |  Q/E: Up/Down  |  =/−: Layer  |  Scroll: Zoom  |  Del: Delete';
    } else if (activeTool === 'delete') {
        hint.textContent = 'LMB: Delete  |  RMB: Orbit  |  WASD: Pan  |  Q/E: Up/Down  |  =/−: Layer  |  Scroll: Zoom';
    } else {
        hint.textContent = 'LMB: Place  |  RMB: Orbit  |  WASD: Pan  |  Q/E: Up/Down  |  =/−: Layer  |  Scroll: Zoom  |  R: Rotate';
    }
}

// ===================================================================
// STATUS BAR
// ===================================================================
function updateStatusBar() {
    document.getElementById('sbCount').textContent = placedObjects.length;
    document.getElementById('sbSelected').textContent = selectedObj
        ? (PIECE_BY_ID[selectedObj.pieceId]?.label || selectedObj.pieceId)
        : 'none';
    document.getElementById('sbTool').textContent = activeTool;
    document.getElementById('sbLayer').textContent = placeLayer;
    _drawMinimap();
}

// Mirror selected pieces horizontally (axis='x') or vertically (axis='z') around their bounding-box centre
function _mirrorSelection(axis) {
    const targets = selectedObjects.length > 0 ? selectedObjects : (selectedObj ? [selectedObj] : []);
    if (targets.length === 0) { toast('Select pieces to mirror', true); return; }

    // Compute bounding centre
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    targets.forEach(o => {
        minX = Math.min(minX, o.pos.x); maxX = Math.max(maxX, o.pos.x);
        minZ = Math.min(minZ, o.pos.z); maxZ = Math.max(maxZ, o.pos.z);
    });
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    targets.forEach(o => {
        if (o.locked) return;
        if (axis === 'x') {
            o.pos.x = cx * 2 - o.pos.x;
            o.rot   = (360 - o.rot) % 360;   // flip rotation across X axis (negate and re-normalise)
        } else {
            o.pos.z = cz * 2 - o.pos.z;
            o.rot   = (180 - o.rot + 360) % 360;   // flip rotation across Z axis
        }
        o.mesh.position.set(o.pos.x, o.pos.y + (PIECE_BY_ID[o.pieceId]?.h ?? 0) / 2, o.pos.z);
        o.mesh.rotation.y = THREE.MathUtils.degToRad(o.rot);
    });

    updateStatusBar();
    toast(`Mirrored ${targets.length} piece${targets.length !== 1 ? 's' : ''}`);
}

function _drawMinimap() {
    const canvas = document.getElementById('minimapCanvas');
    if (!canvas || placedObjects.length === 0) {
        if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
        return;
    }
    const S = 140;
    canvas.width  = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, S, S);

    // Compute bounding box of all pieces
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    placedObjects.forEach(o => {
        const def = PIECE_BY_ID[o.pieceId];
        const hw = (def?.w ?? 4) / 2, hd = (def?.d ?? 4) / 2;
        minX = Math.min(minX, o.pos.x - hw); maxX = Math.max(maxX, o.pos.x + hw);
        minZ = Math.min(minZ, o.pos.z - hd); maxZ = Math.max(maxZ, o.pos.z + hd);
    });
    const pad = 6;
    const spanX = maxX - minX || 1, spanZ = maxZ - minZ || 1;
    const scale = (S - pad * 2) / Math.max(spanX, spanZ);

    const toCanvasX = x => pad + (x - minX) * scale + (spanX < spanZ ? (S - pad * 2 - spanX * scale) / 2 : 0);
    const toCanvasZ = z => pad + (z - minZ) * scale + (spanZ < spanX ? (S - pad * 2 - spanZ * scale) / 2 : 0);

    placedObjects.forEach(o => {
        const def = PIECE_BY_ID[o.pieceId];
        const cx = toCanvasX(o.pos.x);
        const cz = toCanvasZ(o.pos.z);
        const rw = Math.max(2, (def?.w ?? 4) * scale / 2);
        const rd = Math.max(2, (def?.d ?? 4) * scale / 2);
        const color = def?.color ?? 0x888888;
        ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
        ctx.save();
        ctx.translate(cx, cz);
        ctx.rotate(-THREE.MathUtils.degToRad(o.rot));
        ctx.fillRect(-rw, -rd, rw * 2, rd * 2);
        ctx.restore();
    });

    // Selected piece highlight
    if (selectedObj) {
        const def = PIECE_BY_ID[selectedObj.pieceId];
        const cx = toCanvasX(selectedObj.pos.x);
        const cz = toCanvasZ(selectedObj.pos.z);
        const rw = Math.max(2, (def?.w ?? 4) * scale / 2);
        const rd = Math.max(2, (def?.d ?? 4) * scale / 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.save();
        ctx.translate(cx, cz);
        ctx.rotate(-THREE.MathUtils.degToRad(selectedObj.rot));
        ctx.strokeRect(-rw, -rd, rw * 2, rd * 2);
        ctx.restore();
    }
}

// ===================================================================
// SIDEBAR PIECE PICKER
// ===================================================================
function buildSidebar() {
    const cats = { track: 'pieceListTrack', obstacle: 'pieceListObstacle', special: 'pieceListSpecial' };
    Object.values(cats).forEach(id => document.getElementById(id).innerHTML = '');

    PIECES.forEach(def => {
        const listId = cats[def.cat];
        if (!listId) return;
        const list = document.getElementById(listId);

        const btn = document.createElement('button');
        btn.className = 'me-piece-btn';
        btn.dataset.pieceId = def.id;

        const icon = document.createElement('span');
        icon.className = 'me-piece-icon';
        const catClass = { track: 'pc-track', obstacle: 'pc-obstacle', special: 'pc-special' };
        if (def.id === 'corner_l' || def.id === 'corner_r') icon.classList.add('pc-corner');
        else if (def.id === 'start') icon.classList.add('pc-start');
        else if (def.id === 'finish') icon.classList.add('pc-finish');
        else icon.classList.add(catClass[def.cat] || 'pc-track');

        icon.style.background = '#' + def.color.toString(16).padStart(6, '0') + '33';
        icon.style.border = '1px solid #' + def.color.toString(16).padStart(6, '0') + '66';
        icon.textContent = def.icon;

        const lbl = document.createElement('span');
        lbl.textContent = def.label;

        btn.appendChild(icon);
        btn.appendChild(lbl);
        list.appendChild(btn);

        btn.addEventListener('click', () => {
            activePieceId = def.id;
            document.querySelectorAll('.me-piece-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            setTool('place');
            buildGhost();
        });
    });

    const first = document.querySelector('.me-piece-btn[data-piece-id="straight"]');
    if (first) first.classList.add('selected');
}

// ===================================================================
// EVENTS
// ===================================================================
function setupEvents(viewport) {
    let isDragging = false;
    let mouseDownPos = { x: 0, y: 0 };

    viewport.addEventListener('mousedown', e => {
        mouseDownPos = { x: e.clientX, y: e.clientY };
        isDragging = false;
    });

    // Piece note tooltip element
    const _noteTooltip = document.createElement('div');
    _noteTooltip.id = 'pieceNoteTooltip';
    _noteTooltip.style.cssText = [
        'position:fixed', 'z-index:9000', 'pointer-events:none', 'display:none',
        'background:#1a1a2e', 'border:1px solid #3a3a5a', 'border-radius:6px',
        'padding:6px 10px', 'font-size:11px', 'color:#c4c4e0',
        'max-width:200px', 'white-space:pre-wrap', 'word-break:break-word',
        'box-shadow:0 2px 8px rgba(0,0,0,0.5)',
    ].join(';');
    document.body.appendChild(_noteTooltip);

    viewport.addEventListener('mousemove', e => {
        const dx = e.clientX - mouseDownPos.x;
        const dy = e.clientY - mouseDownPos.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging = true;

        if (ghostMesh && activeTool === 'place') {
            const pt = getGroundPoint(e, viewport);
            if (pt) {
                const def = PIECE_BY_ID[activePieceId];
                let gx = def ? snapEdge(pt.x, def.w / 2) : snap(pt.x);
                let gz = def ? snapEdge(pt.z, def.d / 2) : snap(pt.z);
                let gy = placeLayer;
                const epSnap = _snapToEndpoint(gx, gz);
                if (epSnap) { gx = epSnap.x; gz = epSnap.z; gy = epSnap.y; }
                ghostMesh.position.set(gx, gy + (def ? def.h / 2 : 0), gz);
            }
        }

        const pt = getGroundPoint(e, viewport);
        if (pt) {
            document.getElementById('meCoords').innerHTML =
                `x: ${snap(pt.x).toFixed(0)} &nbsp; z: ${snap(pt.z).toFixed(0)}`;
        }

        // Hover note tooltip
        if (activeTool === 'select' && !isDragging) {
            const hovered = pickObject(e, viewport);
            if (hovered && hovered.note) {
                _noteTooltip.textContent = hovered.note;
                _noteTooltip.style.display = 'block';
                _noteTooltip.style.left = (e.clientX + 14) + 'px';
                _noteTooltip.style.top  = (e.clientY - 8) + 'px';
            } else {
                _noteTooltip.style.display = 'none';
            }
        } else {
            _noteTooltip.style.display = 'none';
        }
    });

    viewport.addEventListener('mouseup', e => {
        if (isDragging || e.button !== 0) return;

        if (activeTool === 'place') {
            const pt = getGroundPoint(e, viewport);
            if (pt) placePiece(pt);

        } else if (activeTool === 'select') {
            const obj = pickObject(e, viewport);
            selectObject(obj || null, e.shiftKey);

        } else if (activeTool === 'delete') {
            const obj = pickObject(e, viewport);
            if (obj) deleteObject(obj);
        }
    });

    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if ('wasdqe'.includes(e.key.toLowerCase()) && e.key.length === 1) {
            _keysHeld.add(e.key.toLowerCase());
            e.preventDefault();
        }

        if (e.key === 'v' || e.key === 'V') setTool('select');
        if (e.key === 'p' || e.key === 'P') setTool('place');
        if (e.key === 'x' || e.key === 'X') setTool('delete');

        if (e.key === 'r' || e.key === 'R' || e.key === ']') {
            pendingRotation = (pendingRotation + 90) % 360;
            if (ghostMesh) ghostMesh.rotation.y = THREE.MathUtils.degToRad(pendingRotation);
            const toRotate = selectedObjects.length > 1 ? selectedObjects : (selectedObj ? [selectedObj] : []);
            toRotate.forEach(o => {
                if (!o.locked) {
                    o.rot = (o.rot + 90) % 360;
                    o.mesh.rotation.y = THREE.MathUtils.degToRad(o.rot);
                }
            });
        }
        if (e.key === '[') {
            pendingRotation = (pendingRotation - 90 + 360) % 360;
            if (ghostMesh) ghostMesh.rotation.y = THREE.MathUtils.degToRad(pendingRotation);
            const toRotate = selectedObjects.length > 1 ? selectedObjects : (selectedObj ? [selectedObj] : []);
            toRotate.forEach(o => {
                if (!o.locked) {
                    o.rot = (o.rot - 90 + 360) % 360;
                    o.mesh.rotation.y = THREE.MathUtils.degToRad(o.rot);
                }
            });
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            const toDelete = selectedObjects.length > 1
                ? [...selectedObjects]
                : (selectedObj ? [selectedObj] : []);
            toDelete.forEach(o => deleteObject(o));
        }

        if (e.key === 'g' || e.key === 'G') { _groupSelection(); }
        if (e.key === 'u' || e.key === 'U') { _ungroupSelection(); }

        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); doUndo(); }
        if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); doRedo(); }
        if (e.ctrlKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveJSON(); }
        if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
            if (selectedObj) {
                clipboard = { pieceId: selectedObj.pieceId, pos: { ...selectedObj.pos }, rot: selectedObj.rot, props: { ...selectedObj.props } };
                toast('Copied');
            }
        }
        if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
            e.preventDefault();
            if (!clipboard) return;
            const def = PIECE_BY_ID[clipboard.pieceId];
            if (!def) return;
            const newPos = { x: clipboard.pos.x, y: clipboard.pos.y, z: clipboard.pos.z + 4 };
            const mesh = buildMeshForPiece(def);
            mesh.position.set(newPos.x, newPos.y + def.h / 2, newPos.z);
            mesh.rotation.y = THREE.MathUtils.degToRad(clipboard.rot);
            if (clipboard.props.customColor) applyMeshColor(mesh, clipboard.props.customColor);
            scene.add(mesh);
            const obj = { id: genId(), mesh, pieceId: clipboard.pieceId, pos: newPos, rot: clipboard.rot, locked: false, note: '', group: '', props: { ...clipboard.props } };
            placedObjects.push(obj);
            pushUndo({ type: 'add', obj });
            redoStack = [];
            selectObject(obj);
            updateStatusBar();
            clipboard = { ...clipboard, pos: { ...newPos } };  // cascade offset for repeated paste
            toast('Pasted');
        }

        // Layer up/down: = (plus) raises, - lowers
        if (e.key === '=' || e.key === '+') { e.preventDefault(); setLayer(+layerStep); }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); setLayer(-layerStep); }

        // Camera bookmarks: Shift+1–5 saves; 1–5 alone restores
        const num = parseInt(e.key);
        if (num >= 1 && num <= 5) {
            e.preventDefault();
            const idx = num - 1;
            if (e.shiftKey) {
                camBookmarks[idx] = {
                    pos:    camera.position.clone(),
                    target: controls.target.clone(),
                };
                toast(`Camera bookmark ${num} saved`);
            } else if (camBookmarks[idx]) {
                camera.position.copy(camBookmarks[idx].pos);
                controls.target.copy(camBookmarks[idx].target);
                controls.update();
                toast(`Camera bookmark ${num} restored`);
            }
        }
    });

    document.addEventListener('keyup', e => {
        _keysHeld.delete(e.key.toLowerCase());
    });

    window.addEventListener('blur', () => _keysHeld.clear());
}

// ===================================================================
// SAVE / LOAD / EXPORT
// ===================================================================
function mapToJSON() {
    return {
        version: 1,
        name: document.getElementById('mapName').value,
        pieces: placedObjects.map(o => ({
            id: o.id,
            pieceId: o.pieceId,
            pos: o.pos,
            rot: o.rot,
            locked: o.locked || false,
            note: o.note || '',
            group: o.group || '',
            props: o.props
        }))
    };
}

function loadFromJSON(data) {
    placedObjects.forEach(o => scene.remove(o.mesh));
    placedObjects = [];
    deselectObject();
    undoStack = [];
    redoStack = [];

    document.getElementById('mapName').value = data.name || 'Imported Map';

    (data.pieces || []).forEach(p => {
        const def = PIECE_BY_ID[p.pieceId];
        if (!def) return;
        const mesh = buildMeshForPiece(def);
        mesh.position.set(p.pos.x, p.pos.y + def.h / 2, p.pos.z);
        mesh.rotation.y = THREE.MathUtils.degToRad(p.rot || 0);
        const mergedProps = { ...def.defaultProps, ...(p.props || {}) };
        if (mergedProps.customColor) applyMeshColor(mesh, mergedProps.customColor);
        scene.add(mesh);
        placedObjects.push({
            id: p.id || genId(),
            mesh,
            pieceId: p.pieceId,
            pos: { ...p.pos },
            rot: p.rot || 0,
            locked: p.locked || false,
            note: p.note || '',
            group: p.group || '',
            props: mergedProps,
        });
    });

    // Sync group ID counter so new groups don't collide with loaded ones
    const maxGid = placedObjects.reduce((m, o) => {
        const n = o.group ? parseInt(o.group.replace(/\D/g, '')) : 0;
        return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    if (maxGid >= _nextGroupId) _nextGroupId = maxGid + 1;

    updateStatusBar();
    toast('Map loaded — ' + placedObjects.length + ' pieces');
}

function saveJSON() {
    const data = JSON.stringify(mapToJSON(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (document.getElementById('mapName').value || 'map') + '.json';
    a.click();
    URL.revokeObjectURL(url);
    _clearAutoSaveKey();
    toast('JSON saved');
}

// ===================================================================
// CMapV4 EXPORT
// ===================================================================
function exportCMapV4() {
    const records = [];
    placedObjects.forEach(o => {
        const def = PIECE_BY_ID[o.pieceId];
        if (!def) return;

        // Convert editor coords (Y-up) to UE4 (Z-up, cm scale)
        const scale = 100;
        const wx = o.pos.x * scale;
        const wy = o.pos.z * scale;
        const wz = o.pos.y * scale;

        const rotRad = THREE.MathUtils.degToRad(o.rot);
        const sinY = Math.sin(rotRad);
        const cosY = Math.cos(rotRad);

        const propsStr = Object.keys(o.props).length > 0
            ? JSON.stringify(o.props)
            : '';

        records.push({
            type_id: def.type_id,
            second_field: 0,
            flags: 0,
            sin_yaw: sinY,
            cos_yaw: cosY,
            world_x: wx,
            world_y: wy,
            world_z: wz,
            scale_x: 1.0,
            scale_y: 1.0,
            scale_z: 1.0,
            props: propsStr
        });
    });

    // Build payload binary
    let payloadSize = 4;
    records.forEach(r => {
        payloadSize += 4 + 4 + 4;
        payloadSize += 4 + 4;
        payloadSize += 4 + 4 + 4;
        payloadSize += 4 + 4 + 4;
        payloadSize += r.props.length > 0 ? 4 + r.props.length + 1 : 4;
    });

    const payload = new ArrayBuffer(payloadSize);
    const view = new DataView(payload);
    let off = 0;

    const writeU32 = v => { view.setUint32(off, v, true); off += 4; };
    const writeF32 = v => { view.setFloat32(off, v, true); off += 4; };
    const writeStr = s => {
        if (s.length === 0) { writeU32(0); return; }
        writeU32(s.length + 1);
        const bytes = new TextEncoder().encode(s);
        new Uint8Array(payload, off, bytes.length).set(bytes);
        off += bytes.length;
        view.setUint8(off, 0); off += 1;
    };

    writeU32(records.length);
    records.forEach(r => {
        writeU32(r.type_id);
        writeU32(r.second_field);
        writeU32(r.flags);
        writeF32(r.sin_yaw);
        writeF32(r.cos_yaw);
        writeF32(r.world_x);
        writeF32(r.world_y);
        writeF32(r.world_z);
        writeF32(r.scale_x);
        writeF32(r.scale_y);
        writeF32(r.scale_z);
        writeStr(r.props);
    });

    // Compress with pako (zlib) and wrap in UE4 package header
    const compressed = pako.deflate(new Uint8Array(payload));

    const header = new ArrayBuffer(48);
    const hv = new DataView(header);
    hv.setUint32(0, 0x9E2A83C1, true);  // UE4 magic
    hv.setInt16(4, 0x0007, true);
    hv.setInt16(6, 0x0007, true);
    hv.setUint32(8, 0x02000000, true);   // compressed zlib flag
    hv.setUint32(12, payloadSize, true);
    hv.setUint32(16, compressed.length, true);

    const out = new Uint8Array(48 + compressed.length);
    out.set(new Uint8Array(header), 0);
    out.set(compressed, 48);

    const blob = new Blob([out], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (document.getElementById('mapName').value || 'map').replace(/\s+/g, '_') + '.CMapV4';
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported ' + records.length + ' pieces as .CMapV4');
}

// ===================================================================
// UI SETUP
// ===================================================================
function setupUI() {
    buildSidebar();

    // ── Piece search filter ──────────────────────────────────────────
    const pieceSearch = document.getElementById('pieceSearch');
    if (pieceSearch) {
        pieceSearch.addEventListener('input', () => {
            const q = pieceSearch.value.trim().toLowerCase();
            document.querySelectorAll('.me-piece-btn').forEach(btn => {
                const label   = btn.querySelector('span:last-child')?.textContent?.toLowerCase() ?? '';
                const pieceId = (btn.dataset.pieceId ?? '').toLowerCase();
                btn.style.display = (!q || label.includes(q) || pieceId.includes(q)) ? '' : 'none';
            });
            document.querySelectorAll('.me-sidebar-section').forEach(section => {
                const anyVisible = Array.from(section.querySelectorAll('.me-piece-btn'))
                    .some(b => b.style.display !== 'none');
                section.style.display = anyVisible ? '' : 'none';
            });
        });
    }

    // ── Auto-height button ────────────────────────────────────────────
    document.getElementById('btnAutoHeight')?.addEventListener('click', autoHeight);

    // ── Map statistics button ─────────────────────────────────────────
    document.getElementById('btnStats')?.addEventListener('click', _showStats);
    document.getElementById('statsModalClose')?.addEventListener('click', () => {
        document.getElementById('statsModal').style.display = 'none';
    });
    document.getElementById('statsModal')?.addEventListener('click', e => {
        if (e.target.id === 'statsModal') e.target.style.display = 'none';
    });

    // ── Track validator button ────────────────────────────────────────
    document.getElementById('btnValidate')?.addEventListener('click', () => {
        if (placedObjects.length === 0) { toast('No pieces placed yet', true); return; }
        const warnings = validateTrack();
        if (warnings.length === 0) {
            toast('Track looks good! ✓');
        } else {
            alert('Validation warnings:\n\n' + warnings.map(w => '• ' + w).join('\n'));
        }
    });

    // ── Grid snap selector ───────────────────────────────────────────
    document.getElementById('snapSelect')?.addEventListener('change', e => {
        snapIncrement = parseFloat(e.target.value);
    });

    document.getElementById('btnSelect').addEventListener('click', () => setTool('select'));
    document.getElementById('btnPlace').addEventListener('click', () => setTool('place'));
    document.getElementById('btnDelete').addEventListener('click', () => setTool('delete'));

    document.getElementById('btnUndo').addEventListener('click', doUndo);
    document.getElementById('btnRedo').addEventListener('click', doRedo);

    document.getElementById('btnRotateCW').addEventListener('click', () => {
        pendingRotation = (pendingRotation + 90) % 360;
        if (ghostMesh) ghostMesh.rotation.y = THREE.MathUtils.degToRad(pendingRotation);
        if (selectedObj) {
            selectedObj.rot = (selectedObj.rot + 90) % 360;
            selectedObj.mesh.rotation.y = THREE.MathUtils.degToRad(selectedObj.rot);
        }
    });

    document.getElementById('btnRotateCCW').addEventListener('click', () => {
        pendingRotation = (pendingRotation - 90 + 360) % 360;
        if (ghostMesh) ghostMesh.rotation.y = THREE.MathUtils.degToRad(pendingRotation);
        if (selectedObj) {
            selectedObj.rot = (selectedObj.rot - 90 + 360) % 360;
            selectedObj.mesh.rotation.y = THREE.MathUtils.degToRad(selectedObj.rot);
        }
    });

    document.getElementById('btnMirrorX').addEventListener('click', () => _mirrorSelection('x'));
    document.getElementById('btnMirrorZ').addEventListener('click', () => _mirrorSelection('z'));

    document.getElementById('btnGroupSel')?.addEventListener('click', _groupSelection);
    document.getElementById('btnUngroup')?.addEventListener('click', _ungroupSelection);

    document.getElementById('btnPreviewRace')?.addEventListener('click', () => {
        const map = mapToJSON();
        if (!map.pieces || !map.pieces.length) { toast('No pieces to preview', true); return; }
        const startPiece = map.pieces.find(p => p.pieceId === 'start');
        if (!startPiece) { toast('Place a Start piece before previewing', true); return; }
        sessionStorage.setItem('marbles_preview', JSON.stringify(map));
        window.open('/apps/marble-play?preview=1', '_blank');
    });

    document.getElementById('btnGenTrack').addEventListener('click', generateRandomTrack);

    document.getElementById('btnNew').addEventListener('click', () => {
        if (placedObjects.length > 0 && !confirm('Start a new map? Unsaved changes will be lost.')) return;
        placedObjects.forEach(o => scene.remove(o.mesh));
        placedObjects = [];
        deselectObject();
        undoStack = [];
        redoStack = [];
        document.getElementById('mapName').value = 'My Map';
        updateStatusBar();
        toast('New map created');
    });

    document.getElementById('btnSaveJSON').addEventListener('click', saveJSON);
    document.getElementById('btnExportCMap').addEventListener('click', exportCMapV4);
    document.getElementById('btnPublishMap')?.addEventListener('click', _publishMap);
    document.getElementById('publishModalConfirm')?.addEventListener('click', _doPublish);
    document.getElementById('publishModalCancel')?.addEventListener('click', () => {
        document.getElementById('publishModal').style.display = 'none';
    });
    document.getElementById('publishModal')?.addEventListener('click', e => {
        if (e.target.id === 'publishModal') document.getElementById('publishModal').style.display = 'none';
    });
    document.getElementById('btnBrowseMaps')?.addEventListener('click', _browseMaps);
    document.getElementById('mapBrowserClose')?.addEventListener('click', () => {
        document.getElementById('mapBrowserModal').style.display = 'none';
    });
    document.getElementById('mapBrowserModal')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
    });

    document.getElementById('btnLoadJSON').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                loadFromJSON(JSON.parse(ev.target.result));
            } catch {
                toast('Invalid JSON file', true);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    document.getElementById('btnDeleteSelected').addEventListener('click', () => {
        if (selectedObj) {
            if (selectedObj.locked) { toast('Piece is locked — unlock it first', true); return; }
            deleteObject(selectedObj);
        }
    });

    document.getElementById('btnDuplicate').addEventListener('click', () => {
        if (!selectedObj) return;
        const def = PIECE_BY_ID[selectedObj.pieceId];
        const newPos = { x: selectedObj.pos.x + snapIncrement * 2, y: selectedObj.pos.y, z: selectedObj.pos.z };
        const mesh = buildMeshForPiece(def);
        mesh.position.set(newPos.x, newPos.y + def.h / 2, newPos.z);
        mesh.rotation.y = THREE.MathUtils.degToRad(selectedObj.rot);
        if (selectedObj.props.customColor) applyMeshColor(mesh, selectedObj.props.customColor);
        scene.add(mesh);
        const obj = {
            id: genId(),
            mesh,
            pieceId: selectedObj.pieceId,
            pos: newPos,
            rot: selectedObj.rot,
            locked: false,
            note: '',
            props: { ...selectedObj.props }
        };
        placedObjects.push(obj);
        pushUndo({ type: 'add', obj });
        redoStack = [];
        selectObject(obj);
        updateStatusBar();
    });

    // ── Lock piece button ─────────────────────────────────────────────
    document.getElementById('btnLockPiece')?.addEventListener('click', () => {
        if (!selectedObj) return;
        selectedObj.locked = !selectedObj.locked;
        const btn = document.getElementById('btnLockPiece');
        btn.textContent = '';
        btn.innerHTML = selectedObj.locked
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Unlock Piece'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Lock Piece';
        toast(selectedObj.locked ? '🔒 Piece locked' : '🔓 Piece unlocked');
    });

    // ── Dark / light theme toggle ─────────────────────────────────────
    const _applyTheme = (light) => {
        document.getElementById('meApp').classList.toggle('me-light', light);
        localStorage.setItem('marbles_theme', light ? 'light' : 'dark');
    };
    _applyTheme(localStorage.getItem('marbles_theme') === 'light');
    document.getElementById('btnTheme')?.addEventListener('click', () => {
        const isLight = document.getElementById('meApp').classList.contains('me-light');
        _applyTheme(!isLight);
    });

    // ── Import map from URL / ID ──────────────────────────────────────
    document.getElementById('btnImportMap')?.addEventListener('click', () => {
        document.getElementById('importMapModal').style.display = '';
        document.getElementById('importMapInput').value = '';
        setTimeout(() => document.getElementById('importMapInput').focus(), 50);
    });
    document.getElementById('importMapClose')?.addEventListener('click', () => {
        document.getElementById('importMapModal').style.display = 'none';
    });
    document.getElementById('importMapModal')?.addEventListener('click', e => {
        if (e.target.id === 'importMapModal') e.target.style.display = 'none';
    });
    document.getElementById('importMapGo')?.addEventListener('click', async () => {
        const raw = document.getElementById('importMapInput').value.trim();
        if (!raw) return;
        // Accept full URL with ?load= param, or just an ID
        let mapId = raw;
        try {
            const u = new URL(raw);
            mapId = u.searchParams.get('load') || u.searchParams.get('map_id') || raw;
        } catch (_) { /* not a URL, treat as raw ID */ }
        document.getElementById('importMapModal').style.display = 'none';
        await _loadMapFromLibrary(mapId);
    });
    document.getElementById('importMapInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('importMapGo').click();
        if (e.key === 'Escape') document.getElementById('importMapClose').click();
    });

    setTool('place');
    updateStatusBar();
}

// ===================================================================
// UTILITIES
// ===================================================================
let _idCounter = 0;
function genId() { return 'obj_' + (++_idCounter) + '_' + Date.now(); }

// Apply a hex colour string to every sub-mesh in a group
function applyMeshColor(meshOrGroup, hexStr) {
    meshOrGroup.traverse(child => {
        if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => {
                if (m.color) m.color.setStyle(hexStr);
            });
        }
    });
}

// Height ruler — a dashed vertical line from piece Y to Y=0 with a label
function _showHeightRuler(obj) {
    _hideHeightRuler();
    const y = obj.pos.y;
    if (y <= 0.1) return;
    const pts = [new THREE.Vector3(obj.pos.x, 0, obj.pos.z), new THREE.Vector3(obj.pos.x, y, obj.pos.z)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineDashedMaterial({ color: 0xffff44, dashSize: 0.8, gapSize: 0.4, linewidth: 1 });
    heightRulerLine = new THREE.Line(geo, mat);
    heightRulerLine.computeLineDistances();
    scene.add(heightRulerLine);
}

function _hideHeightRuler() {
    if (heightRulerLine) {
        scene.remove(heightRulerLine);
        heightRulerLine.geometry.dispose();
        heightRulerLine = null;
    }
}

function toast(msg, isError = false) {
    const t = document.getElementById('meToast');
    t.textContent = msg;
    t.className = 'me-toast' + (isError ? ' error' : '');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ===================================================================
// AUTO-SAVE
// ===================================================================
let _autoSaveTimer = null;

function startAutoSave() {
    if (_autoSaveTimer) clearInterval(_autoSaveTimer);
    _autoSaveTimer = setInterval(() => {
        if (placedObjects.length === 0) return;
        try {
            localStorage.setItem('marbles_autosave', JSON.stringify({
                ts:  Date.now(),
                map: mapToJSON()
            }));
        } catch (_) {}
    }, 60_000);
}

function _clearAutoSaveKey() {
    try { localStorage.removeItem('marbles_autosave'); } catch (_) {}
}

function _checkAutoSaveRecovery() {
    try {
        const raw = localStorage.getItem('marbles_autosave');
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data?.map?.pieces?.length) return;
        const banner = document.getElementById('autoSaveBanner');
        const ts = data.ts ? new Date(data.ts).toLocaleTimeString() : 'unknown time';
        banner.querySelector('span').textContent =
            `Unsaved work found — ${data.map.pieces.length} pieces, saved at ${ts}.`;
        banner.style.display = 'flex';
        document.getElementById('autoSaveRestore').onclick = () => {
            loadFromJSON(data.map);
            _clearAutoSaveKey();
            banner.style.display = 'none';
            toast('Map restored from auto-save');
        };
        document.getElementById('autoSaveDismiss').onclick = () => {
            _clearAutoSaveKey();
            banner.style.display = 'none';
        };
    } catch (_) {}
}

// ===================================================================
// GAME LOBBY
// ===================================================================
let _lobbySessionId   = null;
let _lobbyPollTimer   = null;
let _lobbyLastCount   = -1;
let _selectionOpen    = false;

// ── Demo map for quick testing ────────────────────────────────────
const DEMO_MAP = {
    version: 1,
    name: 'Demo Track',
    pieces: [
        { id: 'ds',  pieceId: 'start',    pos: {x: 2, y: 0, z:  0}, rot: 0, props: { marbles: 5 } },
        { id: 'd1',  pieceId: 'straight', pos: {x: 2, y: 0, z: 16}, rot: 0, props: {} },
        { id: 'd2',  pieceId: 'straight', pos: {x: 2, y: 0, z: 32}, rot: 0, props: {} },
        { id: 'd3',  pieceId: 'boost_pad',pos: {x: 2, y: 0, z: 44}, rot: 0, props: { strength: 1.5 } },
        { id: 'd4',  pieceId: 'straight', pos: {x: 2, y: 0, z: 56}, rot: 0, props: {} },
        { id: 'df',  pieceId: 'finish',   pos: {x: 2, y: 0, z: 72}, rot: 0, props: {} },
    ]
};

// ── Default marble roster ─────────────────────────────────────────
const DEFAULT_ROSTER = [
    { slot: 1, name: 'Inferno', color: '#f43f5e', icon: '🔥', restriction: null, enabled: true },
    { slot: 2, name: 'Glacier', color: '#38bdf8', icon: '❄️',  restriction: null, enabled: true },
    { slot: 3, name: 'Thunder', color: '#fbbf24', icon: '⚡',  restriction: null, enabled: true },
    { slot: 4, name: 'Phantom', color: '#a78bfa', icon: '👻', restriction: null, enabled: true },
];

function _rosterToPayload() {
    const rows = document.querySelectorAll('#rosterSlots .roster-slot-row');
    return Array.from(rows).map((row, i) => ({
        slot:        i + 1,
        name:        row.querySelector('.roster-name').value.trim() || `Marble ${i + 1}`,
        color:       row.querySelector('.roster-color').value,
        icon:        row.querySelector('.roster-icon').value.trim() || '●',
        restriction: row.querySelector('.roster-restriction').value || null,
        enabled:     row.querySelector('.roster-enabled').checked,
    }));
}

function _rosterBuildRow(data, idx) {
    const row = document.createElement('div');
    row.className = 'roster-slot-row';
    row.innerHTML = `
        <div class="roster-slot-left">
            <span class="roster-slot-num">${idx + 1}</span>
            <input type="color" class="roster-color" value="${data.color}" title="Marble colour">
            <input type="text"  class="roster-icon me-prop-input" value="${data.icon || ''}" placeholder="🔥" style="width:36px;text-align:center;" maxlength="4" title="Icon / emoji">
            <input type="text"  class="roster-name me-prop-input" value="${data.name}" placeholder="Name" style="flex:1;" maxlength="20">
        </div>
        <div class="roster-slot-right">
            <select class="roster-restriction me-prop-input" title="Viewer restriction">
                <option value="">Anyone</option>
                <option value="subscriber" ${data.restriction === 'subscriber' ? 'selected' : ''}>Subs only</option>
                <option value="vip"        ${data.restriction === 'vip'        ? 'selected' : ''}>VIP only</option>
                <option value="mod"        ${data.restriction === 'mod'        ? 'selected' : ''}>Mods only</option>
            </select>
            <label class="roster-toggle" title="Enabled">
                <input type="checkbox" class="roster-enabled" ${data.enabled ? 'checked' : ''}>
                <span class="roster-toggle-track"></span>
            </label>
            <button class="roster-remove" title="Remove slot" onclick="this.closest('.roster-slot-row').remove()">✕</button>
        </div>`;
    return row;
}

function _rosterInit() {
    const container = document.getElementById('rosterSlots');
    container.innerHTML = '';
    DEFAULT_ROSTER.forEach((m, i) => container.appendChild(_rosterBuildRow(m, i)));
    document.getElementById('btnAddSlot').addEventListener('click', () => {
        const rows = container.querySelectorAll('.roster-slot-row');
        const idx  = rows.length;
        const newSlot = { slot: idx + 1, name: `Marble ${idx + 1}`, color: '#888888', icon: '⚪', restriction: null, enabled: true };
        container.appendChild(_rosterBuildRow(newSlot, idx));
    });
}

function ME_switchTab(tab) {
    document.getElementById('panelProps').style.display = tab === 'props' ? '' : 'none';
    document.getElementById('panelGame').style.display  = tab === 'game'  ? 'flex' : 'none';
    document.getElementById('tabProps').classList.toggle('active', tab === 'props');
    document.getElementById('tabGame').classList.toggle('active', tab === 'game');
}

function _lobbyShowSetup(err) {
    document.getElementById('lobbySetup').style.display   = '';
    document.getElementById('lobbyActive').style.display  = 'none';
    const errEl = document.getElementById('lobbySetupError');
    if (err) { errEl.textContent = err; errEl.style.display = ''; }
    else { errEl.style.display = 'none'; }
}

function _lobbyShowActive() {
    document.getElementById('lobbySetup').style.display  = 'none';
    document.getElementById('lobbyActive').style.display = 'flex';
    // Show watch link for spectators
    if (_lobbySessionId) {
        const watchRow = document.getElementById('lobbyWatchRow');
        const watchInput = document.getElementById('lobbyWatchLink');
        if (watchRow && watchInput) {
            watchInput.value = `${location.origin}/marbles/watch/${_lobbySessionId}`;
            watchRow.style.display = '';
        }
    }
    document.getElementById('btnCopyWatchLink')?.addEventListener('click', () => {
        const inp = document.getElementById('lobbyWatchLink');
        if (inp) { navigator.clipboard?.writeText(inp.value); toast('Watch link copied'); }
    });

    // Stream alerts OBS URL (based on the channel name stored in session)
    const alertsRow   = document.getElementById('lobbyAlertsRow');
    const alertsInput = document.getElementById('lobbyAlertsLink');
    if (alertsRow && alertsInput) {
        const channel = document.getElementById('lobbyChannel')?.value.trim().replace(/^#/, '') || '';
        if (channel) {
            alertsInput.value = `${location.origin}/marbles/alerts/${channel}`;
            alertsRow.style.display = '';
        }
    }
    document.getElementById('btnCopyAlertsLink')?.addEventListener('click', () => {
        const inp = document.getElementById('lobbyAlertsLink');
        if (inp) { navigator.clipboard?.writeText(inp.value); toast('Alerts URL copied'); }
    });

    // QR code pointing to global leaderboard for phone scanning
    const qrRow = document.getElementById('lobbyQRRow');
    const qrContainer = document.getElementById('lobbyQRCode');
    if (qrRow && qrContainer && typeof QRCode !== 'undefined') {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: `${location.origin}/marbles/leaderboard`,
            width: 80, height: 80,
            colorDark: '#000000', colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M,
        });
        qrRow.style.display = '';
    }
}

async function _lobbyCreate() {
    const channel = document.getElementById('lobbyChannel').value.trim().replace(/^#/, '');
    const cmd     = document.getElementById('lobbyJoinCmd').value.trim() || '!join';
    const max     = parseInt(document.getElementById('lobbyMaxPlayers').value) || 100;

    const settings = {
        fall_mode:          document.getElementById('lobbyFallMode')?.value       ?? 'respawn',
        max_respawns:       parseInt(document.getElementById('lobbyMaxRespawns')?.value ?? '-1'),
        timeout_mins:       parseInt(document.getElementById('lobbyTimeout')?.value     ?? '3'),
        gravity:            document.getElementById('lobbyGravity')?.value        ?? 'normal',
        marble_friction:    document.getElementById('lobbyFriction')?.value       ?? 'normal',
        announce_winner:    document.getElementById('lobbyAnnounceWinner')?.checked ?? false,
        coin_multiplier:    parseInt(document.getElementById('lobbyCoinMultiplier')?.value ?? '1'),
        camera_lock:        document.getElementById('lobbyCameraLock')?.value     ?? 'off',
        late_join:          document.getElementById('lobbyLateJoin')?.checked     ?? false,
        abilities_enabled:  document.getElementById('lobbyAbilitiesEnabled')?.checked ?? true,
        cosmetics_enabled:  document.getElementById('lobbyCosmetics')?.checked    ?? true,
        discord_webhook:    (document.getElementById('lobbyDiscordWebhook')?.value ?? '').trim(),
        handicap_enabled:   document.getElementById('lobbyHandicap')?.checked     ?? false,
        handicap_strength:  parseFloat(document.getElementById('lobbyHandicapStrength')?.value ?? '0.2'),
        team_mode:          document.getElementById('lobbyTeamMode')?.checked     ?? false,
        tournament_mode:    document.getElementById('lobbyTournament')?.checked   ?? false,
        tournament_races:   parseInt(document.getElementById('lobbyTournamentRaces')?.value ?? '3'),
        elimination_rounds: document.getElementById('lobbyElimination')?.checked  ?? false,
        ghost_marble:       document.getElementById('lobbyGhostMarble')?.checked  ?? false,
        gauntlet_mode:      document.getElementById('lobbyGauntlet')?.checked     ?? false,
    };

    if (!channel) { _lobbyShowSetup('Enter your Twitch channel name.'); return; }

    document.getElementById('btnLobbyCreate').disabled = true;
    try {
        const marble_types = _rosterToPayload();
        const res  = await fetch('/marbles/api/game/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, join_cmd: cmd, max_players: max, marble_types, settings }),
        });
        const data = await res.json();
        if (!res.ok) { _lobbyShowSetup(data.error || 'Failed to create session.'); return; }
        _lobbySessionId = data.session.id;
        document.getElementById('lobbyJoinCmdDisplay').textContent = cmd;
        _lobbyShowActive();
        _lobbyStartPoll();
    } catch (e) {
        _lobbyShowSetup('Network error — is the server running?');
    } finally {
        document.getElementById('btnLobbyCreate').disabled = false;
    }
}

function _lobbyStartPoll() {
    _lobbyStopPoll();
    _lobbyPoll();
    _lobbyPollTimer = setInterval(_lobbyPoll, 2000);
}

function _lobbyStopPoll() {
    if (_lobbyPollTimer) { clearInterval(_lobbyPollTimer); _lobbyPollTimer = null; }
}

async function _lobbyPoll() {
    if (!_lobbySessionId) return;
    try {
        const res  = await fetch(`/marbles/api/game/${_lobbySessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        _lobbyUpdateUI(data);
    } catch (_) { /* swallow network blip */ }
}

function _lobbyUpdateUI(data) {
    const dot  = document.getElementById('lobbyStatusDot');
    const txt  = document.getElementById('lobbyStatusText');
    const cnt  = document.getElementById('lobbyPlayerCount');
    const list = document.getElementById('lobbyPlayerList');
    const none = document.getElementById('lobbyNoPlayers');

    // Character select button state
    const btnOpen  = document.getElementById('btnOpenCharSelect');
    const btnClose = document.getElementById('btnCloseCharSelect');
    if (data.selection_open) {
        btnOpen.style.display  = 'none';
        btnClose.style.display = '';
        _selectionOpen = true;
    } else {
        btnOpen.style.display  = '';
        btnClose.style.display = 'none';
        _selectionOpen = false;
    }

    const playerSection = document.getElementById('lobbyPlayerSection');
    const resultsSection = document.getElementById('lobbyResults');

    if (data.state === 'lobby') {
        const isMidTournament = data.settings?.tournament_mode && data.tournament_race_num > 0;
        const isMidElim = data.settings?.elimination_rounds && (data.elimination_round || 0) > 0;
        dot.style.background = (isMidTournament || isMidElim) ? '#5865f2' : '#f59e0b';
        if (isMidTournament) {
            txt.textContent = `Tournament — Race ${data.tournament_race_num} of ${data.settings.tournament_races} done — ready for next race`;
        } else if (isMidElim) {
            const elim = data.elimination_eliminated || [];
            txt.textContent = `Elimination — Round ${data.elimination_round} done — ${data.player_count} remaining`;
        } else {
            txt.textContent = data.selection_open ? 'Character select open' : 'Lobby open — accepting players';
        }
        document.getElementById('btnLobbyStart').disabled = data.player_count === 0;
        playerSection.style.display = '';
        resultsSection.style.display = 'none';
    } else if (data.state === 'running') {
        dot.style.background = '#22c55e';
        txt.textContent = 'Race in progress';
        playerSection.style.display = '';
        resultsSection.style.display = 'none';
    } else {
        dot.style.background = '#ef4444';
        txt.textContent = 'Race finished';
        _lobbyStopPoll();
        playerSection.style.display = 'none';
        if (data.results && data.results.length) {
            resultsSection.style.display = 'flex';
            _renderLobbyResults(data.results);
        }
    }

    cnt.textContent = `${data.player_count} player${data.player_count !== 1 ? 's' : ''} joined`;

    // Always rebuild player list so marble badges update
    const selections = data.player_selections || {};
    const types      = data.marble_types || [];
    list.innerHTML = '';
    if (data.players && data.players.length) {
        none.style.display = 'none';
        data.players.forEach(name => {
            const slot = selections[name.toLowerCase()];
            const mt   = slot != null ? types.find(m => m.slot === slot) : null;
            const badge = mt
                ? `<span class="lobby-marble-badge" style="background:${mt.color}20;border-color:${mt.color}60;color:${mt.color}">${mt.icon || ''} ${mt.name}</span>`
                : '';
            const row  = document.createElement('div');
            row.className = 'lobby-player-row';
            row.innerHTML = `<span>${_escHtml(name)}${badge}</span>
                <button class="lobby-player-kick" title="Kick player" onclick="_lobbyKick('${_escHtml(name)}')">✕</button>`;
            list.appendChild(row);
        });
    } else {
        none.style.display = '';
    }
    _lobbyLastCount = data.player_count;
}

function _escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function _lobbyStart() {
    if (!_lobbySessionId) return;

    // Compute map_id (SHA-256 of piece fingerprint) to send with start
    const mapData = mapToJSON();
    let map_id = 'unknown';
    try {
        const stable = JSON.stringify(
            (mapData.pieces || []).map(p => ({
                id: p.id, x: +(p.pos?.x ?? 0).toFixed(2),
                y: +(p.pos?.y ?? 0).toFixed(2), z: +(p.pos?.z ?? 0).toFixed(2),
                r: p.rot || 0,
            })).sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z)
        );
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
        map_id = Array.from(new Uint8Array(buf)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {}

    // Mark session as running on the server
    await fetch(`/marbles/api/game/${_lobbySessionId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map_id }),
    });

    // Serialize current map + session into sessionStorage for play page
    const restore = { session_id: _lobbySessionId, map: mapData };
    sessionStorage.setItem('marbles_pending_race', JSON.stringify(restore));
    sessionStorage.setItem('marbles_restore',      JSON.stringify(restore));

    // Navigate to the play page
    window.location.href = '/apps/marble-play';
}

async function _lobbyReset() {
    if (!_lobbySessionId) return;
    await fetch(`/marbles/api/game/${_lobbySessionId}/reset`, { method: 'POST' });
    _lobbyLastCount = -1;
    _lobbyPoll();
}

async function _lobbyEnd() {
    if (!_lobbySessionId) return;
    _lobbyStopPoll();
    await fetch(`/marbles/api/game/${_lobbySessionId}/end`, { method: 'POST' });
    _lobbySessionId = null;
    _lobbyLastCount = -1;
    _lobbyShowSetup();
}

async function _lobbyKick(username) {
    if (!_lobbySessionId) return;
    await fetch(`/marbles/api/game/${_lobbySessionId}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
    });
    _lobbyLastCount = -1;
    _lobbyPoll();
}

function _renderLobbyResults(results) {
    const MEDALS = ['🥇', '🥈', '🥉'];
    const list = document.getElementById('lobbyResultsList');

    // Results list
    list.innerHTML = results.map((r, i) => {
        const medal = MEDALS[i] || `${r.rank ?? '—'}.`;
        const time  = r.finish_time_ms != null
            ? (r.finish_time_ms / 1000).toFixed(2) + 's'
            : 'DNF';
        return `<div class="lobby-result-row">
            <span class="lobby-result-rank">${medal}</span>
            <span class="lobby-result-name">${_escHtml(r.username)}</span>
            <span class="lobby-result-time">${time}</span>
        </div>`;
    }).join('');

    // Per-session analytics
    const finishers = results.filter(r => r.finish_time_ms != null);
    const dnfCount  = results.length - finishers.length;
    const avgMs     = finishers.length
        ? finishers.reduce((s, r) => s + r.finish_time_ms, 0) / finishers.length
        : 0;
    const totalRespawns = results.reduce((s, r) => s + (r.respawns || 0), 0);
    const mostRespawns  = results.reduce((best, r) => (r.respawns || 0) > (best.respawns || 0) ? r : best, results[0]);

    const stats = [
        `Players: ${results.length}`,
        `Finishers: ${finishers.length}`,
        ...(dnfCount ? [`DNF: ${dnfCount}`] : []),
        ...(finishers.length > 1 ? [`Avg time: ${(avgMs/1000).toFixed(2)}s`] : []),
        ...(totalRespawns ? [`Respawns: ${totalRespawns}`] : []),
        ...(mostRespawns?.respawns > 0 ? [`Most: ${_escHtml(mostRespawns.username)} (${mostRespawns.respawns})`] : []),
    ];

    const existing = list.parentElement.querySelector('.lobby-analytics');
    if (existing) existing.remove();
    if (stats.length) {
        const statsEl = document.createElement('div');
        statsEl.className = 'lobby-analytics';
        statsEl.style.cssText = 'margin-top:8px;padding:6px 8px;background:#0d0d14;border-radius:6px;display:flex;flex-wrap:wrap;gap:6px;';
        statsEl.innerHTML = stats.map(s => `<span style="font-size:10px;color:#888;">${s}</span>`).join('');
        list.parentElement.appendChild(statsEl);
    }
}

async function _restoreSession() {
    const raw = sessionStorage.getItem('marbles_restore');
    if (!raw) return;
    try {
        const saved = JSON.parse(raw);
        if (!saved.session_id) return;
        const res = await fetch(`/marbles/api/game/${saved.session_id}`);
        if (!res.ok) { sessionStorage.removeItem('marbles_restore'); return; }
        const data = await res.json();
        _lobbySessionId = saved.session_id;
        // Reload map into editor if we have it cached
        if (saved.map) {
            try { loadFromJSON(saved.map); } catch (_) {}
        }
        document.getElementById('lobbyJoinCmdDisplay').textContent = data.join_cmd || '!join';
        ME_switchTab('game');
        _lobbyShowActive();
        _lobbyUpdateUI(data);
        if (data.state !== 'ended') _lobbyStartPoll();
    } catch (_) {
        sessionStorage.removeItem('marbles_restore');
    }
}

async function _openCharSelect() {
    if (!_lobbySessionId) return;
    await fetch(`/marbles/api/game/${_lobbySessionId}/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ open: true }),
    });
    _lobbyPoll();
}

async function _closeCharSelect() {
    if (!_lobbySessionId) return;
    await fetch(`/marbles/api/game/${_lobbySessionId}/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ open: false }),
    });
    _lobbyPoll();
}

function _initLobbyHandlers() {
    document.getElementById('btnGameMode').addEventListener('click', () => ME_switchTab('game'));
    document.getElementById('btnLobbyCreate').addEventListener('click', _lobbyCreate);
    document.getElementById('btnTestRace')?.addEventListener('click', _testRace);
    document.getElementById('btnTestRaceToolbar')?.addEventListener('click', _testRace);
    document.getElementById('btnLobbyStart').addEventListener('click', _lobbyStart);
    document.getElementById('btnLobbyReset').addEventListener('click', _lobbyReset);
    document.getElementById('btnLobbyEnd').addEventListener('click', _lobbyEnd);
    document.getElementById('btnOpenCharSelect').addEventListener('click', _openCharSelect);
    document.getElementById('btnCloseCharSelect').addEventListener('click', _closeCharSelect);
}

// ===================================================================
// MAP LIBRARY
// ===================================================================
function _captureThumbnail() {
    try {
        // Render one more frame then capture at reduced resolution
        const canvas = renderer.domElement;
        const thumb = document.createElement('canvas');
        thumb.width  = 320;
        thumb.height = 180;
        const ctx = thumb.getContext('2d');
        ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
        return thumb.toDataURL('image/jpeg', 0.75);
    } catch (_) { return null; }
}

// ===================================================================
// AUTO-HEIGHT — drop floating pieces to nearest surface below them
// ===================================================================
function autoHeight() {
    if (placedObjects.length === 0) { toast('No pieces placed', true); return; }
    let moved = 0;
    placedObjects.forEach(o => {
        if (o.pos.y <= 0) return;
        // Find the highest piece below this one within a 10-unit horizontal radius
        const below = placedObjects
            .filter(other => other !== o && other.pos.y < o.pos.y)
            .filter(other => Math.abs(other.pos.x - o.pos.x) < 10 && Math.abs(other.pos.z - o.pos.z) < 10);
        if (below.length === 0) return;  // no pieces below — leave as-is
        const highest = Math.max(...below.map(b => b.pos.y));
        const gap = o.pos.y - highest;
        if (gap > 2) {
            o.pos.y = highest;
            const def = PIECE_BY_ID[o.pieceId];
            o.mesh.position.y = o.pos.y + (def ? def.h / 2 : 0);
            moved++;
        }
    });
    if (moved > 0) { updateStatusBar(); toast(`Dropped ${moved} piece${moved > 1 ? 's' : ''} to nearest surface`); }
    else toast('No floating pieces detected');
}

// ===================================================================
// MAP STATISTICS
// ===================================================================
function _showStats() {
    if (placedObjects.length === 0) { toast('No pieces placed yet', true); return; }

    const catCounts = { track: 0, obstacle: 0, special: 0 };
    const typeCounts = {};
    const ys = [];

    placedObjects.forEach(o => {
        const def = PIECE_BY_ID[o.pieceId];
        if (def) catCounts[def.cat] = (catCounts[def.cat] || 0) + 1;
        typeCounts[o.pieceId] = (typeCounts[o.pieceId] || 0) + 1;
        ys.push(o.pos.y);
    });

    const maxY = Math.max(...ys);
    const minY = Math.min(...ys);
    const uniqueTypes = Object.keys(typeCounts).length;
    const totalPieces = placedObjects.length;
    const varietyPct = Math.round((uniqueTypes / totalPieces) * 100);

    const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const mostUsed = sortedTypes[0];

    const hasStart  = placedObjects.some(o => o.pieceId === 'start');
    const hasFinish = placedObjects.some(o => o.pieceId === 'finish');

    const row = (label, val) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1e1e2e;">
        <span style="color:#888;">${label}</span><span style="color:#e0e0e0;font-weight:600;">${val}</span></div>`;

    document.getElementById('statsBody').innerHTML = [
        row('Total pieces', totalPieces),
        row('Track pieces', catCounts.track || 0),
        row('Obstacle pieces', catCounts.obstacle || 0),
        row('Special pieces', catCounts.special || 0),
        row('Unique piece types', uniqueTypes),
        row('Variety score', varietyPct + '%'),
        row('Most used piece', mostUsed ? `${PIECE_BY_ID[mostUsed[0]]?.label || mostUsed[0]} (×${mostUsed[1]})` : '—'),
        row('Max height', maxY.toFixed(1) + ' u'),
        row('Min height', minY.toFixed(1) + ' u'),
        row('Height drop', (maxY - minY).toFixed(1) + ' u'),
        row('Start piece', hasStart  ? '✓ Yes' : '✗ Missing'),
        row('Finish piece', hasFinish ? '✓ Yes' : '✗ Missing'),
    ].join('');

    document.getElementById('statsModal').style.display = 'flex';
}

// ===================================================================
// TRACK VALIDATOR
// ===================================================================
function validateTrack() {
    const warnings = [];
    const ids = placedObjects.map(o => o.pieceId);
    if (!ids.includes('start'))  warnings.push('No start piece placed.');
    if (!ids.includes('finish')) warnings.push('No finish piece placed.');

    // Exact-overlap check: two pieces of the same type at the same position
    const seen = new Map();
    placedObjects.forEach(o => {
        const key = `${Math.round(o.pos.x)},${Math.round(o.pos.y)},${Math.round(o.pos.z)}`;
        if (seen.has(key)) warnings.push(`Overlapping pieces at (${Math.round(o.pos.x)}, ${Math.round(o.pos.y)}, ${Math.round(o.pos.z)}).`);
        else seen.set(key, true);
    });

    // Loop shortcut detection — a nearby piece at loop-top height lets marbles skip the loop
    const LOOP_RADIUS = 4;
    const loops = placedObjects.filter(o => o.pieceId === 'loop');
    loops.forEach(loop => {
        const loopTopY = loop.pos.y + LOOP_RADIUS * 2;  // top of loop arc
        const nearbyAtTop = placedObjects.filter(o => {
            if (o === loop) return false;
            const dx = o.pos.x - loop.pos.x;
            const dz = o.pos.z - loop.pos.z;
            const horiz = Math.sqrt(dx * dx + dz * dz);
            const yDiff = Math.abs(o.pos.y - loopTopY);
            return horiz < 16 && yDiff < LOOP_RADIUS;
        });
        if (nearbyAtTop.length > 0) {
            warnings.push(`Loop at (${Math.round(loop.pos.x)}, ${Math.round(loop.pos.y)}, ${Math.round(loop.pos.z)}) may be skippable — adjacent piece is near loop top height.`);
        }
    });

    return warnings;
}

function _publishMap() {
    const mapData = mapToJSON();
    if (!mapData.pieces || mapData.pieces.length === 0) {
        toast('Add some pieces first', true); return;
    }
    const warnings = validateTrack();
    if (warnings.length > 0) {
        const proceed = confirm('Validation warnings:\n\n' + warnings.join('\n') + '\n\nPublish anyway?');
        if (!proceed) return;
    }
    document.getElementById('pubMapName').value  = mapData.name || '';
    document.getElementById('pubMapDesc').value  = '';
    document.getElementById('pubMapTags').value  = '';
    document.getElementById('publishModal').style.display = 'flex';
}

async function _doPublish() {
    document.getElementById('publishModal').style.display = 'none';
    const mapData   = mapToJSON();
    mapData.name    = (document.getElementById('pubMapName').value.trim() || mapData.name || 'Untitled').slice(0, 64);
    const description = document.getElementById('pubMapDesc').value.trim();
    const tags        = document.getElementById('pubMapTags').value.trim();
    const thumbnail   = _captureThumbnail();
    const res = await fetch('/marbles/api/map/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map: mapData, description, tags, thumbnail }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Publish failed', true); return; }
    _clearAutoSaveKey();
    toast('Published to library! 🎉');
}

async function _browseMaps() {
    const modal = document.getElementById('mapBrowserModal');
    const list  = document.getElementById('mapBrowserList');
    list.innerHTML = '<div style="padding:40px;text-align:center;color:#555;font-size:13px;">Loading…</div>';
    modal.style.display = 'flex';

    const res = await fetch('/marbles/api/maps');
    if (!res.ok) {
        list.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;font-size:13px;">Failed to load maps.</div>';
        return;
    }
    const maps = await res.json();
    if (!maps.length) {
        list.innerHTML = '<div style="padding:40px;text-align:center;color:#555;font-size:13px;">No maps published yet. Be the first!</div>';
        return;
    }

    list.innerHTML = maps.map(m => {
        const thumb = m.thumbnail
            ? `<img src="${_esc(m.thumbnail)}" style="width:80px;height:50px;object-fit:cover;border-radius:5px;flex-shrink:0;border:1px solid #1e1e2e;" alt="">`
            : `<div style="width:80px;height:50px;flex-shrink:0;background:#0a0a12;border:1px solid #1a1a2a;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#222;">🗺️</div>`;
        return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#0d0d14;border:1px solid #1e1e2e;border-radius:8px;">
            ${thumb}
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(m.name)}</div>
                <div style="font-size:11px;color:#555;margin-top:2px;">
                    by <span style="color:#888;">${_esc(m.author_login || 'unknown')}</span>
                    &nbsp;·&nbsp; ${m.piece_count || 0} pieces
                    ${m.play_count ? `&nbsp;·&nbsp; ${m.play_count} plays` : ''}
                </div>
                ${m.description ? `<div style="font-size:11px;color:#666;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(m.description)}</div>` : ''}
            </div>
            <button class="me-btn" onclick="_loadMapFromLibrary('${m.map_id}')" style="flex-shrink:0;font-size:11px;">Load</button>
        </div>`;
    }).join('');
}

function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function _loadMapFromLibrary(map_id) {
    const res = await fetch(`/marbles/api/map/${map_id}`);
    if (!res.ok) { toast('Failed to load map', true); return; }
    const data = await res.json();
    const mapObj = typeof data.map_data === 'string' ? JSON.parse(data.map_data) : data.map_data;
    if (!mapObj || !mapObj.pieces) { toast('Invalid map data', true); return; }
    if (placedObjects.length > 0 && !confirm(`Load "${data.name}"? This will replace your current map.`)) return;
    loadFromJSON(mapObj);
    document.getElementById('mapName').value = data.name || 'Untitled';
    document.getElementById('mapBrowserModal').style.display = 'none';
    toast(`Loaded "${data.name}" 📦`);
}

async function _testRace() {
    // If map is empty, load the demo first and bail so user can see it
    if (placedObjects.length === 0) {
        loadFromJSON(DEMO_MAP);
        toast('Demo map loaded — press Test Race again to play');
        return;
    }
    const res = await fetch('/marbles/api/game/test-race', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Test race failed', true); return; }
    const mapData = mapToJSON();
    const restore = { session_id: data.session.id, map: mapData };
    sessionStorage.setItem('marbles_pending_race', JSON.stringify(restore));
    sessionStorage.setItem('marbles_restore',      JSON.stringify(restore));
    window.location.href = '/apps/marble-play';
}

function generateRandomTrack() {
    if (placedObjects.length > 0 && !confirm('Replace current map with a randomly generated track?')) return;

    placedObjects.forEach(o => scene.remove(o.mesh));
    placedObjects = [];
    deselectObject();
    undoStack = []; redoStack = [];

    // Start high so gravity pulls marbles down the track naturally
    const START_HEIGHT = 22;
    const FLOOR_MIN    = 2;   // don't let track go below this

    let curX = 0, curZ = 0, curAngle = 0, curY = START_HEIGHT;

    const _r = a => THREE.MathUtils.degToRad(a);
    const fwdX = a => Math.sin(_r(a));
    const fwdZ = a => Math.cos(_r(a));

    function _addPiece(pieceId) {
        const def = PIECE_BY_ID[pieceId];
        if (!def) return;
        const isCorner = pieceId === 'corner_l' || pieceId === 'corner_r';
        const cx = isCorner ? curX : curX + fwdX(curAngle) * def.d / 2;
        const cz = isCorner ? curZ : curZ + fwdZ(curAngle) * def.d / 2;
        const rampAngle = def.defaultProps?.angle || 15;
        const rise = def.d * Math.tan(THREE.MathUtils.degToRad(rampAngle));

        const mesh = buildMeshForPiece(def);
        mesh.position.set(cx, curY + def.h / 2, cz);
        mesh.rotation.y = _r(curAngle);
        scene.add(mesh);
        placedObjects.push({ id: genId(), mesh, pieceId, pos: { x: cx, y: curY, z: cz }, rot: curAngle, props: { ...def.defaultProps } });

        // Advance cursor
        const ro = _r(curAngle);
        const cosR = Math.cos(ro), sinR = Math.sin(ro);
        if (pieceId === 'corner_l') {
            curX += 8 * (cosR + sinR);
            curZ += 8 * (cosR - sinR);
            curAngle = (curAngle + 90) % 360;
        } else if (pieceId === 'corner_r') {
            curX += -8 * (cosR - sinR);
            curZ += 8 * (sinR + cosR);
            curAngle = (curAngle - 90 + 360) % 360;
        } else {
            curX += fwdX(curAngle) * def.d;
            curZ += fwdZ(curAngle) * def.d;
            if (pieceId === 'ramp_up')     curY += rise;
            if (pieceId === 'ramp_down')   curY -= rise;
            if (pieceId === 'staircase')   curY -= 2.75;
            if (pieceId === 'corkscrew')   curY -= (PIECES['corkscrew']?.defaultProps?.drop ?? 4);
            if (pieceId === 'ramp_spiral') curY += (PIECES['ramp_spiral']?.defaultProps?.rise ?? 6);
        }
    }

    _addPiece('start');

    // First ramp: always descend from the elevated start
    _addPiece('ramp_down');

    const N = 16 + Math.floor(Math.random() * 6);
    let noCorner = 0, lastPiece = 'ramp_down';
    for (let i = 0; i < N; i++) {
        const progress   = i / N;
        const heightLeft = curY - FLOOR_MIN;

        // Base pool for mid-track: mostly straights + corners + descenders
        let pool = noCorner > 0
            ? ['straight', 'straight', 'straight', 'half_pipe', 's_curve']
            : ['straight', 'straight', 'straight', 'corner_l', 'corner_r',
               'ramp_down', 'ramp_down', 'half_pipe', 's_curve', 'staircase', 'corkscrew'];

        // Add ramp_up only when: still early in track, enough height left to also come back down
        if (progress < 0.55 && heightLeft > 10) pool.push('ramp_up', 'ramp_spiral');

        // Drop-limiting: don't go below floor
        if (curY <= FLOOR_MIN + 2) pool = pool.filter(p => p !== 'ramp_down' && p !== 'staircase' && p !== 'corkscrew');

        // No two consecutive ascenders or descenders
        if (lastPiece === 'ramp_up' || lastPiece === 'ramp_spiral')
            pool = pool.filter(p => p !== 'ramp_up' && p !== 'ramp_spiral' && p !== 'staircase');
        if (lastPiece === 'ramp_down' || lastPiece === 'corkscrew' || lastPiece === 'staircase')
            pool = pool.filter(p => p !== 'ramp_down' && p !== 'corkscrew' && p !== 'staircase');

        if (!pool.length) pool = ['straight'];

        const pieceId = pool[Math.floor(Math.random() * pool.length)];
        if (pieceId === 'corner_l' || pieceId === 'corner_r') noCorner = 2;
        else noCorner = Math.max(0, noCorner - 1);
        lastPiece = pieceId;
        _addPiece(pieceId);
    }
    _addPiece('finish');

    // Re-center camera on generated track
    const xs = placedObjects.map(o => o.pos.x);
    const zs = placedObjects.map(o => o.pos.z);
    const ys = placedObjects.map(o => o.pos.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    controls.target.set(cx, midY, cz);
    camera.position.set(cx, Math.max(60, START_HEIGHT + size * 0.5), cz + Math.max(80, size * 0.6));

    document.getElementById('mapName').value = 'Generated Track';
    updateStatusBar();
    toast(`Generated ${placedObjects.length} pieces!`);
}

function _checkLibraryLoad() {
    // Show autosave recovery banner if unsaved work exists (before loading anything)
    _checkAutoSaveRecovery();

    const raw = sessionStorage.getItem('marbles_load_map');
    if (!raw) {
        // Fresh editor with no map — load demo so there's something to look at
        if (placedObjects.length === 0) loadFromJSON(DEMO_MAP);
        return;
    }
    sessionStorage.removeItem('marbles_load_map');
    try {
        loadFromJSON(JSON.parse(raw));
        toast('Map loaded from library');
    } catch (_) { toast('Failed to load map', true); }
}

// ===================================================================
// BOOT
// ===================================================================
// Expose functions used by inline onclick attributes (module scope ≠ global)
window.ME_switchTab          = ME_switchTab;
window._lobbyKick            = _lobbyKick;
window.setLayer              = setLayer;
window._loadMapFromLibrary   = _loadMapFromLibrary;

_rosterInit();
_initLobbyHandlers();
_restoreSession();
init(); // _checkLibraryLoad() is called at the end of init() once scene exists

// Auto-load a map from library if ?load=<map_id> is in the URL
(async () => {
    const loadId = new URLSearchParams(location.search).get('load');
    if (loadId) await _loadMapFromLibrary(loadId);
})();
