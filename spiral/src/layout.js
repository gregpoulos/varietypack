'use strict';

const SEAM = -Math.PI / 2; // 12 o'clock

function computeCells(totalCells, { R_HOLE = 38, R_MAX = 242, N_TURNS = 4 } = {}) {
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

module.exports = { computeCells };
