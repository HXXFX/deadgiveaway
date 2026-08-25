/* HEALTH AND AMMUNITION, EVERY OPTION.
 * ============================================================================
 *
 * Both live in a 150x24 strip in the header, for BOTH bodies, and the player's
 * note on the first pass was that the results were dark and not very cool while
 * the cast is neither. That is a fair reading of what was there and it has one
 * cause: the panels were mixing every value toward the panel line to show it was
 * small, so a spent round and the background were the same colour.
 *
 * THE CAST'S RULE, WHICH THIS FILE FOLLOWS. A character is a SATURATED jacket
 * with a BRIGHT trim: rooster is #e8342a under #ffd23f, boar is #6fae3f under
 * #f2e8d5. The contrast is between the base and something LIGHTER — never
 * between the base and the ground. So:
 *
 *   full  = the saturated colour, lit face pushed toward white
 *   spent = the same shape, desaturated and held UP in value, never darkened
 *   trim  = a second bright colour on every solid, the way a mask has one
 *
 * Nothing here disappears into the panel, which is what "dark and not readable"
 * actually meant.
 */
import { rgba, mixHex } from './util.js';
import {
  el, option, grid, CAST, dim, INK, tooSmall,
  iso, isoBox, isoPlate, isoFit,
  obl, oblBox, oblPlate, oblFit,
} from './design-bench.js';

const HP = 2, HPMAX = 3;
const AMMO = 13, MAGN = 20;

/* ====================================================================== */
export function sectionHealth2(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'Health'));
  sec.append(el('p', 'lede',
    'Three hits, both bodies, 150 by 24. The question in a fight is HOW MANY ' +
    'HAVE I GOT LEFT — a count, not a proportion — so anything that reduces ' +
    'three to a fraction is answering something else. Every option is a solid ' +
    'with a trim on it, and a spent one is desaturated rather than darkened, ' +
    'because a dark shape on a dark panel is an absent shape.'));
  const gd = grid(sec, 'small');

  option(gd, {
    name: 'Cabinet drops, trimmed', size: [92, 24], verdict: 'best 3d',
    note: 'Three solids in cabinet with a bright cap, exactly the way a mask has ' +
          'a trim over a jacket. Full ones are arterial; a spent one keeps its ' +
          'shape and its value and loses its colour.',
    draw: (g, w, h, d, C) => {
      const F = oblFit(w, h, 3.5, 1.6, 0.7, 3 * d);
      for (let i = 0; i < HPMAX; i++) {
        const on = i < HP;
        oblBox(g, F.ox, F.oy, F.s, i * 1.2, 0, 0, 0.92, on ? 1.05 : 0.34, 0.7,
               on ? CAST.red : dim(CAST.red), 1.1 * d);
        oblBox(g, F.ox, F.oy, F.s, i * 1.2 + 0.20, on ? 1.05 : 0.34, 0.14,
               0.52, 0.34, 0.42, on ? CAST.gold : dim(CAST.gold), 1 * d);
      }
    },
  });

  option(gd, {
    name: 'Three masks', size: [92, 24], verdict: 'best 3d',
    note: 'THE CAST, LITERALLY. Three little heads with the trim mark the ' +
          'characters wear; a lost one is the same head with the colour out of ' +
          'it. Nothing else on the screen says "this is the same game as the ' +
          'thing in the arena" as directly.',
    draw: (g, w, h, d, C) => {
      const F = oblFit(w, h, 3.6, 1.5, 0.7, 3 * d);
      for (let i = 0; i < HPMAX; i++) {
        const on = i < HP;
        const base = on ? CAST.green : dim(CAST.green);
        oblBox(g, F.ox, F.oy, F.s, i * 1.24, 0, 0, 0.94, 0.95, 0.7, base, 1.1 * d);
        /* the trim: a beak out front and a comb on top, the rooster silhouette */
        oblBox(g, F.ox, F.oy, F.s, i * 1.24 + 0.30, 0.95, 0.16, 0.34, 0.36, 0.4,
               on ? CAST.gold : dim(CAST.gold), 0.9 * d);
        oblBox(g, F.ox, F.oy, F.s, i * 1.24 + 0.86, 0.30, 0.22, 0.22, 0.26, 0.3,
               on ? CAST.bone : dim(CAST.bone), 0.9 * d);
      }
    },
  });

  option(gd, {
    name: 'One tank, three chambers', size: [92, 24], verdict: 'best 3d',
    note: 'A single cabinet vessel divided into three, emptying left to right, ' +
          'with a bright rim along the top. Reads as ONE body with three hits in ' +
          'it rather than three separate objects — which is what health is.',
    draw: (g, w, h, d, C) => {
      const F = oblFit(w, h, 3.6, 1.5, 0.7, 3 * d);
      oblBox(g, F.ox, F.oy, F.s, 0, 0, 0, 3.6, 1.4, 0.7, dim(CAST.red, 0.9), 1.2 * d);
      for (let i = 0; i < HP; i++)
        oblBox(g, F.ox, F.oy, F.s, 0.08 + i * 1.18, 0.08, 0.08, 1.02, 1.24, 0.54,
               CAST.red, 1 * d);
      oblBox(g, F.ox, F.oy, F.s, 0, 1.4, 0, 3.6, 0.14, 0.7, CAST.gold, 1 * d);
    },
  });

  option(gd, {
    name: 'Stacked slabs', size: [92, 24], verdict: '3d',
    note: 'Three flat slabs stacked front to back rather than side by side, so ' +
          'losing one takes a layer off the top. Compact, and the count is read ' +
          'as a height, which is slightly slower than reading three shapes.',
    draw: (g, w, h, d, C) => {
      const F = oblFit(w, h, 2.0, 1.9, 1.0, 3 * d);
      for (let i = 0; i < HPMAX; i++) {
        const on = i < HP;
        oblBox(g, F.ox, F.oy, F.s, 0, i * 0.62, 0, 2.0, 0.5, 1.0,
               on ? (i === HP - 1 ? CAST.gold : CAST.red) : dim(CAST.red), 1.2 * d);
      }
    },
  });

  option(gd, {
    name: 'Drops with a shadow', size: [92, 24], verdict: '3d',
    note: 'The flat teardrop with a cast shadow and a rim light — depth without ' +
          'a projection at all. Cheapest here and the silhouette stays the one ' +
          'everybody already recognises.',
    draw: (g, w, h, d, C) => {
      const r = Math.min(h * 0.26, 7 * d);
      for (let i = 0; i < HPMAX; i++) {
        const x = r * 1.6 + i * r * 2.7, y = h * 0.55, on = i < HP;
        g.beginPath();
        g.ellipse(x + r * 0.30, y + r * 1.05, r * 0.75, r * 0.26, 0, 0, 7);
        g.fillStyle = 'rgba(0,0,0,.45)'; g.fill();
        g.beginPath();
        g.moveTo(x, y - r * 1.85);
        g.bezierCurveTo(x + r * 0.92, y - r * 0.55, x + r, y + r * 0.12, x + r, y + r * 0.30);
        g.arc(x, y + r * 0.30, r, 0, Math.PI);
        g.bezierCurveTo(x - r, y + r * 0.12, x - r * 0.92, y - r * 0.55, x, y - r * 1.85);
        g.closePath();
        g.fillStyle = on ? CAST.red : dim(CAST.red); g.fill();
        g.beginPath();
        g.ellipse(x - r * 0.32, y + r * 0.02, r * 0.28, r * 0.44, -0.5, 0, 7);
        g.fillStyle = on ? rgba(CAST.gold, 0.55) : 'rgba(255,255,255,.16)'; g.fill();
        g.strokeStyle = INK; g.lineWidth = 1.3 * d; g.stroke();
      }
    },
  });

  option(gd, {
    name: 'Isometric drops', size: [92, 30], verdict: 'rejected',
    note: 'Kept as the demonstration. Isometric drags half of both horizontal ' +
          'axes into the vertical, so it needs a taller header to say what ' +
          'cabinet says in 24 pixels.',
    draw: (g, w, h, d, C) => {
      const F = isoFit(w, h - 10 * d, 3.4, 1.5, 1.0, 3 * d);
      isoPlate(g, F.ox, F.oy, F.s, -0.15, -0.15, 3.7, 1.3, rgba(C.grid, 0.3));
      for (let i = 0; i < HPMAX; i++)
        isoBox(g, F.ox, F.oy, F.s, i * 1.15, 0, 0, 0.9, i < HP ? 1.15 : 0.3, 0.9,
               i < HP ? CAST.red : dim(CAST.red), 1.1 * d);
      tooSmall(g, w, h, d, C, F.s, 9 * d);
    },
  });

  option(gd, {
    name: 'Three drops, flat', size: [92, 24], verdict: 'in',
    note: 'What ships today. Legible and a little plain beside the cast — the ' +
          'trimmed options above are the same reading with the game’s own ' +
          'colour language on it.',
    draw: (g, w, h, d, C) => {
      const r = Math.min(h * 0.27, 7 * d);
      for (let i = 0; i < HPMAX; i++) {
        const x = r * 1.5 + i * r * 2.6, y = h * 0.6, on = i < HP;
        g.beginPath();
        g.moveTo(x, y - r * 1.85);
        g.bezierCurveTo(x + r * 0.92, y - r * 0.55, x + r, y + r * 0.12, x + r, y + r * 0.30);
        g.arc(x, y + r * 0.30, r, 0, Math.PI);
        g.bezierCurveTo(x - r, y + r * 0.12, x - r * 0.92, y - r * 0.55, x, y - r * 1.85);
        g.closePath();
        if (on) { g.fillStyle = C.blood; g.fill(); }
        g.strokeStyle = on ? INK : rgba(C.grid, 0.9);
        g.lineWidth = 1.2 * d; g.stroke();
      }
    },
  });
  root.append(sec);
}

/* ====================================================================== */
export function sectionAmmo2(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'The magazine'));
  sec.append(el('p', 'lede',
    'Twenty rounds in 150 pixels is seven pixels each however it is drawn, so ' +
    'the real problem is not the shape but how to make twenty countable at that ' +
    'width. There are two honest answers and both are below: draw them in ' +
    'cabinet so each one is a solid with a lit face, or GROUP them so you count ' +
    'four things instead of twenty.'));
  const gd = grid(sec, 'wide');

  option(gd, {
    name: 'Cabinet cartridges, brass', size: [150, 24], verdict: 'best 3d',
    note: 'Twenty three-sided rounds with a bright head on each — case in brass, ' +
          'head in gold, the jacket-and-trim pairing the cast uses. Spent ones ' +
          'stay full length and lose their colour, so the row never shortens.',
    draw: (g, w, h, d, C) => {
      const F = oblFit(w, h, MAGN * 0.44, 1.6, 0.5, 3 * d);
      for (let i = 0; i < MAGN; i++) {
        const on = i < AMMO;
        oblBox(g, F.ox, F.oy, F.s, i * 0.44, 0, 0, 0.32, on ? 1.20 : 0.55, 0.5,
               on ? CAST.orange : dim(CAST.orange), 0.9 * d);
        if (on) oblBox(g, F.ox, F.oy, F.s, i * 0.44, 1.20, 0, 0.32, 0.36, 0.5,
                       CAST.gold, 0.9 * d);
      }
    },
  });

  option(gd, {
    name: 'Four clips of five', size: [150, 24], verdict: 'best 3d',
    note: 'THE COUNTING PROBLEM SOLVED RATHER THAN DRAWN AROUND. Twenty is not ' +
          'countable at a glance; four is. Each block is five rounds, empties as ' +
          'a unit, and gets four times the pixels — "three and a bit clips" is ' +
          'read in one look.',
    draw: (g, w, h, d, C) => {
      const F = oblFit(w, h, 4 * 1.15, 1.6, 0.6, 3 * d);
      for (let k = 0; k < 4; k++) {
        const inClip = Math.max(0, Math.min(5, AMMO - k * 5));
        oblBox(g, F.ox, F.oy, F.s, k * 1.15, 0, 0, 1.0, 1.5, 0.6,
               dim(CAST.bone, 0.85), 1.1 * d);
        for (let i = 0; i < inClip; i++)
          oblBox(g, F.ox, F.oy, F.s, k * 1.15 + 0.06 + i * 0.18, 0.08, 0.08,
                 0.13, 1.34, 0.44, CAST.gold, 0.8 * d);
      }
    },
  });

  option(gd, {
    name: 'Five and five and five and five', size: [150, 26], verdict: 'best 3d',
    note: 'The grouping without the box: twenty rounds with a gap every fifth, ' +
          'so they are still individually countable AND chunked. Keeps the exact ' +
          'number the clips option rounds off, at the price of a busier row.',
    draw: (g, w, h, d, C) => {
      const F = oblFit(w, h, MAGN * 0.42 + 3 * 0.26, 1.6, 0.5, 3 * d);
      for (let i = 0; i < MAGN; i++) {
        const on = i < AMMO;
        const x = i * 0.42 + Math.floor(i / 5) * 0.26;
        oblBox(g, F.ox, F.oy, F.s, x, 0, 0, 0.30, on ? 1.20 : 0.5, 0.5,
               on ? CAST.orange : dim(CAST.orange), 0.9 * d);
        if (on) oblBox(g, F.ox, F.oy, F.s, x, 1.20, 0, 0.30, 0.34, 0.5,
                       CAST.gold, 0.9 * d);
      }
    },
  });

  option(gd, {
    name: 'The magazine, cabinet', size: [150, 26], verdict: 'best 3d',
    note: 'One box in section with the rounds stacked inside, the way it sits in ' +
          'the gun, with a bright floorplate. The clearest OBJECT of the set and ' +
          'the one that most looks like something out of the arena.',
    draw: (g, w, h, d, C) => {
      const F = oblFit(w, h, 5.0, 1.8, 0.6, 3 * d);
      oblBox(g, F.ox, F.oy, F.s, 0, 0, 0, 5.0, 1.6, 0.6, dim(CAST.bone, 0.9), 1.2 * d);
      for (let i = 0; i < AMMO; i++)
        oblBox(g, F.ox, F.oy, F.s, 0.13 + i * 0.235, 0.12, 0.62, 0.16, 1.36, 0.02,
               CAST.gold, 0.8 * d);
      oblBox(g, F.ox, F.oy, F.s, 0, 1.6, 0, 5.0, 0.16, 0.6, CAST.orange, 1 * d);
    },
  });

  option(gd, {
    name: 'A drum', size: [150, 26], verdict: 'option',
    note: 'Rounds around a wheel that turns as it empties. The most distinctive ' +
          'shape on the sheet and the least countable at this size — a ring puts ' +
          'half the rounds behind the other half.',
    draw: (g, w, h, d, C) => {
      const cx = w * 0.5, cy = h * 0.52, R = Math.min(w * 0.30, h * 0.42);
      for (let i = 0; i < MAGN; i++) {
        const a = (i / MAGN) * Math.PI * 2 - Math.PI / 2;
        const on = i < AMMO;
        g.beginPath();
        g.ellipse(cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.62,
                  2.4 * d, 2.4 * d, 0, 0, 7);
        g.fillStyle = on ? CAST.gold : dim(CAST.gold); g.fill();
        g.strokeStyle = INK; g.lineWidth = 0.9 * d; g.stroke();
      }
      g.beginPath();
      g.ellipse(cx, cy, R * 0.42, R * 0.42 * 0.62, 0, 0, 7);
      g.fillStyle = dim(CAST.bone, 0.9); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1.1 * d; g.stroke();
    },
  });

  option(gd, {
    name: 'A belt', size: [150, 26], verdict: 'option',
    note: 'Rounds hanging from a link belt, spent ones missing from the near ' +
          'end. Characterful and imprecise: a gap in a belt is harder to count ' +
          'than a step in a row.',
    draw: (g, w, h, d, C) => {
      const F = oblFit(w, h, MAGN * 0.44, 1.7, 0.5, 3 * d);
      oblBox(g, F.ox, F.oy, F.s, 0, 1.15, 0, MAGN * 0.44, 0.30, 0.5,
             dim(CAST.bone, 0.85), 1 * d);
      for (let i = 0; i < AMMO; i++)
        oblBox(g, F.ox, F.oy, F.s, i * 0.44 + 0.06, 0.05, 0.06, 0.28, 1.1, 0.38,
               CAST.gold, 0.8 * d);
    },
  });

  option(gd, {
    name: 'Twenty cartridges, flat', size: [150, 24], verdict: 'in',
    note: 'What ships today. Countable and unmistakably ammunition, but the ' +
          'volume is painted on rather than projected and it is the palest thing ' +
          'in the header.',
    draw: (g, w, h, d, C) => {
      const gap = 1.4 * d, bw = (w - 8 * d - gap * (MAGN - 1)) / MAGN;
      for (let i = 0; i < MAGN; i++) {
        const x = 4 * d + i * (bw + gap) + bw / 2, w2 = bw / 2, on = i < AMMO;
        const yb = h - 2.5 * d, yt = on ? 2 * d : h * 0.52;
        const headH = (yb - yt) * 0.30;
        g.beginPath();
        g.moveTo(x, yt); g.lineTo(x + w2, yt + headH); g.lineTo(x + w2, yb);
        g.lineTo(x - w2, yb); g.lineTo(x - w2, yt + headH); g.closePath();
        g.fillStyle = on ? C.cool : rgba(C.grid, 0.34); g.fill();
        g.strokeStyle = INK; g.lineWidth = 1 * d; g.stroke();
      }
    },
  });

  option(gd, {
    name: 'A bar', size: [150, 24], verdict: 'rejected',
    note: 'Cheapest to draw and worst at the job: it says "about two thirds", ' +
          'and nobody has ever wanted to know that about a magazine.',
    draw: (g, w, h, d, C) => {
      g.fillStyle = rgba(C.grid, 0.35);
      g.fillRect(4 * d, h / 2 - 5 * d, w - 8 * d, 10 * d);
      g.fillStyle = C.cool;
      g.fillRect(4 * d, h / 2 - 5 * d, (w - 8 * d) * (AMMO / MAGN), 10 * d);
    },
  });
  root.append(sec);
}
