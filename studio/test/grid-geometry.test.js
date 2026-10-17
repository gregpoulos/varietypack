'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const g        = require('../src/ui/editors/gridGeometry');

const corners = (r, c) => {
  const { x, y } = g.cellOrigin(r, c);
  return [[x, y], [x + g.CELL, y], [x, y + g.CELL], [x + g.CELL, y + g.CELL]];
};
const sharedCorners = (a, b) => corners(a.r, a.c).filter(p => corners(b.r, b.c).some(q => q[0] === p[0] && q[1] === p[1]));
const ends = (e) => [[e.x1, e.y1], [e.x2, e.y2]];
const sameSet = (a, b) => a.length === b.length && a.every(p => b.some(q => q[0] === p[0] && q[1] === p[1]));

test('cellOrigin and cellCenter place cells on the CELL grid, after the gutter', () => {
  assert.deepEqual(g.cellOrigin(0, 0), { x: g.GUTTER, y: g.PAD });
  assert.deepEqual(g.cellOrigin(2, 3), { x: g.GUTTER + 3 * g.CELL, y: g.PAD + 2 * g.CELL });
  assert.deepEqual(g.cellCenter(0, 0), { x: g.GUTTER + g.CELL / 2, y: g.PAD + g.CELL / 2 });
});

test('boundary: for each of a cell\'s four neighbors, the endpoints are the two corners they share', () => {
  const b = { r: 3, c: 3 };
  for (const a of [{ r: 3, c: 2 }, { r: 3, c: 4 }, { r: 2, c: 3 }, { r: 4, c: 3 }]) {
    const shared = sharedCorners(a, b);
    assert.equal(shared.length, 2);
    assert.ok(sameSet(ends(g.boundary(a, b)), shared), JSON.stringify(a));
  }
});

test('boundary: for cells two columns apart it is the side of the right-hand cell that faces the left one', () => {
  const e = g.boundary({ r: 2, c: 1 }, { r: 2, c: 3 });
  const { x, y } = g.cellOrigin(2, 3);
  assert.ok(sameSet(ends(e), [[x, y], [x, y + g.CELL]]));
  const up = g.boundary({ r: 5, c: 2 }, { r: 1, c: 2 });                  // far below: b's bottom side
  const o = g.cellOrigin(1, 2);
  assert.ok(sameSet(ends(up), [[o.x, o.y + g.CELL], [o.x + g.CELL, o.y + g.CELL]]));
});

test('boundary refuses cells that share neither a row nor a column', () => {
  assert.throws(() => g.boundary({ r: 0, c: 0 }, { r: 1, c: 1 }), /one row or one column/);
});

test('svgSize holds every cell with the gutter and the padding', () => {
  const { width, height } = g.svgSize(5, 7);
  const last = g.cellOrigin(4, 6);
  assert.ok(width >= last.x + g.CELL + g.PAD);
  assert.ok(height >= last.y + g.CELL + g.PAD);
});
