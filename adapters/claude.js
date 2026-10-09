'use strict';
/* Built-in Adapter: Claude Code (`claude -p --output-format stream-json`). Its events already are the app's format (ADR 0001). */
const path = require('node:path');
const { WINDOWS } = require('../db.js');

const CLAUDE_MODELS = ['opus', 'sonnet', 'haiku'];

module.exports = host => {
  const { ROOT, DEFAULT_BIN, EFFORTS, fsp, longPath } = host;

  /* Claude Code loads CLAUDE.md from every folder above the cwd: project runs skip this app's own instructions.
   * Absolute patterns plus a `**`-anchored variant (last two segments of ROOT), in case the drive letter does not match. */
  const APP_MEMORY_EXCLUDES = (() => {
    const root = longPath(ROOT).replace(/\\/g, '/'), tail = root.split('/').filter(Boolean).slice(-2).join('/');
    const files = ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.claude/CLAUDE.md', '.claude/rules/**'];
    return [...files.map(f => `${root}/${f}`), ...files.map(f => `**/${tail}/${f}`)];
  })();

  /** rate_limit_event → {five_hour, seven_day}: utilization 0..1 and the reset instant (epoch seconds in the event). */
  function claudeWindows(evt) {
    const info = evt.rate_limit_info || evt.rateLimitInfo;
    if (!info || typeof info !== 'object') return null;
    const out = {};
    const put = (w, v) => {
      if (!v || typeof v !== 'object') return;
      let u = Number(v.utilization ?? v.used_percent);
      if (!Number.isFinite(u)) return;
      if (u > 1.5) u /= 100; // a percentage
      const r = Number(v.resetsAt ?? v.resets_at);
      const at = Number.isFinite(r) && r > 0 ? new Date(r < 1e12 ? r * 1000 : r) : null;
      out[w] = { utilization: u, resetsAt: at && Number.isFinite(at.getTime()) ? at.toISOString() : null };
    };
    const uw = info.unifiedWindows || info.unified_windows;
    if (uw && typeof uw === 'object') for (const w of WINDOWS) put(w, uw[w]);
    else if (WINDOWS.includes(info.rateLimitType)) put(info.rateLimitType, info);
    return Object.keys(out).length ? out : null;
  }
  function claudeUsage(r) {
    const u = r?.usage;
    if (!u || typeof u !== 'object') return null;
    const n = v => Number.isFinite(v) ? v : 0;
    return { input: n(u.input_tokens), cacheRead: n(u.cache_read_input_tokens), cacheWrite: n(u.cache_creation_input_tokens), output: n(u.output_tokens), reasoning: n(u.output_tokens_details?.thinking_tokens ?? u.reasoning_output_tokens) };
  }

  return {
    kind: 'claude', label: 'Claude Code', efforts: EFFORTS, genAiSystem: 'anthropic', colleagues: 'native',
    // claudePath (runtime) only counts when the Perfil has no executable of its own (the caller tries p.bin first).
    defaultBin: ({ claudePath } = {}) => claudePath || DEFAULT_BIN,
    notFound: bin => `Claude Code não encontrado ("${bin}"). Ajuste o caminho nas configurações.`,
    catalog: () => ({ models: CLAUDE_MODELS.map(id => ({ id, label: id[0].toUpperCase() + id.slice(1) })), efforts: EFFORTS }),
    validateLaunch(opts) { if (opts.effort && !EFFORTS.includes(opts.effort)) throw new Error('Nível de esforço inválido para o Claude.'); },
    resolveModelEffort: ({ model, effort }) => ({ model, effort }),
    // The user scope of the settings.json follows the account folder (CLAUDE_CONFIG_DIR) of the Perfil.
    settingsFile: profile => profile?.configDir ? path.join(profile.configDir, 'settings.json') : null,

    async prepare({ id, opts, profile, model, effort, prompt, systemPrompt, env, tmpDir, files = [] }) {
      // `files` belongs to the core, which removes them if anything fails before the child owns them: each is registered before it is written.
      const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-prompts', 'none'];
      // OS temp cleanup can remove the (usually empty) folder while the bridge keeps running.
      if (systemPrompt.trim() || opts.projectRun || opts.agents) await fsp.mkdir(tmpDir, { recursive: true });
      if (systemPrompt.trim()) {
        const file = path.join(tmpDir, `${id}.system.md`);
        files.push({ path: file, mask: '<system-prompt-file>' });
        await fsp.writeFile(file, systemPrompt, 'utf8');
        args.push('--append-system-prompt-file', file);
      }
      if (opts.projectRun) {
        const file = path.join(tmpDir, `${id}.settings.json`);
        // The file tools also refuse reads outside the project folder (and --add-dir), so agents never take this app or the
        // person's other folders for the project.
        files.push({ path: file, mask: '<settings-file>' });
        await fsp.writeFile(file, JSON.stringify({ claudeMdExcludes: APP_MEMORY_EXCLUDES, permissions: { blockReadsOutsideWorkingDirectories: true } }), 'utf8');
        args.push('--settings', file);
      }
      if (opts.agents) {
        const file = path.join(tmpDir, `${id}.agents.json`);
        files.push({ path: file, mask: '<agents-file>' });
        await fsp.writeFile(file, JSON.stringify(opts.agents), 'utf8');
        args.push('--agents', file);
      }
      if (opts.forwardSubagents) args.push('--forward-subagent-text');
      if (model) args.push('--model', model);
      if (opts.permissionMode) args.push('--permission-mode', opts.permissionMode);
      if (effort) args.push('--effort', effort);
      if (opts.maxBudgetUsd) args.push('--max-budget-usd', opts.maxBudgetUsd);
      if (opts.tools) args.push('--tools', opts.tools.length ? opts.tools.join(',') : '');
      if (opts.allowedTools.length) args.push('--allowedTools', opts.allowedTools.join(','));
      if (opts.disallowedTools.length) args.push('--disallowedTools', opts.disallowedTools.join(','));
      for (const d of opts.addDirs) args.push('--add-dir', d);
      if (opts.partial) args.push('--include-partial-messages');
      env.CLAUDE_CODE_ENTRYPOINT = process.env.CLAUDE_CODE_ENTRYPOINT || 'squad-code-bridge';
      // With squad colleagues, calls run in the foreground: the Agent tool result is the colleague's answer, not a launch notice.
      if (opts.agents) env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';
      if (profile.configDir) env.CLAUDE_CONFIG_DIR = profile.configDir;
      return { args, stdin: prompt, files, translator: null, tail: [], model };
    },

    /** The CLI's own telemetry goes through env vars. */
    nativeTelemetry(run, profile, { env, base, cfg, content, headers, attrs }) {
      Object.assign(env, { CLAUDE_CODE_ENABLE_TELEMETRY: '1', OTEL_METRICS_EXPORTER: 'otlp', OTEL_LOGS_EXPORTER: 'otlp', OTEL_EXPORTER_OTLP_ENDPOINT: base, OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json', OTEL_SERVICE_NAME: cfg.serviceName,
        OTEL_RESOURCE_ATTRIBUTES: Object.entries(attrs).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join(',') });
      if (Object.keys(headers).length) env.OTEL_EXPORTER_OTLP_HEADERS = Object.entries(headers).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join(',');
      if (content) env.OTEL_LOG_USER_PROMPTS = '1';
    },

    /** Synchronous, on the hot path of every event: the usage windows ride on `rate_limit_event`. */
    onEvent(run, event) {
      if (event.type !== 'rate_limit_event') return undefined;
      const windows = claudeWindows(event);
      return windows ? { windows } : undefined;
    },

    finish(run) {
      const out = { usage: claudeUsage(run.result) };
      if (!run.seenModel && run.result?.modelUsage && typeof run.result.modelUsage === 'object') { const m = Object.keys(run.result.modelUsage)[0]; if (m) out.model = m; }
      return out;
    },

    /** A minimal `claude -p` on haiku without tools: its rate_limit_event updates the windows (recorded by onEvent). */
    async refreshWindows(profile) {
      const dir = path.join(host.TMP_DIR, 'probe');
      await fsp.mkdir(dir, { recursive: true });
      const run = await host.startRun({ prompt: 'Responda só: ok', label: 'Atualizar uso do Perfil', options: { cwd: dir, profile: profile.id, model: 'haiku', tools: [], permissionMode: 'dontAsk', timeoutSec: 120 }, meta: { kind: 'probe' } }, { exact: true });
      const exit = await run.done;
      if (exit.isError) throw new Error(`Não foi possível atualizar o uso: ${exit.error}`);
      return { observed: run.events.some(e => e.type === 'rate_limit_event') };
    },
  };
};
