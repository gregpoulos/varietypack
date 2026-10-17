// Double-turn (S-shape) renderer: three horizontal arms joined by a left body arc
// system at (cx_L, cy_L) and a right one at (cx_R, cy_R). Traversal order is
// documented in src/layoutDoubleTurn.js.
// getDoubleTurnRenderer(ring) → { cellPath, letterCenter, labelPos, sectionOf }

import { makeRingRenderer, trackSection, arcSection } from './ring.mjs';

function getDoubleTurnRenderer(ring) {
  const { nArmStraight, nMidStraight, nArmCurve, nBodyInner, nBodyOuter,
          rArmCenter, rArmOuter, rArmInner, R_in, R_out, L,
          cx_L, cx_R, cy, cy_L, cy_R, cy_top, cy_bot, wCell: W_CELL, hCell: H_CELL } = ring;
  const arm  = { rOut: rArmOuter, rIn: rArmInner, rc: rArmCenter };
  const body = R => ({ rOut: R + H_CELL / 2, rIn: R - H_CELL / 2, rc: R });
  const PI = Math.PI;

  return makeRingRenderer([
    trackSection(nArmStraight, cx_L,     cy_top, 'top',    arm, W_CELL),              //  0 top arm upper track
    arcSection(nArmCurve,      cx_L + L, cy_top, arm, -PI / 2, PI / nArmCurve),       //  1 top arm right curve
    trackSection(nArmStraight, cx_L + L, cy_top, 'bottom', arm, W_CELL),              //  2 top arm lower track
    arcSection(nBodyInner,     cx_L, cy_L, body(R_in),  -PI / 2, -PI / nBodyInner),   //  3 left body inside arc (CCW)
    trackSection(nMidStraight, cx_L,     cy,     'top',    arm, W_CELL),              //  4 middle arm upper track
    arcSection(nBodyOuter,     cx_R, cy_R, body(R_out), -PI / 2, PI / nBodyOuter),    //  5 right body outside arc
    trackSection(nArmStraight, cx_R,     cy_bot, 'bottom', arm, W_CELL),              //  6 bottom arm lower track
    arcSection(nArmCurve,      cx_R - L, cy_bot, arm, PI / 2, PI / nArmCurve),        //  7 bottom arm left curve
    trackSection(nArmStraight, cx_R - L, cy_bot, 'top',    arm, W_CELL),              //  8 bottom arm upper track
    arcSection(nBodyInner,     cx_R, cy_R, body(R_in),  PI / 2, -PI / nBodyInner),    //  9 right body inside arc (CCW)
    trackSection(nMidStraight, cx_R,     cy,     'bottom', arm, W_CELL),              // 10 middle arm lower track
    arcSection(nBodyOuter,     cx_L, cy_L, body(R_out), PI / 2, PI / nBodyOuter),     // 11 left body outside arc
  ]);
}

export { getDoubleTurnRenderer };
