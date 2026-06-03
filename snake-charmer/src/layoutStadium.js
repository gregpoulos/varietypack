'use strict';

const W_CELL = 36;
const H_CELL = 36;
const SVG_PAD_H = 20;
const SVG_PAD_V = 4; // tight vertical margin; must stay > max stroke-width / 2

function computeRing(N, shape) {
  if (!Number.isInteger(N) || N < 4) throw new Error(`stadium/circle shape requires integer N >= 4, got ${N}`);
  if (N % 2 !== 0) throw new Error(`stadium/circle shape requires even N, got ${N}`);
  const nCurve    = shape === 'circle' ? N / 2 : Math.floor(N / 4);
  const nStraight = N / 2 - nCurve;
  const rCenter   = nCurve * W_CELL / Math.PI;
  const rOuter    = rCenter + H_CELL / 2;
  const rInner    = rCenter - H_CELL / 2;
  const L         = nStraight * W_CELL;
  const svgWidth  = 2 * (rOuter + SVG_PAD_H) + L;
  const svgHeight = 2 * (rOuter + SVG_PAD_V);
  const cx        = svgWidth / 2;
  const cy        = svgHeight / 2;
  return { N, nCurve, nStraight, L, rCenter, rOuter, rInner, svgWidth, svgHeight, cx, cy };
}

module.exports = { computeRing, W_CELL, H_CELL, SVG_PAD_H, SVG_PAD_V };
