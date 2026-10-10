// Plugins com código, passos 4 a 7 (docs/plans/plugins.md): schema único do manifesto, descoberta (a mesma dos plugins de conteúdo),
// ordem, carga (plugins/host.js), ctx, rotas, eventos, run:beforeSpawn e registerAdapter.
// `npm test` roda este arquivo junto de bridge.test.mjs e adapters.test.mjs. Portas 4700-4799 (bridge.test.mjs usa outras, adapters 4800+).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, symlinkSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests', 'fixtures', 'plugins');
const require = createRequire(import.meta.url);
const { createPluginLoader, orderPlugins, CONSTANTS, SCHEMAS } = require('../plugins/loader.js');
const { createPluginHost } = require('../plugins/host.js');
const { validate } = require('../schema.js');

delete process.env.CODEX_HOME;
const cleanup = [];
after(() => { for (const d of cleanup) { try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} } });
const scratch = prefix => { const d = mkdtempSync(path.join(tmpdir(), prefix)); cleanup.push(d); return d; };
const fx = id => path.join(FIX, id);
const writeJson = (file, data) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data)); return file; };

/* ---------- schemas e constantes ---------- */
test('schemas: um schema só para o manifesto (conteúdo e código), e os enums batem com CONSTANTS', () => {
  const plugin = SCHEMAS.plugin, cfg = SCHEMAS.config;
  assert.ok(plugin, 'SCHEMAS.plugin');
  // Um manifesto, um schema: squad-plugin.json traz conteúdo, código ou os dois.
  assert.deepEqual(Object.keys(SCHEMAS).sort(), ['agent', 'config', 'plugin']);
  assert.deepEqual(readdirSync(path.join(ROOT, 'schemas')).sort(), ['squad-agent.schema.json', 'squad-plugin.schema.json', 'squad.schema.json']);
  assert.deepEqual(Object.keys(plugin.properties), ['$schema', 'id', 'name', 'version', 'description', 'apiVersion', 'server', 'requires', 'capabilities', 'env', 'configSchema', 'categories', 'avatars', 'themes', 'runtime', 'conventions']);
  assert.deepEqual(plugin.required, ['id']);
  assert.equal(plugin.properties.id.pattern, CONSTANTS.PLUGIN_ID_RE.source);

  assert.deepEqual(CONSTANTS.PLUGIN_CAPABILITIES, ['run.mutate', 'adapter', 'adapter.override', 'run.content', 'workspace.read']);
  assert.deepEqual(CONSTANTS.PLUGIN_EVENTS, ['run:start', 'run:event', 'run:finish', 'profile:usage', 'workspace:saved', 'run:beforeSpawn']);
  assert.deepEqual(plugin.properties.capabilities.items.enum, CONSTANTS.PLUGIN_CAPABILITIES);
  assert.deepEqual(cfg.$defs.pluginEntry.properties.grants.items.enum, CONSTANTS.PLUGIN_CAPABILITIES);
  assert.equal(cfg.properties.plugins.properties.enabled.items.pattern, CONSTANTS.PLUGIN_ID_RE.source);
  assert.deepEqual(Object.keys(cfg.properties.plugins.properties), ['paths', 'disabled', 'enabled', 'hookTimeoutMs', 'entries']);
  assert.deepEqual(Object.keys(cfg.$defs.pluginEntry.properties), ['grants', 'settings', 'failClosed']);
  const plan = readFileSync(path.join(ROOT, 'docs', 'plans', 'plugins.md'), 'utf8');
  for (const ev of CONSTANTS.PLUGIN_EVENTS) assert.ok(plan.includes('`' + ev + '`'), `evento ${ev} no plano`);
  for (const cap of CONSTANTS.PLUGIN_CAPABILITIES) assert.ok(plan.includes(cap), `capability ${cap} no plano`);

  // O validador aceita um manifesto completo (código e conteúdo) e aponta o caminho do erro.
  assert.deepEqual(validate(plugin, { id: 'abc', apiVersion: 1, server: 'x.mjs', requires: ['def'], capabilities: ['run.mutate'], env: ['A_B'], configSchema: { type: 'object' }, categories: [{ key: 'k' }] }), []);
  const errs = validate(plugin, { id: 'A', apiVersion: 0, capabilities: ['root'], env: ['1x'], server: '' }).map(e => e.path).sort();
  assert.deepEqual(errs, ['apiVersion', 'capabilities[0]', 'env[0]', 'id', 'server']);
  assert.deepEqual(validate(cfg, { plugins: { paths: ['a'], disabled: ['b'], enabled: ['abc'], hookTimeoutMs: 3000, entries: { abc: { grants: ['adapter'], settings: { a: 1 }, failClosed: true } } } }), []);
  assert.deepEqual(validate(cfg, { plugins: { enabled: ['A'], hookTimeoutMs: 5, entries: { abc: { grants: ['x'], extra: 1 } } } }).map(e => e.path).sort(), ['plugins.enabled[0]', 'plugins.entries.abc.extra', 'plugins.entries.abc.grants[0]', 'plugins.hookTimeoutMs']);
});

/* ---------- orderPlugins ---------- */
test('orderPlugins: Kahn com desempate alfabético, ciclo vira aviso, dependência ausente ou desligada desliga o dependente', () => {
  const p = (id, requires = [], enabled = true) => ({ id, requires, enabled });
  assert.deepEqual(orderPlugins([]), { order: [], disabled: [], warnings: [] });
  // sem dependências: alfabética, qualquer que seja a ordem de entrada
  assert.deepEqual(orderPlugins([p('c'), p('a'), p('b')]).order, ['a', 'b', 'c']);
  // topológica: c vem antes de a (a requires c); b sem dependência fica na vez alfabética
  const topo = orderPlugins([p('a', ['c']), p('b'), p('c'), p('d', ['a'])]);
  assert.deepEqual(topo.order, ['b', 'c', 'a', 'd']);
  assert.deepEqual(topo.warnings, []);
  // determinística: embaralhar a entrada não muda o resultado
  assert.deepEqual(orderPlugins([p('d', ['a']), p('c'), p('b'), p('a', ['c'])]).order, topo.order);
  // ciclo: aviso, e os membros (com quem depende deles) ficam desligados
  const cyc = orderPlugins([p('x', ['y']), p('y', ['x']), p('free'), p('z', ['x'])]);
  assert.deepEqual(cyc.order, ['free'], 'fail-closed: ninguém do ciclo (nem quem depende dele) carrega');
  assert.equal(cyc.warnings.length, 1);
  assert.match(cyc.warnings[0], /ciclo.*x, y; os membros do ciclo ficam desligados/i);
  assert.deepEqual(cyc.disabled.map(d => [d.id, d.reason]), [['x', 'cycle'], ['y', 'cycle'], ['z', 'requires']]);
  assert.match(cyc.disabled[2].message, /ciclo \(x, y\)/);
  const self = orderPlugins([p('self', ['self'])]);
  assert.equal(self.warnings.length, 1); assert.deepEqual(self.order, []);
  // dependência ausente desliga o dependente, e o efeito é transitivo
  const miss = orderPlugins([p('a', ['nada']), p('b', ['a']), p('c')]);
  assert.deepEqual(miss.order, ['c']);
  assert.deepEqual(miss.disabled.map(d => d.id), ['a', 'b']);
  assert.equal(miss.disabled[0].reason, 'requires');
  assert.match(miss.disabled[0].message, /nada/);
  assert.match(miss.disabled[1].message, /"a"/);
  // dependência desligada
  const off = orderPlugins([p('a', [], false), p('b', ['a']), p('c', ['b']), p('d')]);
  assert.deepEqual(off.order, ['d']);
  assert.deepEqual(off.disabled.map(d => [d.id, d.reason]), [['a', 'off'], ['b', 'requires'], ['c', 'requires']]);
  // repetição em requires não conta duas vezes
  assert.deepEqual(orderPlugins([p('a', ['b', 'b']), p('b')]).order, ['b', 'a']);
});

/* ---------- carregador: configuração `plugins` e descoberta ---------- */
function loaderFor({ shared, local, home = scratch('squad-pl-home-'), root = scratch('squad-pl-root-'), env = {} } = {}) {
  const cfgDir = scratch('squad-pl-cfg-');
  const sharedFile = path.join(cfgDir, 'shared', 'squad.config.json'), localFile = path.join(cfgDir, 'local', 'squad.local.json');
  if (shared !== undefined) writeJson(sharedFile, shared);
  if (local !== undefined) writeJson(localFile, local);
  const loader = createPluginLoader({ root, home, cwd: cfgDir, env: { SQUAD_CONFIG: localFile, SQUAD_CONFIG_SHARED: sharedFile, ...env } });
  return { loader, sharedFile, localFile, home, root, cfgDir };
}
const warnText = r => r.page.warnings.join('\n');

test('plugins na configuração: paths concatenados relativos ao arquivo, enabled do último arquivo local, entries por id', () => {
  const cfgDir = scratch('squad-pl-merge-');
  const shared = writeJson(path.join(cfgDir, 'a', 'shared.json'), { plugins: { paths: ['../plugs/one'], hookTimeoutMs: 1500, entries: { hello: { settings: { greeting: 'x' }, failClosed: true } } } });
  const local = writeJson(path.join(cfgDir, 'b', 'local.json'), { plugins: { paths: ['two', '~/three'], enabled: ['hello', 'zzz'], hookTimeoutMs: 2500, entries: { hello: { grants: ['run.mutate'], settings: { greeting: 'y' } }, other: { grants: ['adapter'] } } } });
  const home = scratch('squad-pl-home-');
  const r = createPluginLoader({ root: cfgDir, home, cwd: cfgDir, env: { SQUAD_CONFIG: local, SQUAD_CONFIG_SHARED: shared } }).load();
  const cfg = r.discovery.config;
  assert.deepEqual(cfg.paths.map(p => [p.path, p.local]), [[path.join(cfgDir, 'plugs', 'one'), false], [path.join(cfgDir, 'b', 'two'), true], [path.join(home, 'three'), true]]);
  assert.deepEqual(cfg.enabled, ['hello', 'zzz']);
  assert.equal(cfg.hookTimeoutMs, 2500);
  assert.deepEqual(cfg.entries.hello, { settings: { greeting: 'y' }, grants: ['run.mutate'] }, 'settings/failClosed/hookTimeoutMs do compartilhado não valem');
  assert.match(r.discovery.warnings.join('\n'), /plugins\.entries\.hello\.failClosed só vale no arquivo local/);
  assert.match(r.discovery.warnings.join('\n'), /"plugins\.hookTimeoutMs" só vale no arquivo local/);
  assert.deepEqual(cfg.entries.other, { grants: ['adapter'] });
  assert.deepEqual(r.api.config.enabled, ['hello', 'zzz']);
  assert.ok(!('entries' in r.api.config), 'as settings ficam fora de /api/plugins');
});

test('decisão 2: enabled e grants no arquivo compartilhado são ignorados com aviso; plugin com server num path compartilhado é recusado', () => {
  const { loader, sharedFile } = loaderFor({
    shared: { plugins: { paths: [fx('hello'), fx('content-only')], enabled: ['hello'], entries: { hello: { grants: ['run.mutate'], settings: { greeting: 'compartilhado' } } } } },
    local: { plugins: { enabled: ['route-echo'] } },
  });
  const r = loader.load(), w = warnText(r);
  assert.deepEqual(r.discovery.config.enabled, ['route-echo'], 'enabled do compartilhado não vale');
  assert.equal(r.discovery.config.entries.hello.grants, undefined);
  assert.equal(r.discovery.config.entries.hello.settings, undefined, 'settings do compartilhado não valem');
  assert.match(w, /plugins\.entries\.hello\.settings só vale no arquivo local/);
  assert.match(w, /squad\.config\.json: "plugins\.enabled" só vale no arquivo local/);
  assert.match(w, /plugins\.entries\.hello\.grants só vale no arquivo local/);
  const hello = r.discovery.plugins.find(p => p.id === 'hello');
  assert.equal(hello.status, 'blocked');
  assert.match(hello.error, /só .* configuração local/);
  assert.match(w, /\[hello\].*plugin ignorado/);
  // o plugin só de dados do mesmo arquivo compartilhado entra normalmente
  const data = r.discovery.plugins.find(p => p.id === 'content-only');
  assert.equal(data.hasCode, false); assert.equal(data.status, undefined);
  assert.deepEqual(r.page.plugins.map(p => p.id), ['content-only'], 'só o conteúdo entra na página');
  assert.ok(sharedFile.endsWith('squad.config.json'));
});

test('plugin só de conteúdo vai para a página sem enabled; com código, o conteúdo só conta com enabled; id repetido é aviso', () => {
  const res = loaderFor({ local: { plugins: { paths: [fx('content-only')] } } }).loader.load();
  const content = res.page.plugins.find(p => p.id === 'content-only');
  assert.equal(content.hasCode, false);
  assert.equal(res.count, 1);
  assert.deepEqual(content.presets.map(x => x.name), ['PLG-1']);
  assert.deepEqual(content.categories.map(c => c.key), ['po-cat']);
  assert.equal(res.api.plugins[0].id, 'content-only');
  assert.deepEqual(res.discovery.plugins.map(p => [p.id, p.hasCode, p.source]), [['content-only', false, 'config']]);
  assert.deepEqual(res.discovery.warnings, []);

  // código e conteúdo no mesmo manifesto: sem enabled o conteúdo não é lido; com enabled entra (hasCode: true)
  const off = loaderFor({ local: { plugins: { paths: [fx('code-and-content')] } } }).loader.load();
  assert.deepEqual(off.page.plugins, []);
  assert.equal(off.discovery.plugins[0].hasCode, true); assert.equal(off.discovery.plugins[0].content, null);
  const on = loaderFor({ local: { plugins: { paths: [fx('code-and-content')], enabled: ['code-and-content'] } } }).loader.load();
  const both = on.page.plugins[0];
  assert.equal(both.hasCode, true);
  assert.deepEqual(both.categories.map(c => c.key), ['cc-cat']);
  assert.deepEqual(both.presets.map(x => x.name), ['CAC-1']);
  assert.deepEqual(on.page.runtime, { timeoutSec: 77 });
  assert.ok(on.discovery.plugins[0].serverFile.endsWith('server.mjs'));
  // do arquivo compartilhado, um plugin com código fica bloqueado (nem o conteúdo entra)
  const shared = loaderFor({ shared: { plugins: { paths: [fx('code-and-content')] } }, local: { plugins: { enabled: ['code-and-content'] } } }).loader.load();
  assert.deepEqual(shared.page.plugins, []);
  assert.equal(shared.discovery.plugins[0].status, 'blocked');

  // outro plugin repetindo o id: aviso e ignorado
  const copy = scratch('squad-pl-copy-'); cpSync(fx('content-only'), path.join(copy, 'again'), { recursive: true });
  const twice = loaderFor({ local: { plugins: { paths: [fx('content-only'), path.join(copy, 'again')] } } }).loader.load();
  assert.equal(twice.page.plugins.length, 1);
  assert.match(warnText(twice), /id content-only repetido \(já carregado de .*\); plugin ignorado/);
  assert.deepEqual(twice.discovery.plugins.map(p => p.status), [undefined, 'invalid']);
  assert.match(twice.discovery.plugins[1].error, /id repetido/);
  assert.notEqual(twice.discovery.plugins[0].key, twice.discovery.plugins[1].key, 'chave estável por pasta');
  assert.match(twice.discovery.warnings.join('\n'), /id content-only aparece em 2 pastas/);
});

test('manifesto: inválido, apiVersion maior, server fora da pasta ou com extensão errada, JSON quebrado', () => {
  const base = scratch('squad-pl-bad-');
  writeJson(path.join(base, 'broken', 'squad-plugin.json'), '{ nope');
  writeJson(path.join(base, 'no-id', 'squad-plugin.json'), { name: 'sem id' });
  writeJson(path.join(base, 'future', 'squad-plugin.json'), { id: 'future', apiVersion: 2, server: 'server.mjs' });
  writeJson(path.join(base, 'future', 'server.mjs'), 'export function register() {}');
  writeJson(path.join(base, 'caps', 'squad-plugin.json'), { id: 'caps', server: 'server.mjs', capabilities: ['root'], mood: 1 });
  writeJson(path.join(base, 'escape', 'squad-plugin.json'), { id: 'escape', server: '../broken/squad-plugin.json' });
  writeJson(path.join(base, 'ts', 'squad-plugin.json'), { id: 'ts-plug', server: 'server.ts' });
  writeJson(path.join(base, 'ts', 'server.ts'), '');
  writeJson(path.join(base, 'missing', 'squad-plugin.json'), { id: 'missing', server: 'nada.mjs' });
  const outside = scratch('squad-pl-out-'); writeJson(path.join(outside, 'evil.mjs'), 'export function register() {}');
  writeJson(path.join(base, 'link', 'squad-plugin.json'), { id: 'link-plug', server: 'evil.mjs' });
  symlinkSync(path.join(outside, 'evil.mjs'), path.join(base, 'link', 'evil.mjs'));
  const names = ['broken', 'no-id', 'future', 'caps', 'escape', 'ts', 'missing', 'link', 'nao-existe'];
  const r = loaderFor({ local: { plugins: { paths: names.map(n => path.join(base, n)) } } }).loader.load(), w = warnText(r);
  assert.match(w, /broken.*squad-plugin\.json: JSON inválido; plugin ignorado/);
  assert.match(w, /no-id.*id ausente ou inválido/);
  assert.match(w, /\[future\].*apiVersion 2.*oferece 1/);
  assert.match(w, /\[caps\].*capabilities\[0\]/);
  assert.match(w, /\[caps\].*campo "mood" desconhecido/);
  assert.match(w, /\[escape\].*server:.*fora da pasta do plugin/);
  assert.match(w, /\[ts-plug\].*server:.*extensão não aceita \(\.ts\)/);
  assert.match(w, /\[missing\].*server:.*não encontrado/);
  assert.match(w, /\[link-plug\].*server:.*fora da pasta do plugin/);
  assert.match(w, /nao-existe.*pasta do plugin não encontrada/);
  const byId = Object.fromEntries(r.discovery.plugins.map(p => [p.id, p]));
  assert.deepEqual(Object.keys(byId).sort(), ['caps', 'escape', 'future', 'link-plug', 'missing', 'ts-plug']);
  for (const p of Object.values(byId)) assert.equal(p.status, 'invalid', p.id);
  assert.match(byId.future.error, /apiVersion 2/);
});

test('pasta do home: ~/.squad-code/plugins/<id>/ vale, pasta com nome diferente do id é recusada; vale como configuração local', () => {
  const home = scratch('squad-pl-homedir-');
  const dir = path.join(home, '.squad-code', 'plugins');
  cpSync(fx('hello'), path.join(dir, 'hello'), { recursive: true });
  cpSync(fx('route-echo'), path.join(dir, 'outro-nome'), { recursive: true });
  cpSync(fx('content-only'), path.join(dir, 'content-only'), { recursive: true });
  const r = loaderFor({ home }).loader.load(), w = warnText(r);
  assert.deepEqual(r.discovery.plugins.map(p => p.id), ['content-only', 'hello']);
  assert.match(w, /outro-nome.*pasta "outro-nome" deve ter o nome do id "route-echo"; plugin ignorado/);
  const hello = r.discovery.plugins.find(p => p.id === 'hello');
  assert.equal(hello.source, 'home'); assert.equal(hello.local, true); assert.equal(hello.status, undefined);
  assert.equal(hello.manifest.server, 'server.mjs');
  assert.ok(hello.serverFile.endsWith(path.join('hello', 'server.mjs')));
  assert.deepEqual(r.page.plugins.map(p => p.id), ['content-only'], 'hello não está em enabled: nada dele na página');
  // sem a pasta do home, nada
  assert.deepEqual(loaderFor({}).loader.load().discovery.plugins, []);
});

test('o carregador relê plugins quando um arquivo muda; limite de 20 plugins', () => {
  const home = scratch('squad-pl-reload-');
  const dir = path.join(home, '.squad-code', 'plugins');
  const { loader } = loaderFor({ home });
  assert.deepEqual(loader.load().discovery.plugins, []);
  cpSync(fx('hello'), path.join(dir, 'hello'), { recursive: true });
  assert.deepEqual(loader.load().discovery.plugins.map(p => p.id), ['hello']);
  for (let i = 0; i < 22; i++) writeJson(path.join(dir, `plug-${String(i).padStart(2, '0')}`, 'squad-plugin.json'), { id: `plug-${String(i).padStart(2, '0')}` });
  const r = loader.load();
  assert.equal(r.discovery.plugins.length, 20);
  assert.match(warnText(r), /mais de 20 plugins/);
});

/* ---------- bridge ---------- */
const PORT0 = 4700 + Math.floor(Math.random() * 15);
let portN = 0;
const bridges = [];
/** Starts server.js with temporary SQUAD_HOME / SQUAD_CONFIG / SQUAD_CONFIG_SHARED. `local`/`shared`: configuration objects (or null = no file). */
async function startBridge({ local = null, shared = null, env = {}, port = PORT0 + portN++, home = scratch('squad-pl-bhome-'), data = scratch('squad-pl-bdata-'), expectExit = false } = {}) {
  const cfgDir = scratch('squad-pl-bcfg-');
  const localFile = path.join(cfgDir, 'local.json'), sharedFile = path.join(cfgDir, 'shared.json');
  writeJson(localFile, local || {}); // always there: a missing SQUAD_CONFIG file is a warning of its own
  if (shared) writeJson(sharedFile, shared);
  const tmp = scratch('squad-pl-btmp-');
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(port)], {
    cwd: ROOT,
    env: { ...process.env, SQUAD_HOME: home, SQUAD_PROJECTS_DIR: scratch('squad-pl-bproj-'), SQUAD_DATA_DIR: data, TMPDIR: tmp, SQUAD_CLAUDE_BIN: path.join(ROOT, 'tests', 'fake-claude.mjs'), SQUAD_CODEX_BIN: path.join(ROOT, 'tests', 'fake-codex.mjs'), SQUAD_PRINT_TOKEN: '1', SQUAD_CONFIG: localFile, SQUAD_CONFIG_SHARED: sharedFile, SQUAD_PLUGINS: '', ...env },
  });
  let out = '';
  const exited = new Promise(r => proc.once('exit', code => r(code)));
  proc.stdout.on('data', d => { out += d; });
  proc.stderr.on('data', d => { out += d; });
  const token = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`server start timeout\n${out}`)), 10000);
    const poll = setInterval(() => { const m = out.match(/TOKEN=(\w+)/); if (m) { clearInterval(poll); clearTimeout(t); resolve(m[1]); } }, 20);
    exited.then(code => { clearInterval(poll); clearTimeout(t); expectExit ? resolve(null) : reject(new Error(`server exited ${code}\n${out}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const b = {
    proc, base, token, port, data, home, tmp, out: () => out, exited,
    api: (p, init = {}) => fetch(base + p, { ...init, headers: { 'content-type': 'application/json', 'x-squad-token': token, ...(init.headers || {}) } }),
    json: async (p, init) => (await b.api(p, init)).json(),
    stop: async () => { if (proc.exitCode === null) { proc.kill('SIGTERM'); } return exited; },
  };
  bridges.push(b);
  return b;
}
after(async () => { for (const b of bridges) await b.stop(); });
const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('waitFor timeout'); await new Promise(r => setTimeout(r, 25)); } };
const rawRequest = (port, pathname, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: pathname, method: 'GET', headers }, res => { let d = ''; res.on('data', c => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
  req.on('error', reject); req.end();
});
const byId = body => Object.fromEntries(body.plugins.map(p => [p.id, p]));

test('zero plugins: /api/plugins vazio, health com plugins 0, linha "Plugins: nenhum" e rotas de plugin caem no 404 do núcleo', async () => {
  const b = await startBridge();
  assert.equal((await fetch(b.base + '/api/plugins')).status, 401);
  const body = await b.json('/api/plugins');
  assert.deepEqual(Object.keys(body), ['ok', 'plugins', 'runtime', 'warnings', 'config', 'restartRequired']);
  assert.deepEqual([body.ok, body.plugins, body.runtime, body.warnings, body.restartRequired], [true, [], {}, [], false]);
  assert.equal((await b.json('/api/health')).plugins, 0);
  await waitFor(() => /Plugins: nenhum/.test(b.out()));
  const miss = await b.api('/api/plugins/nada/x');
  assert.equal(miss.status, 404);
  assert.deepEqual(await miss.json(), { ok: false, error: 'Rota não encontrada.' });
  // o núcleo segue igual
  assert.deepEqual(await b.json('/api/runs'), { ok: true, runs: [] });
});

test('plugin só de conteúdo: aparece em /api/plugins (status data, com o resumo do conteúdo) e na página, sem exigir enabled', async () => {
  const b = await startBridge({ local: { plugins: { paths: [fx('content-only')] } } });
  const body = await b.json('/api/plugins');
  assert.equal(body.plugins.length, 1);
  const p = body.plugins[0];
  assert.deepEqual({ id: p.id, name: p.name, version: p.version, status: p.status, hasCode: p.hasCode, error: p.error, requires: p.requires }, { id: 'content-only', name: 'Só conteúdo', version: '0.1.0', status: 'data', hasCode: false, error: '', requires: [] });
  assert.deepEqual(p.presets.map(x => x.name), ['PLG-1']);
  assert.deepEqual(p.categories.map(c => c.key), ['po-cat']);
  assert.deepEqual(p.capabilities, { asked: [], granted: [], missing: [] });
  assert.deepEqual([p.routes, p.events, p.adapters, p.warnings], [[], [], [], []]);
  assert.equal((await b.json('/api/health')).plugins, 1);
  const html = await (await fetch(b.base + '/')).text();
  assert.match(html, /"id":"content-only"/);
});

test('plugin com código: só é importado se estiver em enabled; not-enabled nunca roda (nem o import)', async () => {
  const marker = path.join(scratch('squad-pl-mark-'), 'marker.txt');
  const b = await startBridge({
    local: { plugins: { paths: [fx('hello'), fx('not-enabled')], enabled: ['hello'] } },
    env: { SQUAD_PLUGIN_MARKER: marker },
  });
  const plugins = byId(await b.json('/api/plugins'));
  assert.equal(plugins.hello.status, 'active');
  assert.equal(plugins['not-enabled'].status, 'disabled');
  assert.equal(plugins['not-enabled'].error, '');
  assert.equal(readFileSync(marker, 'utf8'), 'register hello\n');
  assert.equal((await b.api('/api/plugins/not-enabled/x')).status, 404);
  assert.equal((await b.json('/api/health')).plugins, 1);
  await waitFor(() => /Plugins: .*hello 1\.0\.0/.test(b.out()));
  assert.match(b.out(), /Plugins: .*not-enabled.*desligado/);
  assert.match(b.out(), /\[plugin hello\] olá do hello/);
});

test('decisão 3: a segunda instância na porta ocupada não importa nem roda register', async () => {
  const marker = path.join(scratch('squad-pl-mark-'), 'marker.txt');
  const cfg = { plugins: { paths: [fx('hello')], enabled: ['hello'] } };
  const first = await startBridge({ local: cfg, env: { SQUAD_PLUGIN_MARKER: marker } });
  await first.json('/api/plugins');
  assert.equal(readFileSync(marker, 'utf8'), 'register hello\n');
  const second = await startBridge({ local: cfg, env: { SQUAD_PLUGIN_MARKER: marker }, port: first.port, expectExit: true });
  assert.equal(await second.exited, 1);
  assert.match(second.out(), /porta .* já está em uso/);
  assert.equal(readFileSync(marker, 'utf8'), 'register hello\n', 'um único register');
  assert.ok((await first.api('/api/health')).ok);
});

test('hello: settings congeladas, secret só do env declarado, dataDir preguiçoso, ctx congela, onDispose no shutdown', async () => {
  const data = scratch('squad-pl-hdata-');
  const b = await startBridge({
    data, local: { plugins: { paths: [fx('hello')], enabled: ['hello'], entries: { hello: { settings: { greeting: 'salve' } } } } },
    env: { HELLO_SECRET: 's3gredo' },
  });
  assert.ok(!existsSync(path.join(data, 'plugins')), 'nada em disco antes de dataDir()');
  const hello = await b.json('/api/plugins/hello/hello');
  assert.deepEqual(hello, { greeting: 'salve', frozen: true, secret: 's3gredo', caps: false });
  const other = await b.json('/api/plugins/hello/other-secret');
  assert.match(other.error, /PATH.*env/);
  const dir = (await b.json('/api/plugins/hello/data-dir')).dir;
  assert.equal(dir, path.join(data, 'plugins', 'hello'));
  assert.ok(existsSync(dir));
  const late = await b.json('/api/plugins/hello/late');
  assert.equal(late.threw, true); assert.match(late.message, /congelado/);
  const listed = byId(await b.json('/api/plugins')).hello;
  assert.deepEqual(listed.routes, ['GET /api/plugins/hello/hello', 'GET /api/plugins/hello/other-secret', 'GET /api/plugins/hello/data-dir', 'GET /api/plugins/hello/late']);
  assert.equal(listed.source, 'config');
  assert.equal(listed.path, fx('hello'));
  await b.stop();
  assert.equal(readFileSync(path.join(dir, 'disposed.txt'), 'utf8'), 'bye');
});

test('throws-on-register fica isolado: status error, rota removida, o bridge e os outros plugins seguem; dependente é desligado', async () => {
  const marker = path.join(scratch('squad-pl-mark-'), 'marker.txt');
  const b = await startBridge({ local: { plugins: { paths: [fx('throws-on-register'), fx('hello'), fx('route-echo')], enabled: ['throws-on-register', 'hello', 'route-echo'] } }, env: { SQUAD_PLUGIN_MARKER: marker } });
  const plugins = byId(await b.json('/api/plugins'));
  assert.match(readFileSync(marker, 'utf8'), /dispose throws-on-register/, 'o onDispose registrado antes do erro rodou');
  assert.equal(plugins['throws-on-register'].status, 'error');
  assert.match(plugins['throws-on-register'].error, /falhou de propósito/);
  assert.deepEqual(plugins['throws-on-register'].routes, []);
  assert.equal(plugins.hello.status, 'active'); assert.equal(plugins['route-echo'].status, 'active');
  const half = await b.api('/api/plugins/throws-on-register/half');
  assert.equal(half.status, 404);
  assert.match((await half.json()).error, /não está ativo.*error/);
  assert.equal((await b.json('/api/health')).plugins, 2);
  assert.ok((await b.json('/api/plugins/hello/hello')).greeting);
});

test('register que não termina: tempo limite, status error', async () => {
  const marker = path.join(scratch('squad-pl-mark-'), 'marker.txt');
  const b = await startBridge({ local: { plugins: { paths: [fx('hangs-on-register'), fx('hello')], enabled: ['hangs-on-register', 'hello'] } }, env: { SQUAD_PLUGIN_REGISTER_TIMEOUT_MS: '300', SQUAD_PLUGIN_MARKER: marker } });
  const plugins = byId(await b.json('/api/plugins'));
  assert.equal(plugins['hangs-on-register'].status, 'error');
  assert.match(plugins['hangs-on-register'].error, /tempo limite/i);
  assert.deepEqual(plugins['hangs-on-register'].routes, [], 'o que registrou foi desfeito');
  assert.equal(plugins.hello.status, 'active');
  assert.match(readFileSync(marker, 'utf8'), /dispose hangs-on-register/);
  await waitFor(() => /late-/.test(readFileSync(marker, 'utf8')));
  const lines = readFileSync(marker, 'utf8');
  assert.match(lines, /late-refused hangs/); assert.doesNotMatch(lines, /late-registered/);
  assert.equal((await b.api('/api/plugins/hangs-on-register/tarde')).status, 404);
});

test('bad-settings: settings inválidas pelo configSchema desligam o plugin sem rodar register', async () => {
  const marker = path.join(scratch('squad-pl-mark-'), 'marker.txt');
  const b = await startBridge({ local: { plugins: { paths: [fx('bad-settings')], enabled: ['bad-settings'], entries: { 'bad-settings': { settings: { token: '' } } } } }, env: { SQUAD_PLUGIN_MARKER: marker } });
  const p = byId(await b.json('/api/plugins'))['bad-settings'];
  assert.equal(p.status, 'error');
  assert.match(p.error, /settings inválidas.*token/);
  assert.ok(!existsSync(marker), 'register não rodou');
  // sem settings nenhuma, o campo obrigatório também falta
  const c = await startBridge({ local: { plugins: { paths: [fx('bad-settings')], enabled: ['bad-settings'] } } });
  assert.match(byId(await c.json('/api/plugins'))['bad-settings'].error, /settings inválidas.*token/);
  // settings válidas: carrega
  const d = await startBridge({ local: { plugins: { paths: [fx('bad-settings')], enabled: ['bad-settings'], entries: { 'bad-settings': { settings: { token: 'x' } } } } } });
  assert.equal(byId(await d.json('/api/plugins'))['bad-settings'].status, 'active');
  // acima de 16 KB
  const e = await startBridge({ local: { plugins: { paths: [fx('hello')], enabled: ['hello'], entries: { hello: { settings: { greeting: 'x', pad: 'y'.repeat(17000) } } } } } });
  assert.match(byId(await e.json('/api/plugins')).hello.error, /16 KB/);
});

test('capabilities: interseção pedido x grants; registrar sem grant lança "Capacidade ... não concedida" e o plugin fica denied', async () => {
  const none = await startBridge({ local: { plugins: { paths: [fx('no-grant')], enabled: ['no-grant'] } } });
  const denied = byId(await none.json('/api/plugins'))['no-grant'];
  assert.equal(denied.status, 'denied');
  assert.match(denied.error, /Capacidade "run\.mutate" não concedida/);
  assert.deepEqual(denied.capabilities, { asked: ['run.mutate'], granted: [], missing: ['run.mutate'] });
  assert.deepEqual(denied.routes, [], 'o que registrou antes foi desfeito');
  // grants que o manifesto não pediu não valem; o pedido concedido vale
  const some = await startBridge({ local: { plugins: { paths: [fx('no-grant'), fx('hello')], enabled: ['no-grant', 'hello'], entries: { 'no-grant': { grants: ['run.mutate', 'adapter'] }, hello: { grants: ['run.mutate'] } } } } });
  const plugins = byId(await some.json('/api/plugins'));
  assert.equal(plugins['no-grant'].status, 'active');
  assert.deepEqual(plugins['no-grant'].capabilities, { asked: ['run.mutate'], granted: ['run.mutate'], missing: [] });
  assert.deepEqual(plugins['no-grant'].events, ['run:beforeSpawn']);
  assert.deepEqual(plugins.hello.capabilities, { asked: [], granted: [], missing: [] });
  assert.equal((await some.json('/api/plugins/hello/hello')).caps, false, 'hasCapability só vê o concedido');
  // grants no arquivo compartilhado não valem
  const shared = await startBridge({ shared: { plugins: { entries: { 'no-grant': { grants: ['run.mutate'] } } } }, local: { plugins: { paths: [fx('no-grant')], enabled: ['no-grant'] } } });
  assert.equal(byId(await shared.json('/api/plugins'))['no-grant'].status, 'denied');
  assert.match((await shared.json('/api/plugins')).warnings.join('\n'), /grants só vale no arquivo local/);
});

test('requires: ctx.use devolve o retorno do register da dependência (que carrega antes); ausente ou desligada desliga o dependente', async () => {
  const ok = await startBridge({ local: { plugins: { paths: [fx('needs-hello'), fx('hello')], enabled: ['needs-hello', 'hello'] } } });
  const plugins = byId(await ok.json('/api/plugins'));
  assert.equal(plugins['needs-hello'].status, 'active');
  assert.deepEqual(plugins['needs-hello'].requires, ['hello']);
  assert.deepEqual(await ok.json('/api/plugins/needs-hello/greet'), { text: 'oi, mundo' });
  assert.deepEqual(await ok.json('/api/plugins/needs-hello/not-required'), { threw: true });
  const off = await startBridge({ local: { plugins: { paths: [fx('needs-hello'), fx('hello')], enabled: ['needs-hello'] } } });
  const p = byId(await off.json('/api/plugins'));
  assert.equal(p.hello.status, 'disabled');
  assert.equal(p['needs-hello'].status, 'disabled');
  assert.match(p['needs-hello'].error, /depende de "hello", que está desligado/);
  const gone = await startBridge({ local: { plugins: { paths: [fx('needs-hello')], enabled: ['needs-hello'] } } });
  assert.match(byId(await gone.json('/api/plugins'))['needs-hello'].error, /"hello", que não existe/);
  // a dependência falha: o dependente é desligado, não importado
  const dir = scratch('squad-pl-dep-'); cpSync(fx('needs-hello'), path.join(dir, 'needs-hello'), { recursive: true });
  writeJson(path.join(dir, 'needs-hello', 'squad-plugin.json'), { id: 'needs-hello', server: 'server.mjs', requires: ['throws-on-register'] });
  const failed = await startBridge({ local: { plugins: { paths: [path.join(dir, 'needs-hello'), fx('throws-on-register')], enabled: ['needs-hello', 'throws-on-register'] } } });
  const f = byId(await failed.json('/api/plugins'));
  assert.equal(f['throws-on-register'].status, 'error');
  assert.equal(f['needs-hello'].status, 'disabled');
  assert.match(f['needs-hello'].error, /"throws-on-register".*error/);
});

test('plugins.paths com código no squad.config.json compartilhado é ignorado com aviso (e o local com o mesmo plugin vale)', async () => {
  const marker = path.join(scratch('squad-pl-mark-'), 'marker.txt');
  const b = await startBridge({ shared: { plugins: { paths: [fx('hello')], enabled: ['hello'] } }, local: { plugins: { enabled: ['hello'] } }, env: { SQUAD_PLUGIN_MARKER: marker } });
  const body = await b.json('/api/plugins');
  const hello = byId(body).hello;
  assert.equal(hello.status, 'blocked');
  assert.match(hello.error, /configuração local/);
  assert.ok(!existsSync(marker), 'não importou');
  assert.match(body.warnings.join('\n'), /"plugins\.enabled" só vale no arquivo local/);
  assert.match(body.warnings.join('\n'), /\[hello\].*plugin ignorado/);
  assert.equal((await b.json('/api/health')).plugins, 0);
  assert.equal((await b.api('/api/plugins/hello/hello')).status, 404);
  // a mesma pasta declarada também no arquivo local passa a valer (a pessoa decidiu ali)
  const both = await startBridge({ shared: { plugins: { paths: [fx('hello')] } }, local: { plugins: { paths: [fx('hello')], enabled: ['hello'] } }, env: { SQUAD_PLUGIN_MARKER: marker } });
  assert.equal(byId(await both.json('/api/plugins')).hello.status, 'active');
  assert.equal(readFileSync(marker, 'utf8'), 'register hello\n');
});

test('rotas: route-echo GET/POST, :param, literal antes do param, direto em res, {status, body}, helpers', async () => {
  const b = await startBridge({ local: { plugins: { paths: [fx('route-echo')], enabled: ['route-echo'] } } });
  const U = '/api/plugins/route-echo';
  assert.deepEqual(await b.json(`${U}/echo?a=1&b=dois`), { method: 'GET', query: { a: '1', b: 'dois' } });
  assert.deepEqual(await b.json(`${U}/echo`, { method: 'POST', body: JSON.stringify({ x: [1, 2], y: 'é' }) }), { method: 'POST', body: { x: [1, 2], y: 'é' } });
  assert.deepEqual(await b.json(`${U}/echo`, { method: 'POST' }), { method: 'POST', body: {} });
  assert.deepEqual(await b.json(`${U}/items/42`), { id: '42' });
  assert.deepEqual(await b.json(`${U}/items/a%20b`), { id: 'a b' });
  assert.deepEqual(await b.json(`${U}/items/7/parts/x`), { id: '7', part: 'x' });
  assert.deepEqual(await b.json(`${U}/items/new`), { literal: true });
  assert.equal((await b.api(`${U}/items/%E0%A4%A`)).status, 400);
  for (const bad of ['a%2Fb', 'a%5Cb', 'a%00b', '..%2F..%2Fx']) assert.equal((await b.api(`${U}/items/${bad}`)).status, 400, bad);
  assert.deepEqual(await b.json(`${U}/proto/__proto__`), { nullProto: true, id: '__proto__' });
  assert.deepEqual(await b.json(`${U}/y/x`), { which: 'y-b' }, 'literal à esquerda vence');
  assert.deepEqual(await b.json(`${U}/q/x`), { which: 'a-x' });
  assert.deepEqual(await b.json(`${U}/y/zzz`), { which: 'y-b' });
  const teapot = await b.api(`${U}/teapot`);
  assert.equal(teapot.status, 418); assert.deepEqual(await teapot.json(), { ok: false, error: 'sou um bule' });
  const raw = await b.api(`${U}/raw`);
  assert.equal(raw.status, 200); assert.equal(raw.headers.get('content-type'), 'text/plain'); assert.equal(await raw.text(), 'direto');
  const helper = await b.api(`${U}/fail-helper`, { method: 'POST' });
  assert.equal(helper.status, 409); assert.deepEqual(await helper.json(), { ok: false, error: 'conflito' });
  // JSON inválido e corpo grande: o status do readBody do núcleo
  const bad = await b.api(`${U}/echo`, { method: 'POST', body: '{nope' });
  assert.equal(bad.status, 400);
  // Acima de MAX_BODY o núcleo destrói a requisição: o cliente vê o 413 ou a conexão derrubada, nunca um 200, e o bridge segue de pé.
  const big = await new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port: b.port, path: `${U}/echo`, method: 'POST', headers: { 'x-squad-token': b.token, 'content-type': 'application/json' } }, res => { res.resume(); res.on('end', () => resolve(`status ${res.statusCode}`)); });
    req.on('error', () => resolve('derrubada'));
    req.write('{"pad":"' + 'x'.repeat(3 * 1024 * 1024)); req.end('"}');
  });
  assert.ok(big === 'status 413' || big === 'derrubada', big);
  assert.equal(b.proc.exitCode, null);
  assert.ok((await b.json('/api/health')).ok);
  // o que não existe
  assert.equal((await b.api(`${U}/nada`)).status, 404);
  assert.equal((await b.api(`${U}/echo`, { method: 'DELETE' })).status, 404);
  assert.equal((await b.api(`${U}/items/1/2/3`)).status, 404);
  const listed = byId(await b.json('/api/plugins'))['route-echo'];
  assert.ok(listed.routes.includes('POST /api/plugins/route-echo/echo') && listed.routes.includes('GET /api/plugins/route-echo/items/:id'));
});

test('rotas: token, Host e Origin são os do núcleo (401 sem token, 421 Host ruim, 403 Origin estranha)', async () => {
  const b = await startBridge({ local: { plugins: { paths: [fx('route-echo')], enabled: ['route-echo'] } } });
  const U = '/api/plugins/route-echo/echo';
  assert.equal((await fetch(b.base + U)).status, 401);
  assert.equal((await fetch(b.base + U, { headers: { 'x-squad-token': 'errado' } })).status, 401);
  assert.equal((await fetch(`${b.base}${U}?token=${b.token}`)).status, 200, 'o token também vale na query, como no núcleo');
  assert.equal((await b.api(U, { headers: { origin: 'http://evil.example' } })).status, 403);
  assert.equal((await b.api(U, { headers: { origin: `http://localhost:${b.port}` } })).status, 200);
  const host = await rawRequest(b.port, U, { 'x-squad-token': b.token, host: 'evil.example' });
  assert.equal(host.status, 421);
  assert.equal((await rawRequest(b.port, U, { 'x-squad-token': b.token, host: `localhost:${b.port}` })).status, 200);
  // a rota de outro plugin/inexistente também exige token
  assert.equal((await fetch(b.base + '/api/plugins/nada/x')).status, 401);
});

test('rotas: exceção vira 500 sem derrubar o bridge; status do erro é respeitado', async () => {
  const b = await startBridge({ local: { plugins: { paths: [fx('route-echo')], enabled: ['route-echo'] } } });
  const U = '/api/plugins/route-echo';
  const boom = await b.api(`${U}/boom`);
  assert.equal(boom.status, 500);
  assert.deepEqual(await boom.json(), { ok: false, error: 'Erro interno no plugin.' }, 'o cliente não vê o detalhe');
  await waitFor(() => /explodiu/.test(b.out()));
  assert.match(b.out(), /\[plugin route-echo\] GET \/api\/plugins\/route-echo\/boom: Error: explodiu/, 'o detalhe vai para o log');
  const asyncBoom = await b.api(`${U}/boom-async`);
  assert.equal(asyncBoom.status, 422); assert.equal((await asyncBoom.json()).error, 'recusado');
  assert.equal(b.proc.exitCode, null);
  assert.equal((await b.api(`${U}/echo`)).status, 200);
  assert.ok((await b.json('/api/health')).ok);
});

test('rotas: subcaminhos inválidos são recusados, e o plugin nunca ocupa /api/runs nem outra rota do núcleo', async () => {
  const b = await startBridge({ local: { plugins: { paths: [fx('route-echo')], enabled: ['route-echo'] } } });
  assert.deepEqual(await b.json('/api/plugins/route-echo/bad-subpaths'), { '/../runs': 'recusado', '/a//b': 'recusado', 'sem-barra': 'recusado', '/a/..': 'recusado', '/x y': 'recusado', '/p/:__proto__': 'recusado', '/p/:constructor': 'recusado', '/p/:prototype': 'recusado', TRACE: 'recusado' });
  // o plugin registrou "/runs" no próprio espaço; o /api/runs do núcleo continua o do núcleo
  assert.deepEqual(await b.json('/api/plugins/route-echo/runs'), { plugin: 'route-echo' });
  assert.deepEqual(await b.json('/api/runs'), { ok: true, runs: [] });
  const post = await b.api('/api/runs', { method: 'POST', body: JSON.stringify({ prompt: '' }) });
  assert.equal(post.status, 400);
  assert.match((await post.json()).error, /Prompt vazio/);
  // /api/plugins (a lista) é do núcleo; /api/plugins/<id> sem subcaminho é do plugin
  assert.equal((await b.json('/api/plugins')).ok, true);
  assert.equal((await b.api('/api/plugins/route-echo')).status, 404);
  assert.equal((await b.api('/api/plugins/route-echo/')).status, 404);
  assert.equal((await b.api('/api/plugins/route-echo/%2e%2e/runs')).status, 404);
});

test('GET /api/plugins: formato do A4, restartRequired quando a configuração muda depois do start', async () => {
  const cfgDir = scratch('squad-pl-restart-');
  const local = path.join(cfgDir, 'local.json');
  writeJson(local, { plugins: { paths: [fx('hello')], enabled: ['hello'] } });
  const b = await startBridge({ env: { SQUAD_CONFIG: local } });
  const body = await b.json('/api/plugins');
  assert.deepEqual(Object.keys(body), ['ok', 'plugins', 'runtime', 'warnings', 'config', 'restartRequired']);
  assert.equal(body.restartRequired, false);
  assert.deepEqual(Object.keys(body.plugins[0]), ['id', 'name', 'version', 'description', 'path', 'categories', 'presets', 'avatars', 'themes', 'conventions', 'runtime', 'hasCode', 'status', 'error', 'source', 'requires', 'env', 'capabilities', 'routes', 'events', 'adapters', 'warnings']);
  assert.deepEqual(body.config.enabled, ['hello']);
  writeJson(local, { plugins: { paths: [fx('hello'), fx('route-echo')], enabled: ['hello', 'route-echo'] } });
  const again = await b.json('/api/plugins');
  assert.equal(again.restartRequired, true);
  assert.deepEqual(again.plugins.map(p => [p.id, p.status]), [['hello', 'active'], ['route-echo', 'disabled']], 'o código que roda é o que subiu');
  assert.equal((await b.api('/api/plugins/route-echo/echo')).status, 404);
});

test('página: serveIndex e /api/health esperam os plugins carregarem (plugins.ready); o conteúdo de um plugin com código só entra ativo', async () => {
  const b = await startBridge({ local: { plugins: { paths: [fx('hello'), fx('content-only'), fx('code-and-content')], enabled: ['hello', 'code-and-content'] } } });
  const html = await (await fetch(b.base + '/')).text();
  assert.match(html, /id="squad-plugins"/);
  const tag = JSON.parse(html.match(/<script type="application\/json" id="squad-plugins">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(tag.plugins.map(p => [p.id, p.hasCode]), [['content-only', false], ['code-and-content', true]]);
  assert.equal(tag.runtime.timeoutSec, 77);
  const health = await b.json('/api/health');
  assert.equal(health.plugins, 3);
  const listed = byId(await b.json('/api/plugins'));
  assert.deepEqual([listed['code-and-content'].status, listed['code-and-content'].presets.map(p => p.name), listed['code-and-content'].routes], ['active', ['CAC-1'], ['GET /api/plugins/code-and-content/ping']]);
  assert.deepEqual(await b.json('/api/plugins/code-and-content/ping'), { pong: true });
  // register() falhou: o conteúdo do plugin sai da página (e de /api/plugins), o resto segue
  const c = await startBridge({ local: { plugins: { paths: [fx('content-only'), fx('code-and-content')], enabled: ['code-and-content'] } }, env: { SQUAD_CC_FAIL: '1' } });
  const failed = JSON.parse((await (await fetch(c.base + '/')).text()).match(/id="squad-plugins">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(failed.plugins.map(p => p.id), ['content-only']);
  assert.equal(failed.runtime.timeoutSec, undefined);
  const cc = byId(await c.json('/api/plugins'))['code-and-content'];
  assert.equal(cc.status, 'error'); assert.deepEqual(cc.presets, []);
});

/* ---------- revisão: segurança e correções ---------- */
const copyPlugin = (id, manifest, to = scratch('squad-pl-copy-')) => { const dir = path.join(to, manifest.id || id); cpSync(fx(id), dir, { recursive: true }); if (manifest) writeJson(path.join(dir, 'squad-plugin.json'), manifest); return dir; };

test('S-M1: plugins.disabled do compartilhado não desliga plugin com código; o local desliga e o plugin segue listado como disabled', () => {
  const shared = loaderFor({ shared: { plugins: { disabled: ['hello', 'content-only'] } }, local: { plugins: { paths: [fx('hello'), fx('content-only')], enabled: ['hello'] } } }).loader.load();
  const byKey = Object.fromEntries(shared.discovery.plugins.map(p => [p.id, p]));
  assert.equal(byKey.hello.status, undefined, 'código: só o disabled local vale');
  assert.equal(byKey['content-only'].status, 'disabled', 'conteúdo: vale de qualquer arquivo, mas não some da lista');
  assert.match(byKey['content-only'].error, /plugins\.disabled/);
  assert.deepEqual(shared.page.plugins, []);
  const local = loaderFor({ local: { plugins: { disabled: ['hello'], paths: [fx('hello')], enabled: ['hello'] } } }).loader.load();
  assert.equal(local.discovery.plugins[0].status, 'disabled');
  assert.match(local.discovery.plugins[0].error, /desligado em plugins\.disabled/);
});

test('S-M3: runtime perigoso vindo de fonte compartilhada é ignorado com aviso; do local vale', () => {
  const plugShared = scratch('squad-pl-ps-'), plugLocal = scratch('squad-pl-pl-');
  const rt = { permissionMode: 'bypassPermissions', addDirs: '/', extraAllowedTools: 'Bash', model: 'sonnet', concurrency: 3 };
  writeJson(path.join(plugShared, 'squad-plugin.json'), { id: 'p-shared', runtime: { ...rt, timeoutSec: 99 } });
  writeJson(path.join(plugLocal, 'squad-plugin.json'), { id: 'p-local', runtime: { permissionMode: 'plan' } });
  const plug = scratch('squad-pl-pd-');
  writeJson(path.join(plug, 'squad-plugin.json'), { id: 'data-rt', runtime: { permissionMode: 'dontAsk', effort: 'high' } });
  const shared = loaderFor({ shared: { runtime: { ...rt, effort: 'low' }, plugins: { paths: [plugShared, plug] } } }).loader.load();
  assert.deepEqual(shared.page.runtime, { model: 'sonnet', concurrency: 3, timeoutSec: 99, effort: 'low' });
  const w = warnText(shared);
  assert.match(w, /squad\.config\.json: runtime\.permissionMode só vale vindo do arquivo local/);
  assert.match(w, /\[p-shared\].*runtime\.addDirs só vale vindo do arquivo local/);
  assert.match(w, /\[data-rt\].*runtime\.permissionMode só vale/);
  assert.match(w, /runtime\.extraAllowedTools só vale/);
  // do local (config direta, plugin do local) vale; SQUAD_PLUGINS também
  const local = loaderFor({ local: { runtime: { permissionMode: 'acceptEdits', addDirs: 'a' }, plugins: { paths: [plugLocal, plug] } } }).loader.load();
  assert.equal(local.page.runtime.permissionMode, 'acceptEdits', 'a config direta vence os plugins');
  assert.equal(local.page.runtime.addDirs, 'a');
  assert.doesNotMatch(warnText(local), /só vale vindo do arquivo local/);
  const env = loaderFor({ env: { SQUAD_PLUGINS: plugShared } }).loader.load();
  assert.equal(env.page.runtime.permissionMode, 'bypassPermissions', 'SQUAD_PLUGINS é do ambiente local');
  // a mesma pasta nos dois arquivos conta como local
  const both = loaderFor({ shared: { plugins: { paths: [plugShared] } }, local: { plugins: { paths: [plugShared] } } }).loader.load();
  assert.equal(both.page.runtime.permissionMode, 'bypassPermissions');
});

test('S-L6, S-L7, T-L4, T-L6: ids reservados do Windows, local vence o compartilhado, requires de plugin só de dados, duas pastas com o mesmo id', () => {
  const base = scratch('squad-pl-ids-');
  writeJson(path.join(base, 'con', 'squad-plugin.json'), { id: 'con' });
  writeJson(path.join(base, 'com1', 'squad-plugin.json'), { id: 'com1' });
  const reserved = loaderFor({ local: { plugins: { paths: [path.join(base, 'con'), path.join(base, 'com1')] } } }).loader.load();
  assert.deepEqual(reserved.discovery.plugins.map(p => [p.id, p.status]), [['con', 'invalid'], ['com1', 'invalid']]);
  assert.match(warnText(reserved), /id "con" é nome reservado do Windows/);
  assert.equal(CONSTANTS.WINDOWS_RESERVED_RE.test('nul') && CONSTANTS.WINDOWS_RESERVED_RE.test('lpt9') && !CONSTANTS.WINDOWS_RESERVED_RE.test('console'), true);

  // S-L7: o mesmo id no compartilhado (dados) e no local (código): o local vale, o compartilhado é descartado com aviso
  const sharedDir = copyPlugin('content-only', { id: 'hello', name: 'Do compartilhado' }, scratch('squad-pl-sh-'));
  const r = loaderFor({ shared: { plugins: { paths: [sharedDir] } }, local: { plugins: { paths: [fx('hello')], enabled: ['hello'] } } }).loader.load();
  assert.deepEqual(r.discovery.plugins.map(p => [p.id, p.local, p.status]), [['hello', true, undefined], ['hello', false, 'invalid']]);
  assert.match(r.discovery.plugins[1].error, /id repetido/);
  assert.match(r.discovery.warnings.join('\n'), /id hello aparece em 2 pastas/);

  // T-L4: plugin só de conteúdo cujo requires não está ativo sai da página, mas segue listado como disabled
  const needy = copyPlugin('content-only', { id: 'needy', requires: ['ghost'], categories: [{ key: 'z' }] });
  const ok = copyPlugin('content-only', { id: 'okdata', categories: [{ key: 'y' }] });
  const dep = loaderFor({ local: { plugins: { paths: [needy, ok] } } }).loader.load();
  assert.deepEqual(dep.page.plugins.map(p => p.id), ['okdata']);
  const n = dep.discovery.plugins.find(p => p.id === 'needy');
  assert.equal(n.status, 'disabled'); assert.match(n.error, /depende de "ghost", que não existe/);
  assert.match(warnText(dep), /\[needy\] plugin desligado: depende de "ghost"/);

  // T-L6: a primeira pasta (invalida, local) e a segunda (valida) com o mesmo id: as duas aparecem
  const bad = copyPlugin('hello', { id: 'twin', apiVersion: 2, server: 'server.mjs' });
  const good = copyPlugin('hello', { id: 'twin', server: 'server.mjs' });
  const twin = loaderFor({ local: { plugins: { paths: [bad, good] } } }).loader.load();
  assert.deepEqual(twin.discovery.plugins.map(p => [p.id, p.status]), [['twin', 'invalid'], ['twin', undefined]]);
  assert.notEqual(twin.discovery.plugins[0].key, twin.discovery.plugins[1].key);
});

test('S-L2, S-L5, T-L5: /api/plugins mostra env; plugin só de conteúdo não tem rotas; duas pastas com o mesmo id aparecem e a válida responde', async () => {
  const bad = copyPlugin('hello', { id: 'twin', apiVersion: 2, server: 'server.mjs' });
  const good = copyPlugin('hello', { id: 'twin', server: 'server.mjs' });
  const b = await startBridge({ local: { plugins: { paths: [fx('hello'), fx('content-only'), bad, good], enabled: ['hello', 'twin'] } } });
  const body = await b.json('/api/plugins');
  const p = byId(body);
  assert.deepEqual(p.hello.env, ['HELLO_SECRET']);
  assert.deepEqual(p['content-only'].env, []);
  assert.deepEqual(body.plugins.filter(x => x.id === 'twin').map(x => x.status), ['invalid', 'active']);
  assert.equal((await b.json('/api/plugins/twin/late')).threw, true, 'a pasta válida responde');
  const r = await b.api('/api/plugins/content-only/x');
  assert.equal(r.status, 404); assert.match((await r.json()).error, /só de conteúdo e não tem rotas/);
});

test('S-L4: settings inválidas não mostram o valor (nem em /api/plugins nem no log); S-L8: limites do configSchema', async () => {
  const secret = 'SEGREDO-NAO-VAZAR-123';
  const mk = (id, configSchema) => copyPlugin('hello', { id, server: 'server.mjs', configSchema });
  const enumDir = mk('enum-plug', { type: 'object', properties: { mode: { enum: ['a', 'b'] }, token: { type: 'string', pattern: '^ok$' } } });
  const b1 = await startBridge({ local: { plugins: { paths: [enumDir], enabled: ['enum-plug'], entries: { 'enum-plug': { settings: { mode: secret } } } } } });
  const e1 = byId(await b1.json('/api/plugins'))['enum-plug'];
  assert.equal(e1.status, 'error'); assert.match(e1.error, /settings inválidas: mode/);
  const b2 = await startBridge({ local: { plugins: { paths: [enumDir], enabled: ['enum-plug'], entries: { 'enum-plug': { settings: { token: secret } } } } } });
  assert.equal(byId(await b2.json('/api/plugins'))['enum-plug'].status, 'error');
  for (const b of [b1, b2]) { assert.doesNotMatch(JSON.stringify(await b.json('/api/plugins')), new RegExp(secret)); assert.doesNotMatch(b.out(), new RegExp(secret)); }

  const bigPattern = mk('big-pattern', { type: 'object', properties: { a: { type: 'string', pattern: 'a'.repeat(201) } } });
  const fan = mk('fan-out', { type: 'object', properties: { a: { anyOf: Array.from({ length: 17 }, () => ({ type: 'string' })) } } });
  const fine = mk('fan-ok', { type: 'object', properties: { a: { oneOf: Array.from({ length: 16 }, (_, i) => ({ const: i })), pattern: 'a'.repeat(200) } } });
  const b3 = await startBridge({ local: { plugins: { paths: [bigPattern, fan, fine], enabled: ['big-pattern', 'fan-out', 'fan-ok'] } } });
  const p = byId(await b3.json('/api/plugins'));
  assert.match(p['big-pattern'].error, /pattern com mais de 200/); assert.match(p['fan-out'].error, /anyOf com mais de 16/);
  assert.equal(p['fan-ok'].status, 'active');
});

test('T-M1: ciclo de requires fica desligado (fail-closed) no host, sem importar ninguém, e o aviso aparece', async () => {
  const marker = path.join(scratch('squad-pl-mark-'), 'marker.txt');
  const b = await startBridge({ local: { plugins: { paths: [fx('cycle-a'), fx('cycle-b'), fx('hello')], enabled: ['cycle-a', 'cycle-b', 'hello'] } }, env: { SQUAD_PLUGIN_MARKER: marker } });
  const body = await b.json('/api/plugins'), p = byId(body);
  assert.equal(p['cycle-a'].status, 'disabled'); assert.equal(p['cycle-b'].status, 'disabled');
  assert.match(p['cycle-a'].error, /ciclo de dependências com cycle-b/);
  assert.equal(p.hello.status, 'active');
  assert.match(body.warnings.join('\n'), /ciclo de dependências entre plugins: cycle-a, cycle-b; os membros do ciclo ficam desligados/);
  assert.ok(!/import cycle/.test(existsSync(marker) ? readFileSync(marker, 'utf8') : ''), 'nenhum módulo do ciclo foi importado');
});

test('T-M2: SIGTERM durante a carga para o loop, desfaz o plugin em loading (onDispose roda) e não importa os seguintes', async () => {
  const marker = path.join(scratch('squad-pl-mark-'), 'marker.txt');
  const b = await startBridge({ local: { plugins: { paths: [fx('slow'), fx('zz-after')], enabled: ['slow', 'zz-after'] } }, env: { SQUAD_PLUGIN_MARKER: marker, SQUAD_SLOW_MS: '3000' } });
  await waitFor(() => existsSync(marker) && /register slow/.test(readFileSync(marker, 'utf8')));
  const t0 = Date.now();
  b.proc.kill('SIGTERM');
  assert.equal(await b.exited, 0);
  assert.ok(Date.now() - t0 < 4000, 'sai logo, não espera os 3 s do register');
  const lines = readFileSync(marker, 'utf8');
  assert.match(lines, /dispose slow/);
  assert.doesNotMatch(lines, /zz-after/);
});

test('T-M3: orçamento total de carga; o que sobra vira error "tempo total de carga esgotado"', async () => {
  const marker = path.join(scratch('squad-pl-mark-'), 'marker.txt');
  const b = await startBridge({ local: { plugins: { paths: [fx('slow'), fx('zz-after')], enabled: ['slow', 'zz-after'] } }, env: { SQUAD_PLUGIN_MARKER: marker, SQUAD_SLOW_MS: '3000', SQUAD_PLUGIN_LOAD_BUDGET_MS: '400' } });
  const p = byId(await b.json('/api/plugins'));
  assert.equal(p.slow.status, 'error'); assert.match(p.slow.error, /tempo total de carga esgotado/);
  assert.equal(p['zz-after'].status, 'error'); assert.match(p['zz-after'].error, /tempo total de carga esgotado/);
  assert.doesNotMatch(readFileSync(marker, 'utf8'), /register zz-after/);
  assert.match(readFileSync(marker, 'utf8'), /dispose slow/);
});

test('/api/health e serveIndex esperam plugins.ready (plugin lento)', async () => {
  for (const what of ['/api/health', '/']) {
    const b = await startBridge({ local: { plugins: { paths: [fx('slow')], enabled: ['slow'] } }, env: { SQUAD_SLOW_MS: '900' } });
    const t0 = Date.now();
    const res = await b.api(what);
    assert.equal(res.status, 200);
    assert.ok(Date.now() - t0 >= 500, `${what} respondeu antes de o register terminar (${Date.now() - t0} ms)`);
    if (what === '/api/health') assert.equal((await res.json()).plugins, 1);
    assert.equal((await b.json('/api/plugins/slow/x')).slow, true);
  }
});

test('zero plugins: o host não fica pending, ready já resolvido, load() não muda nada', async () => {
  const { createPluginHost } = require('../plugins/host.js');
  const host = createPluginHost({ getDiscovery: () => ({ plugins: [], config: { enabled: [], entries: {} }, warnings: [] }), dataRoot: '/nonexistent', http: {}, maxBody: 1 });
  assert.equal(host.pending, false); assert.equal(host.closing, false);
  const ready = host.ready;
  await host.load();
  assert.equal(host.pending, false); assert.equal(host.ready, ready);
  assert.equal(host.active(), 0); assert.equal(host.hasDisposers(), false);
  assert.deepEqual(host.view(), { plugins: [], restartRequired: false, warnings: [] });
  assert.equal(await host.route({ method: 'GET' }, {}, new URL('http://x/api/plugins/a/b')), false);
});

/* =====================================================================================================================
 * Passo 6: eventos (observadores) e run:beforeSpawn. Passo 7: registerAdapter.
 * ===================================================================================================================== */
const WS = { version: 2, agents: [], projects: [{ id: 'p1', name: 'Eventos' }], squads: [] };
const WORKDIR = scratch('squad-pl-work-');
const pcfg = (paths, enabled, entries = {}, extra = {}) => ({ plugins: { paths, enabled, entries, ...extra } });
async function setupDb(b, ws = WS) {
  const res = await b.api('/api/setup', { method: 'POST', body: JSON.stringify(ws) });
  assert.equal(res.status, 201, await res.clone().text());
  return res.json();
}
async function eventsOf(b, runId) {
  const res = await fetch(`${b.base}/api/runs/${runId}/events?token=${b.token}`);
  return (await res.text()).split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
}
const postRun = (b, body) => b.api('/api/runs', { method: 'POST', body: JSON.stringify(body) });
async function runOn(b, body) {
  const res = await postRun(b, body);
  assert.equal(res.status, 201, await res.clone().text());
  const out = await res.json();
  return { ...out, events: await eventsOf(b, out.runId) };
}
const exitOf = events => events.find(e => e.type === 'exit');
const logOf = async (b, id = 'event-log') => (await b.json(`/api/plugins/${id}/log`)).log;
const newProfile = async (b, p) => {
  const res = await b.api('/api/profiles', { method: 'POST', body: JSON.stringify(p) });
  assert.equal(res.status, 201, await res.clone().text());
  return (await res.json()).profile;
};
const setMode = async (b, mode, id = 'policy') => assert.equal((await b.api(`/api/plugins/${id}/mode`, { method: 'POST', body: JSON.stringify(mode) })).status, 200);
const seenOf = async (b, id = 'policy') => (await b.json(`/api/plugins/${id}/seen`)).seen;
/** A copy of a fixture under another id (and manifest changes), for tests that need two plugins of one kind. */
function cloneFixture(name, id, patch = {}) {
  const to = path.join(scratch('squad-pl-copy-'), id);
  cpSync(fx(name), to, { recursive: true });
  const file = path.join(to, 'squad-plugin.json');
  writeJson(file, { ...JSON.parse(readFileSync(file, 'utf8')), id, ...patch });
  return to;
}
const tmpEntries = b => { const dir = readdirSync(b.tmp).find(n => n.startsWith('squad-code-')); return dir ? readdirSync(path.join(b.tmp, dir)) : null; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- despachante de observadores (unidade, sem rede) ---------- */
const rev = seq => ({ runId: 'r', seq, at: 'agora', event: { type: 'x' } });
async function hostFor(paths, enabled, { entries = {}, env = {} } = {}) {
  const { loader } = loaderFor({ local: pcfg(paths, enabled, entries) });
  const logs = [];
  const note = (...a) => logs.push(a.join(' '));
  const host = createPluginHost({ getDiscovery: () => loader.load().discovery, dataRoot: scratch('squad-pl-hd-'), http: { readBody() {}, json() {}, fail() {} }, maxBody: 1, env, log: { log: note, warn: note, error: note } });
  await host.load();
  return { host, logs };
}

test('despachante: emit sem assinantes volta na hora e nem monta o payload; payload é congelado e entregue por assinante', async () => {
  globalThis.__observer = undefined;
  const { host } = await hostFor([fx('observer-bad')], ['observer-bad'], { entries: { 'observer-bad': { settings: { mode: 'ok', events: ['run:start'] } } } });
  assert.equal(host.emit('profile:usage', () => { throw new Error('não deveria montar o payload'); }), undefined);
  assert.equal(host.listens('profile:usage'), false);
  assert.equal(host.listens('run:start'), true);
  host.emit('run:start', () => { throw new Error('payload que lança nunca chega ao chamador'); });
  host.emit('run:start', { runId: 'a' });
  await waitFor(() => globalThis.__observer.calls === 1);
  assert.deepEqual(globalThis.__observer.seen[0], { runId: 'a' });
  assert.ok(Object.isFrozen(globalThis.__observer.seen[0]));
  assert.deepEqual(host.list()[0].observers, [{ event: 'run:start', dropped: 0, failures: 0, tripped: false }]);
});

test('despachante: fila de 1000 por plugin descarta o mais antigo e conta; a ordem de chegada se mantém', async () => {
  globalThis.__observer = undefined;
  let release; globalThis.__observerGate = new Promise(r => { release = r; });
  const { host, logs } = await hostFor([fx('observer-bad')], ['observer-bad'], { entries: { 'observer-bad': { settings: { mode: 'gate' } } } });
  host.emit('run:event', rev(0));
  await waitFor(() => globalThis.__observer.calls === 1); // o primeiro está dentro do handler, parado no portão
  for (let n = 1; n <= 1500; n++) host.emit('run:event', rev(n));
  assert.equal(host.list()[0].observers[0].dropped, 500);
  release();
  await waitFor(() => globalThis.__observer.calls === 1001);
  const ns = globalThis.__observer.seen.map(p => p.seq);
  assert.equal(ns[0], 0);
  assert.deepEqual(ns.slice(1), Array.from({ length: 1000 }, (_, i) => 501 + i), 'os 500 mais antigos (1 a 500) foram descartados');
  assert.ok(logs.some(l => /descart/.test(l)), 'o descarte é avisado');
  assert.ok(logs.filter(l => /descart/.test(l)).length <= 3, 'aviso com limite de repetição');
  assert.equal(host.list()[0].observers[0].dropped, 500);
});

test('despachante: handler que lança é logado com limite de repetição e o disjuntor abre na 20a falha seguida', async () => {
  globalThis.__observer = undefined;
  const { host, logs } = await hostFor([fx('observer-bad')], ['observer-bad'], { entries: { 'observer-bad': { settings: { mode: 'throw' } } } });
  for (let n = 0; n < 30; n++) host.emit('run:event', rev(n));
  await waitFor(() => host.list()[0].observers[0].tripped);
  assert.equal(globalThis.__observer.calls, 20);
  for (let n = 0; n < 10; n++) host.emit('run:event', rev(n));
  await sleep(100);
  assert.equal(globalThis.__observer.calls, 20, 'silenciado: o handler não é mais chamado');
  assert.deepEqual(host.list()[0].observers, [{ event: 'run:event', dropped: 0, failures: 20, tripped: true }]);
  assert.equal(logs.filter(l => /observador quebrado/.test(l)).length, 3, 'só as 3 primeiras falhas são logadas');
  assert.equal(logs.filter(l => /disjuntor/.test(l)).length, 1);
  assert.match(logs.find(l => /disjuntor/.test(l)), /observer-bad/);
});

test('despachante: uma falha isolada não abre o disjuntor (o sucesso zera a contagem)', async () => {
  globalThis.__observer = undefined;
  const { host } = await hostFor([fx('observer-bad')], ['observer-bad'], { entries: { 'observer-bad': { settings: { mode: 'flaky' } } } });
  for (let n = 0; n < 60; n++) host.emit('run:event', rev(n));
  await waitFor(() => globalThis.__observer.calls === 60);
  await sleep(50);
  const o = host.list()[0].observers[0];
  assert.equal(o.tripped, false); assert.equal(o.dropped, 0);
});

test('despachante: handler que não termina estoura o tempo limite (SQUAD_PLUGIN_HOOK_TIMEOUT_MS) e a fila segue', async () => {
  globalThis.__observer = undefined;
  const { host, logs } = await hostFor([fx('observer-bad')], ['observer-bad'], { entries: { 'observer-bad': { settings: { mode: 'hang' } } }, env: { SQUAD_PLUGIN_HOOK_TIMEOUT_MS: '100' } });
  const t0 = Date.now();
  for (let n = 0; n < 3; n++) host.emit('run:event', rev(n));
  assert.ok(Date.now() - t0 < 50, 'emit nunca espera o handler');
  await waitFor(() => host.list()[0].observers[0].failures === 3);
  assert.equal(globalThis.__observer.calls, 3);
  assert.ok(Date.now() - t0 >= 250, 'cada item esperou o próprio tempo limite');
  assert.ok(logs.some(l => /tempo limite/.test(l)));
});

/* ---------- eventos no bridge ---------- */
test('eventos: event-log vê run:start, run:event (sem stream_event), run:finish, profile:usage e workspace:saved, em ordem e sem o workspace', async () => {
  const b = await startBridge({ local: pcfg([fx('event-log')], ['event-log']) });
  assert.deepEqual(byId(await b.json('/api/plugins'))['event-log'].events, ['run:start', 'run:event', 'run:finish', 'profile:usage', 'workspace:saved']);

  // workspace:saved: o setup (setup: true) e uma gravação com mudança; igual e conflito não emitem.
  const first = await setupDb(b);
  let log = await waitFor(async () => { const l = await logOf(b); return l.length >= 1 && l; });
  assert.deepEqual(log[0].keys, ['rev', 'savedAt', 'changes', 'setup']);
  assert.equal(log[0].payload.setup, true); assert.equal(log[0].payload.rev, first.rev); assert.ok(log[0].payload.changes > 0);
  assert.ok(!('workspace' in log[0].payload) && !JSON.stringify(log[0].payload).includes('Eventos'));
  assert.equal(log[0].frozen, true);
  const put = (ws, q) => b.api(`/api/workspace?${q}`, { method: 'PUT', body: JSON.stringify(ws) });
  const edited = { ...WS, projects: [{ id: 'p1', name: 'Eventos 2' }] };
  const saved = await (await put(edited, `base=${first.rev}`)).json();
  assert.equal(saved.unchanged, false);
  log = await waitFor(async () => { const l = await logOf(b); return l.length >= 2 && l; });
  assert.deepEqual(log[1].payload, { rev: saved.rev, savedAt: saved.savedAt, changes: saved.changes, setup: false });
  assert.equal((await (await put(edited, `base=${saved.rev}`)).json()).unchanged, true);
  assert.equal((await put(edited, 'base=velha')).status, 409);
  await sleep(150);
  assert.equal((await logOf(b)).filter(e => e.event === 'workspace:saved').length, 2);

  // execução com partial: o stream_event existe no SSE, mas o observador não o recebe
  await b.api('/api/plugins/event-log/reset', { method: 'POST' });
  const run = await runOn(b, { prompt: 'RATE50 oi', systemPrompt: 'SYS', options: { cwd: WORKDIR, partial: true }, meta: { projectId: 'p1', kind: 'step' } });
  assert.ok(run.events.some(e => e.type === 'stream_event'));
  log = await waitFor(async () => { const l = await logOf(b); return l.some(e => e.event === 'run:finish') && l; });
  const kinds = log.map(e => e.event);
  assert.equal(kinds.filter(k => k === 'run:start').length, 1); assert.equal(kinds.filter(k => k === 'run:finish').length, 1);
  assert.equal(kinds[0], 'run:start', 'run:start vem antes de qualquer run:event');
  assert.equal(kinds.at(-1), 'run:finish', 'run:finish vem depois do exit');
  const evs = log.filter(e => e.event === 'run:event');
  assert.deepEqual(evs.map(e => e.type), run.events.filter(e => e.type !== 'stream_event').map(e => e.type), 'mesma ordem e contagem do SSE, sem stream_event');
  assert.equal(evs.at(-1).type, 'exit');
  assert.ok(evs.every(e => e.runId === run.runId));
  // sem run.content: só a projeção (whitelist), nunca texto, input, resultado, args nem cwd
  for (const e of evs) {
    assert.ok(['runId', 'seq', 'at', 'type', 'subtype', 'parentToolUseId'].every(k => e.keys.includes(k)), e.type);
    for (const secret of ['README.md', 'working', 'ECHO:', 'squad-pl-work', '"text":', '"args":', '"cwd":', '"message":', '"result":']) assert.ok(!e.raw.includes(secret), `${e.type} vazou ${secret}`);
  }
  assert.ok(evs.some(e => e.toolName === 'Read'), 'tool_use vira só toolName');
  const exitEv = JSON.parse(evs.at(-1).raw);
  assert.deepEqual(Object.keys(exitEv).sort(), ['at', 'code', 'costUsd', 'isError', 'numTurns', 'parentToolUseId', 'runId', 'seq', 'status', 'subtype', 'type', 'usage']);
  assert.deepEqual(evs.map(e => JSON.parse(e.raw).seq), run.events.map((e, i) => [e, i + 1]).filter(([e]) => e.type !== 'stream_event').map(([, n]) => n), 'seq é a posição no stream; os stream_event que o plugin não recebe deixam lacuna');
  const start = log.find(e => e.event === 'run:start').payload;
  assert.deepEqual(Object.keys(start).sort(), ['adapter', 'agentId', 'cwd', 'fallbackFrom', 'featureId', 'kind', 'label', 'model', 'parentRunId', 'pid', 'profileId', 'profileName', 'project', 'projectId', 'rootRunId', 'runId', 'startedAt'], 'sem prompt nem systemPrompt (sem run.content)');
  assert.deepEqual({ runId: start.runId, parentRunId: start.parentRunId, rootRunId: start.rootRunId, kind: start.kind, projectId: start.projectId, adapter: start.adapter, profileId: start.profileId, profileName: start.profileName, fallbackFrom: start.fallbackFrom },
    { runId: run.runId, parentRunId: null, rootRunId: run.runId, kind: 'step', projectId: 'p1', adapter: 'claude', profileId: 'claude-default', profileName: 'Claude (padrão)', fallbackFrom: null });
  assert.ok(Number.isInteger(start.pid) && start.startedAt && start.cwd);
  const fin = log.find(e => e.event === 'run:finish').payload;
  assert.deepEqual(Object.keys(fin).sort(), ['adapter', 'code', 'costUsd', 'durationMs', 'error', 'isError', 'kind', 'model', 'numTurns', 'parentRunId', 'profileId', 'runId', 'status', 'usage'], 'sem run.content: sem sessionId');
  assert.deepEqual({ status: fin.status, isError: fin.isError, error: fin.error, code: fin.code, costUsd: fin.costUsd, numTurns: fin.numTurns, adapter: fin.adapter, profileId: fin.profileId }, { status: 'done', isError: false, error: null, code: 0, costUsd: 0.001, numTurns: 1, adapter: 'claude', profileId: 'claude-default' });
  assert.ok(fin.usage && typeof fin.durationMs === 'number');
  // profile:usage com a origem (event) e o limiar
  const usage = log.find(e => e.event === 'profile:usage').payload;
  assert.deepEqual(Object.keys(usage), ['profileId', 'adapter', 'windows', 'source', 'overThreshold']);
  assert.equal(usage.source, 'event'); assert.equal(usage.adapter, 'claude'); assert.equal(usage.profileId, 'claude-default');
  assert.equal(usage.windows.five_hour.utilization, 0.5); assert.equal(usage.overThreshold, false);
  await runOn(b, { prompt: 'RATE95 oi', options: { cwd: WORKDIR } });
  const hot = await waitFor(async () => (await logOf(b)).find(e => e.event === 'profile:usage' && e.payload.windows.five_hour.utilization === 0.95));
  assert.equal(hot.payload.overThreshold, true);

  // com opt-in {partial: true} (exige run.content) o stream_event chega, e o evento é o completo
  const p = await startBridge({ local: pcfg([fx('event-log')], ['event-log'], { 'event-log': { grants: ['run.content'], settings: { partial: true } } }) });
  const partial = await runOn(p, { prompt: 'oi', options: { cwd: WORKDIR, partial: true } });
  const plog = await waitFor(async () => { const l = await logOf(p); return l.some(e => e.event === 'run:finish') && l; });
  assert.deepEqual(plog.filter(e => e.event === 'run:event').map(e => e.type), partial.events.map(e => e.type));
  assert.equal(plog.filter(e => e.type === 'stream_event').length, 2);
  assert.ok(plog.filter(e => e.event === 'run:event').some(e => e.raw.includes('README.md')), 'com run.content o evento vem inteiro');
  // partial sem o grant: o plugin é negado
  const denied = await startBridge({ local: pcfg([fx('event-log')], ['event-log'], { 'event-log': { settings: { partial: true } } }) });
  const d = byId(await denied.json('/api/plugins'))['event-log'];
  assert.equal(d.status, 'denied'); assert.match(d.error, /Capacidade "run\.content" não concedida/);
});

test('eventos: profile:usage tem source session (fim do run do Codex) e refresh (POST /refresh)', async () => {
  const b = await startBridge({ local: pcfg([fx('event-log')], ['event-log']) });
  await setupDb(b);
  const home = scratch('squad-pl-codexhome-');
  const profile = await newProfile(b, { name: 'Codex conta', adapter: 'codex', configDir: home });
  const run = await runOn(b, { prompt: 'HOT oi', options: { cwd: WORKDIR, profile: profile.id } });
  assert.equal(exitOf(run.events).isError, false);
  const session = await waitFor(async () => (await logOf(b)).find(e => e.event === 'profile:usage' && e.payload.source === 'session'));
  assert.equal(session.payload.adapter, 'codex'); assert.equal(session.payload.profileId, profile.id);
  assert.equal(session.payload.windows.five_hour.utilization, 0.95); assert.equal(session.payload.overThreshold, true);
  await b.api('/api/plugins/event-log/reset', { method: 'POST' });
  assert.equal((await b.api(`/api/profiles/${profile.id}/refresh`, { method: 'POST' })).status, 200);
  const refresh = await waitFor(async () => (await logOf(b)).find(e => e.event === 'profile:usage'));
  assert.equal(refresh.payload.source, 'refresh'); assert.equal(refresh.payload.profileId, profile.id);
});

test('S-L9: prompt e systemPrompt só chegam a quem tem run.content (run:start e run:beforeSpawn); sem o grant o campo nem existe', async () => {
  const withContent = cloneFixture('event-log', 'log-content', { capabilities: ['run.content'] });
  const asked = cloneFixture('event-log', 'log-asked', { capabilities: ['run.content'] });
  const bare = cloneFixture('policy', 'policy-bare', { capabilities: ['run.mutate'] });
  const b = await startBridge({ local: pcfg([fx('event-log'), withContent, asked, fx('policy'), bare], ['event-log', 'log-content', 'log-asked', 'policy', 'policy-bare'], {
    'log-content': { grants: ['run.content'] }, policy: { grants: ['run.mutate', 'run.content'] }, 'policy-bare': { grants: ['run.mutate'] },
  }) });
  const plugins = byId(await b.json('/api/plugins'));
  for (const id of ['event-log', 'log-content', 'log-asked', 'policy', 'policy-bare']) assert.equal(plugins[id].status, 'active', id);
  await runOn(b, { prompt: 'SEGREDO-DO-PROMPT', systemPrompt: 'SEGREDO-DO-SISTEMA', options: { cwd: WORKDIR } });
  const startOf = async id => (await waitFor(async () => (await logOf(b, id)).find(e => e.event === 'run:start'))).payload;
  const granted = await startOf('log-content');
  assert.equal(granted.prompt, 'SEGREDO-DO-PROMPT'); assert.equal(granted.systemPrompt, 'SEGREDO-DO-SISTEMA');
  for (const id of ['event-log', 'log-asked']) {
    const p = await startOf(id);
    assert.ok(!('prompt' in p) && !('systemPrompt' in p), `${id}: os campos nem existem`);
    assert.ok(!JSON.stringify(p).includes('SEGREDO'), id);
  }
  const full = (await seenOf(b, 'policy'))[0], bare0 = (await seenOf(b, 'policy-bare'))[0];
  assert.equal(full.prompt, 'SEGREDO-DO-PROMPT'); assert.equal(full.systemPrompt, 'SEGREDO-DO-SISTEMA');
  assert.ok(!('prompt' in bare0) && !('systemPrompt' in bare0));
  assert.equal(bare0.promptChars, 'SEGREDO-DO-PROMPT'.length); assert.equal(bare0.hasSystemPrompt, true);
});

test('observador que lança ou trava não altera a execução nem a duração; o disjuntor silencia depois de 20 falhas seguidas e aparece em /api/plugins', async () => {
  const hang = await startBridge({ local: pcfg([fx('observer-bad')], ['observer-bad'], { 'observer-bad': { settings: { mode: 'hang', events: ['run:start', 'run:event', 'run:finish'] } } }), env: { SQUAD_PLUGIN_HOOK_TIMEOUT_MS: '300' } });
  const t0 = Date.now();
  const r = await runOn(hang, { prompt: 'oi', systemPrompt: 'S', options: { cwd: WORKDIR } });
  assert.ok(Date.now() - t0 < 6 * 300, `a execução não esperou os observadores (um tempo limite de 300 ms por evento somaria mais; ${Date.now() - t0} ms)`);
  assert.equal(exitOf(r.events).status, 'done'); assert.equal(exitOf(r.events).result, 'ECHO:oi|SYS:S');
  await waitFor(() => /tempo limite/.test(hang.out()));
  assert.ok((await hang.json('/api/plugins/observer-bad/calls')).calls >= 1);

  const boom = await startBridge({ local: pcfg([fx('observer-bad')], ['observer-bad'], { 'observer-bad': { settings: { mode: 'throw' } } }) });
  for (let i = 0; i < 5; i++) { const x = await runOn(boom, { prompt: `oi ${i}`, options: { cwd: WORKDIR } }); assert.equal(exitOf(x.events).status, 'done'); assert.equal(exitOf(x.events).isError, false); }
  await waitFor(async () => (await boom.json('/api/plugins/observer-bad/calls')).calls === 20);
  await sleep(150);
  assert.equal((await boom.json('/api/plugins/observer-bad/calls')).calls, 20, 'depois do disjuntor o handler não é mais chamado');
  const view = byId(await boom.json('/api/plugins'))['observer-bad'];
  assert.equal(view.status, 'active');
  assert.deepEqual(view.observers, [{ event: 'run:event', dropped: 0, failures: 20, tripped: true }]);
  assert.match(boom.out(), /disjuntor/);
  assert.ok((boom.out().match(/observador quebrado/g) || []).length <= 3);
  const again = await runOn(boom, { prompt: 'ainda funciona', options: { cwd: WORKDIR } });
  assert.equal(exitOf(again.events).status, 'done');
});

/* ---------- run:beforeSpawn ---------- */
const polGrants = { policy: { grants: ['run.mutate', 'run.content'] } };
const polBridge = (extra = {}, entries = polGrants, env = {}) => startBridge({ local: pcfg([fx('policy')], ['policy'], entries, extra), env });

test('beforeSpawn: {block} vira 403 "Execução bloqueada pelo plugin X: motivo", sem temporários, sem histórico, e a vaga do Perfil volta', async () => {
  const b = await polBridge();
  await setupDb(b);
  const one = await newProfile(b, { name: 'Um por vez', adapter: 'claude', concurrency: 1 });
  await setMode(b, { block: 'fora do expediente' });
  const body = { prompt: 'oi', systemPrompt: 'BASE', options: { cwd: WORKDIR, profile: one.id } };
  for (let i = 0; i < 3; i++) {
    const res = await postRun(b, body);
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { ok: false, error: 'Execução bloqueada pelo plugin policy: fora do expediente' });
  }
  assert.deepEqual(tmpEntries(b), [], 'nenhum arquivo temporário (o prepare nem rodou)');
  assert.deepEqual((await b.json('/api/runs')).runs, [], 'nada no histórico');
  assert.equal((await b.json('/api/health')).activeRuns, 0);
  assert.equal(byId(await b.json('/api/plugins')).policy.status, 'active', 'o veto não é falha do plugin');
  await setMode(b, {});
  const ok = await runOn(b, body); // teto 1: se o veto tivesse vazado a vaga, seria 429
  assert.equal(exitOf(ok.events).status, 'done');
  assert.equal((await b.json('/api/runs')).runs.length, 1);
});

test('beforeSpawn: o payload do A3 (e o conteúdo, com run.content)', async () => {
  const b = await polBridge();
  await runOn(b, { prompt: 'abc', systemPrompt: 'sistema', options: { cwd: WORKDIR, permissionMode: 'plan', tools: ['Read'], effort: 'high', agents: { argus: { description: 'revisor', prompt: 'p' } } }, meta: { projectId: 'p1', agentId: 'ag1', featureId: 'f1', kind: 'step' } });
  const ev = (await seenOf(b))[0];
  assert.deepEqual(Object.keys(ev).sort(), ['agentId', 'agentSlugs', 'cwd', 'effort', 'featureId', 'hasSystemPrompt', 'isCall', 'kind', 'model', 'parentRunId', 'permissionMode', 'profile', 'project', 'projectId', 'prompt', 'promptChars', 'runId', 'systemPrompt', 'tools']);
  assert.deepEqual({ parentRunId: ev.parentRunId, isCall: ev.isCall, kind: ev.kind, projectId: ev.projectId, agentId: ev.agentId, featureId: ev.featureId, profile: ev.profile, effort: ev.effort, tools: ev.tools, permissionMode: ev.permissionMode, promptChars: ev.promptChars, hasSystemPrompt: ev.hasSystemPrompt, agentSlugs: ev.agentSlugs, prompt: ev.prompt, systemPrompt: ev.systemPrompt },
    { parentRunId: null, isCall: false, kind: 'step', projectId: 'p1', agentId: 'ag1', featureId: 'f1', profile: { id: 'claude-default', name: 'Claude (padrão)', adapter: 'claude' }, effort: 'high', tools: ['Read'], permissionMode: 'plan', promptChars: 3, hasSystemPrompt: true, agentSlugs: ['argus'], prompt: 'abc', systemPrompt: 'sistema' });
  assert.match(ev.runId, /^[0-9a-f-]{36}$/);
});

test('beforeSpawn: teto do Perfil 1 + hook lento + 2 POST paralelos = um 201 e um 429 (a vaga é tomada antes do hook)', async () => {
  const b = await polBridge();
  await setupDb(b);
  const one = await newProfile(b, { name: 'Um por vez', adapter: 'claude', concurrency: 1 });
  await setMode(b, { delayMs: 600 });
  const body = { prompt: 'oi', options: { cwd: WORKDIR, profile: one.id } };
  const [x, y] = await Promise.all([postRun(b, body), postRun(b, body)]);
  assert.deepEqual([x.status, y.status].sort(), [201, 429]);
  const lost = x.status === 429 ? x : y;
  assert.match((await lost.json()).error, /teto do Perfil/);
  assert.equal((await seenOf(b)).length, 1, 'só quem passou da admissão chegou ao hook');
  const won = x.status === 201 ? x : y;
  assert.equal(exitOf(await eventsOf(b, (await won.json()).runId)).status, 'done');
});

test('beforeSpawn: appendSystem é concatenado ao systemPrompt (Claude: arquivo do system prompt; Codex: stdin), com teto de 20k por plugin e o corte de 100k reaplicado', async () => {
  const log = path.join(scratch('squad-pl-clog-'), 'codex.jsonl');
  const second = cloneFixture('policy', 'policy-b');
  const b = await startBridge({ local: pcfg([fx('policy'), second], ['policy', 'policy-b'], { policy: { grants: ['run.mutate'] }, 'policy-b': { grants: ['run.mutate'] } }), env: { FAKE_CODEX_LOG: log } });
  await setupDb(b);
  await setMode(b, { appendSystem: 'EXTRA-A' });
  const res = await runOn(b, { prompt: 'oi', systemPrompt: 'BASE', options: { cwd: WORKDIR } });
  assert.equal(exitOf(res.events).result, 'ECHO:oi|SYS:BASE\n\nEXTRA-A');
  assert.equal(exitOf((await runOn(b, { prompt: 'oi', options: { cwd: WORKDIR } })).events).result, 'ECHO:oi|SYS:EXTRA-A', 'sem system prompt de base, só o acrescentado');
  // dois plugins: na ordem dos plugins
  await setMode(b, { appendSystem: 'EXTRA-B' }, 'policy-b');
  assert.equal(exitOf((await runOn(b, { prompt: 'oi', systemPrompt: 'BASE', options: { cwd: WORKDIR } })).events).result, 'ECHO:oi|SYS:BASE\n\nEXTRA-A\n\nEXTRA-B');
  // Codex: no stdin, dentro das instruções do agente
  const cx = await runOn(b, { prompt: 'CODEX-APPEND', systemPrompt: 'BASE', options: { cwd: WORKDIR, profile: 'codex-default' } });
  assert.equal(exitOf(cx.events).status, 'done');
  const entry = await waitFor(() => existsSync(log) && readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).find(e => e.stdin.includes('CODEX-APPEND')));
  assert.ok(entry.stdin.startsWith('<instrucoes-do-agente>\nBASE\n\nEXTRA-A\n\nEXTRA-B\n</instrucoes-do-agente>'), entry.stdin.slice(0, 120));
  // teto de 20k por plugin
  await setMode(b, { appendSystem: 'e'.repeat(25000) });
  await setMode(b, {}, 'policy-b');
  const big = exitOf((await runOn(b, { prompt: 'oi', systemPrompt: 'BASE', options: { cwd: WORKDIR } })).events).result.split('|SYS:')[1];
  assert.equal(big.length, 'BASE'.length + 2 + 20000);
  // corte de 100k reaplicado depois de acrescentar
  await setMode(b, { appendSystem: 'EXTRA-FINAL' });
  const cut = exitOf((await runOn(b, { prompt: 'oi', systemPrompt: 'a'.repeat(100000), options: { cwd: WORKDIR } })).events).result.split('|SYS:')[1];
  assert.equal(cut.length, 100000); assert.ok(cut.endsWith('\n\nEXTRA-FINAL'), 'o acréscimo nunca é descartado: corta-se a base');
});

test('beforeSpawn: o primeiro veto vence (na ordem dos plugins) e os seguintes nem são chamados', async () => {
  const second = cloneFixture('policy', 'policy-b');
  const b = await startBridge({ local: pcfg([fx('policy'), second], ['policy', 'policy-b'], { policy: { grants: ['run.mutate'] }, 'policy-b': { grants: ['run.mutate'] } }) });
  await setMode(b, { block: 'primeiro' }); await setMode(b, { block: 'segundo' }, 'policy-b');
  const res = await postRun(b, { prompt: 'oi', options: { cwd: WORKDIR } });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'Execução bloqueada pelo plugin policy: primeiro');
  assert.equal((await seenOf(b, 'policy-b')).length, 0);
  await setMode(b, {});
  const second403 = await postRun(b, { prompt: 'oi', options: { cwd: WORKDIR } });
  assert.equal(second403.status, 403);
  assert.equal((await second403.json()).error, 'Execução bloqueada pelo plugin policy-b: segundo');
  assert.equal((await seenOf(b, 'policy-b')).length, 1);
});

test('beforeSpawn: fail-open por padrão (lança ou trava e a execução segue); failClosed por plugin bloqueia, e só vale no arquivo local', async () => {
  const open = await polBridge({}, polGrants, { SQUAD_PLUGIN_HOOK_TIMEOUT_MS: '300' });
  await setMode(open, { throw: true });
  assert.equal(exitOf((await runOn(open, { prompt: 'oi', options: { cwd: WORKDIR } })).events).status, 'done');
  await waitFor(() => /politica quebrada/.test(open.out()));
  assert.match(open.out(), /plugin policy/);
  await setMode(open, { hang: true });
  const t0 = Date.now();
  assert.equal(exitOf((await runOn(open, { prompt: 'oi', options: { cwd: WORKDIR } })).events).status, 'done');
  assert.ok(Date.now() - t0 >= 250, 'esperou o tempo limite do handler (300 ms)');
  assert.match(open.out(), /tempo limite/);

  const closed = await polBridge({}, { policy: { grants: ['run.mutate'], failClosed: true } }, { SQUAD_PLUGIN_HOOK_TIMEOUT_MS: '300' });
  await setMode(closed, { throw: true });
  const thrown = await postRun(closed, { prompt: 'oi', options: { cwd: WORKDIR } });
  assert.equal(thrown.status, 403);
  assert.match((await thrown.json()).error, /^Execução bloqueada pelo plugin policy: .*politica quebrada/);
  await setMode(closed, { hang: true });
  const slow = await postRun(closed, { prompt: 'oi', options: { cwd: WORKDIR } });
  assert.equal(slow.status, 403);
  assert.match((await slow.json()).error, /^Execução bloqueada pelo plugin policy: .*tempo limite/);
  await setMode(closed, {});
  assert.equal((await postRun(closed, { prompt: 'oi', options: { cwd: WORKDIR } })).status, 201);
  // failClosed no arquivo compartilhado não vale
  const shared = await startBridge({ shared: { plugins: { entries: { policy: { failClosed: true } } } }, local: pcfg([fx('policy')], ['policy'], polGrants) });
  await setMode(shared, { throw: true });
  assert.equal((await postRun(shared, { prompt: 'oi', options: { cwd: WORKDIR } })).status, 201);
});

test('beforeSpawn: orçamento total (5 s; SQUAD_PLUGIN_BEFORESPAWN_BUDGET_MS nos testes) corta o hook lento; failClosed vira bloqueio', async () => {
  const b = await polBridge({}, polGrants, { SQUAD_PLUGIN_BEFORESPAWN_BUDGET_MS: '500', SQUAD_PLUGIN_HOOK_TIMEOUT_MS: '3000' });
  await setMode(b, { delayMs: 2500 });
  const t0 = Date.now();
  const res = await postRun(b, { prompt: 'oi', options: { cwd: WORKDIR } });
  assert.equal(res.status, 201);
  assert.ok(Date.now() - t0 < 2500 - 600, `cortado pelo orçamento de 500 ms, bem antes dos 2500 ms do hook (${Date.now() - t0} ms)`);
  const closed = await polBridge({}, { policy: { grants: ['run.mutate'], failClosed: true } }, { SQUAD_PLUGIN_BEFORESPAWN_BUDGET_MS: '400' });
  await setMode(closed, { delayMs: 2500 });
  const blocked = await postRun(closed, { prompt: 'oi', options: { cwd: WORKDIR } });
  assert.equal(blocked.status, 403);
  assert.match((await blocked.json()).error, /plugin policy: .*(tempo|orçamento)/);
});

test('beforeSpawn: veto em Chamado vira erro de ferramenta no pai (que segue), sem execução filha; cancelar o pai durante o hook não cria o filho', async () => {
  const log = path.join(scratch('squad-pl-clog-'), 'codex.jsonl');
  const b = await polBridge({}, { policy: { grants: ['run.mutate'] } }, { FAKE_CODEX_LOG: log });
  await setupDb(b);
  const agents = { argus: { description: 'revisor', prompt: 'Revise.' } };
  const entryOf = marker => waitFor(() => existsSync(log) && readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).find(e => e.stdin.includes(marker) && e.mcp?.call));
  await setMode(b, { block: 'sem colegas hoje', onlyCalls: true });
  const parent = await runOn(b, { prompt: 'CALL veto', options: { cwd: WORKDIR, profile: 'codex-default', agents } });
  assert.equal(exitOf(parent.events).status, 'done', 'o pai não é vetado nem falha');
  const entry = await entryOf('CALL veto');
  assert.equal(entry.mcp.call.result.isError, true);
  assert.match(entry.mcp.call.result.content[0].text, /^Não foi possível chamar argus: Execução bloqueada pelo plugin policy: sem colegas hoje$/);
  const results = parent.events.filter(e => e.type === 'user').flatMap(e => e.message.content).filter(c => c.type === 'tool_result');
  assert.ok(results.some(c => /Não foi possível chamar argus: Execução bloqueada pelo plugin policy/.test(JSON.stringify(c.content))), 'o texto do erro chega ao stream do pai (o fake-codex não repassa isError no item)');
  const seen = await seenOf(b);
  assert.deepEqual(seen.map(s => s.isCall), [false, true]);
  assert.equal(seen[1].parentRunId, parent.runId);
  assert.equal((await b.json('/api/runs')).runs.length, 1, 'nenhuma execução filha');

  // parentAlive segue síncrono depois do hook: pai cancelado durante o hook (preso num portão que o teste abre), nenhum filho nasce
  await setMode(b, { gate: true, onlyCalls: true });
  const res = await postRun(b, { prompt: 'CALL cancelado', options: { cwd: WORKDIR, profile: 'codex-default', agents } });
  const { runId } = await res.json();
  await waitFor(async () => (await seenOf(b)).length === 4);
  assert.equal((await b.api(`/api/runs/${runId}/cancel`, { method: 'POST' })).status, 200);
  await waitFor(async () => (await b.json('/api/runs')).runs.find(r => r.id === runId)?.status === 'cancelled');
  assert.equal((await b.api('/api/plugins/policy/release', { method: 'POST' })).status, 200);
  await waitFor(async () => (await b.json('/api/plugins/policy/released')).released === 1);
  await sleep(100); // o hook já voltou; só dá a vez ao que vem depois dele no launchRun
  const runs = (await b.json('/api/runs')).runs;
  assert.equal(runs.length, 2, 'só os dois pais; o Chamado do pai cancelado não foi lançado');
  assert.ok(runs.every(r => !r.parentRunId));
});

/* ---------- registerAdapter ---------- */
const adapterCfg = (grants, settings, extra = {}) => pcfg([fx('fake-adapter')], ['fake-adapter'], { 'fake-adapter': { ...(grants ? { grants } : {}), ...(settings ? { settings } : {}) } }, extra);

test('registerAdapter: x-echo entra por POST /api/profiles, aparece em adapters e engines e roda com exit.usage', async () => {
  const b = await startBridge({ local: adapterCfg(['adapter']) });
  const view = byId(await b.json('/api/plugins'))['fake-adapter'];
  assert.equal(view.status, 'active'); assert.deepEqual(view.adapters, ['x-echo']);
  assert.deepEqual(view.capabilities, { asked: ['adapter', 'adapter.override'], granted: ['adapter'], missing: ['adapter.override'] });
  await setupDb(b);
  const before = await b.json('/api/profiles');
  assert.deepEqual(Object.keys(before.adapters), ['claude', 'codex', 'x-echo']);
  assert.deepEqual(before.adapters['x-echo'], { models: [{ id: 'x-1', label: 'X 1' }], efforts: ['low'], adapterSource: 'plugin:fake-adapter' });
  assert.equal(before.adapters.claude.adapterSource, 'builtin');
  assert.equal((await b.json('/api/health')).engines['x-echo'], false, 'sem Perfil que o use, o motor não conta');
  const eco = await newProfile(b, { name: 'Eco', adapter: 'x-echo', effort: 'low' });
  assert.equal(eco.adapter, 'x-echo'); assert.match(eco.status.version, /x-echo 1\.0\.0/);
  assert.equal((await b.api('/api/profiles', { method: 'POST', body: JSON.stringify({ name: 'Ruim', adapter: 'x-echo', effort: 'ultra' }) })).status, 400);
  assert.equal((await b.json('/api/health')).engines['x-echo'], true);
  const run = await runOn(b, { prompt: 'oi', systemPrompt: 'SIS', options: { cwd: WORKDIR, profile: eco.id } });
  const ex = exitOf(run.events);
  assert.deepEqual({ status: ex.status, adapter: ex.adapter, usage: ex.usage, result: ex.result, profileId: ex.profileId }, { status: 'done', adapter: 'x-echo', usage: { input: 11, output: 5 }, result: 'X-ECHO:SIS|oi', profileId: eco.id });
  assert.deepEqual(run.args, ['--run']);
  assert.equal(run.events.find(e => e.type === 'bridge' && e.subtype === 'profile').adapter, 'x-echo');
  assert.equal((await b.json('/api/runs')).runs[0].adapter, 'x-echo');
  // os embutidos seguem iguais
  assert.equal(exitOf((await runOn(b, { prompt: 'oi', options: { cwd: WORKDIR } })).events).result, 'ECHO:oi|SYS:');
});

test('registerAdapter: sem o grant "adapter" o plugin fica denied e nada é registrado; impl inválida, kind repetido ou diferente e falha depois do registro desfazem tudo', async () => {
  const none = await startBridge({ local: adapterCfg(null) });
  const denied = byId(await none.json('/api/plugins'))['fake-adapter'];
  assert.equal(denied.status, 'denied'); assert.match(denied.error, /Capacidade "adapter" não concedida/); assert.deepEqual(denied.adapters, []);
  assert.deepEqual(Object.keys((await none.json('/api/profiles')).adapters), ['claude', 'codex']);
  for (const [settings, error] of [[{ invalid: true }, /Adapter x-echo inválido/], [{ twice: true }, /já registrado/], [{ failAfter: true }, /falhou depois de registrar/]]) {
    const b = await startBridge({ local: adapterCfg(['adapter'], settings) });
    const v = byId(await b.json('/api/plugins'))['fake-adapter'];
    assert.equal(v.status, 'error', JSON.stringify(settings)); assert.match(v.error, error); assert.deepEqual(v.adapters, []);
    assert.deepEqual(Object.keys((await b.json('/api/profiles')).adapters), ['claude', 'codex'], 'o registro foi desfeito');
    await setupDb(b);
    const res = await b.api('/api/profiles', { method: 'POST', body: JSON.stringify({ name: 'Eco', adapter: 'x-echo' }) });
    assert.equal(res.status, 400); assert.match((await res.json()).error, /Adapter inválido\. Use claude ou codex\./);
  }
  const mismatch = cloneFixture('fake-adapter', 'fake-kind');
  writeFileSync(path.join(mismatch, 'server.mjs'), readFileSync(path.join(mismatch, 'server.mjs'), 'utf8').replace('ctx.registerAdapter(kind, impl);', "ctx.registerAdapter('outro-kind', impl);"));
  const m = await startBridge({ local: pcfg([mismatch], ['fake-kind'], { 'fake-kind': { grants: ['adapter'] } }) });
  const mv = byId(await m.json('/api/plugins'))['fake-kind'];
  assert.equal(mv.status, 'error'); assert.match(mv.error, /kind/);
});

test('registerAdapter: sobrescrever claude/codex exige adapter.override; sem ele derruba o register e o embutido segue; com ele vale; falha depois restaura o embutido', async () => {
  const builtinModels = (await (await startBridge({})).json('/api/profiles')).adapters.claude.models;
  const noOverride = await startBridge({ local: adapterCfg(['adapter'], { kind: 'claude' }) });
  const d = byId(await noOverride.json('/api/plugins'))['fake-adapter'];
  assert.equal(d.status, 'denied'); assert.match(d.error, /Capacidade "adapter\.override" não concedida/); assert.deepEqual(d.adapters, []);
  assert.equal(exitOf((await runOn(noOverride, { prompt: 'oi', options: { cwd: WORKDIR } })).events).result, 'ECHO:oi|SYS:', 'o Claude embutido segue');

  const over = await startBridge({ local: adapterCfg(['adapter', 'adapter.override'], { kind: 'claude' }) });
  const v = byId(await over.json('/api/plugins'))['fake-adapter'];
  assert.equal(v.status, 'active'); assert.deepEqual(v.adapters, ['claude']);
  assert.deepEqual((await over.json('/api/profiles')).adapters.claude.models, [{ id: 'x-1', label: 'X 1' }]);
  assert.equal(exitOf((await runOn(over, { prompt: 'oi', options: { cwd: WORKDIR } })).events).result, 'X-ECHO:oi', 'o Perfil Claude padrão roda no Adapter do plugin');

  const undone = await startBridge({ local: adapterCfg(['adapter', 'adapter.override'], { kind: 'claude', failAfter: true }) });
  const u = byId(await undone.json('/api/plugins'))['fake-adapter'];
  assert.equal(u.status, 'error'); assert.deepEqual(u.adapters, []);
  assert.deepEqual((await undone.json('/api/profiles')).adapters.claude.models, builtinModels, 'o embutido foi restaurado');
  assert.equal(exitOf((await runOn(undone, { prompt: 'oi', options: { cwd: WORKDIR } })).events).result, 'ECHO:oi|SYS:');
});

test('registerAdapter: plugin desligado com Perfil existente dá erro claro na execução, no status do Perfil e fora de engines', async () => {
  const data = scratch('squad-pl-adata-');
  const on = await startBridge({ local: adapterCfg(['adapter']), data });
  await setupDb(on);
  const eco = await newProfile(on, { name: 'Eco', adapter: 'x-echo' });
  assert.equal(exitOf((await runOn(on, { prompt: 'oi', options: { cwd: WORKDIR, profile: eco.id } })).events).status, 'done');
  await on.stop();
  const off = await startBridge({ local: pcfg([fx('fake-adapter')], []), data });
  assert.equal(byId(await off.json('/api/plugins'))['fake-adapter'].status, 'disabled');
  const res = await postRun(off, { prompt: 'oi', options: { cwd: WORKDIR, profile: eco.id } });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /O Adapter "x-echo" do Perfil "Eco" não está disponível neste bridge/);
  const listed = (await off.json('/api/profiles')).profiles.find(p => p.id === eco.id);
  assert.match(listed.status.error, /Adapter "x-echo".*não está disponível/);
  assert.ok(!('x-echo' in (await off.json('/api/health')).engines));
  assert.equal((await off.api(`/api/profiles/${eco.id}/refresh`, { method: 'POST' })).status, 400);
  assert.equal((await off.json('/api/health')).activeRuns, 0, 'nenhuma vaga tomada');
});

/* =====================================================================================================================
 * Correções da revisão (segurança e TypeScript) dos passos 6 e 7
 * ===================================================================================================================== */
test('revisão H1/M2: sem run.content o run:event é uma projeção por whitelist; com run.content vem inteiro; cada plugin recebe uma cópia congelada', async () => {
  const events = [
    { type: 'assistant', message: { content: [{ type: 'text', text: 'SEGREDO-TEXTO' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'cat SEGREDO-INPUT' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'SEGREDO-SAIDA' }] } },
    { type: 'bridge', subtype: 'spawned', pid: 1, cwd: '/SEGREDO-CWD', args: ['SEGREDO-ARG'] },
    { type: 'stderr', text: 'SEGREDO-ERR' },
    { type: 'raw', text: 'SEGREDO-RAW' },
    { type: 'stream_event', event: { delta: { text: 'SEGREDO-DELTA' } } },
    { type: 'exit', status: 'done', code: 0, isError: false, result: 'SEGREDO-RESULT', error: 'SEGREDO-ERRO', costUsd: 0.5, numTurns: 2, usage: { input: 1 } },
  ];
  const payloads = events.map((event, i) => ({ runId: 'r', seq: i + 1, at: 'agora', event }));
  globalThis.__observer = undefined;
  const plain = (await hostFor([fx('observer-bad')], ['observer-bad'], { entries: { 'observer-bad': { settings: { mode: 'ok' } } } })).host;
  for (const p of payloads) plain.emit('run:event', p);
  await waitFor(() => globalThis.__observer.calls === 6); // o stream_event não é entregue
  const seen = globalThis.__observer.seen;
  assert.ok(!JSON.stringify(seen).includes('SEGREDO'), 'nenhum conteúdo na projeção');
  const base = { runId: 'r', at: 'agora', parentToolUseId: null };
  assert.deepEqual(seen[0], { ...base, seq: 1, type: 'assistant', subtype: null, toolName: 'Bash' });
  assert.deepEqual(seen[1], { ...base, seq: 2, type: 'user', subtype: null, isError: true, bytes: 13 });
  assert.deepEqual(seen[2], { ...base, seq: 3, type: 'bridge', subtype: 'spawned' });
  assert.deepEqual(seen[3], { ...base, seq: 4, type: 'stderr', subtype: null });
  assert.deepEqual(seen[4], { ...base, seq: 5, type: 'raw', subtype: null });
  assert.deepEqual(seen[5], { ...base, seq: 7, type: 'exit', subtype: null, status: 'done', code: 0, isError: false, costUsd: 0.5, numTurns: 2, usage: { input: 1 } });
  assert.ok(seen.every(p => Object.isFrozen(p)));
  assert.notEqual(seen[0], payloads[0]); assert.ok(!Object.isFrozen(payloads[0]) && !Object.isFrozen(payloads[0].event), 'o payload do núcleo não é congelado nem compartilhado');

  globalThis.__observer = undefined;
  const full = cloneFixture('observer-bad', 'observer-content', { capabilities: ['run.content'] });
  const rich = (await hostFor([full], ['observer-content'], { entries: { 'observer-content': { grants: ['run.content'], settings: { mode: 'ok', partial: true } } } })).host;
  for (const p of payloads) rich.emit('run:event', p);
  await waitFor(() => globalThis.__observer.calls === 7); // com {partial: true} o stream_event vem
  const got = globalThis.__observer.seen;
  assert.deepEqual(got.map(p => p.event), events);
  assert.notEqual(got[0].event, events[0], 'cópia, não o objeto vivo');
  assert.ok(Object.isFrozen(got[0].event.message.content[1].input), 'congelado em profundidade');
});

test('revisão TS L1/M3: sem assinante o payload nem é construído (built === 0); com assinantes é construído uma vez só', async () => {
  globalThis.__observer = undefined;
  const two = cloneFixture('observer-bad', 'observer-two', { capabilities: [] });
  const { host } = await hostFor([fx('observer-bad'), two], ['observer-bad', 'observer-two'], { entries: { 'observer-bad': { settings: { mode: 'ok', events: ['run:start'] } }, 'observer-two': { settings: { mode: 'ok', events: ['run:start'] } } } });
  let built = 0;
  host.emit('run:finish', () => { built++; return {}; });
  host.emit('run:event', () => { built++; return rev(1); });
  assert.equal(built, 0);
  host.emit('run:start', () => { built++; return { runId: 'a' }; });
  assert.equal(built, 1, 'uma construção para os dois assinantes');
  await waitFor(() => globalThis.__observer.calls === 2);
  assert.notEqual(globalThis.__observer.seen[0], globalThis.__observer.seen[1], 'cada plugin recebe a sua cópia');
});

test('revisão TS M2: sob pressão a fila descarta primeiro run:event (stream_event antes) e preserva run:start e run:finish', async () => {
  globalThis.__observer = undefined;
  let release; globalThis.__observerGate = new Promise(r => { release = r; });
  const { host } = await hostFor([fx('observer-bad')], ['observer-bad'], { entries: { 'observer-bad': { settings: { mode: 'gate', events: ['run:event', 'run:start', 'run:finish'] } } } });
  host.emit('run:event', rev(0));
  await waitFor(() => globalThis.__observer.calls === 1);
  host.emit('run:start', { runId: 'r' });
  for (let n = 1; n <= 1100; n++) host.emit('run:event', rev(n));
  host.emit('run:finish', { runId: 'r' });
  for (let n = 1101; n <= 1200; n++) host.emit('run:event', rev(n));
  release();
  await waitFor(() => globalThis.__observer.calls === 1001);
  const seen = globalThis.__observer.seen;
  assert.equal(seen.filter(p => p.runId === 'r' && !('seq' in p)).length, 2, 'run:start e run:finish sobreviveram');
  const by = Object.fromEntries(host.list()[0].observers.map(o => [o.event, o.dropped]));
  assert.deepEqual(by, { 'run:event': 202, 'run:start': 0, 'run:finish': 0 });

  globalThis.__observer = undefined;
  let release2; globalThis.__observerGate = new Promise(r => { release2 = r; });
  const full = cloneFixture('observer-bad', 'observer-content', { capabilities: ['run.content'] });
  const rich = (await hostFor([full], ['observer-content'], { entries: { 'observer-content': { grants: ['run.content'], settings: { mode: 'gate', partial: true } } } })).host;
  rich.emit('run:event', rev(0));
  await waitFor(() => globalThis.__observer.calls === 1);
  for (let i = 1; i <= 600; i++) { rich.emit('run:event', { runId: 'r', seq: i, at: 'x', event: { type: 'stream_event' } }); rich.emit('run:event', { runId: 'r', seq: 1000 + i, at: 'x', event: { type: 'normal' } }); }
  release2();
  await waitFor(() => globalThis.__observer.calls === 1001);
  const got = globalThis.__observer.seen;
  assert.equal(got.filter(p => p.event.type === 'normal').length, 600, 'nenhum evento normal foi descartado');
  assert.equal(got.filter(p => p.event.type === 'stream_event').length, 400, 'os 200 descartados eram stream_event');
});

test('revisão M1: run:finish sem run.content leva o código do erro (cancelled|timeout|exit|agent-error|spawn) e sem sessionId; com run.content, completo', async () => {
  const rich = cloneFixture('event-log', 'log-content', { capabilities: ['run.content'] });
  const b = await startBridge({ local: pcfg([fx('event-log'), rich], ['event-log', 'log-content'], { 'log-content': { grants: ['run.content'] } }) });
  const finishOf = async (id, runId) => (await waitFor(async () => (await logOf(b, id)).find(e => e.event === 'run:finish' && e.payload.runId === runId))).payload;
  const fail = await runOn(b, { prompt: 'FAIL oi', options: { cwd: WORKDIR } });
  const plain = await finishOf('event-log', fail.runId), full = await finishOf('log-content', fail.runId);
  assert.equal(plain.status, 'error'); assert.equal(plain.error, 'exit'); assert.ok(!('sessionId' in plain) && !('errorCode' in plain));
  assert.equal(full.error, 'fake failure'); assert.equal(full.errorCode, 'exit'); assert.equal(full.sessionId, 'fake-session');
  const sleeping = await (await postRun(b, { prompt: 'SLEEP', options: { cwd: WORKDIR } })).json();
  await waitFor(async () => (await b.json('/api/health')).activeRuns === 1);
  await b.api(`/api/runs/${sleeping.runId}/cancel`, { method: 'POST' });
  assert.equal((await finishOf('event-log', sleeping.runId)).error, 'cancelled');
  assert.equal((await finishOf('log-content', sleeping.runId)).error, 'Execução cancelada pelo operador.');
  const ok = await runOn(b, { prompt: 'oi', options: { cwd: WORKDIR } });
  assert.equal((await finishOf('event-log', ok.runId)).error, null);
});

test('revisão H2/M1: o payload do beforeSpawn é cópia congelada por handler; mutar tools/profile/agentSlugs não muda o argv nem o que o próximo plugin vê', async () => {
  const log = path.join(scratch('squad-pl-clog-'), 'codex.jsonl');
  const second = cloneFixture('policy', 'policy-b');
  const b = await startBridge({ local: pcfg([fx('policy'), second], ['policy', 'policy-b'], { policy: { grants: ['run.mutate'] }, 'policy-b': { grants: ['run.mutate'] } }), env: { FAKE_CODEX_LOG: log } });
  await setupDb(b);
  await setMode(b, { mutate: true });
  const claude = await runOn(b, { prompt: 'oi', options: { cwd: WORKDIR, tools: ['Read'] } });
  assert.ok(claude.args.includes('Read') && !JSON.stringify(claude.args).includes('Bash'), JSON.stringify(claude.args));
  const init = claude.events.find(e => e.type === 'system' && e.subtype === 'init');
  assert.ok(!JSON.stringify(init.args).includes('Bash'));
  const other = (await seenOf(b, 'policy-b'))[0];
  assert.deepEqual(other.tools, ['Read']); assert.equal(other.profile.adapter, 'claude'); assert.deepEqual(other.agentSlugs, []);
  const cx = await runOn(b, { prompt: 'CODEX-MUTATE', options: { cwd: WORKDIR, profile: 'codex-default', tools: ['Read'] } });
  assert.equal(exitOf(cx.events).status, 'done');
  const entry = await waitFor(() => existsSync(log) && readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).find(e => e.stdin.includes('CODEX-MUTATE')));
  assert.ok(entry.argv.includes('read-only') && !entry.argv.includes('workspace-write'), 'a mutação de tools não virou permissão de escrita');
  assert.equal((await seenOf(b, 'policy-b')).at(-1).profile.adapter, 'codex');
});

test('revisão L2: getter que lança em block/appendSystem é falha do plugin (fail-open, ou bloqueio com failClosed)', async () => {
  const open = await polBridge();
  await setMode(open, { getterThrows: true });
  assert.equal((await postRun(open, { prompt: 'oi', options: { cwd: WORKDIR } })).status, 201);
  await waitFor(() => /getter quebrado/.test(open.out()));
  const closed = await polBridge({}, { policy: { grants: ['run.mutate'], failClosed: true } });
  await setMode(closed, { getterThrows: true });
  const res = await postRun(closed, { prompt: 'oi', options: { cwd: WORKDIR } });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /^Execução bloqueada pelo plugin policy: .*getter quebrado/);
});

test('revisão H1 (TS): appendSystem nunca é descartado em silêncio: corta-se a base, e o run mostra um evento bridge/plugin e um aviso', async () => {
  const b = await polBridge({}, { policy: { grants: ['run.mutate'] } });
  await setMode(b, { appendSystem: 'EXTRA-A' });
  const r1 = await runOn(b, { prompt: 'oi', systemPrompt: 'BASE', options: { cwd: WORKDIR } });
  const note = r1.events.find(e => e.type === 'bridge' && e.subtype === 'plugin');
  assert.equal(note.plugin, 'policy'); assert.equal(note.message, 'plugin policy acrescentou 7 caracteres ao system prompt');
  await setMode(b, { appendSystem: 'e'.repeat(25000) });
  const r2 = await runOn(b, { prompt: 'oi', systemPrompt: 'BASE', options: { cwd: WORKDIR } });
  assert.match(r2.events.find(e => e.type === 'bridge' && e.subtype === 'plugin').message, /acrescentou 20000 caracteres.*cortado de 25000/);
  await setMode(b, { appendSystem: 'EXTRA-FINAL' });
  const r3 = await runOn(b, { prompt: 'oi', systemPrompt: 'a'.repeat(100000), options: { cwd: WORKDIR } });
  const sys = exitOf(r3.events).result.split('|SYS:')[1];
  assert.equal(sys.length, 100000); assert.ok(sys.endsWith('\n\nEXTRA-FINAL'));
  assert.ok(r3.events.some(e => e.type === 'bridge' && e.subtype === 'warning' && /base.*cortad.*13 caracteres/.test(e.message)), 'a base cortada é avisada');
  const none = await runOn(b, { prompt: 'oi', systemPrompt: 'curto', options: { cwd: WORKDIR } });
  assert.ok(!none.events.some(e => e.type === 'bridge' && e.subtype === 'warning' && /cortad/.test(e.message)));
});

test('revisão TS L2: o probe de uso (internal.exact, meta.kind probe) não passa pelo beforeSpawn', async () => {
  const b = await polBridge({}, { policy: { grants: ['run.mutate'] } });
  await setupDb(b);
  await setMode(b, { block: 'tudo bloqueado' });
  const res = await b.api('/api/profiles/claude-default/refresh', { method: 'POST' });
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(await seenOf(b), [], 'o hook nem foi chamado');
  assert.equal((await postRun(b, { prompt: 'oi', options: { cwd: WORKDIR } })).status, 403, 'uma execução comum segue vetada');
});

test('revisão TS L4: durante o encerramento o bridge não faz spawn depois do hook', async () => {
  const log = path.join(scratch('squad-pl-clog-'), 'codex.jsonl');
  const b = await polBridge({}, { policy: { grants: ['run.mutate'] } }, { FAKE_CODEX_LOG: log });
  await setupDb(b);
  await setMode(b, { delayMs: 150 });
  const pending = postRun(b, { prompt: 'CODEX-SHUTDOWN', options: { cwd: WORKDIR, profile: 'codex-default' } }).then(r => r.status, () => 'derrubada');
  await waitFor(async () => (await seenOf(b)).length === 1);
  b.proc.kill('SIGTERM');
  await b.exited;
  const status = await pending;
  await sleep(300);
  assert.ok(!existsSync(log), `nenhum codex foi lançado durante o encerramento (resposta: ${status})`);
});

test('revisão TS L5: quando o orçamento foi gasto por plugin anterior, o failClosed diz isso', async () => {
  const second = cloneFixture('policy', 'policy-b');
  const b = await startBridge({ local: pcfg([fx('policy'), second], ['policy', 'policy-b'], { policy: { grants: ['run.mutate'] }, 'policy-b': { grants: ['run.mutate'], failClosed: true } }), env: { SQUAD_PLUGIN_BEFORESPAWN_BUDGET_MS: '300', SQUAD_PLUGIN_HOOK_TIMEOUT_MS: '3000' } });
  await setMode(b, { delayMs: 1500 });
  const res = await postRun(b, { prompt: 'oi', options: { cwd: WORKDIR } });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /plugin policy-b: .*orçamento total de 300 ms esgotado pelos plugins anteriores/);
});

/* ---------- adapters de plugin (revisão M3, M4, M5) ---------- */
test('revisão M3/M4: adapter de plugin recebe env mínimo, não recebe headers de telemetria nativa (aviso) e vê só uma visão do run, sem prompts dos colegas', async () => {
  const b = await startBridge({ local: adapterCfg(['adapter']), env: { SQUAD_TEST_SECRET: 'segredo-do-ambiente', XECHO_DECLARED: 'declarado', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9' } });
  await setupDb(b);
  const eco = await newProfile(b, { name: 'Eco', adapter: 'x-echo', effort: 'low', telemetry: { enabled: true, native: true, content: false } });
  const run = await runOn(b, { prompt: 'oi', options: { cwd: WORKDIR, profile: eco.id, agents: { argus: { description: 'revisor', prompt: 'PROMPT-SECRETO-DO-COLEGA' } } }, meta: { kind: 'step' } });
  const init = run.events.find(e => e.type === 'system' && e.subtype === 'init');
  assert.deepEqual(init.env, { leak: null, declared: 'declarado', hasPath: true, own: 'meu' }, 'só o mínimo, o declarado no manifesto e o que o prepare definiu');
  assert.deepEqual(run.args, ['--run'], 'nativeTelemetry não foi chamado');
  assert.ok(run.events.some(e => e.type === 'bridge' && e.subtype === 'warning' && /Telemetria nativa/.test(e.message)));
  const last = (await b.json('/api/plugins/fake-adapter/last')).last;
  assert.deepEqual(last.runKeys, ['cwd', 'effort', 'endedAt', 'id', 'kind', 'label', 'model', 'opts', 'parentRunId', 'profile', 'result', 'seenModel', 'startedAt', 'status', 'translator']);
  assert.deepEqual(last.runAgents, { argus: ['description'] }); assert.deepEqual(last.specAgents, { argus: ['description'] });
  assert.equal(last.hasAgentMeta, false); assert.equal(last.profileId, eco.id); assert.equal(last.kind, 'step'); assert.equal(last.effort, 'low');
  assert.equal(exitOf(run.events).usage.input, 11, 'finish e onEvent seguem funcionando com a visão');
});

test('revisão M5: só se sobrescreve um embutido; o segundo override é denied; adapterSource em /api/profiles (catálogo e Perfil) e /api/health; log do start', async () => {
  const again = cloneFixture('fake-adapter', 'fake-adapter-2');
  const grants = { grants: ['adapter', 'adapter.override'], settings: { kind: 'claude' } };
  const b = await startBridge({ local: pcfg([fx('fake-adapter'), again], ['fake-adapter', 'fake-adapter-2'], { 'fake-adapter': grants, 'fake-adapter-2': grants }) });
  const plugins = byId(await b.json('/api/plugins'));
  assert.equal(plugins['fake-adapter'].status, 'active');
  assert.equal(plugins['fake-adapter-2'].status, 'denied'); assert.match(plugins['fake-adapter-2'].error, /claude.*já.*substituído.*fake-adapter/);
  assert.deepEqual(plugins['fake-adapter-2'].adapters, []);
  await waitFor(() => /Adapter "claude" substituído pelo plugin fake-adapter/.test(b.out()));
  await setupDb(b);
  const prof = await b.json('/api/profiles');
  assert.equal(prof.adapters.claude.adapterSource, 'plugin:fake-adapter'); assert.equal(prof.adapters.codex.adapterSource, 'builtin');
  assert.deepEqual(prof.profiles.map(p => [p.adapter, p.adapterSource]), [['claude', 'plugin:fake-adapter'], ['codex', 'builtin']]);
  assert.deepEqual((await b.json('/api/health')).adapterSources, { claude: 'plugin:fake-adapter', codex: 'builtin' });
  const plain = await startBridge({});
  assert.deepEqual((await plain.json('/api/health')).adapterSources, { claude: 'builtin', codex: 'builtin' });
});

/* ---------- revisão final do Codex ---------- */
test('B1: meta.kind "probe" vindo do corpo público não contorna o beforeSpawn (nem o failClosed); o probe de /refresh segue sem hook', async () => {
  const b = await polBridge({}, { policy: { grants: ['run.mutate'], failClosed: true } });
  await setupDb(b);
  await setMode(b, { block: 'tudo bloqueado' });
  const res = await postRun(b, { prompt: 'oi', options: { cwd: WORKDIR }, meta: { kind: 'probe' } });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /Execução bloqueada pelo plugin policy/);
  await setMode(b, { throw: true });
  assert.equal((await postRun(b, { prompt: 'oi', options: { cwd: WORKDIR }, meta: { kind: 'probe' } })).status, 403, 'failClosed também vale');
  const seenBefore = (await seenOf(b)).length;
  assert.equal((await b.api('/api/profiles/claude-default/refresh', { method: 'POST' })).status, 200);
  assert.equal((await seenOf(b)).length, seenBefore, 'o probe interno não chama o hook');
});

test('B2: um path compartilhado que aponta para a pasta de um plugin do home (ou um alias por symlink) não elimina o local', () => {
  const home = scratch('squad-pl-b2-');
  const dir = path.join(home, '.squad-code', 'plugins');
  cpSync(fx('hello'), path.join(dir, 'hello'), { recursive: true });
  const alias = path.join(scratch('squad-pl-b2l-'), 'alias');
  symlinkSync(path.join(dir, 'hello'), alias);
  for (const shared of [[path.join(dir, 'hello')], [alias]]) {
    const { loader } = loaderFor({ home, shared: { plugins: { paths: shared } }, local: { plugins: { enabled: ['hello'] } } });
    const r = loader.load();
    const hello = r.discovery.plugins.filter(p => p.id === 'hello');
    assert.equal(hello.length, 1, JSON.stringify(hello.map(p => [p.status, p.source])));
    assert.equal(hello[0].local, true); assert.equal(hello[0].status, undefined); assert.equal(hello[0].source, 'home');
    assert.ok(hello[0].serverFile);
  }
  // e o mesmo vale quando o caminho compartilhado vem antes do local na ordem de leitura de dois paths locais/compartilhados
  const { loader } = loaderFor({ home, shared: { plugins: { paths: [path.join(dir, 'hello')] } }, local: { plugins: { paths: [alias], enabled: ['hello'] } } });
  assert.equal(loader.load().discovery.plugins.filter(p => p.id === 'hello' && !p.status).length, 1);
});

test('B3: a sondagem do executável (--version) de um adapter de plugin usa o env mínimo, e o cache não mistura os contextos', async () => {
  const b = await startBridge({ local: adapterCfg(['adapter']), env: { SQUAD_TEST_SECRET: 'sentinela-secreta' } });
  await setupDb(b);
  const eco = await newProfile(b, { name: 'Eco', adapter: 'x-echo' });
  assert.equal(eco.status.version, 'x-echo 1.0.0', 'sem VAZOU:');
  const listed = (await b.json('/api/profiles')).profiles.find(p => p.id === eco.id);
  assert.equal(listed.status.version, 'x-echo 1.0.0');
  const test = await (await b.api(`/api/profiles/${eco.id}/test`, { method: 'POST' })).json();
  assert.equal(test.status.version, 'x-echo 1.0.0');
  assert.doesNotMatch(JSON.stringify(await b.json('/api/health')), /sentinela-secreta|VAZOU/);
  // o mesmo executável por um Perfil de adapter embutido (env completo) enxerga a variável: o cache distingue os dois contextos
  const bin = fx('fake-adapter') + '/bin.mjs';
  const builtin = await newProfile(b, { name: 'Claude no bin', adapter: 'claude', bin });
  assert.match(builtin.status.version, /VAZOU:sentinela-secreta/);
  const again = (await b.json('/api/profiles')).profiles;
  assert.equal(again.find(p => p.id === eco.id).status.version, 'x-echo 1.0.0');
  assert.match(again.find(p => p.id === builtin.id).status.version, /VAZOU/);
});

test('N1: depois do estouro do import (top-level await lento) o register() nunca é chamado', async () => {
  const marker = path.join(scratch('squad-pl-mark-'), 'marker.txt');
  const b = await startBridge({ local: pcfg([fx('slow-import'), fx('hello')], ['slow-import', 'hello']), env: { SQUAD_PLUGIN_REGISTER_TIMEOUT_MS: '300', SQUAD_PLUGIN_MARKER: marker, SQUAD_SLOW_MS: '800' } });
  const plugins = byId(await b.json('/api/plugins'));
  assert.equal(plugins['slow-import'].status, 'error'); assert.match(plugins['slow-import'].error, /tempo limite/i);
  assert.equal(plugins.hello.status, 'active');
  await sleep(1300); // o import termina bem depois do estouro
  assert.doesNotMatch(readFileSync(marker, 'utf8'), /register-called slow-import/);
  assert.equal(byId(await b.json('/api/plugins'))['slow-import'].status, 'error');
});

test('N2: restartRequired detecta mudança no código do plugin (hash do server), no env e no configSchema', async () => {
  const dir = path.join(scratch('squad-pl-n2-'), 'hello');
  cpSync(fx('hello'), dir, { recursive: true });
  const b = await startBridge({ local: pcfg([dir], ['hello']) });
  assert.equal((await b.json('/api/plugins')).restartRequired, false);
  assert.equal((await b.json('/api/plugins')).restartRequired, false, 'estável entre leituras');
  writeFileSync(path.join(dir, 'server.mjs'), readFileSync(path.join(dir, 'server.mjs'), 'utf8') + '\n// mudou\n');
  assert.equal((await b.json('/api/plugins')).restartRequired, true, 'código mudou');
  const c = await startBridge({ local: pcfg([dir], ['hello']) });
  assert.equal((await c.json('/api/plugins')).restartRequired, false);
  const manifest = JSON.parse(readFileSync(path.join(dir, 'squad-plugin.json'), 'utf8'));
  writeJson(path.join(dir, 'squad-plugin.json'), { ...manifest, env: ['HELLO_SECRET', 'OUTRA'] });
  assert.equal((await c.json('/api/plugins')).restartRequired, true, 'env mudou');
  const d = await startBridge({ local: pcfg([dir], ['hello']) });
  assert.equal((await d.json('/api/plugins')).restartRequired, false);
  writeJson(path.join(dir, 'squad-plugin.json'), { ...manifest, env: ['HELLO_SECRET', 'OUTRA'], configSchema: { type: 'object' } });
  assert.equal((await d.json('/api/plugins')).restartRequired, true, 'configSchema mudou');
});

/* ---------- revisão do Codex no PR (P2) ---------- */
test('P2-1: com o adapter claude substituído por um plugin, /api/health não usa a sonda avulsa do CLI embutido', async () => {
  const gone = path.join(scratch('squad-pl-nobin-'), 'codex-ausente');
  // O executável do override não existe; o CLI embutido (SQUAD_CLAUDE_BIN) existe, mas não é ele que roda o Perfil Claude padrão.
  const b = await startBridge({ local: adapterCfg(['adapter', 'adapter.override'], { kind: 'claude', missingBin: true }), env: { SQUAD_CODEX_BIN: gone } });
  assert.equal(byId(await b.json('/api/plugins'))['fake-adapter'].status, 'active');
  const h = await b.json('/api/health');
  assert.equal(h.engines.claude, false, 'o executável do override não existe');
  assert.equal(h.claudeVersion, null, 'a página fica no demo');
  assert.equal(h.engineAdapter, null);
  assert.equal(h.adapterSources.claude, 'plugin:fake-adapter');
  // Com o executável do override presente, o Perfil Claude conta pela sonda do override.
  const ok = await startBridge({ local: adapterCfg(['adapter', 'adapter.override'], { kind: 'claude' }), env: { SQUAD_CODEX_BIN: gone } });
  const h2 = await ok.json('/api/health');
  assert.equal(h2.engines.claude, true); assert.match(h2.claudeVersion, /x-echo 1\.0\.0/); assert.equal(h2.engineAdapter, 'claude');
  // Sem override, a sonda do CLI embutido segue valendo.
  const plain = await startBridge({ env: { SQUAD_CODEX_BIN: gone } });
  const h3 = await plain.json('/api/health');
  assert.equal(h3.engines.claude, true); assert.ok(h3.claudeVersion); assert.match(h3.claudePath, /fake-claude\.mjs$/);
});

test('P2-2: plugin só de conteúdo que requer um plugin com código cujo register() falha ou estoura o tempo sai da página e fica disabled', async () => {
  for (const [dep, env] of [['throws-on-register', {}], ['hangs-on-register', { SQUAD_PLUGIN_REGISTER_TIMEOUT_MS: '300' }]]) {
    const child = cloneFixture('content-only', `needs-${dep}`, { requires: [dep] });
    const b = await startBridge({ local: pcfg([fx(dep), fx('content-only'), child], [dep]), env });
    const listed = byId(await b.json('/api/plugins'));
    assert.equal(listed[dep].status, 'error');
    const v = listed[`needs-${dep}`];
    assert.equal(v.status, 'disabled', dep);
    assert.match(v.error, new RegExp(`depende de "${dep}", que não carregou \\(error\\)`));
    assert.deepEqual(v.categories, []);
    assert.equal(listed['content-only'].status, 'data');
    const tag = JSON.parse((await (await fetch(b.base + '/')).text()).match(/id="squad-plugins">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(tag.plugins.map(p => p.id), ['content-only'], dep);
    assert.equal((await b.json('/api/health')).plugins, 1);
    await b.stop();
  }
});

test('P2-2b: cadeia código (falha) ← conteúdo ← código: o de conteúdo cai antes de o segundo com código carregar, e ele fica disabled', async () => {
  const mid = cloneFixture('content-only', 'needs-throws', { requires: ['throws-on-register'] });
  const tail = cloneFixture('hello', 'tail-code', { requires: ['needs-throws'] });
  const b = await startBridge({ local: pcfg([fx('throws-on-register'), mid, tail], ['throws-on-register', 'tail-code']) });
  const listed = byId(await b.json('/api/plugins'));
  assert.equal(listed['throws-on-register'].status, 'error');
  assert.equal(listed['needs-throws'].status, 'disabled');
  assert.equal(listed['tail-code'].status, 'disabled');
  assert.match(listed['tail-code'].error, /depende de "needs-throws", que não carregou \(disabled\)/);
  assert.equal((await b.api('/api/plugins/tail-code/hello')).status, 404, 'sem rotas do dependente');
  assert.equal((await b.json('/api/health')).plugins, 0);
  await b.stop();
});

test('P2-3b: o esforço salvo no Perfil (efetivo, sem override na execução) também é conferido contra o adapter que o substituiu', async () => {
  const data = scratch('squad-pl-effort-');
  const b1 = await startBridge({ data });
  await setupDb(b1);
  const forte = await newProfile(b1, { name: 'Forte', adapter: 'claude', effort: 'high' });
  await b1.stop();
  const b = await startBridge({ data, local: adapterCfg(['adapter', 'adapter.override'], { kind: 'claude' }) });
  const res = await postRun(b, { prompt: 'oi', options: { cwd: WORKDIR, profile: forte.id } });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /esforço "high" do Perfil "Forte" não é aceito pelo Adapter "claude".*low/i);
  assert.equal((await b.json('/api/plugins/fake-adapter/last')).last, null, 'prepare não foi chamado');
  assert.equal((await b.json('/api/health')).activeRuns, 0, 'a vaga voltou');
  // Um esforço explícito aceito pelo adapter vence o do Perfil e roda.
  assert.equal(exitOf((await runOn(b, { prompt: 'oi', options: { cwd: WORKDIR, profile: forte.id, effort: 'low' } })).events).status, 'done');
  await b.stop();
});

test('P2-3: esforço explícito fora de efforts do adapter do Perfil é recusado (400) antes de preparar a execução', async () => {
  const b = await startBridge({ local: adapterCfg(['adapter']) });
  await setupDb(b);
  const eco = await newProfile(b, { name: 'Eco', adapter: 'x-echo' });
  let res = await postRun(b, { prompt: 'oi', options: { cwd: WORKDIR, profile: eco.id, effort: 'ultra' } });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /esforço "ultra" não é aceito pelo Adapter "x-echo".*Eco.*low/i);
  assert.equal((await b.json('/api/plugins/fake-adapter/last')).last, null, 'prepare não foi chamado');
  assert.equal((await b.json('/api/health')).activeRuns, 0, 'a vaga voltou');
  // O que o adapter anuncia (e o padrão, sem esforço) segue rodando.
  assert.equal(exitOf((await runOn(b, { prompt: 'oi', options: { cwd: WORKDIR, profile: eco.id, effort: 'low' } })).events).status, 'done');
  assert.equal(exitOf((await runOn(b, { prompt: 'oi', options: { cwd: WORKDIR, profile: eco.id } })).events).status, 'done');
  // Os embutidos: Claude aceita os níveis dele e recusa um só do Codex; Codex aceita os dele (max/ultra o adapter ajusta ao modelo).
  assert.equal(exitOf((await runOn(b, { prompt: 'oi', options: { cwd: WORKDIR, effort: 'max' } })).events).status, 'done');
  await waitFor(async () => (await b.json('/api/profiles')).profiles.some(p => p.id === 'codex-default'));
  assert.equal(exitOf((await runOn(b, { prompt: 'oi', options: { cwd: WORKDIR, profile: 'codex-default', effort: 'ultra' } })).events).status, 'done');
  res = await postRun(b, { prompt: 'oi', options: { cwd: WORKDIR, effort: 'minimal' } });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Adapter "claude"/);
  // Um esforço que nenhum adapter conhece segue com a mensagem de antes.
  res = await postRun(b, { prompt: 'oi', options: { cwd: WORKDIR, effort: 'turbo' } });
  assert.equal(res.status, 400); assert.match((await res.json()).error, /Nível de esforço inválido/);
});
