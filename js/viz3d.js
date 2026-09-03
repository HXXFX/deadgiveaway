/* THE DRAWING BENCH, SHARED BY THE GAME AND THE DESIGN SHEET.
 * ============================================================================
 *
 * ONE FILE, BOTH USERS. The design sheet argues about these shapes and the HUD
 * draws them, and if those were two implementations the sheet would be arguing
 * about a picture of the panels rather than about the panels. Everything the
 * player chose off the sheet is drawn by the code below, in the game, unchanged.
 *
 * Two projections, because one is not enough and believing it was cost this
 * project a whole review pass.
 *
 * ISOMETRIC splits both horizontal axes half into the vertical. That makes a
 * handsome, stable little world — and it means ANY scene drawn in it projects
 * to roughly 1.73:1 whatever its proportions, because the two axes cannot be
 * made to cancel. Perfect for a squarish panel. Useless for a strip.
 *
 * CABINET leaves x alone. Only depth is angled, at 45 degrees and HALF scale
 * (which is what makes it cabinet rather than cavalier, and what stops the depth
 * from dominating a shallow object). A row of twenty solids stays exactly as
 * wide and as short as you want it, and every one of them still has three lit
 * faces. This is the projection for a header strip and for a wide panel.
 *
 * The rule that came out of it, which is now the first thing on the sheet:
 * PICK THE PROJECTION WHOSE AXES MATCH THE BOX YOU HAVE. "3-D does not fit in
 * small boxes" was never true; "isometric does not fit in wide short boxes" is.
 */
import { tok, hex2rgb } from './util.js';

export const INK = '#0a0410';

export const PAL = () => ({
  ink: tok('ink'), ink2: tok('ink-2'), ink3: tok('ink-3'),
  hot: tok('hot'), cool: tok('cool'), acid: tok('acid'), good: tok('good'),
  warm: tok('warm'), blood: tok('blood'), grid: tok('panel-line'),
  panel: tok('panel'), panel2: tok('panel-2'), body: tok('body'),
});

/* LIGHT LIFTS, IT DOES NOT ONLY DARKEN.
 *
 * This multiplied every face by a factor, so the brightest a solid could be was
 * the colour it was given and the other two faces were that colour dimmed. On a
 * near-black ground the result is three shades of dark and a panel the player
 * described as "not readable" — and it is not what the cast does. A character in
 * this game is a SATURATED jacket with a BRIGHT trim on it: rooster is #e8342a
 * under #ffd23f, boar is #6fae3f under #f2e8d5. The contrast is between the base
 * and something lighter, never between the base and the background.
 *
 * So the top face is lifted toward white and only the far side is dimmed. Same
 * three-tone read, one and a half stops brighter, and it finally looks like it
 * belongs to the same game as the masks.
 */
const shade = (hex, k) => {
  const c = hex2rgb(hex);
  if (k >= 1) {
    /* the lit face: toward white rather than at full colour */
    const t = 0.30;
    return `rgb(${Math.round(c[0] + (255 - c[0]) * t)},${Math.round(c[1] + (255 - c[1]) * t)},${Math.round(c[2] + (255 - c[2]) * t)})`;
  }
  /* and the sides sit closer together than they did: 0.62 and 0.82 read as two
     different objects rather than two sides of one */
  const kk = 0.74 + (k - 0.62) * 0.55;
  return `rgb(${Math.round(c[0] * kk)},${Math.round(c[1] * kk)},${Math.round(c[2] * kk)})`;
};

/* THE CAST'S OWN COLOURS, for anything that wants to look like it came out of
   the same box as the characters. These are the actual jacket and trim values
   from chars.js — loud, high-chroma, and nothing like the muted panel line the
   panels were mixing everything toward. */
export const CAST = {
  red: '#e8342a', gold: '#ffd23f', green: '#6fae3f', bone: '#f2e8d5',
  blue: '#2a9fd6', violet: '#8a63d2', orange: '#d94f2b', mint: '#2fb87a',
};

/* AN INACTIVE SOLID IS DESATURATED, NOT DARKENED.
 *
 * A spent round drawn as "the same colour, darker" disappears into a near-black
 * panel, and then the row you are supposed to be counting has no far end. Pull
 * it toward its own grey instead and hold the value up: it reads as the same
 * object, switched off, and the row keeps its length. */
export function dim(hex, keep) {
  const c = hex2rgb(hex);
  const l = (c[0] * 0.30 + c[1] * 0.59 + c[2] * 0.11);
  const t = keep === undefined ? 0.72 : keep;      /* how far toward grey */
  const v = 0.62;                                  /* and how bright that grey is */
  const m = (x) => Math.round((x * (1 - t) + l * t) * v + 34);
  /* HEX, NOT rgb(). util.js says it in as many words: the renderer re-parses a
     face colour with hex2rgb at flush time, and handing it an rgb(...) string
     fails silently. dim() is the app's INACTIVE treatment and its output goes
     straight into isoBox and oblBox all over hud.js — the dimmed keys, the
     spent gauges, the copy box, the dial plinth, the base slab under what it
     sees. Every one of those faces was getting NaN, and canvas answers an
     invalid fillStyle by keeping the previous one: measured live, the sense
     slab painted full bone rgb(243,232,212) instead of a dimmed grey, and the
     bench plinth painted pure black. Same silent class as the undeclared
     --panel-line, one layer down. */
  const q = (x) => ('0' + Math.max(0, Math.min(255, m(x))).toString(16)).slice(-2);
  return '#' + q(c[0]) + q(c[1]) + q(c[2]);
}

function facePath(g, pts, col, k, lw) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fillStyle = shade(col, k); g.fill();
  g.strokeStyle = INK; g.lineWidth = lw || 1; g.stroke();
}

/* ---- isometric ---------------------------------------------------------- */
const IX = [0.866, 0.5], IZ = [-0.866, 0.5];
export const iso = (ox, oy, s, x, y, z) =>
  [ox + (x * IX[0] + z * IZ[0]) * s, oy + (x * IX[1] + z * IZ[1]) * s - y * s];

export function isoBox(g, ox, oy, s, x, y, z, sx, sy, sz, col, lw) {
  const Q = (a, b, c) => iso(ox, oy, s, x + a, y + b, z + c);
  facePath(g, [Q(0, 0, 0), Q(0, 0, sz), Q(0, sy, sz), Q(0, sy, 0)], col, 0.62, lw);
  facePath(g, [Q(0, 0, sz), Q(sx, 0, sz), Q(sx, sy, sz), Q(0, sy, sz)], col, 0.82, lw);
  facePath(g, [Q(0, sy, 0), Q(0, sy, sz), Q(sx, sy, sz), Q(sx, sy, 0)], col, 1.0, lw);
}
export function isoPlate(g, ox, oy, s, x, z, sx, sz, style) {
  const Q = (a, b) => iso(ox, oy, s, x + a, 0, z + b);
  const a = Q(0, 0), b = Q(sx, 0), c = Q(sx, sz), e = Q(0, sz);
  g.beginPath();
  g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(e[0], e[1]);
  g.closePath();
  g.fillStyle = style; g.fill();
  g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
}
export function isoFit(w, h, sx, sy, sz, pad) {
  const p = pad === undefined ? 8 : pad;
  const xs = [0, sx * IX[0], sz * IZ[0], sx * IX[0] + sz * IZ[0]];
  const ys = [0, sx * IX[1], sz * IZ[1], sx * IX[1] + sz * IZ[1]];
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys) - sy, y1 = Math.max(...ys);
  const s = Math.max(1, Math.min((w - p * 2) / Math.max(0.001, x1 - x0),
                                 (h - p * 2) / Math.max(0.001, y1 - y0)));
  return { s, ox: (w - (x1 - x0) * s) / 2 - x0 * s, oy: (h - (y1 - y0) * s) / 2 - y0 * s };
}

/* ---- cabinet ------------------------------------------------------------ */
const OBL = 0.354;                       /* cos 45 x 0.5 */
export const obl = (ox, oy, s, x, y, z) =>
  [ox + (x + z * OBL) * s, oy - (y + z * OBL) * s];

export function oblBox(g, ox, oy, s, x, y, z, sx, sy, sz, col, lw) {
  const Q = (a, b, c) => obl(ox, oy, s, x + a, y + b, z + c);
  /* back to front: top, then the right side, then the face */
  facePath(g, [Q(0, sy, 0), Q(0, sy, sz), Q(sx, sy, sz), Q(sx, sy, 0)], col, 1.0, lw);
  facePath(g, [Q(sx, 0, 0), Q(sx, 0, sz), Q(sx, sy, sz), Q(sx, sy, 0)], col, 0.64, lw);
  facePath(g, [Q(0, 0, 0), Q(sx, 0, 0), Q(sx, sy, 0), Q(0, sy, 0)], col, 0.86, lw);
}
export function oblPlate(g, ox, oy, s, x, z, sx, sz, style) {
  const Q = (a, b) => obl(ox, oy, s, x + a, 0, z + b);
  const a = Q(0, 0), b = Q(sx, 0), c = Q(sx, sz), e = Q(0, sz);
  g.beginPath();
  g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(e[0], e[1]);
  g.closePath();
  g.fillStyle = style; g.fill();
  g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
}
/* Unlike isoFit this returns a scene of ANY aspect, which is the whole point. */
export function oblFit(w, h, sx, sy, sz, pad) {
  const p = pad === undefined ? 6 : pad;
  const W = sx + sz * OBL, H = sy + sz * OBL;
  const s = Math.max(1, Math.min((w - p * 2) / W, (h - p * 2) / H));
  return { s, ox: (w - W * s) / 2, oy: (h + H * s) / 2 };
}

