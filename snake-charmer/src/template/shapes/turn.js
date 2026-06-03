'use strict';
// Turn (C-shape) renderer.
// getTurnRenderer(ring) → { cellPath, letterCenter, labelPos }

function getTurnRenderer(ring) {
  const { nArmStraight, nArmCurve, nBodyInner, nBodyOuter, rArmCenter, rArmOuter, rArmInner,
          D, R_in, R_out, L, cx, cy } = ring;
  const H_CELL = rArmOuter - rArmInner;
  const W_CELL = nArmStraight > 0 ? L / nArmStraight : 0;

  // Section start indices
  const S1 = nArmStraight;
  const S2 = S1 + nArmCurve;
  const S3 = S2 + nArmStraight;
  const S4 = S3 + nBodyInner;
  const S5 = S4 + nArmStraight;
  const S6 = S5 + nArmCurve;
  const S7 = S6 + nArmStraight;

  // Clockwise annular sector (same sweep as stadium arm curves)
  function annularSectorCW(ccx, ccy, r1, r2, t1, t2) {
    const c1 = Math.cos(t1), s1 = Math.sin(t1);
    const c2 = Math.cos(t2), s2 = Math.sin(t2);
    return `M ${ccx+r1*c1} ${ccy+r1*s1} A ${r1} ${r1} 0 0 1 ${ccx+r1*c2} ${ccy+r1*s2} ` +
           `L ${ccx+r2*c2} ${ccy+r2*s2} A ${r2} ${r2} 0 0 0 ${ccx+r2*c1} ${ccy+r2*s1} Z`;
  }

  // Counterclockwise annular sector (for body inner arc, section 3)
  function annularSectorCCW(ccx, ccy, r1, r2, t1, t2) {
    const c1 = Math.cos(t1), s1 = Math.sin(t1);
    const c2 = Math.cos(t2), s2 = Math.sin(t2);
    return `M ${ccx+r1*c1} ${ccy+r1*s1} A ${r1} ${r1} 0 0 0 ${ccx+r1*c2} ${ccy+r1*s2} ` +
           `L ${ccx+r2*c2} ${ccy+r2*s2} A ${r2} ${r2} 0 0 1 ${ccx+r2*c1} ${ccy+r2*s1} Z`;
  }

  function cellPath(i) {
    if (i < S1) {
      // Section 0: top arm upper track, left→right
      const xl = cx + i * W_CELL;
      return `M ${xl} ${cy-D-rArmOuter} L ${xl+W_CELL} ${cy-D-rArmOuter} ` +
             `L ${xl+W_CELL} ${cy-D-rArmInner} L ${xl} ${cy-D-rArmInner} Z`;
    } else if (i < S2) {
      // Section 1: top arm right curve, CW top→bottom
      const j = i - S1;
      const t1 = -Math.PI / 2 + j * (Math.PI / nArmCurve);
      return annularSectorCW(cx + L, cy - D, rArmOuter, rArmInner, t1, t1 + Math.PI / nArmCurve);
    } else if (i < S3) {
      // Section 2: top arm lower track, right→left
      const j = i - S2;
      const xr = cx + L - j * W_CELL;
      return `M ${xr-W_CELL} ${cy-D+rArmInner} L ${xr} ${cy-D+rArmInner} ` +
             `L ${xr} ${cy-D+rArmOuter} L ${xr-W_CELL} ${cy-D+rArmOuter} Z`;
    } else if (i < S4) {
      // Section 3: body inner arc, CCW top→bottom (left side)
      const j = i - S3;
      const t1 = -Math.PI / 2 - j * (Math.PI / nBodyInner);
      return annularSectorCCW(cx, cy, R_in + H_CELL / 2, R_in - H_CELL / 2, t1, t1 - Math.PI / nBodyInner);
    } else if (i < S5) {
      // Section 4: bottom arm upper track, left→right
      const j = i - S4;
      const xl = cx + j * W_CELL;
      return `M ${xl} ${cy+D-rArmOuter} L ${xl+W_CELL} ${cy+D-rArmOuter} ` +
             `L ${xl+W_CELL} ${cy+D-rArmInner} L ${xl} ${cy+D-rArmInner} Z`;
    } else if (i < S6) {
      // Section 5: bottom arm right curve, CW top→bottom
      const j = i - S5;
      const t1 = -Math.PI / 2 + j * (Math.PI / nArmCurve);
      return annularSectorCW(cx + L, cy + D, rArmOuter, rArmInner, t1, t1 + Math.PI / nArmCurve);
    } else if (i < S7) {
      // Section 6: bottom arm lower track, right→left
      const j = i - S6;
      const xr = cx + L - j * W_CELL;
      return `M ${xr-W_CELL} ${cy+D+rArmInner} L ${xr} ${cy+D+rArmInner} ` +
             `L ${xr} ${cy+D+rArmOuter} L ${xr-W_CELL} ${cy+D+rArmOuter} Z`;
    } else {
      // Section 7: body outer arc, CW bottom→top (left side)
      const j = i - S7;
      const t1 = Math.PI / 2 + j * (Math.PI / nBodyOuter);
      return annularSectorCW(cx, cy, R_out + H_CELL / 2, R_out - H_CELL / 2, t1, t1 + Math.PI / nBodyOuter);
    }
  }

  function letterCenter(i) {
    if (i < S1) {
      return { tx: cx + (i + 0.5) * W_CELL, ty: cy - D - rArmCenter };
    } else if (i < S2) {
      const j = i - S1;
      const tMid = -Math.PI / 2 + (j + 0.5) * (Math.PI / nArmCurve);
      return { tx: (cx + L) + rArmCenter * Math.cos(tMid), ty: (cy - D) + rArmCenter * Math.sin(tMid) };
    } else if (i < S3) {
      const j = i - S2;
      return { tx: cx + L - (j + 0.5) * W_CELL, ty: cy - D + rArmCenter };
    } else if (i < S4) {
      const j = i - S3;
      const tMid = -Math.PI / 2 - (j + 0.5) * (Math.PI / nBodyInner);
      return { tx: cx + R_in * Math.cos(tMid), ty: cy + R_in * Math.sin(tMid) };
    } else if (i < S5) {
      const j = i - S4;
      return { tx: cx + (j + 0.5) * W_CELL, ty: cy + D - rArmCenter };
    } else if (i < S6) {
      const j = i - S5;
      const tMid = -Math.PI / 2 + (j + 0.5) * (Math.PI / nArmCurve);
      return { tx: (cx + L) + rArmCenter * Math.cos(tMid), ty: (cy + D) + rArmCenter * Math.sin(tMid) };
    } else if (i < S7) {
      const j = i - S6;
      return { tx: cx + L - (j + 0.5) * W_CELL, ty: cy + D + rArmCenter };
    } else {
      const j = i - S7;
      const tMid = Math.PI / 2 + (j + 0.5) * (Math.PI / nBodyOuter);
      return { tx: cx + R_out * Math.cos(tMid), ty: cy + R_out * Math.sin(tMid) };
    }
  }

  function labelPos(i) {
    if (i < S1) {
      // Top arm upper track: label near top-left of cell (outer edge = top)
      return { lx: cx + i * W_CELL + 6, ly: cy - D - rArmOuter + 8 };
    } else if (i < S2) {
      // Top arm right curve: label near start of cell on outer radius
      const j = i - S1;
      const la = (-Math.PI / 2 + j * (Math.PI / nArmCurve)) + (Math.PI / nArmCurve) * 0.2;
      return { lx: (cx + L) + (rArmOuter - 8) * Math.cos(la), ly: (cy - D) + (rArmOuter - 8) * Math.sin(la) };
    } else if (i < S3) {
      // Top arm lower track: label near right end, outer (bottom) edge
      const j = i - S2;
      return { lx: cx + L - j * W_CELL - 6, ly: cy - D + rArmOuter - 8 };
    } else if (i < S4) {
      // Body inner arc: label near start of cell, just inside outer edge
      const j = i - S3;
      const la = (-Math.PI / 2 - j * (Math.PI / nBodyInner)) - (Math.PI / nBodyInner) * 0.2;
      return { lx: cx + (R_in + H_CELL / 2 - 8) * Math.cos(la),
               ly: cy + (R_in + H_CELL / 2 - 8) * Math.sin(la) };
    } else if (i < S5) {
      // Bottom arm upper track: label near top-left of cell (outer edge = top)
      const j = i - S4;
      return { lx: cx + j * W_CELL + 6, ly: cy + D - rArmOuter + 8 };
    } else if (i < S6) {
      // Bottom arm right curve: label near start of cell on outer radius
      const j = i - S5;
      const la = (-Math.PI / 2 + j * (Math.PI / nArmCurve)) + (Math.PI / nArmCurve) * 0.2;
      return { lx: (cx + L) + (rArmOuter - 8) * Math.cos(la), ly: (cy + D) + (rArmOuter - 8) * Math.sin(la) };
    } else if (i < S7) {
      // Bottom arm lower track: label near right end, outer (bottom) edge
      const j = i - S6;
      return { lx: cx + L - j * W_CELL - 6, ly: cy + D + rArmOuter - 8 };
    } else {
      // Body outer arc: label near start of cell, just inside outer edge
      const j = i - S7;
      const la = (Math.PI / 2 + j * (Math.PI / nBodyOuter)) + (Math.PI / nBodyOuter) * 0.2;
      return { lx: cx + (R_out + H_CELL / 2 - 8) * Math.cos(la),
               ly: cy + (R_out + H_CELL / 2 - 8) * Math.sin(la) };
    }
  }

  return { cellPath, letterCenter, labelPos };
}

if (typeof module !== 'undefined') module.exports = { getTurnRenderer };
