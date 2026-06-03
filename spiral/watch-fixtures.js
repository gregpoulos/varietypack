'use strict';
const { buildPuzzle } = require('./src/builder');
const makeWatchFixtures = require('../shared/build/watchFixtures');
makeWatchFixtures(__dirname, buildPuzzle);
