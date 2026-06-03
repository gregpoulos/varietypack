'use strict';
const fs   = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// Strip CommonJS module system from a layout module and wrap in an IIFE so each
// module's top-level constants (W_CELL, H_CELL, SVG_PAD_H, SVG_PAD_V) don't collide.
// The IIFE returns computeRing and the result is assigned to exportedName.
function inlineLayout(filePath, exportedName) {
  const code = fs.readFileSync(filePath, 'utf8');
  const stripped = code
    .split('\n')
    .filter(line =>
      !line.match(/^\s*['"]use strict['"]/) &&
      !line.match(/^\s*const\s*\{[^}]*\}\s*=\s*require\(/) &&
      !line.match(/^\s*module\.exports\s*=/)
    )
    .join('\n');
  return `const ${exportedName} = (() => {\n${stripped}\nreturn computeRing;\n})();`;
}

// Strip CommonJS guard from a renderer module (the `if (typeof module …)` line is harmless
// in-browser but cleaner removed; 'use strict' is fine either way so we keep it).
function inlineRenderer(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  return code
    .split('\n')
    .filter(line => !line.match(/^\s*if\s*\(typeof\s+module/))
    .join('\n');
}

const layoutStadium    = inlineLayout(path.join(root, 'src/layoutStadium.js'),    'computeStadiumRing');
const layoutTurn       = inlineLayout(path.join(root, 'src/layoutTurn.js'),       'computeTurnRing');
const layoutDoubleTurn = inlineLayout(path.join(root, 'src/layoutDoubleTurn.js'), 'computeDoubleTurnRing');
const rendererStadium  = inlineRenderer(path.join(root, 'src/template/shapes/stadium.js'));
const rendererTurn     = inlineRenderer(path.join(root, 'src/template/shapes/turn.js'));
const rendererDT       = inlineRenderer(path.join(root, 'src/template/shapes/double-turn.js'));

const CELL_COLORS = ['#dbeafe', '#dcfce7', '#fef9c3', '#fce7f3', '#ede9fe', '#ffedd5', '#e0f2fe', '#d1fae5'];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Ring Preview</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font: 14px/1.4 system-ui, sans-serif; background: #f8f8f8; color: #222; }

#controls {
  position: sticky; top: 0; z-index: 10;
  background: #fff; border-bottom: 1px solid #ddd;
  padding: 12px 20px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
}

.shape-btn {
  padding: 4px 12px; border: 1px solid #bbb; border-radius: 4px;
  background: #f5f5f5; cursor: pointer; font: inherit;
}
.shape-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }

#n-row { display: flex; align-items: center; gap: 10px; }
#n-slider { width: 260px; }
#n-display { font-size: 18px; font-weight: 600; min-width: 2.5ch; display: inline-block; }

#info { font-size: 12px; color: #666; }
#info.error { color: #dc2626; font-weight: 600; }

#svg-wrap {
  padding: 20px; overflow: auto;
  display: flex; justify-content: center;
}
svg { display: block; }

.ring-and-clues { display: flex; flex-direction: row-reverse; gap: 32px; align-items: flex-start; }

.clues-placeholder {
  flex: 1; min-width: 200px; min-height: 80px;
  background: #e0e0e0; border: 1px solid #bbb; border-radius: 3px;
  display: flex; align-items: center; justify-content: center;
  color: #aaa; font-size: 13px; font-style: italic;
}

.cell { stroke: #666; stroke-width: 0.5; }
.cell-idx {
  font: bold 8px system-ui, sans-serif;
  fill: #333; text-anchor: middle; dominant-baseline: middle;
  pointer-events: none;
}
</style>
</head>
<body>

<div id="controls">
  <div id="shape-buttons">
    <button class="shape-btn active" data-shape="stadium">Stadium</button>
    <button class="shape-btn" data-shape="circle">Circle</button>
    <button class="shape-btn" data-shape="turn">Turn</button>
    <button class="shape-btn" data-shape="double-turn">Double-turn</button>
  </div>
  <div id="n-row">
    <span>N&nbsp;=&nbsp;<span id="n-display">48</span></span>
    <input type="range" id="n-slider" min="8" max="200" value="48" step="2">
  </div>
  <span id="info"></span>
</div>

<div id="svg-wrap"></div>

<script>
// ── inlined layout modules ────────────────────────────────────────────────────
${layoutStadium}
${layoutTurn}
${layoutDoubleTurn}

// ── inlined renderer modules ──────────────────────────────────────────────────
${rendererStadium}
${rendererTurn}
${rendererDT}

// ── dispatch ──────────────────────────────────────────────────────────────────
function computeRing(shape, N) {
  if (shape === 'turn')        return computeTurnRing(N);
  if (shape === 'double-turn') return computeDoubleTurnRing(N);
  return computeStadiumRing(N, shape);
}

function getRenderer(shape, ring) {
  if (shape === 'turn')        return getTurnRenderer(ring);
  if (shape === 'double-turn') return getDoubleTurnRenderer(ring);
  return getStadiumRenderer(ring);
}

// Section colouring: derive from ring geometry for each shape so section
// boundaries are immediately visible.
function sectionOf(shape, ring, i) {
  if (shape === 'stadium' || shape === 'circle') {
    const { nStraight, nCurve } = ring;
    if (i < nStraight)                      return 0;
    if (i < nStraight + nCurve)             return 1;
    if (i < 2 * nStraight + nCurve)        return 2;
    return 3;
  }
  if (shape === 'turn') {
    const { nArmStraight: ns, nArmCurve: nc, nBodyInner, nBodyOuter } = ring;
    const S = [ns, ns+nc, 2*ns+nc, 2*ns+nc+nBodyInner,
               3*ns+nc+nBodyInner, 3*ns+2*nc+nBodyInner,
               4*ns+2*nc+nBodyInner];
    for (let s = 0; s < S.length; s++) if (i < S[s]) return s;
    return 7;
  }
  if (shape === 'double-turn') {
    const { nArmStraight: na, nMidStraight: nm, nArmCurve: nc, nBodyInner, nBodyOuter } = ring;
    const S = [na, na+nc, 2*na+nc, 2*na+nc+nBodyInner,
               2*na+nc+nBodyInner+nm, 2*na+nc+nBodyInner+nm+nBodyOuter,
               3*na+nc+nBodyInner+nm+nBodyOuter,
               3*na+2*nc+nBodyInner+nm+nBodyOuter,
               4*na+2*nc+nBodyInner+nm+nBodyOuter,
               4*na+2*nc+nBodyInner+2*nm+nBodyOuter+nBodyInner,
               4*na+2*nc+2*nBodyInner+2*nm+nBodyOuter];
    for (let s = 0; s < S.length; s++) if (i < S[s]) return s;
    return 11;
  }
  return 0;
}

const COLORS = ${JSON.stringify(CELL_COLORS)};

// ── rendering ─────────────────────────────────────────────────────────────────
function render(shape, N) {
  const info  = document.getElementById('info');
  const wrap  = document.getElementById('svg-wrap');

  let ring, renderer;
  try {
    ring     = computeRing(shape, N);
    renderer = getRenderer(shape, ring);
  } catch (e) {
    info.textContent = e.message;
    info.className   = 'error';
    wrap.innerHTML   = '';
    return;
  }

  const constraint = shapeConstraint(shape);
  info.textContent = constraint;
  info.className   = '';

  const { cellPath, letterCenter } = renderer;
  const { svgWidth, svgHeight }    = ring;

  const cells = Array.from({ length: N }, (_, i) => {
    const fill = COLORS[sectionOf(shape, ring, i) % COLORS.length];
    const d    = cellPath(i);
    const { tx, ty } = letterCenter(i);
    return \`<path class="cell" d="\${d}" fill="\${fill}"/>
<text class="cell-idx" x="\${tx.toFixed(1)}" y="\${ty.toFixed(1)}">\${i}</text>\`;
  }).join('\\n');

  const svgW = svgWidth.toFixed(1);
  const svgH = svgHeight.toFixed(1);
  wrap.innerHTML = \`<div class="ring-and-clues">
<svg xmlns="http://www.w3.org/2000/svg"
    width="\${svgW}" height="\${svgH}"
    viewBox="0 0 \${svgW} \${svgH}">\${cells}</svg>
<div class="clues-placeholder" style="height:\${svgH}px">clues</div>
</div>\`;
}

// ── slider step / constraint hints ────────────────────────────────────────────
function shapeStep(shape) {
  return shape === 'turn' ? 4 : 2;
}

function shapeConstraint(shape) {
  if (shape === 'turn')        return 'N must be divisible by 4';
  if (shape === 'double-turn') return 'N must be even (minimum 22; N=24 is invalid)';
  if (shape === 'circle')      return 'N must be even; no straight sections';
  return 'N must be even';
}

function snapN(N, shape) {
  const step = shapeStep(shape);
  return Math.max(8, Math.round(N / step) * step);
}

// ── state + event wiring ──────────────────────────────────────────────────────
let currentShape = 'stadium';
let currentN     = 48;

const slider    = document.getElementById('n-slider');
const nDisplay  = document.getElementById('n-display');

function update() {
  nDisplay.textContent = currentN;
  slider.value         = currentN;
  render(currentShape, currentN);
}

slider.addEventListener('input', () => {
  currentN = parseInt(slider.value, 10);
  update();
});

document.getElementById('shape-buttons').addEventListener('click', e => {
  const btn = e.target.closest('.shape-btn');
  if (!btn) return;
  document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentShape  = btn.dataset.shape;
  const step    = shapeStep(currentShape);
  slider.step   = step;
  currentN      = snapN(currentN, currentShape);
  update();
});

slider.step = shapeStep(currentShape);
update();
</script>
</body>
</html>`;

const outPath = path.join(__dirname, 'ring-preview.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log(`Written: ${outPath}`);
