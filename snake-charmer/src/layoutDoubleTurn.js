'use strict';

// Traversal order — 12 sections, clockwise:
//  0  Top arm upper track          left → right
//  1  Top arm right curve (CW)     top → bottom
//  2  Top arm lower track          right → left
//  3  Left body inside arc (CCW)   top → bottom
//  4  Middle arm upper track       left → right
//  5  Right body outside arc (CW)  top → bottom
//  6  Bottom arm lower track       right → left
//  7  Bottom arm left curve (CW)   bottom → top
//  8  Bottom arm upper track       left → right
//  9  Right body inside arc (CCW)  bottom → top
// 10  Middle arm lower track       right → left
// 11  Left body outside arc (CW)   bottom → top

const W_CELL = 36, H_CELL = 36, SVG_PAD_H = 40;
const SVG_PAD_V = 4; // tight vertical margin; must stay > max stroke-width / 2

function computeRing(N) {
  if (N % 2 !== 0) throw new Error(`double-turn shape requires even N, got ${N}`);
  const nArmCurve    = Math.max(1, Math.round(N / 24));
  const nBodyInner   = 2 * nArmCurve;
  const nBodyOuter   = 4 * nArmCurve;
  const R            = N - 14 * nArmCurve;
  if (R < 0) throw new Error(`double-turn shape requires N >= ${14 * nArmCurve} for nArmCurve=${nArmCurve}, got ${N}`);
  // Outer arms are delta cells longer than the middle arm (delta is 2, 3, or 4 depending on N,
  // chosen so all counts are integers; always satisfies nArmStraight > nMidStraight).
  const rem6         = R % 6;  // always 0, 2, or 4 since N and 14*nArmCurve are both even
  const delta        = rem6 === 0 ? 3 : rem6 === 2 ? 2 : 4;
  const nMidStraight = (R - 4 * delta) / 6;
  if (nMidStraight < 1) throw new Error(`double-turn shape N=${N} too small (middle arm requires at least 1 cell)`);
  const nArmStraight = nMidStraight + delta;
  const rArmCenter   = nArmCurve * W_CELL / Math.PI;
  const rArmOuter    = rArmCenter + H_CELL / 2;
  const rArmInner    = rArmCenter - H_CELL / 2;
  if (rArmInner <= 0) throw new Error(`double-turn shape N=${N} too small (arm curve inner radius is ${rArmInner.toFixed(1)}; try a larger N)`);
  const R_in         = 2 * rArmCenter;
  const R_out        = 4 * rArmCenter;
  const D            = 3 * rArmCenter;
  const L            = nArmStraight * W_CELL;
  const Lm           = nMidStraight * W_CELL;
  // cx_L must clear SVG_PAD_H for both the left body arc and the bottom arm endcap
  // (which extends leftward to cx_R - L = cx_L + Lm - L).
  const cx_L         = Math.max(R_out + H_CELL / 2, L - Lm + rArmOuter) + SVG_PAD_H;
  const cx_R         = cx_L + Lm;
  const svgHeight    = 2 * SVG_PAD_V + 4 * D + 2 * rArmOuter;
  const cy           = svgHeight / 2;
  const cy_L         = cy - D;
  const cy_R         = cy + D;
  const cy_top       = cy - 2 * D;
  const cy_bot       = cy + 2 * D;
  // svgWidth must clear SVG_PAD_H for both the right body arc and the top arm endcap
  // (which extends rightward to cx_L + L + rArmOuter).
  const svgWidth     = Math.max(cx_R + R_out + H_CELL / 2, cx_L + L + rArmOuter) + SVG_PAD_H;
  return { N, nArmStraight, nMidStraight, nArmCurve, nBodyInner, nBodyOuter,
           rArmCenter, rArmOuter, rArmInner, R_in, R_out, D, L, Lm,
           cx_L, cx_R, cy, cy_L, cy_R, cy_top, cy_bot, svgWidth, svgHeight };
}

module.exports = { computeRing, W_CELL, H_CELL, SVG_PAD_H, SVG_PAD_V };
