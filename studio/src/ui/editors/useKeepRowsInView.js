import { useEffect, useRef } from 'preact/hooks';
import reveal from '../../model/reveal.js';

const { revealDelta, planReveal } = reveal;

// Keeps the active row of a list visible as the caret moves, scrolling only when it is
// out of view. It scrolls only the enclosing `.phase-side-col` (scrollIntoView would
// also scroll the page) and moves no focus, so a key typed in a clue field stays in the
// field.
//   rootRef:  ref to the element holding the rows.
//   lists:    the editor's ListSpecs (rows, or groups of rows, each with `active`/`crossing`).
//   rowClass: the row's class, `word-row` or `clue-row`; both mark `.on` and `.crossing`.
//   orphanCount: the number of loose clues, for a list that shows them first in the
//     column (the Clues phase's tray, the Board phase's notice). When it grows, or the
//     list mounts with some already loose, the column scrolls to the top so they are seen,
//     and that render skips the row scroll, which would pull the column back down.
export function useKeepRowsInView(rootRef, lists, rowClass, orphanCount = 0) {
  const prevOrphans = useRef(0);   // 0, so a list that mounts with loose clues counts as growth
  // The effect runs when the marked rows change, not on every render. Each row is keyed
  // by its role, list, group and index, so a swap between the two rows is a change.
  const marked = lists.flatMap(l => (l.rows ? l.rows.map(r => [r, '']) : l.groups.flatMap(g => g.rows.map(r => [r, g.g]))).map(
    ([r, g]) => (r.active ? `on:${l.cutName}:${g}:${r.j}` : r.crossing ? `x:${l.cutName}:${g}:${r.j}` : ''))).join();
  useEffect(() => {
    const col = rootRef.current.closest('.phase-side-col');
    const grew = orphanCount > prevOrphans.current;
    prevOrphans.current = orphanCount;
    if (!col) return;
    if (grew) { col.scrollTop = 0; return; }
    // Only the active row, and only when it is out of view (planReveal).
    const active = rootRef.current.querySelector(`.${rowClass}.on`);
    col.scrollTop += planReveal(col.getBoundingClientRect(), active && active.getBoundingClientRect());
  }, [marked, orphanCount]);
}

// Scrolls `col` just far enough to show `el`, and nothing else on the page.
export function revealInColumn(col, el) {
  col.scrollTop += revealDelta(col.getBoundingClientRect(), el.getBoundingClientRect());
}
