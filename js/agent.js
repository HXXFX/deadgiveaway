/* THE BLANK SLATE
 * ============================================================================
 *
 * One policy, learned from nothing, driving the Mirror through the same controls
 * the player has. No tactic in this file. No orbit ring, no peek timer, no
 * doorway routing, no burst structure, no hold-fire range — the previous design
 * had about fifteen of those, hand-written and fully formed at round one, with
 * the player's measured habits plugged in as their parameters. That design could
 * not learn a habit nobody had written an action for: pre-fire needed two
 * hundred lines before the Mirror could even express it, and every future habit
 * would have needed the same.
 *
 * WHAT IT SEES. The same thing the player does. The camera is top-down and never
 * rotates, so the player's frame of reference IS the screen, which is the world
 * axes — that is why everything below is relative to the body's POSITION but
 * aligned to the world, not to its facing. Sixteen rays give the shape of the
 * room the way a glance does; the enemy is always in the observation because the
 * renderer never hides it, and a player looking at a top-down map can see
 * someone standing behind a wall. What they cannot do is SHOOT them, which is a
 * separate bit of the observation and the whole of what pre-fire is about.
 *
 * WHAT IT DOES. W, A, S, D, where to point, and whether to pull the trigger.
 * The same seven decisions the player makes, and they go through the same
 * movement code, the same trigger cap, the same collision.
 *
 * HOW IT LEARNS. Behavioural cloning. Every frame the player acts, the pair
 * (what they saw, what they did) becomes a lesson. The Mirror runs the same
 * policy on ITS observation, in which the enemy is you. Nothing is scored, no
 * reward exists, nothing is optimised for winning — it is only ever answering
 * "what would they have done here".
 *
 * WHY THE FIRST ROUNDS ARE EMPTY. Because the net starts at zero and a body that
 * has never seen anyone move does not know that legs are for walking. It will
 * stand there. That is not a bug to be scaffolded away; it is the honest shape
 * of the thing, and the reason the previous design felt wrong was that it was
 * never true.
 */
import { WORLD, PLAYER } from './config.js';
import { clamp, lerp, mulberry32 } from './util.js';

/* ---- what a body can see ------------------------------------------------- */

export const RAYS = 16;          /* one every 22.5 degrees, from the body out */
export const RAY_MAX = 20;       /* metres; past this the room is "open" */

/* observation layout, all offsets relative to ME, all axes the SCREEN's
     0..15   distance to the first solid along each ray, over RAY_MAX
    16..17   offset to the enemy, over RAY_MAX
       18    distance to the enemy, over RAY_MAX
    19..20   the enemy's velocity, over PLAYER.speed
       21    can a bullet reach them right now
       22    how long that has been true, over 2 s
    23..24   my own velocity, over PLAYER.speed
       25    my health, over PLAYER.hp
       26    how long since I fired, over 1.5 s
       27    how ON TARGET I am: the aim, dotted with the bearing to the enemy
    28..29   where I am pointing, as a vector
    30..32   incoming fire: is there any, and where will it land
       33    HOW FAR OFF TARGET I am, signed and scaled: + is to my left

   AND DELIBERATELY NOT: which keys are currently held. That was tried, on the
   reasonable-sounding grounds that a body knows what its own hands are doing,
   and it is the classic way to wreck a cloned policy. "Whatever I am holding, I
   will keep holding" is right about ninety-five per cent of the time and needs
   no understanding of anything else whatever, so the net learned exactly that
   and stopped reading the room: measured on the frames where the player actually
   pressed or released something, it was right one per cent of the time - the
   signature of a pure persistence predictor, which is wrong on every change by
   construction. The Mirror duly held one key and walked into a wall for ten
   minutes. Runs of held keys come from deciding at a human cadence instead; see
   DECIDE_EVERY.

   33 is the one that makes aiming possible at all. Without it the observation
   said how far off target the crosshair was and never which way to move it - a
   player reads that off the screen in an instant, and the policy was being asked
   to recover it as a product of four other inputs, which a two-layer net will
   not do. Trained without it the turn scored WORSE than never turning, on every
   persona. */
/* 36, was 34. The two new channels are the magazine: how full it is, and
   whether a reload is running. Without them the policy cannot tell an empty gun
   from a full one, and "when do you reload" is not a question it could answer
   even in principle — it would be copying a decision whose cause it cannot see.
   [34] rounds left as a fraction, [35] 1 while reloading. */
/* 38, and the last two are the fairness fix.
 *
 * Until now this vector held the other body's POSITION and VELOCITY and nothing
 * about its CONDITION, while the player's own header showed the Mirror's health
 * and its magazine. So one side could see how close the other was to dying and
 * whether it was about to run dry, and the other could not -- a one-directional
 * advantage in a game whose whole subject is symmetry, and a bigger one than the
 * reticle colour that led to it being noticed.
 *
 * Levelling UP rather than down: both sides now know the same things, rather
 * than the player being made blinder to match. */
export const OBS = 38;
/* one life, held back until it can be scored: sixty seconds is longer than any
   life measured in a session, so nothing is lost by being generous here */
const LIFE_BUF = 3600;

/* Ray against everything in the room, returning the nearest hit along it.
   The maths is the slab test and the circle test out of room.blocked(), kept
   deliberately identical — a second implementation of "what is solid" is how a
   model ends up learning a room the player is not standing in. */
function rayDist(room, x0, z0, dx, dz) {
  let best = RAY_MAX;
  for (const c of room.props) {
    if (c.collider && c.collider.kind === 'circle') {
      const fx = x0 - c.x, fz = z0 - c.z;
      const b = 2 * (fx * dx + fz * dz);
      const cc = fx * fx + fz * fz - c.collider.r * c.collider.r;
      const disc = b * b - 4 * cc;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / 2, t2 = (-b + sq) / 2;
      const t = t1 > 0 ? t1 : (t2 > 0 ? t2 : -1);
      if (t >= 0 && t < best) best = t;
      continue;
    }
    const cs = Math.cos(-c.rot || 0), sn = Math.sin(-c.rot || 0);
    const ox = (x0 - c.x) * cs - (z0 - c.z) * sn;
    const oz = (x0 - c.x) * sn + (z0 - c.z) * cs;
    const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
    let tmin = 0, tmax = best, ok = true;
    for (let ax = 0; ax < 2; ax++) {
      const o = ax ? oz : ox, d = ax ? rz : rx;
      const lo = ax ? -c.hz : -c.hx, hi = ax ? c.hz : c.hx;
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const sw = t1; t1 = t2; t2 = sw; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) { ok = false; break; }
    }
    if (ok && tmin < best) best = tmin;
  }
  /* the arena edge is solid too, and a body that cannot see it walks into it */
  for (const [n, lim] of [[dx, WORLD.AX], [dz, WORLD.AZ]]) {
    const p = n === dx ? x0 : z0;
    if (Math.abs(n) < 1e-9) continue;
    const t = ((n > 0 ? lim : -lim) - p) / n;
    if (t > 0 && t < best) best = t;
  }
  return best;
}

const RAY_DX = new Float32Array(RAYS), RAY_DZ = new Float32Array(RAYS);
for (let i = 0; i < RAYS; i++) {
  const a = (i / RAYS) * Math.PI * 2;
  RAY_DX[i] = Math.cos(a); RAY_DZ[i] = Math.sin(a);
}

/* Build one body's view of the fight. `me` and `foe` are interchangeable, which
   is the whole reason the policy transfers: the Mirror asks this with itself as
   `me` and you as `foe`, and gets a vector shaped exactly like the ones it was
   trained on. */
export function see(out, room, me, foe, lineClear, losFor, sinceFire, threat, noVel, mag, foeCond) {
  for (let i = 0; i < RAYS; i++)
    out[i] = rayDist(room, me.x, me.z, RAY_DX[i], RAY_DZ[i]) / RAY_MAX;
  const dx = foe ? foe.x - me.x : 0, dz = foe ? foe.z - me.z : 0;
  const d = Math.hypot(dx, dz) || 1;
  out[16] = clamp(dx / RAY_MAX, -1, 1);
  out[17] = clamp(dz / RAY_MAX, -1, 1);
  out[18] = clamp(d / RAY_MAX, 0, 1);
  out[19] = foe ? clamp((foe.vx || 0) / PLAYER.speed, -1, 1) : 0;
  out[20] = foe ? clamp((foe.vz || 0) / PLAYER.speed, -1, 1) : 0;
  out[21] = lineClear ? 1 : 0;
  out[22] = clamp((losFor || 0) / 2, 0, 1);
  /* OWN VELOCITY IS THE PREVIOUS ACTION IN DISGUISE. Velocity is the keys held a
     few frames ago, smoothed by the accel ramp — so "echo the velocity" answers
     the question well enough that the net never has to look at the room. Same
     causal confusion the held-keys input caused, arriving through physics rather
     than through an input. `noVel` zeroes the DIRECTION and keeps the speed,
     because how fast a body is going does not say which keys are down. */
  out[23] = noVel ? 0 : clamp(me.vx / PLAYER.speed, -1, 1);
  out[24] = noVel ? 0 : clamp(me.vz / PLAYER.speed, -1, 1);
  out[25] = clamp((me.hp || 0) / PLAYER.hp, 0, 1);
  /* the speed survives where the direction does not: out[3] already carried
     it, and it says nothing about which key is down */
  out[3] = clamp(Math.hypot(me.vx, me.vz) / PLAYER.speed, 0, 1);
  out[26] = clamp((sinceFire || 0) / 1.5, 0, 1);
  out[27] = (me.hx * dx + me.hz * dz) / d;
  out[28] = clamp(me.hx, -1, 1);
  out[29] = clamp(me.hz, -1, 1);
  out[30] = threat ? threat[0] : 0;
  out[31] = threat ? threat[1] : 0;
  out[32] = threat ? threat[2] : 0;
  /* HOW FAR OFF TARGET, SIGNED, AT A SIZE THE NET CAN USE. As a raw cross
     product this sat around 0.045 while the turn it has to produce is order one
     after standardising - a first-layer gain of about eighteen, which weight
     decay spends its life pulling back down, and the turn duly scored worse than
     never turning. The interesting range of an aiming error is a few tenths of a
     radian, so that is the range it is given. */
  /* THE MAGAZINE. Both are properties of the body holding the gun, so they are
     unchanged by any reflection of the room. */
  out[34] = mag ? clamp(mag.ammo, 0, 1) : 1;
  out[35] = mag && mag.reloading ? 1 : 0;
  /* WHAT THE OTHER BODY HAS LEFT. The player reads both of these off the header
     without having to learn anything; this is the same two facts, raw, for the
     side that does. Defaults to "unhurt and loaded" so a caller that cannot
     supply them is guessing high rather than seeing a phantom weakness. */
  out[36] = foeCond ? clamp(foeCond.hp, 0, 1) : 1;
  out[37] = foeCond ? clamp(foeCond.ammo, 0, 1) : 1;
  out[33] = clamp(Math.atan2(me.hx * dz - me.hz * dx,
                             me.hx * dx + me.hz * dz) * 3, -1, 1);
  return out;
}

/* ---- what a body can do -------------------------------------------------- */

/* 0..3  W A S D, as probabilities the key is held
      4  TURN: how far to swing the aim this frame, in radians
      5  pull the trigger, as a probability

   The aim is a TURN, not a bearing, and that is the whole of the difference
   between a mouse and a magnet. Trained on the absolute heading it scored a
   cosine of 0.999 and was worth nothing: the observation contains where the body
   is already pointing, an aim barely moves between two frames at sixty hertz, so
   the cheapest answer is "output the input" and the net duly found it. A control
   that simply keeps pointing where it points scored 1.000 - better than the net.
   Against a turn, that same control scores zero, and every point above it is aim
   the policy actually learned. */
/* 0..3   W A S D, as probabilities the key is held
      4   pull the trigger, as a probability
   5..16   WHERE TO POINT: twelve directions relative to the bearing to the other
           body, as a softmax. Bin 0 is straight at them; the rest fan out to
           either side, so a doorway pre-fire is a bin like any other. */
/* THE BINS ARE DENSE NEAR ZERO, and that is the whole of aiming.
 *
 * They were twelve equal slices of a full circle, which sounds neutral and is
 * not: the bin meaning "at them" was thirty degrees wide, so "aim at the enemy"
 * resolved to anywhere within fifteen degrees of them — three and a half metres
 * off at a thirteen-metre fight. Every shot missed by construction and no amount
 * of training could have fixed it.
 *
 * The published Counter-Strike cloning agent discretises its mouse the same way
 * a hand actually moves: non-uniform, log-ish, packed around zero and coarse at
 * the extremes — [..., -10, -4, -2, 0, 2, 4, 10, ...]. Fine control where the
 * shots are decided, and still room to express a flick. This is that, in degrees
 * of offset from the bearing to the other body. Bin centre 0 is straight at
 * them; the wide bins are where a doorway pre-fire lives. */
const AIM_DEG = [-140, -70, -35, -18, -9, -4, -1.5, 0, 1.5, 4, 9, 18, 35, 70, 140];
export const NAIM = AIM_DEG.length;
/* THE SEVENTH DECISION: reload, now, before you are caught empty. It is a
   Bernoulli like the trigger and sits after the aim bins so the existing
   indices do not move. Firing on an empty magazine reloads anyway — see MAG in
   config.js — so this head can only ever learn to do it EARLIER, which is the
   part that is actually a skill and the part it can watch the player perform. */
export const RELOAD = 5 + NAIM;
export const ACT = 6 + NAIM;
export const AIM_BIN = AIM_DEG.map((d) => d / 57.2958);
/* how far a sampled aim may wander inside its own bin: half way to each
   neighbour, so the fine bins stay fine and the coarse ones still cover */
export const AIM_SPAN = AIM_BIN.map((c, i) => {
  const lo = i > 0 ? (c - AIM_BIN[i - 1]) / 2 : 0.35;
  const hi = i < NAIM - 1 ? (AIM_BIN[i + 1] - c) / 2 : 0.35;
  return Math.min(lo, hi);
});
export const aimBinOf = (off) => {
  let a = off;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  let best = 0, bd = 1e9;
  for (let i = 0; i < NAIM; i++) {
    const d = Math.abs(a - AIM_BIN[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
};
export const MAX_TURN = 0.5;     /* rad per frame - a 180 degree flick in 100 ms */
/* the scale the squash is built around: a brisk correction, not a typical one.
   atanh(0.999) is about 3.8, so the reachable turn tops out near 0.27 rad — 15
   degrees in a single frame, enough to arrive on a target before it moves. */
const TURN_S = 0.07;
/* how much more a frame where the player DEFIED momentum is worth */
const DECISION_W = 5;
/* an aim offset of a radian either side covers tracking and pre-fire alike */
const AIM_S = 1.0;

/* ---- the policy ---------------------------------------------------------- */

/* THE CRITIC SITS ON THE SAME TRUNK, one extra output after the actions. Every
   working implementation of this does the same — the QWOP PPO agent this design
   was checked against shares one MLP between actor and critic and hangs separate
   heads off it. Without a value function there is no advantage, and without an
   advantage a policy gradient is just "do more of whatever preceded a reward",
   which is the version that was tried here and measurably made things worse. */
export const VAL = ACT;                    /* index of the value output */
/* the reload's own net: 36 -> 16 -> 1, 609 parameters. Kept beside NET so a
   count of the model reads both. */
export const RNET = { H: 16 };
export const NET = { IN: OBS, H1: 64, H2: 64, OUT: ACT + 1,
                     LR: 0.012, WD: 0.0004, BUF: 4096, STEPS: 6 };

export function makeAgent(seed) {
  const rnd = mulberry32((seed ^ 0x51ed) >>> 0);
  const he = (n) => Math.sqrt(6 / n);
  const a1 = he(NET.IN + NET.H1), a2 = he(NET.H1 + NET.H2), a3 = he(NET.H2 + NET.OUT);
  return {
    rnd,
    w1: Float32Array.from({ length: NET.IN * NET.H1 }, () => (rnd() * 2 - 1) * a1),
    b1: new Float32Array(NET.H1),
    w2: Float32Array.from({ length: NET.H1 * NET.H2 }, () => (rnd() * 2 - 1) * a2),
    b2: new Float32Array(NET.H2),
    /* THE LAST LAYER STARTS AT ZERO, on purpose: nothing here is a habit
       somebody wrote down, so the Mirror cannot express one until it is taught.
       All 1,430 of these weights and biases are zero and stay zero
       until the first lesson.

       WHAT THAT LOOKS LIKE ON SCREEN IS NOT STILLNESS, AND THIS COMMENT USED TO
       SAY IT WAS. It claimed the decode reads zero as "no keys, no shot, hold
       still ... it stands there until somebody shows it what a body is for".
       That describes the OLD argmax decode, which was removed for a good reason
       — thresholding keys at a half made "no keys" an absorbing state: it stood
       still, standing still is a state the player is never in, so no
       demonstration covered getting out of it and it never came back. See the
       cloning traps in dev_log/LEARNINGS.md. act() SAMPLES instead, and
       sig(0) = 0.5, so an empty brain is a coin flip on every channel.

       Measured on a fresh policy over 20,000 frames (dev_log/audit/probe-coldstart.html):

         chose to fire ......... 50.2% of frames
         chose to reload ....... 10.1% of frames
                                 (one decision per five frames now, like the
                                  keys -- half of decisions, a tenth of frames)
         held >= 1 key ......... 93.8% of decisions, mean 1.98 of 4
         aim ................... uniform across all 15 bins

       Those first two are DECISIONS, not events. shoot() still caps the trigger
       at one round per PLAYER.fireEvery and refuses on an empty magazine, and
       reload() refuses when the magazine is full or a reload is already running.
       So it tries to fire on half of all frames and succeeds far less often. The
       93.8% is exactly 1 - 0.5^4, which is what four independent coin flips give,
       and is the tightest confirmation available that nothing is being learned
       yet.

       So round one opens with the Mirror shooting, reloading and turning at
       random. That is what an empty brain looks like through a sampled decoder:
       it has the keys and no information about when to press any of them.

       IT DOES NOT LAST A ROUND. The policy trains while you play, so the coin
       flip is shaped within seconds. Measured over 60 s against a cadence cap of
       316 shots, with the only difference being what the player did:

         player never fires .... 6 shots   (1.9% of cap), per 5 s: 3 1 1 0 0 0 0 0 0 0 1 0
         player fires steadily . 56 shots  (17.7% of cap), per 5 s: 5 9 14 6 0 0 0 0 0 5 15 2

       Nine times the trigger discipline from the same starting weights, decided
       entirely by the teacher. The randomness is the first MOMENTS, not the
       first round, and what replaces it is you.

       (A reload lockout was suspected of throttling the opening instead — a
       0.5-per-frame reload sample against an 1150 ms dwell. Measured at 5.8% and
       11.5% of frames locked. It is not the cause; the trigger being taught is.) */
    w3: new Float32Array(NET.H2 * NET.OUT),
    b3: new Float32Array(NET.OUT),
    /* A SEPARATE BRAIN FOR THE RELOAD, and the reason is measured.
       The reload head used to sit on the shared trunk with the keys, the aim
       and the trigger. The trunk carries the magazine perfectly well -- it
       responds to it about as strongly as to line-of-sight, which the trigger
       uses -- but the reload head never learned to read it. It learned HOW
       OFTEN the player reloads and never WHEN, so the Mirror emptied its
       magazine and then stood there. Eight variants were tried on the shared
       trunk (retroactive labelling of the pre-reload window, rarity weighting
       at 12x and 40x, a direct one-weight path from the magazine, masking
       frames where a reload was impossible, and the pairwise combinations) and
       none of them produced any conditioning at all.
       Giving it its own small net, reading the observation directly, did.
       Six seeds, baseline against this:
         conditioning     1.06x (1.00-1.48)  ->  3.28x (2.66-4.39)
         wait when empty  57.7 s             ->  9.8 s
         life spent empty 62.7%              ->  44.7%
       The ranges do not overlap on the first, which is the one that says it is
       reloading BECAUSE it is empty rather than on a timer it copied.
       It is an improvement and not a cure: 44.7% is still a lot of standing
       about, and the player's own demonstration is perfectly conditional
       (never when full, 0.66% of frames when empty). See dev_log/HANDOFF.md
       section 57 and dev_log/audit/probe-reload.html. */
    rw1: Float32Array.from({ length: OBS * RNET.H }, () => (rnd() * 2 - 1) * 0.35),
    rb1: new Float32Array(RNET.H),
    rw2: new Float32Array(RNET.H), rb2: 0,
    rh: new Float32Array(RNET.H),
    h1: new Float32Array(NET.H1), h2: new Float32Array(NET.H2),
    out: new Float32Array(NET.OUT),
    bx: new Float32Array(NET.BUF * OBS), by: new Float32Array(NET.BUF * ACT),
    /* AND A RECORD OF ITSELF. The player's idea, and the reasoning is theirs:
       the best version of it is a version of THEM, because everything it can do
       it copied from them — so keeping its own best rounds is keeping their best
       moves filtered through the ones that actually worked.
       `l*` is the life being lived right now, held back until it is over and can
       be scored. `s*` is the keeper buffer: the lives that were worth keeping. */
    lbx: new Float32Array(LIFE_BUF * OBS), lby: new Float32Array(LIFE_BUF * ACT), lN: 0,
    /* what each frame of the pending life was worth, and what happened right
       after it — needed for the per-FRAME gate, which keeps the decisions that
       beat expectation rather than every decision in a lucky round */
    lrew: new Float32Array(LIFE_BUF), pendRew: 0, retMean: 0, retN: 0,
    /* THE BEST VERSION OF YOU, NOT THE AVERAGE OF YOU.
       Every frame you produce used to be drawn with equal probability, so the
       policy converged on your CENTRAL TENDENCY -- your good reads and your
       panics weighted the same, your bad habits copied at exactly the rate you
       have them. `brew` is what damage followed each of your decisions and
       `bq` is the discounted return once the round is over, so the draw can
       prefer the moments that beat your own average.
       This is NOT the self-imitation that was measured and shipped off (see
       HANDOFF 30): that learned from the MIRROR's own rounds, which is a
       feedback loop with no new information in it and over-sharpened. This
       re-weights YOUR frames only. No new source, just a better question asked
       of the same data. */
    brew: new Float32Array(NET.BUF), bq: new Float32Array(NET.BUF),
    youPend: 0, youLifeN: 0, qMean: 0, qN: 0, goodFrames: 0,
    /* how many extra candidates each draw competes against. 0 reproduces the
       old uniform behaviour exactly, which is the control this must be measured
       against. */
    bestW: 1,
    sbx: new Float32Array(NET.BUF * OBS), sby: new Float32Array(NET.BUF * ACT),
    sHead: 0, sN: 0,
    lifeOut: 0, lifeIn: 0, lives: 0, liveMean: 0, liveM2: 0, livesKept: 0,
    /* how much of the study beat comes from itself rather than from the player,
       and which lives qualify. Both are swept in qc/probe.js; nothing here picks
       a value on the player's behalf. */
    selfW: 0, selfGate: 'mean',
    n: 0, head: 0, lessons: 0,
    /* PREQUENTIAL, AND AGAINST A CONTROL — every sample graded before it is
       trained on, and every score reported as an EDGE over the dumbest thing
       that could have said it. Raw numbers here are all traps:
         - keys: a player who holds W a tenth of the time hands "never press W"
           a 90% score, so the control is the per-key majority class.
         - aim: the observation contains where you are ALREADY pointing and the
           target is where you point next, which for a mouse is nearly the same
           thing — the raw cosine came out at 1.00 on the first run. The control
           is "keep pointing where you are pointing".
         - trigger: three per cent of frames are shots, so "never fire" scores
           97%. What matters is whether the trigger reads HIGHER on the frames
           you fired than on the frames you did not. */
    agree: 0, agreeN: 0, keyBase: 0, keyVel: 0, keyRate: new Float32Array(4),
    /* the hands at their DECISION FRAMES — the frames where the key set
       changes. Everywhere else a held key predicts itself and every answer
       ties; see the grading in learn() for the whole argument. */
    decAgree: 0, decBase: 0, decVel: 0, decN: 0, lastKeys: null, pend: null,


    lineN: 0, blindN: 0,
    aimHit: 0, aimBase: 0, binRate: new Float32Array(NAIM),
    pOn: 0, pOff: 0, fireN: 0, noFireN: 0,
    fireRate: 0.05, posW: 19, turnRms: 0.01, turnScale: 0.01,
    fireBias: 0, rateIt: 0.05, chN: 0, chHit: 0, turnS: TURN_S, ppoWarm: 0,
    /* THE DRIVE IS BUILT, CORRECT, AND OFF, because measured it only ever cost.
       Not a bug in it — an arithmetic fact about it. See DRIVE above. Turn it on
       with agentOpts { drive: 1 } and watch it in tools/ablate.py. */
    drive: 0, el: null, rewardTotal: 0, rewardN: 0, noVel: 0, aimAbs: 0,
    /* WHAT THE REHEARSAL PAYS FOR BESIDES DAMAGE.
       'near' -- the near-miss term: how close each finished shot passed, minus
                 a running mean of every shot. Dense, self-cancelling, and NOT
                 potential-based, so it can in principle shift the optimum
                 toward "almost hit" rather than "hit".
       'none' -- damage only. Outcomes and nothing else.
       'aim'  -- potential-based: W*(GAMMA*phi' - phi) where phi is how well the
                 learner is lined up. Dense like 'near', but of the form Ng,
                 Harada & Russell (1999) prove cannot change which policy is
                 optimal -- it pays for IMPROVING the aim, never for holding it,
                 and telescopes to almost nothing over an episode. */
    /* MEASURED BEFORE IT WAS CHOSEN. Four seeds, thirty rehearsals each,
       scored on DAMAGE rather than on total reward -- scoring a shaped run by
       its own shaping only rewards whoever was paid most:

         mode   damage/rehearsal        rollouts discarded of 30
         none   -1.0 -2.33 -2.67  0     26, 21, 22, 30
         near   +1.67 -0.33 -2.0  0      1,  0,  0, 30
         aim    -1.0 -1.67 +0.33  0      0,  0,  0,  0

       No variant produces damage: a health point is 10 units, so two thousand
       steps of self-play move about a TENTH of one either way. The shaping was
       never improving the practice fight, only keeping its rollouts out of the
       zero-mass bin -- and the potential term kept ALL of them by defeating
       that guard, which is worse than losing them. The guard reads the outcome
       half now, so that cannot happen again.
       Shipped 'none' on the owner's rule: reward outcomes and nothing else.
       The other two are kept switchable because they were measured, not
       guessed, and the measurement should be repeatable once the rehearsal is
       a real fight rather than two bodies circling. */
    shapeMode: 'none', shapePhi: 0,
    /* WHAT BECAME OF EACH PRACTICE FIGHT, in order: 1 kept, 0 thrown away.
       The panel draws this as the evening's mirror, one shard a fight -- and
       the gaps are the discard rate, which no readout has ever shown. Counts
       alone cannot draw it; the SEQUENCE is the picture. */
    rehearsalLog: [],
    /* no aim exploration by default: it measured strongly negative, and the
       aim is the one channel imitation is already good at */
    sigma: 0, driveLR: DRIVE.LR, pendingR: 0, rBar: 0,
    /* NO PRIOR ON ANYTHING, including on how often a trigger gets pulled. These
       started at 0.04 and 0.002 — small guesses, but guesses, and a guess that
       the player shoots at walls sometimes is exactly the kind of hand-written
       assumption this whole rebuild exists to remove. At zero the Mirror has no
       opinion until it has seen one shot, and the first blind round it fires
       against a player who never fires blind pushes it straight down. */
    rateYouLine: 0, rateYouBlind: 0,
    rateItLine: 0, rateItBlind: 0, biasLine: 0, biasBlind: 0,
    /* running mean of the PRE-bias fire logit on could-fire frames, split by
       line, plus sample counts so the first reading seeds the mean instead of
       averaging against a fictitious zero. The trigger solve reads these. */
    logitLine: 0, logitBlind: 0, logitLineN: 0, logitBlindN: 0,
    /* the best SUSTAINED firing pace the player has demonstrated: measured
       per life (clear-line fires over clear-line frames, one whole life at a
       time), and only lives with enough line time count. The trigger chases
       this, not the current mood. */
    rateYouLineBest: 0, lifeLineN: 0, lifeFireN: 0,
    bigErr: 0, bigBase: 0, bigN: 0, smErr: 0, smBase: 0, smN: 0,
    mOY: 0, mOO: 0, mYY: 0, mIY: 0, mII: 0,
    augRate: new Float64Array(4), augN: 0,
  };
}

export function forwardAgent(p, x) {
  for (let j = 0; j < NET.H1; j++) {
    let s = p.b1[j], o = j * NET.IN;
    for (let i = 0; i < NET.IN; i++) s += p.w1[o + i] * x[i];
    p.h1[j] = Math.tanh(s);
  }
  for (let j = 0; j < NET.H2; j++) {
    let s = p.b2[j], o = j * NET.H1;
    for (let i = 0; i < NET.H1; i++) s += p.w2[o + i] * p.h1[i];
    p.h2[j] = Math.tanh(s);
  }
  for (let k = 0; k < NET.OUT; k++) {
    let s = p.b3[k], o = k * NET.H2;
    for (let j = 0; j < NET.H2; j++) s += p.w3[o + j] * p.h2[j];
    p.out[k] = s;
  }
  /* the reload does not read the trunk at all; see makeAgent */
  { let z = p.rb2;
    for (let j = 0; j < RNET.H; j++) {
      let a = p.rb1[j], o = j * OBS;
      for (let i = 0; i < OBS; i++) a += p.rw1[o + i] * x[i];
      p.rh[j] = Math.tanh(a); z += p.rw2[j] * p.rh[j];
    }
    p.out[RELOAD] = z; }
  return p.out;
}

export const sig = (v) => 1 / (1 + Math.exp(-clamp(v, -12, 12)));

/* THE ARENA IS A RECTANGLE, so a fight reflected left-to-right is a fight that
   could have happened. Every lesson is therefore four lesons: itself and its
   three reflections, with the rays permuted, W/S and A/D swapped, and the
   pointing negated to match. This is not a trick to get more data out of less —
   it is the symmetry the room actually has, and without it the policy has to
   learn "walk around a corner" once for each corner. */
const REFL = [];
{
  const idx = (fx, fz) => {
    const map = new Int32Array(RAYS);
    for (let i = 0; i < RAYS; i++) {
      const a = Math.atan2(fz * RAY_DZ[i], fx * RAY_DX[i]);
      let k = Math.round((a / (Math.PI * 2)) * RAYS);
      map[i] = ((k % RAYS) + RAYS) % RAYS;
    }
    return map;
  };
  for (const [fx, fz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]])
    REFL.push({ fx, fz, ray: idx(fx, fz) });
}

const rx = new Float32Array(OBS), ry = new Float32Array(ACT);
function reflect(r, x, y) {
  for (let i = 0; i < RAYS; i++) rx[r.ray[i]] = x[i];
  rx[16] = x[16] * r.fx; rx[17] = x[17] * r.fz; rx[18] = x[18];
  rx[19] = x[19] * r.fx; rx[20] = x[20] * r.fz;
  rx[21] = x[21]; rx[22] = x[22];
  rx[23] = x[23] * r.fx; rx[24] = x[24] * r.fz;
  rx[25] = x[25]; rx[26] = x[26]; rx[27] = x[27];
  rx[28] = x[28] * r.fx; rx[29] = x[29] * r.fz;
  rx[30] = x[30]; rx[31] = x[31] * r.fx; rx[32] = x[32] * r.fz;
  /* a cross product of two reflected vectors flips with the handedness */
  rx[33] = x[33] * (r.fx * r.fz > 0 ? 1 : -1);
  /* how full the magazine is does not care which way the room was flipped */
  rx[34] = x[34]; rx[35] = x[35];
  /* neither the other body's health nor its magazine cares which way the room
     was flipped. MISSING THESE WOULD BE SILENT: three of every four training
     samples are a reflection, so the two new inputs would arrive as zero on
     75% of the data and read as 'dead and empty' rather than 'unknown'. */
  rx[36] = x[36]; rx[37] = x[37];
  /* W is -z and S is +z, A is -x and D is +x, so a flip swaps the pair */
  ry[0] = r.fz > 0 ? y[0] : y[2];
  ry[2] = r.fz > 0 ? y[2] : y[0];
  ry[1] = r.fx > 0 ? y[1] : y[3];
  ry[3] = r.fx > 0 ? y[3] : y[1];
  ry[4] = y[4];
  /* a reflection about ONE axis reverses handedness, so every aim bin swaps with
     the one at the opposite offset; about both, nothing moves */
  const flip = r.fx * r.fz < 0;
  for (let i = 0; i < NAIM; i++)
    ry[5 + (flip ? (NAIM - 1 - i) : i)] = y[5 + i];
  ry[RELOAD] = y[RELOAD];
}

const dh2 = new Float32Array(NET.H2), dh1 = new Float32Array(NET.H1);
const ERR = new Float32Array(NET.OUT);
const SM = new Float32Array(NAIM);
const AP = new Float32Array(NAIM);
function stepOne(p, x, y) {
  forwardAgent(p, x);
  /* keys and trigger are decisions, so cross-entropy on a sigmoid; pointing is
     a direction, so plain squared error on the two components */
  const e = p.out;
  const err = ERR;
  /* the aim is a softmax, so its gradient is (softmax - onehot) */
  let mx = -1e9;
  for (let i = 0; i < NAIM; i++) if (e[5 + i] > mx) mx = e[5 + i];
  let z = 0;
  for (let i = 0; i < NAIM; i++) { SM[i] = Math.exp(e[5 + i] - mx); z += SM[i]; }
  for (let i = 0; i < NAIM; i++) { SM[i] /= z; err[5 + i] = SM[i] - y[5 + i]; }
  for (let k = 0; k < 5; k++) {
    err[k] = sig(e[k]) - y[k];         /* d(BCE)/d(logit) is exactly this */
  }
  err[RELOAD] = sig(e[RELOAD]) - y[RELOAD];
  /* ...and it is trained on its own, so the shared trunk gets no reload
     gradient. That is the point: the reload is no longer competing with three
     louder heads for the same hidden layers. */
  { const gO = clamp(err[RELOAD], -4, 4);
    for (let j = 0; j < RNET.H; j++) {
      const gh = gO * p.rw2[j] * (1 - p.rh[j] * p.rh[j]);
      p.rw2[j] -= NET.LR * gO * p.rh[j];
      p.rb1[j] -= NET.LR * gh;
      const o = j * OBS;
      for (let i = 0; i < OBS; i++) p.rw1[o + i] -= NET.LR * gh * x[i];
    }
    p.rb2 -= NET.LR * gO;
    err[RELOAD] = 0; }
  err[VAL] = 0;                        /* imitation says nothing about value */
  err[VAL] = 0;                        /* imitation has no opinion about value */
  /* WEIGHTING THE DECISION FRAMES WAS TRIED AND MEASURED WORSE. The reasoning
     was sound — most frames are coasting, the informative minority is where the
     player defies momentum, and the trigger's rarity weighting works on exactly
     that shape. Applied to the keys at 5x it cost the hands edge (55% to 48% on
     the real player's profile) and its kills (2 to 0). Recorded so nobody spends
     the afternoon rediscovering it. */
  /* FIRING IS RARE, AND HOW RARE IS SOMETHING TO MEASURE RATHER THAN GUESS. A
     player pulls the trigger on a few per cent of frames; trained flat, the net
     learns "never" and scores ninety-five per cent for it - which is what the
     first run did, collapsing the trigger to zero everywhere. Positive frames
     are weighted by how outnumbered they actually are, so "he fired" and "he did
     not" arrive with the same total weight whatever the rate turns out to be. A
     fixed multiplier of six was tried first and was nowhere near enough. */
  if (y[4] > 0.5) err[4] *= p.posW;
  /* NO ONE DECISION MAY OWN THE SHARED TRUNK. The trigger's rarity weighting
     reached sixty, so on every frame the player shot, the gradient flowing back
     into the hidden layers was sixty times everything else's and the layers were
     shaped almost entirely by "was that a shot". The turn head, sitting on top
     of the same features, then produced output the right SIZE and completely
     uncorrelated with the target - corr 0.08 against a signal sitting right
     there in the observation at corr 0.73. Clipping bounds any one head's say
     without silencing it: the trigger still learns at its own scale, it just
     stops shouting over the others. */
  for (let k = 0; k < NET.OUT; k++) err[k] = clamp(err[k], -4, 4);
  dh2.fill(0);
  for (let k = 0; k < NET.OUT; k++) {
    const g = err[k], o = k * NET.H2;
    for (let j = 0; j < NET.H2; j++) {
      dh2[j] += p.w3[o + j] * g;
      p.w3[o + j] -= NET.LR * (g * p.h2[j] + NET.WD * p.w3[o + j]);
    }
    p.b3[k] -= NET.LR * g;
  }
  dh1.fill(0);
  for (let j = 0; j < NET.H2; j++) {
    const d = dh2[j] * (1 - p.h2[j] * p.h2[j]), o = j * NET.H1;
    for (let i = 0; i < NET.H1; i++) {
      dh1[i] += p.w2[o + i] * d;
      p.w2[o + i] -= NET.LR * (d * p.h1[i] + NET.WD * p.w2[o + i]);
    }
    p.b2[j] -= NET.LR * d;
  }
  for (let j = 0; j < NET.H1; j++) {
    const d = dh1[j] * (1 - p.h1[j] * p.h1[j]), o = j * NET.IN;
    for (let i = 0; i < NET.IN; i++)
      p.w1[o + i] -= NET.LR * (d * x[i] + NET.WD * p.w1[o + i]);
    p.b1[j] -= NET.LR * d;
  }
}

/* One lesson: what they saw, what they did. Graded before it is learned from,
   so the agreement number below is always "how well would it have done on
   something it had not seen" and never a memory of the training set. */
export function learn(p, x, y) {
  const o = forwardAgent(p, x);
  const E = 0.0015;
  /* THE FIRST SAMPLE SEEDS AN AVERAGE. IT DOES NOT AVERAGE WITH ZERO.
   *
   * This was one line wrong and it produced the single most misleading number
   * the player has ever been shown. `p.agree` — what the policy scored — was
   * seeded from its first frame. Every CONTROL it is measured against started at
   * zero and crawled up at 0.0015 a frame, a time constant of about six hundred
   * and sixty frames.
   *
   * So at the moment the readout unlocks, the policy's own number is already
   * true and the control it has to beat reads a little over half of what it
   * really is. The headroom looks enormous, and the score reads about ninety per
   * cent. Then, as the control converges on its real value, the score slides
   * smoothly to nothing — with the policy unchanged the whole time.
   *
   * The player watched exactly that and reported it as behaviour: "the first two
   * rounds the AI is the smartest, and after that it becomes dumb". Their trace
   * shows 80, 79, 79, 78, 76, 70, 66, 65, 60, 58, 55, 52, 50, 44, 39, 36, 33,
   * 30, 28, 26, 25, 18, 8, 6, 4, -1, -3 — a slide far too smooth to be anything
   * a body was doing. It was an average warming up.
   *
   * Every average in here now seeds on its own first sample. Some are fed on
   * every frame and some only on the frames they describe, so they each need
   * their own count — sharing one would leave the conditional ones averaging
   * against zero exactly as before. */
  const seed = (n) => n === 0;
  const ema = (cur, v, rate, isFirst) => (isFirst ? v : lerp(cur, v, rate));
  const first = seed(p.agreeN);
  let hit = 0, base = 0;
  for (let k = 0; k < 4; k++) {
    if ((sig(o[k]) > 0.5 ? 1 : 0) === y[k]) hit++;
    p.keyRate[k] = ema(p.keyRate[k], y[k], E, first);
    base += Math.max(p.keyRate[k], 1 - p.keyRate[k]);   /* the majority class */
  }
  /* AND THE CONTROL THAT ACTUALLY BEATS THAT ONE: read the keys off the body's
     CURRENT VELOCITY. A moving body is already telling you which keys are down,
     so "he is drifting left, so A is held" needs no learning whatever and scores
     very well — measured, it put a player choosing random directions every third
     of a second at 82%, which read as the policy having learned him. Same trap
     as the movement clone that was paid for inertia and reported 79% for a
     straight-line walker. The control is whichever obvious answer is better. */
  {
    const vx = x[23], vz = x[24];
    let vhit = 0;
    if (((vz < -0.3) ? 1 : 0) === y[0]) vhit++;
    if (((vx < -0.3) ? 1 : 0) === y[1]) vhit++;
    if (((vz > 0.3) ? 1 : 0) === y[2]) vhit++;
    if (((vx > 0.3) ? 1 : 0) === y[3]) vhit++;
    p.keyVel = ema(p.keyVel, vhit / 4, E, first);
  }
  p.agree = ema(p.agree, hit / 4, E, first);
  p.keyBase = ema(p.keyBase, base / 4, E, first);
  p.agreeN++;
  /* THE HANDS' DECISION FRAMES. On ~19 frames in 20 the key set is whatever it
     just was, a held key predicts itself, and policy and controls tie — so a
     grade over all frames measures the holding, not the choosing. The frames
     that CAN measure are the ones where the key set CHANGES, and they are
     graded on the WHOLE new set, because the decision is the set, not one key
     of it. Controls, same discipline as everywhere: the per-key majority set,
     and the set read off the body's velocity — which lags behind the hands at
     exactly these moments, which is the point of grading here. This is the
     owner's ruling of 2026-08-27 as arithmetic: a key press has meaning taken
     WITH the situation, so the hands are scored at the moments a situation
     produced a new answer. */
  /* AND IT IS GIVEN DECIDE_WIN FRAMES TO ANSWER, BECAUSE YOU ARE TOO.
   *
   * Graded on the exact frame of the change, this asked the Mirror to
   * ANTICIPATE a decision whose cause it may not be able to see — and nothing
   * causal can. Measured: against a strictly periodic player it called the new
   * key set on the frame 11% of the time and WITHIN THREE FRAMES 92%, missing
   * entirely 4 times in 780. It really does move with you; it is a beat behind,
   * which is what following looks like.
   *
   * The fairness rule decides it. You cannot anticipate the Mirror's key
   * changes either — you react to them — so grading it on anticipation holds
   * it to a standard you are not held to, and this is a fair game. It gets the
   * same grace a hand gets.
   *
   * THE CONTROLS GET THE SAME WINDOW, or the comparison is rigged. That is not
   * a formality: after a change the body's velocity swings to reveal the new
   * keys, so a window could have handed the velocity control the answer and
   * collapsed the edge to nothing again. Measured with the window on all three
   * (probe-hands.html, WIN=3):
   *
   *     teacher      model   majority   velocity   edge
   *     duelist       72.8      49.1       26.5    +46.6%
   *     metronome     91.7      50.0        0.0    +83.4%
   *     coinflip       0.1       0.0       30.0    negative -> 0
   *
   * The random player scores BELOW its own control and floors at zero, which
   * is the only reason the other two numbers are worth anything. */
  {
    /* NO ALLOCATION IN HERE. This block runs on EVERY frame, and the first
       version built three 4-element arrays and a closure each time -- measured
       at 938 us per sim tick before and 1642 us after, a 75% regression for a
       measurement that changes no behaviour at all. The guesses are written
       into scratch that lives on the policy and the comparison is spelled out
       rather than closed over. In a hot loop, look at allocation first. */
    /* ONLY ON THE FRAMES THAT CAN MATTER. A decision is open for at most
       DECIDE_WIN frames after a key change, so this has work to do on roughly
       a third of frames -- and the four sig() calls below are the expensive
       part. Run unconditionally it charged the whole session for a measurement
       that is idle most of the time. */
    /* SEEDED BEFORE THE GATE IS TESTED. Left inside it, this deadlocked: the
       gate opens only on a change or an open decision, `changedNow` is false
       while lastKeys is null, and lastKeys was only ever assigned inside the
       gate -- so it stayed null, the gate never opened, and the whole hands
       grade silently measured nothing (the metronome read 0%). An
       initialisation that the guard depends on cannot live behind the guard. */
    if (p.lastKeys === null) p.lastKeys = [y[0], y[1], y[2], y[3]];
    const changedNow =
      (y[0] !== p.lastKeys[0] || y[1] !== p.lastKeys[1] ||
       y[2] !== p.lastKeys[2] || y[3] !== p.lastKeys[3]);
    if (p.pend || changedNow) {
    const vx = x[23], vz = x[24];
    const G = DEC_G;                     /* [m0..m3, b0..b3, v0..v3] scratch */
    G[0] = sig(o[0]) > 0.5 ? 1 : 0; G[1] = sig(o[1]) > 0.5 ? 1 : 0;
    G[2] = sig(o[2]) > 0.5 ? 1 : 0; G[3] = sig(o[3]) > 0.5 ? 1 : 0;
    G[4] = p.keyRate[0] > 0.5 ? 1 : 0; G[5] = p.keyRate[1] > 0.5 ? 1 : 0;
    G[6] = p.keyRate[2] > 0.5 ? 1 : 0; G[7] = p.keyRate[3] > 0.5 ? 1 : 0;
    G[8] = (vz < -0.3) ? 1 : 0; G[9] = (vx < -0.3) ? 1 : 0;
    G[10] = (vz > 0.3) ? 1 : 0; G[11] = (vx > 0.3) ? 1 : 0;
    const q = p.pend;
    if (q) {
      const w = q.want;
      if (!q.hitM) q.hitM = G[0] === w[0] && G[1] === w[1] && G[2] === w[2] && G[3] === w[3];
      if (!q.hitB) q.hitB = G[4] === w[0] && G[5] === w[1] && G[6] === w[2] && G[7] === w[3];
      if (!q.hitV) q.hitV = G[8] === w[0] && G[9] === w[1] && G[10] === w[2] && G[11] === w[3];
      /* a pending is abandoned the moment the hand moves on: judging it
         against a target the player has already left is not a fair question */
      const moved = !(y[0] === q.want[0] && y[1] === q.want[1] &&
                      y[2] === q.want[2] && y[3] === q.want[3]);
      if (moved || ++q.age > DECIDE_WIN) {
        /* decisions arrive at one or two a second, not sixty, so the gain is
           raised to settle over about a minute of play. Seeded on its own
           first sample with its own count, per the rule above. */
        const firstD = seed(p.decN);
        p.decAgree = ema(p.decAgree, q.hitM ? 1 : 0, 0.01, firstD);
        p.decBase  = ema(p.decBase,  q.hitB ? 1 : 0, 0.01, firstD);
        p.decVel   = ema(p.decVel,   q.hitV ? 1 : 0, 0.01, firstD);
        p.decN++;
        p.pend = null;
      }
    }
    if (changedNow && !p.pend) {
      /* the one allocation, and it happens once per DECISION (a few a second),
         not once per frame */
      const want = [y[0], y[1], y[2], y[3]];
      p.pend = { want, age: 0,
                 hitM: G[0] === want[0] && G[1] === want[1] && G[2] === want[2] && G[3] === want[3],
                 hitB: G[4] === want[0] && G[5] === want[1] && G[6] === want[2] && G[7] === want[3],
                 hitV: G[8] === want[0] && G[9] === want[1] && G[10] === want[2] && G[11] === want[3] };
    }
    for (let k = 0; k < 4; k++) p.lastKeys[k] = y[k];
    }
  }
  /* WHICH DIRECTION, against the laziest possible answer: always pick whichever
     direction the player picks most often. Scored on the bin, because the aim is
     now a choice among directions rather than a number. */
  {
    let want = 0, got = 0, bestP = -1;
    for (let i = 0; i < NAIM; i++) {
      if (y[5 + i] > 0.5) want = i;
      if (o[5 + i] > bestP) { bestP = o[5 + i]; got = i; }
    }
    p.binRate[want] = ema(p.binRate[want], 1, E, first);
    for (let i = 0; i < NAIM; i++)
      if (i !== want) p.binRate[i] = ema(p.binRate[i], 0, E, first);
    let top = 0;
    for (let i = 0; i < NAIM; i++) if (p.binRate[i] > top) top = p.binRate[i];
    p.aimHit = ema(p.aimHit, got === want ? 1 : 0, E, first);
    p.aimBase = ema(p.aimBase, top, E, first);
  }

  const pf = sig(o[4]);
  /* these two are fed only on the frames they describe, so they get their own
     counts — a shared one would leave whichever is rarer averaging from zero */
  if (y[4] > 0.5) { p.pOn = ema(p.pOn, pf, 0.02, seed(p.fireN)); p.fireN++; }
  else { p.pOff = ema(p.pOff, pf, 0.002, seed(p.noFireN)); p.noFireN++; }
  /* how outnumbered the firing frames are, measured as they arrive */
  p.fireRate = ema(p.fireRate, y[4] > 0.5 ? 1 : 0, E, first);
  /* AND SPLIT BY WHETHER A ROUND COULD ACTUALLY REACH ANYBODY. One rate is not
     enough to describe a trigger: a player fires on 4.11% of the frames where
     they have a shot and 0.22% of the frames where they do not, and those are
     two different habits. Matching only the total let the Mirror satisfy it in
     the cheapest way available — blind frames outnumber clear ones ten to one,
     so lifting those alone balanced the books while the shots that could have
     hit something went UNDER the player's rate. It fired less than you when it
     had you in the open and more than you at walls. */
  /* AND THE TWO THE TRIGGER CALIBRATION STEERS ON. A line is clear on about a
     tenth of frames, so these two fill at very different speeds; starting both
     at zero handed the controller a false error for its first minute, on the
     one channel that then walks to a clamp it takes half a minute to leave. */
  /* THE TWO SIDES DO NOT SHARE A DENOMINATOR, AND TRYING TO MAKE THEM MADE IT
     WORSE. sim.js counts the Mirror only on frames where a shot was available;
     this counts the player on every frame. That asymmetry is real and it is
     written up in HANDOFF section 66 -- but gating this side by the same rule,
     derived from x[26]/x[34]/x[35], drove rateYouLine to exactly 0.000% and the
     trigger bias to -4.5, and the Mirror fired LESS (duellist 38 shots -> 29,
     gap 506 ms -> 698 ms). Measured, reverted, left alone. Do not re-apply this
     without measuring rateYouLine directly: it is the number that collapses. */
  if (x[21] > 0.5) {
    p.rateYouLine = ema(p.rateYouLine, y[4] > 0.5 ? 1 : 0, E, seed(p.lineN));
    p.lineN = (p.lineN || 0) + 1;
    /* and the per-life tally the best-pace ratchet reads at endYouLife() */
    p.lifeLineN = (p.lifeLineN || 0) + 1;
    if (y[4] > 0.5) p.lifeFireN = (p.lifeFireN || 0) + 1;
  } else {
    p.rateYouBlind = ema(p.rateYouBlind, y[4] > 0.5 ? 1 : 0, E, seed(p.blindN));
    p.blindN = (p.blindN || 0) + 1;
  }
  p.posW = clamp((1 - p.fireRate) / Math.max(0.004, p.fireRate), 1, 12);

  p.bx.set(x, p.head * OBS); p.by.set(y, p.head * ACT);
  /* A RELOAD IS AN EVENT; THE LESSON HAS TO BE A STATE.
   *
   * The press is one frame. Taught as one frame among hundreds, the head can
   * only learn the RATE at which reloads happen — and at convergence that is
   * exactly what it did learn: measured live at 930,000 lessons, P(reload) was
   * 6e-6 whether the magazine was full or empty, an expected 45 MINUTES of
   * standing on an empty gun. 42,111 dry clicks against 27 reloads. "It never
   * reloads" was literal, and the more it learned the worse it got, because
   * converging on the marginal rate is the imitation working correctly on the
   * wrong target.
   *
   * So when the player presses reload, the frames they just spent on a LOW
   * MAGAZINE — the state their press answered — are relabelled as wanting the
   * reload too. This invents nothing: it only ever amplifies a reload the
   * player actually performed into the state that caused it, and a player who
   * never reloads never labels anything. The threshold is ~4 rounds (0.21 of a
   * 20-round magazine), the window is capped at 90 frames, and the walk stops
   * at the refill boundary of the previous reload because those frames sit
   * above the threshold.
   *
   * Measured, 6 seeds, deterministic instrument, against a dry-style teacher:
   * life spent empty 50.3% -> 0.0%, dry clicks 597 -> 0, and the conditioning
   * ratio P(reload|empty)/P(reload|full) went from 2.4 to ~160,000 — it
   * reloads BECAUSE it is empty, categorically. Wiring the rehearsal's PPO
   * into the reload net was measured in the same sweep and did nothing (0 of
   * 6 seeds better); the reload stays imitation-only. */
  if (y[RELOAD] > 0.5) {
    /* THE THRESHOLD IS THE PLAYER'S OWN, PER PRESS — the magazine level at
       which THIS reload happened, not a constant chosen here. A fixed 0.21 was
       measured to never fire for a player who tops up at eight rounds to feel
       safe (their magazine never visits the window), leaving them with the old
       starving Mirror; the press-level threshold fires for every style and
       teaches each player's habit back to them. Whatever made them press —
       pressure, safety, an empty gun — is in the other numbers of the labelled
       frames, so the net can learn the context along with the level. */
    /* PRESS LEVEL PLUS THE APPROACH. A margin of 0.03 never fired at all: the
       frame before the press sits one round ABOVE the press level (that crossing
       is why they pressed), so the walk-back broke on its first step and the
       label was dead for every style -- measured as byte-identical results to no
       label, and the dry cure regressing from 0% empty to 56%. The window is
       their own level plus the ~4-round descent into it: a dry reloader keeps
       exactly the proven cure, a cautious one gets the approach to their own
       level labelled. */
    const at = x[34] + 0.21;
    for (let b = 1; b <= 45 && b < p.n; b++) {
      const i = (p.head - 1 - b + NET.BUF * 2) % NET.BUF;
      if (p.bx[i * OBS + 34] > at) break;
      p.by[i * ACT + RELOAD] = 1;
    }
  }
  /* DAMAGE ARRIVES AFTER THE DECISION THAT CAUSED IT -- rounds are in flight
     for about half a second -- so whatever landed since the last frame belongs
     to the last frame. Same reasoning as noteSelf() uses for the Mirror. */
  if (p.youLifeN > 0) p.brew[(p.head - 1 + NET.BUF) % NET.BUF] = p.youPend;
  p.youPend = 0;
  p.brew[p.head] = 0;
  p.bq[p.head] = 0;              /* unscored until the round it belongs to ends */
  p.youLifeN++;
  p.head = (p.head + 1) % NET.BUF;
  p.n = Math.min(p.n + 1, NET.BUF);
  if (p.n < 60) return;
  for (let s = 0; s < NET.STEPS; s++) {
    /* half the draws from the newest eighth, so a change of style lands */
    const recent = Math.min(512, p.n);
    let r = p.rnd() < 0.5
      ? Math.floor(p.rnd() * p.n)
      : (p.head - 1 - Math.floor(p.rnd() * recent) + NET.BUF * 2) % NET.BUF % Math.max(1, p.n);
    /* and the moments that worked get drawn more often. A tournament rather
       than a weighted table: no allocation, no cumulative sums to maintain,
       and the strength is one integer. */
    for (let k = 0; k < p.bestW; k++) {
      const c = p.rnd() < 0.5
        ? Math.floor(p.rnd() * p.n)
        : (p.head - 1 - Math.floor(p.rnd() * recent) + NET.BUF * 2) % NET.BUF % Math.max(1, p.n);
      if (p.bq[c] > p.bq[r]) r = c;
    }
    const ref = REFL[Math.floor(p.rnd() * 4)];
    reflect(ref, p.bx.subarray(r * OBS, r * OBS + OBS),
                 p.by.subarray(r * ACT, r * ACT + ACT));
    /* what the AUGMENTED stream actually looks like - if the four
       reflections are right, W and S must match and A and D must match */
    for (let k = 0; k < 4; k++) p.augRate[k] += ry[k];
    p.augN++;
    stepOne(p, rx, ry);
    p.lessons++;
  }
}

/* THE DRIVE
 * ==========================================================================
 *
 * Everything above answers "what would they have done here". Nothing in it wants
 * anything. This is the half that wants something: to hurt the player.
 *
 * IT IS NOT A SECOND BRAIN. It is a second pressure on the same weights. The
 * imitation loss keeps saying "be like them"; this says "of the things you have
 * learned to do, do more of what worked". It can only ever re-weight actions the
 * imitation has already taught — it has no way to invent one, because the only
 * thing it does is push the probability of an action the policy ALREADY chose up
 * or down. On an empty brain there is nothing to push, which is exactly the
 * shape the user described: at round one it wants to kill and cannot, and it
 * stays that way until it has watched somebody do it.
 *
 * THE REWARD IS DAMAGE, AND NOTHING ELSE. No points for holding a range, for
 * finding a line, for peeking, for closing distance. Every one of those would be
 * a hand-written tactic wearing a reward's clothes, and this project has been
 * burnt by exactly that dressed as something else. If a habit is worth having,
 * it has to fall out of "this led to hurting them".
 *
 * CREDIT REACHES BACK. A round takes about half a second to arrive, so the frame
 * that earned a hit is long gone by the time it lands. An eligibility trace — one
 * decayed copy of the gradient of log-probability, accumulated every frame — is
 * the standard way to pay the actions that led to an outcome rather than the one
 * that happened to be running when it arrived.
 */
/* WHAT THE MEASUREMENT SAID, before anybody turns this on hoping.
 *
 * Twelve sessions of five minutes produced **41 reward events** — about three
 * and a half damage landings each — against roughly 17,000 frames of imitation
 * per session. The reward signal is some five thousand times sparser than the
 * one it is competing with, and a learning rule cannot extract a policy from
 * three samples. Swept, the harm scales exactly with how hard it is applied:
 *
 *     drive LR        it killed the player      its accuracy
 *     0 (off)                          10              8.2%
 *     0.00002                          10              8.1%
 *     0.0001                            8              7.2%
 *     0.0006                            6              6.2%
 *
 * This is not a defect in the implementation. It is the difference between
 * imitation and reinforcement: cloning learns from every frame, a reward learns
 * only from the rare moments something happens. It is exactly why reinforcement
 * learning is quoted in millions of episodes and cloning in minutes.
 *
 * Two things would change it, and both cost something the project has refused:
 *   - FAR more experience than a human can supply, which means self-play.
 *   - A DENSER reward — points for range, for a line, for being on target — and
 *     every one of those is a hand-written tactic wearing a reward's clothes.
 */
/* WHAT ACTUALLY CAME OUT OF THE BARREL, which is not what was asked for. The
   rate controller counted the pulls the policy WANTED while the player's rate
   counted shots that actually left after the shared 190 ms cap — so every
   refused pull inflated the Mirror's side and it fired 261 rounds against a
   player's 997 at the same accuracy.

   THE ERROR IS A RATIO, NOT A DIFFERENCE. These rates span orders of magnitude,
   and a controller driven by their difference moved its bias by about 1.4 over a
   whole session and never arrived. A bias clamped at -8 also cannot express
   "never": sig(-8) still fires on one frame in three thousand, which over 97% of
   frames is a quarter of its shots. */
/* HOISTED OUT OF noteFired(). It was rebuilt on every call, and fixing the
   cadence gate in sim.js tripled how often that call happens. A closure in a
   per-frame path is an allocation in a per-frame path. */
/* HOW FAST IT LEARNS YOUR RATE OF FIRE.
 *
 * These were a per-FRAME time constant, and this loop does not get a frame's
 * worth of evidence per frame. `biasLine` only updates when the Mirror could
 * fire AND had a line -- measured, 467 updates in a 120 s session against 7200
 * frames -- while the EMA it steers on has a time constant of 1/A = 667
 * updates. Both the measurement and the controller were therefore slower than
 * a whole session:
 *
 *     player fires on 15-20% of its line frames, Mirror on 4.4%
 *     biasLine needs about +3.0 to close that, gains ~1.5 a session
 *
 * So it took roughly two sessions to match a rate the player set in one round,
 * and in the meantime the Mirror fires every 889 ms against a player firing
 * every 338 ms -- which reads, correctly, as "it had the angle and did not
 * shoot". Scaled by TRIG_K together, so the ratio between how fast the
 * controller moves and how fast its own measurement updates is unchanged: that
 * ratio is what the original note was protecting against oscillation, and it is
 * preserved exactly. */
const TRIG_K = 1;   /* 4 was tried, both ways; see the measurements below */
/* TWO SPEED-UPS TRIED, BOTH MEASURED, NEITHER KEPT. The loop is genuinely too
   slow -- it needs about two sessions to match a rate the player sets in one
   round -- but it is UNDER-DAMPED rather than merely slow, and speeding it up
   makes it miss in both directions instead of one:

     TRIG_K=4 on A and GAIN   tapper's Mirror 26.5% of line frames vs its
                              player's 7.1%, and copies-tempo INVERTED
                              (24/min at a sprayer, 40/min at a tapper)
     TRIG_K=4 on A only       both Mirrors converge to ~12% regardless of
                              whether their player fires at 20% or 5%

   The second is the more informative failure. The NET does learn the
   difference -- backing the bias out leaves it at 7.4% for the sprayer's
   Mirror and 0.8% for the tapper's -- and then the controller drags both to a
   common value, overshooting the slow shooter and undershooting the fast one.
   So the trigger RATE is not unlearned; it is learned and then flattened by
   the loop that exists to fix a different problem (blind versus line).
   Whatever fixes this is a control-design change, not a constant. */
const NF = { A: 0.0015 * TRIG_K, GAIN: 0.004, LIM: 8 };
function nfStep(got, want, bias) {
    /* NO EVIDENCE MEANS RELAX, NOT HOLD.
     *
     * This is an integrator, and an integrator with nothing to integrate keeps
     * whatever extreme it last reached. Measured: biasBlind sat at exactly -8.00
     * — the clamp — for two hundred seconds, with BOTH rates at 0.00000, so the
     * error was zero and nothing moved it. The Mirror had stopped firing blind,
     * which is what made both rates zero, which is what kept it from ever firing
     * blind again. The player felt it as the AI going quiet and never coming
     * back.
     *
     * Below one event per averaging window neither rate carries information, so
     * the bias leaks toward neutral at a quarter of the gain. It is not a nudge
     * toward firing — neutral is whatever the policy itself would do. */
    if (Math.max(want, got) < NF.A * 0.5)
      return bias - Math.sign(bias) * Math.min(Math.abs(bias), NF.GAIN * 0.25);
    const scale = Math.max(want, got, 1e-4);
    return clamp(bias + clamp((want - got) / scale, -1, 1) * NF.GAIN, -NF.LIM, NF.LIM);
  }

export function noteFired(p, didFire, hadLine, rawLogit) {
  /* THE INTEGRATOR STAYS. The solve below was built to replace it and LOST
     its own paired A/B (dev_log/audit/probe-trig.html, 6 personas x 300 s,
     2026-08-28): median rms log-ratio 1.411 against the integrator's 0.655,
     1 win in 6 pairs, with sessions landing at 0.05x and 3.67x of the
     player's rate -- a tight spread around the WRONG value, which is the
     TRIG_K=4 failure again wearing an equation. The mean-field step is where
     it breaks: the fire logits are spread over several units, so the rate at
     the MEAN logit is not the mean RATE, and the gap lands differently on
     every trained policy. Kept behind `solveTrig` for future control work;
     the oscillation it was meant to cure (0.27x..2.36x over an hour, HANDOFF
     73) is still open, and still preferable to being confidently wrong. */
  if (p.solveTrig && rawLogit !== undefined) return noteFiredSolve(p, didFire, hadLine, rawLogit);
  return noteFiredWalk(p, didFire, hadLine);
}

/* THE SOLVE. The integrator above it is kept behind `oldTrig` for ablation.
 *
 * The TRIG_K=4 experiment (above) established the decisive fact: the NET
 * learns the player's rate correctly -- backing the bias out left 7.4% for a
 * sprayer's Mirror and 0.8% for a tapper's -- and the integrator then drags
 * both toward a common value. And the visible-QC run measured what the
 * integrator does when it neither dies nor flattens: it OSCILLATES, swinging
 * the Mirror between 0.27x and 2.36x of the player's rate across one hour,
 * biasLine wandering 0.02..3.12, because it pushes until its own lagging EMA
 * catches up and then discovers it has pushed twice as far as needed.
 *
 * So: stop walking, solve. The trigger fires with sig(logit + bias); hold a
 * running mean of the logit on the same frames the rate is measured on, and
 * the bias that makes the MEAN fire probability equal the player's rate is
 * simply logit(target) - meanLogit. Computed, not integrated: it cannot wind
 * up, cannot overshoot its own measurement, and cannot freeze at a clamp the
 * way the old loop did when both rates hit zero -- the mean logit updates on
 * every could-fire frame whether or not the trigger goes, so the deadlock
 * "it stopped firing, so nothing updates, so it never fires again" has no
 * closed loop to live in. A mean-field approximation: exact for a constant
 * logit, slightly optimistic for a spread of them (Jensen), which against the
 * 2.4x swings it replaces is noise.
 *
 * The blend (0.25 toward the solved value per sample) is smoothing, not
 * control: the inputs are EMAs with tau ~11 s of line-time, and snapping the
 * bias to every twitch of a noisy mean would put that noise straight on the
 * trigger. Fifteen-ish samples to settle, against ~4000 for the walk. */
function noteFiredSolve(p, didFire, hadLine, rawLogit) {
  const A = NF.A;
  const solve = (target, mean) => {
    const tgt = clamp(target, 1e-4, 0.5);
    return clamp(Math.log(tgt / (1 - tgt)) - mean, -NF.LIM, NF.LIM);
  };
  if (hadLine) {
    p.rateItLine = p.rateItLine * (1 - A) + (didFire ? A : 0);
    p.logitLineN++;
    p.logitLine = p.logitLineN === 1 ? rawLogit : p.logitLine * (1 - A) + rawLogit * A;
    p.biasLine += 0.25 * (solve(p.rateYouLine, p.logitLine) - p.biasLine);
  } else {
    p.rateItBlind = p.rateItBlind * (1 - A) + (didFire ? A : 0);
    p.logitBlindN++;
    p.logitBlind = p.logitBlindN === 1 ? rawLogit : p.logitBlind * (1 - A) + rawLogit * A;
    p.biasBlind += 0.25 * (solve(p.rateYouBlind, p.logitBlind) - p.biasBlind);
  }
  p.rateIt = p.rateIt * (1 - A) + (didFire ? A : 0);
}

function noteFiredWalk(p, didFire, hadLine) {
  /* LIM USED TO BE 15, AND THAT IS WHY IT COULD NOT COME BACK.
   *
   * This is an integrator: the bias walks at GAIN per frame while the error is
   * full-scale, so climbing out of a saturated clamp takes LIM/GAIN frames —
   * 3750, or 62 SECONDS of firing at every opportunity, at 15. Measured in the
   * session where the player reported "after eight rounds the AI stopped
   * shooting me", biasBlind had reached -8.2 and was still falling; a fresh
   * policy watching an idle player reaches the floor at -15.
   *
   * Nothing above 8 buys any behaviour. sig(-8) is 3.4e-4, which at sixty
   * frames a second is one attempted shot every fifty seconds — already "never"
   * — and sig(-15) is a thousand times less never. So the clamp costs nothing
   * to tighten and halves the worst-case recovery to about thirty seconds.
   *
   * GAIN stays where it is: the rates it steers are EMAs with a time constant
   * of 1/A, about eleven seconds, and a controller that moved much faster than
   * its own measurement updates would oscillate rather than settle. */
  const A = NF.A;   /* see TRIG_K above: this loop is sample-starved, not slow */
  if (hadLine) {
    p.rateItLine = p.rateItLine * (1 - A) + (didFire ? A : 0);
    /* THE TARGET IS THE BEST OF YOU, HELD — the owner's rule, verbatim: "once
       it finds the best version of me in term of shooting or anything else it
       should keep use these things it learn from me to kill until the new
       best version of me shows up." The old target was the CURRENT measured
       pace, which sags whenever the player has a quiet spell — so the Mirror
       eased off exactly when the player did, and the owner felt it "shooting
       less than it need to be". Now the target only moves up: the highest
       pace the player has demonstrated. A fixed target also gives this
       integrator something it can actually settle on — half of the
       oscillation was the target itself wandering.

       THE BEST IS MEASURED PER LIFE, AT endYouLife() — see the note there
       for the two cheaper readings of "best" that failed their A/B before
       this one (the current pace sags; the highest instant overshoots
       4-40x, because a pace during one point-blank second is not a pace
       anyone sustains).

       LINE SIDE ONLY, deliberately. The no-line side copies a HABIT (whether
       you fire at things you cannot see), not a skill — ratcheting it would
       grow the known wall-spraying regression (HANDOFF 75), so it still
       tracks your current behaviour. `noRatchet: 1` restores the old target
       for ablation. */
    p.biasLine = nfStep(p.rateItLine,
                        p.noRatchet ? p.rateYouLine : Math.max(p.rateYouLineBest || 0, p.rateYouLine),
                        p.biasLine);
  } else {
    p.rateItBlind = p.rateItBlind * (1 - A) + (didFire ? A : 0);
    p.biasBlind = nfStep(p.rateItBlind, p.rateYouBlind, p.biasBlind);
  }
  p.rateIt = p.rateIt * (1 - A) + (didFire ? A : 0);
}

export const DRIVE = {
  LR: 0.0006,      /* small next to imitation's 0.012: the copy leads, the drive nudges */
  LAMBDA: 0.98,    /* ~0.8 s of credit, about two flight times */
  SIGMA: 0.25,     /* exploration on the turn, in squashed units */
};

function zerosLike(p) {
  return { w1: new Float32Array(p.w1.length), b1: new Float32Array(p.b1.length),
           w2: new Float32Array(p.w2.length), b2: new Float32Array(p.b2.length),
           w3: new Float32Array(p.w3.length), b3: new Float32Array(p.b3.length) };
}

/* Accumulate d(-log pi)/d(theta) for the action actually taken, into the trace.
   Reusing the descent machinery: for a sampled Bernoulli the gradient of the log
   probability with respect to the logit is (a - prob), so the DESCENT direction
   is (prob - a) and everything below is the same backward pass the imitation
   uses. Nothing here knows what the action was FOR. */
const tdH2 = new Float32Array(64), tdH1 = new Float32Array(64);
export function traceAction(p, x, took, turnEps) {
  if (!p.el) p.el = zerosLike(p);
  const el = p.el, L = DRIVE.LAMBDA;
  for (const k of ['w1', 'b1', 'w2', 'b2', 'w3', 'b3'])
    for (let i = 0; i < el[k].length; i++) el[k][i] *= L;

  const o = forwardAgent(p, x);
  const err = ERR;
  for (let k = 0; k < 4; k++) err[k] = sig(o[k]) - (took.keys[k] ? 1 : 0);
  err[4] = sig(o[4]) - (took.fire ? 1 : 0);
  /* the aim is a categorical, so the gradient of its log-probability is
     (softmax - onehot of the bin actually chosen) */
  let mx2 = -1e9;
  for (let i = 0; i < NAIM; i++) if (o[5 + i] > mx2) mx2 = o[5 + i];
  let z2 = 0;
  for (let i = 0; i < NAIM; i++) { AP[i] = Math.exp(o[5 + i] - mx2); z2 += AP[i]; }
  for (let i = 0; i < NAIM; i++) err[5 + i] = AP[i] / z2 - (i === took.bin ? 1 : 0);

  tdH2.fill(0);
  for (let k = 0; k < NET.OUT; k++) {
    const g = err[k], off = k * NET.H2;
    for (let j = 0; j < NET.H2; j++) {
      tdH2[j] += p.w3[off + j] * g;
      el.w3[off + j] += g * p.h2[j];
    }
    el.b3[k] += g;
  }
  tdH1.fill(0);
  for (let j = 0; j < NET.H2; j++) {
    const d = tdH2[j] * (1 - p.h2[j] * p.h2[j]), off = j * NET.H1;
    for (let i = 0; i < NET.H1; i++) {
      tdH1[i] += p.w2[off + i] * d;
      el.w2[off + i] += d * p.h1[i];
    }
    el.b2[j] += d;
  }
  for (let j = 0; j < NET.H1; j++) {
    const d = tdH1[j] * (1 - p.h1[j] * p.h1[j]), off = j * NET.IN;
    for (let i = 0; i < NET.IN; i++) el.w1[off + i] += d * x[i];
    el.b1[j] += d;
  }
}

/* Damage it landed, banked until the end of the frame. */
export function reward(p, r) {
  p.pendingR = (p.pendingR || 0) + r;
  p.rewardTotal = (p.rewardTotal || 0) + r;
  p.rewardN = (p.rewardN || 0) + 1;
}

/* THE FRAMES THAT EARNED NOTHING HAVE TO LOSE SOMETHING.
 *
 * Paying only when a hit lands pushes UP every action in the trace and never
 * pushes anything down, so the policy drifts toward whatever it happens to do
 * most rather than toward what works — measured, it took the Mirror from ten
 * kills to seven. What makes reinforcement discriminate is the BASELINE: the
 * advantage of this frame over an average one. A frame that earns nothing scores
 * slightly below average and its actions are made slightly less likely; a frame
 * that lands a round scores far above and its whole trace is reinforced.
 *
 * Called once per frame per body, whether or not anything happened. */
export function driveTick(p) {
  if (!p.el || !p.drive) return;
  const r = p.pendingR || 0;
  p.pendingR = 0;
  const adv = r - (p.rBar || 0);
  p.rBar = (p.rBar || 0) * 0.9995 + r * 0.0005;
  if (!adv) return;
  const lr = (p.driveLR === undefined ? DRIVE.LR : p.driveLR) * adv;
  const el = p.el;
  for (const k of ['w1', 'b1', 'w2', 'b2', 'w3', 'b3'])
    for (let i = 0; i < p[k].length; i++) p[k][i] -= lr * el[k][i];
}

/* PROXIMAL POLICY OPTIMISATION
 * ==========================================================================
 *
 * The drive that was tried first was REINFORCE with an eligibility trace and a
 * scalar baseline, and it made the Mirror monotonically worse the harder it was
 * applied. That was not a tuning failure — it was missing four things that every
 * working implementation has, and the research pass found them all in one place:
 *
 *   A CRITIC, so the advantage is "better than expected from this state" rather
 *   than "better than the average frame anywhere".
 *   GAE, so credit decays over the steps that actually led to the outcome
 *   instead of over a fixed window.
 *   CLIPPING, so a surprising advantage cannot move the policy off a cliff. This
 *   is the one that matters most here: without it, every update was free to
 *   destroy behaviour that imitation had got right.
 *   AN ENTROPY BONUS, so it keeps exploring rather than collapsing onto one key.
 *
 * The action is factored — four Bernoulli keys, a Bernoulli trigger, and one
 * categorical over aim directions — so the log-probability is the sum of the
 * parts and the gradient of each part is its own standard form.
 */
export const PPO = {
  GAMMA: 0.99, LAMBDA: 0.95, CLIP: 0.2, EPOCHS: 4, MINIBATCH: 256,
  LR: 0.0003, VF: 0.5, ENT: 0.01,
};

/* the log-probability of the action actually taken, and its entropy */
/* ONLY THE PARTS THAT WERE ACTUALLY DECIDED THIS FRAME COUNT.
 *
 * The keys are re-sampled once every DECIDE_EVERY frames and held in between,
 * because a hand does not re-decide sixty times a second. That makes them a
 * decision on one frame in five and an inheritance on the other four — and a
 * policy gradient that treats an inherited action as a sampled one is computing
 * the probability of something the policy never drew. Measured, the resulting
 * ratios drove the Mirror from 185 shots a rollout to zero.
 *
 * `took.fresh` says whether the keys were drawn this frame. When they were not,
 * they are simply not part of the objective. */
export function actionLogProb(o, took) {
  let lp = 0, ent = 0;
  const nk = took.fresh === false ? 4 : 0;   /* skip the four key terms */
  for (let k = nk; k < 5; k++) {
    const q = sig(o[k]);
    const a = k < 4 ? (took.keys[k] ? 1 : 0) : (took.fire ? 1 : 0);
    lp += a ? Math.log(Math.max(1e-8, q)) : Math.log(Math.max(1e-8, 1 - q));
    ent += -(q * Math.log(Math.max(1e-8, q)) + (1 - q) * Math.log(Math.max(1e-8, 1 - q)));
  }
  let mx = -1e9;
  for (let i = 0; i < NAIM; i++) if (o[5 + i] > mx) mx = o[5 + i];
  let z = 0;
  for (let i = 0; i < NAIM; i++) { AP[i] = Math.exp(o[5 + i] - mx); z += AP[i]; }
  for (let i = 0; i < NAIM; i++) AP[i] /= z;
  {
    const q = sig(o[RELOAD]);
    const a = took.reload ? 1 : 0;
    lp += a ? Math.log(Math.max(1e-8, q)) : Math.log(Math.max(1e-8, 1 - q));
    ent += -(q * Math.log(Math.max(1e-8, q)) + (1 - q) * Math.log(Math.max(1e-8, 1 - q)));
  }
  lp += Math.log(Math.max(1e-8, AP[took.bin]));
  for (let i = 0; i < NAIM; i++) ent += -AP[i] * Math.log(Math.max(1e-8, AP[i]));
  return { lp, ent };
}

/* One PPO minibatch. `b` carries the observations, the actions taken, the
   log-probabilities they had when taken, and the advantages and returns. */
const pdH2 = new Float32Array(64), pdH1 = new Float32Array(64);
export function ppoBatch(p, b, idx, from, to) {
  const lr = PPO.LR;
  for (let n = from; n < to; n++) {
    const i = idx[n];
    const x = b.obs.subarray(i * OBS, i * OBS + OBS);
    const o = forwardAgent(p, x);
    const took = { keys: [b.k0[i], b.k1[i], b.k2[i], b.k3[i]], fire: b.fire[i],
                   bin: b.bin[i], fresh: !!b.fresh[i], reload: !!(b.rel && b.rel[i]) };
    const { lp } = actionLogProb(o, took);
    const ratio = Math.exp(clamp(lp - b.logp[i], -8, 8));
    const adv = b.adv[i];
    /* the clipped surrogate: outside the trust region the gradient is zero,
       which is the whole of why this is safe where plain REINFORCE was not */
    const lo = 1 - PPO.CLIP, hi = 1 + PPO.CLIP;
    const active = !((adv > 0 && ratio > hi) || (adv < 0 && ratio < lo));
    /* THE CRITIC HAS TO BE WORTH LISTENING TO FIRST. An untrained value head
       makes every advantage noise, and a policy gradient driven by noise
       suppresses whatever the policy happens to do most — measured, the Mirror
       went from 185 shots a rollout to zero over a hundred minutes of self-play
       and simply stopped acting. For the first rollouts only the critic learns;
       the policy is left exactly as imitation built it. */
    const gCoef = (p.ppoWarm > 8 && active) ? -adv * ratio : 0;

    const err = ERR;
    err.fill(0);
    /* the keys were only a decision on the frames they were drawn on */
    /* the reload head, graded exactly as the trigger is */
    {
      const q = sig(o[RELOAD]);
      err[RELOAD] = gCoef * (q - (took.reload ? 1 : 0));
      err[RELOAD] += PPO.ENT * q * (1 - q) *
        Math.log(Math.max(1e-8, q) / Math.max(1e-8, 1 - q));
    }
    for (let k = took.fresh ? 0 : 4; k < 5; k++) {
      const q = sig(o[k]);
      const a = k < 4 ? (took.keys[k] ? 1 : 0) : (took.fire ? 1 : 0);
      /* d(-logpi)/dz is (q - a); the surrogate scales it */
      err[k] = gCoef * (q - a);
      /* entropy bonus pushes q back toward a half */
      err[k] += PPO.ENT * q * (1 - q) * Math.log(Math.max(1e-8, q) / Math.max(1e-8, 1 - q));
    }
    let mx = -1e9;
    for (let i2 = 0; i2 < NAIM; i2++) if (o[5 + i2] > mx) mx = o[5 + i2];
    let z = 0;
    for (let i2 = 0; i2 < NAIM; i2++) { AP[i2] = Math.exp(o[5 + i2] - mx); z += AP[i2]; }
    let H = 0;
    for (let i2 = 0; i2 < NAIM; i2++) { AP[i2] /= z; H += -AP[i2] * Math.log(Math.max(1e-8, AP[i2])); }
    for (let i2 = 0; i2 < NAIM; i2++) {
      err[5 + i2] = gCoef * (AP[i2] - (i2 === took.bin ? 1 : 0));
      err[5 + i2] += PPO.ENT * AP[i2] * (Math.log(Math.max(1e-8, AP[i2])) + H);
    }
    /* and the critic */
    err[VAL] = PPO.VF * (o[VAL] - b.ret[i]);

    /* the same backward pass everything else here uses */
    pdH2.fill(0);
    /* THE CRITIC GETS ITS OWN HEAD AND NOTHING ELSE.
     *
     * The value output shares this trunk with every policy head, so an
     * `err[VAL]` allowed into `pdH2` rewrites w1 and w2 -- and the policy is
     * a function of w1 and w2. Training the critic therefore moved the
     * trigger, which is not a subtle second-order effect: MEASURED, with the
     * advantage forced to exactly zero so the policy gradient was provably
     * off, ONE 256-sample critic pass cut the Mirror's mean fire probability
     * by 35.7%. The entropy term over the same batch moved it 0.0%.
     *
     * That is what made the Mirror go quiet after a few rounds. `ppoWarm > 8`
     * gates the policy GRADIENT, and the comment there promised the policy was
     * "left exactly as imitation built it" for the first rollouts. It was not.
     * The gate held; the trunk underneath it was being retrained anyway, and
     * since a trigger that fires on ~0.1% of frames has almost no margin, a
     * uniform downward drift reads to the player as an enemy that has stopped
     * shooting. It also leaves the READOUT intact, which is why the report can
     * show trigger 4x while nothing comes out of the gun -- the ranking of
     * frames survives a shift that the absolute rate does not.
     *
     * So the critic updates w3[VAL] and b3[VAL] and stops there. It becomes a
     * linear readout on the features imitation built, which is weaker as a
     * critic and is the point: in this project the policy is what watching the
     * player produced, and the practice fight is only allowed to nudge it.
     * If the critic ever needs real capacity it must get its OWN hidden layers
     * -- never a share of these. */
    for (let k = 0; k < NET.OUT; k++) {
      const g = err[k], off = k * NET.H2;
      if (!g) continue;
      /* `p.criticTrunk` puts the old behaviour back, for the ablation only --
         the same shape as noAnchor / noRehearse / noVel elsewhere. A fix to a
         learning rule is worth nothing without a run of the harness on both
         sides of it, and this is what lets probe-tempo.html measure the two. */
      if (k === VAL && !p.criticTrunk) {
        for (let j = 0; j < NET.H2; j++) p.w3[off + j] -= lr * g * p.h2[j];
      } else {
        for (let j = 0; j < NET.H2; j++) {
          pdH2[j] += p.w3[off + j] * g;
          p.w3[off + j] -= lr * g * p.h2[j];
        }
      }
      p.b3[k] -= lr * g;
    }
    pdH1.fill(0);
    for (let j = 0; j < NET.H2; j++) {
      const d = pdH2[j] * (1 - p.h2[j] * p.h2[j]), off = j * NET.H1;
      for (let i2 = 0; i2 < NET.H1; i2++) {
        pdH1[i2] += p.w2[off + i2] * d;
        p.w2[off + i2] -= lr * d * p.h1[i2];
      }
      p.b2[j] -= lr * d;
    }
    for (let j = 0; j < NET.H1; j++) {
      const d = pdH1[j] * (1 - p.h1[j] * p.h1[j]), off = j * NET.IN;
      for (let i2 = 0; i2 < NET.IN; i2++) p.w1[off + i2] -= lr * d * x[i2];
      p.b1[j] -= lr * d;
    }
  }
}

/* ONE EXTRA PASS OVER SOMETHING ALREADY WATCHED, with no new lesson attached.
   Used by the study beat between rounds: the Mirror goes back over what it saw
   you do rather than only ever learning at sixty hertz in the moment. */
/* ONE FRAME OF ITS OWN PLAY, held pending. Not learned from yet: a frame is
   only worth copying if the life it belonged to turned out well, and that is
   not known until the life ends. */
export function noteSelf(p, x, y) {
  if (!p.selfW || p.lN >= LIFE_BUF) return;
  /* DAMAGE ARRIVES AFTER THE DECISION THAT CAUSED IT. Rounds are in flight for
     about half a second, and the shots loop runs later in the same tick than
     the decision does, so whatever landed since the last frame belongs to the
     last frame, not to this one. */
  if (p.lN > 0) p.lrew[p.lN - 1] = p.pendRew;
  p.pendRew = 0;
  p.lbx.set(x, p.lN * OBS);
  p.lby.set(y, p.lN * ACT);
  p.lrew[p.lN] = 0;
  p.lN++;
}

/* YOUR ROUND ENDED -- score the frames of it by what followed them.
 *
 * Walks back over the frames of the life just finished and gives each one the
 * discounted return of the damage that came after it: landing hits scores
 * positive, taking them scores negative, and a quiet stretch scores near zero.
 * The running mean is kept so "better than usual" means better than YOUR usual
 * rather than better than a number someone chose.
 *
 * Nothing is discarded. Every frame stays in the buffer and stays learnable --
 * this only changes how OFTEN each is drawn. A habit you have in your worst
 * moments is still copied, just less than the one you win with.
 */
export function endYouLife(p) {
  /* THE BEST OF YOU IS A LIFE, NOT A SECOND. The owner's rule: once it finds
     the best version of the player it should keep using it until a better one
     shows up. Two cheaper readings of "best" failed their A/B first: chasing
     the CURRENT pace sags whenever the player has a quiet spell (the owner
     felt it "shooting less than it need to be"), and holding the highest
     INSTANT of the pace estimate locked onto 4-40x the player's real pace,
     because a pace during one point-blank second is not a pace anyone
     sustains. So "best" is now the best whole life: clear-line fires over
     clear-line frames across one life, counted only when the life had at
     least 150 line frames (~2.5 s of actual fighting) to average over. */
  if ((p.lifeLineN || 0) >= 150 && !p.noRatchet)
    p.rateYouLineBest = Math.max(p.rateYouLineBest || 0, p.lifeFireN / p.lifeLineN);
  p.lifeLineN = 0; p.lifeFireN = 0;
  const n = Math.min(p.youLifeN, p.n);
  p.youLifeN = 0;
  if (n < 30) { p.youPend = 0; return 0; }
  p.brew[(p.head - 1 + NET.BUF) % NET.BUF] += p.youPend;
  p.youPend = 0;
  let acc = 0, kept = 0;
  for (let k = 1; k <= n; k++) {
    const i = (p.head - k + NET.BUF * 2) % NET.BUF;
    acc = p.brew[i] + 0.99 * acc;
    p.bq[i] = acc;
    p.qN++; p.qMean += (acc - p.qMean) / p.qN;
    if (acc > p.qMean) kept++;
  }
  p.goodFrames += kept;
  return kept;
}

/* THE LIFE ENDED. Score it, and keep it only if it was better than its own
 * usual — which is the honest control available here: not "better than a
 * version that learned nothing", which cannot be run retroactively, but "better
 * than this policy's own typical round", measured as it goes and with no
 * constant chosen by hand.
 *
 * The score is the exchange itself: damage landed minus damage taken. Nothing
 * about range, cover, or tempo — the same rule the reward has always had.
 */
export function endLife(p) {
  const n = p.lN;
  p.lN = 0;
  const score = p.lifeOut - p.lifeIn;
  p.lifeOut = 0; p.lifeIn = 0;
  if (!p.selfW || n < 30) return;

  /* running mean and variance, Welford, so the gate needs no stored history */
  p.lives++;
  const d = score - p.liveMean;
  p.liveMean += d / p.lives;
  p.liveM2 += d * (score - p.liveMean);
  const sd = p.lives > 1 ? Math.sqrt(p.liveM2 / (p.lives - 1)) : 0;

  /* PER-FRAME, THE PROPER FORM OF THE IDEA. The gates above keep or drop a
   * whole life, which means a lucky round is kept WITH every bad decision
   * inside it and a poor round is dropped WITH the good ones. Measured, that
   * made it monotonically worse the more of it was used.
   *
   * This keeps a DECISION when what followed it beat what usually follows —
   * the return from that frame to the end of the life, against the running mean
   * of all such returns. That is what self-imitation actually means in the
   * literature: copy the moments that turned out better than expected, not the
   * rounds that happened to end well. No constant is chosen here; the thing it
   * must beat is its own measured average. */
  if (p.selfGate === 'frame') {
    p.lrew[n - 1] = p.pendRew; p.pendRew = 0;
    let acc = 0;
    const ret = p.lret || (p.lret = new Float32Array(LIFE_BUF));
    for (let i = n - 1; i >= 0; i--) { acc = p.lrew[i] + 0.99 * acc; ret[i] = acc; }
    let kept = 0;
    for (let i = 0; i < n; i++) {
      p.retN++;
      p.retMean += (ret[i] - p.retMean) / p.retN;
      if (ret[i] <= p.retMean) continue;
      p.sbx.set(p.lbx.subarray(i * OBS, i * OBS + OBS), p.sHead * OBS);
      p.sby.set(p.lby.subarray(i * ACT, i * ACT + ACT), p.sHead * ACT);
      p.sHead = (p.sHead + 1) % NET.BUF;
      p.sN = Math.min(p.sN + 1, NET.BUF);
      kept++;
    }
    if (kept) p.livesKept++;
    p.framesKept = (p.framesKept || 0) + kept;
    return;
  }

  let keep;
  if (p.selfGate === 'all') keep = true;                    /* keep everything */
  else if (p.selfGate === 'sd') keep = score > p.liveMean + sd;  /* clearly, not luckily, better */
  else keep = score > p.liveMean;                           /* better than its usual */
  /* the first few lives have no distribution to be better than */
  if (p.lives < 4) keep = p.selfGate === 'all';
  if (!keep) return;

  p.livesKept++;
  p.framesKept = (p.framesKept || 0) + n;
  for (let i = 0; i < n; i++) {
    p.sbx.set(p.lbx.subarray(i * OBS, i * OBS + OBS), p.sHead * OBS);
    p.sby.set(p.lby.subarray(i * ACT, i * ACT + ACT), p.sHead * ACT);
    p.sHead = (p.sHead + 1) % NET.BUF;
    p.sN = Math.min(p.sN + 1, NET.BUF);
  }
}

/* One gradient step on a frame from a life it is proud of. Exactly the same
   loss, the same reflections, the same everything as studying the player —
   only the buffer differs. */
export function studySelfOnce(p) {
  if (p.sN < 60) return 0;
  const r = Math.floor(p.rnd() * p.sN);
  const ref = REFL[Math.floor(p.rnd() * 4)];
  reflect(ref, p.sbx.subarray(r * OBS, r * OBS + OBS),
               p.sby.subarray(r * ACT, r * ACT + ACT));
  stepOne(p, rx, ry);
  p.lessons++;
  p.selfLessons = (p.selfLessons || 0) + 1;
  return 1;
}

/* THE STUDY BEAT: n passes over the player, and selfW x n over its own best.
 *
 * ADDED, NOT SUBSTITUTED, and the first version of this got it wrong in a way
 * worth recording. It picked ONE source per step with probability selfW, so
 * turning self-learning to a half halved the passes over the player's frames —
 * and the sweep that came out of it was measuring dilution of the thing that
 * works, not the value of the thing being added. Every setting looked worse
 * than the baseline, which is exactly what substitution would produce whether
 * the idea was good or not.
 *
 * The player's frames now always get their full n. What it learned from itself
 * is extra. */
export function studyBeat(p, n) {
  for (let i = 0; i < n; i++) studyOnce(p);
  if (!p.selfW) return n;
  const m = Math.round(n * p.selfW);
  let did = 0;
  for (let i = 0; i < m; i++) did += studySelfOnce(p);
  return n + did;
}

export function studyOnce(p) {
  if (p.n < 60) return;
  let r = Math.floor(p.rnd() * p.n);
  for (let k = 0; k < p.bestW; k++) {
    const c = Math.floor(p.rnd() * p.n);
    if (p.bq[c] > p.bq[r]) r = c;
  }
  const ref = REFL[Math.floor(p.rnd() * 4)];
  reflect(ref, p.bx.subarray(r * OBS, r * OBS + OBS),
               p.by.subarray(r * ACT, r * ACT + ACT));
  stepOne(p, rx, ry);
  p.lessons++;
}

/* Read the policy's answer back as controls. Keys get a little hysteresis
   because a body whose hands flicker at fifty-fifty is not deciding anything;
   the trigger is SAMPLED rather than thresholded, so the rate it pulls at is
   the rate it learned rather than all-or-nothing. */
export const NAMES = ['w', 'a', 's', 'd'];
export const DECIDE_EVERY = 5;   /* frames — about twelve decisions a second */
/* HOW LONG THE HANDS GRADE GIVES IT TO ANSWER A CHANGE. Three frames, ~50 ms:
   a reaction, not a prediction. See the grading block in learn() for why a
   window is the fair question and for the measured effect on the controls. */
export const DECIDE_WIN = 3;
/* MODULE SCOPE, NOT A FIELD ON THE POLICY. Only the player's policy ever calls
   learn(), so one shared buffer is safe -- and keeping it off the policy object
   leaves that object's shape exactly as every hot function already expects it.
   See the perf note in learn(). */
const DEC_G = new Float32Array(12);

/* A POLICY IS SAMPLED, NOT ARGMAXED.
 *
 * Thresholding each key at a half looks like the obvious way to read this and is
 * a trap: when the policy is unsure it puts every key under the line, the body
 * holds nothing, and standing still is a state a player is almost never in — so
 * the next observation is one no lesson ever covered, and it stays there. It is
 * an absorbing state, and a ten-minute rollout duly went from moving 67% of the
 * time in the first minute to 0% by the ninth, all while its key predictions
 * stayed at a 70% edge. The imitation was never the problem; reading it was.
 *
 * Sampling each key at its own probability cannot get stuck, and it reproduces
 * how OFTEN a key is held rather than only when the policy is confident. Once
 * every five frames, not every frame, because a hand does not re-decide sixty
 * times a second and a body that does shivers. */
export function act(p, x, prevKeys, rnd, frame) {
  const o = forwardAgent(p, x);
  let keys = prevKeys;
  const fresh = !keys || (frame % DECIDE_EVERY) === 0;
  if (fresh) {
    keys = new Set();
    for (let k = 0; k < 4; k++) if (rnd() < sig(o[k])) keys.add(NAMES[k]);
  }
  /* WHERE TO POINT, SAMPLED. Twelve directions relative to the bearing to the
     other body; bin 0 is straight at them and the rest fan out, so pointing at a
     doorway is a bin like any other rather than an average of two intentions. A
     regression here predicted the mean of a bimodal target and pointed somewhere
     the player never pointed — measured, two copies aimed at each other 5% of
     the time against a chance of 11%. */
  let mx = -1e9;
  for (let i = 0; i < NAIM; i++) if (o[5 + i] > mx) mx = o[5 + i];
  let z = 0;
  for (let i = 0; i < NAIM; i++) { AP[i] = Math.exp(o[5 + i] - mx); z += AP[i]; }
  let r2 = rnd() * z, bin = NAIM - 1;
  for (let i = 0; i < NAIM; i++) { r2 -= AP[i]; if (r2 <= 0) { bin = i; break; } }
  /* aim inside the bin rather than at its centre, so twelve directions do not
     read as twelve rails */
  const off = AIM_BIN[bin] + (rnd() - 0.5) * 2 * AIM_SPAN[bin];
  const bx = x[16], bz = x[17], bl = Math.hypot(bx, bz);
  const base = bl > 1e-6 ? Math.atan2(bz / bl, bx / bl) : Math.atan2(x[29], x[28]);
  const ba = base + off;
  const aim = [Math.cos(ba), Math.sin(ba)];
  /* the trigger, calibrated to the situation the body is in */
  const fp = sig(o[4] + (x[21] > 0.5 ? p.biasLine : p.biasBlind));
  const fire = rnd() < fp;
  /* THE RELOAD, SAMPLED LIKE EVERYTHING ELSE. No bias and no calibration on this
     one: there is nothing here to correct toward, because a magazine is a fact
     rather than a habit, and the auto-reload in shoot() is the floor under it. */
  const rp = sig(o[RELOAD]);
  /* DECIDED AT THE HAND'S TEMPO, NOT THE SIMULATION'S. Sampled every frame,
     even a small probability above the taught window fires within a second or
     two -- measured as the Mirror reloading ~7 rounds earlier than its teacher,
     whatever the teacher's habit. One decision per DECIDE_EVERY frames is the
     same rule the keys already follow, for the same reason: a hand does not
     re-decide sixty times a second. */
  const doReload = fresh ? rnd() < rp : false;
  const out = { keys, aim, fire, fireP: fp, rawFire: o[4], aimOff: off, aimBin: bin,
                reload: doReload, reloadP: rp,
                aimP: Array.from(AP, (v) => v / z),
                keyP: [sig(o[0]), sig(o[1]), sig(o[2]), sig(o[3])],
                /* what a policy-gradient step needs to grade this decision later:
                   how likely the action was when taken, and what the critic
                   thought the position was worth */
                value: o[VAL], fresh,
                logp: actionLogProb(o, { keys: NAMES.map((n) => keys.has(n)),
                                         fire, bin, fresh, reload: doReload }).lp };
  if (p.drive) traceAction(p, x, { keys: NAMES.map((n) => keys.has(n)), fire, bin }, 0);
  return out;
}

/* How much of you it has actually got, measured only on things it was graded on
   before it saw them. No part of this is a claim about the weights. */
export function agentScore(p) {
  const warm = p.agreeN > 600;
  /* each one is (what it did - what the control would have done), scaled by the
     room the control left: 0 means "no better than the obvious answer", 1 means
     "took everything that was left to take" */
  const over = (v, b, top) => (top - b < 1e-3 ? 0 : clamp((v - b) / (top - b), -1, 1));
  return {
    /* THE HANDS ARE GRADED WHERE THE HANDS DECIDE. The frame-for-frame figure
       is kept below as keysAll*, and it is the number that fooled everyone: a
       held key predicts itself, ~92-97% of frames are holds, so the control
       ties the policy and the edge reads zero whatever was learned. The score
       is the edge at the CHANGE moments — did it call your new key set —
       which is the only place movement style is visible at all. Same shape as
       the aim fix directly below: grade the channel on the frames where the
       channel acts. Gated on decisions SEEN, not frames watched — a player
       who never changes keys gives it no decisions to be graded on, and that
       reads 0 honestly ("nothing demonstrated"), not as a failure. */
    keys: (p.decN > 100) ? over(p.decAgree, Math.max(p.decBase, p.decVel), 1) : 0,
    keysRaw: p.decAgree, keysBase: Math.max(p.decBase, p.decVel),
    keysMajority: p.decBase, keysFromMotion: p.decVel, keysDecN: p.decN,
    keysAll: warm ? over(p.agree, Math.max(p.keyBase, p.keyVel), 1) : 0,
    keysAllRaw: p.agree, keysAllBase: Math.max(p.keyBase, p.keyVel),
    /* THE AIM SCORE IS TAKEN ON THE FRAMES WHERE AIMING HAPPENS. A mouse is
       still on about ninety-seven per cent of frames and flicks on the rest, so
       a mean over all of them is a mean over "did not move" — and it read 0%
       for a policy scoring +15% to +29% on every frame where the player actually
       turned. 661 informative frames were being averaged against 21,000
       uninformative ones. Same shape as judging a keyboard on the frames where
       nothing was pressed. */
    aim: (warm && p.aimBase < 0.999)
      ? clamp((p.aimHit - p.aimBase) / (1 - p.aimBase), -1, 1) : 0,
    aimRaw: p.aimHit, aimBase: p.aimBase,
    /* how many times more likely it is to call a shot on a frame you shot */
    /* a floor, not a gate: the denominator underflowing means the trigger
       discriminates so well it never fires on a quiet frame, which is the best
       possible answer and was being reported as the worst */
    fire: (p.fireN > 40) ? p.pOn / Math.max(p.pOff, 1e-6) : 0,
    lessons: p.lessons, graded: p.agreeN,
  };
}
