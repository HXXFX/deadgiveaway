/* Procedural abstract rooms.
 *
 * Hotline Miami furnishes its rooms — couches, TVs, bodies — which costs sprite
 * art and hand-built maps. This arena is the inside of a model of the player,
 * not a place, so slabs, pillars and painted floor shapes are HONEST set
 * dressing, and they are free: every round can be a new room grown from a seed.
 *
 * THE GENERATOR OBEYS THE MEASURED MAP RULES BY CONSTRUCTION (see config.ROOM).
 * They are the difference between a room and a room that hides what the game is
 * about, and they are easy to break by eye because a cluttered arena looks
 * better in a screenshot than an open one.
 *
 * Colours are stored as TOKEN NAMES plus a DARKEN amount and resolved at draw
 * time. Darkening only — so no generated colour can ever break the rule that
 * nothing in the environment is as bright as an actor.
 */
import { WORLD, ROOM, PLAYER } from './config.js';
import { VENUES, byTag, byTagSize, sizeOf, venueByKey } from './props.js';
import { mulberry32, clamp, tok, stylesAvailable, mixHex, luminance,
         setGround, getGround } from './util.js';

/* Nine floor patterns, five prop families and eleven painted shapes. The
   arithmetic matters: the arena is meant never to repeat, and with two or three
   wall runs, 8-12 solids and 4-7 decals on top of these lists the number of
   distinct rooms is far past anything a player will see. Adding vocabulary is
   the cheapest variety there is — every entry multiplies with every other. */
const PATTERNS = ['checker', 'stripes', 'weave', 'bricks', 'diag', 'blocks',
                  'herring', 'dots', 'tri'];
const TOKENS = ['prop-a', 'prop-b', 'prop-c'];

/* ONE CONNECTED SPACE, VERIFIED, NOT ASSUMED.
 *
 * Wall runs are placed independently, so two of them cross and brick up each
 * other's doorways. Measured on 120 seeds before this existed: 84 arenas were
 * not one connected space, several with a third of the floor walled off. In the
 * game that reads as an enemy that never arrives — a player who stood still for
 * 90 seconds took no damage at all on 5 of 12 seeds, because the fight was
 * happening in a room it could not reach.
 *
 * A 0.45 m grid (about half a body) is flooded from the largest open region and
 * the room is only handed out if nearly all of the standable floor is reachable
 * from it. Rooms that fail are re-rolled rather than repaired: a generator that
 * can produce a bad room and a checker that throws it away is far simpler to
 * trust than a generator that tries to be clever about doorways.
 */
const NAV_CELL = 0.45;

/* NO UNUSABLE SLOT BETWEEN TWO WALLS.
 *
 * The last 38 mm of collision overlap in this game lived in one: two interior
 * wall runs passing 0.70 m apart. A 0.72 m body cannot walk in — the navigation
 * grid correctly marks it solid — but it CAN be slid in by a resolver pushing it
 * along one wall, and once there both walls push back and neither push wins.
 * The gap is either a corridor or it is nothing.
 *
 * Sampled along each wall piece rather than solved: the pieces lean, so the
 * closed-form distance between two rotated slabs is more arithmetic than this
 * deserves, and eleven samples a piece over at most a dozen pieces is nothing.
 */
/* one look every ~0.55 m along the longest run the generator can make */
const SLOT_SAMPLES = 25;
export function worstWallSlot(walls) {
  let worst = Infinity;
  for (let i = 0; i < walls.length; i++) {
    const a = walls[i];
    const cs = Math.cos(a.rot || 0), sn = Math.sin(a.rot || 0);
    const ax = a.hx >= a.hz ? 1 : 0;
    const along = ax ? a.hx : a.hz, across = ax ? a.hz : a.hx;
    for (let j = 0; j < walls.length; j++) {
      if (j === i) continue;
      /* a doorway is not a trap: skip the two halves of one run */
      if (a.run !== undefined && a.run === walls[j].run) continue;
      /* ONLY NEAR-PARALLEL RUNS CAN TRAP. What jams the resolver is two faces
         pushing back at each other: a body between them is shoved out of one
         and into the other for as long as it stands there. Two runs meeting at
         a wide angle are a CORNER — the wedge opens fast enough that a body
         always slides out, and judging those samples rejected every room with a
         wall in it, because a sample can sit arbitrarily close to the corner.
         Runs in this generator are either the same orientation (leans differ by
         at most 0.22 rad) or square to each other, so the test separates them
         exactly. */
      const b = walls[j];
      let dAng = Math.abs((a.rot || 0) - (b.rot || 0)) % Math.PI;
      if (dAng > Math.PI / 2) dAng = Math.PI - dAng;
      const aLong = a.hx >= a.hz, bLong = b.hx >= b.hz;
      if (aLong !== bLong) dAng = Math.PI / 2 - dAng;   /* long axes, not boxes */
      if (dAng > 0.5) continue;
      /* PER PAIR, and the MINIMUM. Taking the smallest positive sample across
         all pairs at once rejected almost every room — at any real corner the
         distance between two pieces sweeps continuously from zero upwards, so
         some sample always lands in the forbidden band. What matters is whether
         a pair EVER touches: two walls that meet are a corner, two that pass
         0.7 m apart are a trap. */
      /* SKIP THE TOUCHING SAMPLE, NOT THE WHOLE PAIR. Discarding a pair because
         one sample touched forgave everything else about it — and two long runs
         crossing at a shallow angle do exactly that: they meet at the crossing,
         which is a legitimate corner, and pinch to 0.56 m a couple of metres
         along, which is a trap. The room shipped with a 0.70 m corridor for a
         0.72 m body; a wallhugger walked in and stood 11 mm inside the geometry
         for three and a half seconds, because an iterative resolver pushed out
         of one wall into the other and back for as long as it was asked.
         Eleven samples over a 27 m run also left 2.7 m between looks, so the
         pinch could sit between two of them untouched. */
      let near = Infinity;
      for (let k = -SLOT_SAMPLES; k <= SLOT_SAMPLES; k++) {
        const t = (k / SLOT_SAMPLES) * along;
        const lx = ax ? t : 0, lz = ax ? 0 : t;
        const px = a.x + lx * cs - lz * sn, pz = a.z + lx * sn + lz * cs;
        const gap = distToProp(walls[j], px, pz) - across;
        if (gap > 0.02) near = Math.min(near, gap);
      }
      if (near < Infinity) worst = Math.min(worst, near);
    }
  }
  return worst;
}
export function connectivity(room, swept) {
  /* `swept` defaults ON because the generator is the caller that matters and a
     room it accepts must stay connected for the whole of a mover's travel.
     Tests pass `false` to ask the narrower question "is it connected RIGHT NOW",
     which is the only way to check the conservative version is not lying. */
  const sw = swept === undefined ? true : swept;
  const NX = Math.ceil(2 * WORLD.AX / NAV_CELL), NZ = Math.ceil(2 * WORLD.AZ / NAV_CELL);
  const open = new Uint8Array(NX * NZ);
  let total = 0;
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const x = -WORLD.AX + (i + 0.5) * NAV_CELL, z = -WORLD.AZ + (j + 0.5) * NAV_CELL;
    if (Math.abs(x) > WORLD.AX - 0.5 || Math.abs(z) > WORLD.AZ - 0.5) continue;
    /* SWEPT, so a room is only accepted if it is connected at every point in a
       mover's travel and not merely at the instant it was generated. */
    if (nearestProp(room, x, z, sw) > PLAYER.radius) { open[j * NX + i] = 1; total++; }
  }
  if (!total) return 0;
  const seen = new Uint8Array(NX * NZ);
  let best = 0;
  for (let s0 = 0; s0 < NX * NZ; s0++) {
    if (!open[s0] || seen[s0]) continue;
    const q = [s0]; seen[s0] = 1; let n = 0;
    while (q.length) {
      const c = q.pop(); n++;
      const ci = c % NX, cj = (c - ci) / NX;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
        const k = nj * NX + ni;
        if (open[k] && !seen[k]) { seen[k] = 1; q.push(k); }
      }
    }
    if (n > best) best = n;
  }
  return best / total;
}

export function makeRoom(seed) {
  seed = (seed >>> 0) % 2147483647;
  /* Re-roll until the arena is one space. Walls come off first because they are
     what seals a room; a last resort with none at all is still a playable arena,
     just a plain one, and that is better than an unreachable player. */
  for (let attempt = 0; attempt < 14; attempt++) {
    const cap = attempt < 10 ? ROOM.WALLS_MAX : attempt < 13 ? 1 : 0;
    const room = buildRoom(seed + attempt * 104729, cap);
    room.tries = attempt + 1;
    if (connectivity(room) > 0.97 && worstWallSlot(room.walls) > 0.85) return room;
    if (attempt === 13) return room;
  }
}

function buildRoom(seed, wallCap) {
  const r = mulberry32(1000 + seed * 7919);
  /* A ROOM IS SOMEWHERE. The venue picks the furniture, the signage, the floor
     pattern and the palette together — that is the whole difference between "a
     room" and "a bar". It changes nothing that was measured: the prop count, the
     clear centre, the spacing rule and the connectivity check are identical
     whatever the room is pretending to be. */
  const venue = VENUES[Math.floor(r() * VENUES.length)];
  const pattern = venue.patterns[Math.floor(r() * venue.patterns.length)];
  const toks = TOKENS.slice().sort(() => r() - 0.5);
  const { AX, AZ } = WORLD;

  /* painted floor shapes: abstract, dark, under everything */
  const decals = [];
  const nd = ROOM.DECALS[0] + Math.floor(r() * (ROOM.DECALS[1] - ROOM.DECALS[0] + 1));
  for (let k = 0; k < nd; k++) {
    decals.push({
      /* painted shapes come from the venue too — a diner gets arrows and
         stripes, an arcade gets targets and rings */
      kind: venue.decals[Math.floor(r() * venue.decals.length)],
      x: (r() * 2 - 1) * (AX - 2), z: (r() * 2 - 1) * (AZ - 1.5),
      r0: 1.2 + r() * 2.0, w: 0.5 + r() * 0.8,
      ang: r() * Math.PI, len: 5 + r() * 9,
      /* pushed darker (was 0.62): painted floor shapes were competing with the
         solid props for attention, and a floor that draws the eye is a floor
         you look at instead of the fight. */
      tokName: toks[k % 3], dark: 0.74 + r() * 0.14,
    });
  }

  /* INTERIOR WALLS. Runs of wall with a DOORWAY punched in them, cutting the
     arena into two or three connected spaces. Each run is emitted as ordinary
     props so it collides, blocks line of sight and sorts exactly like anything
     else — there is no second kind of geometry to keep in agreement.
     Doorways are generous on purpose: a gap you cannot fight through is not a
     door, it is two rooms. */
  const nWalls = Math.min(wallCap,
    ROOM.WALLS_MIN + Math.floor(r() * (ROOM.WALLS_MAX - ROOM.WALLS_MIN + 1)));
  const walls = [];
  /* WHERE THE GAPS ARE IS PART OF THE ROOM. We generated these walls, so we know
     every doorway in them; keeping the list means the enemy can be given a way
     round a wall without anyone having to write a pathfinder. */
  const doors = [];
  /* projecting signs, emitted alongside the walls that carry them */
  const signs = [];
  for (let k = 0; k < nWalls; k++) {
    const vertical = r() < 0.55;
    /* keep runs away from the very edge so they read as dividers, not as a
       second skin on the outer wall */
    const at = (r() * 2 - 1) * (vertical ? AX - 4.5 : AZ - 3.2);
    const span = vertical ? AZ : AX;
    const doorAt = (r() * 2 - 1) * (span - ROOM.DOOR_W);
    const th = 0.42 + r() * 0.16;
    const lean = (r() - 0.5) * 0.22;            /* a few degrees off square */
    const cs = Math.cos(lean), sn = Math.sin(lean);
    /* WHERE THE GAP ACTUALLY IS, not where it would be if the run were square.
       Each half is rotated about its OWN centre, so a 0.1 rad lean swings the
       end of a nine-metre piece more than a metre off the line the doorway was
       planned on. Reading the ends back out of the pieces we just built is the
       only way the door, the posts and the hole stay in the same place. */
    const ends = [];
    for (const side of [-1, 1]) {
      const from = side < 0 ? -span : doorAt + ROOM.DOOR_W / 2;
      const to = side < 0 ? doorAt - ROOM.DOOR_W / 2 : span;
      const len = (to - from) / 2;
      if (len < 0.8) continue;
      const mid = (from + to) / 2;
      const wx = vertical ? at : mid, wz = vertical ? mid : at;
      walls.push({
        x: wx, z: wz, x0: wx, z0: wz,
        hx: vertical ? th : len, hz: vertical ? len : th,
        h: 1.35, shape: 'box', rot: lean,
        /* WHICH RUN THIS PIECE BELONGS TO. The gap between two pieces of the
           SAME run is the doorway — the thing the run exists to have — while a
           gap between two different runs is a corridor, and a corridor narrower
           than a body is a trap. Without the tag the slot rule cannot tell them
           apart, and judging every pair rejected every room with a wall in it. */
        run: k,
        collider: { kind: 'obb' }, isWall: true,
        tokName: 'prop-a', dark: 0,
      });
      /* the door-side end of this piece, in world space */
      const lx = vertical ? 0 : (side < 0 ? len : -len);
      const lz = vertical ? (side < 0 ? len : -len) : 0;
      /* the piece's own centre travels with its end, because the gap always lies
         BEYOND the end, on the far side from the body of the wall */
      ends.push({ x: wx + lx * cs - lz * sn, z: wz + lx * sn + lz * cs, cx: wx, cz: wz });
    }

    /* the gap's own NORMAL travels with it: stepping "through" a doorway means
       stepping across the wall it is in, which is not the same direction as
       towards whoever you are chasing */
    const n = { nx: vertical ? 1 : 0, nz: vertical ? 0 : 1 };
    const centre = ends.length === 2
      ? { x: (ends[0].x + ends[1].x) / 2, z: (ends[0].z + ends[1].z) / 2 }
      /* ONE PIECE MEANS THE DOORWAY IS AT AN END, AND THE GAP IS PAST IT. This
         used to offset by sign(-end), which assumes the missing half lies toward
         the middle of the arena — it does not, it lies wherever the truncated
         half was, and on one seed that put the recorded doorway 1.3 m INSIDE the
         surviving slab. The Mirror duly ruled out the only way through and spent
         three minutes pacing a wall 1.6 m from a player it never once shot at.
         The direction from the piece's centre to its end IS the way out. */
      : ends.length === 1
        ? (() => {
            const ex = ends[0].x - ends[0].cx, ez = ends[0].z - ends[0].cz;
            const el = Math.hypot(ex, ez) || 1;
            return { x: ends[0].x + (ex / el) * ROOM.DOOR_W / 2,
                     z: ends[0].z + (ez / el) * ROOM.DOOR_W / 2 };
          })()
        : { x: vertical ? at : doorAt, z: vertical ? doorAt : at };
    doors.push({ x: centre.x, z: centre.z, nx: n.nx, nz: n.nz });

    /* SIGNAGE. A wall run with a sign projecting off it says WHERE YOU ARE from
       across the room, which is the job the reference gives its interiors and
       ours had no way of doing. The board sticks out PERPENDICULAR to the wall,
       because a sign flat against a wall is invisible from directly above —
       which is the only angle this game is ever seen from. */
    if (ends.length && r() < 0.75) {
      const e = ends[Math.floor(r() * ends.length)];
      const back = Math.sign(-(vertical ? e.x : e.z)) || 1;
      const off = 1.5 + r() * 2.0;
      const sx2 = vertical ? at : e.x + back * 0;
      const sz2 = vertical ? e.z + 0 : at;
      const bx = vertical ? at + back * 0.55 : (e.x < 0 ? e.x + off : e.x - off);
      const bz = vertical ? (e.z < 0 ? e.z + off : e.z - off) : at + back * 0.55;
      if (Math.abs(bx) < AX - 0.9 && Math.abs(bz) < AZ - 0.9) {
        signs.push({
          x: bx, z: bz, vertical, lean,
          text: venue.signs[Math.floor(r() * venue.signs.length)],
          hx: vertical ? 0.10 : 0.62, hz: vertical ? 0.62 : 0.10,
          y0: 1.42, y1: 2.05,
        });
      }
    }

    /* JAMBS. A gap in a slab reads as a slab with a piece missing; a gap with a
       post at each end reads as a DOOR, and from a top-down camera the player
       has to be able to see where the ways through are without walking the wall.
       Octagonal and taller than the run, so a doorway is a silhouette rather
       than an absence. They cap the ends rather than pinching the gap: sitting
       ON the end keeps the 2.6 m opening, and the connectivity check throws the
       room away if any of this ever closes it. */
    for (const e of ends) {
      if (Math.abs(e.x) > AX - 0.6 || Math.abs(e.z) > AZ - 0.6) continue;
      walls.push({ x: e.x, z: e.z, x0: e.x, z0: e.z, hx: 0.42, hz: 0.42,
                   h: 1.8, shape: 'oct', rot: lean,
                   collider: { kind: 'circle', r: 0.42 }, isWall: true,
                   tokName: 'prop-a', dark: 0, isJamb: true });
    }
  }

  /* THE LAYOUT IS GENERATED, NOT THE FURNITURE SCATTERED.
   *
   * Dropping sixteen real objects at sixteen random angles produced a bar with
   * one counter adrift in the middle of the floor and four tables nowhere near
   * each other — which looks worse than the abstract slabs it replaced, because
   * now you can SEE that it is wrong. Rooms read as places when things are
   * arranged the way people arrange them, so objects are placed in GROUPS with
   * a habit:
   *
   *   against  a long thing pushed up against a wall, square to it, facing in
   *   row      two to four of the same object in a line, all the same way round
   *   cluster  two or three piled near each other at loose angles
   *   single   one thing on its own, at a readable angle
   *
   * Every measured rule still applies afterwards, unchanged: the centre stays
   * clear, nothing overlaps anything, and the whole arena is flood-filled and
   * thrown away if a group has walled part of it off. The layout only decides
   * WHERE to try — it never decides what is allowed.
   */
  const props = [];
  const pool = byTag(venue.tag);
  const HABIT = {
    counter: 'against', shelf: 'against', booth: 'row', arcade: 'row',
    desk: 'row', speakers: 'row', crate: 'cluster', barrel: 'cluster',
    pallet: 'cluster', table: 'row', roundtable: 'cluster',
    /* the new ones: big pieces stand alone or against a wall, clutter piles up */
    pooltable: 'single', stage: 'single', dumpster: 'against',
    longtable: 'single', partition: 'against',
    /* the huge pieces go against a wall, because a six-metre container parked
       across the middle of a room is not a room */
    barrun: 'against', container: 'against', boothrow: 'against',
    cabbank: 'against', deskbank: 'single',
    /* the new places: what defines a room stands against its wall, and what
       fills it stands in rows */
    vault: 'against', atm: 'against', ropes: 'row',
    sofa: 'against', bed: 'against', telly: 'against', kitchen: 'against',
    lockers: 'against', schooldesk: 'row', blackboard: 'against',
    frontdesk: 'against', cell: 'against', filing: 'against',
    stool: 'cluster', chair: 'cluster', bin: 'single',
    bottles: 'cluster', cone: 'cluster',
  };
  /* A ROOM WANTS A COUPLE OF BIG THINGS, SOME MIDDLING ONES AND A LOT OF
     CLUTTER — drawing uniformly from the catalogue gave every room the same
     flat texture. Large is capped at two because a third leaves nowhere to
     walk, and the bag falls back to any size the venue actually has. */
  /* ONE HUGE PIECE, one or two large, and the rest split between middling and
     clutter. The huge one is tried FIRST, while the floor is still empty — a
     six-metre object placed after fifteen others never fits anywhere. */
  const wantHuge = r() < 0.8 ? 1 : 0;
  const wantLarge = 1 + Math.floor(r() * 2);
  let placedHuge = 0, placedLarge = 0;
  const pickObject = () => {
    const want = placedHuge < wantHuge ? 'huge'
               : placedLarge < wantLarge && r() < 0.34 ? 'large'
               : r() < 0.48 ? 'small' : 'medium';
    let bag = byTagSize(venue.tag, want);
    if (!bag.length && want === 'huge') { placedHuge = wantHuge; bag = []; }
    if (!bag.length) bag = byTagSize(venue.tag, 'medium');
    if (!bag.length) bag = pool;
    return bag[Math.floor(r() * bag.length)];
  };
  const want = ROOM.PROPS_MIN + Math.floor(r() * (ROOM.PROPS_MAX - ROOM.PROPS_MIN + 1));

  /* can this object stand here, given everything placed so far? */
  const fits = (obj, x, z, rot) => {
    const reach = Math.hypot(obj.hx, obj.hz);
    /* THE WALL TEST USES THE ROTATED EXTENT, NOT THE DIAGONAL. Using the
       diagonal meant a 3.7 m counter needed 1.9 m of clearance on its SHORT
       side too, so the two objects whose whole purpose is to stand against a
       wall — the counter and the shelving — were rejected every single time and
       never once appeared in a room. Measured: 0 of 240. */
    const ca = Math.abs(Math.cos(rot || 0)), sa = Math.abs(Math.sin(rot || 0));
    const ex = obj.hx * ca + obj.hz * sa;
    const ez = obj.hx * sa + obj.hz * ca;
    /* NO SLOT THAT IS TOO NARROW TO STAND IN AND WIDE ENOUGH TO BE PUSHED INTO.
       A body is 0.72 m across. A gap of zero is a wall and a gap of a metre is a
       corridor; anything between the two is a trap that an actor can be shoved
       into and not resolved out of — measured at 38 mm of overlap, the worst this
       collision system has ever reported. So an object may stand flush against
       the arena edge or a clear body-width off it, and nothing in between. */
    const gapX = AX - (Math.abs(x) + ex), gapZ = AZ - (Math.abs(z) + ez);
    if (gapX < -0.01 || gapZ < -0.01) return false;
    if ((gapX > 0.03 && gapX < 0.80) || (gapZ > 0.03 && gapZ < 0.80)) return false;
    if (Math.abs(x) < ROOM.CENTRE_CLEAR_X + reach &&
        Math.abs(z) < ROOM.CENTRE_CLEAR_Z + reach) return false;
    for (const q of props.concat(walls))
      if (distToProp(q, x, z) < reach + 0.85) return false;
    return true;
  };
  const put = (obj, x, z, rot) => {
    const sz = sizeOf(obj);
    if (sz === 'huge') placedHuge++;
    if (sz === 'large') placedLarge++;
    props.push({ x, z, hx: obj.hx, hz: obj.hz, h: obj.h, x0: x, z0: z,
                 shape: obj.parts[0].shape, rot, collider: obj.collider,
                 obj: obj.key, tokName: toks[props.length % 3],
                 dark: r() < 0.4 ? 0.18 : 0 });
  };

  let guard = 0;
  while (props.length < want && guard++ < 320) {
    /* stop asking for the huge one after a while: some rooms have no wall long
       enough once the interior runs are in, and a room without it is fine */
    if (guard > 60 && placedHuge < wantHuge) placedHuge = wantHuge;
    const obj = pickObject();
    const habit = HABIT[obj.key] || 'single';

    if (habit === 'against') {
      /* pushed up against one of the four walls, square to it and facing in */
      const side = Math.floor(r() * 4);
      const vert = side < 2, sgn = side % 2 ? 1 : -1;
      /* AGAINST A LEFT OR RIGHT WALL, THE LONG AXIS RUNS ALONG Z. The rotation
         was the other way round, so a counter pushed against a side wall was
         laid ACROSS it, stuck out 1.85 m into the room, failed the bounds test
         and was thrown away — every time, for the only two objects in the
         catalogue whose whole job is to stand against a wall. */
      const rot = vert ? (sgn > 0 ? -Math.PI / 2 : Math.PI / 2) : (sgn > 0 ? Math.PI : 0);
      /* FLUSH, NOT NEARLY FLUSH. A 0.55 m gap behind a counter is the worst
         possible number: a 0.72 m body cannot stand in it but can be pushed into
         it, and an actor wedged between the arena's edge clamp and a long solid
         ended up 38 mm inside the wall — the deepest overlap this collision
         system has ever reported. Against the wall means against the wall. */
      const back = (vert ? AX : AZ) - obj.hz;
      const along = (r() * 2 - 1) * ((vert ? AZ : AX) - obj.hx - 1.4);
      const x = vert ? sgn * back : along;
      const z = vert ? along : sgn * back;
      if (fits(obj, x, z, rot)) put(obj, x, z, rot);
      continue;
    }

    if (habit === 'row') {
      /* a line of two to four, all the same way round, along a random axis */
      const n = 2 + Math.floor(r() * 3);
      const ang = Math.floor(r() * 4) * Math.PI / 4;
      const step = Math.max(obj.hx, obj.hz) * 2 + 0.9 + r() * 0.5;
      const cx = (r() * 2 - 1) * (AX - 3.2), cz = (r() * 2 - 1) * (AZ - 2.6);
      const ux = Math.cos(ang + Math.PI / 2), uz = Math.sin(ang + Math.PI / 2);
      let placed = 0;
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * step;
        const x = cx + ux * o, z = cz + uz * o;
        if (fits(obj, x, z, ang)) { put(obj, x, z, ang); placed++; }
      }
      if (!placed) continue;
      continue;
    }

    if (habit === 'cluster') {
      /* a small pile, loose angles, the way things get stacked in a corner */
      const n = 2 + Math.floor(r() * 2);
      const cx = (r() * 2 - 1) * (AX - 2.6), cz = (r() * 2 - 1) * (AZ - 2.2);
      for (let k = 0; k < n; k++) {
        const a = r() * 6.283, d = 0.4 + r() * (obj.hx + obj.hz + 0.7);
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        const rot = r() * 6.283;
        if (fits(obj, x, z, rot)) put(obj, x, z, rot);
      }
      continue;
    }

    /* single: one thing, at an angle that reads. Multiples of ~15 degrees plus
       jitter — fully random looks like a physics glitch and axis-aligned looks
       like a placeholder. */
    const rot = (Math.floor(r() * 8) * Math.PI / 12) + (r() - 0.5) * 0.18;
    const x = (r() * 2 - 1) * (AX - 2.0), z = (r() * 2 - 1) * (AZ - 1.7);
    if (fits(obj, x, z, rot)) put(obj, x, z, rot);
  }

  /* MOVING GEOMETRY, PLURAL. One mover per room read as a novelty; the user
     asked for a room that is alive, including something LARGE on the move.
     The rules that keep this safe are unchanged and size-agnostic, which is
     why a big mover is allowed now where the 3.7 m counter of legend was not:
     - the travel is SHRUNK until the solid keeps a clear body-width from
       everything else at every point of its sweep (the 27 mm shove of the old
       counter predates this check, not the object's size);
     - clearance against OTHER movers uses their swept envelope, so two movers
       can never meet mid-travel;
     - the room's connectivity is validated over every mover's whole sweep.
     A large mover travels at half tempo - mass reads as patience. */
  /* the pool is anything plausibly wheelable: the named rollers first, then any
     small solid (a chair, a bin, a stool is shoved around a busy room all the
     time), then the large candidates - every big one is tried, because most
     fail the sweep-clearance test in a crowded room and one attempt was why a
     census of 150 rooms found large movers in six of them */
  const ROLLS = ['pallet', 'crate', 'barrel', 'bollard'];
  const reachOf = (q) => Math.hypot(q.hx || 0, q.hz || 0);
  const candidates = [];
  for (const q of props) if (reachOf(q) >= 1.1 && reachOf(q) <= 2.3) candidates.push({ q, big: true });
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1)); const t = candidates[i]; candidates[i] = candidates[j]; candidates[j] = t;
  }
  for (const q of props) if (ROLLS.includes(q.obj)) candidates.push({ q, big: false });
  for (const q of props) if (!ROLLS.includes(q.obj) && reachOf(q) <= 0.9) candidates.push({ q, big: false });
  let placed = 0, placedBig = 0;
  for (const { q: slab, big } of candidates) {
    if (placed >= 5 || slab.mover) continue;
    if (big && placedBig >= 1) continue;
    if (r() > (big ? 0.95 : 0.55)) continue;
    let dxm = Math.cos(slab.rot), dzm = Math.sin(slab.rot);
    const reach = Math.hypot(slab.hx, slab.hz);
    const others = props.concat(walls).filter((q2) => q2 !== slab);
    const clearAt = (a2) => {
      for (const t of [-1, -0.55, 0.55, 1]) {
        const px = slab.x0 + dxm * a2 * t, pz = slab.z0 + dzm * a2 * t;
        if (Math.abs(px) > AX - reach - 0.05 || Math.abs(pz) > AZ - reach - 0.05) return false;
        /* 0.75 m of clearance: a 0.72 m body always escapes, and the old 0.9
           pad was what starved large movers out of existence */
        for (const q2 of others) if (distToProp(q2, px, pz, true) < reach + 0.75) return false;
      }
      return true;
    };
    const minAmp = big ? 0.8 : 0.6;
    const shrunk = () => {
      let a2 = ROOM.MOVER_AMP[0] + r() * (ROOM.MOVER_AMP[1] - ROOM.MOVER_AMP[0]);
      while (a2 > minAmp && !clearAt(a2)) a2 *= 0.78;
      return a2;
    };
    let amp = shrunk();
    /* A BIG THING THAT CANNOT SWEEP WHERE IT STANDS IS MOVED TO WHERE IT CAN.
       Only 17% of rooms had a clear lane beside wherever the large object
       happened to land - the object was fine, the address was not. Forty
       tries at fresh axis-aligned addresses (axis lanes clear far more often
       in axis-heavy rooms), each validated by the same sweep-clearance rule,
       and the room's connectivity gate re-checks everything afterwards. */
    if (big && amp <= minAmp) {
      for (let att = 0; att < 40 && amp <= minAmp; att++) {
        const nx = (r() * 2 - 1) * (AX - reach - 1.8);
        const nz = (r() * 2 - 1) * (AZ - reach - 1.6);
        let ok = true;
        for (const q2 of others) if (distToProp(q2, nx, nz, true) < reach + 0.75) { ok = false; break; }
        if (!ok) continue;
        slab.x0 = nx; slab.z0 = nz; slab.x = nx; slab.z = nz;
        slab.rot = r() < 0.5 ? 0 : Math.PI / 2;
        dxm = Math.cos(slab.rot); dzm = Math.sin(slab.rot);
        amp = shrunk();
      }
    }
    if (amp > minAmp) {
      slab.mover = { amp, sp: ROOM.MOVER_SPEED * (big ? 0.45 : 1),
                     ph: r() * 6.28, dx: dxm, dz: dzm };
      placed++; if (big) placedBig++;
      decals.unshift({
        kind: 'track', x: slab.x0, z: slab.z0,
        len: amp * 2 + slab.hx * 2, w: slab.hz + 0.3,
        ang: slab.rot, r0: 0, tokName: slab.tokName, dark: 0.58,
      });
    }
  }

  const blood = [];
  for (let k = 0; k < 4 + Math.floor(r() * 3); k++) {
    const cx = (r() * 2 - 1) * (AX - 1.5), cz = (r() * 2 - 1) * (AZ - 1.2), blobs = [];
    for (let b = 0; b < 3 + Math.floor(r() * 3); b++)
      blobs.push({ dx: (r() * 2 - 1) * 0.55, dz: (r() * 2 - 1) * 0.55, rr: 0.13 + r() * 0.26 });
    blood.push({ cx, cz, blobs });
  }

  /* per-tile shade, decided once */
  const tiles = [];
  const ti = Math.ceil(AX / ROOM.TILE), tj = Math.ceil(AZ / ROOM.TILE);
  for (let i = -ti; i <= ti; i++) for (let j = -tj; j <= tj; j++)
    tiles.push({ i, j, v: r() });

  /* Walls go in FIRST so they win the draw order tie-breaks and so every
     consumer — collision, line of sight, spawning — sees one list. */
  const all = walls.concat(props);
  /* A DOORWAY THE ROUTER TRUSTS MUST BE A DOORWAY YOU CAN STAND IN. The list is
     the whole of the Mirror's pathfinding — there is no search, only "head for
     the gap" — so one entry that is really solid takes the only way through a
     wall off the table for the entire round. It has happened twice for two
     different reasons, and furniture is placed after the walls are, so a chair
     can close a door the wall generator left open. Checked once, here, against
     the finished room, rather than trusted from where it was minted. */
  const room = { seed, pattern, decals, props: all, blood, tiles, walls,
                 venue: venue.key, signs };
  room.doors = doors.filter((d) => nearestProp(room, d.x, d.z) > PLAYER.radius);
  return room;
}

/* Blood accumulates where people are actually hit. Capped, because an unbounded
   decal list is a memory leak that looks like atmosphere. */
export function splat(room, x, z, seedN, big) {
  const r = mulberry32(9001 + seedN * 131);
  const blobs = [];
  for (let b = 0; b < (big ? 5 : 3) + Math.floor(r() * 3); b++)
    blobs.push({ dx: (r() * 2 - 1) * (big ? 0.8 : 0.5),
                 dz: (r() * 2 - 1) * (big ? 0.8 : 0.5),
                 rr: (big ? 0.2 : 0.12) + r() * (big ? 0.4 : 0.24) });
  room.blood.push({ cx: x, cz: z, blobs, fresh: true });
  /* THE CAP IS ON BLOBS, NOT ON SPLATS, and that distinction turned out to be
     the whole bug. A splat is three to eight blobs, so a cap of 48 splats is a
     cap of up to four hundred painted circles — measured at 539 per frame in a
     long watch-mode run — and at 0.72 alpha they stack into a flat magenta wash
     that swallows the entire floor. Blood is meant to read as history, not as a
     colour scheme. */
  let blobs_ = 0;
  for (const sp of room.blood) blobs_ += sp.blobs.length;
  while (room.blood.length > 2 && blobs_ > 96) {
    blobs_ -= room.blood[0].blobs.length;
    room.blood.shift();
  }
}

/* Movers are driven from the sim clock, not from wall time, so the room a
   headless test sees is the room a player sees at the same tick. */
export function advanceRoom(room, tSec) {
  for (const p of room.props) {
    if (!p.mover) continue;
    const o = Math.sin(tSec * p.mover.sp * Math.PI * 2 + p.mover.ph) * p.mover.amp;
    p.x = p.x0 + p.mover.dx * o;
    p.z = p.z0 + p.mover.dz * o;
  }
}

/* Six floor families. One pattern for every room made every arena feel like the
   same arena with the furniture moved; the pattern is the cheapest thing that
   makes a generated room feel authored. */
export function tileShade(room, i, j, v) {
  const m = (a, n) => ((a % n) + n) % n;
  switch (room.pattern) {
    case 'checker': return clamp(0.10 + v * 0.30 + (((i + j) & 1) ? 0.30 : 0), 0, 1);
    case 'stripes': return clamp(0.14 + v * 0.18 + ((i & 1) ? 0.34 : 0), 0, 1);
    case 'bricks':  return clamp(0.12 + v * 0.20 + (m(i * 2 + (m(j, 2) ? 1 : 0), 4) < 2 ? 0.30 : 0), 0, 1);
    case 'diag':    return clamp(0.10 + v * 0.20 + (m(i + j, 3) === 0 ? 0.34 : 0), 0, 1);
    case 'blocks':  return clamp(0.10 + v * 0.18 + ((m(i, 4) < 2) !== (m(j, 4) < 2) ? 0.32 : 0), 0, 1);
    case 'herring': return clamp(0.11 + v * 0.18 + (m(m(j, 4) < 2 ? i + j : i - j, 4) < 2 ? 0.31 : 0), 0, 1);
    case 'dots':    return clamp(0.09 + v * 0.16 + (m(i, 3) === 1 && m(j, 3) === 1 ? 0.38 : 0), 0, 1);
    case 'tri':     return clamp(0.10 + v * 0.20 + (m(i + (m(j, 2) ? 0 : 1), 2) ? 0.33 : 0.06), 0, 1);
    default:        return clamp(0.10 + v * 0.22 + (m(i * 3 + j * 5, 4) < 2 ? 0.30 : 0), 0, 1);
  }
}
export const propColour = (p) => mixHex(tok(p.tokName), tok('floor'), p.dark);
export const decalColour = (d) => mixHex(tok(d.tokName), tok('floor'), d.dark);

/* ONE collision function, used by the player, the enemies AND the control the
 * model is scored against. If they ever disagree the model gets an advantage
 * that has nothing to do with reading anyone.
 */
export function resolveCollide(room, px, pz, radius) {
  /* FIVE PASSES, not one. A single pass pushes out of the first solid it finds
     and can drop you straight into the next one — which is what happens when a
     sliding wall squeezes an actor against a static prop. Iterating settles it.
     Three passes was enough until doorways gained posts: a body wedged between a
     jamb's circle and a wall run's rectangle still had 6.7 mm of overlap left
     when the passes ran out. Five halves that to 3.6 mm and does NOT reach zero —
     this is an iterative resolver, not a solver, and a corner that is over-
     constrained always keeps a residue. 3.6 mm on a 360 mm body is a hundredth
     of a radius; the loop exits early the moment a pass moves nothing, so the
     extra two passes cost nothing in the common case.
     Colliders are per-shape: a rotated rectangle for the rectangular shapes and
     a circle for the columns, so what you bump into is what you can see. */
  const limX = WORLD.AX - radius, limZ = WORLD.AZ - radius;
  for (let pass = 0; pass < 5; pass++) {
    let moved = false;
    px = clamp(px, -limX, limX); pz = clamp(pz, -limZ, limZ);
    for (const c of room.props) {
      if (c.collider && c.collider.kind === 'circle') {
        const dx = px - c.x, dz = pz - c.z;
        const d = Math.hypot(dx, dz), need = c.collider.r + radius;
        if (d < need) {
          const k = d > 1e-6 ? need / d : 1;
          px = c.x + (d > 1e-6 ? dx : 1) * k;
          pz = c.z + (d > 1e-6 ? dz : 0) * k;
          moved = true;
        }
        continue;
      }
      /* rotated rectangle: work in the box's own frame, then rotate back */
      const cs = Math.cos(-c.rot), sn = Math.sin(-c.rot);
      const rx = (px - c.x) * cs - (pz - c.z) * sn;
      const rz = (px - c.x) * sn + (pz - c.z) * cs;
      const ex = c.hx + radius, ez = c.hz + radius;
      if (Math.abs(rx) < ex && Math.abs(rz) < ez) {
        let nx = rx, nz = rz;
        if (ex - Math.abs(rx) < ez - Math.abs(rz)) nx = Math.sign(rx || 1) * ex;
        else nz = Math.sign(rz || 1) * ez;
        const bc = Math.cos(c.rot), bs = Math.sin(c.rot);
        px = c.x + nx * bc - nz * bs;
        pz = c.z + nx * bs + nz * bc;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [px, pz];
}

/* Move an actor in SUBSTEPS so it cannot cross a thin prop between frames, and
   resolve at every one. Returns the corrected position. */
export function moveResolved(room, x, z, dx, dz, radius, maxStep) {
  const dist = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(dist / (maxStep || 0.2)));
  for (let i = 0; i < n; i++) {
    const r = resolveCollide(room, x + dx / n, z + dz / n, radius);
    x = r[0]; z = r[1];
  }
  return [x, z];
}

/* DISTANCE TO THE SHAPE, not to its centre. Centre-to-centre is fine while every
   solid is roughly round and roughly the same size; the moment interior walls
   exist it is catastrophic — a wall piece 16 m long has a centre 8 m from its
   own end, so a centre-distance test sterilises a 10 m radius around it and the
   generator could place almost nothing. MEASURED: 2.1 solids per room against a
   target of 8-12. */
/* Distance from a point to a prop's surface, zero inside it.
 *
 * `swept` grows the prop along its own travel to cover EVERYWHERE IT GOES, and
 * exists for one caller: the connectivity check. A room was flood-filled with
 * its movers parked, passed, and then sealed itself the moment the moving slab
 * slid across a doorway — measured on 2 of 120 seeds, and worse than it sounds,
 * because the enemy simply stops being able to reach you halfway through a
 * round. Collision must NEVER pass `swept`: bumping into where a thing is going
 * to be is the bug this one is the opposite of. */
export function distToProp(c, px, pz, swept) {
  const grow = (swept && c.mover) ? c.mover.amp : 0;
  /* ANCHOR THE SWEEP AT HOME, NOT AT THE LIVE POSITION. A swept envelope covers
     everywhere a mover GOES, so it cannot depend on where the mover happens to
     BE. Growing around the live x put the envelope at [x0, x0+2a] when the slab
     sat at full extension: it claimed a strip the mover never enters and freed a
     strip it does. The generator only ever asked at t=0, where live IS home, so
     the check agreed with itself forever and only the running game disagreed.
     Measured: swept connectivity drifted on 15 of 60 rooms, worst 7.6 points. */
  const ox = grow ? c.x0 : c.x, oz = grow ? c.z0 : c.z;
  const cs = Math.cos(-c.rot || 0), sn = Math.sin(-c.rot || 0);
  const rx = (px - ox) * cs - (pz - oz) * sn;
  const rz = (px - ox) * sn + (pz - oz) * cs;
  /* movers travel along their own local +x, so the sweep grows that axis only */
  const ax = Math.max(0, Math.abs(rx) - grow);
  if (c.collider && c.collider.kind === 'circle')
    return Math.max(0, Math.hypot(ax, rz) - c.collider.r);
  return Math.hypot(Math.max(0, ax - c.hx), Math.max(0, Math.abs(rz) - c.hz));
}

export function nearestProp(room, px, pz, swept) {
  let d = 99;
  for (const c of room.props) d = Math.min(d, distToProp(c, px, pz, swept));
  return d;
}

/* Line of sight, ray vs axis-aligned box in the ground plane. */
export function blocked(room, x0, z0, x1, z1) {
  const dxw = x1 - x0, dzw = z1 - z0;
  if (Math.hypot(dxw, dzw) < 1e-6) return false;
  for (const c of room.props) {
    if (c.collider && c.collider.kind === 'circle') {
      /* segment vs circle */
      const fx = x0 - c.x, fz = z0 - c.z;
      const a = dxw * dxw + dzw * dzw;
      const b = 2 * (fx * dxw + fz * dzw);
      const cc = fx * fx + fz * fz - c.collider.r * c.collider.r;
      const disc = b * b - 4 * a * cc;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
        if ((t1 > 0 && t1 < 1) || (t2 > 0 && t2 < 1) || (t1 < 0 && t2 > 1)) return true;
      }
      continue;
    }
    /* rotate the whole segment into the box's frame and do a slab test */
    const cs = Math.cos(-c.rot), sn = Math.sin(-c.rot);
    const ox = (x0 - c.x) * cs - (z0 - c.z) * sn;
    const oz = (x0 - c.x) * sn + (z0 - c.z) * cs;
    const dx = dxw * cs - dzw * sn;
    const dz = dxw * sn + dzw * cs;
    let tmin = 0, tmax = 1, ok = true;
    for (let ax = 0; ax < 2; ax++) {
      const o = ax ? oz : ox, d = ax ? dz : dx;
      const lo = ax ? -c.hz : -c.hx, hi = ax ? c.hz : c.hx;
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const sw = t1; t1 = t2; t2 = sw; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/* SPAWN CHOICE IS A SCORED SEARCH, not a lucky sample.
 *
 * The old version took the best of sixty random points by one measure — distance
 * to the nearest prop — which reliably produced somewhere legal and regularly
 * produced somewhere miserable: hard against a wall, or standing in the open at
 * the far end of a clear sightline with an enemy already aiming down it.
 *
 * Four terms, and they disagree on purpose:
 *   clearance   room to move without being wedged
 *   spacing     far from whoever is already on the map
 *   breathing   not jammed against the arena wall
 *   cover       something between you and the nearest other actor
 * The last one is what stops a spawn from being an execution.
 */
export function findSpawn(room, seed, preferX, avoid) {
  const r = mulberry32(seed | 0);
  const others = (avoid || []).filter(Boolean);
  let best = null, bestScore = -Infinity;
  const NX = 13, NZ = 9;
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      /* jittered grid: full coverage, but not a visible lattice of spawn points */
      const x = ((i + 0.5) / NX * 2 - 1) * (WORLD.AX - 1.6) + (r() - 0.5) * 1.1;
      const z = ((j + 0.5) / NZ * 2 - 1) * (WORLD.AZ - 1.4) + (r() - 0.5) * 1.1;
      const clear = nearestProp(room, x, z);
      if (clear < 1.5) continue;                       /* too tight to stand in */
      const wall = Math.min(WORLD.AX - Math.abs(x), WORLD.AZ - Math.abs(z));
      if (wall < 1.8) continue;                        /* not jammed in a corner */

      let score = Math.min(clear, 4.5) * 1.6 + Math.min(wall, 4) * 1.2;
      if (preferX) score += (x * preferX > 0 ? 2.4 : 0);
      for (const o of others) {
        const d = Math.hypot(x - o.x, z - o.z);
        if (d < 7) score -= (7 - d) * 2.2;             /* never spawn on top of anyone */
        score += Math.min(d, 16) * 0.35;
        /* something in the way is worth a lot: it turns a spawn you cannot
           survive into one you merely have to move out of */
        /* Worth something, but no longer worth a lot: at 5.5 this dominated the
           score, and on a map with interior walls it reliably put the two of you
           in different rooms with nothing to fight about. The three seconds of
           spawn grace is what actually makes an exposed spawn survivable. */
        if (blocked(room, x, z, o.x, o.z)) score += 2.0;
      }
      if (score > bestScore) { bestScore = score; best = [x, z]; }
    }
  }
  /* A search that finds nothing must still return somewhere legal rather than
     null — a null spawn is a crash three frames later, far from the cause. */
  if (!best) {
    const fb = resolveCollide(room, preferX * (WORLD.AX - 3), 0, 0.4);
    return [fb[0], fb[1]];
  }
  return best;
}

/* ASSERTION, not decoration: nothing the generator can emit may be as bright as
 * an actor. Called once at boot; a violation is a design bug, not a crash, so it
 * warns loudly rather than throwing.
 */
export function checkValueRule(room) {
  /* INSIDE THE VENUE'S OWN GROUND, or this checks colours nobody sees. Every
     resolution below mixes toward tok('floor'), and once each venue brought its
     own floor, running this outside the venue tested the room against a palette
     that is now only a default — the exact failure the note above describes, one
     level further out. Set directly rather than through render.js's forVenue:
     render.js imports this module, so importing it back would be a cycle. */
  const prev = getGround();
  const v0 = venueByKey(room.venue);
  setGround(v0 && v0.ground ? v0.ground : null);
  try { return _checkValueRule(room); } finally { setGround(prev); }
}
function _checkValueRule(room) {
  /* A VERDICT NOBODY CAN REACH IS NOT A PASS. Without a document every token
     resolves to empty, luminance comes back zero, and the rule "nothing may be
     as bright as an actor" would flag the entire room. Null means "not
     checked here", and every caller has to treat it as that. */
  if (!stylesAvailable() && !getGround()) return null;
  const body = luminance(tok('body'));
  const offenders = [];
  /* Props are painted from the VENUE'S roles now, not from propColour, so the
     rule has to test the colours that reach the screen. Testing the old ones
     would have gone on passing while the room got brighter. */
  const roles = venueByKey(room.venue).roles;
  for (const k of Object.keys(roles)) {
    const c = tok(roles[k]);
    if (luminance(c) >= body) offenders.push(c);
  }
  for (const p of room.props) if (luminance(propColour(p)) >= body) offenders.push(propColour(p));
  for (const d of room.decals) if (luminance(decalColour(d)) >= body) offenders.push(decalColour(d));
  if (offenders.length)
    console.warn('Arena value rule broken — environment as bright as an actor:', offenders);
  return offenders.length === 0;
}
