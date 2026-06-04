'use strict';

const path = require('path');

const TOOLS = {
  'snake-charmer': {
    dir: path.resolve(__dirname, '../../snake-charmer'),
    description: 'Build Snake Charmer puzzle HTML from YAML',
    options: require('../../snake-charmer/cliHelp').TOOL_OPTIONS,
    getValidator: () => require('../../snake-charmer/src/validator').validate,
    getHasher:    () => require('../../snake-charmer/src/hasher').preparePuzzle,
  },
  'spiral': {
    dir: path.resolve(__dirname, '../../spiral'),
    description: 'Build Spiral puzzle HTML from YAML',
    options: require('../../spiral/cliHelp').TOOL_OPTIONS,
    getValidator: () => require('../../spiral/src/validator').validate,
    getHasher:    () => require('../../spiral/src/hasher').preparePuzzle,
  },
  'marching-bands': {
    dir: path.resolve(__dirname, '../../marching-bands'),
    description: 'Build Marching Bands puzzle HTML from YAML',
    options: require('../../marching-bands/cliHelp').TOOL_OPTIONS,
    getValidator: () => require('../../marching-bands/src/validator').validate,
    getHasher:    () => require('../../marching-bands/src/hasher').preparePuzzle,
  },
};

module.exports = { TOOLS };
