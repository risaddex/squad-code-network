'use strict';
/* Built-in Adapter: Codex (`codex exec --json`, prompt on stdin). Its events are translated to the Claude stream-json (ADR 0001); its
   squad colleagues go through the bridge's own MCP server (ADR 0003); its usage windows are read from the session files it writes. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CODEX_MODELS = ['gpt-5.5'];

module.exports = host => {
  const { HOME, HOST, PORT, DEFAULT_CODEX_BIN, MODEL_RE, CODEX_EFFORTS, cut4k } = host;
  const codexHome = p => p?.configDir || process.env.CODEX_HOME || path.join(HOME, '.codex');

  /** Models of the codex account (models_cache.json, written by codex itself), with the reasoning levels each one takes. */
  function codexModels(home) {
    try {
      const file = path.join(home, 'models_cache.json');
      if (fs.lstatSync(file).size > 4 * 1024 * 1024) return null;
      const list = JSON.parse(fs.readFileSync(file, 'utf8')).models;
      const out = {};
      for (const m of Array.isArray(list) ? list : []) {
        if (typeof m?.slug !== 'string' || !MODEL_RE.test(m.slug) || m.visibility === 'hide') continue;
        out[m.slug] = (m.supported_reasoning_levels || []).map(l => l?.effort).filter(e => CODEX_EFFORTS.includes(e));
      }
      return Object.keys(out).length ? out : null;
    } catch { return null; }
  }

  /** model_reasoning_effort for a codex run: `max`/`ultra` only when the model lists it, otherwise `xhigh`. */
  function codexEffort(effort, model, home) {
    if (!effort) return '';
    if (effort !== 'max' && effort !== 'ultra') return effort;
    const levels = model ? codexModels(home)?.[model] : null;
    return levels && levels.includes(effort) ? effort : 'xhigh';
  }

  const CODEX_WRITE_TOOLS = ['Edit', 'Write', 'Bash', 'MultiEdit', 'NotebookEdit'];
  const claudeLike = m => /^(opus|sonnet|haiku|fable|claude|inherit|default)/i.test(m || '');
  /** A folder inside a git repository (codex refuses others without --skip-git-repo-check). Project folders stop at PROJECTS_DIR. */
  function inGitRepo(dir, projectRun) {
    for (let d = dir, i = 0; i < 64; i++) {
      if (fs.existsSync(path.join(d, '.git'))) return true;
      if (projectRun) return false;
      const up = path.dirname(d); if (up === d) return false; d = up;
    }
    return false;
  }

  /** argv of `codex exec --json` (prompt on stdin). Secrets never go here: the MCP token is an env var of the child. */
  function codexArgs(opts, profile, model, effort, warn) {
    const names = opts.tools === null ? null : [...opts.tools, ...opts.allowedTools.map(t => t.replace(/\(.*$/, ''))];
    const write = opts.permissionMode !== 'plan' && (names === null || names.some(t => CODEX_WRITE_TOOLS.includes(t)));
    const args = ['exec', '--json', '-C', opts.cwd, '--sandbox', write ? 'workspace-write' : 'read-only', '-c', 'approval_policy="never"'];
    if (profile.ignoreUserConfig) {
      // Without the person's config.toml, and without the skill/plugin/app catalogs and memories it would still load: an "ok" went
      // from ~20k to ~13k input tokens on codex-cli 0.161 (the login in CODEX_HOME is kept).
      args.push('--ignore-user-config', '-c', 'skills.include_instructions=false', '-c', 'skills.bundled.enabled=false', '-c', 'include_apps_instructions=false',
        '-c', 'features.plugins=false', '-c', 'features.apps=false', '-c', 'features.memories=false');
    }
    if (!inGitRepo(opts.cwd, opts.projectRun)) args.push('--skip-git-repo-check');
    if (model) args.push('-m', model);
    if (effort) args.push('-c', `model_reasoning_effort="${effort}"`);
    for (const d of opts.addDirs) args.push('--add-dir', d);
    if (opts.agents) {
      args.push('-c', `mcp_servers.squad.url="http://${HOST}:${PORT}/mcp"`, '-c', 'mcp_servers.squad.bearer_token_env_var="SQUAD_MCP_TOKEN"', '-c', `mcp_servers.squad.tool_timeout_sec=${opts.timeoutSec + 60}`,
        // With approval_policy="never" codex refuses MCP calls that ask for approval: this one tool is pre-approved.
        '-c', 'mcp_servers.squad.tools.chamar_colega.approval_mode="approve"');
    }
    if (opts.maxBudgetUsd) warn('O Codex não tem orçamento máximo por execução: o limite foi ignorado.');
    return args;
  }

  /** Codex `exec --json` events → Claude stream-json (ADR 0001). feed() returns the events to emit; finish() the closing result. */
  function codexTranslator(run) {
    const st = { threadId: null, last: '', turns: 0, failed: null, lastError: null, started: new Set(), calls: [], usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 } };
    const assistant = content => ({ type: 'assistant', message: { role: 'assistant', content } });
    const isCall = it => it.type === 'mcp_tool_call' && it.server === 'squad' && it.tool === 'chamar_colega';
    const toolUse = it => {
      const base = { type: 'tool_use', id: String(it.id) };
      if (it.type === 'command_execution') return { ...base, name: 'Bash', input: { command: String(it.command ?? '') } };
      if (it.type === 'file_change') return { ...base, name: 'Edit', input: { changes: Array.isArray(it.changes) ? it.changes : [] } };
      if (isCall(it)) { const a = it.arguments || {}, pedido = String(a.pedido ?? ''); return { ...base, name: 'Agent', input: { subagent_type: String(a.agente ?? ''), description: pedido.slice(0, 80), prompt: pedido } }; }
      if (it.type === 'mcp_tool_call') return { ...base, name: `mcp__${it.server}__${it.tool}`, input: it.arguments ?? {} };
      if (it.type === 'web_search') return { ...base, name: 'WebSearch', input: { query: String(it.query ?? '') } };
      return null;
    };
    const toolResult = it => {
      let text = '', isError = it.status === 'failed';
      if (it.type === 'command_execution') { text = String(it.aggregated_output ?? ''); if (Number.isInteger(it.exit_code) && it.exit_code !== 0) isError = true; }
      else if (it.type === 'file_change') text = (Array.isArray(it.changes) ? it.changes : []).map(c => `${c?.kind ?? 'update'} ${c?.path ?? ''}`).join('\n');
      else if (it.type === 'mcp_tool_call') {
        if (it.error) { isError = true; text = String(it.error.message ?? it.error); }
        else text = (Array.isArray(it.result?.content) ? it.result.content : []).map(b => b?.type === 'text' ? b.text : '').filter(Boolean).join('\n');
        if (it.result?.isError || it.result?.is_error) isError = true;
      } else if (it.type === 'web_search') text = it.query ? `Busca: ${it.query}` : '';
      return { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: String(it.id), content: cut4k(text), is_error: isError }] } };
    };
    function feed(evt) {
      const it = evt.item && typeof evt.item === 'object' ? evt.item : null;
      switch (evt.type) {
        case 'thread.started': st.threadId = evt.thread_id || null; return [{ type: 'system', subtype: 'init', session_id: st.threadId, model: run.model || null, adapter: 'codex', cwd: run.cwd }];
        case 'turn.completed': {
          st.turns++;
          const u = evt.usage || {}, n = v => Number.isFinite(v) ? v : 0;
          st.usage.input += n(u.input_tokens); st.usage.cacheRead += n(u.cached_input_tokens); st.usage.cacheWrite += n(u.cache_write_input_tokens); st.usage.output += n(u.output_tokens); st.usage.reasoning += n(u.reasoning_output_tokens);
          return [];
        }
        case 'turn.failed': st.failed = String(evt.error?.message || 'Falha no turno do Codex.'); return [];
        case 'error': st.lastError = String(evt.message || 'Erro do Codex.'); st.failed = st.failed || st.lastError; return [{ type: 'bridge', subtype: 'warning', message: st.lastError.slice(0, 2000) }];
        case 'item.started': {
          if (!it) return [];
          const use = toolUse(it);
          if (!use) return [];
          st.started.add(use.id); if (isCall(it)) st.calls.push({ id: use.id, agente: String(it.arguments?.agente ?? ''), pedido: String(it.arguments?.pedido ?? ''), claimed: false });
          return [assistant([use])];
        }
        case 'item.completed': {
          if (!it) return [];
          if (it.type === 'agent_message') { st.last = String(it.text ?? ''); return st.last ? [assistant([{ type: 'text', text: st.last }])] : []; }
          if (it.type === 'error') return [{ type: 'bridge', subtype: 'warning', message: String(it.message ?? '').slice(0, 2000) }];
          const use = toolUse(it);
          if (!use) return []; // reasoning, todo_list
          const out = st.started.has(use.id) ? [] : [assistant([use])];
          st.started.delete(use.id); st.calls = st.calls.filter(c => c.id !== use.id);
          out.push(toolResult(it));
          return out;
        }
        default: return []; // turn.started, item.updated
      }
    }
    function finish(code, durationMs) {
      const isError = !!st.failed || code !== 0 || (!st.turns && !!st.lastError);
      return { type: 'result', subtype: isError ? 'error_during_execution' : 'success', is_error: isError, result: isError && !st.last ? (st.failed || st.lastError || '') : st.last, session_id: st.threadId, num_turns: st.turns, duration_ms: durationMs, total_cost_usd: null,
        usage: { input_tokens: st.usage.input, cache_read_input_tokens: st.usage.cacheRead, cache_creation_input_tokens: st.usage.cacheWrite, output_tokens: st.usage.output, reasoning_output_tokens: st.usage.reasoning } };
    }
    /* The open call an MCP request answers: the unclaimed one with the same arguments, else the oldest unclaimed one; each id is used
       once, so concurrent calls never share a card (or a parent span). openCall: the latest one, for text that arrives without one. */
    function claimCall(a) {
      const open = st.calls.filter(c => !c.claimed), agente = String(a?.agente ?? ''), pedido = String(a?.pedido ?? '');
      const c = open.find(x => x.agente === agente && x.pedido === pedido) || open[0];
      if (!c) return null;
      c.claimed = true; return c.id;
    }
    return { feed, finish, openCall: () => st.calls.at(-1)?.id || null, claimCall, state: st };
  }

  /* Codex keeps each session in <CODEX_HOME>/sessions/YYYY/MM/DD/rollout-<time>-<thread>.jsonl, with the account's rate limits in its
     token_count events. Read only, no symlinks, only the file's tail. */
  const SESSION_TAIL = 4 * 1024 * 1024;
  const pad2 = n => String(n).padStart(2, '0');
  /* Every component under CODEX_HOME (sessions/YYYY/MM/DD) must be a real directory, never a symlink. Node has no openat, so a
     component could still be swapped between the check and the open: the file is opened with O_NOFOLLOW and, once open, the whole
     chain is checked again (no symlink, each directory with the same device/inode as in the first pass) and the fd must be the file
     the path names now. Any difference discards the read. The bridge only takes numbers from the file, never returns its text. */
  function realDir(dir) { try { return fs.lstatSync(dir).isDirectory(); } catch { return false; } }
  /** Device/inode of each directory of the chain, or null when one is missing or is not a real directory. */
  function realChain(home, parts) {
    const ids = [];
    let d = home;
    for (const part of parts) {
      d = path.join(d, part);
      let st; try { st = fs.lstatSync(d); } catch { return null; }
      if (!st.isDirectory()) return null;
      ids.push(`${st.dev}:${st.ino}`);
    }
    return ids;
  }
  const sameIds = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
  /** ref = {home, chain, name, ids}: a file found by codexSessionFile/latestCodexSession. */
  function readTail(ref) {
    const file = path.join(ref.home, ...ref.chain, ref.name);
    const st = fs.lstatSync(file);
    if (!st.isFile()) return '';
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const fst = fs.fstatSync(fd);
      if (!fst.isFile() || fst.ino !== st.ino || fst.dev !== st.dev) return '';
      // After the open: the same real directories, and the path still names this very file.
      if (!sameIds(realChain(ref.home, ref.chain), ref.ids)) return '';
      const again = fs.lstatSync(file);
      if (!again.isFile() || again.ino !== fst.ino || again.dev !== fst.dev) return '';
      const size = fst.size, len = Math.min(size, SESSION_TAIL), buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      return buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  }
  function codexSessionFile(home, threadId, dates) {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(threadId || '')) return null;
    for (const d of dates) {
      const local = [String(d.getFullYear()), pad2(d.getMonth() + 1), pad2(d.getDate())];
      const utc = [String(d.getUTCFullYear()), pad2(d.getUTCMonth() + 1), pad2(d.getUTCDate())];
      for (const parts of [local, utc]) {
        const chain = ['sessions', ...parts], ids = realChain(home, chain);
        if (!ids) continue;
        const hit = fs.readdirSync(path.join(home, ...chain), { withFileTypes: true }).find(e => e.isFile() && e.name.endsWith(`${threadId}.jsonl`));
        if (hit) return { home, chain, name: hit.name, ids };
      }
    }
    return null;
  }
  function latestCodexSession(home) {
    // readdir entries are not followed: a symlinked YYYY/MM/DD is neither a directory nor a file here.
    const desc = parts => realChain(home, parts) ? fs.readdirSync(path.join(home, ...parts), { withFileTypes: true }).filter(e => e.isDirectory() && /^\d{2,4}$/.test(e.name)).map(e => e.name).sort().reverse() : [];
    for (const y of desc(['sessions'])) for (const m of desc(['sessions', y])) for (const d of desc(['sessions', y, m])) {
      const chain = ['sessions', y, m, d], ids = realChain(home, chain);
      if (!ids) continue;
      const dir = path.join(home, ...chain);
      const files = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.jsonl')).map(e => ({ name: e.name, mtime: fs.lstatSync(path.join(dir, e.name)).mtimeMs }));
      if (files.length) return { home, chain, name: files.sort((a, b) => b.mtime - a.mtime)[0].name, ids };
    }
    return null;
  }
  /** Last rate limits (primary 300 min → five_hour, secondary 10080 min → seven_day) and the model of a codex session file. */
  function codexSessionInfo(ref) {
    const out = { windows: null, model: null };
    if (!ref) return out;
    let text; try { text = readTail(ref); } catch { return out; }
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0 && (!out.windows || !out.model); i--) {
      if (!lines[i].includes('rate_limits') && !lines[i].includes('turn_context')) continue;
      let o; try { o = JSON.parse(lines[i]); } catch { continue; }
      const p = o.payload || {};
      if (!out.model && o.type === 'turn_context' && typeof p.model === 'string' && MODEL_RE.test(p.model)) out.model = p.model;
      const rl = p.rate_limits;
      if (!out.windows && rl && typeof rl === 'object') {
        const w = {};
        for (const slot of [rl.primary, rl.secondary]) {
          if (!slot || !Number.isFinite(slot.used_percent)) continue;
          const name = slot.window_minutes === 300 ? 'five_hour' : slot.window_minutes === 10080 ? 'seven_day' : null;
          if (name) w[name] = { utilization: slot.used_percent / 100, resetsAt: Number.isFinite(slot.resets_at) ? new Date(slot.resets_at * 1000).toISOString() : null };
        }
        if (Object.keys(w).length) out.windows = w;
      }
    }
    return out;
  }

  return {
    kind: 'codex', label: 'Codex', efforts: CODEX_EFFORTS, genAiSystem: 'openai', colleagues: 'mcp',
    defaultBin: () => DEFAULT_CODEX_BIN,
    notFound: (bin, profile) => `Codex não encontrado ("${bin}"). Ajuste o executável do Perfil "${profile.name}".`,
    home: codexHome,
    // The models and levels of this Perfil's own account folder (the catalog reads the default CODEX_HOME).
    profileExtras: profile => ({ modelEfforts: codexModels(codexHome(profile)) || {} }),
    catalog() {
      const cached = codexModels(codexHome(null));
      return { models: (cached ? Object.keys(cached) : CODEX_MODELS).map(id => ({ id, label: id })), efforts: CODEX_EFFORTS, modelEfforts: cached || {} };
    },
    resolveModelEffort({ opts, profile, model, effort, warn }) {
      if (claudeLike(model)) { if (opts.model) warn(`O modelo "${opts.model}" é do Claude: o Perfil Codex usa ${profile.model || 'o modelo padrão da conta'}.`); model = profile.model && !claudeLike(profile.model) ? profile.model : ''; }
      return { model, effort: codexEffort(effort, model, codexHome(profile)) };
    },

    async prepare({ run, opts, profile, model, effort, prompt, systemPrompt, env, warn }) {
      const args = codexArgs(opts, profile, model, effort, warn);
      if (profile.configDir) env.CODEX_HOME = profile.configDir;
      let mcpToken;
      if (opts.agents) { mcpToken = crypto.randomBytes(32).toString('hex'); env.SQUAD_MCP_TOKEN = mcpToken; }
      // The agent's instructions go in front of the task on stdin (codex has no system prompt file).
      const stdin = systemPrompt.trim() ? `<instrucoes-do-agente>\n${systemPrompt}\n</instrucoes-do-agente>\n\n<tarefa>\n${prompt}\n</tarefa>` : prompt;
      // tail: the "-" (prompt on stdin) must come after anything the core appends (native telemetry -c flags).
      return { args, stdin, files: [], translator: codexTranslator(run), mcpToken, tail: ['-'], model };
    },

    /** Codex takes the OTLP exporters as -c flags, so only without secret headers (those never go to the command line). */
    nativeTelemetry(run, profile, { args, warn, base, cfg, content }) {
      if (Object.keys(cfg.headersEnv).length) return warn('Telemetria nativa do Codex desligada: os headers do OTLP levam segredos, que nunca vão para a linha de comando.');
      args.push('-c', `otel.exporter={otlp-http={endpoint=${JSON.stringify(base + '/v1/logs')},protocol="json"}}`, '-c', `otel.trace_exporter={otlp-http={endpoint=${JSON.stringify(base + '/v1/traces')},protocol="json"}}`, '-c', `otel.log_user_prompt=${content}`);
    },

    /** The translator closes the run with a synthetic result; the session file gives the real model and the account's windows. */
    finish(run, { code, durationMs }) {
      const result = run.translator.finish(code, durationMs), st = run.translator.state;
      const out = { result, usage: { ...st.usage } };
      try {
        const info = codexSessionInfo(codexSessionFile(codexHome(run.profile), st.threadId, [new Date(run.startedAt), new Date()]));
        if (info.model) out.model = info.model;
        if (info.windows) out.windows = info.windows;
      } catch {}
      return out;
    },

    /** The newest session file of the account has its latest rate limits. */
    async refreshWindows(profile) {
      const info = codexSessionInfo(latestCodexSession(codexHome(profile)));
      // observed only when the windows were really recorded
      return { observed: !!info.windows && host.saveWindows(profile.id, info.windows, 'refresh') !== false };
    },
  };
};
