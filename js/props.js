/* WHAT IS IN THE ROOM, AND WHY IT IS THERE.
 *
 * The arena used to be furnished with slabs: a box, a wedge, an L. They obeyed
 * every measured rule about cover and sightlines and they meant nothing, so the
 * room read as a diagram of a room. The reference does the opposite — its floors
 * are covered in couches and televisions and pool tables, and you always know
 * what kind of building you are in.
 *
 * So a prop is a REAL THING now: a barrel, a table, a counter, an arcade
 * cabinet. Each is a small pile of extruded parts over ONE collider, because the
 * collision system has exactly two shapes and a prop that is drawn as five
 * pieces but collided as one honest box is far better than five colliders that
 * disagree with each other. The collider is always a SUPERSET of the drawing —
 * you may bump into a table's overhang, you may never walk through its top.
 *
 * Parts are in prop-local space: hx/hz half-sizes, fx/fz offsets from the prop's
 * centre, y0..y1 metres off the floor, and a colour ROLE resolved per venue so
 * the same crate can be a red crate in one room and a green one in the next.
 *
 * `tags` is what ties an object to a venue. A jukebox belongs in a bar and a
 * pallet does not, and a room that mixes them at random is back to being a
 * diagram.
 */

const D = (shape, hx, hz, fx, fz, y0, y1, col, rot) =>
  ({ shape, hx, hz, fx, fz, y0, y1, col, rot: rot || 0 });

/* Colour roles. `body` is the object's own colour, `top` its lit upper surface,
   `dark` its shadowed parts, `metal` and `glow` are fixed across every venue so
   that a chrome rail and a lit screen always read as the same material. */
export const PROP_ROLES = ['body', 'top', 'dark', 'metal', 'glow'];

export const OBJECTS = [
  {
    key: 'crate', name: 'Crate', tags: ['store', 'bar', 'arcade'],
    hx: 0.52, hz: 0.52, h: 0.86, collider: { kind: 'obb' },
    note: 'A box with braces across the lid. The most ordinary thing in the set, on purpose.',
    parts: [
      D('box', 0.52, 0.52, 0, 0, 0, 0.80, 'body'),
      D('box', 0.54, 0.54, 0, 0, 0.80, 0.86, 'top'),
      D('box', 0.50, 0.055, 0, 0, 0.86, 0.89, 'dark', 0.6),
      D('box', 0.50, 0.055, 0, 0, 0.86, 0.89, 'dark', -0.6),
      D('box', 0.16, 0.16, 0, 0, 0.89, 0.905, 'glow'),
    ],
  },
  {
    key: 'barrel', name: 'Barrel', tags: ['store', 'bar', 'diner'],
    hx: 0.40, hz: 0.40, h: 1.02, collider: { kind: 'circle', r: 0.40 },
    note: 'Round, banded, taller than it is wide. The only common object with no corners.',
    parts: [
      D('oct', 0.40, 0.40, 0, 0, 0, 0.96, 'body'),
      D('oct', 0.425, 0.425, 0, 0, 0.22, 0.31, 'dark'),
      D('oct', 0.425, 0.425, 0, 0, 0.64, 0.73, 'dark'),
      D('oct', 0.36, 0.36, 0, 0, 0.96, 1.02, 'top'),
      D('oct', 0.25, 0.25, 0, 0, 1.02, 1.045, 'dark'),
      D('oct', 0.09, 0.09, 0, 0, 1.045, 1.06, 'glow'),
    ],
  },
  {
    key: 'table', name: 'Table', tags: ['bar', 'diner', 'office', 'home', 'police'],
    hx: 0.72, hz: 0.72, h: 0.80, collider: { kind: 'obb' },
    note: 'A top on four legs. From above it is a slab with a shadow under the edges.',
    parts: [
      D('box', 0.13, 0.13, -0.50, -0.50, 0, 0.68, 'dark'),
      D('box', 0.13, 0.13, 0.50, -0.50, 0, 0.68, 'dark'),
      D('box', 0.13, 0.13, -0.50, 0.50, 0, 0.68, 'dark'),
      D('box', 0.13, 0.13, 0.50, 0.50, 0, 0.68, 'dark'),
      D('box', 0.72, 0.72, 0, 0, 0.68, 0.80, 'top'),
      D('box', 0.50, 0.50, 0, 0, 0.80, 0.815, 'body'),
      D('oct', 0.13, 0.13, 0, 0, 0.815, 0.85, 'glow'),
    ],
  },
  {
    key: 'roundtable', name: 'Round table', tags: ['bar', 'diner', 'home'],
    hx: 0.62, hz: 0.62, h: 0.80, collider: { kind: 'circle', r: 0.60 },
    note: 'The same idea on one leg, and a circle to break up a floor of rectangles.',
    parts: [
      D('oct', 0.16, 0.16, 0, 0, 0, 0.66, 'dark'),
      D('oct', 0.40, 0.40, 0, 0, 0, 0.07, 'metal'),
      D('oct', 0.62, 0.62, 0, 0, 0.66, 0.80, 'top'),
      D('oct', 0.44, 0.44, 0, 0, 0.80, 0.815, 'body'),
    ],
  },
  {
    key: 'counter', name: 'Counter', tags: ['bar', 'diner', 'store', 'bank'],
    hx: 1.85, hz: 0.44, h: 1.06, collider: { kind: 'obb' },
    note: 'The long one. A bar or a serving hatch, and the piece that gives a room a front and a back.',
    parts: [
      D('box', 1.85, 0.38, 0, 0, 0, 0.94, 'body'),
      D('box', 1.94, 0.50, 0, 0.03, 0.94, 1.08, 'top'),
      D('box', 1.80, 0.08, 0, 0.34, 1.08, 1.10, 'dark'),
      D('box', 0.26, 0.20, 1.30, 0, 1.08, 1.30, 'glow'),
      D('box', 1.80, 0.05, 0, -0.36, 0.40, 0.52, 'metal'),
    ],
  },
  {
    key: 'booth', name: 'Booth', tags: ['diner', 'bar'],
    hx: 0.95, hz: 0.72, h: 1.20, collider: { kind: 'obb' },
    note: 'A bench with a high back. Sits against a wall and blocks sight without blocking a room.',
    parts: [
      D('box', 0.95, 0.30, 0, 0.34, 0, 0.46, 'body'),
      D('box', 0.95, 0.36, 0, 0.30, 0.46, 0.56, 'top'),
      D('box', 0.95, 0.16, 0, -0.52, 0, 1.20, 'body'),
      D('box', 0.97, 0.22, 0, -0.52, 1.20, 1.30, 'body'),
    ],
  },
  {
    key: 'jukebox', name: 'Jukebox', tags: ['bar', 'diner', 'arcade'],
    hx: 0.44, hz: 0.34, h: 1.42, collider: { kind: 'obb' },
    note: 'Tall, with an arched lit top. Reads at any distance because it glows.',
    parts: [
      D('box', 0.44, 0.34, 0, 0, 0, 1.10, 'body'),
      D('hex', 0.44, 0.30, 0, -0.02, 1.10, 1.38, 'body'),
      D('hex', 0.34, 0.22, 0, -0.10, 1.14, 1.42, 'glow'),
      D('box', 0.38, 0.06, 0, -0.30, 0.66, 0.86, 'glow'),
    ],
  },
  {
    key: 'arcade', name: 'Arcade cabinet', tags: ['arcade', 'bar'],
    hx: 0.38, hz: 0.42, h: 1.66, collider: { kind: 'obb' },
    note: 'A tall box with a lit screen tipped towards whoever is playing it.',
    parts: [
      D('box', 0.38, 0.42, 0, 0, 0, 1.20, 'body'),
      D('box', 0.38, 0.30, 0, -0.10, 1.20, 1.66, 'body'),
      D('box', 0.34, 0.10, 0, -0.18, 1.66, 1.69, 'glow'),
      D('box', 0.30, 0.20, 0, -0.16, 1.24, 1.44, 'glow'),
      D('box', 0.34, 0.16, 0, -0.34, 1.02, 1.12, 'glow'),
    ],
  },
  {
    key: 'speakers', name: 'Speaker stack', tags: ['bar', 'arcade'],
    hx: 0.36, hz: 0.32, h: 1.55, collider: { kind: 'obb' },
    note: 'Two boxes and two cones. Square outline, round holes.',
    parts: [
      D('box', 0.36, 0.32, 0, 0, 0, 0.76, 'dark'),
      D('box', 0.34, 0.30, 0, 0, 0.76, 1.48, 'body'),
      D('box', 0.34, 0.30, 0, 0, 1.48, 1.56, 'body'),
      D('oct', 0.14, 0.14, 0, -0.09, 1.56, 1.60, 'dark'),
      D('oct', 0.08, 0.08, 0, 0.13, 1.56, 1.60, 'dark'),
    ],
  },
  {
    key: 'fridge', name: 'Cooler', tags: ['diner', 'store', 'bar', 'home', 'school'],
    hx: 0.42, hz: 0.38, h: 1.70, collider: { kind: 'obb' },
    note: 'A tall pale slab with a handle down one side and a lit strip inside.',
    parts: [
      D('box', 0.42, 0.38, 0, 0, 0, 1.62, 'top'),
      D('box', 0.44, 0.40, 0, 0, 1.62, 1.72, 'body'),
      D('box', 0.34, 0.06, 0, -0.22, 1.72, 1.745, 'glow'),
      D('box', 0.05, 0.34, 0.34, 0, 0.70, 1.40, 'metal'),
      D('box', 0.30, 0.04, 0, -0.36, 0.40, 1.30, 'glow'),
    ],
  },
  {
    key: 'griddle', name: 'Griddle', tags: ['diner'],
    hx: 0.80, hz: 0.46, h: 0.98, collider: { kind: 'obb' },
    note: 'A steel top with two hot rings and an extractor hood over it.',
    parts: [
      D('box', 0.80, 0.46, 0, 0, 0, 0.86, 'dark'),
      D('box', 0.84, 0.50, 0, 0, 0.86, 0.96, 'metal'),
      D('oct', 0.17, 0.17, -0.34, 0, 0.94, 0.98, 'glow'),
      D('oct', 0.17, 0.17, 0.34, 0, 0.94, 0.98, 'glow'),
    ],
  },
  {
    key: 'shelf', name: 'Shelving', tags: ['store', 'office', 'bar', 'home', 'school'],
    hx: 1.05, hz: 0.30, h: 1.85, collider: { kind: 'obb' },
    note: 'Uprights and four slats. Long, thin and completely opaque.',
    parts: [
      D('box', 0.09, 0.30, -0.96, 0, 0, 1.85, 'dark'),
      D('box', 0.09, 0.30, 0.96, 0, 0, 1.85, 'dark'),
      D('box', 1.05, 0.30, 0, 0, 0.42, 0.50, 'body'),
      D('box', 1.05, 0.30, 0, 0, 0.92, 1.00, 'body'),
      D('box', 1.05, 0.30, 0, 0, 1.42, 1.50, 'body'),
      D('box', 1.05, 0.30, 0, 0, 1.78, 1.85, 'top'),
      D('box', 0.98, 0.07, 0, 0, 1.85, 1.87, 'dark'),
    ],
  },
  {
    key: 'desk', name: 'Desk', tags: ['office', 'police'],
    hx: 0.92, hz: 0.52, h: 0.78, collider: { kind: 'obb' },
    note: 'A top, a drawer block under one end, and a lit monitor on it.',
    parts: [
      D('box', 0.30, 0.48, -0.58, 0, 0, 0.66, 'body'),
      D('box', 0.10, 0.48, 0.84, 0, 0, 0.66, 'dark'),
      D('box', 0.92, 0.52, 0, 0, 0.66, 0.78, 'top'),
      D('box', 0.30, 0.13, -0.05, 0.20, 0.78, 0.80, 'dark'),
      D('box', 0.05, 0.28, 0.30, 0, 0.78, 1.16, 'dark'),
      D('box', 0.03, 0.24, 0.34, 0, 0.84, 1.12, 'glow'),
    ],
  },
  {
    key: 'planter', name: 'Planter', tags: ['office', 'diner', 'bar', 'home', 'bank'],
    hx: 0.36, hz: 0.36, h: 1.25, collider: { kind: 'circle', r: 0.36 },
    note: 'The only soft thing in any of these rooms.',
    parts: [
      D('trap', 0.36, 0.36, 0, 0, 0, 0.44, 'dark'),
      D('oct', 0.20, 0.20, 0, 0, 0.44, 0.72, 'body'),
      D('hex', 0.40, 0.40, 0, 0, 0.72, 1.02, 'glow'),
      D('hex', 0.26, 0.26, 0.06, 0.06, 1.02, 1.25, 'glow'),
    ],
  },
  {
    key: 'pallet', name: 'Pallet stack', tags: ['store'],
    hx: 0.66, hz: 0.52, h: 0.58, collider: { kind: 'obb' },
    note: 'Low enough to shoot over and high enough to trip a route. The only cover in the set you can see across.',
    parts: [
      D('box', 0.66, 0.52, 0, 0, 0, 0.14, 'dark'),
      D('box', 0.66, 0.52, 0, 0, 0.14, 0.26, 'body'),
      D('box', 0.62, 0.48, 0.03, 0.02, 0.26, 0.44, 'body', 0.12),
      D('box', 0.58, 0.44, -0.02, 0.04, 0.44, 0.58, 'top', -0.09),
      D('box', 0.56, 0.055, -0.02, -0.20, 0.58, 0.60, 'dark', -0.09),
      D('box', 0.56, 0.055, -0.02, 0.20, 0.58, 0.60, 'dark', -0.09),
    ],
  },
  {
    key: 'bollard', name: 'Bollard', tags: ['store', 'bank', 'police'],
    hx: 0.22, hz: 0.22, h: 1.05, collider: { kind: 'circle', r: 0.22 },
    note: 'A post. Thin cover, and the cheapest way to break a long sightline.',
    parts: [
      D('oct', 0.26, 0.26, 0, 0, 0, 0.08, 'dark'),
      D('oct', 0.19, 0.19, 0, 0, 0.08, 1.00, 'body'),
      D('oct', 0.22, 0.22, 0, 0, 0.72, 0.80, 'glow'),
      D('oct', 0.17, 0.17, 0, 0, 1.00, 1.06, 'glow'),
      D('box', 0.18, 0.05, 0, 0, 1.06, 1.075, 'dark'),
    ],
  },
  {
    key: 'pooltable', name: 'Pool table', tags: ['bar'],
    hx: 1.45, hz: 0.82, h: 0.84, collider: { kind: 'obb' },
    note: 'The biggest thing in any room. Waist high, so you can see over it and not walk through it.',
    parts: [
      D('box', 1.45, 0.82, 0, 0, 0, 0.68, 'dark'),
      D('box', 1.50, 0.87, 0, 0, 0.68, 0.80, 'body'),
      D('box', 1.36, 0.72, 0, 0, 0.80, 0.84, 'glow'),
      D('oct', 0.09, 0.09, -1.32, -0.70, 0.84, 0.87, 'dark'),
      D('oct', 0.09, 0.09, 1.32, 0.70, 0.84, 0.87, 'dark'),
      D('oct', 0.09, 0.09, 1.32, -0.70, 0.84, 0.87, 'dark'),
      D('oct', 0.09, 0.09, -1.32, 0.70, 0.84, 0.87, 'dark'),
    ],
  },
  {
    key: 'stage', name: 'Stage', tags: ['bar', 'arcade'],
    hx: 1.90, hz: 1.15, h: 0.42, collider: { kind: 'obb' },
    note: 'A low platform. The only solid in the set you can shoot clean over from anywhere.',
    parts: [
      D('box', 1.90, 1.15, 0, 0, 0, 0.34, 'dark'),
      D('box', 1.95, 1.20, 0, 0, 0.34, 0.42, 'top'),
      D('box', 1.80, 0.07, 0, -1.05, 0.42, 0.46, 'glow'),
      D('box', 1.80, 0.07, 0, 1.05, 0.42, 0.46, 'glow'),
    ],
  },
  {
    key: 'dumpster', name: 'Dumpster', tags: ['store'],
    hx: 1.10, hz: 0.66, h: 1.15, collider: { kind: 'obb' },
    note: 'Big, blunt and chest high. Full cover for one person and nobody else.',
    parts: [
      D('trap', 1.10, 0.66, 0, 0, 0, 0.98, 'body'),
      D('box', 1.14, 0.70, 0, 0, 0.98, 1.10, 'dark'),
      D('box', 1.06, 0.30, 0, -0.32, 1.10, 1.15, 'top'),
      D('box', 1.06, 0.30, 0, 0.32, 1.10, 1.15, 'top'),
    ],
  },
  {
    key: 'longtable', name: 'Long table', tags: ['diner', 'office', 'school', 'home'],
    hx: 1.70, hz: 0.52, h: 0.80, collider: { kind: 'obb' },
    note: 'A refectory table. Long enough to be a wall you can see across.',
    parts: [
      D('box', 0.13, 0.13, -1.48, -0.34, 0, 0.68, 'dark'),
      D('box', 0.13, 0.13, 1.48, -0.34, 0, 0.68, 'dark'),
      D('box', 0.13, 0.13, -1.48, 0.34, 0, 0.68, 'dark'),
      D('box', 0.13, 0.13, 1.48, 0.34, 0, 0.68, 'dark'),
      D('box', 1.70, 0.52, 0, 0, 0.68, 0.80, 'top'),
      D('box', 1.55, 0.09, 0, 0, 0.80, 0.82, 'body'),
    ],
  },
  {
    key: 'partition', name: 'Partition', tags: ['office', 'store', 'bank', 'police'],
    hx: 1.60, hz: 0.16, h: 1.55, collider: { kind: 'obb' },
    note: 'A screen on feet. Thin in plan, opaque in elevation — the cheapest way to cut a room in half.',
    parts: [
      D('box', 1.60, 0.10, 0, 0, 0.14, 1.48, 'body'),
      D('box', 1.62, 0.14, 0, 0, 1.48, 1.55, 'top'),
      D('box', 0.10, 0.42, -1.50, 0, 0, 0.14, 'dark'),
      D('box', 0.10, 0.42, 1.50, 0, 0, 0.14, 'dark'),
    ],
  },
  {
    key: 'stool', name: 'Stool', tags: ['bar', 'diner', 'home'],
    hx: 0.24, hz: 0.24, h: 0.78, collider: { kind: 'circle', r: 0.24 },
    note: 'Knee high and almost no footprint. Clutter you walk round without thinking.',
    parts: [
      D('oct', 0.20, 0.20, 0, 0, 0, 0.04, 'metal'),
      D('oct', 0.07, 0.07, 0, 0, 0.04, 0.68, 'dark'),
      D('oct', 0.24, 0.24, 0, 0, 0.68, 0.78, 'body'),
      D('oct', 0.15, 0.15, 0, 0, 0.78, 0.80, 'top'),
    ],
  },
  {
    key: 'chair', name: 'Chair', tags: ['diner', 'office', 'home', 'police', 'school', 'bank'],
    hx: 0.28, hz: 0.28, h: 0.92, collider: { kind: 'circle', r: 0.27 },
    note: 'A seat and a back. Reads as an L from above, which nothing else this small does.',
    parts: [
      D('box', 0.26, 0.26, 0, 0, 0, 0.44, 'dark'),
      D('box', 0.28, 0.28, 0, 0, 0.44, 0.52, 'body'),
      D('box', 0.26, 0.07, 0, 0.22, 0.52, 0.92, 'body'),
      D('box', 0.27, 0.09, 0, 0.22, 0.92, 0.95, 'top'),
    ],
  },
  {
    key: 'bin', name: 'Bin', tags: ['store', 'office', 'diner', 'arcade', 'home', 'police', 'school', 'bank'],
    hx: 0.26, hz: 0.26, h: 0.82, collider: { kind: 'circle', r: 0.26 },
    note: 'Small, round, everywhere. The filler that stops a floor being empty.',
    parts: [
      D('trap', 0.26, 0.26, 0, 0, 0, 0.72, 'dark'),
      D('oct', 0.28, 0.28, 0, 0, 0.72, 0.80, 'body'),
      D('oct', 0.17, 0.17, 0, 0, 0.80, 0.82, 'bg'),
    ],
  },
  {
    key: 'bottles', name: 'Bottle crate', tags: ['bar', 'store'],
    hx: 0.32, hz: 0.24, h: 0.52, collider: { kind: 'obb' },
    note: 'Low enough to shoot over and small enough to miss. A trip hazard with a colour.',
    parts: [
      D('box', 0.32, 0.24, 0, 0, 0, 0.30, 'dark'),
      D('box', 0.30, 0.22, 0, 0, 0.30, 0.36, 'body'),
      D('box', 0.07, 0.07, -0.16, -0.10, 0.36, 0.52, 'glow'),
      D('box', 0.07, 0.07, 0.02, -0.10, 0.36, 0.52, 'glow'),
      D('box', 0.07, 0.07, -0.07, 0.09, 0.36, 0.52, 'glow'),
    ],
  },
  {
    key: 'cone', name: 'Cone', tags: ['store', 'arcade'],
    hx: 0.22, hz: 0.22, h: 0.68, collider: { kind: 'circle', r: 0.20 },
    note: 'The smallest solid in the game. Barely cover, entirely a signal.',
    parts: [
      D('box', 0.22, 0.22, 0, 0, 0, 0.06, 'dark'),
      D('trap', 0.16, 0.16, 0, 0, 0.06, 0.56, 'glow'),
      D('trap', 0.09, 0.09, 0, 0, 0.56, 0.68, 'body'),
    ],
  },
  {
    key: 'barrun', name: 'Bar run', tags: ['bar'],
    hx: 2.70, hz: 0.55, h: 1.10, collider: { kind: 'obb' },
    note: 'Five and a half metres of counter. It gives a bar a front and a back, and it is the single biggest thing you can hide behind.',
    parts: [
      D('box', 2.70, 0.46, 0, 0, 0, 0.96, 'body'),
      D('box', 2.80, 0.55, 0, 0.04, 0.96, 1.10, 'top'),
      D('box', 2.62, 0.10, 0, 0.40, 1.10, 1.13, 'dark'),
      D('box', 2.60, 0.06, 0, -0.44, 0.42, 0.56, 'metal'),
      D('box', 0.30, 0.24, 2.10, 0, 1.10, 1.34, 'glow'),
      D('box', 0.22, 0.20, -1.80, 0, 1.10, 1.46, 'glow'),
    ],
  },
  {
    key: 'container', name: 'Container', tags: ['store'],
    hx: 2.90, hz: 1.10, h: 2.05, collider: { kind: 'obb' },
    note: 'Six metres of steel box. Taller than anyone, longer than anything, and completely opaque — the only object that makes its own corridor.',
    parts: [
      D('box', 2.90, 1.10, 0, 0, 0, 1.88, 'body'),
      D('box', 2.96, 1.16, 0, 0, 1.88, 2.05, 'dark'),
      D('box', 2.70, 0.09, 0, 0, 2.05, 2.09, 'metal'),
      D('box', 0.09, 1.14, -2.86, 0, 0, 1.90, 'dark'),
      D('box', 0.09, 1.14, 2.86, 0, 0, 1.90, 'dark'),
      D('box', 0.70, 0.14, 1.40, -1.14, 0.30, 1.30, 'glow'),
    ],
  },
  {
    key: 'boothrow', name: 'Booth row', tags: ['diner'],
    hx: 2.35, hz: 1.05, h: 1.32, collider: { kind: 'obb' },
    note: 'Three booths and their tables as one piece. Chest high, so it blocks a room without blocking the view of it.',
    parts: [
      D('box', 2.35, 0.20, 0, -0.85, 0, 1.24, 'body'),
      D('box', 2.40, 0.26, 0, -0.85, 1.24, 1.32, 'top'),
      D('box', 2.35, 0.20, 0, 0.85, 0, 1.24, 'body'),
      D('box', 2.40, 0.26, 0, 0.85, 1.24, 1.32, 'top'),
      D('box', 0.62, 0.44, -1.55, 0, 0, 0.76, 'dark'),
      D('box', 0.66, 0.48, -1.55, 0, 0.76, 0.86, 'top'),
      D('box', 0.62, 0.44, 0, 0, 0, 0.76, 'dark'),
      D('box', 0.66, 0.48, 0, 0, 0.76, 0.86, 'top'),
      D('box', 0.62, 0.44, 1.55, 0, 0, 0.76, 'dark'),
      D('box', 0.66, 0.48, 1.55, 0, 0.76, 0.86, 'top'),
    ],
  },
  {
    key: 'cabbank', name: 'Cabinet bank', tags: ['arcade'],
    hx: 2.30, hz: 0.48, h: 1.72, collider: { kind: 'obb' },
    note: 'Six cabinets shoulder to shoulder, every screen lit. A wall that plays music.',
    parts: [
      D('box', 2.30, 0.48, 0, 0, 0, 1.22, 'dark'),
      D('box', 2.30, 0.36, 0, -0.10, 1.22, 1.72, 'body'),
      D('box', 0.30, 0.22, -1.80, -0.16, 1.26, 1.50, 'glow'),
      D('box', 0.30, 0.22, -1.08, -0.16, 1.26, 1.50, 'glow'),
      D('box', 0.30, 0.22, -0.36, -0.16, 1.26, 1.50, 'glow'),
      D('box', 0.30, 0.22, 0.36, -0.16, 1.26, 1.50, 'glow'),
      D('box', 0.30, 0.22, 1.08, -0.16, 1.26, 1.50, 'glow'),
      D('box', 0.30, 0.22, 1.80, -0.16, 1.26, 1.50, 'glow'),
      D('box', 2.24, 0.10, 0, -0.30, 1.72, 1.77, 'glow'),
    ],
  },
  {
    key: 'deskbank', name: 'Desk bank', tags: ['office', 'police', 'school'],
    hx: 2.40, hz: 1.25, h: 1.16, collider: { kind: 'obb' },
    note: 'Four desks back to back behind a low screen. An office floor in one object.',
    parts: [
      D('box', 2.40, 0.10, 0, 0, 0.20, 1.10, 'body'),
      D('box', 2.44, 0.15, 0, 0, 1.10, 1.16, 'top'),
      D('box', 0.85, 0.50, -1.35, -0.72, 0.60, 0.72, 'top'),
      D('box', 0.85, 0.50, 1.35, -0.72, 0.60, 0.72, 'top'),
      D('box', 0.85, 0.50, -1.35, 0.72, 0.60, 0.72, 'top'),
      D('box', 0.85, 0.50, 1.35, 0.72, 0.60, 0.72, 'top'),
      D('box', 0.20, 0.44, -1.35, -0.72, 0, 0.60, 'dark'),
      D('box', 0.20, 0.44, 1.35, -0.72, 0, 0.60, 'dark'),
      D('box', 0.20, 0.44, -1.35, 0.72, 0, 0.60, 'dark'),
      D('box', 0.20, 0.44, 1.35, 0.72, 0, 0.60, 'dark'),
      D('box', 0.05, 0.24, -1.35, -0.50, 0.72, 1.06, 'glow'),
      D('box', 0.05, 0.24, 1.35, 0.50, 0.72, 1.06, 'glow'),
    ],
  },
  {
    key: 'vault', name: 'Vault door', tags: ['bank'],
    hx: 1.35, hz: 0.62, h: 2.10, collider: { kind: 'obb' },
    note: 'A round steel door in a thick frame. One object that tells you what building you are in.',
    parts: [
      D('box', 1.35, 0.62, 0, 0, 0, 2.10, 'dark'),
      D('oct', 0.95, 0.44, 0, -0.10, 0.10, 2.00, 'metal'),
      D('oct', 0.58, 0.28, 0, -0.16, 2.00, 2.08, 'metal'),
      D('plus', 0.30, 0.30, 0, -0.16, 2.08, 2.14, 'top'),
      D('box', 0.20, 0.14, 0.95, -0.20, 1.00, 1.20, 'glow'),
    ],
  },
  {
    key: 'ropes', name: 'Queue barrier', tags: ['bank'],
    hx: 1.05, hz: 0.16, h: 1.05, collider: { kind: 'obb' },
    note: 'Two posts and a rope. Waist high, and the only object here that is meant to direct people.',
    parts: [
      D('oct', 0.16, 0.16, -0.95, 0, 0, 0.07, 'dark'),
      D('oct', 0.16, 0.16, 0.95, 0, 0, 0.07, 'dark'),
      D('oct', 0.07, 0.07, -0.95, 0, 0.07, 0.95, 'metal'),
      D('oct', 0.07, 0.07, 0.95, 0, 0.07, 0.95, 'metal'),
      D('oct', 0.12, 0.12, -0.95, 0, 0.95, 1.05, 'top'),
      D('oct', 0.12, 0.12, 0.95, 0, 0.95, 1.05, 'top'),
      D('box', 0.92, 0.05, 0, 0, 0.80, 0.86, 'glow'),
    ],
  },
  {
    key: 'atm', name: 'ATM', tags: ['bank'],
    hx: 0.46, hz: 0.34, h: 1.75, collider: { kind: 'obb' },
    note: 'A lit screen in a steel box, with a shelf you could take cover behind if you were desperate.',
    parts: [
      D('box', 0.46, 0.34, 0, 0, 0, 1.62, 'dark'),
      D('box', 0.48, 0.36, 0, 0, 1.62, 1.75, 'body'),
      D('box', 0.30, 0.16, 0, -0.24, 1.10, 1.42, 'glow'),
      D('box', 0.40, 0.14, 0, -0.30, 0.92, 0.98, 'metal'),
    ],
  },
  {
    key: 'sofa', name: 'Sofa', tags: ['home'],
    hx: 1.15, hz: 0.52, h: 0.92, collider: { kind: 'obb' },
    note: 'Low, soft-cornered and wide. Nothing else in any room looks like somewhere to sit down.',
    parts: [
      D('box', 1.15, 0.44, 0, 0.06, 0, 0.42, 'body'),
      D('box', 1.15, 0.50, 0, 0.02, 0.42, 0.52, 'top'),
      D('box', 1.15, 0.18, 0, -0.40, 0, 0.92, 'body'),
      D('box', 0.16, 0.50, -1.10, 0, 0, 0.68, 'body'),
      D('box', 0.16, 0.50, 1.10, 0, 0, 0.68, 'body'),
      D('box', 0.34, 0.30, -0.55, 0.05, 0.52, 0.58, 'glow'),
      D('box', 0.34, 0.30, 0.55, 0.05, 0.52, 0.58, 'glow'),
    ],
  },
  {
    key: 'bed', name: 'Bed', tags: ['home'],
    hx: 1.05, hz: 0.78, h: 0.62, collider: { kind: 'obb' },
    note: 'The biggest flat thing in a home and the lowest cover in the set.',
    parts: [
      D('box', 1.05, 0.78, 0, 0, 0, 0.38, 'dark'),
      D('box', 1.02, 0.75, 0, 0.04, 0.38, 0.54, 'top'),
      D('box', 0.98, 0.22, 0, -0.52, 0.54, 0.62, 'glow'),
      D('box', 1.10, 0.10, 0, -0.80, 0, 0.90, 'body'),
    ],
  },
  {
    key: 'telly', name: 'TV unit', tags: ['home', 'bar'],
    hx: 0.72, hz: 0.30, h: 1.20, collider: { kind: 'obb' },
    note: 'A dark screen on a low cabinet. The only lit rectangle in a living room.',
    parts: [
      D('box', 0.72, 0.30, 0, 0, 0, 0.48, 'body'),
      D('box', 0.74, 0.32, 0, 0, 0.48, 0.56, 'top'),
      D('box', 0.10, 0.10, 0, 0, 0.56, 0.72, 'dark'),
      D('box', 0.58, 0.06, 0, 0, 0.72, 1.18, 'dark'),
      D('box', 0.52, 0.03, 0, -0.05, 0.76, 1.14, 'glow'),
    ],
  },
  {
    key: 'kitchen', name: 'Kitchen run', tags: ['home'],
    hx: 1.60, hz: 0.42, h: 1.00, collider: { kind: 'obb' },
    note: 'Worktop, sink and hob along one wall. Long, and it says home rather than restaurant.',
    parts: [
      D('box', 1.60, 0.42, 0, 0, 0, 0.86, 'body'),
      D('box', 1.64, 0.46, 0, 0, 0.86, 0.98, 'top'),
      D('box', 0.34, 0.28, -0.85, 0, 0.98, 1.00, 'metal'),
      D('oct', 0.13, 0.13, 0.55, -0.10, 0.98, 1.02, 'glow'),
      D('oct', 0.13, 0.13, 0.90, -0.10, 0.98, 1.02, 'glow'),
      D('box', 0.06, 0.06, -0.85, -0.14, 1.00, 1.30, 'metal'),
    ],
  },
  {
    key: 'lockers', name: 'Lockers', tags: ['school', 'police'],
    hx: 1.30, hz: 0.28, h: 1.90, collider: { kind: 'obb' },
    note: 'A run of tall doors. Taller than anyone, and it makes a corridor out of any wall.',
    parts: [
      D('box', 1.30, 0.28, 0, 0, 0, 1.82, 'body'),
      D('box', 1.34, 0.32, 0, 0, 1.82, 1.90, 'top'),
      D('box', 0.03, 0.30, -0.65, -0.02, 0.20, 1.70, 'dark'),
      D('box', 0.03, 0.30, 0, -0.02, 0.20, 1.70, 'dark'),
      D('box', 0.03, 0.30, 0.65, -0.02, 0.20, 1.70, 'dark'),
      D('box', 0.05, 0.05, -0.30, -0.28, 1.00, 1.06, 'glow'),
      D('box', 0.05, 0.05, 0.35, -0.28, 1.00, 1.06, 'glow'),
    ],
  },
  {
    key: 'schooldesk', name: 'School desk', tags: ['school'],
    hx: 0.58, hz: 0.40, h: 0.76, collider: { kind: 'obb' },
    note: 'A small desk and its chair, always facing the same way as the one beside it.',
    parts: [
      D('box', 0.10, 0.10, -0.46, -0.30, 0, 0.62, 'dark'),
      D('box', 0.10, 0.10, 0.46, -0.30, 0, 0.62, 'dark'),
      D('box', 0.58, 0.32, 0, -0.06, 0.62, 0.72, 'top'),
      D('box', 0.44, 0.05, 0, 0.20, 0.62, 0.66, 'body'),
      D('box', 0.24, 0.24, 0, 0.34, 0, 0.42, 'body'),
      D('box', 0.24, 0.06, 0, 0.52, 0.42, 0.76, 'body'),
    ],
  },
  {
    key: 'blackboard', name: 'Blackboard', tags: ['school'],
    hx: 1.55, hz: 0.14, h: 1.50, collider: { kind: 'obb' },
    note: 'A wide dark panel on a frame. It only makes sense in one kind of room.',
    parts: [
      D('box', 1.55, 0.10, 0, 0, 0.40, 1.44, 'dark'),
      D('box', 1.58, 0.14, 0, 0, 1.44, 1.50, 'top'),
      D('box', 1.50, 0.16, 0, -0.04, 0.40, 0.48, 'body'),
      D('box', 0.10, 0.34, -1.48, 0, 0, 0.40, 'body'),
      D('box', 0.10, 0.34, 1.48, 0, 0, 0.40, 'body'),
      D('box', 0.22, 0.04, -0.90, -0.10, 0.52, 0.56, 'glow'),
    ],
  },
  {
    key: 'frontdesk', name: 'Front desk', tags: ['police'],
    hx: 1.55, hz: 0.60, h: 1.24, collider: { kind: 'obb' },
    note: 'High counter, screen behind it, and a light on top. The place you are brought to.',
    parts: [
      D('box', 1.55, 0.52, 0, 0, 0, 1.10, 'body'),
      D('box', 1.60, 0.60, 0, 0.02, 1.10, 1.24, 'top'),
      D('box', 1.40, 0.06, 0, -0.46, 0.50, 0.62, 'metal'),
      D('box', 0.26, 0.16, -0.90, 0.10, 1.24, 1.50, 'dark'),
      D('box', 0.22, 0.03, -0.90, 0.04, 1.28, 1.46, 'glow'),
      D('oct', 0.13, 0.13, 1.10, 0, 1.24, 1.40, 'glow'),
    ],
  },
  {
    key: 'cell', name: 'Holding cell', tags: ['police'],
    hx: 1.30, hz: 0.20, h: 2.20, collider: { kind: 'obb' },
    note: 'A run of bars floor to ceiling. Opaque enough to stop a bullet and open enough to see through.',
    parts: [
      D('box', 1.30, 0.14, 0, 0, 0, 0.24, 'dark'),
      D('box', 1.34, 0.20, 0, 0, 2.06, 2.20, 'dark'),
      D('box', 0.06, 0.14, -1.20, 0, 0.24, 2.06, 'metal'),
      D('box', 0.06, 0.14, -0.72, 0, 0.24, 2.06, 'metal'),
      D('box', 0.06, 0.14, -0.24, 0, 0.24, 2.06, 'metal'),
      D('box', 0.06, 0.14, 0.24, 0, 0.24, 2.06, 'metal'),
      D('box', 0.06, 0.14, 0.72, 0, 0.24, 2.06, 'metal'),
      D('box', 0.06, 0.14, 1.20, 0, 0.24, 2.06, 'metal'),
      D('box', 1.28, 0.05, 0, 0, 1.20, 1.28, 'metal'),
    ],
  },
  {
    key: 'filing', name: 'Filing cabinets', tags: ['police', 'office'],
    hx: 0.90, hz: 0.32, h: 1.35, collider: { kind: 'obb' },
    note: 'Four drawers wide, chest high. Reads as a wall you can shoot over.',
    parts: [
      D('box', 0.90, 0.32, 0, 0, 0, 1.28, 'body'),
      D('box', 0.94, 0.36, 0, 0, 1.28, 1.35, 'top'),
      D('box', 0.86, 0.04, 0, -0.30, 0.30, 0.36, 'metal'),
      D('box', 0.86, 0.04, 0, -0.30, 0.66, 0.72, 'metal'),
      D('box', 0.86, 0.04, 0, -0.30, 1.02, 1.08, 'metal'),
      D('box', 0.20, 0.16, 0.55, 0, 1.35, 1.42, 'glow'),
    ],
  },
];

/* HOW BIG A THING IS, in one word, from its own footprint rather than from a
 * field somebody has to remember to set. The first catalogue put everything
 * between 0.4 and 1.0 m across, which gave a room one texture and no scale:
 * nothing to shelter behind and nothing to step over. The placer asks for a
 * MIX of these rather than drawing uniformly, so every room has a couple of
 * big pieces, a spread of middling ones and a scatter of clutter.
 */
export function sizeOf(o) {
  const span = Math.max(o.hx, o.hz) * 2;
  /* FOUR CLASSES, because three still put the biggest thing in the room at 3.8 m
     and the smallest at 0.44 — a ratio of nine, which sounds like a lot and does
     not read as one. `huge` starts at four and a half metres: a bar run, a
     shipping container, a bank of cabinets. Those make a room have PLACES in it
     rather than a texture. */
  return span >= 4.4 ? 'huge'
       : span >= 2.4 ? 'large'
       : span <= 0.72 ? 'small' : 'medium';
}
export const byTag = (tag) => OBJECTS.filter((o) => o.tags.includes(tag));
export const byTagSize = (tag, size) =>
  OBJECTS.filter((o) => o.tags.includes(tag) && sizeOf(o) === size);
export const objByKey = (k) => OBJECTS.find((o) => o.key === k);

/* ---- venues -------------------------------------------------------------
 * A room is somewhere. The venue picks the furniture, the signage, the floor
 * and the palette together, which is the difference between "a room" and "a
 * bar". It does NOT change any measured rule: prop counts, the clear centre and
 * the connectivity check are the same whatever the room is pretending to be.
 */
/* THE WALLS ARE PART OF THE VENUE, and they were the last thing in the room that
 * was not. Five identical near-black boxes told you nothing about where you
 * were, while the floor, the furniture and the signage all did — which made the
 * perimeter read as the edge of a level rather than the wall of a bar.
 *
 *   skin   the wall's own colour
 *   band   a stripe running along it at bandY, in wall-height fractions
 *   rail   a thin line at the top of the band: brass, steel, aluminium
 *   bay    what fills the inset segments — a window, a mirror, a dark recess
 *   every  one segment in `every` is a bay, so a wall has a rhythm
 *   win    what a bay actually is: 'glass' | 'strip' | 'hatch' | 'none'
 *   art    what hangs between the bays: 'mirror' | 'menu' | 'sign' | 'poster' | 'board'
 *   artEvery  one segment in this many carries a piece of it
 */
export const VENUES = [
  {
    key: 'bar', name: 'Bar', tag: 'bar',
    /* spilled drink on boards, lit red by the sign over the bar */
    ground: { floor: '#5d0306', floor2: '#ac050c', grid: '#ad2327',
              wall: '#800603', stage: '#350608' },
    /* dark panelling with a brass rail and a neon strip over it */
    wall: { skin: 'wall', band: 'prop-a', rail: 'prop-e', bay: 'wall',
            every: 3, bandY: [0.55, 0.78], name: 'panelled, brass rail, neon over the bar',
            win: 'none', art: 'mirror', artCol: 'prop-c', artEvery: 4 },
    signs: ['COLD BEER', 'OPEN LATE', 'NO CREDIT', 'THE ANCHOR', 'LIVE MUSIC'],
    patterns: ['checker', 'diag', 'herring', 'blocks'],
    decals: ['disc', 'ring', 'target', 'bars', 'zig'],
    roles: { body: 'prop-a', top: 'prop-a', dark: 'wall', metal: 'grid', glow: 'prop-c' },
    note: 'A long bar down one side, tables in the middle, something loud in a corner.',
  },
  {
    key: 'diner', name: 'Restaurant', tag: 'diner',
    /* mint checkerboard vinyl under cold tube light */
    ground: { floor: '#023b4a', floor2: '#036280', grid: '#17728c',
              wall: '#034e68', stage: '#031e25' },
    /* white tile to shoulder height with a red band across it */
    wall: { skin: 'floor2', band: 'prop-a', rail: 'grid', bay: 'prop-c',
            every: 2, bandY: [0.42, 0.58], name: 'tiled to shoulder height, red band, steel edging',
            win: 'strip', art: 'menu', artCol: 'prop-a', artEvery: 5 },
    signs: ['EAT', 'COFFEE', '24 HOURS', 'PIE', 'BREAKFAST', 'TABLE SERVICE'],
    patterns: ['checker', 'stripes', 'tri', 'dots'],
    decals: ['stripe', 'chevron', 'arrow', 'grid', 'bars'],
    roles: { body: 'prop-c', top: 'prop-c', dark: 'wall', metal: 'grid', glow: 'prop-a' },
    note: 'Booths along the walls, a griddle and a counter, everything wipe-clean.',
  },
  {
    key: 'bank', name: 'Bank', tag: 'bank',
    /* stone and brass: the warmest, best-lit floor in the set */
    ground: { floor: '#403614', floor2: '#685a20', grid: '#786836',
              wall: '#5a4816', stage: '#1e180b' },
    /* stone and brass, a high glazed band, and the vault door doing the talking */
    wall: { skin: 'floor2', band: 'prop-e', rail: 'prop-c', bay: 'grid',
            every: 2, bandY: [0.60, 0.90], name: 'stone piers, brass rail, high glazing',
            win: 'glass', art: 'notice', artCol: 'prop-e', artEvery: 3 },
    signs: ['FIRST NATIONAL', 'TELLERS', 'NO MASKS', 'DEPOSITS', 'VAULT', 'CLOSED'],
    patterns: ['herring', 'blocks', 'checker', 'diag'],
    decals: ['target', 'ring', 'grid', 'bars', 'cross'],
    roles: { body: 'prop-e', top: 'prop-e', dark: 'wall', metal: 'grid', glow: 'prop-b' },
    note: 'A teller run, a queue that no longer matters, and a vault door at the back.',
  },
  {
    key: 'home', name: 'Apartment', tag: 'home',
    /* worn ochre carpet, a lamp and a television still on */
    ground: { floor: '#521f02', floor2: '#913704', grid: '#99481a',
              wall: '#673304', stage: '#2b1103' },
    /* papered walls, a picture rail, and windows with the night outside */
    wall: { skin: 'floor', band: 'prop-b', rail: 'grid', bay: 'prop-c',
            every: 3, bandY: [0.62, 0.72], name: 'papered, picture rail, windows onto the night',
            win: 'glass', art: 'picture', artCol: 'prop-b', artEvery: 2 },
    signs: ['4B', 'NO ENTRY', 'PRIVATE', '221', 'KEEP OUT'],
    patterns: ['weave', 'herring', 'diag', 'dots'],
    decals: ['disc', 'stripe', 'hatch', 'zig', 'ring'],
    roles: { body: 'prop-b', top: 'prop-b', dark: 'wall', metal: 'grid', glow: 'prop-e' },
    note: 'Somebody lives here: a sofa, a bed, a kitchen along one wall, a television still on.',
  },
  {
    key: 'police', name: 'Police station', tag: 'police',
    /* institutional green-grey, the most colourless place here */
    ground: { floor: '#14332a', floor2: '#275d4b', grid: '#386857',
              wall: '#1b4738', stage: '#0d1c17' },
    /* institutional green to the dado, bars, and a light over the desk */
    wall: { skin: 'wall', band: 'prop-b', rail: 'grid', bay: 'prop-c',
            every: 2, bandY: [0.30, 0.55], name: 'institutional green to the dado, wired glass',
            win: 'hatch', art: 'notice', artCol: 'prop-c', artEvery: 3 },
    signs: ['PRECINCT 14', 'BOOKING', 'NO WEAPONS', 'CELLS', 'REPORT HERE'],
    patterns: ['bricks', 'blocks', 'stripes', 'weave'],
    decals: ['arrow', 'hatch', 'cross', 'bars', 'grid'],
    roles: { body: 'prop-c', top: 'prop-c', dark: 'wall', metal: 'grid', glow: 'prop-b' },
    note: 'A front desk, filing down one side, and a row of bars you can see straight through.',
  },
  {
    key: 'school', name: 'School', tag: 'school',
    /* olive linoleum, waxed */
    ground: { floor: '#213b02', floor2: '#396c03', grid: '#4a7717',
              wall: '#315103', stage: '#121f04' },
    /* painted block to the dado, a corridor of lockers, tall wired windows */
    wall: { skin: 'floor2', band: 'prop-d', rail: 'grid', bay: 'prop-c',
            every: 2, bandY: [0.34, 0.52], name: 'painted block to the dado, tall wired windows',
            win: 'glass', art: 'board', artCol: 'prop-d', artEvery: 3 },
    signs: ['ROOM 12', 'GYM', 'NO RUNNING', 'EXIT', 'LIBRARY', 'HALL'],
    patterns: ['checker', 'tri', 'stripes', 'blocks'],
    decals: ['grid', 'stripe', 'chevron', 'target', 'cross'],
    roles: { body: 'prop-d', top: 'prop-d', dark: 'wall', metal: 'grid', glow: 'prop-b' },
    note: 'Desks in rows facing a blackboard, lockers down the corridor wall.',
  },
  {
    key: 'store', name: 'Storeroom', tag: 'store',
    /* sealed concrete, cold and dim */
    ground: { floor: '#0e2446', floor2: '#1d4584', grid: '#335488',
              wall: '#133268', stage: '#0c1729' },
    /* corrugated steel and a hazard stripe at truck height */
    wall: { skin: 'wall', band: 'prop-e', rail: 'grid', bay: 'wall',
            every: 1, bandY: [0.30, 0.46], name: 'corrugated steel, hazard stripe at truck height',
            win: 'hatch', art: 'sign', artCol: 'prop-e', artEvery: 6 },
    signs: ['LOADING', 'NO ENTRY', 'BAY 3', 'KEEP CLEAR', 'STOCK'],
    patterns: ['bricks', 'blocks', 'weave', 'diag'],
    decals: ['hatch', 'arrow', 'cross', 'bars', 'zig'],
    roles: { body: 'prop-b', top: 'prop-b', dark: 'wall', metal: 'grid', glow: 'prop-a' },
    note: 'Crates, pallets and shelving in rows. The most cover of any venue.',
  },
  {
    key: 'arcade', name: 'Arcade', tag: 'arcade',
    /* black matting lit only by the cabinets: the darkest floor */
    ground: { floor: '#460452', floor2: '#830896', grid: '#8e229d',
              wall: '#680470', stage: '#2b0731' },
    /* black walls, and the only light in the room is on them */
    wall: { skin: 'wall', band: 'prop-d', rail: 'prop-c', bay: 'wall',
            every: 2, bandY: [0.34, 0.86], name: 'black, floor-to-ceiling light strips',
            win: 'none', art: 'poster', artCol: 'prop-d', artEvery: 3 },
    signs: ['TOKENS', 'HIGH SCORE', 'PLAY', 'INSERT COIN', 'GAME OVER'],
    patterns: ['dots', 'herring', 'checker', 'tri'],
    decals: ['target', 'ring', 'grid', 'zig', 'disc'],
    roles: { body: 'prop-c', top: 'prop-c', dark: 'wall', metal: 'grid', glow: 'prop-d' },
    note: 'Cabinets in banks with speakers between them. Everything glows.',
  },
  {
    key: 'office', name: 'Office', tag: 'office',
    /* blue-grey carpet tile: the quietest floor in the set */
    ground: { floor: '#26185e', floor2: '#472ea5', grid: '#5643a1',
              wall: '#302083', stage: '#17102e' },
    /* pale partitions with a glazed band you can see heads over */
    wall: { skin: 'floor2', band: 'prop-c', rail: 'grid', bay: 'floor',
            every: 2, bandY: [0.52, 0.86], name: 'pale partition, glazed band, aluminium edging',
            win: 'glass', art: 'board', artCol: 'floor2', artEvery: 4 },
    signs: ['FIRE EXIT', 'FLOOR 4', 'RECEPTION', 'STAIRS', 'PRIVATE'],
    patterns: ['weave', 'stripes', 'blocks', 'dots'],
    decals: ['grid', 'stripe', 'cross', 'hatch', 'bars'],
    roles: { body: 'prop-e', top: 'prop-e', dark: 'wall', metal: 'grid', glow: 'prop-b' },
    note: 'Desks and shelving, plants in the corners, the quietest floor in the set.',
  },
];

export const venueByKey = (k) => VENUES.find((v) => v.key === k) || VENUES[0];
