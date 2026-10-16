// Build: bundle src/main.js with esbuild, inline everything into dist/index.html
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const dev = process.argv.includes('--dev');
fs.mkdirSync(DIST, { recursive: true });

const esbuild = path.join(ROOT, 'tools', 'esbuild');
const outJs = path.join(ROOT, 'build', 'game.js');
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
const args = [
  path.join(ROOT, 'src', 'main.js'), '--bundle', '--format=iife', '--target=es2020,safari15',
  `--outfile=${outJs}`, '--legal-comments=none', '--log-level=warning',
];
if (!dev) args.push('--minify');
execFileSync(esbuild, args, { stdio: 'inherit', cwd: ROOT });

const js = fs.readFileSync(outJs, 'utf8');
let css = fs.readFileSync(path.join(ROOT, 'src', 'style.css'), 'utf8');
const fonts = { vt323: 'VT323', specialelite: 'Special Elite', bebas: 'Bebas Neue', oswald: 'Oswald', marker: 'Permanent Marker' };
let fontCss = '';
for (const [file, family] of Object.entries(fonts)) {
  const b64 = fs.readFileSync(path.join(ROOT, 'fonts', file + '.woff')).toString('base64');
  fontCss += `@font-face{font-family:"${family}";src:url(data:font/woff;base64,${b64}) format("woff");font-display:block;}\n`;
}
let html = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
// Phone Guy recordings (processed by tools/voice.sh) are embedded as data URIs
const VDIR = path.join(ROOT, 'voice', 'out');
const voice = {};
if (fs.existsSync(VDIR)) for (const f of fs.readdirSync(VDIR)) { const m = f.match(/^night(\d)\.mp3$/); if (m) voice[m[1]] = 'data:audio/mpeg;base64,' + fs.readFileSync(path.join(VDIR, f)).toString('base64'); }
const voiceJs = 'window.__VOICE=' + JSON.stringify(voice) + ';';
const buildId = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
html = html.replace('/*FONTS*/', () => fontCss).replace('/*CSS*/', () => css)
  .replace('/*JS*/', () => voiceJs + '\n' + js.replace(/<\/script/gi, '<\\/script'))
  .replace(/__BUILD__/g, buildId);
fs.writeFileSync(path.join(DIST, 'index.html'), html);

// static PWA files
for (const f of ['manifest.webmanifest', 'sw.js']) {
  const src = path.join(ROOT, 'src', f);
  if (fs.existsSync(src)) fs.writeFileSync(path.join(DIST, f), fs.readFileSync(src, 'utf8').replace(/__BUILD__/g, buildId));
}
for (const f of fs.readdirSync(path.join(ROOT, 'icons')).filter((n) => n.endsWith('.png'))) {
  fs.copyFileSync(path.join(ROOT, 'icons', f), path.join(DIST, f));
}
// Embeddable variant (no document wrapper, no manifest/icons links) for the hosted play link
{
  const REL = path.join(ROOT, 'release'); fs.mkdirSync(REL, { recursive: true });
  let a = html;
  a = a.replace(/<!DOCTYPE html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*$/i, '');
  a = a.replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '').replace(/<body>\s*/i, '').replace(/<\/body>\s*/i, '');
  a = a.replace(/<meta charset="utf-8">\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
  a = a.replace(/<link rel="(manifest|apple-touch-icon|icon)"[^>]*>\s*/gi, '');
  fs.writeFileSync(path.join(REL, 'bessarios.html'), a);
}
const size = fs.statSync(path.join(DIST, 'index.html')).size;
const gz = zlib.gzipSync(fs.readFileSync(path.join(DIST, 'index.html'))).length;
console.log(`dist/index.html ${(size / 1024).toFixed(0)} KB (gzip ${(gz / 1024).toFixed(0)} KB) build ${buildId}`);
