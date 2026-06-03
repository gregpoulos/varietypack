'use strict';

const { computeRing: computeStadiumRing } = require('./layoutStadium');
const { computeRing: computeTurnRing }    = require('./layoutTurn');
const { computeRing: computeDoubleTurnRing } = require('./layoutDoubleTurn');

const RING_FIELDS = {
  stadium:       ['N', 'nCurve', 'nStraight', 'L', 'rCenter', 'rOuter', 'rInner', 'svgWidth', 'svgHeight', 'cx', 'cy'],
  circle:        ['N', 'nCurve', 'nStraight', 'L', 'rCenter', 'rOuter', 'rInner', 'svgWidth', 'svgHeight', 'cx', 'cy'],
  turn:          ['N', 'nArmStraight', 'nArmCurve', 'nBodyInner', 'nBodyOuter', 'rArmCenter', 'rArmOuter', 'rArmInner', 'D', 'R_in', 'R_out', 'L', 'svgWidth', 'svgHeight', 'cx', 'cy'],
  'double-turn': ['N', 'nArmStraight', 'nMidStraight', 'nArmCurve', 'nBodyInner', 'nBodyOuter', 'rArmCenter', 'rArmOuter', 'rArmInner', 'R_in', 'R_out', 'D', 'L', 'Lm', 'cx_L', 'cx_R', 'cy', 'cy_L', 'cy_R', 'cy_top', 'cy_bot', 'svgWidth', 'svgHeight'],
};

function assertRingFields(ring, shape) {
  const required = RING_FIELDS[shape] ?? RING_FIELDS.stadium;
  const missing = required.filter(f => !(f in ring));
  if (missing.length > 0) {
    throw new Error(`computeRing for shape "${shape}" is missing required fields: ${missing.join(', ')}`);
  }
}

function computeLayout(entries, loops, shape) {
  shape = shape ?? 'stadium';
  loops = loops ?? 2;
  const totalCells = entries.reduce((sum, e) => sum + e.length, 0);
  const N = totalCells / loops;

  const ring = shape === 'turn'        ? computeTurnRing(N)
             : shape === 'double-turn' ? computeDoubleTurnRing(N)
             : computeStadiumRing(N, shape);
  assertRingFields(ring, shape);

  return { ring };
}

module.exports = { computeLayout, assertRingFields };
