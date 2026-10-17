'use strict';

// Thrown when a puzzle can't be represented as cells plus starts (spec §4.6): the
// lengths don't tile, the bracket grammar is invalid, or an entry is muddled.
class StructureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StructureError';
  }
}

module.exports = { StructureError };
