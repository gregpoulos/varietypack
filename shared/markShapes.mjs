// The geometry of the shapes drawn on marked cells: the flag on a revealed cell and the
// slash on a wrong one (setupMarkLayer, shared/engine-chrome.mjs, draws them). Pure
// functions of a cell's corners, so every tool's cells, square or curved, take the same
// code. Each shape is clipped to the cell's own outline when drawn, so it only has to
// cover the right part of the cell; the clip supplies the true (possibly curved) edges.
//
// Points are [x, y] in the SVG's user units, y down.

// How close two corners' scores may be, as a fraction of the cell's size, and still count
// as tied. Relative, because each tool's viewBox scales its cells differently.
const CORNER_TIE_FRAC = 0.02;

// The corners of a cell drawn as a <path>: the endpoint of each M, L and A command, in
// order, without a closing point that repeats the first. Every cell outline the tools
// generate is absolute M/L/A/Z (Spiral's layout.mjs cellPath, Snake Charmer's shapes/);
// any other command throws, so a new outline fails loudly instead of misplacing a flag.
function pathCorners(d) {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  const corners = [];
  let i = 0;
  const num = () => {
    const v = Number(tokens[i++]);
    if (!Number.isFinite(v)) throw new Error(`pathCorners: expected a number in "${d}"`);
    return v;
  };
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'Z') continue;
    if (cmd === 'M' || cmd === 'L') corners.push([num(), num()]);
    else if (cmd === 'A') {
      i += 5; // rx ry rotation large-arc sweep
      corners.push([num(), num()]);
    } else throw new Error(`pathCorners: unsupported command "${cmd}" in "${d}"`);
  }
  const [first, last] = [corners[0], corners[corners.length - 1]];
  if (corners.length > 1 && first[0] === last[0] && first[1] === last[1]) corners.pop();
  return corners;
}

// The corners of a cell drawn as a <rect>, clockwise from top-left.
function rectCorners(x, y, w, h) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

// The cell's size: its longest corner-to-corner distance.
function sizeOf(corners) {
  let size = 0;
  for (const a of corners) for (const b of corners) size = Math.max(size, Math.hypot(a[0] - b[0], a[1] - b[1]));
  return size;
}

// The flag's corner: the one nearest the screen's top-right, whatever the cell's angle,
// i.e. the one maximizing x − y. Corners within CORNER_TIE_FRAC of the best score tie,
// and a tie goes to the topmost, then the rightmost, so a cell pointing up-right doesn't
// flip between two corners on a rounding difference.
function flagCornerIndex(corners) {
  const score = ([x, y]) => x - y;
  const best = Math.max(...corners.map(score));
  const tie = CORNER_TIE_FRAC * sizeOf(corners);
  let pick = -1;
  corners.forEach((c, i) => {
    if (score(c) < best - tie) return;
    const p = corners[pick];
    if (pick === -1 || c[1] < p[1] || (c[1] === p[1] && c[0] > p[0])) pick = i;
  });
  return pick;
}

// The flag on corner i: the cell's corner region beyond a straight cut. P and Q lie
// `frac` of the way from the corner along each adjacent chord (to corners i−1 and i+1,
// wrapping), measured on the shorter chord so both legs are equal. The result is the quad
// [P, Q, Q + M·n, P + M·n], with n the unit normal of PQ toward the corner and M the
// cell's size; clipped to the cell it is exactly the region bounded by the cell's true
// edges and the cut. A triangle on the chords would leave a sliver along a convex arc,
// which bulges past its chord.
function flagPolygon(corners, i, frac = 0.3) {
  const len = corners.length;
  const c = corners[i];
  const a = corners[(i - 1 + len) % len];
  const b = corners[(i + 1) % len];
  const dist = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
  const leg = frac * Math.min(dist(a, c), dist(b, c));
  const toward = (u) => {
    const l = dist(u, c);
    return [c[0] + (u[0] - c[0]) * leg / l, c[1] + (u[1] - c[1]) * leg / l];
  };
  const p = toward(a);
  const q = toward(b);
  let n = [-(q[1] - p[1]), q[0] - p[0]];
  const nl = Math.hypot(n[0], n[1]);
  n = [n[0] / nl, n[1] / nl];
  if (n[0] * (c[0] - p[0]) + n[1] * (c[1] - p[1]) < 0) n = [-n[0], -n[1]];
  const m = sizeOf(corners);
  const out = ([x, y]) => [x + n[0] * m, y + n[1] * m];
  return [p, q, out(q), out(p)];
}

// The slash: from the flag's corner i to the corner farthest from it (bottom-left to
// top-right on a square). Joining the corners with the smallest and largest x − y instead
// can pick two adjacent corners on a cell near 45°, and the slash would then lie along an
// edge and be clipped away.
function slashLine(corners, i) {
  const c = corners[i];
  let far = c;
  for (const p of corners) {
    if (Math.hypot(p[0] - c[0], p[1] - c[1]) > Math.hypot(far[0] - c[0], far[1] - c[1])) far = p;
  }
  return [c, far];
}

export { pathCorners, rectCorners, flagCornerIndex, flagPolygon, slashLine };
