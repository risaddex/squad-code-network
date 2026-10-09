'use strict';
/*
 * Plugins (docs/plans/plugins-conteudo.md): local configuration (squad.config.json + squad.local.json, SQUAD_CONFIG, SQUAD_PLUGINS) and the
 * loader of the plugins it points to (squad-plugin.json, agents/*.md, avatars, conventions.json, themes, runtime defaults).
 * No dependencies: the agents' frontmatter goes through a small strict parser of a YAML subset (parseFrontmatter).
 * A plugin is trusted (the person installed it), but reads stay inside its folder (realpath), with size and count limits and no SVG.
 * createPluginLoader(...).load() rereads only when a file it read (or a folder it listed) changed: mtime + size of each one.
 */
const fs = require('node:fs');
const path = require('node:path');

const LIMITS = { plugins: 20, agents: 200, text: 256 * 1024, image: 1024 * 1024, images: 12 * 1024 * 1024, avatars: 200, themes: 20, categories: 30, cssVars: 200 };
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/;
// DIRETRIZES ids (families, templates, subsets, groups and a preset's conventions.subsets); the app uses the same expression.
const CONV_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/;
// Keys that would reach Object's prototype in a map (frontmatter keys, conventions families, ids): always refused.
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// Text limits shared with the page (readPlugins/pluginLimits in src/app.js): over the limit the item is refused with a warning.
// Agent fields follow what normalizeWorkspace keeps (specialty 40, soul 1200, 8 greetings of 300, prompt 20000, tools of TOOLS);
// DIRETRIZES too: a template's content becomes an agent's base (20000), a subset's content is kept up to 8000.
const TEXT = {
  preset: { specialty: 40, description: 1000, soul: 1200, hello: 300, hellos: 8, style: 16000, subsets: 20 },
  conv: { name: 60, label: 60, icon: 40, group: 81, tags: 300, desc: 300, summary: 300, content: 20000 },
};
const SUBSET_TEXT = { ...TEXT.conv, content: 8000 };
// The tools an agent can have: TOOLS in src/app.js (pluginLimits().tools); normalizeWorkspace drops any other name.
const TOOLS = ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash', 'WebFetch', 'WebSearch', 'NotebookEdit'];
const NAME_RE = /^[A-Z0-9][A-Z0-9-]{1,23}$/;
const SLOTS = ['commander', 'adr', 'prd', 'operator'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const PERMISSION_MODES = ['acceptEdits', 'auto', 'bypassPermissions', 'manual', 'dontAsk', 'plan'];
const MODEL_RE = /^[A-Za-z0-9._\-\[\]]{1,80}$/;
const ICON_RE = /^[a-z0-9-]{1,40}$/;
const AVATAR_REF_RE = /^[A-Za-z0-9][A-Za-z0-9:/_-]{0,80}$/;
const CSS_VAR_RE = /^--[a-z0-9-]{1,40}$/;
const NUM = '\\s*\\d{1,3}(?:\\.\\d+)?%?\\s*';
const CSS_COLOR_RE = new RegExp(`^(?:#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\\(${NUM},${NUM},${NUM}(?:,\\s*(?:0|1|0?\\.\\d+|1\\.0+|\\d{1,3}%)\\s*)?\\))$`, 'i');
const THEME_KEYS = {
  city: ['bg', 'build', 'tree', 'water', 'wall', 'exposure'],
  office: ['bg', 'tile', 'rim', 'build', 'cyan', 'purple', 'plaza', 'green', 'amber'],
  agent: ['blue'],
  run: ['work', 'plan', 'wait', 'call', 'baton', 'done'],
};
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

/* ---------- frontmatter: a strict YAML subset ---------- */
// `chave: valor` (string, number, true/false; quotes optional), inline lists `[a, "b, c"]`, block lists `- item`, one level of nested
// map, `#` comments outside quotes. Anything else throws (the file is refused with a warning).
function stripComment(s) {
  let q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\' && q === '"') i++; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trim();
  }
  return s.trim();
}
function parseScalar(s) {
  if (s.startsWith('"')) {
    const m = s.match(/^"((?:[^"\\]|\\.)*)"$/);
    if (!m) throw new Error('aspas duplas sem fechamento');
    return m[1].replace(/\\(.)/g, (_, c) => { const map = { n: '\n', t: '\t', '"': '"', '\\': '\\' }; if (!(c in map)) throw new Error(`escape \\${c} não suportado`); return map[c]; });
  }
  if (s.startsWith("'")) {
    const m = s.match(/^'((?:[^']|'')*)'$/);
    if (!m) throw new Error('aspas simples sem fechamento');
    return m[1].replace(/''/g, "'");
  }
  if (/^[{}\[\]&*!|>%@`]/.test(s)) throw new Error(`sintaxe YAML não suportada: ${s.slice(0, 20)}`);
  if (s === 'null' || s === '~') throw new Error('null não é aceito');
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}
function parseValue(s) {
  if (!s.startsWith('[')) return parseScalar(s);
  if (!s.endsWith(']')) throw new Error('lista sem ] de fechamento');
  const inner = s.slice(1, -1).trim();
  if (!inner) return [];
  const items = []; let q = '', cur = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (q) { cur += c; if (c === '\\' && q === '"') { cur += inner[++i] ?? ''; } else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; }
    else if (c === '[' || c === ']' || c === '{' || c === '}') throw new Error('listas aninhadas não são aceitas');
    else if (c === ',') { items.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  if (q) throw new Error('aspas sem fechamento na lista');
  items.push(cur.trim());
  if (items.some(x => !x)) throw new Error('item vazio na lista');
  return items.map(parseScalar);
}
const isBlank = line => !line.trim() || line.trim().startsWith('#');
const indentOf = line => line.match(/^ */)[0].length;

function parseYamlSubset(lines, firstLine) {
  const out = {};
  let i = 0;
  const at = (n, msg) => new Error(`linha ${firstLine + n}: ${msg}`);
  const wrap = (n, fn) => { try { return fn(); } catch (e) { throw at(n, e.message); } };
  for (const [n, line] of lines.entries()) if (/^\s*\t/.test(line)) throw at(n, 'use espaços, não tabs, na indentação');
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    if (indentOf(line)) throw at(i, 'indentação inesperada');
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*)|\s*)$/);
    if (!m) throw at(i, 'esperado "chave: valor"');
    const key = m[1];
    if (RESERVED_KEYS.has(key)) throw at(i, `chave reservada: ${key}`);
    if (Object.prototype.hasOwnProperty.call(out, key)) throw at(i, `chave repetida: ${key}`);
    const rest = stripComment(m[2] || ''), keyLine = i;
    i++;
    if (rest) { out[key] = wrap(keyLine, () => parseValue(rest)); continue; }
    // Block value: the following lines indented, or `- item` lines at any indentation.
    const child = [];
    while (i < lines.length && (isBlank(lines[i]) || indentOf(lines[i]) > 0 || /^-(\s|$)/.test(lines[i]))) {
      if (!isBlank(lines[i])) child.push([i, lines[i]]);
      i++;
    }
    if (!child.length) { out[key] = ''; continue; }
    const ind = indentOf(child[0][1]);
    const bad = child.find(([, l]) => indentOf(l) !== ind);
    if (bad) throw at(bad[0], 'só um nível de aninhamento é aceito');
    if (child.every(([, l]) => /^-(\s|$)/.test(l.trim()))) {
      out[key] = child.map(([n, l]) => {
        const v = stripComment(l.trim().slice(1));
        if (!v) throw at(n, 'item de lista vazio');
        if (v.startsWith('[')) throw at(n, 'listas aninhadas não são aceitas');
        if (/^[A-Za-z_][A-Za-z0-9_-]*:(\s|$)/.test(v)) throw at(n, 'mapas dentro de listas não são aceitos');
        return wrap(n, () => parseScalar(v));
      });
    } else if (ind > 0) {
      const map = {};
      for (const [n, l] of child) {
        const mm = l.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*)|\s*)$/);
        if (!mm) throw at(n, 'esperado "chave: valor" no mapa aninhado');
        if (RESERVED_KEYS.has(mm[1])) throw at(n, `chave reservada: ${mm[1]}`);
        if (Object.prototype.hasOwnProperty.call(map, mm[1])) throw at(n, `chave repetida: ${mm[1]}`);
        const v = stripComment(mm[2] || '');
        if (!v) throw at(n, 'só um nível de aninhamento é aceito');
        map[mm[1]] = wrap(n, () => parseValue(v));
      }
      out[key] = map;
    } else throw at(child[0][0], 'bloco inválido');
  }
  return out;
}

/** `---` frontmatter `---` + body. Throws with a line number on anything outside the subset. */
function parseFrontmatter(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0].trim() !== '---') throw new Error('o arquivo precisa começar com --- (frontmatter)');
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) throw new Error('frontmatter sem o --- de fechamento');
  return { data: parseYamlSubset(lines.slice(1, end), 2), body: lines.slice(end + 1).join('\n').trim() };
}

/* ---------- value checks ---------- */
const str = (v, max) => {
  if (v === undefined || v === '') return '';
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') throw new Error('esperado texto');
  if (v.length > max) throw new Error(`texto maior que ${max} caracteres`);
  return v.trim();
};
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
/** 0xRRGGBB number, '#rrggbb' or '0xrrggbb' → number; otherwise null. */
function hexColor(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : null;
  if (typeof v === 'string' && /^(#|0x)[0-9a-f]{6}$/i.test(v.trim())) return parseInt(v.trim().replace(/^(#|0x)/i, ''), 16);
  return null;
}

/** Runtime defaults (contract whitelist), in the app's DEFAULT_RUNTIME types. Invalid values are dropped with a warning. */
function validateRuntime(value, where, warn) {
  const out = {};
  if (value === undefined || value === null) return out;
  if (!isObj(value)) { warn(`${where}: "runtime" deve ser um objeto`); return out; }
  const bad = k => warn(`${where}: runtime.${k} inválido, ignorado`);
  const list = v => Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean).join(', ') : typeof v === 'string' ? v.trim() : null;
  for (const [k, v] of Object.entries(value)) {
    switch (k) {
      case 'permissionMode': PERMISSION_MODES.includes(v) ? out[k] = v : bad(k); break;
      case 'model': typeof v === 'string' && (v === '' || MODEL_RE.test(v)) ? out[k] = v : bad(k); break;
      case 'effort': typeof v === 'string' && (v === '' || EFFORTS.includes(v)) ? out[k] = v : bad(k); break;
      case 'maxBudgetUsd': {
        if (v === '' || v === null) { out[k] = ''; break; }
        const n = Number(v); Number.isFinite(n) && n > 0 && n <= 1000 ? out[k] = String(n) : bad(k); break;
      }
      case 'timeoutSec': { const n = Number(v); Number.isInteger(n) && n >= 10 && n <= 7200 ? out[k] = n : bad(k); break; }
      case 'concurrency': { const n = Number(v); Number.isInteger(n) && n >= 1 && n <= 8 ? out[k] = n : bad(k); break; }
      case 'restrictTools': typeof v === 'boolean' ? out[k] = v : bad(k); break;
      case 'addDirs': case 'extraAllowedTools': { const s = list(v); s !== null && s.length <= 2000 ? out[k] = s : bad(k); break; }
      default: warn(`${where}: runtime.${k} não é uma chave permitida, ignorada`);
    }
  }
  return out;
}

function validateTheme(t, where, warn) {
  if (!isObj(t)) throw new Error('tema deve ser um objeto');
  const key = String(t.key || '');
  if (!KEY_RE.test(key)) throw new Error(`key de tema inválida: ${key.slice(0, 40)}`);
  const out = { key, label: str(t.label, 60) || key, ui: {}, city: {}, office: {}, agent: {}, run: {} };
  const tw = msg => warn(`${where}: tema ${key}: ${msg}`);
  if (t.ui !== undefined) {
    if (!isObj(t.ui)) tw('"ui" deve ser um objeto');
    else for (const [k, v] of Object.entries(t.ui).slice(0, LIMITS.cssVars)) {
      if (!CSS_VAR_RE.test(k)) { tw(`variável CSS inválida: ${k.slice(0, 50)}`); continue; }
      if (typeof v !== 'string' || !CSS_COLOR_RE.test(v.trim())) { tw(`cor inválida em ${k} (use #hex, rgb() ou rgba())`); continue; }
      out.ui[k] = v.trim();
    }
  }
  for (const group of Object.keys(THEME_KEYS)) {
    const src = t[group];
    if (src === undefined) continue;
    if (!isObj(src)) { tw(`"${group}" deve ser um objeto`); continue; }
    for (const [k, v] of Object.entries(src)) {
      if (!THEME_KEYS[group].includes(k)) continue; // unknown keys are ignored
      if (group === 'city' && k === 'exposure') {
        typeof v === 'number' && v >= 0.5 && v <= 2 ? out.city.exposure = v : tw('city.exposure deve ser um número entre 0.5 e 2');
        continue;
      }
      const n = hexColor(v);
      n === null ? tw(`cor inválida em ${group}.${k} (use 0xRRGGBB ou "#rrggbb")`) : out[group][k] = n;
    }
  }
  return out;
}

function validateCategory(c) {
  if (!isObj(c)) throw new Error('categoria deve ser um objeto');
  const key = String(c.key || '');
  if (!KEY_RE.test(key)) throw new Error(`key de categoria inválida: ${key.slice(0, 40)}`);
  const icon = str(c.icon, 40), before = str(c.before, 41);
  if (icon && !ICON_RE.test(icon)) throw new Error(`ícone inválido: ${icon}`);
  if (before && !KEY_RE.test(before)) throw new Error(`"before" inválido: ${before}`);
  return { key, label: str(c.label, 60) || key, icon, description: str(c.description, 500), before };
}

/** One agents/*.md: frontmatter + body (the preset's `style`). */
function validatePreset(data, body) {
  const field = (k, fn) => { try { return fn(data[k]); } catch (e) { throw new Error(`${k}: ${e.message}`); } };
  const name = field('name', v => str(v, 24));
  if (!NAME_RE.test(name)) throw new Error(`name ausente ou inválido (${name || 'vazio'}): use MAIÚSCULAS, números e hífen, 2 a 24 caracteres`);
  const slot = field('slot', v => str(v, 20));
  if (!SLOTS.includes(slot)) throw new Error(`slot inválido (${slot || 'vazio'}): use ${SLOTS.join(', ')}`);
  const role = field('role', v => str(v, 40));
  if (!/^[a-z0-9-]{1,40}$/.test(role)) throw new Error('role ausente ou inválido');
  let category = field('category', v => str(v, 41));
  if (slot !== 'operator') category = '';
  else if (!category) category = 'outros';
  else if (!KEY_RE.test(category)) throw new Error(`category inválida: ${category}`);
  const icon = field('icon', v => str(v, 40));
  if (icon && !ICON_RE.test(icon)) throw new Error(`icon inválido: ${icon}`);
  const model = field('model', v => str(v, 80));
  if (model && !MODEL_RE.test(model)) throw new Error(`model inválido: ${model}`);
  const effort = field('effort', v => str(v, 10));
  if (effort && !EFFORTS.includes(effort)) throw new Error(`effort inválido: ${effort}`);
  const avatar = field('avatar', v => str(v, 81));
  if (avatar && !AVATAR_REF_RE.test(avatar)) throw new Error(`avatar inválido: ${avatar}`);
  let tools = null;
  if (data.tools !== undefined) {
    if (!Array.isArray(data.tools) || !data.tools.every(t => typeof t === 'string')) throw new Error(`tools deve ser uma lista com nomes de ${TOOLS.join(', ')}`);
    const unknown = data.tools.find(t => !TOOLS.includes(t)), twice = data.tools.find((t, i) => data.tools.indexOf(t) !== i);
    if (unknown !== undefined) throw new Error(`tools: ferramenta desconhecida: ${unknown.slice(0, 40)} (aceitas: ${TOOLS.join(', ')})`);
    if (twice !== undefined) throw new Error(`tools: ferramenta repetida: ${twice}`);
    tools = [...data.tools];
  }
  let hellos = [];
  if (data.hellos !== undefined) {
    if (!Array.isArray(data.hellos) || data.hellos.length > TEXT.preset.hellos) throw new Error(`hellos deve ser uma lista (até ${TEXT.preset.hellos})`);
    hellos = data.hellos.map(h => field('hellos', () => str(h, TEXT.preset.hello))).filter(Boolean);
  }
  let conv = null;
  if (data.conventions !== undefined) {
    const c = data.conventions;
    if (!isObj(c)) throw new Error('conventions deve ser um mapa com template e subsets');
    for (const k of Object.keys(c)) if (k !== 'template' && k !== 'subsets') throw new Error(`conventions.${k} não é aceito`);
    const template = field('conventions', () => str(c.template, 80));
    const subsets = c.subsets === undefined ? [] : c.subsets;
    if (!Array.isArray(subsets) || subsets.length > TEXT.preset.subsets || !subsets.every(s => typeof s === 'string' && CONV_ID_RE.test(s) && !RESERVED_KEYS.has(s))) throw new Error(`conventions.subsets deve ser uma lista de até ${TEXT.preset.subsets} ids`);
    conv = { template, subsets: [...subsets] };
  }
  if (body.length > TEXT.preset.style) throw new Error(`corpo maior que ${TEXT.preset.style} caracteres`);
  return {
    slot, category, name, role, specialty: field('specialty', v => str(v, TEXT.preset.specialty)), icon, model, effort, tools, avatar,
    description: field('description', v => str(v, TEXT.preset.description)), style: body, soul: field('soul', v => str(v, TEXT.preset.soul)), hellos, conv,
  };
}

/** conventions.json: same shape as src/conventions.js; entries without a key/content are dropped. Existing ids: the app refuses them. */
function validateConventions(c, where, warn) {
  if (!isObj(c)) throw new Error('deve ser um objeto { families, subsets, groups }');
  const out = { families: {}, subsets: [], groups: [] };
  const okKey = k => typeof k === 'string' && CONV_ID_RE.test(k) && !RESERVED_KEYS.has(k);
  // Text within TEXT.conv (or the item is refused); `content`/`label` are required by the caller.
  const fits = (o, fields, max = TEXT.conv) => { for (const f of fields) { const v = o[f]; if (v !== undefined && (typeof v !== 'string' || v.length > max[f])) return `${f} deve ser texto de até ${max[f]} caracteres`; } return ''; };
  if (c.families !== undefined) {
    if (!isObj(c.families)) warn(`${where}: "families" deve ser um objeto`);
    else for (const [fam, def] of Object.entries(c.families)) {
      if (!okKey(fam) || !isObj(def) || !Array.isArray(def.templates)) { warn(`${where}: família ${fam.slice(0, 40)} inválida (esperado { templates: [...] })`); continue; }
      const templates = def.templates.filter(t => {
        const ok = isObj(t) && okKey(t.key) && typeof t.content === 'string';
        if (!ok) { warn(`${where}: template inválido em ${fam} (precisa de key e content)`); return false; }
        const bad = fits(t, ['name', 'summary', 'content']);
        if (bad) warn(`${where}: template ${t.key} (${fam}) ignorado: ${bad}`);
        return !bad;
      });
      out.families[fam] = { ...def, templates };
    }
  }
  for (const [list, need] of [['subsets', 'content'], ['groups', 'label']]) {
    if (c[list] === undefined) continue;
    if (!Array.isArray(c[list])) { warn(`${where}: "${list}" deve ser uma lista`); continue; }
    out[list] = c[list].filter(s => {
      const ok = isObj(s) && okKey(s.key) && typeof s[need] === 'string';
      if (!ok) { warn(`${where}: item inválido em ${list} (precisa de key e ${need})`); return false; }
      const bad = list === 'subsets' ? fits(s, ['name', 'group', 'icon', 'tags', 'desc', 'content'], SUBSET_TEXT) : fits(s, ['label', 'icon']);
      if (bad) warn(`${where}: ${list === 'subsets' ? 'subset' : 'grupo'} ${s.key} ignorado: ${bad}`);
      return !bad;
    });
  }
  return out;
}

function imageMime(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/* ---------- loader ---------- */
function createPluginLoader({ root, home, env = process.env, cwd = process.cwd() }) {
  let cache = null; // { sigs: Map<path, sig>, result }

  const statSig = p => { try { const s = fs.statSync(p); return `${s.mtimeMs}:${s.size}:${s.isDirectory() ? 'd' : 'f'}`; } catch { return 'missing'; } };
  const expand = (p, base) => {
    p = String(p).trim();
    if (p === '~') p = home; else if (p.startsWith('~/') || p.startsWith('~\\')) p = path.join(home, p.slice(2));
    return path.resolve(base, p);
  };
  const rel = p => { const r = path.relative(root, p); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : p; };

  function load() {
    if (cache && [...cache.sigs].every(([p, s]) => statSig(p) === s)) return cache.result;
    const sigs = new Map();
    const track = p => { sigs.set(p, statSig(p)); };
    const warnings = [];
    const warn = msg => { if (warnings.length < 200) warnings.push(msg); };

    /* configuration: squad.config.json, then squad.local.json (or SQUAD_CONFIG), then SQUAD_PLUGINS */
    const cfgFiles = [path.join(root, 'squad.config.json'), env.SQUAD_CONFIG ? path.resolve(cwd, env.SQUAD_CONFIG) : path.join(root, 'squad.local.json')];
    const config = { files: [], paths: [], disabled: [], profiles: [] };
    let cfgRuntime = {};
    const addPlugin = p => { if (!config.paths.includes(p)) config.paths.push(p); };
    for (const [idx, file] of cfgFiles.entries()) {
      track(file);
      let text;
      try { text = fs.readFileSync(file, 'utf8'); }
      catch (e) { if (e.code !== 'ENOENT' || (idx === 1 && env.SQUAD_CONFIG)) warn(`${rel(file)}: não foi possível ler (${e.code || e.message})`); continue; }
      let data;
      try { data = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { warn(`${rel(file)}: JSON inválido, arquivo ignorado (${e.message})`); continue; }
      if (!isObj(data)) { warn(`${rel(file)}: deve ser um objeto JSON, arquivo ignorado`); continue; }
      config.files.push(file);
      const base = path.dirname(file);
      if (data.plugins !== undefined) {
        if (!isObj(data.plugins)) warn(`${rel(file)}: "plugins" deve ser um objeto com "paths" e "disabled"`);
        else {
          const { paths, disabled } = data.plugins;
          if (paths !== undefined) {
            if (!Array.isArray(paths)) warn(`${rel(file)}: "plugins.paths" deve ser uma lista de pastas`);
            else for (const p of paths) typeof p === 'string' && p.trim() ? addPlugin(expand(p, base)) : warn(`${rel(file)}: item de "plugins.paths" inválido`);
          }
          if (disabled !== undefined) {
            if (Array.isArray(disabled)) config.disabled = disabled.filter(x => typeof x === 'string').map(x => x.trim());
            else warn(`${rel(file)}: "plugins.disabled" deve ser uma lista de ids`);
          }
        }
      }
      if (data.profiles !== undefined) Array.isArray(data.profiles) ? config.profiles = data.profiles : warn(`${rel(file)}: "profiles" deve ser uma lista`);
      cfgRuntime = { ...cfgRuntime, ...validateRuntime(data.runtime, rel(file), warn) };
    }
    for (const p of String(env.SQUAD_PLUGINS || '').split(path.delimiter).map(s => s.trim()).filter(Boolean)) addPlugin(expand(p, cwd));

    /* plugins */
    const plugins = [];
    let dirs = config.paths;
    if (dirs.length > LIMITS.plugins) { warn(`mais de ${LIMITS.plugins} plugins configurados: os excedentes foram ignorados`); dirs = dirs.slice(0, LIMITS.plugins); }
    for (const dir of dirs) {
      const label = rel(dir);
      track(dir);
      let realRoot;
      try { realRoot = fs.realpathSync(dir); if (!fs.statSync(realRoot).isDirectory()) throw new Error('não é uma pasta'); }
      catch (e) { warn(`${label}: pasta do plugin não encontrada (${e.code || e.message})`); continue; }
      // Reads only inside the plugin folder: lexically and after resolving symlinks. Returns a Buffer or throws a message.
      const read = (relPath, max, exts) => {
        const abs = path.resolve(dir, String(relPath));
        const lex = path.relative(dir, abs);
        if (!lex || lex.startsWith('..') || path.isAbsolute(lex)) throw new Error('caminho fora da pasta do plugin');
        const ext = path.extname(abs).toLowerCase();
        if (ext === '.svg') throw new Error('SVG não é aceito');
        if (!exts.includes(ext)) throw new Error(`extensão não aceita (${ext || 'sem extensão'})`);
        track(abs);
        let real;
        try { real = fs.realpathSync(abs); } catch (e) { throw new Error(e.code === 'ENOENT' ? 'arquivo não encontrado' : e.message); }
        const r = path.relative(realRoot, real);
        if (!r || r.startsWith('..') || path.isAbsolute(r)) throw new Error('aponta para fora da pasta do plugin (link simbólico recusado)');
        const st = fs.statSync(real);
        if (!st.isFile()) throw new Error('não é um arquivo');
        if (st.size > max) throw new Error(`arquivo maior que ${Math.round(max / 1024)} KB`);
        return fs.readFileSync(real);
      };
      // Before the id is known the warning names the folder; after, the plugin id and the file inside it.
      let tag = label;
      const at = (file, msg) => `${tag}${tag === label ? '/' : ' '}${file}: ${msg}`;

      let meta;
      try { meta = JSON.parse(read('squad-plugin.json', LIMITS.text, ['.json']).toString('utf8').replace(/^﻿/, '')); }
      catch (e) { warn(at('squad-plugin.json', `${e instanceof SyntaxError ? 'JSON inválido' : e.message}; plugin ignorado`)); continue; }
      if (!isObj(meta)) { warn(at('squad-plugin.json', 'deve ser um objeto JSON; plugin ignorado')); continue; }
      const id = typeof meta.id === 'string' ? meta.id : '';
      if (!PLUGIN_ID_RE.test(id)) { warn(at('squad-plugin.json', `id ausente ou inválido (${String(meta.id ?? '').slice(0, 40) || 'vazio'}); plugin ignorado`)); continue; }
      if (config.disabled.includes(id)) continue;
      const dup = plugins.find(p => p.id === id);
      if (dup) { warn(`${label}: id ${id} repetido (já carregado de ${rel(dup.path)}); plugin ignorado`); continue; }
      tag = `[${id}]`;
      const plugin = { id, name: '', version: '', description: '', path: realRoot, categories: [], presets: [], avatars: [], themes: [], conventions: null, runtime: {} };
      try { plugin.name = str(meta.name, 80) || id; plugin.version = str(meta.version, 40); plugin.description = str(meta.description, 1000); }
      catch (e) { warn(at('squad-plugin.json', `name/version/description: ${e.message}`)); plugin.name = plugin.name || id; }

      const listOf = (k, max) => {
        if (meta[k] === undefined) return [];
        if (!Array.isArray(meta[k])) { warn(at('squad-plugin.json', `"${k}" deve ser uma lista`)); return []; }
        if (meta[k].length > max) warn(at('squad-plugin.json', `mais de ${max} itens em "${k}": os excedentes foram ignorados`));
        return meta[k].slice(0, max);
      };
      for (const c of listOf('categories', LIMITS.categories)) {
        try { const cat = validateCategory(c); if (plugin.categories.some(x => x.key === cat.key)) throw new Error(`categoria ${cat.key} repetida`); plugin.categories.push(cat); }
        catch (e) { warn(at('squad-plugin.json', e.message)); }
      }
      let imageBytes = 0;
      for (const a of listOf('avatars', LIMITS.avatars)) {
        try {
          if (!isObj(a)) throw new Error('avatar deve ser um objeto');
          const key = String(a.key || '');
          if (!KEY_RE.test(key)) throw new Error(`key de avatar inválida: ${key.slice(0, 40)}`);
          if (plugin.avatars.some(x => x.key === `plugin:${id}/${key}`)) throw new Error(`avatar ${key} repetido`);
          if (typeof a.file !== 'string' || !a.file) throw new Error(`avatar ${key} sem "file"`);
          let buf;
          try { buf = read(a.file, LIMITS.image, IMAGE_EXTS); } catch (e) { throw new Error(`${a.file}: ${e.message}`); }
          const mime = imageMime(buf);
          if (!mime) throw new Error(`${a.file}: não é uma imagem PNG, JPEG ou WebP`);
          if (imageBytes + buf.length > LIMITS.images) throw new Error(`${a.file}: limite de 12 MB de imagens por plugin atingido`);
          imageBytes += buf.length;
          plugin.avatars.push({ key: `plugin:${id}/${key}`, label: str(a.label, 60) || key.toUpperCase(), src: `data:${mime};base64,${buf.toString('base64')}` });
        } catch (e) { warn(at('squad-plugin.json', e.message)); }
      }
      for (const t of listOf('themes', LIMITS.themes)) {
        try {
          const theme = validateTheme(t, `${tag} squad-plugin.json`, warn);
          theme.key = `${id}/${theme.key}`;
          if (plugin.themes.some(x => x.key === theme.key)) throw new Error(`tema ${t.key} repetido`);
          plugin.themes.push(theme);
        } catch (e) { warn(at('squad-plugin.json', e.message)); }
      }
      plugin.runtime = validateRuntime(meta.runtime, `${tag} squad-plugin.json`, warn);

      const convFile = meta.conventions === undefined ? 'conventions.json' : meta.conventions;
      if (typeof convFile !== 'string' || !convFile) warn(at('squad-plugin.json', '"conventions" deve ser o caminho de um arquivo .json'));
      else if (meta.conventions !== undefined || fs.existsSync(path.join(dir, 'conventions.json'))) {
        try { plugin.conventions = validateConventions(JSON.parse(read(convFile, LIMITS.text, ['.json']).toString('utf8').replace(/^﻿/, '')), `${tag} ${convFile}`, warn); }
        catch (e) { warn(at(convFile, e instanceof SyntaxError ? `JSON inválido (${e.message})` : e.message)); }
      }

      const agentsDir = path.join(dir, 'agents');
      track(agentsDir);
      let files = [];
      try {
        const real = fs.realpathSync(agentsDir), r = path.relative(realRoot, real);
        if (!r || r.startsWith('..') || path.isAbsolute(r)) warn(`${tag} agents: aponta para fora da pasta do plugin (link simbólico recusado)`);
        else files = fs.readdirSync(agentsDir).filter(f => f.toLowerCase().endsWith('.md')).sort();
      } catch (e) { if (e.code !== 'ENOENT') warn(`${tag} agents: ${e.message}`); }
      if (files.length > LIMITS.agents) { warn(`${tag} agents: mais de ${LIMITS.agents} agentes, os excedentes foram ignorados`); files = files.slice(0, LIMITS.agents); }
      for (const f of files) {
        const file = `agents/${f}`;
        try {
          const { data, body } = parseFrontmatter(read(file, LIMITS.text, ['.md']).toString('utf8'));
          // A repeated name is not decided here: only the page knows ROLES and the built-in names, so every valid candidate goes
          // and the page keeps the first one it accepts (pluginPresets in src/app.js).
          plugin.presets.push(validatePreset(data, body));
        } catch (e) { warn(at(file, /agente ignorado$/.test(e.message) ? e.message : `${e.message}; agente ignorado`)); }
      }
      plugins.push(plugin);
    }

    const runtime = Object.assign({}, ...plugins.map(p => p.runtime), cfgRuntime);
    const page = { plugins, runtime, warnings };
    const api = { plugins: plugins.map(p => ({ ...p, avatars: p.avatars.map(({ src, ...a }) => a) })), runtime, warnings, config };
    cache = { sigs, result: { page, api, count: plugins.length } };
    return cache.result;
  }
  return { load };
}

module.exports = { createPluginLoader, parseFrontmatter, LIMITS };
