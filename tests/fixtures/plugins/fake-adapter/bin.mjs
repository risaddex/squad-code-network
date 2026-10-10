#!/usr/bin/env node
// Motor de mentira do Adapter x-echo: lê o prompt do stdin e responde em stream-json.
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log(`x-echo 1.0.0${process.env.SQUAD_TEST_SECRET ? ` VAZOU:${process.env.SQUAD_TEST_SECRET}` : ''}`); process.exit(0); }
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', () => {
  const emit = o => process.stdout.write(JSON.stringify(o) + '\n');
  emit({ type: 'system', subtype: 'init', session_id: 'x-session', adapter: 'x-echo', args, env: { leak: process.env.SQUAD_TEST_SECRET ?? null, declared: process.env.XECHO_DECLARED ?? null, hasPath: !!process.env.PATH, own: process.env.XECHO_OWN ?? null } });
  emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'eco' }] } });
  emit({ type: 'result', subtype: 'success', is_error: false, result: `X-ECHO:${input.trim()}`, session_id: 'x-session', num_turns: 1, total_cost_usd: null });
});
