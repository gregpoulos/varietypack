'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { studioCss } = require('../build');

const css = studioCss();
const root = css.match(/:root\s*\{[^}]*\}/)[0];
const T = Object.fromEntries([...root.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(m => [m[1], m[2].toLowerCase()]));
const TINTS = Object.fromEntries([...root.matchAll(/--(tint-[\w-]+):\s*(\d+)%/g)].map(m => [m[1], Number(m[2]) / 100]));

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
function luminance(h) {
  const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// WCAG 2.x contrast ratio.
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// p of a mixed into b, per channel.
function mix(a, b, p) {
  const [x, y] = [rgb(a), rgb(b)];
  return hex(x.map((v, i) => Math.round(v * p + y[i] * (1 - p))));
}

test('the page embeds Jost as a woff2 data URL', () =>
  assert.match(css, /@font-face\s*\{[^}]*font-family:\s*'Jost'[^}]*data:font\/woff2;base64,/));
test('legends prefer Futura, then Jost', () => assert.match(css, /--font-legend:\s*Futura,\s*Jost,/));
test('the studio has one look: no dark mode', () => {
  assert.doesNotMatch(css, /prefers-color-scheme/);
  assert.match(css, /color-scheme:\s*light/);
});
// The tests below read only this block, so a second :root would hide its tokens.
test('the tokens live in one :root block', () => assert.equal(css.match(/:root\s*\{/g).length, 1));

const PAIRS = [
  ['legend', 'plate-top', 4.5], ['legend', 'unit-top', 4.5], ['legend', 'monitor', 4.5],
  ['cap-ink', 'cap-top', 4.5], ['cap-ink', 'cap-bottom', 4.5],
  ['cap-dark-ink', 'cap-dark-top', 4.5], ['cap-red-ink', 'cap-red-top', 4.5],
  ['ch1-ink', 'ch1', 4.5], ['ch2-ink', 'ch2', 4.5],
  ['paper-ink', 'paper', 4.5], ['paper-muted', 'paper', 4.5], ['bad', 'paper', 4.5], ['warn-ink', 'paper', 4.5],
  ['tape-ink', 'tape', 4.5], ['tape-muted', 'tape', 4.5], ['readout-ink', 'readout', 4.5],
  ['focus', 'plate-top', 3], ['focus', 'plate-bottom', 3], ['focus', 'unit-bottom', 3],
  ['focus', 'paper', 3], ['focus', 'tape', 3], ['focus', 'cap-bottom', 3],
  ['readout-ink', 'monitor', 3],   // the preview frame's focus ring, drawn on the bezel
];
for (const [fg, bg, min] of PAIRS) {
  test(`--${fg} on --${bg} meets ${min}:1`, () =>
    assert.ok(contrast(T[fg], T[bg]) >= min, `${contrast(T[fg], T[bg]).toFixed(2)}`));
}
test('paper text stays readable on every channel tint', () => {
  assert.ok(Object.keys(TINTS).length >= 5, 'the five --tint-* tokens');
  for (const ch of ['ch1', 'ch2']) {
    for (const [tint, p] of Object.entries(TINTS)) {
      for (const fg of ['paper-ink', 'paper-muted', 'bad', 'warn-ink']) {
        const c = contrast(T[fg], mix(T[ch], T.paper, p));
        assert.ok(c >= 4.5, `--${fg} on --${tint} of --${ch}: ${c.toFixed(2)}`);
      }
    }
  }
});
// Fills and backgrounds are what text sits on. Strokes are exempt, though Marching Bands'
// loop stroke does sit under letters (always --paper-ink, about 7:1 on its 50% mix).
test('every tinted fill or background goes through a --tint-* token', () =>
  assert.doesNotMatch(css, /(fill|background(-color)?):\s*color-mix\(in srgb,\s*var\(--(ch[12]|dirc)\)\s+\d/));

// Text that inherits the plate's white must not land on a light background, and the
// browser's default placeholder color fails contrast on paper.
test('code sets its own ink, since it has a tape background wherever it appears', () =>
  assert.match(css, /^code \{[^}]*color: var\(--tape-ink\)/m));
test('placeholders on paper use the muted ink at full opacity', () => {
  assert.match(css, /\.clue-input::placeholder[^{]*\{[^}]*color: var\(--paper-muted\)[^}]*opacity: 1/);
  assert.match(css, /#max-cell-letters::placeholder[^{]*\{/);
});
test('a disabled display-window select is dimmed', () =>
  assert.match(css, /select\.readout:disabled[^{]*\{[^}]*opacity: \.5/));

// Native scrollbars would otherwise draw a light track on the dark plate.
test('every scroller is a translucent thumb on no track', () => {
  assert.match(css, /^\* \{[^}]*scrollbar-color: rgba\(255, 255, 255, \.38\) transparent/m);
  assert.match(css, /\*::-webkit-scrollbar-thumb/);
});

// The plate's pale thumb would vanish on the paper drafts panel.
test('the drafts panel scrolls with a thumb that shows on paper', () =>
  assert.match(css, /^\.ts-scroll \{[^}]*scrollbar-color: var\(--cell-line\) transparent/m));
