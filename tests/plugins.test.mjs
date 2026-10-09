// Plugins com código, passos 4 e 5 (docs/plans/plugins.md): schema único do manifesto, descoberta (a mesma dos plugins de conteúdo),
// ordem, carga (plugin-host.js), ctx e rotas.
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
const { createPluginLoader, orderPlugins, CONSTANTS, SCHEMAS } = require('../plugins.js');
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
const PORT0 = 4700 + Math.floor(Math.random() * 40);
let portN = 0;
const bridges = [];
/** Starts server.js with temporary SQUAD_HOME / SQUAD_CONFIG / SQUAD_CONFIG_SHARED. `local`/`shared`: configuration objects (or null = no file). */
async function startBridge({ local = null, shared = null, env = {}, port = PORT0 + portN++, home = scratch('squad-pl-bhome-'), data = scratch('squad-pl-bdata-'), expectExit = false } = {}) {
  const cfgDir = scratch('squad-pl-bcfg-');
  const localFile = path.join(cfgDir, 'local.json'), sharedFile = path.join(cfgDir, 'shared.json');
  writeJson(localFile, local || {}); // always there: a missing SQUAD_CONFIG file is a warning of its own
  if (shared) writeJson(sharedFile, shared);
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(port)], {
    cwd: ROOT,
    env: { ...process.env, SQUAD_HOME: home, SQUAD_PROJECTS_DIR: scratch('squad-pl-bproj-'), SQUAD_DATA_DIR: data, TMPDIR: scratch('squad-pl-btmp-'), SQUAD_CLAUDE_BIN: path.join(ROOT, 'tests', 'fake-claude.mjs'), SQUAD_CODEX_BIN: path.join(ROOT, 'tests', 'fake-codex.mjs'), SQUAD_PRINT_TOKEN: '1', SQUAD_CONFIG: localFile, SQUAD_CONFIG_SHARED: sharedFile, SQUAD_PLUGINS: '', ...env },
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
    proc, base, token, port, data, home, out: () => out, exited,
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
  const { createPluginHost } = require('../plugin-host.js');
  const host = createPluginHost({ getDiscovery: () => ({ plugins: [], config: { enabled: [], entries: {} }, warnings: [] }), dataRoot: '/nonexistent', http: {}, maxBody: 1 });
  assert.equal(host.pending, false); assert.equal(host.closing, false);
  const ready = host.ready;
  await host.load();
  assert.equal(host.pending, false); assert.equal(host.ready, ready);
  assert.equal(host.active(), 0); assert.equal(host.hasDisposers(), false);
  assert.deepEqual(host.view(), { plugins: [], restartRequired: false, warnings: [] });
  assert.equal(await host.route({ method: 'GET' }, {}, new URL('http://x/api/plugins/a/b')), false);
});
