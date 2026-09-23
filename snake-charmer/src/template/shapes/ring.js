'use strict';
// Shared core for the shape renderers (stadium.js, turn.js, double-turn.js).
//
// Every ring shape is a closed chain of sections in clockwise traversal order, and
// every section is one of two kinds:
//   - a straight track along one side of a horizontal arm. A 'top' track sits above
//     the arm's center line and runs left → right; a 'bottom' track sits below it and
//     runs right → left (clockwise traversal fixes the pairing).
//   - an arc of an annulus, stepping by a signed angle per cell (positive =
//     clockwise in SVG's y-down coordinates).
// A shape module only lists its sections; the cell outline, letter anchor and
// number-label anchor are computed here, so every shape positions labels the same way.
//
// A band is the radial extent a section occupies: { rOut, rIn, rc } — outer edge,
// inner edge, and the center line letters sit on. For a straight track the radii are
// vertical offsets from the arm's center line.

// Entry-number label placement, tuned by eye and shared by every shape. `.cell-num` is
// text-anchor: middle / dominant-baseline: middle (shared/base.css), so these position a
// label's *center*, not a corner. The values are not arbitrary:
//   - 8px from the outer edge, on straights and curves alike, is what makes a curved
//     label line up with the straight-section label it meets at a corner; 6px there
//     leaves the curved one visibly high.
//   - 6px in from a straight cell's leading edge (3px looked cramped).
//   - a curved label sits 0.2 of the way into the cell's angular span, which reads as
//     the same "just inside the leading edge" as the straight inset.
const LABEL_LEAD_INSET  = 6;
const LABEL_OUTER_INSET = 8;
const LABEL_ARC_FRAC    = 0.2;

// `n` straight cells of width `w` along the `side` ('top' | 'bottom') of the arm whose
// center line is `y`. `xStart` is the leading edge of the first cell: its left edge on
// a top track, its right edge on a bottom track.
function trackSection(n, xStart, y, side, band, w) {
  return { kind: 'track', n, xStart, y, side, band, w };
}

// `n` curved cells around (ccx, ccy), the first starting at angle `tStart` and each
// spanning `step` radians.
function arcSection(n, ccx, ccy, band, tStart, step) {
  return { kind: 'arc', n, ccx, ccy, band, tStart, step };
}

function trackCell({ xStart, y, side, band, w }, j) {
  const top = side === 'top';
  const dir = top ? 1 : -1;
  const xLead  = xStart + dir * j * w;
  const xTrail = xStart + dir * (j + 1) * w;
  // Outer edge is above the center line on a top track, below it on a bottom track.
  const yOut = top ? y - band.rOut : y + band.rOut;
  const yIn  = top ? y - band.rIn  : y + band.rIn;
  const [xl, xr]  = top ? [xLead, xTrail] : [xTrail, xLead];
  const [yT, yB]  = top ? [yOut, yIn]     : [yIn, yOut];
  return {
    path:   `M ${xl} ${yT} L ${xr} ${yT} L ${xr} ${yB} L ${xl} ${yB} Z`,
    letter: { tx: xStart + dir * (j + 0.5) * w, ty: top ? y - band.rc : y + band.rc },
    label:  { lx: xLead + dir * LABEL_LEAD_INSET, ly: top ? yOut + LABEL_OUTER_INSET : yOut - LABEL_OUTER_INSET },
  };
}

function arcCell({ ccx, ccy, band, tStart, step }, j) {
  const { rOut, rIn, rc } = band;
  const t1 = tStart + j * step;
  const t2 = tStart + (j + 1) * step;
  const c1 = Math.cos(t1), s1 = Math.sin(t1);
  const c2 = Math.cos(t2), s2 = Math.sin(t2);
  // The outer arc sweeps in the direction of travel, the inner arc back against it.
  const fOut = step > 0 ? 1 : 0;
  const fIn  = 1 - fOut;
  const tMid = tStart + (j + 0.5) * step;
  const la   = t1 + LABEL_ARC_FRAC * step;
  const rl   = rOut - LABEL_OUTER_INSET;
  return {
    path: `M ${ccx+rOut*c1} ${ccy+rOut*s1} A ${rOut} ${rOut} 0 0 ${fOut} ${ccx+rOut*c2} ${ccy+rOut*s2} ` +
          `L ${ccx+rIn*c2} ${ccy+rIn*s2} A ${rIn} ${rIn} 0 0 ${fIn} ${ccx+rIn*c1} ${ccy+rIn*s1} Z`,
    letter: { tx: ccx + rc * Math.cos(tMid), ty: ccy + rc * Math.sin(tMid) },
    label:  { lx: ccx + rl * Math.cos(la),   ly: ccy + rl * Math.sin(la) },
  };
}

// sections → { cellPath, letterCenter, labelPos, sectionOf }, each indexed by ring
// position. Sections with n = 0 (e.g. a circle's straight tracks) contribute no cells.
function makeRingRenderer(sections) {
  const cells = [];
  const sectionIdx = [];
  sections.forEach((s, k) => {
    for (let j = 0; j < s.n; j++) {
      cells.push(s.kind === 'track' ? trackCell(s, j) : arcCell(s, j));
      sectionIdx.push(k);
    }
  });
  function at(i) {
    const cell = cells[i];
    if (!cell) throw new RangeError(`ring position ${i} is outside 0..${cells.length - 1}`);
    return cell;
  }
  return {
    cellPath:     i => at(i).path,
    letterCenter: i => at(i).letter,
    labelPos:     i => at(i).label,
    sectionOf:    i => (at(i), sectionIdx[i]),
  };
}

if (typeof module !== 'undefined') module.exports = { makeRingRenderer, trackSection, arcSection };
