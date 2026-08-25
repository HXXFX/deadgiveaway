/* Hand-rolled 3-D on Canvas 2D. No three.js, no build step — the same approach
 * already proven in Inside Diffusion's views.
 *
 * Painter's algorithm, so there is NO PER-PIXEL DEPTH: interpenetrating geometry
 * sorts wrong, which is why the map is separated convex boxes and why long
 * geometry is split (see pushLong). Two failures this file exists to prevent,
 * both of which rendered a completely plausible picture while being wrong:
 *
 *   1. RIGHT-VECTOR SIGN. right = cross(forward, up) = (-fz, 0, fx). The reverse
 *      is its negative and mirrors the world — the room still looks fine and
 *      pressing D walks you LEFT.
 *   2. MEAN-DEPTH SORTING OF LONG POLYGONS. An 18 m wall straddling the camera
 *      clipped to a polygon whose mean depth was ~7 m, so it drew in front of
 *      everything: measured, it projected to screen x 48,936 and covered the
 *      entire view. Split long geometry and each piece sorts correctly.
 */
import { WORLD, CAM } from './config.js';
import { hex2rgb, rgba, fitCanvas, tok, mixHex, luminance, setGround, getGround, clamp } from './util.js';
import { tileShade, propColour, decalColour } from './room.js';
import { objByKey, venueByKey } from './props.js';
import { MASK_FOOTPRINTS, WEAPONS, CHARS, palette as charPalette } from './chars.js';

/* The top-down view ORBITS. yaw/pitch/dist are the only camera state; `fit`
   scales to the room when the user has not zoomed, and stops once they have —
   a view that keeps re-fitting fights the person dragging it. */
export const cam = {
  mode: 'top', f: 700, ox: 0, oy: 0,
  yaw: 0, pitch: CAM.TOP_PITCH, dist: CAM.TOP_DIST, userZoom: false,
  pos: [0, 0, 0], fwd: [0, 0, 0], rgt: [0, 0, 0], up: [0, 0, 0],
};
export function orbit(dYaw, dPitch) {
  cam.yaw += dYaw;
  cam.pitch = Math.max(CAM.PITCH_MIN, Math.min(CAM.PITCH_MAX, cam.pitch + dPitch));
}
export function zoom(mult) {
  cam.dist = Math.max(CAM.DIST_MIN, Math.min(CAM.DIST_MAX, cam.dist * mult));
  cam.userZoom = true;
}
export function resetView() {
  cam.yaw = 0; cam.pitch = CAM.TOP_PITCH; cam.dist = CAM.TOP_DIST; cam.userZoom = false;
}

export function setCamera(w, h, player) {
  const c = cam;
  if (c.mode === 'fps') {
    c.pos[0] = player.x; c.pos[1] = CAM.FPS_EYE; c.pos[2] = player.z;
    const p = CAM.FPS_TILT;
    c.fwd[0] = player.hx * Math.cos(p);
    c.fwd[1] = Math.sin(p);
    c.fwd[2] = player.hz * Math.cos(p);
    c.f = (w / 2) / Math.tan(CAM.FPS_HFOV / 2);
    c.ox = w / 2; c.oy = h / 2;
  } else {
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    c.pos[0] = c.dist * cp * Math.sin(c.yaw);
    c.pos[1] = c.dist * sp;
    c.pos[2] = c.dist * cp * Math.cos(c.yaw);
    const l = Math.hypot(c.pos[0], c.pos[1], c.pos[2]);
    c.fwd[0] = -c.pos[0] / l; c.fwd[1] = -c.pos[1] / l; c.fwd[2] = -c.pos[2] / l;
  }
  const rx = -c.fwd[2], rz = c.fwd[0], rl = Math.hypot(rx, rz) || 1;
  c.rgt[0] = rx / rl; c.rgt[1] = 0; c.rgt[2] = rz / rl;
  c.up[0] = c.rgt[1] * c.fwd[2] - c.rgt[2] * c.fwd[1];
  c.up[1] = c.rgt[2] * c.fwd[0] - c.rgt[0] * c.fwd[2];
  c.up[2] = c.rgt[0] * c.fwd[1] - c.rgt[1] * c.fwd[0];

  if (c.mode !== 'fps') {
    /* Focal length SOLVED from the arena's own extents rather than dialled in,
       so the room fills the frame at any canvas size. */
    /* Sample the wall TOPS too, not just the floor plane. Fitting to y=0 alone
       framed the floor perfectly and cut the far wall off the top of the screen —
       the room is a box, so the bounding box has to include its height. */
    let uM = 1e-6, vM = 1e-6;
    const topY = WORLD.WALL_H * 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [0, topY]) {
      const dx = sx * (WORLD.AX + WORLD.WALL_T * 2) - c.pos[0];
      const dy = sy - c.pos[1];
      const dz = sz * (WORLD.AZ + WORLD.WALL_T * 2) - c.pos[2];
      const cz = dx * c.fwd[0] + dy * c.fwd[1] + dz * c.fwd[2];
      if (cz <= CAM.NEAR) continue;
      uM = Math.max(uM, Math.abs((dx * c.rgt[0] + dy * c.rgt[1] + dz * c.rgt[2]) / cz));
      vM = Math.max(vM, Math.abs((dx * c.up[0] + dy * c.up[1] + dz * c.up[2]) / cz));
    }
    /* Once the user has zoomed, the focal length is theirs: distance alone drives
       the framing. Re-fitting after a zoom would undo the drag they just made. */
    c.f = c.userZoom
      ? (w * 0.5) / Math.tan(0.55)
      : Math.min((w * CAM.SAFE / 2 - w * 0.015) / uM, (h / 2 - h * 0.02) / vM);
    c.ox = w * CAM.SAFE / 2; c.oy = h / 2;
  }
}

const _c = [0, 0, 0];
function toCam(x, y, z, out) {
  const c = cam, dx = x - c.pos[0], dy = y - c.pos[1], dz = z - c.pos[2];
  out[0] = dx * c.rgt[0] + dy * c.rgt[1] + dz * c.rgt[2];
  out[1] = dx * c.up[0] + dy * c.up[1] + dz * c.up[2];
  out[2] = dx * c.fwd[0] + dy * c.fwd[1] + dz * c.fwd[2];
  return out;
}
export function project(x, y, z) {
  toCam(x, y, z, _c);
  if (_c[2] <= CAM.NEAR) return null;
  const k = cam.f / _c[2];
  return [cam.ox + _c[0] * k, cam.oy - _c[1] * k, _c[2]];
}

/* Screen point -> a point on a horizontal plane. Top-down aiming needs this: the
   angle from the player's SCREEN position to the cursor is not the world angle
   under perspective, and using it makes aim drift worse toward the edges. */
/* THE GLASS IS CURVED, SO THE POINTER HAS TO BE TOO.
 *
 * The arena is drawn flat and then bent outward by an SVG displacement filter —
 * see the CRT block in index.html. A CSS filter changes the PIXELS and not the
 * element's coordinate space, so the browser goes on reporting the mouse where
 * it would have been on a flat screen. Left alone, that is a game where what you
 * click and what you see drift apart toward the edges, by roughly two per cent
 * of the half-width at the corners — twenty pixels on a large window, which is a
 * body's width. Aiming would be subtly, unaccountably wrong exactly where the
 * player is least able to explain it.
 *
 * So the same barrel is applied to the pointer before anything is hit-tested.
 * The filter samples the source at p * (1 - K|p|^2), so a click landing at p on
 * the curved glass came from p * (1 - K|p|^2) on the flat picture. One formula,
 * used in both directions, and the two can never disagree. */
/* 0.014, not 0.085. The first value bent the picture by a hundred and eight
   pixels at the corners on a 1268-wide arena — the whole room was dragged inward
   and the walls left the frame. A tube bulges; it does not swallow. At 0.014 the
   corner moves about eighteen pixels, which reads as curved glass and still lets
   the arena be a rectangle. */
/* THE AIM POINTER.
 *
 * It was `cursor: crosshair` — the operating system's, not the game's, and the
 * one thing on screen the player looks at most.
 *
 * WHERE IT IS DRAWN IS NOT WHERE THE MOUSE IS, and it has to be that way. The
 * arena sits behind the barrel filter, so anything painted on this canvas is
 * displaced before the player sees it. Painting at the raw mouse position would
 * put the reticle visibly beside the cursor, worst at the edges. Painting at
 * curvePointer(mouse) — the same flat position the shot is aimed at — is
 * displaced BACK onto the cursor by the same curve. The mark and the mouse and
 * the shot are then three readings of one number and cannot drift.
 *
 * THE GAP IS THE WHOLE IDEA: nothing is ever drawn over the thing being aimed
 * at. Every arm is stroked twice, dark then bright, because a single-pass mark
 * disappears the moment it crosses a lit prop and this floor is full of them.
 * The arms are kept short for the same reason the shape was chosen — long
 * straight limbs visibly disagree with the bowed raster near the edges.
 *
 * IT IS WHITE, ALWAYS, AND THAT IS A FAIRNESS RULE RATHER THAN A STYLE.
 *
 * It used to go cyan when a line was open, grey when it was not, and magenta
 * on an empty magazine. Those are all things the Mirror has in its own
 * observation -- line of sight at x[21], the magazine at x[34], reloading at
 * x[35] -- so the numbers are not the asymmetry. The asymmetry is that the
 * player was handed them DIGESTED, as a colour, while the Mirror gets three
 * raw values among thirty-six and has to learn on its own that they mean
 * anything. A cue nobody had to learn is not the same game as a number
 * somebody did.
 *
 * So the mark says where the shot goes and nothing more. Both sides read the
 * room the same way: by looking at it.
 */
export function drawReticle(g, sx, sy) {
  const R = 15, GAP = 4.5, LW = 2;
  g.save();
  g.lineCap = 'butt';
  const arms = () => {
    g.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      g.moveTo(sx + dx * GAP, sy + dy * GAP);
      g.lineTo(sx + dx * R, sy + dy * R);
    }
  };
  /* the dark pass is not decoration: a single-pass mark disappears the moment
     it crosses a lit prop, and this floor is full of them */
  g.strokeStyle = 'rgba(0,0,0,.72)'; g.lineWidth = LW + 2.5; arms(); g.stroke();
  g.strokeStyle = '#ffffff';         g.lineWidth = LW;       arms(); g.stroke();
  g.restore();
}

export const CRT_K = 0.014;
export function curvePointer(sx, sy, w, h) {
  if (!CRT_ON) return [sx, sy];
  const hw = w / 2, hh = h / 2;
  const u = (sx - hw) / hw, v = (sy - hh) / hh;
  const r2 = u * u + v * v;
  const f = 1 - CRT_K * r2;
  return [hw + u * f * hw, hh + v * f * hh];
}
let CRT_ON = true;
export const setCrt = (on) => { CRT_ON = !!on; };
export const crtOn = () => CRT_ON;

export function screenToGround(sx, sy, planeY) {
  const c = cam;
  const dx = (sx - c.ox) / c.f, dy = -(sy - c.oy) / c.f;
  const wx = c.fwd[0] + c.rgt[0] * dx + c.up[0] * dy;
  const wy = c.fwd[1] + c.rgt[1] * dx + c.up[1] * dy;
  const wz = c.fwd[2] + c.rgt[2] * dx + c.up[2] * dy;
  if (Math.abs(wy) < 1e-6) return null;
  const t = (planeY - c.pos[1]) / wy;
  if (t <= 0) return null;
  return [c.pos[0] + wx * t, c.pos[2] + wz * t];
}

/* Sutherland-Hodgman against the near plane, in camera space. Without it a face
   is dropped whole as soon as one corner goes behind the eye, so standing next
   to a wall in first-person deletes the wall. */
function clipNear(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = a[2] >= CAM.NEAR, bin = b[2] >= CAM.NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (CAM.NEAR - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, CAM.NEAR]);
    }
  }
  return out;
}

const FACES = [
  { n: [0, 1, 0], v: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, 1], v: [[-1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]] },
  { n: [0, 0, -1], v: [[1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, -1]] },
  { n: [1, 0, 0], v: [[1, -1, 1], [1, 1, 1], [1, 1, -1], [1, -1, -1]] },
  { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]] },
];
const LIGHT = (() => { const l = [0.35, 0.88, 0.32], m = Math.hypot(...l); return l.map((v) => v / m); })();
let faces = [];

export function pushBox(cx, cy, cz, hx, hy, hz, col, alpha, ambient) {
  const amb = ambient === undefined ? CAM.ROOM_AMBIENT : ambient;
  for (const f of FACES) {
    const fx = cx + f.n[0] * hx, fy = cy + f.n[1] * hy, fz = cz + f.n[2] * hz;
    if (f.n[0] * (fx - cam.pos[0]) + f.n[1] * (fy - cam.pos[1]) + f.n[2] * (fz - cam.pos[2]) >= 0) continue;
    const poly = f.v.map((v) => toCam(cx + v[0] * hx, cy + v[1] * hy, cz + v[2] * hz, [0, 0, 0]));
    const cl = clipNear(poly);
    if (cl.length < 3) continue;
    const pts = []; let zs = 0;
    for (const p of cl) {
      const k = cam.f / p[2];
      pts.push(cam.ox + p[0] * k, cam.oy - p[1] * k);
      zs += p[2];
    }
    const b = amb + (1 - amb) * Math.max(0, f.n[0] * LIGHT[0] + f.n[1] * LIGHT[1] + f.n[2] * LIGHT[2]);
    faces.push({ pts, z: zs / cl.length, col, b, alpha: alpha === undefined ? 1 : alpha });
  }
}
/* A GENERAL FACE. pushBox only ever needed axis-aligned quads; once props can
   be rotated, wedge-shaped or six-sided, every solid is an extruded polygon and
   they all share this. Same near-clipping and same painter entry, so nothing
   about the sort or the clip has two versions to keep in agreement. */
function pushFace(verts, col, bright, alpha) {
  const poly = verts.map((v) => toCam(v[0], v[1], v[2], [0, 0, 0]));
  const cl = clipNear(poly);
  if (cl.length < 3) return;
  const pts = []; let zs = 0;
  for (const q of cl) {
    const k = cam.f / q[2];
    pts.push(cam.ox + q[0] * k, cam.oy - q[1] * k);
    zs += q[2];
  }
  faces.push({ pts, z: zs / cl.length, col, b: bright, alpha: alpha === undefined ? 1 : alpha });
}

/* Footprints in local space, counter-clockwise, scaled by (hx, hz). */
export const FOOTPRINTS = {
  box: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
  wedge: [[-1, -1], [1, -1], [-1, 1]],
  hex: (() => { const o = []; for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6; o.push([Math.cos(a), Math.sin(a)]); } return o; })(),
  oct: (() => { const o = []; for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8; o.push([Math.cos(a) * 1.08, Math.sin(a) * 1.08]); } return o; })(),
  ell: [[-1, -1], [1, -1], [1, -0.15], [-0.1, -0.15], [-0.1, 1], [-1, 1]],
  /* MORE VOCABULARY, because the room is meant never to repeat and five shapes
     is a small alphabet to write that many rooms in. */
  tee: [[-1, -1], [1, -1], [1, -0.3], [0.3, -0.3], [0.3, 1], [-0.3, 1], [-0.3, -0.3], [-1, -0.3]],
  plus: [[-1, -0.34], [-0.34, -0.34], [-0.34, -1], [0.34, -1], [0.34, -0.34], [1, -0.34],
         [1, 0.34], [0.34, 0.34], [0.34, 1], [-0.34, 1], [-0.34, 0.34], [-1, 0.34]],
  trap: [[-1, -1], [1, -1], [0.55, 1], [-0.55, 1]],
  dart: [[1, 0], [-0.15, -1], [-0.55, 0], [-0.15, 1]],
  /* mask shapes live in the same table so masks can use props' shapes and the
     other way round */
  ...MASK_FOOTPRINTS,
};

/* Extrude a footprint between y0 and y1, rotated by `rot`.
 *
 * LONG BOXES ARE SPLIT, for the same reason walls are: painter's algorithm sorts
 * by a polygon's MEAN depth, so one quad running from 0.2 m to 14 m away is
 * drawn as though all of it were 7 m away and paints over everything nearer.
 * A rotated slab in first-person is exactly that case, and pushShape would have
 * quietly reintroduced the bug that pushLong exists to prevent. */
export function pushShape(cx, cz, shape, hx, hz, y0, y1, rot, col, ambient, alpha) {
  const amb = ambient === undefined ? CAM.ROOM_AMBIENT : ambient;
  const al = alpha === undefined ? 1 : alpha;
  const LONG = 1.1;
  if (shape === 'box' && Math.max(hx, hz) > LONG) {
    const n = Math.ceil(Math.max(hx, hz) / LONG);
    const cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
    const alongX = hx >= hz;
    const half = (alongX ? hx : hz) / n;
    for (let i = 0; i < n; i++) {
      const o = -(alongX ? hx : hz) + half * (2 * i + 1);
      const lx = alongX ? o : 0, lz = alongX ? 0 : o;
      pushShape(cx + lx * cr - lz * sr, cz + lx * sr + lz * cr, 'box',
                alongX ? half : hx, alongX ? hz : half, y0, y1, rot, col, ambient, alpha);
    }
    return;
  }
  const fp = FOOTPRINTS[shape] || FOOTPRINTS.box;
  const cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
  const W = fp.map((q) => {
    const lx = q[0] * hx, lz = q[1] * hz;
    return [cx + lx * cr - lz * sr, cz + lx * sr + lz * cr];
  });
  const n = W.length;
  for (let i = 0; i < n; i++) {
    const a = W[i], b = W[(i + 1) % n];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    let nx = ez, nz = -ex;                       /* outward for CCW footprints */
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (nx * (mx - cam.pos[0]) + nz * (mz - cam.pos[2]) >= 0) continue;   /* backface */
    const bright = amb + (1 - amb) * Math.max(0, nx * LIGHT[0] + nz * LIGHT[2]);
    pushFace([[a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]]],
             col, bright, al);
  }
  /* top face: only when we are above it, which we always are in this game */
  if (cam.pos[1] > y1) {
    const bright = amb + (1 - amb) * Math.max(0, LIGHT[1]);
    pushFace(W.map((q) => [q[0], y1, q[1]]), col, bright, al);
  }
}

export function pushLong(cx, cy, cz, hx, hy, hz, col, segs, ambient) {
  const n = segs || 6;
  if (hx >= hz) {
    const w = hx / n;
    for (let i = 0; i < n; i++) pushBox(cx - hx + w * (2 * i + 1), cy, cz, w, hy, hz, col, 1, ambient);
  } else {
    const w = hz / n;
    for (let i = 0; i < n; i++) pushBox(cx, cy, cz - hz + w * (2 * i + 1), hx, hy, w, col, 1, ambient);
  }
}
/* EVERY SOLID GETS A CONTOUR.
 *
 * The player: "the wall and objects look too close to the graphics on the floor,
 * sometimes it's hard to tell what is the 3D object and what is the 2D graphic
 * on the floor." They are right, and shading alone cannot fix it — a lit face
 * and a floor decal can land on the same value, and at this camera angle a low
 * box and a painted rectangle project to nearly the same quadrilateral.
 *
 * A line does what shading cannot: it says "this is an edge of a thing" rather
 * than "this is a different colour". Drawn on the same path as the fill, so it
 * costs one extra stroke per face and no extra geometry, and in a dark ink so it
 * reads as a drawn outline rather than as a highlight competing with the actors.
 * The internal edges between a box's top and its sides are wanted, not a bug —
 * they are what make a solid read as having a top at all.
 */
let OUTLINE = '#0a0410';
export function setOutline(col) { OUTLINE = col || '#0a0410'; }

export function flushFaces(g) {
  faces.sort((a, b) => b.z - a.z);
  g.lineJoin = 'round';
  for (const f of faces) {
    const c = hex2rgb(f.col);
    g.fillStyle = `rgba(${Math.round(c[0] * f.b)},${Math.round(c[1] * f.b)},${Math.round(c[2] * f.b)},${f.alpha})`;
    g.beginPath(); g.moveTo(f.pts[0], f.pts[1]);
    for (let i = 2; i < f.pts.length; i += 2) g.lineTo(f.pts[i], f.pts[i + 1]);
    g.closePath();
    g.fill();
    /* translucent faces are glass and hints; outlining those would draw a cage
       around things that are deliberately not solid */
    if (f.alpha >= 0.95) {
      g.strokeStyle = OUTLINE;
      g.lineWidth = f.lw || 1.15;
      g.stroke();
    }
  }
  g.lineJoin = 'miter';
  faces.length = 0;
}
export const faceCount = () => faces.length;

/* ---- ground drawing ----------------------------------------------------- */
function groundPath(g, pts, y) {
  const P = [];
  for (const p of pts) { const q = project(p[0], y === undefined ? 0.012 : y, p[1]); if (!q) return false; P.push(q); }
  g.beginPath(); g.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]);
  g.closePath();
  return true;
}
export function ring(g, x, z, r, style, lw) {
  const pts = [];
  for (let i = 0; i <= 22; i++) {
    const a = i / 22 * Math.PI * 2;
    pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
  }
  if (!groundPath(g, pts, 0.02)) return;
  g.strokeStyle = style; g.lineWidth = lw; g.stroke();
}
function blob(g, x, z, rr, style) {
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    pts.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]);
  }
  if (!groundPath(g, pts)) return;
  g.fillStyle = style; g.fill();
}
function decal(g, d) {
  g.fillStyle = decalColour(d);
  if (d.kind === 'disc') {
    const pts = [];
    for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2;
      pts.push([d.x + Math.cos(a) * d.r0, d.z + Math.sin(a) * d.r0]); }
    if (groundPath(g, pts)) g.fill();
  } else if (d.kind === 'ring') {
    let ok = true;
    g.beginPath();
    const put = (rr, rev) => {
      for (let i = 0; i <= 22; i++) {
        const a = (rev ? 22 - i : i) / 22 * Math.PI * 2;
        const q = project(d.x + Math.cos(a) * rr, 0.012, d.z + Math.sin(a) * rr);
        if (!q) { ok = false; return; }
        if (i === 0) g.moveTo(q[0], q[1]); else g.lineTo(q[0], q[1]);
      }
    };
    put(d.r0 + d.w, false); if (!ok) return;
    put(Math.max(0.2, d.r0 - d.w), true); if (!ok) return;
    g.fill('evenodd');
  } else if (d.kind === 'arrow') {
    /* a long shaft with a head: the only decal with a direction you can name */
    const ca = Math.cos(d.ang), sa = Math.sin(d.ang);
    const rot = (px, pz) => [d.x + px * ca - pz * sa, d.z + px * sa + pz * ca];
    const L = d.r0 * 1.5, W = d.w * 0.42;
    let pts = [[-L, -W], [L * 0.25, -W], [L * 0.25, W], [-L, W]].map((q) => rot(q[0], q[1]));
    if (groundPath(g, pts)) g.fill();
    pts = [[L * 0.15, -W * 2.6], [L, 0], [L * 0.15, W * 2.6]].map((q) => rot(q[0], q[1]));
    if (groundPath(g, pts)) g.fill();
  } else if (d.kind === 'hatch') {
    const ca = Math.cos(d.ang), sa = Math.sin(d.ang);
    for (let k = -3; k <= 3; k++) {
      const o = k * (d.w * 1.5), L = d.r0;
      const pts = [[-L, o - d.w * 0.2], [L, o - d.w * 0.2], [L * 0.55, o + d.w * 0.2], [-L, o + d.w * 0.2]]
        .map((q) => [d.x + q[0] * ca - q[1] * sa, d.z + q[0] * sa + q[1] * ca]);
      if (groundPath(g, pts)) g.fill();
    }
  } else if (d.kind === 'target') {
    for (const [rr, wid] of [[d.r0, d.w * 0.34], [d.r0 * 0.62, d.w * 0.34], [d.r0 * 0.24, d.r0 * 0.24]]) {
      const o = [], n = 22;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2;
        o.push([d.x + Math.cos(a) * rr, d.z + Math.sin(a) * rr]); }
      if (wid >= rr) { if (groundPath(g, o)) g.fill(); continue; }
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2;
        o.push([d.x + Math.cos(a) * (rr - wid), d.z + Math.sin(a) * (rr - wid)]); }
      const outer = o.slice(0, n), inner = o.slice(n).reverse();
      for (let i = 0; i < n; i++) {
        const quad = [outer[i], outer[(i + 1) % n], inner[(n - 1 - i + n) % n], inner[(n - i) % n]];
        if (groundPath(g, quad)) g.fill();
      }
    }
  } else if (d.kind === 'zig') {
    const ca = Math.cos(d.ang), sa = Math.sin(d.ang);
    const rot = (px, pz) => [d.x + px * ca - pz * sa, d.z + px * sa + pz * ca];
    const step = d.r0 / 2.5;
    for (let k = -3; k <= 3; k++) {
      const x0 = k * step, up = (k & 1) ? 1 : -1;
      const pts = [[x0, up * d.r0 * 0.5], [x0 + step, -up * d.r0 * 0.5],
                   [x0 + step, -up * d.r0 * 0.5 + d.w * up], [x0, up * d.r0 * 0.5 + d.w * up]]
        .map((q) => rot(q[0], q[1]));
      if (groundPath(g, pts)) g.fill();
    }
  } else if (d.kind === 'bars') {
    const ca = Math.cos(d.ang), sa = Math.sin(d.ang);
    for (let k = -2; k <= 2; k++) {
      const o = k * (d.w * 2.4), L = d.r0 * (1 - Math.abs(k) * 0.22);
      const pts = [[-L, o - d.w * 0.5], [L, o - d.w * 0.5], [L, o + d.w * 0.5], [-L, o + d.w * 0.5]]
        .map((q) => [d.x + q[0] * ca - q[1] * sa, d.z + q[0] * sa + q[1] * ca]);
      if (groundPath(g, pts)) g.fill();
    }
  } else if (d.kind === 'chevron') {
    const ca = Math.cos(d.ang), sa = Math.sin(d.ang);
    const rot = (px, pz) => [d.x + px * ca - pz * sa, d.z + px * sa + pz * ca];
    for (let k = -2; k <= 2; k++) {
      const o = k * (d.w * 2.1);
      const pts = [[-d.r0, o], [0, o + d.w], [d.r0, o], [0, o + d.w * 0.45]].map((q) => rot(q[0], q[1]));
      if (groundPath(g, pts)) g.fill();
    }
  } else if (d.kind === 'grid') {
    const n = 4, step = d.r0 / n;
    for (let a = -n; a <= n; a++) for (const axis of [0, 1]) {
      const L = d.r0, o = a * step;
      const pts = axis
        ? [[-L, o - d.w * 0.16], [L, o - d.w * 0.16], [L, o + d.w * 0.16], [-L, o + d.w * 0.16]]
        : [[o - d.w * 0.16, -L], [o + d.w * 0.16, -L], [o + d.w * 0.16, L], [o - d.w * 0.16, L]];
      const ca = Math.cos(d.ang), sa = Math.sin(d.ang);
      const w = pts.map((q) => [d.x + q[0] * ca - q[1] * sa, d.z + q[0] * sa + q[1] * ca]);
      if (groundPath(g, w)) g.fill();
    }
  } else if (d.kind === 'cross') {
    const ca = Math.cos(d.ang), sa = Math.sin(d.ang);
    for (const axis of [0, 1]) {
      const L = d.r0 * 1.3, W = d.w * 0.5;
      const pts = (axis ? [[-L, -W], [L, -W], [L, W], [-L, W]]
                        : [[-W, -L], [W, -L], [W, L], [-W, L]])
        .map((q) => [d.x + q[0] * ca - q[1] * sa, d.z + q[0] * sa + q[1] * ca]);
      if (groundPath(g, pts)) g.fill();
    }
  } else if (d.kind === 'track') {
    /* THE MOVING WALL'S TRACK. Painted along exactly the span the slab travels,
       with end caps, so the floor art explains the motion instead of sitting
       behind it unrelated — and the player can read where the wall is going. */
    const ca = Math.cos(d.ang), sa = Math.sin(d.ang), L = d.len / 2;
    const rot = (px, pz) => [d.x + px * ca - pz * sa, d.z + px * sa + pz * ca];
    const pts = [[-L, -d.w], [L, -d.w], [L, d.w], [-L, d.w]].map((p) => rot(p[0], p[1]));
    if (groundPath(g, pts)) g.fill();
    g.strokeStyle = g.fillStyle; g.lineWidth = 2;
    for (const e of [-1, 1]) {
      const cap = [[e * L, -d.w * 1.5], [e * L, d.w * 1.5]].map((p) => rot(p[0], p[1]));
      const a = project(cap[0][0], 0.013, cap[0][1]);
      const b = project(cap[1][0], 0.013, cap[1][1]);
      if (a && b) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    }
  } else {
    const ca = Math.cos(d.ang), sa = Math.sin(d.ang), L = d.len / 2;
    const pts = [[-L, -d.w], [L, -d.w], [L, d.w], [-L, d.w]]
      .map((p) => [d.x + p[0] * ca - p[1] * sa, d.z + p[0] * sa + p[1] * ca]);
    if (groundPath(g, pts)) g.fill();
  }
}

/* ---- the scene ---------------------------------------------------------- */
export function drawFloor(g, room, w, h) {
  const T = 1.7, { AX, AZ } = WORLD;
  const floor = tok('floor'), floor2 = tok('floor2'), grid = tok('grid');
  const fq = [[-AX, -AZ], [AX, -AZ], [AX, AZ], [-AX, AZ]].map((p) => project(p[0], 0, p[1]));
  const canClip = !fq.some((p) => !p);
  if (canClip) {
    g.save();
    g.beginPath(); g.moveTo(fq[0][0], fq[0][1]);
    for (let i = 1; i < 4; i++) g.lineTo(fq[i][0], fq[i][1]);
    g.closePath(); g.clip();
  }
  for (const t of room.tiles) {
    const x = t.i * T, z = t.j * T;
    const x0 = Math.max(x - T / 2, -AX), x1 = Math.min(x + T / 2, AX);
    const z0 = Math.max(z - T / 2, -AZ), z1 = Math.min(z + T / 2, AZ);
    if (x1 - x0 < 0.01 || z1 - z0 < 0.01) continue;
    const q = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map((p) => project(p[0], 0, p[1]));
    if (q.some((p) => !p)) continue;
    g.fillStyle = mixShade(floor, floor2, tileShade(room, t.i, t.j, t.v));
    g.beginPath(); g.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i < 4; i++) g.lineTo(q[i][0], q[i][1]);
    g.closePath(); g.fill();
  }
  g.strokeStyle = rgba(grid, 0.5); g.lineWidth = 1;
  for (let i = -AX; i <= AX + 0.01; i += T) {
    const a = project(i, 0.008, -AZ), b = project(i, 0.008, AZ);
    if (a && b) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  }
  for (let i = -AZ; i <= AZ + 0.01; i += T) {
    const a = project(-AX, 0.008, i), b = project(AX, 0.008, i);
    if (a && b) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  }
  for (const d of room.decals) decal(g, d);
  /* Old blood DRIES. The list is oldest-first, so fading along it means the
     newest hit is the one that reads, and a floor that has seen a lot of them
     goes dark rather than uniformly bright. */
  const bl = tok('blood'), nb = room.blood.length || 1;
  for (let i = 0; i < room.blood.length; i++) {
    const sp = room.blood[i];
    const age = 1 - i / nb;                       /* 1 = oldest, 0 = newest */
    const col = rgba(mixShade0(bl, tok('floor'), age * 0.55), 0.46 + 0.26 * (1 - age));
    for (const b of sp.blobs) blob(g, sp.cx + b.dx, sp.cz + b.dz, b.rr, col);
  }
  if (canClip) g.restore();
}
/* like mixShade but returns a hex so it can be handed to rgba() */
function mixShade0(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  const h = (v) => Math.round(v).toString(16).padStart(2, '0');
  return '#' + h(A[0] + (B[0] - A[0]) * t) + h(A[1] + (B[1] - A[1]) * t) + h(A[2] + (B[2] - A[2]) * t);
}
function mixShade(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}

export function pushWallsAndProps(room) {
  const { AX, AZ, WALL_T: t, WALL_H: hh } = WORLD;
  const V = venueByKey(room.venue);
  const W = V.wall || { skin: 'wall', band: 'grid', rail: 'grid', bay: 'wall',
                        every: 2, bandY: [0.5, 0.7] };
  /* every wall colour goes through the same cap the furniture does, so a venue
     cannot light its walls brighter than the people standing in front of them */
  const wall = underActors(tok(W.skin));
  const band = underActors(tok(W.band));
  const rail = underActors(mixHex(tok(W.rail), tok('body'), 0.25));
  const bay = underActors(mixHex(tok(W.bay), tok('stage'), 0.25));
  const trim = mixHex(wall, tok('grid'), 0.55);
  const sx = (AX + t) / CAM.WALL_SEGS, sz = (AZ + t) / CAM.WALL_SEGS;

  /* WALLS ARE NOT ONE EXTRUSION, AND THEY ARE NOT ALL THE SAME WALL.
     Every third segment is a taller pilaster and every other one is inset, so
     the perimeter has a rhythm; on top of that each venue paints its own — tile
     with a red band, corrugated steel with a hazard stripe, black with light
     strips. All of it is seeded off the segment index rather than random, so a
     room looks the same every time you see it.
     From this camera you mostly see the TOP of a wall and the strip of inner
     face just below it, so that is where the venue's colour goes: the cap, and a
     band at eye height on the side that faces into the room. */
  const seg = (i, ox, oz, along) => {
    const tall = i % 3 === 0, inset = i % 2 === 1;
    const isBay = W.every > 0 && i % W.every === 0 && !tall;
    const hgt = hh * (tall ? 1.28 : 1.0);
    const dep = t * (inset ? 0.78 : 1.0);
    const gap = 0.06;
    const halfA = (along === 'x' ? sx : t) - (along === 'x' ? gap : 0);
    const halfB = (along === 'x' ? t : sz) - (along === 'x' ? 0 : gap);
    const hxs = along === 'x' ? halfA : dep;
    const hzs = along === 'x' ? dep : halfB;
    pushBox(ox, hgt, oz, hxs, hgt, hzs, isBay ? bay : wall);
    /* the cap, which is most of what the camera can see of a wall */
    pushBox(ox, hgt * 2 + hh * 0.07, oz, hxs * 1.04, hh * 0.07, hzs * 1.04,
            tall ? rail : trim);
    /* the band on the inner face, standing a few centimetres proud so it is not
       z-fighting with the wall it is painted on */
    const inX = along === 'x' ? 0 : -Math.sign(ox);
    const inZ = along === 'x' ? -Math.sign(oz) : 0;
    const [b0, b1] = W.bandY;
    const bh = (b1 - b0) * hgt;
    pushBox(ox + inX * dep * 0.9, (b0 + (b1 - b0) / 2) * hgt * 2, oz + inZ * dep * 0.9,
            along === 'x' ? hxs * 0.94 : dep * 0.16, bh,
            along === 'x' ? dep * 0.16 : hzs * 0.94,
            isBay ? band : mixHex(band, wall, 0.45));
    /* and a thin rail along the top of the band */
    pushBox(ox + inX * dep * 0.95, b1 * hgt * 2, oz + inZ * dep * 0.95,
            along === 'x' ? hxs * 0.94 : dep * 0.12, hh * 0.045,
            along === 'x' ? dep * 0.12 : hzs * 0.94, rail);

    /* A WINDOW, cut into the bay segments. Glazing is the one thing on a wall
       that is brighter than the wall, so it is the only part of a room's
       perimeter you can actually pick out from the far side of the arena — which
       is exactly what a landmark is for. Mullions are drawn as gaps between
       three panes rather than as bars, because a bar 4 cm wide is one pixel. */
    if (isBay && W.win && W.win !== 'none') {
      /* GLAZING IS THE BRIGHTEST THING A ROOM CAN HAVE, and it covers far more
         area than a mask does, so the cap alone is not enough: a window at the
         ceiling of what is allowed reads brighter than the actor it is supposed
         to sit behind. Mixed to 0.40 rather than 0.55 and then capped, which
         puts it clearly below the cast instead of level with it. */
      const glass = underActors(mixHex(tok(W.bay), tok('body'),
                                       W.win === 'glass' ? 0.40 : 0.26));
      const panes = W.win === 'strip' ? 2 : 3;
      const wy0 = W.win === 'hatch' ? 0.20 : 0.46;
      const wy1 = W.win === 'hatch' ? 0.52 : 0.90;
      const halfAlong = along === 'x' ? hxs : hzs;
      const paneHalf = (halfAlong * 0.86) / panes - halfAlong * 0.05;
      for (let q = 0; q < panes; q++) {
        const o = (q - (panes - 1) / 2) * (halfAlong * 1.72 / panes);
        pushBox(ox + (along === 'x' ? o : inX * dep * 0.88),
                (wy0 + (wy1 - wy0) / 2) * hgt * 2,
                oz + (along === 'x' ? inZ * dep * 0.88 : o),
                along === 'x' ? paneHalf : dep * 0.14,
                (wy1 - wy0) * hgt,
                along === 'x' ? dep * 0.14 : paneHalf,
                glass);
      }
      /* a sill under it, so the glazing sits IN something */
      pushBox(ox + inX * dep * 0.86, wy0 * hgt * 2, oz + inZ * dep * 0.86,
              along === 'x' ? hxs * 0.92 : dep * 0.2, hh * 0.05,
              along === 'x' ? dep * 0.2 : hzs * 0.92, rail);
    }

    /* SOMETHING HANGING BETWEEN THE WINDOWS. A mirror behind a bar, a menu board
       in a diner, a poster in an arcade: small, high-contrast, and on a different
       rhythm from the bays so the wall does not repeat every other segment. */
    if (!isBay && !tall && W.artEvery && i % W.artEvery === 1) {
      const face = underActors(mixHex(tok(W.artCol || W.band), tok('body'), 0.30));
      const frame = underActors(mixHex(tok(W.rail), tok('stage'), 0.35));
      const halfAlong = along === 'x' ? hxs : hzs;
      const aw = Math.min(halfAlong * 0.62, 0.52);
      const ay = W.art === 'board' ? 0.62 : W.art === 'sign' ? 0.72 : 0.66;
      const ah = W.art === 'board' ? 0.26 : 0.19;
      for (const [half, col, off] of [[aw, frame, 0.86], [aw * 0.84, face, 0.92]]) {
        pushBox(ox + (along === 'x' ? 0 : inX * dep * off),
                ay * hgt * 2,
                oz + (along === 'x' ? inZ * dep * off : 0),
                along === 'x' ? half : dep * 0.13,
                ah * hgt,
                along === 'x' ? dep * 0.13 : half,
                col);
      }
    }
  };
  for (let i = 0; i < CAM.WALL_SEGS; i++) {
    const ox = -(AX + t) + sx * (2 * i + 1), oz = -(AZ + t) + sz * (2 * i + 1);
    seg(i, ox, -AZ - t, 'x');
    seg(i + 1, ox, AZ + t, 'x');
    seg(i + 2, -AX - t, oz, 'z');
    seg(i, AX + t, oz, 'z');
  }
  /* corner towers, so the perimeter closes on something rather than a mitre */
  for (const cx of [-1, 1]) for (const cz of [-1, 1])
    pushShape(cx * (AX + t), cz * (AZ + t), 'oct', t * 1.5, t * 1.5,
              0, hh * 2.6, Math.PI / 8, trim);

  /* the venue's palette, resolved once per frame rather than per part */
  const roles = propRoles(room);

  for (const p of room.props) {
    if (p.isWall) {
      /* interior walls read as ARCHITECTURE, not as cover you might shoot over —
         and they are the SAME architecture as the perimeter, so they take the
         venue's skin and its rail rather than a generic grey. */
      const base = mixHex(wall, tok('grid'), 0.22);
      pushShape(p.x, p.z, p.shape, p.hx, p.hz, p.h * 0.26, p.h * 1.8, p.rot, base);
      pushShape(p.x, p.z, p.shape, p.hx * 1.07, p.hz * 1.07, 0, p.h * 0.26, p.rot,
                mixHex(base, tok('stage'), 0.45));
      pushShape(p.x, p.z, p.shape, p.hx * 0.84, p.hz * 0.84, p.h * 1.8, p.h * 1.92, p.rot,
                p.isJamb ? rail : mixHex(band, base, 0.35));
      continue;
    }
    const obj = objByKey(p.obj);
    if (!obj) {                                  /* nothing in the catalogue: a slab */
      const base = propColour(p);
      pushShape(p.x, p.z, p.shape, p.hx, p.hz, 0, p.h, p.rot, base);
      continue;
    }
    /* A REAL OBJECT IS SEVERAL PARTS OVER ONE COLLIDER. The parts are in the
       prop's own frame and one rotation places all of them, so a counter's rail
       stays on the front of the counter however it is turned. */
    const cr = Math.cos(p.rot || 0), sr = Math.sin(p.rot || 0);
    const shade = p.dark || 0;
    for (const d of obj.parts) {
      const wx = p.x + d.fx * cr - d.fz * sr;
      const wz = p.z + d.fx * sr + d.fz * cr;
      const col = mixHex(roles[d.col] || roles.body, tok('floor'), shade);
      pushShape(wx, wz, d.shape, d.hx, d.hz, d.y0, d.y1, (p.rot || 0) + (d.rot || 0), col);
    }
  }

  /* ---- signage ----------------------------------------------------------
   * A board on a post, sticking out from the wall it belongs to. Flat against
   * the wall it would be invisible from the only camera this game has. */
  for (const g of (room.signs || [])) {
    const face = mixHex(roles.glow, tok('body'), 0.18);
    pushShape(g.x, g.z, 'box', g.hx * 0.16, g.hz * 0.16, 0, g.y0, g.lean,
              mixHex(tok('wall'), tok('grid'), 0.4));
    pushShape(g.x, g.z, 'box', g.hx, g.hz, g.y0, g.y1, g.lean,
              mixHex(tok('wall'), tok('grid'), 0.15));
    pushShape(g.x, g.z, 'box', g.hx * 0.82, g.hz * 0.82, g.y0 + 0.07, g.y1 - 0.07, g.lean, face);
  }
}

/* THE VALUE RULE, ENFORCED BY CONSTRUCTION RATHER THAN BY DISCIPLINE.
 *
 * Nothing in the environment may be as bright as an actor. That has been checked
 * since the first room generator and it was checked by a function someone had to
 * remember to run — so the moment venues arrived, an arcade's lit screen was set
 * to --acid, which out-shines the dimmest mask in the cast, and the check caught
 * it only because it happened to be pointed at the right colours that day.
 * Every venue colour now passes through here and is dimmed until it is under the
 * floor, so no palette anyone writes later can break the rule at all.
 */
let _actorFloor = 0;
function actorFloor() {
  if (!_actorFloor) _actorFloor = Math.min(...CHARS.map((c) => luminance(c.skin)));
  return _actorFloor;
}
export function underActors(hex) {
  const cap = actorFloor() - 0.06;
  let c = hex;
  for (let i = 0; i < 24 && luminance(c) > cap; i++) c = mixHex(c, tok('floor'), 0.10);
  return c;
}

/* THE GROUND A VENUE STANDS ON.
 *
 * Call this before painting a room and every colour underneath the furniture —
 * the tiles, the gridlines, the decals, the blood, the wall mass, and the shade
 * every prop and every wall band is mixed toward — comes from that venue instead
 * of from one palette shared by all nine. See setGround in util.js.
 *
 * Nine venues used to differ only in their FURNITURE, because the ground was a
 * single near-black purple in every one of them. That is not a hue problem: the
 * floor sat at relative luminance 0.026 against a ceiling of 0.675, using 3.8%
 * of the range the value rule allows, and no hue is perceptible down there. Nine
 * palettes rendered as one room. */
export function useVenue(key) {
  const v = venueByKey(key);
  setGround(v && v.ground ? v.ground : null);
}

/* Resolve something for a venue that is NOT the one on screen — the design
   sheet draws all nine, the audit checks all nine — and put the ground back. */
export function forVenue(key, fn) {
  const prev = getGround();
  useVenue(key);
  try { return fn(); } finally { setGround(prev); }
}

/* EVERY COLOUR A VENUE CAN PUT ON SCREEN, resolved exactly the way it is drawn.
 * The value rule is checked against this rather than against the tokens a venue
 * names, because between the two there are four mixes and a cap — and the audit
 * that reads the tokens passes happily while the screen tells a different story.
 */
export function venueSurfaces(venueKey) {
  return forVenue(venueKey, () => _venueSurfaces(venueKey));
}
function _venueSurfaces(venueKey) {
  const v = venueByKey(venueKey);
  const W = v.wall || {};
  const out = propRoles({ venue: venueKey });
  if (W.skin) {
    out['wall.skin'] = underActors(tok(W.skin));
    out['wall.band'] = underActors(tok(W.band));
    out['wall.rail'] = underActors(mixHex(tok(W.rail), tok('body'), 0.25));
    out['wall.bay'] = underActors(mixHex(tok(W.bay), tok('bg'), 0.25));
    out['wall.glass'] = underActors(mixHex(tok(W.bay), tok('body'),
                                           W.win === 'glass' ? 0.40 : 0.26));
    out['wall.art'] = underActors(mixHex(tok(W.artCol || W.band), tok('body'), 0.30));
  }
  return out;
}

/* Which real colour each of a venue's five roles resolves to. */
export function propRoles(room) {
  return forVenue(room.venue, () => _propRoles(room));
}
function _propRoles(room) {
  const v = venueByKey(room.venue);
  const out = {};
  for (const k of Object.keys(v.roles)) out[k] = tok(v.roles[k]);
  /* `top` is lifted and `dark` dropped from whatever the venue named, so every
     object has a lit surface and a shadowed one without the venue having to
     supply five separate hexes. */
  /* THE TOP FACE IS THE ONE THE CAMERA SEES, so it is lifted hard away from the
     side it sits on — a 22% lift was not enough to tell a table top from a table
     leg at the distance this game is played at. `dark` drops for the same
     reason, in the other direction. Neither may pass the value rule's ceiling;
     checkValueRule tests these resolved colours, not the tokens they came from. */
  out.top = mixHex(out.top, tok('body'), 0.42);
  out.dark = mixHex(out.dark, tok('stage'), 0.42);
  out.metal = mixHex(out.metal, tok('body'), 0.34);
  for (const k of Object.keys(out)) out[k] = underActors(out[k]);
  return out;
}

/* Bodies are all --body white; the MEANING colour is the ring on the floor,
   where no prop competes with it. That is what lets the room be loud. */
/* A figure you can tell the FACING of from directly above. A torso and a head
   alone are rotationally symmetric from a top-down camera, so the one thing the
   player most needs to read — which way someone is pointing — was invisible.
   Shoulders plus a barrel nub fix that and cost four boxes. */
/* A PERSON.
 *
 * `who` is a character from chars.js, or undefined for the plain figure the
 * guess-marker uses. The body is the same for everyone — the mask is the whole
 * of the identity, exactly as it is in the reference — and the semantic colour
 * (are you looking at YOU or at IT) is the ring painted on the ground under
 * them, drawn by the caller. That separation is what lets the jackets be loud.
 */
const rotOf = (fx, fz) => ((fx || fz) ? Math.atan2(fz, fx) : 0);
/* How much bigger than life a head and its mask are drawn. See pushFigure. */
const HEAD = 1.30;
/* The neck: mask parts scale about this height, so a comb still sits on top of a
   skull rather than floating a hand's width above it. */
const NECK = 0.90;
/* THE MARK UNDER AN ACTOR.
 *
 * A closed ring is the obvious answer and it has two problems: it cages the
 * figure, and it says nothing except "here". These say WHICH WAY as well, and
 * they are drawn in the app's own language — hard corners, no hairlines.
 * `MARKERS.bracket` is what ships; the others are kept because the choice is a
 * real one and the design sheet shows all four side by side.
 */
export const MARKERS = {
  none: { name: 'None', note: 'No mark at all. The weapon points, and the actor stands in a pool of coloured light that says which side they are on.',
    draw(g, P, col, d) {
      /* THE WEAPON POINTS, SO NOTHING ELSE HAS TO — but the mark was answering a
       * second question the weapon does not: are you looking at YOU or at IT.
       * That is the one read the whole game rests on, and it is the reason the
       * jackets were free to be loud in the first place: the semantic lived on
       * the ground rather than on the clothes. Delete the mark and it goes too.
       *
       * A flat disc under the feet does not work, and the reason is worth
       * writing down: the body is drawn ON TOP of it, so all that survives is a
       * thin crescent around the boots — measured at a few hundred pixels of
       * colour on a 1400-wide arena, which is not a read, it is a rumour.
       *
       * A GLOW does work, because it is widest exactly where the body is not.
       * It is painted in screen space with a radial falloff, so it never has an
       * edge, never reads as a ring, and never cages the figure — it is light on
       * the floor, and light is the one thing in this scene that is allowed to
       * be brighter than an actor without competing with one.
       */
      const c = project(P.x, 0.010, P.z);
      const edge = project(P.x + 1.05, 0.010, P.z);
      if (!c || !edge) return;
      const rad = Math.max(12 * d, Math.hypot(edge[0] - c[0], edge[1] - c[1]));
      const grad = g.createRadialGradient(c[0], c[1], rad * 0.08, c[0], c[1], rad);
      grad.addColorStop(0, rgba(col, 0.74));
      grad.addColorStop(0.40, rgba(col, 0.38));
      grad.addColorStop(1, rgba(col, 0));
      g.save();
      g.fillStyle = grad;
      g.beginPath(); g.arc(c[0], c[1], rad, 0, 7); g.fill();
      g.restore();
    } },
  ring: { name: 'Ring', note: 'A closed circle. Says here, says nothing else.',
    draw(g, P, col, d) {
      arcPath(g, P, 0.66, 0, Math.PI * 2);
      g.strokeStyle = col; g.lineWidth = 3 * d; g.stroke();
    } },
  bracket: { name: 'Brackets', note: 'Four hard corners, opening forward. Reads as a reticle and leaves the figure uncaged.',
    draw(g, P, col, d) {
      g.strokeStyle = col; g.lineWidth = 3.4 * d; g.lineCap = 'butt';
      /* four arcs with gaps at the diagonals: corners of a box, in plan */
      for (let q = 0; q < 4; q++) {
        const a0 = P.face + q * Math.PI / 2 + 0.30;
        arcPath(g, P, 0.70, a0, a0 + (Math.PI / 2 - 0.60));
        g.stroke();
      }
    } },
  arc: { name: 'Broken arc', note: 'A heavy arc behind, a notch in front. The gap points where they are looking.',
    draw(g, P, col, d) {
      g.strokeStyle = col; g.lineWidth = 4.2 * d; g.lineCap = 'butt';
      arcPath(g, P, 0.68, P.face + 0.55, P.face + Math.PI * 2 - 0.55);
      g.stroke();
      /* the notch itself, as a solid tick on the centre line */
      g.lineWidth = 3 * d;
      const a = project(P.x + Math.cos(P.face) * 0.52, 0.012, P.z + Math.sin(P.face) * 0.52);
      const b = project(P.x + Math.cos(P.face) * 0.86, 0.012, P.z + Math.sin(P.face) * 0.86);
      if (a && b) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    } },
  chevron: { name: 'Chevron', note: 'One filled wedge, wrapped round the feet and pointing where they look. No circle anywhere.',
    draw(g, P, col, d) {
      /* CENTRED ON THE ACTOR, NOT PARKED IN FRONT OF THEM. The first version ran
         from f 0.34 to 0.92, entirely ahead of the figure, so it read as a
         separate object floating on the floor rather than as this person's mark.
         The wings now sweep back past the heels and the notch cradles the feet,
         so the figure stands INSIDE it — and the circle that used to sit under
         the whole thing is gone: it said nothing the wedge does not say, and it
         said it in the one shape that cannot point. */
      const pt = (f, r) => project(P.x + Math.cos(P.face) * f - Math.sin(P.face) * r, 0.012,
                                   P.z + Math.sin(P.face) * f + Math.cos(P.face) * r);
      const poly = [
        pt(0.98, 0),          /* the point */
        pt(0.30, 0.60),       /* right shoulder */
        pt(-0.46, 0.72),      /* right wing tip, behind the heels */
        pt(-0.16, 0),         /* the notch the actor stands in */
        pt(-0.46, -0.72),
        pt(0.30, -0.60),
      ].map((q) => q);
      if (poly.some((q) => !q)) return;
      /* a hard dark edge first, so the mark holds on a bright floor as well as a
         dark one — everything else in this game is drawn the same way */
      g.lineJoin = 'miter';
      g.beginPath(); g.moveTo(poly[0][0], poly[0][1]);
      for (const q of poly.slice(1)) g.lineTo(q[0], q[1]);
      g.closePath();
      g.strokeStyle = tok('shadow'); g.lineWidth = 5 * d; g.stroke();
      g.fillStyle = col; g.fill();
      /* and a bright spine down the middle, which is what makes the direction
         readable when the whole mark is forty pixels long */
      const a = pt(0.86, 0), b = pt(0.02, 0);
      if (a && b) {
        g.strokeStyle = tok('shadow'); g.lineWidth = 3.2 * d;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
    } },
};

function arcPath(g, P, r, a0, a1) {
  const N = Math.max(6, Math.round(((a1 - a0) / (Math.PI * 2)) * 44));
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = a0 + (a1 - a0) * (i / N);
    const q = project(P.x + Math.cos(a) * r, 0.012, P.z + Math.sin(a) * r);
    if (!q) return;
    i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]);
  }
}

/* Draw one actor's mark. `style` is a key of MARKERS. */
export function mark(g, x, z, hx, hz, col, d, style) {
  const m = MARKERS[style] || MARKERS.bracket;
  m.draw(g, { x, z, face: rotOf(hx || 0, hz || 0) }, col, d);
}

/* A RING THAT CLOSES WHILE A MAGAZINE GOES IN. Drawn on the ground rather than
   on the body, because at this camera anything drawn ON an actor competes with
   the actor. `t` runs 0 to 1. */
export function drawReload(g, x, z, t, col, d) {
  const pts = [];
  const n = 30, r = 0.62;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2 * clamp(t, 0, 1);
    pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
  }
  if (pts.length < 2) return;
  const P = [];
  for (const q of pts) { const w = project(q[0], 0.03, q[1]); if (!w) return; P.push(w); }
  g.beginPath(); g.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]);
  g.strokeStyle = col; g.lineWidth = 3.2 * d; g.lineCap = 'round';
  g.stroke();
  g.lineCap = 'butt';
}

/* THE RELOAD, AS A POSE RATHER THAN A PROGRESS BAR.
 *
 * Death is a real change of shape in this game — the same parts laid flat — and
 * a reload had been a ring on the floor, which is a HUD element wearing the
 * arena's clothes. This is built the same way the body is: the weapon drops out
 * of the aim, the off hand leaves the shoulder, goes down to the belt, comes
 * back up with a magazine, seats it, and the gun comes back to the aim.
 *
 * `t` runs 0 to 1 and returns the three things pushFigure needs: how far the
 * weapon has dropped, where the off hand is in the character's own frame, and
 * whether it is carrying a magazine while it is there.
 */
const RELOAD_POSE = (t) => {
  /* four beats: drop, fetch, seat, present */
  const dropT = clamp(t / 0.18, 0, 1);
  const backT = clamp((t - 0.78) / 0.22, 0, 1);
  const drop = Math.max(0, dropT - backT);          /* 0 aimed, 1 fully dipped */
  /* the hand: out to the side and down at the belt, then up to the weapon */
  const fetch = clamp((t - 0.12) / 0.26, 0, 1);
  const carry = clamp((t - 0.38) / 0.28, 0, 1);
  const ret = clamp((t - 0.66) / 0.22, 0, 1);
  const ease = (u) => u * u * (3 - 2 * u);
  const down = ease(fetch) * (1 - ease(carry));      /* at the belt */
  const up = ease(carry) * (1 - ease(ret));          /* at the weapon */
  return {
    drop,
    /* forward, right and height offsets of the off hand, in the body frame */
    hf: 0.10 * up,
    hr: -0.34 + 0.10 * down + 0.22 * up,
    hy: 0.74 - 0.30 * down - 0.02 * up,
    /* it carries a magazine on the way up, and for a moment after it seats */
    mag: up > 0.05 && ret < 0.9,
  };
};

export function pushFigure(x, z, col, alpha, hx, hz, accent, who, reloadT) {
  const A = CAM.ACTOR_AMBIENT;
  const fx = hx === undefined ? 0 : hx, fz = hz === undefined ? 0 : hz;
  const rx = -fz, rz = fx;                       /* right = perp of facing */
  const pal = who ? charPalette(who) : null;
  const jacket = pal ? pal.jacket : col;
  const dark = pal ? pal.dark : mixHex(col, tok('wall'), 0.42);
  const skin = pal ? pal.skin : col;
  pushBox(x, 0.14, z, 0.34, 0.14, 0.34, dark, alpha, A);                  /* boots */
  pushBox(x, 0.56, z, 0.28, 0.34, 0.28, jacket, alpha, A);                /* torso */
  const RP = (reloadT !== undefined && reloadT !== null) ? RELOAD_POSE(reloadT) : null;
  pushBox(x + rx * 0.34, 0.74, z + rz * 0.34, 0.13, 0.13, 0.13, jacket, alpha, A);
  if (RP) {
    /* the off hand goes to the belt and comes back with a magazine */
    const hxp = x + fx * RP.hf + rx * RP.hr, hzp = z + fz * RP.hf + rz * RP.hr;
    pushBox(hxp, RP.hy, hzp, 0.13, 0.13, 0.13, jacket, alpha, A);
    if (RP.mag)
      pushBox(hxp + fx * 0.05, RP.hy + 0.10, hzp + fz * 0.05,
              0.045, 0.10, 0.045, dark, alpha, A);
  } else {
    pushBox(x - rx * 0.34, 0.74, z - rz * 0.34, 0.13, 0.13, 0.13, jacket, alpha, A);
  }
  /* AN OCTAGON, NOT A CUBE. The head is what every mask hangs off, and a 0.40 m
     box read as a crate from above - which made all ten characters look like the
     same crate wearing different jewellery.
     AND IT IS SCALED UP. Anatomically a head is about a fifth of a person; from
     forty pixels up that is eight pixels for the only part of a character that
     carries any identity at all. HEAD is a deliberate exaggeration, applied to
     the skull and to every mask part hung off it so the proportions between them
     stay exactly as they were drawn. */
  pushShape(x, z, 'oct', 0.155 * HEAD, 0.155 * HEAD, 0.87, 0.87 + 0.24 * HEAD,
            rotOf(fx, fz), skin, A, alpha);
  const rot = rotOf(fx, fz);
  const cr = Math.cos(rot), sr = Math.sin(rot);
  /* Parts are written in the character's own frame (+f forward, +r right) and
     placed by one rotation, so a beak and a muzzle always point the same way. */
  const place = (list, k) => {
    const sc = k === undefined ? 1 : k;
    for (const m of list) {
      pushShape(x + m.f * sc * cr - m.r * sc * sr, z + m.f * sc * sr + m.r * sc * cr,
                m.shape, m.hx * sc, m.hz * sc,
                NECK + (m.y0 - NECK) * sc, NECK + (m.y1 - NECK) * sc,
                rot + (m.rot || 0), pal[m.col] || pal.jacket, A, alpha);
    }
  };
  if (!who) {
    /* the guess marker has no character, so it keeps the plain stub */
    if (fx || fz) pushBox(x + fx * 0.46, 0.72, z + fz * 0.46, 0.11, 0.07, 0.11,
                          accent || dark, alpha, A);
    return;
  }
  place(who.mask, HEAD);
  const wep = WEAPONS[who.weapon];
  /* THE WEAPON IS THE ONLY THING LEFT THAT SAYS WHICH WAY SOMEONE IS FACING, so
     it is drawn larger than life too — and by a different amount from the head,
     because a gun scaled to match a 1.3x skull is a cannon. */
  if (wep && (fx || fz)) {
    if (RP && RP.drop > 0.01) {
      /* THE SAME PARTS, PULLED BACK AND TIPPED DOWN. Not a different weapon and
         not a hidden one: it is the gun the character always carries, held the
         way you hold one you are not currently pointing. */
      const d0 = RP.drop;
      for (const m of wep.parts) {
        const sc = 1.22;
        const f = (m.f - 0.30 * d0) * sc, r = (m.r + 0.10 * d0) * sc;
        pushShape(x + f * cr - r * sr, z + f * sr + r * cr,
                  m.shape, m.hx * sc, m.hz * sc,
                  NECK + (m.y0 - NECK) * sc - 0.20 * d0,
                  NECK + (m.y1 - NECK) * sc - 0.20 * d0,
                  rot + (m.rot || 0) + 0.5 * d0, pal[m.col] || pal.jacket, A, alpha);
      }
    } else place(wep.parts, 1.22);
  }
}

/* ---- a body on the floor -------------------------------------------------
 * A kill used to make the enemy stop being drawn, which reads as it blinking
 * out of existence — the least satisfying way to end a fight there is. This is
 * the same character lying down: the parts are the ones the standing figure
 * uses, laid flat and stretched along the direction it fell, with the mask still
 * on and the weapon dropped beside it.
 *
 * Everything is under 0.2 m tall, so from this camera a body reads as a stain
 * with a shape rather than as a person who has become short.
 */
export function pushCorpse(x, z, fell, who, col) {
  const A = CAM.ACTOR_AMBIENT;
  const pal = who ? charPalette(who) : null;
  const jacket = pal ? pal.jacket : col;
  const dark = pal ? pal.dark : mixHex(col, tok('wall'), 0.42);
  const skin = pal ? pal.skin : col;
  const rot = fell || 0;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const at = (f, r) => [x + f * cr - r * sr, z + f * sr + r * cr];

  /* legs, torso, one arm flung out: a silhouette, not an anatomy */
  let q = at(-0.34, 0.02);
  pushShape(q[0], q[1], 'box', 0.30, 0.13, 0, 0.10, rot, dark, A);
  q = at(0.02, 0);
  pushShape(q[0], q[1], 'oct', 0.30, 0.21, 0, 0.15, rot, jacket, A);
  q = at(-0.02, 0.30);
  pushShape(q[0], q[1], 'box', 0.22, 0.09, 0, 0.09, rot + 0.6, jacket, A);
  q = at(0.10, -0.28);
  pushShape(q[0], q[1], 'box', 0.20, 0.09, 0, 0.09, rot - 0.5, jacket, A);

  /* the head, still wearing its mask, laid flat and pointing the way it fell */
  q = at(0.46, 0.04);
  pushShape(q[0], q[1], 'oct', 0.20, 0.19, 0, 0.17, rot, skin, A);
  if (who) {
    for (const m of who.mask) {
      /* only the parts that stick OUT survive the trip to the floor — the rest
         would be inside the head at this height and just add noise */
      if (Math.abs(m.f) < 0.12 && Math.abs(m.r) < 0.12) continue;
      const w = at(0.46 + m.f * 1.15, 0.04 + m.r * 1.15);
      pushShape(w[0], w[1], m.shape, m.hx * 1.15, m.hz * 1.15, 0.02, 0.15,
                rot + (m.rot || 0), pal[m.col] || pal.jacket, A);
    }
  }
  /* and the weapon, dropped */
  if (who) {
    const wep = WEAPONS[who.weapon];
    if (wep) {
      for (const m of wep.parts) {
        const w = at(0.20 + m.r * 1.2, 0.52 + m.f * 0.9);
        pushShape(w[0], w[1], m.shape, m.hx * 1.1, m.hz * 1.1, 0, 0.07,
                  rot + 1.35 + (m.rot || 0), pal[m.col] || pal.steel, A);
      }
    }
  }
}

/* ---- muzzle flash --------------------------------------------------------
 * Drawn straight to the 2-D context rather than pushed as geometry, because it
 * is light: it has no depth, it must never be sorted behind anything, and it is
 * gone in a tenth of a second. A four-point star at the muzzle with a hot core,
 * plus a pool of it on the floor so the room lights up for one frame.
 */
/* ---- SPENT MAGAZINES -----------------------------------------------------
 * They fall, they bounce once, and they stay. Nothing about them is mechanical:
 * they hit nobody and block nothing. They are here so a reload has a consequence
 * you can see on the floor afterwards — so that late in a round you can read off
 * the ground roughly how much shooting has happened and where from.
 */
export function stepMags(mags, now, dt) {
  for (const m of mags) {
    if (m.rest) continue;
    m.vy -= 9.0 * dt;
    m.y += m.vy * dt;
    m.x += m.vx * dt; m.z += m.vz * dt;
    m.vx *= 0.90; m.vz *= 0.90;
    m.rot += m.spin * dt;
    m.spin *= 0.93;
    if (m.y <= 0.03) {
      m.y = 0.03;
      /* one bounce, then it is furniture */
      if (m.vy < -0.55) { m.vy = -m.vy * 0.34; m.spin *= 0.5; }
      else { m.vy = 0; m.rest = 1; m.vx = 0; m.vz = 0; }
    }
  }
}

/* Shells fall like the magazines do but smaller, faster and with more of them,
   so they get their own pass rather than sharing the mag one — the numbers are
   different enough that one set of constants would be wrong for both. */
export function stepShells(shells, dt) {
  for (const m of shells) {
    if (m.rest) continue;
    m.vy -= 11.0 * dt;
    m.y += m.vy * dt;
    m.x += m.vx * dt; m.z += m.vz * dt;
    m.vx *= 0.86; m.vz *= 0.86;
    m.rot += m.spin * dt;
    m.spin *= 0.90;
    if (m.y <= 0.02) {
      m.y = 0.02;
      if (m.vy < -0.9) { m.vy = -m.vy * 0.30; m.spin *= 0.6; }
      else { m.vy = 0; m.rest = 1; m.vx = 0; m.vz = 0; }
    }
  }
}

export function drawShells(g, shells, d, colMine, colIts) {
  for (const m of shells) {
    const p = project(m.x, m.y + 0.01, m.z);
    if (!p) continue;
    const s = (p[2] || 1);
    const L = 0.115 * s, W = 0.05 * s;
    const c = Math.cos(m.rot), sn = Math.sin(m.rot);
    g.save();
    g.translate(p[0], p[1]);
    g.beginPath();
    g.moveTo(-c * L / 2 - sn * W / 2, -sn * L / 2 + c * W / 2);
    g.lineTo(c * L / 2 - sn * W / 2, sn * L / 2 + c * W / 2);
    g.lineTo(c * L / 2 + sn * W / 2, sn * L / 2 - c * W / 2);
    g.lineTo(-c * L / 2 + sn * W / 2, -sn * L / 2 - c * W / 2);
    g.closePath();
    g.fillStyle = m.mine ? colMine : colIts;
    g.fill();
    if (L > 2.2) { g.strokeStyle = OUTLINE; g.lineWidth = 0.9; g.stroke(); }
    g.restore();
  }
}

export function drawMags(g, mags, d, colMine, colIts) {
  for (const m of mags) {
    const p = project(m.x, m.y + 0.02, m.z);
    if (!p) return;
    const s = (p[2] || 1);
    const L = 0.30 * s, W = 0.10 * s;
    const c = Math.cos(m.rot), sn = Math.sin(m.rot);
    /* a shadow on the floor, so it reads as an object and not a decal */
    const q = project(m.x, 0.014, m.z);
    if (q) {
      g.fillStyle = 'rgba(0,0,0,.42)';
      g.beginPath();
      g.ellipse(q[0], q[1], L * 0.55, L * 0.26, m.rot, 0, 7);
      g.fill();
    }
    g.save();
    g.translate(p[0], p[1]);
    g.beginPath();
    g.moveTo(-c * L / 2 - sn * W / 2, -sn * L / 2 + c * W / 2);
    g.lineTo(c * L / 2 - sn * W / 2, sn * L / 2 + c * W / 2);
    g.lineTo(c * L / 2 + sn * W / 2, sn * L / 2 - c * W / 2);
    g.lineTo(-c * L / 2 + sn * W / 2, -sn * L / 2 - c * W / 2);
    g.closePath();
    g.fillStyle = m.mine ? colMine : colIts;
    g.fill();
    g.strokeStyle = OUTLINE; g.lineWidth = 1.1; g.stroke();
    g.restore();
  }
}

export function drawFlash(g, f, now, d) {
  const age = (now - f.t0) / 130;
  if (age < 0 || age > 1) return;
  const fade = 1 - age;
  const mx = f.x + f.hx * 0.92, mz = f.z + f.hz * 0.92;
  const c = project(mx, 0.78, mz);
  if (!c) return;
  const scale = project(mx + 0.5, 0.78, mz);
  const unit = scale ? Math.hypot(scale[0] - c[0], scale[1] - c[1]) : 12 * d;

  /* the light it throws on the floor, first and widest */
  const fc = project(mx, 0.012, mz);
  if (fc) {
    const rr = unit * (2.6 + 1.4 * fade);
    const gr = g.createRadialGradient(fc[0], fc[1], unit * 0.15, fc[0], fc[1], rr);
    gr.addColorStop(0, rgba(tok('acid'), 0.30 * fade));
    gr.addColorStop(1, rgba(tok('acid'), 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(fc[0], fc[1], rr, 0, 7); g.fill();
  }

  /* the flame: a star whose long axis runs along the barrel */
  const ang = Math.atan2(
    (project(mx + f.hx, 0.78, mz + f.hz) || c)[1] - c[1],
    (project(mx + f.hx, 0.78, mz + f.hz) || c)[0] - c[0]);
  const L = unit * (1.5 + 0.9 * fade), W = unit * (0.62 + 0.3 * fade);
  const star = (len, wid) => {
    const pts = [[len, 0], [wid * 0.42, wid], [-wid * 0.5, 0], [wid * 0.42, -wid]];
    g.beginPath();
    pts.forEach(([a, b], i) => {
      const px = c[0] + Math.cos(ang) * a - Math.sin(ang) * b;
      const py = c[1] + Math.sin(ang) * a + Math.cos(ang) * b;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    });
    g.closePath();
  };
  g.save();
  g.globalAlpha = 0.85 * fade;
  g.fillStyle = tok('warm');
  star(L, W); g.fill();
  g.globalAlpha = fade;
  g.fillStyle = tok('acid');
  star(L * 0.62, W * 0.5); g.fill();
  g.fillStyle = tok('body');
  star(L * 0.30, W * 0.26); g.fill();
  g.restore();
}

export { fitCanvas };
