/**
 * colliderBuilder.js — Marble Race Physics
 * Converts map pieces into cannon-es rigid bodies.
 * All pieces use CANNON.Box primitives (no Trimesh) to avoid cannon-es
 * trimesh-on-trimesh limitation. Corners and loops use arc-segmented boxes.
 */
import * as CANNON from 'cannon-es';

// ── Materials ────────────────────────────────────────────────────────────────
export const MAT_TRACK       = new CANNON.Material('track');
export const MAT_MARBLE      = new CANNON.Material('marble');
export const MAT_BOUNCY      = new CANNON.Material('bouncy');
export const MAT_ICE         = new CANNON.Material('ice');
export const MAT_MUD         = new CANNON.Material('mud');
export const MAT_TRAMPOLINE  = new CANNON.Material('trampoline');
export const MAT_STICKY      = new CANNON.Material('sticky');

// Contact materials are registered on the world in play.js
export function makeContactMaterials() {
    return [
        // Marble ↔ Track — normal rolling
        new CANNON.ContactMaterial(MAT_MARBLE, MAT_TRACK, {
            friction: 0.4, restitution: 0.25
        }),
        // Marble ↔ Bouncy (bongo pad)
        new CANNON.ContactMaterial(MAT_MARBLE, MAT_BOUNCY, {
            friction: 0.1, restitution: 3.2
        }),
        // Marble ↔ Ice (ice zone)
        new CANNON.ContactMaterial(MAT_MARBLE, MAT_ICE, {
            friction: 0.01, restitution: 0.15
        }),
        // Marble ↔ Mud
        new CANNON.ContactMaterial(MAT_MARBLE, MAT_MUD, {
            friction: 0.95, restitution: 0.05
        }),
        // Marble ↔ Trampoline — extreme bounce
        new CANNON.ContactMaterial(MAT_MARBLE, MAT_TRAMPOLINE, {
            friction: 0.05, restitution: 4.5
        }),
        // Marble ↔ Sticky — near-zero restitution, very high friction
        new CANNON.ContactMaterial(MAT_MARBLE, MAT_STICKY, {
            friction: 2.5, restitution: 0.0
        }),
    ];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Degrees to radians */
const D2R = Math.PI / 180;

/**
 * Build a static box body.
 * @param {number} hx half-extent X
 * @param {number} hy half-extent Y
 * @param {number} hz half-extent Z
 * @param {number} px world position X
 * @param {number} py world position Y
 * @param {number} pz world position Z
 * @param {CANNON.Quaternion} [quat] optional rotation
 * @param {CANNON.Material} [mat]
 */
function box(hx, hy, hz, px, py, pz, quat = null, mat = MAT_TRACK) {
    const body = new CANNON.Body({ mass: 0, material: mat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    body.position.set(px, py, pz);
    if (quat) body.quaternion.copy(quat);
    return body;
}

/** Create a CANNON.Quaternion from axis-angle */
function quatFromAxisAngle(ax, ay, az, radians) {
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(ax, ay, az), radians);
    return q;
}

/** Compose two CANNON.Quaternion (a then b) */
function quatMul(a, b) {
    const q = new CANNON.Quaternion();
    a.mult(b, q);
    return q;
}

/** Apply a piece's Y-axis rotation to a local offset vector */
function rotateVec(x, z, rotDeg) {
    const r = rotDeg * D2R;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return { x: cos * x - sin * z, z: sin * x + cos * z };
}

/** Piece world-center Y: pos.y is the floor level, physicsY is floor + wallHalfH */
function floorY(piecePos, halfH) { return piecePos.y + halfH; }

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Convert one map piece → array of CANNON.Body (static).
 * @param {{ pieceId, pos, rot, props }} piece  — from mapToJSON()
 * @returns {CANNON.Body[]}
 */
export function buildColliders(piece) {
    const { pieceId, pos, rot = 0, props = {} } = piece;
    const bodies = [];

    switch (pieceId) {

        // ── STRAIGHT ────────────────────────────────────────────────────────
        case 'straight': {
            // Floor: w=4, d=16, h=0.4 → halfExtents (2, 0.2, 8)
            const baseY = floorY(pos, 0.2);
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);

            // Floor
            const floorOffset = rotateVec(0, 0, rot);
            bodies.push(box(2, 0.2, 8,
                pos.x + floorOffset.x, baseY, pos.z + floorOffset.z, yQ));

            // Left wall
            const wallH = 0.6;
            const lwOffset = rotateVec(-2.3, 0, rot);
            bodies.push(box(0.15, wallH, 8,
                pos.x + lwOffset.x, baseY + wallH, pos.z + lwOffset.z, yQ));

            // Right wall
            const rwOffset = rotateVec(2.3, 0, rot);
            bodies.push(box(0.15, wallH, 8,
                pos.x + rwOffset.x, baseY + wallH, pos.z + rwOffset.z, yQ));
            break;
        }

        // ── RAMP UP / RAMP DOWN ─────────────────────────────────────────────
        case 'ramp_up':
        case 'ramp_down': {
            const angle = (props.angle ?? 15) * D2R;
            const sign  = pieceId === 'ramp_up' ? 1 : -1;
            // d=12 → half=6. The ramp floor sits tilted around X.
            const halfLen = 6;
            const yRot  = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const xRot  = quatFromAxisAngle(1, 0, 0, -sign * angle);
            const q     = quatMul(yRot, xRot);

            // Centre Y shifts so the low end stays at pos.y
            const centerY = pos.y + Math.sin(angle) * halfLen * sign * 0.5 + 0.2;
            const offset  = rotateVec(0, 0, rot);
            bodies.push(box(2, 0.2, halfLen,
                pos.x + offset.x, centerY, pos.z + offset.z, q));

            // Walls (vertical, follow the ramp rotation)
            const wallH = 0.6;
            const lw = rotateVec(-2.3, 0, rot);
            const rw = rotateVec( 2.3, 0, rot);
            bodies.push(box(0.15, wallH, halfLen,
                pos.x + lw.x, centerY + wallH * 0.5, pos.z + lw.z, q));
            bodies.push(box(0.15, wallH, halfLen,
                pos.x + rw.x, centerY + wallH * 0.5, pos.z + rw.z, q));
            break;
        }

        // ── CORNER LEFT / CORNER RIGHT ──────────────────────────────────────
        case 'corner_l':
        case 'corner_r': {
            /*  The visual mesh uses:
                  radius = 8, trackW = 4, rInner = 6, rOuter = 10
                  For leftTurn sign=+1: cx = +radius, arc goes cos/sin 0…PI/2
                  For rightTurn sign=-1: cx = -radius
                Approximate with 8 arc-segmented box segments.        */
            const segs  = 8;
            const leftTurn = pieceId === 'corner_l';
            const sign  = leftTurn ? 1 : -1;
            const R     = 8;   // arc centre radius
            const trackW = 4;
            const floorThick = 0.2;

            const pieceYRot = quatFromAxisAngle(0, 1, 0, rot * D2R);

            for (let i = 0; i < segs; i++) {
                const t0 = (i / segs) * Math.PI * 0.5;
                const t1 = ((i + 1) / segs) * Math.PI * 0.5;
                const tm = (t0 + t1) * 0.5;

                // Arc centre in piece-local space
                const cx_local = sign * R;
                const segCX = cx_local - sign * Math.cos(tm) * R;
                const segCZ = Math.sin(tm) * R;

                // Segment half-lengths
                const arcLen = R * (t1 - t0);
                const halfArc = arcLen * 0.5 + 0.1; // slight overlap

                // Segment Y rotation
                const segAngle = sign * tm;
                const segYQ = quatFromAxisAngle(0, 1, 0, segAngle);
                const combinedQ = quatMul(pieceYRot, segYQ);

                // Rotate segment centre by piece rotation
                const rotated = rotateVec(segCX, segCZ, rot);
                const wx = pos.x + rotated.x;
                const wy = floorY(pos, floorThick);
                const wz = pos.z + rotated.z;

                // Floor segment
                bodies.push(box(trackW / 2, floorThick, halfArc, wx, wy, wz, combinedQ));

                // Inner wall
                const wallH = 0.6;
                const innerR = (R - trackW / 2) - 0.3;
                const innCX = cx_local - sign * Math.cos(tm) * innerR;
                const innCZ = -Math.sin(tm) * innerR;
                const innRot = rotateVec(innCX, innCZ, rot);
                bodies.push(box(0.15, wallH, halfArc,
                    pos.x + innRot.x, wy + wallH, pos.z + innRot.z, combinedQ));

                // Outer wall
                const outerR = (R + trackW / 2) + 0.3;
                const outCX = cx_local - sign * Math.cos(tm) * outerR;
                const outCZ = -Math.sin(tm) * outerR;
                const outRot = rotateVec(outCX, outCZ, rot);
                bodies.push(box(0.15, wallH, halfArc,
                    pos.x + outRot.x, wy + wallH, pos.z + outRot.z, combinedQ));
            }
            break;
        }

        // ── BANKED CORNERS ───────────────────────────────────────────────────
        case 'bank_dl':
        case 'bank_dr':
        case 'bank_ul':
        case 'bank_ur': {
            // Same arc-segment floor as regular corners, with Y rise along the arc
            const leftTurn = (pieceId === 'bank_dl' || pieceId === 'bank_ul');
            const goingUp  = (pieceId === 'bank_ul' || pieceId === 'bank_ur');
            const sign     = leftTurn ? 1 : -1;
            const segs     = 8;
            const R        = 8;
            const trackW   = 4;
            const floorThick = 0.2;
            const angle    = (props.angle ?? 15) * D2R;
            const rise     = R * (Math.PI / 2) * Math.tan(angle);
            const pieceYRot = quatFromAxisAngle(0, 1, 0, rot * D2R);

            for (let i = 0; i < segs; i++) {
                const t0 = (i / segs) * Math.PI * 0.5;
                const t1 = ((i + 1) / segs) * Math.PI * 0.5;
                const tm = (t0 + t1) * 0.5;
                const t_frac = (goingUp ? tm : (Math.PI / 2 - tm)) / (Math.PI / 2);
                const segY = pos.y + rise * t_frac;

                const cx_local = sign * R;
                const segCX = cx_local - sign * Math.cos(tm) * R;
                const segCZ = -Math.sin(tm) * R;
                const arcLen = R * (t1 - t0);
                const halfArc = arcLen * 0.5 + 0.1;
                const segAngle = -sign * tm;
                const segYQ = quatFromAxisAngle(0, 1, 0, segAngle);
                const combinedQ = quatMul(pieceYRot, segYQ);
                const rotated = rotateVec(segCX, segCZ, rot);
                bodies.push(box(trackW / 2, floorThick, halfArc,
                    pos.x + rotated.x, segY + floorThick, pos.z + rotated.z, combinedQ));
            }
            break;
        }

        // ── FUNNEL ───────────────────────────────────────────────────────────
        case 'funnel': {
            // 4 angled walls + floor hole. w=10, d=10, h=4
            // Walls tilt inward ~25°
            const angle = 25 * D2R;
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const wallLen = 5; // half
            const wallW   = 0.2;
            const baseY   = pos.y + 2;

            const sides = [
                { axis: [1,0,0], sign: 1,  lx: 0, lz: wallLen },  // front wall (+Z side)
                { axis: [1,0,0], sign: -1, lx: 0, lz: wallLen },  // back wall  (-Z side)
                { axis: [0,0,1], sign: 1,  lx: wallLen, lz: 0 },  // right wall
                { axis: [0,0,1], sign: -1, lx: wallLen, lz: 0 },  // left wall
            ];

            const offsets = [
                { x: 0,       z:  5, rax: 1, rsign:  1 },
                { x: 0,       z: -5, rax: 1, rsign: -1 },
                { x:  5,      z: 0,  rax: 0, rsign: -1 },
                { x: -5,      z: 0,  rax: 0, rsign:  1 },
            ];

            offsets.forEach(({ x, z, rax, rsign }) => {
                const tiltQ = quatFromAxisAngle(
                    rax === 1 ? 1 : 0, 0, rax === 0 ? 1 : 0,
                    rsign * angle
                );
                const combinedQ = quatMul(yQ, tiltQ);
                const ro = rotateVec(x, z, rot);
                bodies.push(box(wallLen, 0.2, wallLen,
                    pos.x + ro.x, baseY, pos.z + ro.z, combinedQ));
            });

            // Bottom floor
            const floorOff = rotateVec(0, 0, rot);
            bodies.push(box(1.5, 0.2, 1.5,
                pos.x + floorOff.x, pos.y + 0.2, pos.z + floorOff.z, yQ));
            break;
        }

        // ── START ────────────────────────────────────────────────────────────
        case 'start': {
            // Thin invisible floor so spawned marbles land; no walls/blocking geometry
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(2, 0.1, 3, pos.x, pos.y + 0.1, pos.z, yQ));
            break;
        }

        // ── FINISH ───────────────────────────────────────────────────────────
        case 'finish': {
            // No physical body — trigger detection via AABB in checkFinish(); marbles pass through freely
            break;
        }

        // ── BOOST PAD ────────────────────────────────────────────────────────
        case 'boost_pad': {
            // Thin floor — boost effect applied in effectsHandler
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(2, 0.1, 2, pos.x, pos.y + 0.1, pos.z, yQ));
            break;
        }

        // ── BONGO PAD ────────────────────────────────────────────────────────
        case 'bongo_pad': {
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(2, 0.2, 2, pos.x, pos.y + 0.2, pos.z, yQ, MAT_BOUNCY));
            break;
        }

        // ── WIND BOX / NO GRAVITY ────────────────────────────────────────────
        case 'wind_box':
        case 'no_gravity': {
            // Volume-only triggers — no physical collider needed
            // effectsHandler reads piece positions directly
            break;
        }

        // ── DESTRUCTIBLE CUBE ────────────────────────────────────────────────
        case 'destruct_cube': {
            // Starts solid; removed from world when a marble hits it
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const b  = box(1, 1, 1, pos.x, pos.y + 1, pos.z, yQ);
            b._pieceRef = piece;  // effectsHandler uses this to track destruction
            bodies.push(b);
            break;
        }

        // ── ROTATING POST ────────────────────────────────────────────────────
        case 'rotating_post': {
            // Kinematic box arm — effectsHandler rotates it each frame
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const b  = box(0.4, 0.5, 4, pos.x, pos.y + 0.5, pos.z, yQ);
            b.type = CANNON.Body.KINEMATIC;
            b._pieceRef = piece;
            bodies.push(b);
            break;
        }

        // ── ICE ZONE ─────────────────────────────────────────────────────────
        case 'ice_zone': {
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(3, 0.1, 3, pos.x, pos.y + 0.1, pos.z, yQ, MAT_ICE));
            break;
        }

        // ── MUD ZONE ─────────────────────────────────────────────────────────
        case 'mud_zone': {
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(3, 0.1, 3, pos.x, pos.y + 0.1, pos.z, yQ, MAT_MUD));
            break;
        }

        // ── BUMPER ───────────────────────────────────────────────────────────
        case 'bumper': {
            // Sphere collider with very high restitution
            const b = new CANNON.Body({ mass: 0, material: MAT_BOUNCY });
            b.addShape(new CANNON.Sphere(1));
            b.position.set(pos.x, pos.y + 1, pos.z);
            bodies.push(b);
            break;
        }

        // ── PIPE ─────────────────────────────────────────────────────────────
        case 'pipe': {
            // Tunnel: 6 flat box panels forming a hexagonal prism (d=16)
            const segs = 6;
            const R    = 2.2;  // inner radius of pipe
            const yQ   = quatFromAxisAngle(0, 1, 0, rot * D2R);

            for (let i = 0; i < segs; i++) {
                const angle = (i / segs) * Math.PI * 2;
                const panelX = Math.cos(angle) * R;
                const panelY = Math.sin(angle) * R;
                const panelRot = quatFromAxisAngle(0, 0, 1, angle);
                const combinedQ = quatMul(yQ, panelRot);
                const ro = rotateVec(panelX, 0, rot);
                bodies.push(box(0.15, 8, 0.15,
                    pos.x + ro.x, pos.y + panelY, pos.z, combinedQ));
            }
            break;
        }

        // ── LOOP ─────────────────────────────────────────────────────────────
        case 'loop': {
            // 16 arc-segmented boxes forming a full vertical circle
            const segs = 16;
            const loopR = 4;
            const trackW = 2;
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);

            for (let i = 0; i < segs; i++) {
                const t0 = (i / segs) * Math.PI * 2;
                const t1 = ((i + 1) / segs) * Math.PI * 2;
                const tm = (t0 + t1) * 0.5;

                const segCX_local = Math.sin(tm) * loopR;
                const segCY = pos.y + loopR + Math.cos(tm) * (-loopR);  // loop centre at pos.y + loopR

                // Rotate this segment around Z axis
                const segQ = quatFromAxisAngle(0, 0, 1, tm);
                const combinedQ = quatMul(yQ, segQ);

                const arcLen = loopR * (t1 - t0);
                const halfArc = arcLen * 0.5 + 0.1;

                const ro = rotateVec(segCX_local, 0, rot);
                bodies.push(box(trackW / 2, 0.2, halfArc,
                    pos.x + ro.x, segCY, pos.z, combinedQ));
            }
            break;
        }

        // ── BRIDGE ───────────────────────────────────────────────────────────
        case 'bridge': {
            // 3-segment approximation with slight sag
            const segments = [
                { oz: -5.3, angle: -5 * D2R },
                { oz:  0,   angle:  0 },
                { oz:  5.3, angle:  5 * D2R },
            ];
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            segments.forEach(({ oz, angle }) => {
                const xQ = quatFromAxisAngle(1, 0, 0, angle);
                const q  = quatMul(yQ, xQ);
                const off = rotateVec(0, oz, rot);
                bodies.push(box(2, 0.2, 2.8,
                    pos.x + off.x, pos.y + 0.2, pos.z + off.z, q));
                // Walls
                const lw = rotateVec(-2.3, oz, rot);
                const rw = rotateVec( 2.3, oz, rot);
                bodies.push(box(0.15, 0.6, 2.8, pos.x + lw.x, pos.y + 0.8, pos.z + lw.z, q));
                bodies.push(box(0.15, 0.6, 2.8, pos.x + rw.x, pos.y + 0.8, pos.z + rw.z, q));
            });
            break;
        }

        // ── HAMMER ───────────────────────────────────────────────────────────
        case 'hammer': {
            // Kinematic rotating arm — effectsHandler rotates it
            const b = new CANNON.Body({ mass: 0, material: MAT_TRACK });
            b.addShape(new CANNON.Box(new CANNON.Vec3(0.4, 0.4, 3)));
            b.position.set(pos.x, pos.y + 3, pos.z);
            b.type = CANNON.Body.KINEMATIC;
            b._pieceRef = piece;
            bodies.push(b);
            break;
        }

        // ── LASER ────────────────────────────────────────────────────────────
        case 'laser': {
            // No physical body — effectsHandler manages the visual beam and marble knockback
            break;
        }

        // ── SPRING ───────────────────────────────────────────────────────────
        case 'spring': {
            // Flat angled pad — effectsHandler applies launch impulse on contact
            const yQ    = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const tiltQ = quatFromAxisAngle(1, 0, 0, -30 * D2R);
            const q     = quatMul(yQ, tiltQ);
            const off   = rotateVec(0, 0, rot);
            const b     = box(2, 0.2, 2, pos.x + off.x, pos.y + 0.5, pos.z + off.z, q);
            b._pieceRef = piece;
            bodies.push(b);
            break;
        }

        // ── MOVING PLATFORM ─────────────────────────────────────────────────
        case 'moving_platform': {
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const b  = box(3, 0.2, 3, pos.x, pos.y + 0.2, pos.z, yQ);
            b.type = CANNON.Body.KINEMATIC;
            b._pieceRef = piece;
            bodies.push(b);
            break;
        }

        // ── TELEPORTER ───────────────────────────────────────────────────────
        case 'teleporter': {
            // Flat platform — effectsHandler detects overlap and teleports marble
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(1.5, 0.2, 1.5, pos.x, pos.y + 0.2, pos.z, yQ));
            break;
        }

        // ── CHECKPOINT ───────────────────────────────────────────────────────
        case 'checkpoint': {
            // Flat gate — gameController tracks which marbles have passed
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(3, 0.1, 0.2, pos.x, pos.y + 0.1, pos.z, yQ));
            break;
        }

        // ── WIDE STRAIGHT ────────────────────────────────────────────────────
        case 'straight_wide': {
            const baseY = floorY(pos, 0.2);
            const yQ    = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(4, 0.2, 8, pos.x, baseY, pos.z, yQ));
            const wallH = 0.6;
            const lw = rotateVec(-4.3, 0, rot);
            bodies.push(box(0.15, wallH, 8, pos.x + lw.x, baseY + wallH, pos.z + lw.z, yQ));
            const rw = rotateVec(4.3, 0, rot);
            bodies.push(box(0.15, wallH, 8, pos.x + rw.x, baseY + wallH, pos.z + rw.z, yQ));
            break;
        }

        // ── NARROW STRAIGHT ──────────────────────────────────────────────────
        case 'straight_narrow': {
            const baseY = floorY(pos, 0.2);
            const yQ    = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(1, 0.2, 8, pos.x, baseY, pos.z, yQ));
            const wallH = 0.9;
            const lw = rotateVec(-1.3, 0, rot);
            bodies.push(box(0.15, wallH, 8, pos.x + lw.x, baseY + wallH, pos.z + lw.z, yQ));
            const rw = rotateVec(1.3, 0, rot);
            bodies.push(box(0.15, wallH, 8, pos.x + rw.x, baseY + wallH, pos.z + rw.z, yQ));
            break;
        }

        // ── HALF-PIPE ────────────────────────────────────────────────────────
        case 'half_pipe': {
            const baseY = floorY(pos, 0.2);
            const yQ    = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(1.75, 0.2, 8, pos.x, baseY, pos.z, yQ));
            const wallH = 1.5;
            const lw = rotateVec(-2.1, 0, rot);
            bodies.push(box(0.2, wallH, 8, pos.x + lw.x, baseY + wallH, pos.z + lw.z, yQ));
            const rw = rotateVec(2.1, 0, rot);
            bodies.push(box(0.2, wallH, 8, pos.x + rw.x, baseY + wallH, pos.z + rw.z, yQ));
            break;
        }

        // ── CROSSROADS ───────────────────────────────────────────────────────
        case 'crossroads': {
            const baseY = floorY(pos, 0.2);
            // Z-direction arm
            const yQ  = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(2, 0.2, 8, pos.x, baseY, pos.z, yQ));
            // X-direction arm (perpendicular)
            const yQ2 = quatFromAxisAngle(0, 1, 0, (rot + 90) * D2R);
            bodies.push(box(2, 0.2, 8, pos.x, baseY, pos.z, yQ2));
            // Walls for Z-arm
            const wallH = 0.6;
            const lwZ = rotateVec(-2.3, 0, rot);
            bodies.push(box(0.15, wallH, 8, pos.x + lwZ.x, baseY + wallH, pos.z + lwZ.z, yQ));
            const rwZ = rotateVec( 2.3, 0, rot);
            bodies.push(box(0.15, wallH, 8, pos.x + rwZ.x, baseY + wallH, pos.z + rwZ.z, yQ));
            // Walls for X-arm
            const lwX = rotateVec(-2.3, 0, rot + 90);
            bodies.push(box(0.15, wallH, 8, pos.x + lwX.x, baseY + wallH, pos.z + lwX.z, yQ2));
            const rwX = rotateVec( 2.3, 0, rot + 90);
            bodies.push(box(0.15, wallH, 8, pos.x + rwX.x, baseY + wallH, pos.z + rwX.z, yQ2));
            break;
        }

        // ── S-CURVE ───────────────────────────────────────────────────────────
        case 's_curve': {
            // Approximate S-curve with 6 straight box segments following the sinusoidal path
            const segs  = 6;
            const d     = 16;
            const bulge = 4;
            const yQ    = quatFromAxisAngle(0, 1, 0, rot * D2R);
            for (let i = 0; i < segs; i++) {
                const t0   = i / segs, t1 = (i + 1) / segs, tm = (t0 + t1) * 0.5;
                const z0   = -d / 2 + t0 * d, z1 = -d / 2 + t1 * d, zm = -d / 2 + tm * d;
                const x0   = bulge * Math.sin(Math.PI * t0), x1 = bulge * Math.sin(Math.PI * t1);
                const xm   = bulge * Math.sin(Math.PI * tm);
                const segDZ = (z1 - z0), segDX = (x1 - x0);
                const segAngle = Math.atan2(segDX, segDZ);
                const segLen   = Math.sqrt(segDX * segDX + segDZ * segDZ);
                const segQ     = quatMul(yQ, quatFromAxisAngle(0, 1, 0, segAngle));
                const ro       = rotateVec(xm, zm, rot);
                const baseY    = floorY(pos, 0.2);
                bodies.push(box(2, 0.2, segLen / 2 + 0.1, pos.x + ro.x, baseY, pos.z + ro.z, segQ));
                const wallH = 0.6;
                const lDir  = { x: -Math.cos(segAngle), z:  Math.sin(segAngle) };
                const rDir  = { x:  Math.cos(segAngle), z: -Math.sin(segAngle) };
                const scaleL = 2.3, scaleR = 2.3;
                const lLoc = rotateVec(xm + lDir.x * scaleL, zm + lDir.z * scaleL, rot);
                const rLoc = rotateVec(xm + rDir.x * scaleR, zm + rDir.z * scaleR, rot);
                bodies.push(box(0.15, wallH, segLen / 2 + 0.1,
                    pos.x + lLoc.x, baseY + wallH, pos.z + lLoc.z, segQ));
                bodies.push(box(0.15, wallH, segLen / 2 + 0.1,
                    pos.x + rLoc.x, baseY + wallH, pos.z + rLoc.z, segQ));
            }
            break;
        }

        // ── TUBE CURVE (enclosed pipe corner) ────────────────────────────────
        case 'tube_curve_l':
        case 'tube_curve_r': {
            // Same arc-segment floor as regular corners + tighter walls (enclosed pipe feel)
            const segs     = 8;
            const leftTurn = pieceId === 'tube_curve_l';
            const sign     = leftTurn ? 1 : -1;
            const R        = 8;
            const trackW   = 4;
            const floorThick = 0.2;
            const pieceYRot  = quatFromAxisAngle(0, 1, 0, rot * D2R);
            for (let i = 0; i < segs; i++) {
                const t0 = (i / segs) * Math.PI * 0.5;
                const t1 = ((i + 1) / segs) * Math.PI * 0.5;
                const tm = (t0 + t1) * 0.5;
                const cx_local = sign * R;
                const segCX    = cx_local - sign * Math.cos(tm) * R;
                const segCZ    = Math.sin(tm) * R;
                const arcLen   = R * (t1 - t0);
                const halfArc  = arcLen * 0.5 + 0.1;
                const segAngle = sign * tm;
                const segYQ    = quatFromAxisAngle(0, 1, 0, segAngle);
                const combinedQ = quatMul(pieceYRot, segYQ);
                const rotated   = rotateVec(segCX, segCZ, rot);
                const wx = pos.x + rotated.x, wy = floorY(pos, floorThick), wz = pos.z + rotated.z;
                // Floor
                bodies.push(box(trackW / 2, floorThick, halfArc, wx, wy, wz, combinedQ));
                // Tighter walls for enclosed feel
                const wallH  = 0.7;
                const innerR = (R - trackW / 2) - 0.3;
                const outerR = (R + trackW / 2) + 0.3;
                const innCX  = cx_local - sign * Math.cos(tm) * innerR;
                const innCZ  = -Math.sin(tm) * innerR;
                const outCX  = cx_local - sign * Math.cos(tm) * outerR;
                const outCZ  = -Math.sin(tm) * outerR;
                const innRot = rotateVec(innCX, innCZ, rot);
                const outRot = rotateVec(outCX, outCZ, rot);
                bodies.push(box(0.15, wallH, halfArc, pos.x + innRot.x, wy + wallH, pos.z + innRot.z, combinedQ));
                bodies.push(box(0.15, wallH, halfArc, pos.x + outRot.x, wy + wallH, pos.z + outRot.z, combinedQ));
            }
            break;
        }

        // ── STAIRCASE ────────────────────────────────────────────────────────
        case 'staircase': {
            const yQ       = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const numSteps = 5;
            const stepDrop = 0.55;
            for (let i = 0; i < numSteps; i++) {
                const localZ = -5 + (i + 0.5) * 2;  // def.d=10, 5 steps of depth 2
                const stepY  = pos.y + 0.2 - i * stepDrop;
                const off    = rotateVec(0, localZ, rot);
                bodies.push(box(2, 0.2, 1.1, pos.x + off.x, stepY, pos.z + off.z, yQ));
                const wallH = stepDrop + 0.4;
                const lw    = rotateVec(-2.3, localZ, rot);
                const rw    = rotateVec( 2.3, localZ, rot);
                bodies.push(box(0.15, wallH, 1.1, pos.x + lw.x, stepY + wallH * 0.5, pos.z + lw.z, yQ));
                bodies.push(box(0.15, wallH, 1.1, pos.x + rw.x, stepY + wallH * 0.5, pos.z + rw.z, yQ));
            }
            break;
        }

        // ── DRAWBRIDGE (starts vertical/blocking, opens flat after delay) ────
        case 'drawbridge': {
            const d2 = 6, w2 = 3;
            const rotRad = rot * D2R;
            const flatY  = pos.y + 0.15;
            // Build body at θ=π/2 (blocking position)
            const hX    = Math.sin(rotRad) * d2;
            const hZ    = -Math.cos(rotRad) * d2;
            const yQ    = quatFromAxisAngle(0, 1, 0, rotRad);
            const tiltQ = quatFromAxisAngle(-Math.cos(rotRad), 0, Math.sin(rotRad), -Math.PI / 2);
            const bodyQ = quatMul(tiltQ, yQ);
            const body  = new CANNON.Body({ mass: 0, material: MAT_TRACK });
            body.addShape(new CANNON.Box(new CANNON.Vec3(w2, 0.15, d2)));
            body.position.set(pos.x + hX, flatY + d2, pos.z + hZ);
            body.quaternion.copy(bodyQ);
            bodies.push(body);
            break;
        }

        // ── CATAPULT (kinematic platform that launches marbles upward) ───────
        case 'catapult': {
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(3, 0.2, 3, pos.x, pos.y + 0.2, pos.z, yQ));
            break;
        }

        // ── DIVING BOARD (kinematic wobbling beam) ───────────────────────────
        case 'diving_board': {
            const yQ  = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const off = rotateVec(0, 0, rot);
            bodies.push(box(0.75, 0.15, 5, pos.x + off.x, pos.y + 0.15, pos.z + off.z, yQ));
            break;
        }

        // ── BANK TURN (flat arc, floor tilted inward ~20°) ───────────────────
        case 'bank_turn_l':
        case 'bank_turn_r': {
            const leftTurn  = pieceId === 'bank_turn_l';
            const sign      = leftTurn ? 1 : -1;
            const R         = 8, bankDeg = 20, segs = 8;
            const bankRad   = bankDeg * D2R;
            const yQ        = quatFromAxisAngle(0, 1, 0, rot * D2R);
            for (let i = 0; i < segs; i++) {
                const t0 = (i / segs) * Math.PI / 2;
                const t1 = ((i + 1) / segs) * Math.PI / 2;
                const tm = (t0 + t1) * 0.5;
                const cx     = sign * R * (1 - Math.cos(tm));
                const cz     = R * Math.sin(tm);
                const arcLen = R * (t1 - t0);
                const halfArc = arcLen * 0.5 + 0.1;
                const segAngle = -sign * tm;
                const segYQ  = quatFromAxisAngle(0, 1, 0, segAngle);
                const bankQ  = quatFromAxisAngle(0, 0, 1, sign * bankRad);
                const segQ   = quatMul(quatMul(yQ, segYQ), bankQ);
                const rotated = rotateVec(cx, cz, rot);
                const wy = floorY(pos, 0.175);
                bodies.push(box(2, 0.175, halfArc, pos.x + rotated.x, wy, pos.z + rotated.z, segQ));
                // Outer guardrail
                const outerR = R + 2.5;
                const owx = sign * outerR * (1 - Math.cos(tm));
                const owz = outerR * Math.sin(tm);
                const owRot = rotateVec(owx, owz, rot);
                const wallH = 0.7;
                bodies.push(box(0.15, wallH, halfArc,
                    pos.x + owRot.x, pos.y + wallH, pos.z + owRot.z, quatMul(yQ, segYQ)));
            }
            break;
        }

        // ── RAMP SPIRAL (ascending helix) ─────────────────────────────────────
        case 'ramp_spiral': {
            const d    = 16;
            const R    = 6;
            const rise = props.rise ?? 6;
            const N    = 8;
            const yQ   = quatFromAxisAngle(0, 1, 0, rot * D2R);
            for (let i = 0; i < N; i++) {
                const t0 = (i / N) * Math.PI * 2;
                const t1 = ((i + 1) / N) * Math.PI * 2;
                const tm = (t0 + t1) * 0.5;
                const lx = -R * (1 - Math.cos(tm));
                const ly = rise * (tm / (Math.PI * 2));
                const lz = -d / 2 + (tm / (Math.PI * 2)) * d;
                const tx = R * Math.sin(tm), tz = d / (Math.PI * 2);
                const ty = rise / (Math.PI * 2);
                const hLen = (d / N) / 2 + 0.2;
                const yAngle = Math.atan2(tx, tz);
                const xzLen  = Math.sqrt(tx * tx + tz * tz);
                const xAngle = -Math.atan2(ty, xzLen);   // negative: ascending
                const segYQ  = quatMul(yQ, quatFromAxisAngle(0, 1, 0, yAngle));
                const segQ   = quatMul(segYQ, quatFromAxisAngle(1, 0, 0, xAngle));
                const worldOff = rotateVec(lx, lz, rot);
                bodies.push(box(2, 0.2, hLen,
                    pos.x + worldOff.x, pos.y + ly + 0.2, pos.z + worldOff.z, segQ));
            }
            break;
        }

        // ── VERTICAL DROP ─────────────────────────────────────────────────────
        case 'vertical_drop': {
            const angle   = (props.angle ?? 65) * D2R;
            const halfLen = 3;  // d=6
            const yRot    = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const xRot    = quatFromAxisAngle(1, 0, 0, angle);
            const q       = quatMul(yRot, xRot);
            const centerY = pos.y - Math.sin(angle) * halfLen * 0.5 + 0.2;
            const offset  = rotateVec(0, 0, rot);
            bodies.push(box(2, 0.2, halfLen, pos.x + offset.x, centerY, pos.z + offset.z, q));
            const wallH = 0.8;
            const lw = rotateVec(-2.3, 0, rot);
            const rw = rotateVec( 2.3, 0, rot);
            bodies.push(box(0.15, wallH, halfLen, pos.x + lw.x, centerY + wallH * 0.5, pos.z + lw.z, q));
            bodies.push(box(0.15, wallH, halfLen, pos.x + rw.x, centerY + wallH * 0.5, pos.z + rw.z, q));
            break;
        }

        // ── CORKSCREW ─────────────────────────────────────────────────────────
        case 'corkscrew': {
            const d    = 16;
            const R    = 4;
            const drop = props.drop ?? 4;
            const N    = 8;
            const yQ   = quatFromAxisAngle(0, 1, 0, rot * D2R);
            for (let i = 0; i < N; i++) {
                const t0 = (i / N) * Math.PI * 2;
                const t1 = ((i + 1) / N) * Math.PI * 2;
                const tm = (t0 + t1) * 0.5;
                const lx = -R * (1 - Math.cos(tm));
                const ly = -drop * (tm / (Math.PI * 2));
                const lz = -d / 2 + (tm / (Math.PI * 2)) * d;
                const tx = R * Math.sin(tm), tz = d / (Math.PI * 2);
                const ty = -drop / (Math.PI * 2);
                const hLen = (d / N) / 2 + 0.2;
                const yAngle  = Math.atan2(tx, tz);
                const xzLen   = Math.sqrt(tx * tx + tz * tz);
                const xAngle  = Math.atan2(-ty, xzLen);
                const segYQ   = quatMul(yQ, quatFromAxisAngle(0, 1, 0, yAngle));
                const segQ    = quatMul(segYQ, quatFromAxisAngle(1, 0, 0, xAngle));
                const worldOff = rotateVec(lx, lz, rot);
                bodies.push(box(2, 0.2, hLen,
                    pos.x + worldOff.x, pos.y + ly + 0.2, pos.z + worldOff.z, segQ));
            }
            break;
        }

        // ── PINBALL LANE ──────────────────────────────────────────────────────
        case 'pinball_lane': {
            const yQ    = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const baseY = floorY(pos, 0.2);
            const flOff = rotateVec(0, 0, rot);
            bodies.push(box(3, 0.2, 8, pos.x + flOff.x, baseY, pos.z + flOff.z, yQ));
            const wallH = 0.5;
            const lw = rotateVec(-3.25, 0, rot);
            const rw = rotateVec( 3.25, 0, rot);
            bodies.push(box(0.15, wallH, 8, pos.x + lw.x, baseY + wallH, pos.z + lw.z, yQ));
            bodies.push(box(0.15, wallH, 8, pos.x + rw.x, baseY + wallH, pos.z + rw.z, yQ));
            // Bumpers — spheres with bouncy material
            const bumpR = 0.5, spacing = 16 / 5;
            for (let i = 0; i < 4; i++) {
                const bz = -8 + spacing * (i + 1);
                const bx = (i % 2 === 0 ? 1 : -1) * 1.8;
                [bx, -bx].forEach(x => {
                    const bOff = rotateVec(x, bz, rot);
                    const b = new CANNON.Body({ mass: 0, material: MAT_BOUNCY });
                    b.addShape(new CANNON.Sphere(bumpR));
                    b.position.set(pos.x + bOff.x, pos.y + bumpR, pos.z + bOff.z);
                    bodies.push(b);
                });
            }
            break;
        }

        // ── FINISH RAMP ───────────────────────────────────────────────────────
        case 'finish_ramp': {
            const angle   = (props.angle ?? 8) * D2R;
            const halfLen = 6;  // d=12
            const yRot    = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const xRot    = quatFromAxisAngle(1, 0, 0, angle);
            const q       = quatMul(yRot, xRot);
            const centerY = pos.y - Math.sin(angle) * halfLen * 0.5 + 0.2;
            const offset  = rotateVec(0, 0, rot);
            bodies.push(box(5, 0.2, halfLen, pos.x + offset.x, centerY, pos.z + offset.z, q));
            const wallH = 0.7;
            const lw = rotateVec(-5.3, 0, rot);
            const rw = rotateVec( 5.3, 0, rot);
            bodies.push(box(0.15, wallH, halfLen, pos.x + lw.x, centerY + wallH * 0.5, pos.z + lw.z, q));
            bodies.push(box(0.15, wallH, halfLen, pos.x + rw.x, centerY + wallH * 0.5, pos.z + rw.z, q));
            break;
        }

        // ── BOWL ──────────────────────────────────────────────────────────────
        case 'bowl': {
            const panels  = 8;
            const R       = 4;   // w/2
            const wallH   = 4;   // h
            const tiltDeg = 50;
            bodies.push(box(1.5, 0.2, 1.5, pos.x, pos.y + 0.2, pos.z));
            for (let i = 0; i < panels; i++) {
                const am = ((i + 0.5) / panels) * Math.PI * 2;
                const px = Math.cos(am) * (R - 0.5);
                const pz = Math.sin(am) * (R - 0.5);
                const yQ = quatFromAxisAngle(0, 1, 0, -am);
                const xQ = quatFromAxisAngle(1, 0, 0, (90 - tiltDeg) * D2R);
                bodies.push(box((R * 0.85) / 2, 0.15, wallH / 2,
                    pos.x + px, pos.y + wallH / 2, pos.z + pz, quatMul(yQ, xQ)));
            }
            break;
        }

        // ── WALL JUMP ─────────────────────────────────────────────────────────
        case 'wall_jump': {
            const yQ    = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const gap   = 1.8, wallW = 0.5;
            const wallH = 4;
            // Thin floor
            const flOff = rotateVec(0, 0, rot);
            bodies.push(box(gap / 2, 0.15, 4, pos.x + flOff.x, pos.y + 0.15, pos.z + flOff.z, yQ));
            // Two tall side walls
            const lw = rotateVec(-(gap / 2 + wallW / 2), 0, rot);
            const rw = rotateVec(  gap / 2 + wallW / 2,  0, rot);
            bodies.push(box(wallW / 2, wallH / 2, 4, pos.x + lw.x, pos.y + wallH / 2, pos.z + lw.z, yQ));
            bodies.push(box(wallW / 2, wallH / 2, 4, pos.x + rw.x, pos.y + wallH / 2, pos.z + rw.z, yQ));
            break;
        }

        // ── TRAMPOLINE (extreme bounce pad) ──────────────────────────────────
        case 'trampoline': {
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(3, 0.25, 3, pos.x, pos.y + 0.25, pos.z, yQ, MAT_TRAMPOLINE));
            break;
        }

        // ── SLIPPERY SLOPE (ramp with ice material) ───────────────────────────
        case 'slippery_slope': {
            const angle = (props.angle ?? 15) * D2R;
            const d     = 12, halfLen = d / 2;
            const cosA  = Math.cos(angle), sinA = Math.sin(angle);
            const dZ    = halfLen * cosA, dY = halfLen * sinA;
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const xQ = quatFromAxisAngle(1, 0, 0, -angle);
            const fwd = rotateVec(0, halfLen, rot);
            bodies.push(box(2, 0.2, halfLen + 0.3,
                pos.x + fwd.x, pos.y + dY * 0.5, pos.z + fwd.z,
                quatMul(yQ, xQ), MAT_ICE));
            break;
        }

        // ── STICKY PAD (marble halts on contact) ─────────────────────────────
        case 'sticky_pad': {
            bodies.push(box(2, 0.1, 2, pos.x, pos.y + 0.1, pos.z, null, MAT_STICKY));
            break;
        }

        // ── GHOST BLOCK (visible but no collider) ─────────────────────────────
        case 'ghost_block': {
            // Intentionally no bodies — marble passes through
            break;
        }

        // ── SPEED LIMITER (trigger zone — effect handled in play.js) ─────────
        case 'speed_limiter': {
            // No physics body needed; effect handled by AABB check in tickEffects
            break;
        }

        // ── SPIKE STRIP (triggers respawn on contact) ─────────────────────────
        case 'spike_strip': {
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(3, 0.15, 1, pos.x, pos.y + 0.15, pos.z, yQ));
            break;
        }

        // ── CONVEYOR BELT (flat track + force applied in belt direction) ──────
        case 'conveyor_belt': {
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            bodies.push(box(2, 0.2, 4, pos.x, pos.y + 0.2, pos.z, yQ));
            // Side rails
            const lOff = rotateVec(-2.3, 0, rot);
            const rOff = rotateVec(  2.3, 0, rot);
            bodies.push(box(0.15, 0.3, 4, pos.x + lOff.x, pos.y + 0.3, pos.z + lOff.z, yQ));
            bodies.push(box(0.15, 0.3, 4, pos.x + rOff.x, pos.y + 0.3, pos.z + rOff.z, yQ));
            break;
        }

        // ── GRAVITY FLIP ZONE (trigger zone — effect in play.js) ─────────────
        case 'gravity_flip': {
            // No physics body; trigger handled by AABB in tickEffects
            break;
        }

        // ── EARTHQUAKE PAD (flat pad, shaking effect in play.js) ─────────────
        case 'earthquake_pad': {
            bodies.push(box(2, 0.1, 2, pos.x, pos.y + 0.1, pos.z, null));
            break;
        }

        // ── GLUE TRAP (sticky surface, freeze in play.js) ─────────────────────
        case 'glue_trap': {
            bodies.push(box(1.5, 0.1, 1.5, pos.x, pos.y + 0.1, pos.z, null, MAT_STICKY));
            break;
        }

        // ── MAGNET (attracts/repels marbles within radius) ────────────────────
        case 'magnet': {
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            // Cylindrical post: thin vertical box
            bodies.push(box(0.5, 1.5, 0.5, pos.x, pos.y + 1.5, pos.z, yQ));
            break;
        }

        // ── REVERSE PAD (applies reverse impulse, effect in play.js) ─────────
        case 'reverse_pad': {
            bodies.push(box(2, 0.1, 2, pos.x, pos.y + 0.1, pos.z, null));
            break;
        }

        // ── BLACK HOLE (no physical collider — force-only effect zone) ────────
        case 'black_hole': {
            // Thin platform so marbles don't fall through — effect is radial force
            bodies.push(box(0.5, 0.5, 0.5, pos.x, pos.y + 0.5, pos.z, null));
            break;
        }

        // ── CANNON (barrel entry → launch at high speed) ──────────────────────
        case 'cannon': {
            const yQ  = quatFromAxisAngle(0, 1, 0, rot * D2R);
            // Entry funnel (wide mouth)
            bodies.push(box(1.5, 1.5, 1.5, pos.x, pos.y + 1.5, pos.z, yQ));
            // Left and right barrel walls
            const lOff = rotateVec(-1, 0, rot);
            const rOff = rotateVec(  1, 0, rot);
            bodies.push(box(0.3, 1, 2.5, pos.x + lOff.x, pos.y + 1.5, pos.z + lOff.z, yQ));
            bodies.push(box(0.3, 1, 2.5, pos.x + rOff.x, pos.y + 1.5, pos.z + rOff.z, yQ));
            break;
        }

        // ── SHRINK ZONE / GIANT ZONE (trigger only — effect in play.js) ──────
        case 'shrink_zone':
        case 'giant_zone': {
            // No physics body — marble passes through; visual-only effect
            break;
        }

        // ── ROTATING RING (kinematic compound body — all segments on one body) ─
        case 'rotating_ring': {
            const R = 2.5, segs = 8;
            const arcLen = 2 * Math.PI * R / segs;
            const compound = new CANNON.Body({ mass: 0 });
            for (let i = 0; i < segs; i++) {
                const mid  = (i + 0.5) / segs * Math.PI * 2;
                const rx   = R * Math.cos(mid);
                const rz   = R * Math.sin(mid);
                const segQ = new CANNON.Quaternion();
                segQ.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), mid);
                compound.addShape(
                    new CANNON.Box(new CANNON.Vec3(0.4, 0.4, arcLen / 2 + 0.1)),
                    new CANNON.Vec3(rx, 0, rz),
                    segQ
                );
            }
            compound.position.set(pos.x, pos.y + 2.5, pos.z);
            bodies.push(compound);
            break;
        }

        // ── PENDULUM (kinematic swinging ball) ────────────────────────────────
        case 'pendulum': {
            const yQ = quatFromAxisAngle(0, 1, 0, rot * D2R);
            // Ball body (sphere approximated as box)
            const b = new CANNON.Body({ mass: 0, material: MAT_BOUNCY });
            b.addShape(new CANNON.Sphere(1.0));
            b.position.set(pos.x, pos.y + 1, pos.z);
            if (yQ) b.quaternion.copy(yQ);
            bodies.push(b);
            break;
        }

        // ── PINBALL BUMPER RING (6 bumpers in a circle) ───────────────────────
        case 'pinball_bumper_ring': {
            const R = 3, count = 6;
            for (let i = 0; i < count; i++) {
                const t    = (i / count) * Math.PI * 2;
                const bpos = rotateVec(R * Math.sin(t), R * Math.cos(t), rot);
                const b    = new CANNON.Body({ mass: 0, material: MAT_BOUNCY });
                b.addShape(new CANNON.Sphere(0.6));
                b.position.set(pos.x + bpos.x, pos.y + 0.6, pos.z + bpos.z);
                bodies.push(b);
            }
            break;
        }

        // ── WAYPOINT (no physics body — AABB trigger for progress tracking) ───
        case 'waypoint': {
            // No physics body; processed as an AABB trigger in play.js like checkpoints
            break;
        }

        // ── SPLIT TRACK ───────────────────────────────────────────────────────
        case 'split_track': {
            const ang  = (props.angle ?? 30) * D2R;
            const baseY = floorY(pos, 0.2);
            const yQ   = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const forkLen = 4;   // half-length of each fork section
            const wallH   = 0.6;

            // Entry floor
            const entOff = rotateVec(0, -4, rot);
            bodies.push(box(1.5, 0.2, 4, pos.x + entOff.x, baseY, pos.z + entOff.z, yQ));

            // Left fork floor
            const lAng  = rot - ang / D2R;   // piece angle minus fork angle
            const lQ    = quatFromAxisAngle(0, 1, 0, lAng * D2R);
            const lCx   = -Math.sin(ang) * forkLen, lCz = Math.cos(ang) * forkLen;
            const lOff  = rotateVec(lCx, lCz, rot);
            bodies.push(box(1.5, 0.2, forkLen, pos.x + lOff.x, baseY, pos.z + lOff.z, lQ));

            // Right fork floor
            const rAng  = rot + ang / D2R;
            const rQ    = quatFromAxisAngle(0, 1, 0, rAng * D2R);
            const rCx   = Math.sin(ang) * forkLen, rCz = Math.cos(ang) * forkLen;
            const rOff  = rotateVec(rCx, rCz, rot);
            bodies.push(box(1.5, 0.2, forkLen, pos.x + rOff.x, baseY, pos.z + rOff.z, rQ));

            // Entry outer walls
            const elw = rotateVec(-1.8, -4, rot);
            const erw = rotateVec( 1.8, -4, rot);
            bodies.push(box(0.15, wallH, 4, pos.x + elw.x, baseY + wallH, pos.z + elw.z, yQ));
            bodies.push(box(0.15, wallH, 4, pos.x + erw.x, baseY + wallH, pos.z + erw.z, yQ));

            // Left fork outer wall
            const llwX = lCx - Math.cos(ang) * 1.8, llwZ = lCz + Math.sin(ang) * 1.8;
            const llOff = rotateVec(llwX, llwZ, rot);
            bodies.push(box(0.15, wallH, forkLen, pos.x + llOff.x, baseY + wallH, pos.z + llOff.z, lQ));

            // Right fork outer wall
            const rrwX = rCx + Math.cos(ang) * 1.8, rrwZ = rCz + Math.sin(ang) * 1.8;
            const rrOff = rotateVec(rrwX, rrwZ, rot);
            bodies.push(box(0.15, wallH, forkLen, pos.x + rrOff.x, baseY + wallH, pos.z + rrOff.z, rQ));
            break;
        }

        // ── MERGE TRACK ───────────────────────────────────────────────────────
        case 'merge_track': {
            const ang   = (props.angle ?? 30) * D2R;
            const baseY = floorY(pos, 0.2);
            const yQ    = quatFromAxisAngle(0, 1, 0, rot * D2R);
            const forkLen = 4;
            const wallH   = 0.6;

            // Exit floor
            const exOff = rotateVec(0, 4, rot);
            bodies.push(box(1.5, 0.2, 4, pos.x + exOff.x, baseY, pos.z + exOff.z, yQ));

            // Left entry floor (approaching from -Z left)
            const lAng  = rot - ang / D2R;
            const lQ    = quatFromAxisAngle(0, 1, 0, lAng * D2R);
            const lCx   = -Math.sin(ang) * forkLen, lCz = -Math.cos(ang) * forkLen;
            const lOff  = rotateVec(lCx, lCz, rot);
            bodies.push(box(1.5, 0.2, forkLen, pos.x + lOff.x, baseY, pos.z + lOff.z, lQ));

            // Right entry floor
            const rAng  = rot + ang / D2R;
            const rQ    = quatFromAxisAngle(0, 1, 0, rAng * D2R);
            const rCx   = Math.sin(ang) * forkLen, rCz = -Math.cos(ang) * forkLen;
            const rOff  = rotateVec(rCx, rCz, rot);
            bodies.push(box(1.5, 0.2, forkLen, pos.x + rOff.x, baseY, pos.z + rOff.z, rQ));

            // Exit outer walls
            const elw = rotateVec(-1.8, 4, rot);
            const erw = rotateVec( 1.8, 4, rot);
            bodies.push(box(0.15, wallH, 4, pos.x + elw.x, baseY + wallH, pos.z + elw.z, yQ));
            bodies.push(box(0.15, wallH, 4, pos.x + erw.x, baseY + wallH, pos.z + erw.z, yQ));

            // Left entry outer wall
            const llwX = lCx - Math.cos(ang) * 1.8, llwZ = lCz - Math.sin(ang) * 1.8;
            const llOff = rotateVec(llwX, llwZ, rot);
            bodies.push(box(0.15, wallH, forkLen, pos.x + llOff.x, baseY + wallH, pos.z + llOff.z, lQ));

            // Right entry outer wall
            const rrwX = rCx + Math.cos(ang) * 1.8, rrwZ = rCz - Math.sin(ang) * 1.8;
            const rrOff = rotateVec(rrwX, rrwZ, rot);
            bodies.push(box(0.15, wallH, forkLen, pos.x + rrOff.x, baseY + wallH, pos.z + rrOff.z, rQ));
            break;
        }

        default:
            break;
    }

    return bodies;
}

/**
 * Get the world AABB for a piece (for trigger zone checks).
 * Returns { minX, maxX, minY, maxY, minZ, maxZ, cx, cy, cz }
 */
export function getPieceAABB(piece) {
    const { pos, props = {} } = piece;
    const pw = props.w ?? 6;
    const pd = props.d ?? 6;
    const ph = props.h ?? 1;
    return {
        minX: pos.x - pw / 2, maxX: pos.x + pw / 2,
        minY: pos.y - 1,      maxY: pos.y + ph + 2,
        minZ: pos.z - pd / 2, maxZ: pos.z + pd / 2,
        cx: pos.x, cy: pos.y + ph / 2, cz: pos.z,
    };
}
