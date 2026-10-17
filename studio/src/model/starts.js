'use strict';
// Cuts: one way of dividing a sequence of cells into entries. A cut is
// { starts: number[], entries: Entry[] } with starts[0] === 0, strictly increasing, one
// entry per start; entry j covers [starts[j], starts[j+1] ?? total).
//
// Every function returns new objects and never mutates its input.

function ranges(starts, total) {
  return starts.map((s, j) => [s, j + 1 < starts.length ? starts[j + 1] : total]);
}

// The j with starts[j] <= index < the next start.
function entryAt(starts, index) {
  let j = 0;
  while (j + 1 < starts.length && starts[j + 1] <= index) j++;
  return j;
}

// Splits the entry holding `index`: it keeps the left part (and its id and clue);
// newEntry follows it. The caller checks index < total.
function addBreak(cut, index, newEntry) {
  if (!(index > 0) || cut.starts.includes(index)) {
    throw new Error(`cannot add a break at ${index}: it must be above 0 and not already a break`);
  }
  const j = entryAt(cut.starts, index);
  return {
    starts: [...cut.starts.slice(0, j + 1), index, ...cut.starts.slice(j + 1)],
    entries: [...cut.entries.slice(0, j + 1), newEntry, ...cut.entries.slice(j + 1)],
  };
}

function orphanOf(entry, from) {
  if (!entry.clue.trim()) return null;   // a clue of only spaces is no clue (completeness agrees)
  const orphan = { id: entry.id, clue: entry.clue, from };
  if (entry.displayAnswer !== undefined) orphan.displayAnswer = entry.displayAnswer;
  return orphan;
}

// Merges the entry starting at `index` into the one before it. The left entry survives;
// the removed entry's non-empty clue becomes an orphan.
function removeBreak(cut, index, fromLabel) {
  const j = cut.starts.indexOf(index);
  if (index <= 0 || j < 0) throw new Error(`there is no break at ${index} to remove`);
  return {
    cut: {
      starts: cut.starts.filter((_, k) => k !== j),
      entries: cut.entries.filter((_, k) => k !== j),
    },
    orphan: orphanOf(cut.entries[j], fromLabel),
  };
}

function mapStart(s, edit) {
  if (s === 0 || s <= edit.start) return s;
  if (s >= edit.start + edit.removed) return s - edit.removed + edit.inserted;
  return edit.start; // strictly inside the replaced span
}

// Moves a cut's breaks with the cells after an edit, in this cut's own coordinates.
// A break that lands on its predecessor, or past the new end, is merged away, orphaning a
// non-empty clue. labelFor(j) names original entry j for the orphan.
function reanchor(cut, edit, newTotal, labelFor) {
  const starts = [0];
  const entries = [cut.entries[0]];
  const orphans = [];
  for (let j = 1; j < cut.starts.length; j++) {
    const mapped = mapStart(cut.starts[j], edit);
    if (mapped === starts[starts.length - 1] || mapped >= newTotal) {
      const orphan = orphanOf(cut.entries[j], labelFor(j));
      if (orphan) orphans.push(orphan);
    } else {
      starts.push(mapped);
      entries.push(cut.entries[j]);
    }
  }
  return { cut: { starts, entries }, orphans };
}

module.exports = { ranges, entryAt, addBreak, removeBreak, reanchor, orphanOf };
