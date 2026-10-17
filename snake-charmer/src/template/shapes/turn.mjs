// Turn (C-shape) renderer: two horizontal arms joined on the left by a body arc system
// centered on (cx, cy). Traversal order is documented in src/layoutTurn.js.
// getTurnRenderer(ring) → { cellPath, letterCenter, labelPos, sectionOf }

import { makeRingRenderer, trackSection, arcSection } from './ring.mjs';

function getTurnRenderer(ring) {
  const { nArmStraight, nArmCurve, nBodyInner, nBodyOuter, rArmCenter, rArmOuter, rArmInner,
          D, R_in, R_out, L, cx, cy, wCell: W_CELL, hCell: H_CELL } = ring;
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

export { getTurnRenderer };
