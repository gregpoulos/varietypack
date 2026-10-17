// Stadium/circle shape renderer: two straight tracks joined by semicircles. A circle
// is the same ring with nStraight = 0.
// getStadiumRenderer(ring) → { cellPath, letterCenter, labelPos, sectionOf }

import { makeRingRenderer, trackSection, arcSection } from './ring.mjs';

function getStadiumRenderer(ring) {
  const { nCurve, nStraight, L, rCenter, rOuter, rInner, cx, cy, wCell: W_CELL } = ring;
  const band = { rOut: rOuter, rIn: rInner, rc: rCenter };
  const step = Math.PI / nCurve;

  return makeRingRenderer([
    trackSection(nStraight, cx - L / 2, cy, 'top', band, W_CELL),        // top, left → right
    arcSection(nCurve, cx + L / 2, cy, band, -Math.PI / 2, step),        // right semicircle, top → bottom
    trackSection(nStraight, cx + L / 2, cy, 'bottom', band, W_CELL),     // bottom, right → left
    arcSection(nCurve, cx - L / 2, cy, band, Math.PI / 2, step),         // left semicircle, bottom → top
  ]);
}

export { getStadiumRenderer };
