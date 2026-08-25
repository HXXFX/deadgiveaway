/* Every tunable number in the game, in one file, with the measurement that
 * justifies it. Adding a knob means editing this file and whatever consumes it,
 * and nothing else.
 *
 * The values marked MEASURED were not chosen. They came out of sweeps run
 * against scripted players, and several of them were wrong first in ways that
 * looked completely fine on screen. Changing one without re-running its sweep is
 * how this game quietly stops being about anything.
 */

export const WORLD = {
  /* A WIDE room. A square arena in a 16:9 frame is height-limited by the fit, so
     it sits in the middle with dead bars either side. */
  /* 17 x 9.6. It was 11 x 6.4 — one room, readable but small. The arena is now
     big enough for INTERIOR WALLS and two or three connected spaces, which is
     what makes cover mean something and gives the fight somewhere to go. The
     camera zooms out to match, so the figures keep the same on-screen size at
     the default distance; the thing that must not shrink is the comparison
     between you, it, and its guess. */
  AX: 17.0,          /* half-width, metres  */
  AZ: 9.6,           /* half-depth, metres  */
  WALL_T: 0.5,
  WALL_H: 0.9,       /* half-height         */
  DT: 1 / 60,
};

export const PLAYER = {
  speed: 5.0,
  /* THREE SECONDS OF GRACE at the start of every round. Without it a round can
     be decided before the player has taken a step — the enemy is already aiming
     when the room loads, and dying to a shot you had no chance to react to reads
     as the game cheating rather than as the model being good. */
  spawnProtect: 3000,
  /* SUBSTEPS. A single end-point collision test cannot know it CROSSED a thin
     slab — measured: a 3 m jump across a 0.46 m-thick prop resolved to the far
     side with no contact. Moving in substeps no longer than half the thinnest
     prop makes tunnelling impossible rather than unlikely. */
  maxStep: 0.20,
  accel: 0.22,       /* velocity lerp per tick; the control below mirrors it */
  radius: 0.36,
  hp: 3,
  fireEvery: 190,    /* ms between shots while held */
};

/* THE MAGAZINE, AND IT IS THE SAME MAGAZINE IN BOTH HANDS.
 *
 * Twenty rounds. At the shared 190 ms cadence that is 3.8 seconds of holding the
 * trigger down, which is long enough that a fight is not one long reload and
 * short enough that spraying at a wall has a price — and a price on spraying is
 * something this game has never had. There is no ammunition total; only the
 * magazine is limited, so nobody can be disarmed for good.
 *
 * AUTO-RELOAD ON AN EMPTY TRIGGER, FOR BOTH. Reloading early is a decision, and
 * a decision is something the Mirror can learn from watching. Whether to reload
 * AT ALL is not — a policy that had not yet learned it would fire twenty rounds
 * and then never fire again, which is precisely the failure this project spent a
 * week removing. So pulling an empty trigger starts a reload for whoever pulled
 * it, exactly the same either side, and the skill on top of that is reloading
 * before you are caught empty rather than after.
 */
export const MAG = {
  size: 20,
  reloadMs: 1150,    /* long enough to be a commitment, short enough to survive */
};

export const FOE = {
  radius: 0.36,
  /* THREE HITS, and how many you take off depends on how well you aimed. A
     one-shot kill made accuracy meaningless: every hit was identical, so there
     was nothing to get better at except being present. */
  hp: 3,
  dmgCore: 0.22,     /* within this of centre  -> 2 damage */
  dmgEdge: 0.62,     /* within this            -> 1 damage */
  hitRadius: 0.45,   /* MEASURED: 0.8 m forgave every near miss and flattened
                        the difference between a read player and an unread one */
  orbit: 5.6,
};

export const MODEL = {
  N_H: 20, N_OUT: 2,

  /* MEASURED: at 0.4 s the enemy hit a RANDOMLY moving player 80% of the time,
     so reading someone bought almost nothing and the premise was false. At
     0.6 s a random player is hit ~32% and a habitual one ~58%. This is the
     difficulty dial; look here before touching the model. */
  HORIZON: 0.6,

  OUT_SCALE: 1.5,    /* metres per unit of network output (it predicts a residual) */
  LR: 0.012,
  STEPS: 22,         /* SGD steps per frame */
  WD: 0.002,         /* weight decay. Small: the GATE handles the no-habit case */
  BUF: 1600,         /* ring buffer. It MUST forget, or abandoned habits keep scoring */
  VSTRIDE: 5,        /* frames between samples */
  VH: 3,             /* velocity history depth, per reference frame */

  /* THE GATE IS THE LEAST-SQUARES SCALE on the model's correction — see
     updateGate in model.js. There is no margin to tune any more: with no signal
     the scale closes on its own, and it can never make the answer worse than the
     control. GATE_MARGIN is gone with the switch it belonged to. */
  /* metres. Never divide by the control's error when the control is perfect. */
  ERR_FLOOR: 0.15,
  /* HOW LONG A WINDOW THE SCORE IS TAKEN OVER. This was 0.015 — about seven
     seconds — and that is far too short for a RATIO of two nearly-equal
     quantities: when the control has an easy stretch its error falls to a
     quarter of a metre, so a few centimetres of difference becomes forty per
     cent in either direction several times a minute. Measured against a player
     who keeps their distance, over seven minutes:
         0.015   mean  0.6%   negative 41% of the time   worst -26%
         0.008   mean  2.4%   negative 36%               worst -13%
         0.004   mean  3.3%   negative 23%               worst  -7%
         0.002   mean  4.1%   negative  8%               worst  -3%
     and the price is paid by how fast it notices a habit ending: a strictly
     periodic player scores 95.5% at 0.015 and 92.1% at 0.002. 0.004 is about
     twenty-three seconds, which keeps almost all of that and takes most of the
     swing out. Longer would read better and lie about how current it is. */
  ERR_LERP: 0.004,
  GATE_LERP: 0.25,
};

/* N_IN IS DERIVED, never typed. Two reference frames of velocity history at two
   numbers each, plus ten scalars. It was a literal 22, which meant the history
   depth could not be changed without silently mis-slicing every feature after
   it — the model would have gone on training, on garbage. */
/* +13 scalars now, not +10: the last three are INCOMING FIRE - whether one of
   the Mirror's shots is in flight at the player, and where it will land, in the
   player's own frame. A 36-round session showed the model reading the player at
   +19-23% early and decaying to zero as the difficulty ramped - because under
   pressure the player's movement becomes mostly DODGES, and a dodge is an
   answer to a stimulus the model was never shown. Its most systematic trigger
   was invisible to it. */
/* +18 now: the four WASD keys as the model's eyes on your actual DECISIONS
   (a 43-round session was 46% lateral keys and the model only ever saw the
   smoothed velocity those keys produce), and time since your last shot,
   because movement is coupled to the trigger. */
MODEL.N_IN = MODEL.VH * 4 + 18;

/* MEASURED MAP RULES. The control the model is scored against already knows the
 * room, so every metre of movement the ROOM explains earns the model nothing:
 * cover does not only stop bullets, it stops you being read. Circle-strafing
 * player vs mixer, 5 seeds, median:
 *     3 static boxes ............. 83%
 *     3 static + 1 FAST mover .... 19%
 *     9 boxes, 4 fast movers ......9%
 *     9 boxes, movers frozen ..... 36%
 *     3 static + 2 SLOW movers ... 51%   <- the shape used here
 * Swapping one corner box for a block in the CENTRE dropped it 59% -> 18%,
 * because the centre is where a circling player spends all their time.
 */
export const ROOM = {
  /* Prop count scales with the bigger arena, but DENSITY does not: the measured
     map rule is about how much of your movement the ROOM explains, and a crowded
     arena hides the whole premise. 8-12 solids across 2.4x the floor area is
     roughly the density that measured 51%. */
  /* 14-20, up from 8-12. The abstract slabs averaged about two metres across;
     a table is 1.4 and a barrel is 0.8, so the same count covered a lot less
     floor and the arena went sparse. Measured after the change: the density that
     matters is unchanged — a circling player still scores ~90% and an
     unpredictable one ~4%, which is the map rule this number exists to protect. */
  PROPS_MIN: 14, PROPS_MAX: 20,
  CENTRE_CLEAR_X: 2.6, CENTRE_CLEAR_Z: 2.1,
  MOVER_MAX: 2,
  /* INTERIOR STRUCTURE: how many wall runs cut the arena into separate rooms.
   *
   * 1-2, down from 2-3, and this was the largest single measured change in the
   * project since the aim bins. It is not a cosmetic number: two bodies in
   * different rooms have NO LINE AT ALL, and at 2-3 runs a line of sight existed
   * on 4-14% of frames depending on the player. Everything the player had
   * reported followed from that — it fires at walls because nine frames in ten
   * face one; its trigger calibration starves because line frames are a tenth of
   * the evidence; the practice fights come back with a reward of exactly zero;
   * rounds deadlock with both bodies alive and thirteen metres apart.
   *
   * Measured, 2 personas x 2 seeds x 120 s:
   *
   *     2-3 walls, 14-20 props ... 7.4% line,  6 hits,  5.4% accuracy
   *     1-2 walls, 14-20 props .. 15.9% line, 30 hits, 13.3% accuracy   <- here
   *     1   wall,  14-20 props .. 14.7% line, 27 hits, 13.5%
   *     2-3 walls,  8-12 props ... 8.1% line, 12 hits, 10.3%
   *     1-2 walls,  8-12 props .. 19.2% line, 24 hits, 11.4%
   *
   * It is the WALLS, not the props: thinning the furniture moves the number by
   * seven tenths of a point, because you can see past furniture. Opening further
   * than this buys more sightlines and no more hits, so this is the stopping
   * point rather than the extreme. */
  WALLS_MIN: 1, WALLS_MAX: 2,
  DOOR_W: 2.6,          /* a doorway has to be wide enough to fight through */
  MOVER_SPEED: 0.05,       /* Hz. Fast movers add noise NEITHER side can predict */
  MOVER_AMP: [2.2, 3.4],
  DECALS: [4, 7],
  TILE: 1.7,
};

export const CAM = {
  TOP_PITCH: 1.35,   /* 77 deg. The reference is near-orthographic; 58 deg read
                        as a leaning diorama */
  TOP_DIST: 38,
  FPS_HFOV: 85 * Math.PI / 180,
  FPS_EYE: 1.25,
  FPS_TILT: -0.08,
  NEAR: 0.22,
  /* 1.0 because the readouts live in their OWN grid column, not floating over
     the arena. It was 0.94 while they overlapped, and leaving it there after the
     rail moved simply pushed the room off-centre and left a dead strip. */
  SAFE: 1.0,
  ACTOR_AMBIENT: 0.78,   /* actors are lit on their own curve: at the room's 0.32
                            a coloured side face stops being its own colour */
  /* Top-down is now ORBITABLE. Yaw is free, pitch is clamped: past ~85 deg the
     scene is flat and the boxes lose their height read, and below ~35 deg the
     far wall hides half the floor. */
  PITCH_MIN: 0.62, PITCH_MAX: 1.48,
  DIST_MIN: 18, DIST_MAX: 64,
  ORBIT_SENS: 0.006, ZOOM_STEP: 1.12,
  ROOM_AMBIENT: 0.32,
  WALL_SEGS: 10,         /* long geometry MUST be split: painter's algorithm sorts
                            by MEAN depth, so one quad spanning 0.2-14 m draws in
                            front of everything. Measured: a side wall projected
                            to screen x 48,936 and covered the whole view. */
  PROP_SEGS: 3,
};

/* THE LADDER. There is no mode select: one opponent that keeps coming back, a
 * little more like you each time. Every machine-learning idea that wanted to be
 * a mode is a stage of one fight, and the player never has to know that.
 *
 * IT IS A DUEL, AND IT STAYS A DUEL.
 *
 * The table used to put a second body in at round six and a third at round
 * eight, which was wrong twice over. It ramped far too fast — five rounds is
 * about four minutes, and being jumped by three of them at four minutes reads as
 * the game giving up on the idea rather than escalating it. And the idea itself
 * fights the premise: this is you against the best version of yourself, and
 * there is exactly one of you. Two of it is a different sentence.
 *
 * So the ladder is now nine rounds of ONE opponent that gets faster, fires more
 * often, and — the part that actually matters — knows more about you. The
 * difficulty curve the game is really about is the model's, not the roster's.
 * A crowd is available to anyone who wants it, from the button in the dock.
 */
export const LADDER = [
  { foes: 1, shoots: false, leads: false, speed: 2.6, cadence: 1400,
    line: 'the Mirror is only watching' },
  { foes: 1, shoots: true,  leads: false, speed: 2.8, cadence: 1350,
    line: 'now the Mirror shoots back' },
  { foes: 1, shoots: true,  leads: false, speed: 2.9, cadence: 1250,
    line: 'still shooting where you are, not where you will be' },
  { foes: 1, shoots: true,  leads: true,  speed: 3.0, cadence: 1200,
    line: 'now the Mirror aims where you are going' },
  { foes: 1, shoots: true,  leads: true,  speed: 3.1, cadence: 1120,
    line: 'the Mirror is getting quicker' },
  { foes: 1, shoots: true,  leads: true,  speed: 3.2, cadence: 1050,
    line: 'the Mirror stopped wasting shots' },
  { foes: 1, shoots: true,  leads: true,  speed: 3.35, cadence: 980,
    line: 'the Mirror has your spacing now' },
  { foes: 1, shoots: true,  leads: true,  speed: 3.5, cadence: 920,
    line: 'the Mirror is not guessing any more' },
  { foes: 1, shoots: true,  leads: true,  speed: 3.6, cadence: 870,
    line: 'this is the best the Mirror has been' },
];

/* How many bodies the model is allowed to wear at once. 1 is the game; the
   other two are a choice the player makes, and they never happen on their own.
   IT IS ALWAYS ONE. The dock used to carry a toggle that cycled 1-2-3 bodies,
   and it argued with the premise of the whole game: this is you against the best
   version of yourself, and there is one of you. The plumbing stays because the
   sim reads it, but nothing sets it any more. */
export const CROWD = { max: 1 };

/* WHAT MAKES IT DANGEROUS SHOULD BE WHAT IT LEARNED, NOT THE ROUND COUNTER.
 *
 * This used to ramp speed and cadence purely on `round`, and past the table it
 * kept tightening until both hit the ceiling. By round 22 the enemy was at
 * cadence 700 and speed 4.0 whoever you were and however you played — so a
 * player who said "it is getting better at the game, but not the way I play it"
 * was describing the code exactly. The premise of the whole thing is that being
 * unreadable is the skill, and the premise was false from round five onward.
 *
 * The first four rounds are still a ladder, because they are teaching you what
 * the enemy can do: watch, shoot, shoot, lead. From round five the round number
 * only gets a third of the say and what it has learned about you gets the rest.
 * Break your habits and it slows down. Repeat yourself and it comes for you.
 *
 * `knows` is 0..1 and comes from the score the panel shows — see sim.js. It is
 * optional so nothing that only wants the flags has to know about it, and it
 * defaults to zero: no knowledge, no extra speed. */
export function stageFor(round, knows) {
  /* APPLES TO APPLES, at the user's design call: same speed, same health, same
     weapon, same trigger cap, both ways. The ladder used to hand the Mirror
     speed and cadence as difficulty knobs; those knobs are retired. Rounds one
     to four still teach what it can do (watch, shoot, shoot, lead) - after
     that, its ONLY edge is how much of you it owns: your tempo through the
     style channel, your movement through the clone, your future through the
     aim net. "It gets harder" now means, exactly, "it has become more of you".
     `knows` is kept for the behaviour gates (engage, hide) and the readouts. */
  const k = Math.max(0, Math.min(1, knows || 0));
  const i = Math.min(round, LADDER.length) - 1;
  const s = LADDER[Math.max(0, i)];
  const foes = Math.max(1, CROWD.max);
  return { ...s, round, foes, drive: k,
           speed: PLAYER.speed,
           cadence: Math.max(PLAYER.fireEvery, s.cadence),
           line: round < 5 ? s.line
               : k > 0.45 ? 'it is you now, and it is not tired'
               : k > 0.18 ? 'it is becoming you'
               : 'it cannot read you - and you are even now' };
}

