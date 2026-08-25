/* WHO IS IN THE ROOM.
 *
 * Hotline Miami's people are unmistakable from directly above, and almost none
 * of that is the body — it is the MASK. A rooster's comb, a boar's tusks, a
 * fedora brim: shapes that stay readable when all you can see is the top of
 * someone's head. So a character here is a small pile of extruded footprints
 * sitting on a plain figure, and the figure underneath never changes.
 *
 * THE COLOUR RULE IS NOT NEGOTIABLE AND IT IS NOT WHAT YOU WOULD GUESS.
 * `--cool` means YOU and `--hot` means IT, and the whole game rests on being
 * able to tell those apart at a glance. That semantic lives in the RING PAINTED
 * ON THE GROUND under each actor, not in the clothes — which is what frees the
 * jackets to be as loud as the reference's are. A jacket may be any colour that
 * is brighter than the brightest thing the room generator can emit (the value
 * rule: nothing in the environment may be as bright as an actor) and that is not
 * close enough to `--hot` or `--cool` to be mistaken for the ring. Both are
 * checked by `auditChars()` rather than by eye.
 *
 * Mask parts are written in CHARACTER-LOCAL coordinates:
 *      +f is the way they are facing, +r is their right, y is metres off the floor.
 * The renderer rotates the whole set by the facing, so a beak points where the
 * gun points and a comb runs front to back no matter which way anyone turns.
 */
import { tok, luminance, mixHex } from './util.js';

/* Footprints used by masks, in the same +x-is-forward convention as the parts.
   Registered into the renderer's table so `pushShape` can extrude them. */
export const MASK_FOOTPRINTS = {
  /* an isoceles triangle pointing forward: beaks, ears, tusks, horns */
  tri: [[1, 0], [-1, -0.9], [-1, 0.9]],
  /* a narrow blade: comb segments, fins, quills */
  blade: [[1, 0], [-1, -0.45], [-1, 0.45]],
  /* a lens: goggles and big animal eyes, flatter than a circle */
  lens: (() => { const o = []; for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2; o.push([Math.cos(a), Math.sin(a) * 0.8]); } return o; })(),
  /* a swept horn: thick at the base, tapering and curving forward */
  horn: [[-1, -0.5], [0.25, -0.85], [1, -0.15], [0.5, 0.25], [-0.6, 0.5]],
};

const P = (shape, hx, hz, f, r, y0, y1, col, rot) =>
  ({ shape, hx, hz, f, r, y0, y1, col, rot: rot || 0 });

/* col is a ROLE, resolved per character: jacket / trim / dark / skin. */
/* WHAT THEY ARE CARRYING.
 *
 * The gun was one cube on the end of an arm, which is what a placeholder looks
 * like — and these characters had stopped being placeholders. A weapon is built
 * from the same parts as a mask, in the same character-local frame, and it is
 * judged by the same test: from directly above, can you tell this one from the
 * other nine? That rules out anything whose whole identity is its side profile,
 * so what survives is LENGTH, WIDTH and the shape of the far end.
 *
 * They sit at hand height (y 0.66-0.80) and reach forward from about 0.30 m.
 * Nothing here changes the fight: the gun is hitscan and always has been, the
 * shape is what you are holding while it happens.
 */
const W = (shape, hx, hz, f, r, y0, y1, col, rot) =>
  ({ shape, hx, hz, f, r, y0, y1, col, rot: rot || 0 });

export const WEAPONS = {
  pistol: { name: 'Pistol', note: 'Short, square, unremarkable. The baseline everything else is longer or wider than.', parts: [
    W('box', 0.030, 0.048, 0.30, 0, 0.62, 0.74, 'grip'),
    W('box', 0.098, 0.042, 0.42, 0, 0.69, 0.79, 'steel'),
    W('box', 0.040, 0.030, 0.56, 0, 0.71, 0.77, 'steel'),
    W('box', 0.016, 0.030, 0.60, 0, 0.72, 0.76, 'trim'),
    W('box', 0.030, 0.020, 0.36, 0, 0.79, 0.81, 'trim'),
  ] },
  revolver: { name: 'Revolver', note: 'A fat middle on a thin gun. The cylinder is the whole silhouette.', parts: [
    W('box', 0.030, 0.046, 0.25, 0, 0.60, 0.73, 'grip'),
    W('hex', 0.068, 0.062, 0.36, 0, 0.66, 0.81, 'trim'),
    W('box', 0.115, 0.030, 0.52, 0, 0.70, 0.78, 'steel'),
    W('box', 0.026, 0.042, 0.63, 0, 0.71, 0.77, 'steel'),
    W('box', 0.048, 0.014, 0.44, 0, 0.81, 0.83, 'steel'),
  ] },
  sawnoff: { name: 'Sawn-off', note: 'Two stubby barrels side by side. The widest muzzle in the set and the shortest reach.', parts: [
    W('trap', 0.090, 0.070, 0.24, 0, 0.64, 0.80, 'grip'),
    W('box', 0.130, 0.036, 0.44, 0.050, 0.69, 0.79, 'steel'),
    W('box', 0.130, 0.036, 0.44, -0.050, 0.69, 0.79, 'steel'),
    W('box', 0.024, 0.108, 0.57, 0, 0.68, 0.80, 'trim'),
    W('box', 0.060, 0.098, 0.34, 0, 0.66, 0.70, 'grip'),
  ] },
  smg: { name: 'SMG', note: 'A long thin barrel with a magazine hanging under it and a stock behind.', parts: [
    W('box', 0.062, 0.036, 0.20, 0, 0.68, 0.77, 'grip'),
    W('box', 0.190, 0.030, 0.52, 0, 0.70, 0.78, 'steel'),
    W('box', 0.036, 0.038, 0.34, 0, 0.62, 0.72, 'grip'),
    W('box', 0.044, 0.026, 0.36, 0.062, 0.68, 0.76, 'trim'),
    W('box', 0.030, 0.024, 0.72, 0, 0.71, 0.79, 'trim'),
    W('box', 0.036, 0.016, 0.44, 0, 0.78, 0.81, 'steel'),
  ] },
  shotgun: { name: 'Shotgun', note: 'The longest gun here, with a pump slung under the barrel.', parts: [
    W('trap', 0.100, 0.052, 0.22, 0, 0.66, 0.79, 'grip'),
    W('box', 0.260, 0.030, 0.56, 0, 0.71, 0.79, 'steel'),
    W('box', 0.085, 0.040, 0.50, 0, 0.63, 0.70, 'trim'),
    W('box', 0.030, 0.036, 0.83, 0, 0.71, 0.79, 'steel'),
    W('box', 0.040, 0.018, 0.40, 0, 0.79, 0.82, 'steel'),
  ] },
  bat: { name: 'Bat', note: 'Thin at the hand, fat at the far end. No metal anywhere on it.', parts: [
    W('trap', 0.280, 0.070, 0.56, 0, 0.69, 0.80, 'grip', 3.14159),
    W('box', 0.070, 0.030, 0.24, 0, 0.70, 0.79, 'trim'),
    W('oct', 0.026, 0.026, 0.15, 0, 0.70, 0.79, 'trim'),
  ] },
  machete: { name: 'Machete', note: 'A long flat blade — the widest thing here in plan and the thinnest in section.', parts: [
    W('dart', 0.290, 0.070, 0.58, 0, 0.735, 0.775, 'steel'),
    W('box', 0.070, 0.034, 0.24, 0, 0.69, 0.80, 'grip'),
    W('box', 0.016, 0.060, 0.31, 0, 0.70, 0.79, 'trim'),
  ] },
  cleaver: { name: 'Cleaver', note: 'Short and very wide. A rectangle where everything else is a line.', parts: [
    W('box', 0.125, 0.130, 0.48, 0, 0.715, 0.775, 'steel'),
    W('box', 0.018, 0.145, 0.60, 0, 0.715, 0.775, 'trim'),
    W('oct', 0.028, 0.028, 0.40, 0.10, 0.72, 0.77, 'grip'),
    W('box', 0.070, 0.036, 0.28, 0, 0.69, 0.80, 'grip'),
  ] },
  axe: { name: 'Axe', note: 'A thin handle with all of its weight hung off one side of the far end.', parts: [
    W('box', 0.215, 0.028, 0.48, 0, 0.70, 0.79, 'grip'),
    W('trap', 0.075, 0.110, 0.63, 0.055, 0.69, 0.80, 'steel', 1.5708),
    W('box', 0.030, 0.040, 0.66, -0.040, 0.70, 0.79, 'trim'),
    W('box', 0.030, 0.024, 0.26, 0, 0.69, 0.80, 'trim'),
  ] },
  crowbar: { name: 'Crowbar', note: 'A straight bar with a hook that breaks the line at the end.', parts: [
    W('box', 0.225, 0.026, 0.50, 0, 0.71, 0.78, 'steel'),
    W('box', 0.080, 0.024, 0.70, 0.048, 0.71, 0.78, 'steel', 0.85),
    W('box', 0.040, 0.022, 0.79, 0.088, 0.71, 0.78, 'trim', 1.5),
    W('box', 0.055, 0.030, 0.26, 0, 0.70, 0.79, 'trim'),
  ] },
};

/* THE READ IS FROM ABOVE, so a mask has to change the OUTLINE of the head, not
 * sit on top of it. The first attempt hung small pieces over a big cream box at
 * head height and above; from the game's camera that is a cream box, every time,
 * for all ten of them. Everything here now sticks OUT past the skull - beaks
 * forward, ears back, horns and eyes wide - and lives at roughly head height, so
 * it is part of the silhouette rather than a hat sitting on one.
 */
export const CHARS = [
  {
    key: 'rooster', weapon: 'sawnoff', name: 'Rooster', family: 'bird',
    jacket: '#e8342a', trim: '#ffd23f', skin: '#ffe9c9',
    note: 'Beak out front, comb running front to back. The loudest silhouette in the set.',
    mask: [
      P('tri', 0.19, 0.075, 0.25, 0, 0.99, 1.09, 'trim'),
      P('blade', 0.055, 0.030, 0.09, 0, 1.10, 1.28, 'trim'),
      P('blade', 0.050, 0.028, 0.01, 0, 1.10, 1.32, 'trim'),
      P('blade', 0.044, 0.025, -0.06, 0, 1.10, 1.25, 'trim'),
      P('box', 0.035, 0.032, 0.21, 0, 0.90, 0.99, 'trim'),
    ],
  },
  {
    key: 'boar', weapon: 'axe', name: 'Boar', family: 'beast',
    jacket: '#6fae3f', trim: '#f2e8d5', skin: '#f6ecd8',
    note: 'Blunt snout with tusks out to the sides. The widest face at eye level.',
    mask: [
      P('box', 0.125, 0.105, 0.22, 0, 0.95, 1.09, 'skin'),
      P('tri', 0.095, 0.036, 0.21, 0.125, 1.00, 1.08, 'trim', 0.95),
      P('tri', 0.095, 0.036, 0.21, -0.125, 1.00, 1.08, 'trim', -0.95),
      P('tri', 0.085, 0.060, -0.09, 0.170, 1.02, 1.17, 'jacket', 2.0),
      P('tri', 0.085, 0.060, -0.09, -0.170, 1.02, 1.17, 'jacket', -2.0),
    ],
  },
  {
    key: 'owl', weapon: 'revolver', name: 'Owl', family: 'bird',
    jacket: '#2f5fd0', trim: '#ffb648', skin: '#ffe0a8',
    note: 'Two enormous eyes pushed out past the skull. Nothing else in the set looks at you like this.',
    mask: [
      P('lens', 0.105, 0.100, 0.08, 0.135, 1.00, 1.15, 'trim'),
      P('lens', 0.105, 0.100, 0.08, -0.135, 1.00, 1.15, 'trim'),
      P('tri', 0.105, 0.050, 0.24, 0, 1.00, 1.08, 'skin'),
      P('tri', 0.075, 0.055, -0.07, 0.165, 1.06, 1.24, 'jacket', 2.4),
      P('tri', 0.075, 0.055, -0.07, -0.165, 1.06, 1.24, 'jacket', -2.4),
    ],
  },
  {
    key: 'wolf', weapon: 'machete', name: 'Wolf', family: 'beast',
    jacket: '#7b5fd6', trim: '#f4f0ff', skin: '#efe6ff',
    note: 'The longest snout, ears swept hard back. Reads as a direction before it reads as a face.',
    mask: [
      P('box', 0.180, 0.072, 0.26, 0, 0.95, 1.07, 'skin'),
      P('box', 0.042, 0.048, 0.43, 0, 0.98, 1.05, 'dark'),
      P('tri', 0.105, 0.062, -0.12, 0.130, 1.02, 1.22, 'trim', 2.75),
      P('tri', 0.105, 0.062, -0.12, -0.130, 1.02, 1.22, 'trim', -2.75),
    ],
  },
  {
    key: 'frog', weapon: 'smg', name: 'Frog', family: 'beast',
    jacket: '#22c96f', trim: '#12121a', skin: '#a8f0c4',
    note: 'Eyes right out on the sides and a mouth across the whole front. Almost circular from above.',
    mask: [
      P('lens', 0.115, 0.110, 0.02, 0.190, 1.02, 1.20, 'trim'),
      P('lens', 0.115, 0.110, 0.02, -0.190, 1.02, 1.20, 'trim'),
      P('box', 0.042, 0.205, 0.19, 0, 0.95, 1.04, 'trim'),
    ],
  },
  {
    key: 'tiger', weapon: 'bat', name: 'Tiger', family: 'beast',
    jacket: '#ff8410', trim: '#241a12', skin: '#ffd9a3',
    note: 'Heavy muzzle, small hard ears. Warm and obvious at any distance.',
    mask: [
      P('box', 0.115, 0.125, 0.21, 0, 0.95, 1.08, 'skin'),
      P('tri', 0.090, 0.070, -0.06, 0.160, 1.02, 1.20, 'trim', 2.1),
      P('tri', 0.090, 0.070, -0.06, -0.160, 1.02, 1.20, 'trim', -2.1),
      P('blade', 0.075, 0.032, 0.06, 0, 1.10, 1.17, 'trim'),
    ],
  },
  {
    key: 'horse', weapon: 'shotgun', name: 'Horse', family: 'beast',
    jacket: '#a9662f', trim: '#ffeecb', skin: '#ffeecb',
    note: 'A muzzle that reaches further than anything else and two tall narrow ears.',
    mask: [
      P('box', 0.215, 0.078, 0.28, 0, 0.92, 1.06, 'skin'),
      P('tri', 0.080, 0.045, -0.09, 0.095, 1.06, 1.34, 'trim', 2.95),
      P('tri', 0.080, 0.045, -0.09, -0.095, 1.06, 1.34, 'trim', -2.95),
    ],
  },
  {
    key: 'bull', weapon: 'cleaver', name: 'Bull', family: 'beast',
    jacket: '#b32a3e', trim: '#f7f0dd', skin: '#f7f0dd',
    note: 'Horns sweeping wide and forward. The widest footprint in the set by some way.',
    mask: [
      P('horn', 0.185, 0.070, 0.03, 0.205, 1.00, 1.12, 'trim', 0.80),
      P('horn', 0.185, 0.070, 0.03, -0.205, 1.00, 1.12, 'trim', -0.80),
      P('box', 0.095, 0.115, 0.21, 0, 0.94, 1.07, 'skin'),
      P('box', 0.034, 0.036, 0.32, 0, 0.97, 1.03, 'dark'),
    ],
  },
  {
    key: 'gangster', weapon: 'pistol', name: 'Gangster', family: 'human',
    jacket: '#6f6a7d', trim: '#2a2130', skin: '#f0e6d2',
    note: 'No animal at all: a brim, a crown, a band. The one who is not wearing a mask.',
    mask: [
      P('oct', 0.255, 0.240, -0.01, 0, 1.09, 1.145, 'trim'),
      P('oct', 0.135, 0.128, 0.005, 0, 1.145, 1.30, 'trim'),
      P('oct', 0.142, 0.135, 0.005, 0, 1.16, 1.195, 'skin'),
    ],
  },
  {
    key: 'mod', weapon: 'crowbar', name: 'Mod', family: 'human',
    jacket: '#1f7f76', trim: '#ff3b30', skin: '#eef6f4',
    note: 'A parka hood standing well off the shoulders with a roundel on the crown.',
    mask: [
      P('oct', 0.240, 0.230, -0.06, 0, 0.92, 1.13, 'jacket'),
      P('box', 0.038, 0.135, 0.17, 0, 1.00, 1.10, 'dark'),
      P('oct', 0.100, 0.095, 0.005, 0, 1.13, 1.165, 'trim'),
      P('oct', 0.055, 0.052, 0.005, 0, 1.165, 1.19, 'dark'),
    ],
  },
];

export const byKey = (k) => CHARS.find((c) => c.key === k) || CHARS[0];

/* WHO YOU ARE, AND WHO IT SENT THIS TIME.
 *
 * You keep your mask for the whole session: it is you, and your ghost wears it
 * too. The ENEMY changes every round, and the reasoning went the other way at
 * first — one model, one face, so that the thing coming back reads as the same
 * opponent rather than a parade of strangers. That is true of the MODEL and it
 * is not true of the body carrying it. Nothing about the model is stored in a
 * jacket; it persists across rounds regardless of who turns up wearing it, and
 * a fresh face each round says something the fixed one could not: it does not
 * matter how many of them you go through, the thing aiming at you is the same
 * thing, and it is getting better.
 *
 * It also fixes a plain readability problem. Ten characters were designed and a
 * session showed you exactly one of them.
 */
export function castFor(seed) {
  const n = CHARS.length;
  const a = Math.abs(seed | 0) % n;
  const b = (a + 1 + (Math.abs((seed / n) | 0) % (n - 1))) % n;
  return { you: CHARS[a], foe: CHARS[b] };
}

/* The face for a given round: never yours, and never the same two rounds
   running, so a change of body is always visible as a change. */
export function foeFor(seed, round, you) {
  const pool = CHARS.filter((c) => c !== you);
  const n = pool.length;
  /* A WALK, NOT A LOOKUP, so a repeat is impossible rather than unlikely.
     Drawing each round independently and nudging on a collision does not work:
     the NEXT round compares itself against the un-nudged value, so it collides
     with the nudged one instead. Measured before this: 109 repeats in 4800
     rounds. Stepping by anything in [1, n-1] can never land where it started. */
  let idx = (seed >>> 0) % n;
  for (let r = 1; r < round; r++) {
    idx = (idx + 1 + (((seed ^ (r * 2654435761)) >>> 0) % (n - 1))) % n;
  }
  return pool[idx];
}

/* ---- the rules above, as a test rather than as a comment ----------------- */
/* Returns a list of violations. Empty is the only acceptable answer, and the
   design sheet prints it so a new character cannot be added by eye alone. */
export function auditChars(brightestEnvironment) {
  const out = [];
  const envL = brightestEnvironment === undefined ? 0.363 : brightestEnvironment;
  const hot = tok('hot'), cool = tok('cool'), acid = tok('acid');
  const floor = tok('floor');
  const dist = (a, b) => {
    const p = (h) => { const n = parseInt(h.slice(1), 16);
                       return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const [x, y] = [p(a), p(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };
  const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
                            return (x + 0.05) / (y + 0.05); };
  for (const c of CHARS) {
    /* THE HEAD IS THE BRIGHT THING, not the jacket.
       The first version of this rule demanded a jacket brighter than the room,
       which is a real constraint pointed at the wrong surface: solving it turned
       ten saturated jackets into ten pastels, which is the exact opposite of the
       look being copied. What the value rule actually protects is that an ACTOR
       reads instantly against any room the generator can build — and in the
       reference that job is done by a bright mask over a dark, loud jacket. So
       the head has to beat the room, and the jacket only has to not disappear
       into the floor. */
    if (luminance(c.skin) <= envL + 0.06)
      out.push(`${c.name}: mask base ${c.skin} (${luminance(c.skin).toFixed(2)}) does not beat the room's ${envL}`);
    if (ratio(c.jacket, floor) < 1.6)
      out.push(`${c.name}: jacket ${c.jacket} is ${ratio(c.jacket, floor).toFixed(2)}:1 on the floor — it will read as a hole`);
    /* The ring on the ground is what says YOU or IT. A jacket close to either
       colour puts that message on the wrong object. */
    for (const [nm, ref] of [['hot', hot], ['cool', cool], ['acid', acid]]) {
      const d = dist(c.jacket, ref);
      if (d < 90) out.push(`${c.name}: jacket is ${Math.round(d)} from --${nm}, close enough to be read as a ring colour`);
    }
    if (dist(c.jacket, c.trim) < 70) out.push(`${c.name}: trim does not separate from the jacket`);
    if (dist(c.skin, c.jacket) < 70) out.push(`${c.name}: mask base does not separate from the jacket`);
    if (!c.mask.length) out.push(`${c.name}: no mask`);
  }
  return out;
}

/* The four roles a mask part can paint itself in. Kept here so the renderer and
   the design sheet cannot disagree about what "trim" means. */
export function palette(c) {
  return {
    jacket: c.jacket,
    trim: c.trim,
    skin: c.skin,
    dark: mixHex(c.jacket, '#140b1e', 0.62),
    /* WEAPONS ARE NOT PART OF THE CHARACTER'S COLOUR STORY. Steel is steel on
       everyone, so the thing you read from a weapon is its SHAPE — which is the
       only thing that survives a top-down camera anyway. The grip borrows a
       little of the jacket so it still belongs to the person holding it. */
    steel: '#9aa0b4',
    grip: mixHex(c.jacket, '#1a1520', 0.72),
  };
}
