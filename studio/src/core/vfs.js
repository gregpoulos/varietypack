'use strict';
// In-memory stand-in for the one fs function the build path uses: readFileSync.
// Contents come from the 'vp-assets' module that studio/build.js generates at bundle
// time, keyed by virtual path (/varietypack/<repo-relative path>).
const assets = require('vp-assets');

function enoent(p) {
  const err = new Error(`ENOENT: no such file or directory, open '${p}'`);
  err.code = 'ENOENT';
  return err;
}

function readFileSync(p) {
  if (!Object.prototype.hasOwnProperty.call(assets, p)) throw enoent(p);
  const v = assets[p];
  if (typeof v === 'string') return v;
  // Binary (fonts): buildFontCss (themes.js) reads without an encoding and calls
  // toString('base64').
  return {
    toString(enc) {
      if (enc === 'base64') return v.base64;
      throw new Error(`vfs: binary file ${p} read as ${enc}`);
    },
  };
}

module.exports = { readFileSync };
