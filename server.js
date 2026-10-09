#!/usr/bin/env node
'use strict';
/*
 * SQUAD/CODE bridge: serves index.html, spawns headless Claude Code (`claude -p`) and keeps the app's data in SQLite (db.js).
 * Only dependency: better-sqlite3 (`npm install`). Binds to 127.0.0.1 only and requires a per-start token on every API call.
 *
 *   node server.js [--port 4317]
 *
 * Environment:
 *   SQUAD_PORT        port (default 4317)
 *   SQUAD_CLAUDE_BIN  claude executable to use when the UI does not set one (default: "claude")
 *   SQUAD_HOME        overrides the home dir used for ~/.claude/settings.json (tests)
 *   SQUAD_PROJECTS_DIR root of the per-project folders (default: ./projects next to this file)
 *   SQUAD_DATA_DIR    folder of the SQLite database, squad.db (default: ./data next to this file)
 *   SQUAD_CONFIG      local configuration file used instead of ./squad.local.json (plugins.js, docs/plans/plugins-conteudo.md)
 *   SQUAD_PLUGINS       extra plugin folders, separated by the platform's path delimiter
 */
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');

const ROOT = __dirname;
const argPort = process.argv.indexOf('--port');
const PORT = Number(argPort > -1 ? process.argv[argPort + 1] : process.env.SQUAD_PORT) || 4317;
const HOST = '127.0.0.1';
const TOKEN = crypto.randomBytes(24).toString('hex');
const HOME = process.env.SQUAD_HOME || os.homedir();
const DEFAULT_BIN = process.env.SQUAD_CLAUDE_BIN || 'claude';
const IS_WIN = process.platform === 'win32';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-code-'));
// Every project runs in its own folder under PROJECTS_DIR (created on the first run).
const PROJECTS_DIR = path.resolve(process.env.SQUAD_PROJECTS_DIR || path.join(ROOT, 'projects'));
const FOLDER_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)$/;
try { fs.mkdirSync(PROJECTS_DIR, { recursive: true }); } catch {} // otherwise the first project run creates it
// The app's data (workspace, versions, operation rooms, chats, run history) lives in DATA_DIR/squad.db (db.js).
// It is opened at start only when it exists (or a data/workspace.json from the file version waits to be imported); otherwise the
// page asks the person to create it (POST /api/setup) and nothing is written to disk before that.
const DATA_DIR = path.resolve(process.env.SQUAD_DATA_DIR || path.join(ROOT, 'data'));
const DB_FILE = path.join(DATA_DIR, 'squad.db');
const LEGACY_FILE = path.join(DATA_DIR, 'workspace.json');
const MAX_WORKSPACE = 64 * 1024 * 1024;
const dbModule = require('./db.js');
if (dbModule.driverError) { console.error(`SQUAD/CODE: ${dbModule.driverError}`); process.exit(1); }
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) console.warn(`SQUAD/CODE pede o Node 22 ou mais novo (este é o ${process.version}). Atualize se algo falhar.`);
// Plugins (plugins.js): reread on every serveIndex when a file they came from changed.
const pluginLoader = require('./plugins.js').createPluginLoader({ root: ROOT, home: HOME });
function loadPlugins() {
  try { return pluginLoader.load(); }
  catch (e) { const warnings = [`Plugins não carregados: ${e.message}`]; return { page: { plugins: [], runtime: {}, warnings }, api: { plugins: [], runtime: {}, warnings, config: { files: [], paths: [], disabled: [], profiles: [] } }, count: 0 }; }
}
let store = null;
function openDb() {
  store = dbModule.openStore(DATA_DIR);
  if (store.migration?.imported) console.log(`Workspace migrado de data/workspace.json para ${store.file} (${store.migration.versions} versões antigas). Os arquivos JSON foram para ${path.join(DATA_DIR, 'legacy-json')}.`);
  if (store.migration?.warning) console.warn(store.migration.warning);
  if (store.migration?.error) console.warn(store.migration.error);
  return store;
}
// No database, or one without a workspace yet: the page shows "Nenhum banco de dados encontrado" before anything else.
const setupNeeded = () => !store || !store.readWorkspace(false).exists;
function needStore() {
  if (!store) throw Object.assign(new Error('Nenhum banco de dados ainda. Crie um na tela inicial do SQUAD/CODE.'), { status: 503 });
  return store;
}

const PERMISSION_MODES = ['acceptEdits', 'auto', 'bypassPermissions', 'manual', 'dontAsk', 'plan'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const TOOL_RE = /^[A-Za-z][A-Za-z0-9_]*(\([^()\r\n"]{0,200}\))?$|^mcp__[A-Za-z0-9_-]+(__[A-Za-z0-9_*-]+)?$/;
const MODEL_RE = /^[A-Za-z0-9._\-\[\]]{1,80}$/;
const MAX_EVENTS = 5000;
const MAX_BODY = 2 * 1024 * 1024;

const runs = new Map();
let maxConcurrent = 2;
const versionCache = new Map();

/* ---------- helpers ---------- */
function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(data);
}
function fail(res, status, message) { json(res, status, { ok: false, error: message }); }

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { reject(Object.assign(new Error('Corpo da requisição muito grande.'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('JSON inválido.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function allowedHost(value) {
  if (!value) return false;
  return value === `${HOST}:${PORT}` || value === `localhost:${PORT}`;
}
function allowedOrigin(origin) {
  if (!origin) return true; // same-origin GET/navigation, curl
  return origin === `http://${HOST}:${PORT}` || origin === `http://localhost:${PORT}`;
}
function tokenOk(req, url) {
  const given = req.headers['x-squad-token'] || url.searchParams.get('token') || '';
  const a = Buffer.from(String(given)); const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Resolve an executable name to a full path (Windows needs to know .exe vs .cmd). */
function resolveBin(bin) {
  return new Promise(resolve => {
    if (path.isAbsolute(bin) || bin.includes('/') || bin.includes('\\')) return resolve(fs.existsSync(bin) ? path.resolve(bin) : null);
    execFile(IS_WIN ? 'where' : 'which', [bin], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const lines = String(stdout).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const pick = IS_WIN ? (lines.find(l => /\.(exe|cmd|bat)$/i.test(l)) || lines[0]) : lines[0];
      resolve(pick || null);
    });
  });
}

/** Expand Windows 8.3 short names (C:\USER~1) that Claude Code's path safety checks reject. */
const longPath = p => { try { return fs.realpathSync.native(p); } catch { return p; } };

/* Claude Code loads CLAUDE.md from every folder above the cwd: project runs skip this app's own instructions.
 * Absolute patterns plus a `**`-anchored variant (last two segments of ROOT), in case the drive letter does not match. */
const APP_MEMORY_EXCLUDES = (() => {
  const root = longPath(ROOT).replace(/\\/g, '/'), tail = root.split('/').filter(Boolean).slice(-2).join('/');
  const files = ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.claude/CLAUDE.md', '.claude/rules/**'];
  return [...files.map(f => `${root}/${f}`), ...files.map(f => `**/${tail}/${f}`)];
})();

/* Each project folder is its own git repository (git init before its first run, when git is installed). Otherwise Claude Code, which
 * takes the enclosing repository as the project (git status, .claude/settings.json outside Windows), and the agents' git commands
 * would work on whatever repository holds PROJECTS_DIR, such as this app's clone. GIT_CEILING_DIRECTORIES (startRun) covers the rest. */
const gitCeiling = () => [longPath(PROJECTS_DIR), process.env.GIT_CEILING_DIRECTORIES].filter(Boolean).join(path.delimiter);
let gitMissing = false;
function ensureProjectRepo(dir) {
  if (gitMissing || fs.existsSync(path.join(dir, '.git'))) return Promise.resolve();
  return new Promise(resolve => {
    execFile('git', ['init', '-q'], { cwd: dir, windowsHide: true, timeout: 15000, env: { ...process.env, GIT_CEILING_DIRECTORIES: gitCeiling() } }, err => {
      if (err?.code === 'ENOENT') { gitMissing = true; console.warn('git não encontrado: as pastas dos projetos ficam sem repositório próprio. Instale o Git para isolá-las.'); }
      else if (err) console.warn(`git init em ${dir} falhou: ${err.message}`);
      resolve();
    });
  });
}

/** Folder of a project under PROJECTS_DIR; the name is a plain slug, so it cannot leave the root. */
function projectDir(name) {
  const folder = String(name || '').trim();
  if (!FOLDER_RE.test(folder) || RESERVED_RE.test(folder)) throw new Error(`Pasta de projeto inválida: ${folder.slice(0, 80)}`);
  return path.join(longPath(PROJECTS_DIR), folder);
}

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

async function claudeVersion(bin) {
  const resolved = await resolveBin(bin);
  if (!resolved) return { resolved: null, version: null, error: `Executável "${bin}" não encontrado no PATH.` };
  if (versionCache.has(resolved)) return versionCache.get(resolved);
  const info = await new Promise(resolve => {
    const child = spawnBin(resolved, ['--version'], { windowsHide: true });
    let out = ''; let err = '';
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(timer); resolve({ resolved, version: null, error: e.message }); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ resolved, version: out.trim().split(/\r?\n/)[0] || 'desconhecida', error: null });
      else resolve({ resolved, version: null, error: (err || out).trim().slice(0, 500) || `exit ${code}` });
    });
  });
  if (info.version) versionCache.set(resolved, info);
  return info;
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  if (IS_WIN) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
}

/* ---------- runs ---------- */
function activeCount() { return [...runs.values()].filter(r => r.status === 'running').length; }

function pushEvent(run, event) {
  run.events.push(event);
  if (run.events.length > MAX_EVENTS) run.events.splice(0, run.events.length - MAX_EVENTS);
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of run.clients) res.write(line);
  persistEvent(run, event);
}

/* Run history (db.js): events go to the database in small batches. Partial text deltas are not kept (the console never shows
   them) and long tool outputs are cut; the exit event is always kept, past MAX_EVENTS too. */
function persistEvent(run, event) {
  if (!run.persist || event.type === 'stream_event') return;
  if (run.saved >= MAX_EVENTS && event.type !== 'exit') return;
  run.saved++;
  run.pending.push({ seq: run.saved, type: String(event.type || ''), data: JSON.stringify(storedEvent(event)) });
  if (event.type === 'exit') flushRun(run);
  else if (!run.flushTimer) run.flushTimer = setTimeout(() => flushRun(run), 200);
}
function flushRun(run) {
  clearTimeout(run.flushTimer); run.flushTimer = null;
  const batch = run.pending ? run.pending.splice(0) : [];
  if (!batch.length || !run.persist || !store) return;
  try { store.appendRunEvents(run.id, batch); }
  catch (e) { run.persist = false; console.warn(`Histórico da execução ${run.id} não gravado: ${e.message}`); }
}
function storedEvent(event) {
  if (event.type !== 'user' || !Array.isArray(event.message?.content)) return event;
  const cut = v => typeof v === 'string' && v.length > 4000 ? v.slice(0, 4000) + '…' : v;
  const block = b => b?.type !== 'tool_result' ? b : { ...b, content: Array.isArray(b.content) ? b.content.map(x => x?.type === 'text' ? { ...x, text: cut(x.text) } : x) : cut(b.content) };
  return { ...event, message: { ...event.message, content: event.message.content.map(block) } };
}

function validateRunOptions(o = {}) {
  const out = {};
  out.claudePath = typeof o.claudePath === 'string' && o.claudePath.trim() ? o.claudePath.trim() : DEFAULT_BIN;
  if (typeof o.project === 'string' && o.project.trim()) {
    const dir = projectDir(o.project);
    fs.mkdirSync(dir, { recursive: true });
    out.cwd = longPath(dir); out.projectRun = true;
  } else if (typeof o.cwd === 'string' && o.cwd.trim()) {
    // Explicit folder (tests, direct API use). Never an implicit one: process.cwd() is usually this app's own folder.
    const cwd = path.resolve(o.cwd.trim());
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error(`Diretório de trabalho inexistente: ${cwd}`);
    out.cwd = longPath(cwd);
  } else throw new Error('Execução sem pasta de projeto: informe a pasta da operação (opção "project", em projects/).');
  if (o.model) { if (!MODEL_RE.test(o.model)) throw new Error('Modelo inválido.'); out.model = o.model; }
  if (o.permissionMode) { if (!PERMISSION_MODES.includes(o.permissionMode)) throw new Error('Modo de permissão inválido.'); out.permissionMode = o.permissionMode; }
  if (o.effort) { if (!EFFORTS.includes(o.effort)) throw new Error('Nível de esforço inválido.'); out.effort = o.effort; }
  if (o.maxBudgetUsd !== undefined && o.maxBudgetUsd !== '' && o.maxBudgetUsd !== null) {
    const n = Number(o.maxBudgetUsd); if (!Number.isFinite(n) || n <= 0 || n > 1000) throw new Error('Orçamento máximo inválido.'); out.maxBudgetUsd = String(n);
  }
  const tools = list => (Array.isArray(list) ? list : []).map(String).map(s => s.trim()).filter(Boolean).slice(0, 60);
  out.allowedTools = tools(o.allowedTools); out.disallowedTools = tools(o.disallowedTools);
  for (const t of [...out.allowedTools, ...out.disallowedTools]) if (!TOOL_RE.test(t)) throw new Error(`Ferramenta inválida: ${t}`);
  // Optional hard restriction of the built-in tool set (maps to --tools). null = Claude Code defaults.
  out.tools = Array.isArray(o.tools) ? tools(o.tools) : null;
  if (out.tools) for (const t of out.tools) if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(t)) throw new Error(`Ferramenta inválida: ${t}`);
  out.addDirs = (Array.isArray(o.addDirs) ? o.addDirs : []).map(String).map(s => s.trim()).filter(Boolean).slice(0, 10).map(d => path.resolve(d));
  out.addDirs = out.addDirs.map(d => fs.existsSync(d) ? longPath(d) : d);
  for (const d of out.addDirs) if (!fs.existsSync(d)) throw new Error(`Diretório adicional inexistente: ${d}`);
  // Streams text deltas as `stream_event` lines (chat bubbles grow while the model writes).
  out.partial = o.partial === true;
  // Squad colleagues the agent may call with the Agent tool (--agents file) and their text in the stream (--forward-subagent-text).
  out.agents = validateAgents(o.agents);
  out.forwardSubagents = o.forwardSubagents === true;
  const timeout = Number(o.timeoutSec); out.timeoutSec = Number.isFinite(timeout) && timeout >= 10 && timeout <= 7200 ? timeout : 900;
  return out;
}

/** CLI-defined subagents: whitelisted fields only, bounded sizes. null = none. */
function validateAgents(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Agentes inválidos.');
  const entries = Object.entries(value);
  if (entries.length > 20) throw new Error('Até 20 agentes por execução.');
  const out = {};
  for (const [key, def] of entries) {
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(key)) throw new Error(`Identificador de agente inválido: ${key.slice(0, 60)}`);
    if (!def || typeof def !== 'object' || Array.isArray(def)) throw new Error(`Definição inválida do agente ${key}.`);
    const description = typeof def.description === 'string' ? def.description.trim() : '';
    if (!description || description.length > 1000) throw new Error(`Descrição inválida do agente ${key}.`);
    const agent = { description, prompt: typeof def.prompt === 'string' ? def.prompt.slice(0, 60000) : '' };
    if (def.tools !== undefined) {
      if (!Array.isArray(def.tools) || def.tools.length > 30 || !def.tools.every(t => typeof t === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(t))) throw new Error(`Ferramentas inválidas do agente ${key}.`);
      agent.tools = def.tools;
    }
    if (def.model) { if (!MODEL_RE.test(def.model)) throw new Error(`Modelo inválido do agente ${key}.`); agent.model = def.model; }
    if (def.effort) { if (!EFFORTS.includes(def.effort)) throw new Error(`Esforço inválido do agente ${key}.`); agent.effort = def.effort; }
    out[key] = agent;
  }
  if (JSON.stringify(out).length > 400000) throw new Error('Definição dos agentes muito grande.');
  return entries.length ? out : null;
}

async function startRun(body) {
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  if (!prompt.trim()) throw new Error('Prompt vazio.');
  if (prompt.length > 400000) throw new Error('Prompt muito grande.');
  const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.slice(0, 100000) : '';
  const opts = validateRunOptions(body.options);
  if (activeCount() >= maxConcurrent) throw Object.assign(new Error(`Limite de ${maxConcurrent} execuções simultâneas atingido.`), { status: 429 });
  const resolved = await resolveBin(opts.claudePath);
  if (!resolved) throw new Error(`Claude Code não encontrado ("${opts.claudePath}"). Ajuste o caminho nas configurações.`);
  if (opts.projectRun) await ensureProjectRepo(opts.cwd);

  const id = crypto.randomUUID();
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-prompts', 'none'];
  let sysFile = null, settingsFile = null, agentsFile = null;
  // OS temp cleanup can remove the (usually empty) folder while the bridge keeps running.
  if (systemPrompt.trim() || opts.projectRun || opts.agents) await fsp.mkdir(TMP_DIR, { recursive: true });
  if (systemPrompt.trim()) {
    sysFile = path.join(TMP_DIR, `${id}.system.md`);
    await fsp.writeFile(sysFile, systemPrompt, 'utf8');
    args.push('--append-system-prompt-file', sysFile);
  }
  if (opts.projectRun) {
    settingsFile = path.join(TMP_DIR, `${id}.settings.json`);
    // The file tools also refuse reads outside the project folder (and --add-dir), so agents never take this app or the
    // person's other folders for the project.
    await fsp.writeFile(settingsFile, JSON.stringify({ claudeMdExcludes: APP_MEMORY_EXCLUDES, permissions: { blockReadsOutsideWorkingDirectories: true } }), 'utf8');
    args.push('--settings', settingsFile);
  }
  if (opts.agents) {
    agentsFile = path.join(TMP_DIR, `${id}.agents.json`);
    await fsp.writeFile(agentsFile, JSON.stringify(opts.agents), 'utf8');
    args.push('--agents', agentsFile);
  }
  if (opts.forwardSubagents) args.push('--forward-subagent-text');
  if (opts.model) args.push('--model', opts.model);
  if (opts.permissionMode) args.push('--permission-mode', opts.permissionMode);
  if (opts.effort) args.push('--effort', opts.effort);
  if (opts.maxBudgetUsd) args.push('--max-budget-usd', opts.maxBudgetUsd);
  if (opts.tools) args.push('--tools', opts.tools.length ? opts.tools.join(',') : '');
  if (opts.allowedTools.length) args.push('--allowedTools', opts.allowedTools.join(','));
  if (opts.disallowedTools.length) args.push('--disallowedTools', opts.disallowedTools.join(','));
  for (const d of opts.addDirs) args.push('--add-dir', d);
  if (opts.partial) args.push('--include-partial-messages');

  const child = spawnBin(resolved, args, {
    cwd: opts.cwd, windowsHide: true, detached: !IS_WIN,
    // With squad colleagues, calls run in the foreground: the Agent tool result is the colleague's answer, not a launch notice.
    // Project runs: git stops at PROJECTS_DIR (see ensureProjectRepo), even when the folder's own .git is missing.
    env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: process.env.CLAUDE_CODE_ENTRYPOINT || 'squad-code-bridge', ...(opts.agents ? { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' } : {}), ...(opts.projectRun ? { GIT_CEILING_DIRECTORIES: gitCeiling() } : {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const run = {
    id, status: 'running', startedAt: new Date().toISOString(), endedAt: null, label: String(body.label || '').slice(0, 200),
    cwd: opts.cwd, args: args.map(a => a === sysFile ? '<system-prompt-file>' : a === settingsFile ? '<settings-file>' : a === agentsFile ? '<agents-file>' : a), child, events: [], clients: new Set(),
    result: null, sysFile, settingsFile, agentsFile, timer: null, cancelled: false,
    // History: who ran it and where (body.meta, whitelisted in db.js), saved events count and the batch waiting to be written.
    // Without a database yet (direct API use before the setup), the run still works but stays out of the history.
    meta: dbModule.runMeta(body.meta), project: typeof body.options?.project === 'string' ? body.options.project.slice(0, 80) : '', persist: !!store, saved: 0, pending: [], flushTimer: null,
  };
  runs.set(id, run);
  if (run.persist) try { store.insertRun(run); } catch (e) { run.persist = false; console.warn(`Histórico da execução ${id} não gravado: ${e.message}`); }
  pushEvent(run, { type: 'bridge', subtype: 'spawned', pid: child.pid, cwd: opts.cwd, args: run.args, at: run.startedAt });

  run.timer = setTimeout(() => { run.timedOut = true; pushEvent(run, { type: 'bridge', subtype: 'timeout', timeoutSec: opts.timeoutSec }); killTree(child); }, opts.timeoutSec * 1000);

  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let evt; try { evt = JSON.parse(line); } catch { evt = { type: 'raw', text: line.slice(0, 4000) }; }
      if (evt.type === 'result') run.result = evt;
      pushEvent(run, evt);
    }
  });
  let stderrTail = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderrTail = (stderrTail + chunk).slice(-4000); pushEvent(run, { type: 'stderr', text: chunk.slice(0, 4000) }); });
  child.on('error', err => { stderrTail += err.message; });
  child.on('close', code => {
    clearTimeout(run.timer);
    if (buffer.trim()) { try { const evt = JSON.parse(buffer); if (evt.type === 'result') run.result = evt; pushEvent(run, evt); } catch { pushEvent(run, { type: 'raw', text: buffer.slice(0, 4000) }); } }
    const r = run.result || {};
    const isError = run.cancelled || run.timedOut || code !== 0 || !!r.is_error;
    run.status = run.cancelled ? 'cancelled' : run.timedOut ? 'timeout' : isError ? 'error' : 'done';
    run.endedAt = new Date().toISOString();
    const exit = {
      type: 'exit', status: run.status, code, isError,
      result: typeof r.result === 'string' ? r.result : '',
      costUsd: r.total_cost_usd ?? r.cost_usd ?? null, durationMs: r.duration_ms ?? null,
      numTurns: r.num_turns ?? null, sessionId: r.session_id ?? null,
      error: isError ? (run.cancelled ? 'Execução cancelada pelo operador.' : run.timedOut ? 'Tempo limite excedido.' : (r.is_error && r.result) || stderrTail.trim().slice(-1500) || `claude saiu com código ${code}`) : null,
    };
    pushEvent(run, exit);
    if (run.persist) try { store.finishRun(run, exit); } catch (e) { console.warn(`Histórico da execução ${id} não finalizado: ${e.message}`); }
    for (const res of run.clients) res.end();
    run.clients.clear();
    for (const file of [run.sysFile, run.settingsFile, run.agentsFile]) if (file) fsp.rm(file, { force: true }).catch(() => {});
    run.child = null;
    // Keep finished runs for 30 minutes so late subscribers can replay.
    setTimeout(() => runs.delete(id), 30 * 60 * 1000).unref();
  });

  child.stdin.on('error', () => {});
  child.stdin.end(prompt, 'utf8');
  return run;
}

function runSummary(r) {
  return { id: r.id, status: r.status, label: r.label, ...r.meta, project: r.project, startedAt: r.startedAt, endedAt: r.endedAt, cwd: r.cwd, events: r.events.length };
}

/* ---------- settings.json ---------- */
// A project folder (`project`) may not exist yet: it is created by its first run or by the first save here.
function settingsPath(scope, cwd, project) {
  if (scope === 'user') return path.join(HOME, '.claude', 'settings.json');
  if (scope === 'project' || scope === 'local') {
    let base;
    if (project && project.trim()) base = projectDir(project);
    else {
      base = cwd && cwd.trim() ? path.resolve(cwd.trim()) : process.cwd();
      if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) throw new Error(`Diretório do projeto inexistente: ${base}`);
    }
    return path.join(base, '.claude', scope === 'local' ? 'settings.local.json' : 'settings.json');
  }
  throw new Error('Escopo inválido. Use user, project ou local.');
}

async function readSettings(scope, cwd, project) {
  const file = settingsPath(scope, cwd, project);
  try { const text = await fsp.readFile(file, 'utf8'); return { ok: true, scope, path: file, exists: true, text }; }
  catch (e) { if (e.code === 'ENOENT') return { ok: true, scope, path: file, exists: false, text: '{\n}\n' }; throw e; }
}

async function writeSettings(scope, cwd, project, text) {
  if (typeof text !== 'string') throw new Error('Conteúdo ausente.');
  let parsed; try { parsed = JSON.parse(text); } catch (e) { throw new Error('JSON inválido: ' + e.message); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('settings.json deve ser um objeto JSON.');
  const file = settingsPath(scope, cwd, project);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  let backup = null;
  if (fs.existsSync(file)) { backup = file + '.bak'; await fsp.copyFile(file, backup); }
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
  await fsp.rename(tmp, file);
  return { ok: true, scope, path: file, backup };
}

/* ---------- page data tags ---------- */
// The page boots from these (no request, no flash of the browser copy): JSON with every `<` escaped.
const jsonTag = (id, data) => `<script type="application/json" id="${id}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
// `setup`: no database or no workspace in it yet, so the page asks how to start (POST /api/setup) before anything else.
function workspaceTag() {
  let info;
  try { info = store ? store.readWorkspace() : { rev: '', savedAt: '', workspace: null }; } catch (e) { info = { rev: '', savedAt: '', workspace: null, error: e.message }; }
  return jsonTag('squad-disk', { rev: info.rev, savedAt: info.savedAt, path: store?.file || DB_FILE, workspace: info.workspace, error: info.error || '', setup: !info.error && !info.workspace && setupNeeded() });
}
// Operation rooms (the last 200 messages of each project) and chats; orphans are swept first.
function memoryTag() {
  if (!store) return jsonTag('squad-memory', { rooms: {}, chats: {} });
  try { store.sweep(); return jsonTag('squad-memory', { rooms: store.loadRooms(200), chats: store.loadChats() }); }
  catch (e) { console.warn(`Sala e conversas não carregadas: ${e.message}`); return jsonTag('squad-memory', { rooms: {}, chats: {} }); }
}

/* ---------- http ---------- */
async function serveIndex(res) {
  const file = path.join(ROOT, 'index.html');
  let html;
  try { html = await fsp.readFile(file, 'utf8'); }
  catch (e) {
    if (e.code !== 'ENOENT') throw e;
    // index.html is built from src/; a clone without it gets the way to build it instead of a bare error.
    res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    return res.end('<!doctype html><meta charset="utf-8"><title>SQUAD/CODE</title><body style="font:15px/1.7 system-ui,sans-serif;background:#05080a;color:#d8e1e5;padding:48px;max-width:640px">'
      + '<h1 style="font-weight:500">index.html não encontrado</h1><p>A interface é gerada a partir de <code>src/</code>. Na pasta do SQUAD/CODE, rode <code>npm run dev</code> (gera e inicia o bridge) ou <code>python build.py</code> e recarregue esta página.</p></body>');
  }
  const tags = workspaceTag() + '\n' + memoryTag() + '\n' + jsonTag('squad-plugins', loadPlugins().page); // a function replacement: the data may contain `$&` and similar patterns
  html = html.replace('<head>', () => `<head>\n<meta name="squad-bridge-token" content="${TOKEN}">\n${tags}`);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(html);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (!allowedHost(req.headers.host)) return fail(res, 421, 'Host não permitido.');
  if (!allowedOrigin(req.headers.origin)) return fail(res, 403, 'Origem não permitida.');

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return serveIndex(res);
  if (!url.pathname.startsWith('/api/')) return fail(res, 404, 'Não encontrado.');
  if (!tokenOk(req, url)) return fail(res, 401, 'Token do bridge inválido. Recarregue a página servida pelo bridge.');

  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      const bin = url.searchParams.get('claudePath') || DEFAULT_BIN;
      const info = await claudeVersion(bin);
      return json(res, 200, { ok: true, bridge: 'squad-code', claudeVersion: info.version, claudePath: info.resolved, claudeError: info.error, defaultCwd: process.cwd(), projectsDir: longPath(PROJECTS_DIR), home: HOME, platform: process.platform, activeRuns: activeCount(), maxConcurrent, dbReady: !setupNeeded(), dbPath: store?.file || DB_FILE, plugins: loadPlugins().count });
    }
    // Plugins as injected in the page, without the avatars' data URLs, plus the configuration they came from.
    if (req.method === 'GET' && url.pathname === '/api/plugins') return json(res, 200, { ok: true, ...loadPlugins().api });
    // First start: the page creates the database with the workspace the person chose (from scratch, the example, a backup or the
    // browser's copy). Validated before anything is written; refused once a workspace exists.
    if (req.method === 'POST' && url.pathname === '/api/setup') {
      const body = await readBody(req, MAX_WORKSPACE);
      if (!setupNeeded()) return json(res, 409, { ok: false, conflict: true, path: store.file, error: 'Já existe um banco de dados com um workspace. Recarregue a página.' });
      dbModule.checkWorkspace(body);
      if (!store) openDb();
      const saved = store.syncWorkspace(body, '', false);
      console.log(`Banco de dados criado: ${store.file}`);
      return json(res, 201, saved);
    }
    if (req.method === 'POST' && url.pathname === '/api/config') {
      const body = await readBody(req);
      const n = Number(body.concurrency);
      if (Number.isInteger(n) && n >= 1 && n <= 8) maxConcurrent = n;
      return json(res, 200, { ok: true, maxConcurrent });
    }
    if (url.pathname === '/api/runs' && req.method === 'GET') {
      // The history comes from the database; runs still in memory report their current status.
      if (!store) return json(res, 200, { ok: true, runs: [] });
      const list = store.listRuns({ projectId: url.searchParams.get('projectId') || '', limit: url.searchParams.get('limit') });
      return json(res, 200, { ok: true, runs: list.map(r => runs.has(r.id) ? { ...r, status: runs.get(r.id).status } : r) });
    }
    if (url.pathname === '/api/runs' && req.method === 'POST') {
      const run = await startRun(await readBody(req));
      return json(res, 201, { ok: true, runId: run.id, args: run.args, cwd: run.cwd });
    }
    if (parts[1] === 'runs' && parts[2]) {
      const run = runs.get(parts[2]);
      if (!run) {
        // Older runs (and those from before a restart) are replayed from the history.
        const saved = store?.getRun(parts[2]);
        if (!saved) return fail(res, 404, 'Execução não encontrada.');
        if (req.method === 'GET' && parts[3] === 'events') {
          res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' });
          res.write(': connected\n\n');
          for (const evt of store.runEvents(parts[2])) res.write(`data: ${JSON.stringify(evt)}\n\n`);
          return res.end();
        }
        if (req.method === 'POST' && parts[3] === 'cancel') return json(res, 200, { ok: true, status: saved.run.status });
        if (req.method === 'GET' && !parts[3]) return json(res, 200, { ok: true, ...saved });
        return fail(res, 404, 'Rota não encontrada.');
      }
      if (req.method === 'GET' && parts[3] === 'events') {
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': connected\n\n');
        for (const evt of run.events) res.write(`data: ${JSON.stringify(evt)}\n\n`);
        if (run.status !== 'running') return res.end();
        run.clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 20000);
        req.on('close', () => { clearInterval(ping); run.clients.delete(res); });
        return;
      }
      if (req.method === 'POST' && parts[3] === 'cancel') {
        if (run.status === 'running') { run.cancelled = true; pushEvent(run, { type: 'bridge', subtype: 'cancel' }); killTree(run.child); }
        return json(res, 200, { ok: true, status: run.status });
      }
      if (req.method === 'GET' && !parts[3]) return json(res, 200, { ok: true, run: runSummary(run), result: run.result });
    }
    if (url.pathname === '/api/workspace') {
      // ?meta=1: a tab checking whether the saved workspace moved on, without the workspace itself.
      if (req.method === 'GET') {
        const withWorkspace = url.searchParams.get('meta') !== '1';
        if (!store) return json(res, 200, { ok: true, exists: false, rev: '', savedAt: '', path: DB_FILE, ...(withWorkspace ? { workspace: null } : {}) });
        return json(res, 200, { ok: true, ...store.readWorkspace(withWorkspace) });
      }
      if (req.method === 'PUT') {
        // The first workspace only comes through /api/setup, chosen by the person.
        if (setupNeeded()) return fail(res, 503, 'Nenhum banco de dados ainda. Crie um na tela inicial do SQUAD/CODE.');
        const saved = store.syncWorkspace(await readBody(req, MAX_WORKSPACE), url.searchParams.get('base') || '', url.searchParams.get('force') === '1');
        return json(res, saved.conflict ? 409 : 200, saved);
      }
    }
    // A browser copy that lost to the saved version (or a stale page's last state) becomes a version, never discarded.
    if (url.pathname === '/api/workspace/backups' && req.method === 'POST') return json(res, 201, { ok: true, id: needStore().backupWorkspace(await readBody(req, MAX_WORKSPACE)) });
    if (url.pathname === '/api/workspace/snapshots' && req.method === 'GET') return json(res, 200, { ok: true, snapshots: needStore().listSnapshots() });
    if (parts[1] === 'workspace' && parts[2] === 'snapshots' && parts[3] && !parts[4] && req.method === 'GET') {
      const workspace = needStore().getSnapshot(parts[3]);
      return workspace ? json(res, 200, { ok: true, workspace }) : fail(res, 404, 'Versão não encontrada.');
    }
    // Operation room: incremental {seq, upserts, removes}; also sent with sendBeacon (?token=) when the page closes.
    if (parts[1] === 'rooms' && parts[2] && !parts[3] && req.method === 'POST') return json(res, 200, needStore().saveRoom(decodeURIComponent(parts[2]), await readBody(req, MAX_WORKSPACE)));
    if (parts[1] === 'chats' && parts[2] && parts[3] && !parts[4]) {
      const key = decodeURIComponent(parts[3]);
      if (req.method === 'PUT' || req.method === 'POST') return json(res, 200, needStore().saveChat(parts[2], key, await readBody(req, MAX_WORKSPACE)));
      if (req.method === 'DELETE') return json(res, 200, needStore().deleteChat(parts[2], key));
    }
    if (url.pathname === '/api/claude/settings') {
      const scope = url.searchParams.get('scope') || 'user';
      const cwd = url.searchParams.get('cwd') || '', project = url.searchParams.get('project') || '';
      if (req.method === 'GET') return json(res, 200, await readSettings(scope, cwd, project));
      if (req.method === 'PUT') { const body = await readBody(req); return json(res, 200, await writeSettings(scope, cwd, project, body.text)); }
    }
    return fail(res, 404, 'Rota não encontrada.');
  } catch (err) {
    return fail(res, err.status || 400, err.message || 'Erro no bridge.');
  }
}

const server = http.createServer((req, res) => { handle(req, res).catch(err => { try { fail(res, 500, err.message); } catch {} }); });

function shutdown() {
  for (const run of runs.values()) { if (run.child) { run.cancelled = true; killTree(run.child); } flushRun(run); }
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
  server.close();
  // Runs still open are marked interrupted at the next start.
  setTimeout(() => { try { store?.close(); } catch {} process.exit(0); }, 300).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// A port in use (usually another SQUAD/CODE already open) ends here, before the database is touched.
server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`SQUAD/CODE: a porta ${PORT} já está em uso (outro SQUAD/CODE aberto?). Feche-o ou use outra porta: npm start -- --port ${PORT + 1}`);
  else console.error(`SQUAD/CODE: não foi possível abrir o servidor em ${HOST}:${PORT}. ${err.message}`);
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  // The database opens only once the port is ours: a second instance never marks the first one's live runs as interrupted.
  if (fs.existsSync(DB_FILE) || fs.existsSync(LEGACY_FILE)) {
    try { openDb(); }
    catch (e) { console.error(`SQUAD/CODE: não foi possível abrir o banco em ${DATA_DIR}.\n${e.message}`); try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {} process.exit(1); }
  }
  const url = `http://${HOST}:${PORT}`;
  console.log(`SQUAD/CODE bridge ativo em ${url}`);
  console.log(`Pasta dos projetos: ${PROJECTS_DIR}`);
  if (store) console.log(`Banco de dados: ${store.file}`);
  else console.log(`Banco de dados: nenhum em ${DATA_DIR}. Abra ${url} para criar um.`);
  const plugins = loadPlugins();
  const pluginList = plugins.page.plugins.map(p => `${p.id}${p.version ? ` ${p.version}` : ''} (${p.presets.length} agente(s))`).join(', ');
  console.log(`Plugins: ${pluginList || 'nenhum'}${plugins.page.warnings.length ? ` · ${plugins.page.warnings.length} aviso(s): ${plugins.page.warnings.join(' | ')}` : ''}`);
  if (store?.interrupted) console.log(`${store.interrupted} execução(ões) interrompida(s) na última sessão marcada(s) no histórico.`);
  if (process.env.SQUAD_PRINT_TOKEN) console.log(`TOKEN=${TOKEN}`);
  claudeVersion(DEFAULT_BIN).then(info => {
    if (info.version) console.log(`Claude Code ${info.version} (${info.resolved})`);
    else console.warn(`Claude Code não encontrado (${DEFAULT_BIN}): ${info.error}\n  Instale o Claude Code, rode "claude" uma vez para fazer login e reinicie, ou aponte SQUAD_CLAUDE_BIN para o executável.\n  Sem ele o app abre, mas as execuções ficam só na simulação.`);
  }, () => {});
});

module.exports = { server };
