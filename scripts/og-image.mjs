#!/usr/bin/env node
/**
 * Renders public/og-image.png (1200×630 link preview) from scripts/og-image.html using the real
 * game art and the `share` text in src/config/personal.ts. Needs Chrome/Chromium installed.
 *
 *   npm run og
 *   CHROME_PATH=/path/to/chrome npm run og
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/og-image.png');

const candidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const chrome = candidates.find((p) => existsSync(p));
if (!chrome) {
  console.error('Chrome/Chromium not found. Set CHROME_PATH to its executable.');
  process.exit(1);
}

const server = await createServer({ root, logLevel: 'error', server: { port: 5399, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0];
// A throwaway profile: headless Chrome hangs if it collides with an already-open Chrome profile.
const profile = mkdtempSync(join(tmpdir(), 'love-crush-og-'));
try {
  // Must be async: a sync spawn would block this process, and with it the dev server Chrome loads from.
  await promisify(execFile)(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      '--force-device-scale-factor=1',
      '--window-size=1200,630',
      '--virtual-time-budget=15000',
      `--screenshot=${out}`,
      `${base}scripts/og-image.html`,
    ],
    { timeout: 90_000 },
  );
  console.log(`  wrote ${out} (${Math.round(statSync(out).size / 1024)} KB)`);
} finally {
  await server.close();
  rmSync(profile, { recursive: true, force: true });
}
