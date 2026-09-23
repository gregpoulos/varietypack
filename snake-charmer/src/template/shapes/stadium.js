'use strict';
// Stadium/circle shape renderer: two straight tracks joined by semicircles. A circle
// is the same ring with nStraight = 0.
// getStadiumRenderer(ring) → { cellPath, letterCenter, labelPos, sectionOf }

if (typeof makeRingRenderer === 'undefined' && typeof require !== 'undefined')
  var { makeRingRenderer, trackSection, arcSection } = require('./ring');

function getStadiumRenderer(ring) {
  const { nCurve, nStraight, L, rCenter, rOuter, rInner, cx, cy } = ring;
  const W_CELL = nStraight > 0 ? L / nStraight : 0;
  const band = { rOut: rOuter, rIn: rInner, rc: rCenter };
  const step = Math.PI / nCurve;

  return makeRingRenderer([
    trackSection(nStraight, cx - L / 2, cy, 'top', band, W_CELL),        // top, left → right
    arcSection(nCurve, cx + L / 2, cy, band, -Math.PI / 2, step),        // right semicircle, top → bottom
    trackSection(nStraight, cx + L / 2, cy, 'bottom', band, W_CELL),     // bottom, right → left
    arcSection(nCurve, cx - L / 2, cy, band, Math.PI / 2, step),         // left semicircle, bottom → top
  ]);
}

if (typeof module !== 'undefined') module.exports = { getStadiumRenderer };
