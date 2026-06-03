'use strict';

// Traversal order — 8 sections, clockwise:
//  0  Top arm upper track       left → right
//  1  Top arm right curve (CW)  top → bottom
//  2  Top arm lower track       right → left
//  3  Body inner arc (CCW)      top → bottom
//  4  Bottom arm upper track    left → right
//  5  Bottom arm right curve (CW)  top → bottom
//  6  Bottom arm lower track    right → left
//  7  Body outer arc (CW)       bottom → top

const W_CELL = 36;
const H_CELL = 36;
const SVG_PAD_H = 20;
const SVG_PAD_V = 4; // tight vertical margin; must stay > max stroke-width / 2

function computeRing(N) {
  if (N % 4 !== 0) throw new Error(`turn shape requires N divisible by 4, got ${N}`);
  const nArmCurve    = Math.max(1, Math.round(N / 12));
  const nBodyInner   = 2 * nArmCurve;  // inner body arc — proportional to R_in so arc-length ≈ W_CELL
  const nBodyOuter   = 4 * nArmCurve;  // outer body arc — proportional to R_out so arc-length ≈ W_CELL
  const nArmStraight = (N - 8 * nArmCurve) / 4;
  const rArmCenter   = nArmCurve * W_CELL / Math.PI;
  const rArmOuter    = rArmCenter + H_CELL / 2;
  const rArmInner    = rArmCenter - H_CELL / 2;
  // rArmInner <= 0 means the arm curve cells degenerate (inner edge crosses center)
  if (rArmInner <= 0) throw new Error(`turn shape N=${N} too small (arm curve inner radius is ${rArmInner.toFixed(1)}; try a larger N)`);
  const R_in         = nBodyInner * W_CELL / Math.PI;  // = D - rArmCenter
  const R_out        = nBodyOuter * W_CELL / Math.PI;  // = D + rArmCenter
  const D            = R_in + rArmCenter;
  const L            = nArmStraight * W_CELL;
  const cx           = R_out + H_CELL / 2 + SVG_PAD_H;
  const svgHeight    = 2 * (D + rArmOuter) + 2 * SVG_PAD_V;
  const cy           = svgHeight / 2;
  const svgWidth     = cx + L + rArmOuter + SVG_PAD_H;
  return {
    N, nArmStraight, nArmCurve, nBodyInner, nBodyOuter,
    rArmCenter, rArmOuter, rArmInner,
    D, R_in, R_out, L,
    svgWidth, svgHeight, cx, cy,
  };
}

module.exports = { computeRing, W_CELL, H_CELL, SVG_PAD_H, SVG_PAD_V };
