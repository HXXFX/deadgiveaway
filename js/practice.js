/* THE REHEARSAL
 * ============================================================================
 *
 * What this is, in one sentence: between rounds, the Mirror fights a frozen copy
 * of what it has learned from you, and a policy gradient keeps whatever led to
 * landing a round.
 *
 * WHY IT EXISTS. Cloning alone cannot work at this scale and the research says
 * so plainly. The strongest published behavioural-cloning shooter trained on
 * four million frames; a five-minute session here yields twelve thousand. Worse,
 * cloning fails through compounding error — per-step error e over T steps grows
 * like T squared times e — which is why the Mirror could match 94% of the
 * player's key frames and still wander: six per cent wrong per frame becomes a
 * body nowhere the player would have been, ten seconds later. Improving frame
 * accuracy was never going to fix the fight.
 *
 * The documented answer is to clone first and then fine-tune with reinforcement
 * against self-play. Cloning supplies the prior that stops the policy gradient
 * exploring at random; self-play supplies the experience volume cloning cannot.
 *
 * WHY IT IS STILL "LEARNED FROM YOU". The opponent is not an invention. It is a
 * frozen snapshot of the policy cloned from the player, so beating it is beating
 * a copy of them, and the imitation loss keeps running on their real frames the
 * whole time — which is exactly the anchor the fine-tuning literature calls for.
 * Nothing here reaches for a tactic. The reward is damage, as it always was.
 *
 * IT IS SLICED ACROSS FRAMES. Run whole, one rehearsal costs a second or two of
 * wall clock, and it ran inside the between-round beat — which is what the
 * player felt as "the pause is longer than before", and why a card meant to play
 * the practice back could never have animated: the main thread was blocked for
 * all of it. So it is a state machine. `beginRehearsal` sets a fight up,
 * `stepRehearsal` advances it a few milliseconds at a time, and the beat stays
 * at sixty frames a second.
 */
import { createGame, step, shoot, applyKeys } from './sim.js';
import { WORLD, PLAYER, FOE, MAG } from './config.js';
import { blocked, nearestProp } from './room.js';
import { see, act, ppoBatch, studyBeat, PPO, OBS } from './agent.js';

const TRAIL_EVERY = 6;          /* frames between trail samples for the card */
/* imitation steps run against each minibatch of policy gradient. One minibatch
   is 256 decisions of its own; this many frames of the player alongside. */
const ANCHOR_STEPS = 64;

/* HOW LONG THE PAUSE IS ALLOWED TO BE, in milliseconds of real work.
 *
 * Measured: 2400 practice frames — forty seconds of simulated fight — cost 4.9
 * SECONDS of processor time on this machine, 3.7 of it in the fight and 1.6 in
 * the gradient steps. The simulation runs about seven and a half times real
 * time, not the forty-three an earlier comment here claimed. That is why the
 * player felt the between-round beat get longer, and why sliced at four
 * milliseconds a frame one rehearsal took twenty seconds of wall clock and was
 * still running well into the next round, stealing a quarter of every frame
 * from the fight the player was actually in.
 *
 * So the rollout is bounded by TIME rather than by a step count. The pause is
 * the same length on every machine and a faster one simply practises more
 * inside it — and because the fight is now cut off mid-round rather than played
 * to an end, the value bootstrap in gae() below stops being optional. */
export const PAUSE_MS = 1600;
/* and how much of it goes on FIGHTING rather than on learning from the fight.
   Measured, an unbudgeted gradient pass cost more than the fight that fed it —
   1.6 s against 3.7 s for 2400 frames — and the pause came out at four and a
   half seconds. Both halves are now on the same clock, so the pause is the
   length it says it is and the split is a decision rather than an accident. */
const FIGHT_SHARE = 0.45;

/* A rollout, as flat arrays: growing objects per frame is how a hot loop ends up
   spending its life in the garbage collector. */
function makeRoll(n) {
  return { n: 0,
           obs: new Float32Array(n * OBS),
           k0: new Uint8Array(n), k1: new Uint8Array(n),
           k2: new Uint8Array(n), k3: new Uint8Array(n),
           fire: new Uint8Array(n), bin: new Uint8Array(n), fresh: new Uint8Array(n),
           logp: new Float32Array(n), val: new Float32Array(n),
           rew: new Float32Array(n), done: new Uint8Array(n),
           /* WHAT ACTUALLY HAPPENED, kept apart from what it was PAID. The
              zero-mass guard below asks "did anything occur in this fight" and
              answered it from the total reward -- so any dense shaping term
              made every rollout look eventful and silently disabled it.
              Measured: a potential-based aim term took the discard rate from
              83% to 0%, not by making the fights real but by hiding that they
              were not. This is the number the guard reads now. */
           dam: new Float32Array(n),
           adv: new Float32Array(n), ret: new Float32Array(n) };
}

/* A FROZEN OPPONENT. Self-play against a policy moving underneath you is
   unstable — the standard shape is a snapshot on a slower clock. This one is
   refreshed when a rehearsal ends, so it is always "the player as I understood
   them a moment ago". */
function snapshot(p) {
  const c = {};
  /* EVERY ARRAY BY DISCOVERY, NOT BY A LIST OF NAMES.
   *
   * This named six arrays. A seventh, eighth and ninth were added when the
   * reload was moved onto its own net, and the copy silently did not have them:
   * forwardAgent read `p.rb1[j]` off undefined and threw on the FIRST FRAME of
   * the rehearsal, so the game hung on the REHEARSING overlay reading
   * "0 frames practised" with no error anyone could see. It shipped.
   *
   * A hand-written list of fields is a thing to forget, and this is the third
   * time in this project that adding a field broke a copy or a reset that
   * enumerated its siblings (see also g.stats in sim.js restart()). Discovering
   * them cannot be forgotten.
   *
   * The replay buffers are excluded on purpose: they are megabytes, they are
   * training data rather than weights, and a frozen opponent has no use for
   * them. Scratch arrays are allocated fresh rather than shared, or two bodies
   * would write over each other's hidden layer inside one frame. */
  const BUFFERS = new Set(['bx', 'by', 'sx', 'sy', 'lx', 'ly']);
  const SCRATCH = new Set(['h1', 'h2', 'out', 'rh', 'decG']);
  for (const k of Object.keys(p)) {
    if (!(p[k] instanceof Float32Array) || BUFFERS.has(k)) continue;
    c[k] = SCRATCH.has(k) ? new Float32Array(p[k].length) : p[k].slice();
  }
  /* plain-number weights travel too — the reload net's output bias is one */
  if (typeof p.rb2 === 'number') c.rb2 = p.rb2;
  /* the readout calibrations travel with the weights, or the copy fights with a
     trigger discipline it never learned */
  for (const k of ['biasLine', 'biasBlind', 'rateYouLine', 'rateYouBlind',
                   'logitLine', 'logitBlind', 'logitLineN', 'logitBlindN', 'rateYouLineBest',
                   'turnS', 'sigma', 'drive', 'deadband', 'noVel'])
    c[k] = p[k];
  c.rnd = p.rnd;
  return c;
}

/* GENERALISED ADVANTAGE ESTIMATION, backwards through the rollout. The piece the
   first attempt at a drive was missing most: without it, credit for a round that
   landed is smeared over a fixed window regardless of what the critic already
   expected. */
/* `lastV` is what the critic thinks the state AFTER the last action is worth.
   A rollout that ran out of budget has NOT ended — the fight is still going —
   and treating it as terminal tells the policy the world stops being worth
   anything the moment practice does. Only a real death bootstraps from zero. */
function gae(r, lastV) {
  /* NOTHING HAPPENED IS NOT A LESSON. Measured on the fresh policy, rollouts
     come back with a reward of exactly zero — nobody fired, nobody was hit. It
     is not enough to test the spread of the ADVANTAGES afterwards: with no
     reward at all they are still non-zero, because they then carry only the
     critic's disagreement with itself, and normalising that hands PPO a
     unit-scale gradient built entirely out of the critic's own noise. A policy
     trained on that suppresses whatever it does most, which is how one that had
     learned to shoot stops shooting. */
  let mass = 0;
  for (let t = 0; t < r.n; t++) mass += Math.abs(r.dam[t]);
  if (mass < 1e-6) return false;

  let last = 0;
  for (let t = r.n - 1; t >= 0; t--) {
    /* THE DONE FLAG BELONGS TO THE NEXT STATE, not this one. Using this step's
       bootstraps through a terminal state and truncates credit one step early on
       every death — exactly where the rewards are. */
    const nonTerm = (t + 1 < r.n) ? (r.done[t + 1] ? 0 : 1) : (r.done[t] ? 0 : 1);
    const nextV = (t + 1 < r.n) ? r.val[t + 1] : lastV;
    const delta = r.rew[t] + PPO.GAMMA * nextV * nonTerm - r.val[t];
    last = delta + PPO.GAMMA * PPO.LAMBDA * nonTerm * last;
    r.adv[t] = last;
    r.ret[t] = last + r.val[t];
  }
  let mean = 0;
  for (let t = 0; t < r.n; t++) mean += r.adv[t];
  mean /= Math.max(1, r.n);
  let vr = 0;
  for (let t = 0; t < r.n; t++) vr += (r.adv[t] - mean) * (r.adv[t] - mean);
  const sd = Math.sqrt(vr / Math.max(1, r.n));
  /* A ROLLOUT WITH NOTHING IN IT MUST NOT BE NORMALISED. Dividing by a standard
     deviation of almost zero takes float noise and scales it up to unit size,
     and PPO then trains as hard on that noise as it would on a kill — which is
     one way a policy that had learned to shoot stops shooting. Measured on a
     fresh policy, two rollouts in three carried no reward at all. Those are not
     lessons, and this refuses to pretend they are. */
  if (!(sd > 1e-4)) return false;
  for (let t = 0; t < r.n; t++) r.adv[t] = (r.adv[t] - mean) / sd;
  return true;
}

let live = null;

/* THE ROLLOUT STARTS IN CONTACT, NOT AT SPAWN DISTANCE.
 *
 * Measured before this existed (HANDOFF 69): over full 2400-step rollouts the
 * two bodies started ~27 units apart and NEVER closed under a median 22.9,
 * against a longest measured clear firing line of 9.6 -- so they were never
 * in a position to hit each other, ~7 rollouts in 8 contained no damage, and
 * the one channel that can make the Mirror better than the average of its
 * teacher carried nothing. No reward of any shape can find anything to
 * reward in a fight that never happens.
 *
 * So the practice fight opens where fights ARE: both bodies placed with a
 * clear line at 4-11 m -- point-blank to a typical duel range, drawn per
 * rollout so the Mirror trains across ranges rather than at one canned one --
 * facing each other, clear of walls and of the SWEPT envelope of every mover
 * (a spot a slab passes through is not clear, wherever the slab is now).
 * This also trains exactly the states the standoff probe found mute
 * (HANDOFF 71/74): two bodies with a line at close range is off the
 * demonstrator's manifold precisely because real approaches are rare in the
 * teacher's play too.
 *
 * Placement draws from its OWN little generator seeded off the rollout seed,
 * so the game's RNG stream is untouched and a replayed seed replays exactly.
 * If 200 draws find nothing (a pathological room), the spawn placement
 * stands: the old behaviour is the fallback, not a throw. */
function placeInContact(g, seed) {
  const f = g.foes && g.foes[0], you = g.you;
  if (!f || !you) return;
  let s = (seed >>> 0) || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const CLR = PLAYER.radius + 0.25;
  const ok = (x, z) => Math.abs(x) < WORLD.AX - 1.2 && Math.abs(z) < WORLD.AZ - 1.2 &&
                       nearestProp(g.room, x, z, true) > CLR;
  for (let t = 0; t < 200; t++) {
    const ax = (rnd() * 2 - 1) * (WORLD.AX - 2), az = (rnd() * 2 - 1) * (WORLD.AZ - 2);
    if (!ok(ax, az)) continue;
    const r = 4 + rnd() * 7, ang = rnd() * Math.PI * 2;
    const bx = ax + Math.cos(ang) * r, bz = az + Math.sin(ang) * r;
    if (!ok(bx, bz) || blocked(g.room, ax, az, bx, bz)) continue;
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    you.x = ax; you.z = az; you.hx = dx / L; you.hz = dz / L;
    f.x = bx; f.z = bz; f.hx = -dx / L; f.hz = -dz / L;
    return;
  }
}

export function beginRehearsal(A, seed, steps, budgetMs) {
  if (!A.opp) A.opp = snapshot(A);
  const g = createGame(seed);
  placeInContact(g, seed);
  /* practice.js owns the Mirror's body: step() must not sample a second action
     and overwrite the one whose log-probability was just recorded */
  g.externalFoe = 1;
  live = {
    A, g, steps, phase: 'fight', i: 0, roll: makeRoll(steps),
    input: { keys: new Set(), camera: 'top', aim: null, firing: false },
    obsYou: new Float32Array(OBS), obsIt: new Float32Array(OBS),
    prevOpp: PLAYER.hp, prevOwn: PLAYER.hp,
    trail: [], epoch: 0, cursor: 0, idx: null, total: 0, result: null,
    /* time actually SPENT, not a wall-clock deadline: a hidden tab stops
       pumping altogether, and a deadline would then throw the fight away for
       having been alt-tabbed rather than for having had its turn. */
    budget: budgetMs || 0, spent: 0,
  };
  A.dbgItShots = 0; A.dbgYouShots = 0; A.dbgEnded = 0; A.dbgBestMiss = undefined;
  return live;
}

/* RE-ENTRANCY. The slice drives a whole practice game, and that game's own
   step() would happily start another slice inside itself — one frame of
   recursion per frame, until the stack gave out. The rehearsal is never allowed
   to rehearse. */
let inSlice = false;
export const rehearsalBusy = () => !inSlice && !!(live && live.phase !== 'done');

/* A LIVE WINDOW ON THE PRACTICE FIGHT. The card used to replay a trail after
   the fact, which meant the picture and the pause were about different moments.
   The game now holds still while this runs, so the honest thing to show is the
   fight ITSELF, frame by frame, as the policy is having it. */
export function rehearsalView() {
  if (!live) return null;
  return { trail: live.trail, i: live.i, steps: live.steps, phase: live.phase,
           log: live.A.rehearsalLog || [],
           /* how far through the pause it is, for the card */
           done: live.budget ? Math.min(1, live.spent / live.budget)
                             : Math.min(1, live.i / Math.max(1, live.steps)) };
}

/* One frame of the practice fight. Returns false when there is nothing to fight. */
function oneFrame(L) {
  const { A, g, roll } = L;
  const R = A.rnd, DT = WORLD.DT;
  const f = g.foes.find((q) => !q.dead);
  if (!f || g.you.dead) {
    g.you.dead = 0; g.you.hp = PLAYER.hp; g.over = false;
    g.protectUntil = g.now;
    /* a respawn is not a hit: re-baseline both health readings */
    L.prevOpp = PLAYER.hp;
    L.prevOwn = (f && !f.dead) ? f.hp : PLAYER.hp;
    /* and the death flags with them, or the respawn frame reads as a fresh
       kill and pays +100 for a body that was already down */
    L.prevOppDead = 0; L.prevOwnDead = 0;
    return !!f;
  }

  /* THE OPPONENT: the frozen clone of the player, in the player's body, playing
     through the same controls and the same shoot() as everything else. */
  const youLine = !blocked(g.room, g.you.x, g.you.z, f.x, f.z);
  /* THE MAGAZINE AND THE OTHER BODY'S CONDITION, both of which this call used
     to leave out entirely. Omitted, `see` defaults them to full and unhurt, so
     every frame of every rehearsal trained the policy on a world where nobody
     ever runs dry, reloads, or is nearly dead -- while the live game feeds it
     the real numbers. Training on one distribution and running on another is
     the oldest way to make a policy worse and have nothing look wrong. */
  see(L.obsYou, g.room, g.you, f, youLine, g.self.losOpen, g.self.sinceFire,
      g.self.threat, A.noVel,
      { ammo: (g.you.ammo || 0) / MAG.size, reloading: g.you.reloadUntil > g.now },
      { hp: (f.hp || 0) / (f.maxHp || FOE.hp), ammo: (f.ammo || 0) / MAG.size });
  const ya = act(A.opp, L.obsYou, g.youKeys, R, L.i);
  g.youKeys = ya.keys;
  L.input.keys.clear();
  for (const k of ya.keys) L.input.keys.add(k);
  L.input.aim = ya.aim;
  if (ya.fire && shoot(g, g.you)) A.dbgYouShots = (A.dbgYouShots || 0) + 1;

  /* THE LEARNER: the live policy in the Mirror's body. Its decision is recorded
     with the log-probability it had at the time, which is what makes the update
     on-policy — and `fresh` says whether the keys were drawn this frame or
     inherited, because an inherited action is not a decision. */
  const itLine = !blocked(g.room, f.x, f.z, g.you.x, g.you.z);
  f.losT = itLine ? (f.losT || 0) + DT : 0;
  see(L.obsIt, g.room, f, g.you, itLine, f.losT,
      (g.now - (f.lastShot || 0)) / 1000, [0, 0, 0], A.noVel,
      { ammo: (f.ammo || 0) / MAG.size, reloading: f.reloadUntil > g.now },
      { hp: (g.you.hp || 0) / PLAYER.hp, ammo: (g.you.ammo || 0) / MAG.size });
  const ia = act(A, L.obsIt, f.keys, R, L.i);
  f.keys = ia.keys;
  const t = roll.n++;
  roll.obs.set(L.obsIt, t * OBS);
  roll.k0[t] = ia.keys.has('w') ? 1 : 0; roll.k1[t] = ia.keys.has('a') ? 1 : 0;
  roll.k2[t] = ia.keys.has('s') ? 1 : 0; roll.k3[t] = ia.keys.has('d') ? 1 : 0;
  roll.fire[t] = ia.fire ? 1 : 0; roll.bin[t] = ia.aimBin;
  roll.fresh[t] = ia.fresh ? 1 : 0;
  roll.logp[t] = ia.logp; roll.val[t] = ia.value;
  applyKeys(g, f, ia.keys, DT, PLAYER.radius, 'top', ia.aim);
  if (ia.fire && shoot(g, f)) A.dbgItShots = (A.dbgItShots || 0) + 1;

  step(g, L.input, DT * 1000);

  /* THE REWARD IS DAMAGE, and nothing else. Read off the two bodies' health
     rather than off the hit counters: `foeHits` and `hitsTaken` both count
     rounds the LEARNER landed, under names that read like opposites, and
     subtracting one from the other gave a reward of almost exactly zero on
     every frame. Health cannot be misread. */
  const oppHp = g.you.dead ? 0 : g.you.hp;
  const ownHp = f.dead ? 0 : f.hp;
  let rew = ((L.prevOpp - oppHp) - (L.prevOwn - ownHp)) * 10;
  /* WHO IT LANDED ON, CAPTURED WHILE THE DELTAS STILL EXIST. The trail carried
     a fire flag and nothing else, so the panel could show two bodies shooting
     and never show a hit -- the one event the whole pause turns on. Read after
     prevOpp is rebaselined it is always zero, which is the same
     take-the-reading-before-the-action trap that disabled the trigger
     calibration for the life of the project. */
  /* ACCUMULATED BETWEEN TRAIL SAMPLES, NOT READ AT ONE. A hit lasts a single
     frame and the trail is sampled every TRAIL_EVERY frames, so a flag read at
     sample time misses almost all of them -- measured, 190 frames of shooting
     and zero hits recorded in a rollout that definitely landed some. The flags
     are held until the sample that carries them away. */
  if (L.prevOpp > oppHp) L.hitIt = 1;
  if (L.prevOwn > ownHp) L.hitYou = 1;
  L.prevOpp = oppHp; L.prevOwn = ownHp;
  /* AND THE TWO OUTCOMES THAT WERE NEVER PAID FOR AT ALL.
     Until now the only reward in the game was damage, so FINISHING a body was
     worth exactly the last point of health taken off it and nothing more --
     the one event the whole game is about was indistinguishable from a graze.
     A kill is 3 points of damage, so +100 against damage's +10 a point makes
     closing worth about three times the chipping that got there. Symmetric on
     its own death: both bodies in a rehearsal run the same policy, and an
     asymmetric penalty teaches both copies to trade themselves away. */
  const oppDead = g.you.dead ? 1 : 0, ownDead = f.dead ? 1 : 0;
  if (oppDead && !L.prevOppDead) rew += 100;
  if (ownDead && !L.prevOwnDead) rew -= 100;
  L.prevOppDead = oppDead; L.prevOwnDead = ownDead;
  L.rDam = (L.rDam || 0) + rew;
  roll.dam[t] = rew;
  /* AND WHO IT LANDED ON, for the panel. The trail carried a fire flag only,
     so the picture could show two bodies shooting and never show a hit --
     which is the one event the whole pause turns on. */
                 /* the outcome half, before any shaping */
  /* ---- THE SHAPING, AND WHICH KIND OF IT ---------------------------------
     Three variants, measured against each other on DAMAGE (L.rDam) rather than
     on total reward -- scoring a shaped run by its own shaping would just
     reward whoever was paid most. See dev_log/audit/probe-shaping.html. */
  if (A.shapeMode === 'aim') {
    /* POTENTIAL-BASED. phi is the cosine between where the learner is pointing
       and where the opponent actually is: +1 aimed straight at them, -1 away.
       Paying gamma*phi' - phi pays for TURNING TOWARD and charges for turning
       away, and over a whole episode it telescopes to almost nothing, so it
       cannot become a thing to farm instead of winning. */
    const adx = g.you.x - f.x, adz = g.you.z - f.z;
    const adl = Math.hypot(adx, adz) || 1;
    const phi = (f.hx * adx + f.hz * adz) / adl;
    const d = 5 * (PPO.GAMMA * phi - (A.shapePhi || 0));
    A.shapePhi = phi;
    rew += d;
    L.rShape = (L.rShape || 0) + d;
  } else if (A.shapeMode !== 'none') {
  /* AND THE NEAR MISSES — CENTRED, AND CHARGED BOTH WAYS.
   *
   * Why any shaping at all: a hit lands about once in five simulated minutes, so
   * a forty-second rollout contains, on average, nothing. Measured on a fresh
   * policy, two rollouts in three scored exactly zero. No gradient comes out of
   * that. Every round that ends reports how close it came, which is the same
   * objective at a finer resolution rather than a hint about where to stand.
   *
   * WHY IT IS CENTRED NOW. The version before this paid exp(-miss) for every
   * round that ended and charged nothing for firing. That quantity is never
   * negative, so the sum over a rollout grew with the NUMBER of shots taken and
   * the policy was paid simply for pulling the trigger more — which is exactly
   * what the player reported watching: "firing a lot more, and firing a lot more
   * to the wall". Nothing anywhere in the reward pushed back. Each shot is now
   * scored against the running average of its own shots, so only a BETTER than
   * usual round pays and a worse one costs, and firing more is worth nothing by
   * itself. The baseline is measured, not chosen.
   *
   * WHY IT IS SYMMETRIC NOW. The damage term is already "what I did to them
   * minus what they did to me". This is the same statement at a finer
   * resolution, so a round of theirs that nearly landed costs what one of ours
   * that nearly landed pays — and it is the only thing in the reward that a
   * dodge can move.
   *
   * THE LENGTH SCALE IS THE WEAPON'S, not one I picked: dmgEdge is the distance
   * inside which a round actually hurts, so one hit-width off scores 1/e. */
  for (const sh of g.shots) {
    if (!sh.done || sh.scored || sh.minMiss === undefined) continue;
    sh.scored = 1;
    A.dbgEnded = (A.dbgEnded || 0) + 1;
    if (!sh.mine)
      A.dbgBestMiss = Math.min(A.dbgBestMiss === undefined ? 1e9 : A.dbgBestMiss, sh.minMiss);
    const q = Math.exp(-sh.minMiss / FOE.dmgEdge);
    A.missMean = A.missMean === undefined ? q : A.missMean + 0.01 * (q - A.missMean);
    const d = (sh.mine ? -1 : 1) * (q - A.missMean);
    rew += d;
    L.rShape = (L.rShape || 0) + d;
    L.nShots = (L.nShots || 0) + 1;
  }
  }
  roll.rew[t] = rew;
  roll.done[t] = (g.you.dead || f.dead) ? 1 : 0;

  /* A TRAIL, so the between-round card can show the player what the pause IS.
     The rehearsal is a real fight; the honest way to explain it is to play it
     back rather than to draw a spinner over it. */
  /* BRACES, because the clear belongs to the SAMPLE and not to the frame. The
     `if` was braceless when the hit flags were added, so the two clears ran on
     every frame and wiped each hit before the next sample could carry it --
     the accumulation fix accumulating nothing, which looked exactly like the
     bug it was meant to fix. */
  if ((L.i % TRAIL_EVERY) === 0 && L.trail.length < 1600) {
    L.trail.push(g.you.x, g.you.z, f.x, f.z,
                 (ya.fire ? 1 : 0) + (ia.fire ? 2 : 0) +
                 (L.hitIt ? 4 : 0) + (L.hitYou ? 8 : 0));
    L.hitIt = 0; L.hitYou = 0;
  }
  return true;
}

/* Advance the rehearsal for at most `budgetMs`, returning a result only on the
   call that finishes it. Four milliseconds of a sixteen millisecond frame gets
   through a whole rehearsal inside one between-round beat without dropping one. */
export function stepRehearsal(budgetMs) {
  if (inSlice || !live || live.phase === 'done') return null;
  inSlice = true;
  const t0 = performance.now();
  const L = live, A = L.A, roll = L.roll, R = A.rnd;

  while (performance.now() - t0 < budgetMs) {
    if (L.phase === 'fight') {
      if (L.i >= L.steps || roll.n >= L.steps ||
          (L.budget && L.spent + (performance.now() - t0) > L.budget * FIGHT_SHARE)) {
        L.phase = 'learn'; continue;
      }
      L.i++;
      if (!oneFrame(L)) L.phase = 'learn';
      continue;
    }
    if (L.phase === 'learn') {
      if (roll.n < 64) { L.result = { frames: roll.n, reward: 0 }; L.phase = 'done'; break; }
      /* WHAT THE FIGHT WAS LEFT WORTH, for the bootstrap above. */
      let lastV = 0;
      const pg = L.g;
      const lf = pg.foes.find((q) => !q.dead);
      if (lf && !pg.you.dead) {
        const ll = !blocked(pg.room, lf.x, lf.z, pg.you.x, pg.you.z);
        see(L.obsIt, pg.room, lf, pg.you, ll, lf.losT || 0,
            (pg.now - (lf.lastShot || 0)) / 1000, [0, 0, 0], A.noVel,
            { ammo: (lf.ammo || 0) / MAG.size, reloading: lf.reloadUntil > pg.now },
            { hp: (pg.you.hp || 0) / PLAYER.hp,
              ammo: (pg.you.ammo || 0) / MAG.size });
        lastV = act(A, L.obsIt, lf.keys, R, L.i).value;
      }
      L.total = 0;
      for (let t = 0; t < roll.n; t++) L.total += roll.rew[t];
      if (!gae(roll, lastV)) {
        A.rehearsalsSkipped = (A.rehearsalsSkipped || 0) + 1;
        if (A.rehearsalLog) { A.rehearsalLog.push(0); if (A.rehearsalLog.length > 64) A.rehearsalLog.shift(); }
        L.result = { frames: roll.n, reward: 0, skipped: 1,
                     damage: L.rDam || 0, shaping: L.rShape || 0, shots: L.nShots || 0 };
        L.phase = 'done';
        break;
      }
      L.idx = new Int32Array(roll.n);
      for (let i = 0; i < roll.n; i++) L.idx[i] = i;
      L.phase = 'ppo'; L.epoch = 0; L.cursor = 0;
      continue;
    }
    if (L.phase === 'ppo') {
      if (L.cursor === 0) {
        for (let i = roll.n - 1; i > 0; i--) {
          const j = Math.floor(R() * (i + 1));
          const tmp = L.idx[i]; L.idx[i] = L.idx[j]; L.idx[j] = tmp;
        }
      }
      const to = Math.min(roll.n, L.cursor + PPO.MINIBATCH);
      ppoBatch(A, roll, L.idx, L.cursor, to);
      /* THE ANCHOR, WHICH THIS FILE CLAIMED TO HAVE AND DID NOT.
       *
       * The header above says the imitation loss "keeps running on your real
       * frames the whole time — which is exactly the anchor the fine-tuning
       * literature calls for". It was not true. The study beat ran, FINISHED,
       * and then PPO ran on its own, free to walk away from everything
       * imitation had built. That is the documented failure mode of unanchored
       * fine-tuning and it matches what was measured here: the drive that came
       * before this took the Mirror from 185 shots a rollout to zero, and PPO
       * measured harmful on its first ablation and neutral on the next three.
       *
       * Now every minibatch of policy gradient is followed by imitation steps
       * on the player's own frames, so the two pull at the same weights at the
       * same time and the copy has a say in every update rather than being
       * something PPO is handed and can spend. */
      if (!A.noAnchor) studyBeat(A, ANCHOR_STEPS);
      L.cursor = to;
      if (L.cursor >= roll.n) { L.cursor = 0; L.epoch++; }
      /* OUT OF PAUSE. Stopping between minibatches is a legitimate number of
         gradient steps over a shuffled rollout — simply fewer epochs than were
         asked for — where running over is a pause the player has to sit out. */
      const spent = L.spent + (performance.now() - t0);
      if (L.epoch >= PPO.EPOCHS || (L.budget && spent > L.budget && L.cursor === 0)) {
        A.ppoWarm = (A.ppoWarm || 0) + 1;
        /* what the reward was made of, kept so it can be reported rather than
           assumed: shaping that quietly outweighs damage is a different
           objective wearing the same name */
        A.rewDamage = (A.rewDamage || 0) + (L.rDam || 0);
        A.rewShaping = (A.rewShaping || 0) + (L.rShape || 0);
        A.rewShots = (A.rewShots || 0) + (L.nShots || 0);
        A.rehearsals = (A.rehearsals || 0) + 1;
        if (A.rehearsalLog) { A.rehearsalLog.push(1); if (A.rehearsalLog.length > 64) A.rehearsalLog.shift(); }
        A.rehearsedFrames = (A.rehearsedFrames || 0) + roll.n;
        A.lastRehearsalReward = L.total;
        A.opp = snapshot(A);          /* the copy becomes what just learned */
        L.result = { frames: roll.n, reward: L.total, epochs: L.epoch,
                     damage: L.rDam || 0, shaping: L.rShape || 0, shots: L.nShots || 0 };
        L.phase = 'done';
      }
      continue;
    }
    break;
  }
  L.spent += performance.now() - t0;
  inSlice = false;
  return L.phase === 'done' ? L.result : null;
}

/* Run one whole rehearsal without slicing. QC has no frames to protect. */
export function rehearse(A, seed, steps) {
  beginRehearsal(A, seed, steps);          /* no budget: QC needs determinism */
  let out = null;
  while (!out) out = stepRehearsal(1e9);
  return out;
}
