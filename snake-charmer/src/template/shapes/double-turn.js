'use strict';
// Double-turn (S-curve) renderer.
// getDoubleTurnRenderer(ring) → { cellPath, letterCenter, labelPos }

function getDoubleTurnRenderer(ring) {
  const { nArmStraight, nMidStraight, nArmCurve, nBodyInner, nBodyOuter,
          rArmCenter, rArmOuter, rArmInner, R_in, R_out, D, L, Lm,
          cx_L, cx_R, cy, cy_L, cy_R, cy_top, cy_bot } = ring;
  const H_CELL = rArmOuter - rArmInner;
  const W_CELL = nArmStraight > 0 ? L / nArmStraight
               : nMidStraight > 0 ? Lm / nMidStraight
               : 36;

  // Section start indices
  const S1  = nArmStraight;
  const S2  = S1 + nArmCurve;
  const S3  = S2 + nArmStraight;
  const S4  = S3 + nBodyInner;
  const S5  = S4 + nMidStraight;
  const S6  = S5 + nBodyOuter;
  const S7  = S6 + nArmStraight;
  const S8  = S7 + nArmCurve;
  const S9  = S8 + nArmStraight;
  const S10 = S9 + nBodyInner;
  const S11 = S10 + nMidStraight;

  function annularSectorCW(ccx, ccy, r1, r2, t1, t2) {
    const c1 = Math.cos(t1), s1 = Math.sin(t1);
    const c2 = Math.cos(t2), s2 = Math.sin(t2);
    return `M ${ccx+r1*c1} ${ccy+r1*s1} A ${r1} ${r1} 0 0 1 ${ccx+r1*c2} ${ccy+r1*s2} ` +
           `L ${ccx+r2*c2} ${ccy+r2*s2} A ${r2} ${r2} 0 0 0 ${ccx+r2*c1} ${ccy+r2*s1} Z`;
  }

  function annularSectorCCW(ccx, ccy, r1, r2, t1, t2) {
    const c1 = Math.cos(t1), s1 = Math.sin(t1);
    const c2 = Math.cos(t2), s2 = Math.sin(t2);
    return `M ${ccx+r1*c1} ${ccy+r1*s1} A ${r1} ${r1} 0 0 0 ${ccx+r1*c2} ${ccy+r1*s2} ` +
           `L ${ccx+r2*c2} ${ccy+r2*s2} A ${r2} ${r2} 0 0 1 ${ccx+r2*c1} ${ccy+r2*s1} Z`;
  }

  function cellPath(i) {
    if (i < S1) {
      // Section 0: top arm upper track, left→right
      return `M ${cx_L+i*W_CELL} ${cy_top-rArmOuter} L ${cx_L+(i+1)*W_CELL} ${cy_top-rArmOuter} ` +
             `L ${cx_L+(i+1)*W_CELL} ${cy_top-rArmInner} L ${cx_L+i*W_CELL} ${cy_top-rArmInner} Z`;
    } else if (i < S2) {
      // Section 1: top arm right curve, CW top→bottom
      const j = i - S1;
      const t1 = -Math.PI / 2 + j * (Math.PI / nArmCurve);
      return annularSectorCW(cx_L + L, cy_top, rArmOuter, rArmInner, t1, t1 + Math.PI / nArmCurve);
    } else if (i < S3) {
      // Section 2: top arm lower track, right→left
      const j = i - S2;
      return `M ${cx_L+L-(j+1)*W_CELL} ${cy_top+rArmInner} L ${cx_L+L-j*W_CELL} ${cy_top+rArmInner} ` +
             `L ${cx_L+L-j*W_CELL} ${cy_top+rArmOuter} L ${cx_L+L-(j+1)*W_CELL} ${cy_top+rArmOuter} Z`;
    } else if (i < S4) {
      // Section 3: left body inside arc, CCW top→bottom
      const j = i - S3;
      const t1 = -Math.PI / 2 - j * (Math.PI / nBodyInner);
      return annularSectorCCW(cx_L, cy_L, R_in + H_CELL / 2, R_in - H_CELL / 2, t1, t1 - Math.PI / nBodyInner);
    } else if (i < S5) {
      // Section 4: middle arm upper track, left→right
      const j = i - S4;
      return `M ${cx_L+j*W_CELL} ${cy-rArmOuter} L ${cx_L+(j+1)*W_CELL} ${cy-rArmOuter} ` +
             `L ${cx_L+(j+1)*W_CELL} ${cy-rArmInner} L ${cx_L+j*W_CELL} ${cy-rArmInner} Z`;
    } else if (i < S6) {
      // Section 5: right body outside arc, CW top→bottom
      const j = i - S5;
      const t1 = -Math.PI / 2 + j * (Math.PI / nBodyOuter);
      return annularSectorCW(cx_R, cy_R, R_out + H_CELL / 2, R_out - H_CELL / 2, t1, t1 + Math.PI / nBodyOuter);
    } else if (i < S7) {
      // Section 6: bottom arm lower track, right→left
      const j = i - S6;
      return `M ${cx_R-(j+1)*W_CELL} ${cy_bot+rArmInner} L ${cx_R-j*W_CELL} ${cy_bot+rArmInner} ` +
             `L ${cx_R-j*W_CELL} ${cy_bot+rArmOuter} L ${cx_R-(j+1)*W_CELL} ${cy_bot+rArmOuter} Z`;
    } else if (i < S8) {
      // Section 7: bottom arm left curve, CW bottom→top
      const j = i - S7;
      const t1 = Math.PI / 2 + j * (Math.PI / nArmCurve);
      return annularSectorCW(cx_R - L, cy_bot, rArmOuter, rArmInner, t1, t1 + Math.PI / nArmCurve);
    } else if (i < S9) {
      // Section 8: bottom arm upper track, left→right
      const j = i - S8;
      return `M ${cx_R-L+j*W_CELL} ${cy_bot-rArmOuter} L ${cx_R-L+(j+1)*W_CELL} ${cy_bot-rArmOuter} ` +
             `L ${cx_R-L+(j+1)*W_CELL} ${cy_bot-rArmInner} L ${cx_R-L+j*W_CELL} ${cy_bot-rArmInner} Z`;
    } else if (i < S10) {
      // Section 9: right body inside arc, CCW bottom→top
      const j = i - S9;
      const t1 = Math.PI / 2 - j * (Math.PI / nBodyInner);
      return annularSectorCCW(cx_R, cy_R, R_in + H_CELL / 2, R_in - H_CELL / 2, t1, t1 - Math.PI / nBodyInner);
    } else if (i < S11) {
      // Section 10: middle arm lower track, right→left
      const j = i - S10;
      return `M ${cx_R-(j+1)*W_CELL} ${cy+rArmInner} L ${cx_R-j*W_CELL} ${cy+rArmInner} ` +
             `L ${cx_R-j*W_CELL} ${cy+rArmOuter} L ${cx_R-(j+1)*W_CELL} ${cy+rArmOuter} Z`;
    } else {
      // Section 11: left body outside arc, CW bottom→top
      const j = i - S11;
      const t1 = Math.PI / 2 + j * (Math.PI / nBodyOuter);
      return annularSectorCW(cx_L, cy_L, R_out + H_CELL / 2, R_out - H_CELL / 2, t1, t1 + Math.PI / nBodyOuter);
    }
  }

  function letterCenter(i) {
    if (i < S1) {
      return { tx: cx_L + (i + 0.5) * W_CELL, ty: cy_top - rArmCenter };
    } else if (i < S2) {
      const j = i - S1;
      const t = -Math.PI / 2 + (j + 0.5) * (Math.PI / nArmCurve);
      return { tx: (cx_L + L) + rArmCenter * Math.cos(t), ty: cy_top + rArmCenter * Math.sin(t) };
    } else if (i < S3) {
      const j = i - S2;
      return { tx: cx_L + L - (j + 0.5) * W_CELL, ty: cy_top + rArmCenter };
    } else if (i < S4) {
      const j = i - S3;
      const t = -Math.PI / 2 - (j + 0.5) * (Math.PI / nBodyInner);
      return { tx: cx_L + R_in * Math.cos(t), ty: cy_L + R_in * Math.sin(t) };
    } else if (i < S5) {
      const j = i - S4;
      return { tx: cx_L + (j + 0.5) * W_CELL, ty: cy - rArmCenter };
    } else if (i < S6) {
      const j = i - S5;
      const t = -Math.PI / 2 + (j + 0.5) * (Math.PI / nBodyOuter);
      return { tx: cx_R + R_out * Math.cos(t), ty: cy_R + R_out * Math.sin(t) };
    } else if (i < S7) {
      const j = i - S6;
      return { tx: cx_R - (j + 0.5) * W_CELL, ty: cy_bot + rArmCenter };
    } else if (i < S8) {
      const j = i - S7;
      const t = Math.PI / 2 + (j + 0.5) * (Math.PI / nArmCurve);
      return { tx: (cx_R - L) + rArmCenter * Math.cos(t), ty: cy_bot + rArmCenter * Math.sin(t) };
    } else if (i < S9) {
      const j = i - S8;
      return { tx: cx_R - L + (j + 0.5) * W_CELL, ty: cy_bot - rArmCenter };
    } else if (i < S10) {
      const j = i - S9;
      const t = Math.PI / 2 - (j + 0.5) * (Math.PI / nBodyInner);
      return { tx: cx_R + R_in * Math.cos(t), ty: cy_R + R_in * Math.sin(t) };
    } else if (i < S11) {
      const j = i - S10;
      return { tx: cx_R - (j + 0.5) * W_CELL, ty: cy + rArmCenter };
    } else {
      const j = i - S11;
      const t = Math.PI / 2 + (j + 0.5) * (Math.PI / nBodyOuter);
      return { tx: cx_L + R_out * Math.cos(t), ty: cy_L + R_out * Math.sin(t) };
    }
  }

  function labelPos(i) {
    if (i < S1) {
      return { lx: cx_L + i * W_CELL + 6, ly: cy_top - rArmOuter + 8 };
    } else if (i < S2) {
      const j = i - S1;
      const step = Math.PI / nArmCurve;
      const la = -Math.PI / 2 + j * step + 0.2 * step;
      return { lx: (cx_L + L) + (rArmOuter - 8) * Math.cos(la),
               ly: cy_top + (rArmOuter - 8) * Math.sin(la) };
    } else if (i < S3) {
      const j = i - S2;
      return { lx: cx_L + L - j * W_CELL - 6, ly: cy_top + rArmOuter - 8 };
    } else if (i < S4) {
      const j = i - S3;
      const step = Math.PI / nBodyInner;
      const la = -Math.PI / 2 - j * step - 0.2 * step;
      return { lx: cx_L + (R_in + H_CELL / 2 - 8) * Math.cos(la),
               ly: cy_L + (R_in + H_CELL / 2 - 8) * Math.sin(la) };
    } else if (i < S5) {
      const j = i - S4;
      return { lx: cx_L + j * W_CELL + 6, ly: cy - rArmOuter + 8 };
    } else if (i < S6) {
      const j = i - S5;
      const step = Math.PI / nBodyOuter;
      const la = -Math.PI / 2 + j * step + 0.2 * step;
      return { lx: cx_R + (R_out + H_CELL / 2 - 8) * Math.cos(la),
               ly: cy_R + (R_out + H_CELL / 2 - 8) * Math.sin(la) };
    } else if (i < S7) {
      const j = i - S6;
      return { lx: cx_R - j * W_CELL - 6, ly: cy_bot + rArmOuter - 8 };
    } else if (i < S8) {
      const j = i - S7;
      const step = Math.PI / nArmCurve;
      const la = Math.PI / 2 + j * step + 0.2 * step;
      return { lx: (cx_R - L) + (rArmOuter - 8) * Math.cos(la),
               ly: cy_bot + (rArmOuter - 8) * Math.sin(la) };
    } else if (i < S9) {
      const j = i - S8;
      return { lx: cx_R - L + j * W_CELL + 6, ly: cy_bot - rArmOuter + 8 };
    } else if (i < S10) {
      const j = i - S9;
      const step = Math.PI / nBodyInner;
      const la = Math.PI / 2 - j * step - 0.2 * step;
      return { lx: cx_R + (R_in + H_CELL / 2 - 8) * Math.cos(la),
               ly: cy_R + (R_in + H_CELL / 2 - 8) * Math.sin(la) };
    } else if (i < S11) {
      const j = i - S10;
      return { lx: cx_R - j * W_CELL - 6, ly: cy + rArmOuter - 8 };
    } else {
      const j = i - S11;
      const step = Math.PI / nBodyOuter;
      const la = Math.PI / 2 + j * step + 0.2 * step;
      return { lx: cx_L + (R_out + H_CELL / 2 - 8) * Math.cos(la),
               ly: cy_L + (R_out + H_CELL / 2 - 8) * Math.sin(la) };
    }
  }

  return { cellPath, letterCenter, labelPos };
}

if (typeof module !== 'undefined') module.exports = { getDoubleTurnRenderer };
