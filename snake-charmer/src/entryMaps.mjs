// Snake Charmer's pure entry mapping and ring stepping. The engine imports it, and Node
// requires it for tests.

// Derive the cell→entry mapping from entry lengths alone (sequential positional
// assignment). entryAtCell[ringPos][loop] = entry index occupying that cell. The -1 fill
// only marks a slot not yet written: entry lengths total loops × ring size (the validator
// checks it), so a valid puzzle fills every slot.
// ringPosByEntry[ei] = ring positions for entry ei, in posInEntry order.
// canonicalStart[ei] = { ringPos, loop } of that entry's first cell (posInEntry 0).
function buildEntryMaps(entries, loops) {
  const ringSize = entries.reduce((s, e) => s + e.length, 0) / loops;
  const entryAtCell = Array.from({ length: ringSize }, () => new Array(loops).fill(-1));
  const ringPosByEntry = entries.map(() => []);
  const canonicalStart = [];
  let concatPos = 0;
  for (let ei = 0; ei < entries.length; ei++) {
    for (let posInEntry = 0; posInEntry < entries[ei].length; posInEntry++) {
      const ringPos = concatPos % ringSize;
      const loop = Math.floor(concatPos / ringSize);
      entryAtCell[ringPos][loop] = ei;
      ringPosByEntry[ei].push(ringPos);
      if (posInEntry === 0) canonicalStart[ei] = { ringPos, loop };
      concatPos++;
    }
  }
  return { entryAtCell, ringPosByEntry, canonicalStart };
}

function nextRingPos(pos, total) {
  return (pos + 1) % total;
}

function prevRingPos(pos, total) {
  return (pos - 1 + total) % total;
}

export { buildEntryMaps, nextRingPos, prevRingPos };
