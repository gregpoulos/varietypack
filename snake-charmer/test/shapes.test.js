'use strict';

// Geometric contracts for the browser shape renderers (src/template/shapes/*.js).
// Each renderer maps a ring position to a cell outline, a letter anchor and a
// number-label anchor. These tests assert properties any correct renderer has —
// the ring is one closed chain of edge-adjacent cells, anchors sit inside their
// cell, and nothing falls outside the SVG — rather than snapshotting coordinates.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeRing: computeStadiumRing }    = require('../src/layoutStadium');
const { computeRing: computeTurnRing }       = require('../src/layoutTurn');
const { computeRing: computeDoubleTurnRing } = require('../src/layoutDoubleTurn');
const { getStadiumRenderer }    = require('../src/template/shapes/stadium');
const { getTurnRenderer }       = require('../src/template/shapes/turn');
const { getDoubleTurnRenderer } = require('../src/template/shapes/double-turn');

const EPS = 1e-6;

const SHAPES = {
  circle:        { ring: N => computeStadiumRing(N, 'circle'),  renderer: getStadiumRenderer },
  stadium:       { ring: N => computeStadiumRing(N, 'stadium'), renderer: getStadiumRenderer },
  turn:          { ring: computeTurnRing,                       renderer: getTurnRenderer },
  'double-turn': { ring: computeDoubleTurnRing,                 renderer: getDoubleTurnRenderer },
};

// Every ring size the layout accepts, from the validator's minimum (8) up to a
// generous puzzle size.
function validRings(shape) {
  const rings = [];
  for (let N = 8; N <= 160; N++) {
    try { rings.push(SHAPES[shape].ring(N)); } catch (_) { /* size not supported */ }
  }
  return rings;
}

// The four corner points of a cell outline, in path order. Straight cells are
// "M p L p L p L p Z"; curved cells are "M p A r r 0 0 f p L p A r r 0 0 f p Z".
function corners(d) {
  const t = d.trim().split(/\s+/);
  const pts = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === 'M' || t[i] === 'L') { pts.push([+t[i + 1], +t[i + 2]]); i += 2; }
    else if (t[i] === 'A')            { pts.push([+t[i + 6], +t[i + 7]]); i += 7; }
  }
  return pts;
}

const same = (p, q) => Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;
const sharedCorners = (a, b) => a.filter(p => b.some(q => same(p, q))).length;

function inBox([x, y], pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return x > Math.min(...xs) - EPS && x < Math.max(...xs) + EPS &&
         y > Math.min(...ys) - EPS && y < Math.max(...ys) + EPS;
}

for (const shape of Object.keys(SHAPES)) {
  const rings = validRings(shape);

  test(`${shape}: the layout accepts at least one ring size`, () => {
    assert.ok(rings.length > 0);
  });

  test(`${shape}: consecutive cells share an edge, and the ring closes`, () => {
    for (const ring of rings) {
      const { cellPath } = SHAPES[shape].renderer(ring);
      for (let i = 0; i < ring.N; i++) {
        const next = (i + 1) % ring.N;
        assert.equal(sharedCorners(corners(cellPath(i)), corners(cellPath(next))), 2,
          `N=${ring.N}: cells ${i} and ${next} should share exactly one edge`);
      }
    }
  });

  test(`${shape}: letter and number anchors sit inside their own cell`, () => {
    for (const ring of rings) {
      const { cellPath, letterCenter, labelPos } = SHAPES[shape].renderer(ring);
      for (let i = 0; i < ring.N; i++) {
        const pts = corners(cellPath(i));
        const { tx, ty } = letterCenter(i);
        const { lx, ly } = labelPos(i);
        assert.ok(inBox([tx, ty], pts), `N=${ring.N}: letter anchor of cell ${i} is outside it`);
        assert.ok(inBox([lx, ly], pts), `N=${ring.N}: number anchor of cell ${i} is outside it`);
      }
    }
  });

  test(`${shape}: every cell corner and anchor lies within the SVG`, () => {
    for (const ring of rings) {
      const { cellPath, letterCenter, labelPos } = SHAPES[shape].renderer(ring);
      const inSvg = ([x, y]) =>
        x >= -EPS && x <= ring.svgWidth + EPS && y >= -EPS && y <= ring.svgHeight + EPS;
      for (let i = 0; i < ring.N; i++) {
        for (const p of corners(cellPath(i))) {
          assert.ok(inSvg(p), `N=${ring.N}: cell ${i} corner (${p}) is outside the SVG`);
        }
        const { tx, ty } = letterCenter(i);
        const { lx, ly } = labelPos(i);
        assert.ok(inSvg([tx, ty]) && inSvg([lx, ly]), `N=${ring.N}: cell ${i} anchor is outside the SVG`);
      }
    }
  });
}
