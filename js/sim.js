/* The fight. Fixed 60 Hz, driven by an accumulator, so the physics a headless
 * test sees is the physics a player sees.
 *
 * THE LADDER IS BEHAVIOUR, NOT A MENU. There is one opponent that keeps coming
 * back: round 1 it only watches, round 2 it shoots where you ARE, round 3 it
 * starts shooting where you are GOING. The player never has to know a model
 * exists — they find out that breaking left after every shot is a habit because
 * it starts killing them for it.
 */
import { WORLD, PLAYER, FOE, CROWD, MAG } from './config.js';
import { clamp, lerp, mulberry32 } from './util.js';
import { makeRoom, advanceRoom, resolveCollide, moveResolved, blocked, findSpawn,
         checkValueRule, splat, nearestProp } from './room.js';
/* NO PREDICTOR, NO MODEL. Both files are gone: an aim net that predicted where
   the player would be, a movement clone that owned the legs a few per cent of
   the time, and a channel of counted habits that set the dials on fifteen
   hand-written tactics. An ablation showed the nets were making the Mirror
   WORSE and the counted habits were doing all the work - neither was learning
   in the sense the user asked for. Everything the Mirror does now comes from
   agent.js and from nowhere else. */
import { makeLog, logTick, logEvent, logFoeShot } from './log.js';
import { castFor, foeFor } from './chars.js';
import { beginRehearsal, stepRehearsal, rehearsalBusy, PAUSE_MS } from './practice.js';
const HARD_MAX = 2400;   /* what QC replays; the page stops on the clock first */
/* how long a fight may go with NO line either way and NO shot fired before the
   arena is assumed to be the problem. Not a round timer — see below. */
const DEADLOCK_MS = 40000;
import { makeAgent, see, learn, act, studyOnce, studyBeat, noteSelf, endLife, endYouLife,
         noteFired, reward, driveTick, memTick, keysToBits,
         agentScore, aimBinOf, OBS, ACT, NAIM, RELOAD, MAX_TURN } from './agent.js';

/* A SESSION SEED, DRAWN ONCE, FROM OUTSIDE THE SIMULATION.
 *
 * Everything downstream stays seeded and reproducible — the rule that no draw,
 * simulation or training path may call Math.random() is what makes a bug
 * repeatable — but the seed the whole session hangs from is drawn fresh when the
 * page loads. A fixed seed meant every player, every visit, walked into the same
 * four rooms; the generator was procedural and the game was not.
 *
 * crypto is used where it exists so two tabs opened in the same millisecond do
 * not get the same arena.
 */
export function freshSeed() {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] >>> 1;
  return ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0) & 0x7fffffff;
}

/* WHAT THE PLAYER'S BODY KNOWS ABOUT ITSELF, and nothing more. This used to be a
   whole predictor object carrying an aim net, a replay buffer, a gate, a
   supervisor pair and a channel of counted habits. Three numbers survived,
   because three numbers are all the policy's observation actually needs. */
function makeSelf() {
  return { losOpen: 0, sinceFire: 9, threat: [0, 0, 0], inGrace: false };
}

export function createGame(seed) {
  const g = {
    seed: seed === undefined ? freshSeed() : seed,
    /* WHO IS WEARING WHAT, decided once per session and kept. See chars.js for
       why the enemy does not change its face between rounds. */
    look: null,
    /* which ground mark identifies an actor; see MARKERS in render.js */
    marker: 'none',
    round: 1, wins: 0, deaths: 0,
    tSec: 0, now: 0,
    room: null,
    /* lastShot starts BEFORE zero. At 0 the fire-rate check (now - lastShot <
       fireEvery) is true on the very first frame, so the first click after load
       silently does nothing — which reads as dead input, on the one click that
       makes the first impression. */
    you: { x: -8, z: 4, vx: 0, vz: 0, hx: 0, hz: -1, hp: PLAYER.hp, dead: 0,
           /* maxHp for the same reason the other two bodies carry it: every
              reader of it falls back to FOE.hp, which happens to equal
              PLAYER.hp today and would silently compute YOUR health against
              the Mirror's ceiling the day they differ. Found by AI-10. */
           lastShot: -PLAYER.fireEvery, ammo: MAG.size, reloadUntil: 0,
           maxHp: PLAYER.hp,
           /* the short memory (see OBS in agent.js) — in the literal, never
              added at runtime, per the hidden-class lesson */
           mKeys: 0, mSince: 0, mTurn: 0, mSpd: 0, mHx: 1, mHz: 0, mGrace: 0 },
    foes: [],
    ghost: null,          /* only in watch mode: an agent piloted by the model */
    shots: [],            /* rounds in flight, from either hand */
    mags: [],             /* spent magazines on the floor, purely to be seen */
    shells: [],           /* and a case for every round either of you fires */
    /* behaviour randomness only - the model's own rng lives in its net */
    rnd: mulberry32(((seed === undefined ? 7 : seed) ^ 0x51ab) >>> 0),
    self: makeSelf(), roundStartedAt: 0, reroll: 0,
    deadlockSince: 0, deadlockShots0: 0, deadlockMine0: 0,
    /* THE BLANK SLATE. One policy, seeded once, that starts knowing nothing and
       is only ever shown what the player did. See agent.js. */
    A: makeAgent(seed),
    keysPrev: new Set(),
    obsYou: new Float32Array(OBS), obsIt: new Float32Array(OBS), actYou: new Float32Array(ACT),
    knows: 0,
    /* records, never decides: see log.js */
    log: makeLog(),
    mode: 'play',         /* 'play' | 'watch' */
    paused: false,
    /* The view can be orbited, so the player's movement habit lives in SCREEN
       axes, not world axes. The predictor rotates its world-frame features by
       this before learning — otherwise turning the camera mid-fight silently
       destroys every habit it had found. */
    camYaw: 0,
    /* MUZZLE FLASHES. Kept in the sim rather than in the renderer because the
       foes fire from inside step() and the renderer never hears about it. They
       are stamped in SIM time, like shots and beams, so a paused game holds its
       last frame whole instead of one layer of it moving on without the rest. */
    flashes: [],
    splatN: 0,
    lastHit: null,
    protectUntil: 0,
    over: false,
    watchUnlocked: false,
    /* OFF UNTIL ASKED FOR. The acid mark showing where the Mirror thinks you
       will be is a debugging view wearing a game skin: on by default it taught
       new players to watch the prediction instead of the fight, and the panel
       rail already carries the same information for anyone who wants it. */
    showGhost: false,
    pred: [0, 0],
    events: [],           /* consumed by the UI: {kind, ...} */
    stats: { shotsFired: 0, hitsTaken: 0, foeShots: 0, foeHits: 0, foeReloads: 0,
             foeDry: 0, foeEmptyFrames: 0, foeAliveFrames: 0,
             youEmptyFrames: 0, youAliveFrames: 0 },
  };
  g.look = castFor(g.seed);
  newRoom(g, true);
  return g;
}

function newRoom(g, keepModel) {
  /* A NEW BODY FOR THE SAME MODEL. See foeFor in chars.js: what persists between
     rounds is everything the enemy knows, and none of that lives in a jacket. */
  if (g.look) g.look.foe = foeFor(g.seed, g.round, g.look.you);
  /* Mixed rather than added: seed + round*13 makes seeds 13 apart share rooms
     one round out of step, which is exactly the "similar but the same" the
     generator is supposed to avoid. */
  /* THE ROUND IS NOT THE ONLY THING THAT ASKS FOR A NEW ROOM, and for a while
   * it was the only thing that changed one. The stalemate breaker below hands
   * out a fresh arena WITHOUT advancing the round, because nobody won — so with
   * the layout keyed on the round alone it regenerated the identical room, with
   * identical spawn points, every forty-five seconds forever. Measured: the
   * round sat at 9 for two hundred seconds while the arena was "reset" nine
   * times, both bodies alive at full health between three and seven metres
   * apart, blocked on every sample, and the Mirror fired zero shots. It was
   * being put back into the same trap it had just failed to escape.
   *
   * `reroll` counts the times this game has asked for a room the round did not
   * pay for, and it goes into the layout AND into both spawn points, because a
   * new arena the two of you enter at the same coordinates is not a new arena. */
  const mix = ((g.round * 2654435761) ^ ((g.reroll || 0) * 40503)) >>> 0;
  g.room = makeRoom((g.seed ^ mix) >>> 0);
  g.tSec = 0;
  advanceRoom(g.room, 0);
  /* the player is placed FIRST and the enemies are placed away from them, so the
     spacing term has something to work against */
  const sp = findSpawn(g.room, g.seed + g.round + (g.reroll || 0) * 977, -1, []);
  g.you.x = sp[0]; g.you.z = sp[1];
  g.protectUntil = g.now + PLAYER.spawnProtect;
  /* FACE THE MIDDLE OF THE ROOM. Spawning with a fixed heading meant that
     wherever the spawn point happened to land, the player could begin looking
     straight into a wall from a metre away — which in top-down is merely odd and
     in first-person is a completely black screen on the first frame. */
  const fx = -g.you.x, fz = -g.you.z, fl = Math.hypot(fx, fz) || 1;
  g.you.hx = fx / fl; g.you.hz = fz / fl;
  g.you.vx = 0; g.you.vz = 0; g.you.hp = PLAYER.hp; g.you.dead = 0;
  /* A NEW ROUND IS A NEW MAGAZINE, for both — starting a round mid-reload or
     three rounds down is a difference neither of you chose. */
  g.you.ammo = MAG.size; g.you.reloadUntil = 0;
  g.mags.length = 0; g.shells.length = 0;
  g.shots.length = 0; g.flashes.length = 0;
  if (!keepModel) { /* the model NEVER resets between rounds — that is the point */ }
  /* EVERY ROOM, not just the first. The venue changes with the round and each one
     brings its own ground, so checking once at startup checked one venue in nine. */
  checkValueRule(g.room);
  spawnFoes(g);
  if (g.mode === 'watch') spawnGhost(g);
}

function spawnFoes(g) {
  g.foes = [];
  const graceUntil = g.now + PLAYER.spawnProtect;
  /* HOW MANY BODIES, and nothing else about them. The ladder used to decide
     this along with their speed, their cadence and what they were allowed to
     do; only the count survives, because a count is not a tactic. */
  const nFoes = Math.max(1, CROWD.max || 1);
  for (let i = 0; i < nFoes; i++) {
    const sp = findSpawn(g.room, g.seed + g.round * 7 + i * 31 + (g.reroll || 0) * 613, 1,
                         [g.you, ...g.foes]);
    /* SAME HEALTH, both of you - the extra pips retired with the other
       asymmetries on the user's apples-to-apples call. */
    g.foes.push({
      x: sp[0], z: sp[1], maxHp: FOE.hp, ammo: MAG.size, reloadUntil: 0,
      /* SAME STARTING lastShot AS THE PLAYER, and for the same reason.
         g.you is built with -PLAYER.fireEvery so its first trigger-pull is
         not silently eaten by the fire-rate check at now = 0. This body was
         built without the field at all, so `who.lastShot || 0` made every
         round begin with one refused shot for the Mirror and none for the
         player. Found by dev_log/audit AI-05: same state, same frame, the
         player fired and the Mirror did not. spawnFoes runs every round, so
         it was not once per session. */
      lastShot: -PLAYER.fireEvery,
      vx: 0, vz: 0, hx: -1, hz: 0,
      /* Spread around the orbit rather than 2.1 rad apart, so two of them come
         at you from opposite sides instead of arriving together. With one enemy
         this is the same as it ever was. */
      hp: FOE.hp, dead: 0, last: 0, burstLeft: 0, losT: 0, hide: 0,
      /* WHERE IT LAST HAD YOU. Pre-fire is aimed at a place — a doorway, a
         corner — and without a memory there is no place to aim at. It also
         stops blind fire being a wallhack: while the line is broken the Mirror
         may only point at what it last saw, never at where you actually are. */
      seen: null, protectUntil: 0,
      mKeys: 0, mSince: 0, mTurn: 0, mSpd: 0, mHx: 1, mHz: 0, mGrace: 0,
      ang: (i / nFoes) * Math.PI * 2,
      protectUntil: graceUntil,
    });
  }
}

/* WATCH MODE. When it can beat you every round, you stop being the player and
 * become the audience — and the fighter it puts in your place is your own ghost.
 *
 * The ghost is NOT scripted. It is piloted by the same network: at each tick it
 * asks "where would this player go from here", and goes there. A model that
 * predicts you can drive a copy of you, which is the whole payoff of the ending
 * and costs nothing extra to build.
 */
function spawnGhost(g) {
  const sp = findSpawn(g.room, g.seed + 999, -1, g.foes);
  /* KEEP THE TALLY. newRoom respawns the ghost every round, and rebuilding the
     object reset `rounds` to zero each time — so the end-of-watch card always
     read "it lasted 0 rounds" no matter how well the copy of you had done,
     which is the one number that card exists to show. */
  const kept = g.ghost ? g.ghost.rounds : 0;
  /* A WHOLE BODY, NOT HALF OF ONE. This was built without ammo, without a
     magazine timer and without a lastShot -- so `shoot()` refused EVERY round
     it ever tried to fire (`(who.ammo || 0) <= 0` is true for undefined), and
     its observation reported an empty gun on every frame of its life. Watch
     mode therefore showed two bodies circling each other and never shooting,
     which is exactly what the owner reported.
     THIS IS THE THIRD TIME A BODY HAS SHIPPED MISSING A FIELD ITS SIBLINGS
     HAVE. spawnFoes lacked `lastShot` and lost one shot a round (audit AI-05);
     spawnFoes lacked a field its own comment described. Both real bodies are
     built with maxHp, ammo, reloadUntil and lastShot: anything that fights
     gets all four, and `lastShot: -PLAYER.fireEvery` so its first trigger pull
     is not eaten by the cadence check at now = 0. */
  g.ghost = { x: sp[0], z: sp[1], vx: 0, vz: 0, hx: 0, hz: -1,
              hp: PLAYER.hp, maxHp: PLAYER.hp, dead: 0, last: 0, rounds: kept,
              ammo: MAG.size, reloadUntil: 0, lastShot: -PLAYER.fireEvery,
              protectUntil: 0,
              mKeys: 0, mSince: 0, mTurn: 0, mSpd: 0, mHx: 1, mHz: 0, mGrace: 0 };
}

export function setMode(g, mode) {
  g.mode = mode;
  g.over = false;
  if (mode === 'watch') { g.ghost = null; spawnGhost(g); g.you.dead = 1; }
  else {
    g.ghost = null; g.you.dead = 0; g.you.hp = PLAYER.hp;
    /* GRACE APPLIES HERE TOO. Only newRoom set it, so "keep playing" put you back
       on your feet in the same room, in the open, with the thing that just killed
       you standing over you. Every way of becoming alive again gets the same
       three seconds. */
    g.protectUntil = g.now + PLAYER.spawnProtect;
  }
}

/* BACK ON YOUR FEET, SAME ROUND.
 *
 * Dying used to be a soft-lock. `newRoom()` is the only thing that clears
 * `you.dead`, it runs on a round advance or a stalemate, the round cannot
 * advance while the Mirror is alive, and the stalemate breaker resets its own
 * timer on every frame that `g.you.dead` is set -- so neither could ever fire.
 * Measured: killed at round 1 with the Mirror alive, then a hundred seconds of
 * play, and the body never got up. The fight carried on around a corpse and the
 * only way out was the dock's restart button, which throws the session back to
 * round 1 (it keeps what the Mirror has learned; the round history is what is
 * lost).
 *
 * The round still does not end by itself, which is the rule: this waits for the
 * player, keeps the round number, and keeps everything the Mirror has learned.
 */
export function reviveRound(g) {
  if (!g.you.dead) return false;
  g.reroll = (g.reroll || 0) + 1;   /* or it respawns into the same trap */
  g.roundStartedAt = g.now;
  g.deadlockSince = g.now;
  endLife(g.A); endYouLife(g.A);                     /* that life is over, however it ended */
  /* AND IT STUDIES AFTER LOSING, WHICH IT NEVER DID.
   *
   * The study beat and the practice fight lived only in the round-WON path, so
   * the one channel that can make the Mirror better than the average of you
   * opened only when you were already beating it. A player who is struggling
   * gave it no chance to improve at all -- measured across a 30-round session,
   * 27 rehearsals for 29 player wins and none for the 3 losses.
   *
   * Seeded off `reroll` rather than `round`, because a loss does not advance
   * the round: seeding on the round alone would hand it the same practice
   * fight it just had.
   *
   * Worth stating plainly, since it cuts against the player: this makes the
   * Mirror improve after it kills you, not only after you kill it. That is the
   * owner's call and the reason is theirs -- the alternative is a Mirror that
   * can only get better at beating someone who is already winning. */
  let passes = 0;
  if (g.A.n >= 60) passes += studyBeat(g.A, 400);
  /* !rehearsalBusy() BECAUSE A SECOND DEATH MUST NOT DISCARD THE FIRST ONE'S
     WORK. beginRehearsal overwrites `live` unconditionally, so a revive while
     one is still in flight throws away a part-finished fight and its gradient
     -- silently, since the panel simply restarts and looks fine. Cheap here,
     load-bearing headless: there a whole practice fight runs inside one step(),
     so an ungated revive turns every death into thousands of extra steps and
     the QC run stops looking hung and starts BEING hung. */
  if (g.A.n >= 600 && !g.noRehearse && !rehearsalBusy())
    beginRehearsal(g.A, (g.seed + (g.reroll || 0) * 6151) >>> 0, HARD_MAX,
                   g.headless ? 0 : PAUSE_MS);
  g.studied = { passes, moves: g.A.n };
  g.log.studyPasses += passes; g.log.studyBeats++;
  logEvent(g.log, g, 'studied', { note: passes + ' passes over ' + g.A.n +
                                        ' frames of you, after losing' });
  newRoom(g, true);
  return true;
}

export function restart(g) {
  /* A NEW FIGHT MEANS A NEW WORLD, not the same one again. Keeping the seed
     made the button a retry of a room you had just learned, which is the
     opposite of what it says. Note what is NOT here: g.A. The Mirror keeps
     everything it has learned across a restart — the dock button is about the
     world, and only the boot card's NEW STORY touches the memory. */
  g.seed = freshSeed();
  g.look = castFor(g.seed);
  g.round = 1; g.wins = 0; g.deaths = 0; g.over = false;
  g.mode = 'play'; g.ghost = null; g.watchUnlocked = false;
  g.self = makeSelf();
  g.roundStartedAt = g.now; g.reroll = 0;
  /* EVERY FIELD, OR THE ONES LEFT OUT ARE SILENTLY DESTROYED. This reset
     omitted foeReloads and foeDry, so the two counters that describe whether
     the Mirror can use its magazine were wiped on every restart and the
     session report could never have shown them even if it had asked. Keep
     this in step with the literal in createGame. */
  g.stats = { shotsFired: 0, hitsTaken: 0, foeShots: 0, foeHits: 0,
              foeReloads: 0, foeDry: 0, foeEmptyFrames: 0, foeAliveFrames: 0,
              youEmptyFrames: 0, youAliveFrames: 0 };
  newRoom(g, false);
}

/* ---- one tick ----------------------------------------------------------- */
export function step(g, input, dtMs) {
  const DT = WORLD.DT;
  g.now += dtMs;
  g.frameN = (g.frameN || 0) + 1;
  /* THE REHEARSAL RUNS IN SLICES, four milliseconds at a time, so the beat it
     lives in stays at sixty frames a second and the card can play it back. */
  if (rehearsalBusy()) {
    const rr = stepRehearsal(g.headless ? 1e9 : 4);
    if (rr) g.rehearsed = rr;
  }
  g.tSec += DT;
  settleReloads(g);
  advanceRoom(g.room, g.tSec);
  /* A wall that moved this tick must PUSH whatever is standing there. Resolving
     actors only when they move means a slab slides through anyone holding still,
     which is one of the two ways an actor ends up inside geometry. */
  for (const a of [g.you, g.ghost, ...g.foes]) {
    if (!a || a.dead) continue;
    const rr = resolveCollide(g.room, a.x, a.z, PLAYER.radius);
    a.x = rr[0]; a.z = rr[1];
  }

  /* HOW MUCH IT KNOWS, on the 0..1 the ladder wants. Thirty-five per cent is
     taken as "it has you": measured, a player fighting close scores about 20%
     and a strictly repetitive one 95%, so 35 puts the top of the fight within
     reach of someone who is actually being read without handing it over for a
     lucky ten seconds. */
  /* PEAK-HELD, decaying over ~75 s. A real session report showed why the raw
     value cannot drive the difficulty: median skill +5%, habits named, style
     copied at full weight - and the instant the smoothed score dipped to -4%
     the drive collapsed to the round floor, so the report printed "0% read"
     under a panel full of things it knew. Knowledge does not vanish the second
     a ratio wobbles. It rises instantly and it FADES, so abandoning a habit
     still pays - over a minute, visibly, not in one frame. */
  /* one number, straight off the thing that steers */
  g.knows = clamp(agentScore(g.A).keys, 0, 1);
  g.learned = g.knows;
  /* "KNOWS YOU" IS WIDER THAN THE POSITION MODEL. A real 24-round session:
     style copied at 100%, habits named, 330 shots watched - and the drive sat
     at 18% of its ceiling because this number only counted the positional
     read, which for a distance-keeper is honestly near zero. The user's design
     intent, stated: ITS GOAL IS TO KILL YOU, AND YOUR STYLE IS THE HOW. So
     what it has learned about how you FIGHT drives aggression too - matured
     over rounds so it cannot spike at round five off one magazine - while the
     positional read keeps its own job: aim quality. Unreadable movement still
     makes its shots miss; it no longer makes the fight polite. */
  /* A ROUND IS A COUNTER AND A NEW ARENA. It grants the Mirror nothing: no
     permission to shoot, no permission to lead, no extra speed, no cadence. It
     cannot, because every one of those used to be a hand-written stage and the
     whole point now is that the only thing that changes between round one and
     round forty is how much of the player the policy has watched. */
  const actor = g.mode === 'watch' ? g.ghost : g.you;

  /* --- ONE LESSON, TAKEN FROM THE FRONT OF THE FRAME -------------------
     What the player could see BEFORE they acted, paired with what they then
     did. Taking the observation after the move would be showing the policy the
     answer: the body has already gone where the keys sent it. */
  const teach = g.mode === 'play' && !g.you.dead && !g.paused;
  if (teach) {
    g.aimWas = [g.you.hx, g.you.hz];
    const nf0 = nearestFoe(g, g.you);
    see(g.obsYou, g.room, g.you, nf0,
        nf0 && !blocked(g.room, g.you.x, g.you.z, nf0.x, nf0.z),
        /* THE KEYS FROM LAST FRAME, NOT THIS ONE. input.keys already holds the
           decision being recorded as the answer, so passing it here put the
           answer in the question: the policy trained with its own target as an
           input and scored beautifully, then collapsed the moment it was rolled
           out, where all it has is what it was holding a frame ago. The Mirror's
           side was right all along - f.keys IS last frame's. */
        g.self.losOpen, g.self.sinceFire, g.self.threat, g.A.noVel,
        { ammo: (g.you.ammo || 0) / MAG.size, reloading: g.you.reloadUntil > g.now },
        /* AND WHAT THE OTHER BODY HAS LEFT -- the same two facts the header shows the
           player without their having to learn anything. */
        nf0 ? { hp: (nf0.hp || 0) / ((nf0.maxHp) || FOE.hp),
                ammo: (nf0.ammo || 0) / MAG.size,
                grace: (nf0.protectUntil || 0) > g.now ? 1 : 0 } : null);
  }

  /* --- the human (or the ghost standing in) --------------------------- */
  if (g.mode === 'play') movePlayer(g, input, DT);
  else if (g.ghost && !g.ghost.dead) moveGhost(g, DT);
  /* the player's memory updates AFTER the move, so the observation above only
     ever saw last frame's state — same rule as "the keys from last frame" */
  if (g.mode === 'play')
    memTick(g.you, keysToBits(input.keys), g.now, DT, g.protectUntil, g.A.noMem);

  /* --- what it believes about the player ------------------------------ */
  /* ONE MIND, SEVERAL BODIES. There is exactly one model of you, and from round
     six two enemies carry it — so a second enemy is not a second opinion, it is
     the SAME guess arriving from another direction. That is the honest reading
     of the design and it is also what makes two of them frightening rather than
     merely twice as many.
     The features describe the NEAREST live body, because "where it is, from you"
     has to mean the thing you are actually backing away from. Reading foes[0]
     for ever meant that once a second enemy was closer, every threat feature in
     the vector described someone across the room. */
  /* WHAT IS FLYING AT ME, in my own frame — asked by both bodies through one
     function, because the moment the weapon became symmetric the question did
     too. Rounds carry whose hand they left, so nobody is ever frightened of
     their own bullet. */
  g.self.threat = threatTo(g, g.you, false);

  const seer = nearestFoe(g, actor);
  /* AWAY FROM THE KEYBOARD IS NOT PLAY. A real session began with 241 seconds
     of round one at 99% still - the player had walked away - and the Mirror
     studied the empty chair: "you stop moving 69% of the time", a buffer full
     of a man standing still, and a supervisor that then rightly refused to let
     any of it aim for the rest of the session. Three seconds of no keys, no
     trigger and no movement stops the WATCHING; the fight itself carries on,
     and the first touch of a key resumes it. */
  g.self.inGrace = g.now < g.protectUntil;
  const idleNow = input.keys.size === 0 && !input.firing &&
                  Math.hypot(g.you.vx, g.you.vz) < 0.4;
  g.idleMs = idleNow ? (g.idleMs || 0) + dtMs : 0;
  const afk = g.idleMs > 3000;
  /* THE LESSON, once the AFK gate has had its say. A policy shown ten thousand
     frames of a still body learns that standing still IS the game — the old
     style channel was bitten by exactly this and the blank slate has further to
     fall, because it has no hand-written floor to land on. */
  /* THE PLAYER'S MAGAZINE, COUNTED THE SAME WAY AS THE MIRROR'S, so the report
     can show both columns. Counted for every live frame whether or not the
     frame teaches -- how long you spend empty is a fact about the fight, not
     about the lesson. */
  if (g.you && !g.you.dead) {
    g.stats.youAliveFrames = (g.stats.youAliveFrames || 0) + 1;
    if ((g.you.ammo || 0) <= 0) g.stats.youEmptyFrames = (g.stats.youEmptyFrames || 0) + 1;
  }
  if (teach && !afk) {
    const a2 = g.actYou;
    a2[0] = input.keys.has('w') ? 1 : 0; a2[1] = input.keys.has('a') ? 1 : 0;
    a2[2] = input.keys.has('s') ? 1 : 0; a2[3] = input.keys.has('d') ? 1 : 0;
    /* the trigger as it ACTUALLY went off: a pull the shared 190 ms cap refused
       is not a decision to fire, and counting it teaches a cadence nobody has */
    a2[4] = g.youFired ? 1 : 0;
    /* WHICH DIRECTION THEY CHOSE, relative to the bearing to the Mirror. Zero
       offset is straight at it; a doorway pre-fire is simply another bin. */
    for (let i = 0; i < NAIM; i++) a2[5 + i] = 0;
    {
      const nf2 = nearestFoe(g, g.you);
      let off = 0;
      if (nf2) {
        const b2 = Math.atan2(nf2.z - g.you.z, nf2.x - g.you.x);
        off = Math.atan2(g.you.hz, g.you.hx) - b2;
      }
        a2[5 + aimBinOf(off)] = 1;
    }
    /* THE RELOAD YOU ASKED FOR, on the frame you asked for it. Like the trigger
       this is the ACT and not the intention: a reload the game refused because
       one was already running, or because the magazine was full, teaches a
       cadence nobody has. */
    a2[RELOAD] = g.youReloaded ? 1 : 0;
    learn(g.A, g.obsYou, a2);
  }
  g.keysPrev = new Set(input.keys);
  g.youFired = false;
  g.youReloaded = false;

  g.afk = afk;
  /* the two clocks the observation reads about the body asking it */
  {
    const nf2 = nearestFoe(g, g.you);
    const clear = nf2 && !nf2.dead && !blocked(g.room, g.you.x, g.you.z, nf2.x, nf2.z);
    g.self.losOpen = clear ? g.self.losOpen + DT : 0;
    g.self.sinceFire += DT;
    g.self.inGrace = g.now < g.protectUntil;
  }

  /* --- the enemies ----------------------------------------------------- */
  /* --- THE MIRROR ------------------------------------------------------
   *
   * All of it. There is nothing else in here: no orbit ring, no engage range,
   * no peek window, no hide timer, no doorway routing, no stuck recovery, no
   * burst length, no cadence, no hold-fire distance, no pre-fire gate. Two
   * hundred and eighty lines of those used to live at this spot, every one of
   * them written by hand and complete before the player had touched a key,
   * with the player's measured habits fitted to them as dials.
   *
   * What replaces them is a body that looks at the room, asks the policy what
   * you would do here, and holds the keys it answers with. Everything it can
   * express, it learned; everything it has not learned, it cannot do. That is
   * the whole point, and it is why the first rounds are quiet.
   */
  for (const f of g.foes) {
    if (f.dead) continue;
    const target = actor && !actor.dead ? actor : null;
    if (!target) continue;
    const lineNow = !blocked(g.room, f.x, f.z, target.x, target.z);
    f.losT = lineNow ? (f.losT || 0) + DT : 0;
    /* ITS VIEW OF THE FIGHT, built by the same function that builds yours, with
       the roles swapped. This is the only reason a policy cloned from you can
       drive it at all: the vector it is handed has the same meaning, position
       for position, as the ones it was taught on. */
    memTick(f, keysToBits(f.keys), g.now, DT, f.protectUntil, g.A.noMem);
    see(g.obsIt, g.room, f, target, lineNow, f.losT,
        (g.now - (f.lastShot || 0)) / 1000, threatTo(g, f, true), g.A.noVel,
        { ammo: (f.ammo || 0) / MAG.size, reloading: f.reloadUntil > g.now },
        /* AND WHAT THE OTHER BODY HAS LEFT -- the same two facts the header shows the
           player without their having to learn anything. */
        target ? { hp: (target.hp || 0) / PLAYER.hp,
                   ammo: (target.ammo || 0) / MAG.size,
                   grace: (target === g.you ? g.protectUntil
                                            : (target.protectUntil || 0)) > g.now ? 1 : 0 } : null);
    if (!f.keys) f.keys = new Set();
    /* THE REHEARSAL DRIVES THIS BODY ITSELF. practice.js samples the action,
       records the log-probability it had, and applies it — so step() must not
       sample a SECOND action here and overwrite it. Doing both meant the action
       stored in the rollout was never the action that happened, which quietly
       invalidates every policy-gradient update built on it. */
    if (g.externalFoe) continue;
    /* THE ABLATION SWITCH, read here because this is the one place the policy
       reaches the body. qc/ablate.js sets it to ask "what is this channel
       actually worth" — a question that went unasked for six weeks. */
    const a = g.ablateAgent
      ? { keys: new Set(), aim: null, fire: false }
      : act(g.A, g.obsIt, f.keys, g.rnd, g.frameN || 0);
    f.keys = a.keys;
    /* the panels read the live decision off the game rather than
       recomputing it, so what is drawn IS what the body was told */
    g.lastAct = a;
    applyKeys(g, f, a.keys, DT, FOE.radius, 'top', a.aim);
    /* the trigger goes through the same shoot() the player's does, and is held
       to the same 190 ms by the same line of code */
    /* THE CADENCE IS READ BEFORE THE SHOT, NOT AFTER IT. shoot() sets
       f.lastShot, so a couldFire computed afterwards asks "has fireEvery
       elapsed since the shot I just took" -- which is false by construction on
       exactly the frames that fired. See the couldFire guard below: taking the
       reading after the action excluded every positive sample from the trigger
       calibration and pinned its measured rate at zero. */
    const lastShotBefore = f.lastShot || 0;
    const fired = a.fire && shoot(g, f);
    /* AND ITS OWN RELOAD, through the same reload() the player's key calls. It
       gets no help and no special case: if it never learns to reload early it
       simply reloads late, when the empty trigger does it for it. */
    if (a.reload) reload(g, f);
    /* A FRAME WHERE FIRING WAS IMPOSSIBLE IS NOT A DECISION NOT TO FIRE. The
       calibration compares how often each side pulls the trigger; counting the
       1150 ms of a reload, or every frame of an empty magazine, as "chose not
       to" drags its measured rate toward zero and walks the bias the wrong way.
       Both sides are measured only on frames where the shot was available. */
    /* ...AND THE CADENCE CAP COUNTS AS UNAVAILABLE TOO. This guard tested
       ammo and reload only, while shoot() refuses a third case: any frame
       within fireEvery of the last shot. The action is held for five frames
       between decisions, so a Mirror that fires on one frame had the next
       two counted as choosing not to -- measured at 10.2% of admitted frames
       by dev_log/audit AI-06, dragging its measured rate down and walking
       the trigger bias exactly the way the paragraph above says it must not.
       The comment was right; the predicate was one term short. */
    /* HOW MUCH OF ITS LIFE IT SPENDS UNABLE TO SHOOT. Counted because the
       player found the Mirror starving on an empty magazine after fifteen
       rounds and NOTHING IN THE APP MEASURED IT -- every panel scores hands,
       aim and trigger, so the one channel that broke was the only one with no
       readout. A number nobody displays cannot be noticed going wrong. */
    g.stats.foeAliveFrames = (g.stats.foeAliveFrames || 0) + 1;
    if ((f.ammo || 0) <= 0) g.stats.foeEmptyFrames = (g.stats.foeEmptyFrames || 0) + 1;
    /* AND THIS IS WHY IT USES lastShotBefore. Written with f.lastShot it read
       the value shoot() had just written, so `couldFire` was false on every
       frame the Mirror actually fired -- the controller saw didFire=false 2122
       times out of 2122 in a measured session, both of its rates sat at exactly
       0.000%, and biasBlind never moved off 0.00. A calibration that cannot see
       a positive sample cannot calibrate: the Mirror fired blind on 95-100% of
       its shots against players who never fire blind, and the loop written to
       stop that had been measuring nothing. Same shape as the reload flag that
       lived in the keydown handler -- take the reading where the thing happens,
       and before the thing changes what you are reading. */
    const couldFire = (f.ammo || 0) > 0 && !(f.reloadUntil > g.now)
                      && (g.now - lastShotBefore) >= PLAYER.fireEvery;
    if (couldFire) noteFired(g.A, fired, lineNow, a.rawFire);
    /* ITS OWN FRAME, held pending until the life it belongs to can be scored.
       Built exactly the way the player's is built above — same keys, same
       "did the trigger actually go off", same aim bin relative to the bearing —
       so the two buffers are the same kind of thing and one loss can read both. */
    if (g.A.selfW) {
      const ai = g.actIt || (g.actIt = new Float32Array(ACT));
      ai[0] = a.keys.has('w') ? 1 : 0; ai[1] = a.keys.has('a') ? 1 : 0;
      ai[2] = a.keys.has('s') ? 1 : 0; ai[3] = a.keys.has('d') ? 1 : 0;
      ai[4] = fired ? 1 : 0;
      for (let i = 0; i < NAIM; i++) ai[5 + i] = 0;
      ai[5 + a.aimBin] = 1;
      ai[RELOAD] = a.reload ? 1 : 0;
      noteSelf(g.A, g.obsIt, ai);
    }
    /* the drive settles up once per frame, earning or not */
    driveTick(g.A);
    if (fired) {
      g.stats.foeShots++;
      logFoeShot(g.log, g, f, target);
      /* PRE-FIRE, COUNTED RATHER THAN CODED. There is no longer any such thing
         as a pre-fire gate: the policy pulls the trigger or it does not, and
         whether there happened to be a line is something we observe afterwards,
         exactly as we observe it about the player. If the Mirror shoots at
         closed doors it is because you do. */
      if (!lineNow) g.log.foe.rBlind = (g.log.foe.rBlind || 0) + 1;
    }
  }

  /* --- bullets fly ------------------------------------------------------
     Every round is advanced along its own line and tested against every body it
     sweeps past this frame. It used to resolve only where it landed, which was
     fine while the Mirror aimed AT somebody — the landing point was the target.
     A policy points down a corridor, and a round that only exists at its
     destination flies straight through anyone standing in the way. */
  for (const s of g.shots) {
    if (s.done) continue;
    const stepD = BULLET_SPEED * DT;
    const sx = s.x, sz = s.z;
    s.travelled += stepD;
    s.x += s.dx * stepD; s.z += s.dz * stepD;
    if (s.travelled >= s.range) { s.done = true; s.doneAt = g.now; s.x = s.fx + s.dx * s.range; s.z = s.fz + s.dz * s.range; }
    /* SAME RULE, BOTH WAYS: a round hurts whoever it passes near, and it does
       not care whose hand it left. */
    const marks = s.mine ? g.foes : [actor];
    for (const t of marks) {
      if (!t || t.dead) continue;
      const missBy = sweptMiss(sx, sz, s.x, s.z, t.x, t.z);
      /* HOW CLOSE THIS ROUND HAS EVER COME to the body it was fired at. A hit is
         the same question answered yes or no; this is the answer as a number, and
         it is the only thing that makes the objective learnable at this budget —
         a hit happens about once in five simulated minutes, while every single
         round gives a distance. It says nothing about where to stand or when to
         peek: it is "how close did you come to hurting them", which is the
         objective already. */
      /* HOW CLOSE IT CAME, for whoever fired it. This used to be recorded only
         for the Mirror's rounds, which made the practice reward one-sided: it
         was paid for nearly hitting and never charged for nearly being hit. */
      s.minMiss = Math.min(s.minMiss === undefined ? 1e9 : s.minMiss, missBy);
      if (missBy >= FOE.dmgEdge) continue;
      s.done = true; s.doneAt = g.now;
      const shielded = t === g.you ? g.now < g.protectUntil : g.now < (t.protectUntil || 0);
      if (shielded) { s.fizzled = true; break; }
      /* YOUR HITS HAD NOWHERE TO GO. The counter the report reads was fed by the
         old hitscan path and never reattached when the weapon became a real
         projectile, so a session with twenty-one kills reported 0% accuracy —
         a number that is not merely missing but wrong, which is worse. */
      if (!s.mine) {
        g.stats.foeHits++;
        /* THE ONLY THING IT WANTS. Damage it landed on the player, paid to the
           frames that led here. There is no other reward anywhere in this
           project: nothing for range, nothing for cover, nothing for finding a
           line — every one of those would be a hand-written tactic dressed as a
           goal, and the whole point is that a habit has to earn its place by
           leading to this. */
        reward(g.A, missBy < FOE.dmgCore ? 2 : 1);
      }
      else { g.stats.hits = (g.stats.hits || 0) + 1; g.log.you.hits++; }
      /* SAME WEAPON. Its shots used to do a flat 1 inside a 0.45 m radius while
         yours do 2 through the middle and 1 on a clip inside 0.62 - the exact
         same core/edge rule now runs both ways. */
      s.hit = true;
      const dmg = missBy < FOE.dmgCore ? 2 : 1;
      /* THE LIFE'S LEDGER. One line applies every point of damage in the game,
         and `s.mine` says who fired, so this is the one honest place to keep
         what the Mirror's current life is worth: what it landed, and what it
         took. Scored when the life ends; see endLife() in agent.js. */
      if (!s.mine) g.A.lifeOut += dmg; else g.A.lifeIn += dmg;
      /* and against the decision that caused it, for the per-frame gate */
      g.A.pendRew += s.mine ? -dmg : dmg;
      /* AND THE SAME LEDGER FROM YOUR SIDE, which is the opposite sign: your
         shot landing is a good moment of yours, its shot landing is a bad one.
         This is what lets the study prefer your best frames over your average
         ones -- see endYouLife() in agent.js. */
      g.A.youPend += s.mine ? dmg : -dmg;
      /* FLOORED AT ZERO. A two-damage core hit on a one-health body left
         hp = -1 -- caught by the stress fleet's INV-HEALTH on 11 of 36 games.
         Death itself was unaffected (the check is <= 0), but every reader of
         hp then clamps or branches around a value that should not exist. */
      t.hp = Math.max(0, t.hp - dmg);
      splat(g.room, t.x, t.z, g.splatN++, false);
      if (g.mode === 'play' && t === g.you) g.stats.hitsTaken++;
      if (t.hp <= 0 && t !== g.you && t !== g.ghost) {
        endLife(g.A); endYouLife(g.A);
        t.dead = g.now; t.fell = Math.atan2(t.hz, t.hx);
        splat(g.room, t.x + t.hx * 0.5, t.z + t.hz * 0.5, g.splatN++, true);
        g.log.you.kills = (g.log.you.kills || 0) + 1;
        break;
      }
      if (t.hp <= 0) {
        t.dead = g.now;
        t.fell = Math.atan2(t.hz, t.hx);
        splat(g.room, t.x + t.hx * 0.5, t.z + t.hz * 0.5, g.splatN++, true);
        if (g.mode === 'play') {
          g.deaths++;
          g.log.you.deaths++;
          logEvent(g.log, g, 'the Mirror killed you', { note: 'learned from you' });
          g.watchUnlocked = true;
          g.events.push({ kind: 'death', round: g.round });
        } else {
          g.events.push({ kind: 'ghostDown', rounds: g.ghost.rounds });
        }
      }
      break;
    }
  }
  while (g.shots.length && g.now - g.shots[0].t0 > 1600) g.shots.shift();
  /* a round is kept a little past its end so the picture can fade it out */
  while (g.shots.length && g.shots[0].done && g.now - (g.shots[0].doneAt || 0) > 300)
    g.shots.shift();
  while (g.flashes.length && g.now - g.flashes[0].t0 > 130) g.flashes.shift();

  /* --- round transitions ----------------------------------------------- */
  const allFoesDown = g.foes.length > 0 && g.foes.every((f) => f.dead);
  /* A ROUND NEITHER SIDE CAN RESOLVE HAS TO END.
   *
   * Measured: two bodies thirteen metres apart in a thirty-four metre arena,
   * both alive, both moving, and never once with a line to each other for three
   * minutes. Nobody fires, so both sides' measured firing rates decay toward
   * zero, so the trigger calibration walks to its clamp — and then the Mirror
   * cannot fire even when a line appears. The player felt this as "after eight
   * rounds the AI stopped shooting me", and it feeds itself.
   *
   * The old design escaped this with hand-written doorway routing. There is
   * none now and there should not be: this is a rule about the ROUND, not a
   * tactic for the Mirror. If a fight cannot resolve, the arena is the problem,
   * so take a new one. No kill is credited to anybody. */
  /* A ROUND HAS NO CLOCK ON IT.
   *
   * This used to fire on ROUND AGE — forty-five seconds and the arena was
   * replaced whether or not anything was wrong. The player read that as a time
   * limit, correctly, and it is not one anybody asked for: they may be reading
   * the report, watching a panel, or simply taking their time, and none of that
   * is a reason to take the room away.
   *
   * What it was built for was a genuine deadlock — two bodies alive and moving
   * that never obtain a line on each other, which measured as the round sitting
   * at 9 for two hundred seconds with zero shots fired. So it now watches for
   * exactly that and nothing else: no line either way, and nobody firing. A
   * fight that is happening is never interrupted, however long it takes. */
  const anyLine = g.foes.some((f) => !f.dead &&
    !blocked(g.room, f.x, f.z, g.you.x, g.you.z));
  const firing = g.stats.foeShots !== g.deadlockShots0 ||
                 g.stats.shotsFired !== g.deadlockMine0;
  if (anyLine || firing || g.you.dead || allFoesDown || g.paused) {
    g.deadlockSince = g.now;
    g.deadlockShots0 = g.stats.foeShots;
    g.deadlockMine0 = g.stats.shotsFired;
  }
  const stuckFor = g.now - (g.deadlockSince || g.now);
  if (!allFoesDown && stuckFor > DEADLOCK_MS && !g.pendingAdvance) {
    g.roundStartedAt = g.now;
    g.deadlockSince = g.now;
    g.reroll = (g.reroll || 0) + 1;      /* or it is handed the same trap again */
    /* the life it was living is over whether or not anybody killed it, and a
       half-recorded life scored against a full one is not a comparison */
    endLife(g.A); endYouLife(g.A);
    logEvent(g.log, g, 'stalemate',
      { note: 'neither of you could see or shoot the other for ' +
              Math.round(DEADLOCK_MS / 1000) + ' s — new arena' });
    g.events.push({ kind: 'stalemate', round: g.round });
    newRoom(g, true);
  }
  if (allFoesDown && !g.pendingAdvance) {
    /* 2.6 s, not 0.9: long enough to read the banner and feel the beat the
       study happens in, short enough not to be a loading screen */
    g.pendingAdvance = g.now + 2600;
  }
  if (g.pendingAdvance && g.now > g.pendingAdvance) {
    g.pendingAdvance = 0;
    /* THE STUDY BEAT, now in two halves.
       First it goes back over what it watched you do — the same gradient steps
       the frame loop runs, on the freshest thing it has.
       Then it REHEARSES: it fights a frozen copy of itself and keeps whatever
       led to landing a round. Cloning alone cannot work at this data scale (four
       million frames in the published work against twelve thousand here) and its
       errors compound over a rollout; the documented answer is to clone first
       and fine-tune against self-play. This simulation runs 43x real time, so a
       beat between rounds buys minutes of fighting. See practice.js. */
    let passes = 0;
    if (g.A.n >= 60) {
      passes += studyBeat(g.A, 400);
    }
    /* Headless QC runs a fixed number of steps so a session replays exactly;
       the page runs for a fixed number of MILLISECONDS so the pause is the same
       length on every machine. See PAUSE_MS in practice.js. */
    if (g.A.n >= 600 && !g.noRehearse && !rehearsalBusy())
      beginRehearsal(g.A, (g.seed + g.round * 7919) >>> 0, HARD_MAX,
                     g.headless ? 0 : PAUSE_MS);
    g.studied = { passes, moves: g.A.n };
    g.log.studyPasses += passes; g.log.studyBeats++;
    logEvent(g.log, g, 'studied', { note: passes + ' passes over ' + g.A.n + ' frames of you'
      + (g.rehearsed ? ', then ' + g.rehearsed.frames + ' frames rehearsing' : '') });
    g.wins++;
    if (g.mode === 'watch' && g.ghost) g.ghost.rounds++;
    g.round++;
    g.roundStartedAt = g.now;
    logEvent(g.log, g, 'round won');
    newRoom(g, true);
    g.events.push({ kind: 'round', round: g.round, studied: g.studied });
  }
  {
    const f0 = g.foes.find((q) => !q.dead);
    if (f0) {
      g.log.foe.aliveS += DT;
      const fsp = Math.hypot(f0.vx, f0.vz);
      if (fsp > 0.4) {
        const nx2 = f0.vx / fsp, nz2 = f0.vz / fsp;
        const cross = (f0.mvHx || 0) * nz2 - (f0.mvHz || 0) * nx2;
        if (Math.abs(cross) > 0.02) g.log.foe.jinkN = (g.log.foe.jinkN || 0) + 1;
        f0.mvHx = nx2; f0.mvHz = nz2;
      }
    }
  }
  logTick(g.log, g, input);
  if (actor && actor.dead && g.now - actor.dead > 1500 && !g.over) {
    if (g.mode === 'play') { g.over = true; g.events.push({ kind: 'over' }); }
    else { g.over = true; }
  }
}

/* THE HAND-WRITTEN NAVIGATION IS GONE, and this note is what is left of it.
 *
 * A `steer()` lived here: an orbit ring around the player, plus greedy doorway
 * routing for when the straight line was blocked. It belonged to the scripted
 * enemy this game replaced, and NOTHING HAD CALLED IT SINCE. It sat in a public
 * repository whose own ledger tells the player "there is no orbit, no peek
 * timer, no routing, no cadence" -- true of what runs, and flatly contradicted
 * by ninety lines of orbit and routing sitting in the file next to it.
 *
 * Dead code that contradicts a claim is worse than dead code: anybody reading
 * the source to check the claim finds the opposite.
 *
 * What replaced it is in agent.js. The policy holds W A S D and decides where
 * to walk from the same sixteen rays the player sees. If it cannot get round a
 * wall, it has not learned to yet, and that is the honest state of it.
 */

/* The live enemy nearest an actor, falling back to the first so callers that
   run a frame after the last one dies still get a body to read. */
function nearestFoe(g, who) {
  let best = g.foes[0], bd = Infinity;
  if (!who) return best;
  for (const f of g.foes) {
    if (f.dead) continue;
    const d = Math.hypot(f.x - who.x, f.z - who.z);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

/* ONE SET OF LEGS, USED BY BOTH BODIES. The Mirror used to write its velocity
   straight into f.vx — a control nobody at a keyboard has — so "same speed" was
   true of the constant and false of the movement: it could hold any heading at
   any angle while the player was quantised to eight directions and an
   acceleration ramp. Now the only way to move, for anybody, is to hold keys. */
export function applyKeys(g, a, keys, DT, radius, camera, aim) {
  let ix = 0, iz = 0;
  if (keys.has('a')) ix -= 1;
  if (keys.has('d')) ix += 1;
  if (keys.has('w')) iz -= 1;
  if (keys.has('s')) iz += 1;
  const il = Math.hypot(ix, iz);
  if (il > 0) { ix /= il; iz /= il; }
  /* Top-down moves in SCREEN axes; first-person moves relative to the look.
     Mixing these up is the fastest way to make either camera feel broken. */
  let mvx = ix, mvz = iz;
  if (camera === 'fps') {
    mvx = -iz * a.hx - ix * a.hz;
    mvz = -iz * a.hz + ix * a.hx;
  }
  a.vx = lerp(a.vx, mvx * PLAYER.speed, PLAYER.accel);
  a.vz = lerp(a.vz, mvz * PLAYER.speed, PLAYER.accel);
  const r = moveResolved(g.room, a.x, a.z, a.vx * DT, a.vz * DT, radius, PLAYER.maxStep);
  /* velocity must follow the correction, or the model is trained on motion that
     never happened while you grind against a wall */
  a.vx = (r[0] - a.x) / DT; a.vz = (r[1] - a.z) / DT;
  a.x = r[0]; a.z = r[1];
  if (aim) {
    const al = Math.hypot(aim[0], aim[1]);
    if (al > 1e-6) { a.hx = aim[0] / al; a.hz = aim[1] / al; }
  }
}

function movePlayer(g, input, DT) {
  const you = g.you;
  if (you.dead) return;
  applyKeys(g, you, input.keys, DT, PLAYER.radius, input.camera, null);
  /* A HEADING IS A DIRECTION, SO IT IS NORMALISED HERE AND NOWHERE ELSE.
     Everything the model sees is expressed in this frame — the opponent's
     bearing, incoming fire, the movement target the clone is graded against —
     and toLocal SCALES by the heading's length, so a heading 1.41 long inflated
     the whole vector and graded a cosine at 1.049. Trusting a caller to hand in
     a unit vector is a contract nothing enforced; enforcing it costs one
     hypot. */
  if (input.aim) {
    const al = Math.hypot(input.aim[0], input.aim[1]);
    if (al > 1e-6) { you.hx = input.aim[0] / al; you.hz = input.aim[1] / al; }
  }
}

/* WATCH MODE: TWO COPIES OF YOU.
 *
 * The ghost used to be driven by a position-predicting net with a hand-written
 * drift bolted on for when the prediction said "stands still" - a spectacle
 * held together by scaffolding. It now runs the SAME policy the Mirror runs,
 * from the same observation function, with the roles swapped again. There is
 * nothing special about it at all, which is the point: if the policy is you,
 * then watching it fight itself is watching you fight yourself, and if it is
 * not yet you then that is honestly what you see. */
function moveGhost(g, DT) {
  const gh = g.ghost;
  const foe = g.foes.find((q) => !q.dead) || null;
  if (!foe) return;
  const line = !blocked(g.room, gh.x, gh.z, foe.x, foe.z);
  gh.losT = line ? (gh.losT || 0) + DT : 0;
  memTick(gh, keysToBits(gh.keys), g.now, DT, gh.protectUntil, g.A.noMem);
  see(g.obsIt, g.room, gh, foe, line, gh.losT,
      (g.now - (gh.lastShot || 0)) / 1000, threatTo(g, gh, false), g.A.noVel,
        { ammo: (gh.ammo || 0) / MAG.size, reloading: gh.reloadUntil > g.now },
        /* AND WHAT THE OTHER BODY HAS LEFT -- the same two facts the header shows the
           player without their having to learn anything. */
        foe ? { hp: (foe.hp || 0) / ((foe.maxHp) || FOE.hp),
               ammo: (foe.ammo || 0) / MAG.size,
               grace: (foe === g.you ? g.protectUntil
                                     : (foe.protectUntil || 0)) > g.now ? 1 : 0 } : null);
  if (!gh.keys) gh.keys = new Set();
  const a = act(g.A, g.obsIt, gh.keys, g.rnd, g.frameN || 0);
  gh.keys = a.keys;
  applyKeys(g, gh, a.keys, DT, PLAYER.radius, 'top', a.aim);
  if (a.fire) shoot(g, gh);
  /* AND ITS RELOAD, which it also never had. The policy decides this like any
     other action and the Mirror's own update honours it; the ghost dropped it
     on the floor, so even once it had a magazine it would have emptied it and
     stopped. Same call the Mirror makes, through the same function. */
  if (a.reload) reload(g, gh);
}


/* Incoming fire, for anybody. `fromMine` picks whose rounds count as a threat:
   the player fears the Mirror's, the Mirror fears the player's, and neither
   flinches at its own. Returns the flag and the bearing to the nearest approach,
   in the asking body's frame — the same triple shape the model has always had. */
function threatTo(g, me, fromMine) {
  for (const s of g.shots) {
    if (s.done || !!s.mine !== !!fromMine) continue;
    const ahead = (me.x - s.x) * s.dx + (me.z - s.z) * s.dz;
    if (ahead < 0) continue;                       /* it has already gone past */
    const px = s.x + s.dx * ahead, pz = s.z + s.dz * ahead;
    const ox = px - me.x, oz = pz - me.z;
    if (Math.hypot(ox, oz) < 3.5)
      return [1, (ox * me.hx + oz * me.hz) / 3.5, (-ox * me.hz + oz * me.hx) / 3.5];
  }
  return [0, 0, 0];
}

/* ONE WEAPON, ONE PROJECTILE, BOTH HANDS.
 *
 * Your rounds used to land the instant you clicked while the Mirror's flew at
 * 24 m/s, and the fairness ledger said so out loud for weeks. It mattered less
 * when the Mirror aimed with a hand-written lead: it could simply aim ahead. A
 * policy cloned from you cannot. It learns to point where YOU point, and you
 * never once had to lead anything, so a Mirror firing your aim through a slower
 * bullet would miss by exactly the distance you never had to think about.
 *
 * So the weapon is now one weapon. Both rounds leave the muzzle at BULLET_SPEED,
 * both travel, both stop at the first solid thing, both damage whoever they pass
 * within dmgEdge of, both hurt more through the middle. Leading a moving target
 * is now a skill on both sides of the fight, which is what "the same weapon"
 * always meant. */
export const BULLET_SPEED = 24;      /* m/s, both hands */

function fireShot(g, who, mine) {
  const fx = who.x + who.hx * 0.5, fz = who.z + who.hz * 0.5;
  g.shots.push({ fx, fz, x: fx, z: fz, dx: who.hx, dz: who.hz,
                 travelled: 0, range: rayRange(g.room, fx, fz, who.hx, who.hz),
                 t0: g.now, mine, done: false, hit: false });
  g.flashes.push({ x: who.x, z: who.z, hx: who.hx, hz: who.hz, t0: g.now, mine });
}

/* how far this round gets before it meets something solid */
function rayRange(room, x0, z0, dx, dz) {
  let lo = 0, hi = 44;
  /* the geometry test the whole game already agrees on, bisected — cheaper than
     a second ray/box implementation and guaranteed to say the same thing */
  if (!blocked(room, x0, z0, x0 + dx * hi, z0 + dz * hi)) return hi;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (blocked(room, x0, z0, x0 + dx * mid, z0 + dz * mid)) hi = mid; else lo = mid;
  }
  return lo;
}

/* closest approach of a moving point to a body, over one frame of travel */
function sweptMiss(sx, sz, ex, ez, ax, az) {
  const vx = ex - sx, vz = ez - sz;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((ax - sx) * vx + (az - sz) * vz) / l2)) : 0;
  return Math.hypot(sx + vx * t - ax, sz + vz * t - az);
}

/* Hitscan, blocked by cover. Used by the player and by the ghost. */
/* ONE RELOAD, BOTH HANDS.
 *
 * Nothing in here asks who is holding the gun. The magazine drops where the body
 * is standing and is thrown out to whichever side it is facing, because a mag
 * that fell straight down would be under the actor and never seen. */
export function reload(g, who) {
  if (!who || who.dead) return false;
  if (who.reloadUntil > g.now) return false;      /* already doing it */
  if (who.ammo >= MAG.size) return false;         /* nothing to gain */
  who.reloadUntil = g.now + MAG.reloadMs;
  who.reloadFrom = g.now;
  /* THE LESSON IS RECORDED HERE, NOT AT THE KEYBOARD.
     `youReloaded` used to be set only by main.js's keydown handler, so a reload
     that reached the player by any other route taught the model nothing. Every
     harness that drives the simulation directly -- this project's probes, its QC
     runner, its red team -- therefore taught `reload = 0` on every single frame
     and measured a model that had never seen one demonstration. Days of analysis
     were built on that before it was noticed, and it is the second time a
     main.js-only code path has silently emptied a measurement (the first was the
     trigger; see dev_log/redteam/README.md).
     Setting it where the reload actually happens makes every caller correct. */
  if (who === g.you) g.youReloaded = true;
  const side = (who === g.you || who === g.ghost) ? 1 : -1;
  g.mags.push({
    x: who.x - who.hx * 0.25 + who.hz * 0.30 * side,
    z: who.z - who.hz * 0.25 - who.hx * 0.30 * side,
    /* a little sideways throw and a spin, settled by drawMags in render */
    vx: (who.hz * side + (g.rnd() - 0.5) * 0.5) * 2.2,
    vz: (-who.hx * side + (g.rnd() - 0.5) * 0.5) * 2.2,
    y: 0.62, vy: 1.1, spin: (g.rnd() - 0.5) * 14, rot: g.rnd() * 6.28,
    mine: who === g.you || who === g.ghost, t0: g.now, rest: 0,
  });
  if (g.mags.length > 40) g.mags.shift();
  if (who === g.you) g.log.you.reloads = (g.log.you.reloads || 0) + 1;
  else g.stats.foeReloads = (g.stats.foeReloads || 0) + 1;
  return true;
}

/* Finish any reload whose time is up. Called once a tick for every body, so the
   magazine refills at the same moment for whoever started one. */
function settleReloads(g) {
  for (const a of [g.you, g.ghost, ...g.foes]) {
    if (!a || !a.reloadUntil) continue;
    if (g.now >= a.reloadUntil) { a.ammo = MAG.size; a.reloadUntil = 0; }
  }
}

export function shoot(g, who) {
  if (!who || who.dead) return false;
  /* MID-RELOAD THE TRIGGER DOES NOTHING, for either of you. */
  if (who.reloadUntil > g.now) return false;
  /* AN EMPTY GUN DOES NOTHING. It does not reload itself.
   *
   * This was automatic for one build and the player took it back out, and they
   * are right that it is a better game: a magazine you have to watch is a
   * decision, and a magazine that refills itself the moment it matters is a
   * cutscene. The cost is real and worth writing down — the Mirror now has to
   * LEARN to reload or it cannot shoot, and on an empty brain it has never seen
   * anybody do it. That is the premise of the whole project applied to one more
   * thing, and it is the player's call to make.
   *
   * The dry click is recorded so the panels can show it happening rather than
   * leaving the player wondering why the trigger stopped working. */
  if ((who.ammo || 0) <= 0) {
    who.dryAt = g.now;
    if (who === g.you) g.log.you.dry = (g.log.you.dry || 0) + 1;
    else g.stats.foeDry = (g.stats.foeDry || 0) + 1;
    return false;
  }
  /* THE SAME TRIGGER CAP HOLDS EVERY HAND. It used to guard only the player's,
     because only the player called this; the Mirror fires through here now too
     and is held to the identical 190 ms. */
  if (g.now - (who.lastShot || 0) < PLAYER.fireEvery) return false;
  who.lastShot = g.now;
  who.ammo = (who.ammo || 0) - 1;
  /* A CASE COMES OUT EVERY TIME ONE GOES IN. The magazine on the floor says a
     reload happened; the shells say where the shooting happened, and they build
     up under whoever has been holding the trigger. Thrown to the right of the
     body and slightly back, the way a side-ejecting weapon puts them. */
  {
    const side = (who === g.you || who === g.ghost) ? 1 : -1;
    const rx2 = -who.hz * side, rz2 = who.hx * side;
    g.shells.push({
      x: who.x + who.hx * 0.30 + rx2 * 0.18,
      z: who.z + who.hz * 0.30 + rz2 * 0.18,
      vx: rx2 * (2.4 + g.rnd() * 1.2) - who.hx * 0.7,
      vz: rz2 * (2.4 + g.rnd() * 1.2) - who.hz * 0.7,
      y: 0.70, vy: 1.5 + g.rnd() * 0.5,
      rot: g.rnd() * 6.28, spin: (g.rnd() - 0.5) * 26,
      mine: who === g.you || who === g.ghost, rest: 0,
    });
    /* they are scenery, not a leak: the oldest go when the floor is busy */
    if (g.shells.length > 220) g.shells.splice(0, g.shells.length - 220);
  }
  const mine = who === g.you || who === g.ghost;
  if (who === g.you) {
    /* A FLAG, NOT A TIMESTAMP. step() advances g.now before the lesson is
       recorded, so `firedAt === g.now` was never once true and the policy was
       taught, ten thousand times a session, that nobody pulls a trigger. */
    g.youFired = true;
    g.stats.shotsFired++;
    g.self.sinceFire = 0;
    /* every shot you fire is a sample of HOW you fight, not just of where you
       were standing when you fired it. WHETHER IT HAD ANYTHING TO HIT comes
       from the same blocked() every other line-of-sight question uses. */
    const nf = nearestFoe(g, who);
    const hasLine = !!(nf && !nf.dead && !blocked(g.room, who.x, who.z, nf.x, nf.z));
    g.log.you.blindShots = (g.log.you.blindShots || 0) + (hasLine ? 0 : 1);
    /* your own tempo and spacing, counted off your own trigger — the same two
       numbers the report shows for the Mirror, so the columns compare */
    if (g.log.you.lastShotAt) {
      const dt = g.now - g.log.you.lastShotAt;
      if (dt < 4000) { g.log.you.gapSum = (g.log.you.gapSum || 0) + dt; g.log.you.gapN = (g.log.you.gapN || 0) + 1; }
    }
    g.log.you.lastShotAt = g.now;
    if (nf && !nf.dead) {
      g.log.you.rangeSum = (g.log.you.rangeSum || 0) + Math.hypot(nf.x - who.x, nf.z - who.z);
      g.log.you.rangeN = (g.log.you.rangeN || 0) + 1;
    }
    g.log.you.shots++;
  }
  fireShot(g, who, mine);
  return true;
}


