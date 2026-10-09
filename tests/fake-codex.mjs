#!/usr/bin/env node
// Stand-in for `codex exec --json` used by bridge tests. The prompt (stdin) picks the script: SLEEP, FAIL, CALL (calls the bridge's
// MCP; CALLAS:<name> asks for that colleague), TARDIO (a detached helper sends the call's body after this run ended), STREAMERR
// (a stream-level error after the turn), HOT (usage window at 95%). Each run appends {argv, cwd, stdin, env, thread, mcp} to FAKE_CODEX_LOG for the assertions, and
// with CODEX_HOME set writes a session file with rate limits, as codex does.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('codex-cli 9.9.9 (fake)'); process.exit(0); }

// -c key=value overrides; string values keep their TOML quotes.
const config = {};
args.forEach((a, i) => { if (a === '-c' && args[i + 1]) { const s = args[i + 1], eq = s.indexOf('='); config[s.slice(0, eq)] = s.slice(eq + 1); } });
const unquote = v => typeof v === 'string' ? v.replace(/^"(.*)"$/, '$1') : v;

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', async () => {
  const emit = obj => process.stdout.write(JSON.stringify(obj) + '\n');
  const thread = randomUUID();
  const entry = { argv: args, cwd: process.cwd(), stdin: input, thread, env: { CODEX_HOME: process.env.CODEX_HOME || null, SQUAD_MCP_TOKEN: process.env.SQUAD_MCP_TOKEN || null, GIT_CEILING_DIRECTORIES: process.env.GIT_CEILING_DIRECTORIES || null } };
  const log = () => { if (process.env.FAKE_CODEX_LOG) appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify(entry) + '\n'); };
  emit({ type: 'thread.started', thread_id: thread });
  emit({ type: 'turn.started' });
  if (input.includes('SLEEP')) { log(); setTimeout(() => {}, 60_000); return; }
  if (input.includes('FAIL')) { log(); emit({ type: 'turn.failed', error: { message: 'fake codex failure' } }); process.stderr.write('fake codex failure\n'); process.exit(1); }

  emit({ type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: 'ls', aggregated_output: '', exit_code: null, status: 'in_progress' } });
  emit({ type: 'item.completed', item: { id: 'item_1', type: 'command_execution', command: 'ls', aggregated_output: 'README.md\n', exit_code: 0, status: 'completed' } });
  emit({ type: 'item.completed', item: { id: 'item_2', type: 'reasoning', text: 'pensando' } });
  emit({ type: 'item.completed', item: { id: 'item_3', type: 'file_change', changes: [{ path: 'a.txt', kind: 'add' }], status: 'completed' } });
  emit({ type: 'item.completed', item: { id: 'item_4', type: 'error', message: 'aviso falso' } });

  if (input.includes('CALL')) {
    const url = unquote(config['mcp_servers.squad.url']);
    const token = process.env[unquote(config['mcp_servers.squad.bearer_token_env_var'])];
    const rpc = async (method, params, id) => {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', ...(id ? { id } : {}), method, params }) });
      return { status: res.status, body: res.status === 202 ? null : await res.json() };
    };
    entry.mcp = { url, tokenEnv: unquote(config['mcp_servers.squad.bearer_token_env_var']) };
    entry.mcp.init = (await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake-codex', version: '0' } }, 1)).body;
    entry.mcp.initialized = (await rpc('notifications/initialized', {})).status;
    entry.mcp.list = (await rpc('tools/list', {}, 2)).body;
    const asked = input.match(/CALLAS:(\S+)/);
    const agente = asked ? asked[1] : entry.mcp.list?.result?.tools?.[0]?.inputSchema?.properties?.agente?.enum?.[0];
    const call = { id: 'item_5', type: 'mcp_tool_call', server: 'squad', tool: 'chamar_colega', arguments: { agente, pedido: 'Pode confirmar o contrato?' } };
    emit({ type: 'item.started', item: { ...call, status: 'in_progress' } });
    const answer = (await rpc('tools/call', { name: 'chamar_colega', arguments: call.arguments }, 3)).body;
    entry.mcp.call = answer;
    emit({ type: 'item.completed', item: { ...call, status: answer?.result ? 'completed' : 'failed', result: answer?.result ? { content: answer.result.content } : null, error: answer?.error ? { message: answer.error.message } : null } });
  }

  if (input.includes('TARDIO')) {
    // Headers now (authenticated while this run lives), body later: the run is over by then.
    const helper = `const http = require('node:http'); const fs = require('node:fs');
      const req = http.request(process.env.LATE_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.LATE_TOKEN } }, res => { let t = ''; res.on('data', d => t += d); res.on('end', () => fs.writeFileSync(process.env.LATE_OUT, JSON.stringify({ status: res.statusCode, body: t }))); });
      req.flushHeaders();
      setTimeout(() => req.end(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'chamar_colega', arguments: { agente: process.env.LATE_AGENT, pedido: 'tarde demais' } } })), 900);`;
    spawn(process.execPath, ['-e', helper], { detached: true, stdio: 'ignore', env: { ...process.env, LATE_URL: unquote(config['mcp_servers.squad.url']), LATE_TOKEN: process.env.SQUAD_MCP_TOKEN, LATE_OUT: process.env.FAKE_CODEX_LOG + '.late', LATE_AGENT: 'argus' } }).unref();
    await new Promise(r => setTimeout(r, 400)); // the headers reach the bridge while this run is alive
  }
  emit({ type: 'item.completed', item: { id: 'item_6', type: 'agent_message', text: `ECHO:${input.trim()}` } });
  emit({ type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 40, cache_write_input_tokens: 5, output_tokens: 7, reasoning_output_tokens: 3 } });
  if (input.includes('STREAMERR')) emit({ type: 'error', message: 'stream disconnected' });

  if (process.env.CODEX_HOME) {
    const now = new Date(), p2 = n => String(n).padStart(2, '0');
    const dir = path.join(process.env.CODEX_HOME, 'sessions', String(now.getFullYear()), p2(now.getMonth() + 1), p2(now.getDate()));
    mkdirSync(dir, { recursive: true });
    const resets = Math.floor(Date.now() / 1000) + 3600;
    const lines = [
      { type: 'session_meta', payload: { id: thread, cwd: process.cwd() } },
      { type: 'turn_context', payload: { model: 'gpt-fake-1', cwd: process.cwd() } },
      { type: 'event_msg', payload: { type: 'token_count', info: null, rate_limits: { primary: { used_percent: input.includes('HOT') ? 95 : 12, window_minutes: 300, resets_at: resets }, secondary: { used_percent: 30, window_minutes: 10080, resets_at: resets + 86400 } } } },
    ];
    writeFileSync(path.join(dir, `rollout-${now.toISOString().replace(/[:.]/g, '-')}-${thread}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  }
  log();
});
