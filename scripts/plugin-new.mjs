#!/usr/bin/env node
// Scaffold de plugin (plugins/README.md, "Criar um plugin"):
//   npm run plugin:new -- <id> [--name "Nome"] [--code] [--no-content] [--no-git] [--dir <pasta>]
// Cria .plugins/<id>/ (ou --dir: a pasta do plugin) com squad-plugin.json, README.md, .gitignore, um agente de exemplo (salvo
// --no-content) e server.mjs (com --code); por padrão faz git init + commit inicial no repositório do plugin. Registro no
// squad.local.json (nunca no squad.config.json compartilhado): --code põe o id em plugins.enabled; uma pasta fora de .plugins/ e de
// ~/.squad-code/plugins/ entra em plugins.paths. SQUAD_CONFIG troca o squad.local.json, SQUAD_PLUGINS_DIR a pasta .plugins/ e
// SQUAD_HOME o home (testes).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync, statSync, chmodSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { CONSTANTS, APP_VERSION, API_VERSION, PLUGIN_FILE } = require('../plugins/loader.js');
const { PLUGIN_ID_RE, WINDOWS_RESERVED_RE } = CONSTANTS;

const fail = msg => { console.error(`plugin:new: ${msg}`); process.exit(1); };
const USAGE = 'uso: npm run plugin:new -- <id> [--name "Nome"] [--code] [--no-content] [--no-git] [--dir <pasta>]';

/* ---------- argumentos ---------- */
const opts = { id: '', name: '', code: false, content: true, git: true, dir: '' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--code') opts.code = true;
  else if (a === '--no-content') opts.content = false;
  else if (a === '--no-git') opts.git = false;
  else if (a === '--name' || a === '--dir') { const v = argv[++i]; if (v === undefined || v.startsWith('--')) fail(`${a} precisa de um valor\n${USAGE}`); opts[a.slice(2)] = v; }
  else if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
  else if (a.startsWith('-')) fail(`opção desconhecida: ${a}\n${USAGE}`);
  else if (!opts.id) opts.id = a;
  else fail(`argumento a mais: ${a}\n${USAGE}`);
}
const { id } = opts;
if (!id) fail(USAGE);
if (!PLUGIN_ID_RE.test(id)) fail(`id inválido "${id}": use minúsculas, números e hífen, 2 a 41 caracteres, começando por letra ou número`);
if (WINDOWS_RESERVED_RE.test(id)) fail(`id "${id}" é nome reservado do Windows`);
const name = (opts.name || id).trim().slice(0, 80) || id;

/* ---------- onde ---------- */
const cwd = process.cwd();
const home = process.env.SQUAD_HOME || os.homedir();
const repoPlugins = process.env.SQUAD_PLUGINS_DIR ? path.resolve(cwd, process.env.SQUAD_PLUGINS_DIR) : path.join(ROOT, '.plugins');
const homePlugins = path.join(home, '.squad-code', 'plugins');
const dir = path.resolve(cwd, opts.dir || path.join(repoPlugins, id));
if (existsSync(dir)) fail(`a pasta ${dir} já existe; escolha outro id ou outra --dir`);
const real = p => { try { return realpathSync(p); } catch { return path.resolve(p); } };
const parentReal = real(path.dirname(dir));
const scanned = [repoPlugins, homePlugins].map(real).includes(parentReal);
if (scanned && path.basename(dir) !== id) fail(`dentro de ${path.dirname(dir)} a pasta precisa ter o nome do id ("${id}")`);
const configFile = process.env.SQUAD_CONFIG ? path.resolve(cwd, process.env.SQUAD_CONFIG) : path.join(ROOT, 'squad.local.json');
// Lido antes de criar qualquer coisa: um squad.local.json ilegível para o scaffold sem deixar pasta pela metade.
const needPath = !scanned, needEnable = opts.code;
let config = null, configExisted = false;
if (needPath || needEnable) {
  configExisted = existsSync(configFile);
  if (configExisted) {
    try { config = JSON.parse(readFileSync(configFile, 'utf8').replace(/^﻿/, '')); } catch (e) { fail(`${configFile}: JSON inválido (${e.message}); corrija o arquivo antes`); }
    if (!config || typeof config !== 'object' || Array.isArray(config)) fail(`${configFile}: deve ser um objeto JSON`);
    if (config.plugins !== undefined && (!config.plugins || typeof config.plugins !== 'object' || Array.isArray(config.plugins))) fail(`${configFile}: "plugins" deve ser um objeto`);
    for (const k of ['paths', 'enabled']) if (config.plugins?.[k] !== undefined && !Array.isArray(config.plugins[k])) fail(`${configFile}: "plugins.${k}" deve ser uma lista`);
  } else {
    const target = path.join(ROOT, 'schemas', 'squad.schema.json'), rel = path.relative(path.dirname(configFile), target);
    config = { $schema: rel.startsWith('..') || path.isAbsolute(rel) ? target : `./${rel.split(path.sep).join('/')}` };
  }
}

/* ---------- arquivos do plugin ---------- */
const [major, minor] = APP_VERSION.split('.');
const insideClone = !path.relative(ROOT, dir).startsWith('..') && !path.isAbsolute(path.relative(ROOT, dir));
const manifest = {
  ...(insideClone ? { $schema: path.relative(dir, path.join(ROOT, 'schemas', 'squad-plugin.schema.json')).split(path.sep).join('/') } : {}),
  id, name, version: '0.1.0', description: `Plugin ${name} do SQUAD/CODE.`, squadCode: `^${major}.${minor}.0`,
  ...(opts.code ? { apiVersion: API_VERSION, server: 'server.mjs', capabilities: [] } : {}),
  ...(opts.content ? { categories: [{ key: id, label: name }] } : {}),
};
const agentName = `${id.toUpperCase().slice(0, 21).replace(/-+$/, '')}-01`;
const files = {
  [PLUGIN_FILE]: JSON.stringify(manifest, null, 2) + '\n',
  '.gitignore': 'node_modules/\n.DS_Store\n*.log\n',
  'README.md': [
    `# ${name}`, '',
    `Plugin \`${id}\` do SQUAD/CODE. Guia de plugins: \`plugins/README.md\` no repositório do SQUAD/CODE.`, '',
    '## Instalar', '',
    '```sh', `git clone <url-deste-repositório> .plugins/${id}`, '```', '',
    opts.code ? `Código do bridge: habilite em \`squad.local.json\` (\`"plugins": {"enabled": ["${id}"]}\`) e reinicie o bridge.` : 'Só conteúdo: recarregue a página do SQUAD/CODE.', '',
    '## Conteúdo', '',
    ...(opts.content ? [`- \`agents/01-${agentName}.md\`: agente de exemplo (operador, categoria "${name}").`] : []),
    ...(opts.code ? ['- `server.mjs`: `register(ctx)` com a rota `GET /api/plugins/' + id + '/ping` e um observador de `run:finish`.'] : []),
    ...(!opts.content && !opts.code ? ['- (vazio: acrescente agents/, conventions.json, avatars/ ou themes)'] : []), '',
    '## Compatibilidade', '',
    `\`squadCode\` em \`${PLUGIN_FILE}\`: \`${manifest.squadCode}\` (versões do SQUAD/CODE suportadas).`, '',
  ].join('\n'),
};
if (opts.content) files[`agents/01-${agentName}.md`] = [
  '---', `name: ${agentName}`, 'slot: operator', 'role: backend', `category: ${id}`, `description: Agente de exemplo do plugin ${name}.`, '---',
  `Você é o agente de exemplo do plugin ${name}. Descreva aqui o papel, o jeito de trabalhar e o que entregar.`, '',
].join('\n');
if (opts.code) files['server.mjs'] = [
  `// Código do bridge do plugin ${id} (plugins/README.md, "ctx" e "Eventos"). Só roda com o id em plugins.enabled do squad.local.json.`,
  'export function register(ctx) {',
  `  // GET /api/plugins/${id}/ping (mesmo token, Host e Origin das rotas do núcleo)`,
  "  ctx.registerRoute('GET', '/ping', () => ({ ok: true, plugin: ctx.id }));",
  '  // Sem a capacidade run.content o payload é uma projeção (ids, status, custo), nunca prompt ou texto.',
  "  ctx.on('run:finish', run => { ctx.log(`execução ${run.runId} terminou: ${run.status}`); });",
  '}', '',
].join('\n');

mkdirSync(dir, { recursive: true });
for (const [rel, text] of Object.entries(files)) {
  const file = path.join(dir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/* ---------- git (repositório do plugin, nunca o do app) ---------- */
const notes = [];
if (opts.git) {
  const git = args => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  const init = git(['init', '-q']);
  if (init.error) notes.push(`git não encontrado (${init.error.code || init.error.message}); o plugin foi criado sem repositório`);
  else if (init.status !== 0) notes.push(`git init falhou: ${(init.stderr || '').trim()}`);
  else {
    git(['add', '-A']);
    const commit = git(['commit', '-q', '-m', `${name}: estrutura inicial (npm run plugin:new)`]);
    if (commit.status !== 0) notes.push(`git commit falhou (${(commit.stderr || '').trim().split('\n')[0]}); configure user.name/user.email e faça o commit em ${dir}`);
  }
}

/* ---------- registro no squad.local.json ---------- */
const registered = [];
if (config) {
  const plugins = config.plugins || (config.plugins = {});
  if (needPath) {
    const rel = path.relative(path.dirname(configFile), dir);
    const entry = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep).join('/') : dir;
    plugins.paths = plugins.paths || [];
    if (!plugins.paths.includes(entry)) { plugins.paths.push(entry); registered.push(`plugins.paths += "${entry}"`); }
  }
  if (needEnable) {
    plugins.enabled = plugins.enabled || [];
    if (!plugins.enabled.includes(id)) { plugins.enabled.push(id); registered.push(`plugins.enabled += "${id}"`); }
  }
  if (registered.length) {
    mkdirSync(path.dirname(configFile), { recursive: true });
    let mode = null;
    if (configExisted) { copyFileSync(configFile, configFile + '.bak'); mode = statSync(configFile).mode & 0o777; }
    const tmp = `${configFile}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n');
    if (mode !== null) chmodSync(tmp, mode);
    renameSync(tmp, configFile);
  }
}

/* ---------- resumo ---------- */
const shown = p => (path.relative(cwd, p).startsWith('..') ? p : path.relative(cwd, p) || '.');
console.log(`Plugin "${id}" criado em ${shown(dir)}:`);
for (const rel of Object.keys(files).sort()) console.log(`  ${rel}`);
if (registered.length) console.log(`${configExisted ? 'Atualizado' : 'Criado'} ${shown(configFile)}${configExisted ? ' (cópia em .bak)' : ''}: ${registered.join(', ')}`);
for (const n of notes) console.log(`Aviso: ${n}`);
console.log('\nPróximos passos:');
if (opts.content) console.log(`  - edite agents/01-${agentName}.md e recarregue a página (Configurações > Plugins lista o plugin)`);
if (opts.code) {
  console.log('  - reinicie o bridge (npm start ou npm run dev) para carregar o server.mjs');
  console.log(`  - teste: GET /api/plugins/${id}/ping; capacidades extras vão em capabilities do manifesto e em plugins.entries.${id}.grants`);
}
if (!opts.content && !opts.code) console.log('  - acrescente conteúdo (agents/, conventions.json, avatars/, themes) e recarregue a página');
