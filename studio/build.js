'use strict';
// Builds the studio. esbuildOptions() is the one esbuild configuration (bundleCore,
// buildPage and the guard test all use it).
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { engineJs, TOOLS } = require('../shared/build/engineBundle');

const ROOT = path.resolve(__dirname, '..');
const VIRTUAL_ROOT = '/varietypack';

function toVirtual(abs) {
  return VIRTUAL_ROOT + '/' + path.relative(ROOT, abs).split(path.sep).join('/');
}

function walk(dir, keep, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, keep, out);
    else if (keep(p)) out.push(p);
  }
  return out;
}

// Every file the build path reads with fs.readFileSync. If one is missing, the parity
// test fails with ENOENT — add it here. No JavaScript: a page's script is engineBundle's.
function assetFiles() {
  const shared = path.join(ROOT, 'shared');
  const files = [
    ...fs.readdirSync(shared).filter(f => /\.css$/.test(f)).map(f => path.join(shared, f)),
    ...walk(path.join(shared, 'themes'), p => /\.(css|woff2)$/.test(p)),
  ];
  for (const tool of TOOLS) {
    files.push(...walk(path.join(ROOT, tool, 'src', 'template'), p => /\.(html|css)$/.test(p)));
  }
  return files;
}

function collectAssets() {
  const assets = {};
  for (const abs of assetFiles()) {
    assets[toVirtual(abs)] = /\.woff2$/.test(abs)
      ? { base64: fs.readFileSync(abs).toString('base64') }
      : fs.readFileSync(abs, 'utf8');
  }
  return assets;
}

function plugin() {
  return {
    name: 'varietypack-studio',
    setup(build) {
      // fs → the in-memory file system; its data → a generated module.
      build.onResolve({ filter: /^fs$/ }, () => ({ path: path.join(__dirname, 'src/core/vfs.js') }));
      build.onResolve({ filter: /^vp-assets$/ }, () => ({ path: 'vp-assets', namespace: 'vp-assets' }));
      build.onLoad({ filter: /.*/, namespace: 'vp-assets' }, () => ({
        contents: `module.exports = ${JSON.stringify(collectAssets())};`, loader: 'js',
      }));
      // engineBundle.js runs esbuild, which the browser doesn't have: swap in the same
      // scripts, built here. Only shared/build/page.js imports it.
      build.onResolve({ filter: /^\.\/engineBundle$/ }, a => (
        a.importer.startsWith(ROOT) ? { path: 'vp-engines', namespace: 'vp-engines' } : undefined));
      build.onLoad({ filter: /.*/, namespace: 'vp-engines' }, () => {
        const scripts = Object.fromEntries(TOOLS.map(t => [t, engineJs(t)]));
        return {
          contents: `const scripts = ${JSON.stringify(scripts)};\n` +
            'module.exports = { engineJs: (tool) => scripts[tool] };',
          loader: 'js',
        };
      });
      // esbuild gives browser bundles no __dirname/__filename; the builders locate
      // templates with them. Inject virtual values after the directive prologue so
      // 'use strict' stays in force.
      build.onLoad({ filter: /\.js$/ }, async a => {
        if (!a.path.startsWith(ROOT + path.sep) || a.path.includes(`${path.sep}node_modules${path.sep}`)) return undefined;
        const src = await fs.promises.readFile(a.path, 'utf8');
        if (!/\b__(dirname|filename)\b/.test(src)) return undefined;
        const prologue = src.match(/^(\s*(['"])use strict\2;?[ \t]*\r?\n)?/)[0];
        const decl = `var __filename = ${JSON.stringify(toVirtual(a.path))}, __dirname = ${JSON.stringify(toVirtual(path.dirname(a.path)))};\n`;
        return { contents: prologue + decl + src.slice(prologue.length), loader: 'js' };
      });
    },
  };
}

function esbuildOptions({ minify = false } = {}) {
  return {
    bundle: true,
    platform: 'browser',      // rejects any Node builtin the plugin doesn't map
    write: false,
    minify,
    logLevel: 'silent',
    alias: { path: 'path-browserify' },
    plugins: [plugin()],
  };
}

async function bundleCore({ minify = false } = {}) {
  const result = await esbuild.build({
    ...esbuildOptions({ minify }),
    entryPoints: [path.join(__dirname, 'src/core/index.js')],
    format: 'iife',
    globalName: 'studioCore',
  });
  return result.outputFiles[0].text;
}

// esbuild escapes "</script" in strings but leaves "<!--" alone. Inside an inline
// <script>, a "<!--" followed later by "<script" switches the HTML parser into a mode
// where the closing </script> no longer ends the element. Both sequences only ever
// occur inside string, template or regex literals here, where \x3C is the same "<".
function escapeInlineScript(js) {
  return js.replace(/<\/script/gi, '\\x3C/script').replace(/<!--/g, '\\x3C!--');
}

// The page's own build, which the guard test bundles too, so it checks what ships.
function pageOptions({ dev = false } = {}) {
  return {
    ...esbuildOptions({ minify: !dev }),
    entryPoints: [path.join(__dirname, 'src/ui/main.jsx')],
    format: 'iife',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    loader: { '.yaml': 'text' },
    sourcemap: dev ? 'inline' : false,
  };
}

async function buildPage({ dev = false } = {}) {
  const result = await esbuild.build(pageOptions({ dev }));
  const js = escapeInlineScript(result.outputFiles[0].text);
  const template = fs.readFileSync(path.join(__dirname, 'src/page/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'src/page/studio.css'), 'utf8');
  return template.replace('{{CSS}}', () => css).replace('{{JS}}', () => js);
}

// CLI: node studio/build.js [--dev] [-o <file>]   (default: studio/build/index.html)
if (require.main === module) {
  const args = process.argv.slice(2);
  const dev = args.includes('--dev');
  const oi = args.indexOf('-o');
  const out = oi >= 0 ? path.resolve(args[oi + 1]) : path.join(__dirname, 'build', 'index.html');
  buildPage({ dev }).then(html => {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html, 'utf8');
    process.stdout.write(`Built studio → ${out}\n`);
  }, err => { process.stderr.write(`${err.message}\n`); process.exit(1); });
}

module.exports = { ROOT, VIRTUAL_ROOT, toVirtual, collectAssets, esbuildOptions, bundleCore, pageOptions, buildPage, escapeInlineScript };
