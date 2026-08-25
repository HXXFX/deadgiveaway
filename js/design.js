/* THE DESIGN SHEET.
 *
 * Every swatch on this page is drawn by the GAME'S OWN renderer from the GAME'S
 * OWN generator. Nothing here is a mock-up, a screenshot or a redrawing, which
 * is the only way a review of it means anything: if a character looks wrong on
 * this page it looks wrong in the arena, and if it is fixed here it is fixed
 * there. That is also why this file is mostly camera work and captions.
 */
import { CHARS, WEAPONS, palette, auditChars, castFor } from './chars.js';
import { buildUi } from './design-ui.js';
import { OBJECTS, VENUES, byTag, venueByKey, sizeOf } from './props.js';
import { WORLD, CAM, ROOM } from './config.js';
import { tok, mixHex, luminance, contrast, fitCanvas, mulberry32 } from './util.js';
import { makeRoom, connectivity, propColour, splat } from './room.js';
import {
  cam, pushShape, pushBox, pushFigure, pushCorpse, drawFlash, flushFaces,
  project, mark, MARKERS, drawFloor, pushWallsAndProps, FOOTPRINTS, setCamera,
  propRoles, forVenue,
} from './render.js';

const $ = (s, r) => (r || document).querySelector(s);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt !== undefined) n.textContent = txt;
  return n;
};

/* ---- the studio ---------------------------------------------------------
 * A camera pointed at one object at the origin. The arena camera solves its own
 * focal length from the room's extents, which is right for the game and useless
 * for a swatch, so this sets the camera fields directly and frames a sphere of
 * a given radius.
 */
function studio(canvas, { pitch = 1.05, yaw = 0.55, radius = 1.0, ground = true,
                          at = [0, 0.6, 0] } = {}) {
  const { w, h, d } = fitCanvas(canvas);
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  if (ground) {
    g.fillStyle = mixHex(tok('floor'), tok('stage'), 0.35);
    g.fillRect(0, 0, w, h);
  }
  const dist = radius * 3.4;
  cam.mode = 'studio';
  cam.pos[0] = at[0] + dist * Math.cos(pitch) * Math.sin(yaw);
  cam.pos[1] = at[1] + dist * Math.sin(pitch);
  cam.pos[2] = at[2] + dist * Math.cos(pitch) * Math.cos(yaw);
  const dx = at[0] - cam.pos[0], dy = at[1] - cam.pos[1], dz = at[2] - cam.pos[2];
  const l = Math.hypot(dx, dy, dz) || 1;
  cam.fwd[0] = dx / l; cam.fwd[1] = dy / l; cam.fwd[2] = dz / l;
  const rx = -cam.fwd[2], rz = cam.fwd[0], rl = Math.hypot(rx, rz) || 1;
  cam.rgt[0] = rx / rl; cam.rgt[1] = 0; cam.rgt[2] = rz / rl;
  cam.up[0] = cam.rgt[1] * cam.fwd[2] - cam.rgt[2] * cam.fwd[1];
  cam.up[1] = cam.rgt[2] * cam.fwd[0] - cam.rgt[0] * cam.fwd[2];
  cam.up[2] = cam.rgt[0] * cam.fwd[1] - cam.rgt[1] * cam.fwd[0];
  cam.f = (Math.min(w, h) * 0.42) * dist / radius;
  cam.ox = w / 2; cam.oy = h / 2;
  return { g, w, h, d };
}

/* A plain circle, kept ONLY for decision A's "ring carries it" panel, which
   exists to show the option that was NOT taken. Nothing else may use it. */
function studioRing(g, x, z, r, col, d) {
  const N = 40, pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const p = project(x + Math.cos(a) * r, 0.012, z + Math.sin(a) * r);
    if (!p) return;
    pts.push(p);
  }
  g.strokeStyle = col; g.lineWidth = 3 * d;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  g.closePath(); g.stroke();
}

function card(parent, title, sub) {
  const c = el('div', 'dcard');
  const head = el('div', 'dhead');
  head.append(el('b', 'hm', title));
  if (sub) head.append(el('i', null, sub));
  c.append(head);
  parent.append(c);
  return c;
}

function swatchRow(parent, items) {
  const row = el('div', 'swatches');
  for (const [name, hex] of items) {
    const s = el('div', 'sw');
    const chip = el('span', 'chip');
    chip.style.background = hex;
    s.append(chip, el('b', null, name), el('i', null, hex.toUpperCase()));
    row.append(s);
  }
  parent.append(row);
}

/* ====================================================================== */
/* 1. THE CAST                                                             */
/* ====================================================================== */
function drawChar(canvas, who, opts = {}) {
  const { pitch = 1.02, yaw = 0.6, facing = [1, 0], scale = 1, ring = null,
          radius = 1.0, at = [0, 0.62, 0] } = opts;
  const { g, d } = studio(canvas, { pitch, yaw, radius, at });
  /* THE MARK THE GAME ACTUALLY DRAWS, not a circle this page invented. The tile
     kept its own ring helper after the game stopped using one, so the sheet was
     advertising a design that had already been replaced — which is the exact
     failure a page drawn by the real renderer is supposed to make impossible. */
  if (ring) mark(g, 0, 0, facing[0], facing[1], ring, d, 'none');
  const saved = who.mask;
  if (scale !== 1) {
    who = { ...who, mask: who.mask.map((m) => ({
      ...m, hx: m.hx * scale, hz: m.hz * scale,
      y1: 1.0 + (m.y1 - 1.0) * scale, y0: 1.0 + (m.y0 - 1.0) * scale,
    })) };
  }
  pushFigure(0, 0, tok('body'), 1, facing[0], facing[1], tok('hot'), who);
  flushFaces(g);
  who.mask = saved;
}

function sectionCast(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'The cast'));
  sec.append(el('p', 'lede',
    'Ten masks. The body underneath is identical for all of them — from a top-down ' +
    'camera the mask is the whole of the identity, exactly as it is in the reference. ' +
    'Each is drawn here by the game renderer at the scale it appears in play (small ' +
    'tile) and blown up so the silhouette can be judged (large tile).'));

  const bad = auditChars(0.363);
  const audit = el('div', bad.length ? 'audit bad' : 'audit ok');
  audit.append(el('b', 'hm', bad.length ? bad.length + ' rule violations' : 'palette rules: all pass'));
  audit.append(el('i', null, bad.length ? bad.join(' · ')
    : 'Every mask base beats the brightest thing the room generator can emit; every jacket ' +
      'clears the floor by at least 1.6:1 and sits at least 90 units away from --hot, --cool ' +
      'and --acid so it can never be mistaken for a ring colour.'));
  sec.append(audit);

  const grid = el('div', 'cast');
  for (const c of CHARS) {
    const box = el('div', 'char');
    const pal = palette(c);
    const heroC = el('canvas', 'hero');
    const tileC = el('canvas', 'tile');
    box.append(el('b', 'hm name', c.name));
    const wrap = el('div', 'charviz');
    wrap.append(heroC, tileC);
    box.append(wrap);
    box.append(el('i', 'note', c.note));
    const sw = el('div', 'minisw');
    for (const [k, v] of [['jacket', pal.jacket], ['trim', pal.trim],
                          ['mask', pal.skin], ['shade', pal.dark]]) {
      const s = el('span', 'mchip'); s.style.background = v; s.title = k + ' ' + v;
      sw.append(s);
    }
    box.append(sw);
    box.append(el('i', 'meta',
      `${c.family} · ${c.mask.length} mask parts · carries the ${(WEAPONS[c.weapon] || {}).name || '?'}`));
    grid.append(box);
    requestAnimationFrame(() => {
      /* HEAD CLOSE-UP for the hero, because the mask IS the design and at any
         framing that includes the boots it is four pixels of one. The small tile
         beside it is the same character at the camera the game actually uses,
         which is the honest half of the pair — see decision B. */
      drawChar(heroC, c, { pitch: 0.58, yaw: 0.72, radius: 0.42, at: [0, 1.08, 0] });
      drawChar(tileC, c, { pitch: 1.34, yaw: 0, radius: 1.45, ring: tok('hot') });
    });
  }
  sec.append(grid);
  root.append(sec);
}

/* ====================================================================== */
/* 2. THE DECISIONS THAT ARE STILL OPEN                                    */
/* ====================================================================== */
function sectionChoices(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'Open decisions'));
  sec.append(el('p', 'lede',
    'Three things that are genuinely a choice rather than a bug. Each is shown as ' +
    'it currently ships on the left and as the alternative on the right.'));

  /* --- A. where the YOU/IT semantic lives --------------------------------- */
  const a = card(sec, 'A · where YOU and IT live',
    'shipping: the ground ring. alternative: the jacket.');
  a.append(el('p', 'why',
    'The whole game rests on telling your figure from its figure instantly. That ' +
    'message currently lives in the ring painted under each actor, which is what ' +
    'frees the jackets to be as loud as the reference’s. The alternative puts it ' +
    'back in the clothes: unmistakable, but then every character wears the same two ' +
    'colours and the cast above stops meaning anything.'));
  const arow = el('div', 'compare');
  for (const [label, mode] of [['ring carries it', 'ring'], ['jacket carries it', 'jacket']]) {
    const cell = el('div', 'cmp');
    cell.append(el('b', null, label));
    const cv = el('canvas', 'wide');
    cell.append(cv);
    arow.append(cell);
    requestAnimationFrame(() => {
      const { g, d } = studio(cv, { pitch: 1.05, yaw: 0.45, radius: 1.5, at: [0, 0.72, 0] });
      const you = CHARS[3], foe = CHARS[7];
      if (mode === 'ring') {
        studioRing(g, -1.2, 0, 0.66, tok('cool'), d);
        studioRing(g, 1.2, 0, 0.66, tok('hot'), d);
        pushFigure(-1.2, 0, tok('body'), 1, 1, 0, tok('cool'), you);
        pushFigure(1.2, 0, tok('body'), 1, -1, 0, tok('hot'), foe);
      } else {
        pushFigure(-1.2, 0, tok('body'), 1, 1, 0, tok('cool'),
                   { ...you, jacket: tok('cool'), trim: '#eafcff', skin: '#eafcff' });
        pushFigure(1.2, 0, tok('body'), 1, -1, 0, tok('hot'),
                   { ...foe, jacket: tok('hot'), trim: '#ffe6f3', skin: '#ffe6f3' });
      }
      flushFaces(g);
    });
  }
  a.append(arow);

  /* --- B. mask scale ------------------------------------------------------ */
  const b = card(sec, 'B · how big the masks are',
    'shipping: 1.0. alternative: 1.35, readable further out.');
  b.append(el('p', 'why',
    'At the default camera an actor is about 40 pixels tall, and a mask sized like ' +
    'a real one is a few pixels of it. Oversizing reads better from above and looks ' +
    'wrong the moment you switch to first-person.'));
  const brow = el('div', 'compare');
  for (const [label, sc] of [['1.0 ×', 1], ['1.35 ×', 1.35], ['1.7 ×', 1.7]]) {
    const cell = el('div', 'cmp');
    cell.append(el('b', null, label));
    const cv = el('canvas', 'wide');
    cell.append(cv);
    brow.append(cell);
    requestAnimationFrame(() => drawChar(cv, CHARS[0],
      { pitch: 1.32, yaw: 0, radius: 1.45, scale: sc, ring: tok('hot') }));
  }
  b.append(brow);

  /* --- D. how close the camera sits --------------------------------------- */
  const dsec = card(sec, 'D \u00b7 how close the camera sits',
    'shipping: the whole arena at 38 m. alternative: 22 m, following you.');
  dsec.append(el('p', 'why',
    'This is the biggest single lever on whether the game looks like the reference, ' +
    'and it is a real trade rather than an oversight. At 38 m the whole arena is on ' +
    'screen, you can always see where the enemy is, and an actor is about forty ' +
    'pixels tall - which is why the masks above are a smudge in play. At 22 m the ' +
    'characters read, the floor graphics read, and it looks like the reference; you ' +
    'also lose sight of an enemy that is two rooms away. The wheel and the view cube ' +
    'already move between these, so this is only a question of which one the game ' +
    'starts at.'));
  const drow = el('div', 'compare');
  for (const [label, dist] of [['38 m \u2014 whole arena', 38], ['28 m', 28], ['22 m \u2014 close', 22]]) {
    const cell = el('div', 'cmp');
    cell.append(el('b', null, label));
    const cv = el('canvas', 'wide');
    cell.append(cv);
    drow.append(cell);
    requestAnimationFrame(() => {
      const room = makeRoom((Math.random() * 2147483647) | 0);
      const { w, h } = fitCanvas(cv);
      const g = cv.getContext('2d');
      /* the design sheet draws venues that are not the one on screen, so every
         room canvas paints inside its own ground and hands it back */
      forVenue(room.venue, () => {
      g.fillStyle = tok('stage'); g.fillRect(0, 0, w, h);
      /* userZoom FIXES the focal length. Without it setCamera re-solves f from
         the arena's extents every time, so all three of these framed the same
         room at the same size and the comparison showed nothing — which is what
         the game does deliberately until you touch the wheel. */
      cam.mode = 'top'; cam.yaw = 0; cam.pitch = 1.32; cam.dist = dist; cam.userZoom = true;
      setCamera(w, h, { x: 0, z: 0, hx: 1, hz: 0 });
      drawFloor(g, room, w, h);
      pushWallsAndProps(room);
      pushFigure(-1.4, 0.6, tok('body'), 1, 1, 0, tok('cool'), CHARS[0]);
      pushFigure(1.6, -0.5, tok('body'), 1, -1, 0, tok('hot'), CHARS[2]);
      flushFaces(g);
      });
    });
  }
  dsec.append(drow);

  /* --- C. how loud the floor is ------------------------------------------- */
  const c = card(sec, 'C · how loud the floor is',
    'shipping: patterns at full strength under everything.');
  c.append(el('p', 'why',
    'The reference’s floors are extremely loud. Ours are too, and the measured ' +
    'constraint is only that nothing on the floor may be as bright as an actor — ' +
    'not that it must be quiet. Every pattern the generator can pick is below.'));
  root.append(sec);
}

/* ====================================================================== */
/* 3. WALLS, OBJECTS, FLOOR GRAPHICS                                       */
/* ====================================================================== */
const PROP_SHAPES = [
  ['hex', 'column', 0.55, 0.55, 1.7, 'circle'],
  ['box', 'slab', 1.7, 0.42, 1.0, 'obb'],
  ['wedge', 'wedge', 1.2, 1.1, 0.95, 'obb'],
  ['ell', 'corner', 1.25, 1.25, 0.95, 'obb'],
  ['oct', 'chamfer', 0.95, 0.95, 0.85, 'circle'],
  ['tee', 'tee', 1.25, 1.1, 1.0, 'obb'],
  ['plus', 'cross', 1.05, 1.05, 0.95, 'circle'],
  ['trap', 'taper', 1.3, 1.0, 1.05, 'obb'],
];

/* ====================================================================== */
/* WEAPONS                                                                 */
/* ====================================================================== */
function sectionWeapons(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'What they carry'));
  sec.append(el('p', 'lede',
    'The gun used to be one cube on the end of an arm. A weapon is built from the ' +
    'same parts as a mask and judged by the same test: from directly above, can you ' +
    'tell this one from the other nine? That rules out anything whose identity is ' +
    'its side profile, so what is left is LENGTH, WIDTH and the shape of the far ' +
    'end. Left tile is the top-down read, right tile is the same weapon from a ' +
    'lower angle. Nothing here changes the fight — the gun is hitscan and always ' +
    'was; this is what you are holding while it happens.'));
  const grid = el('div', 'objs');
  for (const c of CHARS) {
    const w = WEAPONS[c.weapon];
    if (!w) continue;
    const box = el('div', 'obj');
    const a = el('canvas', 'objcv'), b = el('canvas', 'objcv');
    const pair = el('div', 'wpair');
    pair.append(a, b);
    box.append(pair, el('b', null, w.name), el('i', null, w.note),
               el('i', 'meta', 'carried by ' + c.name));
    grid.append(box);
    requestAnimationFrame(() => {
      drawChar(a, c, { pitch: 1.40, yaw: 0, radius: 0.68, at: [0.42, 0.74, 0] });
      drawChar(b, c, { pitch: 0.42, yaw: 0.95, radius: 0.55, at: [0.44, 0.74, 0] });
    });
  }
  sec.append(grid);
  root.append(sec);
}

/* ====================================================================== */
/* FIRING AND DYING                                                        */
/* ====================================================================== */
function sectionKill(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'Firing and dying'));
  sec.append(el('p', 'lede',
    'Two moments the game had no picture of. A shot was a line and a kill was the ' +
    'enemy ceasing to be drawn \u2014 which reads as blinking out of existence, the ' +
    'least satisfying way to end a fight there is. The flash is light rather than ' +
    'geometry: no depth, never sorted behind anything, gone in a tenth of a second. ' +
    'The body is the same character lying down, keeping the direction it fell in, ' +
    'wearing its mask, with the weapon dropped beside it and blood under it.'));
  const row = el('div', 'compare');
  const shots = [
    ['standing', (g, d) => {
      mark(g, 0, 0, 1, 0, tok('hot'), d, 'none');
      pushFigure(0, 0, tok('body'), 1, 1, 0, tok('hot'), CHARS[0]);
      flushFaces(g);
    }],
    ['firing', (g, d) => {
      mark(g, 0, 0, 1, 0, tok('hot'), d, 'none');
      pushFigure(0, 0, tok('body'), 1, 1, 0, tok('hot'), CHARS[0]);
      flushFaces(g);
      drawFlash(g, { x: 0, z: 0, hx: 1, hz: 0, t0: 0 }, 30, d);
    }],
    ['dead', (g, d) => {
      /* the real blood decals, drawn by the real floor pass */
      const room = { pattern: 'checker', tiles: [], decals: [], props: [], blood: [],
                     venue: 'bar', signs: [], walls: [] };
      for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) room.tiles.push({ i, j, v: 0.5 });
      splat(room, 0, 0, 1, true);
      splat(room, 0.5, 0, 2, true);
      splat(room, -0.35, 0, 3, false);
      const { w, h } = { w: 0, h: 0 };
      drawFloorOn(g, room);
      pushCorpse(0, 0, 0, CHARS[0], tok('body'));
      flushFaces(g);
    }],
  ];
  for (const [label, draw] of shots) {
    const cell = el('div', 'cmp');
    cell.append(el('b', null, label));
    const cv = el('canvas', 'wide');
    cell.append(cv);
    row.append(cell);
    requestAnimationFrame(() => {
      const { g, d } = studio(cv, { pitch: 1.16, yaw: 0.35, radius: 1.35, at: [0.1, 0.45, 0] });
      draw(g, d);
    });
  }
  sec.append(row);
  root.append(sec);
}

/* the floor pass needs the canvas size it was given */
function drawFloorOn(g, room) {
  const c = g.canvas;
  drawFloor(g, room, c.width, c.height);
}

/* ====================================================================== */
/* THE MARK UNDER AN ACTOR                                                 */
/* ====================================================================== */
function sectionMarkers(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'The mark under an actor'));
  sec.append(el('p', 'lede',
    'This is what says YOU and IT, and it is the single most important mark on the ' +
    'screen — the whole game rests on telling the two figures apart instantly. A ' +
    'closed ring did the job and had two problems: it cages the figure, and it says ' +
    'nothing except "here". Once the weapon grew big enough to point, none of ' +
    'them was needed for direction any more — but the mark was also the only ' +
    'thing saying which SIDE an actor is on, and that is the read the whole game ' +
    'rests on. What ships is the smallest thing that still carries it: a pool of ' +
    'colour under the feet, read the way a shadow is read. ' +
    'all four are one word in config.'));
  const row = el('div', 'compare');
  for (const key of Object.keys(MARKERS)) {
    const m = MARKERS[key];
    const cell = el('div', 'cmp');
    cell.append(el('b', null, m.name + (key === 'none' ? ' — shipping' : '')));
    const cv = el('canvas', 'wide');
    cell.append(cv, el('i', 'note', m.note));
    row.append(cell);
    requestAnimationFrame(() => {
      const { g, d } = studio(cv, { pitch: 1.30, yaw: 0, radius: 1.5, at: [0, 0.5, 0] });
      mark(g, -0.95, 0, 1, 0, tok('cool'), d, key);
      mark(g, 0.95, 0, -1, 0, tok('hot'), d, key);
      pushFigure(-0.95, 0, tok('body'), 1, 1, 0, tok('cool'), CHARS[4]);
      pushFigure(0.95, 0, tok('body'), 1, -1, 0, tok('hot'), CHARS[7]);
      flushFaces(g);
    });
  }
  sec.append(row);
  root.append(sec);
}

/* ====================================================================== */
/* VENUES                                                                  */
/* ====================================================================== */
function sectionVenues(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'Venues'));
  sec.append(el('p', 'lede',
    'A room is somewhere. The venue picks the furniture, the signage, the floor ' +
    'pattern and the palette together — that is the whole difference between "a ' +
    'room" and "a bar". It changes nothing that was measured: the prop count, the ' +
    'clear centre, the spacing rule and the connectivity check are identical ' +
    'whatever the room is pretending to be. The WALLS belong to the venue too — ' +
    'they were the last thing in the room that did not, five identical near-black ' +
    'boxes telling you nothing while the floor and the furniture told you ' +
    'everything. Each thumbnail is generated live.'));
  const grid = el('div', 'rooms');
  for (const v of VENUES) {
    const box = el('div', 'room');
    const cv = el('canvas', 'roomcv');
    box.append(el('b', 'hm vname', v.name), cv, el('i', null, v.note));
    const sw = el('div', 'minisw');
    grid.append(box);
    requestAnimationFrame(() => {
      /* keep drawing rooms until this venue comes up — the generator picks it */
      let room = null;
      for (let i = 0; i < 90 && !room; i++) {
        const cand = makeRoom((Math.random() * 2147483647) | 0);
        if (cand.venue === v.key) room = cand;
      }
      if (!room) return;
      const roles = propRoles(room);
      for (const [k, c] of Object.entries(roles)) {
        const chip = el('span', 'mchip'); chip.style.background = c; chip.title = k + ' ' + c;
        sw.append(chip);
      }
      box.append(sw);
      box.append(el('i', 'meta', 'walls: ' + (v.wall ? v.wall.name : 'plain')));
      box.append(el('i', null, byTag(v.tag).map((o) => o.name).join(' · ')));
      const { w, h } = fitCanvas(cv);
      const g = cv.getContext('2d');
      /* the design sheet draws venues that are not the one on screen, so every
         room canvas paints inside its own ground and hands it back */
      forVenue(room.venue, () => {
      g.fillStyle = tok('stage'); g.fillRect(0, 0, w, h);
      cam.mode = 'top'; cam.yaw = 0; cam.pitch = 1.44; cam.dist = CAM.TOP_DIST;
      cam.userZoom = false;
      setCamera(w, h, { x: 0, z: 0, hx: 1, hz: 0 });
      drawFloor(g, room, w, h);
      pushWallsAndProps(room);
      flushFaces(g);
      });
    });
  }
  sec.append(grid);
  root.append(sec);
}

function sectionObjects(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'Objects'));
  sec.append(el('p', 'lede',
    'Sixteen real things. The arena used to be furnished with slabs — a box, a wedge, ' +
    'an L — which obeyed every measured rule about cover and sightlines and meant ' +
    'nothing, so the room read as a diagram of a room. Each object is a pile of ' +
    'extruded parts over ONE collider, because the collision system has two shapes ' +
    'and a thing drawn as five pieces but collided as one honest box is far better ' +
    'than five colliders that disagree. The collider is always a SUPERSET of the ' +
    'drawing: you may bump into a table\u2019s overhang, you may never walk through ' +
    'its top. Left tile is the top-down read the game actually gives you. ' +
    'Sizes span deliberately: the first catalogue put everything between 0.4 and ' +
    '1.0 m across, which gave a room one texture and no scale — nothing to shelter ' +
    'behind and nothing to step over. A room now asks for one or two large pieces, ' +
    'a spread of middling ones and a scatter of clutter.'));
  const grid = el('div', 'objs');
  OBJECTS.forEach((o) => {
    const box = el('div', 'obj');
    const a = el('canvas', 'objcv'), b = el('canvas', 'objcv');
    const pair = el('div', 'wpair');
    pair.append(a, b);
    box.append(pair, el('b', null, o.name), el('i', null, o.note),
               el('i', 'meta',
                  `${sizeOf(o)} · ${(o.hx * 2).toFixed(1)}×${(o.hz * 2).toFixed(1)} m · ` +
                  `${o.parts.length} parts · ${o.collider.kind} · ${o.tags.join(', ')}`));
    grid.append(box);
    requestAnimationFrame(() => {
      const venue = VENUES.find((v) => o.tags.includes(v.tag)) || VENUES[0];
      const roles = propRoles({ venue: venue.key });
      const rad = Math.max(o.hx, o.hz, o.h * 0.6) * 1.5;
      for (const [cv, opt] of [[a, { pitch: 1.42, yaw: 0 }], [b, { pitch: 0.55, yaw: 0.8 }]]) {
        const { g } = studio(cv, { pitch: opt.pitch, yaw: opt.yaw, radius: rad,
                                   at: [0, o.h * 0.42, 0] });
        for (const d of o.parts)
          pushShape(d.fx, d.fz, d.shape, d.hx, d.hz, d.y0, d.y1, d.rot || 0,
                    roles[d.col] || roles.body);
        flushFaces(g);
      }
    });
  });
  sec.append(grid);

  /* walls */
  sec.append(el('h3', 'hm', 'Walls'));
  sec.append(el('p', 'lede',
    'Interior runs cut the arena into two or three connected rooms. Every run has a ' +
    'doorway punched in it, and a post caps each end of the gap so a hole reads as a ' +
    'DOOR rather than as a missing piece. The generator flood-fills the result and ' +
    'throws away any arena that is not one connected space.'));
  const wgrid = el('div', 'objs');
  const walls = [
    ['run', () => { pushShape(-1.6, 0, 'box', 1.4, 0.5, 0, 1.35, 0, mixHex(tok('wall'), tok('grid'), 0.22), CAM.ROOM_AMBIENT);
                    pushShape(1.6, 0, 'box', 1.4, 0.5, 0, 1.35, 0, mixHex(tok('wall'), tok('grid'), 0.22), CAM.ROOM_AMBIENT); }, 3.4, 'a run with a 2.6 m gap'],
    ['jamb', () => { pushShape(0, 0, 'oct', 0.42, 0.42, 0, 1.8, 0, mixHex(tok('wall'), tok('grid'), 0.22), CAM.ROOM_AMBIENT); }, 1.1, 'the post that caps a gap'],
    ['doorway', () => {
        const c = mixHex(tok('wall'), tok('grid'), 0.22);
        pushShape(-2.3, 0, 'box', 1.0, 0.5, 0, 1.35, 0, c, CAM.ROOM_AMBIENT);
        pushShape(2.3, 0, 'box', 1.0, 0.5, 0, 1.35, 0, c, CAM.ROOM_AMBIENT);
        pushShape(-1.3, 0, 'oct', 0.42, 0.42, 0, 1.8, 0, c, CAM.ROOM_AMBIENT);
        pushShape(1.3, 0, 'oct', 0.42, 0.42, 0, 1.8, 0, c, CAM.ROOM_AMBIENT);
      }, 3.6, 'what the enemy routes through'],
    ['outer', () => {
        const c = tok('wall');
        for (let i = -3; i <= 3; i++)
          pushShape(i * 0.8, 0, 'box', 0.38, 0.5, 0, i % 3 === 0 ? 2.1 : 1.8, 0, c, CAM.ROOM_AMBIENT);
      }, 3.2, 'pilaster rhythm on the perimeter'],
  ];
  for (const [name, fn, rad, note] of walls) {
    const box = el('div', 'obj');
    const cv = el('canvas', 'objcv');
    box.append(cv, el('b', null, name), el('i', null, note));
    wgrid.append(box);
    requestAnimationFrame(() => {
      const { g } = studio(cv, { pitch: 0.85, yaw: 0.5, radius: rad, at: [0, 0.7, 0] });
      fn(); flushFaces(g);
    });
  }
  sec.append(wgrid);
  root.append(sec);
}

const DECALS = ['disc', 'ring', 'stripe', 'chevron', 'grid', 'cross',
                'arrow', 'hatch', 'target', 'zig', 'bars', 'track'];
const PATTERNS = ['checker', 'stripes', 'weave', 'bricks', 'diag', 'blocks',
                  'herring', 'dots', 'tri'];

function sectionGraphics(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'Floor graphics'));
  sec.append(el('p', 'lede',
    'Twelve painted shapes and nine tile patterns, all abstract. The reference ' +
    'furnishes its rooms with couches and televisions; this arena is the inside of ' +
    'a model of the player rather than a place, so paint and slabs are the honest ' +
    'set dressing — and they are free, so every round can be a new room.'));

  const dg = el('div', 'objs small');
  for (const kind of DECALS) {
    const box = el('div', 'obj');
    const cv = el('canvas', 'objcv');
    box.append(cv, el('b', null, kind));
    dg.append(box);
    requestAnimationFrame(() => {
      const room = { pattern: 'checker', tiles: [], decals: [
        { kind, x: 0, z: 0, r0: 1.5, w: 0.42, ang: 0.5, tokName: 'prop-c', dark: 0.1 },
      ], props: [], blood: [] };
      for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) room.tiles.push({ i, j, v: 0.5 });
      const { g, w, h } = studio(cv, { pitch: 1.45, yaw: 0, radius: 2.0, at: [0, 0, 0], ground: false });
      drawFloor(g, room, w, h);
    });
  }
  sec.append(dg);

  sec.append(el('h3', 'hm', 'Tile patterns'));
  const pg = el('div', 'objs small');
  for (const pattern of PATTERNS) {
    const box = el('div', 'obj');
    const cv = el('canvas', 'objcv');
    box.append(cv, el('b', null, pattern));
    pg.append(box);
    requestAnimationFrame(() => {
      const rnd = mulberry32(7);
      const room = { pattern, tiles: [], decals: [], props: [], blood: [] };
      for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) room.tiles.push({ i, j, v: rnd() });
      const { g, w, h } = studio(cv, { pitch: 1.45, yaw: 0, radius: 2.4, at: [0, 0, 0], ground: false });
      drawFloor(g, room, w, h);
    });
  }
  sec.append(pg);
  root.append(sec);
}

/* ====================================================================== */
/* 4. ROOMS                                                                */
/* ====================================================================== */
function sectionRooms(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'Rooms'));
  const info = el('p', 'lede');
  sec.append(info);
  const grid = el('div', 'rooms');
  sec.append(grid);
  root.append(sec);

  const seeds = [];
  for (let i = 0; i < 8; i++) seeds.push((Math.random() * 2147483647) | 0);
  let conn = 1, solids = 0, tries = 0;
  for (const s of seeds) {
    const room = makeRoom(s);
    conn = Math.min(conn, connectivity(room));
    solids += room.props.filter((p) => !p.isWall).length;
    tries += room.tries || 1;
    const box = el('div', 'room');
    const cv = el('canvas', 'roomcv');
    box.append(cv);
    box.append(el('i', null,
      `${room.props.filter((p) => !p.isWall).length} solids · ${room.doors.length} doors · ` +
      `${room.pattern} · seed ${(s >>> 0).toString(36)}`));
    grid.append(box);
    requestAnimationFrame(() => {
      const { w, h } = fitCanvas(cv);
      const g = cv.getContext('2d');
      /* the design sheet draws venues that are not the one on screen, so every
         room canvas paints inside its own ground and hands it back */
      forVenue(room.venue, () => {
      g.fillStyle = tok('stage'); g.fillRect(0, 0, w, h);
      cam.mode = 'top'; cam.yaw = 0; cam.pitch = 1.44; cam.dist = CAM.TOP_DIST;
      cam.userZoom = false;
      setCamera(w, h, { x: 0, z: 0, hx: 1, hz: 0 });
      drawFloor(g, room, w, h);
      pushWallsAndProps(room);
      flushFaces(g);
      });
    });
  }
  info.textContent =
    `Eight arenas, generated live when this page loaded, from real session seeds. ` +
    `Worst connectivity ${(conn * 100).toFixed(1)}% (anything under 97% is thrown away and ` +
    `re-rolled), ${(solids / 8).toFixed(1)} solids each, ${(tries / 8).toFixed(1)} attempts ` +
    `each on average. Reload this page and all eight will be different — that is the point.`;
}

/* ====================================================================== */
/* 5. PALETTE AND TYPE                                                     */
/* ====================================================================== */
function sectionPalette(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'Palette'));
  sec.append(el('p', 'lede',
    'Four colours carry meaning and nothing else may use them: --hot is IT, --cool is ' +
    'YOU, --acid is what it knows, --warm is neither. Everything else is furniture.'));
  const c1 = card(sec, 'meaning', 'these four are spoken for');
  swatchRow(c1, [['it', tok('hot')], ['you', tok('cool')], ['what it knows', tok('acid')],
                 ['neither', tok('warm')], ['good', tok('good')]]);
  const c2 = card(sec, 'surfaces', 'panels, lines, ink');
  swatchRow(c2, [['bg', tok('bg')], ['panel', tok('panel')], ['panel-2', tok('panel-2')],
                 ['line', tok('line')], ['raise', tok('raise')], ['track', tok('track')],
                 ['ink', tok('ink')], ['ink-2', tok('ink-2')], ['ink-3', tok('ink-3')]]);
  /* THE GROUND IS NOT ONE PALETTE ANY MORE. These five names used to be global,
     so nine venues painted the same near-black purple and the only thing telling
     a bank from a school was the furniture — the half of the signal that is
     hardest to read from the camera this game uses. It was never a hue problem:
     every floor sat at luminance 0.026 against a ceiling of 0.675, and the whole
     painted floor of every venue lived in a band 0.0053 wide. Nothing is
     perceptible down there. Each venue now brings its own. */
  const c3 = card(sec, 'the room, per venue',
    'the ground each place stands on. nothing here may out-shine an actor.');
  for (const v of VENUES) {
    if (!v.ground) continue;
    const g = v.ground;
    swatchRow(c3, [[v.name + ' floor', g.floor], ['floor2', g.floor2], ['grid', g.grid],
                   ['wall', g.wall], ['stage', g.stage]]);
  }
  const c3b = card(sec, 'and what goes on it', 'shared by every venue');
  swatchRow(c3b, [['blood', tok('blood')], ['prop-a', tok('prop-a')], ['prop-b', tok('prop-b')],
                  ['prop-c', tok('prop-c')], ['prop-d', tok('prop-d')], ['prop-e', tok('prop-e')]]);

  /* measured over EVERY venue's ground, not over one shared palette */
  const envMax = Math.max(
    ...VENUES.flatMap((v) => v.ground ? Object.values(v.ground).map(luminance) : []),
    ...['prop-a', 'prop-b', 'prop-c', 'prop-d', 'prop-e'].map((t) => luminance(tok(t))));
  const skinMin = Math.min(...CHARS.map((c) => luminance(c.skin)));
  const v = el('div', skinMin > envMax ? 'audit ok' : 'audit bad');
  v.append(el('b', 'hm', 'the value rule'));
  v.append(el('i', null,
    `brightest thing the room can emit ${envMax.toFixed(3)} · dimmest mask base ` +
    `${skinMin.toFixed(3)} · ${skinMin > envMax ? 'every actor out-shines every room' : 'VIOLATED'}`));
  sec.append(v);

  sec.append(el('h3', 'hm', 'Type'));
  const t = el('div', 'typespec');
  t.append(el('div', 'ts1 hm hm-lg', 'Dead Giveaway'));
  t.append(el('div', 'ts2 hm hm-lg', 'Round 7'));
  t.append(el('div', 'ts3 hm', 'Watch it fight itself'));
  t.append(el('div', 'ts4', 'How much better it aims than a guess that knows this room but nothing about you.'));
  sec.append(t);
  sec.append(el('p', 'lede',
    'No webfont. The display face is Arial Black / Impact / Franklin Gothic Heavy, ' +
    'squashed to 94% and skewed 8 degrees, over a three-step shadow that ends in a ' +
    'magenta ghost. A font file is a dependency that has to download before the title ' +
    'can be read, and this game is on screen before anything has finished loading.'));
  root.append(sec);
}

/* ====================================================================== */
export function build() {
  const root = $('#sheet');
  /* THE INTERFACE FIRST. This sheet was about what is IN the room; the panels
     and the readouts around it are as much a design decision and had nowhere to
     be argued about. See design-ui.js. */
  buildUi(root);
  sectionCast(root);
  sectionWeapons(root);
  sectionKill(root);
  sectionMarkers(root);
  sectionChoices(root);
  sectionVenues(root);
  sectionObjects(root);
  sectionGraphics(root);
  sectionRooms(root);
  sectionPalette(root);
  const cast = castFor((Math.random() * 2147483647) | 0);
  $('#castline').textContent =
    `If you loaded the game right now you would be ${cast.you.name} and it would be ${cast.foe.name}.`;
}
build();
window.__sheetBooted = true;
