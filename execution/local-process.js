'use strict';

// Local process transport. Run policy, engine translation and temporary files belong to the bridge/adapters.
const { spawn, execFile } = require('node:child_process');
const IS_WIN = process.platform === 'win32';

const cmdQuote = s => /^[A-Za-z0-9_\-.:\\/=@,+]+$/.test(s) ? s : `"${String(s).replace(/"/g, '""')}"`;

/** Spawn an executable; .cmd/.bat on Windows must go through cmd.exe. Args are simple tokens only. */
function spawnBin(resolved, args, opts) {
  if (IS_WIN && /\.(cmd|bat)$/i.test(resolved)) {
    const line = [resolved, ...args].map(cmdQuote).join(' ');
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], { ...opts, windowsVerbatimArguments: true });
  }
  if (/\.(mjs|cjs|js)$/i.test(resolved)) return spawn(process.execPath, [resolved, ...args], opts);
  return spawn(resolved, args, opts);
}

/** Start synchronously: the bridge registers the run and emits its initial events before observing output. */
function start(resolved, args, { cwd, env }) {
  return spawnBin(resolved, args, { cwd, windowsHide: true, detached: !IS_WIN, env, stdio: ['pipe', 'pipe', 'pipe'] });
}

/** Attach once, before writeInput. Chunks stay raw: JSONL framing and terminal ordering belong to the bridge. */
function observe(child, { onStdout, onStderr, onError, onClose }) {
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', onStdout);
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', onStderr);
  child.on('error', onError);
  child.on('close', onClose);
}

function writeInput(child, stdin) {
  child.stdin.on('error', () => {});
  child.stdin.end(stdin, 'utf8');
}

function cancel(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  if (IS_WIN) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
}

module.exports = { spawnBin, start, observe, writeInput, cancel };
