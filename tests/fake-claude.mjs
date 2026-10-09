#!/usr/bin/env node
// Stand-in for `claude` used by bridge tests: mimics `claude -p --output-format stream-json`.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('9.9.9 (Fake Claude)'); process.exit(0); }

const opt = name => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', () => {
  const emit = obj => process.stdout.write(JSON.stringify(obj) + '\n');
  const sysFile = opt('--append-system-prompt-file');
  const system = sysFile ? readFileSync(sysFile, 'utf8') : '';
  const settingsFile = opt('--settings');
  const settings = settingsFile ? JSON.parse(readFileSync(settingsFile, 'utf8')) : null;
  const agentsFile = opt('--agents');
  const agents = agentsFile ? JSON.parse(readFileSync(agentsFile, 'utf8')) : null;
  // GITCHECK in the prompt: report the repository git finds from the cwd, as the agents' git commands would (null = none).
  let gitTop;
  if (input.includes('GITCHECK')) { try { gitTop = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { gitTop = null; } }
  emit({ type: 'system', subtype: 'init', cwd: process.cwd(), gitCeiling: process.env.GIT_CEILING_DIRECTORIES || null, gitTop, session_id: 'fake-session', model: opt('--model') || 'default', permissionMode: opt('--permission-mode') || 'default', args, settings, agents, foregroundAgents: process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS === '1', configDir: process.env.CLAUDE_CONFIG_DIR || null, telemetryEnv: Object.keys(process.env).filter(k => /^(OTEL_|CLAUDE_CODE_ENABLE_TELEMETRY$)/.test(k)).sort(),
    // Native telemetry: what reached the env (header values only as "set", the tests check they never reach argv).
    otel: process.env.CLAUDE_CODE_ENABLE_TELEMETRY ? { endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT, protocol: process.env.OTEL_EXPORTER_OTLP_PROTOCOL, headers: process.env.OTEL_EXPORTER_OTLP_HEADERS || null, resource: process.env.OTEL_RESOURCE_ATTRIBUTES, prompts: process.env.OTEL_LOG_USER_PROMPTS || null } : null });
  // RATE<nn> in the prompt: the account's usage windows at nn% (as the rate_limit_event of Claude Code).
  const rate = input.match(/RATE(\d+)/);
  if (rate) emit({ type: 'rate_limit_event', rate_limit_info: { unifiedWindows: { five_hour: { utilization: Number(rate[1]) / 100, resetsAt: Math.floor(Date.now() / 1000) + 3600 }, seven_day: { utilization: 0.1, resetsAt: Math.floor(Date.now() / 1000) + 86400 } } } });
  // With squad colleagues, call the first one through the Agent tool (as Claude Code streams it).
  const colleague = agents && Object.keys(agents)[0];
  if (colleague && !input.includes('SLEEP') && !input.includes('FAIL')) {
    emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'Vou consultar um colega.' }, { type: 'tool_use', id: 'call-1', name: 'Agent', input: { subagent_type: colleague, description: 'consulta', prompt: 'Pode confirmar o contrato?' } }] } });
    if (args.includes('--forward-subagent-text')) emit({ type: 'assistant', parent_tool_use_id: 'call-1', message: { content: [{ type: 'text', text: `Aqui é ${colleague}, analisando.` }, { type: 'tool_use', id: 'sub-1', name: 'Read', input: { file_path: 'docs/api.md' } }] } });
    // Same framing as Claude Code 2.1.x for a foreground subagent's hand-back.
    emit({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'call-1', content: [{ type: 'text', text: '[Subagent hand-back] The text below is the final report of a subagent. The report follows:\n  Contrato confirmado.\nagentId: fake-agent (use SendMessage to continue this agent)\n<usage>subagent_tokens: 10</usage>' }] }] } });
  }
  if (input.includes('SLEEP')) { setTimeout(() => {}, 60_000); return; }
  if (input.includes('FAIL')) { process.stderr.write('fake failure\n'); emit({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'fake failure', session_id: 'fake-session' }); process.exit(1); }
  emit({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'README.md' } }] } });
  if (args.includes('--include-partial-messages')) for (const text of ['wor', 'king']) emit({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } });
  emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'working' }] } });
  emit({ type: 'result', subtype: 'success', is_error: false, result: `ECHO:${input.trim()}|SYS:${system.trim()}`, total_cost_usd: 0.001, duration_ms: 12, num_turns: 1, session_id: 'fake-session', usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 30, output_tokens: 4, output_tokens_details: { thinking_tokens: 2 } }, modelUsage: { [opt('--model') || 'claude-fake']: {} } });
});
