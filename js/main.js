/* Wire-up and the frame loop.
 *
 * THE GAME IS ALREADY RUNNING WHEN THE PAGE LOADS. No splash, no click-to-play:
 * the arena is live and the enemy is already watching. Only the player waits.
 */
import { WORLD, MODEL, CAM, MAG } from './config.js';
import { clamp, tok, rgba, fitCanvas } from './util.js';
import { createGame, step, shoot, reload, restart, reviveRound, setMode } from './sim.js';
import { rehearsalBusy, stepRehearsal, setPauseMs } from './practice.js';
import {
  cam, setCamera, project, screenToGround, drawFloor, pushWallsAndProps,
  pushFigure, pushCorpse, drawFlash, flushFaces, ring, mark, orbit, zoom, resetView,
  curvePointer, CRT_K, drawReticle, stepMags, drawMags, stepShells, drawShells,
  useVenue, setCrt,
} from './render.js';
import * as hud from './hud.js';
import { agentScore, OBS } from './agent.js';
import { report } from './log.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const g2d = view.getContext('2d');

/* NO ARGUMENT, so createGame draws a fresh session seed. This said `4` for the
   whole of the session-seed work and nobody noticed, because every room I
   compared had a different generator behind it rather than a different seed —
   the arena was identical on every load and the harness, which calls
   freshSeed() itself, said everything was fine. If a claim is about what the
   PAGE does, it has to be measured on the page. */
/* TWO OVERRIDES, FOR COMPARING THINGS HONESTLY.
 *
 * `?seed=N` pins the arena so two screenshots differ only by the thing being
 * compared, and `?marker=x` picks a ground mark by name. Every visual decision
 * in this project has come down to putting two renders side by side, and doing
 * that with a random seed compares two different rooms. Neither has any effect
 * on a normal load. */
const _q = new URLSearchParams(location.search);
/* set below, once the game exists; declared here because the blur handler is
   installed before the query is read */
let _unattended = false;
const _seed = _q.get('seed');
const game = createGame(_seed === null ? undefined : (parseInt(_seed, 10) || 0));
if (_q.has('marker')) game.marker = _q.get('marker');
/* `?watch=1` starts the ghost fight immediately, which is the only way a
   headless screenshot can catch a kill: nobody is there to pull a trigger. */
if (_q.get('watch') === '1') { _unattended = true; setTimeout(() => setWatch(true), 60); }
/* ?unattended=1 LIFTS THE BLUR-PAUSE WITHOUT CHOOSING WHAT IS PLAYED. Before
   this existed the only way to stop an automated browser freezing on blur was
   ?watch=1 -- which also switches to Mirror-vs-Mirror, so a harness that wanted
   to drive the PLAYER and lose a round could not have one without the other.
   It would sit at full health forever, and the frozen game looked like an AI
   that had stopped shooting. Dev-only, changes no rule of play. */
if (_q.get('unattended') === '1') _unattended = true;

/* THE MIRROR CAN REMEMBER YOU — locally, and only by your choice (plan D1).
 *
 * The brain (about 48 KB of numbers) saves into THIS browser's storage and
 * never leaves the machine: the hosting is static files and stays that way.
 * The owner's two conditions are both honoured: nothing is uploaded, and the
 * from-nothing experience is never taken away — when a saved brain exists the
 * game ASKS. Three fates, the owner's words: CONTINUE (the rival picks up
 * where it left off), QUICK PLAY (a blank Mirror, thrown away when you leave,
 * the save untouched) and NEW STORY (the rival erased for good, behind a
 * confirm). START OVER in the dock wipes it too, and the Info panel says so.
 * Harnesses never see any of this: headless, watch, unattended and ?fresh=1
 * all skip both the load and the save, so QC and probes stay deterministic. */
const BRAIN_KEY = 'dg.brain.v1';
/* SAVING IS OFF UNTIL A FATE IS CHOSEN, and off for good under QUICK PLAY.
 *
 * The undecided case was a silent data-loss bug: while the card was on screen
 * the brain had not been loaded yet, so game.A was EMPTY — and closing or
 * reloading the tab fired beforeunload -> saveBrain, writing that empty brain
 * straight over the player's rival. Every lesson gone, with no confirm and no
 * choice made. So the card raises this flag before it is shown, and only the
 * two fates that are meant to persist lower it again. */
let _noSave = false;
const _persistOK = () => !_unattended && !game.headless && !_q.has('fresh') &&
                         game.mode === 'play' && typeof localStorage !== 'undefined';
const _b64 = (fa) => { let s = ''; const u = new Uint8Array(fa.buffer, fa.byteOffset, fa.byteLength);
  for (let i = 0; i < u.length; i += 4096) s += String.fromCharCode.apply(null, u.subarray(i, i + 4096));
  return btoa(s); };
const _unb64 = (s, n) => { const raw = atob(s); if (raw.length !== n * 4) return null;
  const u = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
  return new Float32Array(u.buffer); };
const BRAIN_ARRS = ['w1', 'b1', 'w2', 'b2', 'w3', 'b3', 'rw1', 'rb1', 'rw2'];
const BRAIN_NUMS = ['rb2', 'biasLine', 'biasBlind', 'rateYouLine', 'rateYouBlind',
                    'rateYouLineBest', 'logitLine', 'logitBlind', 'logitLineN',
                    'logitBlindN', 'ppoWarm', 'rehearsals', 'rehearsalsSkipped',
                    'rehearsalsVetoed', 'lessons'];
function saveBrain() {
  if (!_persistOK() || _noSave) return;
  try {
    const A = game.A, out = { v: 1, obs: OBS, at: Date.now(), arrs: {}, nums: {} };
    for (const k of BRAIN_ARRS) out.arrs[k] = _b64(A[k]);
    for (const k of BRAIN_NUMS) out.nums[k] = A[k] || 0;
    localStorage.setItem(BRAIN_KEY, JSON.stringify(out));
  } catch (e) { /* storage full or blocked: the game must never break over a save */ }
}
function loadBrainInto(A, saved) {
  for (const k of BRAIN_ARRS) {
    const fa = _unb64(saved.arrs[k], A[k].length);
    if (!fa) return false;              /* a size mismatch is a different brain */
    A[k].set(fa);
  }
  for (const k of BRAIN_NUMS) A[k] = saved.nums[k] || 0;
  return true;
}
function offerSavedBrain() {
  if (!_persistOK()) return;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(BRAIN_KEY) || 'null'); } catch (e) {}
  if (!saved || saved.v !== 1 || saved.obs !== OBS) return;   /* other build: start clean */
  togglePause(true);
  /* undecided from here until a fate is taken — see _noSave above */
  _noSave = true;
  const lessons = (saved.nums.lessons || 0).toLocaleString();
  /* THREE FATES, owner's words: CONTINUE the rival it became, QUICK PLAY a
     blank Mirror that is thrown away when you leave, or NEW STORY and it
     forgets you ever existed. New story confirms first — "forever" must never
     be one misclick away, and it is the innocent-sounding button of the three. */
  const confirmWipe = () => hud.showSheet({
    kick: 'no coming back from this',
    said: lessons + ' lessons, gone',
    note: 'Every habit it took off you, every fight it survived — erased. '
        + 'The next round it plays, you are a stranger. There is no undo.',
    cta: 'Erase it — no undo',
    onGo: () => {
      try { localStorage.removeItem(BRAIN_KEY); } catch (e) {}
      /* the story really does start over: this blank brain becomes the new
         rival and saves from here, so the flag comes back down */
      _noSave = false;
      hud.banner('It forgot you', 'an empty brain, and no idea who you are', 2600);
      togglePause(false); view.focus();
    },
    cta2: 'Keep the memory',
    onGo2: () => offerSavedBrain(),
    hold: true,
  });
  hud.showSheet({
    kick: 'the Mirror remembers you',
    said: lessons + ' lessons kept',
    note: 'Everything it took off you is still in here — saved in this '
        + 'browser, never leaving your machine. CONTINUE and your rival picks '
        + 'up right where it left off. QUICK PLAY is a blank Mirror that '
        + 'learns you from zero and is thrown away when you leave; your rival '
        + 'stays saved, untouched. NEW STORY erases your rival for good and '
        + 'begins again from nothing.',
    cta: 'Continue',
    onGo: () => {
      /* a load failure leaves the flag UP: the save is a brain this build
         cannot read, and writing over it would be the same silent loss */
      if (!loadBrainInto(game.A, saved)) return togglePause(false);
      _noSave = false;
      /* ROUND 1, WITH MEMORY — the owner's ruling. The round count is
         this session's story (reports, streaks and the difficulty curve all
         compare session to session), so a remembered brain does not resume
         at round 31 — it walks into round 1 already knowing you, and every
         panel that used to say "empty brain" says THAT instead. */
      game.remembered = (saved.nums.lessons || 0);
      hud.banner('Round 1 — it walked in knowing you',
                 lessons + ' lessons from your past sessions, all still loaded', 3200);
      togglePause(false); view.focus();
    },
    cta2: 'Quick play',
    onGo2: () => {
      _noSave = true;             /* already up; explicit, because it is the point */
      hud.banner('Quick play', 'a blank Mirror — nothing from this one is kept', 2600);
      togglePause(false); view.focus();
    },
    cta3: 'New story',
    onGo3: confirmWipe,
    hold: true,
  });
}
addEventListener('beforeunload', saveBrain);
/* test hook, same precedent as __game: the harness drives the real functions */
window.__brain = { save: saveBrain, offer: offerSavedBrain };

/* the study pause, remembered per-browser (plan D3) */
{
  const saved = parseInt((typeof localStorage !== 'undefined' && localStorage.getItem('dg.pause')) || '1600', 10);
  setPauseMs(saved);
  const wire = (id, ms) => { const b = document.getElementById(id); if (!b) return;
    b.setAttribute('aria-pressed', String(saved === ms));
    b.addEventListener('click', () => { setPauseMs(ms);
      try { localStorage.setItem('dg.pause', String(ms)); } catch (e) {}
      document.getElementById('pauseNorm').setAttribute('aria-pressed', String(ms === 1600));
      document.getElementById('pauseLong').setAttribute('aria-pressed', String(ms === 3200));
    }); };
  wire('pauseNorm', 1600); wire('pauseLong', 3200);
}
/* ?nocrt=1 TAKES THE WHOLE TUBE OFF: the bend filter, the scanlines and the
   glass. It exists to split a bug report in half. A band of shifted pixels at
   the canvas edge can come from the game's drawing or from everything layered
   on top of it -- and the second kind can be machine-specific (compositor,
   driver, display scale), invisible on the machine doing the debugging.

   THE REPORT IT WAS BUILT FOR IS CLOSED. The band was real; it was the tube's
   drop shadow enlarging the filter region so the displacement map no longer
   lined up with the picture; it is fixed in app.css. HANDOFF 89 has the
   numbers. The flag stays for the next one, with two warnings attached,
   because both of them cost rounds:

   - IT WAS BROKEN, silently, for as long as the filter lived on .tube. The
     line below sets filter:none on the CANVAS, so the flag hid the scanlines
     and the glass and left the bend running -- in flat contradiction of the
     sentence above it, which promised to take the bend off. Two A/B runs were
     requested against a switch that could not answer them. Now that the filter
     is on the canvas the flag does what it claims. IF THE FILTER EVER MOVES,
     MOVE THIS WITH IT, and assert the computed style rather than trusting the
     line that sets it.
   - The 42-configuration sweep (dev_log/audit/probe-crt-view.html) reported
     the filter clean, and it was right: the filter WAS clean. The fault was in
     the region the filter was handed. A sweep that varies the right thing
     exhaustively can still be blind to the thing it never varied.

   setCrt(false) un-curves the pointer to match the now-flat picture -- the two
   must always read the same formula. */
/* THE NAVIGATION INSET. A small second screen showing the DEFAULT view, which
   appears when the arena view is rotated or zoomed and goes again on reset. It
   answers "when I rotate the view I lose which way WASD points" WITHOUT touching
   what the four keys mean — so the Mirror's world, and any saved brain, are
   unaffected. It adds nothing to this frame loop; it runs its own, and that loop
   returns before drawing anything while the view is at its default.

   Imported dynamically so it is fetched only once the game is up, and it can be
   turned off outright. Settings were chosen on dev_log/bench/inset.html and stay
   overridable: ?inset=off, ?frame=, ?glow=, ?pos=. See js/inset.js. */
if (_q.get('inset') !== 'off') {
  import('./inset.js')
    .then((m) => m.initInset(game))
    .catch((e) => console.error('the navigation inset failed to load: ' + e.message, e));
}

if (_q.get('nocrt') === '1') {
  setCrt(false);
  $('view').style.filter = 'none';
  for (const sel of ['.scan', '.glass']) {
    const el = document.querySelector(sel);
    if (el) el.style.display = 'none';
  }
}
const input = { keys: new Set(), camera: 'top', aim: null, firing: false };
const mouse = { x: 0, y: 0 };
/* the reticle replaces the system cursor, so it must not be left painted on
   the arena after the pointer has gone somewhere else */
let mouseIn = false;
/* `?warm=N` runs N ticks of the simulation before the first frame is drawn.
   A headless browser does not run requestAnimationFrame under a virtual clock,
   so every screenshot this project has ever taken has been frame ONE — the safe
   badge reading 2.8s in every single one was the tell, and I read past it for a
   long time. This makes a still picture of a game in progress possible, which is
   the only way to photograph a corpse or a muzzle flash. */
const _warm = parseInt(_q.get('warm') || '0', 10);
if (_warm > 0) {
  if (_q.get('watch') === '1') setMode(game, 'watch');
  /* ?spray=1 alongside ?warm makes the warm-up FIRE, so a screenshot can show
     the style panel with something in it. Dev-only, seeded, no effect on play. */
  const _spray = _q.get('spray') === '1';
  for (let i = 0; i < Math.min(_warm, 20000); i++) {
    if (_spray) {
      const f = game.foes.find((q) => !q.dead);
      if (f) { const dx = f.x - game.you.x, dz = f.z - game.you.z, l = Math.hypot(dx, dz) || 1;
               game.you.hx = dx / l; game.you.hz = dz / l; }
      if (i % 12 === 0) shoot(game, game.you);
      if (f) f.hp = 99;
      input.keys.clear(); input.keys.add(['w', 'a', 's', 'd'][(i >> 6) & 3]);
    }
    step(game, input, WORLD.DT * 1000);
  }
}

/* THE HINT BAR EARNS ITS PLACE FOR ABOUT TEN SECONDS. It used to wait for the
   player to both move AND shoot, so anyone who moved but never fired kept a
   control panel parked over the bottom of their arena for the whole session.
   It now goes when the player has shown they know, or when enough time has
   passed that they clearly are not reading it — and it comes back on pause,
   which is when someone is most likely to want it. */
const hintDone = { moved: false, shot: false, born: performance.now() };
const HINT_MAX_MS = 11000;
let dragging = null;                       /* {x,y} while right-dragging to orbit */

hud.initHud();

/* ====================================================================== */
/* input                                                                   */
/* ====================================================================== */
const MOVE = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const ARROW = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' };

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  /* SPACE is context sensitive: it answers a card if one is up, and otherwise
     pauses. One key for "the obvious next thing" is worth more than two keys
     nobody remembers. */
  if (k === ' ' || k === 'spacebar') {
    e.preventDefault();
    if (!hud.pressSheet()) togglePause();
    return;
  }
  if (k === 'p' || (k === 'escape' && document.pointerLockElement !== view)) {
    e.preventDefault(); togglePause(); return;
  }
  /* RELOAD. R is where every shooter puts it; E is accepted because it is where
     a lot of people's thumb goes first, and neither key does anything else here.
     It goes through the same reload() the Mirror's decision does, and it records
     what ACTUALLY happened — a reload the game refused because one was already
     running is not a lesson, it is a keypress. */
  if (k === 'r' || k === 'e') {
    e.preventDefault();
    /* reload() records the lesson itself now, so every caller teaches it and
       not just this one. See the note in sim.js reload(). */
    if (!game.paused && game.mode === 'play') reload(game, game.you);
    return;
  }
  if (!MOVE.has(k)) return;
  e.preventDefault();
  input.keys.add(ARROW[k] || k);
  hintDone.moved = true;
});
addEventListener('keyup', (e) => input.keys.delete(ARROW[e.key.toLowerCase()] || e.key.toLowerCase()));
/* Losing focus must clear the keys AND pause. A held key sticks down forever
   otherwise, and coming back to a fight that continued without you is worse
   than coming back to a paused one. */
addEventListener('blur', () => {
  input.keys.clear(); input.firing = false; dragging = null;
  /* `?watch=1` is the unattended case by definition, and a headless browser
     window never has focus — so this pause fired immediately and every
     screenshot I took of "the game running" was really the game 200 ms after
     load, frozen. The safe badge reading 2.8s in every single one was the tell,
     and I read past it for a long time. */
  if (!game.paused && !_unattended) togglePause(true);
});

function canvasXY(e) {
  const r = view.getBoundingClientRect();
  const d = Math.min(2, window.devicePixelRatio || 1);
  return [(e.clientX - r.left) * d, (e.clientY - r.top) * d];
}
view.addEventListener('mouseleave', () => { mouseIn = false; });
view.addEventListener('mousemove', (e) => {
  if (dragging) {
    const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
    dragging.x = e.clientX; dragging.y = e.clientY;
    orbit(-dx * CAM.ORBIT_SENS, dy * CAM.ORBIT_SENS);
    game.camYaw = cam.yaw;
    return;
  }
  const p = canvasXY(e); mouse.x = p[0]; mouse.y = p[1]; mouseIn = true;
});
view.addEventListener('mousedown', (e) => {
  view.focus();
  if (e.button === 2 || e.button === 1) {           /* right / middle: orbit */
    e.preventDefault();
    if (input.camera === 'top') { cancelSnap(); dragging = { x: e.clientX, y: e.clientY }; }
    return;
  }
  e.preventDefault();
  input.firing = true;
  fire();
});
addEventListener('mouseup', () => { input.firing = false; dragging = null; });
view.addEventListener('contextmenu', (e) => e.preventDefault());
view.addEventListener('wheel', (e) => {
  if (input.camera !== 'top') return;
  e.preventDefault();
  cancelSnap();
  zoom(e.deltaY > 0 ? CAM.ZOOM_STEP : 1 / CAM.ZOOM_STEP);
}, { passive: false });

/* requestPointerLock returns a promise that can REJECT — no user gesture, an
   unfocused document, an embedding context that forbids it. Unhandled it prints
   an uncaught error; unhandled AND relied upon, it makes first-person unplayable.
   Always caught, and there is always the cursor-steering fallback below. */
function fire() {
  if (game.mode !== 'play' || game.paused || hud.sheetPauses()) return;
  shoot(game, game.you);
  hintDone.shot = true;
}

/* ---- pause -------------------------------------------------------------- */
function togglePause(force) {
  game.paused = force === undefined ? !game.paused : !!force;
  $('pausedVeil').hidden = !game.paused;
  $('btnPause').textContent = game.paused ? 'Resume' : 'Pause';
  $('btnPause').setAttribute('aria-pressed', String(game.paused));
  if (!game.paused) view.focus();
}
$('btnPause').addEventListener('click', () => togglePause());

/* ---- buttons ------------------------------------------------------------ */
/* THE CAMERA IS TOP-DOWN AND THERE IS NOTHING TO CHOOSE. First-person was a
   second camera to keep working in a game that is read from above, and every
   panel that explains what the Mirror is thinking is drawn for that view. */
cam.mode = 'top'; input.camera = 'top';
/* WATCH IS OPT-IN, ALWAYS. Dying used to hand the player straight to the
   spectator ending, which takes the decision away from them — they may want to
   keep fighting for another twenty rounds, and they may want to watch before
   they have lost at all. The button is live from the first frame and nothing
   ever presses it for them. */
const bWatch = $('btnWatch');
function setWatch(on) {
  setMode(game, on ? 'watch' : 'play');
  bWatch.setAttribute('aria-pressed', String(on));
  bWatch.textContent = on ? 'Back to playing' : 'Watch it fight itself';
  hud.hideSheet();
  if (on) hud.toast('A copy of you is fighting',
    'built from ' + agentScore(game.A).graded + ' frames of you', 3200);
  view.focus();
}
/* ONE MODEL, MORE BODIES — AND ONLY IF ASKED.
 *
 * The ladder used to put a second enemy in at round six and a third at round
 * eight. That was too fast (five rounds is about four minutes) and it argued
 * with the premise: this is you against the best version of yourself, and there
 * is one of you. A crowd is now a thing the player turns on, it cycles 1-2-3,
 * and it takes effect at the start of the next round rather than materialising
 * someone mid-fight. */
/* IT IS ALWAYS A DUEL. The crowd toggle argued with the premise — this is
   you against the best version of yourself, and there is one of you. */

bWatch.addEventListener('click', () => setWatch(game.mode !== 'watch'));
/* ---- the session report -------------------------------------------------- */
/* Pauses on open. Reading a report while the thing it describes carries on
   changing behind it is how you end up quoting a number that has already moved. */
const rpt = $('rpt');
let reportPaused = false;
function showReport() {
  $('rptText').textContent = report(game.log, game);
  const n = game.log.samples.length;
  $('rptNote').textContent = n + ' samples · round ' + game.round;
  rpt.hidden = false;
  /* REMEMBER WHETHER THE REPORT IS WHAT PAUSED IT, so closing can undo
     exactly what opening did and nothing more. Opening used to pause and
     closing did not resume, so reading the report left the game stopped
     with only the RESUME button to say so -- and between two rounds it also
     stranded the rehearsal overlay, which looked like a hung game. */
  reportPaused = !game.paused;
  togglePause(true);
  $('rptClose').focus();
}
$('btnReport').addEventListener('click', showReport);
/* `?report=1` opens it on load, so a still picture of a real one can be taken */
if (_q.get('report') === '1') setTimeout(showReport, 40);
$('rptClose').addEventListener('click', () => {
  rpt.hidden = true;
  /* only resume if the report is what stopped it; a game the player paused
     themselves before opening it stays paused */
  if (reportPaused) { reportPaused = false; togglePause(false); }
  view.focus();
});
rpt.addEventListener('click', (e) => { if (e.target === rpt) { rpt.hidden = true; view.focus(); } });
addEventListener('keydown', (e) => {
  if (!rpt.hidden && e.key === 'Escape') { e.preventDefault(); rpt.hidden = true; view.focus(); }
}, true);
$('rptCopy').addEventListener('click', async () => {
  const txt = $('rptText').textContent;
  const btn = $('rptCopy');
  try {
    /* execCommand as the fallback, not the first choice: the clipboard API is
       refused in some embeddings and the selection trick works in all of them,
       but it steals the selection, so only reach for it when the first fails. */
    await navigator.clipboard.writeText(txt);
    btn.textContent = 'Copied';
  } catch (_) {
    const r = document.createRange();
    r.selectNodeContents($('rptText'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    btn.textContent = document.execCommand('copy') ? 'Copied' : 'Select and copy';
  }
  setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
});

$('btnReset').addEventListener('click', () => {
  /* A NEW FIGHT DOES NOT TOUCH THE MEMORY, and this button used to claim it
     did. "START OVER MEANS FORGOTTEN" was false twice over. restart() does
     not reset game.A, so the trained brain stayed in memory and wrote itself
     straight back at the next save point — the delete never survived one
     study beat (measured: 12,764 lessons deleted, 12,764 lessons back). And
     under QUICK PLAY it was actively destructive: it deleted the real rival
     and then saved the throwaway brain over it, one click, no confirm.
     The boot card is the only place memory is decided now; NEW STORY erases
     it, behind a confirm. This restarts the fight: new world, round one,
     and whatever the Mirror knows it keeps. */
  restart(game);
  bWatch.setAttribute('aria-pressed', 'false');
  bWatch.textContent = 'Watch it fight itself';
  hud.hideSheet(); togglePause(false); view.focus();
});

/* ---- popovers: the header Info and each panel's "?" ----------------------
   HOVER SHOWS, LEAVING HIDES, CLICK PINS — the owner's spec. Focus behaves
   as hover does, or the pops are unreachable by keyboard. Leaving hides on a
   short grace timer rather than at once: the pointer crossing the few pixels
   between the button and the pop fires mouseleave before mouseenter, and an
   immediate hide closes the pop in front of the reader — this is the bridge
   rule from the hover-panel pattern, done in time instead of geometry. A
   pinned pop ignores the pointer and closes on a click anywhere else, on
   Escape, on its own button, or when another pop opens. On touch there is no
   hover, so the tap lands on the click path and pins — nothing is lost. */
const POPS = [
  { b: $('btnInfo'), p: $('infoPop') },
  ...[...document.querySelectorAll('.qm')]
    .map((b) => ({ b, p: $(b.getAttribute('aria-controls')) })),
].filter((en) => en.b && en.p);
const setPop = (en, open) => {
  en.p.hidden = !open;
  en.b.setAttribute('aria-expanded', String(open));
  if (!open) en.pinned = false;
};
const closePops = (except) => { for (const o of POPS) if (o !== except) setPop(o, false); };
for (const en of POPS) {
  en.pinned = false;
  let t = 0;
  const show = () => {
    clearTimeout(t);
    if (en.p.hidden) { closePops(en); setPop(en, true); }
  };
  const shy = () => {
    if (en.pinned) return;
    clearTimeout(t);
    t = setTimeout(() => { if (!en.pinned) setPop(en, false); }, 150);
  };
  en.b.addEventListener('mouseenter', show);
  en.b.addEventListener('mouseleave', shy);
  en.p.addEventListener('mouseenter', () => clearTimeout(t));
  en.p.addEventListener('mouseleave', shy);
  en.b.addEventListener('focus', show);
  en.b.addEventListener('blur', (e) => {
    if (!en.p.contains(e.relatedTarget)) shy();
  });
  en.b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (en.pinned) setPop(en, false);
    else { closePops(en); setPop(en, true); en.pinned = true; }
  });
}
addEventListener('click', (e) => {
  for (const en of POPS)
    if (!en.p.hidden && !en.p.contains(e.target)) setPop(en, false);
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePops();
});

/* ---- view gizmo ---------------------------------------------------------- */
/* SMOOTH SNAP-BACK. Double-clicking the cube (or pressing reset) used to hard-
   cut to the default view — the camera state was overwritten in one frame and
   the picture jumped. Now it EASES there: the reset seeds a tween of the only
   camera state there is (yaw, pitch, dist), and the frame loop advances it by
   wall-clock time so the same draw path renders the rotation. Any fresh drag or
   zoom cancels it, so a snap in progress never fights the hand.

   Yaw takes the SHORT way home. Orbiting never wraps cam.yaw, so a view spun
   round twice sits at ~4π; animating that straight to 0 would unwind two whole
   turns. The target is the nearest full-turn equivalent of 0 instead, so the
   picture rotates by the smallest arc and lands on the default orientation. */
let camTween = null;
const _easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function snapView() {
  const TAU = Math.PI * 2;
  camTween = {
    from: { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist },
    to: { yaw: Math.round(cam.yaw / TAU) * TAU, pitch: CAM.TOP_PITCH, dist: CAM.TOP_DIST },
    start: performance.now(), dur: 380,
  };
}
function stepCamTween(now) {
  if (!camTween) return;
  const t = Math.min(1, (now - camTween.start) / camTween.dur);
  const e = _easeInOut(t), a = camTween.from, b = camTween.to;
  cam.yaw = a.yaw + (b.yaw - a.yaw) * e;
  cam.pitch = a.pitch + (b.pitch - a.pitch) * e;
  cam.dist = a.dist + (b.dist - a.dist) * e;
  game.camYaw = cam.yaw;
  /* at the end, land on the canonical defaults exactly — this also clears
     userZoom via resetView(), so the room re-fits as it does for a fresh view */
  if (t >= 1) { resetView(); game.camYaw = 0; camTween = null; }
}
/* a new gesture always wins over a snap in flight */
const cancelSnap = () => { camTween = null; };
const cube = $('cube');
let gizDrag = null;
cube.addEventListener('mousedown', (e) => { e.preventDefault(); cancelSnap(); gizDrag = { x: e.clientX, y: e.clientY }; });
addEventListener('mousemove', (e) => {
  if (!gizDrag) return;
  orbit(-(e.clientX - gizDrag.x) * CAM.ORBIT_SENS * 1.6,
        (e.clientY - gizDrag.y) * CAM.ORBIT_SENS * 1.6);
  game.camYaw = cam.yaw;
  gizDrag.x = e.clientX; gizDrag.y = e.clientY;
});
addEventListener('mouseup', () => { gizDrag = null; });
cube.addEventListener('dblclick', () => { snapView(); });
cube.addEventListener('wheel', (e) => {
  e.preventDefault(); cancelSnap(); zoom(e.deltaY > 0 ? CAM.ZOOM_STEP : 1 / CAM.ZOOM_STEP);
}, { passive: false });
$('zIn').addEventListener('click', () => { cancelSnap(); zoom(1 / CAM.ZOOM_STEP); });
$('zOut').addEventListener('click', () => { cancelSnap(); zoom(CAM.ZOOM_STEP); });
$('zReset').addEventListener('click', () => { snapView(); view.focus(); });

/* A view cube that shows the orbit rather than describing it. Drawn with the
   same projection maths as the arena so it cannot drift out of agreement. */
function drawCube() {
  const { w, h, d } = fitCanvas(cube);
  const g = cube.getContext('2d');
  g.clearRect(0, 0, w, h);
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const R = Math.min(w, h) * 0.26;
  const pr = (v) => {
    const x = v[0] * cy - v[2] * sy, z = v[0] * sy + v[2] * cy;
    return [w / 2 + x * R, h / 2 - (v[1] * cp - z * sp) * R * 0.92];
  };
  const V = [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]];
  const E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const p = V.map(pr);
  /* top face filled so "which way is up" is unambiguous at a glance */
  g.fillStyle = rgba(tok('hot'), 0.32);
  g.beginPath(); g.moveTo(p[4][0], p[4][1]);
  for (const i of [5, 6, 7]) g.lineTo(p[i][0], p[i][1]);
  g.closePath(); g.fill();
  g.strokeStyle = rgba(tok('ink-2'), 0.9); g.lineWidth = Math.max(1, d);
  for (const [a, b] of E) {
    g.beginPath(); g.moveTo(p[a][0], p[a][1]); g.lineTo(p[b][0], p[b][1]); g.stroke();
  }
  g.fillStyle = tok('ink-3');
  g.font = `700 ${8 * d}px ui-monospace, Consolas, monospace`;
  g.textAlign = 'center';
  g.fillText(Math.round(cam.dist) + ' m', w / 2, h - 3 * d);
}

/* ====================================================================== */
/* events from the sim -> screens                                          */
/* ====================================================================== */
/* A STATIC IMPORT. This was a dynamic one, which bought nothing — predictor is
   already in the graph through sim.js — and cost two things: a window at startup
   where the habit sentence silently did not exist, and a module specifier the
   bundler could not see, so the published build fetched a file that was not
   there and every canvas came up blank. */
/* WHAT IT WORKED OUT THIS ROUND, said in the only terms that are now true: how
   many frames of you it has watched, and what it has taken from them. There is
   no habit-detector any more because there are no habits stored anywhere — the
   policy is not a list of things it noticed about you, it is a copy of what you
   did. */
const listNoticed = () => {
  const A = agentScore(game.A);
  if (A.graded < 600) return null;
  const out = [];
  if (A.keys > 0.05) out.push(['it is holding the keys you hold, ' +
                               Math.round(A.keys * 100) + '% past guessing']);
  if (A.aim > 0.03) out.push(['it swings the mouse the way you swing it']);
  if (A.fire > 3) out.push(['it pulls the trigger where you pull it']);
  return out.length ? out : null;
};

function drainEvents() {
  while (game.events.length) {
    const e = game.events.shift();
    if (e.kind === 'round') {
      const list = listNoticed();
      /* A ROUND IS A BEAT, NOT AN INTERMISSION. What used to be a card in the
         middle of the arena is now a strip along the top of it, and the habit it
         worked out is flashed in the rail panel that already carries habits —
         so the information lands in the place the player will look for it again
         a minute later, instead of in a window they have to wait out. */
      if (list && game.round >= 3) {
        hud.banner('Round ' + game.round + ' — the Mirror worked something out',
                   list[0][0] + '. It will aim there now.', 4200);
        hud.flashNoticed();
      } else {
        /* the study beat gets said, because invisible learning is the thing
           this player has already twice correctly refused to believe in */
        const st2 = e.studied && e.studied.passes
          ? e.line + ' · studied your last ' + e.studied.moves + ' moves (' +
            e.studied.passes + ' extra passes)'
          : e.line;
        hud.banner('Round ' + game.round, st2, 3200);
        saveBrain();          /* a study beat is the natural save point */
      }
    } else if (e.kind === 'death') {
      /* A SHEET, NOT A TOAST. A toast let the round carry on around a body that
         nothing could revive -- see reviveRound() in sim.js. The round still
         does not end on its own; it waits here until you say go. */
      hud.showSheet({
        kick: 'the Mirror got you',
        said: e.leads ? 'it aimed where you were GOING' : 'it aimed where you stood',
        note: (e.leads
            ? 'It read your feet and fired ahead of them — a trick it could only '
              + 'have stolen from you. '
            : 'It caught you flat. ')
            + 'Round ' + game.round + ' is still yours to win: new arena, same '
            + 'rival, and it keeps every lesson.',
        stats: [
          ['it has become you', Math.round(hud.becomeYou(agentScore(game.A)).become * 100) + '%'],
          ['this round', 'still round ' + game.round],
        ],
        cta: 'Get back up',
        onGo: () => { reviveRound(game); togglePause(false); view.focus(); },
        hold: true,
      });
    } else if (e.kind === 'over') {
      const list = listNoticed();
      hud.showSheet({
        kick: 'the Mirror read you in',
        said: game.wins + ' round' + (game.wins === 1 ? '' : 's'),
        /* THREE CASES, not two. "It never found a habit it could use" sat next to
           "it knew you 31%" on the same card, because the sentence was chosen on
           whether a habit could be NAMED and the number came from how well it
           actually aimed. Those are different questions and the model can answer
           the second without the first. */
        note: (list
                ? 'What gave you away: ' + list[0][0].replace(/<b>|<\/b>/g, '') + '. '
                : 'It has not taken enough off you yet to fight like you. '
                  + 'It only learns what it watches you do. ') +
              'Keep going as long as you like — the round only ends when one of you '
              + 'goes down. Watching it fight a copy of you is on the button below.',
        stats: [
          ['it has become you', Math.round(hud.becomeYou(agentScore(game.A)).become * 100) + '%'],
          ['frames of you watched', agentScore(game.A).graded.toLocaleString()],
          ['its accuracy', game.stats.foeShots
            ? Math.round(100 * game.stats.foeHits / game.stats.foeShots) + '%' : '—'],
        ],
        /* KEEP PLAYING is the default action. The ending is offered, not applied. */
        cta: 'Keep playing',
        hold: true,
        onGo: () => { setMode(game, 'play'); },
      });
    } else if (e.kind === 'ghostDown') {
      hud.showSheet({
        kick: 'the copy of you is down',
        said: 'it lasted ' + e.rounds + ' round' + (e.rounds === 1 ? '' : 's'),
        note: 'Your stand: ' + game.wins + '. The thing that just lost was built '
              + 'from ' + agentScore(game.A).graded.toLocaleString()
              + ' frames of your own play — so somewhere in there, that was you '
              + 'losing to you.',
        stats: [['your rounds', String(game.wins)], ['its rounds', String(e.rounds)]],
        cta: 'Back to playing', hold: true,
        onGo: () => setWatch(false),
      });
    }
  }
}

/* ====================================================================== */
/* drawing                                                                 */
/* ====================================================================== */
let lastDrawAt = 0;
function draw(now) {
  /* the magazines fall on the WALL clock, like the death flash and everything
     else drawn for the player rather than by the physics — a pause should stop
     them, and it does, because draw() is not called while frozen */
  const dtSec = lastDrawAt ? Math.min(0.05, (now - lastDrawAt) / 1000) : 0;
  lastDrawAt = now;
  const { w, h, d } = fitCanvas(view);
  const actor = game.mode === 'watch' ? game.ghost : game.you;
  setCamera(w, h, actor || game.you);

  /* THE GROUND BELONGS TO THE VENUE, and it has to be set before the very first
     fill — the stage colour behind the arena is part of the place too. */
  useVenue(game.room.venue);
  g2d.fillStyle = tok('stage'); g2d.fillRect(0, 0, w, h);
  drawFloor(g2d, game.room, w, h);
  pushWallsAndProps(game.room);

  const body = tok('body'), hot = tok('hot'), cool = tok('cool'), acid = tok('acid');
  /* BRASS IS BRASS, NOT A TEAM COLOUR. A shell is spent metal on a floor, and
     tinting them cyan and magenta would make the debris read as two armies of
     tiny markers rather than as the mess a fight leaves. They are told apart by
     a shade, which is as much as anybody needs from something 12 cm long. */
  const brass = '#c9a227', brassIts = '#8f6f1c';

  /* WHO IS WHO, on the ground. See MARKERS in render.js for why this is not a
     closed ring any more: the mark says which way they are facing as well as
     which side they are on, and it does not draw a cage round a character the
     whole design sheet exists to show off. */
  /* A HEX, NOT AN rgba() STRING. The mark builds its own alpha — the glow needs
     three stops of it — and handing it a pre-wrapped `rgba(...)` made every
     gradient stop invalid, which threw inside the draw and took the entire arena
     with it. The screenshot was a mostly-empty room and the only tell was a file
     a third smaller than the ones next to it. */
  /* SPAWN PROTECTION IS A STROBE, NOT A RING.
     It has to be visible or it is indistinguishable from the enemy missing. A
     shrinking ring said that clearly, and said it in the one shape this game had
     just spent a week taking off the floor. Invulnerability blinks — every game
     that has ever had it blinks — and blinking costs no space at all: the figure
     flickers, its glow runs acid instead of its side colour, and the flicker
     speeds up as the grace runs out, so the end of it is felt rather than
     counted. The exact number is already in the bar. */
  const prot = actor && !actor.dead && game.now < game.protectUntil
    ? clamp((game.protectUntil - game.now) / 3000, 0, 1) : 0;
  /* the blink accelerates from about 3 Hz to about 9 Hz across the three seconds */
  const blink = prot > 0 ? (Math.sin(game.now * (0.019 + 0.030 * (1 - prot))) > -0.35) : true;
  const protCol = prot > 0 ? acid : null;

  for (const f of game.foes)
    if (!f.dead) {
      mark(g2d, f.x, f.z, f.hx, f.hz, hot, d, game.marker);
      /* THE TELL. While its legs are being driven by the clone of you, a cyan
         tick burns inside its mark - cyan means YOU everywhere in this app,
         and this is the one moment part of it literally is. The user asked
         for evidence in the fight, not in a panel. */
      if (f.polDrove) {
        const pt = project(f.x, 0.02, f.z);
        if (pt) {
          g2d.fillStyle = rgba(cool, 0.95);
          g2d.fillRect(pt[0] - 3 * d, pt[1] - 3 * d, 6 * d, 6 * d);
        }
      }
    }
  if (actor && !actor.dead)
    mark(g2d, actor.x, actor.z, actor.hx, actor.hz, protCol || cool, d, game.marker);
  /* THE GUESS MARKER IS GONE WITH THE THING THAT MADE IT. There is no longer a
     net predicting where the player will be — the policy predicts what the
     player would DO, which has no position to draw. */
  const showGuess = false;

  /* The guess is DELIBERATELY UNMASKED — it is a position, not a person, and
     giving it a face would make the one thing on screen that is not real look
     like the most real thing on it. It has no ring under it either: nothing else
     on this floor is circled any more, and a ring was the loudest way to draw
     attention to the one thing that is not really there. The figure itself is
     opaque enough to find, and it is the only acid-coloured thing in the arena. */
  if (showGuess) pushFigure(game.pred[0], game.pred[1], acid, 0.46, 0, 0);
  /* the magazines on the floor go down BEFORE the bodies, so a body standing on
     one covers it rather than the other way round */
  stepMags(game.mags, game.now, Math.min(0.05, dtSec));
  stepShells(game.shells, Math.min(0.05, dtSec));
  /* brass under the magazines: they are smaller and there are far more of them,
     so a mag landing on a pile of shells should sit on top of it */
  drawShells(g2d, game.shells, d, brass, brassIts);
  drawMags(g2d, game.mags, d, cool, hot);
  /* HOW FAR THROUGH A RELOAD A BODY IS, or null if it is not reloading. The
     figure takes it and changes shape; there is no separate indicator, because
     an animation the arena performs is worth more than a dial drawn over it. */
  const rt = (a) => (a && a.reloadUntil > game.now)
    ? 1 - (a.reloadUntil - game.now) / MAG.reloadMs : null;
  /* Your ghost wears YOUR mask, because it is you. */
  if (actor && !actor.dead)
    pushFigure(actor.x, actor.z, body, blink ? 1 : 0.34, actor.hx, actor.hz,
               protCol || cool, game.look.you, rt(actor));
  for (const f of game.foes) {
    if (f.dead) pushCorpse(f.x, f.z, f.fell, game.look.foe, body);
    /* grace is symmetric now, and so is the strobe - the Mirror flickers on the
       same clock you do, which is itself a sentence about what it is */
    else pushFigure(f.x, f.z, body, blink ? 1 : 0.34, f.hx, f.hz,
                    prot > 0 ? acid : hot, game.look.foe, rt(f));
  }
  /* and so does yours, for the second and a half before the card comes up */
  if (actor && actor.dead)
    pushCorpse(actor.x, actor.z, actor.fell, game.look.you, body);
  flushFaces(g2d);

  /* ROUNDS IN FLIGHT — one loop, because there is now one weapon. Both hands
     fire the same travelling slug at BULLET_SPEED; the only difference on
     screen is the colour, yours in the body tone and its in the hot one. The
     old code drew two completely different pictures for the two weapons, which
     is exactly how "why is its line shorter than mine" happened. */
  for (const s of game.shots) {
    const head = Math.min(s.travelled, s.range);
    const hx2 = s.fx + s.dx * head, hz2 = s.fz + s.dz * head;
    const tail = Math.max(0, head - 2.6);
    const col = s.mine ? body : hot;
    const p0 = project(s.fx + s.dx * tail, 0.9, s.fz + s.dz * tail);
    const p1 = project(hx2, 0.9, hz2);
    const pm = project(s.fx + s.dx * Math.max(0, head - 0.9), 0.9,
                       s.fz + s.dz * Math.max(0, head - 0.9));
    const fade = s.done ? clamp(1 - (game.now - (s.doneAt || game.now)) / 120, 0, 1) : 1;
    if (p0 && p1 && fade > 0) {
      g2d.strokeStyle = rgba(col, 0.30 * fade); g2d.lineWidth = 2.0 * d;
      g2d.beginPath(); g2d.moveTo(p0[0], p0[1]); g2d.lineTo(p1[0], p1[1]); g2d.stroke();
    }
    if (pm && p1 && fade > 0) {
      g2d.strokeStyle = rgba(col, 0.95 * fade); g2d.lineWidth = 3.0 * d;
      g2d.beginPath(); g2d.moveTo(pm[0], pm[1]); g2d.lineTo(p1[0], p1[1]); g2d.stroke();
    }
    /* where it stopped, for a moment */
    if (s.done && p1 && game.now - (s.doneAt || 0) < 240) {
      const f = 1 - (game.now - (s.doneAt || 0)) / 240;
      g2d.fillStyle = rgba(col, clamp(f, 0, 1) * 0.6);
      g2d.beginPath(); g2d.arc(p1[0], p1[1], (5 + 16 * (1 - f)) * d, 0, 7); g2d.fill();
    }
  }
  for (const f of game.flashes) drawFlash(g2d, f, game.now, d);
  /* a clean hit flashes brighter than a clipping one, so the damage model is
     legible without a number on screen */
  if (game.lastHit && game.now - game.lastHit.at < 220) {
    const p = project(game.lastHit.x, 0.9, game.lastHit.z);
    if (p) {
      const f = 1 - (game.now - game.lastHit.at) / 220;
      g2d.strokeStyle = rgba(game.lastHit.clean ? acid : body, f * 0.95);
      g2d.lineWidth = (game.lastHit.clean ? 3.4 : 2) * d;
      g2d.beginPath(); g2d.arc(p[0], p[1], (10 + 26 * (1 - f)) * d, 0, 7); g2d.stroke();
    }
  }

  /* THE DEATH FLASH FADES ON THE CLOCK ON THE WALL, NOT ON THE SIMULATION'S.
     It used to fade over 900 ms of game time, which was fine until the
     end-of-run card started freezing the game underneath it: the clock stops,
     the flash never ages, and the arena sits under a full-screen magenta wash
     for as long as the card is up. It looked like the whole room had changed
     colour. Anything drawn for the player rather than by the physics has to be
     timed by the frame it is drawn in. */
  if (actor && actor.dead) {
    if (flashFor !== actor) { flashFor = actor; flashFrom = now; }
    const f = 1 - (now - flashFrom) / 900;
    if (f > 0) {
      g2d.fillStyle = rgba(hot, 0.34 * f);
      g2d.fillRect(0, 0, w, h);
    }
  } else if (flashFor) flashFor = null;

  /* THE AIM POINTER, LAST, so nothing in the arena is ever drawn over it.
     Placed at curvePointer(mouse) rather than at the mouse: this canvas is
     behind the barrel, so a mark painted where the cursor is would be displaced
     away from it. See drawReticle in render.js. */
  if (game.mode === 'play' && !game.paused && !game.you.dead && mouseIn) {
    /* NO STATE IS PASSED, deliberately. The reticle used to colour itself from
       line of sight and the magazine, which handed the player as a glance what
       the Mirror has to learn to read out of thirty-six raw numbers. See
       drawReticle in render.js. */
    const cp = curvePointer(mouse.x, mouse.y, w, h);
    drawReticle(g2d, cp[0], cp[1]);
  }
}

/* THE DISPLACEMENT MAP, BUILT FROM THE SAME CONSTANT THE POINTER USES.
 *
 * feDisplacementMap moves each pixel by (R-0.5, G-0.5) times `scale`, so the map
 * encodes where to SAMPLE from: for a point p on the curved glass the flat
 * picture is read at p * (1 - K|p|^2). That is exactly the function
 * curvePointer() applies to the mouse, from the same CRT_K — the picture and the
 * pointer are two readings of one formula and cannot drift apart.
 *
 * Generated once at startup rather than authored, because a hand-drawn gradient
 * would be a guess at the curve rather than the curve.
 */
function buildCrtMap() {
  const N = 128;
  const tube = document.getElementById('tube');
  const W = (tube && tube.clientWidth) || 1200;
  const H = (tube && tube.clientHeight) || 800;
  const side = Math.max(W, H);
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  const img = x.createImageData(N, N);
  /* the largest displacement anywhere, in map units, so the filter's `scale`
     can be set to the pixel size that reproduces it exactly */
  let peak = 0;
  const dxs = new Float32Array(N * N), dys = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N * 2 - 1, v = (j + 0.5) / N * 2 - 1;
      const f = 1 - CRT_K * (u * u + v * v);
      /* ONE `scale` HAS TO SERVE BOTH AXES, so both displacements are expressed
         in the SAME unit — pixels of the longer side. Encoding x in widths and y
         in heights and then applying a single scale stretches the curve by the
         aspect ratio, which on a wide arena bends the top and bottom about twice
         as hard as the sides. */
      const dx = (u * f - u) * (W / 2) / side;
      const dy = (v * f - v) * (H / 2) / side;
      dxs[j * N + i] = dx; dys[j * N + i] = dy;
      peak = Math.max(peak, Math.abs(dx), Math.abs(dy));
    }
  }
  for (let k = 0; k < N * N; k++) {
    img.data[k * 4] = Math.round(128 + dxs[k] / peak * 127);
    img.data[k * 4 + 1] = Math.round(128 + dys[k] / peak * 127);
    img.data[k * 4 + 2] = 0;
    img.data[k * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const fe = document.getElementById('crtMap');
  const disp = document.getElementById('crtDisp');
  if (!fe || !disp) return;
  fe.setAttributeNS('http://www.w3.org/1999/xlink', 'href', c.toDataURL());
  fe.setAttribute('href', c.toDataURL());
  fe.setAttribute('width', '100%'); fe.setAttribute('height', '100%');
  /* feDisplacementMap moves a pixel by scale*(channel/255 - 0.5), and the map
     stores value/peak at 127 units either side of 128, so recovering a
     displacement of `value * side` pixels needs scale = side * peak * 255/127. */
  disp.setAttribute('scale', String(side * peak * (255 / 127)));
}
buildCrtMap();
addEventListener('resize', buildCrtMap);

/* ====================================================================== */
/* loop                                                                    */
/* ====================================================================== */
let last = 0, acc = 0, histT = 0, panelT = 0;
/* seen panel faults, so a 20 Hz failure reports once rather than every draw */
const _faults = new Set();
function panelFault(e) {
  const k = String(e && e.message || e);
  if (_faults.has(k)) return;
  _faults.add(k);
  console.error('a panel failed to draw; the game keeps running: ' + k, e);
}
/* who the death flash belongs to, and the wall-clock time it started */
let flashFor = null, flashFrom = 0;
/* when the current rehearsal pause started, so it can be capped */
let rehearseFrom = 0;
function frame(now) {
  if (!last) last = now;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  /* the view snap-back eases here; it must run whether or not the arena is
     frozen, since the reset is legal while paused too */
  stepCamTween(now);

  {
    /* the pointer goes through the same curve the picture does */
    const cp = curvePointer(mouse.x, mouse.y, view.width, view.height);
    const gp = screenToGround(cp[0], cp[1], 0.9);
    const a = game.mode === 'watch' ? null : game.you;
    if (gp && a) {
      const ax = gp[0] - a.x, az = gp[1] - a.z, al = Math.hypot(ax, az);
      if (al > 0.25) input.aim = [ax / al, az / al];
    }
  }

  /* THE SHEET DOES NOT STOP THE GAME. It used to, which is why a black card
     between rounds killed the pace: the arena froze, the panels froze, and the
     player waited. Only an explicit pause stops the clock now. */
  /* THE REHEARSAL IS THE PAUSE. While the Mirror is practising, the arena holds
     still — the round clock, the spawn grace and the fight all stop where they
     are — and the frame's whole budget goes into the practice fight instead of
     four milliseconds of it. That is what makes it affordable to rehearse for
     long enough to matter: this beat is no longer stealing from the fight. */
  let rehearsing = false;
  /* THE REHEARSAL IS NOT GAMEPLAY, SO PAUSE MUST NOT REACH IT.
   *
   * Both branches here used to be gated on `!game.paused`, which meant that
   * while the game was paused the rehearsal could neither ADVANCE nor be
   * CLEARED — the overlay sat there reading "0 frames practised" forever and
   * the game looked dead. Opening the report pauses (see showReport), and so
   * does the window losing focus, so this was reachable by pressing REPORT
   * between two rounds. It shipped, and a player found it in six rounds.
   *
   * The watchdog below was inside the same gate, so the one thing written to
   * stop a hung rehearsal could not run during the hang it was there for.
   *
   * A rehearsal is a computation with an animation over it, not part of the
   * fight, so it now runs to completion regardless. `frozen` still holds the
   * arena still, which is what pause is actually for. */
  if (rehearsalBusy()) {
    rehearsing = true;
    hud.showRehearsal(game);
    /* leave a few milliseconds for drawing the card at sixty a second */
    stepRehearsal(13);
    /* AND IT CAN NEVER HOLD THE GAME HOSTAGE. Freezing the arena for the
       rehearsal means a rehearsal that somehow does not finish is a hung game.
       Past five seconds of real time, finish it in one blocking call and take
       the dropped frame — a stutter is recoverable, a locked game is not. */
    if (!rehearseFrom) rehearseFrom = now;
    else if (now - rehearseFrom > 5000) { stepRehearsal(1e9); rehearseFrom = 0; }
  } else {
    rehearseFrom = 0;
    rehearsing = hud.endRehearsal(now);
  }
  const frozen = game.paused || hud.sheetPauses() || rehearsing;
  if (!frozen) {
    acc += dt;
    let guard = 0;
    while (acc >= WORLD.DT && guard++ < 8) { step(game, input, WORLD.DT * 1000); acc -= WORLD.DT; }
    if (input.firing) fire();
  } else acc = 0;

  /* A FROZEN ARENA DOES NOT NEED REDRAWING. Nothing in it has moved since the
     last frame, so its pixels are still correct — skipping the redraw is what
     pays for the rehearsal getting most of the frame instead of a quarter of
     it, and it is why the pause is two seconds rather than four and a half. */
  if (!rehearsing) {
    draw(now);
    if (cam.mode === 'top') drawCube();
  }
  drainEvents();
  hud.tickToast(now);
  hud.updateBar(game);
  hud.drawRehearsal(now);

  /* Panels at ~20 Hz, not 60. They are read, not watched, and redrawing six
     canvases every frame is the difference between a smooth fight and a
     stuttering one on a modest machine. */
  /* A PANEL MUST NEVER BE ABLE TO KILL THE GAME.
   *
   * frame() schedules its next rAF on its LAST line, so anything that throws
   * on the way there ends the loop for good — the arena freezes on whatever
   * was drawn, the panels stop, and only a reload brings it back. That is a
   * fatal outcome for a decorative readout, and it happened: drawSense
   * computed a negative dome radius on a short panel and ellipse() threw
   * (see the floor in hud.js). The radius is fixed, but the SHAPE of the bug
   * is what matters — six panels drawing arbitrary geometry from live numbers
   * upstream of the one line that keeps the game alive.
   *
   * So the panels are fenced. One report per distinct message, because a
   * broken panel at 20 Hz would otherwise bury the console it is trying to
   * tell you through. */
  if (now - panelT > 50 && !rehearsing) {
    panelT = now;
    try {
      hud.updateRail(game);
      hud.drawSense(game);
      hud.drawLoop(game);
      hud.drawMiss(game);
      hud.drawBrain(game);
    } catch (e) { panelFault(e); }
  }
  if (now - histT > 260) {
    histT = now;
    try { hud.drawSpark(game); } catch (e) { panelFault(e); }
  }
  const hintOver = (hintDone.moved && hintDone.shot) ||
                   (hintDone.moved && now - hintDone.born > HINT_MAX_MS) ||
                   now - hintDone.born > HINT_MAX_MS * 2;
  $('hint').classList.toggle('gone', hintOver && !game.paused);
  requestAnimationFrame(frame);
}

/* A DOOR FOR TESTS, and only when asked for. Every bug in this project so far
   has been found by measuring the running game rather than by reading it, and
   twice now that has been slowed down by there being no way to reach the state
   from outside. `?debug` puts it on the window; nothing else does. */
if (location.search.includes('debug')) {
  window.__deadgiveaway = { game, input, cam, hud };
}

/* boot */
/* The boot notice is a fallback for a page that failed to start; a build that
   strips it has nothing to hide, and assuming it exists threw before the first
   frame ever drew. */
const bootEl = $('boot');
if (bootEl) bootEl.hidden = true;
window.__booted = true;
window.__game = game;          /* test hook: the harness drives the real sim */
view.focus();
offerSavedBrain();
requestAnimationFrame(frame);
