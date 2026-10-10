import { appendFileSync } from 'node:fs';
const mark = line => { if (process.env.SQUAD_PLUGIN_MARKER) appendFileSync(process.env.SQUAD_PLUGIN_MARKER, line + '\n'); };
export async function register(ctx) {
  mark('register slow');
  ctx.onDispose(() => mark('dispose slow'));
  await new Promise(r => setTimeout(r, Number(process.env.SQUAD_SLOW_MS) || 1200));
  ctx.registerRoute('GET', '/x', () => ({ slow: true }));
}
