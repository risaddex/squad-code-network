'use strict';
/*
 * A small JSON Schema validator (draft 2020-12 subset, no dependencies) for the files in schemas/: squad.schema.json (local
 * configuration), squad-plugin.schema.json (plugin manifest) and squad-agent.schema.json (an agent's frontmatter).
 * Keywords: type (string or list), properties, required, additionalProperties (false or a schema), items, enum, const, pattern,
 * minimum, maximum, exclusiveMinimum, exclusiveMaximum, minLength, maxLength (UTF-16 units, as the code's checks), minItems, maxItems,
 * $ref ('#/...' inside the same schema; a cycle, the same ref on the same value again, or more than MAX_REFS nested refs is an
 * error, not a stack overflow), oneOf and anyOf. Anything else is ignored (description, title, $id, $schema, default, examples...).
 * validate(schema, value) → [{ path: 'profiles[1].effort', keyword, message }] with messages in pt-BR.
 */
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_DIR = path.join(__dirname, 'schemas');
const cache = new Map();
/** Loads schemas/<name> once. */
function loadSchema(name) {
  if (!cache.has(name)) cache.set(name, JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8')));
  return cache.get(name);
}

const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
const fits = (v, t) => t === 'number' ? typeof v === 'number' && Number.isFinite(v) : t === 'integer' ? Number.isInteger(v) : typeOf(v) === t;
const TYPE_PT = { string: 'texto', number: 'número', integer: 'número inteiro', boolean: 'true ou false', object: 'objeto', array: 'lista', null: 'null' };
const join = (base, key) => typeof key === 'number' ? `${base}[${key}]` : base ? `${base}.${key}` : key;
const show = v => JSON.stringify(v);

function resolveRef(root, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#')) throw new Error(`$ref não suportado: ${ref}`);
  let node = root;
  for (const part of ref.slice(1).split('/').filter(Boolean)) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!node || typeof node !== 'object' || !Object.hasOwn(node, key)) throw new Error(`$ref não encontrado: ${ref}`);
    node = node[key];
  }
  return node;
}

const MAX_REFS = 64;
// refs: the $refs being followed on this branch, as "ref@path" (the same pair again = a cycle that never consumes the value).
function check(schema, value, at, root, errors, refs = []) {
  if (schema === true || schema === undefined) return;
  if (schema === false) { errors.push({ path: at, keyword: 'false', message: 'não é permitido' }); return; }
  if (schema.$ref) {
    const mark = `${schema.$ref}@${at}`;
    if (refs.includes(mark) || refs.length >= MAX_REFS) { errors.push({ path: at, keyword: '$ref', message: `referência circular ou profunda demais no schema (${schema.$ref})` }); return; }
    check(resolveRef(root, schema.$ref), value, at, root, errors, [...refs, mark]);
  }
  const err = (keyword, message) => errors.push({ path: at, keyword, message });
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(t => fits(value, t))) { err('type', `deve ser ${types.map(t => TYPE_PT[t] || t).join(' ou ')}`); return; }
  }
  if (schema.const !== undefined && value !== schema.const) err('const', `deve ser ${show(schema.const)}`);
  if (schema.enum && !schema.enum.some(e => e === value)) err('enum', `valor ${show(value)} não aceito (use ${schema.enum.map(show).join(', ')})`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) err('minLength', schema.minLength === 1 ? 'não pode ser vazio' : `deve ter ao menos ${schema.minLength} caracteres`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) err('maxLength', `deve ter até ${schema.maxLength} caracteres`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) err('pattern', `valor ${show(value.slice(0, 60))} fora do formato ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) err('minimum', `deve ser no mínimo ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) err('maximum', `deve ser no máximo ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) err('exclusiveMinimum', `deve ser maior que ${schema.exclusiveMinimum}`);
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) err('exclusiveMaximum', `deve ser menor que ${schema.exclusiveMaximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) err('minItems', `deve ter ao menos ${schema.minItems} item(ns)`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) err('maxItems', `deve ter até ${schema.maxItems} itens`);
    if (schema.items !== undefined) value.forEach((v, i) => check(schema.items, v, join(at, i), root, errors, refs));
  }
  if (typeOf(value) === 'object') {
    for (const k of schema.required || []) if (!Object.hasOwn(value, k)) errors.push({ path: join(at, k), keyword: 'required', message: 'campo obrigatório ausente' });
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (Object.hasOwn(props, k)) check(props[k], v, join(at, k), root, errors, refs);
      else if (schema.additionalProperties === false) errors.push({ path: join(at, k), keyword: 'additionalProperties', message: 'campo desconhecido' });
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') check(schema.additionalProperties, v, join(at, k), root, errors, refs);
    }
  }
  for (const [kw, need] of [['oneOf', 1], ['anyOf', 0]]) {
    if (!Array.isArray(schema[kw])) continue;
    const results = schema[kw].map(s => { const e = []; check(s, value, at, root, e, refs); return e; });
    const passed = results.filter(e => !e.length).length;
    if (kw === 'oneOf' ? passed !== 1 : passed === 0) {
      // The alternative that came closest explains the error best.
      const best = results.reduce((a, b) => (b.length < a.length ? b : a));
      if (kw === 'oneOf' && passed > 1) err('oneOf', 'combina com mais de uma forma aceita');
      else errors.push(...best);
    }
  }
}

/** Validates `value` against `schema` (refs resolve inside `root`, by default the schema itself). */
function validate(schema, value, root = schema) {
  const errors = [];
  check(schema, value, '', root, errors);
  return errors;
}
/** "profiles[1].effort: deve ser ..." (or just the message at the root). */
const formatError = e => e.path ? `${e.path}: ${e.message}` : e.message;

module.exports = { validate, formatError, loadSchema, resolveRef, SCHEMA_DIR };
