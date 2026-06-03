'use strict';

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

function deploy(toolDir) {
  const configPath = path.join(toolDir, 'deploy.config.json');
  if (!fs.existsSync(configPath)) {
    console.error('deploy.config.json not found.');
    console.error('Create it with: { "target": "user@host:/path/to/dir" }');
    console.error('Optional: add "source" to deploy a directory other than "puzzles".');
    process.exit(1);
  }
  const { source = 'puzzles', target } = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const sourceDir = path.resolve(toolDir, source);
  execFileSync('rsync', ['-avz', '--exclude=*.yaml', '--exclude=*.yml', sourceDir + '/', target + '/'], { stdio: 'inherit' });
}

module.exports = deploy;
