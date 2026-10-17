'use strict';

const js = require('@eslint/js');
const globals = require('globals');

const jsx = { parserOptions: { ecmaFeatures: { jsx: true } } };

module.exports = [
  { ignores: ['node_modules/', 'studio/build/', 'test-results/', 'playwright-report/', '.worktrees/'] },
  js.configs.recommended,
  {
    rules: {
      // A leading underscore marks a binding that is deliberately unused.
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true,
      }],
      // Storage and clipboard calls fail in private windows; swallowing that is intended.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Comments wrap at 90 columns; code lines are not limited. A comment line with a
      // run of spaces mid-line is an aligned list and a URL cannot be broken, so neither
      // is held to the width. CSS and shell comments are checked in
      // test/commentStyle.test.js.
      'max-len': ['error', {
        code: Infinity, comments: 90, ignoreUrls: true, ignoreTrailingComments: true,
        ignorePattern: '\\S {2,}\\S',
      }],
    },
  },
  // Node code is CommonJS unless a later block says otherwise.
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  // Page modules run in the browser and (through require()) in Node.
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.browser },
  },
  // Engines are bundled by esbuild and only ever run in the browser.
  {
    files: ['*/src/template/engine.js'],
    languageOptions: { sourceType: 'module', globals: globals.browser },
  },
  // Studio UI: ES modules with JSX. The studio's core and model, and gridGeometry.js, are
  // CommonJS so node:test can load them, and take the Node block above.
  {
    files: ['studio/src/ui/**/*.{js,jsx}'],
    ignores: ['studio/src/ui/editors/gridGeometry.js'],
    languageOptions: { sourceType: 'module', globals: globals.browser, ...jsx },
  },
  // e2e specs hand callbacks to page.evaluate, which run in the page.
  {
    files: ['e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
