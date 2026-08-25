/* WHAT IT SEES, IN THREE DIMENSIONS.
 * ============================================================================
 *
 * The last flat panel. It is also the most honest one in the app — it is not a
 * picture ABOUT the observation, it is the observation: sixteen distance rays
 * cast from the body, where you are relative to it, whether the line is clear,
 * and a handful of scalars. Any redesign has to keep that property, because the
 * panel's whole value is that what is drawn is what the policy is handed.
 *
 * WHAT IS IN THE VECTOR, and what each option chooses to show:
 *
 *   [0..15]  sixteen ray distances, 0 = solid at the muzzle, 1 = nothing for
 *            twenty metres. This is the bulk of it and the part with a shape.
 *   [16..18] where you are: offset x, offset z, distance
 *   [21]     is the line clear
 *   [22]     how long it has been clear
 *   [25]     its own health
 *   [30..32] incoming fire
 *   [33]     how far off target it is pointing
 *
 * THE TRAP THIS PANEL SETS, worth writing down because the shipping version
 * fell into it: the USEFUL ray is the LONG one — the direction it could actually
 * shoot down. The flat version drew openness by fading toward the panel's text
 * colour, so the most useful directions were the faintest marks in the panel.
 * Any option here has to make open loud.
 */
import { rgba, mixHex } from './util.js';
import {
  el, option, grid, CAST, dim, INK,
  iso, isoBox, isoPlate, isoFit,
  obl, oblBox, oblPlate, oblFit,
} from './design-bench.js';

/* one plausible frame of the observation, so every option draws the same state
   and what is compared is the presentation. A corridor: open ahead and behind,
   walls close on both sides, the player forward and slightly left, line clear. */
const RAYS = 16;
const OBS = (() => {
  const r = [];
  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * Math.PI * 2;
    /* short across the corridor, long along it */
    const v = 0.16 + 0.80 * Math.pow(Math.abs(Math.cos(a)), 2.2);
    r.push(Math.min(1, v * (0.85 + 0.3 * Math.sin(i * 2.7))));
  }
  return r;
})();
const YOU = { dx: 0.62, dz: -0.28, dist: 0.34, line: true };

export function sectionSees(root) {
  const sec = el('section', 'dsec');
  sec.append(el('h2', 'hm', 'What it sees'));
  sec.append(el('p', 'lede',
    'Sixteen distance rays and where you are, which is most of the thirty-six ' +
    'numbers the policy is handed. This panel is not a picture ABOUT the ' +
    'observation — it IS the observation, and every option has to keep that. ' +
    'The trap: the USEFUL ray is the LONG one, the direction it could actually ' +
    'shoot down, so anything that draws openness as absence gets it backwards.'));
  const gd = grid(sec, 'tall');

  option(gd, {
    name: 'The room it sees', size: [300, 150], verdict: 'best 3d',
    note: 'THE RAYS BUILT BACK INTO WALLS. Each one puts a block where it ' +
          'stopped, so the sixteen distances become the room the Mirror believes ' +
          'it is standing in — with itself in the middle and you where it thinks ' +
          'you are. Nothing else here lets you check its model against the arena ' +
          'above by looking at both.',
    draw: (g, w, h, d, C) => {
      const R = 3.1;
      const F = isoFit(w, h - 12 * d, R * 2 + 1.4, 1.5, R * 2 + 1.4, 8 * d);
      const s = F.s, ox = F.ox + (R + 0.7) * 0, oy = F.oy;
      const cx = R + 0.7, cz = R + 0.7;
      isoPlate(g, ox, oy, s, 0, 0, R * 2 + 1.4, R * 2 + 1.4, rgba(C.grid, 0.30));
      /* far walls first: sort the rays by projected depth */
      const idx = [...Array(RAYS).keys()].sort((a, b) => {
        const aa = (a / RAYS) * Math.PI * 2, bb = (b / RAYS) * Math.PI * 2;
        return (Math.cos(aa) + Math.sin(aa)) - (Math.cos(bb) + Math.sin(bb));
      });
      for (const i of idx) {
        const a = (i / RAYS) * Math.PI * 2, v = OBS[i];
        const x = cx + Math.cos(a) * R * v, z = cz + Math.sin(a) * R * v;
        /* A WALL IS A WALL WHATEVER ITS DISTANCE. Height varied with proximity
           at first, which encodes the distance twice — once in where the block
           stands and again in how tall it is — and the second encoding wins:
           a far wall came out as a chip on an empty floor and the room read as
           mostly nothing. The blocks are one height now and only their POSITION
           carries the reading, which is the whole idea of the option. */
        const close = 1 - v;
        isoBox(g, ox, oy, s, x - 0.26, 0, z - 0.26, 0.52, 0.78, 0.52,
               close > 0.55 ? CAST.red : mixHex(CAST.gold, CAST.red, close), 1 * d);
      }
      /* the two bodies */
      isoBox(g, ox, oy, s, cx - 0.24, 0, cz - 0.24, 0.48, 0.85, 0.48, CAST.red, 1.2 * d);
      const px2 = cx + YOU.dx * R, pz2 = cz + YOU.dz * R;
      isoBox(g, ox, oy, s, px2 - 0.24, 0, pz2 - 0.24, 0.48, 0.85, 0.48,
             CAST.blue, 1.2 * d);
      /* and the line between them, drawn on the floor */
      const a1 = iso(ox, oy, s, cx, 0.04, cz), b1 = iso(ox, oy, s, px2, 0.04, pz2);
      g.strokeStyle = YOU.line ? CAST.bone : rgba(CAST.bone, 0.28);
      g.lineWidth = 2 * d;
      if (!YOU.line) g.setLineDash([4 * d, 4 * d]);
      g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(b1[0], b1[1]); g.stroke();
      g.setLineDash([]);
    },
  });

  option(gd, {
    name: 'A crown of pillars', size: [300, 150], verdict: 'best 3d',
    note: 'Sixteen pillars in a ring, and HEIGHT IS OPENNESS — a tall pillar is ' +
          'a direction it could shoot down, a stub is a wall in its face. Reads ' +
          'as one object rather than a diagram, and it gets the polarity right: ' +
          'the useful directions are the loud ones.',
    draw: (g, w, h, d, C) => {
      const R = 2.3;
      const F = isoFit(w, h - 12 * d, R * 2 + 1.0, 2.4, R * 2 + 1.0, 8 * d);
      const s = F.s, ox = F.ox, oy = F.oy;
      const cx = R + 0.5, cz = R + 0.5;
      isoPlate(g, ox, oy, s, 0, 0, R * 2 + 1.0, R * 2 + 1.0, rgba(C.grid, 0.30));
      const idx = [...Array(RAYS).keys()].sort((a, b) => {
        const aa = (a / RAYS) * Math.PI * 2, bb = (b / RAYS) * Math.PI * 2;
        return (Math.cos(aa) + Math.sin(aa)) - (Math.cos(bb) + Math.sin(bb));
      });
      for (const i of idx) {
        const a = (i / RAYS) * Math.PI * 2, v = OBS[i];
        const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
        isoBox(g, ox, oy, s, x - 0.20, 0, z - 0.20, 0.40, 0.14 + v * 1.9, 0.40,
               v > 0.55 ? CAST.gold : mixHex(CAST.red, CAST.gold, v / 0.55), 1 * d);
      }
      isoBox(g, ox, oy, s, cx - 0.26, 0, cz - 0.26, 0.52, 0.9, 0.52, CAST.red, 1.2 * d);
      const px2 = cx + YOU.dx * R * 0.8, pz2 = cz + YOU.dz * R * 0.8;
      isoBox(g, ox, oy, s, px2 - 0.22, 0, pz2 - 0.22, 0.44, 0.8, 0.44,
             CAST.blue, 1.2 * d);
    },
  });

  option(gd, {
    name: 'A radar dome', size: [300, 150], verdict: '3d',
    note: 'The rays as fins on a turning dome, longest where it can see furthest. ' +
          'The most immediately readable as "sensing" and the least like anything ' +
          'else in this game — a dome is machinery, and the Mirror is a body.',
    draw: (g, w, h, d, C) => {
      const cx = w / 2, cy = h * 0.60, R = Math.min(w * 0.30, h * 0.48);
      for (let i = 0; i < RAYS; i++) {
        const a = (i / RAYS) * Math.PI * 2, v = OBS[i];
        const x0 = cx + Math.cos(a) * R * 0.30, y0 = cy + Math.sin(a) * R * 0.30 * 0.55;
        const x1 = cx + Math.cos(a) * R * (0.30 + v * 0.70);
        const y1 = cy + Math.sin(a) * R * (0.30 + v * 0.70) * 0.55;
        g.beginPath();
        g.moveTo(x0, y0); g.lineTo(x1, y1);
        g.lineTo(x1, y1 - (6 + v * 22) * d); g.lineTo(x0, y0 - (6 + v * 22) * d);
        g.closePath();
        g.fillStyle = v > 0.55 ? CAST.gold : mixHex(CAST.red, CAST.gold, v / 0.55);
        g.fill();
        g.strokeStyle = INK; g.lineWidth = 1 * d; g.stroke();
      }
      g.beginPath();
      g.ellipse(cx, cy, R * 0.30, R * 0.30 * 0.55, 0, 0, 7);
      g.fillStyle = CAST.red; g.fill();
      g.strokeStyle = INK; g.lineWidth = 1.3 * d; g.stroke();
    },
  });

  option(gd, {
    name: 'The whole vector', size: [300, 150], verdict: '3d',
    note: 'ALL THIRTY-SIX NUMBERS as a cabinet run — the rays, then where you ' +
          'are, then the scalars, in the order the policy receives them. The ' +
          'most honest thing that could go in this panel and the least ' +
          'legible: it shows everything and explains nothing.',
    draw: (g, w, h, d, C) => {
      const N = 36;
      const vals = [];
      for (let i = 0; i < RAYS; i++) vals.push(OBS[i]);
      vals.push(YOU.dx, YOU.dz, YOU.dist, 0.3, -0.2, 1, 0.6, 0.2, 0.8, -0.4,
                0.9, 0.1, 0.5, -0.3, 0.7, 0.25, 0.45, -0.15, 0.35, 0.6);
      const F = oblFit(w, h - 16 * d, N * 0.30, 2.4, 1.0, 8 * d);
      oblPlate(g, F.ox, F.oy, F.s, -0.15, 0, N * 0.30 + 0.2, 1.0, rgba(C.grid, 0.30));
      for (let i = 0; i < N; i++) {
        const v = vals[i] === undefined ? 0 : vals[i];
        const a = Math.min(1, Math.abs(v));
        oblBox(g, F.ox, F.oy, F.s, i * 0.30, 0, 0, 0.23, 0.12 + a * 2.1, 1.0,
               i < RAYS ? CAST.gold : (v < 0 ? CAST.red : CAST.blue), 0.85 * d);
      }
    },
  });

  option(gd, {
    name: 'The corridor between you', size: [300, 150], verdict: 'option',
    note: 'Only the thing the fight turns on: the lane from it to you, drawn as ' +
          'a floor with walls where the rays block it, and lit when the shot is ' +
          'available. Answers "can it shoot me" in one look and throws away ' +
          'fifteen of the sixteen rays to do it.',
    draw: (g, w, h, d, C) => {
      const F = isoFit(w, h - 14 * d, 6.0, 1.6, 3.0, 8 * d);
      const s = F.s, ox = F.ox, oy = F.oy;
      isoPlate(g, ox, oy, s, 0, 0.9, 6.0, 1.2,
               YOU.line ? rgba(CAST.gold, 0.34) : rgba(C.grid, 0.30));
      /* the walls either side, at the ray distances across the lane */
      for (let i = 0; i < 7; i++) {
        const vA = OBS[(i + 4) % RAYS], vB = OBS[(i + 12) % RAYS];
        isoBox(g, ox, oy, s, i * 0.85, 0, 0.9 - 0.5 * vA, 0.7, 0.20 + (1 - vA) * 1.1, 0.35,
               CAST.red, 0.9 * d);
        isoBox(g, ox, oy, s, i * 0.85, 0, 2.1 + 0.5 * vB, 0.7, 0.20 + (1 - vB) * 1.1, 0.35,
               CAST.red, 0.9 * d);
      }
      isoBox(g, ox, oy, s, 0.1, 0, 1.25, 0.5, 0.9, 0.5, CAST.red, 1.2 * d);
      isoBox(g, ox, oy, s, 5.2, 0, 1.25, 0.5, 0.9, 0.5, CAST.blue, 1.2 * d);
      if (YOU.line) {
        const a1 = iso(ox, oy, s, 0.35, 0.5, 1.5), b1 = iso(ox, oy, s, 5.2, 0.5, 1.5);
        g.strokeStyle = CAST.bone; g.lineWidth = 2.4 * d;
        g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(b1[0], b1[1]); g.stroke();
      }
    },
  });

  option(gd, {
    name: 'Flat rays', size: [300, 150], verdict: 'in',
    note: 'What ships. Sixteen lines from the body at their measured lengths, ' +
          'with the readings beside them. Accurate, compact, and the only panel ' +
          'left that does not look like the game it is in.',
    draw: (g, w, h, d, C) => {
      const cx = w * 0.30, cy = h / 2, R = Math.min(w * 0.24, h * 0.40);
      g.strokeStyle = rgba(C.grid, 0.5); g.lineWidth = 1 * d;
      g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
      for (let i = 0; i < RAYS; i++) {
        const a = (i / RAYS) * Math.PI * 2, v = OBS[i];
        const ex = cx + Math.cos(a) * R * v, ey = cy + Math.sin(a) * R * v;
        const near = 1 - v;
        g.strokeStyle = near > 0.5 ? mixHex(CAST.red, CAST.gold, (1 - near) * 2)
                                   : mixHex(CAST.gold, CAST.blue, (0.5 - near) * 2);
        g.lineWidth = (1.2 + near * 2.4) * d;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
      }
      g.fillStyle = CAST.red;
      g.beginPath(); g.arc(cx, cy, 4.2 * d, 0, 7); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1.2 * d; g.stroke();
      const rows = [['range to you', '13.1 m'], ['can it shoot you', 'yes'],
                    ['line open for', '1.2 s'], ['off target by', '6°']];
      rows.forEach(([k, v], i) => {
        const y = 26 * d + i * 18 * d;
        g.fillStyle = C.ink3; g.font = `${9 * d}px ui-monospace, monospace`;
        g.fillText(k, w * 0.54, y);
        g.fillStyle = C.ink; g.font = `900 ${11 * d}px ui-monospace, monospace`;
        g.textAlign = 'right'; g.fillText(v, w - 10 * d, y); g.textAlign = 'left';
      });
    },
  });
  root.append(sec);
}
