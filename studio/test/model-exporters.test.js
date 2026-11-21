'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const path     = require('path');
const yaml     = require('js-yaml');
const { newDoc, openText, setOption } = require('../src/model/doc');
const { yamlSaves, setThemeLine, buildExport, themeHasFont, themeApplies, fileTheme, previewTheme } = require('../src/model/exporters');
const { parseDraft } = require('../src/model/drafts');
const core = require('../src/core');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const sourceDoc = (text = read('examples/spiral.yaml')) => newDoc({ id: 'a', now: 1, kind: 'spiral', yaml: text });
const mudText = read('spiral/test/fixtures/test-78.muddled.yaml');
const mudDoc = () => openText(mudText, { id: 'b', now: 1 }).doc;

test('page export font: embed carries @font-face, link carries the CDN import', () => {
  const text = read('examples/spiral.yaml') + '\ntheme: skeleton\n';
  assert.match(buildExport('page', sourceDoc(text), { font: 'embed', theme: 'skeleton' }).text, /@font-face/);
  const link = buildExport('page', sourceDoc(text), { font: 'link', theme: 'skeleton' }).text;
  assert.match(link, /https:\/\/fonts\.googleapis\.com\//);
  assert.ok(!link.includes('@font-face'));
});

test('previewTheme: the option, else the file theme, else broadsheet', () => {
  const src = sourceDoc();                                   // examples/spiral.yaml, no theme:
  assert.equal(previewTheme(src, { theme: null }), 'broadsheet');
  assert.equal(previewTheme(src, { theme: 'skeleton' }), 'skeleton');
  assert.equal(previewTheme(setOption(src, 'previewTheme', 'broadsheet', 2), { theme: 'skeleton' }), 'broadsheet');
  assert.equal(fileTheme(mudDoc(), null), null);             // the fixture has no theme:
});

test('fileTheme and previewTheme read a structured document\'s header theme', () => {
  const doc = openText(read('examples/spiral.yaml'), { id: 's', now: 1 }).doc;
  assert.equal(doc.mode, 'structured');
  assert.equal(fileTheme(doc, null), null);
  const themed = { ...doc, model: { ...doc.model, header: { ...doc.model.header, theme: 'skeleton' } } };
  assert.equal(fileTheme(themed, null), 'skeleton');
  assert.equal(previewTheme(themed, null), 'skeleton');
});

test('themeHasFont: only a theme with its own font', () => {
  assert.equal(themeHasFont('broadsheet'), false);
  assert.equal(themeHasFont('skeleton'), true);
});

test('yamlSaves: a draft exactly when a structured puzzle is unfinished', () => {
  assert.equal(yamlSaves(sourceDoc()), 'yaml');
  assert.equal(yamlSaves(mudDoc()), 'yaml');
  assert.equal(yamlSaves(openText(read('examples/spiral.yaml'), { id: 's', now: 1 }).doc), 'yaml');
  assert.equal(yamlSaves(newDoc({ id: 'u', now: 1, kind: 'spiral', size: { cells: 40 } })), 'draft');
});

test('setThemeLine replaces a top-level theme, or adds one after kind:', () => {
  assert.equal(setThemeLine('kind: spiral\ntheme: broadsheet\ntitle: T\n', 'skeleton'), 'kind: spiral\ntheme: skeleton\ntitle: T\n');
  assert.equal(setThemeLine('# c\nkind: spiral\ntitle: T\n', 'skeleton'), '# c\nkind: spiral\ntheme: skeleton\ntitle: T\n');
  assert.equal(setThemeLine('title: T\n', 'skeleton'), 'theme: skeleton\ntitle: T\n');
});
test('setThemeLine leaves an indented "theme:" alone', () => {
  const text = 'kind: spiral\ninstructions: |\n  theme: not a key\ntitle: T\n';
  assert.equal(yaml.load(setThemeLine(text, 'skeleton')).instructions, 'theme: not a key\n');
  assert.equal(yaml.load(setThemeLine(text, 'skeleton')).theme, 'skeleton');
});

test('yaml export keeps the text verbatim when the theme is unchanged', () => {
  const text = '# note\n' + read('examples/spiral.yaml');
  assert.equal(buildExport('yaml', sourceDoc(text), { font: 'embed', theme: 'broadsheet' }).text, text);
});
test('yaml export writes a new theme and keeps comments', () => {
  const out = buildExport('yaml', sourceDoc('# note\n' + read('examples/spiral.yaml')), { font: 'embed', theme: 'skeleton' }).text;
  assert.ok(out.startsWith('# note\n'));
  assert.equal(yaml.load(out).theme, 'skeleton');
});
// Valid files the line splice would corrupt: each must still load, with the chosen theme.
for (const [name, text] of [
  ['a quoted theme key', 'kind: spiral\n"theme": swiss\ntitle: T\n'],
  ['a "theme :" key', 'kind: spiral\ntheme : swiss\ntitle: T\n'],
  ['a leading document marker and no kind', '---\ntitle: T\n'],
  ['a folded theme value', 'kind: spiral\ntheme: >\n  swiss\ntitle: T\n'],
]) {
  test(`yaml export re-themes a file with ${name} into a file that still loads`, () => {
    const out = buildExport('yaml', sourceDoc(text), { font: 'embed', theme: 'skeleton' });
    const loaded = yaml.load(out.text);
    assert.equal(loaded.theme, 'skeleton');
    assert.equal(loaded.title, 'T');
  });
}

test('yaml export of a file with a leading BOM keeps its keys and gains the theme', () => {
  const out = buildExport('yaml', sourceDoc('\uFEFF' + read('examples/spiral.yaml')), { font: 'embed', theme: 'skeleton' });
  const loaded = yaml.load(out.text);
  assert.equal(loaded.theme, 'skeleton');
  assert.equal(loaded.kind, 'spiral');
});

test('themeApplies: not for a draft or YAML that does not parse', () => {
  assert.equal(themeApplies(sourceDoc()), true);
  assert.equal(themeApplies(sourceDoc('kind: [\n')), false);
  assert.equal(themeApplies(mudDoc()), true);
  assert.equal(themeApplies(newDoc({ id: 'u', now: 1, kind: 'spiral', size: { cells: 40 } })), false);
});

test('fileTheme ignores a theme the registry does not know', () => {
  assert.equal(fileTheme(sourceDoc(), { theme: 'nope' }), null);
  assert.equal(fileTheme(sourceDoc(), { theme: 'swiss' }), 'swiss');
});

test('yaml export of text that does not parse is verbatim', () => {
  assert.equal(buildExport('yaml', sourceDoc('kind: [\n'), { font: 'embed', theme: 'skeleton' }).text, 'kind: [\n');
});
test('yaml export of a puzzle with errors still saves it; page and hidden yaml throw', () => {
  const bad = sourceDoc(read('examples/spiral.yaml').replace(/^title: .*$/m, 'title: ""'));
  assert.equal(buildExport('yaml', bad, { font: 'embed', theme: 'broadsheet' }).type, 'source');
  assert.throws(() => buildExport('page', bad, { font: 'embed', theme: 'broadsheet' }));
  assert.throws(() => buildExport('yaml', bad, { font: 'embed', theme: 'broadsheet', hideAnswers: true }));
});
test('page export: hidden answers ship no letters, plain carries them, theme applies', () => {
  const hidden = buildExport('page', sourceDoc(), { font: 'embed', theme: 'skeleton', hideAnswers: true });
  assert.equal(hidden.type, 'hashed'); assert.ok(!/"letters":/.test(hidden.text));
  assert.equal(hidden.mime, 'text/html');
  const plain = buildExport('page', sourceDoc(), { font: 'embed', theme: 'broadsheet' });
  assert.equal(plain.type, 'html'); assert.match(plain.text, /"letters":/);
  assert.notEqual(hidden.text, buildExport('page', sourceDoc(), { font: 'embed', theme: 'broadsheet', hideAnswers: true }).text);
});
test('hidden-answers yaml carries the theme and the same hash as varietypack muddle', () => {
  const src = read('examples/spiral.yaml');
  const r = buildExport('yaml', sourceDoc(src), { font: 'embed', theme: 'skeleton', hideAnswers: true });
  assert.equal(r.type, 'muddled'); assert.equal(r.mime, 'text/yaml');
  const out = yaml.load(r.text);
  assert.equal(out.theme, 'skeleton');
  assert.equal(out.boardHash, core.muddle({ ...core.parseYaml(src), theme: 'skeleton' }).muddled.boardHash);
});
test('a muddled doc: page is hashed, yaml is the file with the chosen theme and its hash', () => {
  const opts = { font: 'embed', theme: 'skeleton' };
  assert.equal(buildExport('page', mudDoc(), opts).type, 'hashed');
  assert.ok(buildExport('page', mudDoc(), opts).text.includes('"hashed": true'));
  const r = buildExport('yaml', mudDoc(), opts);
  assert.equal(r.type, 'muddled');
  const out = yaml.load(r.text);
  assert.equal(out.theme, 'skeleton');
  assert.equal(out.boardHash, yaml.load(mudText).boardHash);
});
test('an unfinished structured puzzle saves its draft', () => {
  const doc = newDoc({ id: 'u', now: 1, kind: 'spiral', size: { cells: 40 } });
  assert.equal(yamlSaves(doc), 'draft');
  const r = buildExport('yaml', doc, { font: 'embed', theme: 'skeleton', hideAnswers: true, savedAtIso: '2026-11-20T00:00:00.000Z' });
  assert.equal(r.type, 'draft'); assert.equal(r.mime, 'application/json');
  assert.deepEqual(parseDraft(r.text).model, doc.model);
  assert.throws(() => buildExport('page', doc, { font: 'embed', theme: 'broadsheet' }));
});
test('a structured puzzle exports YAML with the chosen theme', () => {
  const doc = openText(read('examples/spiral.yaml'), { id: 's', now: 1 }).doc;
  const opts = { font: 'embed', theme: 'skeleton' };
  assert.equal(yaml.load(buildExport('yaml', doc, opts).text).theme, 'skeleton');
  assert.ok(buildExport('yaml', doc, { ...opts, hideAnswers: true }).text.includes('boardHash'));
});
