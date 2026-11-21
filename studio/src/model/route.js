'use strict';
// The studio's address: which screen is showing, as a URL hash. Pure, for node:test.
//
//   Route = { screen: 'home' }
//         | { screen: 'doc', id, view: 'board'|'clues'|'test', yaml: boolean }
//         | { screen: 'muddled' }
//
// A YAML doc is written '/yaml' (its board is its text) unless it is in test.

const HOME = { screen: 'home' };

function routeOf(state) {
  const d = state.doc;
  if (!d) return HOME;
  if (d.mode === 'muddled') return { screen: 'muddled' };
  return { screen: 'doc', id: d.id, view: state.view, yaml: d.mode === 'yaml' };
}

function formatRoute(route) {
  if (route.screen === 'home') return '#/';
  if (route.screen === 'muddled') return '#/muddled';
  const seg = route.yaml && route.view !== 'test' ? 'yaml' : route.view;
  return `#/d/${encodeURIComponent(route.id)}/${seg}`;
}

function parseRoute(hash) {
  const h = hash.replace(/^#/, '');
  if (h === '' || h === '/') return HOME;
  if (h === '/muddled') return { screen: 'muddled' };
  const m = /^\/d\/([^/]+)\/([^/]+)$/.exec(h);
  if (!m) return null;
  let id;
  try { id = decodeURIComponent(m[1]); } catch { return null; }
  if (m[2] === 'yaml') return { screen: 'doc', id, view: 'board', yaml: true };
  if (m[2] === 'board' || m[2] === 'clues' || m[2] === 'test') return { screen: 'doc', id, view: m[2], yaml: false };
  return null;
}

const sameRoute = (a, b) => a.screen === b.screen && a.id === b.id && a.view === b.view && a.yaml === b.yaml;

// How the address bar should follow a route change: a new history entry, a rewrite of the
// current one, or nothing.
function historyStep(prev, next) {
  if (prev && sameRoute(prev, next)) return 'none';
  if (!prev) return 'replace';
  if (prev.screen === 'doc' && next.screen === 'doc' && prev.id === next.id
      && prev.view !== 'test' && next.view !== 'test' && prev.yaml !== next.yaml) return 'replace';
  return 'push';
}

module.exports = { routeOf, formatRoute, parseRoute, historyStep };
