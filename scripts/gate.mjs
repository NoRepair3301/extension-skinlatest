// Gate runner: tsc + eslint + vitest with compact output. Node built-ins only.
// Usage: npm run gate -- [--only tsc,eslint,vitest] [--tests <path>...] [--full] [--failures-file <path>]
// Exit codes: 0 = GREEN, 1 = RED, 2 = ERROR (tool crashed / unparseable / timeout).
// Vitest JSON goes to a temp file outside the repo and is deleted afterwards.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 10 * 60 * 1000;

function parseArgs(argv) {
  const o = { only: ['tsc', 'eslint', 'vitest'], tests: [], full: false, failuresFile: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') o.only = String(argv[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--full') o.full = true;
    else if (a === '--failures-file') o.failuresFile = argv[++i] ?? null;
    else if (a === '--tests') {
      while (i + 1 < argv.length && !String(argv[i + 1]).startsWith('--')) o.tests.push(argv[++i]);
    }
  }
  return o;
}

function binPath(pkg, name) {
  const dir = join(ROOT, 'node_modules', pkg);
  const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const rel = typeof json.bin === 'string' ? json.bin : json.bin[name];
  return join(dir, rel);
}

function run(bin, args, deadline) {
  return new Promise((res) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd: ROOT, windowsHide: true });
    let out = '';
    let err = '';
    let timedOut = false;
    const left = Math.max(1000, deadline - Date.now());
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, left);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); res({ code: -1, out, err: err + String(e), timedOut }); });
    child.on('close', (code) => { clearTimeout(timer); res({ code, out, err, timedOut }); });
  });
}

const rel = (p) => String(p).replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '');
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

async function stepTsc(deadline) {
  const t = Date.now();
  const r = await run(binPath('typescript', 'tsc'), ['--noEmit', '--pretty', 'false'], deadline);
  const lines = [];
  for (const l of (r.out + r.err).split(/\r?\n/)) {
    const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(l);
    if (m) lines.push(`${rel(m[1])}(${m[2]},${m[3]}) ${m[4]} ${m[5]}`);
  }
  if (r.timedOut || (r.code !== 0 && lines.length === 0)) return { error: true, raw: r.out + r.err };
  return { name: 'tsc', ms: Date.now() - t, summary: plural(lines.length, 'error'), lines, failed: lines.length };
}

async function stepEslint(deadline) {
  const t = Date.now();
  const r = await run(binPath('eslint', 'eslint'), ['.', '--quiet', '--format', 'json'], deadline);
  let data;
  try { data = JSON.parse(r.out); } catch { return { error: true, raw: r.out + r.err }; }
  if (r.timedOut) return { error: true, raw: r.out + r.err };
  const lines = [];
  for (const f of data) {
    for (const m of f.messages) {
      if (m.severity === 2) lines.push(`${rel(f.filePath)}:${m.line} ${m.ruleId ?? 'parse'} ${m.message}`);
    }
  }
  return { name: 'eslint', ms: Date.now() - t, summary: plural(lines.length, 'error'), lines, failed: lines.length };
}

async function stepVitest(deadline, tests) {
  const t = Date.now();
  const outFile = join(tmpdir(), `gate-vitest-${process.pid}-${Date.now()}.json`);
  const args = ['run', '--reporter=json', `--outputFile=${outFile}`, ...tests];
  const r = await run(binPath('vitest', 'vitest'), args, deadline);
  let data;
  try {
    if (r.timedOut || !existsSync(outFile)) throw new Error('no output');
    data = JSON.parse(readFileSync(outFile, 'utf8'));
  } catch {
    return { error: true, raw: r.out + r.err };
  } finally {
    try { rmSync(outFile, { force: true }); } catch { /* best effort */ }
  }
  const failures = [];
  for (const f of data.testResults ?? []) {
    const file = rel(f.name);
    const asserts = f.assertionResults ?? [];
    for (const a of asserts) {
      if (a.status === 'failed') {
        const msg = String((a.failureMessages ?? [])[0] ?? '').split(/\r?\n/)[0];
        failures.push({ file, name: a.fullName ?? a.title, msg });
      }
    }
    // A file that failed to load has no failed assertions but status failed.
    if (f.status === 'failed' && !asserts.some((a) => a.status === 'failed')) {
      failures.push({ file, name: '(file failed to run)', msg: String(f.message ?? '').split(/\r?\n/)[0] });
    }
  }
  const files = (data.testResults ?? []).length;
  const summary = `${data.numPassedTests} pass / ${data.numFailedTests} fail / ${data.numTotalTests} tests in ${files} files`;
  const lines = failures.map((f) => `${f.file} :: ${f.name} :: ${f.msg}`);
  const failed = failures.length + (data.numFailedTests > failures.length ? data.numFailedTests - failures.length : 0);
  return { name: 'vitest', ms: Date.now() - t, summary, lines, failed, failureKeys: failures.map((f) => `${f.file} :: ${f.name}`) };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const deadline = Date.now() + TIMEOUT_MS;
  const results = [];
  for (const s of ['tsc', 'eslint', 'vitest']) {
    if (!opts.only.includes(s)) continue;
    const r = s === 'tsc' ? await stepTsc(deadline) : s === 'eslint' ? await stepEslint(deadline) : await stepVitest(deadline, opts.tests);
    if (r.error) {
      console.log(`GATE: ERROR (${s})`);
      console.log(r.raw.split(/\r?\n/).slice(0, 20).join('\n'));
      process.exit(2);
    }
    results.push(r);
  }
  const cap = opts.full ? 200 : null;
  const out = [];
  for (const r of results) {
    out.push(`${r.name.padEnd(8)}: ${r.summary}  (${secs(r.ms)})`);
    const lim = cap ?? Infinity;
    for (const l of r.lines.slice(0, lim)) out.push(`  ${l}`);
    if (r.lines.length > lim) out.push(`  ... ${r.lines.length - lim} more`);
  }
  const red = results.some((r) => r.failed > 0);
  out.push(red ? 'GATE: RED' : 'GATE: GREEN');
  if (!opts.full && out.length > 40) {
    const verdict = out[out.length - 1];
    const hidden = out.length - 38;
    out.length = 38;
    out.push(`... ${hidden - 1} more (use --full)`, verdict);
  }
  console.log(out.join('\n'));
  if (opts.failuresFile) {
    const v = results.find((r) => r.name === 'vitest');
    if (v) writeFileSync(resolve(ROOT, opts.failuresFile), [...v.failureKeys].sort().join('\n') + (v.failureKeys.length ? '\n' : ''));
  }
  process.exit(red ? 1 : 0);
}

main().catch((e) => {
  console.log('GATE: ERROR (internal)');
  console.log(String(e?.stack ?? e).split(/\r?\n/).slice(0, 20).join('\n'));
  process.exit(2);
});
