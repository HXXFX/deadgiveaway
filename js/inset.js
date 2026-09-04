/* THE NAVIGATION INSET — a small second screen showing the DEFAULT view.
 * ============================================================================
 *
 * THE PROBLEM IT ANSWERS, in the owner's words: "when I rotate and zoom the
 * viewport I lose my understanding of direction; WASD are no longer the
 * directions I know." The four keys are WORLD axes, so orbiting the camera
 * leaves them pointing somewhere the screen no longer agrees with.
 *
 * WHY THIS AND NOT CAMERA-RELATIVE WASD. Rotating the keys by the camera was
 * tried and rejected. It has to snap to the nearest of the eight directions the
 * four keys can express, so the mapping FLIPS as you turn through a 45-degree
 * boundary, and it moves the muscle memory in the middle of a fight. Worse, the
 * four key bits ARE the lesson the Mirror learns from: rotate only the player's
 * movement and the same key means a different world direction depending on a
 * camera angle the observation never sees, so identical situations get taught
 * contradictory answers. It would not crash; it would quietly make the Mirror
 * worse. This adds a thing to LOOK AT instead, and changes nothing it learns.
 *
 * SO: WASD stay world-locked. The action space, the observation and any saved
 * brain are untouched. This module adds nothing to the frame loop or the
 * simulation — it runs its OWN requestAnimationFrame, reads state, and draws
 * into its own canvas.
 *
 * IT COSTS NOTHING WHILE HIDDEN, which is most of the time. The loop returns
 * before any drawing while the view is at its default, so the second render only
 * touches the frame budget while you are actually rotated or zoomed.
 *
 * THE ONE SHARED THING IT BORROWS. setCamera() writes to the renderer's single
 * `cam`, so this saves every field it changes, sets the default camera, draws,
 * and puts them all back. rAF callbacks run to completion, so the game's own
 * draw can never observe the borrowed camera. The face buffer is likewise
 * pushed and flushed inside one callback.
 *
 * IT IS NOT A CHILD OF .tube's CANVAS RULE. `.tube > canvas` carries the CRT
 * displacement filter, so a canvas appended straight into the tube would be
 * bent along with the arena. The canvas sits inside a wrapper DIV, which that
 * selector does not match.
 *
 * SETTINGS, chosen on the design sheet (dev_log/bench/inset.html) and overridable
 * for a future round without editing code:
 *   ?inset=off              turn it off entirely
 *   ?frame=room|arena       how the frame is proportioned   (default room)
 *   ?glow=shadow|lift|glow|rim|none                          (default shadow)
 *   ?pos=tl|tr|bl|br        which corner                     (default tl)
 */
import { cam, setCamera, drawFloor, pushWallsAndProps, flushFaces, useVenue,
         project } from './render.js';
import { CAM, WORLD } from './config.js';
import { fitCanvas, tok, rgba } from './util.js';

const INSET_W = 210;                 /* css px across */
const H_MIN = 70, H_MAX = 150;       /* so a freak window cannot make it silly */

/* WHERE IT SITS. Measured against the real chrome: the view cube owns the
   top-right and the key hint owns the bottom-centre, so top-left and
   bottom-left are the only corners nothing competes for. */
const POS = {
  tl: 'left:14px;top:14px',     tr: 'right:14px;top:14px',
  bl: 'left:14px;bottom:26px',  br: 'right:14px;bottom:26px',
};

/* HOW IT LIFTS OFF THE GLASS. A dark map on a dark arena has no edge.
   A coloured glow was offered and not taken, and it was the right call for a
   reason beyond taste: this palette books every colour — cool is YOU, hot is
   the Mirror, acid is what it knows — so a cyan glow round the frame quietly
   claims a meaning the frame does not have. The shadow spends none. */
const GLOW = {
  none:   'none',
  shadow: '0 6px 18px rgba(0,0,0,.75)',
  lift:   '0 12px 28px rgba(0,0,0,.9), 0 2px 0 rgba(0,0,0,.6)',
  glow:   '0 0 22px rgba(77,208,255,.30), 0 8px 20px rgba(0,0,0,.8)',
  rim:    'inset 0 0 0 1px rgba(242,232,213,.28), 0 0 0 2px #0a0410,'
        + ' 0 8px 20px rgba(0,0,0,.85)',
};

const C = { cool: '#4dd0ff', hot: '#ff4d6d', ink3: '#9a86bd', ground: '#0c0716' };

/* THE ASPECT AT WHICH THE ROOM EXACTLY FILLS THE FRAME.
 *
 * The frame used to take the ARENA VIEWPORT's aspect, and the room does not
 * project at that aspect, so it letterboxed — measured on the design sheet at a
 * wide window, 35.6% of the frame was dead black against 0.1% once fitted, and
 * the map got BIGGER for the same screen space.
 *
 * setCamera fits by uM and vM — the widest and tallest the arena box projects —
 * so the frame that wastes nothing has that same ratio, with the 1.5% and 2%
 * margins setCamera keeps folded in. CAM.SAFE is 1.0, so the centre is not
 * offset and the two axes can be compared directly.
 *
 * It is a CONSTANT: the arena box and the default pitch and distance never
 * change, so it is computed once and cached. */
function roomFitAspect(game) {
  const s = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist,
              userZoom: cam.userZoom, f: cam.f, ox: cam.ox, oy: cam.oy };
  cam.yaw = 0; cam.pitch = CAM.TOP_PITCH; cam.dist = CAM.TOP_DIST;
  cam.userZoom = false;
  const actor = game.mode === 'watch' ? game.ghost : game.you;
  setCamera(1, 1, actor || game.you);           /* fills pos/fwd/rgt/up */
  let uM = 1e-6, vM = 1e-6;
  const topY = WORLD.WALL_H * 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [0, topY]) {
    const dx = sx * (WORLD.AX + WORLD.WALL_T * 2) - cam.pos[0];
    const dy = sy - cam.pos[1];
    const dz = sz * (WORLD.AZ + WORLD.WALL_T * 2) - cam.pos[2];
    const cz = dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2];
    if (cz <= CAM.NEAR) continue;
    uM = Math.max(uM, Math.abs((dx * cam.rgt[0] + dy * cam.rgt[1] + dz * cam.rgt[2]) / cz));
    vM = Math.max(vM, Math.abs((dx * cam.up[0] + dy * cam.up[1] + dz * cam.up[2]) / cz));
  }
  cam.yaw = s.yaw; cam.pitch = s.pitch; cam.dist = s.dist;
  cam.userZoom = s.userZoom; cam.f = s.f; cam.ox = s.ox; cam.oy = s.oy;
  return (uM / vM) * (0.485 / 0.48);
}

/* the view is "off default" when any of the three camera values has moved. The
   snap-back tween lands on exact defaults, so this goes false again on reset. */
function offDefault() {
  return cam.yaw !== 0
      || Math.abs(cam.pitch - CAM.TOP_PITCH) > 1e-6
      || Math.abs(cam.dist - CAM.TOP_DIST) > 1e-6
      || cam.userZoom;
}

export function initInset(game) {
  const tube = document.getElementById('tube');
  if (!tube) return;
  const q = new URLSearchParams(location.search);
  const opt = {
    frame: q.get('frame') || 'room',
    glow: q.get('glow') || 'shadow',
    pos: q.get('pos') || 'tl',
  };
  let fitA = 0, faults = 0, lastH = 0;

  const wrap = document.createElement('div');
  wrap.id = 'dgInset';
  wrap.style.cssText =
    'position:absolute;z-index:6;display:none;' + POS[opt.pos] + ';'
    + 'width:' + INSET_W + 'px;height:' + Math.round(INSET_W * 0.55) + 'px;'
    + 'background:' + C.ground + ';border:2px solid ' + C.ink3 + ';'
    + 'box-shadow:' + GLOW[opt.glow];
  const cv = document.createElement('canvas');
  cv.style.cssText = 'width:100%;height:100%;display:block';
  /* THE CAPTION SITS OUTSIDE THE FRAME. Once the map is fitted to the room it
     fills the glass, so a caption inside the box would lie across the room
     instead of in dead space. It flips above the frame for a top corner. */
  const cap = document.createElement('div');
  cap.textContent = 'default view';
  cap.style.cssText =
    'position:absolute;left:0;right:0;'
    + (opt.pos === 'tl' || opt.pos === 'tr' ? 'top:-14px;' : 'bottom:-15px;')
    + 'text-align:center;font:700 9px ui-monospace,monospace;letter-spacing:.14em;'
    + 'text-transform:uppercase;color:' + C.ink3 + ';pointer-events:none';
  wrap.append(cv, cap);
  tube.appendChild(wrap);

  /* ---- the same fight, drawn from the default camera ---------------------- */
  function draw(g, w, h) {
    const s = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist,
                userZoom: cam.userZoom, f: cam.f, ox: cam.ox, oy: cam.oy };
    cam.yaw = 0; cam.pitch = CAM.TOP_PITCH; cam.dist = CAM.TOP_DIST;
    cam.userZoom = false;
    const actor = game.mode === 'watch' ? game.ghost : game.you;
    setCamera(w, h, actor || game.you);
    useVenue(game.room.venue);
    g.fillStyle = tok('stage'); g.fillRect(0, 0, w, h);
    drawFloor(g, game.room, w, h);
    pushWallsAndProps(game.room);
    flushFaces(g);

    /* ROUNDS IN FLIGHT. The game's own shots, with the geometry the arena uses —
       the head at min(travelled, range) and a short trail behind it — run
       through THIS view's camera so the line lands where the bullet really is.
       Under the bodies, so a dot is never lost behind its own muzzle. */
    for (const sh of game.shots || []) {
      const head = Math.min(sh.travelled, sh.range);
      const tail = Math.max(0, head - 2.6);
      const fade = sh.done
        ? Math.max(0, 1 - (game.now - (sh.doneAt || game.now)) / 120) : 1;
      if (fade <= 0) continue;
      const p0 = project(sh.fx + sh.dx * tail, 0.9, sh.fz + sh.dz * tail);
      const p1 = project(sh.fx + sh.dx * head, 0.9, sh.fz + sh.dz * head);
      if (!p0 || !p1) continue;
      g.strokeStyle = rgba(sh.mine ? C.cool : C.hot, 0.9 * fade);
      g.lineWidth = 1.8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
      g.lineCap = 'butt';
    }

    /* THE BODIES, and where each gun points. The tick is PROJECTED, not drawn
       flat: a point 1.6 m ahead along the heading, through the same camera. In
       screen space it would lean the wrong way toward the edges of the frame
       and quietly lie about the aim. */
    const AIM = 1.6;
    const dot = (a, col) => {
      if (!a || a.dead) return;
      const p = project(a.x, 0.9, a.z);
      if (!p) return;
      if (a.hx || a.hz) {
        const t = project(a.x + a.hx * AIM, 0.9, a.z + a.hz * AIM);
        if (t) {
          g.lineCap = 'round';
          g.strokeStyle = '#0a0410'; g.lineWidth = 4.5;
          g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(t[0], t[1]); g.stroke();
          g.strokeStyle = col; g.lineWidth = 2.2;
          g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(t[0], t[1]); g.stroke();
          g.lineCap = 'butt';
        }
      }
      g.beginPath(); g.arc(p[0], p[1], 4, 0, 7);
      g.fillStyle = col; g.fill();
      g.strokeStyle = '#0a0410'; g.lineWidth = 1.4; g.stroke();
    };
    for (const f of game.foes || []) dot(f, C.hot);
    dot(actor || game.you, C.cool);

    cam.yaw = s.yaw; cam.pitch = s.pitch; cam.dist = s.dist;
    cam.userZoom = s.userZoom; cam.f = s.f; cam.ox = s.ox; cam.oy = s.oy;
  }

  /* a tuning hook for the design sheet; harmless, and the same kind of
     affordance as ?nocrt, ?warm and ?seed elsewhere in this app */
  window.__inset = {
    set(o) {
      Object.assign(opt, o);
      wrap.style.left = wrap.style.right = wrap.style.top = wrap.style.bottom = '';
      for (const pair of POS[opt.pos].split(';')) {
        const [k, v] = pair.split(':');
        wrap.style[k] = v;
      }
      wrap.style.boxShadow = GLOW[opt.glow];
      const top = opt.pos === 'tl' || opt.pos === 'tr';
      cap.style.top = top ? '-14px' : '';
      cap.style.bottom = top ? '' : '-15px';
      lastH = 0;
      return { ...opt };
    },
    get() { return { ...opt, fitAspect: fitA, height: lastH, width: INSET_W }; },
  };

  (function tick() {
    requestAnimationFrame(tick);
    const on = offDefault();
    wrap.style.display = on ? 'block' : 'none';
    if (!on || !game.room) return;         /* free while the view is at default */
    /* A PANEL MUST NEVER BE ABLE TO KILL THE GAME — the rule the six instrument
       panels follow. This has its own rAF, so a throw would stop only this loop,
       but it would stop it for good: report once and carry on. */
    try {
      if (!fitA) fitA = roomFitAspect(game);
      const ar = opt.frame === 'room'
        ? fitA : (tube.clientWidth || 16) / (tube.clientHeight || 9);
      const hh = Math.round(Math.max(H_MIN, Math.min(H_MAX, INSET_W / ar)));
      if (hh !== lastH) { wrap.style.height = hh + 'px'; lastH = hh; }
      const { w, h } = fitCanvas(cv);
      const g = cv.getContext('2d');
      g.clearRect(0, 0, w, h);
      draw(g, w, h);
    } catch (e) {
      if (!faults++) console.error('the navigation inset failed to draw: ' + e.message, e);
    }
  })();
}
