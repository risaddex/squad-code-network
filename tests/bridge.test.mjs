// Bridge integration tests: `node --test tests/`. Uses tests/fake-claude.mjs and tests/fake-codex.mjs, so no API calls are made.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, realpathSync, symlinkSync, statSync, lstatSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4400 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = prefix => mkdtempSync(path.join(tmpdir(), prefix));
const home = tmp('squad-home-');
const workdir = tmp('squad-work-');
// The server's own temp folder (squad-code-*) goes inside this one, so tests can reach it and nothing leaks into %TEMP%.
const tempRoot = tmp('squad-tmp-');
// Per-project folders go here instead of ./projects in the repo.
const projectsRoot = tmp('squad-projects-');
// The SQLite database (squad.db) goes here instead of ./data in the repo.
const dataRoot = tmp('squad-data-');
// Every fake codex run appends what it received (argv, env, stdin) here.
const codexLog = path.join(tmp('squad-codexlog-'), 'fake-codex.log');
// Plugins configuration: an empty file instead of the clone's own squad.local.json.
const configRoot = tmp('squad-config-');
const emptyConfig = path.join(configRoot, 'empty.json');
writeFileSync(emptyConfig, '{}');
const extraDirs = [configRoot, path.dirname(codexLog)], bridges = [];
let server, token, nextPort = PORT + 1;

/** Starts a bridge on its own port with `dataDir` as the database folder; several starts on one folder test restarts. */
async function startBridge(dataDir, port = nextPort++, extraEnv = {}) {
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(port)], {
    cwd: workdir,
    env: { ...process.env, TEMP: tempRoot, TMP: tempRoot, TMPDIR: tempRoot, SQUAD_HOME: home, SQUAD_PLUGINS_DIR: "", SQUAD_PROJECTS_DIR: projectsRoot, SQUAD_DATA_DIR: dataDir, SQUAD_CLAUDE_BIN: path.join(ROOT, 'tests', 'fake-claude.mjs'), SQUAD_CODEX_BIN: path.join(ROOT, 'tests', 'fake-codex.mjs'), FAKE_CODEX_LOG: codexLog, SQUAD_PRINT_TOKEN: '1', SQUAD_CONFIG: emptyConfig, SQUAD_CONFIG_SHARED: path.join(configRoot, 'no-shared.json'), SQUAD_PLUGINS: '', ...extraEnv },
  });
  let out = '';
  const tok = await new Promise((resolve, reject) => {
    proc.stdout.on('data', d => { out += d; const m = out.match(/TOKEN=(\w+)/); if (m) resolve(m[1]); });
    proc.stderr.on('data', d => { out += d; });
    proc.on('exit', code => reject(new Error(`server exited ${code}\n${out}`)));
    setTimeout(() => reject(new Error(`server start timeout\n${out}`)), 10000);
  });
  const base = `http://127.0.0.1:${port}`;
  const b = {
    proc, token: tok, base, out: () => out,
    api: (p, init = {}) => fetch(base + p, { ...init, headers: { 'content-type': 'application/json', 'x-squad-token': tok, ...(init.headers || {}) } }),
    // hard: SIGKILL, no shutdown, like closing the terminal (what proc.kill() already is on Windows; elsewhere SIGTERM runs the
    // graceful shutdown, which cancels the live runs itself).
    stop: async (hard = false) => { if (proc.exitCode === null && proc.signalCode === null) { const exited = new Promise(r => proc.once('exit', r)); proc.kill(hard ? 'SIGKILL' : 'SIGTERM'); await exited; } },
  };
  bridges.push(b);
  return b;
}

before(async () => {
  const b = await startBridge(dataRoot, PORT);
  server = b.proc; token = b.token;
});
after(async () => {
  for (const b of bridges) await b.stop();
  // Windows may keep the dirs busy for a moment after the process exits.
  for (const dir of [home, workdir, tempRoot, projectsRoot, dataRoot, ...extraDirs]) { try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} }
});

const api = (p, init = {}) => fetch(BASE + p, { ...init, headers: { 'content-type': 'application/json', 'x-squad-token': token, ...(init.headers || {}) } });

async function collect(runId, base = BASE, tok = token) {
  const res = await fetch(`${base}/api/runs/${runId}/events?token=${tok}`);
  const text = await res.text();
  return text.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
}
const pageTag = (html, id) => JSON.parse(html.match(new RegExp(`<script type="application/json" id="${id}">(.*?)</script>`, 's'))[1]);
const page = async (base = BASE) => (await fetch(base + '/')).text();

test('serves index with injected token', async () => {
  const html = await (await fetch(BASE + '/')).text();
  assert.match(html, new RegExp(`name="squad-bridge-token" content="${token}"`));
});

test('rejects missing token and foreign origin', async () => {
  assert.equal((await fetch(BASE + '/api/health')).status, 401);
  assert.equal((await api('/api/health', { headers: { origin: 'http://evil.example' } })).status, 403);
});

test('health reports fake claude version', async () => {
  const body = await (await api('/api/health')).json();
  assert.equal(body.ok, true);
  assert.match(body.claudeVersion, /9\.9\.9/);
  assert.equal(body.projectsDir, realpathSync.native(projectsRoot));
});

test('project runs get their own folder under the projects root, without the app CLAUDE.md or an enclosing git repo', async () => {
  const folder = 'op-001-atlas-commerce', dir = path.join(projectsRoot, folder);
  assert.equal(existsSync(dir), false);
  // The projects root inside a git repository, like projects/ inside a clone of this app.
  let git = true;
  try { execFileSync('git', ['init', '-q', projectsRoot], { stdio: 'ignore' }); } catch { git = false; }
  const res = await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'build it GITCHECK', options: { project: folder, cwd: workdir } }) });
  assert.equal(res.status, 201, await res.clone().text());
  const { runId, args, cwd } = await res.json();
  assert.ok(existsSync(dir));
  assert.equal(cwd, realpathSync.native(dir));
  assert.equal(args[args.indexOf('--settings') + 1], '<settings-file>');
  const events = await collect(runId);
  const init = events.find(e => e.type === 'system' && e.subtype === 'init');
  assert.equal(init.cwd, realpathSync.native(dir));
  assert.ok(init.settings.claudeMdExcludes.includes(realpathSync.native(path.join(ROOT, 'CLAUDE.md')).replace(/\\/g, '/')));
  assert.equal(init.settings.permissions.blockReadsOutsideWorkingDirectories, true);
  // The folder is its own repository and git stops at the projects root: the agents' git commands never reach the enclosing one.
  assert.ok(init.gitCeiling.split(path.delimiter).includes(realpathSync.native(projectsRoot)));
  if (git) {
    assert.ok(existsSync(path.join(dir, '.git')));
    assert.equal(path.resolve(init.gitTop).toLowerCase(), realpathSync.native(dir).toLowerCase());
  }
  rmSync(path.join(projectsRoot, '.git'), { recursive: true, force: true });
  assert.equal(events.at(-1).status, 'done');
  // Runs without a project keep the plain cwd, no extra settings and no git ceiling.
  const plain = await (await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'x', options: { cwd: workdir } }) })).json();
  assert.ok(!plain.args.includes('--settings'));
  const plainInit = (await collect(plain.runId)).find(e => e.type === 'system' && e.subtype === 'init');
  assert.equal(plainInit.gitCeiling, process.env.GIT_CEILING_DIRECTORIES || null);
  // Neither a project nor a folder: refused, never run in the bridge's own folder.
  const none = await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'x', options: {} }) });
  assert.equal(none.status, 400);
  assert.match((await none.json()).error, /pasta de projeto/);
});

test('squad colleagues go to claude as an --agents file, with forwarded subagent text on request', async () => {
  const agents = { argus: { description: 'ARGUS, arquiteto. Chame para decisões de arquitetura.', prompt: 'Você é o ARGUS.', tools: ['Read', 'Grep'], model: 'haiku', effort: 'low', color: 'ignored' }, echo: { description: 'ECHO, QA.' } };
  const res = await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'implement', options: { cwd: workdir, agents, forwardSubagents: true, tools: ['Read', 'Agent'] } }) });
  assert.equal(res.status, 201, await res.clone().text());
  const { runId, args } = await res.json();
  assert.equal(args[args.indexOf('--agents') + 1], '<agents-file>');
  assert.ok(args.includes('--forward-subagent-text'));
  const events = await collect(runId);
  const init = events.find(e => e.type === 'system' && e.subtype === 'init');
  assert.equal(init.foregroundAgents, true, 'colleague calls must run in the foreground');
  assert.deepEqual(init.agents, { argus: { description: agents.argus.description, prompt: 'Você é o ARGUS.', tools: ['Read', 'Grep'], model: 'haiku', effort: 'low' }, echo: { description: 'ECHO, QA.', prompt: '' } });
  const call = events.find(e => e.type === 'assistant' && e.message.content.some(b => b.type === 'tool_use' && b.name === 'Agent'));
  assert.equal(call.message.content.find(b => b.name === 'Agent').input.subagent_type, 'argus');
  assert.ok(events.some(e => e.type === 'assistant' && e.parent_tool_use_id === 'call-1'));
  assert.ok(events.some(e => e.type === 'user' && e.message.content.some(b => b.type === 'tool_result' && b.tool_use_id === 'call-1')));
  assert.equal(events.at(-1).status, 'done');
  // The temp file is removed when the run ends (asynchronously, right after the stream closes).
  const tmp = path.join(tempRoot, readdirSync(tempRoot).find(d => d.startsWith('squad-code-')));
  const left = () => readdirSync(tmp).filter(f => f.endsWith('.agents.json'));
  for (let i = 0; i < 20 && left().length; i++) await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(left(), []);
  // forwardSubagents only with true.
  const plain = await (await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'x', options: { cwd: workdir, agents: { argus: agents.argus }, forwardSubagents: 'yes' } }) })).json();
  assert.ok(plain.args.includes('--agents') && !plain.args.includes('--forward-subagent-text'));
  const plainEvents = await collect(plain.runId);
  assert.ok(!plainEvents.some(e => e.parent_tool_use_id));
});

test('rejects invalid squad agent definitions', async () => {
  const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`a${i}`, { description: 'x' }]));
  for (const agents of [[], 'argus', { 'Bad Key': { description: 'x' } }, { argus: 'x' }, { argus: {} }, { argus: { description: 'x', tools: ['Bash; rm'] } }, { argus: { description: 'x', model: 'a b' } }, { argus: { description: 'x', effort: 'turbo' } }, many]) {
    const res = await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'x', options: { cwd: workdir, agents } }) });
    assert.equal(res.status, 400, JSON.stringify(agents).slice(0, 80));
  }
});

test('rejects project folder names that are not plain slugs', async () => {
  for (const project of ['../escape', 'a/b', 'a\\b', 'CON', 'con', 'Op-001', '-x', 'a.b', 'x'.repeat(81)]) {
    const res = await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'x', options: { project } }) });
    assert.equal(res.status, 400, project);
  }
  assert.ok(!existsSync(path.join(path.dirname(projectsRoot), 'escape')));
  assert.deepEqual(readdirSync(projectsRoot).filter(d => d !== 'op-001-atlas-commerce'), []);
});

test('run streams events and final result with system prompt and flags', async () => {
  const res = await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'hello agent', systemPrompt: 'be brief', options: { cwd: workdir, model: 'haiku', permissionMode: 'acceptEdits', allowedTools: ['Read', 'Bash(git *)'] } }) });
  assert.equal(res.status, 201);
  const { runId, args } = await res.json();
  assert.ok(args.includes('--permission-mode') && args.includes('acceptEdits'));
  const events = await collect(runId);
  const init = events.find(e => e.type === 'system' && e.subtype === 'init');
  assert.equal(init.model, 'haiku');
  assert.equal(init.foregroundAgents, false);
  assert.ok(events.some(e => e.type === 'assistant'));
  const exit = events.at(-1);
  assert.equal(exit.type, 'exit');
  assert.equal(exit.status, 'done');
  assert.equal(exit.result, 'ECHO:hello agent|SYS:be brief');
  assert.equal(exit.costUsd, 0.001);
});

test('partial streams text deltas only when asked (chat runs)', async () => {
  const run = async options => { const res = await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'chat', options: { cwd: workdir, ...options } }) }); assert.equal(res.status, 201); const { runId, args } = await res.json(); return { args, events: await collect(runId) }; };
  const live = await run({ partial: true, tools: [], permissionMode: 'dontAsk' });
  assert.ok(live.args.includes('--include-partial-messages'));
  const deltas = live.events.filter(e => e.type === 'stream_event' && e.event?.delta?.type === 'text_delta').map(e => e.event.delta.text);
  assert.equal(deltas.join(''), 'working');
  assert.equal(live.events.at(-1).status, 'done');
  const plain = await run({ partial: 'yes' });
  assert.ok(!plain.args.includes('--include-partial-messages'));
  assert.ok(!plain.events.some(e => e.type === 'stream_event'));
});

test('recreates its temp folder when it disappears', async () => {
  // OS temp cleanup can remove the (usually empty) folder while the bridge keeps running.
  const dirs = readdirSync(tempRoot).filter(d => d.startsWith('squad-code-'));
  assert.equal(dirs.length, 1);
  rmSync(path.join(tempRoot, dirs[0]), { recursive: true, force: true });
  const res = await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'still there?', systemPrompt: 'soul of the agent', options: { cwd: workdir } }) });
  assert.equal(res.status, 201, await res.clone().text());
  const exit = (await collect((await res.json()).runId)).at(-1);
  assert.equal(exit.status, 'done');
  assert.equal(exit.result, 'ECHO:still there?|SYS:soul of the agent');
});

test('failed run reports error', async () => {
  const { runId } = await (await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'FAIL please', options: { cwd: workdir } }) })).json();
  const exit = (await collect(runId)).at(-1);
  assert.equal(exit.status, 'error');
  assert.equal(exit.isError, true);
});

test('cancel kills a running process', async () => {
  const { runId } = await (await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'SLEEP', options: { cwd: workdir } }) })).json();
  const pending = collect(runId);
  await new Promise(r => setTimeout(r, 400));
  await api(`/api/runs/${runId}/cancel`, { method: 'POST' });
  const exit = (await pending).at(-1);
  assert.equal(exit.status, 'cancelled');
});

test('rejects invalid options', async () => {
  const res = await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'x', options: { cwd: workdir, permissionMode: 'yolo' } }) });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /permissão/);
  const res2 = await api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'x', options: { cwd: workdir, allowedTools: ['Bash; rm -rf /'] } }) });
  assert.equal(res2.status, 400);
  assert.match((await res2.json()).error, /Ferramenta/);
});

test('settings.json read/write with backup (user and project scope)', async () => {
  const empty = await (await api('/api/claude/settings?scope=user')).json();
  assert.equal(empty.exists, false);
  let res = await api('/api/claude/settings?scope=user', { method: 'PUT', body: JSON.stringify({ text: '{"model":"sonnet"}' }) });
  assert.equal((await res.json()).backup, null);
  res = await api('/api/claude/settings?scope=user', { method: 'PUT', body: JSON.stringify({ text: '{"model":"opus"}' }) });
  const saved = await res.json();
  assert.ok(saved.backup && existsSync(saved.backup));
  assert.deepEqual(JSON.parse(readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8')), { model: 'opus' });
  assert.deepEqual(JSON.parse(readFileSync(saved.backup, 'utf8')), { model: 'sonnet' });

  res = await api(`/api/claude/settings?scope=project&cwd=${encodeURIComponent(workdir)}`, { method: 'PUT', body: JSON.stringify({ text: '{"permissions":{"allow":["Read"]}}' }) });
  assert.equal(res.status, 200);
  assert.ok(existsSync(path.join(workdir, '.claude', 'settings.json')));

  // A project folder that has no run yet: reading does not create it, saving does.
  const fresh = await (await api('/api/claude/settings?scope=local&project=op-002-loja')).json();
  assert.equal(fresh.exists, false);
  assert.equal(existsSync(path.join(projectsRoot, 'op-002-loja')), false);
  res = await api('/api/claude/settings?scope=project&project=op-002-loja', { method: 'PUT', body: JSON.stringify({ text: '{"model":"haiku"}' }) });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(readFileSync(path.join(projectsRoot, 'op-002-loja', '.claude', 'settings.json'), 'utf8')), { model: 'haiku' });
  assert.equal((await api('/api/claude/settings?scope=project&project=..%2Fx')).status, 400);

  res = await api('/api/claude/settings?scope=user', { method: 'PUT', body: JSON.stringify({ text: '[1,2]' }) });
  assert.equal(res.status, 400);
  res = await api('/api/claude/settings?scope=user', { method: 'PUT', body: JSON.stringify({ text: '{bad' }) });
  assert.equal(res.status, 400);
});

test('workspace is saved in SQLite, injected into the page and guarded against stale writes', async () => {
  // No database yet: the page is told to ask how to start, and nothing reaches the disk before that.
  let tag = pageTag(await page(), 'squad-disk');
  assert.equal(tag.workspace, null);
  assert.equal(tag.rev, '');
  assert.equal(tag.setup, true);
  assert.equal(path.basename(tag.path), 'squad.db');
  assert.equal((await (await api('/api/workspace')).json()).exists, false);
  assert.equal((await (await api('/api/health')).json()).dbReady, false);
  const ws = { version: 2, agents: [], projects: [{ id: 'p1', name: 'Atlas </script><b>x</b> $& $1' }], squads: [] };
  assert.equal((await api('/api/workspace?base=', { method: 'PUT', body: JSON.stringify(ws) })).status, 503);
  assert.equal((await api('/api/workspace/snapshots')).status, 503);
  assert.equal((await api('/api/setup', { method: 'POST', body: JSON.stringify({ version: 2, agents: [], projects: [] }) })).status, 400);
  assert.equal(existsSync(path.join(dataRoot, 'squad.db')), false);

  // The page creates it with the workspace the person chose; a second setup is refused.
  let res = await api('/api/setup', { method: 'POST', body: JSON.stringify(ws) });
  assert.equal(res.status, 201, await res.clone().text());
  const first = await res.json();
  assert.match(first.rev, /^[0-9a-f]{16}$/);
  assert.equal(path.basename(first.path), 'squad.db');
  assert.ok(existsSync(path.join(dataRoot, 'squad.db')));
  assert.deepEqual((await (await api('/api/workspace')).json()).workspace, ws);
  assert.equal((await api('/api/setup', { method: 'POST', body: JSON.stringify(ws) })).status, 409);
  assert.equal((await (await api('/api/health')).json()).dbReady, true);

  // The page boots from the saved copy; `<` is escaped and replacement patterns are kept verbatim.
  const html = await page();
  assert.ok(!html.includes('</script><b>'));
  tag = pageTag(html, 'squad-disk');
  assert.deepEqual(tag.workspace, ws);
  assert.equal(tag.rev, first.rev);
  assert.equal(tag.setup, false);
  const meta = await (await api('/api/workspace?meta=1')).json();
  assert.equal(meta.rev, first.rev);
  assert.equal('workspace' in meta, false);

  // A write built on an older rev (a stale tab) is refused; the current rev is accepted and only the new row is written.
  const next = { ...ws, projects: [...ws.projects, { id: 'p2', name: 'Nova operação' }] };
  res = await api('/api/workspace?base=0000000000000000', { method: 'PUT', body: JSON.stringify(next) });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).rev, first.rev);
  assert.deepEqual((await (await api('/api/workspace')).json()).workspace, ws);
  res = await api(`/api/workspace?base=${first.rev}`, { method: 'PUT', body: JSON.stringify(next) });
  assert.equal(res.status, 200);
  const second = await res.json();
  assert.notEqual(second.rev, first.rev);
  assert.equal(second.changes, 1);
  assert.deepEqual((await (await api('/api/workspace')).json()).workspace, next);
  // The first overwrite of this bridge start keeps the previous workspace as a version.
  const versions = async () => (await (await api('/api/workspace/snapshots')).json()).snapshots;
  let list = await versions();
  assert.equal(list.length, 1);
  assert.equal(list[0].origin, 'disco');
  assert.deepEqual((await (await api(`/api/workspace/snapshots/${list[0].id}`)).json()).workspace, ws);

  // Same content again: nothing is rewritten and the rev stays.
  res = await (await api(`/api/workspace?base=${second.rev}`, { method: 'PUT', body: JSON.stringify(next) })).json();
  assert.equal(res.unchanged, true);
  assert.equal(res.rev, second.rev);

  // force skips the rev check and keeps the overwritten version.
  res = await api('/api/workspace?force=1', { method: 'PUT', body: JSON.stringify(ws) });
  assert.equal(res.status, 200);
  list = await versions();
  assert.equal(list.length, 2);
  assert.deepEqual((await (await api(`/api/workspace/snapshots/${list[0].id}`)).json()).workspace, next);

  // A browser copy becomes a version without touching the workspace.
  res = await api('/api/workspace/backups', { method: 'POST', body: JSON.stringify(next) });
  assert.equal(res.status, 201);
  const kept = (await res.json()).id;
  list = await versions();
  assert.equal(list.find(s => s.id === kept).origin, 'navegador');
  assert.deepEqual((await (await api(`/api/workspace/snapshots/${kept}`)).json()).workspace, next);
  assert.deepEqual((await (await api('/api/workspace')).json()).workspace, ws);
  assert.equal((await api('/api/workspace/snapshots/99999')).status, 404);

  // Anything that is not a v2 workspace is refused.
  for (const bad of [{}, { version: 1, agents: [], projects: [{}] }, { version: 2, agents: [], projects: [] }, [1]]) {
    res = await api('/api/workspace?force=1', { method: 'PUT', body: JSON.stringify(bad) });
    assert.equal(res.status, 400);
  }
  assert.equal((await fetch(BASE + '/api/workspace')).status, 401);
});

test('workspace rows round-trip byte for byte and diffs touch only what changed', async () => {
  const at = i => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
  const ws = {
    version: 2, extraTop: { kept: true },
    agents: [{ id: 'a1', name: 'VANGUARD', role: 'commander', tools: ['Read'], hex: { q: 0, r: 0 }, futureField: [1, { x: 2 }] }, { id: 'a1', name: 'DUP', role: 'qa' }, { name: 'SEM ID', role: 'po' }],
    conventionLibrary: { templates: [{ id: 't1', name: 'Base', content: 'x' }], subsets: [] },
    squads: [{ id: 's1', name: 'ALFA', commanderId: 'a1', operatorIds: ['a1'], agentIds: ['a1'] }],
    projects: [
      { id: 'p1', code: 'OP-001', name: 'Um', adrs: [{ title: 'Sem id', content: '## Contexto' }], sprints: [{ id: 'sp1', name: 'Sprint 01' }],
        features: [{ id: 'f1', key: 'F01', title: 'Login', status: 'done', route: ['a1'], outputs: [{ agentId: 'a1', at: at(1), text: 'ok' }, { agentId: 'a1', at: at(1), text: 'mesmo instante' }] }],
        logs: Array.from({ length: 500 }, (_, i) => ({ id: 'event-' + i, at: at(i), agentId: null, type: 'system', message: 'log ' + i, simulated: true })),
        handoffs: [{ id: 'h1', at: at(2), from: 'a1', to: 'a1', featureId: 'f1', context: 'ctx' }], settingsLike: null },
      { id: 'p2', name: 'Sem filhos' },
    ],
    projectId: 'p1', settings: { motion: true, runtime: { mode: 'claude' } },
  };
  const put = async (body, q = 'force=1') => (await api(`/api/workspace?${q}`, { method: 'PUT', body: JSON.stringify(body) })).json();
  const get = async () => (await (await api('/api/workspace')).json()).workspace;
  let res = await put(ws);
  assert.equal(res.ok, true);
  assert.equal(JSON.stringify(await get()), JSON.stringify(ws));

  // A capped log: one entry in, the first one out. Two row changes, not 500.
  const capped = structuredClone(ws);
  capped.projects[0].logs.push({ id: 'event-500', at: at(500), agentId: null, type: 'system', message: 'log 500', simulated: true });
  capped.projects[0].logs.shift();
  res = await put(capped, `base=${res.rev}`);
  assert.equal(res.changes, 2);
  assert.equal(JSON.stringify(await get()), JSON.stringify(capped));

  // Reordering features and editing one field.
  const moved = structuredClone(capped);
  moved.projects.reverse();
  moved.agents[0].name = 'VANGUARD II';
  res = await put(moved, `base=${res.rev}`);
  assert.ok(res.changes >= 3 && res.changes <= 4, `changes=${res.changes}`);
  assert.equal(JSON.stringify(await get()), JSON.stringify(moved));

  // Generated columns make the entities queryable with plain SQL.
  const db = new Database(path.join(dataRoot, 'squad.db'), { readonly: true });
  try {
    assert.deepEqual(db.prepare('SELECT name, role FROM agents ORDER BY pos').all().map(r => `${r.name}/${r.role}`), ['VANGUARD II/commander', 'DUP/qa', 'SEM ID/po']);
    assert.equal(db.prepare("SELECT title FROM features WHERE status = 'done'").pluck().get(), 'Login');
    assert.equal(db.prepare('SELECT count(*) FROM logs').pluck().get(), 500);
    assert.equal(db.prepare('SELECT count(*) FROM feature_outputs').pluck().get(), 2);
  } finally { db.close(); }
});

test('JSON files from the previous version are migrated once and kept in legacy-json', async () => {
  const dir = tmp('squad-legacy-'); extraDirs.push(dir);
  const legacy = { version: 2, agents: [{ id: 'a1', name: 'VANGUARD', role: 'commander' }], projects: [{ id: 'p1', name: 'Legado', logs: [{ id: 'l1', at: '2026-01-01T00:00:00.000Z', message: 'x' }] }], squads: [] };
  const text = JSON.stringify(legacy, null, 2) + '\n';
  writeFileSync(path.join(dir, 'workspace.json'), text);
  writeFileSync(path.join(dir, 'workspace.json.bak'), text);
  mkdirSync(path.join(dir, 'backups'));
  writeFileSync(path.join(dir, 'backups', 'workspace-2026-10-01T10-00-00-000Z-disco.json'), JSON.stringify({ ...legacy, projects: [{ id: 'p0', name: 'Antigo' }] }));
  let b = await startBridge(dir);
  let info = await (await b.api('/api/workspace')).json();
  assert.deepEqual(info.workspace, legacy);
  // Same rev the file-based bridge gave it, so the browsers' copies still match.
  assert.equal(info.rev, createHash('sha1').update(text).digest('hex').slice(0, 16));
  assert.ok(existsSync(path.join(dir, 'legacy-json', 'workspace.json')));
  assert.ok(existsSync(path.join(dir, 'legacy-json', 'backups')));
  assert.equal(existsSync(path.join(dir, 'workspace.json')), false);
  const snaps = (await (await b.api('/api/workspace/snapshots')).json()).snapshots;
  assert.deepEqual(snaps.map(s => s.origin).sort(), ['disco', 'migração']);
  assert.equal(snaps.find(s => s.origin === 'disco').createdAt, '2026-10-01T10:00:00.000Z');
  assert.match(b.out(), /migrado/);
  await b.stop();
  // A workspace.json dropped there later is not imported again.
  writeFileSync(path.join(dir, 'workspace.json'), JSON.stringify({ ...legacy, projects: [{ id: 'p9', name: 'Outro' }] }));
  b = await startBridge(dir);
  info = await (await b.api('/api/workspace')).json();
  assert.deepEqual(info.workspace, legacy);
  await b.stop();
});

test('a second bridge on a port in use explains it and leaves the database alone', async () => {
  const dir = tmp('squad-busy-'); extraDirs.push(dir);
  // A data/workspace.json would be imported (and moved) as soon as the database opened.
  writeFileSync(path.join(dir, 'workspace.json'), JSON.stringify({ version: 2, agents: [], projects: [{ id: 'p1', name: 'Ocupada' }], squads: [] }));
  await assert.rejects(startBridge(dir, PORT), err => /server exited 1/.test(err.message) && /porta \d+ já está em uso/.test(err.message));
  assert.ok(existsSync(path.join(dir, 'workspace.json')));
  assert.equal(existsSync(path.join(dir, 'squad.db')), false);
  assert.equal((await api('/api/health')).status, 200);
});

test('run history survives a restart; a run cut by a dead bridge comes back interrupted', async () => {
  const dir = tmp('squad-runs-'); extraDirs.push(dir);
  let b = await startBridge(dir);
  let res = await b.api('/api/setup', { method: 'POST', body: JSON.stringify({ version: 2, agents: [], projects: [{ id: 'p1', name: 'Histórico' }], squads: [] }) });
  assert.equal(res.status, 201);
  res = await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'hello', label: 'passo', options: { cwd: workdir, partial: true }, meta: { projectId: 'p1', agentId: 'agent-x', featureId: 'f1', kind: 'step', other: 'x' } }) });
  assert.equal(res.status, 201);
  const done = (await res.json()).runId;
  const live = await collect(done, b.base, b.token);
  assert.equal(live.at(-1).type, 'exit');
  res = await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'SLEEP', options: { cwd: workdir }, meta: { projectId: 'p1', kind: 'chat' } }) });
  const cut = (await res.json()).runId;
  await new Promise(r => setTimeout(r, 700)); // the first events reach the database
  await b.stop(true);

  b = await startBridge(dir);
  const list = (await (await b.api('/api/runs?projectId=p1')).json()).runs;
  assert.deepEqual(list.map(r => r.id).sort(), [done, cut].sort());
  const first = list.find(r => r.id === done);
  assert.equal(first.status, 'done');
  assert.equal(first.agentId, 'agent-x');
  assert.equal(first.kind, 'step');
  assert.equal(first.costUsd, 0.001);
  assert.equal(list.find(r => r.id === cut).status, 'interrupted');
  // Replay from the database: the same events, without the partial text deltas.
  const replay = await collect(done, b.base, b.token);
  assert.deepEqual(replay.map(e => e.type), live.filter(e => e.type !== 'stream_event').map(e => e.type));
  assert.ok(live.some(e => e.type === 'stream_event'));
  const cutEvents = await collect(cut, b.base, b.token);
  assert.equal(cutEvents.at(-1).type, 'exit');
  assert.equal(cutEvents.at(-1).status, 'interrupted');
  try { process.kill(cutEvents.find(e => e.subtype === 'spawned').pid); } catch {}
  const detail = await (await b.api(`/api/runs/${done}`)).json();
  assert.equal(detail.run.status, 'done');
  assert.equal(detail.result.costUsd, 0.001);
  assert.equal((await b.api('/api/runs/nope')).status, 404);
  await b.stop();
});

test('operation room messages are saved incrementally, trimmed and handed to the page', async () => {
  const ws = { version: 2, agents: [{ id: 'a1', name: 'VANGUARD', role: 'commander' }], projects: [{ id: 'p1', name: 'Um', features: [{ id: 'f1', title: 'Login' }] }], squads: [] };
  assert.equal((await api('/api/workspace?force=1', { method: 'PUT', body: JSON.stringify(ws) })).status, 200);
  const msgs = Array.from({ length: 820 }, (_, i) => ({ id: 'rm' + (i + 1), at: new Date().toISOString(), kind: 'say', agentId: 'a1', text: 'm' + (i + 1) }));
  const room = body => api('/api/rooms/p1', { method: 'POST', body: JSON.stringify(body) });
  assert.equal((await room({ seq: 410, upserts: msgs.slice(0, 410) })).status, 200);
  assert.equal((await room({ seq: 820, upserts: msgs.slice(410) })).status, 200);
  // Invalid ids and kinds are ignored; one update, one removal and a long baton (cut to what the room shows).
  assert.equal((await (await room({ upserts: [{ id: 'x1', kind: 'say' }, { id: 'rm9999', kind: 'evil' }] })).json()).saved, 0);
  await room({ seq: 821, upserts: [{ ...msgs[819], text: 'editado' }, { id: 'rm821', at: new Date().toISOString(), kind: 'baton', from: 'a1', to: null, text: 'x'.repeat(20000) }], removes: ['rm819'] });
  assert.equal((await api('/api/rooms/..%2Fx', { method: 'POST', body: '{}' })).status, 400);

  const db = new Database(path.join(dataRoot, 'squad.db'), { readonly: true });
  try { assert.equal(db.prepare("SELECT count(*) FROM room_messages WHERE project_id = 'p1'").pluck().get(), 800); } finally { db.close(); }
  const r = pageTag(await page(), 'squad-memory').rooms.p1;
  assert.equal(r.seq, 821);
  assert.equal(r.messages.length, 200);
  assert.equal(r.messages.at(-1).id, 'rm821');
  assert.equal(r.messages.at(-1).text.length, 8001);
  assert.equal(r.messages.find(m => m.id === 'rm820').text, 'editado');
  assert.equal(r.messages.some(m => m.id === 'rm819'), false);
});

test('chats are saved per kind, capped and swept when their feature is gone', async () => {
  const msgs = n => Array.from({ length: n }, (_, i) => ({ id: 'm' + (i + 1), at: Date.now(), role: i % 2 ? 'agent' : 'user', text: 'msg ' + (i + 1) }));
  const put = (kind, key, data, projectId = 'p1') => api(`/api/chats/${kind}/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ projectId, data }) });
  assert.equal((await put('agent', 'a1', { seq: 310, greeting: 'oi', focus: null, messages: msgs(310) })).status, 200);
  assert.equal((await put('feature', 'f1', { seq: 2, greeting: 'olá', messages: msgs(2) })).status, 200);
  assert.equal((await put('doc', 'p1:kickoff:a1+a2', { seq: 1, greeting: 'bom dia', greetings: { a1: 'oi' }, since: 0, messages: msgs(1) })).status, 200);
  assert.equal((await put('feature', 'gone', { seq: 1, messages: msgs(1) })).status, 200);
  assert.equal((await put('evil', 'a1', { messages: [] })).status, 400);
  assert.equal((await put('agent', '../a1', { messages: [] })).status, 400);
  assert.equal((await put('agent', 'a1', { greeting: 'sem mensagens' })).status, 400);

  let chats = pageTag(await page(), 'squad-memory').chats;
  assert.equal(chats.agent.a1.messages.length, 300);
  assert.equal(chats.agent.a1.messages[0].id, 'm11');
  assert.equal(chats.agent.a1.greeting, 'oi');
  assert.equal(chats.feature.f1.messages.length, 2);
  assert.deepEqual(chats.doc['p1:kickoff:a1+a2'].greetings, { a1: 'oi' });
  assert.equal(chats.feature.gone, undefined); // no feature 'gone' in the workspace
  assert.equal((await api('/api/chats/agent/a1', { method: 'DELETE' })).status, 200);
  chats = pageTag(await page(), 'squad-memory').chats;
  assert.equal(chats.agent.a1, undefined);
});

/* ---------- Plugins (plugins/loader.js, docs/plans/plugins-conteudo.md) ---------- */
// 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const writeTree = (dir, files) => { for (const [rel, data] of Object.entries(files)) { const f = path.join(dir, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data)); } };

test('without plugins the page gets an empty squad-plugins tag', async () => {
  assert.deepEqual(pageTag(await page(), 'squad-plugins'), { plugins: [], runtime: {}, warnings: [], others: [] });
  assert.equal((await (await api('/api/health')).json()).plugins, 0);
  assert.equal((await fetch(BASE + '/api/plugins')).status, 401);
});

test('plugins from the local config and SQUAD_PLUGINS are loaded, validated and injected; changes are reread', async () => {
  const root = tmp('squad-plugins-'); extraDirs.push(root);
  writeTree(path.join(root, 'good'), {
    'squad-plugin.json': {
      id: 'acme', name: 'Acme', version: '1.2.0', description: 'Plugin de teste',
      categories: [{ key: 'acme-cat', label: 'Acme', icon: 'flow', description: 'x', before: 'outros' }, { key: 'Bad Key' }],
      avatars: [{ key: 'triagem', label: 'TRIAGEM', file: 'avatars/triagem.png' }, { key: 'vec', file: 'avatars/vec.svg' }, { key: 'fake', file: 'avatars/fake.png' }],
      themes: [{ key: 'noite', label: 'Noite', ui: { '--bg': '#05070a', '--line': 'rgba(1, 2, 3, 0.5)', '--Bad': '#fff', '--x': 'url(evil)' }, city: { bg: '#ff0000', build: 0x00ff00, exposure: 3, other: 1 }, agent: { blue: 'blue' }, run: { work: '0x112233' } }],
      runtime: { model: 'opus', concurrency: 3, foo: 1 },
    },
    'avatars/triagem.png': PNG,
    'avatars/vec.svg': '<svg/>',
    'avatars/fake.png': 'not an image',
    'conventions.json': { families: { backend: { templates: [{ key: 'acme-java', name: 'Acme Java', content: '# Regras' }, { key: 'no-content' }] }, constructor: { templates: [{ key: 'proto-tpl', content: 'x' }] } },
      subsets: [{ key: 'acme-sub', name: 'S', content: 'c', group: 'style' }, { key: 'huge-sub', content: 'x'.repeat(8001) }, { key: 'max-sub', content: 'x'.repeat(8000) }, { key: 'prototype', content: 'x' }], groups: [] },
    'agents/PROTO.md': '---\nname: PROTO\nslot: prd\nrole: po\n__proto__: x\n---\n',
    'agents/LONG.md': '---\nname: LONG\nslot: prd\nrole: po\n---\n' + 'y'.repeat(16001) + '\n',
    'agents/TRIAGEM.md': '---\nname: TRIAGEM   # comentário\nslot: operator\ncategory: acme-cat\nrole: backend\nspecialty: "Java, Spring"\nicon: flow\nmodel: opus\neffort: high\ntools: [Read, Glob, Grep]\navatar: triagem\ndescription: Triagem do backend\nsoul: Calmo\nhellos:\n  - Oi! Qual é a feature?\n  - \'E aí # tudo\'\nconventions:\n  template: acme-java\n  subsets: [style-java, acme-sub]\n---\nConduza como o TRIAGEM.\n',
    'agents/VIGIA.md': '---\nname: VIGIA\nslot: commander\nrole: commander\n---\nComande.\n',
    'agents/BROKEN.md': '---\nname: BROKEN\nslot: operator\nrole: qa\nnested:\n  deep:\n    x: 1\n---\n',
    'agents/NOSLOT.md': '---\nname: NOSLOT\nrole: qa\n---\n',
    'agents/TOOLY.md': '---\nname: TOOLY\nslot: operator\nrole: qa\ntools: [Read, Foo]\n---\n',
    'agents/TWICE.md': '---\nname: TWICE\nslot: operator\nrole: qa\ntools: [Read, Read]\n---\n',
  });
  writeTree(path.join(root, 'dup'), { 'squad-plugin.json': { id: 'acme', name: 'Outro Acme' } });
  writeTree(path.join(root, 'other'), { 'squad-plugin.json': { id: 'other' }, 'agents/TRIAGEM.md': '---\nname: TRIAGEM\nslot: adr\nrole: architect\n---\n', 'agents/ECHO.md': '---\nname: ECHO\nslot: prd\nrole: po\n---\nPRD.\n' });
  writeTree(path.join(root, 'off'), { 'squad-plugin.json': { id: 'off' }, 'agents/OFF.md': '---\nname: OFFLINE\nslot: prd\nrole: po\n---\n' });
  writeTree(path.join(root, 'linky'), { 'squad-plugin.json': { id: 'linky', avatars: [{ key: 'evil', file: 'avatars/evil.png' }] } });
  writeTree(path.join(root, 'outside'), { 'OUT.md': '---\nname: OUTSIDER\nslot: prd\nrole: po\n---\n', 'evil.png': PNG });
  let links = true;
  try {
    mkdirSync(path.join(root, 'linky', 'agents'), { recursive: true }); mkdirSync(path.join(root, 'linky', 'avatars'), { recursive: true });
    symlinkSync(path.join(root, 'outside', 'OUT.md'), path.join(root, 'linky', 'agents', 'OUT.md'));
    symlinkSync(path.join(root, 'outside', 'evil.png'), path.join(root, 'linky', 'avatars', 'evil.png'));
  } catch { links = false; } // Windows without symlink permission
  writeTree(path.join(root, 'envplugin'), { 'squad-plugin.json': { id: 'envplugin' } });
  writeTree(path.join(root, 'env2'), { 'squad-plugin.json': { id: 'env-two' } });
  const cfg = path.join(root, 'cfg', 'local.json');
  const cfgBody = { plugins: { paths: ['../good', '../dup', '../other', '../off', '../linky', '../missing'], disabled: ['off'] }, runtime: { model: 'sonnet', permissionMode: 'nope' }, profiles: [{ name: 'p1' }] };
  writeTree(path.dirname(cfg), { 'local.json': cfgBody });

  const data = tmp('squad-data-plugins-'); extraDirs.push(data);
  const b = await startBridge(data, undefined, { SQUAD_CONFIG: cfg, SQUAD_PLUGINS: [path.join(root, 'envplugin'), path.join(root, 'env2')].join(path.delimiter) });
  const html = await page(b.base);
  const tag = pageTag(html, 'squad-plugins');
  assert.deepEqual(tag.plugins.map(p => p.id), ['acme', 'other', 'linky', 'envplugin', 'env-two']);
  const acme = tag.plugins[0];
  assert.equal(acme.name, 'Acme'); assert.equal(acme.version, '1.2.0'); assert.equal(acme.path, realpathSync(path.join(root, 'good')));
  assert.deepEqual(acme.categories, [{ key: 'acme-cat', label: 'Acme', icon: 'flow', description: 'x', before: 'outros' }]);
  assert.deepEqual(acme.presets.map(p => p.name), ['TRIAGEM', 'VIGIA']);
  assert.deepEqual(acme.presets[0], {
    slot: 'operator', category: 'acme-cat', name: 'TRIAGEM', role: 'backend', specialty: 'Java, Spring', icon: 'flow', model: 'opus', effort: 'high',
    tools: ['Read', 'Glob', 'Grep'], avatar: 'triagem', description: 'Triagem do backend', style: 'Conduza como o TRIAGEM.', soul: 'Calmo',
    hellos: ['Oi! Qual é a feature?', 'E aí # tudo'], conv: { template: 'acme-java', subsets: ['style-java', 'acme-sub'] },
  });
  assert.equal(acme.presets[1].tools, null); assert.equal(acme.presets[1].conv, null); assert.equal(acme.presets[1].category, '');
  assert.equal(acme.avatars.length, 1);
  assert.equal(acme.avatars[0].key, 'plugin:acme/triagem');
  assert.equal(acme.avatars[0].src, 'data:image/png;base64,' + PNG.toString('base64'));
  assert.deepEqual(acme.themes, [{ key: 'acme/noite', label: 'Noite', ui: { '--bg': '#05070a', '--line': 'rgba(1, 2, 3, 0.5)' }, city: { bg: 0xff0000, build: 0x00ff00 }, office: {}, agent: {}, run: { work: 0x112233 } }]);
  assert.deepEqual(acme.conventions.families.backend.templates.map(t => t.key), ['acme-java']);
  assert.deepEqual(acme.conventions.subsets.map(t => t.key), ['acme-sub', 'max-sub']);
  assert.deepEqual(acme.runtime, { model: 'opus', concurrency: 3 });
  // A repeated name is not reserved by the bridge: every candidate reaches the page, which keeps the first one it accepts (role/slot).
  assert.deepEqual(tag.plugins[1].presets.map(p => p.name), ['ECHO', 'TRIAGEM']);
  assert.deepEqual(tag.runtime, { model: 'sonnet', concurrency: 3 }); // the configuration wins over the plugins
  const w = tag.warnings.join('\n');
  for (const re of [/dup: id acme repetido/, /\[acme\] agents\/BROKEN\.md: linha 7: só um nível/, /\[acme\] agents\/NOSLOT\.md: slot inválido/, /\[acme\] agents\/TOOLY\.md: tools: ferramenta desconhecida: Foo/, /\[acme\] agents\/TWICE\.md: tools: ferramenta repetida: Read/,
    /SVG não é aceito/, /fake\.png: não é uma imagem/, /key de categoria inválida/, /exposure/, /--Bad/, /cor inválida em --x/, /agent\.blue/, /runtime\.foo/, /runtime\.permissionMode/, /missing: pasta do plugin não encontrada/,
    /\[acme\] conventions\.json: template inválido em backend/, /família constructor inválida/, /subset huge-sub ignorado: content deve ser texto de até 8000/, /item inválido em subsets/,
    /\[acme\] agents\/PROTO\.md: .*chave reservada: __proto__/, /\[acme\] agents\/LONG\.md: corpo maior que 16000/]) assert.match(w, re);
  assert.ok(!Object.hasOwn(acme.conventions.families, 'constructor'));
  assert.ok(!/OFFLINE|off\/|repetido \(já definido/.test(w));
  if (links) {
    assert.deepEqual(tag.plugins[2].presets, []); assert.deepEqual(tag.plugins[2].avatars, []);
    assert.match(w, /\[linky\] agents\/OUT\.md: aponta para fora da pasta do plugin/);
    assert.match(w, /avatars\/evil\.png: aponta para fora da pasta do plugin/);
  }
  assert.match(b.out(), /Plugins: acme 1\.2\.0 \(2 agente\(s\)\), acme \(inválido: id repetido .*\), other \(2 agente\(s\)\), off \(desligado: desligado em plugins\.disabled\)/);

  // /api/plugins: same data without the data URLs, plus the configuration; /api/health counts the plugins.
  assert.equal((await fetch(b.base + '/api/plugins')).status, 401);
  const listed = await (await b.api('/api/plugins')).json();
  assert.equal(listed.ok, true);
  assert.deepEqual(listed.plugins[0].avatars, [{ key: 'plugin:acme/triagem', label: 'TRIAGEM' }]);
  assert.ok(!JSON.stringify(listed).includes('base64'));
  assert.deepEqual(listed.config.files, [cfg]);
  assert.deepEqual(listed.config.disabled, ['off']);
  assert.deepEqual(listed.config.profiles, []); // no key: ignored with a warning; the other items would still sync
  assert.equal(listed.config.profilesError, false);
  assert.match(listed.warnings.join('\n'), /profiles\[0\]: "key" ausente ou inválida/);
  assert.ok(listed.config.paths.includes(path.join(root, 'good')) && listed.config.paths.includes(path.join(root, 'envplugin')));
  assert.equal((await (await b.api('/api/health')).json()).plugins, 5);

  // Edits are picked up on the next page load: a new agent file, then an invalid configuration (only SQUAD_PLUGINS stays).
  writeTree(path.join(root, 'envplugin'), { 'agents/NEWBIE.md': '---\nname: NEWBIE\nslot: prd\nrole: po\n---\nNovo.\n' });
  assert.deepEqual(pageTag(await page(b.base), 'squad-plugins').plugins[3].presets.map(p => p.name), ['NEWBIE']);
  writeFileSync(cfg, '{ "plugins": {');
  const broken = pageTag(await page(b.base), 'squad-plugins');
  assert.deepEqual(broken.plugins.map(p => p.id), ['envplugin', 'env-two']);
  assert.match(broken.warnings.join('\n'), /local\.json: JSON inválido, arquivo ignorado/);
  assert.deepEqual(broken.runtime, {});
  await b.stop();
});

/* ---------- Perfis, Adapter codex, usage, MCP and telemetry ---------- */
const WS = { version: 2, agents: [], projects: [{ id: 'p1', name: 'Perfis' }], squads: [] };
/** A bridge on its own database, created through /api/setup (the migration then makes the default Perfis). */
async function setupBridge(extraEnv = {}) {
  const dir = tmp('squad-pf-'); extraDirs.push(dir);
  const b = await startBridge(dir, nextPort++, extraEnv);
  const res = await b.api('/api/setup', { method: 'POST', body: JSON.stringify(WS) });
  assert.equal(res.status, 201, await res.clone().text());
  b.dir = dir;
  return b;
}
async function runOn(b, body) {
  const res = await b.api('/api/runs', { method: 'POST', body: JSON.stringify(body) });
  assert.equal(res.status, 201, await res.clone().text());
  const out = await res.json();
  return { ...out, events: await collect(out.runId, b.base, b.token) };
}
const profilesOf = async b => (await (await b.api('/api/profiles')).json()).profiles;
async function newProfile(b, p) {
  const res = await b.api('/api/profiles', { method: 'POST', body: JSON.stringify(p) });
  assert.equal(res.status, 201, await res.clone().text());
  return (await res.json()).profile;
}
const codexRuns = () => existsSync(codexLog) ? readFileSync(codexLog, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const codexRun = marker => codexRuns().filter(e => e.stdin.includes(marker)).at(-1);
const exitOf = events => events.find(e => e.type === 'exit');
const profileEvt = events => events.find(e => e.type === 'bridge' && e.subtype === 'profile');

test('Perfis: the in-memory default before the database, the migration creates Claude (padrão) and Codex (padrão)', async () => {
  const dir = tmp('squad-pf0-'); extraDirs.push(dir);
  const b = await startBridge(dir);
  let body = await (await b.api('/api/profiles')).json();
  assert.deepEqual(body.profiles.map(p => [p.id, p.adapter, p.isDefault]), [['claude-default', 'claude', true]]);
  assert.match(body.profiles[0].status.version, /9\.9\.9/);
  assert.ok(body.adapters.claude.models.some(m => m.id === 'sonnet') && body.adapters.codex.efforts.includes('xhigh'));
  assert.equal((await b.api('/api/profiles', { method: 'POST', body: JSON.stringify({ name: 'X', adapter: 'claude' }) })).status, 503);
  assert.equal((await b.api('/api/telemetry', { method: 'PUT', body: JSON.stringify({ endpoint: '' }) })).status, 503);
  // Runs work before the setup, on the in-memory default.
  const r = await runOn(b, { prompt: 'hi', options: { cwd: workdir } });
  assert.equal(profileEvt(r.events).profileId, 'claude-default');
  assert.equal((await b.api('/api/setup', { method: 'POST', body: JSON.stringify(WS) })).status, 201);
  const list = await profilesOf(b);
  assert.deepEqual(list.map(p => [p.id, p.name, p.adapter, p.isDefault]), [['claude-default', 'Claude (padrão)', 'claude', true], ['codex-default', 'Codex (padrão)', 'codex', false]]);
  const codex = list.find(p => p.adapter === 'codex');
  assert.equal(codex.ignoreUserConfig, true);
  assert.match(codex.status.version, /codex-cli 9\.9\.9/);
  assert.deepEqual(codex.telemetry, { enabled: false, native: false, content: false });
  const health = await (await b.api('/api/health')).json();
  assert.equal(health.profiles, 2);
  assert.deepEqual(health.engines, { claude: true, codex: true });
  await b.stop();
  const db = new Database(path.join(dir, 'squad.db'), { readonly: true });
  try {
    assert.equal(db.pragma('user_version', { simple: true }), 5);
    assert.ok(db.prepare('PRAGMA table_info(runs)').all().some(c => c.name === 'parent_run_id'));
  } finally { db.close(); }
  // A deleted Codex (padrão) is not created again at the next start.
  const b2 = await startBridge(dir);
  assert.equal((await b2.api('/api/profiles/codex-default', { method: 'DELETE' })).status, 200);
  await b2.stop();
  const b3 = await startBridge(dir);
  await new Promise(r => setTimeout(r, 200));
  assert.deepEqual((await profilesOf(b3)).map(p => p.id), ['claude-default']);
  await b3.stop();
});

test('Perfis: CRUD, validation, default and reserve', async () => {
  const b = await setupBridge();
  const cfg = tmp('squad-cfg-'); extraDirs.push(cfg);
  const a = await newProfile(b, { name: 'Claude B', adapter: 'claude', configDir: cfg, concurrency: 3, threshold: 80 });
  assert.equal(a.configDir, realpathSync.native(cfg));
  assert.equal(a.status.configDirOk, true);
  assert.deepEqual(a.windows, {});
  assert.equal(a.active, 0);
  const bad = [
    {}, { name: '', adapter: 'claude' }, { name: 'x'.repeat(41), adapter: 'claude' }, { name: 'G', adapter: 'gemini' },
    { name: 'R', adapter: 'claude', configDir: 'relativo' }, { name: 'N', adapter: 'claude', configDir: path.join(cfg, 'nao-existe') },
    { name: 'B', adapter: 'claude', bin: 'executavel-que-nao-existe-xyz' }, { name: 'C', adapter: 'claude', concurrency: 0 }, { name: 'C', adapter: 'claude', concurrency: 11 },
    { name: 'T', adapter: 'claude', threshold: 49 }, { name: 'F', adapter: 'claude', fallbackId: 'codex-default' }, { name: 'F', adapter: 'claude', fallbackId: 'nao-existe' },
    { name: 'E', adapter: 'claude', effort: 'minimal' }, { name: 'M', adapter: 'codex', model: 'a b' },
  ];
  for (const p of bad) assert.equal((await b.api('/api/profiles', { method: 'POST', body: JSON.stringify(p) })).status, 400, JSON.stringify(p));
  assert.equal((await b.api('/api/profiles', { method: 'POST', body: JSON.stringify({ name: 'Claude B', adapter: 'claude' }) })).status, 409);
  // Partial update keeps the rest; a Perfil cannot be its own reserve.
  let res = await b.api(`/api/profiles/${a.id}`, { method: 'PUT', body: JSON.stringify({ concurrency: 5 }) });
  assert.equal(res.status, 200);
  assert.deepEqual([(await res.json()).profile.concurrency, a.threshold], [5, 80]);
  assert.equal((await b.api(`/api/profiles/${a.id}`, { method: 'PUT', body: JSON.stringify({ fallbackId: a.id }) })).status, 400);
  const reserve = await newProfile(b, { name: 'Claude C', adapter: 'claude' });
  assert.equal((await b.api(`/api/profiles/${a.id}`, { method: 'PUT', body: JSON.stringify({ fallbackId: reserve.id }) })).status, 200);
  // The Adapter does not change after creation (a reserve of the same Adapter would stop matching); the same value is accepted.
  res = await b.api(`/api/profiles/${reserve.id}`, { method: 'PUT', body: JSON.stringify({ adapter: 'codex', effort: '' }) });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Adapter de um Perfil não muda/);
  assert.equal((await profilesOf(b)).find(p => p.id === reserve.id).adapter, 'claude');
  assert.equal((await b.api(`/api/profiles/${reserve.id}`, { method: 'PUT', body: JSON.stringify({ adapter: 'claude', concurrency: 2 }) })).status, 200);
  // Exactly one default; the default cannot be deleted; deleting a reserve clears who pointed at it.
  res = await b.api(`/api/profiles/${a.id}/default`, { method: 'POST' });
  assert.equal(res.status, 200);
  let list = await profilesOf(b);
  assert.deepEqual(list.filter(p => p.isDefault).map(p => p.id), [a.id]);
  assert.equal((await b.api(`/api/profiles/${a.id}`, { method: 'DELETE' })).status, 409);
  assert.equal((await b.api('/api/profiles/claude-default/default', { method: 'POST' })).status, 200);
  assert.equal((await b.api(`/api/profiles/${reserve.id}`, { method: 'DELETE' })).status, 200);
  list = await profilesOf(b);
  assert.equal(list.find(p => p.id === a.id).fallbackId, '');
  assert.equal((await b.api('/api/profiles/nao-existe', { method: 'DELETE' })).status, 404);
  const test1 = await (await b.api(`/api/profiles/${a.id}/test`, { method: 'POST' })).json();
  assert.equal(test1.ok, true);
  assert.match(test1.status.version, /9\.9\.9/);
  // settings.json of the user scope follows a Claude Perfil's account folder.
  res = await b.api(`/api/claude/settings?scope=user&profile=${a.id}`, { method: 'PUT', body: JSON.stringify({ text: '{"model":"haiku"}' }) });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(readFileSync(path.join(cfg, 'settings.json'), 'utf8')), { model: 'haiku' });
  assert.equal((await b.api('/api/claude/settings?scope=user&profile=codex-default')).status, 400);
  await b.stop();
});

test('Perfis: account folders reach the child (CLAUDE_CONFIG_DIR, CODEX_HOME), with the profile event and usage on exit', async () => {
  const b = await setupBridge();
  const cfgA = tmp('squad-cfga-'), cfgB = tmp('squad-cfgb-'); extraDirs.push(cfgA, cfgB);
  const claude = await newProfile(b, { name: 'Claude A', adapter: 'claude', configDir: cfgA });
  const codex = await newProfile(b, { name: 'Codex B', adapter: 'codex', configDir: cfgB });
  let r = await runOn(b, { prompt: 'hello', options: { cwd: workdir, profile: claude.id } });
  const claudeRunId = r.runId;
  assert.equal(r.events.find(e => e.type === 'system' && e.subtype === 'init').configDir, realpathSync.native(cfgA));
  assert.deepEqual(profileEvt(r.events), { type: 'bridge', subtype: 'profile', profileId: claude.id, name: 'Claude A', adapter: 'claude' });
  let exit = exitOf(r.events);
  assert.deepEqual([exit.profileId, exit.adapter], [claude.id, 'claude']);
  assert.deepEqual(exit.usage, { input: 10, cacheRead: 20, cacheWrite: 30, output: 4, reasoning: 2 });
  // claudePath only counts without a Perfil executable; unknown Perfil → default.
  r = await runOn(b, { prompt: 'x', options: { cwd: workdir, profile: 'nao-existe' } });
  assert.equal(profileEvt(r.events).profileId, 'claude-default');
  r = await runOn(b, { prompt: 'ENVCHECK-1', options: { cwd: workdir, profile: codex.id } });
  const seen = codexRun('ENVCHECK-1');
  assert.equal(seen.env.CODEX_HOME, realpathSync.native(cfgB));
  assert.equal(seen.env.SQUAD_MCP_TOKEN, null); // no colleagues, no MCP
  exit = exitOf(r.events);
  assert.deepEqual([exit.status, exit.adapter, exit.model], ['done', 'codex', 'gpt-fake-1']); // the model comes from the session file
  // The run still in memory reports the same usage and effective model as the history would.
  const mem = (await (await b.api(`/api/runs/${r.runId}`)).json()).run;
  assert.deepEqual([mem.profileId, mem.adapter, mem.model, mem.usage], [codex.id, 'codex', 'gpt-fake-1', { input: 100, cacheRead: 40, cacheWrite: 5, output: 7, reasoning: 3 }]);
  const memClaude = (await (await b.api(`/api/runs/${claudeRunId}`)).json()).run;
  assert.deepEqual([memClaude.profileId, memClaude.usage, memClaude.costUsd], [claude.id, { input: 10, cacheRead: 20, cacheWrite: 30, output: 4, reasoning: 2 }, 0.001]);
  // A Codex Perfil lists the models of its own account folder.
  writeFileSync(path.join(cfgB, 'models_cache.json'), JSON.stringify({ models: [{ slug: 'gpt-conta-b', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'max' }] }, { slug: 'oculto', visibility: 'hide' }] }));
  const viewB = (await profilesOf(b)).find(p => p.id === codex.id);
  assert.deepEqual(viewB.modelEfforts, { 'gpt-conta-b': ['low', 'max'] });
  assert.equal((await profilesOf(b)).find(p => p.id === claude.id).modelEfforts, undefined);
  await b.stop();
});

test('codex: argv from the agent options, system prompt in front of the task on stdin', async () => {
  const b = await setupBridge();
  const r1 = await runOn(b, { prompt: 'ARGV-1', systemPrompt: 'be brief', options: { cwd: workdir, profile: 'codex-default', tools: [], model: 'sonnet', maxBudgetUsd: 2, permissionMode: 'dontAsk' } });
  const a1 = codexRun('ARGV-1');
  assert.deepEqual(a1.argv.slice(0, 7), ['exec', '--json', '-C', realpathSync.native(workdir), '--sandbox', 'read-only', '-c']);
  assert.equal(a1.argv[7], 'approval_policy="never"');
  assert.ok(a1.argv.includes('--ignore-user-config') && a1.argv.includes('skills.include_instructions=false'));
  assert.ok(a1.argv.includes('--skip-git-repo-check'), 'workdir is not a git repository');
  assert.equal(a1.argv.at(-1), '-');
  assert.ok(!a1.argv.includes('-m'), 'a Claude model never reaches codex');
  assert.equal(a1.stdin, '<instrucoes-do-agente>\nbe brief\n</instrucoes-do-agente>\n\n<tarefa>\nARGV-1\n</tarefa>');
  const warnings = r1.events.filter(e => e.type === 'bridge' && e.subtype === 'warning').map(e => e.message).join('\n');
  assert.match(warnings, /orçamento/);
  assert.match(warnings, /sonnet/);
  assert.equal(r1.args.at(-1), '-');
  assert.equal(r1.events.find(e => e.subtype === 'spawned').adapter, 'codex');
  // Edit/Write/Bash → workspace-write; max → xhigh (the model does not list max); the Perfil can keep the user config.
  const p = await newProfile(b, { name: 'Codex cru', adapter: 'codex', ignoreUserConfig: false, model: 'gpt-x' });
  await runOn(b, { prompt: 'ARGV-2', options: { cwd: workdir, profile: p.id, tools: ['Read', 'Edit'], effort: 'max' } });
  const a2 = codexRun('ARGV-2');
  assert.equal(a2.argv[a2.argv.indexOf('--sandbox') + 1], 'workspace-write');
  assert.ok(a2.argv.includes('model_reasoning_effort="xhigh"'));
  assert.equal(a2.argv[a2.argv.indexOf('-m') + 1], 'gpt-x');
  assert.ok(!a2.argv.includes('--ignore-user-config') && !a2.argv.includes('skills.include_instructions=false'));
  assert.equal(a2.stdin, 'ARGV-2');
  // No tool list: Claude Code defaults, so it may write. Project runs need no --skip-git-repo-check (their folder is a repository).
  await runOn(b, { prompt: 'ARGV-3', options: { project: 'op-codex', profile: 'codex-default', effort: 'low' } });
  const a3 = codexRun('ARGV-3');
  assert.equal(a3.argv[a3.argv.indexOf('--sandbox') + 1], 'workspace-write');
  assert.ok(a3.argv.includes('model_reasoning_effort="low"'));
  let git = true; try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { git = false; }
  if (git) assert.ok(!a3.argv.includes('--skip-git-repo-check'));
  assert.ok(a3.env.GIT_CEILING_DIRECTORIES.split(path.delimiter).includes(realpathSync.native(projectsRoot)));
  // An effort Claude does not take is refused there.
  assert.equal((await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'x', options: { cwd: workdir, effort: 'minimal' } }) })).status, 400);
  await b.stop();
});

test('codex: events are translated to the Claude stream-json, with a synthetic result and usage in runs', async () => {
  const b = await setupBridge();
  const r = await runOn(b, { prompt: 'TRANSLATE', options: { cwd: workdir, profile: 'codex-default' }, meta: { projectId: 'p1', agentId: 'ag1', kind: 'step' } });
  const ev = r.events.filter(e => e.type !== 'stderr');
  const init = ev.find(e => e.type === 'system');
  assert.equal(init.adapter, 'codex');
  assert.match(init.session_id, /^[0-9a-f-]{36}$/);
  const uses = ev.filter(e => e.type === 'assistant').flatMap(e => e.message.content);
  assert.deepEqual(uses.filter(b => b.type === 'tool_use').map(b => [b.id, b.name]), [['item_1', 'Bash'], ['item_3', 'Edit']]);
  assert.deepEqual(uses.find(b => b.name === 'Bash').input, { command: 'ls' });
  const results = ev.filter(e => e.type === 'user').flatMap(e => e.message.content);
  assert.deepEqual(results.map(b => [b.tool_use_id, b.content, b.is_error]), [['item_1', 'README.md\n', false], ['item_3', 'add a.txt', false]]);
  assert.ok(ev.some(e => e.type === 'bridge' && e.subtype === 'warning' && e.message === 'aviso falso'));
  assert.equal(uses.filter(b => b.type === 'text').at(-1).text, 'ECHO:TRANSLATE');
  const result = ev.find(e => e.type === 'result');
  assert.deepEqual({ ...result, duration_ms: 0 }, { type: 'result', subtype: 'success', is_error: false, result: 'ECHO:TRANSLATE', session_id: init.session_id, num_turns: 1, duration_ms: 0, total_cost_usd: null, usage: { input_tokens: 100, cache_read_input_tokens: 40, cache_creation_input_tokens: 5, output_tokens: 7, reasoning_output_tokens: 3 } });
  const exit = exitOf(ev);
  assert.deepEqual([exit.status, exit.result, exit.costUsd, exit.sessionId], ['done', 'ECHO:TRANSLATE', null, init.session_id]);
  assert.deepEqual(exit.usage, { input: 100, cacheRead: 40, cacheWrite: 5, output: 7, reasoning: 3 });
  const fail = await runOn(b, { prompt: 'FAIL', options: { cwd: workdir, profile: 'codex-default' } });
  const fexit = exitOf(fail.events);
  assert.deepEqual([fexit.status, fexit.isError], ['error', true]);
  assert.equal(fail.events.find(e => e.type === 'result').result, 'fake codex failure');
  // A Claude run of the same project, for the sums.
  await runOn(b, { prompt: 'claude side', options: { cwd: workdir }, meta: { projectId: 'p1', agentId: 'ag2', kind: 'step' } });
  // Usage per run in the database and in the history; sums by Perfil, agent and day.
  const db = new Database(path.join(b.dir, 'squad.db'), { readonly: true });
  try {
    const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(r.runId);
    assert.deepEqual([row.profile_id, row.adapter, row.input_tokens, row.cache_read_tokens, row.cache_write_tokens, row.output_tokens, row.reasoning_tokens], ['codex-default', 'codex', 100, 40, 5, 7, 3]);
  } finally { db.close(); }
  const hist = (await (await b.api('/api/runs?projectId=p1')).json()).runs;
  assert.deepEqual(hist.find(x => x.id === r.runId).usage, { input: 100, cacheRead: 40, cacheWrite: 5, output: 7, reasoning: 3 });
  let rows = (await (await b.api('/api/usage?by=profile')).json()).rows;
  assert.deepEqual(rows.find(x => x.key === 'codex-default'), { key: 'codex-default', label: 'Codex (padrão)', runs: 2, input: 100, cacheRead: 40, cacheWrite: 5, output: 7, reasoning: 3, costUsd: 0 });
  assert.equal(rows.find(x => x.key === 'claude-default').input, 10);
  rows = (await (await b.api('/api/usage?by=agent')).json()).rows;
  assert.deepEqual(rows.filter(x => x.key).map(x => [x.key, x.input]), [['ag1', 100], ['ag2', 10]]);
  const today = new Date().toISOString().slice(0, 10);
  rows = (await (await b.api(`/api/usage?by=day&from=${today}T00:00:00Z`)).json()).rows;
  assert.equal(rows[0].key, today);
  assert.equal((await (await b.api('/api/usage?by=profile&from=2999-01-01T00:00:00Z')).json()).rows.length, 0);
  assert.equal((await b.api('/api/usage?by=nada')).status, 400);
  // The sums outlive the run history (it keeps only the last runs): pruned rows do not shrink them.
  const before = (await (await b.api('/api/usage?by=profile')).json()).rows;
  const w = new Database(path.join(b.dir, 'squad.db'));
  try { w.prepare('DELETE FROM runs').run(); } finally { w.close(); }
  assert.deepEqual((await (await b.api('/api/usage?by=profile')).json()).rows, before);
  // A stream-level error after the turn is a failure even with exit code 0 (item errors stay warnings).
  const se = await runOn(b, { prompt: 'STREAMERR', options: { cwd: workdir, profile: 'codex-default' } });
  assert.deepEqual([exitOf(se.events).status, exitOf(se.events).isError], ['error', true]);
  await b.stop();
});

test('usage windows: Claude rate_limit_event and codex session file; the reserve takes over above the threshold', async () => {
  const b = await setupBridge();
  const cfgA = tmp('squad-wa-'), cfgB = tmp('squad-wb-'), cfgC = tmp('squad-wc-'); extraDirs.push(cfgA, cfgB, cfgC);
  const reserve = await newProfile(b, { name: 'Reserva', adapter: 'claude', configDir: cfgB });
  const main = await newProfile(b, { name: 'Principal', adapter: 'claude', configDir: cfgA, threshold: 90, fallbackId: reserve.id });
  await runOn(b, { prompt: 'RATE40', options: { cwd: workdir, profile: main.id } });
  let w = (await profilesOf(b)).find(p => p.id === main.id).windows;
  assert.equal(w.five_hour.utilization, 0.4);
  assert.ok(Date.parse(w.five_hour.resetsAt) > Date.now() && w.five_hour.observedAt);
  assert.equal(w.seven_day.utilization, 0.1);
  let r = await runOn(b, { prompt: 'RATE95', options: { cwd: workdir, profile: main.id } });
  assert.equal(profileEvt(r.events).profileId, main.id);
  // Now over 90%: the next run goes to the reserve, and says so.
  r = await runOn(b, { prompt: 'depois', options: { cwd: workdir, profile: main.id } });
  assert.deepEqual(profileEvt(r.events), { type: 'bridge', subtype: 'profile', profileId: reserve.id, name: 'Reserva', adapter: 'claude', fallbackFrom: main.id });
  assert.equal(r.events.find(e => e.subtype === 'init').configDir, realpathSync.native(cfgB));
  // Codex: the session file of the run (and the newest one, on refresh).
  const codex = await newProfile(b, { name: 'Codex W', adapter: 'codex', configDir: cfgC });
  await runOn(b, { prompt: 'HOT', options: { cwd: workdir, profile: codex.id } });
  w = (await profilesOf(b)).find(p => p.id === codex.id).windows;
  assert.deepEqual([w.five_hour.utilization, w.seven_day.utilization], [0.95, 0.3]);
  const ref = await (await b.api(`/api/profiles/${codex.id}/refresh`, { method: 'POST' })).json();
  assert.equal(ref.observed, true);
  assert.equal(ref.windows.five_hour.utilization, 0.95);
  // Claude refresh: a probe on haiku without tools, out of the project history.
  const probe = await (await b.api(`/api/profiles/${reserve.id}/refresh`, { method: 'POST' })).json();
  assert.equal(probe.ok, true);
  const db = new Database(path.join(b.dir, 'squad.db'), { readonly: true });
  try {
    const row = db.prepare("SELECT args FROM runs WHERE kind = 'probe'").get();
    const args = JSON.parse(row.args);
    assert.equal(args[args.indexOf('--model') + 1], 'haiku');
    assert.equal(args[args.indexOf('--tools') + 1], '');
  } finally { db.close(); }
  await b.stop();
});

test('session limit mid-run: the exit says rateLimited and which reserve the next try gets', async () => {
  const b = await setupBridge();
  const cfgA = tmp('squad-la-'), cfgB = tmp('squad-lb-'), cfgC = tmp('squad-lc-'); extraDirs.push(cfgA, cfgB, cfgC);
  const reserve = await newProfile(b, { name: 'Reserva L', adapter: 'claude', configDir: cfgB });
  const main = await newProfile(b, { name: 'Principal L', adapter: 'claude', configDir: cfgA, threshold: 90, fallbackId: reserve.id });
  assert.equal((await b.api(`/api/profiles/${main.id}/default`, { method: 'POST' })).status, 200);
  // Below the threshold at the start: the run goes to the main Perfil and hits the limit in the middle.
  let r = await runOn(b, { prompt: 'LIMITE', options: { cwd: workdir } });
  assert.equal(profileEvt(r.events).profileId, main.id);
  let exit = exitOf(r.events);
  assert.deepEqual([exit.status, exit.isError, exit.rateLimited], ['error', true, true]);
  assert.deepEqual(exit.retryProfile, { id: reserve.id, name: 'Reserva L' });
  assert.match(exit.error, /session limit/);
  // The history keeps it too (the exit is the run's stored result).
  const db = new Database(path.join(b.dir, 'squad.db'), { readonly: true });
  try { assert.equal(JSON.parse(db.prepare('SELECT result FROM runs WHERE id = ?').get(r.runId).result).rateLimited, true); } finally { db.close(); }
  // The next run without a Perfil goes to the reserve.
  r = await runOn(b, { prompt: 'depois', options: { cwd: workdir } });
  assert.deepEqual(profileEvt(r.events), { type: 'bridge', subtype: 'profile', profileId: reserve.id, name: 'Reserva L', adapter: 'claude', fallbackFrom: main.id });
  assert.equal(exitOf(r.events).status, 'done');
  assert.equal(exitOf(r.events).rateLimited, undefined);
  // No reserve: rateLimited without retryProfile.
  const solo = await newProfile(b, { name: 'Sozinho', adapter: 'claude', configDir: cfgC });
  r = await runOn(b, { prompt: 'LIMITE', options: { cwd: workdir, profile: solo.id } });
  exit = exitOf(r.events);
  assert.equal(exit.rateLimited, true);
  assert.equal('retryProfile' in exit, false);
  // A plain failure is not a limit.
  r = await runOn(b, { prompt: 'FAIL', options: { cwd: workdir, profile: solo.id } });
  assert.equal(exitOf(r.events).rateLimited, undefined);
  await b.stop();
});

test('a Perfil cap answers 429 with the Perfil name', async () => {
  const b = await setupBridge();
  await b.api('/api/config', { method: 'POST', body: JSON.stringify({ concurrency: 4 }) });
  const p = await newProfile(b, { name: 'Estreito', adapter: 'claude', concurrency: 1 });
  const first = await (await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'SLEEP', options: { cwd: workdir, profile: p.id } }) })).json();
  const res = await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'x', options: { cwd: workdir, profile: p.id } }) });
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /Estreito/);
  assert.equal((await profilesOf(b)).find(x => x.id === p.id).active, 1);
  // Other Perfis still run.
  await runOn(b, { prompt: 'x', options: { cwd: workdir } });
  await b.api(`/api/runs/${first.runId}/cancel`, { method: 'POST' });
  await b.stop();
});

test('MCP of the bridge: a codex agent calls a colleague, who runs on his own Perfil; foreign tokens get 401', async () => {
  const b = await setupBridge();
  assert.equal((await fetch(`${b.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer abc123' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).status, 401);
  assert.equal((await fetch(`${b.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-squad-token': b.token }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).status, 401);
  const agents = { argus: { description: 'ARGUS, arquiteto.', prompt: 'Você é o ARGUS.', profile: 'claude-default', agentId: 'ag-argus', tools: ['Read'] }, echo: { description: 'ECHO, QA.' } };
  const r = await runOn(b, { prompt: 'CALL now', options: { project: 'op-mcp', profile: 'codex-default', agents }, meta: { projectId: 'p1', agentId: 'ag-lead', kind: 'step' } });
  const seen = codexRun('CALL now');
  // The token only in the child's env, never in argv or in the events.
  assert.match(seen.env.SQUAD_MCP_TOKEN, /^[0-9a-f]{64}$/);
  assert.ok(!seen.argv.join(' ').includes(seen.env.SQUAD_MCP_TOKEN));
  assert.ok(!JSON.stringify(r.events).includes(seen.env.SQUAD_MCP_TOKEN));
  assert.ok(seen.argv.includes('mcp_servers.squad.bearer_token_env_var="SQUAD_MCP_TOKEN"'));
  assert.ok(seen.argv.includes('mcp_servers.squad.tools.chamar_colega.approval_mode="approve"'));
  assert.equal(seen.mcp.url, `${b.base}/mcp`);
  assert.equal(seen.mcp.init.result.serverInfo.name, 'squad');
  assert.equal(seen.mcp.initialized, 202);
  const tool = seen.mcp.list.result.tools[0];
  assert.equal(tool.name, 'chamar_colega');
  assert.deepEqual(tool.inputSchema.properties.agente.enum, ['argus', 'echo']);
  assert.match(seen.mcp.call.result.content[0].text, /^ECHO:Pode confirmar o contrato\?\|SYS:Você é o ARGUS\.$/);
  // The parent's stream: Agent call card, the colleague's text under it, the answer as its tool_result.
  const call = r.events.find(e => e.type === 'assistant' && e.message.content.some(c => c.name === 'Agent'));
  assert.deepEqual(call.message.content[0].input, { subagent_type: 'argus', description: 'Pode confirmar o contrato?', prompt: 'Pode confirmar o contrato?' });
  assert.ok(r.events.some(e => e.type === 'assistant' && e.parent_tool_use_id === 'item_5'));
  const answer = r.events.flatMap(e => e.type === 'user' ? e.message.content : []).find(c => c.tool_use_id === 'item_5');
  assert.equal(answer.is_error, false);
  assert.match(answer.content, /SYS:Você é o ARGUS/);
  assert.equal(exitOf(r.events).status, 'done');
  // The Chamado is a run of its own: kind call, parent run, colleague's Perfil and agent.
  const db = new Database(path.join(b.dir, 'squad.db'), { readonly: true });
  try {
    const child = db.prepare('SELECT * FROM runs WHERE parent_run_id = ?').get(r.runId);
    assert.deepEqual([child.kind, child.profile_id, child.adapter, child.agent_id, child.project_id, child.project], ['call', 'claude-default', 'claude', 'ag-argus', 'p1', 'op-mcp']);
    const args = JSON.parse(child.args);
    assert.equal(args[args.indexOf('--tools') + 1], 'Read');
    assert.ok(!args.includes('--agents'), 'no nesting');
  } finally { db.close(); }
  // Only the run's own colleagues: inherited names (constructor, toString…) are unknown, and nothing runs.
  const proto = await runOn(b, { prompt: 'CALL CALLAS:constructor', options: { cwd: workdir, profile: 'codex-default', agents } });
  const protoSeen = codexRun('CALLAS:constructor');
  assert.equal(protoSeen.mcp.call.result.isError, true);
  assert.match(protoSeen.mcp.call.result.content[0].text, /desconhecido/);
  const db2 = new Database(path.join(b.dir, 'squad.db'), { readonly: true });
  try { assert.equal(db2.prepare('SELECT count(*) FROM runs WHERE parent_run_id = ?').pluck().get(proto.runId), 0); } finally { db2.close(); }
  // A call whose body arrives after its run ended is refused, and no colleague is started.
  const lateOut = codexLog + '.late';
  const lateRun = await runOn(b, { prompt: 'TARDIO', options: { cwd: workdir, profile: 'codex-default', agents } });
  for (let i = 0; i < 60 && !existsSync(lateOut); i++) await new Promise(x => setTimeout(x, 50));
  assert.equal(JSON.parse(readFileSync(lateOut, 'utf8')).status, 401);
  const db3 = new Database(path.join(b.dir, 'squad.db'), { readonly: true });
  try { assert.equal(db3.prepare('SELECT count(*) FROM runs WHERE parent_run_id = ?').pluck().get(lateRun.runId), 0); } finally { db3.close(); }
  assert.equal((await profilesOf(b)).find(p => p.id === 'claude-default').activeCalls, 0);
  // Revoked at the end of the run.
  const late = await fetch(`${b.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${seen.env.SQUAD_MCP_TOKEN}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list' }) });
  assert.equal(late.status, 401);
  await b.stop();
});

test('MCP of the bridge: two calls open at once each get their own tool_use id, matched by arguments, not the latest one', async () => {
  const b = await setupBridge();
  const agents = { argus: { description: 'ARGUS, arquiteto.', prompt: 'Você é o ARGUS.' }, echo: { description: 'ECHO, QA.', prompt: 'Você é o ECHO.' } };
  const r = await runOn(b, { prompt: 'CALL DUO', options: { cwd: workdir, profile: 'codex-default', agents } });
  const duo = codexRun('CALL DUO').mcp.duo;
  assert.match(duo[0].result.content[0].text, /^ECHO:Pedido A ECOAR\|SYS:Você é o ARGUS\.$/);
  assert.match(duo[1].result.content[0].text, /^ECHO:Pedido B ECOAR\|SYS:Você é o ECHO\.$/);
  // Each colleague's text hangs under its own call card.
  const under = id => r.events.filter(e => e.type === 'assistant' && e.parent_tool_use_id === id).map(e => JSON.stringify(e.message.content)).join(' ');
  assert.match(under('item_5a'), /Pedido A/);
  assert.doesNotMatch(under('item_5a'), /Pedido B/);
  assert.match(under('item_5b'), /Pedido B/);
  assert.doesNotMatch(under('item_5b'), /Pedido A/);
  assert.equal(exitOf(r.events).status, 'done');
  await b.stop();
});

test('telemetry: OTLP trace per run with squad.* attributes, no content by default, header values never exposed', async () => {
  const got = [];
  const collector = (await import('node:http')).createServer((req, res) => { let t = ''; req.on('data', d => { t += d; }); req.on('end', () => { got.push({ url: req.url, headers: req.headers, body: JSON.parse(t) }); res.end('{}'); }); });
  await new Promise(r => collector.listen(0, '127.0.0.1', r));
  const SECRET = 'segredo-otlp-123';
  // Inherited telemetry switches must not reach the children: only what each Perfil decides.
  const b = await setupBridge({ SQUAD_TEST_OTLP_KEY: SECRET, OTEL_LOG_USER_PROMPTS: '1', CLAUDE_CODE_ENABLE_TELEMETRY: '1', OTEL_LOG_TOOL_DETAILS: '1' });
  try {
    assert.equal((await b.api('/api/telemetry', { method: 'PUT', body: JSON.stringify({ endpoint: 'ftp://x' }) })).status, 400);
    assert.equal((await b.api('/api/telemetry', { method: 'PUT', body: JSON.stringify({ headersEnv: { 'x-api-key': 'valor secreto' } }) })).status, 400);
    let res = await b.api('/api/telemetry', { method: 'PUT', body: JSON.stringify({ endpoint: `http://127.0.0.1:${collector.address().port}`, serviceName: 'squad-test', headersEnv: { 'x-api-key': 'SQUAD_TEST_OTLP_KEY', 'x-other': 'SQUAD_TEST_MISSING' } }) });
    assert.equal(res.status, 200);
    const view = await (await b.api('/api/telemetry')).json();
    assert.deepEqual(view.headers, [{ name: 'x-api-key', env: 'SQUAD_TEST_OTLP_KEY', present: true }, { name: 'x-other', env: 'SQUAD_TEST_MISSING', present: false }]);
    assert.ok(!JSON.stringify(view).includes(SECRET));
    assert.equal((await b.api('/api/telemetry', { method: 'PUT', body: JSON.stringify({ endpoint: 'https://user:senha@otlp.example' }) })).status, 400);
    // Off by default: nothing is sent, and nothing inherited goes through.
    const off = await runOn(b, { prompt: 'sem telemetria', options: { cwd: workdir } });
    assert.deepEqual(off.events.find(e => e.subtype === 'init').telemetryEnv, []);
    const p = await newProfile(b, { name: 'Observado', adapter: 'claude', telemetry: { enabled: true } });
    const r = await runOn(b, { prompt: 'com telemetria', options: { cwd: workdir, profile: p.id }, meta: { projectId: 'p1', agentId: 'ag1', featureId: 'f1', kind: 'step' } });
    for (let i = 0; i < 40 && !got.length; i++) await new Promise(x => setTimeout(x, 50));
    assert.equal(got.length, 1);
    assert.equal(got[0].url, '/v1/traces');
    assert.equal(got[0].headers['x-api-key'], SECRET);
    assert.equal(got[0].headers['x-other'], undefined);
    const rs = got[0].body.resourceSpans[0];
    assert.deepEqual(rs.resource.attributes, [{ key: 'service.name', value: { stringValue: 'squad-test' } }]);
    const spans = rs.scopeSpans[0].spans, root = spans.find(s => s.name === 'squad.run');
    const attrs = Object.fromEntries(root.attributes.map(a => [a.key, Object.values(a.value)[0]]));
    assert.equal(root.traceId, createHash('sha256').update(r.runId).digest('hex').slice(0, 32));
    assert.deepEqual([attrs['squad.profile'], attrs['squad.adapter'], attrs['squad.kind'], attrs['squad.project_id'], attrs['squad.agent_id'], attrs['squad.feature_id'], attrs['squad.status'], attrs['gen_ai.system']], ['Observado', 'claude', 'step', 'p1', 'ag1', 'f1', 'done', 'anthropic']);
    assert.equal(attrs['gen_ai.usage.input_tokens'], '10');
    assert.ok(!('gen_ai.prompt' in attrs) && !('gen_ai.completion' in attrs));
    assert.ok(spans.some(s => s.name === 'squad.tool Read' && s.parentSpanId === root.spanId));
    // Native without content: OTEL_LOG_USER_PROMPTS stays off even though the bridge inherited it.
    await b.api(`/api/profiles/${p.id}`, { method: 'PUT', body: JSON.stringify({ telemetry: { enabled: true, native: true, content: false } }) });
    const nat = await runOn(b, { prompt: 'nativa', options: { cwd: workdir, profile: p.id } });
    const natEnv = nat.events.find(e => e.subtype === 'init').telemetryEnv;
    assert.ok(natEnv.includes('CLAUDE_CODE_ENABLE_TELEMETRY') && !natEnv.includes('OTEL_LOG_USER_PROMPTS') && !natEnv.includes('OTEL_LOG_TOOL_DETAILS'));
    for (let i = 0; i < 40 && got.length < 2; i++) await new Promise(x => setTimeout(x, 50));
    got.splice(1);
    // Content and native telemetry: the header value goes to the child's env, never to argv or the events.
    await b.api(`/api/profiles/${p.id}`, { method: 'PUT', body: JSON.stringify({ telemetry: { enabled: true, native: true, content: true } }) });
    const r2 = await runOn(b, { prompt: 'com conteudo', options: { cwd: workdir, profile: p.id } });
    for (let i = 0; i < 40 && got.length < 2; i++) await new Promise(x => setTimeout(x, 50));
    const attrs2 = Object.fromEntries(got[1].body.resourceSpans[0].scopeSpans[0].spans[0].attributes.map(a => [a.key, Object.values(a.value)[0]]));
    assert.equal(attrs2['gen_ai.prompt'], 'com conteudo');
    const otel = r2.events.find(e => e.subtype === 'init').otel;
    assert.equal(otel.protocol, 'http/json');
    assert.equal(otel.headers, `x-api-key=${SECRET}`);
    assert.equal(otel.prompts, '1');
    assert.ok(!JSON.stringify(r2.args).includes(SECRET));
    // Codex with secret headers: native telemetry stays off, with a warning.
    const cx = await newProfile(b, { name: 'Codex observado', adapter: 'codex', telemetry: { enabled: true, native: true } });
    const r3 = await runOn(b, { prompt: 'OTEL-CX', options: { cwd: workdir, profile: cx.id } });
    assert.ok(r3.events.some(e => e.subtype === 'warning' && /segredos/.test(e.message)));
    assert.ok(!codexRun('OTEL-CX').argv.some(a => a.startsWith('otel.')));
    assert.ok(!b.out().includes(SECRET));
  } finally { collector.close(); await b.stop(); }
});

test('health: a machine with only Codex still reports a usable engine (claudeVersion falls back to it)', async () => {
  const b = await setupBridge({ SQUAD_CLAUDE_BIN: 'claude-que-nao-existe-xyz' });
  const h = await (await b.api('/api/health')).json();
  assert.deepEqual(h.engines, { claude: false, codex: true });
  assert.equal(h.engineAdapter, 'codex');
  assert.match(h.claudeVersion, /codex-cli 9\.9\.9/);
  assert.match(h.claudeError, /não encontrado/);
  // A new database: "Codex (padrão)" becomes the default (Claude (padrão) is untouched and its claude is missing), so an agent
  // without a Perfil runs on the engine that exists.
  await new Promise(r => setTimeout(r, 200));
  assert.deepEqual((await profilesOf(b)).map(p => [p.id, p.isDefault]), [['codex-default', true], ['claude-default', false]]);
  const r = await runOn(b, { prompt: 'SO-CODEX', options: { cwd: workdir } });
  assert.equal(profileEvt(r.events).profileId, 'codex-default');
  assert.equal(exitOf(r.events).status, 'done');
  await b.stop();
  // With claude on the PATH nothing changes: Claude (padrão) stays the default (the first test of Perfis checks it too).
});

test('telemetry: an endpoint with credentials in the URL is ignored, also from OTEL_EXPORTER_OTLP_ENDPOINT', async () => {
  const b = await setupBridge({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://usuario:senha-url@127.0.0.1:9' });
  const view = await (await b.api('/api/telemetry')).json();
  assert.deepEqual([view.endpoint, view.source], ['', '']);
  assert.ok(!JSON.stringify(view).includes('senha-url'));
  const p = await newProfile(b, { name: 'Codex nativo', adapter: 'codex', telemetry: { enabled: true, native: true } });
  await runOn(b, { prompt: 'CREDS-1', options: { cwd: workdir, profile: p.id } });
  assert.ok(!codexRun('CREDS-1').argv.join(' ').includes('senha-url'));
  assert.match(b.out(), /OTEL_EXPORTER_OTLP_ENDPOINT tem usuário ou senha/);
  assert.ok(!b.out().includes('senha-url'));
  await b.stop();
});

test('telemetry: an endpoint inherited from OTEL_EXPORTER_OTLP_ENDPOINT is never saved as the settings endpoint', async () => {
  const env = 'http://127.0.0.1:9/herdado';
  const b = await setupBridge({ OTEL_EXPORTER_OTLP_ENDPOINT: env });
  let view = await (await b.api('/api/telemetry')).json();
  assert.deepEqual([view.endpoint, view.source], [env, 'env']);
  // A page that sends the inherited value back (older page, or typed by hand) keeps following the environment.
  view = await (await b.api('/api/telemetry', { method: 'PUT', body: JSON.stringify({ endpoint: env, serviceName: 'outro' }) })).json();
  assert.deepEqual([view.endpoint, view.source, view.serviceName], [env, 'env', 'outro']);
  view = await (await b.api('/api/telemetry', { method: 'PUT', body: JSON.stringify({ endpoint: 'http://127.0.0.1:9/proprio' }) })).json();
  assert.deepEqual([view.endpoint, view.source], ['http://127.0.0.1:9/proprio', 'settings']);
  await b.stop();
});

test('caps hold under parallel requests (global and per Perfil)', async () => {
  const b = await setupBridge();
  await b.api('/api/config', { method: 'POST', body: JSON.stringify({ concurrency: 8 }) });
  const p = await newProfile(b, { name: 'Um por vez', adapter: 'claude', concurrency: 1 });
  // Project runs await git init before spawning: the window where a late reservation let three through.
  const fire = (opts, n) => Promise.all(Array.from({ length: n }, (_, i) => b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'SLEEP', options: { project: `op-race-${i}`, ...opts } }) })));
  let res = await fire({ profile: p.id }, 3);
  assert.deepEqual(res.map(r => r.status).sort(), [201, 429, 429]);
  const ids = [];
  for (const r of res) if (r.status === 201) ids.push((await r.json()).runId);
  await b.api('/api/config', { method: 'POST', body: JSON.stringify({ concurrency: 2 }) });
  res = await fire({}, 3); // one slot left of 2
  assert.deepEqual(res.map(r => r.status).sort(), [201, 429, 429]);
  for (const r of res) if (r.status === 201) ids.push((await r.json()).runId);
  for (const id of ids) await b.api(`/api/runs/${id}/cancel`, { method: 'POST' });
  await b.stop();
});

test('codex session files: a symlink anywhere under CODEX_HOME/sessions is not followed', async () => {
  const b = await setupBridge();
  const home = tmp('squad-sym-'), elsewhere = tmp('squad-elsewhere-'); extraDirs.push(home, elsewhere);
  mkdirSync(path.join(home, 'sessions'));
  // sessions/<year> points outside: the fake writes its session file through it, the bridge must not read it.
  symlinkSync(elsewhere, path.join(home, 'sessions', String(new Date().getFullYear())), 'dir');
  const p = await newProfile(b, { name: 'Codex link', adapter: 'codex', configDir: home });
  const r = await runOn(b, { prompt: 'HOT', options: { cwd: workdir, profile: p.id } });
  assert.ok(readdirSync(elsewhere).length, 'the fake wrote through the link');
  assert.deepEqual((await profilesOf(b)).find(x => x.id === p.id).windows, {});
  assert.equal(exitOf(r.events).model, null);
  const ref = await (await b.api(`/api/profiles/${p.id}/refresh`, { method: 'POST' })).json();
  assert.equal(ref.observed, false);
  await b.stop();
});

test('Perfis: remover o último Perfil da configuração nunca deixa o banco sem Perfil padrão', () => {
  const req = createRequire(import.meta.url);
  const dir = tmp('squad-dbpf-'); extraDirs.push(dir);
  const store = req('../db.js').openStore(dir);
  try {
    const cfgP = key => ({ id: `cfg-${key}`, name: `Cfg ${key}`, adapter: 'claude', concurrency: 2, threshold: 90, ignoreUserConfig: true, telemetry: {} });
    const defaults = () => store.listProfiles().filter(p => p.isDefault).map(p => p.id);
    // The built-in Claude was deleted while a configured Perfil was the default; that Perfil then leaves the file.
    store.upsertConfigProfile(cfgP('solo'), '/x/squad.local.json');
    store.setDefaultProfile('cfg-solo');
    store.deleteProfile('claude-default');
    assert.deepEqual(store.listProfiles().map(p => p.id), ['cfg-solo']);
    store.removeConfigProfile('cfg-solo');
    assert.deepEqual(store.listProfiles().map(p => [p.id, p.name, p.adapter, p.isDefault]), [['claude-default', 'Claude (padrão)', 'claude', true]]);
    // With another Perfil left, that one becomes the default (nothing is created).
    store.upsertConfigProfile(cfgP('a'), '/x/squad.local.json'); store.setDefaultProfile('cfg-a'); store.deleteProfile('claude-default');
    const other = store.createProfile({ name: 'Outro', adapter: 'claude', concurrency: 2, threshold: 90, ignoreUserConfig: true, telemetry: {} });
    store.removeConfigProfile('cfg-a');
    assert.deepEqual([store.listProfiles().map(p => p.id), defaults()], [[other.id], [other.id]]);
  } finally { store.close(); }
});

test('Perfis: uma sonda de versão por executável (em voo e falha também ficam em cache)', async () => {
  const root = tmp('squad-probe-'); extraDirs.push(root);
  // Two fake executables that log every --version and take a moment, so the first GET probes them all at the same time.
  const fake = (name, code) => {
    const file = path.join(root, `${name}.mjs`), log = path.join(root, `${name}.log`);
    writeFileSync(file, `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(log)}, 'x\\n');\nsetTimeout(() => { console.log('9.9.9'); process.exit(${code}); }, 300);\n`);
    return { file, count: () => { try { return readFileSync(log, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } } };
  };
  const ok = fake('ok', 0), bad = fake('bad', 1);
  const cfg = path.join(root, 'squad.local.json');
  writeFileSync(cfg, JSON.stringify({ profiles: [
    ...[1, 2, 3, 4].map(i => ({ key: `ok${i}`, name: `OK ${i}`, adapter: 'claude', bin: ok.file })),
    ...[1, 2, 3].map(i => ({ key: `bad${i}`, name: `Ruim ${i}`, adapter: 'claude', bin: bad.file })),
  ] }));
  const b = await setupBridge({ SQUAD_CONFIG: cfg });
  const lists = await Promise.all([1, 2].map(async () => (await (await b.api('/api/profiles')).json()).profiles));
  const again = (await (await b.api('/api/profiles')).json()).profiles;
  for (const list of [...lists, again]) {
    assert.equal(list.find(p => p.id === 'cfg-ok1').status.version, '9.9.9');
    assert.equal(list.find(p => p.id === 'cfg-bad2').status.version, null);
    assert.ok(list.find(p => p.id === 'cfg-bad2').status.error);
  }
  assert.deepEqual([ok.count(), bad.count()], [1, 1]);
  await b.stop();
});

test('Perfis da configuração: criados como cfg-<key>, removidos ao sair, defaultProfile e reserva por key', async () => {
  const root = tmp('squad-cfgpf-'); extraDirs.push(root);
  const shared = path.join(root, 'shared'), local = path.join(root, 'local');
  mkdirSync(path.join(shared, 'contas', 'work'), { recursive: true }); mkdirSync(path.join(local, 'pessoal'), { recursive: true });
  // squad.config.json comes from the app root (the merge between files is the next test, on the loader); here SQUAD_CONFIG and its edits.
  const cfg = path.join(local, 'squad.local.json');
  const write = body => { writeFileSync(cfg, JSON.stringify(body)); };
  write({
    profiles: [
      { key: 'trabalho', name: 'Claude trabalho', adapter: 'claude', configDir: '../shared/contas/work', model: 'sonnet', effort: 'high', concurrency: 3, telemetry: { enabled: true } },
      { key: 'pessoal', name: 'Claude pessoal', adapter: 'claude', configDir: 'pessoal', fallbackId: 'trabalho' },
      { key: 'codex-x', name: 'Codex X', adapter: 'codex', fallbackId: 'trabalho' },
    ],
    defaultProfile: 'trabalho',
  });
  const b = await setupBridge({ SQUAD_CONFIG: cfg });
  const get = async () => (await (await b.api('/api/profiles')).json());
  let body = await get();
  let byId = Object.fromEntries(body.profiles.map(p => [p.id, p]));
  const work = byId['cfg-trabalho'];
  assert.ok(work, JSON.stringify(body));
  assert.equal(work.source, 'config'); assert.equal(work.sourceFile, cfg);
  assert.equal(work.configDir, realpathSync.native(path.join(shared, 'contas', 'work')));
  assert.deepEqual([work.model, work.effort, work.concurrency, work.telemetry.enabled, work.isDefault], ['sonnet', 'high', 3, true, true]);
  assert.equal(body.configDefault, 'squad.local.json');
  assert.equal(byId['cfg-pessoal'].fallbackId, 'cfg-trabalho'); // reserve by key
  assert.equal(byId['cfg-pessoal'].configDir, realpathSync.native(path.join(local, 'pessoal')));
  assert.equal(byId['cfg-codex-x'].fallbackId, ''); // another Adapter: no reserve, with a warning
  assert.match(body.configWarnings.join('\n'), /codex-x .*mesmo Adapter.*Ficou sem reserva/);
  assert.equal(byId['claude-default'].isDefault, false);

  // Test still works; a manual Perfil may use a config key as its reserve (writing back to the file: its own test).
  assert.equal((await (await b.api('/api/profiles/cfg-trabalho/test', { method: 'POST' })).json()).ok, true);
  const manual = await newProfile(b, { name: 'Manual', adapter: 'claude', fallbackId: 'trabalho' });
  assert.equal(manual.fallbackId, 'cfg-trabalho');
  // The page gets the same warnings in squad-plugins.
  assert.match(pageTag(await page(b.base), 'squad-plugins').warnings.join('\n'), /codex-x/);

  // Usage of a configured Perfil is kept by id.
  const r = await runOn(b, { prompt: 'hi', options: { cwd: workdir, profile: 'cfg-pessoal' }, meta: { kind: 'step' } });
  assert.equal(profileEvt(r.events).profileId, 'cfg-pessoal');

  // An invalid configuration changes nothing (no removal on a parse error).
  writeFileSync(cfg, '{ "profiles": [');
  body = await get();
  assert.deepEqual(body.profiles.filter(p => p.source === 'config').map(p => p.id).sort(), ['cfg-codex-x', 'cfg-pessoal', 'cfg-trabalho']);
  assert.match(body.configWarnings.join('\n'), /não sincronizados/);
  // An entry that fails validation keeps its row as it was; an invalid defaultProfile keeps the current default.
  write({
    profiles: [
      { key: 'trabalho', name: 'Claude trabalho', adapter: 'claude', configDir: '../shared/contas/work', concurrency: 99 },
      { key: 'pessoal', name: 'Claude pessoal 2', adapter: 'claude' },
    ],
    defaultProfile: 'nao-existe',
  });
  body = await get();
  byId = Object.fromEntries(body.profiles.map(p => [p.id, p]));
  assert.equal(byId['cfg-trabalho'].concurrency, 3);
  assert.equal(byId['cfg-pessoal'].name, 'Claude pessoal 2');
  assert.equal(byId['cfg-pessoal'].fallbackId, '');
  assert.equal(byId['cfg-codex-x'], undefined); // left the configuration: removed
  assert.equal(byId['cfg-trabalho'].isDefault, true);
  assert.equal(body.configDefault, '');
  const w = body.configWarnings.join('\n');
  assert.match(w, /squad\.local\.json: Perfil trabalho: concurrency: deve ser no máximo 10/);
  assert.deepEqual(byId['cfg-trabalho'].configError.length, 1);
  assert.match(w, /defaultProfile.*nao-existe.*mantido/);

  // Leaving the configuration: removed (the default falls back to Claude (padrão)); usage stays under the id; coming back relinks it.
  write({ profiles: [] });
  body = await get();
  assert.deepEqual(body.profiles.filter(p => p.source === 'config'), []);
  assert.equal(body.profiles.find(p => p.isDefault).id, 'claude-default');
  assert.equal(body.profiles.find(p => p.id === manual.id).fallbackId, '');
  const usage = await (await b.api('/api/usage?by=profile')).json();
  assert.ok(usage.rows.some(x => x.key === 'cfg-pessoal'));
  write({ profiles: [{ key: 'pessoal', name: 'Claude pessoal', adapter: 'claude' }] });
  body = await get();
  assert.equal(body.profiles.find(p => p.id === 'cfg-pessoal').name, 'Claude pessoal');

  // A key renamed with the same name: the old row leaves before the new one takes the name.
  write({ profiles: [{ key: 'pessoal-2', name: 'Claude pessoal', adapter: 'claude' }] });
  body = await get();
  assert.deepEqual(body.profiles.filter(p => p.source === 'config').map(p => [p.id, p.name]), [['cfg-pessoal-2', 'Claude pessoal']]);
  assert.deepEqual(body.configWarnings, []);
  // A name taken by a manual Perfil fails the sync, which is tried again on the next read (no edit to the file needed).
  write({ profiles: [{ key: 'pessoal-2', name: 'Claude pessoal', adapter: 'claude' }, { key: 'xara', name: 'Manual', adapter: 'claude' }] });
  body = await get();
  assert.equal(body.profiles.find(p => p.id === 'cfg-xara'), undefined);
  assert.match(body.configWarnings.join('\n'), /xara .*Já existe um Perfil com esse nome/);
  assert.equal((await b.api(`/api/profiles/${manual.id}`, { method: 'DELETE' })).status, 200);
  body = await get();
  assert.equal(body.profiles.find(p => p.id === 'cfg-xara')?.name, 'Manual');
  assert.deepEqual(body.configWarnings, []);
  await b.stop();
});

test('Perfis da configuração: squad.config.json + squad.local.json mesclados por key, campo a campo, caminhos pelo arquivo que declarou', () => {
  const { createPluginLoader } = createRequire(import.meta.url)('../plugins/loader.js');
  const root = tmp('squad-cfgmerge-'); extraDirs.push(root);
  writeFileSync(path.join(root, 'squad.config.json'), JSON.stringify({
    profiles: [
      { key: 'trabalho', name: 'Claude trabalho', adapter: 'claude', configDir: 'contas/work', model: 'sonnet', telemetry: { enabled: true, native: true, headers: { Authorization: 'OTEL_TOKEN' } } },
      { key: 'ruim', name: 'Ruim', adapter: 'claude', telemetry: { content: 'sim' } },
      { key: 'so-shared', name: 'Shared', adapter: 'codex', bin: './bin/codex' },
    ],
    defaultProfile: 'so-shared',
  }));
  mkdirSync(path.join(root, 'local'));
  const local = path.join(root, 'local', 'mine.json');
  writeFileSync(local, JSON.stringify({ profiles: [{ key: 'trabalho', configDir: '~/.claude-work', effort: 'high', telemetry: { native: false }, segredo: 'x' }], defaultProfile: 'trabalho' }));
  const home = path.join(root, 'home');
  const out = createPluginLoader({ root, home, env: { SQUAD_CONFIG: local }, cwd: root }).load().api;
  const byKey = Object.fromEntries(out.config.profiles.map(p => [p.key, p]));
  assert.deepEqual(byKey.trabalho, {
    key: 'trabalho', name: 'Claude trabalho', adapter: 'claude', configDir: path.join(home, '.claude-work'), model: 'sonnet', effort: 'high',
    telemetry: { enabled: true, native: false }, source: local, files: [path.join(root, 'squad.config.json'), local],
  });
  assert.equal(byKey['so-shared'].bin, path.join(root, 'bin', 'codex'));
  assert.equal(byKey['so-shared'].source, path.join(root, 'squad.config.json'));
  assert.equal(out.config.defaultProfile, 'trabalho');
  assert.equal(out.config.defaultProfileFile, local);
  assert.equal(out.config.profilesError, false);
  const warned = out.warnings.join('\n');
  assert.match(warned, /campo "segredo" desconhecido/);
  assert.match(warned, /campo "telemetry\.headers" desconhecido/);
  assert.match(warned, /Perfil ruim: telemetry\.content: deve ser true ou false/);
  assert.equal(byKey.ruim.invalid.length, 1); // an invalid field marks the item (kept as it was by the bridge)
  assert.equal(byKey.ruim.name, undefined);
  assert.ok(!JSON.stringify(out.config).includes('OTEL_TOKEN'));
});

test('Perfis da configuração: prontos antes da primeira execução (setup e reinício) e defaultProfile "codex-default"', async () => {
  const root = tmp('squad-cfgboot-'); extraDirs.push(root);
  const cfg = path.join(root, 'squad.local.json');
  writeFileSync(cfg, JSON.stringify({ profiles: [{ key: 'trabalho', name: 'Claude trabalho', adapter: 'claude' }], defaultProfile: 'codex-default' }));
  const b = await setupBridge({ SQUAD_CONFIG: cfg });
  // No GET /api/profiles first: the run itself finds cfg-trabalho.
  let r = await runOn(b, { prompt: 'hi', options: { cwd: workdir, profile: 'cfg-trabalho' } });
  assert.equal(profileEvt(r.events).profileId, 'cfg-trabalho');
  let list = await profilesOf(b);
  assert.equal(list.find(p => p.isDefault).id, 'codex-default');
  await b.stop();
  // Restart with a new Perfil in the file: a run sent right after the start waits for the sync.
  writeFileSync(cfg, JSON.stringify({ profiles: [{ key: 'trabalho', name: 'Claude trabalho', adapter: 'claude' }, { key: 'novo', name: 'Claude novo', adapter: 'claude' }], defaultProfile: 'novo' }));
  const b2 = await startBridge(b.dir, undefined, { SQUAD_CONFIG: cfg });
  r = await runOn(b2, { prompt: 'hi', options: { cwd: workdir } });
  assert.equal(profileEvt(r.events).profileId, 'cfg-novo'); // the new default, applied before the run
  list = await profilesOf(b2);
  assert.ok(list.some(p => p.id === 'cfg-trabalho'));
  await b2.stop();
});

const readJson = f => JSON.parse(readFileSync(f, 'utf8'));
test('Perfis da configuração: editar, tornar padrão e excluir gravam no arquivo de origem', async () => {
  const root = tmp('squad-cfgwrite-'); extraDirs.push(root);
  const shared = path.join(root, 'shared.json'), local = path.join(root, 'local.json');
  writeFileSync(shared, JSON.stringify({ profiles: [{ key: 'dupla', name: 'Dupla', adapter: 'claude', model: 'sonnet' }] }, null, 4));
  writeFileSync(local, JSON.stringify({
    $schema: './schemas/squad.schema.json', plugins: { paths: [] },
    profiles: [{ key: 'trabalho', name: 'Claude trabalho', adapter: 'claude', model: 'sonnet' }, { key: 'pessoal', name: 'Claude pessoal', adapter: 'claude' }, { key: 'dupla', concurrency: 3 }],
  }));
  const b = await setupBridge({ SQUAD_CONFIG: local, SQUAD_CONFIG_SHARED: shared });
  const get = async () => (await (await b.api('/api/profiles')).json());
  let body = await get();
  assert.deepEqual(body.configWarnings, []); // $schema is accepted
  assert.deepEqual(body.profiles.find(p => p.id === 'cfg-dupla').configFiles, ['shared.json', 'local.json']);
  assert.equal(body.configDefaultTarget, 'local.json');
  const put = (id, data) => b.api(`/api/profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) });

  // Edit: only the changed fields go into that key's item, the rest of the file stays; .bak copy; 2 spaces + \n.
  const before = readFileSync(local, 'utf8');
  let res = await put('cfg-trabalho', { name: 'Claude trabalho', adapter: 'claude', model: 'opus', concurrency: 4, threshold: 90 });
  assert.equal(res.status, 200, await res.clone().text());
  let out = await res.json();
  assert.deepEqual(out.changed.sort(), ['concurrency', 'model']);
  assert.equal(out.file, 'local.json');
  assert.deepEqual([out.profile.model, out.profile.concurrency], ['opus', 4]);
  const text = readFileSync(local, 'utf8');
  assert.ok(text.endsWith('\n') && text.includes('\n  "profiles": ['));
  let data = JSON.parse(text);
  assert.equal(data.$schema, './schemas/squad.schema.json'); assert.deepEqual(data.plugins, { paths: [] });
  assert.deepEqual(data.profiles[0], { key: 'trabalho', name: 'Claude trabalho', adapter: 'claude', model: 'opus', concurrency: 4 });
  assert.equal(readFileSync(local + '.bak', 'utf8'), before);
  // Invalid values are refused before writing.
  assert.equal((await put('cfg-trabalho', { concurrency: 99 })).status, 400);
  assert.equal((await put('cfg-trabalho', { effort: 'minimal' })).status, 400);
  assert.equal(readFileSync(local, 'utf8'), text);
  // A key declared in two files: edits go to the one of highest precedence (local); the shared one is untouched.
  const sharedText = readFileSync(shared, 'utf8');
  assert.equal((await put('cfg-dupla', { concurrency: 5 })).status, 200);
  assert.deepEqual(readJson(local).profiles[2], { key: 'dupla', concurrency: 5 });
  assert.equal(readFileSync(shared, 'utf8'), sharedText);
  // A file changed by hand since the bridge read it: 409; after a read (GET), it goes.
  writeFileSync(local, readFileSync(local, 'utf8') + ' ');
  res = await put('cfg-pessoal', { model: 'haiku' });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /local\.json mudou desde a última leitura/);
  await get();
  assert.equal((await put('cfg-pessoal', { model: 'haiku' })).status, 200);

  // Tornar padrão: no file declares defaultProfile, so it goes to the local one (SQUAD_CONFIG); a manual Perfil goes by id.
  res = await b.api('/api/profiles/cfg-pessoal/default', { method: 'POST' });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(readJson(local).defaultProfile, 'pessoal');
  body = await get();
  assert.equal(body.profiles.find(p => p.isDefault).id, 'cfg-pessoal');
  assert.equal(body.configDefault, 'local.json');
  const manual = await newProfile(b, { name: 'Manual', adapter: 'claude' });
  assert.equal((await b.api(`/api/profiles/${manual.id}/default`, { method: 'POST' })).status, 200);
  assert.equal(readJson(local).defaultProfile, manual.id);
  assert.equal((await get()).profiles.find(p => p.isDefault).id, manual.id);
  // A Perfil created in the app stays in the database.
  assert.equal(readJson(local).profiles.length, 3);

  // Delete: removed from its file; refused for a key that another file also declares, and for the default.
  res = await b.api('/api/profiles/cfg-dupla', { method: 'DELETE' });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /também está declarado em shared\.json.*continuaria vindo de lá/);
  assert.equal((await b.api('/api/profiles/cfg-pessoal/default', { method: 'POST' })).status, 200);
  assert.equal((await b.api('/api/profiles/cfg-pessoal', { method: 'DELETE' })).status, 409);
  res = await b.api('/api/profiles/cfg-trabalho', { method: 'DELETE' });
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(readJson(local).profiles.map(p => p.key), ['pessoal', 'dupla']);
  assert.equal((await get()).profiles.some(p => p.id === 'cfg-trabalho'), false);
  await b.stop();
});

test('Perfis da configuração: item inválido não trava os outros; o Perfil fica como estava e o aviso cita arquivo, key e campo', async () => {
  const root = tmp('squad-cfgitem-'); extraDirs.push(root);
  const cfg = path.join(root, 'squad.local.json');
  writeFileSync(cfg, JSON.stringify({ profiles: [{ key: 'ok1', name: 'Ok 1', adapter: 'claude' }, { key: 'ruim', name: 'Ruim', adapter: 'claude', model: 'sonnet' }] }));
  const b = await setupBridge({ SQUAD_CONFIG: cfg });
  const get = async () => (await (await b.api('/api/profiles')).json());
  let body = await get();
  assert.deepEqual(body.profiles.filter(p => p.source === 'config').map(p => p.id).sort(), ['cfg-ok1', 'cfg-ruim']);
  writeFileSync(cfg, JSON.stringify({ profiles: [
    { key: 'Bad Key', name: 'X', adapter: 'claude' },
    { key: 'ok1', name: 'Ok 1', adapter: 'claude', model: 'opus' },
    { key: 'ruim', name: 'Ruim 2', adapter: 'claude', effort: 'turbo' },
    { key: 'nova', name: 'Nova', adapter: 'gemini' },
    { key: 'mais', name: 'Mais', adapter: 'claude' },
  ] }));
  body = await get();
  const byId = Object.fromEntries(body.profiles.map(p => [p.id, p]));
  assert.equal(byId['cfg-ok1'].model, 'opus'); // the others sync
  assert.ok(byId['cfg-mais']);
  assert.deepEqual([byId['cfg-ruim'].name, byId['cfg-ruim'].model], ['Ruim', 'sonnet']); // left as it was, not removed
  assert.match(byId['cfg-ruim'].configError.join('\n'), /squad\.local\.json: Perfil ruim: effort: valor "turbo" não aceito/);
  assert.equal(byId['cfg-nova'], undefined); // not created
  const w = body.configWarnings.join('\n');
  assert.match(w, /profiles\[0\]: "key" ausente ou inválida \(Bad Key/);
  assert.match(w, /Perfil nova \(squad\.local\.json\): Adapter inválido/);
  // Writing to an invalid item is refused until the file is fixed.
  const res = await b.api('/api/profiles/cfg-ruim', { method: 'PUT', body: JSON.stringify({ model: 'opus' }) });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /formato inválido/);
  await b.stop();
});

test('schemas: patterns e enums iguais às constantes do código; o validador cobre o subconjunto usado', () => {
  const req = createRequire(import.meta.url);
  const { CONSTANTS: C, SCHEMAS } = req('../plugins/loader.js');
  const { validate, formatError } = req('../schema.js');
  const pat = node => node.pattern ?? node.anyOf?.find(x => x.pattern)?.pattern;
  const same = (node, re, label) => assert.equal(pat(node), re.source, label);
  const cfg = SCHEMAS.config, prof = cfg.$defs.profile.properties, plugin = SCHEMAS.plugin, agent = SCHEMAS.agent.properties;
  same(prof.key, C.PROFILE_KEY_RE, 'profile.key'); same(prof.model, C.MODEL_RE, 'profile.model');
  for (const kind of [...C.ADAPTERS, 'a2a', 'x-echo']) assert.deepEqual(validate(prof.adapter, kind), []);
  for (const kind of ['Bad Kind', '../a2a', '']) assert.ok(validate(prof.adapter, kind).length);
  assert.deepEqual(new Set(prof.effort.enum), new Set(['', ...C.EFFORTS, ...C.CODEX_EFFORTS]));
  assert.deepEqual(Object.keys(prof).sort(), ['key', ...C.PROFILE_FIELDS].sort());
  assert.deepEqual(Object.keys(prof.telemetry.properties), C.TELEMETRY_KEYS);
  for (const rt of [cfg.$defs.runtime, plugin.$defs.runtime]) {
    assert.deepEqual(rt.properties.permissionMode.enum, C.PERMISSION_MODES);
    assert.deepEqual(rt.properties.effort.enum, ['', ...C.EFFORTS]);
    same(rt.properties.model, C.MODEL_RE, 'runtime.model');
  }
  assert.deepEqual(cfg.$defs.runtime, plugin.$defs.runtime);
  same(plugin.properties.id, C.PLUGIN_ID_RE, 'plugin.id');
  for (const d of ['category', 'avatar', 'theme']) same(plugin.$defs[d].properties.key, C.KEY_RE, `${d}.key`);
  same(plugin.$defs.category.properties.before, C.KEY_RE, 'category.before'); same(plugin.$defs.category.properties.icon, C.ICON_RE, 'category.icon');
  same(agent.name, C.NAME_RE, 'agent.name'); same(agent.role, C.ROLE_RE, 'agent.role'); same(agent.category, C.KEY_RE, 'agent.category');
  same(agent.icon, C.ICON_RE, 'agent.icon'); same(agent.model, C.MODEL_RE, 'agent.model'); assert.deepEqual(agent.tools.items.enum, C.TOOLS, 'agent.tools'); assert.equal(agent.tools.maxItems, C.TOOLS.length, 'agent.tools.maxItems');
  same(agent.avatar, C.AVATAR_REF_RE, 'agent.avatar'); same(agent.conventions.properties.subsets.items, C.CONV_ID_RE, 'agent.conventions.subsets');
  assert.deepEqual(agent.slot.enum, C.SLOTS); assert.deepEqual(agent.effort.enum, ['', ...C.EFFORTS]);
  assert.deepEqual(req('../db.js').ADAPTERS, C.ADAPTERS);
  for (const f of ['squad.schema.json', 'squad-plugin.schema.json', 'squad-agent.schema.json']) assert.equal(JSON.parse(readFileSync(path.join(ROOT, 'schemas', f), 'utf8')).$schema, 'https://json-schema.org/draft/2020-12/schema');

  // Validator: paths, $ref, required, unknown fields, ranges, types, oneOf.
  const errs = validate(cfg, { $schema: 'x', foo: 1, profiles: [{ name: 'a' }, { key: 'k', effort: 'x', concurrency: 0, telemetry: { enabled: 'sim', z: 1 } }], runtime: { timeoutSec: 5 } }).map(formatError);
  assert.deepEqual(errs, [
    'foo: campo desconhecido', 'profiles[0].key: campo obrigatório ausente', 'profiles[1].effort: valor "x" não aceito (use "", "low", "medium", "high", "xhigh", "max", "minimal", "ultra")',
    'profiles[1].concurrency: deve ser no mínimo 1', 'profiles[1].telemetry.enabled: deve ser true ou false', 'profiles[1].telemetry.z: campo desconhecido', 'runtime.timeoutSec: deve ser no mínimo 10',
  ]);
  const one = { oneOf: [{ type: 'string', maxLength: 2 }, { type: 'integer' }] };
  assert.deepEqual(validate(one, 'ab'), []); assert.deepEqual(validate(one, 3), []);
  assert.match(formatError(validate(one, 'abc')[0]), /até 2 caracteres/);
  assert.deepEqual(validate({ type: 'array', maxItems: 1, items: { type: 'string', pattern: '^a' } }, ['b', 'a']).map(formatError), ['deve ter até 1 itens', '[0]: valor "b" fora do formato ^a']);
});

test('schemas no carregador: campo desconhecido no manifesto e no frontmatter é aviso; erro de schema recusa o item', () => {
  const { createPluginLoader } = createRequire(import.meta.url)('../plugins/loader.js');
  const root = tmp('squad-schemaplugin-'); extraDirs.push(root);
  writeTree(path.join(root, 'pk'), {
    'squad-plugin.json': { $schema: '../schemas/squad-plugin.schema.json', id: 'pk', extra: 1, categories: [{ key: 'c1', label: 'C', color: 'red' }, { key: 'c2', label: 5 }], themes: [{ key: 't1', label: 'T', ui: { '--bg': '#000' }, mood: 'x' }] },
    'agents/AAA.md': '---\nname: AAA\nslot: prd\nrole: po\nspecialty: 2024\ncolor: red\n---\nPRD.\n',
    'agents/BBB.md': '---\nname: BBB\nslot: prd\nrole: po\nhellos:\n  - oi\nconventions:\n  template: x\n  extra: y\n---\n',
  });
  const cfg = path.join(root, 'cfg.json');
  writeFileSync(cfg, JSON.stringify({ $schema: './schemas/squad.schema.json', plugins: { paths: ['pk'], extra: 1 }, other: true }));
  const out = createPluginLoader({ root, home: root, env: { SQUAD_CONFIG: cfg }, cwd: root }).load().api;
  const w = out.warnings.join('\n');
  assert.match(w, /cfg\.json: campo "other" desconhecido, ignorado/);
  assert.match(w, /cfg\.json: campo "plugins.extra" desconhecido, ignorado/);
  assert.ok(!/\$schema/.test(w));
  assert.match(w, /\[pk\] squad-plugin\.json: campo "extra" desconhecido, ignorado/);
  assert.match(w, /categories\[0\]\.color: campo desconhecido, ignorado/);
  assert.match(w, /\[pk\] squad-plugin\.json: categories\[1\]\.label: deve ser texto/);
  assert.match(w, /themes\[0\]\.mood: campo desconhecido/);
  assert.match(w, /\[pk\] agents\/AAA\.md: campo "color" desconhecido, ignorado/);
  assert.match(w, /\[pk\] agents\/BBB\.md: conventions\.extra não é aceito/); // the existing check speaks first
  const pk = out.plugins[0];
  assert.deepEqual(pk.categories.map(c => c.key), ['c1']);
  assert.deepEqual(pk.themes.map(t => t.key), ['pk/t1']);
  assert.deepEqual(pk.presets.map(p => [p.name, p.specialty]), [['AAA', '2024']]);
});

test('Perfis da configuração (gravação): mudança entre a leitura e a escrita, symlink, .bak como link e permissões', async () => {
  const root = tmp('squad-cfgsafe-'); extraDirs.push(root);
  const realDir = path.join(root, 'real'), linkDir = path.join(root, 'links');
  mkdirSync(realDir); mkdirSync(linkDir);
  const real = path.join(realDir, 'target.json'), link = path.join(linkDir, 'local.json'), victim = path.join(root, 'victim.txt');
  writeFileSync(real, JSON.stringify({ profiles: [{ key: 'a', name: 'Perfil A', adapter: 'claude' }] }));
  chmodSync(real, 0o640);
  writeFileSync(victim, 'não mexer');
  let links = true;
  try { symlinkSync(real, link); symlinkSync(victim, real + '.bak'); } catch { links = false; }
  const cfg = links ? link : real;
  const b = await setupBridge({ SQUAD_CONFIG: cfg, SQUAD_TEST_CONFIG_WRITE_PAUSE_MS: '400' });
  const put = data => b.api('/api/profiles/cfg-a', { method: 'PUT', body: JSON.stringify(data) });
  await profilesOf(b);

  // A change between the read and the write: refused, the outside change stays.
  const pending = put({ model: 'opus' });
  await new Promise(r => setTimeout(r, 150));
  const outside = JSON.stringify({ profiles: [{ key: 'a', name: 'Perfil A', adapter: 'claude', model: 'haiku' }] });
  writeFileSync(real, outside);
  const res = await pending;
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /mudou desde a última leitura/);
  assert.equal(readFileSync(real, 'utf8'), outside);

  // After a read it goes: written at the link's target (the link stays a link), .bak replaced (the victim it pointed to untouched),
  // the original mode kept.
  await profilesOf(b);
  assert.equal((await put({ model: 'opus' })).status, 200);
  assert.equal(readJson(real).profiles[0].model, 'opus');
  assert.equal(statSync(real).mode & 0o777, 0o640);
  assert.equal(readFileSync(real + '.bak', 'utf8'), outside);
  assert.equal(lstatSync(real + '.bak').isSymbolicLink(), false);
  assert.equal(statSync(real + '.bak').mode & 0o777, 0o640);
  if (links) {
    assert.equal(lstatSync(link).isSymbolicLink(), true);
    assert.equal(readFileSync(victim, 'utf8'), 'não mexer');
    assert.equal(existsSync(link + '.bak'), false);
  }
  assert.deepEqual(readdirSync(realDir).filter(f => f.endsWith('.tmp')), []);
  await b.stop();
});

test('Perfis da configuração (gravação): arquivo novo 0600 e operações concorrentes na mesma fila', async () => {
  const root = tmp('squad-cfgops-'); extraDirs.push(root);
  const shared = path.join(root, 'shared.json'), local = path.join(root, 'novo', 'local.json');
  writeFileSync(shared, JSON.stringify({ profiles: [{ key: 'a', name: 'Perfil A', adapter: 'claude' }, { key: 'b', name: 'Perfil B', adapter: 'claude' }] }));
  const b = await setupBridge({ SQUAD_CONFIG: local, SQUAD_CONFIG_SHARED: shared });
  await profilesOf(b);
  // "Tornar padrão" with no defaultProfile anywhere: the local file is created, 0600.
  assert.equal((await b.api('/api/profiles/cfg-b/default', { method: 'POST' })).status, 200);
  assert.deepEqual(readJson(local), { defaultProfile: 'b' });
  if (process.platform !== 'win32') assert.equal(statSync(local).mode & 0o777, 0o600);
  // Default and delete of the same configured Perfil at the same time: one after the other, never both.
  const [d, x] = await Promise.all([b.api('/api/profiles/cfg-a/default', { method: 'POST' }), b.api('/api/profiles/cfg-a', { method: 'DELETE' })]);
  assert.ok((d.status === 200 && x.status === 409) || (x.status === 200 && d.status === 404), `${d.status} ${x.status}`);
  let list = await profilesOf(b);
  if (d.status === 200) { assert.equal(list.find(p => p.isDefault).id, 'cfg-a'); assert.equal(readJson(local).defaultProfile, 'a'); }
  else { assert.equal(list.some(p => p.id === 'cfg-a'), false); assert.equal(readJson(local).defaultProfile, 'b'); }
  // The same with a Perfil of the database (the configuration declares a default, so it is written there): defaultProfile never
  // ends up pointing to an id that no longer exists, and the effective default cannot be deleted.
  const m = await newProfile(b, { name: 'Manual', adapter: 'claude' });
  const [d2, x2] = await Promise.all([b.api(`/api/profiles/${m.id}/default`, { method: 'POST' }), b.api(`/api/profiles/${m.id}`, { method: 'DELETE' })]);
  assert.ok((d2.status === 200 && x2.status === 409) || (x2.status === 200 && d2.status === 404), `${d2.status} ${x2.status}`);
  list = await profilesOf(b);
  const def = readJson(local).defaultProfile;
  assert.ok(list.some(p => p.id === def || p.id === `cfg-${def}`), `defaultProfile ${def}`);
  assert.equal(list.filter(p => p.isDefault).length, 1);
  await b.stop();
});

test('Perfis da configuração (gravação): telemetry por chave, tipos conferidos antes e caminhos relativos', async () => {
  const root = tmp('squad-cfgfields-'); extraDirs.push(root);
  mkdirSync(path.join(root, 'contas', 'x'), { recursive: true });
  const shared = path.join(root, 'shared.json'), local = path.join(root, 'local.json');
  writeFileSync(shared, JSON.stringify({ profiles: [{ key: 'a', name: 'Perfil A', adapter: 'claude', telemetry: { enabled: true } }] }));
  writeFileSync(local, JSON.stringify({ profiles: [{ key: 'a', model: 'sonnet' }] }));
  const b = await setupBridge({ SQUAD_CONFIG: local, SQUAD_CONFIG_SHARED: shared });
  const put = data => b.api('/api/profiles/cfg-a', { method: 'PUT', body: JSON.stringify(data) });
  await profilesOf(b);
  // Telemetry: only the switch that changed goes into the item of the file of highest precedence (enabled, from shared.json, stays there).
  let res = await put({ name: 'Perfil A', adapter: 'claude', telemetry: { enabled: true, native: true, content: false } });
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(readJson(local).profiles[0], { key: 'a', model: 'sonnet', telemetry: { native: true } });
  assert.deepEqual((await res.json()).profile.telemetry, { enabled: true, native: true, content: false });
  res = await put({ telemetry: { enabled: false, native: true, content: false } });
  assert.deepEqual(readJson(local).profiles[0].telemetry, { native: true, enabled: false });
  assert.equal(readJson(shared).profiles[0].telemetry.enabled, true);
  // Types are checked before anything is normalized: null, numbers as text, unknown telemetry switches.
  const before = readFileSync(local, 'utf8');
  for (const bad of [{ bin: null }, { concurrency: '3' }, { configDir: 5 }, { ignoreUserConfig: 'sim' }, { telemetry: { enabled: 'sim' } }, { telemetry: { headers: {} } }]) {
    res = await put(bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  assert.equal(readFileSync(local, 'utf8'), before);
  // A relative path is checked against the folder of the file written and kept as the person wrote it.
  res = await put({ configDir: 'contas/x' });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal((await res.json()).profile.configDir, realpathSync.native(path.join(root, 'contas', 'x')));
  assert.equal(readJson(local).profiles[0].configDir, 'contas/x');
  res = await put({ configDir: 'contas/nao-existe' });
  assert.equal(res.status, 400);
  assert.equal(readJson(local).profiles[0].configDir, 'contas/x');
  // Unchanged values (the form sends everything back): nothing is written.
  const cur = (await profilesOf(b)).find(p => p.id === 'cfg-a');
  const text = readFileSync(local, 'utf8');
  res = await put({ name: cur.name, adapter: cur.adapter, bin: cur.bin, configDir: cur.configDir, model: cur.model, effort: cur.effort, concurrency: cur.concurrency, threshold: cur.threshold, fallbackId: cur.fallbackId, ignoreUserConfig: cur.ignoreUserConfig, telemetry: cur.telemetry });
  assert.deepEqual((await res.json()).changed, []);
  assert.equal(readFileSync(local, 'utf8'), text);
  await b.stop();
});

test('Perfis da configuração (gravação): com um arquivo inválido nada é gravado (409 citando o arquivo)', async () => {
  const root = tmp('squad-cfgbroken-'); extraDirs.push(root);
  const shared = path.join(root, 'shared.json'), local = path.join(root, 'local.json');
  writeFileSync(shared, JSON.stringify({ profiles: [{ key: 's', name: 'Perfil S', adapter: 'claude' }] }));
  writeFileSync(local, JSON.stringify({ profiles: [{ key: 'a', name: 'Perfil A', adapter: 'claude' }] }));
  const b = await setupBridge({ SQUAD_CONFIG: local, SQUAD_CONFIG_SHARED: shared });
  await profilesOf(b);
  writeFileSync(shared, '{ "profiles": [');
  const list = await profilesOf(b); // the sync is blocked: both stay
  assert.ok(list.some(p => p.id === 'cfg-a') && list.some(p => p.id === 'cfg-s'));
  const text = readFileSync(local, 'utf8');
  const manual = await newProfile(b, { name: 'Manual', adapter: 'claude' });
  for (const [p, m, body] of [['cfg-a', 'DELETE'], ['cfg-a', 'PUT', { model: 'opus' }], ['cfg-a/default', 'POST'], [`${manual.id}/default`, 'POST']]) {
    const res = await b.api(`/api/profiles/${p}`, { method: m, body: body ? JSON.stringify(body) : undefined });
    if (p.startsWith('pf-')) { assert.equal(res.status, 200, `${m} ${p}`); continue; } // no defaultProfile declared: the database only
    assert.equal(res.status, 409, `${m} ${p}`);
    assert.match((await res.json()).error, /shared\.json tem erro/);
  }
  assert.equal(readFileSync(local, 'utf8'), text);
  assert.ok((await profilesOf(b)).some(p => p.id === 'cfg-a'));
  await b.stop();
});

test('schemas: maxBudgetUsd igual ao código e $ref circular vira erro', () => {
  const req = createRequire(import.meta.url);
  const { CONSTANTS: C, SCHEMAS, validateRuntime } = req('../plugins/loader.js');
  const { validate } = req('../schema.js');
  for (const s of [SCHEMAS.config, SCHEMAS.plugin]) {
    const node = s.$defs.runtime.properties.maxBudgetUsd;
    assert.equal(node.anyOf.find(x => x.pattern).pattern, C.BUDGET_RE.source);
    for (const v of [null, '', 0.5, 1000, 1000.0001, 0, -1, 0.00001, '1', '0.5', '.5', '1000', '1000.0', '1000.0000', '1000.5', '0', '0.0000', '0.0001', '01', '1e2', '0x10', ' 5', '-3', 'abc', '12.34567', '0.' + '0'.repeat(400) + '1', true, [], {}]) {
      const code = Object.hasOwn(validateRuntime({ maxBudgetUsd: v }, 'x', () => {}), 'maxBudgetUsd');
      const schema = validate(s, { runtime: { maxBudgetUsd: v } }).length === 0 || validate(s, { id: 'pk', runtime: { maxBudgetUsd: v } }).length === 0;
      assert.equal(schema, code, `maxBudgetUsd ${JSON.stringify(v)}`);
    }
  }
  assert.deepEqual(validate({ $ref: '#' }, 1).map(e => e.keyword), ['$ref']);
  assert.deepEqual(validate({ $defs: { a: { $ref: '#/$defs/b' }, b: { $ref: '#/$defs/a' } }, $ref: '#/$defs/a' }, {}).map(e => e.keyword), ['$ref']);
  const tree = { $defs: { n: { type: 'object', properties: { c: { $ref: '#/$defs/n' } } } }, $ref: '#/$defs/n' };
  let v = {}; for (let i = 0; i < 10; i++) v = { c: v };
  assert.deepEqual(validate(tree, v), []);
  v = {}; for (let i = 0; i < 200; i++) v = { c: v };
  assert.match(validate(tree, v)[0].message, /profunda demais/);
});

// Characterization of the local transport boundary, independent of its implementation.
test('local transport preserves fragmented UTF-8 JSONL and a final result without newline', async () => {
  const dir = tmp('squad-transport-'); extraDirs.push(dir);
  const engine = path.join(dir, 'fragmented.mjs');
  writeFileSync(engine, [
    "if (process.argv.includes('--version')) { console.log('transport-fixture'); process.exit(0); }",
    "let input = ''; process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', chunk => { input += chunk; });",
    "process.stdin.on('end', () => {",
    "  const line = Buffer.from(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'ação 🧪' }] } }) + '\\n');",
    "  const split = line.indexOf(Buffer.from('ç')) + 1;",
    "  process.stdout.write(line.subarray(0, split));",
    "  setTimeout(() => {",
    "    process.stdout.write(line.subarray(split));",
    "    process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: input }));",
    "  }, 20);",
    "});",
  ].join('\n'));
  const b = await startBridge(dir, nextPort++, { SQUAD_CLAUDE_BIN: engine });
  try {
    const prompt = 'linha 1\nlinha 2: ação 🧪 "texto" $HOME';
    const res = await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt, options: { cwd: workdir } }) });
    assert.equal(res.status, 201, await res.clone().text());
    const { runId } = await res.json();
    const events = await collect(runId, b.base, b.token);
    assert.equal(events.find(e => e.type === 'assistant')?.message.content[0].text, 'ação 🧪');
    assert.equal(events.some(e => e.type === 'raw'), false);
    assert.equal(events.filter(e => e.type === 'result').length, 1);
    assert.equal(events.filter(e => e.type === 'exit').length, 1);
    assert.equal(events.at(-1).status, 'done');
    assert.equal(events.at(-1).result, prompt);
    assert.equal((await collect(runId, b.base, b.token)).at(-1).result, prompt);
  } finally { await b.stop(); }
});

test('local transport reports asynchronous spawn failure once and releases admission', { skip: process.platform === 'win32' }, async () => {
  const dir = tmp('squad-spawn-error-'); extraDirs.push(dir);
  const engine = path.join(dir, 'broken-engine');
  writeFileSync(engine, '#!' + path.join(dir, 'missing-interpreter') + '\n', { mode: 0o700 });
  const b = await startBridge(dir);
  try {
    const res = await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'spawn failure', systemPrompt: 'temporary instructions', options: { cwd: workdir, claudePath: engine } }) });
    assert.equal(res.status, 201, await res.clone().text());
    const events = await collect((await res.json()).runId, b.base, b.token);
    assert.equal(events.filter(e => e.type === 'exit').length, 1);
    assert.equal(events.at(-1).status, 'error');
    assert.equal(events.at(-1).isError, true);
    assert.match(events.at(-1).error, /ENOENT/);
    const health = await (await b.api('/api/health')).json();
    assert.equal(health.ok, true);
    assert.equal(health.activeRuns, 0);
    const again = await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'after spawn failure', options: { cwd: workdir } }) });
    assert.equal(again.status, 201);
    assert.equal((await collect((await again.json()).runId, b.base, b.token)).at(-1).status, 'done');
  } finally { await b.stop(); }
});

test('local transport timeout precedes one terminal event and releases admission', async () => {
  const dir = tmp('squad-timeout-'); extraDirs.push(dir);
  const b = await startBridge(dir);
  try {
    const res = await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'SLEEP', options: { cwd: workdir, timeoutSec: 10 } }) });
    assert.equal(res.status, 201);
    const events = await collect((await res.json()).runId, b.base, b.token);
    const timeout = events.findIndex(e => e.type === 'bridge' && e.subtype === 'timeout');
    assert.ok(timeout >= 0 && timeout < events.length - 1);
    assert.equal(events[timeout].timeoutSec, 10);
    assert.equal(events.filter(e => e.type === 'exit').length, 1);
    assert.equal(events.at(-1).status, 'timeout');
    assert.equal(events.at(-1).isError, true);
    assert.equal((await (await b.api('/api/health')).json()).activeRuns, 0);
  } finally { await b.stop(); }
});
