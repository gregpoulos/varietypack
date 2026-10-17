// The spiral's geometry: layout constants, cell placement and the drawing helpers, plus
// which cells each entry covers (cellsOfEntries). Shared by the builder, the browser
// engine (which imports it) and the studio's board, so none of them can draw the spiral
// differently.

const SEAM = -Math.PI / 2; // 12 o'clock

// R_HOLE: smaller center hole leaves more room for cells; R_MAX: larger outer radius
// keeps cells from crowding at high cell counts (122-cell puzzles were visibly tight at
// R_MAX:242).
const LAYOUT_BASE = { R_HOLE: 25, R_MAX: 265 };

function nTurnsFor(totalCells) {
  // Math.round, not ceil — ceil(122/20)=7 gives visibly cramped cells; round gives 6.
  return Math.max(3, Math.round(totalCells / 20));
}

// The geometry a spiral of totalCells gets: LAYOUT_BASE's radii and nTurnsFor's turn
// count. The one recipe the builder (for PUZZLE_DATA.geometry) and the studio's board
// both use.
function geometryFor(totalCells) {
  return { ...LAYOUT_BASE, N_TURNS: nTurnsFor(totalCells) };
}

function computeCells(totalCells, geometry = geometryFor(totalCells)) {
  const { R_HOLE, R_MAX, N_TURNS } = geometry;
  if (!Number.isInteger(totalCells) || totalCells < 1) {
    throw new Error(`totalCells must be a positive integer, got ${totalCells}`);
  }

  const TOTAL_ANGLE = 2 * Math.PI * N_TURNS;
  const BAND        = (R_MAX - R_HOLE) / (N_TURNS + 1);
  const R_CEN_MAX   = R_MAX  - BAND / 2;
  const R_CEN_MIN   = R_HOLE + BAND / 2;
  const k           = (R_CEN_MAX - R_CEN_MIN) / TOTAL_ANGLE;

  const R_CEN_AVG  = (R_CEN_MAX + R_CEN_MIN) / 2;
  const TARGET_ARC = (R_CEN_AVG * TOTAL_ANGLE) / totalCells;

  const cells = [];
  let acc = 0;

  for (let i = 0; i < totalCells; i++) {
    const r_cen_s = R_CEN_MAX - k * acc;
    const dtheta  = TARGET_ARC / r_cen_s;
    const acc_e   = acc + dtheta;
    const r_cen_e = R_CEN_MAX - k * acc_e;

    cells.push({
      cell_number:    i + 1,
      theta_start:    SEAM + acc,
      theta_end:      SEAM + acc_e,
      r_inner_start:  r_cen_s - BAND / 2,
      r_outer_start:  r_cen_s + BAND / 2,
      r_inner_end:    r_cen_e - BAND / 2,
      r_outer_end:    r_cen_e + BAND / 2,
    });

    acc = acc_e;
  }

  return cells;
}

// ── Drawing helpers ──────────────────────────────────────────────────────────
// Each takes a cell as computeCells returns it (or the geometry object, for sizesFor).

function polar(r, a) { return [r * Math.cos(a), r * Math.sin(a)]; }
function fmt3(n) { return n.toFixed(3); }

function cellPath(cell) {
  const { theta_start: ts, theta_end: te,
          r_inner_start: ris, r_outer_start: ros,
          r_inner_end:   rie, r_outer_end:   roe } = cell;
  const laf       = (te - ts > Math.PI) ? 1 : 0;
  const r_out_arc = (ros + roe) / 2;
  const r_in_arc  = (ris + rie) / 2;
  const [ax, ay] = polar(ris, ts);
  const [bx, by] = polar(ros, ts);
  const [cx, cy] = polar(roe, te);
  const [dx, dy] = polar(rie, te);
  return `M${fmt3(ax)},${fmt3(ay)} L${fmt3(bx)},${fmt3(by)} ` +
         `A${fmt3(r_out_arc)},${fmt3(r_out_arc)} 0 ${laf},1 ${fmt3(cx)},${fmt3(cy)} ` +
         `L${fmt3(dx)},${fmt3(dy)} ` +
         `A${fmt3(r_in_arc)},${fmt3(r_in_arc)} 0 ${laf},0 ${fmt3(ax)},${fmt3(ay)}Z`;
}

// Letter position: biased slightly toward the inner edge (intentional for legibility).
function letterCenter(cell) {
  const a_mid = (cell.theta_start + cell.theta_end) / 2;
  const r_mid = 0.55 * cell.r_inner_start + 0.45 * cell.r_outer_start;
  return polar(r_mid, a_mid);
}

// Circle position: the geometric midpoint of the cell shape, matching cellPath's arc
// radii.
function circleCenter(cell) {
  const a_mid = (cell.theta_start + cell.theta_end) / 2;
  const r_out = (cell.r_outer_start + cell.r_outer_end) / 2;
  const r_in  = (cell.r_inner_start + cell.r_inner_end) / 2;
  return polar((r_out + r_in) / 2, a_mid);
}

// Cell-number label position.
function numberPosition(cell) {
  const r_num = 0.78 * cell.r_outer_start + 0.22 * cell.r_inner_start;
  const a_num = cell.theta_start + 0.18 * (cell.theta_end - cell.theta_start);
  return polar(r_num, a_num);
}

function sizesFor({ R_HOLE, R_MAX, N_TURNS }) {
  return {
    band:         (R_MAX - R_HOLE) / (N_TURNS + 1),
    numSize:      (R_MAX - R_HOLE) / (N_TURNS * 6.5),
    letterSize:   (R_MAX - R_HOLE) / (N_TURNS * 3.2),
    circleRadius: (R_MAX - R_HOLE) / (N_TURNS + 1) / 2,
  };
}

// The center curl: winds inward from the last cell's inner edge, tapering to a point.
function curlPath(lastCell) {
  const curlStartR     = lastCell.r_inner_end;
  const curlStartTheta = lastCell.theta_end;
  const curlSteps      = 300;
  const curlAngle      = 1.75 * 2 * Math.PI;
  let curlD = '';
  for (let i = 0; i <= curlSteps; i++) {
    const t = i / curlSteps;
    const [x, y] = polar(curlStartR * (1 - t * 0.97), curlStartTheta + t * curlAngle);
    curlD += `${i === 0 ? 'M' : 'L'}${fmt3(x)},${fmt3(y)} `;
  }
  return curlD;
}

// The points across a cell's end edge (where the next cell starts): where the studio
// draws splits. The engine doesn't use it.
// The cell numbers each entry covers, in reading order: `lengths` are the entries' cell
// counts, numbered from `firstCell` by `step`. The inward entries count up from cell 1;
// the outward entries count down from the last cell, so the two directions index the
// same cells.
function cellsOfEntries(lengths, firstCell, step) {
  let cell = firstCell;
  return lengths.map(length => Array.from({ length }, () => { const n = cell; cell += step; return n; }));
}

function boundaryPoints(cell) {
  return {
    inner: polar(cell.r_inner_end, cell.theta_end),
    mid:   polar((cell.r_inner_end + cell.r_outer_end) / 2, cell.theta_end),
    outer: polar(cell.r_outer_end, cell.theta_end),
  };
}

export {
  LAYOUT_BASE, nTurnsFor, geometryFor, computeCells,
  polar, cellPath, letterCenter, circleCenter, numberPosition, sizesFor, curlPath, boundaryPoints,
  cellsOfEntries,
};
