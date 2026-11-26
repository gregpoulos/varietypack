'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  pathCorners, rectCorners, flagCornerIndex, flagPolygon, slashLine,
} = require('../markShapes.mjs');
const { puzzleDataOf, buildPuzzleFile, tmpDir } = require('../../test/helpers');
const { cellPath, computeCells, geometryFor } = require('../../spiral/src/layout.mjs');
const { ringFor } = require('../../snake-charmer/src/layout.mjs');
const { LOOPS } = require('../../snake-charmer/src/entryMaps.mjs');
const { getStadiumRenderer } = require('../../snake-charmer/src/template/shapes/stadium.mjs');
const { getTurnRenderer } = require('../../snake-charmer/src/template/shapes/turn.mjs');
const { getDoubleTurnRenderer } = require('../../snake-charmer/src/template/shapes/double-turn.mjs');

const SQUARE = rectCorners(0, 0, 10, 10);
const DIAMOND = [[5, 0], [10, 5], [5, 10], [0, 5]];
const indexOf = (corners, [x, y]) => corners.findIndex(([cx, cy]) => cx === x && cy === y);
const sameSet = (a, b) => assert.deepEqual(
  a.map(p => p.join(',')).sort(), b.map(p => p.join(',')).sort());

test('pathCorners reads M, L and A endpoints', () => {
  assert.deepEqual(pathCorners('M0,0 L10,0 A5,5 0 0,1 10,10 L0,10 Z'),
    [[0, 0], [10, 0], [10, 10], [0, 10]]);
  assert.deepEqual(pathCorners('M 0 0 L 10 0 L 10 10 L 0 10 Z'),
    [[0, 0], [10, 0], [10, 10], [0, 10]]);
});

test('pathCorners drops a closing point that repeats the first', () => {
  assert.deepEqual(pathCorners('M0,0 L10,0 L10,10 A5,5 0 0,0 0,0Z'),
    [[0, 0], [10, 0], [10, 10]]);
});

test('pathCorners throws on a relative command', () => {
  assert.throws(() => pathCorners('m0,0 l10,0 z'));
});

test('rectCorners runs clockwise from top-left', () => {
  assert.deepEqual(rectCorners(1, 2, 3, 4), [[1, 2], [4, 2], [4, 6], [1, 6]]);
});

// Every real cell outline the tools draw goes through pathCorners. A generator that
// starts emitting relative or curve commands must fail here, not draw a stray flag.
test('pathCorners handles every real cell path', () => {
  // Built from the fixture YAML, never read from a prebuilt .html: those are gitignored.
  const out = tmpDir();
  const html = (tool, name) => {
    const dest = path.join(out, `${tool}-${name}.html`);
    buildPuzzleFile(path.join(__dirname, '..', '..', tool, 'test', 'fixtures', `${name}.yaml`), dest);
    return fs.readFileSync(dest, 'utf8');
  };
  const paths = [];
  for (const name of ['test-78', 'rebus-40']) {
    const total = puzzleDataOf(html('spiral', name)).inward.reduce((sum, e) => sum + e.length, 0);
    for (const cell of computeCells(total, geometryFor(total))) paths.push(cellPath(cell));
  }
  const renderers = { stadium: getStadiumRenderer, turn: getTurnRenderer,
    'double-turn': getDoubleTurnRenderer };
  for (const name of ['circle-8', 'stadium-24', 'turn-20', 'double-turn-42']) {
    const data = puzzleDataOf(html('snake-charmer', name));
    const { ring } = ringFor(data.entries.reduce((sum, e) => sum + e.length, 0) / LOOPS, data.shape);
    const { cellPath: snakePath } = (renderers[data.shape] || getStadiumRenderer)(ring);
    for (let i = 0; i < ring.N; i++) paths.push(snakePath(i));
  }
  assert.ok(paths.length > 100);
  for (const d of paths) {
    const corners = pathCorners(d);
    assert.ok(corners.length >= 4, d);
    assert.ok(corners.flat().every(Number.isFinite), d);
  }
});

test('flagCornerIndex picks top-right on a square', () => {
  assert.equal(flagCornerIndex(SQUARE), indexOf(SQUARE, [10, 0]));
});

test('flagCornerIndex breaks a tie toward the top', () => {
  assert.equal(flagCornerIndex(DIAMOND), 0);
});

test('flagCornerIndex treats a near-tie as a tie', () => {
  assert.equal(flagCornerIndex([[5, 0], [10.1, 5], [5, 10], [0, 5]]), 0);
});

test('flagPolygon cuts equal legs along the edges', () => {
  const quad = flagPolygon(SQUARE, indexOf(SQUARE, [10, 0]));
  assert.equal(quad.length, 4);
  sameSet(quad.slice(0, 2), [[7, 0], [10, 3]]);
  // The corner lies inside the quad: on the far side of the cut from the cell's center.
  const [p, q] = quad;
  const side = ([x, y]) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  assert.ok(side([10, 0]) * side([5, 5]) < 0);
  assert.ok(side([10, 0]) * side(quad[2]) > 0);
});

test('slashLine on a square runs bottom-left to top-right', () => {
  sameSet(slashLine(SQUARE, indexOf(SQUARE, [10, 0])), [[10, 0], [0, 10]]);
});

test('slashLine on a diamond is a true diagonal', () => {
  sameSet(slashLine(DIAMOND, 0), [[5, 0], [5, 10]]);
});
