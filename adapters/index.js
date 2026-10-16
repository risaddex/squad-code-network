'use strict';
/*
 * Registry of Adapters (ADR 0004, docs/plans/plugins.md). server.js asks it for everything that depends on the engine behind a Perfil
 * (executable, models and levels, argv, event translation, usage windows, settings.json), so no engine name is hard-coded there.
 * Every Adapter module is `module.exports = host => adapter`; `host` is what the bridge lends it (paths, helpers, recordWindows).
 * The built-ins (claude, codex) are loaded here; others come through register() (plugins), which returns the undo function.
 */
const BUILTIN = ['claude', 'codex'];
const KIND_RE = /^[a-z][a-z0-9-]{0,39}$/;
const COLLEAGUES = ['native', 'mcp', 'none'];
const REQUIRED_FNS = ['defaultBin', 'notFound', 'catalog', 'resolveModelEffort', 'prepare', 'finish', 'refreshWindows'];
const OPTIONAL_FNS = ['home', 'profileExtras', 'status', 'validateProfile', 'validateLaunch', 'nativeTelemetry', 'onEvent', 'settingsFile', 'prepareRemote'];

/** Throws a message naming the first thing wrong with an Adapter implementation. */
function validateAdapter(impl) {
  if (!impl || typeof impl !== 'object' || Array.isArray(impl)) throw new Error('Adapter inválido: esperado um objeto.');
  if (typeof impl.kind !== 'string' || !KIND_RE.test(impl.kind)) throw new Error('Adapter inválido: "kind" deve ser texto em minúsculas (a-z, 0-9 e hífen, até 40 caracteres).');
  const at = `Adapter ${impl.kind} inválido`;
  if (typeof impl.label !== 'string' || !impl.label.trim()) throw new Error(`${at}: "label" deve ser um texto.`);
  if (!Array.isArray(impl.efforts) || !impl.efforts.every(e => typeof e === 'string' && e)) throw new Error(`${at}: "efforts" deve ser uma lista de textos.`);
  if (typeof impl.genAiSystem !== 'string' || !impl.genAiSystem) throw new Error(`${at}: "genAiSystem" deve ser um texto.`);
  if (!COLLEAGUES.includes(impl.colleagues)) throw new Error(`${at}: "colleagues" deve ser ${COLLEAGUES.join(', ')}.`);
  if (impl.executionMode !== undefined && !['local', 'remote'].includes(impl.executionMode)) throw new Error(`${at}: executionMode inválido.`);
  const required = impl.executionMode === 'remote' ? ['catalog', 'status', 'startRemote', 'resumeRemote'] : REQUIRED_FNS;
  for (const f of required) if (typeof impl[f] !== 'function') throw new Error(`${at}: "${f}" deve ser uma função.`);
  for (const f of OPTIONAL_FNS) if (impl[f] !== undefined && typeof impl[f] !== 'function') throw new Error(`${at}: "${f}", quando existe, deve ser uma função.`);
}

function createRegistry(host) {
  const map = new Map(); // insertion order = display order (built-ins first)
  const builtinKinds = [];
  function add(impl, builtin, override, extra = {}) {
    validateAdapter(impl);
    if (map.has(impl.kind) && override !== true) throw new Error(`Adapter ${impl.kind} já registrado (use override para substituí-lo).`);
    // `builtin` marks what shipped with the bridge: an override of a built-in is not one, though builtinKinds() still lists the kind.
    const prev = map.get(impl.kind), entry = { ...impl, builtin, source: builtin ? 'builtin' : (typeof extra.source === 'string' ? extra.source : 'plugin'), envNames: builtin ? [] : [...(extra.env || [])] };
    map.set(impl.kind, entry);
    // undo (a plugin's registration that has to be taken back): the kind goes away, or the entry it replaced (a built-in) comes back.
    // Does nothing when something else has been registered over this entry since.
    return () => { if (map.get(impl.kind) !== entry) return; if (prev) map.set(impl.kind, prev); else map.delete(impl.kind); };
  }
  for (const kind of BUILTIN) { add(require(`./${kind}.js`)(host), true, false); builtinKinds.push(kind); }
  return {
    register: (impl, { override = false, source, env } = {}) => add(impl, false, override, { source, env }),
    get: kind => map.get(kind) || null,
    has: kind => map.has(kind),
    kinds: () => [...map.keys()],
    builtinKinds: () => [...builtinKinds],
  };
}

module.exports = { createRegistry, validateAdapter, BUILTIN };
