/* THE SESSION LOG.
 *
 * Everything measured about this project so far has been measured on SYNTHETIC
 * players — scripts that orbit, zigzag, hold a range. They are reproducible and
 * they are not you, and every disagreement between "the numbers say it works"
 * and "it does not feel like it works" has come out of that gap. This records
 * what actually happened in a real session so the two can be compared.
 *
 * THE RULE HERE IS THAT IT RECORDS, IT DOES NOT DECIDE. Nothing in this file
 * feeds back into the simulation or the model; if it did, turning the report on
 * would change the game it is reporting on. It is a tap on the pipe.
 *
 * Cheap on purpose: one sample every half second, ring-buffered, and the shot
 * and round lists are capped. A log that costs frames is a log that changes the
 * thing it is measuring.
 */
import { FOE, PLAYER, CROWD } from './config.js';
import { agentScore } from './agent.js';

const EVERY_MS = 500;
const MAX_SAMPLES = 4800;        /* 40 minutes at 2 Hz */
const MAX_EVENTS = 600;

export function makeLog() {
  return {
    t0: 0, last: -1e9, samples: [], events: [],
    /* the enemy's OWN behaviour, measured the same way the player's is, so the
       two columns of the report are the same measurement and not two different
       ones with similar names */
    foe: { shots: 0, lastShot: 0, gapSum: 0, gapN: 0, burst: 0,
           rangeSum: 0, rangeN: 0, losSum: 0, losN: 0, hits: 0,
           plantSum: 0, plantN: 0, flipN: 0, aliveS: 0 },
    studyPasses: 0, studyBeats: 0,
    you: { shots: 0, hits: 0, kills: 0, deaths: 0 },
    startedAt: null,
  };
}

const push = (arr, v, cap) => { arr.push(v); if (arr.length > cap) arr.shift(); };

/* Called once per frame from the game loop, after step(). */
export function logTick(L, g, input) {
  if (!L.startedAt) L.startedAt = g.now;
  if (g.now - L.last < EVERY_MS) return;
  L.last = g.now;
  const foe = g.foes.find((f) => !f.dead);
  const A = agentScore(g.A);
  push(L.samples, {
    t: Math.round((g.now - L.startedAt) / 100) / 10,
    r: g.round,
    /* THE MIRROR, as three edges over controls that needed no learning. The
       columns this replaced described a gate, a prediction error and a counted
       style channel — none of which exist any more, and none of which ever
       steered the enemy in the way the readout implied. */
    hands: +(A.keys * 100).toFixed(0),
    aim: +(A.aim * 100).toFixed(0),
    trig: +Math.min(999, A.fire).toFixed(0),
    seen: A.graded,
    /* where you actually were and what your hands were doing — the three
       columns that have settled every argument about a session so far */
    dist: foe ? +Math.hypot(foe.x - g.you.x, foe.z - g.you.z).toFixed(1) : null,
    hp: g.you.hp,
    x: +g.you.x.toFixed(1), z: +g.you.z.toFixed(1),
    keys: input ? ['w', 'a', 's', 'd'].filter((k) => input.keys.has(k)).join('') : '',
    aimDeg: Math.round(Math.atan2(g.you.hz, g.you.hx) * 180 / Math.PI),
    spd: +Math.hypot(g.you.vx, g.you.vz).toFixed(1),
    still: Math.hypot(g.you.vx, g.you.vz) < 0.5 ? 1 : 0,
    afk: (g.idleMs || 0) > 3000 ? 1 : 0,
  }, MAX_SAMPLES);
}

export function logEvent(L, g, kind, extra) {
  push(L.events, {
    t: L.startedAt ? Math.round((g.now - L.startedAt) / 100) / 10 : 0,
    r: g.round, kind, ...(extra || {}),
  }, MAX_EVENTS);
}

/* THE ENEMY'S SHOT, measured exactly as the player's is in observeShot: the gap
   since its last one, how far away you were, and how long its line had been
   open. Without this the report could only compare what you did against what
   the enemy was TOLD to do, and the whole question is whether the telling
   worked. */
export function logFoeShot(L, g, f, target) {
  const F = L.foe;
  const dt = F.lastShot ? g.now - F.lastShot : 0;
  if (dt > 0) {
    F.gapSum += Math.min(dt, 4000); F.gapN++;
    if (dt < 260) F.burst++;
  }
  F.lastShot = g.now; F.shots++;
  if (target) { F.rangeSum += Math.hypot(f.x - target.x, f.z - target.z); F.rangeN++; }
  F.losSum += (f.losT || 0); F.losN++;
  /* the same stillness test observeShot applies to the player, applied to it —
     this cell in the report was a dash, and a comparison with a hole in it
     invites exactly the doubt it exists to settle */
  F.plantSum += Math.hypot(f.vx || 0, f.vz || 0) < 1.2 ? 1 : 0; F.plantN++;
}

/* ---- the report ---------------------------------------------------------- */

const pct = (v) => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(0) + '%');
const mean = (a, f) => (a.length ? a.reduce((p, c) => p + f(c), 0) / a.length : 0);

/* A plain-text report. Text on purpose: it can be read on the page, selected,
   and pasted straight into a conversation, which is the only way what happened
   in your session reaches whoever is fixing it. */
export function report(L, g) {
  const S = L.samples, F = L.foe, A = agentScore(g.A);
  const mins = L.startedAt ? (g.now - L.startedAt) / 60000 : 0;
  const out = [];
  const line = (s2) => out.push(s2);
  const pc = (v) => (v * 100).toFixed(0) + '%';

  line('DEAD GIVEAWAY — SESSION REPORT');
  line('='.repeat(64));
  line(`round ${g.round}  ·  ${mins.toFixed(1)} min  ·  ${L.you.shots} shots fired  ·  ` +
       `${L.you.kills} kills  ·  ${L.you.deaths} deaths`);
  line(`it has watched ${A.graded.toLocaleString()} frames of you and taken ` +
       `${A.lessons.toLocaleString()} lessons from them` +
       (L.studyBeats ? `  ·  ${L.studyBeats} study beats between rounds` : ''));
  const afkS = S.filter((s2) => s2.afk).length * EVERY_MS / 1000;
  if (afkS > 5)
    line(`away from keyboard ${afkS.toFixed(0)} s — it does not watch or learn ` +
         `while you are gone, and those seconds are in nothing here`);
  line('');

  /* ---- 1 ---------------------------------------------------------------- */
  line('1 · WHAT IT HAS TAKEN OFF YOU');
  line('-'.repeat(64));
  const trig = Math.min(1, Math.log(Math.max(1, A.fire)) / Math.log(40));
  const become = 0.45 * Math.max(0, A.keys) + 0.30 * Math.max(0, A.aim) + 0.25 * trig;
  line(`  BECOME YOU ${pc(become)}   =   hands ${pc(Math.max(0, A.keys))}` +
       `  ·  aim ${pc(Math.max(0, A.aim))}  ·  trigger ${pc(trig)}`);
  line('');
  line('  EVERY NUMBER IS AN EDGE OVER SOMETHING THAT LEARNED NOTHING. A score');
  line('  without its control is decoration — an earlier version of this report');
  line('  gave 79% to a test player with no movement style at all, because the');
  line('  number underneath was paying out for the fact that a body in motion');
  line('  keeps moving.');
  line('');
  line(`    hands    it matches ${pc(A.keysRaw)} of your key frames`);
  line(`             the best answer needing no learning gets ${pc(A.keysBase)}`);
  /* WHY THIS FIGURE SWINGS SO HARD. The control reads the keys off the body's
     own velocity and is right about 97% of the time for a smooth player, so
     there is only three points of room above it — and the edge divides by
     that room. Being one point short of the control reads as -33%. */
  line(`             leaving only ${pc(1 - A.keysBase)} of room above it to win`);
  line(`             so the part it actually learned is ${pc(Math.max(0, A.keys))}`);
  /* THESE LABELS DESCRIBED THE OLD MEASUREMENT. When the aim became a choice
     among directions the numbers changed meaning and the words did not, so the
     report said "its error 0.8822 rad per frame" about what is now a hit rate.
     A number wearing the wrong name is worse than a missing one. */
  line(`    aim      it picks the direction you picked ${pc(A.aimRaw)} of the time`);
  line(`             always picking your commonest direction gets ${pc(A.aimBase)}`);
  line(`             so it removes ${pc(Math.max(0, A.aim))} of what doing nothing costs`);
  line(`    trigger  ${A.fire.toFixed(0)}x more likely to call a shot on a frame`);
  line(`             you shot than on a frame you did not (1x = no idea)`);
  line('');
  line('  Every one is graded BEFORE it is trained on, so none of this is a');
  line('  memory of the training set.');
  line('');

  /* ---- 2 ---------------------------------------------------------------- */
  line('2 · THE LEDGER — why it can do anything at all');
  line('-'.repeat(64));
  line('  It started with an empty brain and one policy holding your controls:');
  line('  W, A, S, D, a mouse and a trigger, and sight of the map. Everything it');
  line('  does, it copied from watching you do it. Nothing in it was written by');
  line('  hand — there is no orbit, no peek timer, no routing, no cadence.');
  line('');
  line(`    you killed it        ${g.wins || 0}`);
  line(`    it killed you        ${g.deaths || 0}`);
  line(`    frames watched       ${A.graded.toLocaleString()}`);
  line(`    round                ${g.round}`);
  line('');
  if ((g.wins || 0) === 0) {
    line('  IT HAS NEVER SEEN A KILL. A round ends when you kill it, and it only');
    line('  ever learns what it has watched — so until you win one, it has no');
    line('  idea what killing looks like and this stays round 1.');
  } else {
    line(`  It has watched you win ${g.wins} time${g.wins === 1 ? '' : 's'}. That is`);
    line('  where its idea of killing comes from; there is no other source.');
  }
  line('');

  /* THIS SECTION SAID THE DRIVE WAS SWITCHED OFF long after it had been switched
     on inside the rehearsal. A report describing a machine the game no longer
     runs is the exact failure this project keeps having. */
  line('  THE REHEARSAL. Watching you is not enough on its own: the strongest');
  line('  published cloning agent for a shooter trained on four million frames,');
  /* THE MEASURED FIGURE, NOT A REMEMBERED ONE. This said 94% in prose while
     section 1 of the same report computed 92% from the same session -- two
     numbers for one quantity, one of them frozen at whatever it read the day
     the sentence was written. The paragraph above warns about exactly this. */
  line('  and cloned errors compound over a fight — which is why it can match '
       + pc(A.keysRaw));
  line('  of your key frames and still wander. So between rounds it fights a FROZEN');
  line('  COPY OF ITSELF and keeps whatever led to landing a round.');
  line('');
  line(`    rehearsals run               ${g.A.rehearsals || 0}`);
  line(`    frames spent rehearsing      ${(g.A.rehearsedFrames || 0).toLocaleString()}`);
  line(`    frames spent watching you    ${A.graded.toLocaleString()}`);
  line(`    damage it landed on you      ${g.A.rewardN || 0}`);
  line('');
  line('  The opponent is the copy of YOU it has built, so beating it is beating a');
  line('  copy of you — and the imitation keeps running on your real frames the');
  line('  whole time, which is what stops the practice drifting into something you');
  line('  are not. The reward is damage. There is no other reward anywhere.');
  line('');

  /* ---- 3 ---------------------------------------------------------------- */
  line('3 · THE FIGHT, COUNTED');
  line('-'.repeat(64));
  {
    const fGap = F.gapN ? F.gapSum / F.gapN : 0;
    const fRange = F.rangeN ? F.rangeSum / F.rangeN : 0;
    const yb = L.you.shots ? (L.you.blindShots || 0) / L.you.shots : 0;
    const ib = F.shots ? (F.rBlind || 0) / F.shots : 0;
    const row = (n, a2, b2, u, note) =>
      line(`  ${n.padEnd(10)} you ${String(a2).padStart(7)}${u}` +
           `   it ${String(b2).padStart(7)}${u}   ${note || ''}`);
    row('shots', L.you.shots, F.shots, '', 'fired all session');
    row('accuracy', L.you.shots ? Math.round(100 * (L.you.hits || 0) / L.you.shots) + '%' : '—',
        F.shots ? Math.round(100 * g.stats.foeHits / F.shots) + '%' : '—', '', 'rounds that landed');
    /* BOTH COLUMNS OR NEITHER. These showed an em-dash for the player because
       the channel that used to measure them was deleted with the rest of the old
       model — so a table headed "you / it" was quietly only about it. Counted
       here from the player's own shots instead. */
    const yGap = L.you.gapN ? L.you.gapSum / L.you.gapN : 0;
    const yRange = L.you.rangeN ? L.you.rangeSum / L.you.rangeN : 0;
    row('gap', yGap ? Math.round(yGap) : '—', Math.round(fGap), ' ms', 'between shots');
    row('range', yRange ? yRange.toFixed(1) : '—', fRange.toFixed(1), ' m', 'where they shoot from');
    row('pre-fire', (yb * 100).toFixed(0) + '%', (ib * 100).toFixed(0) + '%', '',
        'shots with no line — it does this only if you do');
    /* THE MAGAZINE, FOR BOTH HANDS. Added after a player reported the Mirror
       "not knowing how to reload any more" at round fifteen — which was true and
       which nothing here reported. It is measured, so it is shown. */
    /* BOTH COLUMNS, as the note on gap and range above says. The first version
       of this row showed an em-dash for the player, which makes a table headed
       "you / it" quietly a table about it. The player's magazine is counted the
       same way in sim.js. */
    const aliveF = g.stats.foeAliveFrames || 0;
    const emptyPct = aliveF ? Math.round(100 * (g.stats.foeEmptyFrames || 0) / aliveF) : 0;
    const yAliveF = g.stats.youAliveFrames || 0;
    const yEmptyPct = yAliveF ? Math.round(100 * (g.stats.youEmptyFrames || 0) / yAliveF) : 0;
    row('empty', (yAliveF ? yEmptyPct + '%' : '—'), emptyPct + '%', '',
        'of its life with nothing in the magazine');
    row('dry', (L.you.dry || 0), (g.stats.foeDry || 0), '', 'trigger pulled on an empty gun');
    if (emptyPct >= 40) {
      line('');
      line('  IT IS STARVING. It spends most of its life unable to shoot. The reload');
      line('  is a control it holds and does not use: it reloads at a rate it copied');
      line('  from you rather than because its magazine is empty, so it empties and');
      line('  then waits. This gets WORSE the longer you play — an untrained policy');
      line('  reloads constantly and is never empty for long.');
    }
  }
  line('');
  line('  SAME WEAPON, BOTH HANDS. Both rounds travel at the same speed, stop at');
  line('  the first solid thing, and hurt whoever they pass close to. Same health,');
  line('  same speed, same 190 ms trigger cap, same three seconds of spawn grace.');
  line('');

  return finish(out, line, S, L, g);
}

/* Sections 3 and 4, which are the same whatever the round — split out so the
   early-round path above can reach them without repeating them. */
function finish(out, line, S, L, g) {
  /* ---- 4. the timeline ------------------------------------------------- */
  line('4 · TIMELINE  (one line per 30 s)');
  line('-'.repeat(64));
  line('   t(s)  rnd  hands  aim  trigger   frames seen   dist   your hp');
  const step = Math.max(1, Math.round(30000 / EVERY_MS));
  for (let i = 0; i < S.length; i += step) {
    const s2 = S[i];
    line(`  ${String(s2.t).padStart(5)} ${String(s2.r).padStart(4)} ` +
         `${String(s2.hands).padStart(6)}% ${String(s2.aimDeg).padStart(4)}% ` +
         `${String(s2.trig).padStart(7)}x ${String(s2.seen).padStart(13)} ` +
         `${String(s2.dist == null ? '—' : s2.dist).padStart(6)} ${String(s2.hp).padStart(9)}`);
  }
  line('');

  /* ---- 5. per round — the table that answers "when did it go wrong" ------ */
  line('5 · ROUND BY ROUND');
  line('-'.repeat(64));
  line('  round   secs   hands   aim   dist  still%  afk%  deaths');
  const byR = new Map();
  for (const s2 of S) { if (!byR.has(s2.r)) byR.set(s2.r, []); byR.get(s2.r).push(s2); }
  const deathsByR = new Map();
  for (const e of L.events) if (e.kind.indexOf('killed you') >= 0)
    deathsByR.set(e.r, (deathsByR.get(e.r) || 0) + 1);
  for (const [r, rows] of byR) {
    const m2 = (f) => rows.reduce((p, c) => p + f(c), 0) / rows.length;
    const dsrc = rows.filter((s2) => s2.dist != null);
    line(`  ${String(r).padStart(5)} ${(rows.length * EVERY_MS / 1000).toFixed(0).padStart(6)} ` +
         `${m2((s2) => s2.hands || 0).toFixed(0).padStart(6)}% ` +
         `${m2((s2) => s2.aim || 0).toFixed(0).padStart(4)}% ` +
         `${(dsrc.length ? (dsrc.reduce((p, c) => p + c.dist, 0) / dsrc.length).toFixed(1) : '—').padStart(6)} ` +
         `${(m2((s2) => s2.still || 0) * 100).toFixed(0).padStart(6)}% ` +
         `${(m2((s2) => s2.afk || 0) * 100).toFixed(0).padStart(4)}% ` +
         `${String(deathsByR.get(r) || 0).padStart(7)}`);
  }
  line('');

  /* ---- 6. what your hands did ------------------------------------------- */
  line('6 · INPUT MIX  (sampled at 2 Hz)');
  line('-'.repeat(64));
  const mix = new Map();
  let switches = 0, prevK = null;
  for (const s2 of S) {
    if (s2.keys == null) continue;
    const k = s2.keys || 'none';
    mix.set(k, (mix.get(k) || 0) + 1);
    if (prevK !== null && k !== prevK) switches++;
    prevK = k;
  }
  const totK = [...mix.values()].reduce((p, c) => p + c, 0) || 1;
  const top = [...mix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  line('  ' + top.map(([k, n]) => k.toUpperCase().padEnd(4) + ' ' +
       (n / totK * 100).toFixed(0) + '%').join('   '));
  line(`  key changes: ${(switches / (totK * EVERY_MS / 1000) * 60).toFixed(0)} per minute` +
       ` (sampled — real rate is higher)`);
  line('');

  /* ---- 7. raw trace, for debugging -------------------------------------- */
  /* One line a second for the last 90 s: enough to replay the shape of the
     session, small enough to paste. The full log holds 40 minutes at 2 Hz if
     more is ever needed. */
  line('7 · RAW TRACE  (last 90 s, 1 Hz — for debugging)');
  line('-'.repeat(64));
  line('     t rnd     x     z keys  aim  spd  dist  hands   seen');
  const tail = S.slice(-180).filter((_, i) => i % 2 === 0);
  for (const s2 of tail) {
    line(`  ${String(s2.t).padStart(6)} ${String(s2.r).padStart(2)} ` +
         `${String(s2.x).padStart(5)} ${String(s2.z).padStart(5)} ` +
         `${(s2.keys || '·').padEnd(4)} ${String(s2.aimDeg).padStart(4)} ` +
         `${String(s2.spd).padStart(4)} ${String(s2.dist == null ? '—' : s2.dist).padStart(5)} ` +
         `${String(s2.hands).padStart(6)}% ${String(s2.seen).padStart(7)}`);
  }
  line('');
  line(`  ${L.events.length} events recorded. Last few:`);
  for (const e of L.events.slice(-8))
    line(`    ${String(e.t).padStart(6)}s  round ${e.r}  ${e.kind}` +
         (e.note ? '  ' + e.note : ''));
  line('');
  line('='.repeat(64));
  line('Paste this whole report into the conversation to have it read.');
  return out.join('\n');
}
