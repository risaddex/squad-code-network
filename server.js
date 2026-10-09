#!/usr/bin/env node
'use strict';
/*
 * SQUAD/CODE bridge: serves index.html, spawns headless agents through an Adapter (Claude Code `claude -p`, Codex `codex exec`)
 * on a Perfil (profile: executable + account folder) and keeps the app's data in SQLite (db.js).
 * Only dependency: better-sqlite3 (`npm install`). Binds to 127.0.0.1 only and requires a per-start token on every API call.
 *
 *   node server.js [--port 4317]
 *
 * Environment:
 *   SQUAD_PORT        port (default 4317)
 *   SQUAD_CLAUDE_BIN  claude executable to use when the UI does not set one (default: "claude")
 *   SQUAD_CODEX_BIN   codex executable of Codex Perfis without their own (default: "codex")
 *   OTEL_EXPORTER_OTLP_ENDPOINT  OTLP/HTTP endpoint of the bridge's traces when Configurações > Telemetria has none
 *   SQUAD_HOME        overrides the home dir used for ~/.claude/settings.json (tests)
 *   SQUAD_PROJECTS_DIR root of the per-project folders (default: ./projects next to this file)
 *   SQUAD_DATA_DIR    folder of the SQLite database, squad.db (default: ./data next to this file)
 *   SQUAD_CONFIG      local configuration file used instead of ./squad.local.json (plugins.js, docs/plans/plugins-conteudo.md)
 *   SQUAD_CONFIG_SHARED  shared configuration file used instead of ./squad.config.json
 *   SQUAD_PLUGINS       extra plugin folders, separated by the platform's path delimiter
 *   SQUAD_PLUGIN_REGISTER_TIMEOUT_MS  time limit of a plugin's register(ctx) (default 10000; tests)
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
const DEFAULT_CODEX_BIN = process.env.SQUAD_CODEX_BIN || 'codex';
const IS_WIN = process.platform === 'win32';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-code-'));
// Every project runs in its own folder under PROJECTS_DIR (created on the first run).
const PROJECTS_DIR = path.resolve(process.env.SQUAD_PROJECTS_DIR || path.join(ROOT, 'projects'));
const FOLDER_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const RESERVED_RE = require('./plugins.js').CONSTANTS.WINDOWS_RESERVED_RE;
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
// Plugins (plugins.js): reread on every serveIndex when a file they came from changed. The code of the plugins (plugin-host.js) is
// loaded once, at the start; their content follows the files.
const pluginLoader = require('./plugins.js').createPluginLoader({ root: ROOT, home: HOME });
function loadPlugins() {
  try { return pluginLoader.load(); }
  catch (e) { const warnings = [`Plugins não carregados: ${e.message}`]; return { page: { plugins: [], runtime: {}, warnings }, api: { plugins: [], runtime: {}, warnings, config: { files: [], paths: [], disabled: [], enabled: [], profiles: [], defaultProfile: '', defaultProfileFile: '', profilesError: true } }, count: 0, discovery: { plugins: [], config: { enabled: [], entries: {}, hookTimeoutMs: 3000 }, warnings }, cfgRuntime: {} }; }
}
/** The loader's result with the content of a plugin with code only while its code is active (register() worked at the start). */
const activeContent = loaded => require('./plugins.js').selectContent(loaded, id => pluginHost.statusOf(id) === 'active');
let store = null;
/* After the database opens: "Codex (padrão)" when codex is on the PATH (once per database). When it is created on a machine without
   claude and the default is still the untouched "Claude (padrão)", it becomes the default, so agents without a Perfil do not all
   fall on an engine that does not exist (a defaultProfile of the configuration, applied right after, still wins). */
const untouchedClaudeDefault = p => !!p && p.id === dbModule.DEFAULT_PROFILE_IDS.claude && p.isDefault && !p.source && !p.bin && !p.configDir && !p.model && !p.effort;
async function afterOpen() {
  // Runs wait on cfgProfiles.run (configProfilesReady): first "Codex (padrão)", then the configured Perfis, so a defaultProfile
  // "codex-default" already exists when the configuration is applied.
  const codex = (async () => {
    try {
      if (!store || !await resolveBin(DEFAULT_CODEX_BIN)) return;
      const made = store.ensureCodexDefault(); if (!made) return;
      console.log(`Perfil criado: ${made.name}`);
      if (untouchedClaudeDefault(store.defaultProfile()) && !await resolveBin(DEFAULT_BIN)) { store.setDefaultProfile(made.id); console.log(`Claude não encontrado: ${made.name} é o Perfil padrão.`); }
    } catch (e) { console.warn(`Perfil do Codex não criado: ${e.message}`); }
  })();
  if (pluginHost.pending) await pluginHost.ready; // register(ctx) of the plugins first (they may add Adapters the configured Perfis name)
  await syncConfigProfiles(codex);
}
function openDb() {
  store = dbModule.openStore(DATA_DIR);
  cfgProfiles.sig = null;
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
// Effort lists shared with plugins.js and schemas/squad.schema.json (one source, checked by the tests).
const { EFFORTS, CODEX_EFFORTS } = require('./plugins.js').CONSTANTS;
const TOOL_RE = /^[A-Za-z][A-Za-z0-9_]*(\([^()\r\n"]{0,200}\))?$|^mcp__[A-Za-z0-9_-]+(__[A-Za-z0-9_*-]+)?$/;
const MODEL_RE = /^[A-Za-z0-9._\-\[\]]{1,80}$/;
const MAX_EVENTS = 5000;
const MAX_BODY = 2 * 1024 * 1024;

const runs = new Map();
let maxConcurrent = 2;
// Version probes (binVersion): `<bin> --version` once per resolved executable while it answers; a probe in flight is shared and a
// failure is kept for PROBE_RETRY_MS, as is the PATH lookup per name, so the first GET of many Perfis on one executable is one probe.
const versionCache = new Map(), probeNames = new Map();
const PROBE_RETRY_MS = 30000;
const probeFresh = hit => hit && (hit.pending || hit.ok || Date.now() - hit.at < PROBE_RETRY_MS);

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

// Plugins with code (plugin-host.js, docs/plans/plugins.md): found now (read-only), imported only once the port is ours (listen
// callback below). With none, `pending` stays false and nothing here costs a thing.
const pluginHost = require('./plugin-host.js').createPluginHost({ getDiscovery: () => loadPlugins().discovery, dataRoot: DATA_DIR, http: { readBody, json, fail }, maxBody: MAX_BODY });

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

const cut4k = v => typeof v === 'string' && v.length > 4000 ? v.slice(0, 4000) + '…' : v;

/** Expand Windows 8.3 short names (C:\USER~1) that Claude Code's path safety checks reject. */
const longPath = p => { try { return fs.realpathSync.native(p); } catch { return p; } };

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

function binVersion(bin) {
  const name = probeNames.get(bin);
  const resolving = probeFresh(name) ? name.promise : remember(probeNames, bin, resolveBin(bin), () => false);
  return resolving.then(resolved => {
    if (!resolved) return { resolved: null, version: null, error: `Executável "${bin}" não encontrado no PATH.` };
    const hit = versionCache.get(resolved);
    return probeFresh(hit) ? hit.promise : remember(versionCache, resolved, probeVersion(resolved), info => !!info.version);
  });
}
/** Keeps `promise` under `key` while pending; once settled, `ok(value)` decides whether it stays for good or for PROBE_RETRY_MS. */
function remember(map, key, promise, ok) {
  const hit = { pending: true, ok: false, at: 0, promise };
  map.set(key, hit);
  promise.then(v => { hit.pending = false; hit.ok = ok(v); hit.at = Date.now(); });
  return promise;
}
function probeVersion(resolved) {
  return new Promise(resolve => {
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
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  if (IS_WIN) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
}

/* ---------- Adapters (adapters/): everything that depends on the engine behind a Perfil is asked of the registry ---------- */
// `host` is what the Adapters may use of the bridge. startRun and recordWindows are function declarations (hoisted).
const registry = require('./adapters').createRegistry({ ROOT, HOME, HOST, PORT, TMP_DIR, DEFAULT_BIN, DEFAULT_CODEX_BIN, MODEL_RE, cut4k, resolveBin, startRun, saveWindows: recordWindows, warn: console.warn, fsp, longPath, EFFORTS, CODEX_EFFORTS });
/** Every level some Adapter takes (a run option is checked against the Adapter of the Perfil it lands on, later). */
const allEfforts = () => [...new Set(registry.kinds().flatMap(k => registry.get(k).efforts))];
const missingAdapter = p => `O Adapter "${p.adapter}" do Perfil "${p.name}" não está disponível neste bridge (plugin desligado ou não instalado).`;
/** Usage windows seen for a Perfil (`source`: event, session or refresh); the only way they reach the table. */
let windowsWarned = 0;
function recordWindows(profileId, windows, source) {
  if (!store || !windows) return false;
  try { store.saveWindows(profileId, windows); return true; }
  catch (e) { if (windowsWarned++ < 3) console.warn(`Janelas de uso do Perfil ${profileId} (${source}) não gravadas: ${e.message}`); return false; }
}

/* ---------- Perfis (profiles) ---------- */
// Before the database exists every run uses this one, the same as the "Claude (padrão)" the migration creates.
const MEM_DEFAULT = { id: dbModule.DEFAULT_PROFILE_IDS.claude, name: 'Claude (padrão)', adapter: 'claude', bin: '', configDir: '', model: '', effort: '', concurrency: 2, fallbackId: '', threshold: 90, ignoreUserConfig: true, telemetry: { ...dbModule.TELEMETRY_OFF }, isDefault: true, source: '', sourceFile: '' };
const expandHome = p => p === '~' ? os.homedir() : /^~[\\/]/.test(p) ? path.join(os.homedir(), p.slice(2)) : p;
const listProfiles = () => store ? store.listProfiles() : [MEM_DEFAULT];
const getProfile = id => store ? (id ? store.getProfile(id) : null) : (id === MEM_DEFAULT.id ? MEM_DEFAULT : null);
const defaultProfile = () => (store && store.defaultProfile()) || MEM_DEFAULT;
// An Adapter missing from the registry has no default executable: '' (profileStatus/startRun report the missing Adapter before it is used).
const profileBin = (p, claudePath) => p.bin || registry.get(p.adapter)?.defaultBin({ claudePath, claudePathSet: !!claudePath }) || '';
const windowsOf = id => store ? store.windowsOf(id) : {};
/** A window at or above the Perfil's threshold whose reset is still ahead. */
function overLimit(p) {
  const now = Date.now();
  return Object.values(windowsOf(p.id)).some(w => Number.isFinite(w.utilization) && w.utilization * 100 >= p.threshold && (!w.resetsAt || Date.parse(w.resetsAt) > now));
}
/** Perfil of a run: the one asked (unknown/empty: the default), or its reserve when it is over the threshold and the reserve is not. */
function pickProfile(id) {
  const asked = getProfile(id) || defaultProfile();
  if (asked.fallbackId && overLimit(asked)) {
    const reserve = getProfile(asked.fallbackId);
    if (reserve && reserve.adapter === asked.adapter && reserve.id !== asked.id && !overLimit(reserve)) return { profile: reserve, fallbackFrom: asked.id };
  }
  return { profile: asked, fallbackFrom: null };
}
/* Admission: Chamados (runs with a parent) never take a slot; runs still between the check and their spawn hold one (admitting),
   reserved synchronously, so parallel requests cannot all pass a cap of 1. */
const admitting = { total: 0, byProfile: new Map() };
const admitBump = (pid, n) => { admitting.total += n; admitting.byProfile.set(pid, (admitting.byProfile.get(pid) || 0) + n); };
function activeOf(profileId) { return [...runs.values()].filter(r => r.status === 'running' && !r.parentRunId && r.profileId === profileId).length + (admitting.byProfile.get(profileId) || 0); }
function callsOf(profileId) { return [...runs.values()].filter(r => r.status === 'running' && r.parentRunId && r.profileId === profileId).length; }

async function profileStatus(p) {
  const impl = registry.get(p.adapter);
  if (!impl) return { resolved: null, version: null, configDirOk: true, error: missingAdapter(p) };
  if (impl.status) return impl.status(p);
  const info = await binVersion(profileBin(p));
  let configDirOk = true, error = info.error;
  if (p.configDir) {
    try { configDirOk = fs.statSync(p.configDir).isDirectory(); } catch { configDirOk = false; }
    if (!configDirOk) error = [error, `Diretório de configuração inexistente: ${p.configDir}`].filter(Boolean).join(' ');
  }
  return { resolved: info.resolved, version: info.version, configDirOk, error: error || null };
}
async function profileView(p) {
  const view = { ...p, status: await profileStatus(p), windows: windowsOf(p.id), active: activeOf(p.id), activeCalls: callsOf(p.id) };
  if (p.source === 'config') {
    // configFiles: every file that declares it (lowest precedence first; the last one is where edits go); configError: left as it was.
    const entry = cfgProfiles.cfg?.profiles.find(e => `cfg-${e.key}` === p.id);
    view.configFiles = (entry?.files || [p.sourceFile]).map(f => path.basename(f));
    view.configError = cfgProfiles.errors.get(p.id) || [];
  }
  const impl = registry.get(p.adapter);
  if (impl?.profileExtras) Object.assign(view, impl.profileExtras(p));
  return view;
}

function adaptersCatalog() { return Object.fromEntries(registry.kinds().map(k => [k, registry.get(k).catalog()])); }

const PROFILE_FIELDS = require('./plugins.js').CONSTANTS.PROFILE_FIELDS;
/** Checks a Perfil sent by the page (a PUT may send only some fields: the rest comes from `current`). */
async function validateProfile(body, current = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Perfil inválido.');
  const src = { ...(current || { bin: '', configDir: '', model: '', effort: '', concurrency: 2, fallbackId: '', threshold: 90, ignoreUserConfig: true, telemetry: dbModule.TELEMETRY_OFF }) };
  for (const k of PROFILE_FIELDS) if (body[k] !== undefined) src[k] = body[k];
  const p = { id: current?.id };
  p.name = typeof src.name === 'string' ? src.name.trim() : '';
  if (!p.name || p.name.length > 40) throw new Error('Nome do Perfil: de 1 a 40 caracteres.');
  const kinds = registry.kinds();
  if (!registry.has(src.adapter)) throw new Error(`Adapter inválido. Use ${kinds.length > 1 ? `${kinds.slice(0, -1).join(', ')} ou ${kinds.at(-1)}` : kinds[0]}.`);
  // Same rule as a Perfil of the configuration (editConfigProfile): the reserves pointing at it are checked against its Adapter.
  if (current && src.adapter !== current.adapter) throw new Error('O Adapter de um Perfil não muda depois de criado.');
  const impl = registry.get(src.adapter);
  p.adapter = src.adapter;
  p.configDir = typeof src.configDir === 'string' ? src.configDir.trim() : '';
  if (p.configDir) {
    p.configDir = expandHome(p.configDir);
    if (!path.isAbsolute(p.configDir)) throw new Error('O diretório de configuração precisa ser um caminho absoluto (ou começar com ~).');
    let dir = false; try { dir = fs.statSync(p.configDir).isDirectory(); } catch {}
    if (!dir) throw new Error(`Diretório de configuração inexistente: ${p.configDir}`);
    p.configDir = longPath(path.resolve(p.configDir));
  }
  p.bin = typeof src.bin === 'string' ? expandHome(src.bin.trim()) : '';
  if (p.bin && !(await resolveBin(p.bin))) throw new Error(`Executável "${p.bin}" não encontrado.`);
  p.model = typeof src.model === 'string' ? src.model.trim() : '';
  if (p.model && !MODEL_RE.test(p.model)) throw new Error('Modelo inválido.');
  p.effort = typeof src.effort === 'string' ? src.effort.trim() : '';
  if (p.effort && !impl.efforts.includes(p.effort)) throw new Error('Nível de esforço inválido para esse Adapter.');
  p.concurrency = Number(src.concurrency);
  if (!Number.isInteger(p.concurrency) || p.concurrency < 1 || p.concurrency > 10) throw new Error('Teto de execuções do Perfil: de 1 a 10.');
  p.threshold = Number(src.threshold);
  if (!Number.isInteger(p.threshold) || p.threshold < 50 || p.threshold > 100) throw new Error('Limiar da Janela de uso: de 50 a 100.');
  p.fallbackId = typeof src.fallbackId === 'string' ? src.fallbackId.trim() : '';
  if (p.fallbackId) p.fallbackId = checkReserve(p, p.fallbackId);
  p.ignoreUserConfig = src.ignoreUserConfig !== false;
  const t = src.telemetry && typeof src.telemetry === 'object' ? src.telemetry : {};
  p.telemetry = { enabled: t.enabled === true, native: t.native === true, content: t.content === true };
  impl.validateProfile?.(src, p);
  return p;
}

/** The reserve of `p`: an id or the key of a configured Perfil (`cfg-<key>`). Returns the id; throws when it cannot be the reserve. */
function checkReserve(p, ref) {
  let reserve = store?.getProfile(ref);
  if (!reserve) { const cfg = store?.getProfile(`cfg-${ref}`); if (cfg?.source === 'config') reserve = cfg; }
  if (!reserve) throw new Error('Perfil reserva não encontrado.');
  if (reserve.id === p.id) throw new Error('Um Perfil não pode ser a própria reserva.');
  if (reserve.adapter !== p.adapter) throw new Error('O Perfil reserva precisa ser do mesmo Adapter.');
  return reserve.id;
}

/* ---------- Perfis declared in the configuration (docs/plans/plugins-conteudo.md: `profiles`, `defaultProfile`) ----------
   plugins.js reads and merges them by key; here they are validated like POST /api/profiles and upserted as `cfg-<key>` (source
   'config'). It runs when the database opens and whenever the configuration's signature changes (the loader keeps its mtime cache,
   checked only where the page reads the Perfis: page load, /api/plugins, GET /api/profiles). Removed from the file: removed from the
   table. A file that could not be read or a malformed list: nothing changes. defaultFile: the configuration chose the default. */
// sig: signature of the last configuration applied without errors; pending: the one being applied (run = its promise, which runs
// await before they take a slot). A failed sync leaves sig as it was, so the next read tries again.
// cfg: the configuration as last read (hashes: sha1 of each file then; a write refuses a file changed since); errors: id → messages
// of a configured Perfil left as it was (invalid item in the file, or validation).
const cfgProfiles = { sig: null, pending: null, warnings: [], defaultFile: '', run: Promise.resolve(), cfg: null, errors: new Map() };
// `before`: a promise the sync waits for, chained synchronously so runs already wait on it (afterOpen: "Codex (padrão)").
function syncConfigProfiles(before = null) {
  if (before) cfgProfiles.run = cfgProfiles.run.then(() => before);
  if (!store) return cfgProfiles.run;
  const cfg = loadPlugins().api.config;
  cfgProfiles.cfg = cfg;
  const sig = JSON.stringify([cfg.profilesError, cfg.profiles, cfg.defaultProfile, cfg.defaultProfileFile]);
  if (sig === cfgProfiles.sig || sig === cfgProfiles.pending) return cfgProfiles.run;
  cfgProfiles.pending = sig;
  cfgProfiles.run = cfgProfiles.run.then(() => applyConfigProfiles(cfg)).then(ok => { if (ok) cfgProfiles.sig = sig; }, e => { cfgProfiles.warnings = [`Perfis da configuração não sincronizados: ${e.message}`]; console.warn(cfgProfiles.warnings[0]); })
    .finally(() => { if (cfgProfiles.pending === sig) cfgProfiles.pending = null; });
  return cfgProfiles.run;
}
/** Waits until no sync of the configured Perfis is running (one may chain another while it waits). */
async function configProfilesReady() {
  for (let r = cfgProfiles.run; ; r = cfgProfiles.run) { await r; if (r === cfgProfiles.run) return; }
}
async function applyConfigProfiles(cfg) {
  const warnings = [], file = f => path.basename(f || '') || 'configuração';
  if (cfg.profilesError) {
    if (cfg.profiles.length || store.listProfiles().some(p => p.source === 'config')) warnings.push('Perfis da configuração não sincronizados: a configuração tem erros (veja os avisos); os Perfis declarados ficam como estavam.');
    cfgProfiles.warnings = warnings;
    return true;
  }
  const declared = new Set(cfg.profiles.map(e => `cfg-${e.key}`)), valid = [], errors = new Map();
  for (const e of cfg.profiles) {
    const { key, source, files, fallbackId, invalid, ...fields } = e, id = `cfg-${key}`;
    // Invalid item in the file (plugins.js already warned, with file, key and field): the row stays as it was, or is not created.
    if (invalid) { errors.set(id, invalid); continue; }
    try {
      if (fallbackId !== undefined && typeof fallbackId !== 'string') throw new Error('"fallbackId" deve ser texto (id ou key de um Perfil).');
      const p = await validateProfile({ ...fields, fallbackId: '' });
      valid.push({ ...p, id, key, source, fallbackRef: (fallbackId || '').trim() });
    } catch (err) { const m = `Perfil ${key} (${file(source)}): ${err.message} ${store?.getProfile(id) ? 'Mantido como estava.' : 'Não criado.'}`; warnings.push(m); errors.set(id, [m]); }
  }
  if (!store) return false;
  let defaultFile = '', failed = false;
  store.transaction(() => {
    // Removed first: a key renamed with the same name frees the name before the new row takes it (usage and windows stay by id).
    for (const p of store.listProfiles()) if (p.source === 'config' && !declared.has(p.id)) store.removeConfigProfile(p.id);
    const ok = [];
    for (const p of valid) {
      try { store.upsertConfigProfile(p, p.source); ok.push(p); }
      catch (err) { failed = true; const m = `Perfil ${p.key} (${file(p.source)}): ${err.message}`; warnings.push(m); errors.set(p.id, [m]); }
    }
    for (const p of ok) if (p.fallbackRef) {
      try { store.setProfileFallback(p.id, checkReserve(p, p.fallbackRef)); }
      catch (err) { warnings.push(`Perfil ${p.key} (${file(p.source)}): ${err.message} Ficou sem reserva.`); }
    }
    if (cfg.defaultProfile) {
      const ref = cfg.defaultProfile, target = (declared.has(`cfg-${ref}`) && store.getProfile(`cfg-${ref}`)) || store.getProfile(ref);
      if (!target) warnings.push(`"defaultProfile": "${ref}" (${file(cfg.defaultProfileFile)}) não é um Perfil conhecido; o Perfil padrão atual foi mantido.`);
      else { if (!target.isDefault) store.setDefaultProfile(target.id); defaultFile = cfg.defaultProfileFile; }
    }
  });
  cfgProfiles.defaultFile = defaultFile;
  cfgProfiles.warnings = warnings;
  cfgProfiles.errors = errors;
  if (warnings.length) console.warn(`Perfis da configuração: ${warnings.join(' | ')}`);
  return !failed;
}
/* ---------- writing a configured Perfil back to its file ----------
   PUT, DELETE and "Tornar padrão" of a configured Perfil change the file it came from (the one of highest precedence that declares
   its key; defaultProfile: the file that declares it, or the local one), never the table: the sync that follows brings it in.
   configOp: one operation at a time, whole (read, validation, "is it the default?", write and the sync after it), so two requests
   on the same Perfil cannot interleave. writeConfigFile: the text is read and checked against the hash the bridge last read
   (`expected`); after the async validation it is read again and checked once more right before the write, which is synchronous from
   there to the rename (no await between the last check and the rename). A symlinked file is written at its real path, in the real
   folder. Temp files have random names, are created exclusively ('wx') with the original file's mode (0600 for a new file), and the
   .bak is written the same way (temp + rename: an existing .bak link is replaced, never followed) with the text that was checked. */
const { validate: schemaValidate, formatError } = require('./schema.js');
const CONFIG_SCHEMA = require('./plugins.js').SCHEMAS.config;
const sha1 = text => crypto.createHash('sha1').update(text).digest('hex');
const conflict = msg => Object.assign(new Error(msg), { status: 409 });
const badRequest = msg => Object.assign(new Error(msg), { status: 400 });
const isPlain = v => !!v && typeof v === 'object' && !Array.isArray(v);
// Tests only: a pause between the first read and the write, to change the file in between.
const WRITE_PAUSE_MS = Number(process.env.SQUAD_TEST_CONFIG_WRITE_PAUSE_MS) || 0;
let cfgQueue = Promise.resolve();
function configOp(fn) {
  const job = cfgQueue.then(fn);
  cfgQueue = job.catch(() => {});
  return job;
}
/** The path really written: a symlinked configuration file is written at its target. */
function realConfigPath(file) {
  try { if (fs.lstatSync(file).isSymbolicLink()) return fs.realpathSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  return file;
}
const readText = file => { try { return fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
/** Writes `text` to `dest` through an exclusive temp file in the same folder (mode `mode`), then renames it over `dest`. */
// owner: {uid, gid} of the original file, kept when the system lets us (the group usually; EPERM and the like are ignored).
function writeExclusive(dest, text, mode, owner = null) {
  const tmp = path.join(path.dirname(dest), `.${path.basename(dest)}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  const fd = fs.openSync(tmp, 'wx', mode);
  try {
    fs.writeFileSync(fd, text, 'utf8'); fs.fchmodSync(fd, mode);
    if (owner) { try { fs.fchownSync(fd, owner.uid, owner.gid); } catch (e) { if (!['EPERM', 'EINVAL', 'ENOSYS', 'ENOTSUP'].includes(e.code)) throw e; } }
    fs.fsyncSync(fd);
  } catch (e) { fs.closeSync(fd); fs.rmSync(tmp, { force: true }); throw e; }
  fs.closeSync(fd);
  try { fs.renameSync(tmp, dest); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
}
/** Reads, mutates (`mutate(data, name)` may be async and throw) and writes one configuration file. Runs inside configOp. */
async function writeConfigFile(file, mutate) {
  const name = path.basename(file), real = realConfigPath(file);
  const expected = cfgProfiles.cfg?.hashes?.[file] ?? null;
  const changed = () => conflict(`${name} mudou desde a última leitura do bridge. Recarregue a página e tente de novo.`);
  const text = readText(real);
  if ((text === null ? null : sha1(text)) !== expected) throw changed();
  let data = {};
  if (text !== null) {
    try { data = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { throw conflict(`${name} tem JSON inválido (${e.message}): corrija o arquivo antes.`); }
    if (!isPlain(data)) throw conflict(`${name} deve ser um objeto JSON: corrija o arquivo antes.`);
  }
  await mutate(data, name);
  if (WRITE_PAUSE_MS) await new Promise(r => setTimeout(r, WRITE_PAUSE_MS));
  const out = JSON.stringify(data, null, 2) + '\n';
  await fsp.mkdir(path.dirname(real), { recursive: true });
  // From here on, synchronous: the last check and the rename with nothing in between.
  const now = readText(real);
  if ((now === null ? null : sha1(now)) !== expected) throw changed();
  let mode = 0o600, backup = null, owner = null;
  if (now !== null) {
    const st = fs.statSync(real);
    mode = st.mode & 0o777; owner = { uid: st.uid, gid: st.gid };
    backup = real + '.bak';
    writeExclusive(backup, now, mode, owner);
  }
  writeExclusive(real, out, mode, owner);
  if (cfgProfiles.cfg) cfgProfiles.cfg.hashes[file] = sha1(out);
  pluginLoader.invalidate();
  console.log(`Configuração gravada: ${real}${backup ? ` (cópia em ${path.basename(backup)})` : ''}`);
  return { file: real, backup };
}
/** A configuration with a file-level error does not sync, so nothing written now would reach the table: refused before writing. */
function configWritable() {
  const cfg = cfgProfiles.cfg;
  if (cfg?.profilesError) {
    const files = (cfg.errorFiles || []).map(f => path.basename(f)).join(', ') || 'a configuração';
    throw conflict(`${files} tem erro (veja os avisos): os Perfis da configuração não sincronizam até ele ser corrigido. Corrija o arquivo e recarregue a página.`);
  }
}
/** The configuration entry of a `cfg-<key>` Perfil, or a 409 that says why it cannot be written. */
function configEntry(current) {
  configWritable();
  const key = current.id.slice(4), entry = cfgProfiles.cfg?.profiles.find(e => e.key === key);
  if (!entry) throw conflict(`O Perfil "${current.name}" não está mais na configuração. Recarregue a página.`);
  if (entry.invalid) throw conflict(`O item do Perfil "${current.name}" em ${path.basename(entry.source)} tem formato inválido: corrija o arquivo e recarregue a página.`);
  return entry;
}
/** The Perfil as it is now (inside configOp, after the operations before it). */
function currentProfile(pid) {
  const p = getProfile(pid);
  if (!p) throw Object.assign(new Error('Perfil não encontrado.'), { status: 404 });
  return p;
}
function profileItemOf(data, key, name) {
  const item = Array.isArray(data.profiles) ? data.profiles.find(x => isPlain(x) && x.key === key) : null;
  if (!item) throw conflict(`O Perfil ${key} não está mais em ${name}. Recarregue a página.`);
  return item;
}
// Paths of a Perfil in a file: `~` and relative ones against the file's folder (plugins.js does the same when reading).
const looksLikePath = v => /[\\/]|^~|^\./.test(v);
function expandFrom(dir, p) {
  if (p === '~') return HOME;
  if (/^~[\\/]/.test(p)) return path.join(HOME, p.slice(2));
  return path.resolve(dir, p);
}
const BODY_TYPES = { name: 'string', adapter: 'string', bin: 'string', configDir: 'string', model: 'string', effort: 'string', fallbackId: 'string', concurrency: 'integer', threshold: 'integer', ignoreUserConfig: 'boolean', telemetry: 'object' };
/** Types first (null, numbers as text...): nothing is coerced into the file. */
function checkBodyTypes(body) {
  if (!isPlain(body)) throw badRequest('Perfil inválido.');
  for (const [k, t] of Object.entries(BODY_TYPES)) {
    if (body[k] === undefined) continue;
    const v = body[k];
    const ok = t === 'integer' ? Number.isInteger(v) : t === 'object' ? isPlain(v) && Object.entries(v).every(([tk, tv]) => ['enabled', 'native', 'content'].includes(tk) && typeof tv === 'boolean') : typeof v === t;
    if (!ok) throw badRequest(`Campo ${k}: ${t === 'integer' ? 'deve ser um número inteiro' : t === 'object' ? 'deve ser um objeto {enabled, native, content} com true ou false' : t === 'boolean' ? 'deve ser true ou false' : 'deve ser texto'}.`);
  }
}
/* Edit: the changes are what the person changed against the effective Perfil (paths compared after resolving them against the
   target file's folder; telemetry switch by switch); they are merged into that file's item as written (telemetry: only the changed
   switches, into the item's own object). The item that will be persisted goes through the schema, and the Perfil that will result
   (the entry merged with the changes) through validateProfile and the reserve rules, before writing. */
async function editConfigProfile(pid, body) {
  checkBodyTypes(body);
  const current = currentProfile(pid);
  const entry = configEntry(current), key = entry.key, target = entry.files.at(-1), dir = path.dirname(target);
  if (body.adapter !== undefined && body.adapter !== current.adapter) throw badRequest('O Adapter de um Perfil não muda depois de criado.');
  const write = {}, effective = {};
  for (const k of PROFILE_FIELDS) {
    if (body[k] === undefined || k === 'adapter') continue;
    const v = typeof body[k] === 'string' ? body[k].trim() : body[k];
    if (k === 'bin' || k === 'configDir') {
      const resolved = v && (k === 'configDir' || looksLikePath(v)) ? expandFrom(dir, v) : v;
      const same = k === 'configDir' ? (resolved ? longPath(resolved) : '') === current.configDir : resolved === current.bin;
      if (!same) { write[k] = v; effective[k] = resolved; }
    } else if (k === 'telemetry') {
      const delta = Object.fromEntries(Object.entries(v).filter(([t, on]) => on !== !!current.telemetry?.[t]));
      if (Object.keys(delta).length) { write.telemetry = delta; effective.telemetry = { ...current.telemetry, ...delta }; }
    } else if (k === 'fallbackId') {
      const id = v ? checkReserve(current, v) : '';
      if (id !== (current.fallbackId || '')) { write.fallbackId = id && getProfile(id)?.source === 'config' ? id.slice(4) : id; effective.fallbackId = id; }
    } else if (v !== current[k]) { write[k] = v; effective[k] = v; }
  }
  const changed = Object.keys(write);
  if (!changed.length) return { ok: true, profile: await profileView(current), file: path.basename(target), changed };
  const { key: _k, source: _s, files: _f, invalid: _i, ...fields } = entry;
  const merged = { ...fields, ...effective, fallbackId: '' };
  const p = await validateProfile(merged);
  if (effective.fallbackId) checkReserve({ ...p, id: current.id }, effective.fallbackId);
  if (listProfiles().some(x => x.id !== current.id && x.name === p.name)) throw conflict('Já existe um Perfil com esse nome.');
  await writeConfigFile(target, (data, name) => {
    const item = profileItemOf(data, key, name);
    const next = { ...item, ...write, ...(write.telemetry ? { telemetry: { ...(isPlain(item.telemetry) ? item.telemetry : {}), ...write.telemetry } } : {}) };
    const bad = schemaValidate(CONFIG_SCHEMA.$defs.profile, next, CONFIG_SCHEMA).find(e => e.keyword !== 'additionalProperties');
    if (bad) throw badRequest(`Valor inválido para ${name}: ${formatError(bad)}`);
    Object.assign(item, next);
  });
  await syncConfigProfiles();
  const refused = cfgProfiles.errors.get(current.id);
  if (refused?.length) throw badRequest(`Gravado em ${path.basename(target)}, mas a sincronização recusou o Perfil: ${refused.join(' ')}`);
  // The table must now hold what was written (the effective values): otherwise say so instead of answering ok.
  const saved = getProfile(current.id);
  const expect = { ...effective, ...(effective.configDir !== undefined ? { configDir: effective.configDir ? longPath(effective.configDir) : '' } : {}) };
  const off = saved ? Object.keys(expect).filter(k => JSON.stringify(k === 'telemetry' ? { ...saved.telemetry } : saved[k]) !== JSON.stringify(k === 'telemetry' ? { ...saved.telemetry, ...expect.telemetry } : expect[k])) : ['perfil'];
  if (off.length) throw Object.assign(new Error(`Gravado em ${path.basename(target)}, mas o Perfil no banco não ficou com ${off.join(', ')}. Recarregue a página e confira o arquivo.`), { status: 500 });
  return { ok: true, profile: await profileView(saved), file: path.basename(target), changed };
}
async function deleteConfigProfile(pid) {
  const current = currentProfile(pid);
  const entry = configEntry(current), key = entry.key, target = entry.files.at(-1), cfg = cfgProfiles.cfg;
  if (entry.files.length > 1) {
    const others = entry.files.slice(0, -1).map(f => path.basename(f)).join(', ');
    throw conflict(`O Perfil "${current.name}" também está declarado em ${others}: removê-lo de ${path.basename(target)} não o tira da configuração, ele continuaria vindo de lá. Remova o item de ${others} primeiro.`);
  }
  if (current.isDefault || cfg.defaultProfile === key || cfg.defaultProfile === current.id) throw conflict('O Perfil padrão não pode ser excluído. Torne outro Perfil padrão antes.');
  await writeConfigFile(target, (data, name) => { profileItemOf(data, key, name); data.profiles = data.profiles.filter(x => !(isPlain(x) && x.key === key)); });
  await syncConfigProfiles();
  if (getProfile(current.id)) throw Object.assign(new Error(`Removido de ${path.basename(target)}, mas o Perfil continua no banco (a sincronização não o tirou). Recarregue a página e confira a configuração.`), { status: 500 });
  return { ok: true, file: path.basename(target) };
}
/** "Tornar padrão" through the configuration: defaultProfile in the file that declares it, or in the local file. */
async function defaultInConfig(pid) {
  configWritable();
  const current = currentProfile(pid), cfg = cfgProfiles.cfg, target = cfg.defaultProfileFile || cfg.localFile;
  const value = current.source === 'config' ? configEntry(current).key : current.id;
  await writeConfigFile(target, data => { data.defaultProfile = value; });
  await syncConfigProfiles();
  if (!getProfile(current.id)?.isDefault) throw Object.assign(new Error(`Gravado em ${path.basename(target)}, mas a sincronização não tornou ${current.name} o Perfil padrão.`), { status: 500 });
  return { ok: true, profile: await profileView(getProfile(current.id)), file: path.basename(target) };
}

/** Plugins + configuration as the page/API get them, with the warnings of the configured Perfis appended. */
async function pluginsWithProfiles() {
  await syncConfigProfiles();
  const plugins = activeContent(loadPlugins());
  if (!cfgProfiles.warnings.length) return plugins;
  return { ...plugins, page: { ...plugins.page, warnings: [...plugins.page.warnings, ...cfgProfiles.warnings] }, api: { ...plugins.api, warnings: [...plugins.api.warnings, ...cfgProfiles.warnings] } };
}

const NO_CONTENT = { categories: [], presets: [], avatars: [], themes: [], conventions: null, runtime: {} };
/**
 * GET /api/plugins: every plugin found (content, code or both), each with the summary of its content in the page (empty when it is not
 * there) and what the host says of its code; the runtime and the configuration as plugins.js read them; restartRequired when the code
 * that runs no longer matches the files.
 */
function pluginsBody(loaded) {
  const view = pluginHost.view(loaded.discovery);
  const content = new Map(loaded.api.plugins.map(p => [p.id, p]));
  const plugins = view.plugins.map(v => {
    const found = (v.status === 'active' || v.status === 'data') && content.get(v.id);
    const c = found && found.path === v.path ? found : NO_CONTENT;
    return {
      id: v.id, name: v.name, version: v.version, description: v.description, path: v.path,
      categories: c.categories, presets: c.presets, avatars: c.avatars, themes: c.themes, conventions: c.conventions, runtime: c.runtime,
      hasCode: v.hasCode, status: v.status, error: v.error, source: v.source, requires: v.requires, env: v.env, capabilities: v.capabilities,
      routes: v.routes, events: v.events, adapters: v.adapters, ...(v.observers ? { observers: v.observers } : {}), warnings: v.warnings,
    };
  });
  return { ok: true, plugins, runtime: loaded.api.runtime, warnings: [...new Set([...loaded.api.warnings, ...view.warnings])], config: loaded.api.config, restartRequired: view.restartRequired };
}
const pluginsOn = body => body.plugins.filter(p => p.status === 'active' || p.status === 'data').length;
/** One plugin in the start log: "acme 1.2.0 (2 agente(s))", "hello 1.0.0 (ativo)", "x (desligado: motivo)". */
function pluginLine(p) {
  const parts = [];
  if (p.status !== 'data') parts.push(`${STATUS_PT[p.status] || p.status}${p.error ? `: ${p.error}` : ''}`);
  if (p.status === 'data' || (p.status === 'active' && p.presets.length)) parts.push(`${p.presets.length} agente(s)`);
  return `${p.id}${p.version ? ` ${p.version}` : ''} (${parts.join(', ')})`;
}
const { STATUS_PT } = require('./plugin-host.js');

/* ---------- telemetry (OTLP/HTTP JSON, one trace per run) ---------- */
const INHERITED_TELEMETRY = /^(OTEL_|CLAUDE_CODE_ENABLE_TELEMETRY$|CLAUDE_CODE_OTEL_|BETA_TRACING_ENDPOINT$|ENABLE_BETA_TRACING_DETAILED$)/;
const HEADER_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/;
const ENV_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
/** Where the traces go. Header values are read from the bridge's environment when sent and never stored, logged or returned. */
function telemetryConfig() {
  const s = (store && store.getSetting('telemetry')) || {};
  // An endpoint with user:password in it is ignored (it would reach the API, logs and the codex argv): secrets go in headers.
  const endpoint = [s.endpoint, process.env.OTEL_EXPORTER_OTLP_ENDPOINT].find(e => e && !urlHasCredentials(e)) || '';
  if (!credsWarned && urlHasCredentials(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '')) { credsWarned = true; console.warn('OTEL_EXPORTER_OTLP_ENDPOINT tem usuário ou senha na URL e foi ignorado. Use um header com o nome da variável de ambiente em Configurações > Telemetria.'); }
  return { endpoint, source: s.endpoint ? 'settings' : endpoint ? 'env' : '', serviceName: s.serviceName || 'squad-code', headersEnv: s.headersEnv && typeof s.headersEnv === 'object' ? s.headersEnv : {} };
}
let credsWarned = false;
function urlHasCredentials(text) { try { const u = new URL(text); return !!(u.username || u.password); } catch { return false; } }
function telemetryHeaders(cfg) {
  const out = {};
  for (const [name, env] of Object.entries(cfg.headersEnv)) if (process.env[env]) out[name] = process.env[env];
  return out;
}
function validateTelemetry(body) {
  let endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
  if (endpoint) {
    let u; try { u = new URL(endpoint); } catch { throw new Error('Endpoint OTLP inválido.'); }
    if (!/^https?:$/.test(u.protocol) || /["\\\s]/.test(endpoint) || endpoint.length > 500) throw new Error('Endpoint OTLP inválido: use uma URL http(s).');
    if (u.username || u.password) throw new Error('O endpoint OTLP não pode ter usuário ou senha na URL: use um header com o nome da variável de ambiente.');
  }
  // The value of OTEL_EXPORTER_OTLP_ENDPOINT stays inherited: saving it here would pin it after the environment changes.
  if (endpoint && endpoint === (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '').trim()) endpoint = '';
  const serviceName = typeof body?.serviceName === 'string' ? body.serviceName.trim().slice(0, 80) : '';
  const headersEnv = {};
  const h = body?.headersEnv && typeof body.headersEnv === 'object' && !Array.isArray(body.headersEnv) ? body.headersEnv : {};
  if (Object.keys(h).length > 20) throw new Error('Até 20 headers.');
  for (const [name, env] of Object.entries(h)) {
    if (!HEADER_RE.test(name)) throw new Error(`Header inválido: ${name.slice(0, 60)}`);
    if (typeof env !== 'string' || !ENV_RE.test(env)) throw new Error(`Informe o NOME da variável de ambiente do header ${name}, não o valor.`);
    headersEnv[name] = env;
  }
  return { endpoint, serviceName, headersEnv };
}
const telemetryView = () => { const c = telemetryConfig(); return { ok: true, endpoint: c.endpoint, source: c.source, serviceName: c.serviceName, headers: Object.entries(c.headersEnv).map(([name, env]) => ({ name, env, present: !!process.env[env] })) }; };
const otlpBase = endpoint => endpoint.replace(/\/+$/, '').replace(/\/v1\/(traces|logs|metrics)$/, '');
const sha = (text, hex) => crypto.createHash('sha256').update(text).digest('hex').slice(0, hex);
const traceIdOf = run => sha(run.rootRunId, 32);
const spanIdOf = (runId, toolId) => sha(toolId ? `tool:${runId}:${toolId}` : `run:${runId}`, 16);
const nanos = ms => String(BigInt(Math.round(ms)) * 1000000n);
const attr = (key, v) => ({ key, value: typeof v === 'number' && Number.isInteger(v) ? { intValue: String(v) } : typeof v === 'boolean' ? { boolValue: v } : { stringValue: String(v ?? '') } });
function squadAttrs(run) {
  return { 'squad.project': run.project || '', 'squad.project_id': run.meta.projectId || '', 'squad.agent_id': run.meta.agentId || '', 'squad.feature_id': run.meta.featureId || '', 'squad.kind': run.meta.kind || '', 'squad.profile': run.profileName, 'squad.adapter': run.adapter };
}
/** Fire and forget at the end of a run whose Perfil has telemetry on; a failure never touches the run. */
function sendTrace(run, exit) {
  const cfg = telemetryConfig();
  if (!run.profile.telemetry?.enabled || !cfg.endpoint) return;
  const traceId = traceIdOf(run), end = Date.parse(run.endedAt), start = Date.parse(run.startedAt), u = exit.usage || {};
  const root = {
    traceId, spanId: spanIdOf(run.id), name: 'squad.run', kind: 1, startTimeUnixNano: nanos(start), endTimeUnixNano: nanos(end),
    attributes: Object.entries({ ...squadAttrs(run), 'gen_ai.system': run.impl?.genAiSystem || 'unknown', 'gen_ai.request.model': exit.model || run.model || '', 'gen_ai.usage.input_tokens': u.input ?? 0, 'gen_ai.usage.output_tokens': u.output ?? 0, 'gen_ai.usage.cache_read_input_tokens': u.cacheRead ?? 0, 'squad.status': run.status, ...(run.profile.telemetry.content ? { 'gen_ai.prompt': run.prompt.slice(0, 16000), 'gen_ai.completion': String(exit.result || '').slice(0, 16000) } : {}) }).map(([k, v]) => attr(k, v)),
    status: exit.isError ? { code: 2, message: String(exit.error || '').slice(0, 500) } : { code: 1 },
  };
  // A Chamado (call) hangs from the parent's tool span, in the parent's trace.
  if (run.parent) root.parentSpanId = spanIdOf(run.parent.id, run.toolUseId);
  const spans = [root];
  for (const [id, t] of run.toolSpans) spans.push({ traceId, spanId: spanIdOf(run.id, id), parentSpanId: root.spanId, name: `squad.tool ${t.name}`, kind: 1, startTimeUnixNano: nanos(t.start), endTimeUnixNano: nanos(t.end || end), attributes: [attr('squad.tool', t.name), attr('squad.tool.error', !!t.error)], status: t.error ? { code: 2 } : { code: 1 } });
  const body = { resourceSpans: [{ resource: { attributes: [attr('service.name', cfg.serviceName)] }, scopeSpans: [{ scope: { name: 'squad-code-bridge' }, spans }] }] };
  fetch(otlpBase(cfg.endpoint) + '/v1/traces', { method: 'POST', headers: { 'content-type': 'application/json', ...telemetryHeaders(cfg) }, body: JSON.stringify(body), signal: AbortSignal.timeout(4000) })
    .catch(() => {}); // never logged with its headers
}
/** The CLIs' own telemetry (Perfil telemetry.native): the Adapter decides how it reaches its CLI (env vars, -c flags...). */
function nativeTelemetry(run, impl, profile, env, args, warn) {
  const cfg = telemetryConfig();
  if (!impl.nativeTelemetry || !profile.telemetry?.enabled || !profile.telemetry.native || !cfg.endpoint) return;
  impl.nativeTelemetry(run, profile, { env, args, warn, base: otlpBase(cfg.endpoint), cfg, content: !!profile.telemetry.content, headers: telemetryHeaders(cfg), attrs: squadAttrs(run) });
}

/* ---------- runs ---------- */
function activeCount() { return [...runs.values()].filter(r => r.status === 'running' && !r.parentRunId).length + admitting.total; }

function pushEvent(run, event) {
  run.events.push(event);
  if (run.events.length > MAX_EVENTS) run.events.splice(0, run.events.length - MAX_EVENTS);
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of run.clients) res.write(line);
  persistEvent(run, event);
  observe(run, event);
}

/* What the bridge learns from the stream: tool spans (telemetry), the model, the Adapter's usage windows; a Chamado's text also goes to
   the calling run, under the open tool call (as --forward-subagent-text does for Claude subagents). */
function observe(run, event) {
  const content = Array.isArray(event.message?.content) ? event.message.content : null;
  if (run.toolSpans && content && !event.parent_tool_use_id) {
    if (event.type === 'assistant') for (const b of content) if (b?.type === 'tool_use' && b.id) run.toolSpans.set(b.id, { name: String(b.name || ''), start: Date.now() });
    if (event.type === 'user') for (const b of content) { const t = b?.type === 'tool_result' && run.toolSpans.get(b.tool_use_id); if (t) { t.end = Date.now(); t.error = !!b.is_error; } }
  }
  if (event.type === 'system' && event.subtype === 'init' && typeof event.model === 'string' && event.model) run.seenModel = event.model;
  if (run.impl?.onEvent) {
    // Hot path of every event: an Adapter that throws never breaks the stream (warned once per run).
    try { const seen = run.impl.onEvent(run, event); if (seen?.windows) recordWindows(run.profileId, seen.windows, 'event'); }
    catch (e) { if (!run.onEventWarned) { run.onEventWarned = true; console.warn(`Adapter ${run.adapter}: onEvent falhou (execução ${run.id}): ${e.message}`); } }
  }
  if (run.parent && event.type === 'assistant' && !event.parent_tool_use_id && run.parent.status === 'running') {
    pushEvent(run.parent, { ...event, parent_tool_use_id: run.toolUseId || run.parent.translator?.openCall() || null });
  }
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
  const block = b => b?.type !== 'tool_result' ? b : { ...b, content: Array.isArray(b.content) ? b.content.map(x => x?.type === 'text' ? { ...x, text: cut4k(x.text) } : x) : cut4k(b.content) };
  return { ...event, message: { ...event.message, content: event.message.content.map(block) } };
}

function validateRunOptions(o = {}) {
  const out = {};
  out.claudePath = typeof o.claudePath === 'string' && o.claudePath.trim() ? o.claudePath.trim() : DEFAULT_BIN;
  out.claudePathSet = typeof o.claudePath === 'string' && !!o.claudePath.trim();
  out.profile = typeof o.profile === 'string' ? o.profile.trim().slice(0, 100) : '';
  if (typeof o.project === 'string' && o.project.trim()) {
    const dir = projectDir(o.project);
    fs.mkdirSync(dir, { recursive: true });
    out.cwd = longPath(dir); out.projectRun = true; out.project = o.project.trim();
  } else if (typeof o.cwd === 'string' && o.cwd.trim()) {
    // Explicit folder (tests, direct API use). Never an implicit one: process.cwd() is usually this app's own folder.
    const cwd = path.resolve(o.cwd.trim());
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error(`Diretório de trabalho inexistente: ${cwd}`);
    out.cwd = longPath(cwd);
  } else throw new Error('Execução sem pasta de projeto: informe a pasta da operação (opção "project", em projects/).');
  if (o.model) { if (!MODEL_RE.test(o.model)) throw new Error('Modelo inválido.'); out.model = o.model; }
  if (o.permissionMode) { if (!PERMISSION_MODES.includes(o.permissionMode)) throw new Error('Modo de permissão inválido.'); out.permissionMode = o.permissionMode; }
  if (o.effort) { if (!allEfforts().includes(o.effort)) throw new Error('Nível de esforço inválido.'); out.effort = o.effort; }
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
  // Squad colleagues the agent may call: Claude gets them as an --agents file (Agent tool), Codex through the bridge's MCP.
  const colleagues = validateAgents(o.agents);
  out.agents = colleagues?.agents || null; out.agentMeta = colleagues?.meta || {};
  out.forwardSubagents = o.forwardSubagents === true;
  const timeout = Number(o.timeoutSec); out.timeoutSec = Number.isFinite(timeout) && timeout >= 10 && timeout <= 7200 ? timeout : 900;
  return out;
}

/** CLI-defined subagents: whitelisted fields only, bounded sizes. null = none. `profile`/`agentId` stay out of the --agents file. */
function validateAgents(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Agentes inválidos.');
  const entries = Object.entries(value);
  if (entries.length > 20) throw new Error('Até 20 agentes por execução.');
  const out = Object.create(null), meta = Object.create(null);
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
    if (def.effort) { if (!allEfforts().includes(def.effort)) throw new Error(`Esforço inválido do agente ${key}.`); agent.effort = def.effort; }
    out[key] = agent;
    meta[key] = { profile: typeof def.profile === 'string' ? def.profile.trim().slice(0, 100) : '', agentId: typeof def.agentId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(def.agentId) ? def.agentId : null };
  }
  if (JSON.stringify(out).length > 400000) throw new Error('Definição dos agentes muito grande.');
  return entries.length ? { agents: out, meta } : null;
}

const mcpTokens = new Map(); // sha256(token) → run (Codex runs with squad colleagues)
const bearerHash = t => crypto.createHash('sha256').update(String(t)).digest('hex');

/**
 * Starts a run. `internal.parent`: a Chamado (call) made through the bridge's MCP by that run; it skips the concurrency caps
 * (the caller already holds a slot and waits for it) and joins the caller's trace.
 */
async function startRun(body, internal = {}) {
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  if (!prompt.trim()) throw new Error('Prompt vazio.');
  if (prompt.length > 400000) throw new Error('Prompt muito grande.');
  const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.slice(0, 100000) : '';
  const opts = validateRunOptions(body.options);
  const parent = internal.parent || null;
  // A sync of the configured Perfis still running (database just opened, configuration changed) finishes first; awaited before the
  // slot below is taken, which stays synchronous.
  if (pluginHost.pending) await pluginHost.ready;
  await configProfilesReady();
  // internal.exact: that Perfil and no other (the usage probe of Configurações > Perfis).
  const { profile, fallbackFrom } = internal.exact ? { profile: getProfile(opts.profile) || defaultProfile(), fallbackFrom: null } : pickProfile(opts.profile);
  const impl = registry.get(profile.adapter);
  if (!impl) throw new Error(missingAdapter(profile));
  let release = () => {};
  if (!parent) {
    if (activeCount() >= maxConcurrent) throw Object.assign(new Error(`Limite de ${maxConcurrent} execuções simultâneas atingido.`), { status: 429 });
    if (activeOf(profile.id) >= profile.concurrency) throw Object.assign(new Error(`O Perfil "${profile.name}" já está com ${profile.concurrency} execução(ões) em andamento (teto do Perfil).`), { status: 429 });
    // The slot is taken before the first await and given back once the run is in `runs` (or failed to start).
    admitBump(profile.id, 1);
    let held = true; release = () => { if (held) { held = false; admitBump(profile.id, -1); } };
  }
  try { return await launchRun(body, internal, opts, profile, impl, fallbackFrom, prompt, systemPrompt); }
  finally { release(); }
}

async function launchRun(body, internal, opts, profile, impl, fallbackFrom, prompt, systemPrompt) {
  const parent = internal.parent || null;
  const adapter = profile.adapter;
  // claudePath (runtime) only counts when the Perfil has no executable of its own.
  const bin = profileBin(profile, opts.claudePath);
  const resolved = await resolveBin(bin);
  if (!resolved) throw new Error(impl.notFound(bin, profile));
  impl.validateLaunch?.(opts, profile);
  if (opts.projectRun) await ensureProjectRepo(opts.cwd);

  const id = crypto.randomUUID();
  const warnings = [];
  const warn = message => warnings.push(message);
  const { model, effort } = impl.resolveModelEffort({ opts, profile, model: opts.model || profile.model || '', effort: opts.effort || profile.effort || '', warn });
  const env = { ...process.env, ...(opts.projectRun ? { GIT_CEILING_DIRECTORIES: gitCeiling() } : {}) };
  // Only what the Perfil decides reaches the child: inherited telemetry switches (OTEL_*, CLAUDE_CODE_ENABLE_TELEMETRY,
  // OTEL_LOG_USER_PROMPTS…) are dropped here and nativeTelemetry sets them again when the Perfil turns them on.
  for (const k of Object.keys(env)) if (INHERITED_TELEMETRY.test(k)) delete env[k];
  const run = {
    id, status: 'running', startedAt: new Date().toISOString(), endedAt: null, label: String(body.label || '').slice(0, 200),
    cwd: opts.cwd, args: [], child: null, events: [], clients: new Set(), result: null, timer: null, cancelled: false,
    // History: who ran it and where (body.meta, whitelisted in db.js), saved events count and the batch waiting to be written.
    // Without a database yet (direct API use before the setup), the run still works but stays out of the history.
    meta: dbModule.runMeta(body.meta), project: typeof body.options?.project === 'string' ? body.options.project.slice(0, 80) : '', persist: !!store, saved: 0, pending: [], flushTimer: null,
    profile, impl, profileId: profile.id, profileName: profile.name, adapter, model, opts, prompt, parent, toolUseId: internal.toolUseId || null, rootRunId: parent ? parent.rootRunId : id,
    parentRunId: parent ? parent.id : null, children: new Set(), toolSpans: profile.telemetry?.enabled ? new Map() : null, translator: null, files: [],
  };
  run.done = new Promise(resolve => { run.resolveDone = resolve; });

  // `files` is filled by the Adapter as it writes: whatever fails before the child owns them (prepare, telemetry, spawn, a dead
  // caller) removes them here.
  const files = [];
  const dropFiles = () => { for (const f of files) fsp.rm(f.path, { force: true }).catch(() => {}); };
  let prep, child;
  try {
    prep = await impl.prepare({ id, run, opts, profile, model, effort, prompt, systemPrompt, env, warn, tmpDir: TMP_DIR, files });
    for (const f of prep.files || []) if (!files.includes(f)) files.push(f);
    if (prep.model !== undefined) run.model = prep.model;
    run.translator = prep.translator || null;
    nativeTelemetry(run, impl, profile, env, prep.args, warn);
    prep.args.push(...(prep.tail || [])); // after the telemetry flags (codex ends its argv with "-": the prompt comes on stdin)
    // A Chamado never outlives its caller: checked again here, with no await before the spawn and parent.children.add below.
    if (parent && !parentAlive(parent)) throw Object.assign(new Error('A execução que fez o Chamado já terminou ou foi cancelada.'), { status: 409 });
    child = spawnBin(resolved, prep.args, { cwd: opts.cwd, windowsHide: true, detached: !IS_WIN, env, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) { dropFiles(); throw e; }
  const args = prep.args, stdin = prep.stdin;
  Object.assign(run, { child, files, args: args.map(a => files.find(f => f.path === a)?.mask ?? a) });
  if (prep.mcpToken) { run.mcpKey = bearerHash(prep.mcpToken); mcpTokens.set(run.mcpKey, run); }
  if (parent) parent.children.add(run);
  runs.set(id, run);
  if (run.persist) try { store.insertRun(run); } catch (e) { run.persist = false; console.warn(`Histórico da execução ${id} não gravado: ${e.message}`); }
  pushEvent(run, { type: 'bridge', subtype: 'spawned', pid: child.pid, cwd: opts.cwd, args: run.args, at: run.startedAt, adapter });
  pushEvent(run, { type: 'bridge', subtype: 'profile', profileId: profile.id, name: profile.name, adapter, ...(fallbackFrom ? { fallbackFrom } : {}) });
  for (const message of warnings) pushEvent(run, { type: 'bridge', subtype: 'warning', message });

  run.timer = setTimeout(() => { run.timedOut = true; pushEvent(run, { type: 'bridge', subtype: 'timeout', timeoutSec: opts.timeoutSec }); killTree(child); }, opts.timeoutSec * 1000);

  const onLine = line => {
    let evt; try { evt = JSON.parse(line); } catch { evt = null; }
    if (!evt || typeof evt !== 'object') return pushEvent(run, { type: 'raw', text: line.slice(0, 4000) });
    if (run.translator) { for (const e of run.translator.feed(evt)) pushEvent(run, e); return; }
    if (evt.type === 'result') run.result = evt;
    pushEvent(run, evt);
  };
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1);
      if (line) onLine(line);
    }
  });
  let stderrTail = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderrTail = (stderrTail + chunk).slice(-4000); pushEvent(run, { type: 'stderr', text: chunk.slice(0, 4000) }); });
  child.on('error', err => { stderrTail += err.message; });
  child.on('close', code => {
    run.closing = true;
    clearTimeout(run.timer);
    if (buffer.trim()) onLine(buffer.trim());
    if (run.mcpKey) mcpTokens.delete(run.mcpKey); // revoked: the run's colleagues can no longer be called
    for (const c of run.children) if (c.status === 'running') { c.cancelled = true; killTree(c.child); }
    run.endedAt = new Date().toISOString();
    let fin = {};
    try { fin = impl.finish(run, { code, durationMs: Date.parse(run.endedAt) - Date.parse(run.startedAt) }) || {}; }
    catch (e) { console.warn(`Adapter ${adapter}: finish falhou: ${e.message}`); pushEvent(run, { type: 'bridge', subtype: 'warning', message: `O Adapter ${adapter} falhou ao encerrar a execução: ${String(e.message).slice(0, 500)}` }); }
    if (fin.result) { run.result = fin.result; pushEvent(run, run.result); }
    recordWindows(profile.id, fin.windows, 'session');
    const usage = fin.usage ?? null, model = fin.model || run.seenModel || run.model || null;
    const r = run.result || {};
    const isError = run.cancelled || run.timedOut || code !== 0 || !!r.is_error;
    run.status = run.cancelled ? 'cancelled' : run.timedOut ? 'timeout' : isError ? 'error' : 'done';
    const exit = {
      type: 'exit', status: run.status, code, isError,
      result: typeof r.result === 'string' ? r.result : '',
      costUsd: r.total_cost_usd ?? r.cost_usd ?? null, durationMs: r.duration_ms ?? null,
      numTurns: r.num_turns ?? null, sessionId: r.session_id ?? null,
      error: isError ? (run.cancelled ? 'Execução cancelada pelo operador.' : run.timedOut ? 'Tempo limite excedido.' : (r.is_error && r.result) || stderrTail.trim().slice(-1500) || `${adapter} saiu com código ${code}`) : null,
      usage, profileId: profile.id, adapter, model,
    };
    pushEvent(run, exit);
    if (run.persist) try { store.finishRun(run, exit); } catch (e) { console.warn(`Histórico da execução ${id} não finalizado: ${e.message}`); }
    try { sendTrace(run, exit); } catch {}
    for (const res of run.clients) res.end();
    run.clients.clear();
    for (const f of run.files) fsp.rm(f.path, { force: true }).catch(() => {});
    run.child = null;
    if (parent) parent.children.delete(run);
    run.usage = usage; run.model = model || run.model; // the effective ones, for /api/runs/:id while the run is in memory
    run.resolveDone(exit);
    // Keep finished runs for 30 minutes so late subscribers can replay (without the links that would keep their families alive).
    run.parent = null; run.toolSpans = null;
    setTimeout(() => runs.delete(id), 30 * 60 * 1000).unref();
  });

  child.stdin.on('error', () => {});
  child.stdin.end(stdin, 'utf8');
  return run;
}

/* ---------- MCP of the bridge (POST /mcp): the squad colleagues of a Codex run, as the tool chamar_colega (ADR 0003) ---------- */
const parentAlive = run => run.status === 'running' && !run.cancelled && !run.closing && !run.timedOut;
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
function colleagueTool(run) {
  const agents = run.opts.agents || {};
  const list = Object.entries(agents).map(([slug, a]) => `- ${slug}: ${a.description}`).join('\n');
  return {
    name: 'chamar_colega',
    description: `Chama um colega do squad e espera o relatório dele. Colegas disponíveis:\n${list}`,
    annotations: { title: 'Chamar colega do squad', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: { type: 'object', properties: { agente: { type: 'string', enum: Object.keys(agents), description: 'Identificador do colega.' }, pedido: { type: 'string', description: 'O que você precisa dele, com o contexto necessário.' } }, required: ['agente', 'pedido'], additionalProperties: false },
  };
}
async function callColleague(run, a) {
  const agents = run.opts.agents || {}, slug = String(a?.agente ?? ''), def = Object.hasOwn(agents, slug) ? agents[slug] : null;
  const text = (t, isError = false) => ({ content: [{ type: 'text', text: t }], isError });
  if (!def) return text(`Colega desconhecido: ${slug.slice(0, 60)}. Disponíveis: ${Object.keys(agents).join(', ')}.`, true);
  const pedido = typeof a?.pedido === 'string' ? a.pedido.trim() : '';
  if (!pedido) return text('Informe o pedido para o colega.', true);
  if (!parentAlive(run)) return text('A execução que fez o Chamado já terminou.', true);
  const meta = Object.hasOwn(run.opts.agentMeta, slug) ? run.opts.agentMeta[slug] : {};
  const o = run.opts;
  const options = { profile: meta.profile || '', model: def.model, effort: def.effort, permissionMode: o.permissionMode, timeoutSec: o.timeoutSec, addDirs: o.addDirs, ...(def.tools ? { tools: def.tools } : {}), ...(o.claudePathSet ? { claudePath: o.claudePath } : {}), ...(o.projectRun ? { project: o.project } : { cwd: o.cwd }) };
  let child;
  try {
    child = await startRun({ prompt: pedido.slice(0, 400000), systemPrompt: def.prompt, label: `Chamado: ${slug}`, options, meta: { ...run.meta, agentId: meta.agentId || null, kind: 'call' } }, { parent: run, toolUseId: run.translator?.claimCall(a) || null });
  } catch (e) { return text(`Não foi possível chamar ${slug}: ${e.message}`, true); }
  const exit = await child.done;
  return exit.isError ? text(`${slug} não concluiu: ${exit.error || 'erro'}${exit.result ? `\n${exit.result}` : ''}`, true) : text(exit.result || '(sem resposta)');
}
async function handleMcp(req, res) {
  if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST', 'content-type': 'application/json' }); return res.end(JSON.stringify(rpcError(null, -32000, 'Use POST.'))); }
  const m = String(req.headers.authorization || '').match(/^Bearer\s+([A-Za-z0-9]+)$/i);
  const run = m ? mcpTokens.get(bearerHash(m[1])) : null;
  if (!run || run.status !== 'running') return json(res, 401, rpcError(null, -32001, 'Token do MCP inválido ou execução encerrada.'));
  let msg;
  try { msg = await readBody(req); } catch (e) { return json(res, e.status === 413 ? 413 : 400, rpcError(null, -32700, e.message)); }
  // The run may have ended while the body was arriving: the token dies with it.
  if (!parentAlive(run) || mcpTokens.get(bearerHash(m[1])) !== run) return json(res, 401, rpcError(null, -32001, 'Token do MCP inválido ou execução encerrada.'));
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return json(res, 400, rpcError(msg?.id, -32600, 'Requisição JSON-RPC inválida.'));
  const { id, method, params } = msg;
  if (id === undefined || id === null) { res.writeHead(202); return res.end(); } // notifications (notifications/initialized, …)
  const reply = result => json(res, 200, { jsonrpc: '2.0', id, result });
  switch (method) {
    case 'initialize': {
      const asked = typeof params?.protocolVersion === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.protocolVersion) ? params.protocolVersion : '2025-06-18';
      return reply({ protocolVersion: asked, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'squad', version: '1.0.0' }, instructions: 'Colegas do squad SQUAD/CODE: use chamar_colega para pedir algo a um deles e esperar o relatório.' });
    }
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: [colleagueTool(run)] });
    case 'tools/call':
      if (params?.name !== 'chamar_colega') return json(res, 200, rpcError(id, -32602, `Ferramenta desconhecida: ${String(params?.name).slice(0, 60)}`));
      return reply(await callColleague(run, params.arguments || {}));
    default: return json(res, 200, rpcError(id, -32601, `Método não suportado: ${method.slice(0, 60)}`));
  }
}

/** The Adapter refreshes the usage windows its own way (Claude: a minimal run; Codex: its newest session file). */
async function refreshWindows(p) {
  const impl = registry.get(p.adapter);
  if (!impl) throw new Error(missingAdapter(p));
  return impl.refreshWindows(p);
}

function runSummary(r) {
  return { id: r.id, status: r.status, label: r.label, ...r.meta, project: r.project, startedAt: r.startedAt, endedAt: r.endedAt, cwd: r.cwd, events: r.events.length, profileId: r.profileId, adapter: r.adapter, model: r.model || null, parentRunId: r.parentRunId, usage: r.usage || null, costUsd: r.result?.total_cost_usd ?? r.result?.cost_usd ?? null, durationMs: r.result?.duration_ms ?? null, sessionId: r.result?.session_id ?? null };
}

/* ---------- settings.json ---------- */
// A project folder (`project`) may not exist yet: it is created by its first run or by the first save here.
// The user scope follows a Claude Perfil's account folder (CLAUDE_CONFIG_DIR) when `profile` names one.
function settingsPath(scope, cwd, project, profileId) {
  if (scope === 'user') {
    if (profileId) {
      const p = getProfile(profileId);
      if (!p) throw new Error('Perfil não encontrado.');
      const impl = registry.get(p.adapter);
      if (!impl?.settingsFile) throw new Error('O settings.json é do Claude: escolha um Perfil Claude.');
      const file = impl.settingsFile(p);
      if (file) return file;
    }
    return path.join(HOME, '.claude', 'settings.json');
  }
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

async function readSettings(scope, cwd, project, profileId) {
  const file = settingsPath(scope, cwd, project, profileId);
  try { const text = await fsp.readFile(file, 'utf8'); return { ok: true, scope, path: file, exists: true, text }; }
  catch (e) { if (e.code === 'ENOENT') return { ok: true, scope, path: file, exists: false, text: '{\n}\n' }; throw e; }
}

async function writeSettings(scope, cwd, project, profileId, text) {
  if (typeof text !== 'string') throw new Error('Conteúdo ausente.');
  let parsed; try { parsed = JSON.parse(text); } catch (e) { throw new Error('JSON inválido: ' + e.message); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('settings.json deve ser um objeto JSON.');
  const file = settingsPath(scope, cwd, project, profileId);
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
  if (pluginHost.pending) await pluginHost.ready;
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
  const tags = workspaceTag() + '\n' + memoryTag() + '\n' + jsonTag('squad-plugins', (await pluginsWithProfiles()).page); // a function replacement: the data may contain `$&` and similar patterns
  html = html.replace('<head>', () => `<head>\n<meta name="squad-bridge-token" content="${TOKEN}">\n${tags}`);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(html);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (!allowedHost(req.headers.host)) return fail(res, 421, 'Host não permitido.');
  if (!allowedOrigin(req.headers.origin)) return fail(res, 403, 'Origem não permitida.');

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return serveIndex(res);
  // MCP of the bridge for Codex runs: its own bearer token per run, never the page's token.
  if (url.pathname === '/mcp') return handleMcp(req, res);
  if (!url.pathname.startsWith('/api/')) return fail(res, 404, 'Não encontrado.');
  if (!tokenOk(req, url)) return fail(res, 401, 'Token do bridge inválido. Recarregue a página servida pelo bridge.');

  if (pluginHost.pending) await pluginHost.ready;

  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  try {
    // /api/plugins/<id>/...: the routes a plugin registered (same token, Host and Origin as every call above); never the core's.
    if (parts[1] === 'plugins' && parts.length > 2 && await pluginHost.route(req, res, url)) return;
    if (req.method === 'GET' && url.pathname === '/api/health') {
      const bin = url.searchParams.get('claudePath') || DEFAULT_BIN;
      let info = await binVersion(bin);
      // engines: whether some Perfil of each Adapter can run. claudeVersion (the page's live/demo switch) falls back to the version
      // of the first usable Perfil, so a machine with only Codex is not stuck in the demo; enginePath/engineAdapter say which.
      const engines = Object.fromEntries(registry.kinds().map(k => [k, false]));
      let usable = null;
      for (const p of listProfiles()) {
        if (!registry.has(p.adapter)) continue; // its Adapter is not registered (plugin off): the Perfil cannot run
        const v = await binVersion(profileBin(p, bin));
        if (v.version) { engines[p.adapter] = true; if (!usable) usable = { adapter: p.adapter, ...v }; }
      }
      if (info.version) engines.claude = true;
      const live = info.version ? { adapter: 'claude', ...info } : usable;
      if (!info.version && live) info = { ...info, version: live.version };
      return json(res, 200, { ok: true, bridge: 'squad-code', claudeVersion: info.version, claudePath: info.resolved, claudeError: info.error, engines, engineAdapter: live?.adapter || null, enginePath: live?.resolved || null, defaultCwd: process.cwd(), projectsDir: longPath(PROJECTS_DIR), home: HOME, platform: process.platform, activeRuns: activeCount(), maxConcurrent, dbReady: !setupNeeded(), dbPath: store?.file || DB_FILE, profiles: listProfiles().length, plugins: pluginsOn(pluginsBody(activeContent(loadPlugins()))) });
    }
    // Every plugin (content without the avatars' data URLs, and the state of its code), plus the configuration they came from.
    if (req.method === 'GET' && url.pathname === '/api/plugins') return json(res, 200, pluginsBody(await pluginsWithProfiles()));
    // First start: the page creates the database with the workspace the person chose (from scratch, the example, a backup or the
    // browser's copy). Validated before anything is written; refused once a workspace exists.
    if (req.method === 'POST' && url.pathname === '/api/setup') {
      const body = await readBody(req, MAX_WORKSPACE);
      if (!setupNeeded()) return json(res, 409, { ok: false, conflict: true, path: store.file, error: 'Já existe um banco de dados com um workspace. Recarregue a página.' });
      dbModule.checkWorkspace(body);
      if (!store) { openDb(); await afterOpen(); }
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
    if (url.pathname === '/api/profiles' && req.method === 'GET') {
      await syncConfigProfiles();
      return json(res, 200, { ok: true, profiles: await Promise.all(listProfiles().map(profileView)), adapters: adaptersCatalog(), configDefault: cfgProfiles.defaultFile ? path.basename(cfgProfiles.defaultFile) : '', configDefaultTarget: cfgProfiles.cfg ? path.basename(cfgProfiles.cfg.defaultProfileFile || cfgProfiles.cfg.localFile) : '', configDefaultDeclared: !!cfgProfiles.cfg?.defaultProfile, configWarnings: [...(cfgProfiles.cfg?.profileWarnings || []), ...cfgProfiles.warnings] });
    }
    if (url.pathname === '/api/profiles' && req.method === 'POST') {
      needStore();
      const p = await validateProfile(await readBody(req));
      return json(res, 201, { ok: true, profile: await profileView(store.createProfile(p)) });
    }
    if (parts[1] === 'profiles' && parts[2] && !parts[4]) {
      const pid = decodeURIComponent(parts[2]);
      const current = getProfile(pid);
      if (!current) return fail(res, 404, 'Perfil não encontrado.');
      // A Perfil of the configuration is changed in its file (editConfigProfile, deleteConfigProfile); the default goes to the file
      // whenever the configuration declares one or the Perfil comes from it (defaultInConfig).
      if (current.source === 'config' && !parts[3] && req.method === 'PUT') { needStore(); const body = await readBody(req); return json(res, 200, await configOp(() => editConfigProfile(pid, body))); }
      if (current.source === 'config' && !parts[3] && req.method === 'DELETE') { needStore(); return json(res, 200, await configOp(() => deleteConfigProfile(pid))); }

      // Perfis of the database go through the same queue: a "tornar padrão" written to the configuration and the deletion of that
      // same Perfil never interleave (defaultProfile pointing to an id that no longer exists).
      if (!parts[3] && req.method === 'PUT') {
        needStore();
        const body = await readBody(req);
        return json(res, 200, await configOp(async () => { const p = await validateProfile(body, currentProfile(pid)); return { ok: true, profile: await profileView(needStore().updateProfile(pid, p)) }; }));
      }
      if (!parts[3] && req.method === 'DELETE') {
        needStore();
        return json(res, 200, await configOp(() => {
          const p = currentProfile(pid), cfg = cfgProfiles.cfg;
          if (p.isDefault || (cfg?.defaultProfile && cfg.defaultProfile === pid)) throw conflict('O Perfil padrão não pode ser excluído. Torne outro Perfil padrão antes.');
          return needStore().deleteProfile(pid);
        }));
      }
      // The default goes to the configuration when the Perfil comes from it or the configuration declares one (decided in the queue).
      if (parts[3] === 'default' && req.method === 'POST') {
        needStore();
        return json(res, 200, await configOp(async () => {
          const p = currentProfile(pid);
          if (p.source === 'config' || cfgProfiles.cfg?.defaultProfile) return defaultInConfig(pid);
          return { ok: true, profile: await profileView(needStore().setDefaultProfile(p.id)) };
        }));
      }
      if (parts[3] === 'test' && req.method === 'POST') {
        const status = await profileStatus(current);
        return json(res, 200, { ok: !!status.version && status.configDirOk, status });
      }
      if (parts[3] === 'refresh' && req.method === 'POST') {
        const out = await refreshWindows(current);
        return json(res, 200, { ok: true, ...out, windows: windowsOf(pid) });
      }
    }
    if (url.pathname === '/api/usage' && req.method === 'GET') {
      const from = url.searchParams.get('from') || '', to = url.searchParams.get('to') || '', by = url.searchParams.get('by') || 'profile';
      for (const v of [from, to]) if (v && Number.isNaN(Date.parse(v))) return fail(res, 400, 'Data inválida (use ISO 8601).');
      const iso = v => v ? new Date(v).toISOString() : '';
      if (!store) return json(res, 200, { ok: true, by, from, to, rows: [] });
      return json(res, 200, { ok: true, by, from, to, rows: store.usage({ from: iso(from), to: iso(to), by }) });
    }
    if (url.pathname === '/api/telemetry') {
      if (req.method === 'GET') return json(res, 200, telemetryView());
      if (req.method === 'PUT') { const t = validateTelemetry(await readBody(req)); needStore().setSetting('telemetry', t); return json(res, 200, telemetryView()); }
    }
    if (url.pathname === '/api/claude/settings') {
      const scope = url.searchParams.get('scope') || 'user';
      const cwd = url.searchParams.get('cwd') || '', project = url.searchParams.get('project') || '', profile = url.searchParams.get('profile') || '';
      if (req.method === 'GET') return json(res, 200, await readSettings(scope, cwd, project, profile));
      if (req.method === 'PUT') { const body = await readBody(req); return json(res, 200, await writeSettings(scope, cwd, project, profile, body.text)); }
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
  // onDispose of the plugins (1 s each, in parallel; a register() still loading gets 1 s first) runs while the process waits to exit; without any, the wait stays 300 ms.
  const disposing = pluginHost.hasDisposers();
  const disposed = pluginHost.dispose().catch(() => {});
  // Runs still open are marked interrupted at the next start.
  setTimeout(async () => { await disposed; try { store?.close(); } catch {} process.exit(0); }, pluginHost.pending ? 2300 : disposing ? 1200 : 300).unref();
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
  pluginHost.load(); // import() + register(ctx) of the enabled plugins; handle(), serveIndex, startRun and afterOpen wait for it
  afterOpen();
  console.log(`SQUAD/CODE bridge ativo em ${url}`);
  console.log(`Pasta dos projetos: ${PROJECTS_DIR}`);
  if (store) console.log(`Banco de dados: ${store.file}`);
  else console.log(`Banco de dados: nenhum em ${DATA_DIR}. Abra ${url} para criar um.`);
  pluginHost.ready.then(() => {
    const body = pluginsBody(activeContent(loadPlugins()));
    console.log(`Plugins: ${body.plugins.map(pluginLine).join(', ') || 'nenhum'}${body.warnings.length ? ` · ${body.warnings.length} aviso(s): ${body.warnings.join(' | ')}` : ''}`);
  });
  if (store?.interrupted) console.log(`${store.interrupted} execução(ões) interrompida(s) na última sessão marcada(s) no histórico.`);
  if (process.env.SQUAD_PRINT_TOKEN) console.log(`TOKEN=${TOKEN}`);
  binVersion(DEFAULT_BIN).then(info => {
    if (info.version) console.log(`Claude Code ${info.version} (${info.resolved})`);
    else console.warn(`Claude Code não encontrado (${DEFAULT_BIN}): ${info.error}\n  Instale o Claude Code, rode "claude" uma vez para fazer login e reinicie, ou aponte SQUAD_CLAUDE_BIN para o executável.\n  Sem ele o app abre, mas as execuções ficam só na simulação.`);
  }, () => {});
});

module.exports = { server };
