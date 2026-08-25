/* THE VISUALISATION HALF — rebuilt for the blank slate.
 *
 * The old panels drew a machine that no longer exists: a gate, a prediction
 * error, a style channel of counted habits, a weight count from an aim net. All
 * of it described a bot whose tactics were hand-written and whose "learning" set
 * their dials. Drawing it beautifully was part of how the wrong design survived
 * six weeks — the panels agreed with themselves every frame.
 *
 * What is here now is the shape of the real thing, in order:
 *
 *   ITS EYES     the 34 numbers it is actually given, sixteen of them rays
 *   ITS HANDS    the six decisions it makes, as probabilities, live
 *   FROM YOU     how much of each it has taken, against a control that
 *                needed no learning at all
 *   THE POLICY   the one net, and what is firing in it right now
 *   THE LEDGER   frames watched, and the kill ledger the whole game turns on
 *
 * Nothing here is a stand-in and nothing is smoothed to look better. Where a
 * number can be flattered by its baseline, the baseline is drawn next to it.
 */
import { FOE, WORLD, MAG } from './config.js';
import { tok, mixHex, rgba, fitCanvas, clamp, hex2rgb } from './util.js';
import { RAYS, RAY_MAX, OBS, NET, ACT, sig, agentScore } from './agent.js';
import { rehearsalView } from './practice.js';
import { CAST, dim, INK, iso, isoBox, isoPlate, isoFit,
         obl, oblBox, oblPlate, oblFit } from './viz3d.js';

const $ = (id) => document.getElementById(id);
const WORLDX = WORLD.AX, WORLDZ = WORLD.AZ;
const WEIGHTS = NET.IN * NET.H1 + NET.H1 + NET.H1 * NET.H2 + NET.H2 +
                NET.H2 * NET.OUT + NET.OUT;

export function initHud() {
  const b = $('brainN'); if (b) b.textContent = WEIGHTS.toLocaleString() + ' weights';
  const sn = $('senseN'); if (sn) sn.textContent = OBS + ' numbers, live';
}

/* Canvas text inherits nothing from the stylesheet, so every size, weight and
   colour is written out here. Labels uppercase and tracked; numbers worth
   reading in the heavy display face, with the hard shadow the app has. */
const LBL = 11, VAL = 13, HED = 11;
function px(d, n) { return n * d; }
const MONO = 'ui-monospace, Consolas, monospace';
const DISPLAY = '"Arial Black","Haettenschweiler",Impact,"Franklin Gothic Heavy",sans-serif';
function setFont(g, d, size, weight, display) {
  g.font = `${display ? 900 : (weight || 700)} ${px(d, size)}px ${display ? DISPLAY : MONO}`;
  try { g.letterSpacing = display ? '0px' : px(d, 0.6) + 'px'; } catch (e) { /* older engine */ }
}
function text(g, d, str, x, y, col, size, weight, align) {
  g.fillStyle = col; g.textAlign = align || 'left';
  setFont(g, d, size, weight);
  g.fillText(str, x, y);
}
function label(g, d, str, x, y, col, size, align) {
  text(g, d, String(str).toUpperCase(), x, y, col, size || LBL, 700, align);
}
function bigNum(g, d, str, x, y, col, size, align) {
  g.textAlign = align || 'left';
  setFont(g, d, size, 900, true);
  g.fillStyle = tok('shadow');
  g.fillText(str, x + px(d, 2), y + px(d, 2));
  g.fillStyle = col;
  g.fillText(str, x, y);
}
function block(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }

/* the panel palette, read once per draw so a theme change lands everywhere */
function palette() {
  return {
    ink: tok('ink'), ink2: tok('ink-2'), ink3: tok('ink-3'),
    hot: tok('hot'), acid: tok('acid'), body: tok('body'), grid: tok('panel-line'),
    cool: tok('cool'), good: tok('good'), warm: tok('warm'), blood: tok('blood'),
    panel: tok('panel'), panel2: tok('panel-2'), line: tok('line'), stage: tok('stage'),
  };
}
/* The drawing bench lives in viz3d.js, shared with the design sheet, so what is
   argued about on the sheet and what is drawn here are the same code. `isoPt` is
   the old local name for the projector; kept as an alias because a dozen call
   sites read better with it. */
const isoPt = iso;
const ISO_INK = INK;

const empty = (g, d, w, h, msg) => {
  label(g, d, msg, w / 2, h / 2, tok('ink-3'), LBL, 'center');
};

/* ---- 1. ITS EYES ---------------------------------------------------------
 * The sixteen rays, drawn from the body outward, exactly as the policy receives
 * them. This is the single most honest panel in the app: it is not a picture OF
 * the input, it IS the input, sixteen numbers between nought and one.
 *
 * A player watching this can see the thing that was invisible for six weeks —
 * whether the Mirror can perceive what it is being asked to react to.
 */
export function drawSense(game) {
  const c = $('cSense'); if (!c) return;
  const { w, h, d } = fitCanvas(c);
  const P = palette();
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  const obs = game.obsIt;
  const f = game.foes.find((q) => !q.dead);
  if (!obs || !f) return empty(g, d, w, h, 'no body to look through yet');

  /* THE INSTRUMENT.
   * ==========================================================================
   *
   * A dome on a cabinet base, and the panel is that one object.
   *
   * WHAT THE REDESIGN ACTUALLY REMOVED, because this is the whole of it: the
   * dome sat in half the panel with a column of six readings beside it, and
   * THREE OF THE SIX WERE THINGS THE DOME ALREADY SHOWED. "Range to you" is how
   * far the mark is from the hub. "Can it shoot you" is whether the line to it
   * is solid or dashed. "Off target by" is the angle between the facing spoke
   * and that mark. Printing them again in words is the panel not trusting its
   * own picture — the same fault the "become you" card had when it carried three
   * meters under a scene that already showed all three.
   *
   * So the dome gets the width back and grows by about half, and the two
   * readings it genuinely cannot carry — how long the line has been open, and
   * whether anything is in the air at it — are ENGRAVED ON THE BASE rather than
   * floating beside it. Its health is already in the header on both sides; a
   * third copy is not a readout, it is noise.
   *
   * The polarity rule from the sheet still holds and is the reason the fins are
   * coloured the way they are: the useful ray is the LONG one, the direction it
   * could actually shoot down, so open is gold and blocked is red. An earlier
   * version faded openness toward the panel's text colour and made the most
   * useful directions the faintest marks on the screen.
   */
  /* THE DOME IS SIZED FROM WHAT IT ACTUALLY OCCUPIES, which is not a circle.
     Tipped away by SQ it is only 0.55 as tall as it is wide, and the fins stand
     UP from it, so its drawn extent is (R x SQ) below the centre and (R x SQ +
     the tallest fin) above. Sizing it as though it were round left a third of
     the panel empty over the top of it — measured, the drawn content began 88
     pixels down a 247-pixel canvas. */
  const BASE_H = Math.min(px(d, 34), h * 0.24);
  const domeH = h - BASE_H;
  const SQ = 0.55;                       /* how far the dome is tipped away */
  const RISE = px(d, 24);                /* the tallest a fin can stand */
  const R = Math.min(w * 0.40, (domeH - RISE - px(d, 8)) / (SQ * 2));
  const cx = w * 0.5;
  /* centred on what it occupies rather than on its own radius */
  const cy = px(d, 4) + RISE + R * SQ;

  /* ---- the fins: far side first so the near ones overlap them ---- */
  const order = [...Array(RAYS).keys()].sort((i, j) =>
    Math.sin((i / RAYS) * Math.PI * 2) - Math.sin((j / RAYS) * Math.PI * 2));
  for (const i of order) {
    const a2 = (i / RAYS) * Math.PI * 2;
    const v = clamp(obs[i], 0, 1);
    const x0 = cx + Math.cos(a2) * R * 0.30, y0 = cy + Math.sin(a2) * R * 0.30 * SQ;
    const x1 = cx + Math.cos(a2) * R * (0.30 + v * 0.70);
    const y1 = cy + Math.sin(a2) * R * (0.30 + v * 0.70) * SQ;
    const rise = px(d, 4) + v * (RISE - px(d, 4));
    /* the fin: a face and a lit top edge, the jacket-and-trim pairing again */
    g.beginPath();
    g.moveTo(x0, y0); g.lineTo(x1, y1);
    g.lineTo(x1, y1 - rise); g.lineTo(x0, y0 - rise);
    g.closePath();
    g.fillStyle = v > 0.55 ? CAST.gold : mixHex(CAST.red, CAST.gold, v / 0.55);
    g.fill();
    g.strokeStyle = INK; g.lineWidth = 1 * d; g.stroke();
    g.beginPath();
    g.moveTo(x0, y0 - rise); g.lineTo(x1, y1 - rise);
    g.strokeStyle = v > 0.55 ? CAST.bone : rgba(CAST.bone, 0.4);
    g.lineWidth = 1.4 * d; g.stroke();
  }

  /* ---- the hub, and the way it is pointing ---- */
  g.beginPath();
  g.ellipse(cx, cy, R * 0.30, R * 0.30 * SQ, 0, 0, 7);
  g.fillStyle = CAST.red; g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.4 * d; g.stroke();
  const hx = obs[28], hz = obs[29], hl = Math.hypot(hx, hz) || 1;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + hx / hl * R * 0.66, cy + hz / hl * R * 0.66 * SQ);
  g.strokeStyle = CAST.bone; g.lineWidth = 2.4 * d; g.lineCap = 'round';
  g.stroke(); g.lineCap = 'butt';

  /* ---- and you, with the range read off the line itself ---- */
  const px2 = cx + obs[16] * R * 1.45, pz2 = cy + obs[17] * R * 1.45 * SQ;
  const clear = obs[21] > 0.5;
  g.strokeStyle = clear ? CAST.bone : rgba(CAST.bone, 0.30);
  g.lineWidth = clear ? 2 * d : 1.6 * d;
  if (!clear) g.setLineDash([3 * d, 3 * d]);
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(px2, pz2); g.stroke();
  g.setLineDash([]);
  g.beginPath();
  g.ellipse(px2, pz2, 5 * d, 5 * d * SQ, 0, 0, 7);
  g.fillStyle = CAST.blue; g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.3 * d; g.stroke();
  /* the distance, ON the line, which is where the eye already is */
  label(g, d, (obs[18] * RAY_MAX).toFixed(1) + ' m',
        (cx + px2) / 2, (cy + pz2) / 2 - px(d, 5),
        clear ? CAST.bone : P.ink3, 9, 'center');

  /* ---- the base: a cabinet slab with the two remaining readings on it ---- */
  const F = oblFit(w, BASE_H, 8.0, 1.0, 0.7, px(d, 3));
  const bx = F.ox, by = F.oy + domeH;
  oblBox(g, bx, by, F.s, 0, 0, 0, 8.0, 1.0, 0.7, dim(CAST.bone, 0.88), 1.2 * d);

  /* how long the line has been open, as a bar cut into the face */
  const openFor = clamp((obs[22] * 2) / 2, 0, 1);
  const b0 = obl(bx, by, F.s, 0.35, 0.24, 0);
  const b1 = obl(bx, by, F.s, 3.4, 0.62, 0);
  g.fillStyle = rgba(INK, 0.6);
  g.fillRect(b0[0], b1[1], b1[0] - b0[0], b0[1] - b1[1]);
  g.fillStyle = clear ? CAST.gold : dim(CAST.gold);
  g.fillRect(b0[0], b1[1], (b1[0] - b0[0]) * Math.max(0.02, openFor), b0[1] - b1[1]);
  g.strokeStyle = INK; g.lineWidth = 1 * d;
  g.strokeRect(b0[0], b1[1], b1[0] - b0[0], b0[1] - b1[1]);
  label(g, d, clear ? 'line open ' + (obs[22] * 2).toFixed(1) + ' s' : 'no line',
        b0[0] + px(d, 3), b0[1] - px(d, 3), clear ? INK : P.ink2, 9);

  /* and the lamp: something in the air at it */
  const hot2 = obs[30] > 0.5;
  const lc = obl(bx, by, F.s, 5.1, 0.43, 0.35);
  g.beginPath();
  g.ellipse(lc[0], lc[1], px(d, 7), px(d, 7), 0, 0, 7);
  g.fillStyle = hot2 ? CAST.red : dim(CAST.red, 0.9);
  g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.2 * d; g.stroke();
  if (hot2) {
    g.beginPath();
    g.ellipse(lc[0] - px(d, 2), lc[1] - px(d, 2), px(d, 2.4), px(d, 2.4), 0, 0, 7);
    g.fillStyle = rgba('#ffffff', 0.5); g.fill();
  }
  label(g, d, hot2 ? 'incoming' : 'nothing incoming',
        lc[0] + px(d, 11), lc[1] + px(d, 3), hot2 ? CAST.red : P.ink3, 9);
}

/* ---- 2. ITS HANDS --------------------------------------------------------
 * Six decisions, every frame: four keys, a mouse turn, a trigger. The bars are
 * PROBABILITIES, not states, because that is what the policy produces and what
 * the rollout samples — reading them as on/off is precisely the mistake that
 * once froze the Mirror on the spot for ten minutes.
 */
export function drawLoop(game) {
  const c = $('cLoop'); if (!c) return;
  const { w, h, d } = fitCanvas(c);
  const P = palette();
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  const A = game.lastAct;
  if (!A) return empty(g, d, w, h, 'it has not moved yet');
  const f = game.foes.find((q) => !q.dead);
  const obs = game.obsIt;

  /* ONE DESK.
   *
   * Chosen off the design sheet. This panel held three stacked charts — keys,
   * mouse, trigger — and three charts stacked up is what it looked like. It is
   * one surface now, with the controls on it as objects: the keyboard at the
   * back, the mouse beside it, the trigger and the reload in front.
   *
   * Two things that arrangement buys and the stack could not. There is no
   * READING ORDER to get wrong — the old layout put the trigger, the one
   * readout that predicts whether you are about to be shot, at the bottom of a
   * panel read top to bottom. And it stops being a diagram about the Mirror and
   * becomes a picture of the thing holding your controls, which is the sentence
   * the whole panel exists to make.
   */
  const F = isoFit(w, h - px(d, 22), 6.4, 2.2, 5.6, px(d, 9));
  const s = F.s, ox = F.ox, oy = F.oy + px(d, 14);
  isoPlate(g, ox, oy, s, -0.55, -0.55, 7.5, 6.7, rgba(P.grid, 0.30));

  /* the keyboard, at the back. A held key is a key that is DOWN. */
  isoPlate(g, ox, oy, s, -0.3, -0.3, 3.7, 2.7, rgba(P.grid, 0.34));
  const CAPS = [['W', 1, 0, 0], ['A', 0, 1, 1], ['S', 1, 1, 2], ['D', 2, 1, 3]];
  for (const row of [0, 1]) {
    for (const [name, col, r, k] of CAPS) {
      if (r !== row) continue;
      const p = clamp(A.keyP[k], 0, 1);
      const down = 0.34 * p;
      isoBox(g, ox, oy, s, col * 1.05, 0, r * 1.05, 0.92, 0.5 - down, 0.92,
             p > 0.5 ? CAST.red : dim(CAST.red), 1.1 * d);
      const t = isoPt(ox, oy, s, col * 1.05 + 0.46, 0.5 - down, r * 1.05 + 0.46);
      text(g, d, name, t[0], t[1] + px(d, 3),
           p > 0.5 ? P.ink : P.ink3, 10, 900, 'center');
    }
  }

  /* the mouse, beside it: the body turns to where it is pointing */
  const offDeg = (obs ? obs[33] / 3 : 0) * 57.3;
  const lean = clamp(offDeg / 45, -1, 1) * 0.42;
  isoBox(g, ox, oy, s, 4.35, 0, 0.30 + lean, 1.05, 0.34, 1.45,
         dim(CAST.gold, 0.5), 1.1 * d);
  isoBox(g, ox, oy, s, 4.52, 0.34, 0.55 + lean, 0.70, 0.16, 0.90,
         Math.abs(offDeg) < 12 ? CAST.gold : dim(CAST.gold, 0.3), 1 * d);
  /* every direction it weighed, as a fan of marks on the desk in front of it */
  if (A.aimP) {
    for (let i = 0; i < A.aimP.length; i++) {
      const u = (i + 0.5) / A.aimP.length;
      const v = clamp(A.aimP[i], 0, 1);
      isoBox(g, ox, oy, s, 4.15 + u * 1.5, 0, 2.05, 0.09, 0.05 + v * 0.95, 0.32,
             i === A.aimBin ? CAST.gold : dim(CAST.gold, 0.4), 0.8 * d);
    }
  }

  /* and the two triggers, nearest the viewer */
  const loading = !!(f && f.reloadUntil > game.now);
  const bars = [
    [0.2, clamp(A.fireP, 0, 1), CAST.orange, 'fire'],
    [2.6, clamp(A.reloadP === undefined ? 0 : A.reloadP, 0, 1),
     loading ? CAST.blue : dim(CAST.blue, 0.35), 'reload'],
  ];
  for (const [x0, v, col, name] of bars) {
    isoPlate(g, ox, oy, s, x0 - 0.1, 3.4, 1.9, 1.2, rgba(P.grid, 0.34));
    isoBox(g, ox, oy, s, x0, 0, 3.5, 1.7, 0.12 + v * 1.7, 1.0, col, 1.1 * d);
    const t = isoPt(ox, oy, s, x0 + 0.85, 0.12 + v * 1.7, 4.0);
    text(g, d, name === 'reload' && loading ? 'loading' : (v * 100).toFixed(0) + '%',
         t[0], t[1] - px(d, 4), col, VAL, 900, 'center');
  }

  label(g, d, 'keys', px(d, 12), px(d, 12), P.ink3, 9);
  label(g, d, 'mouse', w - px(d, 12), px(d, 12), P.ink3, 9, 'right');
  label(g, d, 'trigger', px(d, 12), h - px(d, 6), P.ink3, 9);
  label(g, d, 'reload', w - px(d, 12), h - px(d, 6), P.ink3, 9, 'right');
}

/* ---- 3. WHAT IT TOOK FROM YOU --------------------------------------------
 * Three bars, each with its CONTROL drawn on it as a notch — the score a thing
 * that learned nothing would get. A bar without its control is decoration, and
 * an earlier version of this panel awarded 79% to a test player with no
 * movement style at all because the number underneath was paying out for the
 * fact that a moving body keeps moving.
 */
const TOOK = [
  ['hands', 'which keys you hold', 'guessing the key you hold most'],
  ['aim', 'how you swing the mouse', 'never turning at all'],
  ['trigger', 'when you shoot', 'firing at your average rate'],
];
export function drawMiss(game) {
  const c = $('cMiss'); if (!c) return;
  const { w, h, d } = fitCanvas(c);
  const P = palette();
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  const A = agentScore(game.A);
  if (!A.graded) return empty(g, d, w, h, 'it has not watched you yet');

  /* ONE CABINET RUN, and the plate under it IS the control.
   *
   * Three isometric columns at three screen origins read as three separate
   * pictures of three separate things; they are three readings of one
   * measurement. Cabinet puts them on one plate across the full width — which it
   * can, because cabinet leaves the horizontal axis alone — so they compare at a
   * glance, and each solid gets noticeably more size than it had.
   *
   * The plate is not decoration. Everything above it is what the policy took
   * PAST a control that needed no learning; the control is the floor. That
   * sentence used to be printed beside each bar, three times, in a panel the
   * player said was too dense.
   */
  const vals = [A.keys, A.aim, clamp(Math.log(Math.max(1, A.fire)) / Math.log(40), 0, 1)];
  const cols = [CAST.red, CAST.gold, CAST.blue];
  /* THE SCENE IS SHAPED TO THE PANEL, and this is the arithmetic that decides
     it. Cabinet is free in x but not in y: the height is the tallest column
     plus the depth, about 3 units, so at 120 pixels the scale is fixed at
     around 27 and the WIDTH the scene needs to fill the card is 596/27, near
     seventeen units. Three columns 3.6 wide on a pitch of 6.6 come to 16.8 —
     laid out at a pitch of 2.2 they filled a third of the card and left the
     rest empty, which is exactly what the deck panels looked like before. */
  const CW = 3.6, PITCH = 6.6;
  const F = oblFit(w, h - px(d, 22), 2 * PITCH + CW, 2.6, 1.0, px(d, 9));
  const s = F.s, ox = F.ox, oy = F.oy - px(d, 3);
  oblPlate(g, ox, oy, s, -0.25, 0, 2 * PITCH + CW + 0.5, 1.0, rgba(P.grid, 0.34));
  for (let i = 0; i < 3; i++) {
    const v = clamp(vals[i], 0, 1);
    const hgt = 0.16 + v * 2.3;
    oblBox(g, ox, oy, s, i * PITCH, 0, 0, CW, hgt, 1.0,
           v > 0.02 ? cols[i] : dim(cols[i]), 1.2 * d);
    const t = obl(ox, oy, s, i * PITCH + CW / 2, hgt, 0.5);
    text(g, d, (v * 100).toFixed(0) + '%', t[0], t[1] - px(d, 5),
         v > 0.02 ? cols[i] : P.ink3, VAL, 900, 'center');
    const b2 = obl(ox, oy, s, i * PITCH + CW / 2, 0, 0);
    label(g, d, TOOK[i][0], b2[0], b2[1] + px(d, 12), P.ink3, 9, 'center');
  }
  label(g, d, A.graded.toLocaleString() + ' frames graded first',
        px(d, 11), px(d, 11), P.ink3, 9);
}

/* ---- 4. THE POLICY -------------------------------------------------------
 * One net: what it is given, two hidden layers, and the six things it decides.
 * The hidden units are drawn at their live activation, so a player can watch it
 * think — and, more usefully, watch it NOT think when it has been given nothing.
 */
export function drawBrain(game) {
  const c = $('cBrain'); if (!c) return;
  const { w, h, d } = fitCanvas(c);
  const P = palette();
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  const A = game.A;

  /* A SIGNAL CROSSING IT.
   *
   * Chosen off the design sheet. Four layers as cabinet slabs with a bright
   * pulse travelling left to right — one crossing per decision, which at
   * DECIDE_EVERY of five frames is about twelve a second, so the panel is
   * visibly running whenever the Mirror is thinking.
   *
   * What it is honest about and what it is not, in one place so nobody has to
   * guess: the PULSE is real — its position is where the current decision has
   * got to and its brightness is the mean activation of the layer it is passing
   * through. The units drawn on each slab are real activations, sampled evenly
   * across the layer rather than truncated, so what is shown is the whole layer
   * at lower resolution. What it does NOT show is the weights; there are 7,958
   * of them and any picture of them is a grey rectangle. The sheet has that
   * drawn out.
   */
  const cols = [
    { act: game.obsIt, n: OBS, label: 'sees', col: tok('cool') },
    { act: A.h1, n: NET.H1, col: CAST.violet },
    { act: A.h2, n: NET.H2, col: CAST.violet },
    { act: A.out, n: ACT, label: 'does', col: tok('hot') },
  ];
  /* where the pulse is: the frame counter, wrapped over the decision interval */
  const t = ((game.frameN || 0) % 20) / 20;

  const ROWS = 7;
  /* same reasoning as drawMiss: cabinet is free in x, so the slab pitch is
     chosen to fill the card rather than left at whatever looked right small */
  const PITCH = 3.4;
  const F = oblFit(w, h - px(d, 16), 3 * PITCH + 2.6, 2.3, 1.5, px(d, 8));
  const s = F.s, ox = F.ox, oy = F.oy + px(d, 4);

  for (let ci = 0; ci < cols.length; ci++) {
    const L = cols[ci];
    /* how close the pulse is to this layer, 0 to 1 */
    const near = Math.max(0, 1 - Math.abs(ci / 3 - t) * 3.2);
    /* and how much the layer is actually doing, which is what the pulse carries */
    let mean = 0;
    if (L.act) {
      for (let i = 0; i < L.n; i++) mean += Math.abs(L.act[i] || 0);
      mean /= Math.max(1, L.n);
    }
    const lit = near * clamp(mean * 1.6, 0.15, 1);
    oblBox(g, ox, oy, s, ci * PITCH, 0, 0, 2.6, 2.1, 1.5,
           lit > 0.04 ? mixHex(L.col, CAST.gold, lit) : L.col, 1.2 * d);
    /* the units on the face of the slab, sampled across the whole layer */
    for (let i = 0; i < ROWS; i++) {
      const k = Math.round(i * (L.n - 1) / (ROWS - 1));
      const raw = L.act ? (L.act[k] || 0) : 0;
      const a = clamp(Math.abs(raw) * 1.5, 0, 1);
      oblBox(g, ox, oy, s, ci * PITCH + 0.18, 0.14 + i * 0.27, 1.52,
             2.24, 0.17, 0.02,
             a > 0.42 ? (raw < 0 ? CAST.orange : CAST.gold) : dim(CAST.gold, 0.55),
             0.7 * d);
    }
    if (L.label) {
      const b2 = obl(ox, oy, s, ci * PITCH + 1.3, 0, 0);
      label(g, d, L.label, b2[0], h - px(d, 4), P.ink3, 9, 'center');
    }
  }
  label(g, d, OBS + ' in · ' + NET.H1 + ' · ' + NET.H2 + ' · ' + ACT + ' out',
        w - px(d, 10), px(d, 11), P.ink3, 9, 'right');
}

/* the score line, kept as it happens. Nothing reconstructs it afterwards: a
   chart built from a summary at the end is a chart of the summary. */
const tape = { round: [], you: [], it: [], seen: [] };
function noteTape(game) {
  const r = game.round;
  const n = tape.round.length;
  if (n && tape.round[n - 1] === r) {
    tape.you[n - 1] = game.wins || 0;
    tape.it[n - 1] = game.deaths || 0;
    tape.seen[n - 1] = game.A.n || 0;
    return;
  }
  tape.round.push(r);
  tape.you.push(game.wins || 0);
  tape.it.push(game.deaths || 0);
  tape.seen.push(game.A.n || 0);
  if (tape.round.length > 240) { tape.round.shift(); tape.you.shift(); tape.it.shift(); tape.seen.shift(); }
}
export function resetTape() { tape.round.length = 0; tape.you.length = 0; tape.it.length = 0; tape.seen.length = 0; }

export function drawSpark(game) {
  const c = $('cSpark'); if (!c) return;
  const { w, h, d } = fitCanvas(c);
  const P = palette();
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  noteTape(game);

  /* A STAIRCASE.
   *
   * Chosen off the design sheet. The stepped line the ledger used to draw, as
   * actual treads running away from you: one per round, its height the score.
   *
   * It keeps the whole HISTORY — which is the thing a pair of towers throws away
   * and the thing this panel is uniquely for, since it is the only readout here
   * that is about the evening rather than the moment — and it still reads as an
   * object rather than a chart, so you can see where the evening turned instead
   * of parsing an axis to find out.
   *
   * Cabinet, not isometric: the run has to be as wide as the card and cabinet is
   * the projection that leaves the horizontal axis alone.
   */
  const n = tape.round.length;
  if (!n) return empty(g, d, w, h, 'no rounds yet');

  const top = Math.max(3, tape.you[n - 1] || 0, tape.it[n - 1] || 0);
  /* the pitch is chosen so the run fills the card however many rounds there are:
     a short evening gets fat treads, a long one gets thin ones, and neither
     leaves the panel half empty */
  const PITCH = Math.max(0.20, Math.min(0.62, 14 / Math.max(1, n)));
  const F = oblFit(w, h - px(d, 16), n * PITCH, 2.5, 1.5, px(d, 8));
  const s = F.s, ox = F.ox, oy = F.oy - px(d, 2);
  const H = (v) => 0.14 + (v / top) * 2.1;

  for (let i = 0; i < n; i++) {
    /* yours: the wide tread, with a bright nosing on the front edge */
    oblBox(g, ox, oy, s, i * PITCH, 0, 0, PITCH * 0.88, H(tape.you[i]), 1.5,
           CAST.blue, 0.9 * d);
    oblBox(g, ox, oy, s, i * PITCH + PITCH * 0.1, H(tape.you[i]), 0.55,
           PITCH * 0.68, 0.09, 0.55, CAST.bone, 0.7 * d);
    /* and its, a narrower step behind them */
    oblBox(g, ox, oy, s, i * PITCH + PITCH * 0.16, 0, 1.55, PITCH * 0.6,
           H(tape.it[i]), 0.35, CAST.red, 0.8 * d);
  }

  /* the two names as chips, where the eye lands rather than in a caption */
  const chip = (txt, x, col) => {
    setFont(g, d, 9, 700);
    const tw = g.measureText(txt.toUpperCase()).width;
    g.fillStyle = col;
    g.fillRect(x, px(d, 6), tw + px(d, 8), px(d, 12));
    g.strokeStyle = INK; g.lineWidth = 1 * d;
    g.strokeRect(x, px(d, 6), tw + px(d, 8), px(d, 12));
    label(g, d, txt, x + px(d, 4), px(d, 15), INK, 9);
    return tw + px(d, 13);
  };
  const cw = chip('you', px(d, 10), CAST.blue);
  chip('it', px(d, 10) + cw, CAST.red);
  label(g, d, tape.you[n - 1] + ' – ' + tape.it[n - 1], w - px(d, 10), px(d, 15),
        P.ink, VAL, 900, 'right');
  label(g, d, 'one step a round · ' + (game.A.n || 0).toLocaleString() + ' frames watched',
        px(d, 10), h - px(d, 4), P.ink3, 9);
}

export function becomeYou(A) {
  const hands = clamp(A.keys, 0, 1);
  const aim = clamp(A.aim, 0, 1);
  const trig = clamp(Math.log(Math.max(1, A.fire)) / Math.log(40), 0, 1);
  return { hands, aim, trig, become: clamp(0.45 * hands + 0.30 * aim + 0.25 * trig, 0, 1) };
}

/* THE BENCH: THE WHOLE PANEL AS ONE SCENE.
 * ============================================================================
 *
 * This panel was a number, a meter, a small picture and three more meters —
 * five ways of saying one thing, none of them looking like the game. It is one
 * isometric bench now, taking the four decisions the controls panel took:
 *
 *   ONE SCENE. Everything the panel knows is on one surface under one light.
 *   OBJECTS, NOT MARKS. The subject is two bodies and a copy being made of one
 *     of them, so there are actual objects to draw and no reason to draw bars.
 *   THE GROUND CARRIES MEANING. It is a workbench, because what is happening is
 *     a thing being made.
 *   THE CAST'S COLOUR RULE. Saturated base, brighter trim, and nothing dark on
 *     dark — an unfinished part is a pale shell, not an absent one.
 *
 * WHAT IS ON THE BENCH, and every one of them is live:
 *
 *   YOUR MASK, at the back left, finished. The thing being copied.
 *   THE COPY, beside it, filling from the bottom to the overall score, the rest
 *     standing as an empty shell so you can see how much is left to make.
 *   THE DIAL, on its plinth, needle at the same score — the reading that can be
 *     taken at a glance from across the room without counting anything.
 *   THREE GAUGES along the front: hands, aim and trigger, the components the
 *     score is made of, each an edge over a control that learned nothing.
 *
 * The three HTML meters this replaces are gone from index.html. They were the
 * same three numbers, and having them twice was the panel arguing with itself.
 */
function drawKnow(game, become, parts) {
  const c = $('cKnow'); if (!c) return;
  const { w, h, d } = fitCanvas(c);
  const P = palette();
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);

  /* THE FIT IS ONLY AS GOOD AS THE SIZE IT IS TOLD. The scene was declared 3.0
     tall when the tallest thing on the bench is a gauge at about 1.6, and
     isoFit reserves whatever height it is given — so it solved for a scene half
     again as tall as the one being drawn and shrank everything to suit. The
     numbers below are the real extents of what is on the bench. */
  const CAP = px(d, 13);
  const F = isoFit(w, h - CAP, 6.6, 1.9, 4.6, px(d, 6));
  const s = F.s, ox = F.ox, oy = F.oy;

  isoPlate(g, ox, oy, s, -0.45, -0.45, 7.5, 5.5, rgba(P.grid, 0.34));

  /* ---- the front row first? no: FAR THINGS FIRST in this projection, so the
     back row is drawn before the gauges that stand in front of it ---- */

  /* your mask, finished */
  isoBox(g, ox, oy, s, 0.15, 0, 0.2, 1.15, 1.15, 1.15, CAST.blue, 1.2 * d);
  isoBox(g, ox, oy, s, 0.42, 1.15, 0.47, 0.62, 0.30, 0.62, CAST.bone, 1.1 * d);

  /* the copy, filling to the score */
  const bv = clamp(become, 0, 1);
  isoBox(g, ox, oy, s, 1.85, 0, 0.2, 1.15, 1.15, 1.15, dim(CAST.red, 0.9), 1.2 * d);
  if (bv > 0.02)
    isoBox(g, ox, oy, s, 1.90, 0, 0.25, 1.05, 1.15 * bv, 1.05, CAST.red, 1.1 * d);
  /* the trim only lands when the copy is essentially finished, which is the one
     moment this panel exists to announce */
  if (bv > 0.92)
    isoBox(g, ox, oy, s, 2.12, 1.15, 0.47, 0.62, 0.30, 0.62, CAST.gold, 1.1 * d);

  /* the dial on its plinth */
  isoBox(g, ox, oy, s, 3.9, 0, 0.1, 1.9, 0.55, 1.9, dim(CAST.bone, 0.86), 1.2 * d);
  const dc = isoPt(ox, oy, s, 4.85, 0.55, 1.05);
  const R = s * 0.80;
  g.beginPath();
  g.ellipse(dc[0], dc[1], R, R * 0.58, 0, 0, 7);
  g.fillStyle = CAST.gold; g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.4 * d; g.stroke();
  /* the ticks, so the needle has something to be read against */
  for (let i = 0; i <= 4; i++) {
    const a2 = Math.PI * (1 - i / 4);
    g.beginPath();
    g.moveTo(dc[0] - Math.cos(a2) * R * 0.72, dc[1] - Math.sin(a2) * R * 0.42);
    g.lineTo(dc[0] - Math.cos(a2) * R * 0.92, dc[1] - Math.sin(a2) * R * 0.54);
    g.strokeStyle = INK; g.lineWidth = 1 * d; g.stroke();
  }
  const na = Math.PI * (1 - bv);
  g.beginPath();
  g.moveTo(dc[0], dc[1]);
  g.lineTo(dc[0] - Math.cos(na) * R * 0.84, dc[1] - Math.sin(na) * R * 0.49);
  g.strokeStyle = INK; g.lineWidth = 2.6 * d; g.lineCap = 'round'; g.stroke();
  g.lineCap = 'butt';
  g.beginPath(); g.arc(dc[0], dc[1], 2.2 * d, 0, 7);
  g.fillStyle = INK; g.fill();

  /* ---- and the three gauges along the front ---- */
  const cols = [CAST.red, CAST.gold, CAST.blue];
  for (let i = 0; i < 3; i++) {
    const x = 0.25 + i * 1.75;
    isoPlate(g, ox, oy, s, x - 0.12, 3.0, 1.45, 1.45, rgba(P.grid, 0.40));
    const v = clamp(parts[i], 0, 1);
    isoBox(g, ox, oy, s, x, 0, 3.15, 1.2, 0.10 + v * 1.5, 1.2,
           v > 0.02 ? cols[i] : dim(cols[i]), 1.15 * d);
    const t = isoPt(ox, oy, s, x + 0.6, 0.10 + v * 1.5, 3.75);
    text(g, d, (v * 100).toFixed(0), t[0], t[1] - px(d, 4),
         v > 0.02 ? cols[i] : P.ink3, 11, 900, 'center');
  }

  /* EACH NAME UNDER ITS OWN GAUGE, at the gauge's projected position rather
     than at an even third of the canvas — spread evenly they ran into the line
     at the right-hand end, and none of them sat under the thing it named. */
  const NMS = ['hands', 'aim', 'trigger'];
  for (let i = 0; i < 3; i++) {
    const b2 = isoPt(ox, oy, s, 0.25 + i * 1.75 + 0.6, 0, 4.5);
    label(g, d, NMS[i], b2[0], Math.min(h - px(d, 3), b2[1] + px(d, 10)),
          P.ink3, 9, 'center');
  }
  /* and the sentence in the empty corner above the bench, where there is
     nothing to collide with in any state */
  label(g, d, bv >= 0.985 ? 'the same body'
        : Math.round((1 - bv) * 100) + '% still its own',
        w - px(d, 6), px(d, 10), P.ink2, 9, 'right');
}

export function updateRail(game) {
  const A = agentScore(game.A);
  const { hands, aim, trig, become } = becomeYou(A);
  const pct = Math.round(become * 100);
  $('knowNum').textContent = pct + '%';
  $('knowNum').classList.toggle('neg', false);
  drawKnow(game, become, [hands, aim, trig]);
  const use = $('knowUse');
  if (use) {
    const watching = A.graded < 600;
    use.textContent = watching ? 'still watching'
                    : become > 0.35 ? 'fighting like you' : 'learning you';
    use.dataset.on = watching ? '0' : '1';
  }
  const n = $('noticed');
  if (n) {
    n.innerHTML = A.graded < 600
      ? 'Nothing yet. It has an empty brain — move, shoot, and it copies what it sees.'
      : (game.wins || 0) === 0
        ? 'It has never been killed, so it has never seen a kill. Round 1 until you win one.'
        : 'Everything it does, it learned from watching you. Nothing here was written by hand.';
  }
  const cn = $('copyN');
  if (cn) cn.textContent = A.lessons.toLocaleString() + ' lessons';
  const cap = $('cmpCap');
  if (cap) cap.textContent = 'It has the same keyboard, the same mouse and the same '
    + 'view of the map as you. It started with nothing in it.';
}

/* ---- THE VITALS ----------------------------------------------------------
 *
 * Health and rounds, for both bodies, drawn rather than typed.
 *
 * The player asked for these to look like the game rather than like a form, and
 * they were right that pips in a flex row are the one part of this screen that
 * could belong to any application. So health is BLOOD — a filled body-shape that
 * empties as it is taken off you — and the magazine is BRASS: twenty rounds
 * standing in a stack, going dark as they are spent, refilling from the bottom
 * while a reload runs. Both are lit from the same corner as everything in the
 * arena and outlined in the same near-black, so the header reads as part of the
 * same object.
 */
/* THREE DROPS AND TWENTY ROUNDS, BOTH AS SOLIDS.
 *
 * Chosen off the design sheet: "cabinet drops, trimmed" and "cabinet cartridges,
 * brass". Both are cabinet rather than isometric, which is the whole reason they
 * fit — cabinet leaves the horizontal axis alone, so a row of twenty stays as
 * wide and as short as the header slot while every one of them keeps three lit
 * faces. Isometric drags half of both horizontal axes into the vertical and
 * comes out too small to read at this height; that comparison is on the sheet.
 *
 * The colour rule is the cast's: a saturated base with a BRIGHTER trim on it,
 * never a base against the background. A spent drop or a spent round keeps its
 * shape and its value and loses its colour, so the row never changes length and
 * there is always something to count against.
 */
function vitals(id, hp, maxHp, ammo, reloadFrac) {
  const c = $(id); if (!c) return;
  const { w, h, d } = fitCanvas(c);
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);

  /* --- health: three drops with a bright cap --- */
  const HW = w * 0.30;
  const FH = oblFit(HW, h, maxHp * 1.2, 1.6, 0.7, 2 * d);
  for (let i = 0; i < maxHp; i++) {
    const on = i < hp;
    oblBox(g, FH.ox, FH.oy, FH.s, i * 1.2, 0, 0, 0.92, on ? 1.05 : 0.34, 0.7,
           on ? CAST.red : dim(CAST.red), 1.1 * d);
    oblBox(g, FH.ox, FH.oy, FH.s, i * 1.2 + 0.20, on ? 1.05 : 0.34, 0.14,
           0.52, 0.34, 0.42, on ? CAST.gold : dim(CAST.gold), 1 * d);
  }

  /* --- the magazine: twenty cased rounds --- */
  const n = MAG.size;
  const MX = w * 0.34, MW = w - MX;
  const full = reloadFrac !== null ? Math.round(reloadFrac * n) : ammo;
  const FM = oblFit(MW, h, n * 0.44, 1.6, 0.5, 2 * d);
  for (let i = 0; i < n; i++) {
    const on = i < full;
    const head = reloadFrac !== null ? tok('acid') : CAST.gold;
    oblBox(g, FM.ox + MX, FM.oy, FM.s, i * 0.44, 0, 0, 0.32, on ? 1.20 : 0.55, 0.5,
           on ? CAST.orange : dim(CAST.orange), 0.9 * d);
    if (on) oblBox(g, FM.ox + MX, FM.oy, FM.s, i * 0.44, 1.20, 0, 0.32, 0.36, 0.5,
                   head, 0.9 * d);
  }
}

export function updateBar(game) {
  $('pRound').textContent = 'Round ' + game.round;
  const left = game.protectUntil - game.now;
  const pr = $('pProtect');
  if (pr) {
    pr.hidden = !(left > 0) || game.mode !== 'play';
    if (left > 0) pr.textContent = 'safe ' + (left / 1000).toFixed(1) + 's';
  }
  const P = palette();
  const me = game.mode === 'watch' && game.ghost ? game.ghost : game.you;
  const rf = (a) => (a && a.reloadUntil > game.now)
    ? 1 - (a.reloadUntil - game.now) / MAG.reloadMs : null;
  vitals('vitYou', me.dead ? 0 : me.hp, 3, me.ammo || 0, rf(me));
  /* THE MIRROR GETS THE SAME READOUT. It had none — the player could see their
     own magazine and had to guess at the one being pointed at them, which in a
     game whose entire subject is symmetry was the wrong thing to leave out. */
  const f = game.foes.find((q) => !q.dead) || game.foes[0];
  vitals('vitFoe', f && !f.dead ? f.hp : 0, (f && f.maxHp) || 3,
         (f && f.ammo) || 0, rf(f));
  const el = $('sideFoe');
  if (el) el.title = 'One policy, holding your controls, on the same magazine you have.';
}

/* ---- THE REHEARSAL CARD --------------------------------------------------
 * The between-round beat got longer when the Mirror started rehearsing in it,
 * and a pause with no visible reason reads as the game hanging. This is not a
 * loading animation: practice.js records the positions of both bodies through
 * the practice fight, and this plays that fight back. What the player sees IS
 * what the pause was spent on.
 */
/* THE GAME STOPS FOR THIS. The player asked for it, and it was the only
   honest arrangement: the arena was carrying on underneath a card that claimed
   the Mirror was busy elsewhere, so either the claim was false or the player was
   being shot at by something that was not paying attention. Now the world holds
   still, the card is a live window on the practice fight, and it comes down when
   the fight is actually over rather than after a fixed two seconds. */
let rhOn = 0, rhOff = 0;
export function showRehearsal(game) {
  const box = $('rehearse');
  if (!box) return;
  rhOff = 0;
  if (!rhOn) rhOn = performance.now();
  box.hidden = false;
  const A = game.A, v = rehearsalView();
  const done = v ? v.done : 1;
  $('rhKick').textContent = v && v.phase !== 'fight' ? 'LEARNING FROM IT' : 'REHEARSING';
  $('rhLine').textContent = v && v.phase !== 'fight'
    ? 'keeping whatever landed a round'
    : 'it is fighting a copy of you';
  $('rhStat').textContent =
    Math.round(done * 100) + '% · ' +
    ((A.rehearsedFrames || 0) + (v ? v.i : 0)).toLocaleString() + ' frames practised · ' +
    ((A.rehearsals || 0) + 1) + ' sessions';
}
export function hideRehearsal() {
  const box = $('rehearse');
  if (box) box.hidden = true;
  rhOn = 0; rhOff = 0;
}
/* the fight finished — hold the last picture briefly so it does not blink out */
export function endRehearsal(now) {
  if (!rhOn) return false;
  if (!rhOff) rhOff = now;
  if (now - rhOff < 600) return true;
  hideRehearsal();
  return false;
}
export function drawRehearsal(now) {
  const c = $('cRehearse');
  if (!c || $('rehearse').hidden) return;
  const v = rehearsalView();
  const rhTrail = v && v.trail.length >= 25 ? v.trail : null;
  if (!rhTrail) return;
  const { w, h, d } = fitCanvas(c);
  const P = palette();
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  const n = rhTrail.length / 5;
  /* the newest sample IS the head: this is the fight happening, not a replay */
  const head = n - 1;
  const AX = WORLDX, AZ = WORLDZ;
  const sx = (x) => (x / AX * 0.46 + 0.5) * w;
  const sz = (z) => (z / AZ * 0.46 + 0.5) * h;
  g.strokeStyle = rgba(P.grid, 0.6); g.lineWidth = 1 * d;
  g.strokeRect(sx(-AX), sz(-AZ), sx(AX) - sx(-AX), sz(AZ) - sz(-AZ));
  /* the paths, fading behind each body */
  for (const [off, col] of [[0, P.body], [2, P.hot]]) {
    g.lineWidth = 1.6 * d;
    for (let i = Math.max(1, head - 90); i <= head; i++) {
      const a = (i - Math.max(1, head - 90)) / 90;
      g.strokeStyle = rgba(col, 0.10 + a * 0.5);
      g.beginPath();
      g.moveTo(sx(rhTrail[(i - 1) * 5 + off]), sz(rhTrail[(i - 1) * 5 + off + 1]));
      g.lineTo(sx(rhTrail[i * 5 + off]), sz(rhTrail[i * 5 + off + 1]));
      g.stroke();
    }
    g.fillStyle = col;
    g.beginPath();
    g.arc(sx(rhTrail[head * 5 + off]), sz(rhTrail[head * 5 + off + 1]), 3.2 * d, 0, 7);
    g.fill();
  }
  /* a flash on the frames somebody pulled a trigger */
  const shot = rhTrail[head * 5 + 4];
  if (shot & 1) ring(g, sx(rhTrail[head * 5]), sz(rhTrail[head * 5 + 1]), P.body, d);
  if (shot & 2) ring(g, sx(rhTrail[head * 5 + 2]), sz(rhTrail[head * 5 + 3]), P.hot, d);
}
function ring(g, x, y, col, d) {
  g.strokeStyle = rgba(col, 0.9); g.lineWidth = 1.6 * d;
  g.beginPath(); g.arc(x, y, 7 * d, 0, 7); g.stroke();
}

/* ---- banner, toast and sheet: unchanged, they were never about the model -- */
let bannerTimer = 0;
export function banner(kick, line, ms) {
  const b = $('banner');
  $('bnKick').textContent = kick;
  $('bnLine').innerHTML = line || '';
  b.hidden = false;
  b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    b.classList.remove('in');
    setTimeout(() => { b.hidden = true; }, 340);
  }, ms || 3400);
}
export function flashNoticed() {
  const el = $('noticed');
  if (!el) return;
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
let toastUntil = 0;
export function toast(title, sub, ms) {
  $('toastT').textContent = title;
  $('toastS').textContent = sub || '';
  $('toast').hidden = false;
  toastUntil = performance.now() + (ms || 2400);
}
export function tickToast(now) {
  if (toastUntil && now > toastUntil) { toastUntil = 0; $('toast').hidden = true; }
}
let sheetTimer = 0;
let sheetHolds = false;
export const sheetPauses = () => !$('sheet').hidden && sheetHolds;
export const pressSheet = () => {
  if ($('sheet').hidden) return false;
  $('shGo').click();
  return true;
};
export function showSheet({ kick, said, note, stats, cta, onGo, hold }) {
  $('shKick').textContent = kick;
  $('shSaid').innerHTML = said;
  $('shNote').innerHTML = note || '';
  $('shStats').innerHTML = (stats || [])
    .map((s) => `<div><span>${s[0]}</span><b>${s[1]}</b></div>`).join('');
  $('shGo').textContent = cta || 'Continue';
  $('sheet').hidden = false;
  sheetHolds = !!hold;
  clearTimeout(sheetTimer);
  const close = () => { clearTimeout(sheetTimer); sheetHolds = false; $('sheet').hidden = true; };
  $('shGo').onclick = () => { close(); if (onGo) onGo(); };
  if (!hold) sheetTimer = setTimeout(close, 5200);
  if (hold) $('shGo').focus();
}
export const sheetOpen = () => !$('sheet').hidden;
export const hideSheet = () => { clearTimeout(sheetTimer); sheetHolds = false; $('sheet').hidden = true; };
