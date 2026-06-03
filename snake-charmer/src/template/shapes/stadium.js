'use strict';
// Stadium/circle shape renderer.
// getStadiumRenderer(ring) → { cellPath, letterCenter, labelPos }

function getStadiumRenderer(ring) {
  const { nCurve, nStraight, L, rCenter, rOuter, rInner, cx, cy } = ring;
  const W_CELL = nStraight > 0 ? L / nStraight : 0;

  // Section start indices
  const S1 = nStraight;
  const S2 = S1 + nCurve;
  const S3 = S2 + nStraight;

  function annularSector(ccx, ccy, r1, r2, t1, t2) {
    const c1 = Math.cos(t1), s1 = Math.sin(t1);
    const c2 = Math.cos(t2), s2 = Math.sin(t2);
    return `M ${ccx+r1*c1} ${ccy+r1*s1} A ${r1} ${r1} 0 0 1 ${ccx+r1*c2} ${ccy+r1*s2} ` +
           `L ${ccx+r2*c2} ${ccy+r2*s2} A ${r2} ${r2} 0 0 0 ${ccx+r2*c1} ${ccy+r2*s1} Z`;
  }

  function cellPath(i) {
    if (i < S1) {
      const xl = (cx - L / 2) + i * W_CELL;
      const xr = xl + W_CELL;
      return `M ${xl} ${cy-rOuter} L ${xr} ${cy-rOuter} L ${xr} ${cy-rInner} L ${xl} ${cy-rInner} Z`;
    } else if (i < S2) {
      const j = i - S1;
      const t1 = -Math.PI / 2 + j * (Math.PI / nCurve);
      const t2 = -Math.PI / 2 + (j + 1) * (Math.PI / nCurve);
      return annularSector(cx + L / 2, cy, rOuter, rInner, t1, t2);
    } else if (i < S3) {
      const j = i - S2;
      const xr = (cx + L / 2) - j * W_CELL;
      const xl = xr - W_CELL;
      return `M ${xl} ${cy+rInner} L ${xr} ${cy+rInner} L ${xr} ${cy+rOuter} L ${xl} ${cy+rOuter} Z`;
    } else {
      const j = i - S3;
      const t1 = Math.PI / 2 + j * (Math.PI / nCurve);
      const t2 = Math.PI / 2 + (j + 1) * (Math.PI / nCurve);
      return annularSector(cx - L / 2, cy, rOuter, rInner, t1, t2);
    }
  }

  function letterCenter(i) {
    if (i < S1) {
      const xl = (cx - L / 2) + i * W_CELL;
      return { tx: xl + W_CELL / 2, ty: cy - rCenter };
    } else if (i < S2) {
      const j = i - S1;
      const tMid = -Math.PI / 2 + (j + 0.5) * (Math.PI / nCurve);
      return { tx: (cx + L / 2) + rCenter * Math.cos(tMid), ty: cy + rCenter * Math.sin(tMid) };
    } else if (i < S3) {
      const j = i - S2;
      const xr = (cx + L / 2) - j * W_CELL;
      return { tx: xr - W_CELL / 2, ty: cy + rCenter };
    } else {
      const j = i - S3;
      const tMid = Math.PI / 2 + (j + 0.5) * (Math.PI / nCurve);
      return { tx: (cx - L / 2) + rCenter * Math.cos(tMid), ty: cy + rCenter * Math.sin(tMid) };
    }
  }

  function labelPos(i) {
    if (i < S1) {
      const xl = (cx - L / 2) + i * W_CELL;
      return { lx: xl + 6, ly: (cy - rOuter) + 8 };
    } else if (i < S2) {
      const j = i - S1;
      const tStart = -Math.PI / 2 + j * (Math.PI / nCurve);
      const la = tStart + (Math.PI / nCurve) * 0.2;
      return { lx: (cx + L / 2) + (rOuter - 8) * Math.cos(la), ly: cy + (rOuter - 8) * Math.sin(la) };
    } else if (i < S3) {
      const j = i - S2;
      const xr = (cx + L / 2) - j * W_CELL;
      return { lx: xr - 6, ly: (cy + rOuter) - 8 };
    } else {
      const j = i - S3;
      const tStart = Math.PI / 2 + j * (Math.PI / nCurve);
      const la = tStart + (Math.PI / nCurve) * 0.2;
      return { lx: (cx - L / 2) + (rOuter - 8) * Math.cos(la), ly: cy + (rOuter - 8) * Math.sin(la) };
    }
  }

  return { cellPath, letterCenter, labelPos };
}

if (typeof module !== 'undefined') module.exports = { getStadiumRenderer };
