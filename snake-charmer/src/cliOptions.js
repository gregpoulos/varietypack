'use strict';
// Snake Charmer's own build flags, beside the global ones (shared/cli/globalHelp.js).
// Kept apart from the layout code it names so the CLI can read it without the builder.

const { SHAPE_NAMES } = require('./layout');

const CLI_OPTIONS = {
  shape: { type: 'string', arg: 'name',
    description: 'Ring shape: ' + SHAPE_NAMES.join(', ') + '\nDefault: auto (tries double-turn, falls back to stadium)' },
};

module.exports = { CLI_OPTIONS };
