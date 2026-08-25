/* THE DESIGN SHEET'S BENCH: the shared drawing primitives, plus the option card
   that only a sheet needs. The drawing itself lives in viz3d.js because the GAME
   draws with it too — see the note at the top of that file. */
import { fitCanvas } from './util.js';
export * from './viz3d.js';
import { PAL } from './viz3d.js';

export const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt !== undefined) n.textContent = txt;
  return n;
};

/* ---- an option: a titled canvas at a stated size, plus the argument ------ */
export function option(parent, { name, size, verdict, note, draw }) {
  const o = el('div', 'opt' + (verdict ? ' opt-' + verdict.replace(/ /g, '-') : ''));
  const head = el('div', 'opt-h');
  head.append(el('b', null, name));
  if (verdict) head.append(el('u', null, verdict === 'in' ? 'shipping' : verdict));
  o.append(head);
  const holder = el('div', 'opt-c');
  const c = document.createElement('canvas');
  c.style.width = size[0] + 'px';
  c.style.height = size[1] + 'px';
  holder.append(c);
  o.append(holder);
  o.append(el('i', null, note));
  o.append(el('span', 'opt-s', size[0] + ' x ' + size[1] + ' css px — the size it gets'));
  parent.append(o);
  /* drawn after layout, so the canvas has measured its own box first */
  requestAnimationFrame(() => {
    const { w, h, d } = fitCanvas(c);
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    draw(g, w, h, d, PAL());
  });
  return o;
}

export const grid = (parent, cls) => {
  const gd = el('div', 'opts' + (cls ? ' ' + cls : ''));
  parent.append(gd);
  return gd;
};

/* WHEN AN OPTION FAILS, THE SHEET HAS TO SHOW IT FAILING.
 *
 * An isometric scene squeezed into a header slot comes out at about five device
 * pixels a unit, which IS the argument against it — but drawn without comment a
 * five-pixel cluster reads as a broken canvas, and a reviewer cannot tell "this
 * option is bad" from "this sheet is bad". Anything under the threshold says so
 * across its own box. */
export function tooSmall(g, w, h, d, C, s, floor) {
  if (s >= floor) return false;
  g.save();
  g.fillStyle = C.warm;
  g.font = `700 ${9 * d}px ui-monospace, monospace`;
  g.textAlign = 'center';
  g.fillText('drawn at ' + s.toFixed(1) + 'px a unit — too small to read',
             w / 2, h - 4 * d);
  g.restore();
  return true;
}
