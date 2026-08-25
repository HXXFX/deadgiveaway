/* THE POLICY, DRAWN EVERY WAY WORTH DRAWING IT.
 * ============================================================================
 *
 * This is the panel the player said "doesn't really do anything", and it is the
 * hardest of the six because the thing it describes has no shape. A network is
 * 7,958 numbers; any picture of it is a choice about which of them to show and
 * what to imply about the rest. The honest options are the ones that show a
 * quantity that is really there and changing.
 *
 * WHAT IS ACTUALLY AVAILABLE, every frame:
 *   36 inputs      what it can see right now
 *   64 + 64        two hidden layers, live activations, signed
 *   22 outputs     the seven decisions, before sampling
 *
 * WHAT IS NOT AVAILABLE as a picture worth drawing: the weights. There are
 * 7,958 of them, they change by a thousandth per frame, and drawn honestly they
 * are a grey rectangle — which is on the sheet, because "we tried it and here is
 * why not" is worth more than silence.
 *
 * AND THE COLOUR RULE THIS FILE FOLLOWS. The cast is saturated jackets with
 * bright trims — rooster is #e8342a under #ffd23f. Nothing here mixes a value
 * toward the panel line to show it is small; small is drawn SHORT and still
 * saturated, because a solid mixed 70% into the background is a hole in the
 * panel rather than a quiet reading.
 */
import { rgba, mixHex } from './util.js';
import {
  el, option, grid, CAST, dim,
  iso, isoBox, isoPlate, isoFit,
  obl, oblBox, oblPlate, oblFit,
} from './design-bench.js';

/* one deterministic frame of the net, so every option draws the SAME state and
   what is being compared is the presentation and not the data */
function frame(seed, n) {
  let s = seed, out = [];
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out.push((s / 0x7fffffff) * 2 - 1);
  }
  return out;
}
const L0 = frame(7, 18), L1 = frame(31, 18), L2 = frame(99, 18), L3 = frame(5, 18);
const LAY = [L0, L1, L2, L3];
const LN = ['sees', '', '', 'does'];

export function sectionPolicy(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'The policy'));
  sec.append(el('p', 'lede',
    'Thirty-six inputs, two hidden layers of sixty-four, twenty-two outputs, ' +
    'live. The panel has to show something that is genuinely changing every ' +
    'frame — that is the whole complaint against the version it replaced — and it ' +
    'has to do it in a box 600 by 120. Long layers are SAMPLED evenly in all of ' +
    'these, never truncated: what is drawn is the whole layer at lower ' +
    'resolution, not its first sixteen units.'));
  const gd = grid(sec, 'deck');

  option(gd, {
    name: 'Four stacks, isometric', size: [300, 110], verdict: 'in',
    note: 'What ships. Each layer is its own small scene at its own screen ' +
          'origin and every unit is a block whose HEIGHT is its activation. ' +
          'Honest and legible; the criticism is that four separate scenes read as ' +
          'four charts rather than as one network.',
    draw: (g, w, h, d, C) => {
      const cols = [C.cool, CAST.violet, CAST.violet, C.hot];
      const F = isoFit(w / 4, h - 16 * d, 1.5, 2.4, 18 * 1.06 + 0.6, 4 * d);
      for (let c = 3; c >= 0; c--) {
        const ox = F.ox + c * (w / 4), oy = F.oy + 11 * d;
        isoPlate(g, ox, oy, F.s, -0.25, -0.25, 2.5, 18 * 1.06 + 0.5, rgba(C.grid, 0.30));
        for (let i = 17; i >= 0; i--) {
          const raw = LAY[c][i], a = Math.min(1, Math.abs(raw));
          isoBox(g, ox, oy, F.s, 0, 0, i * 1.06, 1.5, 0.12 + a * 2.2, 0.86,
                 raw < 0 ? CAST.orange : cols[c], 1.0 * d);
        }
      }
    },
  });

  option(gd, {
    name: 'A cabinet skyline', size: [300, 110], verdict: 'best 3d',
    note: 'ONE SCENE, NOT FOUR. Cabinet keeps the horizontal axis, so all four ' +
          'layers stand in a single row across the full width with depth used for ' +
          'the layer index — the signal reads left to right as one wave crossing ' +
          'one object. Twice the size per unit of the isometric version, and it ' +
          'stops looking like four charts.',
    draw: (g, w, h, d, C) => {
      const cols = [C.cool, CAST.violet, CAST.violet, C.hot];
      const N = 18, GAP = 0.34;
      const F = oblFit(w, h - 18 * d, N * GAP * 4 + 1.2, 2.6, 1.6, 7 * d);
      oblPlate(g, F.ox, F.oy, F.s, -0.2, 0, N * GAP * 4 + 1.4, 1.6, rgba(C.grid, 0.28));
      for (let c = 0; c < 4; c++)
        for (let i = 0; i < N; i++) {
          const raw = LAY[c][i], a = Math.min(1, Math.abs(raw));
          oblBox(g, F.ox, F.oy, F.s, (c * N + i) * GAP + c * 0.3, 0, 0.2,
                 GAP * 0.78, 0.14 + a * 2.3, 1.2,
                 raw < 0 ? CAST.orange : cols[c], 0.9 * d);
        }
      g.fillStyle = C.ink3; g.font = `700 ${9 * d}px ui-monospace, monospace`;
      g.fillText('SEES', 10 * d, h - 4 * d);
      g.textAlign = 'right'; g.fillText('DOES', w - 10 * d, h - 4 * d);
      g.textAlign = 'left';
    },
  });

  option(gd, {
    name: 'The decision, large', size: [300, 110], verdict: 'best 3d',
    note: 'STOP DRAWING THE MIDDLE. The hidden layers are the part nobody can ' +
          'read anyway; what a player actually wants from this panel is what it ' +
          'is about to DO. Seven cabinet columns — four keys, aim, fire, reload — ' +
          'at four times the size, with the two hidden layers reduced to a thin ' +
          'band behind them saying only "something is happening in there".',
    draw: (g, w, h, d, C) => {
      const NMS = ['W', 'A', 'S', 'D', 'aim', 'fire', 'R'];
      const VS = [0.05, 0.90, 0.10, 0.02, 0.63, 0.67, 0.20];
      const CS = [C.hot, C.hot, C.hot, C.hot, C.acid, C.acid, C.cool];
      /* the hidden layers, small and behind */
      const B = oblFit(w, h * 0.30, 36 * 0.22, 1.0, 0.6, 8 * d);
      for (let i = 0; i < 36; i++) {
        const a = Math.min(1, Math.abs(LAY[1 + (i % 2)][i % 18]));
        oblBox(g, B.ox, B.oy + 10 * d, B.s, i * 0.22, 0, 0, 0.16, 0.15 + a * 0.85, 0.6,
               CAST.violet, 0.7 * d);
      }
      const F = oblFit(w, h * 0.62, 7 * 1.05, 2.2, 1.1, 8 * d);
      const oy = F.oy + h * 0.36;
      oblPlate(g, F.ox, oy, F.s, -0.1, 0, 7 * 1.05 + 0.1, 1.1, rgba(C.grid, 0.28));
      for (let i = 0; i < 7; i++) {
        oblBox(g, F.ox, oy, F.s, i * 1.05, 0, 0, 0.86, 0.16 + VS[i] * 2.0, 1.1,
               VS[i] > 0.4 ? CS[i] : dim(CS[i]), 1.1 * d);
        const b = obl(F.ox, oy, F.s, i * 1.05 + 0.43, 0, 0);
        g.fillStyle = C.ink3; g.font = `${8 * d}px ui-monospace, monospace`;
        g.textAlign = 'center'; g.fillText(NMS[i], b[0], b[1] + 10 * d);
        g.textAlign = 'left';
      }
    },
  });

  option(gd, {
    name: 'A signal crossing it', size: [300, 110], verdict: 'option',
    note: 'Four layers as plates with a bright pulse travelling left to right ' +
          'once per decision, its brightness the size of the activation. The most ' +
          'ALIVE option here and the least precise — motion says "it is thinking" ' +
          'and does not say what it is thinking.',
    draw: (g, w, h, d, C) => {
      const F = oblFit(w, h - 16 * d, 4 * 1.9, 2.0, 1.4, 8 * d);
      const t = 0.62;                    /* where the pulse is, 0..1 */
      for (let c = 0; c < 4; c++) {
        const near = Math.max(0, 1 - Math.abs(c / 3 - t) * 3.2);
        oblBox(g, F.ox, F.oy, F.s, c * 1.9, 0, 0, 1.5, 1.9, 1.4,
               near > 0.05 ? mixHex(CAST.violet, CAST.gold, near) : CAST.violet, 1.2 * d);
        for (let i = 0; i < 6; i++)
          oblBox(g, F.ox, F.oy, F.s, c * 1.9 + 0.14, 0.14 + i * 0.28, 1.42,
                 1.22, 0.18, 0.02,
                 Math.abs(LAY[c][i]) > 0.5 ? CAST.gold : dim(CAST.gold), 0.7 * d);
      }
    },
  });

  option(gd, {
    name: 'Input fan, output fan', size: [300, 110], verdict: 'option',
    note: 'Only the two ends, mirrored: what it can see on the left, what it has ' +
          'decided on the right, nothing between them. The most honest about ' +
          'what is knowable and it throws away the one thing that is unambiguously ' +
          'live — the hidden layers really do change every frame.',
    draw: (g, w, h, d, C) => {
      const F = oblFit(w * 0.46, h - 18 * d, 18 * 0.30, 2.2, 1.0, 7 * d);
      for (const [side, arr, col] of [[0, L0, C.cool], [1, L3, C.hot]]) {
        const ox = F.ox + side * (w * 0.54);
        oblPlate(g, ox, F.oy, F.s, -0.1, 0, 18 * 0.30 + 0.1, 1.0, rgba(C.grid, 0.28));
        for (let i = 0; i < 18; i++) {
          const a = Math.min(1, Math.abs(arr[i]));
          oblBox(g, ox, F.oy, F.s, i * 0.30, 0, 0, 0.24, 0.14 + a * 2.0, 1.0,
                 arr[i] < 0 ? CAST.orange : col, 0.85 * d);
        }
        g.fillStyle = C.ink3; g.font = `700 ${9 * d}px ui-monospace, monospace`;
        g.fillText(side ? 'DOES' : 'SEES', ox + 2 * d, h - 4 * d);
      }
    },
  });

  option(gd, {
    name: 'A drum of units', size: [300, 110], verdict: 'option',
    note: 'The whole net wrapped into a ring, layers as concentric bands, each ' +
          'unit a spoke at its activation. Distinctive and it makes the layer ' +
          'order meaningless — a network is a sequence and a ring says it is not.',
    draw: (g, w, h, d, C) => {
      const cx = w / 2, cy = h * 0.56, R = Math.min(w, h * 1.7) * 0.30;
      const cols = [C.cool, CAST.violet, CAST.violet, C.hot];
      for (let c = 0; c < 4; c++) {
        const r0 = R * (0.34 + c * 0.17);
        for (let i = 0; i < 18; i++) {
          const a0 = (i / 18) * Math.PI * 2, a = Math.min(1, Math.abs(LAY[c][i]));
          const len = R * 0.14 * (0.3 + a);
          g.strokeStyle = LAY[c][i] < 0 ? CAST.orange : cols[c];
          g.lineWidth = 2.4 * d; g.lineCap = 'round';
          g.beginPath();
          g.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0 * 0.55);
          g.lineTo(cx + Math.cos(a0) * (r0 + len), cy + Math.sin(a0) * (r0 + len) * 0.55);
          g.stroke();
        }
      }
      g.lineCap = 'butt';
    },
  });

  option(gd, {
    name: 'Columns of dots', size: [300, 110], verdict: 'was',
    note: 'A dot per unit at its activation. The quantity is right and the ' +
          'presentation cannot carry it: at this size a dot changing brightness ' +
          'is invisible, which is exactly why the panel read as doing nothing.',
    draw: (g, w, h, d, C) => {
      for (let c = 0; c < 4; c++)
        for (let i = 0; i < 14; i++) {
          const a = Math.abs(LAY[c][i]);
          g.fillStyle = rgba(c === 3 ? C.hot : C.ink3, 0.15 + a * 0.85);
          g.beginPath();
          g.arc(40 * d + c * 72 * d, 14 * d + i * 6.6 * d, 2.2 * d, 0, 7);
          g.fill();
        }
    },
  });

  option(gd, {
    name: 'A wired diagram', size: [300, 110], verdict: 'rejected',
    note: 'Nodes and edges, the picture everyone draws of a network. 7,958 ' +
          'weights is 7,958 lines: draw them honestly and it is a grey ' +
          'rectangle, draw a handful and it is a diagram of a network that is ' +
          'not this one.',
    draw: (g, w, h, d, C) => {
      g.strokeStyle = rgba(C.ink3, 0.10); g.lineWidth = 1;
      for (let c = 0; c < 3; c++)
        for (let i = 0; i < 14; i++)
          for (let j = 0; j < 14; j++) {
            g.beginPath();
            g.moveTo(40 * d + c * 72 * d, 14 * d + i * 6.6 * d);
            g.lineTo(40 * d + (c + 1) * 72 * d, 14 * d + j * 6.6 * d);
            g.stroke();
          }
    },
  });
  root.append(sec);
}
