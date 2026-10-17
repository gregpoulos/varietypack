// What the studio calls each kind, in the order the start screen lists them.
export const KINDS = [
  ['spiral', 'Spiral', 'A spiral of cells, with answers read inward and outward.'],
  ['snake-charmer', 'Snake Charmer', 'A ring of cells, read twice around.'],
  ['marching-bands', 'Marching Bands', 'Rows and concentric bands on a square grid.'],
  ['crushword', 'Crushword', 'A crossword whose cells can hold more than one letter.'],
];

export function kindName(kind) {
  const found = KINDS.find(k => k[0] === kind);
  return found ? found[1] : kind || 'Unknown kind';
}
