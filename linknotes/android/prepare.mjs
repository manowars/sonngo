#!/usr/bin/env node
// Copies the web app into www/ (Capacitor's webDir) and turns off the two
// browser-only defaults that do not apply inside the APK.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', 'web');
const WWW = join(HERE, 'www');

rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });
cpSync(WEB, WWW, { recursive: true });

// The service worker is pointless inside a WebView that already serves local
// assets, and its cache makes app updates confusing.
rmSync(join(WWW, 'sw.js'), { force: true });
const mainPath = join(WWW, 'js', 'main.js');
let main = readFileSync(mainPath, 'utf8');
main = main.replace(
  /if \('serviceWorker' in navigator\) \{[\s\S]*?\n  \}/,
  '// Service worker intentionally omitted in the APK build.'
);
writeFileSync(mainPath, main);

// Inside the APK there is no Netlify function, so title lookup is off by
// default; the user can point it at their Netlify site in Settings.
const storePath = join(WWW, 'js', 'store.js');
let store = readFileSync(storePath, 'utf8');
store = store.replace('  fetchMeta: true,', '  fetchMeta: false,');
store = store.replace("  metaEndpoint: '/.netlify/functions/meta',", "  metaEndpoint: '',");
store = store.replace("  device: 'web',", "  device: 'android',");
writeFileSync(storePath, store);

if (!existsSync(join(WWW, 'index.html'))) throw new Error('www/index.html missing');
console.log('www/ prepared from web/');
