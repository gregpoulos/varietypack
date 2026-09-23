'use strict';
// Turn (C-shape) renderer: two horizontal arms joined on the left by a body arc system
// centered on (cx, cy). Traversal order is documented in src/layoutTurn.js.
// getTurnRenderer(ring) → { cellPath, letterCenter, labelPos, sectionOf }

if (typeof makeRingRenderer === 'undefined' && typeof require !== 'undefined')
  var { makeRingRenderer, trackSection, arcSection } = require('./ring');

function getTurnRenderer(ring) {
  const { nArmStraight, nArmCurve, nBodyInner, nBodyOuter, rArmCenter, rArmOuter, rArmInner,
          D, R_in, R_out, L, cx, cy } = ring;
  const H_CELL = rArmOuter - rArmInner;
  const W_CELL = nArmStraight > 0 ? L / nArmStraight : 0;
  const arm  = { rOut: rArmOuter, rIn: rArmInner, rc: rArmCenter };
  const body = R => ({ rOut: R + H_CELL / 2, rIn: R - H_CELL / 2, rc: R });
  const PI = Math.PI;

  return makeRingRenderer([
    trackSection(nArmStraight, cx,     cy - D, 'top',    arm, W_CELL),          // 0 top arm upper track
    arcSection(nArmCurve,      cx + L, cy - D, arm, -PI / 2, PI / nArmCurve),   // 1 top arm right curve
    trackSection(nArmStraight, cx + L, cy - D, 'bottom', arm, W_CELL),          // 2 top arm lower track
    arcSection(nBodyInner,     cx, cy, body(R_in), -PI / 2, -PI / nBodyInner),  // 3 body inner arc (CCW)
    trackSection(nArmStraight, cx,     cy + D, 'top',    arm, W_CELL),          // 4 bottom arm upper track
    arcSection(nArmCurve,      cx + L, cy + D, arm, -PI / 2, PI / nArmCurve),   // 5 bottom arm right curve
    trackSection(nArmStraight, cx + L, cy + D, 'bottom', arm, W_CELL),          // 6 bottom arm lower track
    arcSection(nBodyOuter,     cx, cy, body(R_out), PI / 2, PI / nBodyOuter),   // 7 body outer arc
  ]);
}

if (typeof module !== 'undefined') module.exports = { getTurnRenderer };
