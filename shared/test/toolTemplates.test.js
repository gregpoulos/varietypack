'use strict';
// What the tools' templates and stylesheets must keep in common, so they can't
// drift apart again: the shared page markup, the placement of shared elements, and the
// rule that a tool's stylesheets lay out its own containers and leave the look of shared
// elements to shared/ (docs/ARCHITECTURE.md → "Tool stylesheets").

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { KINDS } = require('../build/tools');

const ROOT = path.join(__dirname, '..', '..');
const read = (tool, file) => fs.readFileSync(path.join(ROOT, tool, 'src', 'template', file), 'utf8');
const squash = s => s.replace(/\s+/g, ' ').trim();

// The open elements around the element with id `id`, outermost first, each as its
// opening tag. A tag walk is enough for templates this repo writes.
const VOID = new Set(['input', 'meta', 'br', 'img', 'link']);
function ancestorsOf(html, id) {
  const stack = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const [tag, close, name, attrs] = m;
    if (close) { stack.pop(); continue; }
    if (new RegExp(`\\bid="${id}"`).test(attrs)) return stack.slice();
    if (!VOID.has(name.toLowerCase())) stack.push(tag);
  }
  throw new Error(`no element with id "${id}"`);
}

// Every rule in a stylesheet as { selector, props }, at-rule wrappers ignored.
function rules(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    selector: squash(sel),
    props: body.split(';').map(d => d.split(':')[0].trim()).filter(Boolean),
  }));
}

test('every template has the same <head> and the same markup after its page content', () => {
  const head = t => squash(read(t, 'index.html').split('<body')[0]);
  const tail = t => squash(read(t, 'index.html').slice(read(t, 'index.html').indexOf('<input id="hidden-input"')));
  const [first, ...rest] = KINDS;
  for (const tool of rest) {
    assert.equal(head(tool), head(first), `${tool} <head>`);
    assert.equal(tail(tool), tail(first), `${tool} tail`);
  }
});

test('#done-wrong sits inside .puzzle-main in every template', () => {
  for (const tool of KINDS) {
    const outer = ancestorsOf(read(tool, 'index.html'), 'done-wrong');
    assert.ok(outer.some(tag => /class="[^"]*\bpuzzle-main\b/.test(tag)), tool);
  }
});

test('every .puzzle-toggle is a labeled group', () => {
  for (const tool of KINDS) {
    const toggles = read(tool, 'index.html').match(/<[^>]*class="[^"]*\bpuzzle-toggle\b[^>]*>/g) || [];
    for (const tag of toggles) {
      assert.match(tag, /\brole="group"/, `${tool}: ${tag}`);
      assert.match(tag, /\baria-label="[^"]+"/, `${tool}: ${tag}`);
    }
  }
});

// Elements whose look shared/base.css and print-base.css set for every tool.
const SHARED = ['.puzzle-main', '.puzzle-header', '.byline', '#instructions', '.instructions',
  '.clue-item', '.clue-num', '.clue-section h2'];
const names = (selector, shared) =>
  new RegExp(`(^|[^\\w-])${shared.replace(/[.#]/g, '\\$&')}($|[^\\w-])`).test(selector);

test("a tool's stylesheets leave shared elements to shared/", () => {
  for (const tool of KINDS) {
    for (const file of ['base.css', 'print.css']) {
      for (const { selector } of rules(read(tool, file))) {
        const hit = SHARED.find(s => names(selector, s));
        assert.equal(hit, undefined, `${tool}/${file}: "${selector}" styles ${hit} (move it to shared/)`);
      }
    }
  }
});

// Text sizes on a tool's board are its own: they are in the board's SVG units, which
// each tool's geometry sets.
const TYPE_PROPS = ['font-size', 'line-height', 'letter-spacing', 'font-weight', 'text-transform', 'font-family'];
const BOARD_TEXT = /^\.(cell-num|cell-letter|row-label)$/;

test("a tool's stylesheets set no type style except on its board's text", () => {
  for (const tool of KINDS) {
    for (const file of ['base.css', 'print.css']) {
      for (const { selector, props } of rules(read(tool, file))) {
        const typed = props.filter(p => TYPE_PROPS.includes(p));
        if (typed.length === 0) continue;
        assert.ok(selector.split(',').every(s => BOARD_TEXT.test(s.trim())),
          `${tool}/${file}: "${selector}" sets ${typed.join(', ')} (move it to shared/base.css)`);
      }
    }
  }
});
