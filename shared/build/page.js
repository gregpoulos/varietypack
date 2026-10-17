'use strict';
// Assembling a tool's page: its template, stylesheet and bundled script, and the fields
// every PUZZLE_DATA carries.

const fs   = require('fs');
const path = require('path');
const injectTemplate = require('./injectTemplate');
const { composeThemeCss } = require('./themes');
const { engineJs } = require('./engineBundle');

// Shared skeleton for every tool's buildHtml(): read the tool's index.html template,
// compose its theme CSS, take the tool's bundled page script (engineBundle.js), and
// inject title/css/js/puzzleData into the template. `tool` names the tool whose script
// it is. Callers own everything about *which* fields end up in puzzleData
// (commonPuzzleData(prepared) plus tool fields); this only owns the file I/O and
// injection that is byte-for-byte identical across tools.
function buildToolHtml(templateDir, { title, tool, puzzleData }, { theme, font, themeTokens } = {}) {
  const template = fs.readFileSync(path.join(templateDir, 'index.html'), 'utf8');
  const css = composeThemeCss(templateDir, theme, font, themeTokens);
  return injectTemplate(template, { title, css, js: engineJs(tool), puzzleData });
}

// Returns the fields common to every tool's PUZZLE_DATA object.
// Required fields (title, kind, hashed) are always included.
// Optional fields (author, date, instructions, letters, boardHash, embedOrigin) are
// included only when !== undefined, so JSON.stringify never emits them as null.
// instructions arrives already rendered to HTML (prepareCommon, at prepare time).
function commonPuzzleData(prepared) {
  const data = {
    title:  prepared.title,
    kind:   prepared.kind,
    hashed: prepared.hashed,
  };
  if (prepared.author       !== undefined) data.author       = prepared.author;
  if (prepared.date         !== undefined) data.date         = prepared.date;
  if (prepared.instructions !== undefined) data.instructions = prepared.instructions;
  if (prepared.letters      !== undefined) data.letters      = prepared.letters;
  if (prepared.boardHash    !== undefined) data.boardHash    = prepared.boardHash;
  if (prepared.embedOrigin  !== undefined) data.embedOrigin  = prepared.embedOrigin;
  return data;
}

module.exports = { buildToolHtml, commonPuzzleData };
