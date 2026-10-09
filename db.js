'use strict';
/*
 * SQUAD/CODE persistence: one SQLite database (better-sqlite3) in data/squad.db.
 *
 * Workspace: one table per entity (agents, squads, projects, adrs, sprints, features, feature_outputs, logs, handoffs, convention
 * templates/subsets) under a single root row. Each row keeps the entity's own JSON (`data`) with its child arrays left as [] in
 * their key position; assembly fills them back, so what the page sent comes back byte for byte and there is no field list to keep
 * in step with the app's normalizeWorkspace. Generated columns (json_extract) expose the usual fields to SQL. The page sends the
 * whole workspace on every save; syncWorkspace writes only rows whose hash or position changed, in one transaction guarded by `rev`.
 *
 * Also here: versions of the workspace (snapshots), operation-room messages, chats, the bridge's run history (with token usage),
 * the Perfis (profiles: an Adapter instance with its executable and account folder) and their usage windows, and bridge settings.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

let Database = null, driverError = '';
try { Database = require('better-sqlite3'); }
catch (e) {
  driverError = e.code === 'MODULE_NOT_FOUND'
    ? 'Dependência ausente (better-sqlite3): rode "npm install" na pasta do SQUAD/CODE.'
    : `Não foi possível carregar o better-sqlite3 (${e.message}). Apague a pasta node_modules e rode "npm install" de novo.`;
}

const KEEP_SNAPSHOTS = 30;
const ROOM_MAX = 800;
const CHAT_MAX = 300;
const KEEP_RUNS = 300;
const REF_RE = /^[A-Za-z0-9_-]{1,100}$/;
const CHAT_KEY_RE = { feature: REF_RE, agent: REF_RE, doc: /^[A-Za-z0-9_:+-]{1,800}$/ };
const ROOM_KINDS = new Set(['system', 'say', 'call', 'baton', 'plan', 'review']);
const RUN_KINDS = new Set(['step', 'plan', 'chat', 'cowrite', 'doc', 'spawn', 'call', 'probe']);
const ADAPTERS = ['claude', 'codex'];
const WINDOWS = ['five_hour', 'seven_day'];
// Fixed ids of the Perfis created by the migration (the bridge uses the Claude one in memory before a database exists).
const DEFAULT_PROFILE_IDS = { claude: 'claude-default', codex: 'codex-default' };

/* Entity tree of the workspace: `key` is the path of the array on the parent object, `cols` become generated columns, `keyOf`
   names a row inside its parent (default: the entity id). Adding a child array to the workspace means adding it here. */
const TREE = { table: 'workspace', children: [
  { key: 'agents', table: 'agents', cols: { name: '$.name', role: '$.role', specialty: '$.specialty', model: '$.model' } },
  { key: 'conventionLibrary.templates', table: 'convention_templates', cols: { name: '$.name', family: '$.family' } },
  { key: 'conventionLibrary.subsets', table: 'convention_subsets', cols: { name: '$.name' } },
  { key: 'squads', table: 'squads', cols: { name: '$.name', commander_id: '$.commanderId' } },
  { key: 'projects', table: 'projects', cols: { code: '$.code', name: '$.name', folder: '$.folder', squad_id: '$.squadId' }, children: [
    { key: 'adrs', table: 'adrs', cols: { title: '$.title', status: '$.status' } },
    { key: 'sprints', table: 'sprints', cols: { name: '$.name' } },
    { key: 'features', table: 'features', cols: { feature_key: '$.key', title: '$.title', status: '$.status', priority: '$.priority', scope: '$.scope', sprint_id: '$.sprintId' }, children: [
      { key: 'outputs', table: 'feature_outputs', keyOf: o => isObj(o) ? `${o.at ?? ''}|${o.agentId ?? ''}` : '', cols: { agent_id: '$.agentId', at: '$.at', cost_usd: '$.costUsd', error: '$.error' } },
    ] },
    { key: 'logs', table: 'logs', cols: { at: '$.at', type: '$.type', agent_id: '$.agentId', message: '$.message' } },
    { key: 'handoffs', table: 'handoffs', cols: { at: '$.at', from_id: '$.from', to_id: '$.to', feature_id: '$.featureId' } },
  ] },
] };
const SPECS = [];
(function link(spec) { for (const c of spec.children || []) { c.parent = spec; SPECS.push(c); link(c); } })(TREE);

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const hash = text => crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
const nowISO = () => new Date().toISOString();
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const clip = (v, n) => typeof v === 'string' && v.length > n ? v.slice(0, n) + '…' : v;
const getPath = (o, p) => p.split('.').reduce((v, k) => isObj(v) ? v[k] : undefined, o);
function setPath(o, p, value) { const ks = p.split('.'); let v = o; for (const k of ks.slice(0, -1)) { if (!isObj(v[k])) return; v = v[k]; } v[ks.at(-1)] = value; }

/** The entity's own JSON: child arrays become [] in place (copied along the path, the input stays untouched). */
function ownData(spec, item) {
  if (!isObj(item) || !spec.children) return JSON.stringify(item) ?? 'null';
  const copy = { ...item };
  for (const c of spec.children) {
    if (!Array.isArray(getPath(item, c.key))) continue;
    const ks = c.key.split('.'); let v = copy;
    for (const k of ks.slice(0, -1)) { v[k] = { ...v[k] }; v = v[k]; }
    v[ks.at(-1)] = [];
  }
  return JSON.stringify(copy);
}

/** Row names inside a parent: the id (or keyOf), made unique with #n; items without one get #index. */
function rowKeys(spec, items) {
  const used = new Set();
  return items.map((item, i) => {
    let k = spec.keyOf ? spec.keyOf(item) : (isObj(item) && typeof item.id === 'string' ? item.id : '');
    if (!k || used.has(k)) { const base = k ? k + '#' : '#'; let n = k ? 2 : i; k = base + n; while (used.has(k)) k = base + (++n); }
    used.add(k);
    return k;
  });
}

/** Append-aware positions: rows that stay keep theirs when the order holds and new rows only come at the end (a capped log that
    drops its first entry rewrites one row, not all of them); otherwise everything is renumbered. */
function positions(prev, keys) {
  const kept = keys.filter(k => prev.has(k));
  const lastKept = kept.length ? keys.lastIndexOf(kept.at(-1)) : -1;
  const ordered = kept.every((k, i) => i === 0 || prev.get(kept[i - 1]).pos < prev.get(k).pos);
  if (ordered && keys.every((k, i) => prev.has(k) || i > lastKept)) {
    let next = 0; for (const r of prev.values()) if (r.pos >= next) next = r.pos + 1;
    return keys.map(k => prev.has(k) ? prev.get(k).pos : next++);
  }
  return keys.map((_, i) => i);
}

/** Run history fields taken from the page (body.meta of POST /api/runs); also used by the bridge before a database exists. */
const runMeta = m => ({ projectId: REF_RE.test(m?.projectId || '') ? m.projectId : null, agentId: REF_RE.test(m?.agentId || '') ? m.agentId : null, featureId: REF_RE.test(m?.featureId || '') ? m.featureId : null, kind: RUN_KINDS.has(m?.kind) ? m.kind : null });
function checkWorkspace(ws) {
  if (!isObj(ws) || ws.version !== 2 || !Array.isArray(ws.agents) || !Array.isArray(ws.projects) || !ws.projects.length) throw bad('Workspace inválido. Esperado um workspace SQUAD CODE v2.');
}

function schema() {
  const entity = spec => {
    const gen = Object.entries(spec.cols || {}).map(([c, p]) => `,\n  ${c} GENERATED ALWAYS AS (json_extract(data, '${p}')) VIRTUAL`).join('');
    return `CREATE TABLE ${spec.table} (
  rid INTEGER PRIMARY KEY,
  parent_rid INTEGER NOT NULL REFERENCES ${spec.parent.table}(rid) ON DELETE CASCADE,
  key TEXT NOT NULL, pos INTEGER NOT NULL, h TEXT NOT NULL, data TEXT NOT NULL${gen},
  UNIQUE (parent_rid, key)
);`;
  };
  return `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE workspace (
  rid INTEGER PRIMARY KEY CHECK (rid = 1), h TEXT NOT NULL, data TEXT NOT NULL,
  version GENERATED ALWAYS AS (json_extract(data, '$.version')) VIRTUAL,
  project_id GENERATED ALWAYS AS (json_extract(data, '$.projectId')) VIRTUAL
);
${SPECS.map(entity).join('\n')}
CREATE INDEX features_status ON features (status);
CREATE INDEX logs_at ON logs (parent_rid, at);
CREATE TABLE snapshots (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, origin TEXT NOT NULL, rev TEXT, projects INTEGER, agents INTEGER, label TEXT, bytes INTEGER, json BLOB NOT NULL);
CREATE TABLE room_state (project_id TEXT PRIMARY KEY, seq INTEGER NOT NULL);
CREATE TABLE room_messages (project_id TEXT NOT NULL, id TEXT NOT NULL, seq INTEGER NOT NULL, at TEXT, kind TEXT, data TEXT NOT NULL, PRIMARY KEY (project_id, id));
CREATE INDEX room_messages_seq ON room_messages (project_id, seq);
CREATE TABLE chats (kind TEXT NOT NULL, key TEXT NOT NULL, project_id TEXT, ref_id TEXT, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (kind, key));
CREATE TABLE runs (id TEXT PRIMARY KEY, status TEXT NOT NULL, label TEXT, kind TEXT, project TEXT, project_id TEXT, agent_id TEXT, feature_id TEXT, cwd TEXT, started_at TEXT NOT NULL, ended_at TEXT, args TEXT, result TEXT, cost_usd REAL, duration_ms INTEGER, session_id TEXT, events INTEGER NOT NULL DEFAULT 0);
CREATE INDEX runs_project ON runs (project_id, started_at);
CREATE TABLE run_events (run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, seq INTEGER NOT NULL, type TEXT, data TEXT NOT NULL, PRIMARY KEY (run_id, seq));
`;
}
/* Migrations after the first schema, one per user_version (ALTER/CREATE only, never DROP). */
const MIGRATIONS = [
  // 2: Perfis, their usage windows, bridge settings and token usage per run.
  db => {
    db.exec(`
CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, adapter TEXT NOT NULL, bin TEXT NOT NULL DEFAULT '', config_dir TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', effort TEXT NOT NULL DEFAULT '', concurrency INTEGER NOT NULL DEFAULT 2, fallback_id TEXT, threshold INTEGER NOT NULL DEFAULT 90, ignore_user_config INTEGER NOT NULL DEFAULT 1, telemetry TEXT, is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT);
CREATE TABLE profile_windows (profile_id TEXT NOT NULL, window TEXT NOT NULL, utilization REAL, resets_at TEXT, observed_at TEXT, PRIMARY KEY (profile_id, window));
CREATE TABLE bridge_settings (key TEXT PRIMARY KEY, value TEXT);
ALTER TABLE runs ADD COLUMN profile_id TEXT;
ALTER TABLE runs ADD COLUMN adapter TEXT;
ALTER TABLE runs ADD COLUMN model TEXT;
ALTER TABLE runs ADD COLUMN input_tokens INTEGER;
ALTER TABLE runs ADD COLUMN cache_read_tokens INTEGER;
ALTER TABLE runs ADD COLUMN cache_write_tokens INTEGER;
ALTER TABLE runs ADD COLUMN output_tokens INTEGER;
ALTER TABLE runs ADD COLUMN reasoning_tokens INTEGER;
ALTER TABLE runs ADD COLUMN parent_run_id TEXT;
CREATE INDEX runs_started ON runs (started_at);
`);
    const at = nowISO();
    db.prepare("INSERT INTO profiles (id, name, adapter, telemetry, is_default, created_at, updated_at) VALUES (?, 'Claude (padrão)', 'claude', ?, 1, ?, ?)").run(DEFAULT_PROFILE_IDS.claude, JSON.stringify(TELEMETRY_OFF), at, at);
  },
  // 3: token usage per day, Perfil, agent and project, kept apart from the run history (which keeps only the last runs).
  db => {
    db.exec(`
CREATE TABLE usage_daily (day TEXT NOT NULL, profile_id TEXT NOT NULL DEFAULT '', agent_id TEXT NOT NULL DEFAULT '', project_id TEXT NOT NULL DEFAULT '', runs INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, reasoning_tokens INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, PRIMARY KEY (day, profile_id, agent_id, project_id));
INSERT INTO usage_daily SELECT substr(started_at, 1, 10), coalesce(profile_id, ''), coalesce(agent_id, ''), coalesce(project_id, ''), count(*), coalesce(sum(input_tokens), 0), coalesce(sum(cache_read_tokens), 0), coalesce(sum(cache_write_tokens), 0), coalesce(sum(output_tokens), 0), coalesce(sum(reasoning_tokens), 0), coalesce(sum(cost_usd), 0)
  FROM runs WHERE coalesce(kind, '') != 'probe' AND status != 'running' GROUP BY 1, 2, 3, 4;
`);
  },
];
const TELEMETRY_OFF = { enabled: false, native: false, content: false };

/** Synchronous rename that waits a little when Windows holds the file (antivirus, an editor). */
function moveSync(from, to) {
  for (let i = 0; ; i++) {
    try { return fs.renameSync(from, to); }
    catch (e) { if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80 * (i + 1)); }
  }
}

function openStore(dataDir) {
  if (!Database) throw new Error(driverError);
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'squad.db');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (db.pragma('user_version', { simple: true }) < 1) db.transaction(() => { db.exec(schema()); db.pragma('user_version = 1'); })();
  for (let v = db.pragma('user_version', { simple: true }); v <= MIGRATIONS.length; v++) db.transaction(() => { MIGRATIONS[v - 1](db); db.pragma(`user_version = ${v + 1}`); })();

  const q = {
    metaGet: db.prepare('SELECT value FROM meta WHERE key = ?').pluck(),
    metaSet: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
    root: db.prepare('SELECT h, data FROM workspace WHERE rid = 1'),
    rootInsert: db.prepare('INSERT INTO workspace (rid, h, data) VALUES (1, ?, ?)'),
    rootUpdate: db.prepare('UPDATE workspace SET h = ?, data = ? WHERE rid = 1'),
    snapInsert: db.prepare('INSERT INTO snapshots (created_at, origin, rev, projects, agents, label, bytes, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    snapPrune: db.prepare(`DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY created_at DESC, id DESC LIMIT ${KEEP_SNAPSHOTS})`),
    snapList: db.prepare('SELECT id, created_at AS createdAt, origin, rev, projects, agents, label, bytes FROM snapshots ORDER BY created_at DESC, id DESC'),
    snapGet: db.prepare('SELECT json FROM snapshots WHERE id = ?').pluck(),
    roomUpsert: db.prepare('INSERT INTO room_messages (project_id, id, seq, at, kind, data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (project_id, id) DO UPDATE SET seq = excluded.seq, at = excluded.at, kind = excluded.kind, data = excluded.data'),
    roomDelete: db.prepare('DELETE FROM room_messages WHERE project_id = ? AND id = ?'),
    roomSeq: db.prepare('INSERT INTO room_state (project_id, seq) VALUES (?, ?) ON CONFLICT (project_id) DO UPDATE SET seq = max(seq, excluded.seq)'),
    roomTrim: db.prepare('DELETE FROM room_messages WHERE project_id = ? AND seq NOT IN (SELECT seq FROM room_messages WHERE project_id = ? ORDER BY seq DESC LIMIT ?)'),
    roomStates: db.prepare('SELECT project_id AS projectId, seq FROM room_state'),
    roomLast: db.prepare('SELECT seq, data FROM room_messages WHERE project_id = ? ORDER BY seq DESC LIMIT ?'),
    chatUpsert: db.prepare('INSERT INTO chats (kind, key, project_id, ref_id, updated_at, data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (kind, key) DO UPDATE SET project_id = excluded.project_id, ref_id = excluded.ref_id, updated_at = excluded.updated_at, data = excluded.data'),
    chatDelete: db.prepare('DELETE FROM chats WHERE kind = ? AND key = ?'),
    chatAll: db.prepare('SELECT kind, key, data FROM chats'),
    runInsert: db.prepare('INSERT INTO runs (id, status, label, kind, project, project_id, agent_id, feature_id, cwd, started_at, args, profile_id, adapter, model, parent_run_id) VALUES (@id, @status, @label, @kind, @project, @projectId, @agentId, @featureId, @cwd, @startedAt, @args, @profileId, @adapter, @model, @parentRunId)'),
    runEvent: db.prepare('INSERT OR IGNORE INTO run_events (run_id, seq, type, data) VALUES (?, ?, ?, ?)'),
    runCount: db.prepare('UPDATE runs SET events = max(events, ?) WHERE id = ?'),
    runFinish: db.prepare('UPDATE runs SET status = @status, ended_at = @endedAt, result = @result, cost_usd = @costUsd, duration_ms = @durationMs, session_id = @sessionId WHERE id = @id'),
    usageAdd: db.prepare(`INSERT INTO usage_daily (day, profile_id, agent_id, project_id, runs, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens, cost_usd) VALUES (@day, @profileId, @agentId, @projectId, 1, @input, @cacheRead, @cacheWrite, @output, @reasoning, @costUsd)
      ON CONFLICT (day, profile_id, agent_id, project_id) DO UPDATE SET runs = runs + 1, input_tokens = input_tokens + excluded.input_tokens, cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens, cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens, output_tokens = output_tokens + excluded.output_tokens, reasoning_tokens = reasoning_tokens + excluded.reasoning_tokens, cost_usd = cost_usd + excluded.cost_usd`),
    runUsage: db.prepare('UPDATE runs SET model = coalesce(@model, model), input_tokens = @input, cache_read_tokens = @cacheRead, cache_write_tokens = @cacheWrite, output_tokens = @output, reasoning_tokens = @reasoning WHERE id = @id'),
    profAll: db.prepare('SELECT * FROM profiles ORDER BY is_default DESC, created_at, name'),
    profGet: db.prepare('SELECT * FROM profiles WHERE id = ?'),
    profDefault: db.prepare('SELECT * FROM profiles WHERE is_default = 1 ORDER BY created_at LIMIT 1'),
    profInsert: db.prepare('INSERT INTO profiles (id, name, adapter, bin, config_dir, model, effort, concurrency, fallback_id, threshold, ignore_user_config, telemetry, is_default, created_at, updated_at) VALUES (@id, @name, @adapter, @bin, @configDir, @model, @effort, @concurrency, @fallbackId, @threshold, @ignoreUserConfig, @telemetry, 0, @at, @at)'),
    profUpdate: db.prepare('UPDATE profiles SET name = @name, adapter = @adapter, bin = @bin, config_dir = @configDir, model = @model, effort = @effort, concurrency = @concurrency, fallback_id = @fallbackId, threshold = @threshold, ignore_user_config = @ignoreUserConfig, telemetry = @telemetry, updated_at = @at WHERE id = @id'),
    profDelete: db.prepare('DELETE FROM profiles WHERE id = ?'),
    profUnfallback: db.prepare('UPDATE profiles SET fallback_id = NULL WHERE fallback_id = ?'),
    profClearDefault: db.prepare('UPDATE profiles SET is_default = 0 WHERE is_default = 1'),
    profSetDefault: db.prepare('UPDATE profiles SET is_default = 1 WHERE id = ?'),
    winUpsert: db.prepare('INSERT INTO profile_windows (profile_id, window, utilization, resets_at, observed_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (profile_id, window) DO UPDATE SET utilization = excluded.utilization, resets_at = excluded.resets_at, observed_at = excluded.observed_at'),
    winOf: db.prepare('SELECT window, utilization, resets_at AS resetsAt, observed_at AS observedAt FROM profile_windows WHERE profile_id = ?'),
    winDelete: db.prepare('DELETE FROM profile_windows WHERE profile_id = ?'),
    setGet: db.prepare('SELECT value FROM bridge_settings WHERE key = ?').pluck(),
    setSet: db.prepare('INSERT INTO bridge_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
    runGet: db.prepare('SELECT * FROM runs WHERE id = ?'),
    runEvents: db.prepare('SELECT data FROM run_events WHERE run_id = ? ORDER BY seq').pluck(),
    runLastSeq: db.prepare('SELECT coalesce(max(seq), 0) FROM run_events WHERE run_id = ?').pluck(),
    runPrune: db.prepare(`DELETE FROM runs WHERE status != 'running' AND id NOT IN (SELECT id FROM runs ORDER BY started_at DESC LIMIT ${KEEP_RUNS})`),
  };
  const ent = {};
  for (const s of SPECS) ent[s.table] = {
    list: db.prepare(`SELECT rid, key, pos, h FROM ${s.table} WHERE parent_rid = ?`),
    insert: db.prepare(`INSERT INTO ${s.table} (parent_rid, key, pos, h, data) VALUES (?, ?, ?, ?, ?)`),
    update: db.prepare(`UPDATE ${s.table} SET pos = ?, h = ?, data = ? WHERE rid = ?`),
    remove: db.prepare(`DELETE FROM ${s.table} WHERE rid = ?`),
    all: db.prepare(`SELECT rid, parent_rid, data FROM ${s.table} ORDER BY parent_rid, pos`),
  };
  const setMeta = (k, v) => q.metaSet.run(k, v);
  let snapshotTaken = false; // one copy of the previous workspace per bridge start (plus forced writes)

  /* ---------- workspace ---------- */
  function syncLevel(spec, parentRid, items, stats) {
    const st = ent[spec.table];
    const prev = new Map(st.list.all(parentRid).map(r => [r.key, r]));
    const keys = rowKeys(spec, items), pos = positions(prev, keys), seen = new Set();
    items.forEach((item, i) => {
      const key = keys[i], data = ownData(spec, item), h = hash(data), old = prev.get(key);
      let rid;
      if (!old) { rid = Number(st.insert.run(parentRid, key, pos[i], h, data).lastInsertRowid); stats.changes++; }
      else { rid = old.rid; if (old.h !== h || old.pos !== pos[i]) { st.update.run(pos[i], h, data, rid); stats.changes++; } }
      seen.add(key);
      for (const c of spec.children || []) { const arr = isObj(item) ? getPath(item, c.key) : undefined; syncLevel(c, rid, Array.isArray(arr) ? arr : [], stats); }
    });
    for (const [key, r] of prev) if (!seen.has(key)) { st.remove.run(r.rid); stats.changes++; }
  }
  function syncRoot(ws, stats) {
    const data = ownData(TREE, ws), h = hash(data), old = q.root.get();
    if (!old) { q.rootInsert.run(h, data); stats.changes++; }
    else if (old.h !== h) { q.rootUpdate.run(h, data); stats.changes++; }
    for (const c of TREE.children) { const arr = getPath(ws, c.key); syncLevel(c, 1, Array.isArray(arr) ? arr : [], stats); }
  }
  function assemble() {
    const root = q.root.get();
    if (!root) return null;
    const groups = {};
    const rowsOf = (table, rid) => {
      if (!groups[table]) { const g = groups[table] = new Map(); for (const r of ent[table].all.all()) { if (!g.has(r.parent_rid)) g.set(r.parent_rid, []); g.get(r.parent_rid).push(r); } }
      return groups[table].get(rid) || [];
    };
    const fill = (spec, rid, obj) => {
      for (const c of spec.children || []) {
        if (!Array.isArray(getPath(obj, c.key))) continue;
        setPath(obj, c.key, rowsOf(c.table, rid).map(r => { const v = JSON.parse(r.data); if (c.children && isObj(v)) fill(c, r.rid, v); return v; }));
      }
    };
    const ws = JSON.parse(root.data);
    fill(TREE, 1, ws);
    return ws;
  }
  function insertSnapshot(text, origin, rev, createdAt = nowISO()) {
    let projects = null, agents = null, label = '';
    try { const w = JSON.parse(text); projects = Array.isArray(w.projects) ? w.projects.length : null; agents = Array.isArray(w.agents) ? w.agents.length : null; label = (w.projects || []).map(p => p?.name).filter(Boolean).slice(0, 4).join(', ').slice(0, 200); } catch {}
    const id = Number(q.snapInsert.run(createdAt, origin, rev || '', projects, agents, label, Buffer.byteLength(text), zlib.deflateRawSync(text)).lastInsertRowid);
    q.snapPrune.run();
    return id;
  }

  /** Writes the workspace the page sent: 409-style conflict when `base` is not the current rev (unless forced). */
  function syncWorkspace(ws, base = '', force = false) {
    checkWorkspace(ws);
    return db.transaction(() => {
      const exists = !!q.root.get(), rev = q.metaGet.get('rev') || '';
      if (exists && !force && base !== rev) return { ok: false, conflict: true, rev, path: file, error: 'O workspace salvo foi alterado por outra aba ou janela.' };
      const before = exists && (!snapshotTaken || force) ? JSON.stringify(assemble()) : null;
      const stats = { changes: 0 };
      syncRoot(ws, stats);
      if (!stats.changes) return { ok: true, rev, savedAt: q.metaGet.get('savedAt') || '', path: file, changes: 0, unchanged: true };
      if (before) { insertSnapshot(before, 'disco', rev); snapshotTaken = true; }
      const next = crypto.randomBytes(8).toString('hex'), savedAt = nowISO();
      setMeta('rev', next); setMeta('savedAt', savedAt);
      return { ok: true, rev: next, savedAt, path: file, changes: stats.changes, unchanged: false };
    }).immediate();
  }
  function readWorkspace(withWorkspace = true) {
    const exists = !!q.root.get();
    const info = { exists, rev: exists ? q.metaGet.get('rev') || '' : '', savedAt: exists ? q.metaGet.get('savedAt') || '' : '', path: file };
    if (withWorkspace) info.workspace = exists ? assemble() : null;
    return info;
  }
  /** A browser copy that lost to the saved version (or a stale page's last state): kept as a version, never discarded. */
  function backupWorkspace(ws) { checkWorkspace(ws); return insertSnapshot(JSON.stringify(ws), 'navegador', ''); }
  const listSnapshots = () => q.snapList.all();
  function getSnapshot(id) {
    const blob = q.snapGet.get(Number(id));
    return blob ? JSON.parse(zlib.inflateRawSync(blob).toString('utf8')) : null;
  }

  /* ---------- migration of the JSON files (data/workspace.json + backups/) ---------- */
  function migrateLegacy() {
    const legacyFile = path.join(dataDir, 'workspace.json'), legacyDir = path.join(dataDir, 'legacy-json'), backups = path.join(dataDir, 'backups');
    if (q.root.get() || !fs.existsSync(legacyFile) || fs.existsSync(legacyDir)) return null;
    let text, ws;
    try { text = fs.readFileSync(legacyFile, 'utf8'); ws = JSON.parse(text); checkWorkspace(ws); }
    catch (e) { return { error: `${legacyFile} não foi migrado: ${e.message}` }; }
    const olds = fs.existsSync(backups) ? fs.readdirSync(backups).filter(f => /^workspace-.+\.json$/.test(f)).sort() : [];
    let versions = 0;
    db.transaction(() => {
      syncRoot(ws, { changes: 0 });
      // The same rev the bridge gave this file (sha1 of its text), so the browsers' copies still match it.
      const rev = hash(text);
      setMeta('rev', rev); setMeta('savedAt', fs.statSync(legacyFile).mtime.toISOString());
      for (const f of olds) {
        try {
          const t = fs.readFileSync(path.join(backups, f), 'utf8'); JSON.parse(t);
          const m = f.match(/^workspace-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:-(\w+))?\.json$/);
          insertSnapshot(t, m?.[6] === 'navegador' ? 'navegador' : 'disco', '', m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : nowISO());
          versions++;
        } catch {}
      }
      insertSnapshot(JSON.stringify(ws), 'migração', rev);
    }).immediate();
    fs.mkdirSync(legacyDir, { recursive: true });
    for (const name of ['workspace.json', 'workspace.json.bak', 'backups']) {
      const from = path.join(dataDir, name);
      try { if (fs.existsSync(from)) moveSync(from, path.join(legacyDir, name)); } catch (e) { return { imported: true, versions, warning: `Não foi possível mover ${from} para ${legacyDir}: ${e.message}` }; }
    }
    return { imported: true, versions };
  }

  /* ---------- operation room ---------- */
  function roomRow(m) {
    if (!isObj(m) || typeof m.id !== 'string' || !/^rm\d{1,9}$/.test(m.id) || !ROOM_KINDS.has(m.kind)) return null;
    const x = { ...m };
    // Same limits the room shows; a baton carries the whole step output.
    if (x.kind === 'baton') x.text = clip(x.text, 8000);
    else if (x.kind === 'call') { x.text = clip(x.text, 900); x.answer = clip(x.answer, 1600); }
    else if (x.kind === 'say') { x.text = clip(x.text, 4000); x.raw = clip(x.raw, 400); if (Array.isArray(x.activity) && x.activity.length > 50) x.activity = x.activity.slice(-50); }
    else if (x.kind === 'system') x.text = clip(x.text, 2000);
    const data = JSON.stringify(x);
    return data.length > 200000 ? null : { id: x.id, seq: Number(x.id.slice(2)), at: typeof x.at === 'string' ? x.at : '', kind: x.kind, data };
  }
  function saveRoom(projectId, body) {
    if (!REF_RE.test(projectId)) throw bad('Projeto inválido.');
    const ups = Array.isArray(body?.upserts) ? body.upserts : [], rms = Array.isArray(body?.removes) ? body.removes : [];
    if (ups.length > ROOM_MAX || rms.length > ROOM_MAX) throw bad('Mensagens demais numa gravação da sala.');
    let saved = 0;
    db.transaction(() => {
      for (const m of ups) { const r = roomRow(m); if (r) { q.roomUpsert.run(projectId, r.id, r.seq, r.at, r.kind, r.data); saved++; } }
      for (const id of rms) if (typeof id === 'string') q.roomDelete.run(projectId, id);
      q.roomSeq.run(projectId, Number.isInteger(body?.seq) && body.seq >= 0 ? body.seq : 0);
      q.roomTrim.run(projectId, projectId, ROOM_MAX);
    })();
    return { ok: true, saved };
  }
  /** The last `limit` messages of each project's room, oldest first. */
  function loadRooms(limit = 200) {
    const out = {};
    for (const s of q.roomStates.all()) {
      const rows = q.roomLast.all(s.projectId, limit).reverse();
      out[s.projectId] = { seq: Math.max(s.seq, ...rows.map(r => r.seq)), messages: rows.map(r => JSON.parse(r.data)) };
    }
    return out;
  }

  /* ---------- chats (feature co-writing, agent chat, Agent Teams) ---------- */
  function saveChat(kind, key, body) {
    if (!CHAT_KEY_RE[kind]) throw bad('Tipo de conversa inválido.');
    if (!CHAT_KEY_RE[kind].test(key)) throw bad('Conversa inválida.');
    const data = body?.data;
    if (!isObj(data) || !Array.isArray(data.messages)) throw bad('Conversa sem mensagens.');
    const text = JSON.stringify(data.messages.length > CHAT_MAX ? { ...data, messages: data.messages.slice(-CHAT_MAX) } : data);
    if (text.length > 8 * 1024 * 1024) throw bad('Conversa grande demais.', 413);
    const projectId = typeof body.projectId === 'string' && REF_RE.test(body.projectId) ? body.projectId : kind === 'doc' ? key.split(':')[0] : null;
    q.chatUpsert.run(kind, key, projectId, kind === 'doc' ? projectId : key, nowISO(), text);
    return { ok: true };
  }
  function deleteChat(kind, key) { q.chatDelete.run(kind, key); return { ok: true }; }
  function loadChats() {
    const out = { feature: {}, agent: {}, doc: {} };
    for (const r of q.chatAll.all()) if (out[r.kind]) { try { out[r.kind][r.key] = JSON.parse(r.data); } catch {} }
    return out;
  }
  /** Chats and rooms of features, agents or projects that no longer exist (outside the workspace sync, so restoring a version
      brings them back until the next start). */
  function sweep() {
    if (!q.root.get()) return;
    db.transaction(() => {
      db.prepare(`DELETE FROM chats WHERE (kind = 'feature' AND ref_id NOT IN (SELECT key FROM features)) OR (kind = 'agent' AND ref_id NOT IN (SELECT key FROM agents)) OR (kind = 'doc' AND project_id NOT IN (SELECT key FROM projects))`).run();
      db.prepare('DELETE FROM room_messages WHERE project_id NOT IN (SELECT key FROM projects)').run();
      db.prepare('DELETE FROM room_state WHERE project_id NOT IN (SELECT key FROM projects)').run();
    })();
  }

  /* ---------- run history ---------- */
  function insertRun(r) { q.runInsert.run({ id: r.id, status: r.status, label: r.label, kind: r.meta.kind, project: r.project || null, projectId: r.meta.projectId, agentId: r.meta.agentId, featureId: r.meta.featureId, cwd: r.cwd, startedAt: r.startedAt, args: JSON.stringify(r.args), profileId: r.profileId || null, adapter: r.adapter || null, model: r.model || null, parentRunId: r.parentRunId || null }); }
  const appendRunEvents = db.transaction((runId, events) => { for (const e of events) q.runEvent.run(runId, e.seq, e.type, e.data); if (events.length) q.runCount.run(events.at(-1).seq, runId); });
  const num = v => Number.isFinite(v) ? Math.round(v) : null;
  /** Adds a finished run (its row in runs) to the daily usage; done once per run, at finishRun or interruptRuns. */
  function addUsage(row, costUsd) {
    if (!row) return;
    q.usageAdd.run({ day: String(row.started_at).slice(0, 10), profileId: row.profile_id || '', agentId: row.agent_id || '', projectId: row.project_id || '', input: row.input_tokens || 0, cacheRead: row.cache_read_tokens || 0, cacheWrite: row.cache_write_tokens || 0, output: row.output_tokens || 0, reasoning: row.reasoning_tokens || 0, costUsd: Number.isFinite(costUsd) ? costUsd : 0 });
  }
  function finishRun(r, exit) {
    db.transaction(() => {
      q.runFinish.run({ id: r.id, status: r.status, endedAt: r.endedAt, result: JSON.stringify(exit).slice(0, 40000), costUsd: exit.costUsd ?? null, durationMs: exit.durationMs ?? null, sessionId: exit.sessionId ?? null });
      const u = exit.usage || {};
      q.runUsage.run({ id: r.id, model: exit.model || null, input: num(u.input), cacheRead: num(u.cacheRead), cacheWrite: num(u.cacheWrite), output: num(u.output), reasoning: num(u.reasoning) });
      if (r.meta?.kind !== 'probe') addUsage(q.runGet.get(r.id), exit.costUsd);
    })();
  }
  const summary = r => r && { id: r.id, status: r.status, label: r.label || '', kind: r.kind, project: r.project, projectId: r.project_id, agentId: r.agent_id, featureId: r.feature_id, cwd: r.cwd, startedAt: r.started_at, endedAt: r.ended_at, costUsd: r.cost_usd, durationMs: r.duration_ms, sessionId: r.session_id, events: r.events,
    profileId: r.profile_id ?? null, adapter: r.adapter ?? null, model: r.model ?? null, parentRunId: r.parent_run_id ?? null,
    usage: r.input_tokens == null && r.output_tokens == null ? null : { input: r.input_tokens, cacheRead: r.cache_read_tokens, cacheWrite: r.cache_write_tokens, output: r.output_tokens, reasoning: r.reasoning_tokens } };
  /** Token sums of the app's runs (probes left out) grouped by profile, agent, project or day, from usage_daily (it outlives the
      run history). Day granularity (UTC days of the run start): `from` takes its day, `to` is exclusive (a mid-day `to` keeps its day). */
  function usage({ from = '', to = '', by = 'profile' } = {}) {
    const col = { profile: 'profile_id', agent: 'agent_id', project: 'project_id', day: 'day' }[by];
    if (!col) throw bad('Agrupamento inválido. Use profile, agent, project ou day.');
    const fromDay = from ? from.slice(0, 10) : '0000';
    let toDay = '9999';
    if (to) { toDay = to.slice(0, 10); if (!/T00:00:00(\.0+)?Z$/.test(to)) toDay = new Date(Date.parse(toDay + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10); }
    const label = by === 'profile' ? '(SELECT name FROM profiles WHERE id = usage_daily.profile_id)' : 'NULL';
    const rows = db.prepare(`SELECT ${col} AS key, ${label} AS label, sum(runs) AS runs, sum(input_tokens) AS input, sum(cache_read_tokens) AS cacheRead, sum(cache_write_tokens) AS cacheWrite, sum(output_tokens) AS output, sum(reasoning_tokens) AS reasoning, sum(cost_usd) AS costUsd
      FROM usage_daily WHERE day >= ? AND day < ? GROUP BY key ORDER BY key`).all(fromDay, toDay);
    return rows.map(r => { if (r.label == null) delete r.label; if (r.key === '') r.key = null; return r; });
  }
  function listRuns({ projectId = '', limit = 50 } = {}) {
    const n = Math.min(Math.max(Number(limit) || 50, 1), KEEP_RUNS);
    const rows = projectId ? db.prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT ?').all(projectId, n) : db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?').all(n);
    return rows.map(summary);
  }
  function getRun(id) { const r = q.runGet.get(id); if (!r) return null; let result = null; try { result = r.result ? JSON.parse(r.result) : null; } catch {} return { run: summary(r), result }; }
  const runEvents = id => q.runEvents.all(id).map(d => JSON.parse(d));
  /** Runs left 'running' by a bridge that died (Windows kills skip the shutdown) get a closing exit event, which the page needs. */
  function interruptRuns() {
    const left = db.prepare("SELECT id FROM runs WHERE status = 'running'").pluck().all();
    db.transaction(() => {
      for (const id of left) {
        const exit = { type: 'exit', status: 'interrupted', code: null, isError: true, result: '', costUsd: null, durationMs: null, numTurns: null, sessionId: null, error: 'O bridge foi encerrado durante a execução.' };
        const seq = q.runLastSeq.get(id) + 1;
        q.runEvent.run(id, seq, 'exit', JSON.stringify(exit)); q.runCount.run(seq, id);
        q.runFinish.run({ id, status: 'interrupted', endedAt: nowISO(), result: JSON.stringify(exit), costUsd: null, durationMs: null, sessionId: null });
        const row = q.runGet.get(id);
        if (row && row.kind !== 'probe') addUsage(row, null);
      }
      q.runPrune.run();
    })();
    return left.length;
  }

  /* ---------- Perfis (profiles) ---------- */
  const profileOut = r => {
    if (!r) return null;
    let telemetry = TELEMETRY_OFF; try { telemetry = { ...TELEMETRY_OFF, ...JSON.parse(r.telemetry || '{}') }; } catch {}
    return { id: r.id, name: r.name, adapter: r.adapter, bin: r.bin || '', configDir: r.config_dir || '', model: r.model || '', effort: r.effort || '', concurrency: r.concurrency, fallbackId: r.fallback_id || '', threshold: r.threshold, ignoreUserConfig: !!r.ignore_user_config, telemetry, isDefault: !!r.is_default };
  };
  const profileRow = (p, at = nowISO()) => ({ id: p.id, name: p.name, adapter: p.adapter, bin: p.bin || '', configDir: p.configDir || '', model: p.model || '', effort: p.effort || '', concurrency: p.concurrency, fallbackId: p.fallbackId || null, threshold: p.threshold, ignoreUserConfig: p.ignoreUserConfig ? 1 : 0, telemetry: JSON.stringify({ ...TELEMETRY_OFF, ...p.telemetry }), at });
  const listProfiles = () => q.profAll.all().map(profileOut);
  const getProfile = id => profileOut(q.profGet.get(String(id || '')));
  const defaultProfile = () => profileOut(q.profDefault.get());
  const nameTaken = e => e?.code === 'SQLITE_CONSTRAINT_UNIQUE' ? bad('Já existe um Perfil com esse nome.', 409) : e;
  /** `p` comes validated from the bridge (validateProfile). */
  function createProfile(p) {
    const id = p.id || 'pf-' + crypto.randomBytes(5).toString('hex');
    try { q.profInsert.run(profileRow({ ...p, id })); } catch (e) { throw nameTaken(e); }
    return getProfile(id);
  }
  function updateProfile(id, p) {
    try { q.profUpdate.run(profileRow({ ...p, id })); } catch (e) { throw nameTaken(e); }
    return getProfile(id);
  }
  /** The default Perfil cannot be deleted; reserves that pointed to the removed one are cleared. */
  function deleteProfile(id) {
    const p = getProfile(id);
    if (!p) throw bad('Perfil não encontrado.', 404);
    if (p.isDefault) throw bad('O Perfil padrão não pode ser excluído. Torne outro Perfil padrão antes.', 409);
    db.transaction(() => { q.profUnfallback.run(id); q.winDelete.run(id); q.profDelete.run(id); })();
    return { ok: true };
  }
  function setDefaultProfile(id) {
    if (!getProfile(id)) throw bad('Perfil não encontrado.', 404);
    db.transaction(() => { q.profClearDefault.run(); q.profSetDefault.run(id); })();
    return getProfile(id);
  }
  /** Creates "Codex (padrão)" once per database (the bridge calls it when codex is on the PATH); a deleted one stays deleted. */
  function ensureCodexDefault() {
    if (q.metaGet.get('codexDefault')) return null;
    let made = null;
    db.transaction(() => {
      setMeta('codexDefault', nowISO());
      if (q.profGet.get(DEFAULT_PROFILE_IDS.codex) || listProfiles().some(p => p.name === 'Codex (padrão)')) return;
      q.profInsert.run(profileRow({ id: DEFAULT_PROFILE_IDS.codex, name: 'Codex (padrão)', adapter: 'codex', concurrency: 2, threshold: 90, ignoreUserConfig: true, telemetry: TELEMETRY_OFF }));
      made = getProfile(DEFAULT_PROFILE_IDS.codex);
    })();
    return made;
  }
  /** Usage windows: {five_hour: {utilization 0..1, resetsAt ISO}, seven_day: {...}} as observed now. */
  function saveWindows(profileId, windows) {
    const at = nowISO();
    db.transaction(() => {
      for (const w of WINDOWS) {
        const v = windows?.[w];
        if (v && Number.isFinite(v.utilization)) q.winUpsert.run(profileId, w, Math.min(Math.max(v.utilization, 0), 10), v.resetsAt || null, at);
      }
    })();
  }
  function windowsOf(profileId) {
    const out = {};
    for (const r of q.winOf.all(profileId)) out[r.window] = { utilization: r.utilization, resetsAt: r.resetsAt, observedAt: r.observedAt };
    return out;
  }
  const getSetting = key => { const v = q.setGet.get(key); if (v == null) return null; try { return JSON.parse(v); } catch { return null; } };
  const setSetting = (key, value) => q.setSet.run(key, JSON.stringify(value));

  const migration = migrateLegacy();
  const interrupted = interruptRuns();
  sweep();
  return {
    file, migration, interrupted, runMeta,
    syncWorkspace, readWorkspace, backupWorkspace, listSnapshots, getSnapshot,
    saveRoom, loadRooms, saveChat, deleteChat, loadChats, sweep,
    insertRun, appendRunEvents, finishRun, listRuns, getRun, runEvents, usage,
    listProfiles, getProfile, defaultProfile, createProfile, updateProfile, deleteProfile, setDefaultProfile, ensureCodexDefault, saveWindows, windowsOf,
    getSetting, setSetting,
    close: () => db.close(),
  };
}

// driverError: why better-sqlite3 did not load ('' when it did); the bridge checks it at start, before any database exists.
module.exports = { openStore, hash, checkWorkspace, runMeta, driverError, ADAPTERS, WINDOWS, DEFAULT_PROFILE_IDS, TELEMETRY_OFF };
