#!/usr/bin/env node
/**
 * Runs the AI bot over every generated level (in parallel worker threads) and writes
 * src/levels/calibration.json with the move counts / score targets / star thresholds that hit
 * each tier's target win rate.
 *
 *   npm run calibrate                       # all 1000 levels, 60 bot runs each
 *   npm run calibrate -- --from 1 --to 50 --runs 30
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = resolve(root, '.cache/calibrate.bundle.mjs');
const outFile = resolve(root, 'src/levels/calibration.json');

if (isMainThread) {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
  );
  const from = Number(args.from ?? 1);
  const to = Number(args.to ?? 1000);
  const runs = Number(args.runs ?? 60);
  const threads = Number(args.threads ?? Math.max(1, cpus().length - 1));

  mkdirSync(dirname(bundle), { recursive: true });
  await build({
    entryPoints: [resolve(root, 'src/ai/calibrate.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: bundle,
    logLevel: 'error',
  });

  const existing = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : { version: 1, levels: {} };
  const levels = { ...existing.levels };
  const queue = [];
  for (let n = from; n <= to; n++) queue.push(n);
  const total = queue.length;
  let done = 0;
  const t0 = Date.now();

  await Promise.all(
    Array.from({ length: Math.min(threads, total) }, () => {
      return new Promise((res, rej) => {
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { bundle, runs } });
        const next = () => {
          const n = queue.shift();
          if (n === undefined) {
            w.postMessage(null);
            return;
          }
          w.postMessage(n);
        };
        w.on('message', ({ n, cal }) => {
          levels[n] = cal;
          done++;
          if (done % 25 === 0 || done === total) {
            const s = ((Date.now() - t0) / 1000).toFixed(1);
            process.stdout.write(`\r  calibrated ${done}/${total} levels (${s}s)`);
          }
          next();
        });
        w.on('error', rej);
        w.on('exit', res);
        next();
      });
    }),
  );
  process.stdout.write('\n');

  const sorted = {};
  for (const k of Object.keys(levels).map(Number).sort((a, b) => a - b)) sorted[k] = levels[k];
  writeFileSync(outFile, JSON.stringify({ version: 1, runs, levels: sorted }) + '\n');
  console.log(`  wrote ${Object.keys(sorted).length} levels → ${outFile}`);
} else {
  const { calibrateLevel } = await import(pathToFileURL(workerData.bundle).href);
  parentPort.on('message', (n) => {
    if (n === null) {
      process.exit(0);
    }
    parentPort.postMessage({ n, cal: calibrateLevel(n, workerData.runs) });
  });
}
