'use strict';
/*
 * Host of the plugins with code (ADR 0004, docs/plans/plugins.md). Plugins run in the bridge's process with the person's permissions
 * (not a sandbox): `capabilities` in the manifest + `grants` in the LOCAL configuration are auditable consent, not containment.
 *
 *  - Discovery and order are plugins.js' (the same list as the content plugins, docs/plans/plugins-conteudo.md): one manifest,
 *    squad-plugin.json, may bring content, code (`server`) or both. Nothing is imported there.
 *  - createPluginHost(): after the port is ours (server.js listen callback) imports the enabled `server` plugins in order and calls
 *    register(ctx). An error in one plugin never reaches the others or the core: its registrations are undone and dependents are off.
 *    Routes live under /api/plugins/<id>/ and are served by the core's handle() after token, Host and Origin checks.
 *  - Events: observers (run:start, run:event, run:finish, profile:usage, workspace:saved) are read-only: a queue per plugin drained by
 *    setImmediate, a time limit per handler, a circuit breaker after 20 failures in a row. run:beforeSpawn is the one hook that can
 *    change a run (veto, appendSystem); handlers run in series within a total budget, fail-open unless the plugin is failClosed.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { orderPlugins, CONSTANTS, API_VERSION } = require('./plugins.js');
const { validate: schemaValidate } = require('./schema.js');

const SETTINGS_MAX = 16 * 1024;
const DISPOSE_MS = 1000;
const QUEUE_MAX = 1000;       // pending events per plugin; past it the oldest is dropped (and counted)
const BREAKER_AT = 20;        // consecutive failures of one handler that silence it
const LOG_FAILS = 3;          // failures of a handler logged before it goes quiet
const SPAWN_BUDGET_MS = 5000; // all the run:beforeSpawn handlers of one run together
const APPEND_MAX = 20000;     // appendSystem, per plugin
const CONTENT_KEYS = ['prompt', 'systemPrompt']; // only for plugins granted run.content (S-L9)
const SEGMENT_RE = /^(?:(?!\.{1,2}$)[A-Za-z0-9._~-]+|:[A-Za-z_][A-Za-z0-9_]*)$/;
const RESERVED_PARAMS = ['__proto__', 'constructor', 'prototype'];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

/* ---------- host ---------- */
/** Rejects after `ms` with `message`; the timer never keeps the process alive. */
function withTimeout(promise, ms, message) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); timer.unref?.(); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}
function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) deepFreeze(v[k]); }
  return v;
}
/**
 * run:event for a plugin without run.content: a projection by whitelist, never the text, inputs, results, stderr, raw lines, args or cwd.
 * tool_use keeps only the tool's name, tool_result only whether it failed and its size in bytes, exit the outcome and the counters.
 */
function projectRunEvent(p) {
  const e = p.event && typeof p.event === 'object' ? p.event : {};
  const out = { runId: p.runId, seq: p.seq, at: p.at, type: typeof e.type === 'string' ? e.type : '', subtype: typeof e.subtype === 'string' ? e.subtype : null, parentToolUseId: typeof e.parent_tool_use_id === 'string' ? e.parent_tool_use_id : null };
  const blocks = Array.isArray(e.message?.content) ? e.message.content : [];
  const use = blocks.find(b => b?.type === 'tool_use');
  if (use) out.toolName = String(use.name ?? '').slice(0, 100);
  if (e.type === 'user') {
    const results = blocks.filter(b => b?.type === 'tool_result');
    if (results.length) { out.isError = results.some(b => b.is_error === true); out.bytes = results.reduce((n, b) => n + Buffer.byteLength(typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? ''), 'utf8'), 0); }
  }
  if (e.type === 'exit') Object.assign(out, { status: e.status ?? null, code: e.code ?? null, isError: !!e.isError, costUsd: e.costUsd ?? null, numTurns: e.numTurns ?? null, usage: e.usage ?? null });
  return out;
}
/** run:finish without run.content: the error is only a code (the text may quote the agent's output) and there is no sessionId. */
function stripFinish(p) {
  const out = withoutContent(p);
  const copy = { ...out, error: p.errorCode ?? null };
  delete copy.errorCode; delete copy.sessionId;
  return copy;
}
const STRIP = { 'run:event': projectRunEvent, 'run:finish': stripFinish };
/** The payload without the fields that need run.content (the same object when it has none). */
function withoutContent(p) {
  if (!CONTENT_KEYS.some(k => k in p)) return p;
  const copy = { ...p };
  for (const k of CONTENT_KEYS) delete copy[k];
  return copy;
}
const denied = (cap, raw) => Object.assign(new Error(raw ? cap : `Capacidade "${cap}" não concedida`), { denied: true });

const hashCache = new Map(); // file → { key: size:mtime, hash }
/** sha1 of a plugin's server file (re-read only when its size or mtime changed). */
function fileHash(file) {
  try {
    const st = fs.statSync(file), key = `${st.size}:${st.mtimeMs}`, hit = hashCache.get(file);
    if (hit && hit.key === key) return hit.hash;
    const hash = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
    hashCache.set(file, { key, hash });
    return hash;
  } catch { return ''; }
}
/** A signature of the plugins with code discovery found and of what the configuration says, to tell when a restart is needed (content is reread live). */
function signature(disc) {
  const cfg = disc.config || {};
  // The code (hash of the server file) and every manifest field that changes how it loads count: a restart is needed when they move.
  const items = disc.plugins.filter(p => p.hasCode).map(p => [p.id, p.dir, p.source, p.local, p.status || '', p.manifest.version, p.manifest.apiVersion, p.manifest.server, p.manifest.requires, p.manifest.capabilities, p.manifest.env, p.manifest.configSchema, p.serverFile ? fileHash(p.serverFile) : '']);
  return crypto.createHash('sha1').update(JSON.stringify([items, cfg.enabled || [], cfg.entries || {}, cfg.hookTimeoutMs || 0])).digest('hex');
}

/**
 * createPluginHost({ getDiscovery, dataRoot, http: { readBody, json, fail }, maxBody, env, registry? }) → host.
 * getDiscovery() → { plugins, config, warnings }: the `discovery` of plugins.js' load() (cached; rereads when a file changed). The first
 * call is the start's snapshot: the code that runs is that list, and view().restartRequired says when the files no longer match it.
 * host.pending is true from load() until every plugin has been tried; host.ready is the promise to await meanwhile.
 * getRegistry() → the Adapter registry (adapters/index.js), for ctx.registerAdapter.
 */
function createPluginHost({ getDiscovery, dataRoot, http, maxBody, env = process.env, log = console, getRegistry = null }) {
  const start = getDiscovery();
  const startSig = signature(start);
  const cfg = start.config || { enabled: [], entries: {}, hookTimeoutMs: CONSTANTS.PLUGIN_HOOK_TIMEOUT_MS };
  const registerMs = Number(env.SQUAD_PLUGIN_REGISTER_TIMEOUT_MS) || 10000;
  const budgetMs = Number(env.SQUAD_PLUGIN_LOAD_BUDGET_MS) || 30000; // all the register() calls together
  const hookMs = Number(env.SQUAD_PLUGIN_HOOK_TIMEOUT_MS) || cfg.hookTimeoutMs || CONSTANTS.PLUGIN_HOOK_TIMEOUT_MS; // one event handler / one beforeSpawn handler
  const spawnBudgetMs = Number(env.SQUAD_PLUGIN_BEFORESPAWN_BUDGET_MS) || SPAWN_BUDGET_MS;
  const byEvent = new Map(); // event → [handler] of the plugins that are loaded, in plugin order
  const recs = new Map();  // key (the id, or id@folder for a second folder with the same id) → record
  const byId = new Map();  // id → the record that answers to it (the one that is not refused, else the first)
  let order = [];
  const host = { pending: false, closing: false, ready: Promise.resolve() };

  const enabled = new Set(cfg.enabled || []);
  function recordOf(p) {
    const entry = (cfg.entries || {})[p.id] || {};
    const asked = p.manifest.capabilities;
    const granted = asked.filter(c => (entry.grants || []).includes(c));
    return {
      ...p, status: p.status || (p.hasCode ? 'disabled' : 'data'), error: p.error || '',
      entry, caps: { asked, granted, missing: asked.filter(c => !granted.includes(c)) },
      routes: [], events: [], adapters: [], undoAdapters: [], overrides: [], disposers: [], api: undefined, ctx: null, frozen: false, queue: null,
    };
  }
  for (const p of start.plugins) {
    const r = recordOf(p);
    recs.set(p.key || p.id, r);
    const cur = byId.get(p.id);
    if (!cur || (cur.refused && !p.status)) byId.set(p.id, r);
    r.refused = !!p.status && p.status !== 'disabled';
    r.off = p.status === 'disabled'; // switched off by discovery (plugins.disabled, or a content plugin whose requires is not met)
  }
  const primary = [...byId.values()].filter(r => !r.refused);
  const plan = orderPlugins(primary.map(r => ({ id: r.id, requires: r.manifest.requires, enabled: r.off ? false : !r.hasCode || enabled.has(r.id) })));
  order = plan.order;
  for (const d of plan.disabled) { const r = byId.get(d.id); r.status = 'disabled'; r.error = d.reason === 'off' ? r.error : d.message; }
  for (const id of order) { const r = byId.get(id); if (r.hasCode) r.status = 'pending'; }
  for (const msg of plan.warnings) log.warn(`Plugins: ${msg}`);
  const planWarnings = plan.warnings;
  
  const all = () => [...recs.values()];
  const hasDisposers = () => host.pending || all().some(r => r.disposers.length);

  function unsubscribe(r) {
    for (const [event, list] of byEvent) { const keep = list.filter(h => h.r !== r); if (keep.length) byEvent.set(event, keep); else byEvent.delete(event); }
    if (r.queue) r.queue.items.length = 0;
  }
  function undo(r) {
    unsubscribe(r);
    // The Adapters it registered go away (a built-in it replaced comes back), the newest first.
    for (const fn of r.undoAdapters.reverse()) { try { fn(); } catch (e) { log.warn(`[plugin ${r.id}] não foi possível desfazer um Adapter: ${e.message}`); } }
    r.undoAdapters = []; r.overrides = [];
    r.routes = []; r.events = []; r.adapters = [];
    const fns = r.disposers; r.disposers = [];
    return Promise.allSettled(fns.map(fn => withTimeout(Promise.resolve().then(fn), DISPOSE_MS, 'onDispose passou de 1 s')));
  }

  function makeCtx(r) {
    const id = r.id, granted = new Set(r.caps.granted);
    const need = cap => { if (!granted.has(cap)) throw denied(cap); };
    const open = what => { if (r.frozen) throw new Error(`O ctx do plugin "${id}" está congelado: ${what} só vale durante register().`); };
    let settings;
    const lg = (level, args) => log[level](`[plugin ${id}]`, ...args);
    const logFn = (...args) => lg('log', args);
    logFn.warn = (...args) => lg('warn', args); logFn.error = (...args) => lg('error', args);
    const ctx = {
      id, apiVersion: API_VERSION, log: logFn,
      registerRoute(method, subpath, handler) {
        open('registerRoute');
        method = String(method).toUpperCase();
        if (!METHODS.includes(method)) throw new Error(`Método ${String(method).slice(0, 20)} não aceito (use ${METHODS.join(', ')}).`);
        if (typeof handler !== 'function') throw new Error('registerRoute: o handler deve ser uma função.');
        if (typeof subpath !== 'string' || !subpath.startsWith('/') || subpath.length > 200) throw new Error('registerRoute: o subcaminho deve começar com "/".');
        const segs = subpath === '/' ? [] : subpath.slice(1).split('/');
        if (!segs.every(s => SEGMENT_RE.test(s))) throw new Error(`registerRoute: subcaminho inválido (${subpath.slice(0, 80)}); use segmentos de letras, números, ponto, hífen e _ ou :param.`);
        const names = segs.filter(s => s[0] === ':').map(s => s.slice(1));
        if (names.some(n => RESERVED_PARAMS.includes(n))) throw new Error(`registerRoute: nome de :param reservado (${RESERVED_PARAMS.join(', ')}).`);
        if (new Set(names).size !== names.length) throw new Error('registerRoute: nome de :param repetido.');
        const key = `${method} /${segs.map(s => (s[0] === ':' ? ':' : s)).join('/')}`;
        if (r.routes.some(x => x.key === key)) throw new Error(`Rota ${method} ${subpath} já registrada.`);
        r.routes.push({ key, method, segs, label: `${method} /api/plugins/${id}${subpath === '/' ? '/' : subpath}`, handler });
      },
      on(event, fn, opts) {
        open('on');
        if (!CONSTANTS.PLUGIN_EVENTS.includes(event)) throw new Error(`Evento desconhecido: ${String(event).slice(0, 40)} (use ${CONSTANTS.PLUGIN_EVENTS.join(', ')}).`);
        if (typeof fn !== 'function') throw new Error('on: o handler deve ser uma função.');
        if (event === 'run:beforeSpawn') need('run.mutate');
        if (opts?.partial === true) need('run.content'); // stream_event carries the text as it is written
        // partial: true takes the stream_event lines too (run:event only). Failures and drops are counted per handler.
        r.events.push({ r, event, fn, partial: opts?.partial === true, fails: 0, tripped: false, dropped: 0 });
      },
      registerAdapter(kind, impl) {
        open('registerAdapter');
        need('adapter');
        const registry = getRegistry?.();
        if (!registry) throw new Error('registerAdapter: o registro de Adapters não está disponível.');
        if (typeof kind !== 'string' || !impl || typeof impl !== 'object' || impl.kind !== kind) throw new Error(`registerAdapter: o kind "${String(kind).slice(0, 40)}" deve ser igual ao "kind" do Adapter.`);
        // Replacing claude or codex is a separate grant; anything else already registered (by another plugin) is refused by the registry.
        const builtin = registry.builtinKinds().includes(kind);
        if (builtin) {
          need('adapter.override');
          // Only what shipped with the bridge can be replaced: a second override (another plugin, or a repeat) is refused as a denial.
          const cur = registry.get(kind);
          if (cur && cur.builtin === false) throw denied(`adapter.override: o Adapter "${kind}" já foi substituído (${cur.source}); só o embutido pode ser sobrescrito`, true);
        }
        r.undoAdapters.push(registry.register(impl, { override: builtin, source: `plugin:${id}`, env: r.manifest.env }));
        r.adapters.push(kind);
        if (builtin) r.overrides.push(kind);
      },
      settings() { return settings; },
      dataDir() { const dir = path.join(dataRoot, 'plugins', id); fs.mkdirSync(dir, { recursive: true }); return dir; },
      secret(name) {
        if (!r.manifest.env.includes(name)) throw new Error(`Variável "${String(name).slice(0, 60)}" não declarada em "env" do manifesto do plugin "${id}".`);
        return env[name];
      },
      onDispose(fn) { open('onDispose'); if (typeof fn !== 'function') throw new Error('onDispose: esperado uma função.'); r.disposers.push(fn); },
      hasCapability: cap => granted.has(cap),
      use(other) {
        if (!r.manifest.requires.includes(other)) throw new Error(`O plugin "${id}" não declara "${other}" em requires.`);
        const dep = byId.get(other);
        if (!dep || (dep.status !== 'active' && dep.status !== 'data')) throw new Error(`O plugin "${other}" não está ativo.`);
        return dep.api;
      },
      http: Object.freeze({ readBody: (req, limit = maxBody) => http.readBody(req, limit), json: http.json, fail: http.fail }),
    };
    return { ctx, setSettings: s => { settings = s; } };
  }

  // settings: a frozen copy of plugins.entries.<id>.settings, within 16 KB and valid for the manifest's configSchema. The messages
  // name the field and the rule, never the value (settings may hold tokens).
  function readSettings(r) {
    const raw = r.entry.settings ?? {};
    const text = JSON.stringify(raw);
    if (text.length > SETTINGS_MAX) throw new Error(`settings inválidas: passam de ${SETTINGS_MAX / 1024} KB`);
    if (r.manifest.configSchema) {
      checkSchemaLimits(r.manifest.configSchema);
      let errs;
      try { errs = schemaValidate(r.manifest.configSchema, raw); } catch (e) { throw new Error(`configSchema não pôde ser aplicado: ${e.message}`); }
      if (errs.length) throw new Error(`settings inválidas: ${errs.slice(0, 5).map(e => `${e.path || '(raiz)'}: ${['enum', 'pattern', 'const'].includes(e.keyword) ? `fora de ${e.keyword}` : e.message}`).join('; ')}`);
    }
    return deepFreeze(JSON.parse(text));
  }

  async function loadOne(r, deadline) {
    const fail = (status, e) => { r.status = status; r.error = e.message || String(e); return undo(r); };
    for (const dep of r.manifest.requires) {
      const d = byId.get(dep);
      if (!d || (d.status !== 'active' && d.status !== 'data')) { r.status = 'disabled'; r.error = `depende de "${dep}", que não carregou (${d ? d.status : 'ausente'})`; return; }
    }
    const left = deadline - Date.now();
    if (left <= 0) { await fail('error', new Error('tempo total de carga esgotado')); log.warn(`Plugin ${r.id}: ${r.error}`); return; }
    r.status = 'loading';
    let made;
    try {
      made = makeCtx(r);
      made.setSettings(readSettings(r));
    } catch (e) { await fail('error', e); log.warn(`Plugin ${r.id}: ${r.error}`); return; }
    r.ctx = made.ctx;
    const ms = Math.min(registerMs, left);
    try {
      await withTimeout((async () => {
        const mod = await import(pathToFileURL(r.serverFile).href);
        // A module with a slow top-level await can come back after the time ran out (or the bridge started closing): never call register then.
        if (r.frozen || host.closing) throw new Error('o import terminou depois do tempo limite ou do encerramento; register() não foi chamado');
        const reg = mod.register ?? mod.default?.register ?? mod.default;
        if (typeof reg !== 'function') throw new Error('o módulo não exporta register(ctx)');
        r.api = await reg.call(mod.register ? mod : mod.default?.register ? mod.default : undefined, made.ctx);
      })(), ms, left < registerMs ? 'tempo total de carga esgotado' : `register não terminou em ${Math.round(registerMs / 100) / 10} s (tempo limite)`);
      r.frozen = true;
      if (host.closing) { await fail('disabled', new Error('bridge encerrando')); r.api = undefined; return; }
      Object.freeze(made.ctx);
      r.status = 'active'; r.error = '';
      for (const kind of r.overrides) log.log(`Adapter "${kind}" substituído pelo plugin ${r.id}.`);
      for (const h of r.events) { const list = byEvent.get(h.event); if (list) list.push(h); else byEvent.set(h.event, [h]); }
    } catch (e) {
      r.frozen = true;
      await fail(e.denied ? 'denied' : 'error', e);
      r.api = undefined;
      log.warn(`Plugin ${r.id}: ${r.error}`);
    }
  }

  host.load = function load() {
    if (host.pending) return host.ready;
    if (!order.some(id => byId.get(id).hasCode)) return host.ready;
    host.pending = true;
    const deadline = Date.now() + budgetMs;
    host.ready = (async () => {
      try {
        // `order` is topological: a plugin without code is checked when its turn comes, before the plugins with code after it load.
        // One that requires a plugin whose register() failed (or timed out) cannot stay as data (its content would reach the page),
        // and a plugin with code that requires it then sees it disabled instead of loading on top of it.
        for (const id of order) {
          const r = byId.get(id);
          if (!r.hasCode) {
            if (r.status !== 'data') continue;
            for (const dep of r.manifest.requires) {
              const d = byId.get(dep);
              if (d && (d.status === 'active' || d.status === 'data')) continue;
              r.status = 'disabled'; r.error = `depende de "${dep}", que não carregou (${d ? d.status : 'ausente'})`; r.depFailed = true;
              log.warn(`Plugin ${r.id}: ${r.error}`);
              break;
            }
            continue;
          }
          if (host.closing) { r.status = 'disabled'; r.error = 'bridge encerrando'; continue; }
          await loadOne(r, deadline);
        }
      } catch (e) { log.warn(`Plugins: ${e.message}`); }
      finally { host.pending = false; }
    })();
    return host.ready;
  };

  /* ---------- events ---------- */
  // Observers are read-only (the payload is shared and frozen at its top level, not cloned) and never slow the run down: emit() only
  // queues, a drain per plugin calls the handlers later (setImmediate), in the order the events came. A queue holds QUEUE_MAX events;
  // past that the oldest goes (counted per handler). A handler gets hookMs; a failure or timeout is logged (the first few), and
  // BREAKER_AT failures in a row open the circuit: that handler is not called again until the next start.
  const logOnce = (h, text) => log.warn(`[plugin ${h.r.id}]`, text);
  function failed(h, e) {
    h.fails++;
    if (h.fails <= LOG_FAILS) logOnce(h, `${h.event}: ${e?.message || e}`);
    if (h.fails >= BREAKER_AT && !h.tripped) { h.tripped = true; logOnce(h, `disjuntor aberto em ${h.event}: ${BREAKER_AT} falhas seguidas; o plugin ${h.r.id} não recebe mais esse evento até o próximo start`); }
  }
  async function drain(r) {
    const q = r.queue;
    try {
      while (q.items.length) {
        const { h, view } = q.items.shift();
        if (h.tripped || r.status !== 'active') continue;
        try {
          const out = h.fn(view);
          if (out && typeof out.then === 'function') await withTimeout(out, hookMs, `passou de ${hookMs} ms (tempo limite)`);
          h.fails = 0;
        } catch (e) { failed(h, e); }
        if (q.items.length) await new Promise(res => setImmediate(res)); // never hog the loop with a long queue
      }
    } finally { q.draining = false; }
  }
  /** Under pressure the first to go is a run:event (a stream_event before any other), then the oldest of what is left. */
  function dropOne(q) {
    const isStream = x => (x.view.event?.type ?? x.view.type) === 'stream_event';
    let i = q.items.findIndex(x => x.h.event === 'run:event' && isStream(x));
    if (i < 0) i = q.items.findIndex(x => x.h.event === 'run:event');
    return q.items.splice(i < 0 ? 0 : i, 1)[0];
  }
  host.listens = event => (byEvent.get(event)?.length || 0) > 0;
  /**
   * emit(event, payload | () => payload): returns at once. A function is only called when someone listens (once for all of them).
   * Each plugin gets its own deep-frozen structuredClone (a live object of the core never reaches a plugin), and without run.content
   * only the projection / the payload without prompt and systemPrompt. Never throws.
   */
  host.emit = function emit(event, payload) {
    const list = byEvent.get(event);
    if (!list || event === 'run:beforeSpawn') return;
    try {
      let built = false;
      const views = new Map();
      for (const h of list) {
        if (h.tripped) continue;
        if (!built) { if (typeof payload === 'function') payload = payload(); built = true; }
        if (event === 'run:event' && !h.partial && payload.event?.type === 'stream_event') continue;
        let view = views.get(h.r);
        if (!view) { view = deepFreeze(structuredClone(h.r.caps.granted.includes('run.content') ? payload : (STRIP[event] || withoutContent)(payload))); views.set(h.r, view); }
        const q = h.r.queue ||= { items: [], draining: false };
        q.items.push({ h, view });
        if (q.items.length > QUEUE_MAX) {
          const old = dropOne(q);
          old.h.dropped++;
          if (old.h.dropped === 1 || old.h.dropped % 1000 === 0) logOnce(old.h, `${old.h.event}: fila cheia (${QUEUE_MAX}); ${old.h.dropped} evento(s) descartado(s)`);
        }
        if (!q.draining) { q.draining = true; setImmediate(() => drain(h.r).catch(e => { q.draining = false; log.warn(`Plugins: drenagem de ${h.r.id} falhou: ${e?.message || e}`); })); }
      }
    } catch (e) { log.warn(`Plugins: emit ${event} falhou: ${e.message}`); }
  };
  const blocked = (r, why) => Object.assign(new Error(`Execução bloqueada pelo plugin ${r.id}: ${String(why).replace(/\s+/g, ' ').slice(0, 300)}`), { status: 403 });
  /**
   * run:beforeSpawn: the handlers of the plugins that asked for run.mutate, one after the other in plugin order, within spawnBudgetMs
   * in all. → { appendSystem, notes: [{plugin, chars, cut}] } (the pieces, up to 20k each, joined by a blank line) or throws a 403: the
   * first veto wins. Each handler gets its own deep-frozen copy of the payload. A handler that throws (reading its answer included) or
   * runs out of time (or of the shared budget) is skipped, unless its plugin is failClosed: then the run is blocked.
   */
  host.beforeSpawn = async function beforeSpawn(payload) {
    const list = byEvent.get('run:beforeSpawn');
    if (!list) return { appendSystem: '', notes: [] };
    const started = performance.now(), pieces = [], notes = [];
    for (const h of list) {
      const r = h.r;
      if (r.status !== 'active') continue;
      const left = spawnBudgetMs - (performance.now() - started);
      const trouble = why => { log.warn(`[plugin ${r.id}]`, `run:beforeSpawn: ${why}`); if (r.entry.failClosed) throw blocked(r, `falhou (${why})`); };
      if (left <= 0) { trouble(`orçamento total de ${spawnBudgetMs} ms esgotado pelos plugins anteriores (tempo limite)`); continue; }
      let block = null, append;
      try {
        const out = h.fn(deepFreeze(structuredClone(r.caps.granted.includes('run.content') ? payload : withoutContent(payload))));
        const ms = Math.min(hookMs, Math.ceil(left));
        const res = out && typeof out.then === 'function' ? await withTimeout(out, ms, `passou de ${ms} ms (tempo limite${ms < hookMs ? ', orçamento total' : ''})`) : out;
        if (res && typeof res === 'object') { // the answer is read here, once: a getter that throws is the plugin's failure
          const b = res.block, reason = res.reason, a = res.appendSystem;
          if (b) block = typeof b === 'string' ? b : (typeof reason === 'string' && reason) || 'sem motivo informado';
          append = a;
        }
      } catch (e) { trouble(e?.message || String(e)); continue; }
      if (block) throw blocked(r, block);
      if (append === undefined) continue;
      if (typeof append !== 'string') { log.warn(`[plugin ${r.id}]`, 'run:beforeSpawn: appendSystem deve ser texto; ignorado'); continue; }
      if (append) { pieces.push(append.slice(0, APPEND_MAX)); notes.push({ plugin: r.id, chars: Math.min(append.length, APPEND_MAX), cut: append.length > APPEND_MAX ? append.length : 0 }); }
    }
    return { appendSystem: pieces.join('\n\n'), notes };
  };

  host.has = id => byId.has(id);
  host.hasDisposers = hasDisposers;
  // Shutdown: stop loading, give a register() in flight a second to end (its registrations are then undone), run every onDispose.
  host.dispose = async function dispose() {
    host.closing = true;
    if (host.pending) await withTimeout(host.ready, DISPOSE_MS, 'carga em andamento').catch(() => {});
    for (const r of all()) if (r.status === 'loading') r.frozen = true;
    await Promise.allSettled(all().map(r => undo(r)));
  };

  // Routes: /api/plugins/<id>/<subpath>. Called by handle() after the token, Host and Origin checks; the core's own routes are never
  // reachable from here, nor these from the core. Slashes are normalized as the core does (`filter(Boolean)`: "//" and a trailing
  // "/" collapse). Returns false only for an id that is not a plugin (the core answers its 404).
  host.route = async function route(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean); // api, plugins, <id>, ...
    const r = byId.get(parts[2]);
    if (!r) return false;
    if (!r.hasCode && r.status === 'data') { http.fail(res, 404, `O plugin "${r.id}" é só de conteúdo e não tem rotas.`); return true; }
    if (r.status !== 'active') { http.fail(res, 404, `O plugin "${r.id}" não está ativo (${r.status}${r.error ? `: ${r.error}` : ''}).`); return true; }
    const segs = parts.slice(3);
    // Among routes that fit, a literal segment beats a :param, compared from the left (/y/:b before /:a/x for /y/x).
    const rank = (a, b) => { for (let i = 0; i < a.segs.length; i++) { const la = a.segs[i][0] !== ':', lb = b.segs[i][0] !== ':'; if (la !== lb) return la ? -1 : 1; } return 0; };
    const match = r.routes.filter(x => x.method === req.method && x.segs.length === segs.length && x.segs.every((s, i) => s[0] === ':' || s === segs[i])).sort(rank)[0];
    if (!match) { http.fail(res, 404, 'Rota do plugin não encontrada.'); return true; }
    try {
      const params = Object.create(null);
      for (const [i, s] of match.segs.entries()) {
        if (s[0] !== ':') continue;
        let v;
        try { v = decodeURIComponent(segs[i]); } catch { http.fail(res, 400, 'Caminho inválido.'); return true; }
        if (/[\\/\0]/.test(v)) { http.fail(res, 400, 'Caminho inválido.'); return true; }
        params[s.slice(1)] = v;
      }
      let bodyP;
      const body = () => (bodyP ||= http.readBody(req, maxBody));
      const out = await match.handler(req, res, { url, params, body, http: r.ctx.http });
      if (res.writableEnded || res.headersSent || out === undefined) return true;
      if (isObj(out) && Number.isInteger(out.status) && out.status >= 100 && out.status <= 599 && 'body' in out) http.json(res, out.status, out.body);
      else http.json(res, 200, out);
    } catch (e) {
      const status = Number.isInteger(e?.status) && e.status >= 400 && e.status <= 599 ? e.status : 500;
      // A plain throw is a 500 with a generic message; the detail goes to the log only. An explicit status is the plugin's (or readBody's) call.
      if (status === 500 && !Number.isInteger(e?.status)) log.warn(`[plugin ${r.id}] ${match.label}: ${e?.stack || e}`);
      if (res.headersSent) { try { res.end(); } catch {} }
      else http.fail(res, status, status === 500 && !Number.isInteger(e?.status) ? 'Erro interno no plugin.' : (e?.message || 'Erro no plugin.'));
    }
    return true;
  };

  const viewOf = r => ({
    id: r.id, name: r.name, version: r.version, description: r.description, path: r.dir, hasCode: r.hasCode, status: r.status, error: r.error,
    source: r.source === 'home' ? 'home' : 'config', requires: [...r.manifest.requires], env: [...r.manifest.env], capabilities: { asked: [...r.caps.asked], granted: [...r.caps.granted], missing: [...r.caps.missing] },
    routes: r.routes.map(x => x.label), events: [...new Set(r.events.map(e => e.event))], adapters: [...r.adapters], warnings: [...r.warnings],
    // observers (only for a plugin with event handlers): one entry per handler, with what the dispatcher counted.
    ...(r.events.some(e => e.event !== 'run:beforeSpawn') ? { observers: r.events.filter(e => e.event !== 'run:beforeSpawn').map(h => ({ event: h.event, dropped: h.dropped, failures: h.fails, tripped: h.tripped })) } : {}),
  });
  host.list = () => all().map(viewOf);
  /**
   * The plugins as the files say now (`now`, plugins.js' discovery): content is live, so a plugin without code is described as found;
   * a plugin with code is the record of what runs (loaded at the start), and one that appeared later stays 'disabled' until a restart
   * (restartRequired). A plugin with code still running that left the files is listed too.
   */
  host.view = (now = getDiscovery()) => {
    const used = new Set();
    const plugins = now.plugins.map(p => {
      const r = recs.get(p.key);
      if (r && r.hasCode && p.hasCode && r.dir === p.dir) { used.add(r); return viewOf(r); }
      // Content is reread live, except one switched off by a requires that failed to load (until the next start).
      if (r && !r.hasCode && !p.hasCode && r.depFailed && r.dir === p.dir && !p.status) return viewOf(r);
      return viewOf(recordOf(p));
    });
    for (const r of all()) if (r.hasCode && !used.has(r) && r.status === 'active') plugins.push(viewOf(r));
    return { plugins, restartRequired: signature(now) !== startSig, warnings: [...new Set([...(now.warnings || []), ...planWarnings])] };
  };
  /** Status of the plugin that answers to `id` among those loaded at the start ('' when there is none). */
  host.statusOf = id => byId.get(id)?.status || '';
  // A plugin without code switched off after the code loaded (its requires failed): its content leaves the page until the next start.
  host.contentBlocked = id => byId.get(id)?.depFailed === true;
  /** Plugins that are doing something: active code plus the content-only ones. */
  host.active = () => all().filter(r => r.status === 'active' || r.status === 'data').length;
  return host;
}

/** configSchema limits, checked before it is applied: a pattern up to 200 characters, anyOf/oneOf up to 16 alternatives, 32 levels. */
function checkSchemaLimits(node, at = 'configSchema', depth = 0) {
  if (depth > 32) throw new Error(`configSchema inválido: mais de 32 níveis em ${at}`);
  if (Array.isArray(node)) { node.forEach((v, i) => checkSchemaLimits(v, `${at}[${i}]`, depth + 1)); return; }
  if (!isObj(node)) return;
  if (typeof node.pattern === 'string' && node.pattern.length > 200) throw new Error(`configSchema inválido: pattern com mais de 200 caracteres em ${at}`);
  for (const kw of ['anyOf', 'oneOf']) if (Array.isArray(node[kw]) && node[kw].length > 16) throw new Error(`configSchema inválido: ${kw} com mais de 16 alternativas em ${at}`);
  for (const [k, v] of Object.entries(node)) checkSchemaLimits(v, `${at}.${k}`, depth + 1);
}

// What the start log and the PLUGINS tab call each status.
const STATUS_PT = { active: 'ativo', data: 'conteúdo', disabled: 'desligado', error: 'erro', denied: 'negado', invalid: 'inválido', blocked: 'bloqueado', pending: 'pendente', loading: 'carregando' };

module.exports = { createPluginHost, orderPlugins, STATUS_PT, API_VERSION };
