'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const path     = require('path');
const yaml     = require('js-yaml');
const { newDoc, openText, setMuddledTheme } = require('../src/model/doc');
const { exportList, buildExport, buildEmbed, embedSnippet, themeOf, themeHasFont } = require('../src/model/exporters');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const sourceDoc = (text = read('examples/spiral.yaml')) => newDoc({ id: 'a', now: 1, kind: 'spiral', yaml: text });
const mudText = read('spiral/test/fixtures/test-78.muddled.yaml');
const mudDoc = () => openText(mudText, { id: 'b', now: 1 }).doc;

test('exportList: a source puzzle offers every file, hashed page first, the embed row after it', () => {
  assert.deepEqual(exportList(sourceDoc()).map(f => f.id), ['hashed', 'embed', 'html', 'source', 'muddled']);
  assert.equal(exportList(sourceDoc()).find(f => f.id === 'embed').dialog, true);
  assert.equal(exportList(sourceDoc())[0].best, true);
});

test('exportList: a muddled file offers only the hashed page, the embed row and the muddled file', () => {
  assert.deepEqual(exportList(mudDoc()).map(f => f.id), ['hashed', 'embed', 'muddled']);
});

test('buildExport source: the editor text, verbatim, comments included', () => {
  const text = '# note\n' + read('examples/spiral.yaml');
  const r = buildExport('source', sourceDoc(text), { font: 'embed' });
  assert.equal(r.text, text);
  assert.equal(r.type, 'source');
  assert.equal(r.mime, 'text/yaml');
});

test('buildExport hashed: a hashed page with no plaintext letters', () => {
  const r = buildExport('hashed', sourceDoc(), { font: 'embed' });
  assert.ok(r.text.includes('"hashed": true'));
  assert.ok(!/"letters":/.test(r.text));
  assert.equal(r.type, 'hashed');
});

test('buildExport html: a plain page that carries its letters', () => {
  const r = buildExport('html', sourceDoc(), { font: 'embed' });
  assert.match(r.text, /"letters":/);
  assert.ok(!r.text.includes('"hashed": true'));
});

test('buildExport muddled: the same file varietypack muddle writes', () => {
  const r = buildExport('muddled', sourceDoc(), { font: 'embed' });
  const out = yaml.load(r.text);
  assert.equal(out.format, 2);
  assert.equal(out.hashed, true);
  assert.ok(out.boardHash);
  assert.equal(r.type, 'muddled');
});

test('buildExport on a muddled file: hashed page builds, muddled file carries the chosen theme and the same hash', () => {
  const doc = setMuddledTheme(mudDoc(), 'skeleton', 2);
  const page = buildExport('hashed', doc, { font: 'link' });
  assert.ok(page.text.includes('"hashed": true'));
  assert.ok(page.text.includes('fonts.googleapis.com'));
  const out = yaml.load(buildExport('muddled', doc, { font: 'embed' }).text);
  assert.equal(out.theme, 'skeleton');
  assert.equal(out.boardHash, yaml.load(mudText).boardHash);
});

test('buildExport: a file the doc does not offer is refused', () => {
  assert.throws(() => buildExport('html', mudDoc(), { font: 'embed' }), /not available/);
  assert.throws(() => buildExport('source', mudDoc(), { font: 'embed' }), /not available/);
});

test('buildExport: a puzzle with errors throws them', () => {
  assert.throws(() => buildExport('hashed', sourceDoc('kind: nope\n'), { font: 'embed' }), /unknown kind "nope"/);
});

test('buildExport font: embed carries @font-face, link carries the CDN import', () => {
  const text = read('examples/spiral.yaml') + '\ntheme: skeleton\n';
  assert.match(buildExport('html', sourceDoc(text), { font: 'embed' }).text, /@font-face/);
  const link = buildExport('html', sourceDoc(text), { font: 'link' }).text;
  assert.ok(link.includes('fonts.googleapis.com'));
  assert.ok(!link.includes('@font-face'));
});

test('exportFileName types match the files', () => {
  assert.deepEqual(exportList(sourceDoc()).map(f => f.type), ['hashed', 'hashed', 'html', 'source', 'muddled']);
});

test('themeOf and themeHasFont', () => {
  assert.equal(themeOf(sourceDoc(), null), 'broadsheet');
  assert.equal(themeOf(sourceDoc(), { theme: 'skeleton' }), 'skeleton');
  assert.equal(themeOf(setMuddledTheme(mudDoc(), 'skeleton', 2), null), 'skeleton');
  assert.equal(themeHasFont('broadsheet'), false);
  assert.equal(themeHasFont('skeleton'), true);
});

test('a structured document exports like a YAML one, its text being the puzzle it describes', () => {
  const { puzzleText } = require('../src/model/doc');
  const structuredDoc = openText(read('examples/spiral.yaml'), { id: 's', now: 1 }).doc;
  assert.equal(structuredDoc.mode, 'structured');
  assert.deepEqual(exportList(structuredDoc).map(f => f.id), ['hashed', 'embed', 'html', 'source', 'muddled']);
  assert.equal(buildExport('source', structuredDoc, { font: 'embed' }).text, puzzleText(structuredDoc));
  assert.ok(buildExport('muddled', structuredDoc, { font: 'embed' }).text.includes('boardHash'));
});

test('buildEmbed: a hashed page that names the host origin, from a source or a muddled doc', () => {
  for (const doc of [sourceDoc(), mudDoc()]) {
    const text = buildEmbed(doc, { font: 'embed', embedOrigin: 'https://hunt.example.com' }).text;
    assert.ok(text.includes('"embedOrigin": "https://hunt.example.com"'));
    assert.ok(text.includes('"hashed": true'));
    assert.ok(!/"letters":/.test(text));
  }
});

test('buildEmbed: an invalid origin is refused', () => {
  assert.throws(() => buildEmbed(sourceDoc(), { font: 'embed', embedOrigin: 'https://a.com/path' }), /must be an origin like/);
});

test('embedSnippet: an iframe the resize script can find, with the title and URL escaped', () => {
  const s = embedSnippet({ url: 'my "puzzle".html', title: 'A <b> & "C"' });
  assert.match(s, /<iframe src="my &quot;puzzle&quot;\.html" title="A &lt;b&gt; &amp; &quot;C&quot;" data-varietypack /);
  assert.ok(s.includes("e.data.type !== 'varietypack:resize'"));
  assert.ok(s.includes('f.contentWindow === e.source'));
  assert.ok(s.includes("e.data.fill ? '100svh'"));
  assert.ok(!s.includes('<b>'));
});

