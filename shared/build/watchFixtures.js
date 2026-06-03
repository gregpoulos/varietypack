'use strict';

const fs   = require('fs');
const path = require('path');

function makeWatchFixtures(toolDir, buildPuzzle) {
  const fixturesDir = path.join(toolDir, 'test/fixtures');
  const srcDir      = path.join(toolDir, 'src');
  const toolName    = path.basename(toolDir);

  function buildAll() {
    const files = fs.readdirSync(fixturesDir).filter(f => /\.ya?ml$/.test(f));
    for (const file of files) {
      const inputPath  = path.join(fixturesDir, file);
      const outputPath = inputPath.replace(/\.ya?ml$/, '.html');
      try {
        buildPuzzle(inputPath, outputPath);
        console.log(`Built: ${file}`);
      } catch (err) {
        console.error(`Error building ${file}: ${err.message}`);
      }
    }
  }

  console.log(`Watching ${toolName}/test/fixtures/ ... (Ctrl-C to stop)`);
  console.log(`Open: file://${fixturesDir}/`);
  buildAll();

  fs.watch(fixturesDir, { recursive: false }, (event, filename) => {
    if (filename && /\.ya?ml$/.test(filename)) {
      console.log(`Changed: ${filename}, rebuilding...`);
      buildAll();
    }
  });

  fs.watch(srcDir, { recursive: true }, () => {
    console.log('Source changed, rebuilding...');
    buildAll();
  });
}

module.exports = makeWatchFixtures;
