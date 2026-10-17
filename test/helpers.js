'use strict';

const assert = require('node:assert/strict');

// The PUZZLE_DATA a built page ships, parsed back out of its HTML. injectTemplate writes
// it as `window.PUZZLE_DATA = {…};`, alone in its script element and with every `</`
// escaped, so the first `};` before `</script>` is its end.
function puzzleDataOf(html) {
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  assert.ok(match, 'PUZZLE_DATA not found');
  return JSON.parse(match[1]);
}

module.exports = { puzzleDataOf };
