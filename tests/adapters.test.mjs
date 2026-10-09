// Adapter registry and the built-in adapters (adapters/): `npm test` runs it with tests/bridge.test.mjs. Unit tests need no bridge;
// the last one starts a bridge on a database that holds a Perfil of an Adapter nobody registered.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync } from 'node:fs';
import fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { createRegistry, validateAdapter } = require('../adapters/index.js');
const { CONSTANTS } = require('../plugins.js');
const dbModule = require('../db.js');

delete process.env.CODEX_HOME; // the tests set their own account folders
const tmp = prefix => mkdtempSync(path.join(tmpdir(), prefix));
const cleanup = [];
after(() => { for (const d of cleanup) { try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} } });
const scratch = prefix => { const d = tmp(prefix); cleanup.push(d); return d; };

const cut4k = v => typeof v === 'string' && v.length > 4000 ? v.slice(0, 4000) + '…' : v;
const hostFor = (over = {}) => ({
  ROOT, HOME: scratch('squad-ad-home-'), HOST: '127.0.0.1', PORT: 4317, TMP_DIR: scratch('squad-ad-tmp-'), DEFAULT_BIN: 'claude', DEFAULT_CODEX_BIN: 'codex',
  MODEL_RE: CONSTANTS.MODEL_RE, cut4k, resolveBin: async b => b, startRun: async () => { throw new Error('startRun not expected'); }, saveWindows: () => {}, warn: () => {},
  fsp, longPath: p => p, EFFORTS: CONSTANTS.EFFORTS, CODEX_EFFORTS: CONSTANTS.CODEX_EFFORTS, ...over,
});
const fakeAdapter = (kind, over = {}) => ({
  kind, label: kind, efforts: ['low'], genAiSystem: 'fake', colleagues: 'none',
  defaultBin: () => kind, notFound: bin => `no ${bin}`, catalog: () => ({ models: [], efforts: ['low'] }),
  resolveModelEffort: ({ model, effort }) => ({ model, effort }),
  prepare: async () => ({ args: [], stdin: '', files: [], translator: null, tail: [], model: '' }),
  finish: () => ({ usage: null }), refreshWindows: async () => ({ observed: false }), ...over,
});

/* ---------- registry ---------- */
test('registry: built-ins are claude and codex, in that order, and builtinKinds() matches the constants of plugins.js and db.js', () => {
  const reg = createRegistry(hostFor());
  assert.deepEqual(reg.builtinKinds(), CONSTANTS.ADAPTERS);
  assert.deepEqual(reg.builtinKinds(), dbModule.ADAPTERS);
  assert.deepEqual(reg.kinds(), ['claude', 'codex']);
  assert.ok(reg.has('claude') && reg.has('codex') && !reg.has('gemini'));
  assert.equal(reg.get('gemini'), null);
  assert.equal(reg.get('claude').builtin, true);
  assert.deepEqual(reg.get('claude').efforts, CONSTANTS.EFFORTS);
  assert.deepEqual(reg.get('codex').efforts, CONSTANTS.CODEX_EFFORTS);
});

test('registry: register adds a kind after the built-ins; builtinKinds() does not change', () => {
  const reg = createRegistry(hostFor());
  const impl = fakeAdapter('x-echo');
  reg.register(impl);
  assert.deepEqual(reg.kinds(), ['claude', 'codex', 'x-echo']);
  assert.deepEqual(reg.builtinKinds(), ['claude', 'codex']);
  assert.equal(reg.get('x-echo').builtin, false);
  assert.equal(reg.get('x-echo').label, 'x-echo');
  // each registry is its own: another start has nothing of this one
  assert.deepEqual(createRegistry(hostFor()).kinds(), ['claude', 'codex']);
});

test('registry: a duplicate kind is refused unless override is explicit, and the built-in flag never moves to the overrider', () => {
  const reg = createRegistry(hostFor());
  assert.throws(() => reg.register(fakeAdapter('claude')), /já registrado/);
  reg.register(fakeAdapter('x-echo'));
  assert.throws(() => reg.register(fakeAdapter('x-echo')), /já registrado/);
  assert.throws(() => reg.register(fakeAdapter('x-echo'), { override: 'yes' }), /já registrado/);
  const over = fakeAdapter('claude', { label: 'Claude do plugin' });
  reg.register(over, { override: true });
  assert.equal(reg.get('claude').label, 'Claude do plugin');
  assert.equal(reg.get('claude').builtin, false);
  assert.deepEqual(reg.kinds(), ['claude', 'codex', 'x-echo']);
  assert.deepEqual(reg.builtinKinds(), ['claude', 'codex']);
});

test('registry: the format of the implementation is validated (kind, lists, required and optional functions)', () => {
  const reg = createRegistry(hostFor());
  const bad = [
    [null, /objeto/], [[], /objeto/], ['claude', /objeto/],
    [fakeAdapter(''), /kind/], [fakeAdapter('Bad Kind'), /kind/], [fakeAdapter('x'.repeat(41)), /kind/], [fakeAdapter(7), /kind/],
    [fakeAdapter('a1', { label: '' }), /label/], [fakeAdapter('a2', { efforts: 'low' }), /efforts/], [fakeAdapter('a3', { efforts: [1] }), /efforts/],
    [fakeAdapter('a4', { genAiSystem: '' }), /genAiSystem/], [fakeAdapter('a5', { colleagues: 'sometimes' }), /colleagues/],
    [fakeAdapter('a6', { prepare: undefined }), /prepare/], [fakeAdapter('a7', { finish: 'x' }), /finish/], [fakeAdapter('a8', { catalog: undefined }), /catalog/],
    [fakeAdapter('a9', { defaultBin: null }), /defaultBin/], [fakeAdapter('b1', { notFound: 1 }), /notFound/], [fakeAdapter('b2', { resolveModelEffort: {} }), /resolveModelEffort/],
    [fakeAdapter('b3', { refreshWindows: undefined }), /refreshWindows/],
    [fakeAdapter('b4', { onEvent: 'x' }), /onEvent/], [fakeAdapter('b5', { nativeTelemetry: 1 }), /nativeTelemetry/], [fakeAdapter('b6', { settingsFile: {} }), /settingsFile/],
    [fakeAdapter('b7', { home: true }), /home/], [fakeAdapter('b8', { validateLaunch: [] }), /validateLaunch/], [fakeAdapter('b9', { profileExtras: 'x' }), /profileExtras/],
  ];
  for (const [impl, re] of bad) assert.throws(() => reg.register(impl), re, JSON.stringify(impl && impl.kind));
  assert.deepEqual(reg.kinds(), ['claude', 'codex']);
  // optional members may be absent or functions
  reg.register(fakeAdapter('ok1', { onEvent: () => {}, nativeTelemetry: () => {}, settingsFile: () => null, home: () => null, validateLaunch: () => {}, profileExtras: () => ({}), status: async () => ({}), validateProfile: () => {} }));
  assert.ok(reg.has('ok1'));
  assert.doesNotThrow(() => validateAdapter(fakeAdapter('plain')));
  assert.equal(reg.get(), null);
});

test('registry: the built-ins pass their own validation', () => {
  const host = hostFor();
  for (const kind of ['claude', 'codex']) assert.doesNotThrow(() => validateAdapter(require(`../adapters/${kind}.js`)(host)), kind);
});

/* ---------- claude ---------- */
const claude = () => require('../adapters/claude.js')(hostFor());
const inSeconds = s => Math.floor(Date.now() / 1000) + s;

test('claude.onEvent: rate_limit_event becomes the usage windows (unified, single type, percentages, camelCase)', () => {
  const a = claude();
  const reset = inSeconds(3600);
  const out = a.onEvent({}, { type: 'rate_limit_event', rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.42, resetsAt: reset }, seven_day: { utilization: 0.1, resetsAt: inSeconds(86400) } } } });
  assert.deepEqual(Object.keys(out.windows), ['five_hour', 'seven_day']);
  assert.equal(out.windows.five_hour.utilization, 0.42);
  assert.equal(out.windows.five_hour.resetsAt, new Date(reset * 1000).toISOString());
  const single = a.onEvent({}, { type: 'rate_limit_event', rateLimitInfo: { rateLimitType: 'seven_day', utilization: 80, resetsAt: reset * 1000 } });
  assert.deepEqual(Object.keys(single.windows), ['seven_day']);
  assert.equal(single.windows.seven_day.utilization, 0.8, 'a value above 1.5 is a percentage');
  assert.equal(single.windows.seven_day.resetsAt, new Date(reset * 1000).toISOString(), 'epoch milliseconds are kept');
  const noReset = a.onEvent({}, { type: 'rate_limit_event', rate_limit_info: { unified_windows: { five_hour: { used_percent: 5 } } } });
  assert.deepEqual(noReset.windows, { five_hour: { utilization: 0.05, resetsAt: null } });
});

test('claude.onEvent: a reset instant that is not a valid date becomes null instead of throwing', () => {
  const a = claude();
  for (const resetsAt of [1e20, 8.64e15 + 1, 1e300]) {
    const out = a.onEvent({}, { type: 'rate_limit_event', rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.2, resetsAt } } } });
    assert.deepEqual(out.windows, { five_hour: { utilization: 0.2, resetsAt: null } }, String(resetsAt));
  }
});

test('claude.prepare: a failure after the first file leaves it registered in spec.files for the core to remove', async () => {
  let writes = 0;
  const failing = { ...fsp, writeFile: async (...x) => { if (++writes === 2) throw new Error('disco cheio'); return fsp.writeFile(...x); } };
  const host = hostFor({ fsp: failing }), a = require('../adapters/claude.js')(host), files = [];
  await assert.rejects(a.prepare({ id: 'r9', run: {}, opts: { cwd: '/w', projectRun: true, agents: null, tools: null, allowedTools: [], disallowedTools: [], addDirs: [] }, profile: {}, model: '', effort: '', prompt: 'x', systemPrompt: 'sys', env: {}, warn() {}, tmpDir: host.TMP_DIR, files }), /disco cheio/);
  assert.deepEqual(files.map(f => f.mask), ['<system-prompt-file>', '<settings-file>'], 'registered before each write, so the half-written one is removed too');
});

test('claude.onEvent: other events, unknown windows and malformed info give nothing', () => {
  const a = claude();
  assert.equal(a.onEvent({}, { type: 'assistant', message: {} }), undefined);
  assert.equal(a.onEvent({}, { type: 'rate_limit_event' }), undefined);
  assert.equal(a.onEvent({}, { type: 'rate_limit_event', rate_limit_info: 'x' }), undefined);
  assert.equal(a.onEvent({}, { type: 'rate_limit_event', rate_limit_info: { rateLimitType: 'monthly', utilization: 0.5 } }), undefined);
  assert.equal(a.onEvent({}, { type: 'rate_limit_event', rate_limit_info: { unifiedWindows: { five_hour: { utilization: 'x' }, seven_day: null } } }), undefined);
});

test('claude.finish: usage from the result (tokens, thinking), model from modelUsage unless the init event gave one', () => {
  const a = claude();
  const result = { usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 30, output_tokens: 4, output_tokens_details: { thinking_tokens: 2 } }, modelUsage: { 'claude-x': {} } };
  assert.deepEqual(a.finish({ result }, { code: 0, durationMs: 5 }), { usage: { input: 10, cacheRead: 20, cacheWrite: 30, output: 4, reasoning: 2 }, model: 'claude-x' });
  assert.equal(a.finish({ result, seenModel: 'claude-seen' }, { code: 0, durationMs: 5 }).model, undefined);
  assert.equal(a.finish({ result: { usage: { input_tokens: 'x' } } }, { code: 0, durationMs: 1 }).usage.input, 0);
  assert.deepEqual(a.finish({ result: null }, { code: 1, durationMs: 1 }), { usage: null });
  assert.deepEqual(a.finish({ result: { usage: 'x', modelUsage: [] } }, { code: 0, durationMs: 1 }).usage, null);
});

test('claude.prepare: argv by option, temp files with their masks, env, and the prompt on stdin', async () => {
  const host = hostFor(), a = require('../adapters/claude.js')(host);
  const env = {}, warnings = [];
  const opts = { cwd: '/w', projectRun: true, agents: { colega: { description: 'd', prompt: 'p' } }, forwardSubagents: true, permissionMode: 'plan', maxBudgetUsd: '2', tools: ['Read'], allowedTools: ['Bash(ls)'], disallowedTools: ['Edit'], addDirs: ['/x'], partial: true };
  const prep = await a.prepare({ id: 'run1', run: {}, opts, profile: { configDir: '/acct' }, model: 'sonnet', effort: 'high', prompt: 'tarefa', systemPrompt: 'sou eu', env, warn: m => warnings.push(m), tmpDir: host.TMP_DIR });
  assert.deepEqual(prep.files.map(f => f.mask), ['<system-prompt-file>', '<settings-file>', '<agents-file>']);
  assert.deepEqual(prep.args.slice(0, 6), ['-p', '--output-format', 'stream-json', '--verbose', '--permission-prompts', 'none']);
  for (const f of prep.files) assert.ok(prep.args.includes(f.path) && f.path.startsWith(host.TMP_DIR));
  const has = (flag, v) => { const i = prep.args.indexOf(flag); return i > -1 && (v === undefined || prep.args[i + 1] === v); };
  assert.ok(has('--model', 'sonnet') && has('--permission-mode', 'plan') && has('--effort', 'high') && has('--max-budget-usd', '2') && has('--tools', 'Read'));
  assert.ok(has('--allowedTools', 'Bash(ls)') && has('--disallowedTools', 'Edit') && has('--add-dir', '/x') && has('--forward-subagent-text') && has('--include-partial-messages'));
  assert.equal(prep.stdin, 'tarefa');
  assert.equal(prep.translator, null);
  assert.deepEqual(prep.tail, []);
  assert.equal(prep.model, 'sonnet');
  assert.equal(env.CLAUDE_CONFIG_DIR, '/acct');
  assert.equal(env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, '1');
  assert.ok(env.CLAUDE_CODE_ENTRYPOINT);
  const settings = JSON.parse(await fsp.readFile(prep.files[1].path, 'utf8'));
  assert.equal(settings.permissions.blockReadsOutsideWorkingDirectories, true);
  assert.ok(settings.claudeMdExcludes.some(x => x.endsWith('/CLAUDE.md')));
  assert.equal(await fsp.readFile(prep.files[0].path, 'utf8'), 'sou eu');
  assert.deepEqual(JSON.parse(await fsp.readFile(prep.files[2].path, 'utf8')), opts.agents);
  assert.deepEqual(warnings, []);
  // without system prompt, project folder or colleagues no file is written
  const bare = await a.prepare({ id: 'run2', run: {}, opts: { cwd: '/w', projectRun: false, agents: null, tools: null, allowedTools: [], disallowedTools: [], addDirs: [] }, profile: {}, model: '', effort: '', prompt: 'x', systemPrompt: '  ', env: {}, warn() {}, tmpDir: host.TMP_DIR });
  assert.deepEqual(bare.files, []);
  assert.deepEqual(bare.args, ['-p', '--output-format', 'stream-json', '--verbose', '--permission-prompts', 'none']);
});

test('claude: effort is checked against its own list, the default executable follows the runtime path, settings.json follows the account folder', () => {
  const a = claude();
  assert.throws(() => a.validateLaunch({ effort: 'ultra' }, {}), /Nível de esforço inválido para o Claude/);
  assert.doesNotThrow(() => a.validateLaunch({ effort: 'high' }, {}));
  assert.doesNotThrow(() => a.validateLaunch({}, {}));
  assert.equal(a.defaultBin({ claudePath: '/c/claude', claudePathSet: true }), '/c/claude');
  assert.equal(a.defaultBin({}), 'claude');
  assert.match(a.notFound('claude', { name: 'X' }), /Claude Code não encontrado \("claude"\)/);
  assert.equal(a.settingsFile({ configDir: '/acct' }), path.join('/acct', 'settings.json'));
  assert.equal(a.settingsFile({ configDir: '' }), null);
  assert.equal(a.genAiSystem, 'anthropic');
  assert.deepEqual(a.resolveModelEffort({ model: 'opus', effort: 'low', opts: {}, profile: {}, warn() {} }), { model: 'opus', effort: 'low' });
  assert.deepEqual(a.catalog().models.map(m => m.id), ['opus', 'sonnet', 'haiku']);
  assert.deepEqual(a.catalog().efforts, CONSTANTS.EFFORTS);
});

test('claude.nativeTelemetry: OTEL env of the Perfil, headers URL-encoded, prompts only with content', () => {
  const a = claude(), env = {};
  a.nativeTelemetry({}, {}, { env, args: [], warn() {}, base: 'http://otel:4318', cfg: { serviceName: 'svc' }, content: true, headers: { Authorization: 'Bearer a b' }, attrs: { 'squad.project': 'p 1', 'squad.adapter': 'claude' } });
  assert.equal(env.CLAUDE_CODE_ENABLE_TELEMETRY, '1');
  assert.equal(env.OTEL_EXPORTER_OTLP_ENDPOINT, 'http://otel:4318');
  assert.equal(env.OTEL_SERVICE_NAME, 'svc');
  assert.equal(env.OTEL_RESOURCE_ATTRIBUTES, 'squad.project=p%201,squad.adapter=claude');
  assert.equal(env.OTEL_EXPORTER_OTLP_HEADERS, 'Authorization=Bearer%20a%20b');
  assert.equal(env.OTEL_LOG_USER_PROMPTS, '1');
  const quiet = {};
  a.nativeTelemetry({}, {}, { env: quiet, args: [], warn() {}, base: 'http://o', cfg: { serviceName: 's' }, content: false, headers: {}, attrs: {} });
  assert.equal(quiet.OTEL_EXPORTER_OTLP_HEADERS, undefined);
  assert.equal(quiet.OTEL_LOG_USER_PROMPTS, undefined);
});

/* ---------- codex ---------- */
const codex = (over = {}) => require('../adapters/codex.js')(hostFor(over));
const baseOpts = (over = {}) => ({ cwd: scratch('squad-ad-cwd-'), projectRun: true, agents: null, tools: null, allowedTools: [], disallowedTools: [], addDirs: [], permissionMode: 'dontAsk', timeoutSec: 900, maxBudgetUsd: undefined, ...over });
async function codexPrep(over = {}, profile = {}, extra = {}) {
  const a = codex(), env = {}, warnings = [], opts = baseOpts(over);
  const prep = await a.prepare({ id: 'r1', run: { model: '', cwd: opts.cwd }, opts, profile: { ignoreUserConfig: false, configDir: '', ...profile }, model: extra.model ?? '', effort: extra.effort ?? '', prompt: 'tarefa', systemPrompt: extra.systemPrompt ?? '', env, warn: m => warnings.push(m), tmpDir: '/nope' });
  return { prep, env, warnings, opts, a };
}
const pair = (args, flag) => args.flatMap((x, i) => x === flag ? [args[i + 1]] : []);

test('codexArgs: sandbox by tool access (all tools or a write tool = workspace-write, read-only tools = read-only, plan = read-only)', async () => {
  assert.deepEqual(pair((await codexPrep()).prep.args, '--sandbox'), ['workspace-write']);
  assert.deepEqual(pair((await codexPrep({ tools: ['Read', 'Grep'] })).prep.args, '--sandbox'), ['read-only']);
  assert.deepEqual(pair((await codexPrep({ tools: [] })).prep.args, '--sandbox'), ['read-only']);
  assert.deepEqual(pair((await codexPrep({ tools: ['Read'], allowedTools: ['Bash(ls:*)'] })).prep.args, '--sandbox'), ['workspace-write']);
  assert.deepEqual(pair((await codexPrep({ tools: ['Write'] })).prep.args, '--sandbox'), ['workspace-write']);
  assert.deepEqual(pair((await codexPrep({ permissionMode: 'plan' })).prep.args, '--sandbox'), ['read-only']);
  const { prep, opts } = await codexPrep();
  assert.deepEqual(prep.args.slice(0, 8), ['exec', '--json', '-C', opts.cwd, '--sandbox', 'workspace-write', '-c', 'approval_policy="never"']);
});

test('codexArgs: ignoreUserConfig drops the person\'s config and the skill/app/memory catalogs; off leaves them alone', async () => {
  const on = (await codexPrep({}, { ignoreUserConfig: true })).prep.args;
  assert.ok(on.includes('--ignore-user-config'));
  for (const c of ['skills.include_instructions=false', 'skills.bundled.enabled=false', 'include_apps_instructions=false', 'features.plugins=false', 'features.apps=false', 'features.memories=false']) assert.ok(pair(on, '-c').includes(c), c);
  const off = (await codexPrep({}, { ignoreUserConfig: false })).prep.args;
  assert.ok(!off.includes('--ignore-user-config'));
  assert.ok(!pair(off, '-c').some(c => c.startsWith('skills.')));
});

test('codexArgs: --skip-git-repo-check only outside a repository (project folders stop at their own root)', async () => {
  assert.ok((await codexPrep({ projectRun: true })).prep.args.includes('--skip-git-repo-check'));
  const repo = scratch('squad-ad-repo-'); mkdirSync(path.join(repo, '.git'));
  assert.ok(!(await codexPrep({ projectRun: true, cwd: repo })).prep.args.includes('--skip-git-repo-check'));
  const sub = path.join(repo, 'a', 'b'); mkdirSync(sub, { recursive: true });
  assert.ok(!(await codexPrep({ projectRun: false, cwd: sub })).prep.args.includes('--skip-git-repo-check'), 'an explicit cwd looks upward for .git');
  assert.ok((await codexPrep({ projectRun: true, cwd: sub })).prep.args.includes('--skip-git-repo-check'), 'a project folder does not look upward');
});

test('codexArgs: model, effort, extra dirs, budget warning; the prompt comes from stdin (tail "-")', async () => {
  const { prep, warnings } = await codexPrep({ addDirs: ['/a', '/b'], maxBudgetUsd: '3' }, {}, { model: 'gpt-5.5', effort: 'high' });
  assert.deepEqual(pair(prep.args, '-m'), ['gpt-5.5']);
  assert.ok(pair(prep.args, '-c').includes('model_reasoning_effort="high"'));
  assert.deepEqual(pair(prep.args, '--add-dir'), ['/a', '/b']);
  assert.match(warnings[0], /orçamento máximo/);
  assert.deepEqual(prep.tail, ['-']);
  assert.ok(!prep.args.includes('-'), 'the "-" comes after the telemetry, as the core adds the tail last');
  assert.equal(prep.stdin, 'tarefa');
  const bare = (await codexPrep()).prep.args;
  assert.ok(!bare.includes('-m') && !pair(bare, '-c').some(c => c.startsWith('model_reasoning_effort')));
});

test('codexArgs: squad colleagues go through the bridge MCP with a token in the env, never in argv', async () => {
  const { prep, env } = await codexPrep({ agents: { colega: { description: 'd', prompt: 'p' } }, timeoutSec: 100 });
  const cs = pair(prep.args, '-c');
  assert.ok(cs.includes('mcp_servers.squad.url="http://127.0.0.1:4317/mcp"'));
  assert.ok(cs.includes('mcp_servers.squad.bearer_token_env_var="SQUAD_MCP_TOKEN"'));
  assert.ok(cs.includes('mcp_servers.squad.tool_timeout_sec=160'));
  assert.ok(cs.includes('mcp_servers.squad.tools.chamar_colega.approval_mode="approve"'));
  assert.match(prep.mcpToken, /^[0-9a-f]{64}$/);
  assert.equal(env.SQUAD_MCP_TOKEN, prep.mcpToken);
  assert.ok(!prep.args.join(' ').includes(prep.mcpToken));
  const none = await codexPrep();
  assert.equal(none.prep.mcpToken, undefined);
  assert.equal(none.env.SQUAD_MCP_TOKEN, undefined);
  assert.ok(!pair(none.prep.args, '-c').some(c => c.startsWith('mcp_servers')));
});

test('codex.prepare: system prompt in front of the task, account folder in CODEX_HOME, no temp files, Claude models dropped with a warning', async () => {
  const withSys = await codexPrep({}, { configDir: '/acct' }, { systemPrompt: 'sou eu' });
  assert.equal(withSys.prep.stdin, '<instrucoes-do-agente>\nsou eu\n</instrucoes-do-agente>\n\n<tarefa>\ntarefa\n</tarefa>');
  assert.equal(withSys.env.CODEX_HOME, '/acct');
  assert.deepEqual(withSys.prep.files, []);
  assert.equal((await codexPrep({}, {}, { systemPrompt: '  ' })).prep.stdin, 'tarefa');
  const a = codex(), warnings = [];
  assert.deepEqual(a.resolveModelEffort({ opts: { model: 'opus' }, profile: { model: 'gpt-5.5' }, model: 'opus', effort: 'high', warn: m => warnings.push(m) }), { model: 'gpt-5.5', effort: 'high' });
  assert.match(warnings[0], /"opus" é do Claude: o Perfil Codex usa gpt-5\.5/);
  assert.deepEqual(a.resolveModelEffort({ opts: {}, profile: { model: 'sonnet' }, model: 'sonnet', effort: '', warn() {} }), { model: '', effort: '' }, 'a Claude model on the Perfil itself is dropped without a warning');
  assert.deepEqual(a.resolveModelEffort({ opts: { model: 'gpt-x' }, profile: {}, model: 'gpt-x', effort: 'ultra', warn() {} }), { model: 'gpt-x', effort: 'xhigh' }, 'max/ultra fall back to xhigh when the model does not list them');
  assert.equal(a.genAiSystem, 'openai');
  assert.equal(a.defaultBin({ claudePath: '/c' }), 'codex');
});

test('codex: model list and levels come from the account folder\'s models_cache.json, with a built-in fallback', () => {
  const home = scratch('squad-ad-cx-');
  const a = codex({ HOME: home });
  assert.deepEqual(a.catalog().models.map(m => m.id), ['gpt-5.5']);
  assert.deepEqual(a.catalog().modelEfforts, {});
  assert.deepEqual(a.profileExtras({ configDir: home }), { modelEfforts: {} });
  const acct = scratch('squad-ad-acct-');
  writeFileSync(path.join(acct, 'models_cache.json'), JSON.stringify({ models: [{ slug: 'gpt-9', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'ultra' }, { effort: 'bogus' }] }, { slug: 'hidden', visibility: 'hide' }, { slug: 'bad slug!' }, { supported_reasoning_levels: [] }] }));
  assert.deepEqual(a.profileExtras({ configDir: acct }), { modelEfforts: { 'gpt-9': ['low', 'ultra'] } });
  assert.equal(a.home({ configDir: acct }), acct);
  assert.equal(a.home(null), process.env.CODEX_HOME || path.join(home, '.codex'));
  assert.deepEqual(a.resolveModelEffort({ opts: {}, profile: { configDir: acct }, model: 'gpt-9', effort: 'ultra', warn() {} }), { model: 'gpt-9', effort: 'ultra' });
  assert.equal(a.resolveModelEffort({ opts: {}, profile: { configDir: acct }, model: 'gpt-9', effort: 'max', warn() {} }).effort, 'xhigh');
});

/* ---------- codex translator (ADR 0001) ---------- */
async function translator(model = 'gpt-5.5') {
  const opts = baseOpts();
  const prep = await codex().prepare({ id: 'r', run: { model, cwd: opts.cwd }, opts, profile: { ignoreUserConfig: false }, model, effort: '', prompt: 'x', systemPrompt: '', env: {}, warn() {}, tmpDir: '/nope' });
  return { t: prep.translator, cwd: opts.cwd };
}
const feedAll = (t, events) => events.flatMap(e => t.feed(e));

test('codex translator (ADR 0001): thread, text and commands become Claude stream-json system/assistant/user events', async () => {
  const { t, cwd } = await translator();
  assert.deepEqual(t.feed({ type: 'thread.started', thread_id: 'th-1' }), [{ type: 'system', subtype: 'init', session_id: 'th-1', model: 'gpt-5.5', adapter: 'codex', cwd }]);
  assert.deepEqual(t.feed({ type: 'turn.started' }), []);
  assert.deepEqual(t.feed({ type: 'item.started', item: { id: 'c1', type: 'command_execution', command: 'ls' } }), [{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'Bash', input: { command: 'ls' } }] } }]);
  assert.deepEqual(t.feed({ type: 'item.completed', item: { id: 'c1', type: 'command_execution', command: 'ls', aggregated_output: 'a\nb', exit_code: 0 } }), [{ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'a\nb', is_error: false }] } }]);
  assert.deepEqual(t.feed({ type: 'item.completed', item: { id: 'm1', type: 'agent_message', text: 'pronto' } }), [{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'pronto' }] } }]);
  assert.deepEqual(t.feed({ type: 'item.completed', item: { id: 'm2', type: 'agent_message', text: '' } }), []);
});

test('codex translator (ADR 0001): failed commands, files, web search, generic MCP tools; items never started still show the call', async () => {
  const { t } = await translator();
  const done = t.feed({ type: 'item.completed', item: { id: 'c2', type: 'command_execution', command: 'false', aggregated_output: 'x', exit_code: 2 } });
  assert.deepEqual(done.map(e => e.type), ['assistant', 'user'], 'no item.started: the tool_use comes first');
  assert.equal(done[1].message.content[0].is_error, true);
  const file = t.feed({ type: 'item.completed', item: { id: 'f1', type: 'file_change', changes: [{ kind: 'add', path: 'a.js' }, { path: 'b.js' }] } });
  assert.equal(file[0].message.content[0].name, 'Edit');
  assert.equal(file[1].message.content[0].content, 'add a.js\nupdate b.js');
  const web = t.feed({ type: 'item.completed', item: { id: 'w1', type: 'web_search', query: 'node' } });
  assert.deepEqual([web[0].message.content[0].name, web[0].message.content[0].input, web[1].message.content[0].content], ['WebSearch', { query: 'node' }, 'Busca: node']);
  const mcp = t.feed({ type: 'item.completed', item: { id: 'x1', type: 'mcp_tool_call', server: 'docs', tool: 'find', arguments: { q: 1 }, result: { content: [{ type: 'text', text: 'oi' }, { type: 'image' }] } } });
  assert.deepEqual([mcp[0].message.content[0].name, mcp[1].message.content[0].content, mcp[1].message.content[0].is_error], ['mcp__docs__find', 'oi', false]);
  const bad = t.feed({ type: 'item.completed', item: { id: 'x2', type: 'mcp_tool_call', server: 'docs', tool: 'find', error: { message: 'boom' } } });
  assert.deepEqual([bad[1].message.content[0].content, bad[1].message.content[0].is_error], ['boom', true]);
  assert.deepEqual(t.feed({ type: 'item.completed', item: { id: 'r1', type: 'reasoning', text: 'hm' } }), [], 'reasoning is not shown');
  assert.deepEqual(t.feed({ type: 'item.started' }), []);
  assert.deepEqual(t.feed({ type: 'item.completed', item: { id: 'e1', type: 'error', message: 'aviso' } }), [{ type: 'bridge', subtype: 'warning', message: 'aviso' }]);
  const long = t.feed({ type: 'item.completed', item: { id: 'c3', type: 'command_execution', command: 'x', aggregated_output: 'y'.repeat(5000), exit_code: 0 } });
  assert.equal(long[1].message.content[0].content.length, 4001, 'tool output is cut at 4000 characters');
});

test('codex translator (ADR 0001): the squad colleague tool is the Agent tool and openCall() names the open one', async () => {
  const { t } = await translator();
  const call = { id: 'k1', type: 'mcp_tool_call', server: 'squad', tool: 'chamar_colega', arguments: { agente: 'qa', pedido: 'p'.repeat(100) } };
  const started = t.feed({ type: 'item.started', item: call });
  assert.deepEqual(started[0].message.content[0], { type: 'tool_use', id: 'k1', name: 'Agent', input: { subagent_type: 'qa', description: 'p'.repeat(80), prompt: 'p'.repeat(100) } });
  assert.equal(t.openCall(), 'k1');
  const finished = t.feed({ type: 'item.completed', item: { ...call, result: { content: [{ type: 'text', text: 'ok' }] } } });
  assert.deepEqual(finished.map(e => e.type), ['user'], 'started before: no second tool_use');
  assert.equal(t.openCall(), null);
});

test('codex translator (ADR 0001): usage adds up per turn and finish() closes with a result (success, failure, error without turns)', async () => {
  const ok = (await translator()).t;
  feedAll(ok, [{ type: 'thread.started', thread_id: 'th' }, { type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'feito' } },
    { type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 3, reasoning_output_tokens: 1 } }, { type: 'turn.completed', usage: { input_tokens: 5, output_tokens: 1 } }]);
  assert.deepEqual(ok.finish(0, 77), { type: 'result', subtype: 'success', is_error: false, result: 'feito', session_id: 'th', num_turns: 2, duration_ms: 77, total_cost_usd: null,
    usage: { input_tokens: 15, cache_read_input_tokens: 4, cache_creation_input_tokens: 0, output_tokens: 4, reasoning_output_tokens: 1 } });
  assert.deepEqual(ok.state.usage, { input: 15, cacheRead: 4, cacheWrite: 0, output: 4, reasoning: 1 });
  const nonZero = (await translator()).t;
  assert.equal(nonZero.finish(3, 1).is_error, true);
  const failed = (await translator()).t;
  failed.feed({ type: 'turn.failed', error: { message: 'cota' } });
  const r = failed.finish(0, 1);
  assert.deepEqual([r.subtype, r.is_error, r.result], ['error_during_execution', true, 'cota']);
  const errored = (await translator()).t;
  assert.deepEqual(errored.feed({ type: 'error', message: 'queda' }), [{ type: 'bridge', subtype: 'warning', message: 'queda' }]);
  assert.equal(errored.finish(0, 1).result, 'queda');
  assert.equal(errored.finish(0, 1).is_error, true);
  assert.deepEqual((await translator()).t.feed({ type: 'whatever' }), []);
});

/* ---------- codex finish: the session file holds the account's windows and model ---------- */
function writeSession(home, threadId, lines) {
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  const dir = path.join(home, 'sessions', String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `rollout-x-${threadId}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
}
const sessionLines = [
  { type: 'turn_context', payload: { model: 'gpt-real' } },
  { type: 'event_msg', payload: { rate_limits: { primary: { used_percent: 30, window_minutes: 300, resets_at: 1900000000 }, secondary: { used_percent: 55, window_minutes: 10080 } } } },
];

test('codex.finish: result and usage from the translator, model and windows from the session file; refreshWindows reads the newest session', async () => {
  const acct = scratch('squad-ad-sess-');
  const saved = [], a = codex({ saveWindows: (...x) => saved.push(x) });
  const opts = baseOpts();
  const profile = { id: 'p-cx', ignoreUserConfig: false, configDir: acct };
  const prep = await a.prepare({ id: 'r', run: { model: 'gpt-5.5', cwd: opts.cwd }, opts, profile, model: 'gpt-5.5', effort: '', prompt: 'x', systemPrompt: '', env: {}, warn() {}, tmpDir: '/nope' });
  prep.translator.feed({ type: 'thread.started', thread_id: 'thread-1234abcd' });
  prep.translator.feed({ type: 'turn.completed', usage: { input_tokens: 2, output_tokens: 1 } });
  prep.translator.feed({ type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'fim' } });
  writeSession(acct, 'thread-1234abcd', sessionLines);
  const run = { translator: prep.translator, profile, startedAt: new Date(Date.now() - 1000).toISOString() };
  const fin = a.finish(run, { code: 0, durationMs: 10 });
  assert.equal(fin.result.type, 'result');
  assert.equal(fin.result.result, 'fim');
  assert.equal(fin.result.duration_ms, 10);
  assert.deepEqual(fin.usage, { input: 2, cacheRead: 0, cacheWrite: 0, output: 1, reasoning: 0 });
  assert.equal(fin.model, 'gpt-real');
  assert.deepEqual(Object.keys(fin.windows), ['five_hour', 'seven_day']);
  assert.equal(fin.windows.five_hour.utilization, 0.3);
  assert.equal(fin.windows.five_hour.resetsAt, new Date(1900000000 * 1000).toISOString());
  assert.deepEqual(fin.windows.seven_day, { utilization: 0.55, resetsAt: null });
  // refresh: the newest session of the account, recorded through the host with source "refresh"
  assert.deepEqual(await a.refreshWindows(profile), { observed: true });
  assert.equal(saved.length, 1);
  assert.equal(saved[0][0], 'p-cx'); assert.equal(saved[0][2], 'refresh');
  assert.equal(saved[0][1].five_hour.utilization, 0.3);
  assert.deepEqual(await codex({ saveWindows: () => false }).refreshWindows(profile), { observed: false }, 'observed only when the windows were recorded');
  assert.deepEqual(await a.refreshWindows({ id: 'p-none', configDir: scratch('squad-ad-empty-') }), { observed: false });
  // no session file for the thread: the result and usage stay, nothing else
  const lone = a.finish({ translator: prep.translator, profile: { ...profile, configDir: scratch('squad-ad-empty2-') }, startedAt: new Date().toISOString() }, { code: 0, durationMs: 1 });
  assert.deepEqual([lone.model, lone.windows], [undefined, undefined]);
});

test('codex.nativeTelemetry: -c otel.* args, refused when the OTLP headers carry secrets', () => {
  const a = codex(), args = [], warnings = [];
  a.nativeTelemetry({}, {}, { env: {}, args, warn: m => warnings.push(m), base: 'http://otel:4318', cfg: { headersEnv: {} }, content: true, headers: {}, attrs: {} });
  assert.deepEqual(args, ['-c', 'otel.exporter={otlp-http={endpoint="http://otel:4318/v1/logs",protocol="json"}}', '-c', 'otel.trace_exporter={otlp-http={endpoint="http://otel:4318/v1/traces",protocol="json"}}', '-c', 'otel.log_user_prompt=true']);
  const secret = [];
  a.nativeTelemetry({}, {}, { env: {}, args: secret, warn: m => warnings.push(m), base: 'http://o', cfg: { headersEnv: { Authorization: 'TOKEN' } }, content: false, headers: {}, attrs: {} });
  assert.deepEqual(secret, []);
  assert.match(warnings[0], /Telemetria nativa do Codex desligada/);
});

/* ---------- a Perfil whose Adapter is not in the registry ---------- */
const PORT = 4800 + Math.floor(Math.random() * 150);
const bridges = [];
async function startBridge(dataDir, port, tmpRoot = scratch('squad-ad-btmp-')) {
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(port)], {
    cwd: ROOT,
    env: { ...process.env, SQUAD_HOME: scratch('squad-ad-bhome-'), SQUAD_PROJECTS_DIR: scratch('squad-ad-proj-'), SQUAD_DATA_DIR: dataDir, TMPDIR: tmpRoot, SQUAD_CLAUDE_BIN: path.join(ROOT, 'tests', 'fake-claude.mjs'), SQUAD_CODEX_BIN: path.join(ROOT, 'tests', 'fake-codex.mjs'), SQUAD_PRINT_TOKEN: '1', SQUAD_CONFIG: path.join(scratch('squad-ad-cfg-'), 'none.json'), SQUAD_CONFIG_SHARED: path.join(scratch('squad-ad-cfg2-'), 'none.json'), SQUAD_PLUGINS: '' },
  });
  let out = '';
  const token = await new Promise((resolve, reject) => {
    proc.stdout.on('data', d => { out += d; const m = out.match(/TOKEN=(\w+)/); if (m) resolve(m[1]); });
    proc.stderr.on('data', d => { out += d; });
    proc.on('exit', code => reject(new Error(`server exited ${code}\n${out}`)));
    setTimeout(() => reject(new Error(`server start timeout\n${out}`)), 10000);
  });
  const base = `http://127.0.0.1:${port}`;
  const b = {
    proc, base, token, tmpRoot,
    api: (p, init = {}) => fetch(base + p, { ...init, headers: { 'content-type': 'application/json', 'x-squad-token': token, ...(init.headers || {}) } }),
    stop: async () => { if (proc.exitCode === null) { const exited = new Promise(r => proc.once('exit', r)); proc.kill('SIGTERM'); await exited; } },
  };
  bridges.push(b);
  return b;
}
after(async () => { for (const b of bridges) await b.stop(); });

test('Perfil with an unregistered Adapter: a clear error on run and in status.error, while pickProfile and the other Perfis keep working', async () => {
  const dir = scratch('squad-ad-db-');
  const first = await startBridge(dir, PORT);
  const ws = { version: 2, agents: [], projects: [{ id: 'p1', name: 'Adapters' }], squads: [] };
  assert.equal((await first.api('/api/setup', { method: 'POST', body: JSON.stringify(ws) })).status, 201);
  await first.stop();
  const db = new Database(path.join(dir, 'squad.db'));
  try {
    const at = new Date().toISOString();
    db.prepare("INSERT INTO profiles (id, name, adapter, concurrency, telemetry, is_default, created_at, updated_at) VALUES ('ghost', 'Fantasma', 'x-ghost', 1, ?, 0, ?, ?)").run(JSON.stringify(dbModule.TELEMETRY_OFF), at, at);
  } finally { db.close(); }
  const b = await startBridge(dir, PORT + 1);
  const cwd = scratch('squad-ad-work-');
  // the list still works, and the Perfil says why it cannot run
  const list = await (await b.api('/api/profiles')).json();
  assert.equal(list.ok, true);
  const ghost = list.profiles.find(p => p.id === 'ghost');
  assert.equal(ghost.adapter, 'x-ghost');
  assert.match(ghost.status.error, /Adapter "x-ghost"/);
  assert.match(ghost.status.error, /Fantasma/);
  assert.equal(ghost.status.version, null);
  assert.deepEqual(Object.keys(list.adapters), ['claude', 'codex']);
  assert.equal(list.profiles.find(p => p.id === 'claude-default').status.error, null);
  // running on it fails with the same explanation, before taking a slot or spawning anything
  const res = await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'oi', options: { cwd, profile: 'ghost' } }) });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Adapter "x-ghost" do Perfil "Fantasma"/);
  assert.equal((await (await b.api('/api/health')).json()).activeRuns, 0);
  // the Perfil's ceiling is 1: if a slot had been taken before the check, the next attempts would be 429, not the same 400
  for (let i = 0; i < 3; i++) {
    const again = await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'oi', options: { cwd, profile: 'ghost' } }) });
    assert.equal(again.status, 400, `attempt ${i + 2}`);
  }
  const view = (await (await b.api('/api/profiles')).json()).profiles.find(p => p.id === 'ghost');
  assert.equal(view.concurrency, 1);
  assert.equal(view.active, 0);
  assert.deepEqual((await (await b.api('/api/runs')).json()).runs, []);
  // refresh and test on that Perfil answer with an error too, and do not break the bridge
  const refresh = await b.api('/api/profiles/ghost/refresh', { method: 'POST' });
  assert.equal(refresh.status, 400);
  assert.match((await refresh.json()).error, /x-ghost/);
  const test_ = await (await b.api('/api/profiles/ghost/test', { method: 'POST' })).json();
  assert.equal(test_.ok, false);
  assert.match(test_.status.error, /x-ghost/);
  // an unknown profile id still falls to the default, and the built-in Perfis run as before
  const ok = await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'oi', options: { cwd, profile: 'nao-existe' } }) });
  assert.equal(ok.status, 201);
  const health = await (await b.api('/api/health')).json();
  assert.deepEqual(health.engines, { claude: true, codex: true });
  // a new Perfil with that Adapter is refused by name
  const create = await b.api('/api/profiles', { method: 'POST', body: JSON.stringify({ name: 'Outro', adapter: 'x-ghost' }) });
  assert.equal(create.status, 400);
  assert.match((await create.json()).error, /Adapter inválido\. Use claude ou codex\./);
});

/* ---------- argv identical to what the bridge produced before the registry ---------- */
const SETUP_WS = { version: 2, agents: [], projects: [{ id: 'p1', name: 'G' }], squads: [] };
async function readyBridge(port, tmpRoot) {
  const b = await startBridge(scratch('squad-ad-gdb-'), port, tmpRoot);
  assert.equal((await b.api('/api/setup', { method: 'POST', body: JSON.stringify(SETUP_WS) })).status, 201);
  await new Promise(r => setTimeout(r, 500)); // Codex (padrão) is made after the setup
  return b;
}
const post = (b, p, body, method = 'POST') => b.api(p, { method, body: JSON.stringify(body) }).then(r => r.json());

test('argv of claude and codex runs equals the golden captured from server.js at HEAD before the registry (tests/golden-argv.json)', async () => {
  const b = await readyBridge(PORT + 2);
  const extra = scratch('squad-ad-extra-');
  await post(b, '/api/telemetry', { endpoint: 'http://127.0.0.1:9', serviceName: 'g' }, 'PUT');
  const agents = { colega: { description: 'um colega', prompt: 'p' } };
  const full = { project: 'golden', model: 'sonnet', effort: 'high', permissionMode: 'acceptEdits', maxBudgetUsd: 2, tools: ['Read', 'Bash'], allowedTools: ['Bash(ls)'], disallowedTools: ['Edit'], addDirs: [extra], partial: true, agents, forwardSubagents: true, timeoutSec: 100 };
  const got = {};
  const run = async (name, body) => { const r = await post(b, '/api/runs', body); assert.equal(r.ok, true, JSON.stringify(r)); got[name] = r.args; await new Promise(x => setTimeout(x, 400)); };
  await run('claude-full', { prompt: 'p', systemPrompt: 'sys', options: full });
  await run('claude-bare', { prompt: 'p', options: { cwd: extra } });
  const cp = (await post(b, '/api/profiles', { name: 'CX nativo', adapter: 'claude', telemetry: { enabled: true, native: true } })).profile;
  await run('claude-native', { prompt: 'p', systemPrompt: 's', options: { project: 'golden', profile: cp.id } });
  await run('codex-full', { prompt: 'p', systemPrompt: 'sys', options: { ...full, profile: 'codex-default', model: 'gpt-5.5', effort: 'ultra' } });
  await run('codex-readonly', { prompt: 'p', options: { project: 'golden', profile: 'codex-default', tools: ['Read'], permissionMode: 'dontAsk' } });
  await run('codex-claude-model', { prompt: 'p', options: { cwd: extra, profile: 'codex-default', model: 'opus' } });
  const xp = (await post(b, '/api/profiles', { name: 'Codex nativo', adapter: 'codex', ignoreUserConfig: false, telemetry: { enabled: true, native: true, content: true } })).profile;
  await run('codex-native', { prompt: 'p', options: { project: 'golden', profile: xp.id } });
  const cwdOf = got['codex-readonly'][got['codex-readonly'].indexOf('-C') + 1];
  const projRoot = path.dirname(cwdOf);
  assert.equal(path.basename(cwdOf), 'golden');
  let text = JSON.stringify(got);
  for (const [from, to] of [[realpathSync.native(extra), '<EXTRA>'], [extra, '<EXTRA>'], [projRoot, '<PROJ>']]) text = text.split(JSON.stringify(from).slice(1, -1)).join(to);
  const golden = JSON.parse(readFileSync(path.join(ROOT, 'tests', 'golden-argv.json'), 'utf8').split('<PORT>').join(String(PORT + 2)));
  assert.deepEqual(JSON.parse(text), golden);
  // native telemetry: the -c otel.* flags come before the closing "-" (the prompt on stdin)
  const nat = got['codex-native'];
  assert.equal(nat.at(-1), '-');
  assert.equal(nat.filter(x => x === '-').length, 1);
  assert.ok(nat.findLastIndex(x => x.startsWith('otel.')) < nat.length - 1 && nat.some(x => x.startsWith('otel.exporter=')));
});

/* ---------- temp files of a launch that fails ---------- */
test('a launch that fails after the Adapter wrote its temp files removes them (spawn throws synchronously on a NUL in the OTEL service name)', async () => {
  const tmpRoot = scratch('squad-ad-leak-');
  const b = await readyBridge(PORT + 3, tmpRoot);
  await post(b, '/api/telemetry', { endpoint: 'http://127.0.0.1:9', serviceName: 'a\u0000b' }, 'PUT');
  const cp = (await post(b, '/api/profiles', { name: 'Nativo', adapter: 'claude', telemetry: { enabled: true, native: true } })).profile;
  const res = await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'x', systemPrompt: 'sys', options: { project: 'leak', profile: cp.id } }) });
  assert.equal(res.status, 400, await res.clone().text());
  assert.match((await res.json()).error, /null bytes|NUL|invalid/i);
  await new Promise(r => setTimeout(r, 300));
  const bridgeTmp = readdirSync(tmpRoot).filter(n => n.startsWith('squad-code-')).map(n => path.join(tmpRoot, n));
  assert.equal(bridgeTmp.length, 1);
  assert.deepEqual(readdirSync(bridgeTmp[0]).filter(n => /\.(system\.md|settings\.json|agents\.json)$/.test(n)), []);
  assert.equal((await (await b.api('/api/health')).json()).activeRuns, 0);
});
