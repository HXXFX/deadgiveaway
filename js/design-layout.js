/* LAYOUT INSIDE A PANEL.
 * ============================================================================
 *
 * Not where the panels sit on the screen — how the pieces sit INSIDE one.
 *
 * Every panel in this app holds three or four things at once: a graphic, a
 * label, a number, sometimes a second graphic. The box they go in is either
 * tall and narrow (the rail, about 300x250) or wide and short (the deck, about
 * 600x120), and those two shapes want opposite arrangements. Which one is
 * chosen decides whether the panel reads in a glance or has to be searched, and
 * until now that decision was made in a commit message.
 *
 * Every option here is drawn with the real content at the real panel size.
 */
import { rgba, mixHex } from './util.js';
import {
  el, option, grid, PAL, INK,
  iso, isoBox, isoPlate, isoFit,
  obl, oblBox, oblPlate, oblFit,
} from './design-bench.js';

/* the same three numbers throughout, so the arrangements are compared and not
   the data: hands has learned nothing, aim has learned most, trigger some */
const V3 = [0.0, 0.66, 0.23];
const NM3 = ['hands', 'aim', 'trigger'];
const KV = [0.05, 0.90, 0.10, 0.02];      /* it is holding A */

/* ---- pieces the arrangements share -------------------------------------- */
function keysAt(g, ox, oy, s, C, d, vals) {
  isoPlate(g, ox, oy, s, -0.3, -0.3, 3.7, 2.7, rgba(C.grid, 0.26));
  const CAPS = [[1, 0, 0], [0, 1, 1], [1, 1, 2], [2, 1, 3]];
  for (const row of [0, 1]) {
    for (const [col, r, k] of CAPS) {
      if (r !== row) continue;
      const p = vals[k], dn = 0.34 * p;
      isoBox(g, ox, oy, s, col * 1.05, 0, r * 1.05, 0.92, 0.5 - dn, 0.92,
             p > 0.5 ? C.hot : mixHex(C.grid, C.hot, 0.30 + p * 0.6), 1.1 * d);
    }
  }
}
function fanAt(g, ox, oy, s, C, d, span) {
  isoPlate(g, ox, oy, s, -0.15, -0.15, span + 0.3, 2.3, rgba(C.grid, 0.22));
  const NB = 15, bw = span / NB;
  for (let i = 0; i < NB; i++) {
    const u = (i + 0.5) / NB, x = u * span - bw * 0.42;
    const z = 0.28 + Math.pow(Math.abs(u - 0.5) * 2, 1.7) * 1.5;
    const v = Math.exp(-Math.pow((i - 7) / 3, 2));
    isoBox(g, ox, oy, s, x, 0, z, bw * 0.82, 0.1 + v * 1.8, 0.8,
           i === 7 ? C.acid : mixHex(C.grid, C.hot, 0.3 + v * 0.7), 1 * d);
  }
}
function triggerAt(g, ox, oy, s, C, d, x0, z0) {
  for (const [dx, v, col] of [[0, 0.67, C.acid], [2.4, 0.20, C.cool]]) {
    isoPlate(g, ox, oy, s, x0 + dx - 0.1, z0 - 0.1, 1.9, 1.2, rgba(C.grid, 0.24));
    isoBox(g, ox, oy, s, x0 + dx, 0, z0, 1.7, 0.12 + v * 1.7, 1.0, col, 1.1 * d);
  }
}
const cap = (g, d, C, txt, x, y, col) => {
  g.fillStyle = col || C.ink3;
  g.font = `700 ${9 * d}px ui-monospace, monospace`;
  g.fillText(txt.toUpperCase(), x, y);
};

/* ====================================================================== */
export function sectionPanelLayout(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'Layout inside a panel'));
  sec.append(el('p', 'lede',
    'Every panel holds three or four things at once, in a box that is either ' +
    'tall and narrow or wide and short — and those two shapes want opposite ' +
    'arrangements. What follows is the same content laid out several ways at the ' +
    'real size, because an arrangement that works on a sketch and fails at 110 ' +
    'pixels of height is not an arrangement.'));

  /* ------------------------------------------------------------------ */
  sec.append(el('h3', null,
    'A rail panel — 300 x 250, holding three separate readouts (its controls)'));
  const gA = grid(sec, 'tall');

  option(gA, {
    name: 'Three bands, stacked', size: [300, 250], verdict: 'in',
    note: 'Keys, mouse and trigger in three horizontal bands. Each gets the full ' +
          'width and they cannot collide. The cost is reading order: a tall panel ' +
          'is read top to bottom, so the trigger — the one thing that predicts ' +
          'whether you are about to be shot — is the last thing the eye reaches.',
    draw: (g, w, h, d, C) => {
      const B = [0.36, 0.40, 0.24];
      cap(g, d, C, 'its keys', 12 * d, 14 * d);
      cap(g, d, C, 'its mouse', 12 * d, B[0] * h + 14 * d);
      cap(g, d, C, 'its trigger', 12 * d, (B[0] + B[1]) * h + 14 * d);
      const F1 = isoFit(w * 0.66, B[0] * h - 26 * d, 3.7, 0.9, 2.7, 5 * d);
      keysAt(g, F1.ox + 8 * d, F1.oy + 24 * d, F1.s, C, d, KV);
      const F2 = isoFit(w - 24 * d, B[1] * h - 26 * d, 4.6, 1.9, 2.2, 5 * d);
      fanAt(g, F2.ox + 12 * d, F2.oy + B[0] * h + 22 * d, F2.s, C, d, 4.6);
      const F3 = isoFit(w - 24 * d, B[2] * h - 24 * d, 4.4, 1.9, 1.2, 5 * d);
      triggerAt(g, F3.ox + 12 * d, F3.oy + (B[0] + B[1]) * h + 20 * d, F3.s, C, d, 0, 0);
    },
  });

  option(gA, {
    name: 'One desk', size: [300, 250], verdict: 'best 3d',
    note: 'ALL THREE ON ONE SURFACE, as objects on a desk: keyboard at the back, ' +
          'mouse beside it, trigger in front. One scene, one light, one plate. It ' +
          'stops being three charts stacked up and becomes a picture of the thing ' +
          'holding your controls, which is what the panel is about. Everything is ' +
          'in view at once, so there is no reading order to get wrong.',
    draw: (g, w, h, d, C) => {
      const F = isoFit(w, h - 20 * d, 6.4, 2.2, 5.6, 9 * d);
      const s = F.s, ox = F.ox, oy = F.oy + 13 * d;
      isoPlate(g, ox, oy, s, -0.55, -0.55, 7.5, 6.7, rgba(C.grid, 0.20));
      keysAt(g, ox, oy, s, C, d, KV);
      /* the mouse: a body and a button, off to the right of the board */
      isoBox(g, ox, oy, s, 4.35, 0, 0.30, 1.05, 0.34, 1.45,
             mixHex(C.grid, C.hot, 0.45), 1.1 * d);
      isoBox(g, ox, oy, s, 4.52, 0.34, 0.55, 0.70, 0.16, 0.90,
             mixHex(C.grid, C.hot, 0.80), 1 * d);
      triggerAt(g, ox, oy, s, C, d, 0.2, 3.5);
      cap(g, d, C, 'keys', 12 * d, 13 * d);
      cap(g, d, C, 'mouse', w * 0.66, 13 * d);
      cap(g, d, C, 'trigger', 12 * d, h - 6 * d);
    },
  });

  option(gA, {
    name: 'Trigger first', size: [300, 250], verdict: 'best 3d',
    note: 'The same three bands with the order INVERTED — trigger at the top, ' +
          'then mouse, then keys. Fixes the one real fault of the shipping ' +
          'arrangement: what the panel is most often consulted for is now the ' +
          'first thing in it, and the keys, which change slowest, are last.',
    draw: (g, w, h, d, C) => {
      const B = [0.26, 0.38, 0.36];
      cap(g, d, C, 'its trigger', 12 * d, 14 * d, C.acid);
      cap(g, d, C, 'its mouse', 12 * d, B[0] * h + 14 * d);
      cap(g, d, C, 'its keys', 12 * d, (B[0] + B[1]) * h + 14 * d);
      const F1 = isoFit(w - 24 * d, B[0] * h - 24 * d, 4.4, 1.9, 1.2, 5 * d);
      triggerAt(g, F1.ox + 12 * d, F1.oy + 22 * d, F1.s, C, d, 0, 0);
      const F2 = isoFit(w - 24 * d, B[1] * h - 26 * d, 4.6, 1.9, 2.2, 5 * d);
      fanAt(g, F2.ox + 12 * d, F2.oy + B[0] * h + 22 * d, F2.s, C, d, 4.6);
      const F3 = isoFit(w * 0.66, B[2] * h - 26 * d, 3.7, 0.9, 2.7, 5 * d);
      keysAt(g, F3.ox + 8 * d, F3.oy + (B[0] + B[1]) * h + 24 * d, F3.s, C, d, KV);
    },
  });

  option(gA, {
    name: 'Keys big, two below', size: [300, 250], verdict: 'option',
    note: 'The keyboard takes the top half at twice the size, the mouse and ' +
          'trigger share the bottom. Right if the keys are what you watch — and ' +
          'they are the channel the model has learned LEAST, so this gives the ' +
          'most space to the least informative thing on the panel.',
    draw: (g, w, h, d, C) => {
      const F1 = isoFit(w, h * 0.54 - 20 * d, 3.7, 0.9, 2.7, 8 * d);
      keysAt(g, F1.ox, F1.oy + 18 * d, F1.s, C, d, KV);
      const F2 = isoFit(w / 2, h * 0.40 - 20 * d, 4.6, 1.9, 2.2, 6 * d);
      fanAt(g, F2.ox, F2.oy + h * 0.58, F2.s, C, d, 4.6);
      const F3 = isoFit(w / 2, h * 0.40 - 20 * d, 1.9, 1.9, 1.2, 6 * d);
      isoPlate(g, F3.ox + w / 2, F3.oy + h * 0.58, F3.s, -0.1, -0.1, 1.9, 1.2,
               rgba(C.grid, 0.24));
      isoBox(g, F3.ox + w / 2, F3.oy + h * 0.58, F3.s, 0, 0, 0, 1.7, 1.25, 1.0,
             C.acid, 1.1 * d);
      cap(g, d, C, 'keys', 12 * d, 13 * d);
      cap(g, d, C, 'mouse', 12 * d, h * 0.56);
      cap(g, d, C, 'trigger', w / 2 + 8 * d, h * 0.56);
    },
  });

  option(gA, {
    name: 'Graphics left, numbers right', size: [300, 250], verdict: 'option',
    note: 'Every graphic in a left column, every number in a right one, so the ' +
          'digits line up and can be compared down the page. Reads like a ' +
          'dashboard — which is precisely what this app has spent a month trying ' +
          'to stop looking like, and it costs the graphics a third of the width.',
    draw: (g, w, h, d, C) => {
      g.fillStyle = rgba(C.grid, 0.10);
      g.fillRect(w * 0.66, 0, w * 0.34, h);
      const F1 = isoFit(w * 0.60, h * 0.34, 3.7, 0.9, 2.7, 5 * d);
      keysAt(g, F1.ox, F1.oy + 12 * d, F1.s, C, d, KV);
      const F2 = isoFit(w * 0.60, h * 0.32, 4.6, 1.9, 2.2, 5 * d);
      fanAt(g, F2.ox, F2.oy + h * 0.36, F2.s, C, d, 4.6);
      const F3 = isoFit(w * 0.60, h * 0.28, 1.9, 1.9, 1.2, 5 * d);
      isoPlate(g, F3.ox, F3.oy + h * 0.70, F3.s, -0.1, -0.1, 1.9, 1.2, rgba(C.grid, 0.24));
      isoBox(g, F3.ox, F3.oy + h * 0.70, F3.s, 0, 0, 0, 1.7, 1.25, 1.0, C.acid, 1.1 * d);
      const rows = [['W', '5%'], ['A', '90%'], ['S', '10%'], ['D', '2%'],
                    ['aim', 'on you'], ['fire', '67%'], ['reload', '20%']];
      g.textAlign = 'right';
      rows.forEach(([k, v], i) => {
        const y = 24 * d + i * 24 * d;
        g.fillStyle = C.ink3; g.font = `${9 * d}px ui-monospace, monospace`;
        g.textAlign = 'left'; g.fillText(k, w * 0.70, y);
        g.fillStyle = C.ink; g.font = `900 ${11 * d}px ui-monospace, monospace`;
        g.textAlign = 'right'; g.fillText(v, w - 10 * d, y);
      });
      g.textAlign = 'left';
    },
  });

  /* ------------------------------------------------------------------ */
  sec.append(el('h3', null,
    'A deck panel — 600 x 120, holding three values with their names and numbers'));
  const gB = grid(sec, 'deck');
  const COLS = (C) => [C.hot, C.acid, C.cool];

  option(gB, {
    name: 'Three scenes across', size: [300, 110], verdict: 'in',
    note: 'One isometric column per value at its own screen origin, name beneath, ' +
          'number on top. Fills the width, and each third is self-contained — the ' +
          'name, the solid and the number are never more than a glance apart.',
    draw: (g, w, h, d, C) => {
      const cols = COLS(C);
      const F = isoFit(w / 3, h - 24 * d, 2.2, 3.0, 2.2, 7 * d);
      for (let i = 2; i >= 0; i--) {
        const ox = F.ox + i * (w / 3), oy = F.oy + 9 * d;
        isoPlate(g, ox, oy, F.s, -0.1, -0.1, 2.2, 2.2, rgba(C.grid, 0.34));
        const hgt = 0.14 + V3[i] * 2.6;
        isoBox(g, ox, oy, F.s, 0, 0, 0, 2.0, hgt, 2.0,
               V3[i] > 0.02 ? cols[i] : mixHex(C.grid, cols[i], 0.5), 1.1 * d);
        const t = iso(ox, oy, F.s, 1.0, hgt, 1.0);
        g.fillStyle = V3[i] > 0.02 ? cols[i] : C.ink3;
        g.font = `900 ${12 * d}px ui-monospace, monospace`;
        g.textAlign = 'center';
        g.fillText(Math.round(V3[i] * 100) + '%', t[0], t[1] - 5 * d);
        const b = iso(ox, oy, F.s, 1.0, 0, 2.4);
        g.fillStyle = C.ink3; g.font = `${9 * d}px ui-monospace, monospace`;
        g.fillText(NM3[i], b[0], b[1] + 9 * d);
        g.textAlign = 'left';
      }
    },
  });

  option(gB, {
    name: 'One cabinet run', size: [300, 110], verdict: 'best 3d',
    note: 'THE PROJECTION THAT MATCHES THE BOX. Three cabinet columns on one long ' +
          'plate. Because cabinet leaves the horizontal axis alone, the run can be ' +
          'as wide as the panel — the solids get noticeably more size than they do ' +
          'in isometric, and the three read as one measurement rather than three ' +
          'separate pictures.',
    draw: (g, w, h, d, C) => {
      const cols = COLS(C);
      const F = oblFit(w, h - 22 * d, 6.6, 2.6, 1.0, 8 * d);
      oblPlate(g, F.ox, F.oy, F.s, -0.2, 0, 7.0, 1.0, rgba(C.grid, 0.26));
      for (let i = 0; i < 3; i++) {
        const hgt = 0.16 + V3[i] * 2.3;
        oblBox(g, F.ox, F.oy, F.s, i * 2.2, 0, 0, 1.7, hgt, 1.0,
               V3[i] > 0.02 ? cols[i] : mixHex(C.grid, cols[i], 0.5), 1.2 * d);
        const t = obl(F.ox, F.oy, F.s, i * 2.2 + 0.85, hgt, 0.5);
        g.fillStyle = V3[i] > 0.02 ? cols[i] : C.ink3;
        g.font = `900 ${13 * d}px ui-monospace, monospace`;
        g.textAlign = 'center';
        g.fillText(Math.round(V3[i] * 100) + '%', t[0], t[1] - 6 * d);
        const b = obl(F.ox, F.oy, F.s, i * 2.2 + 0.85, 0, 0);
        g.fillStyle = C.ink3; g.font = `${9 * d}px ui-monospace, monospace`;
        g.fillText(NM3[i], b[0], b[1] + 12 * d);
        g.textAlign = 'left';
      }
    },
  });

  option(gB, {
    name: 'One tall, two small', size: [300, 110], verdict: 'best 3d',
    note: 'The value worth watching drawn at twice the size, the other two beside ' +
          'it. The only arrangement here that SAYS WHICH ONE TO LOOK AT, which no ' +
          'equal-thirds layout can — at the price of hard-coding an opinion about ' +
          'which one that is. Aim is drawn large here because it is the channel ' +
          'the model actually learns.',
    draw: (g, w, h, d, C) => {
      const cols = COLS(C);
      const F = oblFit(w, h - 20 * d, 6.4, 2.6, 1.0, 8 * d);
      oblPlate(g, F.ox, F.oy, F.s, -0.2, 0, 6.8, 1.0, rgba(C.grid, 0.26));
      oblBox(g, F.ox, F.oy, F.s, 0, 0, 0, 2.9, 0.16 + V3[1] * 2.3, 1.0, cols[1], 1.2 * d);
      oblBox(g, F.ox, F.oy, F.s, 3.3, 0, 0, 1.4, 0.16 + V3[0] * 2.3, 1.0,
             mixHex(C.grid, cols[0], 0.5), 1.1 * d);
      oblBox(g, F.ox, F.oy, F.s, 5.0, 0, 0, 1.4, 0.16 + V3[2] * 2.3, 1.0, cols[2], 1.1 * d);
      const t = obl(F.ox, F.oy, F.s, 1.45, 0.16 + V3[1] * 2.3, 0.5);
      g.textAlign = 'center';
      g.fillStyle = cols[1]; g.font = `900 ${20 * d}px ui-monospace, monospace`;
      g.fillText('66%', t[0], t[1] - 7 * d);
      g.font = `${9 * d}px ui-monospace, monospace`; g.fillStyle = C.ink3;
      g.fillText('aim', t[0], h - 5 * d);
      g.fillText('hands', obl(F.ox, F.oy, F.s, 4.0, 0, 0)[0], h - 5 * d);
      g.fillText('trigger', obl(F.ox, F.oy, F.s, 5.7, 0, 0)[0], h - 5 * d);
      g.textAlign = 'left';
    },
  });

  option(gB, {
    name: 'Graphic left, ledger right', size: [300, 110], verdict: 'option',
    note: 'The scene takes the left two thirds and the numbers stack in a column ' +
          'on the right. Best of the set for comparing the three numbers to each ' +
          'other; worst for tying a number to its own solid, because they are now ' +
          'the width of the panel apart.',
    draw: (g, w, h, d, C) => {
      const cols = COLS(C);
      const F = oblFit(w * 0.62, h - 16 * d, 4.6, 2.6, 1.0, 7 * d);
      oblPlate(g, F.ox, F.oy, F.s, -0.2, 0, 5.0, 1.0, rgba(C.grid, 0.26));
      for (let i = 0; i < 3; i++)
        oblBox(g, F.ox, F.oy, F.s, i * 1.5, 0, 0, 1.2, 0.16 + V3[i] * 2.3, 1.0,
               V3[i] > 0.02 ? cols[i] : mixHex(C.grid, cols[i], 0.5), 1.2 * d);
      g.fillStyle = rgba(C.grid, 0.12);
      g.fillRect(w * 0.64, 0, w * 0.36, h);
      for (let i = 0; i < 3; i++) {
        const y = 28 * d + i * 26 * d;
        g.fillStyle = C.ink3; g.font = `${9 * d}px ui-monospace, monospace`;
        g.textAlign = 'left'; g.fillText(NM3[i], w * 0.68, y);
        g.fillStyle = cols[i]; g.font = `900 ${14 * d}px ui-monospace, monospace`;
        g.textAlign = 'right'; g.fillText(Math.round(V3[i] * 100) + '%', w - 10 * d, y);
      }
      g.textAlign = 'left';
    },
  });

  option(gB, {
    name: 'Labels above, scene below', size: [300, 110], verdict: 'rejected',
    note: 'A header row of names and numbers with the graphic underneath. The ' +
          'numbers become easy and the graphic gets what is left — about fifty ' +
          'pixels — which is not enough for a solid to have three visible sides ' +
          'at all. It turns a 3-D panel back into a bar chart with a hat on.',
    draw: (g, w, h, d, C) => {
      const cols = COLS(C);
      for (let i = 0; i < 3; i++) {
        const x = 14 * d + i * (w - 28 * d) / 3;
        g.fillStyle = C.ink3; g.font = `${9 * d}px ui-monospace, monospace`;
        g.fillText(NM3[i].toUpperCase(), x, 16 * d);
        g.fillStyle = cols[i]; g.font = `900 ${16 * d}px ui-monospace, monospace`;
        g.fillText(Math.round(V3[i] * 100) + '%', x, 36 * d);
      }
      const F = oblFit(w, h * 0.40, 6.6, 1.6, 0.8, 8 * d);
      oblPlate(g, F.ox, F.oy + h * 0.58, F.s, -0.2, 0, 7.0, 0.8, rgba(C.grid, 0.26));
      for (let i = 0; i < 3; i++)
        oblBox(g, F.ox, F.oy + h * 0.58, F.s, i * 2.2, 0, 0, 1.7,
               0.12 + V3[i] * 1.4, 0.8, cols[i], 1 * d);
    },
  });
  root.append(sec);
}
