'use strict';

// Cell size and vertical SVG margin shared by every ring shape. Each layout puts
// them on its ring as wCell/hCell so renderers read them instead of re-deriving.
const W_CELL = 36;
const H_CELL = 36;
const SVG_PAD_V = 4; // tight vertical margin; must stay > max stroke-width / 2

module.exports = { W_CELL, H_CELL, SVG_PAD_V };
