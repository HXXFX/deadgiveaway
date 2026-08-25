/* Seeded randomness, colour, and the two-line maths everything else borrows.
 *
 * ALL RANDOMNESS IS SEEDED. Math.random() is never called in a draw, a sim step
 * or a training step, so a room, a grain field and a training run are all
 * reproducible from a number — which is what makes a bug reportable.
 */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gaussian(rnd) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---- colour ------------------------------------------------------------- */
/* Read from the stylesheet, never named here, so retheming the CSS reskins the
   canvases too. A themeable page with un-themeable pictures in it is the bug
   this avoids. */
const _cache = new Map();

/* A VENUE MAY REPLACE THE GROUND UNDER IT.
 *
 * Everything that paints a room — the tiles, the gridlines, the decals, the
 * blood, the wall mass, the shade each prop is mixed toward — asks tok() for
 * one of five names: stage, floor, floor2, grid, wall. Putting an override in
 * front of the stylesheet lookup therefore repaints an entire venue without a
 * single drawing call site changing. The alternative is threading the room
 * through some forty colour expressions, which is the same edit written forty
 * times and forty chances to miss one.
 *
 * The game loop SETS AND LEAVES IT, deliberately: the ground of the room on
 * screen is the ground, and every draw begins by declaring which venue it is in.
 * Anything resolving a colour for a venue OTHER than the one on screen — the
 * design sheet drawing all nine, the value audit checking all nine — goes
 * through forVenue() in render.js, which puts the previous one back. Nothing
 * outside the arena reads these five names, so a stale one cannot leak into the
 * interface: the panels are drawn from --ink/--panel/--hot and never from the
 * floor. */
let _ground = null;
export function setGround(map) { _ground = map || null; }
export function getGround() { return _ground; }

/* OFF THE MAIN THREAD THERE ARE NO STYLES AT ALL. The bench runs whole sessions
   inside Web Workers so the page stays live while it measures, and a worker has
   no document to read custom properties from. Rather than let every colour
   resolve to empty — which would make luminance zero and report every prop in
   the game as too bright — this says plainly that it cannot answer, and
   checkValueRule refuses to render a verdict rather than inventing one. */
export const stylesAvailable = () =>
  typeof document !== 'undefined' && typeof getComputedStyle === 'function';

export function tok(name) {
  if (_ground && _ground[name]) return _ground[name];
  if (!stylesAvailable()) return '';
  if (!_cache.has(name))
    _cache.set(name, getComputedStyle(document.documentElement)
      .getPropertyValue('--' + name).trim());
  return _cache.get(name);
}
export function clearTokenCache() { _cache.clear(); }

export function hex2rgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const rgba = (h, a) => { const c = hex2rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

/* mixHex returns HEX, because the renderer re-parses a face colour with hex2rgb
   at flush time — handing it an rgb(...) string fails silently to black. */
export function mixHex(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  const q = (v) => ('0' + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2);
  return '#' + q(A[0] + (B[0] - A[0]) * t) + q(A[1] + (B[1] - A[1]) * t) + q(A[2] + (B[2] - A[2]) * t);
}

/* Relative luminance, used to ASSERT the arena rule (nothing in the environment
   may be as bright as an actor) rather than to eyeball it. */
export function luminance(hex) {
  const c = hex2rgb(hex).map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/* ---- canvas ------------------------------------------------------------- */
/* Size the backing store to the CSS box times DPR, once per change. Doing it
   every frame thrashes; not doing it at all gives a blurry canvas on any
   high-density display. */
/* A CANVAS WITH NO CSS SIZE TAKES ITS SIZE FROM ITS OWN BUFFER, and that is a
 * feedback loop with nothing to stop it. This project has now hit it twice: the
 * rehearsal card doubled 260 -> 520 -> 1040 every frame until a blank canvas
 * covered the screen, and a stylesheet edit that dropped one rule left the
 * header's vitals canvases sizing themselves to TWENTY-SIX MILLION pixels a
 * side, which collapsed the whole top bar.
 *
 * Both were the same missing line of CSS, and both cost an hour to find because
 * the symptom (a blank screen, a vanished header) looks nothing like the cause.
 * So the clamp lives here, at the one place every canvas in the app passes
 * through, and it SAYS SO in the console rather than silently coping — a canvas
 * that has to be clamped is a bug in the stylesheet, not a size to accept.
 */
const CANVAS_MAX = 4096;
const warned = new Set();
export function fitCanvas(c) {
  const r = c.getBoundingClientRect();
  const d = Math.min(2, window.devicePixelRatio || 1);
  let w = Math.max(1, Math.round(r.width * d));
  let h = Math.max(1, Math.round(r.height * d));
  if (w > CANVAS_MAX || h > CANVAS_MAX) {
    if (!warned.has(c)) {
      warned.add(c);
      console.warn('fitCanvas: #' + (c.id || '?') + ' measured ' + w + 'x' + h +
        ' — it has no CSS size, so it is sizing itself from its own buffer. ' +
        'Give it a width and height in the stylesheet.');
    }
    w = Math.min(w, CANVAS_MAX); h = Math.min(h, CANVAS_MAX);
  }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return { w, h, d };
}
