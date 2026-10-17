'use strict';
// Reading the engines' completion message (docs/CROSS_TOOL_SPEC.md → "Completion event").

// → timeMs (0 when the message carries no usable time), or null if it isn't a completion.
function solveTimeFromMessage(data) {
  if (!data || typeof data !== 'object' || data.type !== 'varietypack:complete') return null;
  return Number.isFinite(data.timeMs) ? data.timeMs : 0;
}

function formatSolveTime(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

module.exports = { solveTimeFromMessage, formatSolveTime };
