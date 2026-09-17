#!/usr/bin/env node
// Applied after `cap add android` / `cap sync`. Everything here is idempotent
// so it can run on every CI build.
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ANDROID = join(HERE, 'android');
const MANIFEST = join(ANDROID, 'app', 'src', 'main', 'AndroidManifest.xml');
const PKG_DIR = join(ANDROID, 'app', 'src', 'main', 'java', 'com', 'sonngo', 'linknotes');

if (!existsSync(MANIFEST)) {
  throw new Error(`AndroidManifest.xml not found at ${MANIFEST} — run "cap add android" first.`);
}

/* 1. The share-intent activity replaces Capacitor's generated stub. */
mkdirSync(PKG_DIR, { recursive: true });
copyFileSync(join(HERE, 'MainActivity.java'), join(PKG_DIR, 'MainActivity.java'));
console.log('· MainActivity.java installed');

/* 2. Register LinkNotes as a share target for plain text and links. */
const SHARE_FILTER = `
            <intent-filter android:label="@string/title_activity_main">
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
`;

let manifest = readFileSync(MANIFEST, 'utf8');
if (manifest.includes('android.intent.action.SEND')) {
  console.log('· share intent-filter already present');
} else {
  const close = manifest.indexOf('</activity>');
  if (close === -1) throw new Error('No <activity> element in AndroidManifest.xml');
  manifest = manifest.slice(0, close) + SHARE_FILTER + '        ' + manifest.slice(close);
  console.log('· share intent-filter added');
}

// The WebView talks to api.github.com only; no cleartext traffic is needed.
manifest = manifest.replace(/\s*android:usesCleartextTraffic="true"/g, '');

writeFileSync(MANIFEST, manifest);

/* 3. App name and theme colour. */
const STRINGS = join(ANDROID, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
if (existsSync(STRINGS)) {
  let strings = readFileSync(STRINGS, 'utf8');
  strings = strings
    .replace(/(<string name="app_name">)[^<]*(<\/string>)/, '$1LinkNotes$2')
    .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, '$1LinkNotes$2');
  writeFileSync(STRINGS, strings);
  console.log('· strings.xml updated');
}

const COLORS = join(ANDROID, 'app', 'src', 'main', 'res', 'values', 'colors.xml');
if (existsSync(COLORS)) {
  let colors = readFileSync(COLORS, 'utf8');
  colors = colors.replace(/(<color name="colorPrimary">)[^<]*(<\/color>)/, '$1#2563EB$2');
  writeFileSync(COLORS, colors);
  console.log('· colors.xml updated');
}

/* 4. Launcher icons: reuse the PWA icon for every density. */
const ICON = join(HERE, '..', 'web', 'icons', 'icon-512.png');
if (existsSync(ICON)) {
  for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    const dir = join(ANDROID, 'app', 'src', 'main', 'res', `mipmap-${d}`);
    if (!existsSync(dir)) continue;
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      if (existsSync(join(dir, name))) copyFileSync(ICON, join(dir, name));
    }
  }
  console.log('· launcher icons replaced');
}

console.log('Android project patched.');
