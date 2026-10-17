'use strict';

const { computeRing: computeStadiumRing } = require('./layoutStadium');
const { computeRing: computeTurnRing }    = require('./layoutTurn');
const { computeRing: computeDoubleTurnRing } = require('./layoutDoubleTurn');

const STADIUM_FIELDS = ['N', 'nCurve', 'nStraight', 'L', 'rCenter', 'rOuter', 'rInner', 'svgWidth', 'svgHeight', 'cx', 'cy', 'wCell', 'hCell'];

// The one list of ring shapes: the validator, the CLI flag and its help read the
// names from here, and ringFor dispatches through it. `fields` is what a
// shape's ring must carry, checked by assertRingFields at build time.
const SHAPES = {
  circle:        { computeRing: N => computeStadiumRing(N, 'circle'),  fields: STADIUM_FIELDS },
  stadium:       { computeRing: N => computeStadiumRing(N, 'stadium'), fields: STADIUM_FIELDS },
  turn:          { computeRing: computeTurnRing,
                   fields: ['N', 'nArmStraight', 'nArmCurve', 'nBodyInner', 'nBodyOuter', 'rArmCenter', 'rArmOuter', 'rArmInner', 'D', 'R_in', 'R_out', 'L', 'svgWidth', 'svgHeight', 'cx', 'cy', 'wCell', 'hCell'] },
  'double-turn': { computeRing: computeDoubleTurnRing,
                   fields: ['N', 'nArmStraight', 'nMidStraight', 'nArmCurve', 'nBodyInner', 'nBodyOuter', 'rArmCenter', 'rArmOuter', 'rArmInner', 'R_in', 'R_out', 'D', 'L', 'Lm', 'cx_L', 'cx_R', 'cy', 'cy_L', 'cy_R', 'cy_top', 'cy_bot', 'svgWidth', 'svgHeight', 'wCell', 'hCell'] },
};
const SHAPE_NAMES = Object.keys(SHAPES);

function assertRingFields(ring, shape) {
  const missing = SHAPES[shape].fields.filter(f => !(f in ring));
  if (missing.length > 0) {
    throw new Error(`computeRing for shape "${shape}" is missing required fields: ${missing.join(', ')}`);
  }
}

function ringOf(N, shape) {
  if (!Object.hasOwn(SHAPES, shape)) throw new Error(`unknown shape "${shape}"; expected one of: ${SHAPE_NAMES.join(', ')}`);
  const ring = SHAPES[shape].computeRing(N);
  assertRingFields(ring, shape);
  return ring;
}

// The automatic choice when neither --shape nor the YAML names a shape: the S-shape when
// a double-turn ring exists for N, otherwise the stadium.
function autoShape(N) {
  try { SHAPES['double-turn'].computeRing(N); return 'double-turn'; } catch { return 'stadium'; }
}

// The one home for which ring a puzzle of N cells gets: `shape` when named, else the
// automatic choice. → { shape, ring, fellBack }, fellBack when the automatic choice
// settled for the stadium. A named shape never falls back, so its geometry errors
// surface; neither does the stadium, so an N no shape fits throws. The double-turn ring
// is computed once, which is why this repeats autoShape's rule instead of calling it.
function ringFor(N, shape) {
  if (shape !== undefined) return { shape, ring: ringOf(N, shape), fellBack: false };
  let ring;
  try { ring = SHAPES['double-turn'].computeRing(N); } catch { return { shape: 'stadium', ring: ringOf(N, 'stadium'), fellBack: true }; }
  assertRingFields(ring, 'double-turn');
  return { shape: 'double-turn', ring, fellBack: false };
}

module.exports = { ringFor, assertRingFields, autoShape, SHAPES, SHAPE_NAMES };
