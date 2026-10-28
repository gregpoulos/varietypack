'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const { composeThemeCss, buildFontCss } = require('../build/themes');
const { THEME_REGISTRY } = require('../build/themeRegistry');

const COMPOSE_FIXTURE = path.join(__dirname, 'fixtures', 'compose');

// `color: inherit` is unique to print-base.css across the whole bundle, so it
// is a reliable position marker for the shared print layer.
const PRINT_BASE_MARKER = 'opacity: 1 !important';

// theme-base.css carries this sentinel comment so we can assert it loaded and
// ordered correctly without depending on a specific neutral value (tokens
// override the values, but never the comment).
const THEME_BASE_MARKER = 'theme-base: neutral defaults';

test('composeThemeCss: broadsheet bundle stacks base, tool base, theme-base, tokens, components, print base, tool print in cascade order', () => {
  const css = composeThemeCss(COMPOSE_FIXTURE, 'broadsheet');
  assert.ok(css.includes('box-sizing'),          'shared base missing');
  assert.ok(css.includes('.tool-base'),          'tool base missing');
  assert.ok(css.includes(THEME_BASE_MARKER),     'theme-base missing');
  assert.ok(css.includes('#f9f7f1'),             'broadsheet token value missing');
  assert.ok(css.includes('.cell.active-entry'),  'theme-components missing');
  assert.ok(css.includes(PRINT_BASE_MARKER),     'shared print base missing');
  assert.ok(css.includes('.tool-print'),         'tool print missing');
  // Order
  assert.ok(css.indexOf('box-sizing')         < css.indexOf('.tool-base'));
  assert.ok(css.indexOf('.tool-base')         < css.indexOf(THEME_BASE_MARKER));
  assert.ok(css.indexOf(THEME_BASE_MARKER)    < css.indexOf('#f9f7f1'));
  assert.ok(css.indexOf('#f9f7f1')            < css.indexOf('.cell.active-entry'));
  assert.ok(css.indexOf('.cell.active-entry') < css.indexOf(PRINT_BASE_MARKER));
  assert.ok(css.indexOf(PRINT_BASE_MARKER)    < css.indexOf('.tool-print'));
  // Skeleton's palette must not bleed into broadsheet
  assert.ok(!css.includes('#1a1520'),            'skeleton token value must be absent');
});

test('composeThemeCss: skeleton bundle uses skeleton tokens + shared neutral layer; no broadsheet palette', () => {
  const css = composeThemeCss(COMPOSE_FIXTURE, 'skeleton', 'embed');
  assert.ok(css.includes(THEME_BASE_MARKER),    'theme-base missing');
  assert.ok(css.includes('#1a1520'),            'skeleton token value missing');
  assert.ok(css.includes('.cell.active-entry'), 'theme-components missing');
  assert.ok(css.includes(PRINT_BASE_MARKER),    'shared print base missing');
  assert.ok(!css.includes('#f9f7f1'),           'broadsheet token value must be absent');
});

test('composeThemeCss: a registered token-only theme drops in with no per-tool CSS and no JS branch', () => {
  const themesDir = path.join(__dirname, '..', 'themes');
  const tokenPath = path.join(themesDir, 'dropintest-tokens.css');
  fs.writeFileSync(tokenPath, ':root { --theme-color-bg: #abcdef; }\n');
  THEME_REGISTRY.dropintest = { fonts: null };
  try {
    const css = composeThemeCss(COMPOSE_FIXTURE, 'dropintest');
    assert.ok(css.includes('#abcdef'),            'drop-in token value missing');
    assert.ok(css.includes(THEME_BASE_MARKER),    'theme-base missing');
    assert.ok(css.includes('.cell.active-entry'), 'theme-components missing');
    assert.ok(!css.includes('#f9f7f1'),           'broadsheet palette must not bleed');
    assert.ok(!css.includes('#1a1520'),           'skeleton palette must not bleed');
  } finally {
    fs.rmSync(tokenPath, { force: true });
    delete THEME_REGISTRY.dropintest;
  }
});

test('composeThemeCss: defaults to broadsheet when theme is omitted', () => {
  const css = composeThemeCss(COMPOSE_FIXTURE, undefined);
  assert.ok(css.includes('#f9f7f1'), 'broadsheet token value missing');
});

test('composeThemeCss: throws a clear error for an unregistered theme', () => {
  assert.throws(
    () => composeThemeCss(COMPOSE_FIXTURE, 'nonexistent'),
    /Unknown theme "nonexistent"\. Must be one of:/
  );
});

// Every plain object inherits these names, so a lookup that only checks for undefined
// takes them as registered themes.
for (const name of ['toString', 'constructor', '__proto__']) {
  test(`composeThemeCss: an Object.prototype name is an unregistered theme [${name}]`, () => {
    assert.throws(
      () => composeThemeCss(COMPOSE_FIXTURE, name),
      new RegExp(`Unknown theme "${name}"\\. Must be one of:`)
    );
  });
}

// Rejected for every theme, system-font ones included: a typo should not depend
// on which theme happens to be selected to be noticed.
for (const theme of ['broadsheet', 'skeleton']) {
  test(`composeThemeCss: throws a clear error for an unknown font mode [${theme}]`, () => {
    assert.throws(
      () => composeThemeCss(COMPOSE_FIXTURE, theme, 'bogus'),
      /Unknown font mode "bogus"\. Must be "embed" or "link"\./
    );
  });
}

test('composeThemeCss: skeleton without a font mode defaults to embed', () => {
  const css = composeThemeCss(COMPOSE_FIXTURE, 'skeleton');
  assert.ok(css.includes('@font-face'), 'should include @font-face');
  assert.ok(!css.includes('@import'), 'should not include @import');
});

// First in the bundle: CSS ignores an @import that follows any other rule.
test('composeThemeCss: skeleton theme with link mode opens with the @import', () => {
  const css = composeThemeCss(COMPOSE_FIXTURE, 'skeleton', 'link');
  assert.ok(css.startsWith('@import'), 'the @import must come before every other rule');
  assert.ok(css.includes('fonts.googleapis.com'), 'should include Google Fonts CDN URL');
});

test('buildFontCss: returns empty string for system-font theme regardless of fontMode', () => {
  const entry = { fonts: null };
  assert.equal(buildFontCss('broadsheet', entry, 'embed'), '');
  assert.equal(buildFontCss('broadsheet', entry, 'link'),  '');
  assert.equal(buildFontCss('broadsheet', entry, undefined), '');
});

test('buildFontCss: returns empty string for unregistered theme entry', () => {
  assert.equal(buildFontCss('unknown', undefined, 'embed'), '');
});

test('buildFontCss: link mode returns @import with cdn url', () => {
  const entry = {
    fonts: { cdn: { source: 'google', url: 'https://fonts.googleapis.com/css2?family=Test' } }
  };
  const css = buildFontCss('testtheme', entry, 'link');
  assert.ok(css.startsWith('@import'));
  assert.ok(css.includes('https://fonts.googleapis.com/css2?family=Test'));
});

test('buildFontCss: link mode throws when no cdn declared', () => {
  const tmp = path.join(os.tmpdir(), `f-${Date.now()}.woff2`);
  fs.writeFileSync(tmp, Buffer.from([0]));
  try {
    const entry = { fonts: { faces: [{ family: 'F', weight: 400, style: 'normal', file: tmp }] } };
    assert.throws(() => buildFontCss('myfont', entry, 'link'), /has no CDN font source/);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('buildFontCss: embed mode reads file and returns @font-face with base64 src', () => {
  const tmp = path.join(os.tmpdir(), `test-font-${Date.now()}.woff2`);
  const bytes = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01]);
  fs.writeFileSync(tmp, bytes);
  try {
    const entry = {
      fonts: { faces: [{ family: 'Test Font', weight: 400, style: 'normal', file: tmp }] }
    };
    const css = buildFontCss('testfont', entry, 'embed');
    assert.ok(css.includes("font-family: 'Test Font'"));
    assert.ok(css.includes('font-weight: 400'));
    assert.ok(css.includes('font-style: normal'));
    assert.ok(css.includes("format('woff2')"));
    assert.ok(css.includes('data:font/woff2;base64,'));
    assert.ok(css.includes(bytes.toString('base64')));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('buildFontCss: embed mode throws when font file missing', () => {
  const entry = {
    fonts: { faces: [{ family: 'F', weight: 400, style: 'normal', file: '/no/such/font.woff2' }] }
  };
  assert.throws(() => buildFontCss('myfont', entry, 'embed'), /embed failed: file not found/);
});

test('buildFontCss: no fontMode defaults to embed when local faces exist', () => {
  const tmp = path.join(os.tmpdir(), `f-${Date.now()}.woff2`);
  fs.writeFileSync(tmp, Buffer.from([0]));
  try {
    const entry = {
      fonts: {
        faces: [{ family: 'F', weight: 400, style: 'normal', file: tmp }],
        cdn:   { source: 'google', url: 'https://example.com' }
      }
    };
    const css = buildFontCss('myfont', entry, undefined);
    assert.ok(css.includes('@font-face'));
    assert.ok(!css.includes('@import'));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('buildFontCss: no fontMode defaults to embed for an embed-only theme', () => {
  const tmp = path.join(os.tmpdir(), `f-${Date.now()}.woff2`);
  fs.writeFileSync(tmp, Buffer.from([0]));
  try {
    const entry = { fonts: { faces: [{ family: 'F', weight: 400, style: 'normal', file: tmp }] } };
    assert.ok(buildFontCss('myfont', entry, undefined).includes('@font-face'));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('buildFontCss: no fontMode defaults to link for a CDN-only theme', () => {
  const entry = { fonts: { cdn: { source: 'google', url: 'https://example.com' } } };
  assert.ok(buildFontCss('myfont', entry, undefined).startsWith('@import'));
});

test('composeThemeCss: themeTokens land after the theme tokens and before the components', () => {
  const css = composeThemeCss(COMPOSE_FIXTURE, 'broadsheet', undefined, { 'color-bg': '#abc123' });
  assert.ok(css.includes('--theme-color-bg: #abc123;'));
  assert.ok(css.indexOf('#f9f7f1') < css.indexOf('--theme-color-bg: #abc123;'));
  assert.ok(css.indexOf('--theme-color-bg: #abc123;') < css.indexOf('.cell.active-entry'));
});

test('composeThemeCss: without themeTokens the output is unchanged', () => {
  assert.equal(composeThemeCss(COMPOSE_FIXTURE, 'broadsheet', undefined, {}), composeThemeCss(COMPOSE_FIXTURE, 'broadsheet'));
});
