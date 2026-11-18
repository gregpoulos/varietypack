'use strict';

// Freezes `o` and everything inside it, so a model command that mutates its input throws.
function deepFreeze(o) {
  Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); });
  return Object.freeze(o);
}

// A runner for a kind module's commands: run(model, 'name', ...args) calls the command on
// a deep-frozen clone of `model`, so a command that mutates its input fails the test.
function commandRunner(kindModule) {
  return (model, name, ...args) => kindModule.commands[name](deepFreeze(structuredClone(model)), ...args);
}

module.exports = { deepFreeze, commandRunner };
