/* THE THREE REMAINING PANELS, IN THE IDIOM THAT WORKED.
 * ============================================================================
 *
 * The player picked "one desk" for the controls panel and asked for these three
 * to match it. Worth being precise about what "match it" means, because it is
 * not a style — it is four decisions, and every option below either takes them
 * or is on the sheet to show what happens when it does not:
 *
 *   ONE SCENE, NOT SEVERAL. The desk works because the keyboard, the mouse and
 *   the trigger are on the same surface under the same light. Three little
 *   scenes side by side read as three charts however well each one is drawn.
 *
 *   OBJECTS, NOT MARKS. A held key is a key that is DOWN. The quantity is a
 *   property of a thing rather than the length of an abstraction, so the panel
 *   is a picture of something rather than a diagram about it.
 *
 *   THE GROUND CARRIES MEANING. The desk is a desk. A plate under a column is
 *   the control it had to beat. Anything the scene stands on should be saying
 *   something, or it should not be there.
 *
 *   THE CAST'S COLOUR RULE. Saturated base, brighter trim, and a spent thing
 *   desaturates rather than darkens — a dark shape on a dark panel is absent.
 */
import { rgba, mixHex } from './util.js';
import {
  el, option, grid, CAST, dim, INK,
  iso, isoBox, isoPlate, isoFit,
  obl, oblBox, oblPlate, oblFit,
} from './design-bench.js';

const V3 = [0.0, 0.66, 0.23];
const NM3 = ['hands', 'aim', 'trigger'];
const YOU = [0, 0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 6];
const IT = [0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4];

/* a small figure in the cast's proportions, used by several options below */
function figure(g, ox, oy, s, x, z, col, trim, d, scale) {
  const k = scale === undefined ? 1 : scale;
  isoBox(g, ox, oy, s, x, 0, z + 0.15 * k, 0.62 * k, 0.22 * k, 0.62 * k, dim(col, 0.4), d);
  isoBox(g, ox, oy, s, x + 0.06 * k, 0.22 * k, z + 0.21 * k,
         0.50 * k, 0.62 * k, 0.50 * k, col, d);
  isoBox(g, ox, oy, s, x + 0.12 * k, 0.84 * k, z + 0.27 * k,
         0.38 * k, 0.40 * k, 0.38 * k, trim, d);
}

/* ====================================================================== */
export function sectionTook(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'What it took off you'));
  sec.append(el('p', 'lede',
    'Three numbers, each one how far PAST a control the policy got — a control ' +
    'that needed no learning at all. The hard part is that the control is the ' +
    'whole point and it is invisible: a bar with no floor under it is just a ' +
    'bar. Every option here has to put the control somewhere you can see it.'));
  const gd = grid(sec, 'deck');

  option(gd, {
    name: 'A workbench', size: [300, 110], verdict: 'best 3d',
    note: 'ONE SURFACE, THREE TOOLS, exactly the way the desk holds three ' +
          'controls. Each one sits in its own recess — the recess is the control, ' +
          'cut into the bench — and how far it stands PROUD of the bench is what ' +
          'was learned. Nothing is above the surface that did not beat the floor.',
    draw: (g, w, h, d, C) => {
      const cols = [CAST.red, CAST.gold, CAST.blue];
      const F = isoFit(w, h - 14 * d, 5.4, 2.4, 3.2, 8 * d);
      const s = F.s, ox = F.ox, oy = F.oy + 6 * d;
      isoPlate(g, ox, oy, s, -0.4, -0.4, 6.2, 4.0, rgba(C.grid, 0.34));
      for (let i = 0; i < 3; i++) {
        const x = i * 1.75;
        /* the recess: the level a thing that learned nothing would reach */
        isoPlate(g, ox, oy, s, x - 0.08, 0.72, 1.36, 1.36, rgba(INK, 0.55));
        const v = V3[i];
        isoBox(g, ox, oy, s, x, 0, 0.8, 1.2, 0.14 + v * 1.9, 1.2,
               v > 0.02 ? cols[i] : dim(cols[i]), 1.2 * d);
      }
    },
  });

  option(gd, {
    name: 'Three podiums', size: [300, 110], verdict: 'best 3d',
    note: 'The three standing on blocks of the same height, so the plinth is the ' +
          'control and the FIGURE on top is what it learned. Reads instantly as ' +
          'a ranking, which is what three numbers side by side are — and it ' +
          'brings the cast into a panel that had no bodies in it.',
    draw: (g, w, h, d, C) => {
      const cols = [CAST.red, CAST.gold, CAST.blue];
      const trims = [CAST.gold, CAST.bone, CAST.mint];
      const F = isoFit(w, h - 12 * d, 5.4, 2.6, 2.4, 8 * d);
      const s = F.s, ox = F.ox, oy = F.oy + 5 * d;
      for (let i = 2; i >= 0; i--) {
        const x = i * 1.8;
        isoPlate(g, ox, oy, s, x - 0.1, -0.1, 1.5, 1.5, rgba(C.grid, 0.34));
        isoBox(g, ox, oy, s, x, 0, 0, 1.3, 0.34, 1.3, dim(CAST.bone, 0.85), 1.2 * d);
        const v = V3[i];
        if (v > 0.02)
          isoBox(g, ox, oy, s, x + 0.1, 0.34, 0.1, 1.1, v * 1.5, 1.1, cols[i], 1.1 * d);
        figure(g, ox, oy, s, x + 0.32, 0.32, cols[i], trims[i], 1 * d, 0.62);
      }
    },
  });

  option(gd, {
    name: 'One figure, three coats', size: [300, 110], verdict: '3d',
    note: 'A single body whose boots, jacket and mask fill as it learns each ' +
          'channel — the most direct statement that the three numbers add up to ' +
          'ONE thing. And it hides the numbers the panel exists for: you cannot ' +
          'read 66% off how full a jacket looks.',
    draw: (g, w, h, d, C) => {
      const F = isoFit(w, h - 12 * d, 2.0, 3.2, 2.0, 10 * d);
      const s = F.s, ox = F.ox, oy = F.oy + 4 * d;
      isoPlate(g, ox, oy, s, -0.5, -0.5, 3.0, 3.0, rgba(C.grid, 0.30));
      const cols = [CAST.red, CAST.gold, CAST.blue];
      isoBox(g, ox, oy, s, 0.3, 0, 0.3, 1.0, 0.36, 1.0,
             V3[0] > 0.02 ? cols[0] : dim(cols[0]), 1.2 * d);
      isoBox(g, ox, oy, s, 0.38, 0.36, 0.38, 0.84, 1.0, 0.84,
             V3[1] > 0.02 ? cols[1] : dim(cols[1]), 1.2 * d);
      isoBox(g, ox, oy, s, 0.48, 1.36, 0.48, 0.64, 0.66, 0.64,
             V3[2] > 0.02 ? cols[2] : dim(cols[2]), 1.2 * d);
    },
  });

  option(gd, {
    name: 'A cabinet run', size: [300, 110], verdict: 'in',
    note: 'What ships. Three columns on one long plate, the plate being the ' +
          'control. Fills the card and compares cleanly; it is the least like ' +
          'the desk of the options here, because a column is a mark and not an ' +
          'object.',
    draw: (g, w, h, d, C) => {
      const cols = [CAST.red, CAST.gold, CAST.blue];
      const CW = 3.6, PITCH = 6.6;
      const F = oblFit(w, h - 22 * d, 2 * PITCH + CW, 2.6, 1.0, 9 * d);
      oblPlate(g, F.ox, F.oy, F.s, -0.25, 0, 2 * PITCH + CW + 0.5, 1.0,
               rgba(C.grid, 0.34));
      for (let i = 0; i < 3; i++) {
        const v = V3[i], hgt = 0.16 + v * 2.3;
        oblBox(g, F.ox, F.oy, F.s, i * PITCH, 0, 0, CW, hgt, 1.0,
               v > 0.02 ? cols[i] : dim(cols[i]), 1.2 * d);
        const t = obl(F.ox, F.oy, F.s, i * PITCH + CW / 2, hgt, 0.5);
        g.fillStyle = v > 0.02 ? cols[i] : C.ink3;
        g.font = `900 ${12 * d}px ui-monospace, monospace`;
        g.textAlign = 'center';
        g.fillText(Math.round(v * 100) + '%', t[0], t[1] - 5 * d);
        g.textAlign = 'left';
      }
    },
  });
  root.append(sec);
}

/* ====================================================================== */
export function sectionLedger(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'The ledger'));
  sec.append(el('p', 'lede',
    'Who has been winning, over the whole evening. It is the only panel with a ' +
    'HISTORY in it rather than a present value, and that is what makes it hard ' +
    'to put on a desk: a desk shows a state, and this has to show a shape over ' +
    'time. The options below trade those two against each other.'));
  const gd = grid(sec, 'deck');

  option(gd, {
    name: 'Two towers', size: [300, 110], verdict: 'best 3d',
    note: 'ONE BLOCK PER KILL, stacked. Yours and its, side by side on one ' +
          'plate. A desk that shows a state rather than a graph, and the state ' +
          'is the only thing anybody wants off this panel — WHO IS AHEAD, read ' +
          'as a height difference with no axis to parse.',
    draw: (g, w, h, d, C) => {
      const F = isoFit(w, h - 14 * d, 2.6, 2.8, 1.5, 9 * d);
      const s = F.s, ox = F.ox, oy = F.oy + 5 * d;
      isoPlate(g, ox, oy, s, -0.35, -0.35, 3.4, 2.2, rgba(C.grid, 0.34));
      const you = YOU[YOU.length - 1], it = IT[IT.length - 1];
      for (let i = 0; i < you; i++)
        isoBox(g, ox, oy, s, 0, i * 0.42, 0, 1.1, 0.36, 1.1,
               i === you - 1 ? CAST.bone : CAST.blue, 1.1 * d);
      for (let i = 0; i < it; i++)
        isoBox(g, ox, oy, s, 1.5, i * 0.42, 0, 1.1, 0.36, 1.1,
               i === it - 1 ? CAST.gold : CAST.red, 1.1 * d);
    },
  });

  option(gd, {
    name: 'A staircase', size: [300, 110], verdict: 'best 3d',
    note: 'The stepped line as ACTUAL STEPS running away from you, one tread per ' +
          'round, height being the score. Keeps the whole history the towers ' +
          'throw away and still reads as an object rather than a chart — you can ' +
          'see where the evening turned.',
    draw: (g, w, h, d, C) => {
      const n = YOU.length;
      const F = oblFit(w, h - 16 * d, n * 0.52, 2.4, 1.4, 8 * d);
      const s = F.s, ox = F.ox, oy = F.oy - 2 * d;
      for (let i = 0; i < n; i++) {
        oblBox(g, ox, oy, s, i * 0.52, 0, 0, 0.46, 0.16 + YOU[i] * 0.30, 1.4,
               CAST.blue, 1 * d);
        oblBox(g, ox, oy, s, i * 0.52 + 0.06, 0.16 + YOU[i] * 0.30, 0.5,
               0.34, 0.10, 0.5, CAST.bone, 0.8 * d);
      }
      for (let i = 0; i < n; i++)
        oblBox(g, ox, oy, s, i * 0.52 + 0.1, 0, 1.45, 0.34, 0.14 + IT[i] * 0.30, 0.3,
               CAST.red, 0.9 * d);
    },
  });

  option(gd, {
    name: 'A shelf of bodies', size: [300, 110], verdict: '3d',
    note: 'One little corpse per kill on two shelves, in the cast’s own ' +
          'proportions. The most characterful thing on this sheet and it stops ' +
          'scaling at about a dozen — a good evening is thirty rounds, and thirty ' +
          'bodies is a texture rather than a count.',
    draw: (g, w, h, d, C) => {
      const F = isoFit(w, h - 12 * d, 6.4, 1.8, 2.6, 8 * d);
      const s = F.s, ox = F.ox, oy = F.oy + 4 * d;
      isoPlate(g, ox, oy, s, -0.3, -0.3, 7.0, 3.2, rgba(C.grid, 0.30));
      for (let i = 0; i < YOU[YOU.length - 1]; i++)
        figure(g, ox, oy, s, i * 0.95, 0, CAST.red, CAST.gold, 1 * d, 0.72);
      for (let i = 0; i < IT[IT.length - 1]; i++)
        figure(g, ox, oy, s, i * 0.95, 1.6, CAST.blue, CAST.bone, 1 * d, 0.72);
    },
  });

  option(gd, {
    name: 'A tally wall', size: [300, 110], verdict: 'option',
    note: 'Scratches cut into a wall, five to a gate, one wall each. Instantly ' +
          'readable as a count and it is the only option here that says how long ' +
          'this has been going ON — but it is a flat idea wearing a 3-D wall, ' +
          'and the marks are not objects.',
    draw: (g, w, h, d, C) => {
      const F = oblFit(w, h - 14 * d, 6.0, 2.2, 0.8, 9 * d);
      const s = F.s, ox = F.ox, oy = F.oy;
      oblBox(g, ox, oy, s, 0, 0, 0, 6.0, 2.0, 0.8, dim(CAST.bone, 0.9), 1.2 * d);
      const mark = (n, y0, col) => {
        for (let i = 0; i < n; i++) {
          const grp = Math.floor(i / 5), k = i % 5;
          const x = 0.3 + grp * 1.15 + k * 0.16;
          if (k === 4) {
            g.save();
            const a = obl(ox, oy, s, x - 0.62, y0, 0.01);
            const b = obl(ox, oy, s, x + 0.06, y0 + 0.62, 0.01);
            g.strokeStyle = col; g.lineWidth = 2.2 * d;
            g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
            g.restore();
          } else {
            oblBox(g, ox, oy, s, x, y0, 0.01, 0.07, 0.62, 0.02, col, 0.7 * d);
          }
        }
      };
      mark(YOU[YOU.length - 1], 1.15, CAST.blue);
      mark(IT[IT.length - 1], 0.25, CAST.red);
    },
  });

  option(gd, {
    name: 'Two stepped lines', size: [300, 110], verdict: 'in',
    note: 'What ships. The most information per pixel of anything here and the ' +
          'least like the desk: it is a chart, and a chart is the one thing the ' +
          'panels have been moving away from.',
    draw: (g, w, h, d, C) => {
      const L = 12 * d, R2 = w - 34 * d, T = 15 * d, B = h - 16 * d;
      const top = 6, n = YOU.length;
      const X = (i) => L + (i / (n - 1)) * (R2 - L), Y = (v) => B - (v / top) * (B - T);
      g.beginPath(); g.moveTo(X(0), B);
      for (let i = 0; i < n; i++) { if (i) g.lineTo(X(i), Y(YOU[i - 1])); g.lineTo(X(i), Y(YOU[i])); }
      g.lineTo(X(n - 1), B); g.closePath();
      g.fillStyle = rgba(CAST.blue, 0.22); g.fill();
      g.fillStyle = rgba(C.grid, 0.6); g.fillRect(L, B, R2 - L, 1 * d);
      for (const [arr, col] of [[IT, CAST.red], [YOU, CAST.blue]]) {
        g.beginPath();
        for (let i = 0; i < n; i++) {
          if (!i) g.moveTo(X(i), Y(arr[i]));
          else { g.lineTo(X(i), Y(arr[i - 1])); g.lineTo(X(i), Y(arr[i])); }
        }
        g.strokeStyle = col; g.lineWidth = 2.6 * d; g.stroke();
      }
    },
  });
  root.append(sec);
}

/* ====================================================================== */
export function sectionBecome(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'How much it has become you'));
  sec.append(el('p', 'lede',
    'One number, and it is the headline of the whole game. It has an advantage ' +
    'none of the other panels have: the subject is literally two bodies, so ' +
    'there is an obvious object to draw — and a rail panel is nearly square, ' +
    'which is the shape isometric wants. Every option below is one scene.'));
  const gd = grid(sec, 'tall');
  const B = 0.42;                      /* how far it has got */

  option(gd, {
    name: 'Two figures closing', size: [300, 150], verdict: 'in',
    note: 'What ships. You in blue carrying the weapon, it in red, and THE GAP ' +
          'BETWEEN THEM IS THE SCORE — at nothing learned they stand at opposite ' +
          'ends, and they close as it takes your habits. Nothing here is a ' +
          'metaphor for the number; it is the number, drawn as a distance.',
    draw: (g, w, h, d, C) => {
      const SPAN = 5.2;
      const F = isoFit(w, h - 16 * d, SPAN + 1.2, 2.6, 1.2, 8 * d);
      const s = F.s, ox = F.ox, oy = F.oy;
      isoPlate(g, ox, oy, s, -0.4, -0.3, SPAN + 2.0, 1.8, rgba(C.grid, 0.34));
      const gap = (1 - B) * SPAN, mid = SPAN / 2;
      figure(g, ox, oy, s, mid + gap / 2 - 0.3, 0, CAST.red, CAST.gold, 1.1 * d);
      figure(g, ox, oy, s, mid - gap / 2 - 0.3, 0, CAST.blue, CAST.bone, 1.1 * d);
    },
  });

  option(gd, {
    name: 'A mask on a bench', size: [300, 150], verdict: 'best 3d',
    note: 'YOUR MASK ON A WORKBENCH, being copied — the finished one on the ' +
          'left, the copy on the right filling in from the bottom as it learns. ' +
          'The most on-subject object in the game: the enemy IS a mask of you, ' +
          'and the panel is the bench it is being made on.',
    draw: (g, w, h, d, C) => {
      const F = isoFit(w, h - 16 * d, 4.4, 2.6, 2.6, 9 * d);
      const s = F.s, ox = F.ox, oy = F.oy + 4 * d;
      isoPlate(g, ox, oy, s, -0.5, -0.5, 5.4, 3.6, rgba(C.grid, 0.34));
      /* the original: complete, with its trim */
      isoBox(g, ox, oy, s, 0.2, 0, 0.6, 1.3, 1.3, 1.3, CAST.blue, 1.2 * d);
      isoBox(g, ox, oy, s, 0.5, 1.3, 0.9, 0.7, 0.36, 0.7, CAST.bone, 1.1 * d);
      /* the copy: filled to the score, the rest an empty shell */
      isoBox(g, ox, oy, s, 2.6, 0, 0.6, 1.3, 1.3, 1.3, dim(CAST.red, 0.85), 1.2 * d);
      isoBox(g, ox, oy, s, 2.66, 0, 0.66, 1.18, 1.3 * B, 1.18, CAST.red, 1.1 * d);
      if (B > 0.8) isoBox(g, ox, oy, s, 2.9, 1.3, 0.9, 0.7, 0.36, 0.7, CAST.gold, 1.1 * d);
    },
  });

  option(gd, {
    name: 'A wardrobe', size: [300, 150], verdict: 'best 3d',
    note: 'A rail of jackets: yours at one end, and one hanging for each thing ' +
          'it has taken — hands, aim, trigger — going from grey to your colour ' +
          'as it learns them. Shows the THREE PARTS and the total in one scene, ' +
          'which is what the number underneath is made of.',
    draw: (g, w, h, d, C) => {
      const F = isoFit(w, h - 14 * d, 4.6, 2.8, 2.0, 9 * d);
      const s = F.s, ox = F.ox, oy = F.oy + 4 * d;
      isoPlate(g, ox, oy, s, -0.4, -0.4, 5.4, 2.8, rgba(C.grid, 0.34));
      /* the rail */
      isoBox(g, ox, oy, s, -0.2, 2.0, 0.5, 5.0, 0.10, 0.10, dim(CAST.bone, 0.8), 1 * d);
      /* yours, the original */
      isoBox(g, ox, oy, s, 0, 0.7, 0.2, 0.9, 1.3, 0.9, CAST.blue, 1.2 * d);
      const V = [0.0, 0.66, 0.23];
      for (let i = 0; i < 3; i++) {
        const x = 1.4 + i * 1.05;
        isoBox(g, ox, oy, s, x, 0.7, 0.2, 0.8, 1.3, 0.8,
               V[i] > 0.02 ? mixHex(dim(CAST.blue, 0.9), CAST.blue, V[i]) : dim(CAST.blue, 0.9),
               1.1 * d);
        isoBox(g, ox, oy, s, x + 0.24, 1.9, 0.44, 0.32, 0.16, 0.32,
               dim(CAST.bone, 0.7), 0.9 * d);
      }
    },
  });

  option(gd, {
    name: 'A dial', size: [300, 150], verdict: 'option',
    note: 'A physical dial on a plinth with the needle at the score and the ' +
          'three components as small gauges beside it. Unambiguous, reads at any ' +
          'size, and it is an INSTRUMENT rather than a body — the one panel where ' +
          'the subject is two people, drawn as machinery.',
    draw: (g, w, h, d, C) => {
      const F = isoFit(w, h - 14 * d, 3.4, 2.4, 2.4, 9 * d);
      const s = F.s, ox = F.ox, oy = F.oy + 4 * d;
      isoPlate(g, ox, oy, s, -0.4, -0.4, 4.2, 3.2, rgba(C.grid, 0.34));
      isoBox(g, ox, oy, s, 0, 0, 0, 2.0, 0.5, 2.0, dim(CAST.bone, 0.85), 1.2 * d);
      const cx = iso(ox, oy, s, 1.0, 0.5, 1.0);
      const R = s * 0.85;
      g.beginPath();
      g.ellipse(cx[0], cx[1], R, R * 0.58, 0, 0, 7);
      g.fillStyle = CAST.gold; g.fill();
      g.strokeStyle = INK; g.lineWidth = 1.4 * d; g.stroke();
      const a = Math.PI * (1 - B);
      g.beginPath();
      g.moveTo(cx[0], cx[1]);
      g.lineTo(cx[0] - Math.cos(a) * R * 0.82, cx[1] - Math.sin(a) * R * 0.48);
      g.strokeStyle = INK; g.lineWidth = 2.6 * d; g.stroke();
      const V = [0.0, 0.66, 0.23], cols = [CAST.red, CAST.gold, CAST.blue];
      for (let i = 0; i < 3; i++)
        isoBox(g, ox, oy, s, 2.4, 0, i * 0.7, 0.7, 0.14 + V[i] * 1.2, 0.55,
               V[i] > 0.02 ? cols[i] : dim(cols[i]), 1 * d);
    },
  });

  option(gd, {
    name: 'One body, two halves', size: [300, 150], verdict: 'option',
    note: 'A single figure split down the middle, your colour bleeding across ' +
          'it as it learns. The strongest single IMAGE here — it is the game’s ' +
          'title in one object — and it cannot show the three components, so the ' +
          'panel would need the small meters back underneath it.',
    draw: (g, w, h, d, C) => {
      const F = isoFit(w, h - 14 * d, 2.2, 3.0, 2.2, 12 * d);
      const s = F.s, ox = F.ox, oy = F.oy + 4 * d;
      isoPlate(g, ox, oy, s, -0.6, -0.6, 3.4, 3.4, rgba(C.grid, 0.34));
      const parts = [[0, 0.36, 1.0], [0.36, 1.0, 0.84], [1.36, 0.66, 0.64]];
      for (const [y0, hh, ww] of parts) {
        const off = (1.0 - ww) / 2;
        isoBox(g, ox, oy, s, 0.3 + off, y0, 0.3 + off, ww / 2, hh, ww,
               CAST.blue, 1.2 * d);
        isoBox(g, ox, oy, s, 0.3 + off + ww / 2, y0, 0.3 + off, ww / 2, hh, ww,
               mixHex(CAST.red, CAST.blue, B), 1.2 * d);
      }
    },
  });
  root.append(sec);
}
