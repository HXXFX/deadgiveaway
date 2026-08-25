import { mixHex, rgba, clamp } from './util.js';
import {
  el, option, grid, tooSmall, INK,
  iso, isoBox as box, isoPlate as plate, isoFit,
  obl, oblBox, oblPlate, oblFit,
} from './design-bench.js';
import { sectionPanelLayout } from './design-layout.js';
import { sectionHealth2, sectionAmmo2 } from './design-vitals.js';
import { sectionPolicy } from './design-policy.js';
import { sectionTook, sectionLedger, sectionBecome } from './design-panels.js';
import { sectionSees } from './design-sees.js';

/* ====================================================================== */
export function buildUi(root) {
  const intro = el('section', 'dsec');
  intro.append(el('h1', 'hm hm-lg', 'Every option on the screen'));
  intro.append(el('p', 'lede big-lede',
    'Everything below is drawn by real code at the real size. An option that ' +
    'looks good as a picture and falls apart at ninety pixels is not an option, ' +
    'and the only way to know that before shipping it is to draw it at ninety ' +
    'pixels. What is shipping is marked; so is what was tried and dropped, and ' +
    'why — a rejected option with no reason beside it is one that gets ' +
    'proposed again in a month.'));
  root.append(intro);
  sectionHealth2(root);
  sectionAmmo2(root);
  sectionPolicy(root);
  sectionTook(root);
  sectionLedger(root);
  sectionBecome(root);
  sectionSees(root);
  sectionPanelLayout(root);
}
